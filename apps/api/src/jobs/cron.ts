import cron, { ScheduledTask } from 'node-cron';
import { DeliveryStatus, FeederStatus, BackgroundJobStatusDto, JobTriggerResponseDto } from '@load-shedding/shared';
import { store } from '../db/store';
import { notificationService } from '../services/notification.service';
import { socketEmitter } from '../sockets/socket.server';
import { cacheService } from '../services/cache.service';
import { lockManager } from '../utils/lock';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface JobExecutionState {
  name: string;
  schedule: string;
  lockKey: string;
  lockTtlSeconds: number;
  enabled: boolean;
  lastRunAt: string | null;
  lastRunDurationMs: number | null;
  lastRunStatus: 'SUCCESS' | 'ERROR' | 'SKIPPED_LOCKED' | 'IDLE';
  lastErrorMessage: string | null;
  totalRuns: number;
  isRunning: boolean;
  handler: () => Promise<any>;
  task?: ScheduledTask;
}

// Registry of managed background automation jobs
const jobRegistry: Map<string, JobExecutionState> = new Map();

/**
 * Reconciles published schedule slots against live feeder statuses.
 * Safe to run both on cron ticks and immediately on server startup/restart.
 */
export const reconcileScheduleFeederStatuses = async (
  referenceDate: Date = new Date()
): Promise<{ evaluatedFeeders: number; transitionedToPlannedOutage: number; restoredToOnline: number }> => {
  const now = referenceDate;
  const nowISO = now.toISOString();
  let evaluatedFeeders = 0;
  let transitionedToPlannedOutage = 0;
  let restoredToOnline = 0;

  for (const schedule of store.schedules.values()) {
    if (schedule.status === 'PUBLISHED') {
      for (const slot of store.scheduleSlots.values()) {
        if (slot.scheduleId === schedule.id) {
          const start = new Date(slot.startTime);
          const end = new Date(slot.endTime);

          const assignments = Array.from(store.scheduleFeederAssignments.values()).filter(
            (a) => a.slotId === slot.id
          );

          for (const asgn of assignments) {
            const feeder = store.feeders.get(asgn.feederId);
            if (!feeder || feeder.deletedAt) continue;
            evaluatedFeeders++;

            if (now >= start && now <= end) {
              // Inside active slot -> transition to PLANNED_OUTAGE if currently ONLINE
              if (feeder.status === FeederStatus.ONLINE) {
                feeder.status = FeederStatus.PLANNED_OUTAGE;
                feeder.updatedAt = nowISO;
                transitionedToPlannedOutage++;

                // Broadcast real-time Socket event
                socketEmitter.emitFeederStatusChanged({
                  feederId: feeder.id,
                  status: FeederStatus.PLANNED_OUTAGE,
                  timestamp: nowISO,
                  substationId: feeder.substationId
                });

                // Invalidate grid caches
                await cacheService.del('grid:status:all');
                await cacheService.delPattern('grid:status:*');
              }
            } else if (now > end && feeder.status === FeederStatus.PLANNED_OUTAGE) {
              // Slot has expired -> check if any active unexpected fault ticket exists
              const activeFaults = Array.from(store.outageTickets.values()).some(
                (t) => t.feederId === feeder.id && t.status !== 'RESOLVED' && t.status !== 'CANCELLED'
              );

              if (!activeFaults) {
                feeder.status = FeederStatus.ONLINE;
                feeder.updatedAt = nowISO;
                restoredToOnline++;

                // Broadcast real-time Socket event
                socketEmitter.emitFeederStatusChanged({
                  feederId: feeder.id,
                  status: FeederStatus.ONLINE,
                  timestamp: nowISO,
                  substationId: feeder.substationId
                });

                // Invalidate grid caches
                await cacheService.del('grid:status:all');
                await cacheService.delPattern('grid:status:*');
              }
            }
          }
        }
      }
    }
  }

  logger.info(
    `[SCHEDULE RECONCILIATION] Evaluated: ${evaluatedFeeders}, Planned Outages: ${transitionedToPlannedOutage}, Restored: ${restoredToOnline}`
  );

  return { evaluatedFeeders, transitionedToPlannedOutage, restoredToOnline };
};

/**
 * Executes a registered job inside an exclusive distributed lock boundary
 * with execution timing, telemetry capture, and error isolation.
 */
