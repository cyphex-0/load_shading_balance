import { Router } from 'express';
import {
  generateScheduleDraftSchema,
  adjustSlotSchema,
  assignTechnicianSchema,
  activeOutagesQuerySchema,
  UserRole,
  FeederStatus,
  OutageStatus,
  AssignmentStatus
} from '@load-shedding/shared';
import { store, TechnicianAssignmentRecord, OutageStatusHistoryRecord } from '../db/store';
import { authenticateUser, requireRoles } from '../middleware/auth';
import { successResponse, paginatedResponse, AppError } from '../utils/response';
import { schedulerService } from '../services/scheduler.service';
import { socketEmitter } from '../sockets/socket.server';
import { notificationService } from '../services/notification.service';
import { gridService } from '../services/grid.service';

export const operatorRouter = Router();

// Guard for operator routes
const opAuth = [authenticateUser, requireRoles(UserRole.POWER_OPERATOR, UserRole.ADMIN, UserRole.ZONE_MANAGER)];

// Endpoint 30: POST /api/operator/schedules/draft (and /api/v1/operator/schedules/generate)
const handleGenerateDraft = async (req: any, res: any, next: any) => {
  try {
    const data = generateScheduleDraftSchema.parse(req.body);
    const draft = await schedulerService.generateDraft({
      ...data,
      createdById: req.user.sub
    });

    return successResponse(res, draft, 201);
  } catch (err) {
    next(err);
  }
};

operatorRouter.post('/operator/schedules/draft', opAuth, handleGenerateDraft);
operatorRouter.post('/v1/operator/schedules/generate', opAuth, handleGenerateDraft);

// Canonical Endpoint 32: GET /api/v1/operator/schedules
operatorRouter.get('/operator/schedules', opAuth, (req, res) => {
  let list = Array.from(store.schedules.values());

  if (req.query.status) {
    list = list.filter((s) => s.status === req.query.status);
  }
  if (req.query.date) {
    list = list.filter((s) => s.planningDate === req.query.date);
  }

  list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const pageSize = Math.max(1, parseInt(req.query.pageSize as string, 10) || 20);
  const total = list.length;
  const paginated = list.slice((page - 1) * pageSize, page * pageSize);

  return paginatedResponse(res, paginated, total, page, pageSize);
});

// Endpoint 31: GET /api/operator/schedules/:id
operatorRouter.get('/operator/schedules/:id', opAuth, async (req, res, next) => {
  try {
    const details = await schedulerService.getScheduleDetails(req.params.id);
    return successResponse(res, details);
  } catch (err) {
    next(err);
  }
});

// Endpoint 32: PATCH /api/operator/schedules/:id/slots/:slotId
operatorRouter.patch('/operator/schedules/:id/slots/:slotId', opAuth, async (req, res, next) => {
  try {
    const { feederIds } = adjustSlotSchema.parse(req.body);
    const updated = await schedulerService.adjustSlot(req.params.id, req.params.slotId, feederIds);
    return successResponse(res, updated);
  } catch (err) {
    next(err);
  }
});

// Endpoint 33: POST /api/operator/schedules/:id/publish
operatorRouter.post('/operator/schedules/:id/publish', opAuth, async (req, res, next) => {
  try {
    const published = await schedulerService.publishSchedule(req.params.id);
    return successResponse(res, published);
  } catch (err) {
    next(err);
  }
});

