import { Router } from 'express';
import { linkMeterSchema, reportOutageSchema, UserRole } from '@load-shedding/shared';
import { store, CustomerMeterRecord } from '../db/store';
import { authenticateUser, requireRoles } from '../middleware/auth';
import { successResponse, AppError } from '../utils/response';
import { conflictResolutionService } from '../services/conflict.service';
import { cacheService } from '../services/cache.service';

export const customerRouter = Router();

const custAuth = [authenticateUser];

// Helper to get primary meter and its feeder
const getCustomerPrimaryMeter = (customerId: string) => {
  const links = Array.from(store.customerMeters.values()).filter(
    (cm) => cm.customerId === customerId && !cm.unlinkedAt
  );
  if (links.length === 0) return null;
  const primary = links.find((l) => l.isPrimary) || links[0];
  const meter = store.meters.get(primary.meterId);
  if (!meter) return null;
  const feeder = store.feeders.get(meter.feederId);
  const substation = feeder ? store.substations.get(feeder.substationId) : null;
  const zone = substation ? store.zones.get(substation.zoneId) : null;

  return {
    link: primary,
    meter,
    feeder,
    substation,
    zone
  };
};

// Endpoint 21: GET /api/customers/me/dashboard
customerRouter.get('/customers/me/dashboard', custAuth, (req: any, res) => {
  const context = getCustomerPrimaryMeter(req.user.sub);

  const activeReports = Array.from(store.outageTickets.values())
    .filter((t) => t.customerId === req.user.sub && t.status !== 'RESOLVED' && t.status !== 'CANCELLED')
    .sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime());

  const recentNotifications = Array.from(store.notifications.values())
    .filter((n) => n.userId === req.user.sub)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return successResponse(res, {
    customer: {
      id: req.user.sub,
      name: req.user.name,
      email: req.user.email
    },
    primaryMeter: context
      ? {
          id: context.meter.id,
          meterNumber: context.meter.meterNumber,
          address: context.meter.address,
          feeder: context.feeder
            ? {
                id: context.feeder.id,
                name: context.feeder.name,
                code: context.feeder.code,
                status: context.feeder.status,
                isCritical: context.feeder.isCritical
              }
            : null,
          substationName: context.substation?.name,
          zoneName: context.zone?.name
        }
      : null,
    activeOutages: activeReports,
    recentNotifications
  });
});

// Endpoint 22: GET /api/customers/me/status
customerRouter.get('/customers/me/status', custAuth, (req: any, res) => {
  const context = getCustomerPrimaryMeter(req.user.sub);
  if (!context || !context.feeder) {
    return successResponse(res, {
      hasMeter: false,
      status: 'ONLINE',
      message: 'No active meter linked to your account'
    });
  }

  return successResponse(res, {
    hasMeter: true,
    meterNumber: context.meter.meterNumber,
    feederId: context.feeder.id,
    feederName: context.feeder.name,
    status: context.feeder.status, // ONLINE, PLANNED_OUTAGE, UNEXPECTED_FAULT
    updatedAt: context.feeder.updatedAt
  });
});

// Endpoint 23: GET /api/customers/me/schedule (and /api/v1/schedules/my)
const handleGetCustomerSchedule = async (req: any, res: any) => {
  const context = getCustomerPrimaryMeter(req.user.sub);
  if (!context || !context.feeder) {
    return successResponse(res, { schedules: [] });
  }

  const feederId = context.feeder.id;
  const today = new Date().toISOString().split('T')[0];
  const cacheKey = cacheService.getScheduleKey(feederId, today);
  const cached = await cacheService.get(cacheKey);

  // Collect published schedule slots for this feeder
  const publishedSlots: any[] = [];
  for (const sched of store.schedules.values()) {
    if (sched.status === 'PUBLISHED') {
      for (const slot of store.scheduleSlots.values()) {
        if (slot.scheduleId === sched.id) {
          const isAssigned = Array.from(store.scheduleFeederAssignments.values()).some(
            (a) => a.slotId === slot.id && a.feederId === feederId
          );
          if (isAssigned) {
            publishedSlots.push({
              scheduleId: sched.id,
              planningDate: sched.planningDate,
              startTime: slot.startTime,
              endTime: slot.endTime,
              status: sched.status
            });
          }
        }
      }
    }
  }

  return successResponse(res, {
    meterNumber: context.meter.meterNumber,
    feederName: context.feeder.name,
    cached: !!cached,
    schedules: publishedSlots
  });
};

customerRouter.get('/customers/me/schedule', custAuth, handleGetCustomerSchedule);
customerRouter.get('/v1/schedules/my', custAuth, handleGetCustomerSchedule);

