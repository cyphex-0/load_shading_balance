import cron from 'node-cron';
import { DeliveryStatus, FeederStatus } from '@load-shedding/shared';
import { store } from '../db/store';
import { notificationService } from '../services/notification.service';
import { socketEmitter } from '../sockets/socket.server';
import { logger } from '../utils/logger';

export const startBackgroundJobs = () => {
  logger.info('Initializing background cron jobs...');

  // Job 1: sendNotificationsJob (Every 30 seconds)
  cron.schedule('*/30 * * * * *', async () => {
    try {
      const pendingLogs = Array.from(store.notificationDeliveryLogs.values()).filter(
        (l) => l.status === DeliveryStatus.QUEUED && l.attempts < 3
      );

      for (const log of pendingLogs) {
        const notif = log.notificationId ? store.notifications.get(log.notificationId) : null;
        const msg = notif?.message || 'Load Shedding System Notification';
        await notificationService.dispatchSmsLog(log.id, msg);
      }
    } catch (err: any) {
      logger.error('Error in sendNotificationsJob:', err?.message);
    }
  });

  // Job 2: scheduleEnforcerJob (Hourly - 0 * * * *)
  cron.schedule('0 * * * *', async () => {
    try {
      logger.info('Running scheduleEnforcerJob...');
      const now = new Date();
      const nowISO = now.toISOString();

      // Scan all published schedules
      for (const schedule of store.schedules.values()) {
        if (schedule.status === 'PUBLISHED') {
          for (const slot of store.scheduleSlots.values()) {
            if (slot.scheduleId === schedule.id) {
              const start = new Date(slot.startTime);
              const end = new Date(slot.endTime);

              // Find assigned feeders
              const assignments = Array.from(store.scheduleFeederAssignments.values()).filter(
                (a) => a.slotId === slot.id
              );

              for (const asgn of assignments) {
                const feeder = store.feeders.get(asgn.feederId);
                if (!feeder || feeder.deletedAt) continue;

                if (now >= start && now <= end) {
                  // Inside slot -> set to PLANNED_OUTAGE if currently ONLINE
                  if (feeder.status === FeederStatus.ONLINE) {
                    feeder.status = FeederStatus.PLANNED_OUTAGE;
                    feeder.updatedAt = nowISO;
                    socketEmitter.emitFeederStatusChanged({
                      feederId: feeder.id,
                      status: FeederStatus.PLANNED_OUTAGE,
                      timestamp: nowISO
                    });
                  }
                } else if (now > end && feeder.status === FeederStatus.PLANNED_OUTAGE) {
                  // Slot completed -> restore to ONLINE if no active unexpected fault ticket
                  const activeFaults = Array.from(store.outageTickets.values()).some(
                    (t) => t.feederId === feeder.id && t.status !== 'RESOLVED' && t.status !== 'CANCELLED'
                  );
                  if (!activeFaults) {
                    feeder.status = FeederStatus.ONLINE;
                    feeder.updatedAt = nowISO;
                    socketEmitter.emitFeederStatusChanged({
                      feederId: feeder.id,
                      status: FeederStatus.ONLINE,
                      timestamp: nowISO
                    });
                  }
                }
              }
            }
          }
        }
      }
    } catch (err: any) {
      logger.error('Error in scheduleEnforcerJob:', err?.message);
    }
  });

  // Job 3: gridMetricsSimulationJob (Every 5 minutes)
  cron.schedule('*/5 * * * *', () => {
    try {
      // Simulate realistic national grid fluctuations
      const baseDemand = 12000;
      const baseCapacity = 11000;
      const demandJitter = Math.floor((Math.random() - 0.5) * 800);
      const capacityJitter = Math.floor((Math.random() - 0.5) * 400);

      const totalDemandMW = baseDemand + demandJitter;
      const availableCapacityMW = baseCapacity + capacityJitter;
      const currentDeficitMW = Math.max(0, totalDemandMW - availableCapacityMW);

      const activeOutages = Array.from(store.outageTickets.values()).filter(
        (t) => t.status !== 'RESOLVED' && t.status !== 'CANCELLED'
      ).length;

      const newMetric = {
        id: `gm_${Date.now()}`,
        totalDemandMW,
        availableCapacityMW,
        currentDeficitMW,
        activeOutagesCount: activeOutages,
        timestamp: new Date().toISOString()
      };

      store.gridMetrics.push(newMetric);
      if (store.gridMetrics.length > 288) {
        // Keep 24 hours of 5-min intervals
        store.gridMetrics.shift();
      }
    } catch (err: any) {
      logger.error('Error in gridMetricsSimulationJob:', err?.message);
    }
  });
};