export const executeJob = async (
  jobName: string,
  isManual = false
): Promise<JobTriggerResponseDto> => {
  const state = jobRegistry.get(jobName);
  if (!state) {
    return {
      jobName,
      triggered: false,
      executedAt: new Date().toISOString(),
      status: 'ERROR',
      message: `Job "${jobName}" is not registered`
    };
  }

  if (!state.enabled) {
    logger.debug(`[CRON] Job "${jobName}" is disabled in configuration. Skipping execution.`);
    return {
      jobName,
      triggered: false,
      executedAt: new Date().toISOString(),
      status: 'SKIPPED_LOCKED',
      message: `Job "${jobName}" is disabled by configuration (e.g. ENABLE_DEMO_SIMULATION=false)`
    };
  }

  const startTime = Date.now();
  state.isRunning = true;

  try {
    const lockResult = await lockManager.withLock(
      state.lockKey,
      state.lockTtlSeconds,
      async () => {
        logger.info(`[CRON] Executing job "${jobName}" (Manual: ${isManual})...`);
        return await state.handler();
      }
    );

    const duration = Date.now() - startTime;
    state.lastRunAt = new Date().toISOString();
    state.lastRunDurationMs = duration;

    if (!lockResult.executed) {
      state.lastRunStatus = 'SKIPPED_LOCKED';
      logger.debug(`[CRON] Job "${jobName}" skipped: lock "${state.lockKey}" held by another process.`);
      return {
        jobName,
        triggered: false,
        executedAt: state.lastRunAt,
        status: 'SKIPPED_LOCKED',
        message: `Execution skipped: lock "${state.lockKey}" is currently held by another worker`
      };
    }

    if (lockResult.error) {
      state.lastRunStatus = 'ERROR';
      state.lastErrorMessage = lockResult.error.message || String(lockResult.error);
      logger.error(`[CRON] Error during execution of job "${jobName}":`, lockResult.error);
      return {
        jobName,
        triggered: true,
        executedAt: state.lastRunAt,
        status: 'ERROR',
        message: state.lastErrorMessage || 'Job execution failed',
        durationMs: duration
      };
    }

    state.lastRunStatus = 'SUCCESS';
    state.lastErrorMessage = null;
    state.totalRuns++;
    logger.info(`[CRON] Job "${jobName}" completed successfully in ${duration}ms.`);

    return {
      jobName,
      triggered: true,
      executedAt: state.lastRunAt,
      status: 'SUCCESS',
      message: `Job executed successfully in ${duration}ms`,
      durationMs: duration
    };
  } finally {
    state.isRunning = false;
  }
};

/**
 * Initializes and schedules all background cron automations.
 * Registers distributed locks and performs immediate startup reconciliation.
 */
export const startBackgroundJobs = () => {
  logger.info('Initializing background cron jobs with distributed lock guards...');

  // 1. Register Job 1: Notification Dispatcher (Every 30 seconds)
  jobRegistry.set('notification-dispatcher', {
    name: 'notification-dispatcher',
    schedule: '*/30 * * * * *',
    lockKey: 'lock:job:notification-dispatcher',
    lockTtlSeconds: 25,
    enabled: true,
    lastRunAt: null,
    lastRunDurationMs: null,
    lastRunStatus: 'IDLE',
    lastErrorMessage: null,
    totalRuns: 0,
    isRunning: false,
    handler: async () => {
      await notificationService.dispatchPendingNotifications();
    }
  });

  // 2. Register Job 2: Schedule Enforcer (Every 1 minute)
  jobRegistry.set('schedule-enforcer', {
    name: 'schedule-enforcer',
    schedule: '*/1 * * * *',
    lockKey: 'lock:job:schedule-enforcer',
    lockTtlSeconds: 55,
    enabled: true,
    lastRunAt: null,
    lastRunDurationMs: null,
    lastRunStatus: 'IDLE',
    lastErrorMessage: null,
    totalRuns: 0,
    isRunning: false,
    handler: async () => {
      await reconcileScheduleFeederStatuses(new Date());
    }
  });

  // 3. Register Job 3: Demo Simulator (Every 5 minutes, gated by ENABLE_DEMO_SIMULATION)
  const simulationEnabled = Boolean(config.enableDemoSimulation);
  jobRegistry.set('demo-simulator', {
    name: 'demo-simulator',
    schedule: '*/5 * * * *',
    lockKey: 'lock:job:demo-simulator',
    lockTtlSeconds: 280,
    enabled: simulationEnabled,
    lastRunAt: null,
    lastRunDurationMs: null,
    lastRunStatus: 'IDLE',
    lastErrorMessage: null,
    totalRuns: 0,
    isRunning: false,
    handler: async () => {
      if (!config.enableDemoSimulation) {
        logger.debug('[SIMULATOR] Demo simulation disabled by configuration. No metrics injected.');
        return;
      }

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
        // Retain 24 hours of 5-min intervals
        store.gridMetrics.shift();
      }
    }
  });

  // Schedule all enabled tasks with node-cron
  for (const [name, state] of jobRegistry.entries()) {
    try {
      state.task = cron.schedule(state.schedule, async () => {
        await executeJob(name, false);
      });
      logger.info(`📅 Scheduled "${name}" with pattern "${state.schedule}" [Enabled: ${state.enabled}]`);
    } catch (err: any) {
      logger.error(`Failed to schedule job "${name}":`, err?.message);
    }
  }

  // Restart Safety: Run immediate reconciliation on startup
  reconcileScheduleFeederStatuses(new Date()).catch((err) => {
    logger.error('Error during initial schedule reconciliation on startup:', err);
  });
};

/**
 * Halts all active background automations and releases memory leases.
 */
export const stopBackgroundJobs = () => {
  for (const [name, state] of jobRegistry.entries()) {
    if (state.task) {
      state.task.stop();
      logger.info(`⏹️ Stopped cron task "${name}"`);
    }
  }
  jobRegistry.clear();
  lockManager.clearAllLocks();
};

/**
 * Retrieves the telemetry and execution health status of all registered jobs.
 */
export const getBackgroundJobsStatus = (): BackgroundJobStatusDto[] => {
  return Array.from(jobRegistry.values()).map((state) => ({
    name: state.name,
    schedule: state.schedule,
    lockKey: state.lockKey,
    enabled: state.enabled,
    lastRunAt: state.lastRunAt,
    lastRunDurationMs: state.lastRunDurationMs,
    lastRunStatus: state.lastRunStatus,
    lastErrorMessage: state.lastErrorMessage,
    totalRuns: state.totalRuns,
    isRunning: state.isRunning
  }));
};

/**
 * Manually triggers a background job out of band for administrative or operational testing.
 */
export const triggerJobManually = async (jobName: string): Promise<JobTriggerResponseDto> => {
  return await executeJob(jobName, true);
};
