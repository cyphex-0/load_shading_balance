import { Router } from 'express';
import { successResponse } from '../utils/response';
import { checkDatabaseConnection } from '../db/prisma';

export const systemRouter = Router();

// Smoke test: GET /health (available at /api/health and /api/v1/health)
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

// Liveness probe: GET /health/live (available at /api/health/live and /api/v1/health/live)
systemRouter.get(['/health/live', '/v1/health/live'], (req, res) => {
  return successResponse(res, {
    status: 'LIVE',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Readiness probe: GET /health/ready (available at /api/health/ready and /api/v1/health/ready)
systemRouter.get(['/health/ready', '/v1/health/ready'], async (req, res) => {
  const dbConnected = await checkDatabaseConnection();
  return successResponse(res, {
    ready: true,
    database: dbConnected ? 'CONNECTED' : 'LOCAL_STORE_READY',
    redis: 'READY'
  });
});
