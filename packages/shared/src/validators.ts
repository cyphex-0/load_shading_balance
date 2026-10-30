import { z } from 'zod';
import { UserRole, UserStatus, FeederStatus, UpgradeRequestStatus, ScheduleStatus } from './enums';

// Auth validators
export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  meterNumber: z.string().optional()
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address')
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters')
});

export const verifyEmailConfirmSchema = z.object({
  token: z.string().min(1, 'Verification token is required')
});

export const refreshTokenSchema = z.object({
  token: z.string().optional()
});

export const updateProfileSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().optional()
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters')
});

// Meter validators
export const linkMeterSchema = z.object({
  meterNumber: z.string().min(1, 'Meter number is required'),
  address: z.string().optional(),
  nickname: z.string().optional(),
  isPrimary: z.boolean().optional()
});

// Outage report validator
export const reportOutageSchema = z.object({
  meterId: z.string().min(1, 'Meter ID is required'),
  description: z.string().min(5, 'Please provide more details about the outage'),
  landmark: z.string().optional()
});

// Operator schedule generator validator
export const generateScheduleDraftSchema = z.object({
  planningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  deficitMW: z.number().positive('Deficit MW must be positive'),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Start time must be HH:MM'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'End time must be HH:MM'),
  slotDurationMinutes: z.number().min(15).max(360).default(60),
  zoneIds: z.array(z.string()).optional()
});

export const adjustSlotSchema = z.object({
  feederIds: z.array(z.string()).min(1, 'At least one feeder is required')
});

export const assignTechnicianSchema = z.object({
  technicianId: z.string().min(1, 'Technician ID is required')
});

export const resolveTicketSchema = z.object({
  resolutionNotes: z.string().min(5, 'Resolution notes are required'),
  attachmentId: z.string().optional()
});

export const infrastructureRequestSchema = z.object({
  feederId: z.string().min(1, 'Feeder ID is required'),
  reason: z.string().min(5, 'Reason must be detailed'),
  proposedAction: z.string().min(5, 'Proposed action must be specified'),
  supportingMetrics: z.record(z.any()).optional().default({})
});

export const reviewInfrastructureRequestSchema = z.object({
  status: z.enum([UpgradeRequestStatus.APPROVED, UpgradeRequestStatus.REJECTED]),
  adminNotes: z.string().optional()
});

// Admin CRUD schemas
export const createZoneSchema = z.object({
  name: z.string().min(2, 'Zone name is required'),
  code: z.string().min(2, 'Zone code is required').toUpperCase(),
  description: z.string().optional()
});

export const updateZoneSchema = createZoneSchema.partial();

export const createSubstationSchema = z.object({
  name: z.string().min(2, 'Substation name is required'),
  code: z.string().min(2, 'Substation code is required').toUpperCase(),
  zoneId: z.string().min(1, 'Zone ID is required'),
  capacityMW: z.number().positive('Capacity must be positive')
});

export const updateSubstationSchema = createSubstationSchema.partial();

export const createFeederSchema = z.object({
  name: z.string().min(2, 'Feeder name is required'),
  code: z.string().min(2, 'Feeder code is required').toUpperCase(),
  substationId: z.string().min(1, 'Substation ID is required'),
  capacityMW: z.number().positive('Capacity must be positive'),
  isCritical: z.boolean().default(false)
});

export const updateFeederSchema = z.object({
  name: z.string().min(2).optional(),
  code: z.string().min(2).toUpperCase().optional(),
  capacityMW: z.number().positive().optional(),
  isCritical: z.boolean().optional(),
  status: z.nativeEnum(FeederStatus).optional()
});

export const toggleCriticalSchema = z.object({
  isCritical: z.boolean()
});

export const createMeterSchema = z.object({
  meterNumber: z.string().min(3, 'Meter number is required'),
  feederId: z.string().min(1, 'Feeder ID is required'),
  address: z.string().min(3, 'Address is required')
});

export const updateMeterSchema = z.object({
  feederId: z.string().min(1, 'Feeder ID is required').optional(),
  address: z.string().min(3, 'Address is required').optional()
});

