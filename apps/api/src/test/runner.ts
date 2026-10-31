import { createApp } from '../app';
import http from 'http';
import { logger } from '../utils/logger';
import { store, OutageTicketRecord } from '../db/store';
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
  NotificationType,
  DeliveryStatus,
  FaultType,
  CandidateFeederInput,
  FeederUsageHistoryInput,
  FairRotationEngineInput
} from '@load-shedding/shared';
import {
  computeFairRotationSchedule,
  selectBestFeederSubset
} from '../services/scheduler/fair-rotation.engine';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  BadRequestError,
  ForbiddenError
} from '../utils/response';
import { requireRole, verifyZoneScope } from '../middleware/auth';
import { getSimulatedProvider } from '../integrations/sms';
import { notificationService } from '../services/notification.service';
import { outageService } from '../services/outage.service';

import { NotificationTemplates } from '../services/notification-templates';


// Helper to make test HTTP requests
const request = async (
  serverUrl: string,
  method: string,
  path: string,
  body?: any,
  token?: string,
  extraHeaders?: Record<string, string>
): Promise<{ status: number; body: any }> => {
  const url = `${serverUrl}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extraHeaders || {})
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

      // Seed verified repair photo before resolution (Phase 19 Gate)
      store.outageAttachments.set(`att_seed_${ticketId}`, {
        id: `att_seed_${ticketId}`,
        ticketId,
        uploaderId: 'usr_tech_1',
        storageKey: `repair-photos/${ticketId}/fuse_replaced.jpg`,
        fileUrl: `/uploads/fuse_replaced.jpg`,
        fileName: 'fuse_replaced.jpg',
        fileType: 'image/jpeg',
        fileSize: 102400,
        isVerified: true,
        verifiedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      });

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
      customerId: 'usr_customer_1',
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
      customerId: 'usr_customer_1',
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

    // ============================================================================
    // Phase 13: Fair-Rotation Scheduling Engine Tests (Test 20: 20a - 20g)
    // ============================================================================

    // 20a. Law 1: Critical Infrastructure Immunity
    // Hospital and emergency feeders must NEVER be shed regardless of deficit size
    const law1Candidates: CandidateFeederInput[] = [
      { id: 'fdr_hosp_1', name: 'Square Hospital Feeder', code: 'FDR-HOSP-01', capacityMW: 25.0, isCritical: true, substationId: 'sub_dhn_1', substationName: 'Panthapath SS', zoneName: 'Dhanmondi' },
      { id: 'fdr_res_1', name: 'Residential Block A', code: 'FDR-RES-01', capacityMW: 10.0, isCritical: false, substationId: 'sub_dhn_1', substationName: 'Dhanmondi SS', zoneName: 'Dhanmondi' },
      { id: 'fdr_res_2', name: 'Residential Block B', code: 'FDR-RES-02', capacityMW: 12.0, isCritical: false, substationId: 'sub_dhn_1', substationName: 'Dhanmondi SS', zoneName: 'Dhanmondi' },
    ];
    const law1Plan = computeFairRotationSchedule({
      planningDate: '2026-11-01',
      startTime: '08:00',
      endTime: '09:00',
      slotDurationMinutes: 60,
      targetDeficitMW: 50.0, // Deficit exceeds total capacity, hospital must STILL be immune
      candidateFeeders: law1Candidates
    });
    const hospitalAllocated = law1Plan.slots.some(s => s.assignedFeeders.some(f => f.feederId === 'fdr_hosp_1'));
    assert(
      law1Plan.criticalExcludedCount === 1 && !hospitalAllocated,
      'Law 1: Critical Hospital Feeder is strictly immune and excluded even under 50MW catastrophic deficit'
    );

    // 20b. Law 2: Same-Calendar-Day No-Double-Cut Rule
    // Feeders cut in Slot 1 cannot be cut again in Slot 2, and feeders in alreadyCommittedFeederIds cannot be cut
    const law2Candidates: CandidateFeederInput[] = [
      { id: 'fdr_comm_1', name: 'Already Committed Earlier Today', code: 'FDR-COMM-01', capacityMW: 10.0, isCritical: false, substationId: 'sub_1', substationName: 'SS 1' },
      { id: 'fdr_pool_1', name: 'Feeder Pool 1', code: 'FDR-POOL-01', capacityMW: 10.0, isCritical: false, substationId: 'sub_1', substationName: 'SS 1' },
      { id: 'fdr_pool_2', name: 'Feeder Pool 2', code: 'FDR-POOL-02', capacityMW: 10.0, isCritical: false, substationId: 'sub_1', substationName: 'SS 1' },
      { id: 'fdr_pool_3', name: 'Feeder Pool 3', code: 'FDR-POOL-03', capacityMW: 10.0, isCritical: false, substationId: 'sub_1', substationName: 'SS 1' },
    ];
    const law2Plan = computeFairRotationSchedule({
      planningDate: '2026-11-01',
      startTime: '08:00',
      endTime: '10:00', // 2 slots: 08:00-09:00, 09:00-10:00
      slotDurationMinutes: 60,
      targetDeficitMW: 10.0,
      candidateFeeders: law2Candidates,
      alreadyCommittedFeederIds: ['fdr_comm_1']
    });
    assert(law2Plan.sameDayExcludedCount === 1, 'Law 2: Feeders in alreadyCommittedFeederIds are excluded upfront (same-day cut protection)');
    assert(law2Plan.slots.length === 2, 'Law 2: Discretizes into exactly 2 60-minute slots');
    const slot1FeederIds = law2Plan.slots[0].assignedFeeders.map(f => f.feederId);
    const slot2FeederIds = law2Plan.slots[1].assignedFeeders.map(f => f.feederId);
    const overlapFeederIds = slot1FeederIds.filter(id => slot2FeederIds.includes(id));
    const committedIncluded = slot1FeederIds.includes('fdr_comm_1') || slot2FeederIds.includes('fdr_comm_1');
    assert(
      overlapFeederIds.length === 0 && !committedIncluded,
      'Law 2: Same-Day Single-Cut Rule prohibits any feeder from being assigned twice across schedule slots or calendar day'
    );

    // 20c. Law 3: Multi-Factor Equity Scoring & Fairness Rotation
    // Feeder with 0 cuts vs Feeder with 4 cuts: Feeder with 0 cuts must be prioritized
    const law3Candidates: CandidateFeederInput[] = [
      { id: 'fdr_heavy_cut', name: 'Frequently Cut Feeder', code: 'FDR-HEAVY', capacityMW: 10.0, isCritical: false, substationId: 'sub_1', substationName: 'SS 1' },
      { id: 'fdr_zero_cut', name: 'Uncut Feeder', code: 'FDR-ZERO', capacityMW: 10.0, isCritical: false, substationId: 'sub_1', substationName: 'SS 1' },
    ];
    const law3History: FeederUsageHistoryInput[] = [
      { feederId: 'fdr_heavy_cut', totalCutsCount: 4, cumulativeShedHours: 8, lastShedAt: '2026-10-31T10:00:00.000Z' },
      { feederId: 'fdr_zero_cut', totalCutsCount: 0, cumulativeShedHours: 0 }
    ];
    const law3Plan = computeFairRotationSchedule({
      planningDate: '2026-11-01',
      startTime: '10:00',
      endTime: '11:00',
      slotDurationMinutes: 60,
      targetDeficitMW: 10.0,
      candidateFeeders: law3Candidates,
      historicalMetrics: law3History
    });
    assert(
      law3Plan.slots[0].assignedFeeders.length === 1 &&
      law3Plan.slots[0].assignedFeeders[0].feederId === 'fdr_zero_cut',
      'Law 3: Feeder with 0 prior cuts is strictly prioritized over feeder with 4 prior cuts via Equity Scoring'
    );

    // 20d. Determinism Invariant: Permutation Invariance via Lexicographical Tie-Breaker
    // When equity scores are identical, shuffle order must yield identical assignments
    const fleetA: CandidateFeederInput[] = [
      { id: 'fdr_c', name: 'Charlie', code: 'FDR-C', capacityMW: 5.0, isCritical: false, substationId: 'sub_1', substationName: 'SS 1' },
      { id: 'fdr_a', name: 'Alpha', code: 'FDR-A', capacityMW: 5.0, isCritical: false, substationId: 'sub_1', substationName: 'SS 1' },
      { id: 'fdr_d', name: 'Delta', code: 'FDR-D', capacityMW: 5.0, isCritical: false, substationId: 'sub_1', substationName: 'SS 1' },
      { id: 'fdr_b', name: 'Bravo', code: 'FDR-B', capacityMW: 5.0, isCritical: false, substationId: 'sub_1', substationName: 'SS 1' },
    ];
    const fleetB = [fleetA[3], fleetA[0], fleetA[2], fleetA[1]]; // Shuffled order
    const planA = computeFairRotationSchedule({
      planningDate: '2026-11-01',
      startTime: '12:00',
      endTime: '13:00',
      slotDurationMinutes: 60,
      targetDeficitMW: 10.0,
      candidateFeeders: fleetA
    });
    const planB = computeFairRotationSchedule({
      planningDate: '2026-11-01',
      startTime: '12:00',
      endTime: '13:00',
      slotDurationMinutes: 60,
      targetDeficitMW: 10.0,
      candidateFeeders: fleetB
    });
    const orderA = planA.slots[0].assignedFeeders.map(f => f.code).join(',');
    const orderB = planB.slots[0].assignedFeeders.map(f => f.code).join(',');
    assert(
      orderA === orderB && orderA === 'FDR-A,FDR-B',
      'Determinism Invariant: Shuffled candidate permutations produce identical, deterministic schedule (FDR-A, FDR-B)'
    );

    // 20e. Law 4: Knapsack Capacity Bin-Packing (Optimal Capacity Matching)
    // Target deficit: 10.0 MW. Candidates: Feeder 1 (4.0 MW), Feeder 2 (6.0 MW), Feeder 3 (11.0 MW).
    // Knapsack must find exact match 4.0 + 6.0 = 10.0 MW (0.0 MW overage) rather than overshoot.
    const knapsackCandidates = [
      { feeder: { id: 'f1', name: 'F1', code: 'F1', capacityMW: 4.0, isCritical: false, substationId: 'sub_1', substationName: 'SS' }, equityScore: 10 },
      { feeder: { id: 'f2', name: 'F2', code: 'F2', capacityMW: 6.0, isCritical: false, substationId: 'sub_1', substationName: 'SS' }, equityScore: 20 },
      { feeder: { id: 'f3', name: 'F3', code: 'F3', capacityMW: 11.0, isCritical: false, substationId: 'sub_1', substationName: 'SS' }, equityScore: 30 },
    ];
    const knapsackResult = selectBestFeederSubset(knapsackCandidates, 10.0);
    const knapsackCodes = knapsackResult.map(c => c.feeder.code).sort().join(',');
    const knapsackTotalMW = knapsackResult.reduce((sum, c) => sum + c.feeder.capacityMW, 0);
    assert(
      knapsackTotalMW === 10.0 && knapsackCodes === 'F1,F2',
      'Law 4 (Knapsack Subroutine): selectBestFeederSubset selects exact match [F1, F2] (10.0 MW) over greedy overshoot'
    );

    const law4Plan = computeFairRotationSchedule({
      planningDate: '2026-11-01',
      startTime: '10:00',
      endTime: '11:00',
      slotDurationMinutes: 60,
      targetDeficitMW: 10.0,
      candidateFeeders: knapsackCandidates.map(c => c.feeder)
    });
    const law4Codes = law4Plan.slots[0].assignedFeeders.map(f => f.code).sort().join(',');
    assert(
      law4Plan.slots[0].actualDeficitMW === 10.0 && law4Codes === 'F1,F2',
      'Law 4: Knapsack bin-packing chooses exact match [F1, F2] (10.0 MW) with zero overage instead of F3 (11.0 MW)'
    );

    // 20f. Law 5: Infeasibility & Deficit Shortfall Diagnostics
    // Total candidate capacity: 12.0 MW, target deficit: 20.0 MW
    const law5Candidates: CandidateFeederInput[] = [
      { id: 'fdr_short_1', name: 'Shortfall 1', code: 'FDR-S1', capacityMW: 5.0, isCritical: false, substationId: 'sub_1', substationName: 'SS 1' },
      { id: 'fdr_short_2', name: 'Shortfall 2', code: 'FDR-S2', capacityMW: 7.0, isCritical: false, substationId: 'sub_1', substationName: 'SS 1' },
    ];
    const law5Plan = computeFairRotationSchedule({
      planningDate: '2026-11-01',
      startTime: '14:00',
      endTime: '15:00',
      slotDurationMinutes: 60,
      targetDeficitMW: 20.0,
      candidateFeeders: law5Candidates
    });
    assert(
      law5Plan.slots[0].actualDeficitMW === 12.0 &&
      law5Plan.slots[0].shortfallMW === 8.0 &&
      law5Plan.slots[0].isDeficitSatisfied === false &&
      law5Plan.overallShortfallMWh === 8.0,
      'Law 5: Infeasibility and deficit shortfall correctly diagnosed (8.0 MW unmet deficit) with full fleet allocation'
    );

    // 20g. End-to-End Operator Draft Generation with Fair Rotation Engine
    const fairRotationDraftRes = await request(
      serverUrl,
      'POST',
      '/api/operator/schedules/draft',
      {
        planningDate: '2026-11-02',
        deficitMW: 15.0,
        startTime: '10:00',
        endTime: '12:00',
        slotDurationMinutes: 60
      },
      opToken
    );
    assert(
      fairRotationDraftRes.status === 201 &&
      fairRotationDraftRes.body.success === true &&
      fairRotationDraftRes.body.data.slots.length === 2,
      'POST /api/operator/schedules/draft integrates pure Fair-Rotation Engine producing 2 discrete slots'
    );
    const draftHospAssigned = fairRotationDraftRes.body.data.slots.some((s: any) =>
      s.feeders.some((f: any) => f.code === 'FDR-DHN-HOSP')
    );
    assert(!draftHospAssigned, 'Draft schedule via Fair-Rotation Engine strictly enforces Law 1 hospital immunity');

    // ========================================================================
    // Phase 14: Schedule Persistence, Review, Publish, Idempotency, and Feeder Lookup
    // ========================================================================
    const createdSchedId = fairRotationDraftRes.body.data.id;
    const slot0Id = fairRotationDraftRes.body.data.slots[0].id;
    const slot1Id = fairRotationDraftRes.body.data.slots[1].id;

    // 21a. Audit Trail: ScheduleGenerationRun Persistence
    const genRun = store.scheduleGenerationRuns.get(`sgr_${createdSchedId}`);
    assert(
      !!genRun &&
      genRun.operatorId === opLogin.body.data.user.id &&
      genRun.algorithmVersion === 'v1.0.0-fair-rotation' &&
      genRun.totalSlots === 2 &&
      genRun.targetDeficitMW === 15.0,
      'Phase 14 Audit Trail: ScheduleGenerationRun persisted with operator ID, algorithm version, and diagnostics'
    );

    // 21b. Draft Metadata Update: PATCH /api/v1/operator/schedules/:id
    const patchNotesRes = await request(
      serverUrl,
      'PATCH',
      `/api/v1/operator/schedules/${createdSchedId}`,
      { notes: 'Operator review notes: Approved for peak load window' },
      opToken
    );
    assert(
      patchNotesRes.status === 200 &&
      patchNotesRes.body.data.notes === 'Operator review notes: Approved for peak load window',
      'PATCH /api/v1/operator/schedules/:id updates draft notes'
    );

    // 21c. Manual Slot Adjustment Validation - Law 1: Critical Feeder Rejection
    const adjustCriticalRes = await request(
      serverUrl,
      'PATCH',
      `/api/v1/operator/schedules/${createdSchedId}/slots/${slot0Id}`,
      { feederIds: ['fdr_dhn_hosp'] },
      opToken
    );
    assert(
      adjustCriticalRes.status === 400 &&
      adjustCriticalRes.body.error.code === 'CRITICAL_FEEDER_PROTECTED',
      'Slot Adjustment Law 1: Rejects manual assignment of critical hospital feeder (400 CRITICAL_FEEDER_PROTECTED)'
    );

    // 21d. Manual Slot Adjustment Validation - Law 2: Same-Day Duplicate Cut Rejection
    const slot0FeederId = fairRotationDraftRes.body.data.slots[0].feeders[0].feederId;
    const adjustDuplicateRes = await request(
      serverUrl,
      'PATCH',
      `/api/v1/operator/schedules/${createdSchedId}/slots/${slot1Id}`,
      { feederIds: [slot0FeederId] },
      opToken
    );
    assert(
      adjustDuplicateRes.status === 400 &&
      adjustDuplicateRes.body.error.code === 'FEEDER_ALREADY_COMMITTED',
      'Slot Adjustment Law 2: Rejects assigning feeder already scheduled in another slot on the same day (400 FEEDER_ALREADY_COMMITTED)'
    );

    // 21e. Publish Schedule with Idempotency Key
    const publishIdempKey = 'idemp_key_test_phase_14_pub';
    const publishRes1 = await request(
      serverUrl,
      'POST',
      `/api/operator/schedules/${createdSchedId}/publish`,
      {},
      opToken,
      { 'Idempotency-Key': publishIdempKey }
    );
    assert(
      publishRes1.status === 200 &&
      publishRes1.body.data.schedule.status === ScheduleStatus.PUBLISHED,
      'POST /api/operator/schedules/:id/publish commits PUBLISHED state and sends notifications'
    );

    // 21f. Publish Idempotency: Repeating same call returns cached result without re-executing
    const publishRes2 = await request(
      serverUrl,
      'POST',
      `/api/operator/schedules/${createdSchedId}/publish`,
      {},
      opToken,
      { 'Idempotency-Key': publishIdempKey }
    );
    assert(
      publishRes2.status === 200 &&
      publishRes2.body.data.schedule.status === ScheduleStatus.PUBLISHED,
      'Publish Idempotency: Repeated call with identical Idempotency-Key returns cached response without duplicate side effects'
    );

    // 21g. State Machine Invariants: Non-Draft Schedule Mutation Rejections
    const patchPublishedNotesRes = await request(
      serverUrl,
      'PATCH',
      `/api/v1/operator/schedules/${createdSchedId}`,
      { notes: 'Illegal update' },
      opToken
    );
    assert(
      patchPublishedNotesRes.status === 409 &&
      patchPublishedNotesRes.body.error.code === 'INVALID_STATE_TRANSITION',
      'State Machine Invariant: Reject editing metadata on PUBLISHED schedule (409 INVALID_STATE_TRANSITION)'
    );

    const adjustPublishedSlotRes = await request(
      serverUrl,
      'PATCH',
      `/api/v1/operator/schedules/${createdSchedId}/slots/${slot0Id}`,
      { feederIds: ['fdr_dhn_1'] },
      opToken
    );
    assert(
      adjustPublishedSlotRes.status === 409 &&
      adjustPublishedSlotRes.body.error.code === 'INVALID_STATE_TRANSITION',
      'State Machine Invariant: Reject slot adjustment on PUBLISHED schedule (409 INVALID_STATE_TRANSITION)'
    );

    const rePublishRes = await request(
      serverUrl,
      'POST',
      `/api/operator/schedules/${createdSchedId}/publish`,
      {},
      opToken
    );
    assert(
      rePublishRes.status === 409 &&
      rePublishRes.body.error.code === 'INVALID_STATE_TRANSITION',
      'State Machine Invariant: Reject publishing an already PUBLISHED schedule (409 INVALID_STATE_TRANSITION)'
    );

    // 21h. Cancellation & State Invariant
    const cancelRes = await request(
      serverUrl,
      'POST',
      `/api/operator/schedules/${createdSchedId}/cancel`,
      {},
      opToken
    );
    assert(
      cancelRes.status === 200 &&
      cancelRes.body.data.status === ScheduleStatus.CANCELLED,
      'POST /api/operator/schedules/:id/cancel cancels schedule'
    );

    const reCancelRes = await request(
      serverUrl,
      'POST',
      `/api/operator/schedules/${createdSchedId}/cancel`,
      {},
      opToken
    );
    assert(
      reCancelRes.status === 409 &&
      reCancelRes.body.error.code === 'INVALID_STATE_TRANSITION',
      'State Machine Invariant: Reject cancelling an already CANCELLED schedule (409 INVALID_STATE_TRANSITION)'
    );

    // 21i. Feeder Schedule Lookup & Scoping (GET /api/v1/schedules/feeders/:feederId)
    // 1. Operator queries Dhanmondi feeder (fdr_dhn_1) -> 200 OK
    const opFeederSchedRes = await request(
      serverUrl,
      'GET',
      '/api/v1/schedules/feeders/fdr_dhn_1',
      undefined,
      opToken
    );
    assert(
      opFeederSchedRes.status === 200 && Array.isArray(opFeederSchedRes.body.data),
      'GET /api/v1/schedules/feeders/:feederId returns feeder schedule slots for Operator'
    );

    // 2. Zone Manager for Dhanmondi queries Dhanmondi feeder -> 200 OK
    const zmDhnRes = await request(
      serverUrl,
      'GET',
      '/api/v1/schedules/feeders/fdr_dhn_1',
      undefined,
      managerToken
    );
    assert(
      zmDhnRes.status === 200,
      'GET /api/v1/schedules/feeders/:feederId allows Zone Manager to access feeder in their assigned zone'
    );

    // 3. Zone Manager for Dhanmondi queries Mirpur feeder (fdr_mir_1) -> 403 Forbidden
    const zmMirRes = await request(
      serverUrl,
      'GET',
      '/api/v1/schedules/feeders/fdr_mir_1',
      undefined,
      managerToken
    );
    assert(
      zmMirRes.status === 403 && zmMirRes.body.error.code === 'FORBIDDEN',
      'GET /api/v1/schedules/feeders/:feederId strictly blocks Zone Manager from cross-zone feeder query (403 FORBIDDEN)'
    );

    // 4. Customer queries feeder -> only sees published schedules, not drafts
    const custFeederSchedRes = await request(
      serverUrl,
      'GET',
      '/api/v1/schedules/feeders/fdr_dhn_1',
      undefined,
      customerToken
    );
    assert(
      custFeederSchedRes.status === 200 &&
      custFeederSchedRes.body.data.every((s: any) => s.scheduleStatus === ScheduleStatus.PUBLISHED),
      'Customer Schedule View: Customer query to /api/v1/schedules/feeders/:feederId strictly omits draft schedules'
    );

    // ============================================================================
    // Phase 15: Customer Read Journey, Multi-Meter Aggregation, IDOR, & Cache Invalidation
    // ============================================================================
    logger.info('[INFO] Testing Phase 15: Customer Read Journey, Multi-Meter Aggregation, IDOR, & Cache Invalidation');

    // 1. Admin creates a second meter on Mirpur Feeder 1 for Customer A
    const adminCreateMeterA2Res = await request(
      serverUrl,
      'POST',
      '/api/v1/admin/meters',
      {
        meterNumber: 'MTR-MIR-105',
        feederId: 'fdr_mir_1',
        address: 'Mirpur Commercial Complex 5A'
      },
      adminToken
    );
    assert(
      adminCreateMeterA2Res.status === 201,
      'Admin registers secondary physical meter MTR-MIR-105 on feeder fdr_mir_1'
    );
    const meterA2Id = adminCreateMeterA2Res.body.data.id;

    // 2. Customer A links the second meter
    const custLinkA2Res = await request(
      serverUrl,
      'POST',
      '/api/v1/customers/me/meters',
      {
        meterNumber: 'MTR-MIR-105',
        nickname: 'Mirpur Branch Office',
        isPrimary: false
      },
      customerToken
    );
    assert(
      custLinkA2Res.status === 201 &&
      custLinkA2Res.body.data.isPrimary === false &&
      custLinkA2Res.body.data.meterNumber === 'MTR-MIR-105',
      'Customer A links second meter MTR-MIR-105 with isPrimary=false'
    );

    // 3. Customer Dashboard aggregates all linked meters and telemetry
    const custDashboardRes1 = await request(
      serverUrl,
      'GET',
      '/api/v1/customers/me/dashboard',
      undefined,
      customerToken
    );
    assert(
      custDashboardRes1.status === 200 &&
      custDashboardRes1.body.success === true &&
      Array.isArray(custDashboardRes1.body.data.meters) &&
      custDashboardRes1.body.data.meters.length >= 2 &&
      custDashboardRes1.body.data.meters.some((m: any) => m.meterNumber === 'MTR-DHN-101') &&
      custDashboardRes1.body.data.meters.some((m: any) => m.meterNumber === 'MTR-MIR-105') &&
      Array.isArray(custDashboardRes1.body.data.upcomingSchedules) &&
      custDashboardRes1.body.data.notifications &&
      typeof custDashboardRes1.body.data.notifications.unreadCount === 'number' &&
      custDashboardRes1.body.data.cached === false,
      'GET /api/v1/customers/me/dashboard aggregates multi-meter status, upcoming schedules, and notifications (cache miss)'
    );

    // 4. Cache-aside test: Immediate repeat of dashboard hits Redis cache
    const custDashboardRes2 = await request(
      serverUrl,
      'GET',
      '/api/v1/customers/me/dashboard',
      undefined,
      customerToken
    );
    assert(
      custDashboardRes2.status === 200 &&
      custDashboardRes2.body.data.cached === true &&
      custDashboardRes2.body.data.meters.length === custDashboardRes1.body.data.meters.length,
      'GET /api/v1/customers/me/dashboard serves response from Redis cache on repeat (cached=true)'
    );

    // 5. Multi-Meter Status without meterId returns all linked meters
    const multiMeterStatusRes = await request(
      serverUrl,
      'GET',
      '/api/v1/customers/me/status',
      undefined,
      customerToken
    );
    assert(
      multiMeterStatusRes.status === 200 &&
      multiMeterStatusRes.body.data.hasMeter === true &&
      Array.isArray(multiMeterStatusRes.body.data.meters) &&
      multiMeterStatusRes.body.data.meters.length >= 2,
      'GET /api/v1/customers/me/status without meterId returns status array for all linked meters'
    );

    // 6. Single Meter Status for owned meter returns specific meter status
    const singleMeterStatusRes = await request(
      serverUrl,
      'GET',
      '/api/v1/customers/me/status?meterId=' + meterA2Id,
      undefined,
      customerToken
    );
    assert(
      singleMeterStatusRes.status === 200 &&
      singleMeterStatusRes.body.data.meterId === meterA2Id &&
      singleMeterStatusRes.body.data.meterNumber === 'MTR-MIR-105' &&
      singleMeterStatusRes.body.data.feederId === 'fdr_mir_1',
      'GET /api/v1/customers/me/status?meterId={ownedId} returns single meter status'
    );

    // 7. Object-level IDOR Protection: Querying foreign meter is strictly rejected
    const foreignMeterStatusRes = await request(
      serverUrl,
      'GET',
      '/api/v1/customers/me/status?meterId=mtr_dhn_102',
      undefined,
      customerToken
    );
    assert(
      foreignMeterStatusRes.status === 404 &&
      foreignMeterStatusRes.body.error.code === 'METER_NOT_FOUND',
      'IDOR Protection: GET /api/v1/customers/me/status?meterId={foreignId} strictly rejected with 404 METER_NOT_FOUND'
    );

    // 8. Customer upcoming schedule query returns published schedules and caches result
    const custScheduleRes1 = await request(
      serverUrl,
      'GET',
      '/api/v1/customers/me/schedule',
      undefined,
      customerToken
    );
    assert(
      custScheduleRes1.status === 200 &&
      custScheduleRes1.body.success === true &&
      Array.isArray(custScheduleRes1.body.data.schedules) &&
      custScheduleRes1.body.data.cached === false,
      'GET /api/v1/customers/me/schedule returns published slots across owned meters (cache miss)'
    );

    // 9. Cache-aside test: Repeat schedule query returns cached=true
    const custScheduleRes2 = await request(
      serverUrl,
      'GET',
      '/api/v1/customers/me/schedule',
      undefined,
      customerToken
    );
    assert(
      custScheduleRes2.status === 200 &&
      custScheduleRes2.body.data.cached === true,
      'GET /api/v1/customers/me/schedule serves cached response on repeat query (cached=true)'
    );

    // 10. Schedule IDOR Protection: Querying schedule with foreign meterId is strictly rejected
    const foreignScheduleRes = await request(
      serverUrl,
      'GET',
      '/api/v1/customers/me/schedule?meterId=mtr_dhn_102',
      undefined,
      customerToken
    );
    assert(
      foreignScheduleRes.status === 404 &&
      foreignScheduleRes.body.error.code === 'METER_NOT_FOUND',
      'IDOR Protection: GET /api/v1/customers/me/schedule?meterId={foreignId} strictly rejected with 404 METER_NOT_FOUND'
    );

    // 11. Cache Invalidation Hook: Generating & publishing a new schedule purges customer cache
    const newDraftRes = await request(
      serverUrl,
      'POST',
      '/api/operator/schedules/draft',
      {
        planningDate: '2026-09-28',
        deficitMW: 20,
        startTime: '16:00',
        endTime: '17:00',
        slotDurationMinutes: 60
      },
      opToken
    );
    assert(newDraftRes.status === 201, 'Operator creates new draft schedule for cache invalidation test');
    const newSchedId = newDraftRes.body.data.id;

    // Publish the schedule
    const pubRes = await request(
      serverUrl,
      'POST',
      '/api/operator/schedules/' + newSchedId + '/publish',
      {},
      opToken
    );
    assert(pubRes.status === 200, 'Operator publishes schedule, triggering cache invalidation hooks');

    // 12. Verification of Cache Invalidation: Customer Dashboard is now a fresh miss (cached=false)
    const postPubDashboardRes = await request(
      serverUrl,
      'GET',
      '/api/v1/customers/me/dashboard',
      undefined,
      customerToken
    );
    assert(
      postPubDashboardRes.status === 200 &&
      postPubDashboardRes.body.data.cached === false,
      'Cache Invalidation: Publishing schedule invalidates customer dashboard cache (cached=false on next fetch)'
    );

    // ============================================================================
    // Phase 16: Notification Delivery, Twilio Adapter, Retry, and Callback Handling
    // ============================================================================
    logger.info('\n--- Phase 16 Verification Suite: Notification Delivery & Webhook ---');

    // 1. Direct SMS Provider Abstraction test (Simulated provider)
    const simProvider = getSimulatedProvider();
    const directSmsRes = await simProvider.send({
      to: '+8801711223344',
      body: 'Test notification delivery via provider'
    });
    assert(
      directSmsRes.success === true && (directSmsRes.messageId?.startsWith('sim_') ?? false),
      'SmsProvider: Direct send via SimulatedSmsProvider returns success and valid messageId'
    );

    // 2. Provider format validation (non-E.164 phone number)
    const badPhoneRes = await simProvider.send({
      to: '01711223344', // Missing + prefix
      body: 'Invalid format message'
    });
    assert(
      badPhoneRes.success === false && badPhoneRes.isPermanentError === true,
      'SmsProvider: Non-E.164 formatted number returns permanent error'
    );

    // 3. Centralized Notification Templates
    const tplPub = NotificationTemplates.schedulePublished('2026-10-01');
    const tplCancel = NotificationTemplates.scheduleCancelled('2026-10-01');
    const tplAck = NotificationTemplates.outageAcknowledged('TKT-2026-9999');
    const tplRest = NotificationTemplates.powerRestored('TKT-2026-9999');
    assert(
      tplPub.message.includes('2026-10-01') &&
      tplCancel.message.includes('cancelled') &&
      tplAck.message.includes('TKT-2026-9999') &&
      tplRest.message.includes('restored'),
      'NotificationTemplates: Centralized templates format expected domain messages'
    );

    // 4. Logical Event Deduplication
    const dedupEventKey = 'sched_pub:sched_test_dedup:usr_customer_1';
    const notif1 = await notificationService.createNotification(
      'usr_customer_1',
      'Scheduled Power Interruption',
      'Your area is scheduled for maintenance.',
      NotificationType.PLANNED_SCHEDULE,
      { test: true },
      dedupEventKey
    );
    const countLogsBefore = Array.from(store.notificationDeliveryLogs.values()).filter(
      (l) => l.idempotencyKey === dedupEventKey
    ).length;

    const notif2 = await notificationService.createNotification(
      'usr_customer_1',
      'Scheduled Power Interruption',
      'Your area is scheduled for maintenance.',
      NotificationType.PLANNED_SCHEDULE,
      { test: true },
      dedupEventKey
    );
    const countLogsAfter = Array.from(store.notificationDeliveryLogs.values()).filter(
      (l) => l.idempotencyKey === dedupEventKey
    ).length;

    assert(
      notif1.id === notif2.id && countLogsBefore === 1 && countLogsAfter === 1,
      'Notification Deduplication: Identical eventKey reuses intent and prevents duplicate SMS delivery logs'
    );

    // 5. Error Isolation & Bounded Retries with Exponential Backoff
    // Force transient carrier failure
    simProvider.setFailNext(false);
    const failingLog = await notificationService.queueSms(
      notif1.id,
      '+8801799887766',
      'Transient test alert',
      'retry_test_key_1'
    );
    // Give async execution microtick
    await new Promise((r) => setTimeout(r, 50));
    const storedFailingLog = store.notificationDeliveryLogs.get(failingLog.id);
    assert(
      storedFailingLog !== undefined &&
      storedFailingLog.attempts === 1 &&
      storedFailingLog.status === DeliveryStatus.QUEUED &&
      storedFailingLog.nextAttemptAt !== null,
      'SMS Error Isolation: Transient failure schedules retry with exponential backoff without crashing'
    );

    // 6. Max bounded attempts transition to FAILED
    // Force 2 more failures on the log
    simProvider.setFailNext(false);
    await notificationService.dispatchSmsLog(failingLog.id, 'Transient test alert');
    simProvider.setFailNext(false);
    await notificationService.dispatchSmsLog(failingLog.id, 'Transient test alert');
    const exhaustedLog = store.notificationDeliveryLogs.get(failingLog.id);
    assert(
      exhaustedLog !== undefined &&
      exhaustedLog.attempts === 3 &&
      exhaustedLog.status === DeliveryStatus.FAILED,
      'Bounded Retries: Max attempts (3) transitions delivery status to FAILED'
    );

    // 7. Twilio Webhook: Rejection of invalid signature (403 INVALID_SIGNATURE)
    const invalidSigRes = await request(
      serverUrl,
      'POST',
      '/api/v1/integrations/twilio/status-callback',
      {
        MessageSid: 'SM_test_webhook_123',
        MessageStatus: 'delivered'
      },
      undefined,
      {
        'X-Twilio-Signature': 'forged_or_invalid_signature'
      }
    );
    assert(
      invalidSigRes.status === 403 && invalidSigRes.body.error.code === 'INVALID_SIGNATURE',
      'Twilio Webhook: Invalid X-Twilio-Signature is strictly rejected with 403 INVALID_SIGNATURE'
    );

    // 8. Twilio Webhook: Unknown MessageSid returns 404 DELIVERY_LOG_NOT_FOUND
    const unknownSidRes = await request(
      serverUrl,
      'POST',
      '/api/v1/integrations/twilio/status-callback',
      {
        MessageSid: 'SM_nonexistent_message_sid_999',
        MessageStatus: 'delivered'
      },
      undefined,
      {
        'X-Twilio-Signature': 'valid_test_signature'
      }
    );
    assert(
      unknownSidRes.status === 404 && unknownSidRes.body.error.code === 'DELIVERY_LOG_NOT_FOUND',
      'Twilio Webhook: Unrecognized MessageSid returns 404 DELIVERY_LOG_NOT_FOUND'
    );

    // 9. Twilio Webhook: Valid callback transitions SENT -> DELIVERED with deliveredAt
    // Prime a SENT delivery log
    const primeDeliveryLog = await notificationService.queueSms(
      notif1.id,
      '+8801712345678',
      'Delivered test notification',
      'prime_delivered_key'
    );
    await new Promise((r) => setTimeout(r, 50));
    const primedSid = store.notificationDeliveryLogs.get(primeDeliveryLog.id)?.providerMessageId;

    const validWebhookRes = await request(
      serverUrl,
      'POST',
      '/api/v1/integrations/twilio/status-callback',
      {
        MessageSid: primedSid,
        MessageStatus: 'delivered'
      },
      undefined,
      {
        'X-Twilio-Signature': 'valid_test_signature'
      }
    );
    const updatedPrimedLog = store.notificationDeliveryLogs.get(primeDeliveryLog.id);
    assert(
      validWebhookRes.status === 200 &&
      validWebhookRes.body.success === true &&
      updatedPrimedLog?.status === DeliveryStatus.DELIVERED &&
      updatedPrimedLog?.deliveredAt !== null,
      'Twilio Webhook: Valid signed delivered status callback updates delivery log to DELIVERED with timestamp'
    );

    // 10. Monotonic state transition protection: DELIVERED cannot downgrade to SENT
    const delayedSentWebhookRes = await request(
      serverUrl,
      'POST',
      '/api/v1/integrations/twilio/status-callback',
      {
        MessageSid: primedSid,
        MessageStatus: 'sent'
      },
      undefined,
      {
        'X-Twilio-Signature': 'valid_test_signature'
      }
    );
    assert(
      delayedSentWebhookRes.status === 200 &&
      store.notificationDeliveryLogs.get(primeDeliveryLog.id)?.status === DeliveryStatus.DELIVERED,
      'Twilio Webhook: Out-of-order callback protection prevents DELIVERED from downgrading to SENT'
    );

    // 11. Admin Visibility into delivery logs
    const adminNotifRes = await request(
      serverUrl,
      'GET',
      '/api/v1/admin/notifications',
      undefined,
      adminToken
    );
    assert(
      adminNotifRes.status === 200 &&
      adminNotifRes.body.success === true &&
      Array.isArray(adminNotifRes.body.data) &&
      adminNotifRes.body.data.some((l: any) => l.status === DeliveryStatus.DELIVERED),
      'GET /api/v1/admin/notifications reflects updated delivery logs and status transitions'
    );

    // --- Phase 17 Verification Suite: Smart Outage Reporting & Planned-Conflict Resolution ---
    logger.info('\n--- Phase 17 Verification Suite: Smart Outage Reporting & Conflict Resolution ---');

    // Setup fresh test fixtures
    const nowTimeP17 = new Date();
    const testFeederPlanned: any = {
      id: 'fdr_p17_planned',
      substationId: 'sub_dhn_1',
      name: 'P17 Planned Feeder',
      code: 'FDR-P17-PLN',
      capacityMW: 15,
      currentLoadMW: 6,
      status: FeederStatus.ONLINE,
      isCritical: false,
      createdAt: nowTimeP17.toISOString(),
      updatedAt: nowTimeP17.toISOString()
    };
    store.feeders.set(testFeederPlanned.id, testFeederPlanned);

    const testFeederUnplanned: any = {
      id: 'fdr_p17_unplanned',
      substationId: 'sub_dhn_1',
      name: 'P17 Unplanned Feeder',
      code: 'FDR-P17-UNP',
      capacityMW: 12,
      currentLoadMW: 5,
      status: FeederStatus.ONLINE,
      isCritical: false,
      createdAt: nowTimeP17.toISOString(),
      updatedAt: nowTimeP17.toISOString()
    };
    store.feeders.set(testFeederUnplanned.id, testFeederUnplanned);

    const testMeterPlanned: any = {
      id: 'mtr_p17_planned',
      meterNumber: 'MTR-P17-PLN-01',
      feederId: testFeederPlanned.id,
      address: 'P17 Planned Zone Road 1',
      createdAt: nowTimeP17.toISOString(),
      updatedAt: nowTimeP17.toISOString()
    };
    store.meters.set(testMeterPlanned.id, testMeterPlanned);

    const testMeterUnplanned: any = {
      id: 'mtr_p17_unplanned',
      meterNumber: 'MTR-P17-UNP-01',
      feederId: testFeederUnplanned.id,
      address: 'P17 Unplanned Zone Road 2',
      createdAt: nowTimeP17.toISOString(),
      updatedAt: nowTimeP17.toISOString()
    };
    store.meters.set(testMeterUnplanned.id, testMeterUnplanned);

    // Link meters to usr_customer_1
    store.customerMeters.set('cm_p17_pln', {
      id: 'cm_p17_pln',
      customerId: 'usr_customer_1',
      meterId: testMeterPlanned.id,
      isPrimary: false,
      linkedAt: nowTimeP17.toISOString()
    });
    store.customerMeters.set('cm_p17_unp', {
      id: 'cm_p17_unp',
      customerId: 'usr_customer_1',
      meterId: testMeterUnplanned.id,
      isPrimary: false,
      linkedAt: nowTimeP17.toISOString()
    });

    // 1. Meter Ownership Check (403 METER_NOT_LINKED)
    const unlinkedMeterReportRes = await request(
      serverUrl,
      'POST',
      '/api/customers/me/outage-reports',
      {
        meterId: 'mtr_dhn_102',
        description: 'Blackout on unlinked line',
        faultType: FaultType.LINE_DOWN
      },
      customerToken
    );
    assert(
      unlinkedMeterReportRes.status === 403 &&
      unlinkedMeterReportRes.body.error.code === 'METER_NOT_LINKED',
      'Smart Reporting IDOR: Submitting report on unlinked meter returns 403 METER_NOT_LINKED'
    );

    // 2. Active Published Schedule Slot Interception (Case A: Planned Outage)
    const schedPlannedId = `sched_p17_active_${Date.now()}`;
    const slotPlannedId = `slot_p17_active_${Date.now()}`;
    const slotStartP17 = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const slotEndP17 = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    store.schedules.set(schedPlannedId, {
      id: schedPlannedId,
      planningDate: nowTimeP17.toISOString().split('T')[0],
      totalDeficitMW: 25,
      createdById: 'usr_admin_1',
      status: ScheduleStatus.PUBLISHED,
      publishedAt: nowTimeP17.toISOString(),
      createdAt: nowTimeP17.toISOString(),
      updatedAt: nowTimeP17.toISOString()
    });
    store.scheduleSlots.set(slotPlannedId, {
      id: slotPlannedId,
      scheduleId: schedPlannedId,
      startTime: slotStartP17,
      endTime: slotEndP17,
      targetDeficitMW: 15,
      actualDeficitMW: 6,
      createdAt: nowTimeP17.toISOString()
    });
    store.scheduleFeederAssignments.set(`asgn_p17_${Date.now()}`, {
      id: `asgn_p17_${Date.now()}`,
      slotId: slotPlannedId,
      feederId: testFeederPlanned.id,
      loadMW: 6,
      createdAt: nowTimeP17.toISOString()
    });

    const plannedReportRes = await request(
      serverUrl,
      'POST',
      '/api/customers/me/outage-reports',
      {
        meterId: testMeterPlanned.id,
        description: 'Power is out completely',
        faultType: FaultType.OTHER
      },
      customerToken
    );
    assert(
      plannedReportRes.status === 200 &&
      plannedReportRes.body.success === true &&
      plannedReportRes.body.data.isPlanned === true &&
      plannedReportRes.body.data.ticketCreated === false &&
      plannedReportRes.body.data.classification === 'KNOWN_PLANNED_OUTAGE' &&
      plannedReportRes.body.data.event !== undefined &&
      plannedReportRes.body.data.scheduledEndTime === slotEndP17,
      'Planned Slot Interception: Active published schedule slot intercepts report with KNOWN_PLANNED_OUTAGE (no ticket created)'
    );

    const savedEvent = store.outageReportEvents.get(plannedReportRes.body.data.event.id);
    assert(
      savedEvent !== undefined &&
      savedEvent.classification === 'PLANNED_CONFLICT' &&
      savedEvent.scheduleId === schedPlannedId &&
      savedEvent.slotId === slotPlannedId,
      'Audit Persistence: OutageReportEvent record safely stored in store.outageReportEvents without creating OutageTicket'
    );

    // 3. Expired / Inactive Schedule Slot Immunity (Case B: Unexpected Fault Ticket Created)
    // Feeder testFeederUnplanned has NO active schedule slot
    const unexpectedReportRes = await request(
      serverUrl,
      'POST',
      '/api/customers/me/outage-reports',
      {
        meterId: testMeterUnplanned.id,
        description: 'Transformer exploded loudly with black smoke',
        faultType: FaultType.TRANSFORMER,
        landmark: 'Near corner bakery'
      },
      customerToken
    );
    assert(
      unexpectedReportRes.status === 201 &&
      unexpectedReportRes.body.success === true &&
      unexpectedReportRes.body.data.isPlanned === false &&
      unexpectedReportRes.body.data.ticketCreated === true &&
      unexpectedReportRes.body.data.classification === 'UNPLANNED_FAULT' &&
      unexpectedReportRes.body.data.ticket.faultType === FaultType.TRANSFORMER,
      'Unexpected Fault: Unscheduled blackout creates OutageTicket with specified faultType and UNPLANNED_FAULT classification'
    );

    const createdTicketId = unexpectedReportRes.body.data.ticket.id;

    // 4. Duplicate Active Report Suppression (409 DUPLICATE_ACTIVE_REPORT)
    const duplicateReportRes = await request(
      serverUrl,
      'POST',
      '/api/customers/me/outage-reports',
      {
        meterId: testMeterUnplanned.id,
        description: 'Another report while ticket is still active',
        faultType: FaultType.TRANSFORMER
      },
      customerToken
    );
    assert(
      duplicateReportRes.status === 409 &&
      duplicateReportRes.body.error.code === 'DUPLICATE_ACTIVE_REPORT',
      'Duplicate Suppression: Subsequent report on meter with active in-flight ticket returns 409 DUPLICATE_ACTIVE_REPORT'
    );

    // 5. Unified Customer Outage History (Both Fault Tickets & Planned Conflicts)
    const unifiedHistoryRes = await request(
      serverUrl,
      'GET',
      '/api/customers/me/outage-reports',
      undefined,
      customerToken
    );
    assert(
      unifiedHistoryRes.status === 200 &&
      unifiedHistoryRes.body.success === true &&
      Array.isArray(unifiedHistoryRes.body.data) &&
      unifiedHistoryRes.body.data.some((r: any) => r.type === 'UNPLANNED_FAULT' && r.id === createdTicketId) &&
      unifiedHistoryRes.body.data.some((r: any) => r.type === 'PLANNED_CONFLICT' && r.id === savedEvent?.id),
      'Unified Outage History: GET /api/customers/me/outage-reports returns chronological feed containing both faults and planned events'
    );

    // 6. Detailed Inspection of Planned Conflict Event
    const conflictDetailRes = await request(
      serverUrl,
      'GET',
      `/api/customers/me/outage-reports/${savedEvent?.id}`,
      undefined,
      customerToken
    );
    assert(
      conflictDetailRes.status === 200 &&
      conflictDetailRes.body.success === true &&
      conflictDetailRes.body.data.type === 'PLANNED_CONFLICT' &&
      conflictDetailRes.body.data.classification === 'PLANNED_CONFLICT' &&
      conflictDetailRes.body.data.isPlanned === true &&
      conflictDetailRes.body.data.meterNumber === testMeterPlanned.meterNumber,
      'Report Detail: GET /api/customers/me/outage-reports/:id retrieves full details for planned conflict event'
    );

    // 7. Detailed Inspection of Unexpected Fault Ticket
    const ticketDetailRes = await request(
      serverUrl,
      'GET',
      `/api/customers/me/outage-reports/${createdTicketId}`,
      undefined,
      customerToken
    );
    assert(
      ticketDetailRes.status === 200 &&
      ticketDetailRes.body.success === true &&
      ticketDetailRes.body.data.type === 'UNPLANNED_FAULT' &&
      ticketDetailRes.body.data.faultType === FaultType.TRANSFORMER &&
      Array.isArray(ticketDetailRes.body.data.history),
      'Report Detail: GET /api/customers/me/outage-reports/:id retrieves fault ticket details with history'
    );

    // 8. IDOR Protection on Report Inspection
    // Another user or random ID returns 404 TICKET_NOT_FOUND
    const foreignInspectRes = await request(
      serverUrl,
      'GET',
      '/api/customers/me/outage-reports/tkt_non_existent_or_foreign',
      undefined,
      customerToken
    );
    assert(
      foreignInspectRes.status === 404 &&
      foreignInspectRes.body.error.code === 'TICKET_NOT_FOUND',
      'Report Inspection IDOR: Non-existent or foreign ticket returns 404 TICKET_NOT_FOUND'
    );
    // --- Phase 18 Verification Suite: Outage State Machine, Assignment & Dispatch Queue ---
    logger.info('\n--- Phase 18 Verification Suite: Outage State Machine & Dispatch Queue ---');

    // Setup fresh test fixtures for Phase 18
    const p18Now = new Date().toISOString();
    const zoneP18 = {
      id: 'zone_p18_test',
      name: 'P18 Test Zone',
      code: 'ZN-P18',
      description: 'Phase 18 Testing Zone',
      createdAt: p18Now,
      updatedAt: p18Now
    };
    store.zones.set(zoneP18.id, zoneP18);

    const subP18 = {
      id: 'sub_p18_test',
      zoneId: zoneP18.id,
      name: 'P18 Test Substation',
      code: 'SUB-P18',
      capacityMW: 50,
      createdAt: p18Now,
      updatedAt: p18Now
    };
    store.substations.set(subP18.id, subP18);

    const fdrP18 = {
      id: 'fdr_p18_test',
      substationId: subP18.id,
      name: 'P18 Test Feeder',
      code: 'FDR-P18-01',
      capacityMW: 20,
      currentLoadMW: 10,
      status: FeederStatus.UNEXPECTED_FAULT,
      isCritical: false,
      createdAt: p18Now,
      updatedAt: p18Now
    };
    store.feeders.set(fdrP18.id, fdrP18);

    const mtrP18 = {
      id: 'mtr_p18_test',
      meterNumber: 'MTR-P18-999',
      feederId: fdrP18.id,
      address: 'P18 Test Lane 1, Dhaka',
      createdAt: p18Now,
      updatedAt: p18Now
    };
    store.meters.set(mtrP18.id, mtrP18);

    // Setup Technicians
    const techZoneP18A: any = {
      id: 'usr_tech_p18_a',
      name: 'Technician P18 Alpha',
      email: 'tech.alpha@grid.gov.bd',
      phone: '+8801720000001',
      role: UserRole.TECHNICIAN,
      status: UserStatus.ACTIVE,
      assignedZoneId: zoneP18.id,
      createdAt: p18Now,
      updatedAt: p18Now
    };
    store.users.set(techZoneP18A.id, techZoneP18A);

    const techZoneP18B: any = {
      id: 'usr_tech_p18_b',
      name: 'Technician P18 Beta',
      email: 'tech.beta@grid.gov.bd',
      phone: '+8801720000002',
      role: UserRole.TECHNICIAN,
      status: UserStatus.ACTIVE,
      assignedZoneId: zoneP18.id,
      createdAt: p18Now,
      updatedAt: p18Now
    };
    store.users.set(techZoneP18B.id, techZoneP18B);

    const techForeignZone: any = {
      id: 'usr_tech_foreign_zone',
      name: 'Technician Foreign Zone',
      email: 'tech.foreign@grid.gov.bd',
      phone: '+8801720000099',
      role: UserRole.TECHNICIAN,
      status: UserStatus.ACTIVE,
      assignedZoneId: 'zone_foreign_north',
      createdAt: p18Now,
      updatedAt: p18Now
    };
    store.users.set(techForeignZone.id, techForeignZone);

    const opZoneP18: any = {
      id: 'usr_op_p18',
      name: 'Operator P18',
      email: 'op.p18@grid.gov.bd',
      role: UserRole.POWER_OPERATOR,
      status: UserStatus.ACTIVE,
      assignedZoneId: zoneP18.id,
      createdAt: p18Now,
      updatedAt: p18Now
    };
    store.users.set(opZoneP18.id, opZoneP18);

    // Create Test Ticket 1
    const ticket1: OutageTicketRecord = {
      id: 'tkt_p18_state_machine',
      ticketNumber: 'TKT-P18-0001',
      customerId: 'usr_customer_1',
      meterId: mtrP18.id,
      feederId: fdrP18.id,
      faultType: FaultType.LINE_DOWN,
      description: 'Overhead cable snapped due to fallen branch',
      isPlanned: false,
      status: OutageStatus.REPORTED,
      reportedAt: p18Now,
      createdAt: p18Now,
      updatedAt: p18Now
    };
    store.outageTickets.set(ticket1.id, ticket1);

    // 1. Invalid State Transition Rejection (409 INVALID_STATE_TRANSITION)
    // Direct REPORTED -> RESOLVED is strictly illegal
    let illegalTransitionBlocked = false;
    try {
      await outageService.transitionTicket(ticket1.id, OutageStatus.RESOLVED, 'usr_admin_1');
    } catch (e: any) {
      if (e.statusCode === 409 && e.code === 'INVALID_STATE_TRANSITION') {
        illegalTransitionBlocked = true;
      }
    }
    assert(
      illegalTransitionBlocked,
      'State Machine Invariant: Illegal transition REPORTED -> RESOLVED rejected with 409 INVALID_STATE_TRANSITION'
    );

    // 2. Zone Mismatch Rejection on Assignment (400 ZONE_MISMATCH)
    let zoneMismatchBlocked = false;
    try {
      await outageService.assignTechnician(ticket1.id, techForeignZone.id, opZoneP18.id);
    } catch (e: any) {
      if (e.statusCode === 400 && e.code === 'ZONE_MISMATCH') {
        zoneMismatchBlocked = true;
      }
    }
    assert(
      zoneMismatchBlocked,
      'Dispatch Invariant: Non-admin assigning technician from foreign zone rejected with 400 ZONE_MISMATCH'
    );

    // 3. Invalid Technician Rejection (400 INVALID_TECHNICIAN)
    let invalidTechBlocked = false;
    try {
      await outageService.assignTechnician(ticket1.id, 'usr_customer_1', 'usr_admin_1');
    } catch (e: any) {
      if (e.statusCode === 400 && e.code === 'INVALID_TECHNICIAN') {
        invalidTechBlocked = true;
      }
    }
    assert(
      invalidTechBlocked,
      'Dispatch Invariant: Assigning non-technician user rejected with 400 INVALID_TECHNICIAN'
    );

    // 4. Legal Assignment & Single Active Assignment Invariant
    const assignResult = await outageService.assignTechnician(
      ticket1.id,
      techZoneP18A.id,
      'usr_admin_1',
      'Initial dispatch'
    );
    assert(
      assignResult.status === OutageStatus.ASSIGNED &&
      assignResult.assignedTechnicianId === techZoneP18A.id &&
      assignResult.assignedAt !== null,
      'State Machine: Transition REPORTED -> ASSIGNED stamps assignedAt and sets technician'
    );

    // Reassigning to Technician Beta supersedes Alpha
    await outageService.assignTechnician(
      ticket1.id,
      techZoneP18B.id,
      'usr_admin_1',
      'Reassigned to technician Beta'
    );
    const alphaAssignment = Array.from(store.technicianAssignments.values()).find(
      (a) => a.ticketId === ticket1.id && a.technicianId === techZoneP18A.id
    );
    const betaAssignment = Array.from(store.technicianAssignments.values()).find(
      (a) => a.ticketId === ticket1.id && a.technicianId === techZoneP18B.id
    );
    assert(
      alphaAssignment?.status === AssignmentStatus.REASSIGNED &&
      betaAssignment?.status === AssignmentStatus.PENDING,
      'Single Active Assignment: Reassignment sets prior technician assignment to REASSIGNED and new to PENDING'
    );

    // 5. Progression: ASSIGNED -> EN_ROUTE -> REPAIRING -> RESOLVED
    const enRouteResult = await outageService.transitionTicket(
      ticket1.id,
      OutageStatus.EN_ROUTE,
      techZoneP18B.id,
      'Departing depot'
    );
    assert(
      enRouteResult.newStatus === OutageStatus.EN_ROUTE &&
      enRouteResult.ticket.enRouteAt !== null &&
      betaAssignment?.status === AssignmentStatus.ACCEPTED,
      'State Machine: ASSIGNED -> EN_ROUTE stamps enRouteAt and marks assignment ACCEPTED'
    );

    const repairingResult = await outageService.transitionTicket(
      ticket1.id,
      OutageStatus.REPAIRING,
      techZoneP18B.id,
      'Commencing line replacement'
    );
    assert(
      repairingResult.newStatus === OutageStatus.REPAIRING &&
      repairingResult.ticket.repairingAt !== null &&
      betaAssignment?.status === AssignmentStatus.IN_PROGRESS,
      'State Machine: EN_ROUTE -> REPAIRING stamps repairingAt and marks assignment IN_PROGRESS'
    );

    store.outageAttachments.set(`att_seed_${ticket1.id}`, {
      id: `att_seed_${ticket1.id}`,
      ticketId: ticket1.id,
      uploaderId: techZoneP18B.id,
      storageKey: `repair-photos/${ticket1.id}/line_rehung.jpg`,
      fileUrl: `/uploads/line_rehung.jpg`,
      fileName: 'line_rehung.jpg',
      fileType: 'image/jpeg',
      fileSize: 204800,
      isVerified: true,
      verifiedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    });

    const resolvedResult = await outageService.transitionTicket(
      ticket1.id,
      OutageStatus.RESOLVED,
      techZoneP18B.id,
      'High-voltage cable re-hung and tested with dielectric probe'
    );
    assert(
      resolvedResult.newStatus === OutageStatus.RESOLVED &&
      resolvedResult.ticket.resolvedAt !== null &&
      resolvedResult.ticket.resolutionNotes !== null &&
      betaAssignment?.status === AssignmentStatus.COMPLETED &&
      store.feeders.get(fdrP18.id)?.status === FeederStatus.ONLINE,
      'State Machine: REPAIRING -> RESOLVED stamps resolvedAt, completes assignment, and restores feeder to ONLINE'
    );

    // 6. Terminal State Lock: Attempting transition from RESOLVED
    let terminalLockBlocked = false;
    try {
      await outageService.transitionTicket(ticket1.id, OutageStatus.ASSIGNED, 'usr_admin_1');
    } catch (e: any) {
      if (e.statusCode === 409 && e.code === 'INVALID_STATE_TRANSITION') {
        terminalLockBlocked = true;
      }
    }
    assert(
      terminalLockBlocked,
      'Terminal Lock: Attempting to transition from RESOLVED status rejected with 409 INVALID_STATE_TRANSITION'
    );

    // 7. Cancellation Lifecycle via Route (POST /api/v1/outages/:id/cancel)
    const ticketCancel: OutageTicketRecord = {
      id: 'tkt_p18_to_cancel',
      ticketNumber: 'TKT-P18-0002',
      customerId: 'usr_customer_1',
      meterId: mtrP18.id,
      feederId: fdrP18.id,
      faultType: FaultType.OTHER,
      description: 'False alarm by tenant',
      isPlanned: false,
      status: OutageStatus.REPORTED,
      reportedAt: p18Now,
      createdAt: p18Now,
      updatedAt: p18Now
    };
    store.outageTickets.set(ticketCancel.id, ticketCancel);

    const p18CancelRes = await request(
      serverUrl,
      'POST',
      `/api/v1/outages/${ticketCancel.id}/cancel`,
      { reason: 'Customer called back confirming internal breaker tripped' },
      opToken
    );
    assert(
      p18CancelRes.status === 200 &&
      p18CancelRes.body.success === true &&
      p18CancelRes.body.data.newStatus === OutageStatus.CANCELLED &&
      p18CancelRes.body.data.ticket.cancelledAt !== null,
      'Cancellation Route: POST /api/v1/outages/:id/cancel transitions ticket to CANCELLED with timestamp'
    );

    // Subsequent transition on CANCELLED ticket blocked
    let cancelledLockBlocked = false;
    try {
      await outageService.transitionTicket(ticketCancel.id, OutageStatus.EN_ROUTE, 'usr_admin_1');
    } catch (e: any) {
      if (e.statusCode === 409 && e.code === 'INVALID_STATE_TRANSITION') {
        cancelledLockBlocked = true;
      }
    }
    assert(
      cancelledLockBlocked,
      'Terminal Lock: Transitioning CANCELLED ticket rejected with 409 INVALID_STATE_TRANSITION'
    );

    // 8. Deterministic Auto-Assignment Engine
    // Technician Alpha has 1 active assignment; Technician Beta has 0 active assignments
    const ticketAuto: OutageTicketRecord = {
      id: 'tkt_p18_auto_assign',
      ticketNumber: 'TKT-P18-0003',
      customerId: 'usr_customer_1',
      meterId: mtrP18.id,
      feederId: fdrP18.id,
      faultType: FaultType.CABLE_FAULT,
      description: 'Underground conduit smoke observed',
      isPlanned: false,
      status: OutageStatus.REPORTED,
      reportedAt: p18Now,
      createdAt: p18Now,
      updatedAt: p18Now
    };
    store.outageTickets.set(ticketAuto.id, ticketAuto);

    // Give Tech Alpha an active assignment on another dummy ticket
    store.technicianAssignments.set('asgn_dummy_alpha', {
      id: 'asgn_dummy_alpha',
      ticketId: 'tkt_dummy_alpha',
      technicianId: techZoneP18A.id,
      assignedById: 'usr_admin_1',
      status: AssignmentStatus.IN_PROGRESS,
      assignedAt: p18Now
    });

    const autoAssignRes = await request(
      serverUrl,
      'POST',
      `/api/v1/outages/${ticketAuto.id}/auto-assign`,
      {},
      opToken
    );
    assert(
      autoAssignRes.status === 200 &&
      autoAssignRes.body.success === true &&
      autoAssignRes.body.data.technicianId === techZoneP18B.id &&
      store.outageTickets.get(ticketAuto.id)?.status === OutageStatus.ASSIGNED,
      'Auto-Assignment: Deterministic least-busy engine assigns available Technician Beta (0 active vs Alpha 1 active)'
    );

    // 9. Canonical Outage Detail & History Retrieval
    const detailRes = await request(
      serverUrl,
      'GET',
      `/api/v1/outages/${ticket1.id}`,
      undefined,
      opToken
    );
    assert(
      detailRes.status === 200 &&
      detailRes.body.success === true &&
      detailRes.body.data.id === ticket1.id &&
      detailRes.body.data.ticketNumber === ticket1.ticketNumber &&
      detailRes.body.data.assignedTechnicianName === techZoneP18B.name &&
      detailRes.body.data.feederName === fdrP18.name &&
      detailRes.body.data.zoneName === zoneP18.name,
      'Canonical Detail: GET /api/v1/outages/:id returns fully enriched OutageDetailDto'
    );

    const historyRes = await request(
      serverUrl,
      'GET',
      `/api/v1/outages/${ticket1.id}/history`,
      undefined,
      opToken
    );
    assert(
      historyRes.status === 200 &&
      historyRes.body.success === true &&
      Array.isArray(historyRes.body.data) &&
      historyRes.body.data.length >= 4 &&
      historyRes.body.data.some((h: any) => h.newStatus === OutageStatus.ASSIGNED) &&
      historyRes.body.data.some((h: any) => h.newStatus === OutageStatus.RESOLVED),
      'Canonical History: GET /api/v1/outages/:id/history returns complete chronological status and actor trail'
    );

    // 10. Outage Query & Filtering (GET /api/v1/outages)
    const listRes = await request(
      serverUrl,
      'GET',
      `/api/v1/outages?status=${OutageStatus.RESOLVED}&page=1&pageSize=10`,
      undefined,
      opToken
    );
    assert(
      listRes.status === 200 &&
      listRes.body.success === true &&
      Array.isArray(listRes.body.data.items) &&
      listRes.body.data.items.every((t: any) => t.status === OutageStatus.RESOLVED) &&
      listRes.body.data.meta !== undefined,
      'Outage List & Filters: GET /api/v1/outages supports status filtering and PaginatedData response envelope'
    );

    // 11. Scoped IDOR Protection on Canonical Outages Route
    // Customer accessing ticket belonging to another customer
    const idorRes = await request(
      serverUrl,
      'GET',
      '/api/v1/outages/tkt_dummy_alpha',
      undefined,
      customerToken
    );
    assert(
      idorRes.status === 404 && idorRes.body.error.code === 'TICKET_NOT_FOUND',
      'Canonical Outages IDOR: Customer accessing unowned ticket rejected with 404 TICKET_NOT_FOUND'
    );
    // --- Phase 19 Verification Suite: Private Repair-Photo Storage & Resolution Evidence Gate ---
    logger.info('\n--- Phase 19 Verification Suite: Private Repair-Photo Storage & Evidence Gate ---');

    // Create a fresh test ticket and technician assignment for Phase 19
    const p19Time = new Date().toISOString();
    const fdrP19: any = {
      id: 'fdr_p19_test',
      substationId: 'sub_dhn_1',
      name: 'P19 Evidence Feeder',
      code: 'FDR-P19-01',
      capacityMW: 18,
      currentLoadMW: 8,
      status: FeederStatus.UNEXPECTED_FAULT,
      isCritical: false,
      createdAt: p19Time,
      updatedAt: p19Time
    };
    store.feeders.set(fdrP19.id, fdrP19);

    const mtrP19: any = {
      id: 'mtr_p19_test',
      meterNumber: 'MTR-P19-001',
      feederId: fdrP19.id,
      address: 'P19 Station Road, Dhaka',
      createdAt: p19Time,
      updatedAt: p19Time
    };
    store.meters.set(mtrP19.id, mtrP19);

    const ticketP19A: any = {
      id: 'tkt_p19_evidence_a',
      ticketNumber: 'TKT-P19-0001',
      customerId: 'usr_customer_1',
      meterId: mtrP19.id,
      feederId: fdrP19.id,
      faultType: FaultType.TRANSFORMER,
      description: 'Blown capacitor unit leaking oil',
      isPlanned: false,
      status: OutageStatus.REPAIRING,
      reportedAt: p19Time,
      createdAt: p19Time,
      updatedAt: p19Time
    };
    store.outageTickets.set(ticketP19A.id, ticketP19A);

    const assignmentP19A: any = {
      id: 'asgn_p19_a',
      ticketId: ticketP19A.id,
      technicianId: 'usr_tech_1',
      assignedById: 'usr_admin_1',
      status: AssignmentStatus.IN_PROGRESS,
      assignedAt: p19Time,
      acceptedAt: p19Time,
      startedAt: p19Time
    };
    store.technicianAssignments.set(assignmentP19A.id, assignmentP19A);

    // 1. File Type Rejection (400 INVALID_FILE_TYPE)
    const badMimeRes = await request(
      serverUrl,
      'POST',
      `/api/v1/technicians/me/assignments/${assignmentP19A.id}/attachments`,
      {
        fileName: 'report.pdf',
        fileType: 'application/pdf',
        fileSize: 102400
      },
      tech1Token
    );
    assert(
      badMimeRes.status === 400,
      'Upload Validation: Rejects non-JPEG/PNG file types with 400'
    );

    // 2. File Size Rejection (400 FILE_TOO_LARGE)
    const tooLargeRes = await request(
      serverUrl,
      'POST',
      `/api/v1/technicians/me/assignments/${assignmentP19A.id}/attachments`,
      {
        fileName: 'huge_photo.jpg',
        fileType: 'image/jpeg',
        fileSize: 6 * 1024 * 1024
      },
      tech1Token
    );
    assert(
      tooLargeRes.status === 400,
      'Upload Validation: Rejects photos exceeding 5MB limit with 400'
    );

    // 3. Unauthorized Technician Rejection (403 FORBIDDEN)
    const unauthInitRes = await request(
      serverUrl,
      'POST',
      `/api/v1/technicians/me/assignments/${assignmentP19A.id}/attachments`,
      {
        fileName: 'unauth_photo.jpg',
        fileType: 'image/jpeg',
        fileSize: 102400
      },
      tech2Token
    );
    assert(
      unauthInitRes.status === 403,
      'Upload Authorization: Technician not assigned to assignment rejected with 403'
    );

    // 4. Successful Signed Upload URL Initiation (201 Created)
    const initUploadRes = await request(
      serverUrl,
      'POST',
      `/api/v1/technicians/me/assignments/${assignmentP19A.id}/attachments`,
      {
        fileName: 'capacitor_repaired.jpg',
        fileType: 'image/jpeg',
        fileSize: 256000
      },
      tech1Token
    );
    assert(
      initUploadRes.status === 201 &&
      initUploadRes.body.success === true &&
      initUploadRes.body.data.attachmentId !== undefined &&
      initUploadRes.body.data.storageKey.startsWith(`repair-photos/${ticketP19A.id}/`) &&
      initUploadRes.body.data.uploadUrl !== undefined,
      'Signed Upload URL: Successfully generates short-lived upload URL with server-controlled storage key'
    );

    const attachmentP19Id = initUploadRes.body.data.attachmentId;
    const uploadUrl = initUploadRes.body.data.uploadUrl;

    // 5. Forged Completion Rejection (400 UPLOAD_VERIFICATION_FAILED)
    const earlyCompleteRes = await request(
      serverUrl,
      'POST',
      `/api/v1/technicians/me/attachments/${attachmentP19Id}/complete`,
      {},
      tech1Token
    );
    assert(
      earlyCompleteRes.status === 400 &&
      earlyCompleteRes.body.error.code === 'UPLOAD_VERIFICATION_FAILED',
      'Upload Verification: Forged completion of non-existent binary rejected with 400 UPLOAD_VERIFICATION_FAILED'
    );

    // 6. Direct Binary Upload to Signed URL (PUT /api/v1/storage/upload)
    const testImageBinary = Buffer.from('FAKE_JPEG_IMAGE_BINARY_DATA_REPAIRED_CAPACITOR_EVIDENCE');
    const binaryUploadRes = await request(
      serverUrl,
      'PUT',
      uploadUrl,
      testImageBinary,
      undefined,
      { 'Content-Type': 'image/jpeg' }
    );
    assert(
      binaryUploadRes.status === 200,
      'Direct Binary Upload: Successfully uploads image binary to signed upload URL'
    );

    // 7. Verify & Complete Upload (200 OK)
    const verifyCompleteRes = await request(
      serverUrl,
      'POST',
      `/api/v1/technicians/me/attachments/${attachmentP19Id}/complete`,
      {},
      tech1Token
    );
    assert(
      verifyCompleteRes.status === 200 &&
      verifyCompleteRes.body.success === true &&
      verifyCompleteRes.body.data.isVerified === true &&
      verifyCompleteRes.body.data.verifiedAt !== null,
      'Upload Verification: Verifies stored binary in storage and marks attachment isVerified=true'
    );

    // 8. Resolution Gate: Rejecting Resolution Without Verified Evidence on Ticket B
    const ticketP19B: any = {
      id: 'tkt_p19_no_evidence_b',
      ticketNumber: 'TKT-P19-0002',
      customerId: 'usr_customer_1',
      meterId: mtrP19.id,
      feederId: fdrP19.id,
      faultType: FaultType.LINE_DOWN,
      description: 'Downed conductor',
      isPlanned: false,
      status: OutageStatus.REPAIRING,
      reportedAt: p19Time,
      createdAt: p19Time,
      updatedAt: p19Time
    };
    store.outageTickets.set(ticketP19B.id, ticketP19B);

    const assignmentP19B: any = {
      id: 'asgn_p19_b',
      ticketId: ticketP19B.id,
      technicianId: 'usr_tech_1',
      assignedById: 'usr_admin_1',
      status: AssignmentStatus.IN_PROGRESS,
      assignedAt: p19Time
    };
    store.technicianAssignments.set(assignmentP19B.id, assignmentP19B);

    let noEvidenceBlocked = false;
    try {
      await outageService.transitionTicket(
        ticketP19B.id,
        OutageStatus.RESOLVED,
        'usr_tech_1',
        'Attempting resolve with zero photo evidence'
      );
    } catch (e: any) {
      if (e.statusCode === 422 && e.code === 'REPAIR_EVIDENCE_REQUIRED') {
        noEvidenceBlocked = true;
      }
    }
    assert(
      noEvidenceBlocked,
      'Resolution Gate: Attempting to resolve ticket without verified photo rejected with 422 REPAIR_EVIDENCE_REQUIRED'
    );

    // 9. Resolution Notes Gate: Rejecting Resolution With Empty Notes
    let emptyNotesBlocked = false;
    try {
      await outageService.transitionTicket(
        ticketP19A.id,
        OutageStatus.RESOLVED,
        'usr_tech_1',
        ''
      );
    } catch (e: any) {
      if (e.statusCode === 422 && e.code === 'RESOLUTION_NOTES_REQUIRED') {
        emptyNotesBlocked = true;
      }
    }
    assert(
      emptyNotesBlocked,
      'Resolution Gate: Attempting to resolve ticket with empty notes rejected with 422 RESOLUTION_NOTES_REQUIRED'
    );

    // 10. Resolution Success: Resolving Ticket A With Verified Evidence
    const resolveSuccessResult = await outageService.transitionTicket(
      ticketP19A.id,
      OutageStatus.RESOLVED,
      'usr_tech_1',
      'Replaced capacitor bank, flushed oil, tested continuity.'
    );
    assert(
      resolveSuccessResult.newStatus === OutageStatus.RESOLVED &&
      resolveSuccessResult.ticket.resolvedAt !== null &&
      resolveSuccessResult.ticket.resolutionNotes !== null,
      'Resolution Gate: Ticket with verified repair evidence and notes successfully transitions to RESOLVED'
    );

    // 11. Cross-Ticket Attachment Isolation: Evidence from Ticket A cannot resolve Ticket B
    let crossTicketBlocked = false;
    try {
      await outageService.transitionTicket(
        ticketP19B.id,
        OutageStatus.RESOLVED,
        'usr_tech_1',
        'Trying to resolve ticket B without uploading evidence for ticket B'
      );
    } catch (e: any) {
      if (e.statusCode === 422 && e.code === 'REPAIR_EVIDENCE_REQUIRED') {
        crossTicketBlocked = true;
      }
    }
    assert(
      crossTicketBlocked,
      'Cross-Ticket Isolation: Verified evidence on Ticket A cannot satisfy resolution gate for Ticket B'
    );

    // 12. Scoped Attachment Retrieval (GET /api/v1/outages/:outageId/attachments)
    const listAttachmentsRes = await request(
      serverUrl,
      'GET',
      `/api/v1/outages/${ticketP19A.id}/attachments`,
      undefined,
      tech1Token
    );
    assert(
      listAttachmentsRes.status === 200 &&
      listAttachmentsRes.body.success === true &&
      Array.isArray(listAttachmentsRes.body.data) &&
      listAttachmentsRes.body.data.length >= 1 &&
      listAttachmentsRes.body.data[0].downloadUrl.includes('/storage/download?key='),
      'Attachment Retrieval: GET /api/v1/outages/:id/attachments returns verified photos with short-lived signed download URLs'
    );

    // 13. Download Image Binary via Signed Download URL
    const signedDownloadUrl = listAttachmentsRes.body.data[0].downloadUrl;
    const downloadBinaryRes = await request(
      serverUrl,
      'GET',
      signedDownloadUrl
    );
    assert(
      downloadBinaryRes.status === 200,
      'Signed Download URL: Successfully downloads image binary via signed download URL'
    );

    // 14. Access Control: Customer Restricted from Private Repair Photos (403 FORBIDDEN)
    const customerForbiddenRes = await request(
      serverUrl,
      'GET',
      `/api/v1/outages/${ticketP19A.id}/attachments`,
      undefined,
      customerToken
    );
    assert(
      customerForbiddenRes.status === 403,
      'Access Control: Customer restricted from accessing internal technical repair photos (403 FORBIDDEN)'
    );



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


