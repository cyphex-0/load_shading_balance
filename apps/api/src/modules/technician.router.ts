import { Router, Response, NextFunction } from 'express';
import { resolveTicketSchema, UserRole, OutageStatus, AssignmentStatus, FeederStatus, NotificationType } from '@load-shedding/shared';
import { store, OutageAttachmentRecord } from '../db/store';
import { authenticateUser, requireRoles } from '../middleware/auth';
import { successResponse, AppError, ForbiddenError, NotFoundError } from '../utils/response';
import { uploadRepairPhoto } from '../middleware/upload';
import { socketEmitter } from '../sockets/socket.server';
import { notificationService } from '../services/notification.service';
import { attachmentService } from '../services/attachment.service';

export const technicianRouter = Router();

const techAuth = [authenticateUser, requireRoles(UserRole.TECHNICIAN, UserRole.ADMIN)];

// Endpoint 38: GET /api/technicians/me/assignments
technicianRouter.get('/technicians/me/assignments', techAuth, (req: any, res) => {
  const statusFilter = req.query.status as string;

  const myAssignments = Array.from(store.technicianAssignments.values()).filter(
    (a) => a.technicianId === req.user.sub
  );

  const tickets = myAssignments.map((a) => {
    const ticket = store.outageTickets.get(a.ticketId);
    const feeder = ticket ? store.feeders.get(ticket.feederId) : null;
    const meter = ticket ? store.meters.get(ticket.meterId) : null;
    const sub = feeder ? store.substations.get(feeder.substationId) : null;
    const zone = sub ? store.zones.get(sub.zoneId) : null;

    const attachments = Array.from(store.outageAttachments.values()).filter(
      (att) => att.ticketId === a.ticketId
    );

    return {
      assignmentId: a.id,
      ticketId: a.ticketId,
      status: ticket?.status,
      assignmentStatus: a.status,
      ticketNumber: ticket?.ticketNumber,
      description: ticket?.description,
      landmark: ticket?.landmark,
      address: meter?.address,
      feederName: feeder?.name,
      substationName: sub?.name,
      zoneName: zone?.name,
      reportedAt: ticket?.reportedAt,
      assignedAt: a.assignedAt,
      acceptedAt: a.acceptedAt,
      startedAt: a.startedAt,
      completedAt: a.completedAt,
      attachments
    };
  });

  const filtered = statusFilter ? tickets.filter((t) => t.status === statusFilter) : tickets;

  return successResponse(res, filtered);
});

// Endpoint 39: POST /api/technicians/me/assignments/:id/accept (ASSIGNED -> EN_ROUTE)
technicianRouter.post('/technicians/me/assignments/:id/accept', techAuth, (req: any, res) => {
  const ticket = store.outageTickets.get(req.params.id);
  if (!ticket) throw new NotFoundError('Ticket not found', 'TICKET_NOT_FOUND');

  const assignment = Array.from(store.technicianAssignments.values()).find(
    (a) => a.ticketId === ticket.id && (a.technicianId === req.user.sub || req.user.role === UserRole.ADMIN)
  );
  if (!assignment) {
    throw new ForbiddenError('Ticket not assigned to you', 'NOT_ASSIGNED_TECHNICIAN');
  }

  const now = new Date().toISOString();
  assignment.status = AssignmentStatus.ACCEPTED;
  assignment.acceptedAt = now;

  ticket.status = OutageStatus.EN_ROUTE;
  ticket.updatedAt = now;

  const histId = `hist_${Date.now()}`;
  store.outageStatusHistories.set(histId, {
    id: histId,
    ticketId: ticket.id,
    previousStatus: OutageStatus.ASSIGNED,
    newStatus: OutageStatus.EN_ROUTE,
    changedById: req.user.sub,
    notes: 'Technician accepted dispatch and is en route',
    createdAt: now
  });

  socketEmitter.emitTicketStatusChanged({
    ticketId: ticket.id,
    customerId: ticket.customerId,
    status: OutageStatus.EN_ROUTE,
    updatedAt: now
  });

  return successResponse(res, { success: true, status: ticket.status });
});

// Endpoint 40: POST /api/technicians/me/assignments/:id/start-repair (EN_ROUTE -> REPAIRING)
technicianRouter.post('/technicians/me/assignments/:id/start-repair', techAuth, (req: any, res) => {
  const ticket = store.outageTickets.get(req.params.id);
  if (!ticket) throw new NotFoundError('Ticket not found', 'TICKET_NOT_FOUND');

  const assignment = Array.from(store.technicianAssignments.values()).find(
    (a) => a.ticketId === ticket.id && (a.technicianId === req.user.sub || req.user.role === UserRole.ADMIN)
  );
  if (!assignment) {
    throw new ForbiddenError('Ticket not assigned to you', 'NOT_ASSIGNED_TECHNICIAN');
  }

  const now = new Date().toISOString();
  assignment.status = AssignmentStatus.IN_PROGRESS;
  assignment.startedAt = now;

  ticket.status = OutageStatus.REPAIRING;
  ticket.updatedAt = now;

  const histId = `hist_${Date.now()}`;
  store.outageStatusHistories.set(histId, {
    id: histId,
    ticketId: ticket.id,
    previousStatus: OutageStatus.EN_ROUTE,
    newStatus: OutageStatus.REPAIRING,
    changedById: req.user.sub,
    notes: 'Technician arrived on site and commenced repair work',
    createdAt: now
  });

  socketEmitter.emitTicketStatusChanged({
    ticketId: ticket.id,
    customerId: ticket.customerId,
    status: OutageStatus.REPAIRING,
    updatedAt: now
  });

  return successResponse(res, { success: true, status: ticket.status });
});

