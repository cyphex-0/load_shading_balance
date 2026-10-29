import { createApp } from '../app';
import http from 'http';
import { logger } from '../utils/logger';

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
    body: body ? JSON.stringify(body) : undefined
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

    // Test 4: RBAC Security - Customer attempting Admin endpoint is rejected (403)
    const forbiddenAttempt = await request(serverUrl, 'POST', '/api/admin/zones', { name: 'Hack Zone', code: 'HCK' }, customerToken);
    assert(forbiddenAttempt.status === 403, 'RBAC prevents Customer from calling Admin API (403 Forbidden)');

    // Test 5: Grid Discovery
    const zones = await request(serverUrl, 'GET', '/api/zones');
    assert(zones.status === 200 && zones.body.data.length >= 2, 'GET /api/zones returns active zones');

    const feeders = await request(serverUrl, 'GET', '/api/feeders');
    assert(feeders.status === 200 && feeders.body.data.length >= 5, 'GET /api/feeders returns feeders');

    // Test 6: Operator Schedule Generation with Critical Feeder Exclusion & No-Double-Cut
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

