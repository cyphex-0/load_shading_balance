import { config } from '../config';
import { logger } from '../utils/logger';

export interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export class SmsService {
  async sendSms(to: string, message: string): Promise<SmsResult> {
    if (config.twilio.accountSid && config.twilio.authToken && config.twilio.phoneNumber) {
      try {
        // Dynamic import to avoid crash if twilio SDK is optional
        // @ts-ignore
        const twilio = await import('twilio');
        const client = twilio.default(config.twilio.accountSid, config.twilio.authToken);
        const result = await client.messages.create({
          body: message,
          from: config.twilio.phoneNumber,
          to
        });
        logger.info(`SMS sent via Twilio to ${to}: ${result.sid}`);
        return { success: true, messageId: result.sid };
      } catch (err: any) {
        logger.error(`Twilio SMS delivery failed to ${to}:`, err?.message);
        return { success: false, error: err?.message };
      }
    }

    // Simulated development mode
    logger.info(`[SIMULATED SMS] To: ${to} | Message: "${message}"`);
    return {
      success: true,
      messageId: `sim_${Date.now()}_${Math.random().toString(36).substring(7)}`
    };
  }
}

export const smsService = new SmsService();
