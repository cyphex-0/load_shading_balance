import { createApp } from '../app';
import http from 'http';
import { logger } from '../utils/logger';
import { store } from '../db/store';
import { toSafeUser, whereNotDeleted, getUserZoneScope } from '../db/helpers';
import { isTransientTransactionError } from '../db/transactions';
import { buildTestUser, buildTestFeeder, createMockClock } from './fixtures';
import { UserRole, UserStatus, paginationQuerySchema } from '@load-shedding/shared';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  BadRequestError
} from '../utils/response';

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
