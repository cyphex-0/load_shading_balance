import { ScheduleStatus, FeederStatus, NotificationType, SocketEvent } from '@load-shedding/shared';
import {
  store,
  ScheduleRecord,
  ScheduleSlotRecord,
  ScheduleFeederAssignmentRecord,
  FeederRecord
} from '../db/store';
import { cacheService } from './cache.service';
import { notificationService } from './notification.service';
import { socketEmitter } from '../sockets/socket.server';
import { AppError } from '../utils/response';
import { logger } from '../utils/logger';

export interface GenerateScheduleParams {
  planningDate: string; // YYYY-MM-DD
  deficitMW: number;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  slotDurationMinutes: number;
  zoneIds?: string[];
  createdById: string;
}

export class SchedulerService {
  async generateDraft(params: GenerateScheduleParams): Promise<ScheduleRecord & { slots: any[] }> {
    const { planningDate, deficitMW, startTime, endTime, slotDurationMinutes, zoneIds, createdById } = params;

    // Parse start and end hours
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const startTotalMinutes = startH * 60 + startM;
    const endTotalMinutes = endH * 60 + endM;

    if (endTotalMinutes <= startTotalMinutes) {
      throw new AppError('End time must be after start time', 400, 'INVALID_TIME_RANGE');
    }

    const totalDurationMinutes = endTotalMinutes - startTotalMinutes;
    const totalSlots = Math.ceil(totalDurationMinutes / slotDurationMinutes);

    // 1. Gather all candidate feeders
    let eligibleFeeders = Array.from(store.feeders.values()).filter((f) => !f.deletedAt);

    if (zoneIds && zoneIds.length > 0) {
      eligibleFeeders = eligibleFeeders.filter((f) => {
        const sub = store.substations.get(f.substationId);
        return sub && zoneIds.includes(sub.zoneId);
      });
    }

    // RULE 1: Hard filter out Critical Feeders (Hospital, Emergency)
    const criticalFeeders = eligibleFeeders.filter((f) => f.isCritical);
    eligibleFeeders = eligibleFeeders.filter((f) => !f.isCritical);

    logger.info(
      `Scheduler draft generation: Found ${eligibleFeeders.length} eligible feeders, excluded ${criticalFeeders.length} critical feeders.`
    );

    // RULE 2: No-Double-Cut Rule check across already PUBLISHED schedules on the same calendar day
    const alreadyScheduledFeederIds = new Set<string>();
    for (const sched of store.schedules.values()) {
      if (sched.planningDate === planningDate && sched.status === ScheduleStatus.PUBLISHED) {
        for (const slot of store.scheduleSlots.values()) {
          if (slot.scheduleId === sched.id) {
            for (const assign of store.scheduleFeederAssignments.values()) {
              if (assign.slotId === slot.id) {
                alreadyScheduledFeederIds.add(assign.feederId);
              }
            }
          }
        }
      }
    }

    // Filter out feeders already cut on this calendar day
    const availableForToday = eligibleFeeders.filter((f) => !alreadyScheduledFeederIds.has(f.id));

    // RULE 3: Fair Rotation Sorting
    // Score feeders by how many total assignments they've had in history (lower is prioritized)
    const feederUsageCount = new Map<string, number>();
    for (const f of availableForToday) {
      let count = 0;
      for (const assign of store.scheduleFeederAssignments.values()) {
        if (assign.feederId === f.id) count++;
      }
      feederUsageCount.set(f.id, count);
    }

    // Sort available feeders by usage count ascending (least used first)
    availableForToday.sort((a, b) => {
      const usageA = feederUsageCount.get(a.id) || 0;
      const usageB = feederUsageCount.get(b.id) || 0;
      return usageA - usageB;
    });

    // Create Draft Schedule Record
    const scheduleId = `sched_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const schedule: ScheduleRecord = {
      id: scheduleId,
      planningDate,
      totalDeficitMW: deficitMW,
      status: ScheduleStatus.DRAFT,
      createdById,
      publishedAt: null,
      cancelledAt: null,
      notes: `Draft generated via Fair-Rotation Algorithm for ${totalSlots} slots.`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    store.schedules.set(schedule.id, schedule);

    // Track which feeders are selected in THIS draft to enforce no-double-cut within the same schedule
    const usedInThisSchedule = new Set<string>();
    const createdSlots: any[] = [];

    // Distribute feeders across slots
    for (let i = 0; i < totalSlots; i++) {
      const slotStartMin = startTotalMinutes + i * slotDurationMinutes;
      const slotEndMin = Math.min(startTotalMinutes + (i + 1) * slotDurationMinutes, endTotalMinutes);

      const slotStartH = Math.floor(slotStartMin / 60)
        .toString()
        .padStart(2, '0');
      const slotStartM = (slotStartMin % 60).toString().padStart(2, '0');
      const slotEndH = Math.floor(slotEndMin / 60)
        .toString()
        .padStart(2, '0');
      const slotEndM = (slotEndMin % 60).toString().padStart(2, '0');

      const slotStartTimeISO = new Date(`${planningDate}T${slotStartH}:${slotStartM}:00.000Z`).toISOString();
      const slotEndTimeISO = new Date(`${planningDate}T${slotEndH}:${slotEndM}:00.000Z`).toISOString();

      const slotId = `slot_${scheduleId}_${i + 1}`;
      let accumulatedMW = 0;
      const slotAssignments: ScheduleFeederAssignmentRecord[] = [];
      const slotFeedersDetails: any[] = [];

      // Select feeders for this slot up to deficitMW
      for (const feeder of availableForToday) {
        if (usedInThisSchedule.has(feeder.id)) continue;

        slotAssignments.push({
          id: `asgn_${slotId}_${feeder.id}`,
          slotId,
          feederId: feeder.id,
          loadMW: feeder.capacityMW,
          createdAt: new Date().toISOString()
        });
        usedInThisSchedule.add(feeder.id);
        accumulatedMW += feeder.capacityMW;

        const sub = store.substations.get(feeder.substationId);
        const zone = sub ? store.zones.get(sub.zoneId) : null;

        slotFeedersDetails.push({
          feederId: feeder.id,
          name: feeder.name,
          code: feeder.code,
          capacityMW: feeder.capacityMW,
          substationName: sub?.name || 'Unknown',
          zoneName: zone?.name || 'Unknown'
        });

        if (accumulatedMW >= deficitMW) {
          break; // Slot target satisfied
        }
      }

      const slotRecord: ScheduleSlotRecord = {
        id: slotId,
        scheduleId,
        startTime: slotStartTimeISO,
        endTime: slotEndTimeISO,
        targetDeficitMW: deficitMW,
        actualDeficitMW: accumulatedMW,
        createdAt: new Date().toISOString()
      };

      store.scheduleSlots.set(slotRecord.id, slotRecord);
      for (const asgn of slotAssignments) {
        store.scheduleFeederAssignments.set(asgn.id, asgn);
      }

      createdSlots.push({
        ...slotRecord,
        feeders: slotFeedersDetails
      });
    }

    return {
      ...schedule,
      slots: createdSlots
    };
  }

  async getScheduleDetails(id: string): Promise<any> {
    const schedule = store.schedules.get(id);
    if (!schedule) throw new AppError('Schedule not found', 404, 'SCHEDULE_NOT_FOUND');

    const slots = Array.from(store.scheduleSlots.values())
      .filter((s) => s.scheduleId === id)
      .map((slot) => {
        const assignments = Array.from(store.scheduleFeederAssignments.values()).filter(
          (a) => a.slotId === slot.id
        );
        const feeders = assignments.map((a) => {
          const f = store.feeders.get(a.feederId);
          const sub = f ? store.substations.get(f.substationId) : null;
          const zone = sub ? store.zones.get(sub.zoneId) : null;
          return {
            feederId: a.feederId,
            loadMW: a.loadMW,
            name: f?.name || 'Unknown',
            code: f?.code || 'Unknown',
            capacityMW: f?.capacityMW || 0,
            zoneName: zone?.name || 'Unknown'
          };
        });
        return {
          ...slot,
          feeders
        };
      });

    return {
      ...schedule,
      slots
    };
  }

  async adjustSlot(scheduleId: string, slotId: string, feederIds: string[]): Promise<any> {
    const schedule = store.schedules.get(scheduleId);
    if (!schedule) throw new AppError('Schedule not found', 404, 'SCHEDULE_NOT_FOUND');
    if (schedule.status !== ScheduleStatus.DRAFT) {
      throw new AppError('Only draft schedules can be adjusted', 400, 'SCHEDULE_NOT_DRAFT');
    }

    const slot = store.scheduleSlots.get(slotId);
    if (!slot || slot.scheduleId !== scheduleId) {
      throw new AppError('Slot not found in schedule', 404, 'SLOT_NOT_FOUND');
    }

    // Validate that none of the feederIds are critical
    for (const fId of feederIds) {
      const feeder = store.feeders.get(fId);
      if (!feeder) throw new AppError(`Feeder ${fId} not found`, 404, 'FEEDER_NOT_FOUND');
      if (feeder.isCritical) {
        throw new AppError(
          `Feeder ${feeder.name} is marked as CRITICAL and cannot be assigned to load shedding`,
          400,
          'CRITICAL_FEEDER_PROTECTED'
        );
      }
    }

    // Remove existing assignments for this slot
    for (const [asgnId, asgn] of Array.from(store.scheduleFeederAssignments.entries())) {
      if (asgn.slotId === slotId) {
        store.scheduleFeederAssignments.delete(asgnId);
      }
    }

    // Re-assign new feeders
    let totalMW = 0;
    for (const fId of feederIds) {
      const feeder = store.feeders.get(fId)!;
      const asgn: ScheduleFeederAssignmentRecord = {
        id: `asgn_${slotId}_${fId}`,
        slotId,
        feederId: fId,
        loadMW: feeder.capacityMW,
        createdAt: new Date().toISOString()
      };
      store.scheduleFeederAssignments.set(asgn.id, asgn);
      totalMW += feeder.capacityMW;
    }

    slot.actualDeficitMW = totalMW;
    schedule.updatedAt = new Date().toISOString();

    return this.getScheduleDetails(scheduleId);
  }

  async publishSchedule(id: string): Promise<any> {
    const schedule = store.schedules.get(id);
    if (!schedule) throw new AppError('Schedule not found', 404, 'SCHEDULE_NOT_FOUND');
    if (schedule.status !== ScheduleStatus.DRAFT) {
      throw new AppError('Only draft schedules can be published', 400, 'SCHEDULE_NOT_DRAFT');
    }

    schedule.status = ScheduleStatus.PUBLISHED;
    schedule.publishedAt = new Date().toISOString();
    schedule.updatedAt = new Date().toISOString();

    const details = await this.getScheduleDetails(id);

    // Warm Redis cache for all affected feeders and notify customers
    const affectedFeederIds = new Set<string>();
    for (const slot of details.slots) {
      for (const f of slot.feeders) {
        affectedFeederIds.add(f.feederId);
        const cacheKey = cacheService.getScheduleKey(f.feederId, schedule.planningDate);
        await cacheService.set(cacheKey, { scheduleId: id, slot }, 86400);
      }
    }

    // Queue SMS and In-App Notifications for customers on these feeders
    let notifiedUsers = 0;
    for (const fId of affectedFeederIds) {
      const meters = Array.from(store.meters.values()).filter((m) => m.feederId === fId);
      for (const m of meters) {
        const custMeters = Array.from(store.customerMeters.values()).filter(
          (cm) => cm.meterId === m.id && !cm.unlinkedAt
        );
        for (const cm of custMeters) {
          await notificationService.createNotification(
            cm.customerId,
            'Load Shedding Schedule Published',
            `Load shedding schedule published for ${schedule.planningDate} covering your meter line.`,
            NotificationType.PLANNED_SCHEDULE,
            { scheduleId: id, feederId: fId }
          );
          notifiedUsers++;
        }
      }
    }

    // Invalidate general grid cache
    await cacheService.del('grid:status:all');

    // Emit real-time Socket event
    socketEmitter.emitSchedulePublished({
      scheduleId: id,
      planningDate: schedule.planningDate,
      affectedFeedersCount: affectedFeederIds.size
    });

    return {
      schedule: details,
      affectedFeedersCount: affectedFeederIds.size,
      customersNotified: notifiedUsers
    };
  }

  async cancelSchedule(id: string): Promise<any> {
    const schedule = store.schedules.get(id);
    if (!schedule) throw new AppError('Schedule not found', 404, 'SCHEDULE_NOT_FOUND');
    if (schedule.status === ScheduleStatus.CANCELLED) {
      throw new AppError('Schedule is already cancelled', 400, 'SCHEDULE_ALREADY_CANCELLED');
    }

    schedule.status = ScheduleStatus.CANCELLED;
    schedule.cancelledAt = new Date().toISOString();
    schedule.updatedAt = new Date().toISOString();

    // Bust Redis cache for this schedule
    await cacheService.delPattern(`schedules:published:*:${schedule.planningDate}`);
    await cacheService.del('grid:status:all');

    return schedule;
  }
}

export const schedulerService = new SchedulerService();

