import {
  UserRole,
  OutageStatus,
  InitiateUploadResponseDto,
  OutageAttachmentDto,
  JwtPayload
} from '@load-shedding/shared';
import { store, OutageAttachmentRecord } from '../db/store';
import {
  AppError,
  NotFoundError,
  ForbiddenError,
  BadRequestError
} from '../utils/response';
import { getStorageProvider } from '../integrations/storage/storage.provider';
import path from 'path';

export class AttachmentService {
  private storageProvider = getStorageProvider();

  /**
   * Initiates an authorized signed upload for a repair-photo attachment.
   */
  async initiateUpload(
    assignmentId: string,
    technicianId: string,
    input: {
      fileName: string;
      fileType: string;
      fileSize: number;
      checksum?: string;
    }
  ): Promise<InitiateUploadResponseDto> {
    // 1. Verify assignment exists and belongs to technician
    const assignment = store.technicianAssignments.get(assignmentId);
    if (!assignment || assignment.technicianId !== technicianId) {
      throw new ForbiddenError(
        'Assignment not found or does not belong to you',
        'NOT_ASSIGNED_TECHNICIAN'
      );
    }

    // 2. Verify ticket state
    const ticket = store.outageTickets.get(assignment.ticketId);
    if (!ticket) {
      throw new NotFoundError('Associated outage ticket not found', 'TICKET_NOT_FOUND');
    }

    if (ticket.status === OutageStatus.RESOLVED || ticket.status === OutageStatus.CANCELLED) {
      throw new AppError(
        `Cannot upload repair evidence for terminal ticket with status ${ticket.status}`,
        409,
        'INVALID_STATE_TRANSITION'
      );
    }

    // 3. Validate file metadata
    const allowedMime = ['image/jpeg', 'image/png'];
    if (!allowedMime.includes(input.fileType)) {
      throw new BadRequestError(
        'Invalid file type. Only image/jpeg and image/png are allowed',
        'INVALID_FILE_TYPE'
      );
    }

    const maxSizeBytes = 5 * 1024 * 1024; // 5 MB
    if (input.fileSize > maxSizeBytes) {
      throw new BadRequestError(
        'File size exceeds the 5MB maximum limit',
        'FILE_TOO_LARGE'
      );
    }

    const nowISO = new Date().toISOString();
    const attachmentId = `att_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const ext = input.fileType === 'image/png' ? 'png' : 'jpg';
    const storageKey = `repair-photos/${ticket.id}/${attachmentId}.${ext}`;

    // 4. Generate signed upload URL (5 minutes expiry)
    const expiresInSeconds = 300;
    const uploadResult = await this.storageProvider.generateUploadUrl(
      storageKey,
      input.fileType,
      expiresInSeconds
    );

    // 5. Persist unverified attachment record
    const attachmentRecord: OutageAttachmentRecord = {
      id: attachmentId,
      ticketId: ticket.id,
      uploaderId: technicianId,
      storageKey,
      fileUrl: uploadResult.uploadUrl,
      fileName: input.fileName,
      fileType: input.fileType,
      fileSize: input.fileSize,
      checksum: input.checksum || null,
      isVerified: false,
      verifiedAt: null,
      createdAt: nowISO
    };
    store.outageAttachments.set(attachmentId, attachmentRecord);

    return {
      attachmentId,
      storageKey,
      uploadUrl: uploadResult.uploadUrl,
      expiresInSeconds,
      headers: uploadResult.headers
    };
  }

  /**
   * Verifies that the uploaded object reached storage and marks attachment verified.
   */
  async completeUpload(
    attachmentId: string,
    technicianId: string,
    checksum?: string
  ): Promise<{ success: boolean; attachmentId: string; isVerified: boolean; verifiedAt: string }> {
    const attachment = store.outageAttachments.get(attachmentId);
    if (!attachment) {
      throw new NotFoundError('Attachment not found', 'ATTACHMENT_NOT_FOUND');
    }

    // Only the uploading technician (or admin) may complete the upload
    if (attachment.uploaderId !== technicianId) {
      throw new ForbiddenError(
        'Only the uploading technician can complete this attachment',
        'FORBIDDEN'
      );
    }

    // Verify object directly in storage
    const meta = await this.storageProvider.verifyObject(attachment.storageKey);
    if (!meta.exists) {
      throw new BadRequestError(
        'Uploaded file was not found in storage. Ensure file was uploaded to the signed URL.',
        'UPLOAD_VERIFICATION_FAILED'
      );
    }

    if (meta.sizeBytes > 5 * 1024 * 1024) {
      throw new BadRequestError('Object in storage exceeds 5MB size limit', 'FILE_TOO_LARGE');
    }

    if (meta.contentType && meta.contentType !== attachment.fileType) {
      throw new BadRequestError(
        `Object content-type in storage (${meta.contentType}) does not match declared type (${attachment.fileType})`,
        'UPLOAD_VERIFICATION_FAILED'
      );
    }

    const nowISO = new Date().toISOString();
    attachment.isVerified = true;
    attachment.verifiedAt = nowISO;
    if (meta.checksum) {
      attachment.checksum = meta.checksum;
    }

    return {
      success: true,
      attachmentId: attachment.id,
      isVerified: true,
      verifiedAt: nowISO
    };
  }

  /**
   * Returns verified attachments for an outage ticket with short-lived signed download URLs.
   */
  async getAttachmentsForOutage(
    outageId: string,
    user: JwtPayload
  ): Promise<OutageAttachmentDto[]> {
    const ticket = store.outageTickets.get(outageId);
    if (!ticket) {
      throw new NotFoundError('Outage ticket not found', 'TICKET_NOT_FOUND');
    }

    // Role-based scoping
    if (user.role === UserRole.CUSTOMER) {
      throw new ForbiddenError('Repair photos are restricted to operational staff', 'FORBIDDEN');
    } else if (user.role === UserRole.TECHNICIAN) {
      const isAssigned = Array.from(store.technicianAssignments.values()).some(
        (a) => a.ticketId === ticket.id && a.technicianId === user.sub
      );
      if (!isAssigned) {
        throw new ForbiddenError('You are not assigned to this outage ticket', 'FORBIDDEN');
      }
    } else if (user.role === UserRole.ZONE_MANAGER && user.zoneId) {
      const feeder = store.feeders.get(ticket.feederId);
      const sub = feeder ? store.substations.get(feeder.substationId) : null;
      if (sub && sub.zoneId !== user.zoneId) {
        throw new ForbiddenError('Ticket is outside your managed zone', 'FORBIDDEN');
      }
    }

    const verifiedAttachments = Array.from(store.outageAttachments.values()).filter(
      (a) => a.ticketId === ticket.id && a.isVerified
    );

    const result: OutageAttachmentDto[] = [];
    for (const a of verifiedAttachments) {
      const downloadUrl = await this.storageProvider.generateDownloadUrl(a.storageKey, 900);
      const uploader = store.users.get(a.uploaderId);

      result.push({
        id: a.id,
        ticketId: a.ticketId,
        uploaderId: a.uploaderId,
        uploaderName: uploader?.name,
        fileName: a.fileName,
        fileType: a.fileType,
        fileSize: a.fileSize,
        downloadUrl,
        isVerified: a.isVerified,
        verifiedAt: a.verifiedAt,
        createdAt: a.createdAt
      });
    }

    return result;
  }

  /**
   * Legacy adapter for multipart direct photo upload.
   */
  async saveUploadedFile(
    ticketId: string,
    uploaderId: string,
    originalName: string,
    mimeType: string,
    size: number,
    buffer: Buffer
  ): Promise<OutageAttachmentRecord> {
    const nowISO = new Date().toISOString();
    const attachmentId = `att_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const ext = mimeType === 'image/png' ? 'png' : 'jpg';
    const storageKey = `repair-photos/${ticketId}/${attachmentId}.${ext}`;

    await this.storageProvider.putObject(storageKey, buffer, mimeType);

    const attachment: OutageAttachmentRecord = {
      id: attachmentId,
      ticketId,
      uploaderId,
      storageKey,
      fileUrl: `/uploads/${path.basename(storageKey)}`,
      fileName: originalName,
      fileType: mimeType,
      fileSize: size,
      isVerified: true,
      verifiedAt: nowISO,
      createdAt: nowISO
    };

    store.outageAttachments.set(attachmentId, attachment);
    return attachment;
  }
}

export const attachmentService = new AttachmentService();
