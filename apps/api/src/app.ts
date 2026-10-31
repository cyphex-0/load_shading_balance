import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { config } from './config';
import { requestIdMiddleware } from './middleware/request-id';
import { securityHeadersMiddleware } from './middleware/security';
import { errorHandler } from './middleware/error';
import { logger } from './utils/logger';
import { systemRouter } from './modules/system.router';
import { authRouter } from './modules/auth.router';
import { usersRouter } from './modules/users.router';
import { gridRouter } from './modules/grid.router';
import { customerRouter } from './modules/customer.router';
import { operatorRouter } from './modules/operator.router';
import { technicianRouter } from './modules/technician.router';
import { managerRouter } from './modules/manager.router';
import { adminRouter } from './modules/admin.router';
import { integrationsRouter } from './modules/integrations.router';
import { outagesRouter } from './modules/outages.router';
import { attachmentsRouter } from './modules/attachments.router';
import { errorResponse } from './utils/response';

export const createApp = () => {
  const app = express();

  // 1. Request correlation ID & Security Headers
  app.use(requestIdMiddleware);
  app.use(securityHeadersMiddleware);

  // 2. HTTP Access Logger
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      const reqId = req.id ? `[${req.id.slice(0, 8)}]` : '';
      logger.info(`[HTTP] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms ${reqId}`);
    });
    next();
  });

  // 3. Core Middlewares
  const configuredOrigins = (config.frontendUrl || '')
    .split(',')
    .map((url) => url.trim().replace(/\/$/, ''))
    .filter(Boolean);
  const allowedOrigins = Array.from(
    new Set([
      ...configuredOrigins,
      'http://localhost:3000',
      'http://127.0.0.1:3000'
    ])
  );

  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true
    })
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // 4. Serve static uploaded photos
  app.use('/uploads', express.static(config.upload.directory));

  // 5. Mount API Routers (Canonical /api/v1 with /api backward compatibility)
  const apiRouters = [
    systemRouter,
    authRouter,
    usersRouter,
    gridRouter,
    customerRouter,
    operatorRouter,
    technicianRouter,
    managerRouter,
    adminRouter,
    integrationsRouter,
    outagesRouter,
    attachmentsRouter
  ];

  for (const router of apiRouters) {
    app.use('/api/v1', router);
    app.use('/api', router);
  }

  // 6. 404 Handler
  app.use((req, res) => {
    return errorResponse(res, `Route ${req.method} ${req.originalUrl} not found`, 404, 'NOT_FOUND');
  });

  // 7. Centralized Error Handler
  app.use(errorHandler);

  return app;
};