// Endpoint 41: POST /api/technicians/me/assignments/:id/resolve (REPAIRING -> RESOLVED)
technicianRouter.post('/technicians/me/assignments/:id/resolve', techAuth, async (req: any, res, next) => {
  try {
    const { resolutionNotes, attachmentId } = resolveTicketSchema.parse(req.body);

    const ticket = store.outageTickets.get(req.params.id);
    if (!ticket) throw new NotFoundError('Ticket not found', 'TICKET_NOT_FOUND');

    const assignment = Array.from(store.technicianAssignments.values()).find(
      (a) => a.ticketId === ticket.id && (a.technicianId === req.user.sub || req.user.role === UserRole.ADMIN)
    );
    if (!assignment) {
      throw new ForbiddenError('Ticket not assigned to you', 'NOT_ASSIGNED_TECHNICIAN');
    }

    const now = new Date().toISOString();
    assignment.status = AssignmentStatus.COMPLETED;
    assignment.completedAt = now;

    ticket.status = OutageStatus.RESOLVED;
    ticket.resolvedAt = now;
    ticket.resolutionNotes = resolutionNotes;
    ticket.updatedAt = now;

    // Record history
    const histId = `hist_${Date.now()}`;
    store.outageStatusHistories.set(histId, {
      id: histId,
      ticketId: ticket.id,
      previousStatus: OutageStatus.REPAIRING,
      newStatus: OutageStatus.RESOLVED,
      changedById: req.user.sub,
      notes: `Repair completed: ${resolutionNotes}`,
      createdAt: now
    });

    // Check if other active outages remain on this feeder
    const otherActiveOutages = Array.from(store.outageTickets.values()).some(
      (t) => t.feederId === ticket.feederId && t.id !== ticket.id && t.status !== 'RESOLVED' && t.status !== 'CANCELLED'
    );

    // If no other faults and feeder was UNEXPECTED_FAULT, restore feeder to ONLINE
    const feeder = store.feeders.get(ticket.feederId);
    if (feeder && !otherActiveOutages && feeder.status === FeederStatus.UNEXPECTED_FAULT) {
      feeder.status = FeederStatus.ONLINE;
      feeder.updatedAt = now;
      socketEmitter.emitFeederStatusChanged({
        feederId: feeder.id,
        status: FeederStatus.ONLINE,
        timestamp: now
      });
    }

    // Emit real-time status changed
    socketEmitter.emitTicketStatusChanged({
      ticketId: ticket.id,
      customerId: ticket.customerId,
      status: OutageStatus.RESOLVED,
      updatedAt: now
    });

    // Notify customer
    await notificationService.createNotification(
      ticket.customerId,
      'Power Restored',
      `Your outage report (${ticket.ticketNumber}) has been resolved. Power has been restored to your feeder line.`,
      NotificationType.POWER_RESTORED,
      { ticketId: ticket.id }
    );

    return successResponse(res, {
      success: true,
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        resolvedAt: ticket.resolvedAt,
        resolutionNotes: ticket.resolutionNotes
      }
    });
  } catch (err) {
    next(err);
  }
});

// Endpoint 42: POST /api/technicians/me/uploads/repair-photo (and /api/v1/technician/outages/:id/attachments)
const handleUploadPhoto = (req: any, res: any, next: any) => {
  if (!req.file) {
    return next(new AppError('No photo file uploaded', 400, 'NO_FILE'));
  }

  const ticketId = req.params.id || req.body.ticketId;
  const attachmentId = `att_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  const now = new Date().toISOString();
  const attachment: OutageAttachmentRecord = {
    id: attachmentId,
    ticketId: ticketId || 'unlinked',
    uploaderId: req.user.sub,
    storageKey: `repair-photos/${ticketId || 'unlinked'}/${req.file.filename}`,
    fileUrl: `/uploads/${req.file.filename}`,
    fileName: req.file.originalname,
    fileType: req.file.mimetype,
    fileSize: req.file.size,
    isVerified: true,
    verifiedAt: now,
    createdAt: now
  };

  store.outageAttachments.set(attachmentId, attachment);

  return successResponse(
    res,
    {
      attachmentId: attachment.id,
      fileUrl: attachment.fileUrl,
      fileName: attachment.fileName,
      fileSize: attachment.fileSize
    },
    201
  );
};

technicianRouter.post(
  '/technicians/me/uploads/repair-photo',
  techAuth,
  uploadRepairPhoto.single('photo'),
  handleUploadPhoto
);

technicianRouter.post(
  '/v1/technician/outages/:id/attachments',
  techAuth,
  uploadRepairPhoto.single('photo'),
  handleUploadPhoto
);

// Endpoint 43: Forward to canonical attachments service
technicianRouter.get(
  ['/outages/:id/attachments', '/v1/outages/:id/attachments'],
  authenticateUser,
  async (req: any, res: Response, next: NextFunction) => {
    try {
      const attachments = await attachmentService.getAttachmentsForOutage(
        req.params.id,
        req.user
      );
      return successResponse(res, attachments);
    } catch (err) {
      next(err);
    }
  }
);
