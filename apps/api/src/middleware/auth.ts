import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { UserRole, JwtPayload } from '@load-shedding/shared';
import { AppError, UnauthorizedError, ForbiddenError } from '../utils/response';
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
      return next(new UnauthorizedError('Authentication required. No session token provided.', 'UNAUTHORIZED'));
    }

    const decoded = jwt.verify(token, config.authSecret) as JwtPayload;

    // Check if user account is suspended or deleted in store
    const user = store.users.get(decoded.sub);
    if (!user || user.deletedAt) {
      return next(new UnauthorizedError('User account not found', 'USER_NOT_FOUND'));
    }

    if (user.status === 'SUSPENDED') {
      return next(
        new ForbiddenError('Your account has been suspended by an administrator', 'ACCOUNT_SUSPENDED')
      );
    }

    req.user = decoded;
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('Session token has expired. Please log in again.', 'TOKEN_EXPIRED'));
    }
    return next(new UnauthorizedError('Invalid authentication token', 'INVALID_TOKEN'));
  }
};

export const requireRoles = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required', 'UNAUTHORIZED'));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new ForbiddenError(
          `Forbidden: Role ${req.user.role} does not have permission for this resource. Required: ${roles.join(', ')}`,
          'FORBIDDEN'
        )
      );
    }

    next();
  };
};

/**
 * Convenient singular alias for requireRoles
 */
export const requireRole = requireRoles;

/**
 * Express middleware to verify that the authenticated user has access to the target zone.
 * Admins and Power Operators have universal/global access.
 * Zone Managers and Technicians are restricted to their assigned zone.
 */
export const verifyZoneScope = (
  resolveZoneId?: (req: Request) => string | undefined | null
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required', 'UNAUTHORIZED'));
    }

    // Admins and Operators have global grid scope
    if (req.user.role === UserRole.ADMIN || req.user.role === UserRole.POWER_OPERATOR) {
      return next();
    }

    // Determine target zone ID from resolver callback or standard request properties
    const targetZoneId =
      (resolveZoneId ? resolveZoneId(req) : undefined) ||
      req.params.zoneId ||
      (req.query.zoneId as string) ||
      req.body?.zoneId;

    if (targetZoneId && req.user.zoneId && targetZoneId !== req.user.zoneId) {
      return next(
        new ForbiddenError(
          'Forbidden: You can only access resources within your assigned zone',
          'ZONE_ACCESS_DENIED'
        )
      );
    }

    next();
  };
};

/**
 * Default zone access guard checking req.params.zoneId, req.query.zoneId, or req.body.zoneId
 */
export const requireZoneAccess = verifyZoneScope();

