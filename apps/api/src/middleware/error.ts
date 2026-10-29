import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, errorResponse } from '../utils/response';
import { logger } from '../utils/logger';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error(`[API ERROR] ${req.method} ${req.originalUrl}:`, err);

  // 1. AppError (and subclasses: BadRequestError, ValidationError, NotFoundError, etc.)
  if (err instanceof AppError) {
    return errorResponse(res, err.message, err.statusCode, err.code, err.details);
  }

  // 2. Zod validation error
  if (err instanceof ZodError) {
    const details = err.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message
    }));
    return errorResponse(res, 'Validation failed for request data', 400, 'VALIDATION_ERROR', details);
  }

  // 3. Body-parser malformed JSON syntax error
  if (err instanceof SyntaxError && (err as any).status === 400 && 'body' in err) {
    return errorResponse(res, 'Malformed JSON payload provided in request body', 400, 'INVALID_JSON');
  }

  // 4. JWT authentication errors
  if (err.name === 'JsonWebTokenError') {
    return errorResponse(res, 'Invalid authentication token', 401, 'INVALID_TOKEN');
  }
  if (err.name === 'TokenExpiredError') {
    return errorResponse(res, 'Authentication token has expired', 401, 'TOKEN_EXPIRED');
  }

  // 5. Multer file upload errors
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return errorResponse(res, 'File size exceeds 10MB limit', 400, 'FILE_TOO_LARGE');
    }
    return errorResponse(res, err.message, 400, 'UPLOAD_ERROR');
  }

  // 6. Default unhandled error
  const message = process.env.NODE_ENV === 'production' ? 'An unexpected server error occurred' : err.message;
  return errorResponse(res, message, 500, 'INTERNAL_SERVER_ERROR');
};
