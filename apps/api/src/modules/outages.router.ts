import { Router } from 'express';
import {
  outageQuerySchema,
  cancelTicketSchema,
  assignTechnicianSchema,
  UserRole,
  OutageStatus,
  JwtPayload
} from '@load-shedding/shared';
import { store } from '../db/store';
import { authenticateUser, requireRoles } from '../middleware/auth';
import { successResponse, paginatedResponse, NotFoundError } from '../utils/response';
import { outageService } from '../services/outage.service';

export const outagesRouter = Router();

// 1. GET /api/v1/outages - List outage tickets with filtering and pagination
outagesRouter.get(
  ['/outages', '/v1/outages'],
  authenticateUser,
  (req: any, res, next) => {
    try {
      const query = outageQuerySchema.parse(req.query);
      const user: JwtPayload = req.user;

      let tickets = Array.from(store.outageTickets.values());

      // Role-based visibility scoping
      if (user.role === UserRole.CUSTOMER) {
        tickets = tickets.filter((t) => t.customerId === user.sub);
      } else if (user.role === UserRole.TECHNICIAN) {
        const myAssignedTicketIds = new Set(
          Array.from(store.technicianAssignments.values())
            .filter((a) => a.technicianId === user.sub)
            .map((a) => a.ticketId)
        );
        tickets = tickets.filter((t) => myAssignedTicketIds.has(t.id));
      } else if (user.role === UserRole.ZONE_MANAGER && user.zoneId) {
        tickets = tickets.filter((t) => {
          const feeder = store.feeders.get(t.feederId);
          const sub = feeder ? store.substations.get(feeder.substationId) : null;
          return sub?.zoneId === user.zoneId;
        });
      }

      // Filter by query parameters
      if (query.status) {
        tickets = tickets.filter((t) => t.status === query.status);
      }
      if (query.feederId) {
        tickets = tickets.filter((t) => t.feederId === query.feederId);
      }
      if (query.faultType) {
        tickets = tickets.filter((t) => t.faultType === query.faultType);
      }
      if (query.zoneId) {
        tickets = tickets.filter((t) => {
          const feeder = store.feeders.get(t.feederId);
          const sub = feeder ? store.substations.get(feeder.substationId) : null;
          return sub?.zoneId === query.zoneId;
        });
      }

      // Chronological sort: newest first
      tickets.sort(
        (a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime()
      );

      const page = query.page || 1;
      const pageSize = query.pageSize || 20;
      const total = tickets.length;
      const start = (page - 1) * pageSize;
      const paginatedTickets = tickets.slice(start, start + pageSize);

      const items = paginatedTickets.map((t) => outageService.formatTicketDetail(t));

      return paginatedResponse(res, items, page, pageSize, total);
    } catch (err) {
      next(err);
    }
  }
);

// 2. GET /api/v1/outages/:id - Scoped ticket detail
outagesRouter.get(
  ['/outages/:id', '/v1/outages/:id'],
  authenticateUser,
  (req: any, res, next) => {
    try {
      const detail = outageService.getTicketDetail(req.params.id, req.user);
      return successResponse(res, detail);
    } catch (err) {
      next(err);
    }
  }
);

// 3. GET /api/v1/outages/:id/history - Status & Assignment history
outagesRouter.get(
  ['/outages/:id/history', '/v1/outages/:id/history'],
  authenticateUser,
  (req: any, res, next) => {
    try {
      const history = outageService.getTicketHistory(req.params.id, req.user);
      return successResponse(res, history);
    } catch (err) {
      next(err);
    }
  }
);

// 4. POST /api/v1/outages/:id/cancel - Cancel ticket with reason
outagesRouter.post(
  ['/outages/:id/cancel', '/v1/outages/:id/cancel'],
  authenticateUser,
  requireRoles(UserRole.POWER_OPERATOR, UserRole.ADMIN, UserRole.ZONE_MANAGER),
  async (req: any, res, next) => {
    try {
      const { reason } = cancelTicketSchema.parse(req.body);
      const result = await outageService.transitionTicket(
        req.params.id,
        OutageStatus.CANCELLED,
        req.user.sub,
        reason
      );
      return successResponse(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// 5. POST /api/v1/outages/:id/assign - Manual technician assignment
outagesRouter.post(
  ['/outages/:id/assign', '/v1/outages/:id/assign'],
  authenticateUser,
  requireRoles(UserRole.POWER_OPERATOR, UserRole.ADMIN, UserRole.ZONE_MANAGER),
  async (req: any, res, next) => {
    try {
      const { technicianId } = assignTechnicianSchema.parse(req.body);
      const result = await outageService.assignTechnician(
        req.params.id,
        technicianId,
        req.user.sub
      );
      return successResponse(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// 6. POST /api/v1/outages/:id/auto-assign - Deterministic least-busy auto-assignment
outagesRouter.post(
  ['/outages/:id/auto-assign', '/v1/outages/:id/auto-assign'],
  authenticateUser,
  requireRoles(UserRole.POWER_OPERATOR, UserRole.ADMIN, UserRole.ZONE_MANAGER),
  async (req: any, res, next) => {
    try {
      const result = await outageService.autoAssignTechnician(req.params.id, req.user.sub);
      return successResponse(res, result);
    } catch (err) {
      next(err);
    }
  }
);
