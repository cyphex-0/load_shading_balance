import { SmsSendOptions, SmsSendResult } from '@load-shedding/shared';

export interface SmsProvider {
  send(options: SmsSendOptions): Promise<SmsSendResult>;
}
