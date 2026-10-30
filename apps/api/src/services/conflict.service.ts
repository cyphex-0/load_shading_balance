import { FeederStatus, OutageStatus, NotificationType, FaultType } from '@load-shedding/shared';
import { store, OutageTicketRecord, OutageStatusHistoryRecord, OutageReportEventRecord } from '../db/store';
import { notificationService } from './notification.service';
import { NotificationTemplates } from './notification-templates';
import { socketEmitter } from '../sockets/socket.server';
import { AppError } from '../utils/response';
import { logger } from '../utils/logger';

export interface ConflictResolutionResult {
  isPlanned: boolean;
  ticketCreated: boolean;
  classification?: 'KNOWN_PLANNED_OUTAGE' | 'UNPLANNED_FAULT';
  scheduledEndTime?: string;
  ticket?: any;
  event?: OutageReportEventRecord;
  message: string;
}

export class SmartConflictResolutionService {
  async evaluateAndReportOutage(
    customerId: string,
    meterId: string,
    description: string,
    faultType: FaultType = FaultType.OTHER,
    landmark?: string
  ): Promise<ConflictResolutionResult> {
    // 1. Verify customer owns this meter
    const customerMeter = Array.from(store.customerMeters.values()).find(
      (cm) => cm.customerId === customerId && cm.meterId === meterId && !cm.unlinkedAt
    );
    if (!customerMeter) {
      throw new AppError('Meter not linked to your account', 403, 'METER_NOT_LINKED');
    }

    const meter = store.meters.get(meterId);
    if (!meter || meter.deletedAt) {
      throw new AppError('Meter record not found', 404, 'METER_NOT_FOUND');
    }

    const feeder = store.feeders.get(meter.feederId);
    if (!feeder || feeder.deletedAt) {
      throw new AppError('Feeder associated with meter not found', 404, 'FEEDER_NOT_FOUND');
    }

    // 2. Prevent duplicate active reports for the same meter
    const existingActiveTicket = Array.from(store.outageTickets.values()).find(
      (t) =>
        t.meterId === meterId &&
        t.status !== OutageStatus.RESOLVED &&
        t.status !== OutageStatus.CANCELLED
    );
    if (existingActiveTicket) {
      throw new AppError(
        `An active outage report (${existingActiveTicket.ticketNumber}) is already being processed for this meter.`,
        409,
        'DUPLICATE_ACTIVE_REPORT'
      );
    }

    const now = new Date();
    const nowISO = now.toISOString();

    // 3. Check active published schedules covering the current time for this feeder
    let activePlannedSlotEndTime: string | null = null;
    let matchedScheduleId: string | null = null;
    let matchedSlotId: string | null = null;

    for (const schedule of store.schedules.values()) {
      if (schedule.status === 'PUBLISHED') {
        for (const slot of store.scheduleSlots.values()) {
          if (slot.scheduleId === schedule.id) {
            const slotStart = new Date(slot.startTime);
            const slotEnd = new Date(slot.endTime);

            // Active slot strictly within time window: slotStart <= now <= slotEnd
            if (now >= slotStart && now <= slotEnd) {
              const isAssigned = Array.from(store.scheduleFeederAssignments.values()).some(
                (a) => a.slotId === slot.id && a.feederId === feeder.id
              );

              if (isAssigned) {
                activePlannedSlotEndTime = slot.endTime;
                matchedScheduleId = schedule.id;
                matchedSlotId = slot.id;
                break;
              }
            }
          }
        }
      }
      if (activePlannedSlotEndTime) break;
    }

    // CASE A: Planned Load Shedding Outage
    if (activePlannedSlotEndTime) {
      const formattedEndTime = new Date(activePlannedSlotEndTime).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      });

      logger.info(
        `[SMART RESOLUTION] Customer ${customerId} reported outage on feeder ${feeder.code}. Intercepted as PLANNED load shedding until ${formattedEndTime}.`
      );

      // Persist OutageReportEvent for audit and customer visibility without creating a ticket
      const eventId = `rep_evt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const message = `Your area is currently under scheduled load shedding until ${formattedEndTime}. This is not a fault. No technician will be dispatched.`;

      const reportEvent: OutageReportEventRecord = {
        id: eventId,
        customerId,
        meterId,
        feederId: feeder.id,
        classification: 'PLANNED_CONFLICT',
        scheduleId: matchedScheduleId,
        slotId: matchedSlotId,
        plannedEndTime: activePlannedSlotEndTime,
        message,
        createdAt: nowISO
      };
      store.outageReportEvents.set(eventId, reportEvent);

      return {
        isPlanned: true,
        ticketCreated: false,
        classification: 'KNOWN_PLANNED_OUTAGE',
        scheduledEndTime: activePlannedSlotEndTime,
        event: reportEvent,
        message
      };
    }

    // CASE B: Unexpected Hardware Fault
    const ticketId = `tkt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const ticketCount = store.outageTickets.size + 1;
    const ticketNumber = `TKT-${now.getFullYear()}-${ticketCount.toString().padStart(4, '0')}`;

    const newTicket: OutageTicketRecord = {
      id: ticketId,
      ticketNumber,
      customerId,
      meterId,
      feederId: feeder.id,
      faultType: faultType || FaultType.OTHER,
      description,
      landmark: landmark || null,
      isPlanned: false,
      status: OutageStatus.REPORTED,
      reportedAt: nowISO,
      resolvedAt: null,
      resolutionNotes: null,
      createdAt: nowISO,
      updatedAt: nowISO
    };
    store.outageTickets.set(ticketId, newTicket);

    // Record initial status history
    const historyId = `hist_${Date.now()}_1`;
    store.outageStatusHistories.set(historyId, {
      id: historyId,
      ticketId,
      previousStatus: null,
      newStatus: OutageStatus.REPORTED,
      changedById: customerId,
      notes: 'Customer reported unexpected blackout',
      createdAt: nowISO
    });

    // Mark feeder as UNEXPECTED_FAULT if not already offline
    if (feeder.status === FeederStatus.ONLINE) {
      feeder.status = FeederStatus.UNEXPECTED_FAULT;
      feeder.updatedAt = nowISO;
      socketEmitter.emitFeederStatusChanged({
        feederId: feeder.id,
        status: FeederStatus.UNEXPECTED_FAULT,
        timestamp: nowISO
      });
    }

    // Alert operators & zone managers in real time via Socket.io
    const sub = store.substations.get(feeder.substationId);
    socketEmitter.emitTicketCreated({
      ticketId: newTicket.id,
      ticketNumber: newTicket.ticketNumber,
      feederId: feeder.id,
      feederName: feeder.name,
      zoneId: sub?.zoneId,
      description: newTicket.description,
      reportedAt: nowISO
    });

    // Queue SMS and notification to customer using centralized template & deduplication key
    const ackTemplate = NotificationTemplates.outageAcknowledged(ticketNumber);
    await notificationService.createNotification(
      customerId,
      ackTemplate.title,
      ackTemplate.message,
      NotificationType.OUTAGE_REPORTED,
      { ticketId: newTicket.id, ticketNumber },
      `ticket_ack:${newTicket.id}`
    );

    return {
      isPlanned: false,
      ticketCreated: true,
      classification: 'UNPLANNED_FAULT',
      ticket: {
        id: newTicket.id,
        ticketNumber: newTicket.ticketNumber,
        status: newTicket.status,
        faultType: newTicket.faultType,
        feederId: feeder.id,
        feederName: feeder.name,
        createdAt: newTicket.createdAt
      },
      message: 'We have received your report. A technician is being assigned.'
    };
  }
}

export const conflictResolutionService = new SmartConflictResolutionService();
