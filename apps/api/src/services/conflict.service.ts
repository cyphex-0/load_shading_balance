import { FeederStatus, OutageStatus, NotificationType } from '@load-shedding/shared';
import { store, OutageTicketRecord, OutageStatusHistoryRecord } from '../db/store';
import { notificationService } from './notification.service';
import { socketEmitter } from '../sockets/socket.server';
import { AppError } from '../utils/response';
import { logger } from '../utils/logger';

export interface ConflictResolutionResult {
  isPlanned: boolean;
  ticketCreated: boolean;
  scheduledEndTime?: string;
  ticket?: any;
  message: string;
}

export class SmartConflictResolutionService {
  async evaluateAndReportOutage(
    customerId: string,
    meterId: string,
    description: string,
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

    const now = new Date();
    const nowISO = now.toISOString();

    // 2. Check active published schedules covering the current time for this feeder
    let activePlannedSlotEndTime: string | null = null;

    for (const schedule of store.schedules.values()) {
      if (schedule.status === 'PUBLISHED') {
        for (const slot of store.scheduleSlots.values()) {
          if (slot.scheduleId === schedule.id) {
            const slotStart = new Date(slot.startTime);
            const slotEnd = new Date(slot.endTime);

            if (now >= slotStart && now <= slotEnd) {
              // Check if our feeder is in this slot
              const isAssigned = Array.from(store.scheduleFeederAssignments.values()).some(
                (a) => a.slotId === slot.id && a.feederId === feeder.id
              );

              if (isAssigned) {
                activePlannedSlotEndTime = slot.endTime;
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

      return {
        isPlanned: true,
        ticketCreated: false,
        scheduledEndTime: activePlannedSlotEndTime,
        message: `Your area is currently under scheduled load shedding until ${formattedEndTime}. This is not a fault. No technician will be dispatched.`
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

    // Queue SMS and notification to customer
    await notificationService.createNotification(
      customerId,
      'Outage Report Received',
      `We have received your outage report (${ticketNumber}). Our control room has been alerted and a technician is being assigned.`,
      NotificationType.OUTAGE_REPORTED,
      { ticketId: newTicket.id, ticketNumber }
    );

    return {
      isPlanned: false,
      ticketCreated: true,
      ticket: {
        id: newTicket.id,
        ticketNumber: newTicket.ticketNumber,
        status: newTicket.status,
        feederId: feeder.id,
        feederName: feeder.name,
        createdAt: newTicket.createdAt
      },
      message: 'We have received your report. A technician is being assigned.'
    };
  }
}

export const conflictResolutionService = new SmartConflictResolutionService();

