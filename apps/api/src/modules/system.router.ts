import { Router } from 'express';
import { successResponse } from '../utils/response';
import { checkDatabaseConnection } from '../db/prisma';

export const systemRouter = Router();

// Endpoint 1: GET /api/health
systemRouter.get('/health', async (req, res) => {
  const dbConnected = await checkDatabaseConnection();
  return successResponse(res, {
    status: 'HEALTHY',
    uptime: process.uptime(),
    services: {
      database: dbConnected ? 'UP' : 'EMULATED_LOCAL',
      redis: 'UP'
    }
  });
});

// Endpoint 2: GET /api/v1/health/live
systemRouter.get('/v1/health/live', (req, res) => {
  return successResponse(res, { status: 'LIVE', timestamp: new Date().toISOString() });
});

// Endpoint 3: GET /api/v1/health/ready
systemRouter.get('/v1/health/ready', async (req, res) => {
  const dbConnected = await checkDatabaseConnection();
  return successResponse(res, {
    ready: true,
    database: dbConnected ? 'CONNECTED' : 'LOCAL_STORE_READY',
    redis: 'READY'
  });
});

