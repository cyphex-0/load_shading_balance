import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { UserRole, JwtPayload } from '@load-shedding/shared';
import { AppError } from '../utils/response';
import { store } from '../db/store';

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export const authenticateUser = (req: Request, res: Response, next: NextFunction) => {
  try {
    let token: string | undefined;

    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.cookies && req.cookies.auth_token) {
      token = req.cookies.auth_token;
    }

    if (!token) {
      return next(new AppError('Authentication required. No session token provided.', 401, 'UNAUTHORIZED'));
    }

    const decoded = jwt.verify(token, config.authSecret) as JwtPayload;

    // Check if user account is suspended or deleted in store
    const user = store.users.get(decoded.sub);
    if (!user || user.deletedAt) {
      return next(new AppError('User account not found', 401, 'USER_NOT_FOUND'));
    }

    if (user.status === 'SUSPENDED') {
      return next(
        new AppError('Your account has been suspended by an administrator', 403, 'ACCOUNT_SUSPENDED')
      );
    }

    req.user = decoded;
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Session token has expired. Please log in again.', 401, 'TOKEN_EXPIRED'));
    }
    return next(new AppError('Invalid authentication token', 401, 'INVALID_TOKEN'));
  }
};

export const requireRoles = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new AppError(
          `Forbidden: Role ${req.user.role} does not have permission for this resource. Required: ${roles.join(', ')}`,
          403,
          'FORBIDDEN'
        )
      );
    }

    next();
  };
};

export const requireZoneAccess = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
  }

  // Admins have universal zone access
  if (req.user.role === UserRole.ADMIN) {
    return next();
  }

  // Zone managers are restricted to their assigned zone
  if (req.user.role === UserRole.ZONE_MANAGER) {
    const targetZoneId = req.params.zoneId || req.query.zoneId || req.body.zoneId;
    if (targetZoneId && req.user.zoneId && targetZoneId !== req.user.zoneId) {
      return next(
        new AppError('Forbidden: You can only access resources within your assigned zone', 403, 'ZONE_ACCESS_DENIED')
      );
    }
  }

  next();
};
