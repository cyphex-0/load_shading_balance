import { Router } from 'express';
import { linkMeterSchema, reportOutageSchema, UserRole } from '@load-shedding/shared';
import { store, CustomerMeterRecord } from '../db/store';
import { authenticateUser, requireRoles } from '../middleware/auth';
import { successResponse, AppError, NotFoundError, ConflictError, BadRequestError } from '../utils/response';
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

// Endpoint 21: POST /api/customers/me/meters (and /api/v1/customers/me/location)
const handleLinkMeter = (req: any, res: any, next: any) => {
  try {
    const data = linkMeterSchema.parse(req.body);

    // Find meter by number
    const meter = Array.from(store.meters.values()).find(
      (m) => m.meterNumber.toLowerCase() === data.meterNumber.toLowerCase() && !m.deletedAt
    );
    if (!meter) {
      throw new NotFoundError('Meter number not registered in grid database', 'METER_NOT_FOUND');
    }

    // Check if meter is actively linked across ANY customer account (exclusive physical binding)
    const existing = Array.from(store.customerMeters.values()).find(
      (cm) => cm.meterId === meter.id && !cm.unlinkedAt
    );
    if (existing) {
      throw new ConflictError('Meter is already linked to an account', 'METER_ALREADY_LINKED');
    }

    // Determine primary status: explicit preference or first meter defaults to primary
    const currentMeters = Array.from(store.customerMeters.values()).filter(
      (cm) => cm.customerId === req.user.sub && !cm.unlinkedAt
    );
    const isPrimary = data.isPrimary ?? (currentMeters.length === 0);

    // If marked as primary, demote any existing primary meter for this customer
    if (isPrimary && currentMeters.length > 0) {
      for (const cm of currentMeters) {
        if (cm.isPrimary) {
          cm.isPrimary = false;
        }
      }
    }

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
        nickname: newLink.nickname,
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

// Endpoint 23: DELETE /api/customers/me/meters/:id
customerRouter.delete('/customers/me/meters/:id', custAuth, (req: any, res) => {
  const link = store.customerMeters.get(req.params.id);
  if (!link || link.customerId !== req.user.sub || link.unlinkedAt) {
    throw new NotFoundError('Meter link not found', 'LINK_NOT_FOUND');
  }

  const wasPrimary = link.isPrimary;
  link.unlinkedAt = new Date().toISOString();
  link.isPrimary = false;

  // Auto-promote oldest remaining active meter to primary
  if (wasPrimary) {
    const remaining = Array.from(store.customerMeters.values())
      .filter((cm) => cm.customerId === req.user.sub && !cm.unlinkedAt)
      .sort((a, b) => new Date(a.linkedAt).getTime() - new Date(b.linkedAt).getTime());
    if (remaining.length > 0) {
      remaining[0].isPrimary = true;
    }
  }

  return successResponse(res, { message: 'Meter unlinked successfully' });
});

// Endpoint 24: GET /api/customers/me/meters/:id/status (Specific Meter Live Status)
customerRouter.get('/customers/me/meters/:id/status', custAuth, (req: any, res) => {
  const link = store.customerMeters.get(req.params.id);
  if (!link || link.customerId !== req.user.sub || link.unlinkedAt) {
    throw new NotFoundError('Meter link not found', 'LINK_NOT_FOUND');
  }

  const meter = store.meters.get(link.meterId);
  if (!meter || meter.deletedAt) {
    throw new NotFoundError('Meter not found in grid database', 'METER_NOT_FOUND');
  }

  const feeder = store.feeders.get(meter.feederId);
  const sub = feeder ? store.substations.get(feeder.substationId) : null;
  const zone = sub ? store.zones.get(sub.zoneId) : null;

  return successResponse(res, {
    linkId: link.id,
    meterId: meter.id,
    meterNumber: meter.meterNumber,
    address: meter.address,
    isPrimary: link.isPrimary,
    nickname: link.nickname,
    feederId: feeder?.id || null,
    feederName: feeder?.name || 'Unknown Feeder',
    feederCode: feeder?.code || 'UNK',
    status: feeder?.status || 'ONLINE',
    isCritical: feeder?.isCritical || false,
    substationName: sub?.name || null,
    zoneName: zone?.name || null,
    updatedAt: feeder?.updatedAt || new Date().toISOString()
  });
});

// Endpoint 25: GET /api/customers/me/meters/:id/schedules (Specific Meter Upcoming Schedules)
customerRouter.get('/customers/me/meters/:id/schedules', custAuth, (req: any, res) => {
  const link = store.customerMeters.get(req.params.id);
  if (!link || link.customerId !== req.user.sub || link.unlinkedAt) {
    throw new NotFoundError('Meter link not found', 'LINK_NOT_FOUND');
  }

  const meter = store.meters.get(link.meterId);
  if (!meter || meter.deletedAt) {
    throw new NotFoundError('Meter not found in grid database', 'METER_NOT_FOUND');
  }

  const feeder = store.feeders.get(meter.feederId);
  if (!feeder) {
    return successResponse(res, []);
  }

  // Find published schedule slots covering this meter's feeder
  const publishedSchedules = Array.from(store.schedules.values()).filter(
    (s) => s.status === 'PUBLISHED'
  );

  const relevantSlots: any[] = [];
  for (const sched of publishedSchedules) {
    const assignments = Array.from(store.scheduleFeederAssignments.values()).filter(
      (a) => a.feederId === feeder.id
    );
    for (const asg of assignments) {
      const slot = store.scheduleSlots.get(asg.slotId);
      if (slot && slot.scheduleId === sched.id) {
        relevantSlots.push({
          scheduleId: sched.id,
          planningDate: sched.planningDate,
          slotId: slot.id,
          startTime: slot.startTime,
          endTime: slot.endTime,
          feederId: feeder.id,
          feederName: feeder.name
        });
      }
    }
  }

  return successResponse(res, relevantSlots);
});

// Designate Primary Meter: PATCH /api/customers/me/meters/:id/primary
customerRouter.patch('/customers/me/meters/:id/primary', custAuth, (req: any, res) => {
  const link = store.customerMeters.get(req.params.id);
  if (!link || link.customerId !== req.user.sub || link.unlinkedAt) {
    throw new NotFoundError('Meter link not found', 'LINK_NOT_FOUND');
  }

  // Demote existing primary meters
  for (const cm of store.customerMeters.values()) {
    if (cm.customerId === req.user.sub && !cm.unlinkedAt && cm.isPrimary) {
      cm.isPrimary = false;
    }
  }

  link.isPrimary = true;
  return successResponse(res, {
    id: link.id,
    meterId: link.meterId,
    isPrimary: link.isPrimary,
    message: 'Meter set as primary successfully'
  });
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
    throw new NotFoundError('Outage ticket not found', 'TICKET_NOT_FOUND');
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
