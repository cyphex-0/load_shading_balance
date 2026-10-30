import http from 'http';
import { createApp } from './app';
import { initSocketServer } from './sockets/socket.server';
import { startBackgroundJobs, stopBackgroundJobs } from './jobs/cron';
import { config } from './config';
import { logger } from './utils/logger';
import { disconnectDatabase } from './db/prisma';

const app = createApp();
const server = http.createServer(app);

// Initialize Socket.io
initSocketServer(server);

// Start Background Cron Jobs
startBackgroundJobs();

server.listen(config.port, '0.0.0.0', () => {
  logger.info(`⚡ Load Shedding & Power Outage API server listening on http://0.0.0.0:${config.port}`);
  logger.info(`📡 Socket.io server running at ws://0.0.0.0:${config.port}/socket.io`);
  logger.info(`🌍 Environment: ${config.nodeEnv} | Timezone: ${config.operationalTimeZone}`);
});

// Graceful Shutdown Hooks
const gracefulShutdown = async (signal: string) => {
  logger.info(`🛑 Received ${signal}. Starting graceful shutdown...`);

  // Stop background jobs
  try {
    stopBackgroundJobs();
    logger.info('⏹️ Background cron jobs stopped.');
  } catch (err) {
    logger.error('Error stopping background jobs:', err);
  }

  // Close HTTP and Socket connections
  server.close(async () => {
    logger.info('🔒 HTTP server closed.');

    // Disconnect database
    try {
      await disconnectDatabase();
      logger.info('🔌 Database connection closed.');
    } catch (err) {
      logger.error('Error disconnecting database:', err);
    }

    process.exit(0);
  });

  // Force close after 10s if hanging
  setTimeout(() => {
    logger.error('⚠️ Forcing process shutdown after timeout.');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export { app, server };
