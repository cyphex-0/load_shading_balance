import { Router } from 'express';
import {
  ScheduleStatus,
  zoneListQuerySchema,
  publicFeedersQuerySchema,
  publicScheduleQuerySchema,
  feederScheduleQuerySchema
} from '@load-shedding/shared';
import { store } from '../db/store';
import { authenticateUser } from '../middleware/auth';
import { successResponse, paginatedResponse } from '../utils/response';
import { cacheService } from '../services/cache.service';
import { gridService } from '../services/grid.service';
import { schedulerService } from '../services/scheduler.service';

export const gridRouter = Router();

// ============================================================================
// Endpoint 18: GET /api/v1/zones (Public Geographic Zones Directory)
// ============================================================================
gridRouter.get('/zones', (req, res) => {
  const query = zoneListQuerySchema.parse(req.query);

  let zones = Array.from(store.zones.values()).filter((z) => !z.deletedAt);

  if (query.search) {
    const term = query.search.toLowerCase();
    zones = zones.filter(
      (z) => z.name.toLowerCase().includes(term) || z.code.toLowerCase().includes(term)
    );
  }

  const enriched = zones.map((z) => {
    const subs = Array.from(store.substations.values()).filter(
      (s) => s.zoneId === z.id && !s.deletedAt
    );
    const subIds = new Set(subs.map((s) => s.id));

    const feeders = Array.from(store.feeders.values()).filter(
      (f) => subIds.has(f.substationId) && !f.deletedAt
    );

    let totalCapacityMW = 0;
    let activeOutagesCount = 0;

    for (const f of feeders) {
      totalCapacityMW += f.capacityMW || 0;
      const effective = gridService.getEffectiveFeederStatus(f.id);
      if (effective.isOffline) {
        activeOutagesCount++;
      }
    }

    return {
      id: z.id,
      name: z.name,
      code: z.code,
      description: z.description || null,
      substationsCount: subs.length,
      feedersCount: feeders.length,
      totalCapacityMW: Math.round(totalCapacityMW * 10) / 10,
      activeOutagesCount,
      createdAt: z.createdAt,
      updatedAt: z.updatedAt
    };
  });

  // If explicit pagination query params were provided, return paginated envelope
  if (req.query.page !== undefined || req.query.pageSize !== undefined) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const total = enriched.length;
    const paginated = enriched.slice((page - 1) * pageSize, page * pageSize);
    return paginatedResponse(res, paginated, total, page, pageSize);
  }

  // Otherwise return array for standard unpaginated consumption
  return successResponse(res, enriched);
});

// ============================================================================
// Endpoint 19: GET /api/v1/feeders (Public Feeders Directory & Live Effective Status)
// ============================================================================
gridRouter.get('/feeders', (req, res) => {
  const query = publicFeedersQuerySchema.parse(req.query);

  let feeders = Array.from(store.feeders.values()).filter((f) => !f.deletedAt);

  if (query.zoneId) {
    feeders = feeders.filter((f) => {
      const sub = store.substations.get(f.substationId);
      return sub && sub.zoneId === query.zoneId && !sub.deletedAt;
    });
  }

  if (query.substationId) {
    feeders = feeders.filter((f) => f.substationId === query.substationId);
  }

  if (query.isCritical !== undefined) {
    feeders = feeders.filter((f) => f.isCritical === query.isCritical);
  }

  if (query.search) {
    const term = query.search.toLowerCase();
    feeders = feeders.filter(
      (f) => f.name.toLowerCase().includes(term) || f.code.toLowerCase().includes(term)
    );
  }

  const enriched = feeders
    .map((f) => {
      const sub = store.substations.get(f.substationId);
      const zone = sub ? store.zones.get(sub.zoneId) : null;
      const effective = gridService.getEffectiveFeederStatus(f.id);
      const connectedMetersCount = gridService.getConnectedMetersCount(f.id);

      let activeOutage: {
        type: 'PLANNED' | 'UNPLANNED';
        startTime: string;
        estimatedRestoration?: string | null;
        ticketNumber?: string;
      } | null = null;

      if (effective.outageType === 'UNPLANNED') {
        activeOutage = {
          type: 'UNPLANNED',
          startTime: effective.activeTicket?.reportedAt || f.updatedAt,
          ticketNumber: effective.activeTicket?.ticketNumber
        };
      } else if (effective.outageType === 'PLANNED') {
        activeOutage = {
          type: 'PLANNED',
          startTime: effective.activeSlot?.startTime || f.updatedAt,
          estimatedRestoration: effective.activeSlot?.endTime || null
        };
      }

      return {
        id: f.id,
        name: f.name,
        code: f.code,
        capacityMW: f.capacityMW,
        isCritical: f.isCritical,
        status: f.status,
        effectiveStatus: effective.status,
        substationId: f.substationId,
        substationName: sub?.name || 'Unknown',
        zoneId: sub?.zoneId || null,
        zoneName: zone?.name || 'Unknown',
        connectedMetersCount,
        activeOutagesCount: effective.isOffline ? 1 : 0,
        activeOutage,
        updatedAt: f.updatedAt
      };
    })
    .filter((f) => {
      if (query.status) {
        return f.effectiveStatus === query.status;
      }
      return true;
    });

  // If explicit pagination query params were provided, return paginated envelope
  if (req.query.page !== undefined || req.query.pageSize !== undefined) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const total = enriched.length;
    const paginated = enriched.slice((page - 1) * pageSize, page * pageSize);
    return paginatedResponse(res, paginated, total, page, pageSize);
  }

  // Otherwise return array for standard unpaginated consumption
  return successResponse(res, enriched);
});

