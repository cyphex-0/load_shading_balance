import bcrypt from 'bcryptjs';
import {
  UserRole,
  UserStatus,
  FeederStatus,
  ScheduleStatus,
  OutageStatus,
  FaultType,
  AssignmentStatus,
  UpgradeRequestStatus,
  NotificationType,
  DeliveryStatus,
  ScheduleGenerationRunRecord
} from '@load-shedding/shared';

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  assignedZoneId?: string | null;
  emailVerified?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface ZoneRecord {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface SubstationRecord {
  id: string;
  name: string;
  code: string;
  zoneId: string;
  capacityMW: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface FeederRecord {
  id: string;
  name: string;
  code: string;
  substationId: string;
  capacityMW: number;
  isCritical: boolean;
  status: FeederStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface MeterRecord {
  id: string;
  meterNumber: string;
  feederId: string;
  address: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface CustomerMeterRecord {
  id: string;
  customerId: string;
  meterId: string;
  isPrimary: boolean;
  nickname?: string | null;
  linkedAt: string;
  unlinkedAt?: string | null;
}

export interface ScheduleRecord {
  id: string;
  planningDate: string;
  totalDeficitMW: number;
  status: ScheduleStatus;
  createdById: string;
  publishedAt?: string | null;
  cancelledAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleSlotRecord {
  id: string;
  scheduleId: string;
  startTime: string;
  endTime: string;
  targetDeficitMW: number;
  actualDeficitMW: number;
  createdAt: string;
}

export interface ScheduleFeederAssignmentRecord {
  id: string;
  slotId: string;
  feederId: string;
  loadMW: number;
  feederLoadMW?: number;
  createdAt: string;
}

export interface OutageTicketRecord {
  id: string;
  ticketNumber: string;
  customerId: string;
  meterId: string;
  feederId: string;
  description: string;
  landmark?: string | null;
  isPlanned: boolean;
  faultType?: FaultType;
  status: OutageStatus;
  reportedAt: string;
  resolvedAt?: string | null;
  resolutionNotes?: string | null;
  assignedAt?: string | null;
  enRouteAt?: string | null;
  repairingAt?: string | null;
  cancelledAt?: string | null;
  cancelledReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OutageReportEventRecord {
  id: string;
  customerId: string;
  meterId: string;
  feederId: string;
  classification: 'PLANNED_CONFLICT';
  scheduleId?: string | null;
  slotId?: string | null;
  plannedEndTime: string;
  message: string;
  createdAt: string;
}

export interface TechnicianAssignmentRecord {
  id: string;
  ticketId: string;
  technicianId: string;
  assignedById: string;
  status: AssignmentStatus;
  assignedAt: string;
  acceptedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface OutageAttachmentRecord {
  id: string;
  ticketId: string;
  uploaderId: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
}

export interface OutageStatusHistoryRecord {
  id: string;
  ticketId: string;
  previousStatus?: OutageStatus | null;
  newStatus: OutageStatus;
  changedById?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface InfrastructureRequestRecord {
  id: string;
  requesterId: string;
  feederId: string;
  reason: string;
  proposedAction: string;
  supportingMetrics: Record<string, any>;
  status: UpgradeRequestStatus;
  adminNotes?: string | null;
  reviewedById?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  readAt?: string | null;
  eventKey?: string | null;
  metadata?: Record<string, any> | null;
  createdAt: string;
}

export interface NotificationDeliveryLogRecord {
  id: string;
  notificationId?: string | null;
  recipientPhone: string;
  channel: string;
  status: DeliveryStatus;
  providerResponse?: string | null;
  providerMessageId?: string | null;
  idempotencyKey?: string | null;
  attempts: number;
  nextAttemptAt?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  error?: string | null;
  createdAt: string;
}

export interface AuditLogRecord {
  id: string;
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: Record<string, any> | null;
  ipAddress?: string | null;
  createdAt: string;
}

export interface GridMetricsRecord {
  id: string;
  totalDemandMW: number;
  availableCapacityMW: number;
  currentDeficitMW: number;
  activeOutagesCount: number;
  timestamp: string;
}

export class MemoryStore {
  public users: Map<string, UserRecord> = new Map();
  public verificationTokens: Map<string, { email: string; token: string; expiresAt: string; usedAt?: string | null }> = new Map();
  public passwordResetTokens: Map<string, { email: string; token: string; expiresAt: string; usedAt?: string | null }> = new Map();
  public zones: Map<string, ZoneRecord> = new Map();
  public substations: Map<string, SubstationRecord> = new Map();
  public feeders: Map<string, FeederRecord> = new Map();
  public meters: Map<string, MeterRecord> = new Map();
  public customerMeters: Map<string, CustomerMeterRecord> = new Map();
  public schedules: Map<string, ScheduleRecord> = new Map();
  public scheduleSlots: Map<string, ScheduleSlotRecord> = new Map();
  public scheduleFeederAssignments: Map<string, ScheduleFeederAssignmentRecord> = new Map();
  public outageTickets: Map<string, OutageTicketRecord> = new Map();
  public outageReportEvents: Map<string, OutageReportEventRecord> = new Map();
  public technicianAssignments: Map<string, TechnicianAssignmentRecord> = new Map();
  public outageAttachments: Map<string, OutageAttachmentRecord> = new Map();
  public outageStatusHistories: Map<string, OutageStatusHistoryRecord> = new Map();
  public infrastructureRequests: Map<string, InfrastructureRequestRecord> = new Map();
  public notifications: Map<string, NotificationRecord> = new Map();
  public notificationDeliveryLogs: Map<string, NotificationDeliveryLogRecord> = new Map();
  public auditLogs: Map<string, AuditLogRecord> = new Map();
  public gridMetrics: GridMetricsRecord[] = [];
  public scheduleGenerationRuns: Map<string, ScheduleGenerationRunRecord> = new Map();
  public idempotencyKeys: Map<string, { result: any; createdAt: string }> = new Map();

  constructor() {
    this.seedInitialData();
  }

  /**
   * Resets all in-memory collections to the initial pristine seed state.
   * Strictly prohibited in production environments.
   */
  public reset(): void {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[SECURITY ERROR] Cannot reset MemoryStore in production environment.');
    }

    this.users.clear();
    this.verificationTokens.clear();
    this.passwordResetTokens.clear();
    this.zones.clear();
    this.substations.clear();
    this.feeders.clear();
    this.meters.clear();
    this.customerMeters.clear();
    this.schedules.clear();
    this.scheduleSlots.clear();
    this.scheduleFeederAssignments.clear();
    this.outageTickets.clear();
    this.outageReportEvents.clear();
    this.technicianAssignments.clear();
    this.outageAttachments.clear();
    this.outageStatusHistories.clear();
    this.infrastructureRequests.clear();
    this.notifications.clear();
    this.notificationDeliveryLogs.clear();
    this.auditLogs.clear();
    this.gridMetrics = [];
    this.scheduleGenerationRuns.clear();
    this.idempotencyKeys.clear();

    this.seedInitialData();
  }

  private seedInitialData() {
    const salt = bcrypt.genSaltSync(10);
    const defaultPasswordHash = bcrypt.hashSync('Password123!', salt);
    const now = new Date().toISOString();

    // 1. Zones
    const zoneDhanmondi: ZoneRecord = {
      id: 'zn_dhanmondi',
      name: 'Dhanmondi Zone',
      code: 'DHN',
      description: 'Dhanmondi & surrounding commercial/residential areas',
      createdAt: now,
      updatedAt: now
    };
    const zoneMirpur: ZoneRecord = {
      id: 'zn_mirpur',
      name: 'Mirpur Zone',
      code: 'MIR',
      description: 'Mirpur metropolitan sectors 1-14',
      createdAt: now,
      updatedAt: now
    };
    this.zones.set(zoneDhanmondi.id, zoneDhanmondi);
    this.zones.set(zoneMirpur.id, zoneMirpur);

    // 2. Substations
    const subDhn1: SubstationRecord = {
      id: 'sub_dhn_1',
      name: 'Dhanmondi 33/11kV Substation 1',
      code: 'SUB-DHN-01',
      zoneId: zoneDhanmondi.id,
      capacityMW: 60,
      createdAt: now,
      updatedAt: now
    };
    const subDhn2: SubstationRecord = {
      id: 'sub_dhn_2',
      name: 'Dhanmondi 33/11kV Substation 2',
      code: 'SUB-DHN-02',
      zoneId: zoneDhanmondi.id,
      capacityMW: 45,
      createdAt: now,
      updatedAt: now
    };
    const subMir1: SubstationRecord = {
      id: 'sub_mir_1',
      name: 'Mirpur 33/11kV Substation 1',
      code: 'SUB-MIR-01',
      zoneId: zoneMirpur.id,
      capacityMW: 80,
      createdAt: now,
      updatedAt: now
    };
    this.substations.set(subDhn1.id, subDhn1);
    this.substations.set(subDhn2.id, subDhn2);
    this.substations.set(subMir1.id, subMir1);

    // 3. Feeders
    const fdr1: FeederRecord = {
      id: 'fdr_dhn_1',
      name: 'Dhanmondi Road 27 Feeder',
      code: 'FDR-DHN-27',
      substationId: subDhn1.id,
      capacityMW: 12.5,
      isCritical: false,
      status: FeederStatus.ONLINE,
      createdAt: now,
      updatedAt: now
    };
    const fdr2: FeederRecord = {
      id: 'fdr_dhn_hosp',
      name: 'Ibn Sina Hospital Critical Feeder',
      code: 'FDR-DHN-HOSP',
      substationId: subDhn1.id,
      capacityMW: 8.0,
      isCritical: true, // Hospital feeder: NEVER cut!
      status: FeederStatus.ONLINE,
      createdAt: now,
      updatedAt: now
    };
    const fdr3: FeederRecord = {
      id: 'fdr_dhn_3',
      name: 'Satmasjid Road Feeder',
      code: 'FDR-DHN-SAT',
      substationId: subDhn2.id,
      capacityMW: 15.0,
      isCritical: false,
      status: FeederStatus.ONLINE,
      createdAt: now,
      updatedAt: now
    };
    const fdr4: FeederRecord = {
      id: 'fdr_mir_1',
      name: 'Mirpur 10 Circle Feeder',
      code: 'FDR-MIR-10',
      substationId: subMir1.id,
      capacityMW: 20.0,
      isCritical: false,
      status: FeederStatus.ONLINE,
      createdAt: now,
      updatedAt: now
    };
    const fdr5: FeederRecord = {
      id: 'fdr_mir_2',
      name: 'Mirpur 2 Stadium Feeder',
      code: 'FDR-MIR-02',
      substationId: subMir1.id,
      capacityMW: 14.0,
      isCritical: false,
      status: FeederStatus.ONLINE,
      createdAt: now,
      updatedAt: now
    };
    this.feeders.set(fdr1.id, fdr1);
    this.feeders.set(fdr2.id, fdr2);
    this.feeders.set(fdr3.id, fdr3);
    this.feeders.set(fdr4.id, fdr4);
    this.feeders.set(fdr5.id, fdr5);

    // 4. Meters
    const mtr1: MeterRecord = {
      id: 'mtr_dhn_101',
      meterNumber: 'MTR-DHN-101',
      feederId: fdr1.id,
      address: 'House 14, Road 27, Dhanmondi, Dhaka',
      createdAt: now,
      updatedAt: now
    };
    const mtr2: MeterRecord = {
      id: 'mtr_dhn_102',
      meterNumber: 'MTR-DHN-102',
      feederId: fdr3.id,
      address: 'Plot 42, Satmasjid Road, Dhanmondi, Dhaka',
      createdAt: now,
      updatedAt: now
    };
    const mtr3: MeterRecord = {
      id: 'mtr_mir_201',
      meterNumber: 'MTR-MIR-201',
      feederId: fdr4.id,
      address: 'Section 10, Block C, Mirpur, Dhaka',
      createdAt: now,
      updatedAt: now
    };
    this.meters.set(mtr1.id, mtr1);
    this.meters.set(mtr2.id, mtr2);
    this.meters.set(mtr3.id, mtr3);

    // 5. Users (All 5 Roles)
    const adminUser: UserRecord = {
      id: 'usr_admin_1',
      name: 'System Administrator',
      email: 'admin@grid.gov.bd',
      phone: '+8801700000001',
      passwordHash: defaultPasswordHash,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      emailVerified: now,
      createdAt: now,
      updatedAt: now
    };

    const operatorUser: UserRecord = {
      id: 'usr_operator_1',
      name: 'Control Room Operator Rahim',
      email: 'operator@grid.gov.bd',
      phone: '+8801700000002',
      passwordHash: defaultPasswordHash,
      role: UserRole.POWER_OPERATOR,
      status: UserStatus.ACTIVE,
      emailVerified: now,
      createdAt: now,
      updatedAt: now
    };

    const technicianUser: UserRecord = {
      id: 'usr_tech_1',
      name: 'Field Technician Karim',
      email: 'tech1@grid.gov.bd',
      phone: '+8801700000003',
      passwordHash: defaultPasswordHash,
      role: UserRole.TECHNICIAN,
      status: UserStatus.ACTIVE,
      assignedZoneId: zoneDhanmondi.id,
      emailVerified: now,
      createdAt: now,
      updatedAt: now
    };

    const managerUser: UserRecord = {
      id: 'usr_manager_1',
      name: 'Dhanmondi Zone Manager Tanvir',
      email: 'manager.dhanmondi@grid.gov.bd',
      phone: '+8801700000004',
      passwordHash: defaultPasswordHash,
      role: UserRole.ZONE_MANAGER,
      status: UserStatus.ACTIVE,
      assignedZoneId: zoneDhanmondi.id,
      emailVerified: now,
      createdAt: now,
      updatedAt: now
    };

    const customerUser: UserRecord = {
      id: 'usr_customer_1',
      name: 'Anisur Rahman',
      email: 'customer@gmail.com',
      phone: '+8801712345678',
      passwordHash: defaultPasswordHash,
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
      emailVerified: now,
      createdAt: now,
      updatedAt: now
    };

    this.users.set(adminUser.id, adminUser);
    this.users.set(operatorUser.id, operatorUser);
    this.users.set(technicianUser.id, technicianUser);
    this.users.set(managerUser.id, managerUser);
    this.users.set(customerUser.id, customerUser);

    // 6. CustomerMeter link
    const custMeter1: CustomerMeterRecord = {
      id: 'cm_1',
      customerId: customerUser.id,
      meterId: mtr1.id,
      isPrimary: true,
      nickname: 'Residence',
      linkedAt: now
    };
    this.customerMeters.set(custMeter1.id, custMeter1);

    // 7. Initial Grid Metrics
    this.gridMetrics.push({
      id: 'gm_1',
      totalDemandMW: 12500,
      availableCapacityMW: 11200,
      currentDeficitMW: 1300,
      activeOutagesCount: 0,
      timestamp: now
    });
  }
}

export const store = new MemoryStore();

