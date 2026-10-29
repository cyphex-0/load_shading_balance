import { Request, Response, NextFunction } from 'express';
import { ZodTypeAny } from 'zod';

/**
 * Express middleware to validate and coerce request body data against a Zod schema.
 */
export const validateBody = (schema: ZodTypeAny) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      next(err);
    }
  };
};

/**
 * Express middleware to validate and coerce query string parameters against a Zod schema.
 */
export const validateQuery = (schema: ZodTypeAny) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.query = schema.parse(req.query) as any;
      next();
    } catch (err) {
      next(err);
    }
  };
};

/**
 * Express middleware to validate URL route parameters against a Zod schema.
 */
export const validateParams = (schema: ZodTypeAny) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.params = schema.parse(req.params) as any;
      next();
    } catch (err) {
      next(err);
    }
  };
};
