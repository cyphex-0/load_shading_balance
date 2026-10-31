import { Router, Response, NextFunction } from 'express';
import {
  resolveTicketSchema,
  UserRole,
  OutageStatus,
  AssignmentStatus,
  FeederStatus,
  NotificationType
} from '@load-shedding/shared';
import { store, OutageAttachmentRecord, TechnicianAssignmentRecord } from '../db/store';
import { authenticateUser, requireRoles } from '../middleware/auth';
import { successResponse, AppError, ForbiddenError, NotFoundError } from '../utils/response';
import { uploadRepairPhoto } from '../middleware/upload';
import { socketEmitter } from '../sockets/socket.server';
import { notificationService } from '../services/notification.service';
import { attachmentService } from '../services/attachment.service';
import { outageService } from '../services/outage.service';

export const technicianRouter = Router();

const techAuth = [authenticateUser, requireRoles(UserRole.TECHNICIAN, UserRole.ADMIN)];

// Helper to resolve ticket and assignment while verifying ownership
const resolveAssignmentAndTicket = (paramId: string, user: any) => {
  let ticket = store.outageTickets.get(paramId);
  let assignment: TechnicianAssignmentRecord | undefined;

  if (ticket) {
    assignment = Array.from(store.technicianAssignments.values()).find(
      (a) =>
        a.ticketId === ticket!.id &&
        (a.technicianId === user.sub || user.role === UserRole.ADMIN)
    );
  } else {
    assignment = store.technicianAssignments.get(paramId);
    if (assignment) {
      ticket = store.outageTickets.get(assignment.ticketId);
    }
  }

  if (!ticket) {
    throw new NotFoundError('Ticket not found', 'TICKET_NOT_FOUND');
  }

  if (
    !assignment ||
    (assignment.technicianId !== user.sub && user.role !== UserRole.ADMIN)
  ) {
    throw new ForbiddenError('Ticket not assigned to you', 'NOT_ASSIGNED_TECHNICIAN');
  }

  return { ticket, assignment };
};

// Endpoint 38: GET /api/v1/technicians/me/assignments (and /api/technicians/me/assignments)
technicianRouter.get(
  ['/technicians/me/assignments', '/v1/technicians/me/assignments'],
  techAuth,
  async (req: any, res, next) => {
    try {
      const statusFilter = req.query.status as string;
      const assignments = await outageService.getTechnicianAssignments(req.user.sub, statusFilter);
      return successResponse(res, assignments);
    } catch (err) {
      next(err);
    }
  }
);

// Endpoint 39: POST /api/v1/technicians/me/assignments/:id/accept (ASSIGNED -> EN_ROUTE)
technicianRouter.post(
  ['/technicians/me/assignments/:id/accept', '/v1/technicians/me/assignments/:id/accept'],
  techAuth,
  async (req: any, res, next) => {
    try {
      const { ticket, assignment } = resolveAssignmentAndTicket(req.params.id, req.user);

      const now = new Date().toISOString();
      await outageService.transitionTicket(
        ticket.id,
        OutageStatus.EN_ROUTE,
        req.user.sub,
        'Technician accepted dispatch and is en route'
      );

      assignment.status = AssignmentStatus.ACCEPTED;
      assignment.acceptedAt = now;

      return successResponse(res, {
        success: true,
        status: ticket.status,
        assignmentId: assignment.id,
        ticketId: ticket.id
      });
    } catch (err) {
      next(err);
    }
  }
);

// Endpoint 40: POST /api/v1/technicians/me/assignments/:id/start-repair (EN_ROUTE -> REPAIRING)
technicianRouter.post(
  ['/technicians/me/assignments/:id/start-repair', '/v1/technicians/me/assignments/:id/start-repair'],
  techAuth,
  async (req: any, res, next) => {
    try {
      const { ticket, assignment } = resolveAssignmentAndTicket(req.params.id, req.user);

      const now = new Date().toISOString();
      await outageService.transitionTicket(
        ticket.id,
        OutageStatus.REPAIRING,
        req.user.sub,
        'Technician arrived on site and commenced repair work'
      );

      assignment.status = AssignmentStatus.IN_PROGRESS;
      assignment.startedAt = now;

      return successResponse(res, {
        success: true,
        status: ticket.status,
        assignmentId: assignment.id,
        ticketId: ticket.id
      });
    } catch (err) {
      next(err);
    }
  }
);

// Endpoint 42: POST /api/v1/technicians/me/assignments/:id/resolve (REPAIRING -> RESOLVED)
technicianRouter.post(
  ['/technicians/me/assignments/:id/resolve', '/v1/technicians/me/assignments/:id/resolve'],
  techAuth,
  async (req: any, res, next) => {
    try {
      const { resolutionNotes } = resolveTicketSchema.parse(req.body);
      const { ticket, assignment } = resolveAssignmentAndTicket(req.params.id, req.user);

      const now = new Date().toISOString();
      // transitionTicket executes state machine check, notes length check, and Phase 19 photo verification check!
      await outageService.transitionTicket(
        ticket.id,
        OutageStatus.RESOLVED,
        req.user.sub,
        resolutionNotes
      );

      assignment.status = AssignmentStatus.COMPLETED;
      assignment.completedAt = now;

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
  }
);

// Endpoint 43: GET /api/v1/technicians/me/stats (and /api/technicians/me/stats)
technicianRouter.get(
  ['/technicians/me/stats', '/v1/technicians/me/stats'],
  techAuth,
  (req: any, res, next) => {
    try {
      const stats = outageService.getTechnicianStats(req.user.sub);
      return successResponse(res, stats);
    } catch (err) {
      next(err);
    }
  }
);

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
