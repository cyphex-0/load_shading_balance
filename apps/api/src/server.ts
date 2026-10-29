import http from 'http';
import { createApp } from './app';
import { initSocketServer } from './sockets/socket.server';
import { startBackgroundJobs } from './jobs/cron';
import { config } from './config';
import { logger } from './utils/logger';

const app = createApp();
const server = http.createServer(app);

// Initialize Socket.io
initSocketServer(server);

// Start Background Cron Jobs
startBackgroundJobs();

server.listen(config.port, () => {
  logger.info(`⚡ Load Shedding & Power Outage API server listening on http://localhost:${config.port}`);
  logger.info(`📡 Socket.io server running at ws://localhost:${config.port}/socket.io`);
  logger.info(`🌍 Environment: ${config.nodeEnv}`);
});

export { app, server };

