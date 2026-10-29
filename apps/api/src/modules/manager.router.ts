import { Router } from 'express';
import {
  infrastructureRequestSchema,
  assignTechnicianSchema,
  UserRole,
  UpgradeRequestStatus
} from '@load-shedding/shared';
import { store, InfrastructureRequestRecord } from '../db/store';
import { authenticateUser, requireRoles } from '../middleware/auth';
import { successResponse, AppError, ForbiddenError, NotFoundError } from '../utils/response';

export const managerRouter = Router();

const mgrAuth = [authenticateUser, requireRoles(UserRole.ZONE_MANAGER, UserRole.ADMIN)];

// Endpoint 44: GET /api/zone-managers/me/dashboard (and /api/v1/manager/grid)
const handleManagerDashboard = (req: any, res: any) => {
  const managerZoneId = req.user.zoneId;
  const statusFilter = req.query.status as string;
  const search = (req.query.search as string)?.toLowerCase();

  // If Admin, can view all zones; if Zone Manager, scoped to their zone
  let feeders = Array.from(store.feeders.values()).filter((f) => !f.deletedAt);

  if (req.user.role === UserRole.ZONE_MANAGER && managerZoneId) {
    feeders = feeders.filter((f) => {
      const sub = store.substations.get(f.substationId);
      return sub && sub.zoneId === managerZoneId;
    });
  }

  if (statusFilter) {
    feeders = feeders.filter((f) => f.status === statusFilter);
  }

  if (search) {
    feeders = feeders.filter(
      (f) => f.name.toLowerCase().includes(search) || f.code.toLowerCase().includes(search)
    );
  }

  const gridTable = feeders.map((f) => {
    const sub = store.substations.get(f.substationId);
    const zone = sub ? store.zones.get(sub.zoneId) : null;
    const openTickets = Array.from(store.outageTickets.values()).filter(
      (t) => t.feederId === f.id && t.status !== 'RESOLVED' && t.status !== 'CANCELLED'
    );

    return {
      id: f.id,
      name: f.name,
      code: f.code,
      capacityMW: f.capacityMW,
      isCritical: f.isCritical,
      status: f.status,
      substationName: sub?.name,
      zoneName: zone?.name,
      openTicketsCount: openTickets.length,
      updatedAt: f.updatedAt
    };
  });

  return successResponse(res, {
    zone: managerZoneId ? store.zones.get(managerZoneId) : null,
    totalFeeders: gridTable.length,
    feeders: gridTable
  });
};

managerRouter.get('/zone-managers/me/dashboard', mgrAuth, handleManagerDashboard);
managerRouter.get('/v1/manager/grid', mgrAuth, handleManagerDashboard);

// Endpoint 45: GET /api/v1/manager/outages
managerRouter.get('/v1/manager/outages', mgrAuth, (req: any, res) => {
  const managerZoneId = req.user.zoneId;

  let tickets = Array.from(store.outageTickets.values()).filter(
    (t) => t.status !== 'RESOLVED' && t.status !== 'CANCELLED'
  );

  if (req.user.role === UserRole.ZONE_MANAGER && managerZoneId) {
    tickets = tickets.filter((t) => {
      const f = store.feeders.get(t.feederId);
      const sub = f ? store.substations.get(f.substationId) : null;
      return sub && sub.zoneId === managerZoneId;
    });
  }

  const enriched = tickets.map((t) => {
    const f = store.feeders.get(t.feederId);
    const m = store.meters.get(t.meterId);
    const asgn = Array.from(store.technicianAssignments.values()).find((a) => a.ticketId === t.id);
    const tech = asgn ? store.users.get(asgn.technicianId) : null;

    return {
      ...t,
      feederName: f?.name,
      address: m?.address,
      assignedTechnician: tech ? { id: tech.id, name: tech.name, phone: tech.phone } : null
    };
  });

  return successResponse(res, enriched);
});

// Endpoint 46: GET /api/v1/manager/technicians
managerRouter.get('/v1/manager/technicians', mgrAuth, (req: any, res) => {
  const managerZoneId = req.user.zoneId;

  let techs = Array.from(store.users.values()).filter(
    (u) => u.role === UserRole.TECHNICIAN && u.status === 'ACTIVE' && !u.deletedAt
  );

  if (req.user.role === UserRole.ZONE_MANAGER && managerZoneId) {
    techs = techs.filter((u) => u.assignedZoneId === managerZoneId);
  }

  const enriched = techs.map((u) => {
    const activeAssignments = Array.from(store.technicianAssignments.values()).filter(
      (a) => a.technicianId === u.id && a.status !== 'COMPLETED'
    );
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      activeTasksCount: activeAssignments.length,
      currentTaskStatus: activeAssignments.length > 0 ? activeAssignments[0].status : 'IDLE'
    };
  });

  return successResponse(res, enriched);
});

// Endpoint 47: PATCH /api/v1/manager/outages/:id/assignment
managerRouter.patch('/v1/manager/outages/:id/assignment', mgrAuth, (req: any, res, next) => {
  try {
    const { technicianId } = assignTechnicianSchema.parse(req.body);
    const ticket = store.outageTickets.get(req.params.id);
    if (!ticket) throw new NotFoundError('Ticket not found', 'TICKET_NOT_FOUND');

    const tech = store.users.get(technicianId);
    if (!tech || tech.role !== UserRole.TECHNICIAN) {
      throw new AppError('Technician not found', 400, 'INVALID_TECHNICIAN');
    }

    // Reassign existing assignments to REASSIGNED
    for (const a of store.technicianAssignments.values()) {
      if (a.ticketId === ticket.id && a.status !== 'COMPLETED') {
        a.status = 'REASSIGNED' as any;
      }
    }

    const asgnId = `re_asgn_${Date.now()}`;
    store.technicianAssignments.set(asgnId, {
      id: asgnId,
      ticketId: ticket.id,
      technicianId: tech.id,
      assignedById: req.user.sub,
      status: 'PENDING' as any,
      assignedAt: new Date().toISOString()
    });

    ticket.status = 'ASSIGNED' as any;
    ticket.updatedAt = new Date().toISOString();

    return successResponse(res, { success: true, message: `Ticket reassigned to ${tech.name}` });
  } catch (err) {
    next(err);
  }
});

