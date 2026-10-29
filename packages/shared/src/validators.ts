import { z } from 'zod';
import { UserRole, UserStatus, FeederStatus, UpgradeRequestStatus } from './enums';

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
  nickname: z.string().optional()
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

