import { Router } from 'express';
import bcrypt from 'bcryptjs';
import {
  createZoneSchema,
  updateZoneSchema,
  createSubstationSchema,
  updateSubstationSchema,
  createFeederSchema,
  updateFeederSchema,
  toggleCriticalSchema,
  createMeterSchema,
  provisionUserSchema,
  updateUserAdminSchema,
  updateUserRoleSchema,
  updateUserStatusSchema,
  reviewInfrastructureRequestSchema,
  UserRole,
  UserStatus
} from '@load-shedding/shared';
import {
  store,
  ZoneRecord,
  SubstationRecord,
  FeederRecord,
  MeterRecord,
  UserRecord,
  AuditLogRecord
} from '../db/store';
import { authenticateUser, requireRoles } from '../middleware/auth';
import {
  successResponse,
  paginatedResponse,
  AppError,
  NotFoundError,
  BadRequestError,
  ConflictError
} from '../utils/response';
import { toSafeUser } from '../db/helpers';

export const adminRouter = Router();

// Guard admin routes strictly to ADMIN
adminRouter.use('/admin', authenticateUser, requireRoles(UserRole.ADMIN));
adminRouter.use('/v1/admin', authenticateUser, requireRoles(UserRole.ADMIN));
adminRouter.use('/infrastructure-requests/:id/status', authenticateUser, requireRoles(UserRole.ADMIN));

