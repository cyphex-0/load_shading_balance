import { config } from '../../config';
import { SmsProvider } from './sms-provider.interface';
import { TwilioSmsProvider } from './twilio.provider';
import { SimulatedSmsProvider } from './simulated.provider';

export * from './sms-provider.interface';
export * from './twilio.provider';
export * from './simulated.provider';

let customProvider: SmsProvider | null = null;
const simulatedProvider = new SimulatedSmsProvider();
const twilioProvider = new TwilioSmsProvider();

export const getSmsProvider = (): SmsProvider => {
  if (customProvider) return customProvider;
  if (config.nodeEnv === 'production' && twilioProvider.isConfigured()) {
    return twilioProvider;
  }
  return simulatedProvider;
};

export const getSimulatedProvider = (): SimulatedSmsProvider => {
  return simulatedProvider;
};

export const setSmsProviderForTesting = (provider: SmsProvider | null): void => {
  customProvider = provider;
};
