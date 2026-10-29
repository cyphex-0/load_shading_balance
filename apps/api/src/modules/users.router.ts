import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { updateProfileSchema, changePasswordSchema } from '@load-shedding/shared';
import { store } from '../db/store';
import { authenticateUser } from '../middleware/auth';
import { successResponse, AppError } from '../utils/response';

export const usersRouter = Router();

// Endpoint 12: GET /api/users/me
usersRouter.get('/users/me', authenticateUser, (req: any, res) => {
  const user = store.users.get(req.user.sub);
  if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND');

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
usersRouter.patch('/users/me', authenticateUser, (req: any, res, next) => {
  try {
    const data = updateProfileSchema.parse(req.body);
    const user = store.users.get(req.user.sub);
    if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND');

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
  } catch (err) {
    next(err);
  }
});

// Endpoint 14: POST /api/users/me/password
usersRouter.post('/users/me/password', authenticateUser, (req: any, res, next) => {
  try {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const user = store.users.get(req.user.sub);
    if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND');

    const match = bcrypt.compareSync(currentPassword, user.passwordHash);
    if (!match) {
      throw new AppError('Incorrect current password', 400, 'INVALID_PASSWORD');
    }

    const salt = bcrypt.genSaltSync(10);
    user.passwordHash = bcrypt.hashSync(newPassword, salt);
    user.updatedAt = new Date().toISOString();

    return successResponse(res, { message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
});

// Endpoint 15: GET /api/users/me/notifications
usersRouter.get('/users/me/notifications', authenticateUser, (req: any, res) => {
  const page = parseInt(req.query.page as string, 10) || 1;
  const pageSize = parseInt(req.query.pageSize as string, 10) || 20;
  const unreadOnly = req.query.unreadOnly === 'true';

  let list = Array.from(store.notifications.values()).filter((n) => n.userId === req.user.sub);

  if (unreadOnly) {
    list = list.filter((n) => !n.isRead);
  }

  list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = list.length;
  const paginated = list.slice((page - 1) * pageSize, page * pageSize);

  return successResponse(res, {
    notifications: paginated,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize)
  });
});

// Endpoint 16: POST /api/users/me/notifications/:id/read
usersRouter.post('/users/me/notifications/:id/read', authenticateUser, (req: any, res) => {
  const notif = store.notifications.get(req.params.id);
  if (!notif || notif.userId !== req.user.sub) {
    throw new AppError('Notification not found', 404, 'NOTIFICATION_NOT_FOUND');
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
