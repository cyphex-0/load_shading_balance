import {
  UpgradeRequestStatus,
  DeliveryStatus,
  NotificationType,
  AuditLogDto,
  AdminNotificationLogDto,
  NotificationDeliveryTelemetryDto
} from '@load-shedding/shared';
import { store, AuditLogRecord } from '../db/store';
import { notificationService } from './notification.service';
import { NotFoundError, AppError } from '../utils/response';

export class AdminService {
  /**
   * Forensic Security Audit Logger.
   * Records immutable audit entries across staff actions and governance decisions.
   */
  recordAuditLog(
    actorId: string | null,
    action: string,
    entity: string,
    entityId?: string | null,
    details?: any,
    ipAddress?: string | null
  ): AuditLogRecord {
    const auditId = `aud_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const record: AuditLogRecord = {
      id: auditId,
      actorId: actorId || null,
      action,
      entity,
      entityId: entityId || null,
      details: details || null,
      ipAddress: ipAddress || null,
      createdAt: new Date().toISOString()
    };
    store.auditLogs.set(auditId, record);
    return record;
  }

  /**
   * Endpoint 80: Paginated security audit log explorer with multi-factor filtering.
   */
  getAuditLogs(query: {
    actorId?: string;
    userId?: string;
    action?: string;
    entity?: string;
    ipAddress?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }): { items: AuditLogDto[]; total: number; page: number; pageSize: number } {
    let logs = Array.from(store.auditLogs.values());

    const targetActorId = query.actorId || query.userId;
    if (targetActorId) {
      logs = logs.filter((l) => l.actorId === targetActorId);
    }

    if (query.action) {
      const q = query.action.toLowerCase();
      logs = logs.filter((l) => l.action.toLowerCase().includes(q));
    }

    if (query.entity) {
      const q = query.entity.toLowerCase();
      logs = logs.filter((l) => l.entity.toLowerCase().includes(q));
    }

    if (query.ipAddress) {
      logs = logs.filter((l) => l.ipAddress === query.ipAddress);
    }

    if (query.from) {
      const fromMs = new Date(query.from).getTime();
      logs = logs.filter((l) => new Date(l.createdAt).getTime() >= fromMs);
    }

    if (query.to) {
      const toMs = new Date(query.to).getTime();
      logs = logs.filter((l) => new Date(l.createdAt).getTime() <= toMs);
    }

    logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const enriched: AuditLogDto[] = logs.map((l) => {
      const user = l.actorId ? store.users.get(l.actorId) : null;
      return {
        id: l.id,
        actorId: l.actorId,
        actorName: user?.name || null,
        actorEmail: user?.email || null,
        action: l.action,
        entity: l.entity,
        entityId: l.entityId || null,
        details: l.details || null,
        ipAddress: l.ipAddress || null,
        createdAt: l.createdAt
      };
    });

    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const paginated = enriched.slice((page - 1) * pageSize, page * pageSize);

    return {
      items: paginated,
      total: enriched.length,
      page,
      pageSize
    };
  }

  /**
   * Notification Delivery Telemetry & Monitoring.
   * Provides SMS & in-app delivery history with status breakdown and success rate.
   */
  getNotificationDeliveryLogs(query: {
    status?: DeliveryStatus;
    channel?: string;
    recipientPhone?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }): NotificationDeliveryTelemetryDto & { total: number; page: number; pageSize: number } {
    let logs = Array.from(store.notificationDeliveryLogs.values());

    if (query.status) {
      logs = logs.filter((l) => l.status === query.status);
    }

    if (query.channel) {
      const q = query.channel.toLowerCase();
      logs = logs.filter((l) => l.channel.toLowerCase() === q);
    }

    if (query.recipientPhone) {
      logs = logs.filter((l) => l.recipientPhone.includes(query.recipientPhone!));
    }

    if (query.from) {
      const fromMs = new Date(query.from).getTime();
      logs = logs.filter((l) => new Date(l.createdAt).getTime() >= fromMs);
    }

    if (query.to) {
      const toMs = new Date(query.to).getTime();
      logs = logs.filter((l) => new Date(l.createdAt).getTime() <= toMs);
    }

    logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Aggregate summary metrics
    const totalLogged = logs.length;
    const deliveredCount = logs.filter((l) => l.status === DeliveryStatus.DELIVERED).length;
    const sentCount = logs.filter((l) => l.status === DeliveryStatus.SENT).length;
    const failedCount = logs.filter(
      (l) => l.status === DeliveryStatus.FAILED
    ).length;
    const queuedCount = logs.filter(
      (l) => l.status === DeliveryStatus.QUEUED || l.status === DeliveryStatus.SENDING
    ).length;

    const attemptedCount = deliveredCount + failedCount;
    const deliverySuccessRate =
      attemptedCount > 0 ? Math.round((deliveredCount / attemptedCount) * 100 * 10) / 10 : 100;

    const enrichedItems: AdminNotificationLogDto[] = logs.map((l) => {
      let recipientName: string | null = null;
      if (l.notificationId) {
        const notif = store.notifications.get(l.notificationId);
        if (notif) {
          const user = store.users.get(notif.userId);
          recipientName = user?.name || null;
        }
      }

      return {
        id: l.id,
        notificationId: l.notificationId || null,
        recipientPhone: l.recipientPhone,
        recipientName,
        channel: l.channel,
        status: l.status,
        providerResponse: l.providerResponse || null,
        providerMessageId: l.providerMessageId || null,
        attempts: l.attempts,
        error: l.error || null,
        sentAt: l.sentAt || null,
        deliveredAt: l.deliveredAt || null,
        createdAt: l.createdAt
      };
    });

    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const paginated = enrichedItems.slice((page - 1) * pageSize, page * pageSize);

    return {
      totalLogged,
      deliveredCount,
      sentCount,
      failedCount,
      queuedCount,
      deliverySuccessRate,
      items: paginated,
      total: enrichedItems.length,
      page,
      pageSize
    };
  }

  /**
   * Endpoint 81: Evaluates and decides on an Infrastructure Upgrade Request.
   * Strictly enforces terminal state immutability, records forensic audit log,
   * and dispatches decision notification to the submitting Zone Manager.
   */
  async reviewInfrastructureRequest(
    id: string,
    status: UpgradeRequestStatus.APPROVED | UpgradeRequestStatus.REJECTED,
    adminNotes: string | undefined,
    reviewerId: string,
    ipAddress?: string
  ) {
    const request = store.infrastructureRequests.get(id);
    if (!request) {
      throw new NotFoundError('Infrastructure request not found', 'REQUEST_NOT_FOUND');
    }

    // Terminal State Immutability Guard
    if (
      request.status === UpgradeRequestStatus.APPROVED ||
      request.status === UpgradeRequestStatus.REJECTED
    ) {
      throw new AppError(
        `Cannot change decision on already evaluated infrastructure request (current state: ${request.status})`,
        409,
        'INVALID_STATE_TRANSITION'
      );
    }

    const now = new Date().toISOString();
    request.status = status;
    request.adminNotes = adminNotes || null;
    request.reviewedById = reviewerId;
    request.reviewedAt = now;
    request.updatedAt = now;

    // Forensic Audit Trail
    this.recordAuditLog(
      reviewerId,
      'REVIEW_INFRASTRUCTURE_REQUEST',
      'InfrastructureRequest',
      request.id,
      {
        status,
        adminNotes,
        feederId: request.feederId,
        requesterId: request.requesterId
      },
      ipAddress
    );

    // Notify Submitting Zone Manager
    const feeder = store.feeders.get(request.feederId);
    const decisionTitle =
      status === UpgradeRequestStatus.APPROVED
        ? 'Infrastructure Upgrade Request Approved'
        : 'Infrastructure Upgrade Request Rejected';
    const decisionMsg =
      `Your infrastructure upgrade request for feeder "${feeder?.name || request.feederId}" has been ${status.toLowerCase()}. ` +
      (adminNotes ? `Admin notes: ${adminNotes}` : '');

    await notificationService.createNotification(
      request.requesterId,
      decisionTitle,
      decisionMsg,
      NotificationType.UPGRADE_REQUEST_STATUS,
      {
        requestId: request.id,
        feederId: request.feederId,
        status,
        adminNotes
      },
      `upgrade-decision:${request.id}:${status}`
    );

    const requester = store.users.get(request.requesterId);
    return {
      ...request,
      requester: requester ? { name: requester.name, email: requester.email } : undefined,
      feeder: feeder
        ? {
            id: feeder.id,
            name: feeder.name,
            code: feeder.code,
            substationId: feeder.substationId,
            capacityMW: feeder.capacityMW,
            isCritical: feeder.isCritical,
            status: feeder.status,
            createdAt: feeder.createdAt,
            updatedAt: feeder.updatedAt
          }
        : undefined
    };
  }
}

export const adminService = new AdminService();
