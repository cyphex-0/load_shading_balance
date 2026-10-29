import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailConfirmSchema,
  UserRole,
  UserStatus
} from '@load-shedding/shared';
import { store, UserRecord } from '../db/store';
import { config } from '../config';
import {
  successResponse,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  BadRequestError
} from '../utils/response';
import { authenticateUser } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { logger } from '../utils/logger';

export const authRouter = Router();

// Endpoint 4: POST /api/auth/register
authRouter.post('/auth/register', validateBody(registerSchema), async (req, res) => {
  const data = req.body;

  // Check duplicate email
  const existing = Array.from(store.users.values()).find((u) => u.email.toLowerCase() === data.email.toLowerCase());
  if (existing) {
    throw new ConflictError('An account with this email already exists', 'EMAIL_EXISTS');
  }

  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(data.password, salt);
  const now = new Date().toISOString();
  const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  const newUser: UserRecord = {
    id: userId,
    name: data.name,
    email: data.email.toLowerCase(),
    phone: data.phone || null,
    passwordHash,
    role: UserRole.CUSTOMER, // Always CUSTOMER for public self-registration (D-08)
    status: UserStatus.ACTIVE,
    assignedZoneId: null,
    emailVerified: null,
    createdAt: now,
    updatedAt: now
  };

  store.users.set(userId, newUser);

  // Link optional initial meter
  if (data.meterNumber) {
    const meter = Array.from(store.meters.values()).find(
      (m) => m.meterNumber.toLowerCase() === data.meterNumber?.toLowerCase() && !m.deletedAt
    );
    if (meter) {
      const linkId = `cm_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      store.customerMeters.set(linkId, {
        id: linkId,
        customerId: userId,
        meterId: meter.id,
        isPrimary: true,
        nickname: 'Primary Meter',
        linkedAt: now
      });
    }
  }

  return successResponse(
    res,
    {
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phone,
        role: newUser.role,
        status: newUser.status
      }
    },
    201
  );
});

// Endpoint 5: POST /api/auth/login
authRouter.post('/auth/login', validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body;

  const user = Array.from(store.users.values()).find(
    (u) => u.email.toLowerCase() === email.toLowerCase() && !u.deletedAt
  );
  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (user.status === UserStatus.SUSPENDED) {
    throw new ForbiddenError('Account suspended. Contact administration.');
  }

  const passwordMatch = bcrypt.compareSync(password, user.passwordHash);
  if (!passwordMatch) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const tokenPayload = {
    sub: user.id,
    role: user.role,
    zoneId: user.assignedZoneId,
    name: user.name,
    email: user.email
  };

  const token = jwt.sign(tokenPayload, config.authSecret, { expiresIn: '7d' });

  // Set secure HTTP-only cookie (D-02)
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  return successResponse(res, {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      assignedZoneId: user.assignedZoneId,
      emailVerified: user.emailVerified
    }
  });
});

// Endpoint 6: POST /api/auth/logout
authRouter.post('/auth/logout', (req, res) => {
  res.clearCookie('auth_token');
  return successResponse(res, { message: 'Logged out successfully' });
});

// Endpoint 7: GET /api/auth/session (and /api/auth/me)
const handleGetSession = (req: any, res: any) => {
  const user = store.users.get(req.user.sub);
  if (!user || user.deletedAt) {
    throw new NotFoundError('User not found', 'USER_NOT_FOUND');
  }

  return successResponse(res, {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      assignedZoneId: user.assignedZoneId,
      emailVerified: user.emailVerified
    }
  });
};

authRouter.get('/auth/session', authenticateUser, handleGetSession);
authRouter.get('/auth/me', authenticateUser, handleGetSession);

// Canonical Endpoint: POST /api/v1/auth/refresh (and /api/auth/refresh)
authRouter.post('/auth/refresh', authenticateUser, (req: any, res) => {
  const user = store.users.get(req.user.sub);
  if (!user || user.deletedAt) {
    throw new NotFoundError('User account not found', 'USER_NOT_FOUND');
  }

  if (user.status === UserStatus.SUSPENDED) {
    throw new ForbiddenError('Your account has been suspended by an administrator');
  }

  const tokenPayload = {
    sub: user.id,
    role: user.role,
    zoneId: user.assignedZoneId,
    name: user.name,
    email: user.email
  };

  const token = jwt.sign(tokenPayload, config.authSecret, { expiresIn: '7d' });

  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  return successResponse(res, {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      assignedZoneId: user.assignedZoneId,
      emailVerified: user.emailVerified
    }
  });
});

// Endpoint 8: POST /api/auth/verify-email/request
authRouter.post('/auth/verify-email/request', authenticateUser, (req: any, res) => {
  const token = `verify_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  store.verificationTokens.set(token, {
    email: req.user.email,
    token,
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    usedAt: null
  });

  logger.info(`[EMAIL VERIFICATION] Token for ${req.user.email}: ${token}`);
  return successResponse(res, {
    message: 'Verification email sent successfully',
    devToken: config.nodeEnv !== 'production' ? token : undefined
  });
});

// Endpoint 9: POST /api/auth/verify-email/confirm
authRouter.post(
  '/auth/verify-email/confirm',
  validateBody(verifyEmailConfirmSchema),
  (req, res) => {
    const { token } = req.body;
    const record = store.verificationTokens.get(token);
    if (!record || record.usedAt !== null) {
      throw new BadRequestError('Invalid or already used verification token');
    }

    if (new Date() > new Date(record.expiresAt)) {
      throw new BadRequestError('Verification token has expired');
    }

    record.usedAt = new Date().toISOString();
    const user = Array.from(store.users.values()).find((u) => u.email === record.email);
    if (user) {
      user.emailVerified = new Date().toISOString();
      user.updatedAt = new Date().toISOString();
    }

    return successResponse(res, { message: 'Email verified successfully' });
  }
);

// Endpoint 10: POST /api/auth/password/forgot
authRouter.post(
  '/auth/password/forgot',
  validateBody(forgotPasswordSchema),
  (req, res) => {
    const { email } = req.body;
    const user = Array.from(store.users.values()).find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && !u.deletedAt
    );

    // Prevent email enumeration: always return 200 OK (D-03)
    if (!user) {
      return successResponse(res, { message: 'If this email is registered, a reset link has been sent.' });
    }

    const resetToken = `reset_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    store.passwordResetTokens.set(resetToken, {
      email: user.email,
      token: resetToken,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      usedAt: null
    });

    logger.info(`[PASSWORD RESET] Token for ${user.email}: ${resetToken}`);
    return successResponse(res, {
      message: 'If this email is registered, a reset link has been sent.',
      devToken: config.nodeEnv !== 'production' ? resetToken : undefined
    });
  }
);

// Endpoint 11: POST /api/auth/password/reset
authRouter.post(
  '/auth/password/reset',
  validateBody(resetPasswordSchema),
  (req, res) => {
    const { token, newPassword } = req.body;
    const record = store.passwordResetTokens.get(token);
    if (!record || record.usedAt) {
      throw new BadRequestError('Invalid or expired password reset token');
    }

    if (new Date() > new Date(record.expiresAt)) {
      throw new BadRequestError('Password reset token has expired');
    }

    const user = Array.from(store.users.values()).find((u) => u.email === record.email);
    if (!user) {
      throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    }

    const salt = bcrypt.genSaltSync(10);
    user.passwordHash = bcrypt.hashSync(newPassword, salt);
    user.updatedAt = new Date().toISOString();
    record.usedAt = new Date().toISOString();

    return successResponse(res, { message: 'Password reset successfully. You may now log in.' });
  }
);
