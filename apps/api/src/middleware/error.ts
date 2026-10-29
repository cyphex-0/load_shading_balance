import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, errorResponse } from '../utils/response';
import { logger } from '../utils/logger';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error(`[API ERROR] ${req.method} ${req.originalUrl}:`, err);

  // 1. AppError (our custom domain error)
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

  // 3. Multer file upload errors
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return errorResponse(res, 'File size exceeds 10MB limit', 400, 'FILE_TOO_LARGE');
    }
    return errorResponse(res, err.message, 400, 'UPLOAD_ERROR');
  }

  // 4. Default unhandled error
  const message = process.env.NODE_ENV === 'production' ? 'An unexpected server error occurred' : err.message;
  return errorResponse(res, message, 500, 'INTERNAL_SERVER_ERROR');
};
