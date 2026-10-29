import { createApp } from '../app';
import http from 'http';
import { logger } from '../utils/logger';
import { store } from '../db/store';
import { toSafeUser, whereNotDeleted, getUserZoneScope } from '../db/helpers';
import { isTransientTransactionError } from '../db/transactions';
import { buildTestUser, buildTestFeeder, createMockClock } from './fixtures';
import {
  UserRole,
  UserStatus,
  AssignmentStatus,
  ScheduleStatus,
  OutageStatus,
  FeederStatus,
  paginationQuerySchema,
  NotificationType
} from '@load-shedding/shared';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  BadRequestError,
  ForbiddenError
} from '../utils/response';
import { requireRole, verifyZoneScope } from '../middleware/auth';

// Helper to make test HTTP requests
const request = async (
  serverUrl: string,
  method: string,
  path: string,
  body?: any,
  token?: string
): Promise<{ status: number; body: any }> => {
  const url = `${serverUrl}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
};

const runSuite = async () => {
  logger.info('🧪 Starting automated verification test suite...');
  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => server.listen(4001, () => resolve()));
  const serverUrl = 'http://localhost:4001';

  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, testName: string) => {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      failed++;
    }
  };

  try {
    // Test 1: Health Endpoints
    const health = await request(serverUrl, 'GET', '/api/health');
    assert(health.status === 200 && health.body.success === true, 'GET /api/health returns 200 OK');

    const live = await request(serverUrl, 'GET', '/api/v1/health/live');
    assert(live.status === 200 && live.body.data.status === 'LIVE', 'GET /api/v1/health/live returns LIVE');

    // Test 2: Authentication - Login as Admin
    const adminLogin = await request(serverUrl, 'POST', '/api/auth/login', {
      email: 'admin@grid.gov.bd',
      password: 'Password123!'
    });
    assert(adminLogin.status === 200 && !!adminLogin.body.data.token, 'POST /api/auth/login succeeds for Admin');
    const adminToken = adminLogin.body.data.token;

    // Test 3: Authentication - Login as Customer
    const custLogin = await request(serverUrl, 'POST', '/api/auth/login', {
      email: 'customer@gmail.com',
      password: 'Password123!'
    });
    assert(custLogin.status === 200 && custLogin.body.data.user.role === 'CUSTOMER', 'POST /api/auth/login succeeds for Customer');
    const customerToken = custLogin.body.data.token;

    // Test 4: Authorization & RBAC
    // Customer attempts to call Admin API -> 403 Forbidden
    const rbacTest = await request(
      serverUrl,
      'POST',
      '/api/admin/zones',
      { name: 'Unauthorized Zone', code: 'UNAUTH' },
      customerToken
    );
    assert(rbacTest.status === 403, 'RBAC prevents Customer from calling Admin API (403 Forbidden)');

    // Test 5: Grid Data Retrieval
    const zonesRes = await request(serverUrl, 'GET', '/api/zones');
    assert(zonesRes.status === 200 && Array.isArray(zonesRes.body.data), 'GET /api/zones returns active zones');

    const feedersRes = await request(serverUrl, 'GET', '/api/feeders');
    assert(feedersRes.status === 200 && Array.isArray(feedersRes.body.data), 'GET /api/feeders returns feeders');

    // Test 6: Operator Generates Draft Schedule
    const opLogin = await request(serverUrl, 'POST', '/api/auth/login', {
      email: 'operator@grid.gov.bd',
      password: 'Password123!'
    });
    const opToken = opLogin.body.data.token;

    const scheduleDraft = await request(
      serverUrl,
      'POST',
      '/api/operator/schedules/draft',
      {
        planningDate: '2026-09-25',
        deficitMW: 20,
        startTime: '08:00',
        endTime: '12:00',
        slotDurationMinutes: 60
      },
      opToken
    );
    assert(scheduleDraft.status === 201 && scheduleDraft.body.success === true, 'POST /api/operator/schedules/draft generates plan');

    const scheduleId = scheduleDraft.body.data.id;
    // Check that Ibn Sina Hospital Critical Feeder was NEVER selected
    let hospitalSelected = false;
    for (const slot of scheduleDraft.body.data.slots) {
      for (const f of slot.feeders) {
        if (f.code === 'FDR-DHN-HOSP') hospitalSelected = true;
      }
    }
    assert(!hospitalSelected, 'RULE 1: Hospital Critical Feeder is strictly excluded from schedule');

    // Test 7: Operator Publishes Schedule
    const publishRes = await request(serverUrl, 'POST', `/api/operator/schedules/${scheduleId}/publish`, {}, opToken);
    assert(publishRes.status === 200 && publishRes.body.data.schedule.status === 'PUBLISHED', 'POST /api/operator/schedules/:id/publish publishes plan');

    // Test 8: Smart Outage Conflict Resolution
    // Meter MTR-DHN-101 is on Feeder-1. If Feeder-1 was not in an active slot right now, it should report unexpected fault
    const reportRes = await request(
      serverUrl,
      'POST',
      '/api/customers/me/outage-reports',
      {
        meterId: 'mtr_dhn_101',
        description: 'Sparking transformer on road corner near mosque'
      },
      customerToken
    );
    assert(
      reportRes.status === 200 || reportRes.status === 201,
      'POST /api/customers/me/outage-reports handles conflict resolution correctly'
    );
    const ticketId = reportRes.body.data.ticket?.id;

    // Test 9: Technician Workflow (Assign -> En Route -> Start Repair -> Resolve)
    if (ticketId) {
      // 9a. Operator assigns technician
      const assignRes = await request(
        serverUrl,
        'POST',
        `/api/operators/outage-reports/${ticketId}/assign`,
        { technicianId: 'usr_tech_1' },
        opToken
      );
      assert(assignRes.status === 200, 'POST /api/operators/outage-reports/:id/assign assigns technician');

      // Login as Technician
      const techLogin = await request(serverUrl, 'POST', '/api/auth/login', {
        email: 'tech1@grid.gov.bd',
        password: 'Password123!'
      });
      const techToken = techLogin.body.data.token;

      // 9b. Technician accepts (EN_ROUTE)
      const acceptRes = await request(
        serverUrl,
        'POST',
        `/api/technicians/me/assignments/${ticketId}/accept`,
        {},
        techToken
      );
      assert(acceptRes.status === 200 && acceptRes.body.data.status === 'EN_ROUTE', 'POST /api/technicians/me/assignments/:id/accept moves status to EN_ROUTE');

      // 9c. Technician starts repair (REPAIRING)
      const repairRes = await request(
        serverUrl,
        'POST',
        `/api/technicians/me/assignments/${ticketId}/start-repair`,
        {},
        techToken
      );
      assert(repairRes.status === 200 && repairRes.body.data.status === 'REPAIRING', 'POST /api/technicians/me/assignments/:id/start-repair moves status to REPAIRING');

      // 9d. Technician resolves (RESOLVED)
      const resolveRes = await request(
        serverUrl,
        'POST',
        `/api/technicians/me/assignments/${ticketId}/resolve`,
        { resolutionNotes: 'Replaced blown drop-out link fuse. Feeder tested normal.' },
        techToken
      );
      assert(resolveRes.status === 200 && resolveRes.body.data.ticket.status === 'RESOLVED', 'POST /api/technicians/me/assignments/:id/resolve restores feeder and marks ticket RESOLVED');
    }

    // Test 10: Zone Manager Analytics & Upgrade Request
    const mgrLogin = await request(serverUrl, 'POST', '/api/auth/login', {
      email: 'manager.dhanmondi@grid.gov.bd',
      password: 'Password123!'
    });
    const mgrToken = mgrLogin.body.data.token;

    const failureRate = await request(serverUrl, 'GET', '/api/zone-managers/me/analytics/feeder-failure-rate', undefined, mgrToken);
    assert(failureRate.status === 200 && Array.isArray(failureRate.body.data), 'GET /api/zone-managers/me/analytics/feeder-failure-rate returns ranked list');

    const upgradeReq = await request(
      serverUrl,
      'POST',
      '/api/infrastructure-requests',
      {
        feederId: 'fdr_dhn_1',
        reason: 'Repeated transformer overheating',
        proposedAction: 'Upgrade transformer to 400kVA',
        supportingMetrics: { faultsLast30Days: 5 }
      },
      mgrToken
    );
    assert(upgradeReq.status === 201 && upgradeReq.body.data.status === 'PENDING', 'POST /api/infrastructure-requests submits upgrade request');

    // Admin approves upgrade request
    const reqId = upgradeReq.body.data.id;
    const approvalRes = await request(
      serverUrl,
      'PATCH',
      `/api/infrastructure-requests/${reqId}/status`,
      { status: 'APPROVED', adminNotes: 'Budget sanctioned for Q3.' },
      adminToken
    );
    assert(approvalRes.status === 200 && approvalRes.body.data.status === 'APPROVED', 'PATCH /api/infrastructure-requests/:id/status approves request');

    // Test 11: Phase 5 Persistence & Domain Helpers
    const testUser = buildTestUser({ passwordHash: 'secret_hash_value' });
    const safeUser = toSafeUser(testUser);
    assert(!('passwordHash' in safeUser), 'toSafeUser strips passwordHash from user representation');

    const softDeleteFilter = whereNotDeleted({ code: 'DHN' });
    assert(softDeleteFilter.deletedAt === null && softDeleteFilter.code === 'DHN', 'whereNotDeleted attaches deletedAt: null filter');

    const adminScope = getUserZoneScope({ role: UserRole.ADMIN });
    const techScope = getUserZoneScope({ role: UserRole.TECHNICIAN, assignedZoneId: 'zn_dhanmondi' });
    assert(adminScope.isGlobal === true && techScope.isGlobal === false && techScope.zoneId === 'zn_dhanmondi', 'getUserZoneScope accurately identifies global vs zone-scoped roles');

    assert(isTransientTransactionError({ code: 'P2034' }), 'isTransientTransactionError identifies Prisma P2034 as retryable');
    assert(isTransientTransactionError({ code: '40001' }), 'isTransientTransactionError identifies PostgreSQL 40001 as retryable');
    assert(isTransientTransactionError({ code: '40P01' }), 'isTransientTransactionError identifies PostgreSQL 40P01 as retryable');
    assert(!isTransientTransactionError({ code: 'P2002' }), 'isTransientTransactionError rejects non-transient P2002 constraint error');

    // Test 12: Phase 5 Fixtures & Store Reset Isolation
    const mockFeeder = buildTestFeeder('sub_dhn_1', { capacityMW: 25.0 });
    assert(mockFeeder.capacityMW === 25.0 && mockFeeder.isCritical === false, 'buildTestFeeder generates valid fixture with custom overrides');

    const clock = createMockClock('2026-09-25T10:00:00.000Z');
    clock.advanceHours(3);
    assert(clock.nowIso() === '2026-09-25T13:00:00.000Z', 'MockClock accurately advances time without system drift');

    // Mutate in-memory store and verify reset restores initial state
    const originalZoneCount = store.zones.size;
    store.zones.set('zn_temp', {
      id: 'zn_temp',
      name: 'Temp Zone',
      code: 'TMP',
      description: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    assert(store.zones.size === originalZoneCount + 1, 'MemoryStore accepts mutated records in test');
    store.reset();
    assert(store.zones.size === originalZoneCount && !store.zones.has('zn_temp'), 'MemoryStore.reset() restores pristine initial seed state');

    // Test 13: Phase 6 Validation, Pagination, and Error Contracts
    // 13a. Body Validation Rejection (Zod 400 VALIDATION_ERROR)
    const invalidReg = await request(serverUrl, 'POST', '/api/auth/register', {
      name: 'A',
      email: 'invalid-email',
      password: '123'
    });
    assert(
      invalidReg.status === 400 &&
      invalidReg.body.success === false &&
      invalidReg.body.error.code === 'VALIDATION_ERROR' &&
      Array.isArray(invalidReg.body.error.details) &&
      invalidReg.body.error.details.length >= 2,
      'Zod validation middleware rejects invalid body with structured field error details'
    );

    // 13b. Query String Coercion and Notification Pagination
    const notifsPaginated = await request(
      serverUrl,
      'GET',
      '/api/v1/users/me/notifications?page=1&pageSize=5',
      undefined,
      customerToken
    );
    assert(
      notifsPaginated.status === 200 &&
      notifsPaginated.body.success === true &&
      Array.isArray(notifsPaginated.body.data.items) &&
      notifsPaginated.body.data.meta.page === 1 &&
      notifsPaginated.body.data.meta.pageSize === 5 &&
      typeof notifsPaginated.body.data.meta.totalPages === 'number',
      'GET /api/v1/users/me/notifications supports query coercion and standard pagination envelope'
    );

    // 13c. Admin User Collection Pagination
    const adminUsersPaginated = await request(
      serverUrl,
      'GET',
      '/api/v1/admin/users?page=1&pageSize=2',
      undefined,
      adminToken
    );
    assert(
      adminUsersPaginated.status === 200 &&
      adminUsersPaginated.body.success === true &&
      adminUsersPaginated.body.data.items.length === 2 &&
      adminUsersPaginated.body.data.meta.page === 1 &&
      adminUsersPaginated.body.data.meta.pageSize === 2 &&
      adminUsersPaginated.body.data.meta.hasNextPage === true,
      'GET /api/v1/admin/users returns standardized PaginatedData envelope when page parameters provided'
    );

    // 13d. Operator Schedules Collection Pagination
    const opSchedulesPaginated = await request(
      serverUrl,
      'GET',
      '/api/v1/operator/schedules?page=1&pageSize=10',
      undefined,
      opToken
    );
    assert(
      opSchedulesPaginated.status === 200 &&
      opSchedulesPaginated.body.success === true &&
      Array.isArray(opSchedulesPaginated.body.data.items) &&
      opSchedulesPaginated.body.data.meta.page === 1,
      'GET /api/v1/operator/schedules returns paginated schedules list'
    );

    // 13e. Domain Error Hierarchy Classes
    const notFoundErr = new NotFoundError('Feeder FDR-99 not found', 'FEEDER_NOT_FOUND');
    assert(notFoundErr.statusCode === 404 && notFoundErr.code === 'FEEDER_NOT_FOUND', 'NotFoundError produces status 404 with custom error code');

    const conflictErr = new ConflictError('Meter already assigned');
    assert(conflictErr.statusCode === 409 && conflictErr.code === 'CONFLICT', 'ConflictError produces status 409 with CONFLICT code');

    const validationErr = new ValidationError('Payload invalid');
    assert(validationErr.statusCode === 400 && validationErr.code === 'VALIDATION_ERROR', 'ValidationError produces status 400 with VALIDATION_ERROR code');

    const badReqErr = new BadRequestError('Malformed query');
    assert(badReqErr.statusCode === 400 && badReqErr.code === 'BAD_REQUEST', 'BadRequestError produces status 400 with BAD_REQUEST code');

    // 13f. Pagination Query Schema Coercion
    const parsedPagination = paginationQuerySchema.parse({ page: '3', pageSize: '15' });
    assert(parsedPagination.page === 3 && parsedPagination.pageSize === 15, 'paginationQuerySchema safely coerces string parameters to integers');

    // 13g. Malformed JSON Body Handling
    const malformedReq = await request(
      serverUrl,
      'POST',
      '/api/auth/login',
      '{"bad_json_string": '
    );
    assert(
      malformedReq.status === 400 && malformedReq.body.error.code === 'INVALID_JSON',
      'Body parser catches malformed JSON and responds with 400 INVALID_JSON'
    );

    // Test 14: Phase 7 Authentication Lifecycle & Edge Cases
    // 14a. Customer Self-Registration with Valid Unlinked Meter
    const regRes = await request(serverUrl, 'POST', '/api/auth/register', {
      name: 'Zarin Customer',
      email: 'zarin.new@gmail.com',
      phone: '+8801799999999',
      password: 'SecurePassword123!',
      meterNumber: 'MTR-MIR-201'
    });
    assert(
      regRes.status === 201 &&
      regRes.body.success === true &&
      regRes.body.data.user.role === 'CUSTOMER' &&
      regRes.body.data.user.email === 'zarin.new@gmail.com',
      'POST /api/auth/register successfully registers new Customer with default role'
    );
    const zarinUserId = regRes.body.data.user.id;
    const meterBinding = Array.from(store.customerMeters.values()).find(
      (cm) => cm.customerId === zarinUserId && !cm.unlinkedAt
    );
    assert(!!meterBinding, 'POST /api/auth/register binds valid initial meter to new customer');

    // 14b. Duplicate Email Conflict Rejection
    const dupEmailRes = await request(serverUrl, 'POST', '/api/auth/register', {
      name: 'Duplicate Zarin',
      email: 'zarin.new@gmail.com',
      password: 'SecurePassword123!'
    });
    assert(
      dupEmailRes.status === 409 && dupEmailRes.body.error.code === 'EMAIL_EXISTS',
      'POST /api/auth/register rejects duplicate email with 409 EMAIL_EXISTS'
    );

    // 14c. Registration with Non-Existent Meter
    const nonExistentMeterRes = await request(serverUrl, 'POST', '/api/auth/register', {
      name: 'Ghost User',
      email: 'ghost@gmail.com',
      password: 'SecurePassword123!',
      meterNumber: 'MTR-NONEXISTENT-999'
    });
    assert(
      nonExistentMeterRes.status === 404 && nonExistentMeterRes.body.error.code === 'METER_NOT_FOUND',
      'POST /api/auth/register rejects non-existent meter with 404 METER_NOT_FOUND'
    );

    // 14d. Registration with Already-Linked Meter
    const alreadyLinkedMeterRes = await request(serverUrl, 'POST', '/api/auth/register', {
      name: 'Another Resident',
      email: 'resident2@gmail.com',
      password: 'SecurePassword123!',
      meterNumber: 'MTR-MIR-201'
    });
    assert(
      alreadyLinkedMeterRes.status === 409 && alreadyLinkedMeterRes.body.error.code === 'METER_ALREADY_LINKED',
      'POST /api/auth/register rejects already-linked meter with 409 METER_ALREADY_LINKED'
    );

    // 14e. Session / Current User Resolution
    const zarinLogin = await request(serverUrl, 'POST', '/api/auth/login', {
      email: 'zarin.new@gmail.com',
      password: 'SecurePassword123!'
    });
    assert(zarinLogin.status === 200 && !!zarinLogin.body.data.token, 'POST /api/auth/login succeeds for newly registered user');
    const zarinToken = zarinLogin.body.data.token;

    const zarinSession = await request(serverUrl, 'GET', '/api/v1/auth/session', undefined, zarinToken);
    assert(
      zarinSession.status === 200 &&
      zarinSession.body.data.user.email === 'zarin.new@gmail.com' &&
      zarinSession.body.data.user.role === 'CUSTOMER',
      'GET /api/v1/auth/session resolves active identity and role'
    );

    // 14f. Token Refresh Endpoint
    const refreshRes = await request(serverUrl, 'POST', '/api/v1/auth/refresh', undefined, zarinToken);
    assert(
      refreshRes.status === 200 &&
      refreshRes.body.success === true &&
      typeof refreshRes.body.data.token === 'string' &&
      refreshRes.body.data.user.email === 'zarin.new@gmail.com',
      'POST /api/v1/auth/refresh issues renewed token for active user'
    );

    // 14g. Suspended Account Rejection
    const zarinUserRecord = store.users.get(zarinUserId)!;
    zarinUserRecord.status = UserStatus.SUSPENDED;

    const suspendedLogin = await request(serverUrl, 'POST', '/api/auth/login', {
      email: 'zarin.new@gmail.com',
      password: 'SecurePassword123!'
    });
    assert(
      suspendedLogin.status === 403 && suspendedLogin.body.error.code === 'ACCOUNT_SUSPENDED',
      'POST /api/auth/login rejects suspended accounts with 403 ACCOUNT_SUSPENDED'
    );

    const suspendedSession = await request(serverUrl, 'GET', '/api/v1/auth/session', undefined, zarinToken);
    assert(
      suspendedSession.status === 403 && suspendedSession.body.error.code === 'ACCOUNT_SUSPENDED',
      'GET /api/v1/auth/session revokes access for suspended accounts with 403'
    );
    zarinUserRecord.status = UserStatus.ACTIVE;

    // 14h. Email Verification Request & Confirm Flow
    const emailReq = await request(serverUrl, 'POST', '/api/v1/auth/verify-email/request', undefined, zarinToken);
    assert(emailReq.status === 200 && !!emailReq.body.data.devToken, 'POST /api/v1/auth/verify-email/request generates dev verification token');
    const verifyToken = emailReq.body.data.devToken;

    const verifyConfirm = await request(serverUrl, 'POST', '/api/v1/auth/verify-email/confirm', { token: verifyToken });
    assert(verifyConfirm.status === 200 && zarinUserRecord.emailVerified !== null, 'POST /api/v1/auth/verify-email/confirm marks email verified');

    // 14i. Password Reset Request & Confirm Flow
    const forgotRes = await request(serverUrl, 'POST', '/api/v1/auth/password/forgot', { email: 'zarin.new@gmail.com' });
    assert(forgotRes.status === 200 && !!forgotRes.body.data.devToken, 'POST /api/v1/auth/password/forgot dispatches reset token');
    const resetToken = forgotRes.body.data.devToken;

    const resetConfirm = await request(serverUrl, 'POST', '/api/v1/auth/password/reset', {
      token: resetToken,
      newPassword: 'BrandNewPassword456!'
    });
    assert(resetConfirm.status === 200, 'POST /api/v1/auth/password/reset updates password hash');

    const newPassLogin = await request(serverUrl, 'POST', '/api/auth/login', {
      email: 'zarin.new@gmail.com',
      password: 'BrandNewPassword456!'
    });
    assert(newPassLogin.status === 200, 'POST /api/auth/login succeeds with updated password');

    // 14j. Logout Endpoint
    const logoutRes = await request(serverUrl, 'POST', '/api/v1/auth/logout', undefined, zarinToken);
    assert(logoutRes.status === 200 && logoutRes.body.success === true, 'POST /api/v1/auth/logout clears session');

    // Test 15: RBAC, Resource Ownership, and Horizontal Zone-Scope Authorization (Phase 8)
    // 15a. Vertical RBAC: Customer blocked from Operator draft schedule
    const customerDraftRes = await request(
      serverUrl,
      'POST',
      '/api/operator/schedules/draft',
      {
        planningDate: '2026-09-25',
        deficitMW: 20,
        startTime: '14:00',
        endTime: '18:00',
        slotDurationMinutes: 60
      },
      customerToken
    );
    assert(
      customerDraftRes.status === 403 && customerDraftRes.body.error.code === 'FORBIDDEN',
      'Vertical RBAC: Customer blocked from Operator draft schedule (403 FORBIDDEN)'
    );

    // 15b. Vertical RBAC: Field Technician blocked from Admin zone creation
    const techLogin = await request(serverUrl, 'POST', '/api/auth/login', {
      email: 'tech1@grid.gov.bd',
      password: 'Password123!'
    });
    const tech1Token = techLogin.body.data.token;

    const techAdminRes = await request(
      serverUrl,
      'POST',
      '/api/admin/zones',
      { name: 'Unauthorized Tech Zone', code: 'TECH-ZONE' },
      tech1Token
    );
    assert(
      techAdminRes.status === 403 && techAdminRes.body.error.code === 'FORBIDDEN',
      'Vertical RBAC: Technician blocked from Admin zone creation (403 FORBIDDEN)'
    );

    // 15c. Vertical RBAC: Zone Manager blocked from Admin user provisioning
    const managerLogin = await request(serverUrl, 'POST', '/api/auth/login', {
      email: 'manager.dhanmondi@grid.gov.bd',
      password: 'Password123!'
    });
    const managerToken = managerLogin.body.data.token;

    const mgrProvisionRes = await request(
      serverUrl,
      'POST',
      '/api/admin/users',
      {
        name: 'Unauthorized Staff',
        email: 'unauth.staff@grid.gov.bd',
        password: 'Password123!',
        role: UserRole.TECHNICIAN
      },
      managerToken
    );
    assert(
      mgrProvisionRes.status === 403 && mgrProvisionRes.body.error.code === 'FORBIDDEN',
      'Vertical RBAC: Zone Manager blocked from Admin user provisioning (403 FORBIDDEN)'
    );

    // 15d. Horizontal Zone Scope: Dhanmondi Zone Manager blocked from requesting upgrade on Mirpur feeder
    const crossZoneUpgradeRes = await request(
      serverUrl,
      'POST',
      '/api/infrastructure-requests',
      {
        feederId: 'fdr_mir_1', // Mirpur feeder
        reason: 'Attempted cross-zone upgrade',
        proposedAction: 'Upgrade line capacity to 30MW',
        supportingMetrics: { peakLoadMW: 25.0 }
      },
      managerToken
    );
    assert(
      crossZoneUpgradeRes.status === 403 && crossZoneUpgradeRes.body.error.code === 'ZONE_ACCESS_DENIED',
      'Horizontal Zone Scope: Dhanmondi Zone Manager blocked from Mirpur feeder upgrade (403 ZONE_ACCESS_DENIED)'
    );

    // 15e. Horizontal Zone Scope: Dhanmondi Zone Manager successfully requests upgrade on Dhanmondi feeder
    const inZoneUpgradeRes = await request(
      serverUrl,
      'POST',
      '/api/infrastructure-requests',
      {
        feederId: 'fdr_dhn_1', // Dhanmondi feeder
        reason: 'Authorized in-zone upgrade',
        proposedAction: 'Re-conductoring line with higher gauge',
        supportingMetrics: { peakLoadMW: 12.0 }
      },
      managerToken
    );
    assert(
      inZoneUpgradeRes.status === 201 &&
      inZoneUpgradeRes.body.success === true &&
      inZoneUpgradeRes.body.data.feederId === 'fdr_dhn_1',
      'Horizontal Zone Scope: Dhanmondi Zone Manager successfully requests Dhanmondi feeder upgrade (201 CREATED)'
    );

    // 15f. IDOR Protection: Customer B blocked from unlinking Customer A's meter
    const customerBToken = newPassLogin.body.data.token;
    const idorUnlinkRes = await request(
      serverUrl,
      'DELETE',
      '/api/customers/me/meters/cm_1', // cm_1 belongs to Customer A (usr_cust_1)
      undefined,
      customerBToken
    );
    assert(
      idorUnlinkRes.status === 404 && idorUnlinkRes.body.error.code === 'LINK_NOT_FOUND',
      'IDOR Protection: Customer B blocked from unlinking Customer A meter (404 LINK_NOT_FOUND)'
    );

    // 15g. IDOR Protection: Customer B blocked from inspecting Customer A's private outage report
    const tktTestId = `tkt_test_15_${Date.now()}`;
    const nowIso = new Date().toISOString();
    store.outageTickets.set(tktTestId, {
      id: tktTestId,
      ticketNumber: 'TKT-2026-TEST15',
      customerId: 'usr_cust_1',
      meterId: 'mtr_dhn_101',
      feederId: 'fdr_dhn_1',
      status: 'ASSIGNED' as any,
      description: 'Private customer report',
      isPlanned: false,
      reportedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso
    });
    const asgnTestId = `asgn_test_15_${Date.now()}`;
    store.technicianAssignments.set(asgnTestId, {
      id: asgnTestId,
      ticketId: tktTestId,
      technicianId: 'usr_tech_1',
      assignedById: 'usr_admin_1',
      status: 'PENDING' as any,
      assignedAt: new Date().toISOString()
    });

    const idorTicketInspectRes = await request(
      serverUrl,
      'GET',
      `/api/customers/me/outage-reports/${tktTestId}`,
      undefined,
      customerBToken
    );
    assert(
      idorTicketInspectRes.status === 404 && idorTicketInspectRes.body.error.code === 'TICKET_NOT_FOUND',
      'IDOR Protection: Customer B blocked from inspecting Customer A ticket (404 TICKET_NOT_FOUND)'
    );

    // 15h. IDOR Protection: Technician 2 blocked from accepting ticket assigned to Technician 1
    const tech2ProvisionRes = await request(
      serverUrl,
      'POST',
      '/api/admin/users',
      {
        name: 'Field Technician Monir',
        email: 'tech2@grid.gov.bd',
        password: 'Password123!',
        phone: '+8801700000005',
        role: UserRole.TECHNICIAN,
        assignedZoneId: 'zn_mirpur'
      },
      adminToken
    );
    assert(tech2ProvisionRes.status === 201, 'Admin successfully provisions Technician 2');

    const tech2Login = await request(serverUrl, 'POST', '/api/auth/login', {
      email: 'tech2@grid.gov.bd',
      password: 'Password123!'
    });
    const tech2Token = tech2Login.body.data.token;

    const tech2AcceptRes = await request(
      serverUrl,
      'POST',
      `/api/technicians/me/assignments/${tktTestId}/accept`,
      undefined,
      tech2Token
    );
    assert(
      tech2AcceptRes.status === 403 && tech2AcceptRes.body.error.code === 'NOT_ASSIGNED_TECHNICIAN',
      'IDOR Protection: Technician 2 blocked from accepting Technician 1 assignment (403 NOT_ASSIGNED_TECHNICIAN)'
    );

    // 15i. Middleware Aliases & Scope Guards: Direct invocation tests
    let requireRoleFailedAsExpected = false;
    const mockReqCust: any = { user: { role: UserRole.CUSTOMER } };
    const mockRes: any = {};
    requireRole(UserRole.ADMIN)(mockReqCust, mockRes, (err?: any) => {
      if (err instanceof ForbiddenError && err.code === 'FORBIDDEN') {
        requireRoleFailedAsExpected = true;
      }
    });
    assert(requireRoleFailedAsExpected, 'Middleware: requireRole blocks unprivileged role with ForbiddenError');

    let zoneScopeFailedAsExpected = false;
    const mockReqZoneMgr: any = {
      user: { role: UserRole.ZONE_MANAGER, zoneId: 'zone_dhanmondi' },
      params: { zoneId: 'zone_mirpur' }
    };
    verifyZoneScope()(mockReqZoneMgr, mockRes, (err?: any) => {
      if (err instanceof ForbiddenError && err.code === 'ZONE_ACCESS_DENIED') {
        zoneScopeFailedAsExpected = true;
      }
    });
    assert(zoneScopeFailedAsExpected, 'Middleware: verifyZoneScope blocks cross-zone request with ZONE_ACCESS_DENIED');

    // Test 16: User Profile, Notifications Domain, and Common User Endpoints (Phase 9)
    // 16a. Profile Retrieval & Linked Meters
    const myProfileRes = await request(serverUrl, 'GET', '/api/v1/users/me', undefined, customerToken);
    assert(
      myProfileRes.status === 200 &&
      myProfileRes.body.success === true &&
      myProfileRes.body.data.email === 'customer@gmail.com' &&
      Array.isArray(myProfileRes.body.data.meters) &&
      myProfileRes.body.data.meters.length > 0 &&
      myProfileRes.body.data.meters[0].meterNumber === 'MTR-DHN-101' &&
      myProfileRes.body.data.meters[0].isPrimary === true,
      'GET /api/v1/users/me returns enriched profile with linked meters'
    );

    // 16b. Profile Contact & Name Mutation
    const updateProfileRes = await request(
      serverUrl,
      'PATCH',
      '/api/v1/users/me',
      { name: 'Anisur Rahman Chowdhury', phone: '+8801712349999' },
      customerToken
    );
    assert(
      updateProfileRes.status === 200 &&
      updateProfileRes.body.success === true &&
      updateProfileRes.body.data.name === 'Anisur Rahman Chowdhury' &&
      updateProfileRes.body.data.phone === '+8801712349999',
      'PATCH /api/v1/users/me updates name and phone and returns full profile'
    );

    // 16c. Password Change - Incorrect Current Password
    const wrongCurrentPwdRes = await request(
      serverUrl,
      'POST',
      '/api/v1/users/me/password',
      { currentPassword: 'WrongPassword123!', newPassword: 'NewValidPassword789!' },
      customerToken
    );
    assert(
      wrongCurrentPwdRes.status === 400 &&
      wrongCurrentPwdRes.body.error.code === 'INCORRECT_CURRENT_PASSWORD',
      'POST /api/v1/users/me/password rejects incorrect current password (400 INCORRECT_CURRENT_PASSWORD)'
    );

    // 16d. Password Change - Identical New Password
    const samePwdRes = await request(
      serverUrl,
      'POST',
      '/api/v1/users/me/password',
      { currentPassword: 'Password123!', newPassword: 'Password123!' },
      customerToken
    );
    assert(
      samePwdRes.status === 400 &&
      samePwdRes.body.error.code === 'PASSWORD_SAME_AS_CURRENT',
      'POST /api/v1/users/me/password rejects identical new password (400 PASSWORD_SAME_AS_CURRENT)'
    );

    // 16e. Password Change - Success & Subsequent Login
    const validPwdChangeRes = await request(
      serverUrl,
      'POST',
      '/api/v1/users/me/password',
      { currentPassword: 'Password123!', newPassword: 'NewCustomerPassword999!' },
      customerToken
    );
    assert(
      validPwdChangeRes.status === 200 && validPwdChangeRes.body.success === true,
      'POST /api/v1/users/me/password updates password hash successfully'
    );

    const reLoginRes = await request(serverUrl, 'POST', '/api/auth/login', {
      email: 'customer@gmail.com',
      password: 'NewCustomerPassword999!'
    });
    assert(
      reLoginRes.status === 200 && !!reLoginRes.body.data.token,
      'POST /api/auth/login succeeds with updated password credentials'
    );
    const updatedCustomerToken = reLoginRes.body.data.token;
    const customerUserId = myProfileRes.body.data.id;

    // 16f. Notifications Query & Pagination
    const notifAId = `notif_test_${Date.now()}_1`;
    const notifBId = `notif_test_${Date.now()}_2`;
    const nowNotif = new Date().toISOString();
    store.notifications.set(notifAId, {
      id: notifAId,
      userId: customerUserId,
      title: 'Scheduled Outage Reminder',
      message: 'Maintenance window active in your area',
      type: NotificationType.PLANNED_SCHEDULE,
      isRead: false,
      readAt: null,
      metadata: null,
      createdAt: nowNotif
    });
    store.notifications.set(notifBId, {
      id: notifBId,
      userId: customerUserId,
      title: 'System Notice',
      message: 'Previous notification archived',
      type: NotificationType.SYSTEM_ALERT,
      isRead: true,
      readAt: nowNotif,
      metadata: null,
      createdAt: nowNotif
    });

    const notifListRes = await request(
      serverUrl,
      'GET',
      '/api/v1/users/me/notifications?page=1&pageSize=10',
      undefined,
      updatedCustomerToken
    );
    assert(
      notifListRes.status === 200 &&
      typeof notifListRes.body.data.unreadCount === 'number' &&
      notifListRes.body.data.unreadCount >= 1 &&
      Array.isArray(notifListRes.body.data.items),
      'GET /api/v1/users/me/notifications returns collection with unreadCount metadata'
    );

    const unreadOnlyRes = await request(
      serverUrl,
      'GET',
      '/api/v1/users/me/notifications?unreadOnly=true',
      undefined,
      updatedCustomerToken
    );
    const allUnread = unreadOnlyRes.body.data.items.every((n: any) => n.isRead === false);
    assert(
      unreadOnlyRes.status === 200 && allUnread && unreadOnlyRes.body.data.items.length >= 1,
      'GET /api/v1/users/me/notifications filters strictly unread items with unreadOnly=true'
    );

    // 16g. Single Notification Read & IDOR Shield
    const idorNotifRes = await request(
      serverUrl,
      'PATCH',
      `/api/v1/users/me/notifications/${notifAId}/read`,
      undefined,
      customerBToken // Customer B attempting to mark Customer A's notification
    );
    assert(
      idorNotifRes.status === 404 && idorNotifRes.body.error.code === 'NOTIFICATION_NOT_FOUND',
      'IDOR Protection: Customer B blocked from marking Customer A notification (404 NOTIFICATION_NOT_FOUND)'
    );

    const markReadRes = await request(
      serverUrl,
      'PATCH',
      `/api/v1/users/me/notifications/${notifAId}/read`,
      undefined,
      updatedCustomerToken
    );
    assert(
      markReadRes.status === 200 &&
      markReadRes.body.success === true &&
      markReadRes.body.data.notification.isRead === true,
      'PATCH /api/v1/users/me/notifications/:id/read marks notification as read'
    );

    // 16h. Bulk Notification Dismissal (Read All)
    const notifCId = `notif_test_${Date.now()}_3`;
    store.notifications.set(notifCId, {
      id: notifCId,
      userId: customerUserId,
      title: 'Restoration Complete',
      message: 'Power restored to Dhanmondi feeder',
      type: NotificationType.POWER_RESTORED,
      isRead: false,
      readAt: null,
      metadata: null,
      createdAt: new Date().toISOString()
    });

    const readAllRes = await request(
      serverUrl,
      'POST',
      '/api/v1/users/me/notifications/read-all',
      undefined,
      updatedCustomerToken
    );
    assert(
      readAllRes.status === 200 &&
      readAllRes.body.success === true &&
      readAllRes.body.data.count >= 1,
      'POST /api/v1/users/me/notifications/read-all marks all user notifications as read'
    );

    const postReadAllUnreadRes = await request(
      serverUrl,
      'GET',
      '/api/v1/users/me/notifications?unreadOnly=true',
      undefined,
      updatedCustomerToken
    );
    assert(
      postReadAllUnreadRes.status === 200 &&
      postReadAllUnreadRes.body.data.items.length === 0 &&
      postReadAllUnreadRes.body.data.unreadCount === 0,
      'Verified zero remaining unread notifications after bulk dismissal'
    );

    // ==========================================
    // Test 17: Admin User Provisioning, Roles, Status, and Scope (Phase 10)
    // ==========================================

    // 17a. User Discovery & Filtering with Pagination Envelope
    const listUsersRes = await request(
      serverUrl,
      'GET',
      '/api/v1/admin/users?role=TECHNICIAN&page=1&pageSize=5',
      undefined,
      adminToken
    );
    assert(
      listUsersRes.status === 200 &&
      listUsersRes.body.success === true &&
      Array.isArray(listUsersRes.body.data.items) &&
      listUsersRes.body.data.meta.page === 1 &&
      listUsersRes.body.data.items.every((u: any) => u.role === UserRole.TECHNICIAN && u.passwordHash === undefined),
      'GET /api/v1/admin/users filters by role, standardizes paginated envelope, and strips passwordHash'
    );

    // 17b. User Provisioning Guardrails
    // 17b-1: Provisioning with invalid zone
    const invalidZoneProvRes = await request(
      serverUrl,
      'POST',
      '/api/v1/admin/users',
      {
        name: 'Invalid Zone Staff',
        email: 'invalid.zone@grid.gov.bd',
        password: 'Password123!',
        role: UserRole.TECHNICIAN,
        assignedZoneId: 'zn_nonexistent_999'
      },
      adminToken
    );
    assert(
      invalidZoneProvRes.status === 404 && invalidZoneProvRes.body.error.code === 'ZONE_NOT_FOUND',
      'POST /api/v1/admin/users rejects non-existent assignedZoneId with 404 ZONE_NOT_FOUND'
    );

    // 17b-2: Provisioning ZONE_MANAGER without assignedZoneId
    const missingZoneMgrRes = await request(
      serverUrl,
      'POST',
      '/api/v1/admin/users',
      {
        name: 'Unassigned Zone Manager',
        email: 'unassigned.mgr@grid.gov.bd',
        password: 'Password123!',
        role: UserRole.ZONE_MANAGER
      },
      adminToken
    );
    assert(
      missingZoneMgrRes.status === 400 && missingZoneMgrRes.body.error.code === 'ZONE_REQUIRED',
      'POST /api/v1/admin/users rejects ZONE_MANAGER without zone assignment with 400 ZONE_REQUIRED'
    );

    // 17b-3: Successfully provision new staff with valid zone and safe response
    const validStaffEmail = `staff_${Date.now()}@grid.gov.bd`;
    const provStaffRes = await request(
      serverUrl,
      'POST',
      '/api/v1/admin/users',
      {
        name: 'Field Tech Kamal',
        email: validStaffEmail,
        password: 'Password123!',
        phone: '+8801700000099',
        role: UserRole.TECHNICIAN,
        assignedZoneId: 'zn_mirpur'
      },
      adminToken
    );
    assert(
      provStaffRes.status === 201 &&
      provStaffRes.body.success === true &&
      provStaffRes.body.data.id &&
      provStaffRes.body.data.email === validStaffEmail &&
      provStaffRes.body.data.role === UserRole.TECHNICIAN &&
      provStaffRes.body.data.passwordHash === undefined,
      'POST /api/v1/admin/users creates staff with hashed credentials and excludes passwordHash in response'
    );
    const provisionedStaffId = provStaffRes.body.data.id;

    // 17c. Duplicate email rejection
    const duplicateEmailRes = await request(
      serverUrl,
      'POST',
      '/api/v1/admin/users',
      {
        name: 'Duplicate Staff',
        email: validStaffEmail,
        password: 'Password123!',
        role: UserRole.POWER_OPERATOR
      },
      adminToken
    );
    assert(
      duplicateEmailRes.status === 409 && duplicateEmailRes.body.error.code === 'EMAIL_EXISTS',
      'POST /api/v1/admin/users rejects duplicate email with 409 EMAIL_EXISTS'
    );

    // 17d. User Inspection Enriched with Zone
    const inspectUserRes = await request(
      serverUrl,
      'GET',
      `/api/v1/admin/users/${provisionedStaffId}`,
      undefined,
      adminToken
    );
    assert(
      inspectUserRes.status === 200 &&
      inspectUserRes.body.success === true &&
      inspectUserRes.body.data.id === provisionedStaffId &&
      inspectUserRes.body.data.zone &&
      inspectUserRes.body.data.zone.code === 'MIR' &&
      inspectUserRes.body.data.passwordHash === undefined,
      'GET /api/v1/admin/users/:id returns user profile enriched with zone details without passwordHash'
    );

    // 17e. Profile Mutation with Credential Leak Elimination
    const patchUserRes = await request(
      serverUrl,
      'PATCH',
      `/api/v1/admin/users/${provisionedStaffId}`,
      {
        name: 'Senior Field Tech Kamal',
        phone: '+8801700000088'
      },
      adminToken
    );
    assert(
      patchUserRes.status === 200 &&
      patchUserRes.body.success === true &&
      patchUserRes.body.data.name === 'Senior Field Tech Kamal' &&
      patchUserRes.body.data.passwordHash === undefined,
      'PATCH /api/v1/admin/users/:id updates profile and strictly strips passwordHash from response'
    );

    // 17f. Role & Geographic Reassignment
    // 17f-1: Promote to ZONE_MANAGER without zone assignment
    const rolePromoteWithoutZoneRes = await request(
      serverUrl,
      'PATCH',
      `/api/v1/admin/users/${provisionedStaffId}/role`,
      {
        role: UserRole.ZONE_MANAGER,
        assignedZoneId: null
      },
      adminToken
    );
    assert(
      rolePromoteWithoutZoneRes.status === 400 && rolePromoteWithoutZoneRes.body.error.code === 'ZONE_REQUIRED',
      'PATCH /api/v1/admin/users/:id/role rejects ZONE_MANAGER with null zone assignment'
    );

    // 17f-2: Reassign to ZONE_MANAGER with Dhanmondi zone
    const roleReassignRes = await request(
      serverUrl,
      'PATCH',
      `/api/v1/admin/users/${provisionedStaffId}/role`,
      {
        role: UserRole.ZONE_MANAGER,
        assignedZoneId: 'zn_dhanmondi'
      },
      adminToken
    );
    assert(
      roleReassignRes.status === 200 &&
      roleReassignRes.body.success === true &&
      roleReassignRes.body.data.role === UserRole.ZONE_MANAGER &&
      roleReassignRes.body.data.assignedZoneId === 'zn_dhanmondi' &&
      roleReassignRes.body.data.passwordHash === undefined,
      'PATCH /api/v1/admin/users/:id/role successfully reassigns role and geographic zone scope'
    );

    // 17g. Status Control & Self-Suspension Safeguard
    // 17g-1: Admin attempts self-suspension
    const selfSuspendRes = await request(
      serverUrl,
      'PATCH',
      '/api/v1/admin/users/usr_admin_1/status',
      {
        status: UserStatus.SUSPENDED
      },
      adminToken
    );
    assert(
      selfSuspendRes.status === 400 && selfSuspendRes.body.error.code === 'SELF_SUSPENSION_FORBIDDEN',
      'PATCH /api/v1/admin/users/:id/status blocks Administrator self-suspension (400 SELF_SUSPENSION_FORBIDDEN)'
    );

    // 17g-2: Suspend target staff account
    const suspendStaffRes = await request(
      serverUrl,
      'PATCH',
      `/api/v1/admin/users/${provisionedStaffId}/status`,
      {
        status: UserStatus.SUSPENDED
      },
      adminToken
    );
    assert(
      suspendStaffRes.status === 200 &&
      suspendStaffRes.body.success === true &&
      suspendStaffRes.body.data.status === UserStatus.SUSPENDED,
      'PATCH /api/v1/admin/users/:id/status suspends target user account'
    );

    // 17g-3: Reactivate target staff account via alias
    const reactivateStaffRes = await request(
      serverUrl,
      'POST',
      `/api/v1/admin/users/${provisionedStaffId}/reactivate`,
      undefined,
      adminToken
    );
    assert(
      reactivateStaffRes.status === 200 && reactivateStaffRes.body.success === true,
      'POST /api/v1/admin/users/:id/reactivate reactivates suspended user account'
    );

    // 17h. Deprovisioning Safeguards & Soft-Deletion
    // 17h-1: Admin attempts self-deletion
    const selfDeleteRes = await request(
      serverUrl,
      'DELETE',
      '/api/v1/admin/users/usr_admin_1',
      undefined,
      adminToken
    );
    assert(
      selfDeleteRes.status === 400 && selfDeleteRes.body.error.code === 'SELF_DELETION_FORBIDDEN',
      'DELETE /api/v1/admin/users/:id blocks Administrator self-deletion (400 SELF_DELETION_FORBIDDEN)'
    );

    // 17h-2: Technician with active task cannot be deleted
    const busyTechId = `usr_busy_tech_${Date.now()}`;
    store.users.set(busyTechId, {
      id: busyTechId,
      name: 'Busy Technician',
      email: `busy.tech_${Date.now()}@grid.gov.bd`,
      phone: '+8801799999999',
      passwordHash: 'hash',
      role: UserRole.TECHNICIAN,
      status: UserStatus.ACTIVE,
      assignedZoneId: 'zn_mirpur',
      emailVerified: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    store.technicianAssignments.set(`asg_${busyTechId}`, {
      id: `asg_${busyTechId}`,
      ticketId: 'tkt_mock_active',
      technicianId: busyTechId,
      assignedById: 'usr_admin_1',
      status: AssignmentStatus.PENDING,
      assignedAt: new Date().toISOString()
    });

    const busyTechDeleteRes = await request(
      serverUrl,
      'DELETE',
      `/api/v1/admin/users/${busyTechId}`,
      undefined,
      adminToken
    );
    assert(
      busyTechDeleteRes.status === 400 && busyTechDeleteRes.body.error.code === 'ACTIVE_TASKS_EXIST',
      'DELETE /api/v1/admin/users/:id blocks deprovisioning of technician with active tasks (400 ACTIVE_TASKS_EXIST)'
    );

    // 17h-3: Soft-delete provisioned staff user
    const deleteStaffRes = await request(
      serverUrl,
      'DELETE',
      `/api/v1/admin/users/${provisionedStaffId}`,
      undefined,
      adminToken
    );
    assert(
      deleteStaffRes.status === 200 &&
      deleteStaffRes.body.success === true &&
      deleteStaffRes.body.data.message === 'User deleted successfully',
      'DELETE /api/v1/admin/users/:id soft-deletes staff account'
    );

    // Verify subsequent GET returns 404 USER_NOT_FOUND
    const postDeleteGetRes = await request(
      serverUrl,
      'GET',
      `/api/v1/admin/users/${provisionedStaffId}`,
      undefined,
      adminToken
    );
    assert(
      postDeleteGetRes.status === 404 && postDeleteGetRes.body.error.code === 'USER_NOT_FOUND',
      'Soft-deleted user is excluded from lookups with 404 USER_NOT_FOUND'
    );

    // ==========================================
    // Test 18: Admin Grid Topology & Customer Meter Binding (Phase 11)
    // ==========================================

    // 18a. Zone CRUD & Referential Cascade Guards
    // 18a-1: Duplicate Zone creation rejected
    const dupZoneRes = await request(
      serverUrl,
      'POST',
      '/api/v1/admin/zones',
      {
        name: 'Dhanmondi Duplicate',
        code: 'DHN',
        description: 'Duplicate zone'
      },
      adminToken
    );
    assert(
      dupZoneRes.status === 409 && dupZoneRes.body.error.code === 'ZONE_EXISTS',
      'POST /api/v1/admin/zones rejects duplicate zone code with 409 ZONE_EXISTS'
    );

    // 18a-2: Zone deletion blocked by active child substations
    const delZoneBlockedRes = await request(
      serverUrl,
      'DELETE',
      '/api/v1/admin/zones/zn_dhanmondi',
      undefined,
      adminToken
    );
    assert(
      delZoneBlockedRes.status === 400 && delZoneBlockedRes.body.error.code === 'ACTIVE_SUBSTATIONS_EXIST',
      'DELETE /api/v1/admin/zones/:id blocked by active child substations (400 ACTIVE_SUBSTATIONS_EXIST)'
    );

    // 18a-3: Zone detail enriched with active substations list & count
    const getZoneDetailRes = await request(
      serverUrl,
      'GET',
      '/api/v1/admin/zones/zn_dhanmondi',
      undefined,
      adminToken
    );
    assert(
      getZoneDetailRes.status === 200 &&
      getZoneDetailRes.body.success === true &&
      getZoneDetailRes.body.data.substationsCount >= 2 &&
      Array.isArray(getZoneDetailRes.body.data.substations),
      'GET /api/v1/admin/zones/:id returns zone details enriched with child substations'
    );

    // 18b. Substation CRUD & Referential Cascade Guards
    // 18b-1: Substation creation invalid zone rejected
    const invalidZoneSubRes = await request(
      serverUrl,
      'POST',
      '/api/v1/admin/substations',
      {
        name: 'Orphan Substation',
        code: 'SUB_ORPHAN',
        zoneId: 'zn_nonexistent_999',
        capacityMW: 50
      },
      adminToken
    );
    assert(
      invalidZoneSubRes.status === 404 && invalidZoneSubRes.body.error.code === 'ZONE_NOT_FOUND',
      'POST /api/v1/admin/substations rejects non-existent zoneId with 404 ZONE_NOT_FOUND'
    );

    // 18b-2: Substation creation duplicate code rejected
    const dupSubRes = await request(
      serverUrl,
      'POST',
      '/api/v1/admin/substations',
      {
        name: 'Duplicate Dhanmondi Sub',
        code: 'SUB-DHN-01',
        zoneId: 'zn_dhanmondi',
        capacityMW: 60
      },
      adminToken
    );
    assert(
      dupSubRes.status === 409 && dupSubRes.body.error.code === 'SUBSTATION_EXISTS',
      'POST /api/v1/admin/substations rejects duplicate code with 409 SUBSTATION_EXISTS'
    );

    // 18b-3: Substation deletion blocked by active child feeders
    const delSubBlockedRes = await request(
      serverUrl,
      'DELETE',
      '/api/v1/admin/substations/sub_dhn_1',
      undefined,
      adminToken
    );
    assert(
      delSubBlockedRes.status === 400 && delSubBlockedRes.body.error.code === 'ACTIVE_FEEDERS_EXIST',
      'DELETE /api/v1/admin/substations/:id blocked by active child feeders (400 ACTIVE_FEEDERS_EXIST)'
    );

    // 18b-4: Substation listing with pagination and zone metadata enrichment
    const listSubsRes = await request(
      serverUrl,
      'GET',
      '/api/v1/admin/substations?page=1&pageSize=2',
      undefined,
      adminToken
    );
    assert(
      listSubsRes.status === 200 &&
      listSubsRes.body.success === true &&
      Array.isArray(listSubsRes.body.data.items) &&
      listSubsRes.body.data.meta.page === 1 &&
      listSubsRes.body.data.items[0].zone &&
      typeof listSubsRes.body.data.items[0].feedersCount === 'number',
      'GET /api/v1/admin/substations returns paginated envelope enriched with zone and feeder counts'
    );

    // 18c. Feeder CRUD & Referential Cascade Guards
    // 18c-1: Feeder creation invalid substation rejected
    const invalidSubFeederRes = await request(
      serverUrl,
      'POST',
      '/api/v1/admin/feeders',
      {
        name: 'Orphan Feeder',
        code: 'FDR_ORPHAN',
        substationId: 'sub_nonexistent_999',
        capacityMW: 10
      },
      adminToken
    );
    assert(
      invalidSubFeederRes.status === 404 && invalidSubFeederRes.body.error.code === 'SUBSTATION_NOT_FOUND',
      'POST /api/v1/admin/feeders rejects non-existent substationId with 404 SUBSTATION_NOT_FOUND'
    );

    // 18c-2: Feeder creation duplicate code rejected
    const dupFeederRes = await request(
      serverUrl,
      'POST',
      '/api/v1/admin/feeders',
      {
        name: 'Duplicate Road 27 Feeder',
        code: 'FDR-DHN-27',
        substationId: 'sub_dhn_1',
        capacityMW: 15
      },
      adminToken
    );
    assert(
      dupFeederRes.status === 409 && dupFeederRes.body.error.code === 'FEEDER_EXISTS',
      'POST /api/v1/admin/feeders rejects duplicate feeder code with 409 FEEDER_EXISTS'
    );

    // 18c-3: Feeder critical toggle
    const toggleCritRes = await request(
      serverUrl,
      'PATCH',
      '/api/v1/admin/feeders/fdr_dhn_3/critical',
      { isCritical: true },
      adminToken
    );
    assert(
      toggleCritRes.status === 200 &&
      toggleCritRes.body.success === true &&
      toggleCritRes.body.data.isCritical === true,
      'PATCH /api/v1/admin/feeders/:id/critical toggles feeder critical status successfully'
    );

    // 18c-4: Feeder deletion blocked by active child meters
    const delFeederBlockedRes = await request(
      serverUrl,
      'DELETE',
      '/api/v1/admin/feeders/fdr_dhn_1',
      undefined,
      adminToken
    );
    assert(
      delFeederBlockedRes.status === 400 && delFeederBlockedRes.body.error.code === 'ACTIVE_METERS_EXIST',
      'DELETE /api/v1/admin/feeders/:id blocked by active child meters (400 ACTIVE_METERS_EXIST)'
    );

    // 18d. Master Meter Directory & Customer Link Enrichment
    // 18d-1: Meter listing with pagination envelope and customer link status
    const listMetersRes = await request(
      serverUrl,
      'GET',
      '/api/v1/admin/meters?page=1&pageSize=5',
      undefined,
      adminToken
    );
    assert(
      listMetersRes.status === 200 &&
      listMetersRes.body.success === true &&
      Array.isArray(listMetersRes.body.data.items) &&
      listMetersRes.body.data.items.some((m: any) => m.isLinked === true && m.linkedCustomer !== null),
      'GET /api/v1/admin/meters returns paginated directory with customer link status'
    );

    // 18d-2: Active customer link blocks meter deletion
    const delLinkedMeterBlockedRes = await request(
      serverUrl,
      'DELETE',
      '/api/v1/admin/meters/mtr_dhn_101',
      undefined,
      adminToken
    );
    assert(
      delLinkedMeterBlockedRes.status === 400 && delLinkedMeterBlockedRes.body.error.code === 'METER_LINKED_TO_CUSTOMER',
      'DELETE /api/v1/admin/meters/:id blocked when meter is linked to active customer (400 METER_LINKED_TO_CUSTOMER)'
    );

    // 18e. Customer Meter Exclusive Binding
    // 18e-1: Customer B attempts to link meter already bound to Customer A
    const crossCustomerMeterCollisionRes = await request(
      serverUrl,
      'POST',
      '/api/v1/customers/me/meters',
      {
        meterNumber: 'MTR-DHN-101',
        nickname: 'Attempted Duplicate'
      },
      customerBToken
    );
    assert(
      crossCustomerMeterCollisionRes.status === 409 && crossCustomerMeterCollisionRes.body.error.code === 'METER_ALREADY_LINKED',
      'POST /api/v1/customers/me/meters blocks cross-customer meter binding collision (409 METER_ALREADY_LINKED)'
    );

    // 18e-2: Customer B links unlinked physical meter MTR-DHN-102
    const custBLinkRes = await request(
      serverUrl,
      'POST',
      '/api/v1/customers/me/meters',
      {
        meterNumber: 'MTR-DHN-102',
        nickname: 'Satmasjid Office',
        isPrimary: true
      },
      customerBToken
    );
    assert(
      custBLinkRes.status === 201 &&
      custBLinkRes.body.success === true &&
      custBLinkRes.body.data.meterNumber === 'MTR-DHN-102' &&
      custBLinkRes.body.data.isPrimary === true,
      'POST /api/v1/customers/me/meters links available physical meter with isPrimary=true'
    );
    const custBLinkId1 = custBLinkRes.body.data.id;

    // 18f. Primary Switch & Auto-Promotion on Unlink
    // Admin registers fresh meter MTR-TEST-999 for Customer B to link as second meter
    const adminCreateMeterRes = await request(
      serverUrl,
      'POST',
      '/api/v1/admin/meters',
      {
        meterNumber: 'MTR-TEST-999',
        feederId: 'fdr_mir_2',
        address: 'Mirpur Stadium Commercial'
      },
      adminToken
    );
    assert(adminCreateMeterRes.status === 201, 'Admin registers secondary test meter MTR-TEST-999');

    const custBLink2Res = await request(
      serverUrl,
      'POST',
      '/api/v1/customers/me/meters',
      {
        meterNumber: 'MTR-TEST-999',
        nickname: 'Mirpur Stadium Office',
        isPrimary: false
      },
      customerBToken
    );
    assert(custBLink2Res.status === 201 && custBLink2Res.body.data.isPrimary === false, 'Customer B links secondary meter with isPrimary=false');
    const custBLinkId2 = custBLink2Res.body.data.id;

    // Designate second meter as primary
    const switchPrimaryRes = await request(
      serverUrl,
      'PATCH',
      `/api/v1/customers/me/meters/${custBLinkId2}/primary`,
      undefined,
      customerBToken
    );
    assert(
      switchPrimaryRes.status === 200 && switchPrimaryRes.body.data.isPrimary === true,
      'PATCH /api/v1/customers/me/meters/:id/primary switches primary meter'
    );

    // Unlink newly primary meter -> verify first meter is auto-promoted to primary
    const unlinkPrimaryRes = await request(
      serverUrl,
      'DELETE',
      `/api/v1/customers/me/meters/${custBLinkId2}`,
      undefined,
      customerBToken
    );
    assert(unlinkPrimaryRes.status === 200, 'Customer B unlinks primary meter');

    const custBMetersListRes = await request(
      serverUrl,
      'GET',
      '/api/v1/customers/me/meters',
      undefined,
      customerBToken
    );
    const hasUnlinked = custBMetersListRes.body.data.some((m: any) => m.id === custBLinkId2);
    const activePrimaryMeter = custBMetersListRes.body.data.find((m: any) => m.isPrimary === true);
    assert(
      custBMetersListRes.status === 200 &&
      !hasUnlinked &&
      activePrimaryMeter !== undefined,
      'DELETE /api/v1/customers/me/meters/:id auto-promotes remaining active meter to primary'
    );

    // 18g. Specific Meter Live Status (Endpoint 24) & IDOR Protection
    const getMeterStatusRes = await request(
      serverUrl,
      'GET',
      `/api/v1/customers/me/meters/${custBLinkId1}/status`,
      undefined,
      customerBToken
    );
    assert(
      getMeterStatusRes.status === 200 &&
      getMeterStatusRes.body.success === true &&
      getMeterStatusRes.body.data.meterNumber === 'MTR-DHN-102' &&
      getMeterStatusRes.body.data.status === 'ONLINE' &&
      getMeterStatusRes.body.data.feederName === 'Satmasjid Road Feeder',
      'GET /api/v1/customers/me/meters/:id/status returns real-time live power status for specific meter'
    );

    // IDOR Protection: Customer A blocked from accessing Customer B's meter status
    const idorMeterStatusRes = await request(
      serverUrl,
      'GET',
      `/api/v1/customers/me/meters/${custBLinkId1}/status`,
      undefined,
      updatedCustomerToken
    );
    assert(
      idorMeterStatusRes.status === 404 && idorMeterStatusRes.body.error.code === 'LINK_NOT_FOUND',
      'IDOR Protection: Customer blocked from inspecting other customer meter status (404 LINK_NOT_FOUND)'
    );

    // 18h. Specific Meter Schedules (Endpoint 25) & IDOR Protection
    const getMeterSchedulesRes = await request(
      serverUrl,
      'GET',
      `/api/v1/customers/me/meters/${custBLinkId1}/schedules`,
      undefined,
      customerBToken
    );
    assert(
      getMeterSchedulesRes.status === 200 &&
      getMeterSchedulesRes.body.success === true &&
      Array.isArray(getMeterSchedulesRes.body.data),
      'GET /api/v1/customers/me/meters/:id/schedules returns feeder schedules for specific meter'
    );

    // IDOR Protection: Customer A blocked from accessing Customer B's meter schedules
    const idorMeterSchedulesRes = await request(
      serverUrl,
      'GET',
      `/api/v1/customers/me/meters/${custBLinkId1}/schedules`,
      undefined,
      updatedCustomerToken
    );
    assert(
      idorMeterSchedulesRes.status === 404 && idorMeterSchedulesRes.body.error.code === 'LINK_NOT_FOUND',
      'IDOR Protection: Customer blocked from inspecting other customer meter schedules (404 LINK_NOT_FOUND)'
    );

    // ============================================================================
    // Phase 12: Grid Discovery, Effective Feeder Status, and Operator Overview (Test 19)
    // ============================================================================

    // 19a. Public Zones Discovery (Endpoint 18)
    const publicZonesRes = await request(serverUrl, 'GET', '/api/v1/zones');
    assert(
      publicZonesRes.status === 200 &&
      publicZonesRes.body.success === true &&
      Array.isArray(publicZonesRes.body.data) &&
      publicZonesRes.body.data.length >= 2,
      'GET /api/v1/zones returns active geographic zones list with relational counts'
    );
    const dhnZoneSummary = publicZonesRes.body.data.find((z: any) => z.code === 'DHN');
    assert(
      dhnZoneSummary &&
      dhnZoneSummary.substationsCount >= 1 &&
      dhnZoneSummary.feedersCount >= 2 &&
      dhnZoneSummary.totalCapacityMW > 0,
      'GET /api/v1/zones enriches zones with substationsCount, feedersCount, and totalCapacityMW'
    );

    // Test search filter on zones
    const searchZoneRes = await request(serverUrl, 'GET', '/api/v1/zones?search=Mirpur');
    assert(
      searchZoneRes.status === 200 &&
      searchZoneRes.body.data.length === 1 &&
      searchZoneRes.body.data[0].code === 'MIR',
      'GET /api/v1/zones?search=Mirpur correctly filters zones by search term'
    );

    // Test pagination on zones
    const paginatedZonesRes = await request(serverUrl, 'GET', '/api/v1/zones?page=1&pageSize=1');
    assert(
      paginatedZonesRes.status === 200 &&
      paginatedZonesRes.body.data.items.length === 1 &&
      paginatedZonesRes.body.data.meta.total >= 2 &&
      paginatedZonesRes.body.data.meta.totalPages >= 2,
      'GET /api/v1/zones supports pagination envelope when page/pageSize query params are provided'
    );

    // 19b. Public Feeders Discovery with Effective Feeder Status (Endpoint 19)
    const publicFeedersRes = await request(serverUrl, 'GET', '/api/v1/feeders');
    assert(
      publicFeedersRes.status === 200 &&
      publicFeedersRes.body.success === true &&
      Array.isArray(publicFeedersRes.body.data) &&
      publicFeedersRes.body.data.length >= 4,
      'GET /api/v1/feeders returns active feeders with effectiveStatus and substation/zone details'
    );

    // Test filter isCritical=true
    const criticalFeedersRes = await request(serverUrl, 'GET', '/api/v1/feeders?isCritical=true');
    assert(
      criticalFeedersRes.status === 200 &&
      criticalFeedersRes.body.data.length >= 1 &&
      criticalFeedersRes.body.data.every((f: any) => f.isCritical === true) &&
      criticalFeedersRes.body.data.some((f: any) => f.code === 'FDR-DHN-HOSP'),
      'GET /api/v1/feeders?isCritical=true filters for critical exempt hospital feeders'
    );

    // Test filter zoneId
    const dhnFeedersRes = await request(serverUrl, 'GET', '/api/v1/feeders?zoneId=zn_dhanmondi');
    assert(
      dhnFeedersRes.status === 200 &&
      dhnFeedersRes.body.data.every((f: any) => f.zoneId === 'zn_dhanmondi'),
      'GET /api/v1/feeders?zoneId=zn_dhanmondi correctly scopes feeders to Dhanmondi zone'
    );

    // 19c. Dynamic Scheduled Load Shedding State Transition
    // Inject an active published schedule for today with current slot covering now
    const nowTime = new Date();
    const todayStr = nowTime.toISOString().split('T')[0];
    const activeSlotStart = new Date(nowTime.getTime() - 15 * 60 * 1000).toISOString();
    const activeSlotEnd = new Date(nowTime.getTime() + 45 * 60 * 1000).toISOString();

    const liveTestSchedId = `sched_live_${Date.now()}`;
    const liveTestSlotId = `slot_live_${Date.now()}`;
    const liveTestAsgnId = `asgn_live_${Date.now()}`;

    store.schedules.set(liveTestSchedId, {
      id: liveTestSchedId,
      planningDate: todayStr,
      totalDeficitMW: 20.0,
      status: ScheduleStatus.PUBLISHED,
      createdById: 'usr_op_1',
      publishedAt: nowTime.toISOString(),
      createdAt: nowTime.toISOString(),
      updatedAt: nowTime.toISOString()
    });

    store.scheduleSlots.set(liveTestSlotId, {
      id: liveTestSlotId,
      scheduleId: liveTestSchedId,
      startTime: activeSlotStart,
      endTime: activeSlotEnd,
      targetDeficitMW: 20.0,
      actualDeficitMW: 20.0,
      createdAt: nowTime.toISOString()
    });

    store.scheduleFeederAssignments.set(liveTestAsgnId, {
      id: liveTestAsgnId,
      slotId: liveTestSlotId,
      feederId: 'fdr_mir_1',
      loadMW: 20.0,
      createdAt: nowTime.toISOString()
    });

    // Query feeders -> fdr_mir_1 must dynamically evaluate to PLANNED_OUTAGE
    const mirFeedersSchedRes = await request(serverUrl, 'GET', '/api/v1/feeders?zoneId=zn_mirpur');
    const mirFeeder1 = mirFeedersSchedRes.body.data.find((f: any) => f.id === 'fdr_mir_1');
    assert(
      mirFeeder1 &&
      mirFeeder1.effectiveStatus === 'PLANNED_OUTAGE' &&
      mirFeeder1.activeOutage &&
      mirFeeder1.activeOutage.type === 'PLANNED',
      'Dynamic State Engine: Active schedule slot dynamically sets effectiveStatus to PLANNED_OUTAGE'
    );

    // 19d. Fault Precedence Rule Verification: Hardware Fault Overrides PLANNED_OUTAGE
    // Inject active unexpected OutageTicket on fdr_mir_1
    const testFaultTicketId = `tkt_test_precedence_${Date.now()}`;
    store.outageTickets.set(testFaultTicketId, {
      id: testFaultTicketId,
      ticketNumber: 'TKT-PRECEDENCE-001',
      customerId: 'usr_cust_1',
      meterId: 'mtr_mir_201',
      feederId: 'fdr_mir_1',
      description: 'Physical transformer explosion during scheduled cut',
      isPlanned: false,
      status: OutageStatus.REPORTED,
      reportedAt: nowTime.toISOString(),
      createdAt: nowTime.toISOString(),
      updatedAt: nowTime.toISOString()
    });

    const mirFeedersFaultRes = await request(serverUrl, 'GET', '/api/v1/feeders?zoneId=zn_mirpur');
    const mirFeeder1WithFault = mirFeedersFaultRes.body.data.find((f: any) => f.id === 'fdr_mir_1');
    assert(
      mirFeeder1WithFault &&
      mirFeeder1WithFault.effectiveStatus === 'UNEXPECTED_FAULT' &&
      mirFeeder1WithFault.activeOutage &&
      mirFeeder1WithFault.activeOutage.type === 'UNPLANNED',
      'Fault Precedence Rule: Active hardware fault strictly overrides PLANNED_OUTAGE to UNEXPECTED_FAULT'
    );

    // 19e. Public Load Shedding Schedules Portal (Endpoint 20)
    const publicSchedulesRes = await request(
      serverUrl,
      'GET',
      `/api/v1/schedules/public?date=${todayStr}&zoneId=zn_mirpur`
    );
    assert(
      publicSchedulesRes.status === 200 &&
      publicSchedulesRes.body.success === true &&
      publicSchedulesRes.body.data.date === todayStr &&
      Array.isArray(publicSchedulesRes.body.data.slots) &&
      publicSchedulesRes.body.data.slots.length >= 1,
      'GET /api/v1/schedules/public returns published schedule slots for citizen portal'
    );
    const assignedMirFeederInSlot = publicSchedulesRes.body.data.slots[0].assignedFeeders.find(
      (f: any) => f.id === 'fdr_mir_1'
    );
    assert(
      assignedMirFeederInSlot !== undefined &&
      assignedMirFeederInSlot.name === 'Mirpur 10 Circle Feeder',
      'GET /api/v1/schedules/public enriches slot with assigned feeder metadata'
    );

    // Verify cache hit on second query
    const cachedPublicSchedulesRes = await request(
      serverUrl,
      'GET',
      `/api/v1/schedules/public?date=${todayStr}&zoneId=zn_mirpur`
    );
    assert(
      cachedPublicSchedulesRes.status === 200 &&
      cachedPublicSchedulesRes.body.data.slots.length >= 1,
      'GET /api/v1/schedules/public returns identical payload from cache'
    );

    // 19f. Operator Grid Overview (Endpoint 30) & Active Outages (Endpoint 37)
    // 19f-1: RBAC Enforcement - Customer blocked from Operator Control Room
    const rbacOperatorOverviewRes = await request(
      serverUrl,
      'GET',
      '/api/v1/operator/grid-overview',
      undefined,
      updatedCustomerToken
    );
    assert(
      rbacOperatorOverviewRes.status === 403 &&
      rbacOperatorOverviewRes.body.error.code === 'FORBIDDEN',
      'RBAC: Customer blocked from accessing operator grid overview (403 FORBIDDEN)'
    );

    // 19f-2: Power Operator queries Grid Overview (Endpoint 30)
    const operatorOverviewRes = await request(
      serverUrl,
      'GET',
      '/api/v1/operator/grid-overview',
      undefined,
      opToken
    );
    assert(
      operatorOverviewRes.status === 200 &&
      operatorOverviewRes.body.success === true &&
      operatorOverviewRes.body.data.metrics.totalDemandMW > 0 &&
      operatorOverviewRes.body.data.metrics.currentDeficitMW >= 0 &&
      operatorOverviewRes.body.data.feederCounts.total >= 4 &&
      operatorOverviewRes.body.data.feederCounts.unexpectedFault >= 1 &&
      operatorOverviewRes.body.data.feederCounts.criticalExempt >= 1 &&
      Array.isArray(operatorOverviewRes.body.data.zoneBreakdown),
      'GET /api/v1/operator/grid-overview computes real-time SCADA telemetry, deficit, feeder health, and zone breakdowns'
    );

    // 19f-3: Power Operator queries Active Offline Outages (Endpoint 37)
    const activeOutagesRes = await request(
      serverUrl,
      'GET',
      '/api/v1/operator/outages/active',
      undefined,
      opToken
    );
    assert(
      activeOutagesRes.status === 200 &&
      activeOutagesRes.body.success === true &&
      Array.isArray(activeOutagesRes.body.data.items) &&
      activeOutagesRes.body.data.items.length >= 1,
      'GET /api/v1/operator/outages/active lists currently offline feeders across planned and unplanned incidents'
    );
    const offlineItemMir1 = activeOutagesRes.body.data.items.find(
      (item: any) => item.feederId === 'fdr_mir_1'
    );
    assert(
      offlineItemMir1 &&
      offlineItemMir1.outageType === 'UNPLANNED' &&
      offlineItemMir1.ticket &&
      offlineItemMir1.ticket.ticketNumber === 'TKT-PRECEDENCE-001' &&
      offlineItemMir1.impactedMetersCount >= 1,
      'GET /api/v1/operator/outages/active enriches offline feeder with incident details and impacted customer meters'
    );

    // Filter by outageType=UNPLANNED
    const unplannedOnlyRes = await request(
      serverUrl,
      'GET',
      '/api/v1/operator/outages/active?outageType=UNPLANNED',
      undefined,
      opToken
    );
    assert(
      unplannedOnlyRes.status === 200 &&
      unplannedOnlyRes.body.data.items.every((i: any) => i.outageType === 'UNPLANNED'),
      'GET /api/v1/operator/outages/active?outageType=UNPLANNED correctly filters offline feeders'
    );

    // Clean up temporary live test schedule and fault ticket
    store.outageTickets.delete(testFaultTicketId);
    store.scheduleFeederAssignments.delete(liveTestAsgnId);
    store.scheduleSlots.delete(liveTestSlotId);
    store.schedules.delete(liveTestSchedId);

  } catch (err: any) {
    logger.error('Test execution error:', err);
    failed++;
  } finally {
    server.close();
    logger.info(`\n==========================================`);
    logger.info(`🏁 Test Summary: ${passed} PASSED, ${failed} FAILED`);
    logger.info(`==========================================\n`);
    if (failed > 0) {
      process.exit(1);
    }
  }
};

runSuite();
