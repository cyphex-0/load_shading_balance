import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from workspace root or apps/api
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().default(4000),
  PORT: z.coerce.number().optional(),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  OPERATIONAL_TIME_ZONE: z.string().default('Asia/Dhaka'),
  AUTH_SECRET: z.string().default('super-secret-jwt-key-minimum-32-characters-long'),
  DATABASE_URL: z.string().optional().default(''),
  REDIS_URL: z.string().optional().default(''),
  TWILIO_ACCOUNT_SID: z.string().optional().default(''),
  TWILIO_AUTH_TOKEN: z.string().optional().default(''),
  TWILIO_PHONE_NUMBER: z.string().optional().default(''),
  UPLOAD_DIR: z.string().optional().default(path.resolve(__dirname, '../../uploads')),
  MAX_FILE_SIZE: z.coerce.number().default(10 * 1024 * 1024), // 10MB
  ENABLE_DEMO_SIMULATION: z.coerce.boolean().default(false)
});

export type EnvConfig = z.infer<typeof envSchema>;

export const parseEnv = (): EnvConfig => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ [CONFIG ERROR] Environment configuration validation failed:');
    console.error(JSON.stringify(result.error.format(), null, 2));
    throw new Error('Invalid environment configuration');
  }
  return result.data;
};
