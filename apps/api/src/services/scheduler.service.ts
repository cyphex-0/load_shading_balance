import {
  ScheduleStatus,
  FeederStatus,
  NotificationType,
  SocketEvent,
  CandidateFeederInput,
  FeederUsageHistoryInput
} from '@load-shedding/shared';
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
import { computeFairRotationSchedule } from './scheduler/fair-rotation.engine';

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

    // 1. Gather all active candidate feeders from store
    const candidateFeeders: CandidateFeederInput[] = Array.from(store.feeders.values())
      .filter((f) => !f.deletedAt)
      .map((f) => {
        const sub = store.substations.get(f.substationId);
        const zone = sub ? store.zones.get(sub.zoneId) : null;
        return {
          id: f.id,
          name: f.name,
          code: f.code,
          capacityMW: f.capacityMW,
          isCritical: f.isCritical,
          substationId: f.substationId,
          substationName: sub?.name || 'Unknown',
          zoneId: sub?.zoneId || null,
          zoneName: zone?.name || 'Unknown'
        };
      });

    // 2. Identify feeders already committed to PUBLISHED schedules on the same calendar day (Law 2)
    const alreadyCommittedFeederIds = new Set<string>();
    for (const sched of store.schedules.values()) {
      if (sched.planningDate === planningDate && sched.status === ScheduleStatus.PUBLISHED) {
        for (const slot of store.scheduleSlots.values()) {
          if (slot.scheduleId === sched.id) {
            for (const assign of store.scheduleFeederAssignments.values()) {
              if (assign.slotId === slot.id) {
                alreadyCommittedFeederIds.add(assign.feederId);
              }
            }
          }
        }
      }
    }

    // 3. Compile historical metrics for multi-factor equity ranking (Law 3)
    const historicalMetrics: FeederUsageHistoryInput[] = candidateFeeders.map((f) => {
      let cutCount = 0;
      let cumulativeHours = 0;
      let latestCutTime: string | null = null;

      for (const assign of store.scheduleFeederAssignments.values()) {
        if (assign.feederId === f.id) {
          cutCount++;
          const slot = store.scheduleSlots.get(assign.slotId);
          if (slot) {
            const durationH =
              (new Date(slot.endTime).getTime() - new Date(slot.startTime).getTime()) / (1000 * 60 * 60);
            if (durationH > 0) cumulativeHours += durationH;

            if (!latestCutTime || new Date(slot.startTime).getTime() > new Date(latestCutTime).getTime()) {
              latestCutTime = slot.startTime;
            }
          }
        }
      }

      return {
        feederId: f.id,
        totalCutsCount: cutCount,
        cumulativeShedHours: Math.round(cumulativeHours * 10) / 10,
        lastShedAt: latestCutTime
      };
    });

    // 4. Invoke the pure deterministic scheduling engine
    const plan = computeFairRotationSchedule({
      planningDate,
      startTime,
      endTime,
      slotDurationMinutes,
      targetDeficitMW: deficitMW,
      candidateFeeders,
      historicalMetrics,
      alreadyCommittedFeederIds: Array.from(alreadyCommittedFeederIds),
      zoneFilterIds: zoneIds
    });

    logger.info(
      `Scheduler draft generation: Found ${plan.eligibleFeedersCount} eligible feeders, excluded ${plan.criticalExcludedCount} critical feeders.`
    );

    // 5. Persist the generated schedule and its slots to the database/store
    const scheduleId = `sched_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const schedule: ScheduleRecord = {
      id: scheduleId,
      planningDate,
      totalDeficitMW: deficitMW,
      status: ScheduleStatus.DRAFT,
      createdById,
      publishedAt: null,
      cancelledAt: null,
      notes: `Draft generated via Fair-Rotation Algorithm for ${plan.totalSlots} slots.`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    store.schedules.set(schedule.id, schedule);

    const createdSlots: any[] = [];

    for (const planSlot of plan.slots) {
      const slotId = `slot_${scheduleId}_${planSlot.slotIndex}`;
      const slotRecord: ScheduleSlotRecord = {
        id: slotId,
        scheduleId,
        startTime: planSlot.startTime,
        endTime: planSlot.endTime,
        targetDeficitMW: planSlot.targetDeficitMW,
        actualDeficitMW: planSlot.actualDeficitMW,
        createdAt: new Date().toISOString()
      };
      store.scheduleSlots.set(slotRecord.id, slotRecord);

      for (const assigned of planSlot.assignedFeeders) {
        const asgnId = `asgn_${slotId}_${assigned.feederId}`;
        const asgnRecord: ScheduleFeederAssignmentRecord = {
          id: asgnId,
          slotId,
          feederId: assigned.feederId,
          loadMW: assigned.capacityMW,
          createdAt: new Date().toISOString()
        };
        store.scheduleFeederAssignments.set(asgnRecord.id, asgnRecord);
      }

      createdSlots.push({
        ...slotRecord,
        shortfallMW: planSlot.shortfallMW,
        isDeficitSatisfied: planSlot.isDeficitSatisfied,
        feeders: planSlot.assignedFeeders
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

    // Invalidate general grid cache and public schedules cache
    await cacheService.del('grid:status:all');
    await cacheService.delPattern('schedules:public:*');

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
    await cacheService.delPattern('schedules:public:*');
    await cacheService.del('grid:status:all');

    return schedule;
  }
}

export const schedulerService = new SchedulerService();