// Endpoint 48: GET /api/zone-managers/me/analytics/feeder-failure-rate
managerRouter.get('/zone-managers/me/analytics/feeder-failure-rate', mgrAuth, (req: any, res) => {
  const managerZoneId = req.user.zoneId;

  // Aggregate fault tickets per feeder
  const counts = new Map<string, number>();

  for (const t of store.outageTickets.values()) {
    if (!t.isPlanned) {
      const f = store.feeders.get(t.feederId);
      if (f) {
        const sub = store.substations.get(f.substationId);
        if (!managerZoneId || (sub && sub.zoneId === managerZoneId)) {
          counts.set(f.id, (counts.get(f.id) || 0) + 1);
        }
      }
    }
  }

  // Ensure all feeders in zone are represented
  for (const f of store.feeders.values()) {
    const sub = store.substations.get(f.substationId);
    if (!managerZoneId || (sub && sub.zoneId === managerZoneId)) {
      if (!counts.has(f.id)) {
        counts.set(f.id, 0);
      }
    }
  }

  const result = Array.from(counts.entries())
    .map(([feederId, faultCount]) => {
      const f = store.feeders.get(feederId);
      return {
        feederId,
        feederName: f?.name || 'Unknown',
        feederCode: f?.code || 'Unknown',
        capacityMW: f?.capacityMW || 0,
        faultCount
      };
    })
    .sort((a, b) => b.faultCount - a.faultCount);

  return successResponse(res, result);
});

// Endpoint 49: GET /api/zone-managers/me/analytics/avg-resolution-time
managerRouter.get('/zone-managers/me/analytics/avg-resolution-time', mgrAuth, (req: any, res) => {
  const managerZoneId = req.user.zoneId;

  // Aggregate resolution times per technician
  const techMap = new Map<string, { totalMinutes: number; count: number }>();

  for (const asgn of store.technicianAssignments.values()) {
    if (asgn.status === 'COMPLETED' && asgn.assignedAt && asgn.completedAt) {
      const durationMs = new Date(asgn.completedAt).getTime() - new Date(asgn.assignedAt).getTime();
      const minutes = Math.max(1, Math.round(durationMs / 60000));

      const entry = techMap.get(asgn.technicianId) || { totalMinutes: 0, count: 0 };
      entry.totalMinutes += minutes;
      entry.count += 1;
      techMap.set(asgn.technicianId, entry);
    }
  }

  const result = Array.from(store.users.values())
    .filter((u) => u.role === UserRole.TECHNICIAN && (!managerZoneId || u.assignedZoneId === managerZoneId))
    .map((u) => {
      const stats = techMap.get(u.id);
      return {
        technicianId: u.id,
        technicianName: u.name,
        ticketCount: stats ? stats.count : 0,
        avgResolutionMinutes: stats && stats.count > 0 ? Math.round((stats.totalMinutes / stats.count) * 10) / 10 : 0
      };
    });

  return successResponse(res, result);
});

// Endpoint 50: POST /api/infrastructure-requests (and /api/v1/manager/upgrade-requests)
const handleCreateUpgradeRequest = (req: any, res: any, next: any) => {
  try {
    const data = infrastructureRequestSchema.parse(req.body);
    const feeder = store.feeders.get(data.feederId);
    if (!feeder) throw new NotFoundError('Feeder not found', 'FEEDER_NOT_FOUND');

    // Horizontal Zone-Scope Check:
    // If caller is ZONE_MANAGER, verify that the feeder belongs to their assigned zone!
    if (req.user.role === UserRole.ZONE_MANAGER) {
      const substation = store.substations.get(feeder.substationId);
      if (!substation || substation.zoneId !== req.user.zoneId) {
        throw new ForbiddenError(
          'Forbidden: You can only submit upgrade requests for feeders within your assigned zone',
          'ZONE_ACCESS_DENIED'
        );
      }
    }

    const reqId = `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();

    const request: InfrastructureRequestRecord = {
      id: reqId,
      requesterId: req.user.sub,
      feederId: data.feederId,
      reason: data.reason,
      proposedAction: data.proposedAction,
      supportingMetrics: data.supportingMetrics || {},
      status: UpgradeRequestStatus.PENDING,
      createdAt: now,
      updatedAt: now
    };
    store.infrastructureRequests.set(reqId, request);

    return successResponse(res, request, 201);
  } catch (err) {
    next(err);
  }
};

managerRouter.post('/infrastructure-requests', mgrAuth, handleCreateUpgradeRequest);
managerRouter.post('/v1/manager/upgrade-requests', mgrAuth, handleCreateUpgradeRequest);

// Endpoint 51: GET /api/infrastructure-requests
managerRouter.get('/infrastructure-requests', mgrAuth, (req, res) => {
  const requests = Array.from(store.infrastructureRequests.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((r) => {
      const f = store.feeders.get(r.feederId);
      const requester = store.users.get(r.requesterId);
      return {
        ...r,
        feederName: f?.name,
        requesterName: requester?.name
      };
    });

  return successResponse(res, requests);
});
