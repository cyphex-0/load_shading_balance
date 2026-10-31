import { Router, Response, NextFunction } from 'express';
import {
  infrastructureRequestSchema,
  assignTechnicianSchema,
  zoneManagerFeedersQuerySchema,
  zoneManagerTicketsQuerySchema,
  zoneManagerTechniciansQuerySchema,
  feederFailureRateQuerySchema,
  mttrQuerySchema,
  dailyDeficitQuerySchema,
  listInfrastructureRequestsQuerySchema,
  UserRole
} from '@load-shedding/shared';
import { store } from '../db/store';
import { authenticateUser, requireRoles } from '../middleware/auth';
import {
  successResponse,
  paginatedResponse,
  AppError,
  NotFoundError,
  BadRequestError
} from '../utils/response';
import { managerService } from '../services/manager.service';

export const managerRouter = Router();

const mgrAuth = [authenticateUser, requireRoles(UserRole.ZONE_MANAGER, UserRole.ADMIN)];

/**
 * Resolves the operational zoneId for the caller.
 * - Zone Managers are strictly bound to their assigned zoneId.
 * - Admins can target any zone via query parameter ?zoneId=, falling back to their own assignedZoneId.
 */
const resolveZoneId = (req: any): string => {
  if (req.user.role === UserRole.ADMIN) {
    if (req.query.zoneId) {
      return req.query.zoneId as string;
    }
    if (req.user.zoneId) {
      return req.user.zoneId;
    }
    // Default to first active zone in system for Admin convenience if unspecified
    const firstZone = Array.from(store.zones.values()).find((z) => !z.deletedAt);
    if (firstZone) return firstZone.id;
    throw new BadRequestError('No zone configured in system', 'ZONE_NOT_FOUND');
  }

  if (!req.user.zoneId) {
    throw new BadRequestError('Zone Manager has no assigned zone', 'ZONE_NOT_ASSIGNED');
  }

  return req.user.zoneId;
};

// ============================================================================
// Endpoint 44: GET /api/v1/zone-managers/me/feeders (SCADA Grid Table)
// ============================================================================
const handleManagerGridFeeders = (req: any, res: Response, next: NextFunction) => {
  try {
    const zoneId = resolveZoneId(req);
    const query = zoneManagerFeedersQuerySchema.parse(req.query);
    const result = managerService.getZoneFeeders(zoneId, query);

    return successResponse(res, result.overview);
  } catch (err) {
    next(err);
  }
};

managerRouter.get(
  [
    '/zone-managers/me/feeders',
    '/v1/zone-managers/me/feeders',
    '/zone-managers/me/dashboard',
    '/v1/manager/grid'
  ],
  mgrAuth,
  handleManagerGridFeeders
);

// ============================================================================
// Endpoint 45: GET /api/v1/zone-managers/me/tickets (District Outages)
// ============================================================================
const handleManagerTickets = (req: any, res: Response, next: NextFunction) => {
  try {
    const zoneId = resolveZoneId(req);
    const query = zoneManagerTicketsQuerySchema.parse(req.query);
    const result = managerService.getZoneTickets(zoneId, query);

    if (req.query.page || req.query.pageSize) {
      return paginatedResponse(res, result.items, result.total, result.page, result.pageSize);
    }
    return successResponse(res, result.items);
  } catch (err) {
    next(err);
  }
};

managerRouter.get(
  ['/zone-managers/me/tickets', '/v1/zone-managers/me/tickets', '/v1/manager/outages'],
  mgrAuth,
  handleManagerTickets
);

// ============================================================================
// Endpoint 46: GET /api/v1/zone-managers/me/technicians (Technician Roster)
// ============================================================================
const handleManagerTechnicians = (req: any, res: Response, next: NextFunction) => {
  try {
    const zoneId = resolveZoneId(req);
    const query = zoneManagerTechniciansQuerySchema.parse(req.query);
    const roster = managerService.getZoneTechnicians(zoneId, query);

    return successResponse(res, roster);
  } catch (err) {
    next(err);
  }
};

managerRouter.get(
  ['/zone-managers/me/technicians', '/v1/zone-managers/me/technicians', '/v1/manager/technicians'],
  mgrAuth,
  handleManagerTechnicians
);

// ============================================================================
// Endpoint 47: GET /api/v1/zone-managers/me/analytics/feeder-failure-rate
// ============================================================================
const handleFeederFailureRate = (req: any, res: Response, next: NextFunction) => {
  try {
    const zoneId = resolveZoneId(req);
    const query = feederFailureRateQuerySchema.parse(req.query);
    const ranking = managerService.getFeederFailureRate(zoneId, query);

    return successResponse(res, ranking);
  } catch (err) {
    next(err);
  }
};

