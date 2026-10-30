import {
  ScheduleStatus,
  FeederStatus,
  NotificationType,
  SocketEvent,
  CandidateFeederInput,
  FeederUsageHistoryInput,
  ScheduleGenerationRunRecord,
  FeederScheduleSlotDto,
  UserRole
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
import { AppError, NotFoundError, ForbiddenError } from '../utils/response';
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

export interface FeederScheduleQueryOptions {
  startDate?: string;
  endDate?: string;
  status?: ScheduleStatus;
}

export class SchedulerService {
  async generateDraft(params: GenerateScheduleParams): Promise<ScheduleRecord & { slots: any[]; diagnostics: ScheduleGenerationRunRecord }> {
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

    // 6. Persist ScheduleGenerationRun audit record
    const runRecord: ScheduleGenerationRunRecord = {
      id: `sgr_${scheduleId}`,
      scheduleId,
      operatorId: createdById,
      planningDate,
      algorithmVersion: 'v1.0.0-fair-rotation',
      targetDeficitMW: deficitMW,
      selectedMW: plan.overallActualMWh,
      shortfallMW: plan.slots.reduce((sum, s) => sum + s.shortfallMW, 0),
      totalSlots: plan.totalSlots,
      eligibleFeedersCount: plan.eligibleFeedersCount,
      criticalExcludedCount: plan.criticalExcludedCount,
      sameDayExcludedCount: plan.sameDayExcludedCount,
      diagnostics: {
        totalDurationMinutes: plan.totalDurationMinutes,
        overallTargetMWh: plan.overallTargetMWh,
        overallActualMWh: plan.overallActualMWh,
        overallShortfallMWh: plan.overallShortfallMWh
      },
      createdAt: new Date().toISOString()
    };
    store.scheduleGenerationRuns.set(runRecord.id, runRecord);

    return {
      ...schedule,
      slots: createdSlots,
      diagnostics: runRecord
    };
  }

  async getScheduleDetails(id: string): Promise<any> {
    const schedule = store.schedules.get(id);
    if (!schedule) throw new NotFoundError('Schedule not found');

    const generationRun = store.scheduleGenerationRuns.get(`sgr_${id}`);

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
      slots,
      generationRun: generationRun || null
    };
  }

  async updateScheduleMetadata(scheduleId: string, data: { notes?: string }): Promise<any> {
    const schedule = store.schedules.get(scheduleId);
    if (!schedule) throw new NotFoundError('Schedule not found');

    if (schedule.status !== ScheduleStatus.DRAFT) {
      throw new AppError('Only draft schedules can have metadata updated', 409, 'INVALID_STATE_TRANSITION');
    }

    if (data.notes !== undefined) {
      schedule.notes = data.notes;
    }
    schedule.updatedAt = new Date().toISOString();

    return this.getScheduleDetails(scheduleId);
  }

  async adjustSlot(scheduleId: string, slotId: string, feederIds: string[]): Promise<any> {
    const schedule = store.schedules.get(scheduleId);
    if (!schedule) throw new NotFoundError('Schedule not found');
    if (schedule.status !== ScheduleStatus.DRAFT) {
      throw new AppError('Only draft schedules can be adjusted', 409, 'INVALID_STATE_TRANSITION');
    }

    const slot = store.scheduleSlots.get(slotId);
    if (!slot || slot.scheduleId !== scheduleId) {
      throw new NotFoundError('Slot not found in schedule');
    }

    // Grid Law 1: Critical Feeder Immunity & Active Status Validation
    for (const fId of feederIds) {
      const feeder = store.feeders.get(fId);
      if (!feeder || feeder.deletedAt) throw new NotFoundError(`Feeder ${fId} not found`);
      if (feeder.isCritical) {
        throw new AppError(
          `Feeder ${feeder.name} is marked as CRITICAL and cannot be assigned to load shedding`,
          400,
          'CRITICAL_FEEDER_PROTECTED'
        );
      }
      if (feeder.status === FeederStatus.UNEXPECTED_FAULT) {
        throw new AppError(`Feeder ${feeder.name} is currently experiencing an unexpected fault`, 400, 'FEEDER_FAULT');
      }
    }

    // Grid Law 2: Same-Day Single-Cut Rule Validation
    // A feeder cannot be assigned to another slot in the same schedule or another published schedule on that day
    for (const otherSlot of store.scheduleSlots.values()) {
      if (otherSlot.scheduleId === scheduleId && otherSlot.id !== slotId) {
        const otherAssignments = Array.from(store.scheduleFeederAssignments.values()).filter(
          (a) => a.slotId === otherSlot.id
        );
        for (const fId of feederIds) {
          if (otherAssignments.some((a) => a.feederId === fId)) {
            const feeder = store.feeders.get(fId);
            throw new AppError(
              `Feeder ${feeder?.name || fId} is already scheduled in another slot on this day`,
              400,
              'FEEDER_ALREADY_COMMITTED'
            );
          }
        }
      }
    }

    // Check published schedules on the same planning date
    for (const sched of store.schedules.values()) {
      if (sched.id !== scheduleId && sched.planningDate === schedule.planningDate && sched.status === ScheduleStatus.PUBLISHED) {
        for (const s of store.scheduleSlots.values()) {
          if (s.scheduleId === sched.id) {
            const pubAssignments = Array.from(store.scheduleFeederAssignments.values()).filter(
              (a) => a.slotId === s.id
            );
            for (const fId of feederIds) {
              if (pubAssignments.some((a) => a.feederId === fId)) {
                const feeder = store.feeders.get(fId);
                throw new AppError(
                  `Feeder ${feeder?.name || fId} is already scheduled in a published schedule for this date`,
                  400,
                  'FEEDER_ALREADY_COMMITTED'
                );
              }
            }
          }
        }
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

  async publishSchedule(id: string, idempotencyKey?: string): Promise<any> {
    // Check idempotency cache if key was provided
    if (idempotencyKey) {
      const existing = store.idempotencyKeys.get(idempotencyKey);
      if (existing) {
        logger.info(`Returning idempotent cached response for publish schedule ${id}`);
        return existing.result;
      }
    }

    const schedule = store.schedules.get(id);
    if (!schedule) throw new NotFoundError('Schedule not found');
    if (schedule.status !== ScheduleStatus.DRAFT) {
      throw new AppError('Only draft schedules can be published', 409, 'INVALID_STATE_TRANSITION');
    }

    const details = await this.getScheduleDetails(id);

    // Re-validate critical feeder immunity at publish time
    for (const slot of details.slots) {
      for (const f of slot.feeders) {
        const feeder = store.feeders.get(f.feederId);
        if (!feeder || feeder.deletedAt || feeder.isCritical) {
          throw new AppError(
            `Schedule contains invalid or critical feeder ${feeder?.name || f.feederId} and cannot be published`,
            409,
            'INVALID_SCHEDULE_STATE'
          );
        }
      }
    }

    // Commit database state transition
    schedule.status = ScheduleStatus.PUBLISHED;
    schedule.publishedAt = new Date().toISOString();
    schedule.updatedAt = new Date().toISOString();

    // Post-commit side effects: Redis warm, notification intent, socket broadcast
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
            { scheduleId: id, feederId: fId },
            `sched_pub:${id}:${cm.customerId}`
          );
          notifiedUsers++;
        }
      }
    }

    // Invalidate general grid cache and public schedules cache
    await cacheService.del('grid:status:all');
    await cacheService.delPattern('schedules:public:*');
    await cacheService.invalidateCustomerSchedules();

    // Emit real-time Socket event
    socketEmitter.emitSchedulePublished({
      scheduleId: id,
      planningDate: schedule.planningDate,
      affectedFeedersCount: affectedFeederIds.size
    });

    const result = {
      schedule: await this.getScheduleDetails(id),
      affectedFeedersCount: affectedFeederIds.size,
      customersNotified: notifiedUsers
    };

    if (idempotencyKey) {
      store.idempotencyKeys.set(idempotencyKey, {
        result,
        createdAt: new Date().toISOString()
      });
    }

    return result;
  }

  async cancelSchedule(id: string): Promise<any> {
    const schedule = store.schedules.get(id);
    if (!schedule) throw new NotFoundError('Schedule not found');
    if (schedule.status === ScheduleStatus.CANCELLED) {
      throw new AppError('Schedule is already cancelled', 409, 'INVALID_STATE_TRANSITION');
    }
    if ((schedule.status as any) === 'COMPLETED') {
      throw new AppError('Completed schedules cannot be cancelled', 409, 'INVALID_STATE_TRANSITION');
    }

    schedule.status = ScheduleStatus.CANCELLED;
    schedule.cancelledAt = new Date().toISOString();
    schedule.updatedAt = new Date().toISOString();

    // Bust Redis cache for this schedule
    await cacheService.delPattern(`schedules:published:*:${schedule.planningDate}`);
    await cacheService.delPattern('schedules:public:*');
    await cacheService.del('grid:status:all');
    await cacheService.invalidateCustomerSchedules();

    return schedule;
  }

  async getFeederSchedules(
    feederId: string,
    user: { id: string; role: UserRole; assignedZoneId?: string | null },
    query: FeederScheduleQueryOptions = {}
  ): Promise<FeederScheduleSlotDto[]> {
    const feeder = store.feeders.get(feederId);
    if (!feeder || feeder.deletedAt) {
      throw new NotFoundError('Feeder not found');
    }

    // Check Zone Manager scope
    const sub = store.substations.get(feeder.substationId);
    const feederZoneId = sub ? sub.zoneId : null;

    if (user.role === UserRole.ZONE_MANAGER) {
      if (!user.assignedZoneId || user.assignedZoneId !== feederZoneId) {
        throw new ForbiddenError('Forbidden: You do not have access to feeders outside your assigned zone');
      }
    }

    // Find all slots where this feeder is assigned
    const assignments = Array.from(store.scheduleFeederAssignments.values()).filter(
      (a) => a.feederId === feederId
    );

    const results: FeederScheduleSlotDto[] = [];

    for (const asgn of assignments) {
      const slot = store.scheduleSlots.get(asgn.slotId);
      if (!slot) continue;
      const sched = store.schedules.get(slot.scheduleId);
      if (!sched) continue;

      // Role-based draft visibility:
      // Customers and general users cannot see DRAFT schedules.
      if (user.role === UserRole.CUSTOMER && sched.status !== ScheduleStatus.PUBLISHED) {
        continue;
      }

      // Query filters
      if (query.startDate && sched.planningDate < query.startDate) {
        continue;
      }
      if (query.endDate && sched.planningDate > query.endDate) {
        continue;
      }
      if (query.status && sched.status !== query.status) {
        continue;
      }

      results.push({
        scheduleId: sched.id,
        planningDate: sched.planningDate,
        scheduleStatus: sched.status,
        slotId: slot.id,
        startTime: slot.startTime,
        endTime: slot.endTime,
        targetDeficitMW: slot.targetDeficitMW,
        actualDeficitMW: slot.actualDeficitMW,
        feederLoadMW: asgn.loadMW,
        isPublished: sched.status === ScheduleStatus.PUBLISHED
      });
    }

    // Sort descending by planningDate, then startTime
    results.sort((a, b) => {
      const dateCmp = b.planningDate.localeCompare(a.planningDate);
      if (dateCmp !== 0) return dateCmp;
      return a.startTime.localeCompare(b.startTime);
    });

    return results;
  }
}

export const schedulerService = new SchedulerService();
