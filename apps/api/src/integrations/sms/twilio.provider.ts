import crypto from 'crypto';
import { SmsSendOptions, SmsSendResult } from '@load-shedding/shared';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { SmsProvider } from './sms-provider.interface';

export class TwilioSmsProvider implements SmsProvider {
  private accountSid: string;
  private authToken: string;
  private phoneNumber: string;

  constructor(accountSid?: string, authToken?: string, phoneNumber?: string) {
    this.accountSid = accountSid || config.twilio.accountSid || '';
    this.authToken = authToken || config.twilio.authToken || '';
    this.phoneNumber = phoneNumber || config.twilio.phoneNumber || '';
  }

  isConfigured(): boolean {
    return Boolean(this.accountSid && this.authToken && this.phoneNumber);
  }

  async send(options: SmsSendOptions): Promise<SmsSendResult> {
    const { to, body } = options;
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'Twilio provider is not fully configured (missing SID, token, or sender number)',
        isPermanentError: true
      };
    }

    // Validate basic phone format
    if (!to || !to.startsWith('+')) {
      return {
        success: false,
        error: `Invalid phone format "${to}". Numbers must be in E.164 format starting with "+".`,
        isPermanentError: true
      };
    }

    try {
      // Dynamic import to isolate Twilio SDK dependency
      // @ts-ignore
      const twilio = await import('twilio');
      const client = twilio.default(this.accountSid, this.authToken);
      const result = await client.messages.create({
        body,
        from: this.phoneNumber,
        to
      });
      logger.info(`[TWILIO SMS] Sent to ${to}: messageSid=${result.sid}`);
      return {
        success: true,
        messageId: result.sid
      };
    } catch (err: any) {
      logger.error(`[TWILIO SMS ERROR] Delivery failed to ${to}:`, err?.message);
      // Twilio error codes for invalid numbers / permanent failures
      const permanentErrorCodes = [21211, 21408, 21610, 21614, 21617];
      const isPermanent = permanentErrorCodes.includes(err?.code);
      return {
        success: false,
        error: err?.message || 'Twilio dispatch failure',
        isPermanentError: isPermanent
      };
    }
  }

  /**
   * Validates incoming Twilio Webhook X-Twilio-Signature header
   * using HMAC-SHA1 according to Twilio's specification.
   */
  static validateSignature(
    signature: string | undefined,
    url: string,
    params: Record<string, string>,
    authToken: string
  ): boolean {
    if (!signature || !authToken) return false;

    // 1. Sort the parameter keys alphabetically
    const sortedKeys = Object.keys(params).sort();

    // 2. Append key and value to URL without delimiter
    let data = url;
    for (const key of sortedKeys) {
      data += key + params[key];
    }

    // 3. Compute HMAC-SHA1 hash using the auth token as key
    const expectedSignature = crypto
      .createHmac('sha1', authToken)
      .update(Buffer.from(data, 'utf-8'))
      .digest('base64');

    // 4. Timing-safe comparison to prevent timing attacks
    try {
      const sigBuf = Buffer.from(signature, 'base64');
      const expBuf = Buffer.from(expectedSignature, 'base64');
      if (sigBuf.length !== expBuf.length) return false;
      return crypto.timingSafeEqual(sigBuf, expBuf);
    } catch {
      return false;
    }
  }
}
