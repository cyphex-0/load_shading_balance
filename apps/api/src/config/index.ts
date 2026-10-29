import path from 'path';
import { parseEnv } from './env';

const env = parseEnv();

export const config = {
  port: env.PORT || env.API_PORT,
  nodeEnv: env.NODE_ENV,
  authSecret: env.AUTH_SECRET,
  frontendUrl: env.FRONTEND_URL,
  databaseUrl: env.DATABASE_URL,
  redisUrl: env.REDIS_URL,
  operationalTimeZone: env.OPERATIONAL_TIME_ZONE,
  enableDemoSimulation: env.ENABLE_DEMO_SIMULATION,
  twilio: {
    accountSid: env.TWILIO_ACCOUNT_SID,
    authToken: env.TWILIO_AUTH_TOKEN,
    phoneNumber: env.TWILIO_PHONE_NUMBER
  },
  upload: {
    directory: env.UPLOAD_DIR || path.resolve(__dirname, '../../uploads'),
    maxFileSize: env.MAX_FILE_SIZE
  }
};

export { parseEnv } from './env';