// Endpoint 24: GET /api/customers/me/meters
customerRouter.get('/customers/me/meters', custAuth, (req: any, res) => {
  const links = Array.from(store.customerMeters.values()).filter(
    (cm) => cm.customerId === req.user.sub && !cm.unlinkedAt
  );

  const meters = links.map((link) => {
    const meter = store.meters.get(link.meterId);
    const feeder = meter ? store.feeders.get(meter.feederId) : null;
    const sub = feeder ? store.substations.get(feeder.substationId) : null;
    const zone = sub ? store.zones.get(sub.zoneId) : null;

    return {
      id: link.id,
      meterId: meter?.id,
      meterNumber: meter?.meterNumber || 'Unknown',
      address: meter?.address || '',
      isPrimary: link.isPrimary,
      nickname: link.nickname,
      linkedAt: link.linkedAt,
      feeder: feeder
        ? {
            id: feeder.id,
            name: feeder.name,
            code: feeder.code,
            status: feeder.status
          }
        : null,
      substationName: sub?.name,
      zoneName: zone?.name
    };
  });

  return successResponse(res, meters);
});

// Endpoint 25: POST /api/customers/me/meters (and /api/v1/customers/me/location)
const handleLinkMeter = (req: any, res: any, next: any) => {
  try {
    const data = linkMeterSchema.parse(req.body);

    // Find meter by number
    const meter = Array.from(store.meters.values()).find(
      (m) => m.meterNumber.toLowerCase() === data.meterNumber.toLowerCase() && !m.deletedAt
    );
    if (!meter) {
      throw new AppError('Meter number not registered in grid database', 404, 'METER_NOT_FOUND');
    }

    // Check if already linked to this customer
    const existing = Array.from(store.customerMeters.values()).find(
      (cm) => cm.customerId === req.user.sub && cm.meterId === meter.id && !cm.unlinkedAt
    );
    if (existing) {
      throw new AppError('Meter is already linked to your account', 400, 'METER_ALREADY_LINKED');
    }

    // Determine if this is the first meter (make it primary)
    const currentMeters = Array.from(store.customerMeters.values()).filter(
      (cm) => cm.customerId === req.user.sub && !cm.unlinkedAt
    );
    const isPrimary = currentMeters.length === 0;

    const linkId = `cm_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const newLink: CustomerMeterRecord = {
      id: linkId,
      customerId: req.user.sub,
      meterId: meter.id,
      isPrimary,
      nickname: data.nickname || (isPrimary ? 'Primary Residence' : 'Meter'),
      linkedAt: new Date().toISOString()
    };
    store.customerMeters.set(linkId, newLink);

    return successResponse(
      res,
      {
        id: newLink.id,
        meterId: meter.id,
        meterNumber: meter.meterNumber,
        address: meter.address,
        isPrimary: newLink.isPrimary,
        linkedAt: newLink.linkedAt
      },
      201
    );
  } catch (err) {
    next(err);
  }
};

customerRouter.post('/customers/me/meters', custAuth, handleLinkMeter);
customerRouter.patch('/v1/customers/me/location', custAuth, handleLinkMeter);

// Endpoint 26: DELETE /api/customers/me/meters/:id
customerRouter.delete('/customers/me/meters/:id', custAuth, (req: any, res) => {
  const link = store.customerMeters.get(req.params.id);
  if (!link || link.customerId !== req.user.sub || link.unlinkedAt) {
    throw new AppError('Meter link not found', 404, 'LINK_NOT_FOUND');
  }

  link.unlinkedAt = new Date().toISOString();
  return successResponse(res, { message: 'Meter unlinked successfully' });
});

// Endpoint 27: POST /api/customers/me/outage-reports (Smart Conflict Resolution)
customerRouter.post('/customers/me/outage-reports', custAuth, async (req: any, res, next) => {
  try {
    const data = reportOutageSchema.parse(req.body);
    const result = await conflictResolutionService.evaluateAndReportOutage(
      req.user.sub,
      data.meterId,
      data.description,
      data.landmark
    );

    return successResponse(res, result, result.ticketCreated ? 201 : 200);
  } catch (err) {
    next(err);
  }
});

// Endpoint 28: GET /api/customers/me/outage-reports
customerRouter.get('/customers/me/outage-reports', custAuth, (req: any, res) => {
  const reports = Array.from(store.outageTickets.values())
    .filter((t) => t.customerId === req.user.sub)
    .sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime())
    .map((t) => {
      const feeder = store.feeders.get(t.feederId);
      const meter = store.meters.get(t.meterId);
      return {
        ...t,
        feederName: feeder?.name || 'Unknown',
        meterNumber: meter?.meterNumber || 'Unknown'
      };
    });

  return successResponse(res, reports);
});

// Endpoint 29: GET /api/customers/me/outage-reports/:id
customerRouter.get('/customers/me/outage-reports/:id', custAuth, (req: any, res) => {
  const ticket = store.outageTickets.get(req.params.id);
  if (!ticket || ticket.customerId !== req.user.sub) {
    throw new AppError('Outage ticket not found', 404, 'TICKET_NOT_FOUND');
  }

  const feeder = store.feeders.get(ticket.feederId);
  const meter = store.meters.get(ticket.meterId);
  const sub = feeder ? store.substations.get(feeder.substationId) : null;
  const zone = sub ? store.zones.get(sub.zoneId) : null;

  const history = Array.from(store.outageStatusHistories.values()).filter(
    (h) => h.ticketId === ticket.id
  );

  return successResponse(res, {
    ...ticket,
    feederName: feeder?.name,
    meterNumber: meter?.meterNumber,
    address: meter?.address,
    substationName: sub?.name,
    zoneName: zone?.name,
    history
  });
});
