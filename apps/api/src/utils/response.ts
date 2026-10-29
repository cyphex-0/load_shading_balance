import { Response } from 'express';
import { ApiResponse, ApiError } from '@load-shedding/shared';

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

export const successResponse = <T>(res: Response, data: T, statusCode = 200): Response => {
  const envelope: ApiResponse<T> = {
    success: true,
    data,
    error: null,
    timestamp: new Date().toISOString()
  };
  return res.status(statusCode).json(envelope);
};

export const errorResponse = (
  res: Response,
  message: string,
  statusCode = 400,
  code = 'ERROR',
  details?: any[]
): Response => {
  const errorObj: ApiError = {
    code,
    message,
    ...(details && details.length > 0 ? { details } : {})
  };

  const envelope: ApiResponse = {
    success: false,
    data: null,
    error: errorObj,
    timestamp: new Date().toISOString()
  };
  return res.status(statusCode).json(envelope);
};

