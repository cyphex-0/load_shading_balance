import { Router } from 'express';
import {
  generateScheduleDraftSchema,
  adjustSlotSchema,
  assignTechnicianSchema,
  UserRole,
  OutageStatus,
  AssignmentStatus
} from '@load-shedding/shared';
import { store, TechnicianAssignmentRecord, OutageStatusHistoryRecord } from '../db/store';
import { authenticateUser, requireRoles } from '../middleware/auth';
import { successResponse, AppError } from '../utils/response';
import { schedulerService } from '../services/scheduler.service';
import { socketEmitter } from '../sockets/socket.server';
import { notificationService } from '../services/notification.service';

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

// Endpoint 35: GET /api/operator/overview
operatorRouter.get('/operator/overview', opAuth, (req, res) => {
  const latestMetric = store.gridMetrics[store.gridMetrics.length - 1] || {
    totalDemandMW: 12400,
    availableCapacityMW: 11100,
    currentDeficitMW: 1300,
    activeOutagesCount: 0,
    timestamp: new Date().toISOString()
  };

  const activeOutages = Array.from(store.outageTickets.values()).filter(
    (t) => t.status !== 'RESOLVED' && t.status !== 'CANCELLED'
  );

  const activePlannedOutages = Array.from(store.feeders.values()).filter(
    (f) => f.status === 'PLANNED_OUTAGE' && !f.deletedAt
  );

  const technicians = Array.from(store.users.values()).filter(
    (u) => u.role === UserRole.TECHNICIAN && u.status === 'ACTIVE' && !u.deletedAt
  );

  return successResponse(res, {
    metrics: latestMetric,
    activePlannedOutagesCount: activePlannedOutages.length,
    activeUnexpectedOutagesCount: activeOutages.length,
    totalTechnicians: technicians.length,
    activeOutages: activeOutages.slice(0, 10).map((t) => {
      const f = store.feeders.get(t.feederId);
      return {
        ...t,
        feederName: f?.name
      };
    })
  });
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
