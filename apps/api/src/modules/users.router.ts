import { Router } from 'express';
import bcrypt from 'bcryptjs';
import {
  updateProfileSchema,
  changePasswordSchema,
  notificationQuerySchema,
  UserProfileDto
} from '@load-shedding/shared';
import { store } from '../db/store';
import { authenticateUser } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import {
  successResponse,
  NotFoundError,
  BadRequestError
} from '../utils/response';

export const usersRouter = Router();

// Helper to construct canonical user profile DTO
const getUserProfile = (userId: string): UserProfileDto | null => {
  const user = store.users.get(userId);
  if (!user || user.deletedAt) return null;

  const zone = user.assignedZoneId ? store.zones.get(user.assignedZoneId) : null;

  const meters = Array.from(store.customerMeters.values())
    .filter((cm) => cm.customerId === user.id && !cm.unlinkedAt)
    .map((cm) => {
      const meter = store.meters.get(cm.meterId);
      const feeder = meter ? store.feeders.get(meter.feederId) : null;
      const sub = feeder ? store.substations.get(feeder.substationId) : null;
      const z = sub ? store.zones.get(sub.zoneId) : null;

      return {
        id: cm.id,
        meterId: cm.meterId,
        meterNumber: meter?.meterNumber || 'Unknown',
        address: meter?.address || '',
        isPrimary: cm.isPrimary,
        nickname: cm.nickname,
        feederName: feeder?.name,
        zoneName: z?.name
      };
    });

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    assignedZoneId: user.assignedZoneId,
    zone: zone ? { id: zone.id, name: zone.name, code: zone.code } : null,
    meters,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
};

// Endpoint 12: GET /api/users/me (and /api/v1/users/me)
usersRouter.get('/users/me', authenticateUser, (req: any, res) => {
  const profile = getUserProfile(req.user.sub);
  if (!profile) throw new NotFoundError('User not found', 'USER_NOT_FOUND');

  return successResponse(res, profile);
});

// Endpoint 13: PATCH /api/users/me (and /api/v1/users/me)
usersRouter.patch(
  '/users/me',
  authenticateUser,
  validateBody(updateProfileSchema),
  (req: any, res) => {
    const data = req.body;
    const user = store.users.get(req.user.sub);
    if (!user || user.deletedAt) throw new NotFoundError('User not found', 'USER_NOT_FOUND');

    if (data.name) user.name = data.name;
    if (data.phone !== undefined) user.phone = data.phone;
    user.updatedAt = new Date().toISOString();

    const profile = getUserProfile(user.id);
    return successResponse(res, profile);
  }
);

// Endpoint 14: POST /api/users/me/password (and /api/v1/users/me/password)
usersRouter.post(
  '/users/me/password',
  authenticateUser,
  validateBody(changePasswordSchema),
  (req: any, res) => {
    const { currentPassword, newPassword } = req.body;
    const user = store.users.get(req.user.sub);
    if (!user || user.deletedAt) throw new NotFoundError('User not found', 'USER_NOT_FOUND');

    const match = bcrypt.compareSync(currentPassword, user.passwordHash);
    if (!match) {
      throw new BadRequestError('Incorrect current password', 'INCORRECT_CURRENT_PASSWORD');
    }

    if (bcrypt.compareSync(newPassword, user.passwordHash)) {
      throw new BadRequestError(
        'New password cannot be identical to your current password',
        'PASSWORD_SAME_AS_CURRENT'
      );
    }

    const salt = bcrypt.genSaltSync(10);
    user.passwordHash = bcrypt.hashSync(newPassword, salt);
    user.updatedAt = new Date().toISOString();

    return successResponse(res, { message: 'Password changed successfully' });
  }
);

// Endpoint 15: GET /api/users/me/notifications (and /api/v1/users/me/notifications)
usersRouter.get(
  '/users/me/notifications',
  authenticateUser,
  validateQuery(notificationQuerySchema),
  (req: any, res) => {
    const page = (req.query.page as number) || 1;
    const pageSize = (req.query.pageSize as number) || 20;
    const unreadOnly = req.query.unreadOnly as boolean | undefined;

    const userNotifs = Array.from(store.notifications.values()).filter((n) => n.userId === req.user.sub);
    const unreadCount = userNotifs.filter((n) => !n.isRead).length;

    let list = userNotifs;
    if (unreadOnly) {
      list = list.filter((n) => !n.isRead);
    }

    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = list.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    const paginated = list.slice((page - 1) * pageSize, page * pageSize);

    return successResponse(res, {
      items: paginated,
      notifications: paginated, // Backwards-compatible key for frontend
      unreadCount,
      meta: {
        page,
        pageSize,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      // Backwards-compatible root pagination fields
      total,
      page,
      pageSize,
      totalPages
    });
  }
);

// Endpoint 16: PATCH /api/v1/users/me/notifications/:id/read (and POST alias)
const handleMarkNotificationRead = (req: any, res: any) => {
  const notif = store.notifications.get(req.params.id);
  if (!notif || notif.userId !== req.user.sub) {
    throw new NotFoundError('Notification not found', 'NOTIFICATION_NOT_FOUND');
  }

  notif.isRead = true;
  notif.readAt = new Date().toISOString();

  return successResponse(res, { success: true, notification: notif });
};

usersRouter.patch('/users/me/notifications/:id/read', authenticateUser, handleMarkNotificationRead);
usersRouter.post('/users/me/notifications/:id/read', authenticateUser, handleMarkNotificationRead);

// Endpoint 17: POST /api/v1/users/me/notifications/read-all (and PATCH aliases)
const handleMarkAllNotificationsRead = (req: any, res: any) => {
  const now = new Date().toISOString();
  let updatedCount = 0;

  for (const notif of store.notifications.values()) {
    if (notif.userId === req.user.sub && !notif.isRead) {
      notif.isRead = true;
      notif.readAt = now;
      updatedCount++;
    }
  }

  return successResponse(res, { success: true, count: updatedCount });
};

// Canonical Endpoint 17 per docs/api.md
usersRouter.post('/users/me/notifications/read-all', authenticateUser, handleMarkAllNotificationsRead);
usersRouter.patch('/users/me/notifications/read-all', authenticateUser, handleMarkAllNotificationsRead);
// Backwards-compatible legacy route
usersRouter.patch('/notifications/read-all', authenticateUser, handleMarkAllNotificationsRead);
