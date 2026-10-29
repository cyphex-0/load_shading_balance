import { Router } from 'express';
import { store } from '../db/store';
import { successResponse } from '../utils/response';
import { cacheService } from '../services/cache.service';

export const gridRouter = Router();

// Endpoint 18: GET /api/zones
gridRouter.get('/zones', async (req, res) => {
  const zones = Array.from(store.zones.values())
    .filter((z) => !z.deletedAt)
    .map((z) => {
      const subs = Array.from(store.substations.values()).filter((s) => s.zoneId === z.id && !s.deletedAt);
      return {
        ...z,
        substationsCount: subs.length
      };
    });

  return successResponse(res, zones);
});

// Endpoint 19: GET /api/feeders
gridRouter.get('/feeders', (req, res) => {
  const zoneId = req.query.zoneId as string;
  let feeders = Array.from(store.feeders.values()).filter((f) => !f.deletedAt);

  if (zoneId) {
    feeders = feeders.filter((f) => {
      const sub = store.substations.get(f.substationId);
      return sub && sub.zoneId === zoneId;
    });
  }

  const enriched = feeders.map((f) => {
    const sub = store.substations.get(f.substationId);
    const zone = sub ? store.zones.get(sub.zoneId) : null;
    return {
      ...f,
      substationName: sub?.name || 'Unknown',
      zoneId: sub?.zoneId,
      zoneName: zone?.name || 'Unknown'
    };
  });

  return successResponse(res, enriched);
});

// Endpoint 20: GET /api/grid/status
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
      const activeTickets = Array.from(store.outageTickets.values()).filter(
        (t) => t.feederId === f.id && t.status !== 'RESOLVED' && t.status !== 'CANCELLED'
      ).length;

      return {
        id: f.id,
        name: f.name,
        code: f.code,
        capacityMW: f.capacityMW,
        isCritical: f.isCritical,
        status: f.status,
        substation: sub ? { id: sub.id, name: sub.name, code: sub.code } : null,
        zone: zone ? { id: zone.id, name: zone.name, code: zone.code } : null,
        activeOutagesCount: activeTickets,
        updatedAt: f.updatedAt
      };
    });

  const summary = {
    totalFeeders: feeders.length,
    onlineCount: feeders.filter((f) => f.status === 'ONLINE').length,
    plannedOutageCount: feeders.filter((f) => f.status === 'PLANNED_OUTAGE').length,
    unexpectedFaultCount: feeders.filter((f) => f.status === 'UNEXPECTED_FAULT').length,
    feeders
  };

  await cacheService.set(cacheKey, summary, 30); // 30-second cache
  return successResponse(res, summary);
});