managerRouter.get(
  [
    '/zone-managers/me/analytics/feeder-failure-rate',
    '/v1/zone-managers/me/analytics/feeder-failure-rate',
    '/v1/manager/analytics/feeder-failure-rate'
  ],
  mgrAuth,
  handleFeederFailureRate
);

// ============================================================================
// Endpoint 48: GET /api/v1/zone-managers/me/analytics/mttr
// ============================================================================
const handleMttrAnalytics = (req: any, res: Response, next: NextFunction) => {
  try {
    const zoneId = resolveZoneId(req);
    const query = mttrQuerySchema.parse(req.query);
    const result = managerService.getMttrAnalytics(zoneId, query);

    return successResponse(res, result);
  } catch (err) {
    next(err);
  }
};

managerRouter.get(
  [
    '/zone-managers/me/analytics/mttr',
    '/v1/zone-managers/me/analytics/mttr',
    '/v1/manager/analytics/mttr'
  ],
  mgrAuth,
  handleMttrAnalytics
);

// Legacy alias returning flat array of technicians
managerRouter.get(
  ['/zone-managers/me/analytics/avg-resolution-time', '/v1/zone-managers/me/analytics/avg-resolution-time'],
  mgrAuth,
  (req: any, res: Response, next: NextFunction) => {
    try {
      const zoneId = resolveZoneId(req);
      const query = mttrQuerySchema.parse(req.query);
      const result = managerService.getMttrAnalytics(zoneId, query);

      return successResponse(res, result.technicians);
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================================
// Endpoint 49: GET /api/v1/zone-managers/me/analytics/daily-deficit
// ============================================================================
const handleDailyDeficit = (req: any, res: Response, next: NextFunction) => {
  try {
    const zoneId = resolveZoneId(req);
    const query = dailyDeficitQuerySchema.parse(req.query);
    const result = managerService.getDailyDeficitAnalytics(zoneId, query);

    return successResponse(res, result);
  } catch (err) {
    next(err);
  }
};

managerRouter.get(
  [
    '/zone-managers/me/analytics/daily-deficit',
    '/v1/zone-managers/me/analytics/daily-deficit',
    '/v1/manager/analytics/daily-deficit'
  ],
  mgrAuth,
  handleDailyDeficit
);

// ============================================================================
// Endpoint 50: POST /api/v1/infrastructure-requests (Upgrade Request Submission)
// ============================================================================
const handleCreateUpgradeRequest = (req: any, res: Response, next: NextFunction) => {
  try {
    const data = infrastructureRequestSchema.parse(req.body);
    const isGlobalAdmin = req.user.role === UserRole.ADMIN;

    const request = managerService.createInfrastructureRequest(
      req.user.sub,
      data,
      req.user.zoneId,
      isGlobalAdmin
    );

    return successResponse(res, request, 201);
  } catch (err) {
    next(err);
  }
};

managerRouter.post(
  ['/infrastructure-requests', '/v1/infrastructure-requests', '/v1/manager/upgrade-requests'],
  mgrAuth,
  handleCreateUpgradeRequest
);

// ============================================================================
// Endpoint 51: GET /api/v1/infrastructure-requests (List Upgrade Requests)
// ============================================================================
const handleListUpgradeRequests = (req: any, res: Response, next: NextFunction) => {
  try {
    const isGlobalAdmin = req.user.role === UserRole.ADMIN;
    const query = listInfrastructureRequestsQuerySchema.parse(req.query);
    const result = managerService.listInfrastructureRequests(
      req.user.zoneId,
      isGlobalAdmin,
      query
    );

    if (req.query.page || req.query.pageSize) {
      return paginatedResponse(res, result.items, result.total, result.page, result.pageSize);
    }
    return successResponse(res, result.items);
  } catch (err) {
    next(err);
  }
};

managerRouter.get(
  ['/infrastructure-requests', '/v1/infrastructure-requests', '/v1/manager/upgrade-requests'],
  mgrAuth,
  handleListUpgradeRequests
);

// ============================================================================
// Legacy Endpoint: PATCH /api/v1/manager/outages/:id/assignment
// ============================================================================
managerRouter.patch(
  ['/v1/manager/outages/:id/assignment', '/zone-managers/me/outages/:id/assignment'],
  mgrAuth,
  (req: any, res: Response, next: NextFunction) => {
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
  }
);
