import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { SocketEvent, JwtPayload, UserRole } from '@load-shedding/shared';
import { logger } from '../utils/logger';

let io: SocketIOServer | null = null;

export const initSocketServer = (httpServer: HttpServer): SocketIOServer => {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: [config.frontendUrl, 'http://localhost:3000', 'http://127.0.0.1:3000'],
      credentials: true
    }
  });

  io.use((socket: Socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '') ||
        (socket.handshake.headers.cookie
          ? socket.handshake.headers.cookie
              .split(';')
              .find((c) => c.trim().startsWith('auth_token='))
              ?.split('=')[1]
          : null);

      if (token) {
        try {
          const decoded = jwt.verify(token, config.authSecret) as JwtPayload;
          socket.data.user = decoded;
        } catch (e) {
          logger.warn('Socket token verification failed, proceeding as unauthenticated');
        }
      }
      next();
    } catch (err: any) {
      next();
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as JwtPayload | undefined;
    logger.info(`Socket client connected: ${socket.id} (User: ${user ? `${user.name} [${user.role}]` : 'Guest'})`);

    // Auto-join personal room if authenticated
    if (user?.sub) {
      socket.join(`customer:${user.sub}`);
    }

    // Role-based room subscriptions
    socket.on('subscribe:zone', (payload: { zoneId: string }) => {
      if (payload?.zoneId) {
        socket.join(`zone:${payload.zoneId}`);
        logger.debug(`Socket ${socket.id} joined zone:${payload.zoneId}`);
      }
    });

    socket.on('subscribe:operator', () => {
      if (!user || user.role === UserRole.POWER_OPERATOR || user.role === UserRole.ADMIN) {
        socket.join('operators');
        logger.debug(`Socket ${socket.id} joined operators room`);
      }
    });

    socket.on('subscribe:technician', () => {
      if (!user || user.role === UserRole.TECHNICIAN || user.role === UserRole.ADMIN) {
        socket.join('technicians');
        if (user?.sub) {
          socket.join(`tech:${user.sub}`);
        }
        logger.debug(`Socket ${socket.id} joined technicians room`);
      }
    });

    socket.on('disconnect', () => {
      logger.info(`Socket client disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const socketEmitter = {
  emitFeederStatusChanged: (data: { feederId: string; status: string; timestamp: string }) => {
    if (!io) return;
    io.emit(SocketEvent.FEEDER_STATUS_CHANGED, data);
    io.to('operators').emit(SocketEvent.FEEDER_STATUS_CHANGED, data);
  },

  emitTicketCreated: (data: {
    ticketId: string;
    ticketNumber: string;
    feederId: string;
    feederName: string;
    zoneId?: string;
    description: string;
    reportedAt: string;
  }) => {
    if (!io) return;
    io.to('operators').emit(SocketEvent.TICKET_CREATED, data);
    if (data.zoneId) {
      io.to(`zone:${data.zoneId}`).emit(SocketEvent.TICKET_CREATED, data);
    }
  },

  emitTicketAssigned: (data: {
    ticketId: string;
    technicianId: string;
    feederName: string;
    address: string;
    assignedAt: string;
  }) => {
    if (!io) return;
    io.to(`tech:${data.technicianId}`).emit(SocketEvent.TICKET_ASSIGNED, data);
    io.to('technicians').emit(SocketEvent.TICKET_ASSIGNED, data);
  },

  emitTicketStatusChanged: (data: {
    ticketId: string;
    customerId: string;
    zoneId?: string;
    status: string;
    updatedAt: string;
  }) => {
    if (!io) return;
    io.to(`customer:${data.customerId}`).emit(SocketEvent.TICKET_STATUS_CHANGED, data);
    io.to('operators').emit(SocketEvent.TICKET_STATUS_CHANGED, data);
    if (data.zoneId) {
      io.to(`zone:${data.zoneId}`).emit(SocketEvent.TICKET_STATUS_CHANGED, data);
    }
  },

  emitSchedulePublished: (data: {
    scheduleId: string;
    planningDate: string;
    affectedFeedersCount: number;
  }) => {
    if (!io) return;
    io.emit(SocketEvent.SCHEDULE_PUBLISHED, data);
  }
};