const logAudit = (actorId: string, action: string, entity: string, entityId?: string, details?: any) => {
  const auditId = `aud_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const record: AuditLogRecord = {
    id: auditId,
    actorId,
    action,
    entity,
    entityId: entityId || null,
    details: details || null,
    createdAt: new Date().toISOString()
  };
  store.auditLogs.set(auditId, record);
};

// ==========================================
// 1. ZONE MANAGEMENT (Endpoints 59 - 63)
// ==========================================

// Endpoint 59: POST /api/admin/zones
adminRouter.post('/admin/zones', (req: any, res, next) => {
  try {
    const data = createZoneSchema.parse(req.body);
    const existing = Array.from(store.zones.values()).find(
      (z) => (z.name.toLowerCase() === data.name.toLowerCase() || z.code.toUpperCase() === data.code.toUpperCase()) && !z.deletedAt
    );
    if (existing) throw new ConflictError('Zone with this name or code already exists', 'ZONE_EXISTS');

    const id = `zn_${Date.now()}`;
    const now = new Date().toISOString();
    const zone: ZoneRecord = {
      id,
      name: data.name,
      code: data.code.toUpperCase(),
      description: data.description || null,
      createdAt: now,
      updatedAt: now
    };
    store.zones.set(id, zone);
    logAudit(req.user.sub, 'CREATE_ZONE', 'Zone', id, { name: data.name, code: data.code });

    return successResponse(res, zone, 201);
  } catch (err) {
    next(err);
  }
});

// Endpoint 60: GET /api/admin/zones
adminRouter.get('/admin/zones', (req, res) => {
  let zones = Array.from(store.zones.values())
    .filter((z) => !z.deletedAt)
    .map((z) => {
      const subs = Array.from(store.substations.values()).filter((s) => s.zoneId === z.id && !s.deletedAt);
      return {
        ...z,
        substationsCount: subs.length
      };
    });

  if (req.query.search) {
    const q = (req.query.search as string).toLowerCase();
    zones = zones.filter((z) => z.name.toLowerCase().includes(q) || z.code.toLowerCase().includes(q));
  }

  if (req.query.page || req.query.pageSize) {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const pageSize = Math.max(1, parseInt(req.query.pageSize as string, 10) || 20);
    const paginated = zones.slice((page - 1) * pageSize, page * pageSize);
    return paginatedResponse(res, paginated, zones.length, page, pageSize);
  }

  return successResponse(res, zones);
});

// Endpoint 61: GET /api/admin/zones/:id
adminRouter.get('/admin/zones/:id', (req, res) => {
  const zone = store.zones.get(req.params.id);
  if (!zone || zone.deletedAt) throw new NotFoundError('Zone not found', 'ZONE_NOT_FOUND');

  const activeSubs = Array.from(store.substations.values())
    .filter((s) => s.zoneId === zone.id && !s.deletedAt)
    .map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      capacityMW: s.capacityMW
    }));

  return successResponse(res, {
    ...zone,
    substationsCount: activeSubs.length,
    substations: activeSubs
  });
});

// Endpoint 62: PATCH /api/admin/zones/:id
adminRouter.patch('/admin/zones/:id', (req: any, res, next) => {
  try {
    const data = updateZoneSchema.parse(req.body);
    const zone = store.zones.get(req.params.id);
    if (!zone || zone.deletedAt) throw new NotFoundError('Zone not found', 'ZONE_NOT_FOUND');

    if (data.name || data.code) {
      const collision = Array.from(store.zones.values()).find(
        (z) =>
          z.id !== zone.id &&
          !z.deletedAt &&
          ((data.name && z.name.toLowerCase() === data.name.toLowerCase()) ||
            (data.code && z.code.toUpperCase() === data.code.toUpperCase()))
      );
      if (collision) throw new ConflictError('Zone with this name or code already exists', 'ZONE_EXISTS');
    }

    if (data.name) zone.name = data.name;
    if (data.code) zone.code = data.code.toUpperCase();
    if (data.description !== undefined) zone.description = data.description;
    zone.updatedAt = new Date().toISOString();

    logAudit(req.user.sub, 'UPDATE_ZONE', 'Zone', zone.id, data);
    return successResponse(res, zone);
  } catch (err) {
    next(err);
  }
});

// Endpoint 63: DELETE /api/admin/zones/:id
adminRouter.delete('/admin/zones/:id', (req: any, res) => {
  const zone = store.zones.get(req.params.id);
  if (!zone || zone.deletedAt) throw new NotFoundError('Zone not found', 'ZONE_NOT_FOUND');

  // Referential Integrity: Block deletion if active substations exist
  const activeSubs = Array.from(store.substations.values()).filter((s) => s.zoneId === zone.id && !s.deletedAt);
  if (activeSubs.length > 0) {
    throw new BadRequestError('Cannot delete zone with active substations. Reassign or remove substations first.', 'ACTIVE_SUBSTATIONS_EXIST');
  }

  zone.deletedAt = new Date().toISOString();
  logAudit(req.user.sub, 'SOFT_DELETE_ZONE', 'Zone', zone.id);
  return successResponse(res, { message: 'Zone deleted successfully' });
});

// ==========================================
// 2. SUBSTATION MANAGEMENT (Endpoints 64 - 68)
// ==========================================

// Endpoint 64: POST /api/admin/substations
adminRouter.post('/admin/substations', (req: any, res, next) => {
  try {
    const data = createSubstationSchema.parse(req.body);
    const zone = store.zones.get(data.zoneId);
    if (!zone || zone.deletedAt) throw new NotFoundError('Zone not found', 'ZONE_NOT_FOUND');

    const existing = Array.from(store.substations.values()).find(
      (s) => s.code.toUpperCase() === data.code.toUpperCase() && !s.deletedAt
    );
    if (existing) throw new ConflictError('Substation code already exists', 'SUBSTATION_EXISTS');

    const id = `sub_${Date.now()}`;
    const now = new Date().toISOString();
    const substation: SubstationRecord = {
      id,
      name: data.name,
      code: data.code.toUpperCase(),
      zoneId: data.zoneId,
      capacityMW: data.capacityMW,
      createdAt: now,
      updatedAt: now
    };
    store.substations.set(id, substation);
    logAudit(req.user.sub, 'CREATE_SUBSTATION', 'Substation', id, data);

    return successResponse(res, substation, 201);
  } catch (err) {
    next(err);
  }
});

// Endpoint 65: GET /api/admin/substations
adminRouter.get('/admin/substations', (req, res) => {
  const zoneId = req.query.zoneId as string;
  let subs = Array.from(store.substations.values()).filter((s) => !s.deletedAt);

  if (zoneId) {
    subs = subs.filter((s) => s.zoneId === zoneId);
  }

  if (req.query.search) {
    const q = (req.query.search as string).toLowerCase();
    subs = subs.filter((s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q));
  }

  const enriched = subs.map((s) => {
    const z = store.zones.get(s.zoneId);
    const feeders = Array.from(store.feeders.values()).filter((f) => f.substationId === s.id && !f.deletedAt);
    return {
      ...s,
      zone: z && !z.deletedAt ? { id: z.id, name: z.name, code: z.code } : null,
      feedersCount: feeders.length
    };
  });

  if (req.query.page || req.query.pageSize) {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const pageSize = Math.max(1, parseInt(req.query.pageSize as string, 10) || 20);
    const paginated = enriched.slice((page - 1) * pageSize, page * pageSize);
    return paginatedResponse(res, paginated, enriched.length, page, pageSize);
  }

  return successResponse(res, enriched);
});

// Endpoint 66: GET /api/admin/substations/:id
adminRouter.get('/admin/substations/:id', (req, res) => {
  const sub = store.substations.get(req.params.id);
  if (!sub || sub.deletedAt) throw new NotFoundError('Substation not found', 'SUBSTATION_NOT_FOUND');

  const z = store.zones.get(sub.zoneId);
  const activeFeeders = Array.from(store.feeders.values())
    .filter((f) => f.substationId === sub.id && !f.deletedAt)
    .map((f) => ({
      id: f.id,
      name: f.name,
      code: f.code,
      capacityMW: f.capacityMW,
      isCritical: f.isCritical,
      status: f.status
    }));

  return successResponse(res, {
    ...sub,
    zone: z && !z.deletedAt ? { id: z.id, name: z.name, code: z.code } : null,
    feedersCount: activeFeeders.length,
    feeders: activeFeeders
  });
});

// Endpoint 67: PATCH /api/admin/substations/:id
adminRouter.patch('/admin/substations/:id', (req: any, res, next) => {
  try {
    const data = updateSubstationSchema.parse(req.body);
    const sub = store.substations.get(req.params.id);
    if (!sub || sub.deletedAt) throw new NotFoundError('Substation not found', 'SUBSTATION_NOT_FOUND');

    if (data.zoneId) {
      const targetZone = store.zones.get(data.zoneId);
      if (!targetZone || targetZone.deletedAt) {
        throw new NotFoundError('Zone not found', 'ZONE_NOT_FOUND');
      }
    }

    if (data.code && data.code.toUpperCase() !== sub.code) {
      const collision = Array.from(store.substations.values()).find(
        (s) => s.id !== sub.id && !s.deletedAt && s.code.toUpperCase() === data.code!.toUpperCase()
      );
      if (collision) throw new ConflictError('Substation code already exists', 'SUBSTATION_EXISTS');
    }

    if (data.name) sub.name = data.name;
    if (data.code) sub.code = data.code.toUpperCase();
    if (data.capacityMW !== undefined) sub.capacityMW = data.capacityMW;
    if (data.zoneId) sub.zoneId = data.zoneId;
    sub.updatedAt = new Date().toISOString();

    logAudit(req.user.sub, 'UPDATE_SUBSTATION', 'Substation', sub.id, data);
    return successResponse(res, sub);
  } catch (err) {
    next(err);
  }
});

// Endpoint 68: DELETE /api/admin/substations/:id
adminRouter.delete('/admin/substations/:id', (req: any, res) => {
  const sub = store.substations.get(req.params.id);
  if (!sub || sub.deletedAt) throw new NotFoundError('Substation not found', 'SUBSTATION_NOT_FOUND');

  // Referential Integrity: Block deletion if active feeders exist
  const activeFeeders = Array.from(store.feeders.values()).filter((f) => f.substationId === sub.id && !f.deletedAt);
  if (activeFeeders.length > 0) {
    throw new BadRequestError('Cannot delete substation with active feeders. Reassign or remove feeders first.', 'ACTIVE_FEEDERS_EXIST');
  }

  sub.deletedAt = new Date().toISOString();
  logAudit(req.user.sub, 'SOFT_DELETE_SUBSTATION', 'Substation', sub.id);
  return successResponse(res, { message: 'Substation deleted successfully' });
});

// ==========================================
// 3. FEEDER MANAGEMENT (Endpoints 69 - 73)
// ==========================================

// Endpoint 69: POST /api/admin/feeders
adminRouter.post('/admin/feeders', (req: any, res, next) => {
  try {
    const data = createFeederSchema.parse(req.body);
    const sub = store.substations.get(data.substationId);
    if (!sub || sub.deletedAt) throw new NotFoundError('Substation not found', 'SUBSTATION_NOT_FOUND');

    const existing = Array.from(store.feeders.values()).find(
      (f) => f.code.toUpperCase() === data.code.toUpperCase() && !f.deletedAt
    );
    if (existing) throw new ConflictError('Feeder code already exists', 'FEEDER_EXISTS');

    const id = `fdr_${Date.now()}`;
    const now = new Date().toISOString();
    const feeder: FeederRecord = {
      id,
      name: data.name,
      code: data.code.toUpperCase(),
      substationId: data.substationId,
      capacityMW: data.capacityMW,
      isCritical: data.isCritical || false,
      status: 'ONLINE' as any,
      createdAt: now,
      updatedAt: now
    };
    store.feeders.set(id, feeder);
    logAudit(req.user.sub, 'CREATE_FEEDER', 'Feeder', id, data);

    return successResponse(res, feeder, 201);
  } catch (err) {
    next(err);
  }
});

// Endpoint 70: GET /api/admin/feeders
adminRouter.get('/admin/feeders', (req, res) => {
  const zoneId = req.query.zoneId as string;
  const substationId = req.query.substationId as string;
  const isCritical = req.query.isCritical !== undefined ? req.query.isCritical === 'true' : undefined;
  const status = req.query.status as string;

  let feeders = Array.from(store.feeders.values()).filter((f) => !f.deletedAt);

  if (zoneId) {
    feeders = feeders.filter((f) => {
      const sub = store.substations.get(f.substationId);
      return sub && sub.zoneId === zoneId;
    });
  }

  if (substationId) {
    feeders = feeders.filter((f) => f.substationId === substationId);
  }

  if (isCritical !== undefined) {
    feeders = feeders.filter((f) => f.isCritical === isCritical);
  }

  if (status) {
    feeders = feeders.filter((f) => f.status === status);
  }

  if (req.query.search) {
    const q = (req.query.search as string).toLowerCase();
    feeders = feeders.filter((f) => f.name.toLowerCase().includes(q) || f.code.toLowerCase().includes(q));
  }

  const enriched = feeders.map((f) => {
    const sub = store.substations.get(f.substationId);
    const z = sub ? store.zones.get(sub.zoneId) : null;
    const meters = Array.from(store.meters.values()).filter((m) => m.feederId === f.id && !m.deletedAt);
    return {
      ...f,
      substation: sub && !sub.deletedAt ? { id: sub.id, name: sub.name, code: sub.code } : null,
      zone: z && !z.deletedAt ? { id: z.id, name: z.name, code: z.code } : null,
      metersCount: meters.length
    };
  });

  if (req.query.page || req.query.pageSize) {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const pageSize = Math.max(1, parseInt(req.query.pageSize as string, 10) || 20);
    const paginated = enriched.slice((page - 1) * pageSize, page * pageSize);
    return paginatedResponse(res, paginated, enriched.length, page, pageSize);
  }

  return successResponse(res, enriched);
});

// Endpoint 71: GET /api/admin/feeders/:id
adminRouter.get('/admin/feeders/:id', (req, res) => {
  const f = store.feeders.get(req.params.id);
  if (!f || f.deletedAt) throw new NotFoundError('Feeder not found', 'FEEDER_NOT_FOUND');

  const sub = store.substations.get(f.substationId);
  const z = sub ? store.zones.get(sub.zoneId) : null;
  const meters = Array.from(store.meters.values()).filter((m) => m.feederId === f.id && !m.deletedAt);

  return successResponse(res, {
    ...f,
    substation: sub && !sub.deletedAt ? { id: sub.id, name: sub.name, code: sub.code } : null,
    zone: z && !z.deletedAt ? { id: z.id, name: z.name, code: z.code } : null,
    metersCount: meters.length
  });
});

// Endpoint 72: PATCH /api/admin/feeders/:id
adminRouter.patch('/admin/feeders/:id', (req: any, res, next) => {
  try {
    const data = updateFeederSchema.parse(req.body);
    const feeder = store.feeders.get(req.params.id);
    if (!feeder || feeder.deletedAt) throw new NotFoundError('Feeder not found', 'FEEDER_NOT_FOUND');

    if (data.code && data.code.toUpperCase() !== feeder.code) {
      const collision = Array.from(store.feeders.values()).find(
        (f) => f.id !== feeder.id && !f.deletedAt && f.code.toUpperCase() === data.code!.toUpperCase()
      );
      if (collision) throw new ConflictError('Feeder code already exists', 'FEEDER_EXISTS');
    }

    if (data.name) feeder.name = data.name;
    if (data.code) feeder.code = data.code.toUpperCase();
    if (data.capacityMW !== undefined) feeder.capacityMW = data.capacityMW;
    if (data.isCritical !== undefined) feeder.isCritical = data.isCritical;
    if (data.status) feeder.status = data.status;
    feeder.updatedAt = new Date().toISOString();

    logAudit(req.user.sub, 'UPDATE_FEEDER', 'Feeder', feeder.id, data);
    return successResponse(res, feeder);
  } catch (err) {
    next(err);
  }
});

// Endpoint 73: PATCH /api/v1/admin/feeders/:id/critical (Toggle Critical Status)
adminRouter.patch('/v1/admin/feeders/:id/critical', (req: any, res, next) => {
  try {
    const { isCritical } = toggleCriticalSchema.parse(req.body);
    const feeder = store.feeders.get(req.params.id);
    if (!feeder || feeder.deletedAt) throw new NotFoundError('Feeder not found', 'FEEDER_NOT_FOUND');

    feeder.isCritical = isCritical;
    feeder.updatedAt = new Date().toISOString();

    logAudit(req.user.sub, 'TOGGLE_CRITICAL_FEEDER', 'Feeder', feeder.id, { isCritical });
    return successResponse(res, feeder);
  } catch (err) {
    next(err);
  }
});

// Endpoint 74: DELETE /api/admin/feeders/:id
adminRouter.delete('/admin/feeders/:id', (req: any, res) => {
  const feeder = store.feeders.get(req.params.id);
  if (!feeder || feeder.deletedAt) throw new NotFoundError('Feeder not found', 'FEEDER_NOT_FOUND');

  // Referential Integrity: Block deletion if active meters exist
  const activeMeters = Array.from(store.meters.values()).filter((m) => m.feederId === feeder.id && !m.deletedAt);
  if (activeMeters.length > 0) {
    throw new BadRequestError('Cannot delete feeder with active meters.', 'ACTIVE_METERS_EXIST');
  }

  feeder.deletedAt = new Date().toISOString();
  logAudit(req.user.sub, 'SOFT_DELETE_FEEDER', 'Feeder', feeder.id);
  return successResponse(res, { message: 'Feeder deleted successfully' });
});

// ==========================================
// 4. METER MANAGEMENT (Endpoints 78 - 79)
// ==========================================

// Endpoint 78: POST /api/admin/meters
adminRouter.post('/admin/meters', (req: any, res, next) => {
  try {
    const data = createMeterSchema.parse(req.body);
    const existing = Array.from(store.meters.values()).find(
      (m) => m.meterNumber.toLowerCase() === data.meterNumber.toLowerCase() && !m.deletedAt
    );
    if (existing) throw new ConflictError('Meter number already registered', 'METER_EXISTS');

    const feeder = store.feeders.get(data.feederId);
    if (!feeder || feeder.deletedAt) throw new NotFoundError('Feeder not found', 'FEEDER_NOT_FOUND');

    const id = `mtr_${Date.now()}`;
    const now = new Date().toISOString();
    const meter: MeterRecord = {
      id,
      meterNumber: data.meterNumber.toUpperCase(),
      feederId: data.feederId,
      address: data.address,
      createdAt: now,
      updatedAt: now
    };
    store.meters.set(id, meter);
    logAudit(req.user.sub, 'CREATE_METER', 'Meter', id, data);

    return successResponse(res, meter, 201);
  } catch (err) {
    next(err);
  }
});

// Endpoint 79: GET /api/admin/meters
adminRouter.get('/admin/meters', (req, res) => {
  const feederId = req.query.feederId as string;
  let meters = Array.from(store.meters.values()).filter((m) => !m.deletedAt);

  if (feederId) {
    meters = meters.filter((m) => m.feederId === feederId);
  }

  if (req.query.search) {
    const q = (req.query.search as string).toLowerCase();
    meters = meters.filter((m) => m.meterNumber.toLowerCase().includes(q) || m.address.toLowerCase().includes(q));
  }

  let enriched = meters.map((m) => {
    const feeder = store.feeders.get(m.feederId);
    const link = Array.from(store.customerMeters.values()).find((cm) => cm.meterId === m.id && !cm.unlinkedAt);
    const customer = link ? store.users.get(link.customerId) : null;
    return {
      ...m,
      feeder: feeder && !feeder.deletedAt ? { id: feeder.id, name: feeder.name, code: feeder.code } : null,
      isLinked: !!link,
      linkedCustomer: customer && !customer.deletedAt ? { id: customer.id, name: customer.name, email: customer.email } : null
    };
  });

  if (req.query.isLinked !== undefined) {
    const reqLinked = req.query.isLinked === 'true';
    enriched = enriched.filter((m) => m.isLinked === reqLinked);
  }

  if (req.query.page || req.query.pageSize) {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const pageSize = Math.max(1, parseInt(req.query.pageSize as string, 10) || 20);
    const paginated = enriched.slice((page - 1) * pageSize, page * pageSize);
    return paginatedResponse(res, paginated, enriched.length, page, pageSize);
  }

  return successResponse(res, enriched);
});

// Endpoint 80: GET /api/admin/meters/:id
adminRouter.get('/admin/meters/:id', (req, res) => {
  const m = store.meters.get(req.params.id);
  if (!m || m.deletedAt) throw new NotFoundError('Meter not found', 'METER_NOT_FOUND');

  const feeder = store.feeders.get(m.feederId);
  const sub = feeder ? store.substations.get(feeder.substationId) : null;
  const zone = sub ? store.zones.get(sub.zoneId) : null;
  const link = Array.from(store.customerMeters.values()).find((cm) => cm.meterId === m.id && !cm.unlinkedAt);
  const customer = link ? store.users.get(link.customerId) : null;

  return successResponse(res, {
    ...m,
    feeder: feeder && !feeder.deletedAt ? { id: feeder.id, name: feeder.name, code: feeder.code } : null,
    substation: sub && !sub.deletedAt ? { id: sub.id, name: sub.name, code: sub.code } : null,
    zone: zone && !zone.deletedAt ? { id: zone.id, name: zone.name, code: zone.code } : null,
    isLinked: !!link,
    linkedCustomer: customer && !customer.deletedAt ? { id: customer.id, name: customer.name, email: customer.email } : null
  });
});

// Endpoint 81: DELETE /api/admin/meters/:id
adminRouter.delete('/admin/meters/:id', (req: any, res) => {
  const m = store.meters.get(req.params.id);
  if (!m || m.deletedAt) throw new NotFoundError('Meter not found', 'METER_NOT_FOUND');

  // Referential Integrity: Block deletion if actively linked to a customer
  const activeLink = Array.from(store.customerMeters.values()).find((cm) => cm.meterId === m.id && !cm.unlinkedAt);
  if (activeLink) {
    throw new BadRequestError('Cannot delete meter linked to active customer. Unlink meter first.', 'METER_LINKED_TO_CUSTOMER');
  }

  m.deletedAt = new Date().toISOString();
  logAudit(req.user.sub, 'SOFT_DELETE_METER', 'Meter', m.id);
  return successResponse(res, { message: 'Meter deleted successfully' });
});

// ==========================================
// 5. USER & STAFF MANAGEMENT (Endpoints 72 - 78)
// ==========================================

// Endpoint 72: POST /api/admin/users (Provision staff)
adminRouter.post('/admin/users', (req: any, res, next) => {
  try {
    const data = provisionUserSchema.parse(req.body);
    const existing = Array.from(store.users.values()).find(
      (u) => u.email.toLowerCase() === data.email.toLowerCase() && !u.deletedAt
    );
    if (existing) throw new ConflictError('Email already registered', 'EMAIL_EXISTS');

    if (data.role === UserRole.ZONE_MANAGER && !data.assignedZoneId) {
      throw new BadRequestError('Zone Manager must have an assigned zone', 'ZONE_REQUIRED');
    }

    if (data.assignedZoneId) {
      const zone = store.zones.get(data.assignedZoneId);
      if (!zone || zone.deletedAt) {
        throw new NotFoundError('Assigned zone not found', 'ZONE_NOT_FOUND');
      }
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(data.password, salt);
    const now = new Date().toISOString();
    const id = `usr_${Date.now()}`;

    const user: UserRecord = {
      id,
      name: data.name,
      email: data.email.toLowerCase(),
      phone: data.phone || null,
      passwordHash,
      role: data.role,
      status: UserStatus.ACTIVE,
      assignedZoneId: data.assignedZoneId || null,
      emailVerified: now,
      createdAt: now,
      updatedAt: now
    };
    store.users.set(id, user);
    logAudit(req.user.sub, 'PROVISION_USER', 'User', id, { role: data.role, email: data.email });

    return successResponse(res, toSafeUser(user), 201);
  } catch (err) {
    next(err);
  }
});

// Endpoint 73: GET /api/admin/users
adminRouter.get('/admin/users', (req, res) => {
  const role = req.query.role as string;
  const status = req.query.status as string;
  const zoneId = req.query.zoneId as string;

  let users = Array.from(store.users.values()).filter((u) => !u.deletedAt);

  if (role) users = users.filter((u) => u.role === role);
  if (status) users = users.filter((u) => u.status === status);
  if (zoneId) users = users.filter((u) => u.assignedZoneId === zoneId);

  const clean = users.map((u) => {
    const zone = u.assignedZoneId ? store.zones.get(u.assignedZoneId) : null;
    return {
      ...toSafeUser(u),
      zone: zone && !zone.deletedAt ? { id: zone.id, name: zone.name, code: zone.code } : null
    };
  });

  if (req.query.page || req.query.pageSize) {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const pageSize = Math.max(1, parseInt(req.query.pageSize as string, 10) || 20);
    const paginated = clean.slice((page - 1) * pageSize, page * pageSize);
    return paginatedResponse(res, paginated, clean.length, page, pageSize);
  }

  return successResponse(res, clean);
});

// Endpoint 74: GET /api/admin/users/:id
adminRouter.get('/admin/users/:id', (req, res) => {
  const u = store.users.get(req.params.id);
  if (!u || u.deletedAt) throw new NotFoundError('User not found', 'USER_NOT_FOUND');

  const zone = u.assignedZoneId ? store.zones.get(u.assignedZoneId) : null;
  return successResponse(res, {
    ...toSafeUser(u),
    zone: zone && !zone.deletedAt ? { id: zone.id, name: zone.name, code: zone.code } : null
  });
});

// Endpoint 75: PATCH /api/admin/users/:id
adminRouter.patch('/admin/users/:id', (req: any, res, next) => {
  try {
    const data = updateUserAdminSchema.parse(req.body);
    const user = store.users.get(req.params.id);
    if (!user || user.deletedAt) throw new NotFoundError('User not found', 'USER_NOT_FOUND');

    if (data.assignedZoneId) {
      const zone = store.zones.get(data.assignedZoneId);
      if (!zone || zone.deletedAt) {
        throw new NotFoundError('Assigned zone not found', 'ZONE_NOT_FOUND');
      }
    }

    if (data.name) user.name = data.name;
    if (data.phone !== undefined) user.phone = data.phone;
    if (data.role) user.role = data.role;
    if (data.status) user.status = data.status;
    if (data.assignedZoneId !== undefined) user.assignedZoneId = data.assignedZoneId;
    user.updatedAt = new Date().toISOString();

    logAudit(req.user.sub, 'UPDATE_USER', 'User', user.id, data);
    return successResponse(res, toSafeUser(user));
  } catch (err) {
    next(err);
  }
});

// Endpoint 76: PATCH /api/admin/users/:id/role (Reassign role and optional zone scope)
adminRouter.patch('/admin/users/:id/role', (req: any, res, next) => {
  try {
    const data = updateUserRoleSchema.parse(req.body);
    const user = store.users.get(req.params.id);
    if (!user || user.deletedAt) throw new NotFoundError('User not found', 'USER_NOT_FOUND');

    const effectiveZoneId = data.assignedZoneId !== undefined ? data.assignedZoneId : user.assignedZoneId;
    if (data.role === UserRole.ZONE_MANAGER && !effectiveZoneId) {
      throw new BadRequestError('Zone Manager must have an assigned zone', 'ZONE_REQUIRED');
    }

    if (data.assignedZoneId) {
      const zone = store.zones.get(data.assignedZoneId);
      if (!zone || zone.deletedAt) {
        throw new NotFoundError('Assigned zone not found', 'ZONE_NOT_FOUND');
      }
    }

    user.role = data.role;
    if (data.assignedZoneId !== undefined) {
      user.assignedZoneId = data.assignedZoneId;
    }
    user.updatedAt = new Date().toISOString();

    logAudit(req.user.sub, 'UPDATE_USER_ROLE', 'User', user.id, {
      role: user.role,
      assignedZoneId: user.assignedZoneId
    });

    return successResponse(res, toSafeUser(user));
  } catch (err) {
    next(err);
  }
});

// Endpoint 77: PATCH /api/admin/users/:id/status (Toggle ACTIVE / SUSPENDED status)
adminRouter.patch('/admin/users/:id/status', (req: any, res, next) => {
  try {
    const data = updateUserStatusSchema.parse(req.body);
    const user = store.users.get(req.params.id);
    if (!user || user.deletedAt) throw new NotFoundError('User not found', 'USER_NOT_FOUND');

    if (user.id === req.user.sub && data.status === UserStatus.SUSPENDED) {
      throw new BadRequestError('Cannot suspend your own administrator account', 'SELF_SUSPENSION_FORBIDDEN');
    }

    user.status = data.status;
    user.updatedAt = new Date().toISOString();

    logAudit(req.user.sub, 'UPDATE_USER_STATUS', 'User', user.id, { status: user.status });

    return successResponse(res, toSafeUser(user));
  } catch (err) {
    next(err);
  }
});

// Endpoint 78: DELETE /api/admin/users/:id
adminRouter.delete('/admin/users/:id', (req: any, res) => {
  const user = store.users.get(req.params.id);
  if (!user || user.deletedAt) throw new NotFoundError('User not found', 'USER_NOT_FOUND');

  // Prevent admin self-deletion
  if (user.id === req.user.sub) {
    throw new BadRequestError('Cannot delete your own administrator account', 'SELF_DELETION_FORBIDDEN');
  }

  // Prevent deleting technician with active tasks
  if (user.role === UserRole.TECHNICIAN) {
    const hasActiveTasks = Array.from(store.technicianAssignments.values()).some(
      (a) => a.technicianId === user.id && a.status !== 'COMPLETED'
    );
    if (hasActiveTasks) {
      throw new BadRequestError('Cannot delete technician with active assignments. Reassign first.', 'ACTIVE_TASKS_EXIST');
    }
  }

  // If customer is deleted, soft-unlink their meters
  if (user.role === UserRole.CUSTOMER) {
    for (const cm of store.customerMeters.values()) {
      if (cm.customerId === user.id && !cm.unlinkedAt) {
        cm.unlinkedAt = new Date().toISOString();
      }
    }
  }

  user.deletedAt = new Date().toISOString();
  logAudit(req.user.sub, 'SOFT_DELETE_USER', 'User', user.id);
  return successResponse(res, { message: 'User deleted successfully' });
});

// Alias: POST /api/admin/users/:id/suspend
adminRouter.post('/admin/users/:id/suspend', (req: any, res) => {
  const user = store.users.get(req.params.id);
  if (!user || user.deletedAt) throw new NotFoundError('User not found', 'USER_NOT_FOUND');

  if (user.id === req.user.sub) {
    throw new BadRequestError('Cannot suspend your own administrator account', 'SELF_SUSPENSION_FORBIDDEN');
  }

  user.status = UserStatus.SUSPENDED;
  user.updatedAt = new Date().toISOString();
  logAudit(req.user.sub, 'SUSPEND_USER', 'User', user.id);

  return successResponse(res, { success: true, message: `User ${user.email} suspended.` });
});

// Alias: POST /api/admin/users/:id/reactivate
adminRouter.post('/admin/users/:id/reactivate', (req: any, res) => {
  const user = store.users.get(req.params.id);
  if (!user || user.deletedAt) throw new NotFoundError('User not found', 'USER_NOT_FOUND');

  user.status = UserStatus.ACTIVE;
  user.updatedAt = new Date().toISOString();
  logAudit(req.user.sub, 'REACTIVATE_USER', 'User', user.id);

  return successResponse(res, { success: true, message: `User ${user.email} reactivated.` });
});

// ==========================================
// 6. UPGRADE APPROVAL (Endpoint 79)
// ==========================================

// Endpoint 79: PATCH /api/infrastructure-requests/:id/status
adminRouter.patch('/infrastructure-requests/:id/status', (req: any, res, next) => {
  try {
    const { status, adminNotes } = reviewInfrastructureRequestSchema.parse(req.body);
    const request = store.infrastructureRequests.get(req.params.id);
    if (!request) throw new AppError('Infrastructure request not found', 404, 'REQUEST_NOT_FOUND');

    request.status = status;
    request.adminNotes = adminNotes || null;
    request.reviewedById = req.user.sub;
    request.reviewedAt = new Date().toISOString();
    request.updatedAt = new Date().toISOString();

    logAudit(req.user.sub, 'REVIEW_INFRASTRUCTURE_REQUEST', 'InfrastructureRequest', request.id, {
      status,
      adminNotes
    });

    return successResponse(res, request);
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 7. AUDIT & NOTIFICATIONS (Endpoints 80 - 81)
// ==========================================

// Endpoint 80: GET /api/admin/audit
adminRouter.get('/admin/audit', (req, res) => {
  let logs = Array.from(store.auditLogs.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (req.query.action) {
    logs = logs.filter((l) => l.action.toLowerCase().includes((req.query.action as string).toLowerCase()));
  }
  if (req.query.userId) {
    logs = logs.filter((l) => l.actorId === req.query.userId);
  }

  if (req.query.page || req.query.pageSize) {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const pageSize = Math.max(1, parseInt(req.query.pageSize as string, 10) || 20);
    const paginated = logs.slice((page - 1) * pageSize, page * pageSize);
    return paginatedResponse(res, paginated, logs.length, page, pageSize);
  }

  return successResponse(res, logs.slice(0, 100));
});

// Endpoint 81: GET /api/admin/notifications
adminRouter.get('/admin/notifications', (req, res) => {
  const logs = Array.from(store.notificationDeliveryLogs.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 100);

  return successResponse(res, logs);
});