export const provisionUserSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Invalid email'),
  phone: z.string().optional(),
  role: z.nativeEnum(UserRole),
  assignedZoneId: z.string().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').optional().default('GridSecret123!')
});

export const updateUserAdminSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().optional(),
  role: z.nativeEnum(UserRole).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  assignedZoneId: z.string().nullable().optional()
});

export const updateUserRoleSchema = z.object({
  role: z.nativeEnum(UserRole),
  assignedZoneId: z.string().nullable().optional()
});

export const updateUserStatusSchema = z.object({
  status: z.nativeEnum(UserStatus)
});

// ============================================================================
// Phase 6: Pagination, Query Filters, and Path Parameter Validators
// ============================================================================

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});

export const notificationQuerySchema = paginationQuerySchema.extend({
  unreadOnly: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional())
});

export const userListQuerySchema = paginationQuerySchema.extend({
  role: z.nativeEnum(UserRole).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  zoneId: z.string().optional()
});

export const zoneListQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional()
});

export const scheduleListQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(ScheduleStatus).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional()
});

export const auditLogQuerySchema = paginationQuerySchema.extend({
  action: z.string().optional(),
  userId: z.string().optional()
});

export const idParamSchema = z.object({
  id: z.string().min(1, 'Resource identifier is required')
});

// ============================================================================
// Phase 12: Grid Discovery, Effective Feeder Status, and Operator Overview Schemas
// ============================================================================

export const publicScheduleQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD').optional(),
  zoneId: z.string().optional(),
  feederId: z.string().optional()
});

export const publicFeedersQuerySchema = paginationQuerySchema.extend({
  zoneId: z.string().optional(),
  substationId: z.string().optional(),
  status: z.nativeEnum(FeederStatus).optional(),
  isCritical: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
  search: z.string().optional()
});

export const activeOutagesQuerySchema = paginationQuerySchema.extend({
  zoneId: z.string().optional(),
  outageType: z.enum(['PLANNED', 'UNPLANNED']).optional()
});

// ============================================================================
// Phase 13: Fair-Rotation Scheduling Engine Schemas
// ============================================================================

export const candidateFeederInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  code: z.string().min(1),
  capacityMW: z.number().positive(),
  isCritical: z.boolean(),
  substationId: z.string().min(1),
  substationName: z.string().min(1),
  zoneId: z.string().nullable().optional(),
  zoneName: z.string().nullable().optional()
});

export const feederUsageHistoryInputSchema = z.object({
  feederId: z.string().min(1),
  totalCutsCount: z.number().int().nonnegative().default(0),
  cumulativeShedHours: z.number().nonnegative().default(0),
  lastShedAt: z.string().nullable().optional()
});

export const fairRotationEngineInputSchema = z.object({
  planningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD'),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Start time must be HH:MM'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'End time must be HH:MM'),
  slotDurationMinutes: z.number().int().min(15).max(360).default(60),
  targetDeficitMW: z.number().positive('Deficit must be positive'),
  candidateFeeders: z.array(candidateFeederInputSchema).min(1, 'At least one candidate feeder is required'),
  historicalMetrics: z.array(feederUsageHistoryInputSchema).optional(),
  alreadyCommittedFeederIds: z.array(z.string()).optional(),
  zoneFilterIds: z.array(z.string()).optional(),
  operationalTimezone: z.string().default('Asia/Dhaka')
});



// ============================================================================
// Phase 14: Schedule Persistence, Review, Publish, and Feeder Lookup Schemas
// ============================================================================

export const updateScheduleMetadataSchema = z.object({
  notes: z.string().max(1000, 'Notes cannot exceed 1000 characters').optional()
});

export const feederScheduleQuerySchema = paginationQuerySchema.extend({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be YYYY-MM-DD').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be YYYY-MM-DD').optional(),
  status: z.nativeEnum(ScheduleStatus).optional()
});

// ============================================================================
// Phase 15: Customer Dashboard, Multi-Meter Status, and Schedule Queries
// ============================================================================

export const customerStatusQuerySchema = z.object({
  meterId: z.string().optional()
});

export const customerScheduleQuerySchema = paginationQuerySchema.extend({
  meterId: z.string().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be YYYY-MM-DD').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be YYYY-MM-DD').optional()
});

