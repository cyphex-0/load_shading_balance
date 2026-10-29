import { Response } from 'express';
import { ApiResponse, ApiError, PaginatedData, PaginationMeta } from '@load-shedding/shared';

export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details?: any[];

  constructor(message: string, statusCode = 400, code = 'BAD_REQUEST', details?: any[]) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

// Domain-specific error taxonomy
export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details?: any[]) {
    super(message, 400, 'BAD_REQUEST', details);
    Object.setPrototypeOf(this, BadRequestError.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed for request data', details?: any[]) {
    super(message, 400, 'VALIDATION_ERROR', details);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required to access this resource', code = 'UNAUTHORIZED') {
    super(message, 401, code);
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden: You do not have permission to perform this action', code = 'FORBIDDEN') {
    super(message, 403, code);
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Requested resource not found', code = 'NOT_FOUND') {
    super(message, 404, code);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', code = 'CONFLICT') {
    super(message, 409, code);
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

/**
 * Sends a standardized success envelope.
 */
export const successResponse = <T>(res: Response, data: T, statusCode = 200): Response => {
  const req = (res as any).req;
  const envelope: ApiResponse<T> = {
    success: true,
    data,
    error: null,
    timestamp: new Date().toISOString(),
    requestId: req?.id
  };
  return res.status(statusCode).json(envelope);
};

/**
 * Sends a standardized paginated collection response envelope.
 */
export const paginatedResponse = <T>(
  res: Response,
  items: T[],
  total: number,
  page: number,
  pageSize: number,
  statusCode = 200
): Response => {
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  const totalPages = Math.ceil(total / safePageSize) || 1;

  const meta: PaginationMeta = {
    page: safePage,
    pageSize: safePageSize,
    total,
    totalPages,
    hasNextPage: safePage < totalPages,
    hasPrevPage: safePage > 1
  };

  const paginatedData: PaginatedData<T> = {
    items,
    meta
  };

  return successResponse<PaginatedData<T>>(res, paginatedData, statusCode);
};

/**
 * Sends a standardized error envelope.
 */
export const errorResponse = (
  res: Response,
  message: string,
  statusCode = 400,
  code = 'ERROR',
  details?: any[]
): Response => {
  const req = (res as any).req;
  const errorObj: ApiError = {
    code,
    message,
    ...(details && details.length > 0 ? { details } : {})
  };

  const envelope: ApiResponse = {
    success: false,
    data: null,
    error: errorObj,
    timestamp: new Date().toISOString(),
    requestId: req?.id
  };
  return res.status(statusCode).json(envelope);
};
