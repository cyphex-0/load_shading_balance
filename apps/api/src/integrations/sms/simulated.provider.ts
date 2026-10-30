import { SmsSendOptions, SmsSendResult } from '@load-shedding/shared';
import { logger } from '../../utils/logger';
import { SmsProvider } from './sms-provider.interface';

export class SimulatedSmsProvider implements SmsProvider {
  private forceFailure = false;
  private permanentFailure = false;
  private sentMessages: Array<{ to: string; body: string; messageId: string; timestamp: string }> = [];

  setFailNext(permanent: boolean = false): void {
    this.forceFailure = true;
    this.permanentFailure = permanent;
  }

  clearFail(): void {
    this.forceFailure = false;
    this.permanentFailure = false;
  }

  getSentMessages() {
    return this.sentMessages;
  }

  clearSentMessages() {
    this.sentMessages = [];
  }

  async send(options: SmsSendOptions): Promise<SmsSendResult> {
    const { to, body } = options;

    // Validate basic phone format
    if (!to || !to.startsWith('+')) {
      return {
        success: false,
        error: `Invalid phone format "${to}". Numbers must be in E.164 format starting with "+".`,
        isPermanentError: true
      };
    }

    if (this.forceFailure) {
      this.forceFailure = false;
      const isPerm = this.permanentFailure;
      this.permanentFailure = false;
      logger.warn(`[SIMULATED SMS FAILURE] To: ${to} | Permanent: ${isPerm}`);
      return {
        success: false,
        error: isPerm ? 'Simulated non-retryable invalid destination' : 'Simulated temporary carrier network timeout',
        isPermanentError: isPerm
      };
    }

    const messageId = `sim_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    logger.info(`[SIMULATED SMS] To: ${to} | Message: "${body}"`);

    this.sentMessages.push({
      to,
      body,
      messageId,
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      messageId
    };
  }
}
