import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { config } from './config';
import { errorHandler } from './middleware/error';
import { systemRouter } from './modules/system.router';
import { authRouter } from './modules/auth.router';
import { usersRouter } from './modules/users.router';
import { gridRouter } from './modules/grid.router';
import { customerRouter } from './modules/customer.router';
import { operatorRouter } from './modules/operator.router';
import { technicianRouter } from './modules/technician.router';
import { managerRouter } from './modules/manager.router';
import { adminRouter } from './modules/admin.router';
import { errorResponse } from './utils/response';

export const createApp = () => {
  const app = express();

  // Core Middlewares
  app.use(
    cors({
      origin: [config.frontendUrl, 'http://localhost:3000', 'http://127.0.0.1:3000'],
      credentials: true
    })
  );
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Serve static uploaded photos
  app.use('/uploads', express.static(config.upload.directory));

  // Mount API Routers (Canonical /api/v1 with /api backward compatibility)
  const apiRouters = [
    systemRouter,
    authRouter,
    usersRouter,
    gridRouter,
    customerRouter,
    operatorRouter,
    technicianRouter,
    managerRouter,
    adminRouter
  ];

  for (const router of apiRouters) {
    app.use('/api/v1', router);
    app.use('/api', router);
  }

  // 404 Handler
  app.use((req, res) => {
    return errorResponse(res, `Route ${req.method} ${req.originalUrl} not found`, 404, 'NOT_FOUND');
  });

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
};
