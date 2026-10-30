import { NotificationType, DeliveryStatus } from '@load-shedding/shared';
import { store, NotificationRecord, NotificationDeliveryLogRecord } from '../db/store';
import { smsService } from './sms.service';
import { logger } from '../utils/logger';

export class NotificationService {
  /**
   * Creates an in-app notification intent and queues SMS delivery if phone exists.
   * If an eventKey is provided, deduplicates against existing records for the user.
   */
  async createNotification(
    userId: string,
    title: string,
    message: string,
    type: NotificationType,
    metadata?: Record<string, any>,
    eventKey?: string | null
  ): Promise<NotificationRecord> {
    // 1. Logical event key deduplication
    if (eventKey) {
      const existing = Array.from(store.notifications.values()).find(
        (n) => n.userId === userId && n.eventKey === eventKey
      );
      if (existing) {
        logger.info(`[NOTIFICATION DEDUP] Notification with eventKey "${eventKey}" already exists for user ${userId}. Reusing intent.`);
        return existing;
      }
    }

    const id = `notif_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const notification: NotificationRecord = {
      id,
      userId,
      title,
      message,
      type,
      isRead: false,
      readAt: null,
      eventKey: eventKey || null,
      metadata: metadata || null,
      createdAt: new Date().toISOString()
    };
    store.notifications.set(id, notification);

    // 2. Queue SMS if recipient user has a phone number
    const user = store.users.get(userId);
    if (user?.phone) {
      await this.queueSms(id, user.phone, message, eventKey || id);
    }

    return notification;
  }

  /**
   * Persists an SMS delivery log intent in QUEUED status and triggers asynchronous dispatch.
   * Isolates caller from any external provider delivery failures.
   */
  async queueSms(
    notificationId: string | null,
    recipientPhone: string,
    message: string,
    idempotencyKey?: string
  ): Promise<NotificationDeliveryLogRecord> {
    const logId = `sms_log_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const nowISO = new Date().toISOString();
    const deliveryLog: NotificationDeliveryLogRecord = {
      id: logId,
      notificationId,
      recipientPhone,
      channel: 'SMS',
      status: DeliveryStatus.QUEUED,
      attempts: 0,
      nextAttemptAt: nowISO,
      idempotencyKey: idempotencyKey || null,
      createdAt: nowISO
    };
    store.notificationDeliveryLogs.set(logId, deliveryLog);

    // Process immediately in async flow without blocking caller or bubbling provider errors
    this.dispatchSmsLog(logId, message).catch((err) => {
      logger.error('Background SMS dispatch exception:', err);
    });

    return deliveryLog;
  }

  /**
   * Concurrency-safe, bounded retry SMS dispatcher with exponential backoff.
   */
  async dispatchSmsLog(logId: string, message: string): Promise<boolean> {
    const log = store.notificationDeliveryLogs.get(logId);
    if (!log) return false;

    // Concurrency claim: mark SENDING so concurrent background workers do not double-send
    log.status = DeliveryStatus.SENDING;

    const res = await smsService.sendSms(log.recipientPhone, message, log.idempotencyKey || log.id);

    if (res.success) {
      log.status = DeliveryStatus.SENT;
      log.providerResponse = res.messageId || 'SENT';
      log.providerMessageId = res.messageId || null;
      log.sentAt = new Date().toISOString();
      log.error = null;
      return true;
    } else {
      log.attempts += 1;
      log.error = res.error || 'FAILED';
      log.providerResponse = res.error || 'FAILED';

      // Non-retryable permanent error or reached max bounded attempts (3)
      if (log.attempts >= 3 || res.isPermanentError) {
        log.status = DeliveryStatus.FAILED;
        logger.warn(`[SMS DISPATCH FAILED] Log ${logId} permanently marked FAILED after ${log.attempts} attempts. Error: ${res.error}`);
      } else {
        // Schedule next attempt with exponential backoff: 2^attempts * 1000ms
        const backoffMs = Math.pow(2, log.attempts) * 1000;
        log.status = DeliveryStatus.QUEUED;
        log.nextAttemptAt = new Date(Date.now() + backoffMs).toISOString();
        logger.info(`[SMS DISPATCH RETRY] Log ${logId} scheduled for retry ${log.attempts + 1}/3 at ${log.nextAttemptAt}`);
      }
      return false;
    }
  }

  /**
   * Scans store for queued or retry-eligible SMS records and dispatches them.
   */
  async dispatchPendingNotifications(): Promise<{ processed: number; succeeded: number }> {
    const now = new Date();
    const pendingLogs = Array.from(store.notificationDeliveryLogs.values()).filter(
      (l) =>
        (l.status === DeliveryStatus.QUEUED || (l.status === DeliveryStatus.FAILED && l.attempts < 3)) &&
        (!l.nextAttemptAt || new Date(l.nextAttemptAt) <= now)
    );

    let succeeded = 0;
    for (const log of pendingLogs) {
      const notif = log.notificationId ? store.notifications.get(log.notificationId) : null;
      const msg = notif?.message || 'Load Shedding System Notification';
      const ok = await this.dispatchSmsLog(log.id, msg);
      if (ok) succeeded++;
    }

    return { processed: pendingLogs.length, succeeded };
  }

  async notifyZoneCustomers(
    zoneId: string,
    title: string,
    message: string,
    type: NotificationType,
    metadata?: Record<string, any>
  ): Promise<number> {
    // Find all meters in this zone
    const targetFeeders = new Set(
      Array.from(store.feeders.values())
        .filter((f) => {
          const sub = store.substations.get(f.substationId);
          return sub && sub.zoneId === zoneId && !f.deletedAt;
        })
        .map((f) => f.id)
    );

    const targetMeters = new Set(
      Array.from(store.meters.values())
        .filter((m) => targetFeeders.has(m.feederId) && !m.deletedAt)
        .map((m) => m.id)
    );

    const recipientUserIds = new Set(
      Array.from(store.customerMeters.values())
        .filter((cm) => targetMeters.has(cm.meterId) && !cm.unlinkedAt)
        .map((cm) => cm.customerId)
    );

    let count = 0;
    for (const userId of recipientUserIds) {
      await this.createNotification(userId, title, message, type, metadata);
      count++;
    }
    return count;
  }
}

export const notificationService = new NotificationService();
