import { getSmsProvider } from '../integrations/sms';
import { SmsSendOptions, SmsSendResult } from '@load-shedding/shared';

export interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
  isPermanentError?: boolean;
}

export class SmsService {
  async sendSms(to: string, message: string, idempotencyKey?: string): Promise<SmsResult> {
    const provider = getSmsProvider();
    const result: SmsSendResult = await provider.send({
      to,
      body: message,
      idempotencyKey
    });
    return result;
  }
}

export const smsService = new SmsService();
