import { Router } from 'express';
import bcrypt from 'bcryptjs';
import {
  updateProfileSchema,
  changePasswordSchema,
  notificationQuerySchema
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

// Endpoint 12: GET /api/users/me
usersRouter.get('/users/me', authenticateUser, (req: any, res) => {
  const user = store.users.get(req.user.sub);
  if (!user) throw new NotFoundError('User not found', 'USER_NOT_FOUND');

  const zone = user.assignedZoneId ? store.zones.get(user.assignedZoneId) : null;

  return successResponse(res, {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    assignedZoneId: user.assignedZoneId,
    zone: zone ? { id: zone.id, name: zone.name, code: zone.code } : null,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  });
});

// Endpoint 13: PATCH /api/users/me
usersRouter.patch(
  '/users/me',
  authenticateUser,
  validateBody(updateProfileSchema),
  (req: any, res) => {
    const data = req.body;
    const user = store.users.get(req.user.sub);
    if (!user) throw new NotFoundError('User not found', 'USER_NOT_FOUND');

    if (data.name) user.name = data.name;
    if (data.phone !== undefined) user.phone = data.phone;
    user.updatedAt = new Date().toISOString();

    return successResponse(res, {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role
    });
  }
);

// Endpoint 14: POST /api/users/me/password
usersRouter.post(
  '/users/me/password',
  authenticateUser,
  validateBody(changePasswordSchema),
  (req: any, res) => {
    const { currentPassword, newPassword } = req.body;
    const user = store.users.get(req.user.sub);
    if (!user) throw new NotFoundError('User not found', 'USER_NOT_FOUND');

    const match = bcrypt.compareSync(currentPassword, user.passwordHash);
    if (!match) {
      throw new BadRequestError('Incorrect current password');
    }

    const salt = bcrypt.genSaltSync(10);
    user.passwordHash = bcrypt.hashSync(newPassword, salt);
    user.updatedAt = new Date().toISOString();

    return successResponse(res, { message: 'Password changed successfully' });
  }
);

// Endpoint 15: GET /api/users/me/notifications
usersRouter.get(
  '/users/me/notifications',
  authenticateUser,
  validateQuery(notificationQuerySchema),
  (req: any, res) => {
    const page = (req.query.page as number) || 1;
    const pageSize = (req.query.pageSize as number) || 20;
    const unreadOnly = req.query.unreadOnly as boolean | undefined;

    let list = Array.from(store.notifications.values()).filter((n) => n.userId === req.user.sub);

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

// Endpoint 16: POST /api/users/me/notifications/:id/read
usersRouter.post('/users/me/notifications/:id/read', authenticateUser, (req: any, res) => {
  const notif = store.notifications.get(req.params.id);
  if (!notif || notif.userId !== req.user.sub) {
    throw new NotFoundError('Notification not found', 'NOTIFICATION_NOT_FOUND');
  }

  notif.isRead = true;
  notif.readAt = new Date().toISOString();

  return successResponse(res, { success: true, notification: notif });
});

// Endpoint 17: PATCH /api/notifications/read-all
usersRouter.patch('/notifications/read-all', authenticateUser, (req: any, res) => {
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
});
