import {
  UserRole,
  UserStatus,
  FeederStatus,
  ScheduleStatus,
  OutageStatus,
  AssignmentStatus,
  UpgradeRequestStatus,
  NotificationType,
  DeliveryStatus
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

export interface GridMetricsDto {
  totalDemandMW: number;
  availableCapacityMW: number;
  currentDeficitMW: number;
  activeOutagesCount: number;
  timestamp: string;
}
