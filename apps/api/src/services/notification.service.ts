import { NotificationType, DeliveryStatus } from '@load-shedding/shared';
import { store, NotificationRecord, NotificationDeliveryLogRecord } from '../db/store';
import { smsService } from './sms.service';
import { logger } from '../utils/logger';

export class NotificationService {
  async createNotification(
    userId: string,
    title: string,
    message: string,
    type: NotificationType,
    metadata?: Record<string, any>
  ): Promise<NotificationRecord> {
    const id = `notif_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const notification: NotificationRecord = {
      id,
      userId,
      title,
      message,
      type,
      isRead: false,
      readAt: null,
      metadata: metadata || null,
      createdAt: new Date().toISOString()
    };
    store.notifications.set(id, notification);

    // If user has a phone number, queue SMS
    const user = store.users.get(userId);
    if (user?.phone) {
      await this.queueSms(id, user.phone, message);
    }

    return notification;
  }

  async queueSms(notificationId: string | null, recipientPhone: string, message: string): Promise<void> {
    const logId = `sms_log_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const deliveryLog: NotificationDeliveryLogRecord = {
      id: logId,
      notificationId,
      recipientPhone,
      channel: 'SMS',
      status: DeliveryStatus.QUEUED,
      attempts: 0,
      createdAt: new Date().toISOString()
    };
    store.notificationDeliveryLogs.set(logId, deliveryLog);

    // Process immediately in async flow
    this.dispatchSmsLog(logId, message).catch((err) => {
      logger.error('Background SMS dispatch error:', err);
    });
  }

  async dispatchSmsLog(logId: string, message: string): Promise<boolean> {
    const log = store.notificationDeliveryLogs.get(logId);
    if (!log) return false;

    log.attempts += 1;
    const res = await smsService.sendSms(log.recipientPhone, message);
    if (res.success) {
      log.status = DeliveryStatus.SENT;
      log.providerResponse = res.messageId || 'DELIVERED';
      log.sentAt = new Date().toISOString();
      return true;
    } else {
      if (log.attempts >= 3) {
        log.status = DeliveryStatus.FAILED;
      }
      log.providerResponse = res.error || 'FAILED';
      return false;
    }
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
