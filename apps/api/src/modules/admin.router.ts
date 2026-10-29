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
import { successResponse, AppError } from '../utils/response';

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
// 1. ZONE MANAGEMENT (Endpoints 52 - 56)
// ==========================================

// Endpoint 52: POST /api/admin/zones
adminRouter.post('/admin/zones', (req: any, res, next) => {
  try {
    const data = createZoneSchema.parse(req.body);
    const existing = Array.from(store.zones.values()).find(
      (z) => (z.name.toLowerCase() === data.name.toLowerCase() || z.code.toUpperCase() === data.code.toUpperCase()) && !z.deletedAt
    );
    if (existing) throw new AppError('Zone with this name or code already exists', 409, 'ZONE_EXISTS');

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

// Endpoint 53: GET /api/admin/zones
adminRouter.get('/admin/zones', (req, res) => {
  const zones = Array.from(store.zones.values())
    .filter((z) => !z.deletedAt)
    .map((z) => {
      const subs = Array.from(store.substations.values()).filter((s) => s.zoneId === z.id && !s.deletedAt);
      return {
        ...z,
        substationsCount: subs.length
      };
    });
  return successResponse(res, zones);
});

// Endpoint 54: GET /api/admin/zones/:id
adminRouter.get('/admin/zones/:id', (req, res) => {
  const zone = store.zones.get(req.params.id);
  if (!zone || zone.deletedAt) throw new AppError('Zone not found', 404, 'ZONE_NOT_FOUND');
  return successResponse(res, zone);
});

// Endpoint 55: PATCH /api/admin/zones/:id
adminRouter.patch('/admin/zones/:id', (req: any, res, next) => {
  try {
    const data = updateZoneSchema.parse(req.body);
    const zone = store.zones.get(req.params.id);
    if (!zone || zone.deletedAt) throw new AppError('Zone not found', 404, 'ZONE_NOT_FOUND');

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

// Endpoint 56: DELETE /api/admin/zones/:id
adminRouter.delete('/admin/zones/:id', (req: any, res) => {
  const zone = store.zones.get(req.params.id);
  if (!zone || zone.deletedAt) throw new AppError('Zone not found', 404, 'ZONE_NOT_FOUND');

  zone.deletedAt = new Date().toISOString();
  logAudit(req.user.sub, 'SOFT_DELETE_ZONE', 'Zone', zone.id);
  return successResponse(res, { message: 'Zone deleted successfully' });
});

// ==========================================
// 2. SUBSTATION MANAGEMENT (Endpoints 57 - 61)
// ==========================================

// Endpoint 57: POST /api/admin/substations
adminRouter.post('/admin/substations', (req: any, res, next) => {
  try {
    const data = createSubstationSchema.parse(req.body);
    const zone = store.zones.get(data.zoneId);
    if (!zone || zone.deletedAt) throw new AppError('Zone not found', 404, 'ZONE_NOT_FOUND');

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

// Endpoint 58: GET /api/admin/substations
adminRouter.get('/admin/substations', (req, res) => {
  const zoneId = req.query.zoneId as string;
  let subs = Array.from(store.substations.values()).filter((s) => !s.deletedAt);
  if (zoneId) {
    subs = subs.filter((s) => s.zoneId === zoneId);
  }
  return successResponse(res, subs);
});

// Endpoint 59: GET /api/admin/substations/:id
adminRouter.get('/admin/substations/:id', (req, res) => {
  const sub = store.substations.get(req.params.id);
  if (!sub || sub.deletedAt) throw new AppError('Substation not found', 404, 'SUBSTATION_NOT_FOUND');
  return successResponse(res, sub);
});

// Endpoint 60: PATCH /api/admin/substations/:id
adminRouter.patch('/admin/substations/:id', (req: any, res, next) => {
  try {
    const data = updateSubstationSchema.parse(req.body);
    const sub = store.substations.get(req.params.id);
    if (!sub || sub.deletedAt) throw new AppError('Substation not found', 404, 'SUBSTATION_NOT_FOUND');

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

// Endpoint 61: DELETE /api/admin/substations/:id
adminRouter.delete('/admin/substations/:id', (req: any, res) => {
  const sub = store.substations.get(req.params.id);
  if (!sub || sub.deletedAt) throw new AppError('Substation not found', 404, 'SUBSTATION_NOT_FOUND');

  sub.deletedAt = new Date().toISOString();
  logAudit(req.user.sub, 'SOFT_DELETE_SUBSTATION', 'Substation', sub.id);
  return successResponse(res, { message: 'Substation deleted successfully' });
});

// ==========================================
// 3. FEEDER MANAGEMENT (Endpoints 62 - 67)
// ==========================================

// Endpoint 62: POST /api/admin/feeders
adminRouter.post('/admin/feeders', (req: any, res, next) => {
  try {
    const data = createFeederSchema.parse(req.body);
    const sub = store.substations.get(data.substationId);
    if (!sub || sub.deletedAt) throw new AppError('Substation not found', 404, 'SUBSTATION_NOT_FOUND');

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

// Endpoint 63: GET /api/admin/feeders
adminRouter.get('/admin/feeders', (req, res) => {
  const zoneId = req.query.zoneId as string;
  const isCritical = req.query.isCritical !== undefined ? req.query.isCritical === 'true' : undefined;
  const status = req.query.status as string;

  let feeders = Array.from(store.feeders.values()).filter((f) => !f.deletedAt);

  if (zoneId) {
    feeders = feeders.filter((f) => {
      const sub = store.substations.get(f.substationId);
      return sub && sub.zoneId === zoneId;
    });
  }

  if (isCritical !== undefined) {
    feeders = feeders.filter((f) => f.isCritical === isCritical);
  }

  if (status) {
    feeders = feeders.filter((f) => f.status === status);
  }

  return successResponse(res, feeders);
});

// Endpoint 64: GET /api/admin/feeders/:id
adminRouter.get('/admin/feeders/:id', (req, res) => {
  const f = store.feeders.get(req.params.id);
  if (!f || f.deletedAt) throw new AppError('Feeder not found', 404, 'FEEDER_NOT_FOUND');
  return successResponse(res, f);
});

// Endpoint 65: PATCH /api/admin/feeders/:id
adminRouter.patch('/admin/feeders/:id', (req: any, res, next) => {
  try {
    const data = updateFeederSchema.parse(req.body);
    const feeder = store.feeders.get(req.params.id);
    if (!feeder || feeder.deletedAt) throw new AppError('Feeder not found', 404, 'FEEDER_NOT_FOUND');

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

// Endpoint 66: PATCH /api/v1/admin/feeders/:id/critical (Toggle Critical Status)
adminRouter.patch('/v1/admin/feeders/:id/critical', (req: any, res, next) => {
  try {
    const { isCritical } = toggleCriticalSchema.parse(req.body);
    const feeder = store.feeders.get(req.params.id);
    if (!feeder || feeder.deletedAt) throw new AppError('Feeder not found', 404, 'FEEDER_NOT_FOUND');

    feeder.isCritical = isCritical;
    feeder.updatedAt = new Date().toISOString();

    logAudit(req.user.sub, 'TOGGLE_CRITICAL_FEEDER', 'Feeder', feeder.id, { isCritical });
    return successResponse(res, feeder);
  } catch (err) {
    next(err);
  }
});

// Endpoint 67: DELETE /api/admin/feeders/:id
adminRouter.delete('/admin/feeders/:id', (req: any, res) => {
  const feeder = store.feeders.get(req.params.id);
  if (!feeder || feeder.deletedAt) throw new AppError('Feeder not found', 404, 'FEEDER_NOT_FOUND');

  feeder.deletedAt = new Date().toISOString();
  logAudit(req.user.sub, 'SOFT_DELETE_FEEDER', 'Feeder', feeder.id);
  return successResponse(res, { message: 'Feeder deleted successfully' });
});

// ==========================================
// 4. METER MANAGEMENT (Endpoints 68 - 71)
// ==========================================

// Endpoint 68: POST /api/admin/meters
adminRouter.post('/admin/meters', (req: any, res, next) => {
  try {
    const data = createMeterSchema.parse(req.body);
    const existing = Array.from(store.meters.values()).find(
      (m) => m.meterNumber.toLowerCase() === data.meterNumber.toLowerCase() && !m.deletedAt
    );
    if (existing) throw new AppError('Meter number already registered', 409, 'METER_EXISTS');

    const feeder = store.feeders.get(data.feederId);
    if (!feeder || feeder.deletedAt) throw new AppError('Feeder not found', 404, 'FEEDER_NOT_FOUND');

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

// Endpoint 69: GET /api/admin/meters
adminRouter.get('/admin/meters', (req, res) => {
  const feederId = req.query.feederId as string;
  let meters = Array.from(store.meters.values()).filter((m) => !m.deletedAt);
  if (feederId) {
    meters = meters.filter((m) => m.feederId === feederId);
  }
  return successResponse(res, meters);
});

// Endpoint 70: GET /api/admin/meters/:id
adminRouter.get('/admin/meters/:id', (req, res) => {
  const m = store.meters.get(req.params.id);
  if (!m || m.deletedAt) throw new AppError('Meter not found', 404, 'METER_NOT_FOUND');
  return successResponse(res, m);
});

// Endpoint 71: DELETE /api/admin/meters/:id
adminRouter.delete('/admin/meters/:id', (req: any, res) => {
  const m = store.meters.get(req.params.id);
  if (!m || m.deletedAt) throw new AppError('Meter not found', 404, 'METER_NOT_FOUND');

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
    if (existing) throw new AppError('Email already registered', 409, 'EMAIL_EXISTS');

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

    return successResponse(
      res,
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        assignedZoneId: user.assignedZoneId
      },
      201
    );
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

  const clean = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    status: u.status,
    assignedZoneId: u.assignedZoneId,
    createdAt: u.createdAt
  }));

  return successResponse(res, clean);
});

// Endpoint 74: GET /api/admin/users/:id
adminRouter.get('/admin/users/:id', (req, res) => {
  const u = store.users.get(req.params.id);
  if (!u || u.deletedAt) throw new AppError('User not found', 404, 'USER_NOT_FOUND');

  return successResponse(res, {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    status: u.status,
    assignedZoneId: u.assignedZoneId,
    emailVerified: u.emailVerified,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt
  });
});

// Endpoint 75: PATCH /api/admin/users/:id
adminRouter.patch('/admin/users/:id', (req: any, res, next) => {
  try {
    const data = updateUserAdminSchema.parse(req.body);
    const user = store.users.get(req.params.id);
    if (!user || user.deletedAt) throw new AppError('User not found', 404, 'USER_NOT_FOUND');

    if (data.name) user.name = data.name;
    if (data.phone !== undefined) user.phone = data.phone;
    if (data.role) user.role = data.role;
    if (data.status) user.status = data.status;
    if (data.assignedZoneId !== undefined) user.assignedZoneId = data.assignedZoneId;
    user.updatedAt = new Date().toISOString();

    logAudit(req.user.sub, 'UPDATE_USER', 'User', user.id, data);
    return successResponse(res, user);
  } catch (err) {
    next(err);
  }
});

// Endpoint 76: DELETE /api/admin/users/:id
adminRouter.delete('/admin/users/:id', (req: any, res) => {
  const user = store.users.get(req.params.id);
  if (!user || user.deletedAt) throw new AppError('User not found', 404, 'USER_NOT_FOUND');

  // Prevent deleting technician with active tasks
  if (user.role === UserRole.TECHNICIAN) {
    const hasActiveTasks = Array.from(store.technicianAssignments.values()).some(
      (a) => a.technicianId === user.id && a.status !== 'COMPLETED'
    );
    if (hasActiveTasks) {
      throw new AppError('Cannot delete technician with active assignments. Reassign first.', 400, 'ACTIVE_TASKS_EXIST');
    }
  }

  user.deletedAt = new Date().toISOString();
  logAudit(req.user.sub, 'SOFT_DELETE_USER', 'User', user.id);
  return successResponse(res, { message: 'User deleted successfully' });
});

// Endpoint 77: POST /api/admin/users/:id/suspend
adminRouter.post('/admin/users/:id/suspend', (req: any, res) => {
  const user = store.users.get(req.params.id);
  if (!user || user.deletedAt) throw new AppError('User not found', 404, 'USER_NOT_FOUND');

  user.status = UserStatus.SUSPENDED;
  user.updatedAt = new Date().toISOString();
  logAudit(req.user.sub, 'SUSPEND_USER', 'User', user.id);

  return successResponse(res, { success: true, message: `User ${user.email} suspended.` });
});

// Endpoint 78: POST /api/admin/users/:id/reactivate
adminRouter.post('/admin/users/:id/reactivate', (req: any, res) => {
  const user = store.users.get(req.params.id);
  if (!user || user.deletedAt) throw new AppError('User not found', 404, 'USER_NOT_FOUND');

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
  const logs = Array.from(store.auditLogs.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 100);

  return successResponse(res, logs);
});

// Endpoint 81: GET /api/admin/notifications
adminRouter.get('/admin/notifications', (req, res) => {
  const logs = Array.from(store.notificationDeliveryLogs.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 100);

  return successResponse(res, logs);
});