// ============================================================================
// Endpoint 20: GET /api/v1/schedules/public (Citizen Public Schedule Portal)
// ============================================================================
gridRouter.get('/schedules/public', async (req, res) => {
  const query = publicScheduleQuerySchema.parse(req.query);
  const targetDate = query.date || new Date().toISOString().split('T')[0];

  const cacheKey = cacheService.getPublicScheduleKey(targetDate, query.zoneId, query.feederId);
  const cached = await cacheService.get(cacheKey);
  if (cached) {
    return successResponse(res, cached);
  }

  // Find all PUBLISHED schedules on the requested calendar day
  const publishedSchedules = Array.from(store.schedules.values()).filter(
    (s) => s.planningDate === targetDate && s.status === ScheduleStatus.PUBLISHED
  );

  const slotsList: any[] = [];

  for (const schedule of publishedSchedules) {
    const slots = Array.from(store.scheduleSlots.values())
      .filter((slot) => slot.scheduleId === schedule.id)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    for (const slot of slots) {
      let assignments = Array.from(store.scheduleFeederAssignments.values()).filter(
        (a) => a.slotId === slot.id
      );

      // Filter by feederId if requested
      if (query.feederId) {
        assignments = assignments.filter((a) => a.feederId === query.feederId);
      }

      const assignedFeeders: any[] = [];

      for (const asgn of assignments) {
        const feeder = store.feeders.get(asgn.feederId);
        if (!feeder || feeder.deletedAt) continue;

        const sub = store.substations.get(feeder.substationId);
        const zone = sub ? store.zones.get(sub.zoneId) : null;

        // Filter by zoneId if requested
        if (query.zoneId && sub?.zoneId !== query.zoneId) {
          continue;
        }

        assignedFeeders.push({
          id: feeder.id,
          name: feeder.name,
          code: feeder.code,
          capacityMW: feeder.capacityMW,
          substationName: sub?.name || 'Unknown',
          zoneName: zone?.name || 'Unknown'
        });
      }

      // If feederId was specified, only include slots where the feeder is assigned
      if (query.feederId && assignedFeeders.length === 0) {
        continue;
      }

      slotsList.push({
        id: slot.id,
        scheduleId: schedule.id,
        startTime: slot.startTime,
        endTime: slot.endTime,
        targetDeficitMW: slot.targetDeficitMW,
        actualDeficitMW: slot.actualDeficitMW,
        assignedFeeders
      });
    }
  }

  const responsePayload = {
    date: targetDate,
    status: ScheduleStatus.PUBLISHED,
    totalSlots: slotsList.length,
    slots: slotsList
  };

  // Cache public schedule for 60 seconds
  await cacheService.set(cacheKey, responsePayload, 60);

  return successResponse(res, responsePayload);
});

// ============================================================================
// Legacy Endpoint: GET /api/grid/status (SCADA Grid Summary Cache)
// ============================================================================
gridRouter.get('/grid/status', async (req, res) => {
  const cacheKey = cacheService.getGridStatusKey();
  const cached = await cacheService.get(cacheKey);
  if (cached) {
    return successResponse(res, cached);
  }

  const feeders = Array.from(store.feeders.values())
    .filter((f) => !f.deletedAt)
    .map((f) => {
      const sub = store.substations.get(f.substationId);
      const zone = sub ? store.zones.get(sub.zoneId) : null;
      const effective = gridService.getEffectiveFeederStatus(f.id);

      return {
        id: f.id,
        name: f.name,
        code: f.code,
        capacityMW: f.capacityMW,
        isCritical: f.isCritical,
        status: f.status,
        effectiveStatus: effective.status,
        substation: sub ? { id: sub.id, name: sub.name, code: sub.code } : null,
        zone: zone ? { id: zone.id, name: zone.name, code: zone.code } : null,
        activeOutagesCount: effective.isOffline ? 1 : 0,
        updatedAt: f.updatedAt
      };
    });

  const summary = {
    totalFeeders: feeders.length,
    onlineCount: feeders.filter((f) => f.effectiveStatus === 'ONLINE').length,
    plannedOutageCount: feeders.filter((f) => f.effectiveStatus === 'PLANNED_OUTAGE').length,
    unexpectedFaultCount: feeders.filter((f) => f.effectiveStatus === 'UNEXPECTED_FAULT').length,
    feeders
  };

  await cacheService.set(cacheKey, summary, 30);
  return successResponse(res, summary);
});

// Endpoint 35: GET /api/v1/schedules/feeders/:feederId (Authorized Feeder Schedule Lookup)
gridRouter.get('/schedules/feeders/:feederId', authenticateUser, async (req: any, res: any, next: any) => {
  try {
    const query = feederScheduleQuerySchema.parse(req.query);
    const user = {
      id: req.user.sub,
      role: req.user.role,
      assignedZoneId: req.user.zoneId
    };
    const schedules = await schedulerService.getFeederSchedules(req.params.feederId, user, query);
    return successResponse(res, schedules);
  } catch (err) {
    next(err);
  }
});
