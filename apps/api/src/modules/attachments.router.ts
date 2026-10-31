import { Router, Request, Response, NextFunction } from 'express';
import express from 'express';
import {
  initiateAttachmentUploadSchema,
  completeAttachmentUploadSchema,
  UserRole
} from '@load-shedding/shared';
import { authenticateUser, requireRoles } from '../middleware/auth';
import { successResponse, errorResponse, ForbiddenError, NotFoundError } from '../utils/response';
import { attachmentService } from '../services/attachment.service';
import { getStorageProvider } from '../integrations/storage/storage.provider';

export const attachmentsRouter = Router();
const storageProvider = getStorageProvider();

const techAuth = [authenticateUser, requireRoles(UserRole.TECHNICIAN, UserRole.ADMIN)];

// 1. POST /api/v1/technicians/me/assignments/:assignmentId/attachments
attachmentsRouter.post(
  '/technicians/me/assignments/:assignmentId/attachments',
  techAuth,
  async (req: any, res: Response, next: NextFunction) => {
    try {
      const data = initiateAttachmentUploadSchema.parse(req.body);
      const result = await attachmentService.initiateUpload(
        req.params.assignmentId,
        req.user.sub,
        data
      );
      return successResponse(res, result, 201);
    } catch (err) {
      next(err);
    }
  }
);

// 2. POST /api/v1/technicians/me/attachments/:attachmentId/complete
attachmentsRouter.post(
  '/technicians/me/attachments/:attachmentId/complete',
  techAuth,
  async (req: any, res: Response, next: NextFunction) => {
    try {
      const data = completeAttachmentUploadSchema.parse(req.body);
      const result = await attachmentService.completeUpload(
        req.params.attachmentId,
        req.user.sub,
        data.checksum
      );
      return successResponse(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// 3. GET /api/v1/outages/:outageId/attachments
attachmentsRouter.get(
  ['/outages/:outageId/attachments', '/v1/outages/:outageId/attachments'],
  authenticateUser,
  async (req: any, res: Response, next: NextFunction) => {
    try {
      const attachments = await attachmentService.getAttachmentsForOutage(
        req.params.outageId,
        req.user
      );
      return successResponse(res, attachments);
    } catch (err) {
      next(err);
    }
  }
);

// 4. Simulated Binary Storage Endpoints (Local dev & test automation)
// PUT /api/v1/storage/upload - Upload raw image binary to simulated signed URL
attachmentsRouter.put(
  ['/storage/upload', '/v1/storage/upload'],
  express.raw({ type: '*/*', limit: '10mb' }),
  async (req: Request, res: Response) => {
    const key = req.query.key as string;
    const token = req.query.token as string;
    const expires = Number(req.query.expires);

    if (!key || !token || !expires) {
      return errorResponse(res, 'Missing signature parameters', 400, 'INVALID_REQUEST');
    }

    const isValid = storageProvider.validateToken(key, token, expires);
    if (!isValid) {
      return errorResponse(res, 'Invalid or expired upload signature', 403, 'INVALID_SIGNATURE');
    }

    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
    const contentType = (req.headers['content-type'] as string) || 'image/jpeg';

    await storageProvider.putObject(key, buffer, contentType);
    return res.status(200).json({ success: true, message: 'Object stored successfully' });
  }
);

// GET /api/v1/storage/download - Download image binary from simulated signed URL
attachmentsRouter.get(
  ['/storage/download', '/v1/storage/download'],
  async (req: Request, res: Response) => {
    const key = req.query.key as string;
    const token = req.query.token as string;
    const expires = Number(req.query.expires);

    if (!key || !token || !expires) {
      return errorResponse(res, 'Missing signature parameters', 400, 'INVALID_REQUEST');
    }

    const isValid = storageProvider.validateToken(key, token, expires);
    if (!isValid) {
      return errorResponse(res, 'Invalid or expired download signature', 403, 'INVALID_SIGNATURE');
    }

    const item = await storageProvider.getObject(key);
    if (!item) {
      return errorResponse(res, 'Object not found in storage', 404, 'NOT_FOUND');
    }

    res.setHeader('Content-Type', item.contentType);
    res.setHeader('Content-Length', item.data.length);
    return res.status(200).send(item.data);
  }
);
