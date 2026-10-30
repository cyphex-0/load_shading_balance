import {
  UserRole,
  UserStatus,
  FeederStatus,
  ScheduleStatus,
  OutageStatus,
  AssignmentStatus,
  UpgradeRequestStatus,
  NotificationType,
  DeliveryStatus,
  FaultType
} from './enums';

export interface ApiResponse<T = any> {
  success: boolean;
  data: T | null;
  error: ApiError | null;
  timestamp: string;
  requestId?: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: any[];
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface PaginatedData<T> {
  items: T[];
  meta: PaginationMeta;
}

export type PaginatedApiResponse<T> = ApiResponse<PaginatedData<T>>;

export interface PaginationQueryDto {
  page?: number;
  pageSize?: number;
}

export interface JwtPayload {
  sub: string;
  role: UserRole;
  zoneId?: string | null;
  name: string;
  email: string;
}

export interface UserDto {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  status: UserStatus;
  assignedZoneId?: string | null;
  emailVerified?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LinkedMeterSummaryDto {
  id: string;
  meterId: string;
  meterNumber: string;
  address: string;
  isPrimary: boolean;
  nickname?: string | null;
  feederName?: string | null;
  zoneName?: string | null;
}

export interface UserProfileDto extends UserDto {
  zone?: { id: string; name: string; code: string } | null;
  meters: LinkedMeterSummaryDto[];
}

export interface AuthResultDto {
  token: string;
  user: UserDto;
}

export interface ZoneDto {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  substationsCount?: number;
  feedersCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SubstationDto {
  id: string;
  name: string;
  code: string;
  zoneId: string;
  capacityMW: number;
  zone?: ZoneDto;
  feedersCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface FeederDto {
  id: string;
  name: string;
  code: string;
  substationId: string;
  capacityMW: number;
  isCritical: boolean;
  status: FeederStatus;
  substation?: SubstationDto;
  activeOutagesCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface MeterDto {
  id: string;
  meterNumber: string;
  feederId: string;
  address: string;
  feeder?: FeederDto;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerMeterDto {
  id: string;
  customerId: string;
  meterId: string;
  isPrimary: boolean;
  nickname?: string | null;
  linkedAt: string;
  meter: MeterDto;
}

export interface MeterLiveStatusDto {
  meterId: string;
  meterNumber: string;
  feederId: string;
  feederName: string;
  status: FeederStatus;
  isCritical: boolean;
  updatedAt: string;
}

export interface ScheduleSlotDto {
  id: string;
  scheduleId: string;
  startTime: string;
  endTime: string;
  targetDeficitMW: number;
  actualDeficitMW: number;
  feeders: {
    feederId: string;
    name: string;
    code: string;
    zoneName: string;
    loadMW: number;
  }[];
}

export interface ScheduleDto {
  id: string;
  planningDate: string;
  totalDeficitMW: number;
  status: ScheduleStatus;
  createdById: string;
  publishedAt?: string | null;
  cancelledAt?: string | null;
  notes?: string | null;
  slots: ScheduleSlotDto[];
  createdAt: string;
  updatedAt: string;
}

export interface OutageTicketDto {
  id: string;
  ticketNumber: string;
  customerId: string;
  meterId: string;
  feederId: string;
  description: string;
  landmark?: string | null;
  isPlanned: boolean;
  status: OutageStatus;
  reportedAt: string;
  resolvedAt?: string | null;
  resolutionNotes?: string | null;
  feeder?: FeederDto;
  customer?: {
    id: string;
    name: string;
    phone?: string | null;
  };
  assignment?: {
    technicianId: string;
    technicianName: string;
    status: AssignmentStatus;
    assignedAt: string;
  } | null;
  attachments?: {
    id: string;
    fileUrl: string;
    fileName: string;
    fileType: string;
    fileSize: number;
  }[];
}

export interface InfrastructureRequestDto {
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
  requester?: {
    name: string;
    email: string;
  };
  feeder?: FeederDto;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationDto {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  readAt?: string | null;
  metadata?: Record<string, any> | null;
  createdAt: string;
}

export interface NotificationListResponse extends PaginatedData<NotificationDto> {
  unreadCount: number;
}

export interface SmsSendOptions {
  to: string;
  body: string;
  idempotencyKey?: string;
}

export interface SmsSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  isPermanentError?: boolean;
}

export interface TwilioStatusCallbackDto {
  messageSid: string;
  messageStatus: string;
  to?: string;
  from?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface NotificationDeliveryLogDto {
  id: string;
  notificationId?: string | null;
  recipientPhone: string;
  channel: string;
  status: DeliveryStatus;
  providerResponse?: string | null;
  providerMessageId?: string | null;
  attempts: number;
  sentAt?: string | null;
  deliveredAt?: string | null;
  error?: string | null;
  createdAt: string;
}

export interface GridMetricsDto {
  totalDemandMW: number;
  availableCapacityMW: number;
  currentDeficitMW: number;
  activeOutagesCount: number;
  timestamp: string;
}

// ============================================================================
// Phase 12: Grid Discovery, Effective Feeder Status, and Operator Overview DTOs
// ============================================================================

export interface ZonePublicSummaryDto {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  substationsCount: number;
  feedersCount: number;
  totalCapacityMW: number;
  activeOutagesCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FeederPublicSummaryDto {
  id: string;
  name: string;
  code: string;
  capacityMW: number;
  isCritical: boolean;
  status: FeederStatus;
  effectiveStatus: FeederStatus;
  substationId: string;
  substationName: string;
  zoneId?: string | null;
  zoneName?: string | null;
  connectedMetersCount: number;
  activeOutagesCount?: number;
  activeOutage?: {
    type: 'PLANNED' | 'UNPLANNED';
    startTime: string;
    estimatedRestoration?: string | null;
    ticketNumber?: string;
  } | null;
  updatedAt: string;
}

export interface PublicScheduleSlotDto {
  id: string;
  startTime: string;
  endTime: string;
  targetDeficitMW: number;
  actualDeficitMW: number;
  assignedFeeders: Array<{
    id: string;
    name: string;
    code: string;
    substationName: string;
    zoneName: string;
    capacityMW: number;
  }>;
}

export interface PublicScheduleResponseDto {
  id: string;
  planningDate: string;
  status: ScheduleStatus;
  publishedAt?: string | null;
  totalSlots: number;
  slots: PublicScheduleSlotDto[];
}

export interface GridOverviewDto {
  metrics: GridMetricsDto;
  feederCounts: {
    total: number;
    online: number;
    plannedOutage: number;
    unexpectedFault: number;
    criticalExempt: number;
  };
  activeOutages: {
    plannedCount: number;
    unplannedCount: number;
    totalCount: number;
  };
  technicians: {
    total: number;
    active: number;
    dispatched: number;
  };
  zoneBreakdown: Array<{
    zoneId: string;
    zoneName: string;
    zoneCode: string;
    totalFeeders: number;
    onlineCount: number;
    outageCount: number;
    totalCapacityMW: number;
  }>;
}

export interface ActiveOutageItemDto {
  id: string;
  feederId: string;
  feederName: string;
  feederCode: string;
  capacityMW: number;
  substationName: string;
  zoneName: string;
  outageType: 'PLANNED' | 'UNPLANNED';
  status: string;
  startTime: string;
  estimatedRestoration?: string | null;
  impactedMetersCount: number;
  ticket?: {
    id: string;
    ticketNumber: string;
    description: string;
    status: OutageStatus;
    reportedAt: string;
    assignedTechnician?: {
      id: string;
      name: string;
      phone?: string | null;
    } | null;
  } | null;
  scheduleSlot?: {
    scheduleId: string;
    slotId: string;
    startTime: string;
    endTime: string;
    targetDeficitMW: number;
  } | null;
}

// ============================================================================
// Phase 13: Fair-Rotation Scheduling Engine DTOs & Interfaces
// ============================================================================

export interface CandidateFeederInput {
  id: string;
  name: string;
  code: string;
  capacityMW: number;
  isCritical: boolean;
  substationId: string;
  substationName: string;
  zoneId?: string | null;
  zoneName?: string | null;
}

export interface FeederUsageHistoryInput {
  feederId: string;
  totalCutsCount: number;
  cumulativeShedHours: number;
  lastShedAt?: string | null;
}

export interface FairRotationEngineInput {
  planningDate: string;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  targetDeficitMW: number;
  candidateFeeders: CandidateFeederInput[];
  historicalMetrics?: FeederUsageHistoryInput[];
  alreadyCommittedFeederIds?: string[];
  zoneFilterIds?: string[];
  operationalTimezone?: string;
}

export interface AllocatedFeederSlotItem {
  feederId: string;
  name: string;
  code: string;
  capacityMW: number;
  substationName: string;
  zoneName: string;
  equityScore: number;
}

export interface PlannedSlotOutput {
  slotIndex: number;
  startTime: string;
  endTime: string;
  targetDeficitMW: number;
  actualDeficitMW: number;
  shortfallMW: number;
  isDeficitSatisfied: boolean;
  assignedFeeders: AllocatedFeederSlotItem[];
}

export interface FairRotationSchedulePlan {
  planningDate: string;
  targetDeficitMW: number;
  totalDurationMinutes: number;
  totalSlots: number;
  overallTargetMWh: number;
  overallActualMWh: number;
  overallShortfallMWh: number;
  eligibleFeedersCount: number;
  criticalExcludedCount: number;
  sameDayExcludedCount: number;
  slots: PlannedSlotOutput[];
}



// ============================================================================
// Phase 14: Schedule Persistence, Generation Run, and Feeder Schedules
// ============================================================================

export interface ScheduleGenerationRunRecord {
  id: string;
  scheduleId: string;
  operatorId: string;
  planningDate: string;
  algorithmVersion: string;
  targetDeficitMW: number;
  selectedMW: number;
  shortfallMW: number;
  totalSlots: number;
  eligibleFeedersCount: number;
  criticalExcludedCount: number;
  sameDayExcludedCount: number;
  diagnostics: Record<string, any>;
  createdAt: string;
}

export interface FeederScheduleSlotDto {
  scheduleId: string;
  planningDate: string;
  scheduleStatus: ScheduleStatus;
  slotId: string;
  startTime: string;
  endTime: string;
  targetDeficitMW: number;
  actualDeficitMW: number;
  feederLoadMW: number;
  isPublished: boolean;
}

// ============================================================================
// Phase 15: Customer Read Journey and Dashboard Types
// ============================================================================

export interface CustomerMeterStatusDto {
  meterId: string;
  meterNumber: string;
  address: string;
  isPrimary: boolean;
  nickname?: string | null;
  feederId: string;
  feederName: string;
  feederCode: string;
  substationName: string;
  zoneName: string;
  status: FeederStatus;
  updatedAt: string;
}

export interface CustomerDashboardDto {
  customer: {
    id: string;
    name: string;
    email: string;
  };
  meters: CustomerMeterStatusDto[];
  upcomingSchedules: FeederScheduleSlotDto[];
  activeOutages: any[];
  notifications: {
    unreadCount: number;
    recent: NotificationDto[];
  };
}


// ============================================================================
// Phase 17: Smart Outage Reporting & Planned Conflict DTOs
// ============================================================================

export interface OutageReportEventDto {
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

export interface OutageReportListItemDto {
  id: string;
  type: 'UNPLANNED_FAULT' | 'PLANNED_CONFLICT';
  ticketNumber?: string | null;
  meterId: string;
  meterNumber: string;
  feederId: string;
  feederName: string;
  status: string;
  description: string;
  isPlanned: boolean;
  scheduledEndTime?: string | null;
  reportedAt: string;
  createdAt: string;
}

export interface ConflictResolutionResultDto {
  isPlanned: boolean;
  ticketCreated: boolean;
  classification?: 'KNOWN_PLANNED_OUTAGE' | 'UNPLANNED_FAULT';
  scheduledEndTime?: string;
  ticket?: any;
  event?: OutageReportEventDto;
  message: string;
}