// Endpoint 34: POST /api/operator/schedules/:id/cancel
operatorRouter.post('/operator/schedules/:id/cancel', opAuth, async (req, res, next) => {
  try {
    const cancelled = await schedulerService.cancelSchedule(req.params.id);
    return successResponse(res, cancelled);
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// Endpoint 30: GET /api/v1/operator/grid-overview (SCADA Control Room Overview)
// ============================================================================
const handleGridOverview = (req: any, res: any) => {
  const latestMetric = store.gridMetrics[store.gridMetrics.length - 1] || {
    id: 'gm_default',
    totalDemandMW: 12500,
    availableCapacityMW: 11200,
    currentDeficitMW: 1300,
    activeOutagesCount: 0,
    timestamp: new Date().toISOString()
  };

  const currentDeficitMW = Math.max(
    0,
    latestMetric.totalDemandMW - latestMetric.availableCapacityMW
  );

  const feederCounts = gridService.getFeederHealthSummary();
  const zoneBreakdown = gridService.getZoneHealthSummary();

  const activeTickets = Array.from(store.outageTickets.values()).filter(
    (t) => t.status !== OutageStatus.RESOLVED && t.status !== OutageStatus.CANCELLED
  );

  const allTechnicians = Array.from(store.users.values()).filter(
    (u) => u.role === UserRole.TECHNICIAN && u.status === 'ACTIVE' && !u.deletedAt
  );

  const activeAssignments = Array.from(store.technicianAssignments.values()).filter(
    (a) => a.status !== AssignmentStatus.COMPLETED
  );
  const dispatchedTechIds = new Set(activeAssignments.map((a) => a.technicianId));
  const dispatchedCount = allTechnicians.filter((t) => dispatchedTechIds.has(t.id)).length;

  const responsePayload = {
    metrics: {
      ...latestMetric,
      currentDeficitMW
    },
    feederCounts,
    activeOutages: {
      plannedCount: feederCounts.plannedOutage,
      unplannedCount: activeTickets.length,
      totalCount: feederCounts.plannedOutage + activeTickets.length
    },
    technicians: {
      total: allTechnicians.length,
      active: allTechnicians.length,
      dispatched: dispatchedCount
    },
    zoneBreakdown,
    // Legacy compatibility fields
    activePlannedOutagesCount: feederCounts.plannedOutage,
    activeUnexpectedOutagesCount: activeTickets.length,
    totalTechnicians: allTechnicians.length,
    activeOutagesList: activeTickets.slice(0, 10).map((t) => {
      const f = store.feeders.get(t.feederId);
      return {
        ...t,
        feederName: f?.name
      };
    })
  };

  return successResponse(res, responsePayload);
};

operatorRouter.get('/operator/grid-overview', opAuth, handleGridOverview);
operatorRouter.get('/operator/overview', opAuth, handleGridOverview);

// ============================================================================
// Endpoint 37: GET /api/v1/operator/outages/active (Unified Live Offline Feeders)
// ============================================================================
operatorRouter.get('/operator/outages/active', opAuth, (req: any, res: any) => {
  const query = activeOutagesQuerySchema.parse(req.query);

  const offlineItems: any[] = [];
  const processedFeederIds = new Set<string>();

  // 1. Unplanned Emergency Outages (Outage Tickets)
  if (!query.outageType || query.outageType === 'UNPLANNED') {
    const activeTickets = Array.from(store.outageTickets.values()).filter(
      (t) => t.status !== OutageStatus.RESOLVED && t.status !== OutageStatus.CANCELLED
    );

    for (const ticket of activeTickets) {
      const feeder = store.feeders.get(ticket.feederId);
      if (!feeder || feeder.deletedAt) continue;

      const sub = store.substations.get(feeder.substationId);
      const zone = sub ? store.zones.get(sub.zoneId) : null;

      if (query.zoneId && sub?.zoneId !== query.zoneId) {
        continue;
      }

      const assignment = Array.from(store.technicianAssignments.values()).find(
        (a) => a.ticketId === ticket.id && a.status !== AssignmentStatus.COMPLETED
      );
      const tech = assignment ? store.users.get(assignment.technicianId) : null;
      const impactedMeters = gridService.getConnectedMetersCount(feeder.id);

      offlineItems.push({
        id: `outage_ticket_${ticket.id}`,
        feederId: feeder.id,
        feederName: feeder.name,
        feederCode: feeder.code,
        capacityMW: feeder.capacityMW,
        substationName: sub?.name || 'Unknown Substation',
        zoneName: zone?.name || 'Unknown Zone',
        outageType: 'UNPLANNED',
        status: ticket.status,
        startTime: ticket.reportedAt,
        estimatedRestoration: null,
        impactedMetersCount: impactedMeters,
        ticket: {
          id: ticket.id,
          ticketNumber: ticket.ticketNumber,
          description: ticket.description,
          status: ticket.status,
          reportedAt: ticket.reportedAt,
          assignedTechnician: tech
            ? {
                id: tech.id,
                name: tech.name,
                phone: tech.phone || null
              }
            : null
        },
        scheduleSlot: null
      });

      processedFeederIds.add(feeder.id);
    }
  }

  // 2. Planned Load Shedding Outages (Active Published Schedule Slots)
  if (!query.outageType || query.outageType === 'PLANNED') {
    const activeFeeders = Array.from(store.feeders.values()).filter((f) => !f.deletedAt);

    for (const feeder of activeFeeders) {
      // If feeder already processed as UNPLANNED, skip (fault precedence)
      if (processedFeederIds.has(feeder.id)) continue;

      const effective = gridService.getEffectiveFeederStatus(feeder.id);
      if (effective.status !== FeederStatus.PLANNED_OUTAGE) continue;

      const sub = store.substations.get(feeder.substationId);
      const zone = sub ? store.zones.get(sub.zoneId) : null;

      if (query.zoneId && sub?.zoneId !== query.zoneId) {
        continue;
      }

      const impactedMeters = gridService.getConnectedMetersCount(feeder.id);

      offlineItems.push({
        id: `outage_slot_${feeder.id}_${effective.activeSlot?.slotId || Date.now()}`,
        feederId: feeder.id,
        feederName: feeder.name,
        feederCode: feeder.code,
        capacityMW: feeder.capacityMW,
        substationName: sub?.name || 'Unknown Substation',
        zoneName: zone?.name || 'Unknown Zone',
        outageType: 'PLANNED',
        status: 'LOAD_SHEDDING',
        startTime: effective.activeSlot?.startTime || feeder.updatedAt,
        estimatedRestoration: effective.activeSlot?.endTime || null,
        impactedMetersCount: impactedMeters,
        ticket: null,
        scheduleSlot: effective.activeSlot || null
      });
    }
  }

  // Sort by startTime descending
  offlineItems.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

  const page = query.page || 1;
  const pageSize = query.pageSize || 20;
  const total = offlineItems.length;
  const paginated = offlineItems.slice((page - 1) * pageSize, page * pageSize);

  return paginatedResponse(res, paginated, total, page, pageSize);
});

// Endpoint 36: GET /api/operators/outage-reports
operatorRouter.get('/operators/outage-reports', opAuth, (req, res) => {
  const statusFilter = req.query.status as string;

  let tickets = Array.from(store.outageTickets.values());

  if (statusFilter) {
    tickets = tickets.filter((t) => t.status === statusFilter);
  } else {
    // Default to unresolved
    tickets = tickets.filter((t) => t.status !== 'RESOLVED' && t.status !== 'CANCELLED');
  }

  const enriched = tickets.map((t) => {
    const f = store.feeders.get(t.feederId);
    const sub = f ? store.substations.get(f.substationId) : null;
    const zone = sub ? store.zones.get(sub.zoneId) : null;
    const assignment = Array.from(store.technicianAssignments.values()).find(
      (a) => a.ticketId === t.id && a.status !== 'COMPLETED'
    );
    const tech = assignment ? store.users.get(assignment.technicianId) : null;

    return {
      ...t,
      feederName: f?.name,
      feederCode: f?.code,
      substationName: sub?.name,
      zoneName: zone?.name,
      assignedTechnician: tech ? { id: tech.id, name: tech.name, phone: tech.phone } : null
    };
  });

  return successResponse(res, enriched);
});

// Endpoint 37: POST /api/operators/outage-reports/:id/assign
operatorRouter.post('/operators/outage-reports/:id/assign', opAuth, (req: any, res, next) => {
  try {
    const { technicianId } = assignTechnicianSchema.parse(req.body);
    const ticket = store.outageTickets.get(req.params.id);
    if (!ticket) throw new AppError('Outage ticket not found', 404, 'TICKET_NOT_FOUND');

    const tech = store.users.get(technicianId);
    if (!tech || tech.role !== UserRole.TECHNICIAN || tech.status !== 'ACTIVE') {
      throw new AppError('Technician not found or inactive', 400, 'INVALID_TECHNICIAN');
    }

    const now = new Date().toISOString();
    const asgnId = `tech_asgn_${Date.now()}`;
    const newAssignment: TechnicianAssignmentRecord = {
      id: asgnId,
      ticketId: ticket.id,
      technicianId,
      assignedById: req.user.sub,
      status: AssignmentStatus.PENDING,
      assignedAt: now
    };
    store.technicianAssignments.set(asgnId, newAssignment);

    // Update ticket status to ASSIGNED
    ticket.status = OutageStatus.ASSIGNED;
    ticket.updatedAt = now;

    // Log history
    const histId = `hist_${Date.now()}`;
    store.outageStatusHistories.set(histId, {
      id: histId,
      ticketId: ticket.id,
      previousStatus: OutageStatus.REPORTED,
      newStatus: OutageStatus.ASSIGNED,
      changedById: req.user.sub,
      notes: `Assigned to technician ${tech.name}`,
      createdAt: now
    });

    const feeder = store.feeders.get(ticket.feederId);
    const meter = store.meters.get(ticket.meterId);

    // Emit Socket events
    socketEmitter.emitTicketAssigned({
      ticketId: ticket.id,
      technicianId: tech.id,
      feederName: feeder?.name || 'Feeder',
      address: meter?.address || 'Site',
      assignedAt: now
    });

    socketEmitter.emitTicketStatusChanged({
      ticketId: ticket.id,
      customerId: ticket.customerId,
      status: OutageStatus.ASSIGNED,
      updatedAt: now
    });

    // Notify technician via SMS & in-app
    notificationService.createNotification(
      tech.id,
      'New Outage Fault Assigned',
      `You have been dispatched to ${feeder?.name || 'an outage'} (${ticket.ticketNumber}). Tap to accept and navigate.`,
      'SYSTEM_ALERT' as any,
      { ticketId: ticket.id }
    );

    return successResponse(res, {
      success: true,
      ticketId: ticket.id,
      technician: {
        id: tech.id,
        name: tech.name,
        phone: tech.phone
      },
      status: ticket.status
    });
  } catch (err) {
    next(err);
  }
});
