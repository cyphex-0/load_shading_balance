import {
  UserRole,
  UserStatus,
  FeederStatus,
  ScheduleStatus,
  OutageStatus,
  AssignmentStatus,
  UpgradeRequestStatus
} from '@load-shedding/shared';
import {
  UserRecord,
  ZoneRecord,
  SubstationRecord,
  FeederRecord,
  MeterRecord,
  OutageTicketRecord,
  ScheduleRecord
} from '../db/store';

let idCounter = 1000;
const nextId = (prefix: string) => `${prefix}_test_${++idCounter}`;

export const buildTestUser = (overrides: Partial<UserRecord> = {}): UserRecord => {
  const now = new Date().toISOString();
  return {
    id: nextId('usr'),
    name: 'Test User',
    email: `test_${idCounter}@grid.gov.bd`,
    phone: '+8801700000000',
    passwordHash: '$2a$10$hashed_test_password',
    role: UserRole.CUSTOMER,
    status: UserStatus.ACTIVE,
    assignedZoneId: null,
    emailVerified: now,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides
  };
};

export const buildTestZone = (overrides: Partial<ZoneRecord> = {}): ZoneRecord => {
  const now = new Date().toISOString();
  return {
    id: nextId('zn'),
    name: `Test Zone ${idCounter}`,
    code: `TZN${idCounter}`,
    description: 'Test zone description',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides
  };
};

export const buildTestSubstation = (zoneId: string, overrides: Partial<SubstationRecord> = {}): SubstationRecord => {
  const now = new Date().toISOString();
  return {
    id: nextId('sub'),
    name: `Test Substation ${idCounter}`,
    code: `SUB-TST-${idCounter}`,
    zoneId,
    capacityMW: 50.0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides
  };
};

export const buildTestFeeder = (substationId: string, overrides: Partial<FeederRecord> = {}): FeederRecord => {
  const now = new Date().toISOString();
  return {
    id: nextId('fdr'),
    name: `Test Feeder ${idCounter}`,
    code: `FDR-TST-${idCounter}`,
    substationId,
    capacityMW: 10.0,
    isCritical: false,
    status: FeederStatus.ONLINE,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides
  };
};

export const buildTestMeter = (feederId: string, overrides: Partial<MeterRecord> = {}): MeterRecord => {
  const now = new Date().toISOString();
  return {
    id: nextId('mtr'),
    meterNumber: `MTR-TST-${idCounter}`,
    feederId,
    address: `Test Address, Unit ${idCounter}`,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides
  };
};

export const buildTestOutageTicket = (
  customerId: string,
  meterId: string,
  feederId: string,
  overrides: Partial<OutageTicketRecord> = {}
): OutageTicketRecord => {
  const now = new Date().toISOString();
  return {
    id: nextId('tkt'),
    ticketNumber: `TKT-2026-${idCounter}`,
    customerId,
    meterId,
    feederId,
    description: 'Power outage detected on feeder line',
    landmark: 'Near Test Landmark',
    isPlanned: false,
    status: OutageStatus.REPORTED,
    reportedAt: now,
    resolvedAt: null,
    resolutionNotes: null,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
};

export const buildTestSchedule = (
  planningDate: string,
  overrides: Partial<ScheduleRecord> = {}
): ScheduleRecord => {
  const now = new Date().toISOString();
  return {
    id: nextId('sched'),
    planningDate,
    totalDeficitMW: 25.0,
    status: ScheduleStatus.DRAFT,
    createdById: nextId('usr_op'),
    publishedAt: null,
    cancelledAt: null,
    notes: 'Draft rotational schedule for peak hours',
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
};

/**
 * Deterministic Mock Clock for simulating scheduled cut windows and time intervals.
 */
export class MockClock {
  private currentTime: Date;

  constructor(initialTimeIso: string = '2026-09-25T14:00:00.000Z') {
    this.currentTime = new Date(initialTimeIso);
  }

  public now(): Date {
    return new Date(this.currentTime.getTime());
  }

  public nowIso(): string {
    return this.currentTime.toISOString();
  }

  public advanceMinutes(minutes: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + minutes * 60 * 1000);
  }

  public advanceHours(hours: number): void {
    this.advanceMinutes(hours * 60);
  }

  public setTime(timeIso: string): void {
    this.currentTime = new Date(timeIso);
  }
}

export const createMockClock = (initialTimeIso?: string) => new MockClock(initialTimeIso);
