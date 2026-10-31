import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import {
  SocketEvent,
  JwtPayload,
  UserRole,
  SocketServerStats,
  FeederStatusChangedSocketPayload,
  TicketCreatedSocketPayload,
  TicketAssignedSocketPayload,
  TicketStatusChangedSocketPayload,
  SchedulePublishedSocketPayload,
  NotificationNewSocketPayload
} from '@load-shedding/shared';
import { logger } from '../utils/logger';

let io: SocketIOServer | null = null;

export const initSocketServer = (httpServer: HttpServer): SocketIOServer => {
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

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true
    }
  });

  // Handshake authentication middleware
  io.use((socket: Socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '') ||
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
          socket.data.authenticated = true;
          logger.debug(`Socket authenticated for user ${decoded.email} [${decoded.role}]`);
        } catch (e: any) {
          logger.warn(`Socket token verification failed: ${e.message}, proceeding as unauthenticated`);
          socket.data.user = undefined;
          socket.data.authenticated = false;
        }
      } else {
        socket.data.user = undefined;
        socket.data.authenticated = false;
      }
      next();
    } catch (err: any) {
      socket.data.user = undefined;
      socket.data.authenticated = false;
      next();
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as JwtPayload | undefined;
    logger.info(
      `Socket client connected: ${socket.id} (User: ${
        user ? `${user.name || user.email} [${user.role}]` : 'Guest'
      })`
    );

    // 1. Auto-join user-specific private rooms if authenticated
    if (user?.sub) {
      socket.join(`user:${user.sub}`);
      socket.join(`customer:${user.sub}`);
    }

    // 2. Role-based auto-room binding
    if (user) {
      if (user.role === UserRole.POWER_OPERATOR || user.role === UserRole.ADMIN) {
        socket.join('operators');
      }
      if (user.role === UserRole.TECHNICIAN || user.role === UserRole.ADMIN) {
        socket.join('technicians');
        if (user.sub) {
          socket.join(`tech:${user.sub}`);
        }
      }
      const userZoneId = user.zoneId || (user as any).assignedZoneId;
      if (user.role === UserRole.ZONE_MANAGER && userZoneId) {
        socket.join(`zone:${userZoneId}`);
      }
    }

    // 3. Client subscription listeners with security guards

    // Subscribe / Unsubscribe: Zone
    socket.on(
      'subscribe:zone',
      (payload: { zoneId: string }, ack?: (res: { success: boolean; room?: string; error?: string }) => void) => {
        if (payload?.zoneId) {
          socket.join(`zone:${payload.zoneId}`);
          logger.debug(`Socket ${socket.id} joined zone:${payload.zoneId}`);
          if (typeof ack === 'function') {
            ack({ success: true, room: `zone:${payload.zoneId}` });
          }
        } else if (typeof ack === 'function') {
          ack({ success: false, error: 'INVALID_ZONE_ID' });
        }
      }
    );

    socket.on(
      'unsubscribe:zone',
      (payload: { zoneId: string }, ack?: (res: { success: boolean }) => void) => {
        if (payload?.zoneId) {
          socket.leave(`zone:${payload.zoneId}`);
          logger.debug(`Socket ${socket.id} left zone:${payload.zoneId}`);
        }
        if (typeof ack === 'function') {
          ack({ success: true });
        }
      }
    );

    // Subscribe / Unsubscribe: Feeder
    socket.on(
      'subscribe:feeder',
      (payload: { feederId: string }, ack?: (res: { success: boolean; room?: string; error?: string }) => void) => {
        if (payload?.feederId) {
          socket.join(`feeder:${payload.feederId}`);
          logger.debug(`Socket ${socket.id} joined feeder:${payload.feederId}`);
          if (typeof ack === 'function') {
            ack({ success: true, room: `feeder:${payload.feederId}` });
          }
        } else if (typeof ack === 'function') {
          ack({ success: false, error: 'INVALID_FEEDER_ID' });
        }
      }
    );

    socket.on(
      'unsubscribe:feeder',
      (payload: { feederId: string }, ack?: (res: { success: boolean }) => void) => {
        if (payload?.feederId) {
          socket.leave(`feeder:${payload.feederId}`);
          logger.debug(`Socket ${socket.id} left feeder:${payload.feederId}`);
        }
        if (typeof ack === 'function') {
          ack({ success: true });
        }
      }
    );

    // Subscribe / Unsubscribe: Ticket
    socket.on(
      'subscribe:ticket',
      (payload: { ticketId: string }, ack?: (res: { success: boolean; room?: string; error?: string }) => void) => {
        if (payload?.ticketId) {
          socket.join(`ticket:${payload.ticketId}`);
          logger.debug(`Socket ${socket.id} joined ticket:${payload.ticketId}`);
          if (typeof ack === 'function') {
            ack({ success: true, room: `ticket:${payload.ticketId}` });
          }
        } else if (typeof ack === 'function') {
          ack({ success: false, error: 'INVALID_TICKET_ID' });
        }
      }
    );

    socket.on(
      'unsubscribe:ticket',
      (payload: { ticketId: string }, ack?: (res: { success: boolean }) => void) => {
        if (payload?.ticketId) {
          socket.leave(`ticket:${payload.ticketId}`);
          logger.debug(`Socket ${socket.id} left ticket:${payload.ticketId}`);
        }
        if (typeof ack === 'function') {
          ack({ success: true });
        }
      }
    );

    // Subscribe: Operator (Strict RBAC: POWER_OPERATOR or ADMIN)
    socket.on(
      'subscribe:operator',
      (ack?: (res: { success: boolean; room?: string; error?: string }) => void) => {
        if (user && (user.role === UserRole.POWER_OPERATOR || user.role === UserRole.ADMIN)) {
          socket.join('operators');
          logger.debug(`Socket ${socket.id} [${user.role}] joined operators room`);
          if (typeof ack === 'function') {
            ack({ success: true, room: 'operators' });
          }
        } else {
          logger.warn(
            `Unauthorized subscription attempt to 'operators' by socket ${socket.id} (User: ${
              user ? user.role : 'Guest'
            })`
          );
          if (typeof ack === 'function') {
            ack({ success: false, error: 'FORBIDDEN_OPERATOR_ACCESS' });
          } else {
            socket.emit('error:forbidden', {
              message: 'Access denied: operators room requires POWER_OPERATOR or ADMIN role'
            });
          }
        }
      }
    );

    // Subscribe: Technician (Strict RBAC: TECHNICIAN or ADMIN)
    socket.on(
      'subscribe:technician',
      (ack?: (res: { success: boolean; room?: string; error?: string }) => void) => {
        if (user && (user.role === UserRole.TECHNICIAN || user.role === UserRole.ADMIN)) {
          socket.join('technicians');
          if (user.sub) {
            socket.join(`tech:${user.sub}`);
          }
          logger.debug(`Socket ${socket.id} [${user.role}] joined technicians room`);
          if (typeof ack === 'function') {
            ack({ success: true, room: 'technicians' });
          }
        } else {
          logger.warn(
            `Unauthorized subscription attempt to 'technicians' by socket ${socket.id} (User: ${
              user ? user.role : 'Guest'
            })`
          );
          if (typeof ack === 'function') {
            ack({ success: false, error: 'FORBIDDEN_TECHNICIAN_ACCESS' });
          } else {
            socket.emit('error:forbidden', {
              message: 'Access denied: technicians room requires TECHNICIAN or ADMIN role'
            });
          }
        }
      }
    );

    // Heartbeat / Ping support
    socket.on(
      'ping',
      (ack?: (res: { pong: boolean; timestamp: string }) => void) => {
        const payload = { pong: true, timestamp: new Date().toISOString() };
        if (typeof ack === 'function') {
          ack(payload);
        } else {
          socket.emit('pong', payload);
        }
      }
    );

    socket.on('disconnect', () => {
      logger.info(`Socket client disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const getSocketServer = (): SocketIOServer | null => {
  return io;
};

export const closeSocketServer = async (): Promise<void> => {
  if (io) {
    await new Promise<void>((resolve) => {
      io!.close(() => {
        io = null;
        resolve();
      });
    });
  }
};

export const getSocketServerStats = (): SocketServerStats => {
  if (!io) {
    return {
      totalConnections: 0,
      authenticatedConnections: 0,
      guestConnections: 0,
      activeRoomsCount: 0,
      rooms: []
    };
  }

  const sockets = Array.from(io.sockets.sockets.values());
  const totalConnections = sockets.length;
  const authenticatedConnections = sockets.filter((s) => Boolean(s.data?.user)).length;
  const guestConnections = totalConnections - authenticatedConnections;

  const roomMap = io.sockets.adapter.rooms;
  const socketIds = new Set(sockets.map((s) => s.id));
  const namedRooms = Array.from(roomMap.keys()).filter((roomName) => !socketIds.has(roomName));

  return {
    totalConnections,
    authenticatedConnections,
    guestConnections,
    activeRoomsCount: namedRooms.length,
    rooms: namedRooms
  };
};

export const socketEmitter = {
  emitFeederStatusChanged: (data: FeederStatusChangedSocketPayload) => {
    if (!io) return;
    io.emit(SocketEvent.FEEDER_STATUS_CHANGED, data);
    io.to('operators').emit(SocketEvent.FEEDER_STATUS_CHANGED, data);
    io.to(`feeder:${data.feederId}`).emit(SocketEvent.FEEDER_STATUS_CHANGED, data);
    if (data.zoneId) {
      io.to(`zone:${data.zoneId}`).emit(SocketEvent.FEEDER_STATUS_CHANGED, data);
    }
  },

  emitTicketCreated: (data: TicketCreatedSocketPayload) => {
    if (!io) return;
    io.to('operators').emit(SocketEvent.TICKET_CREATED, data);
    io.to(`feeder:${data.feederId}`).emit(SocketEvent.TICKET_CREATED, data);
    if (data.zoneId) {
      io.to(`zone:${data.zoneId}`).emit(SocketEvent.TICKET_CREATED, data);
    }
  },

  emitTicketAssigned: (data: TicketAssignedSocketPayload) => {
    if (!io) return;
    io.to(`tech:${data.technicianId}`).emit(SocketEvent.TICKET_ASSIGNED, data);
    io.to('technicians').emit(SocketEvent.TICKET_ASSIGNED, data);
    io.to(`ticket:${data.ticketId}`).emit(SocketEvent.TICKET_ASSIGNED, data);
  },

  emitTicketStatusChanged: (data: TicketStatusChangedSocketPayload) => {
    if (!io) return;
    io.to(`customer:${data.customerId}`).emit(SocketEvent.TICKET_STATUS_CHANGED, data);
    io.to(`user:${data.customerId}`).emit(SocketEvent.TICKET_STATUS_CHANGED, data);
    io.to('operators').emit(SocketEvent.TICKET_STATUS_CHANGED, data);
    io.to(`ticket:${data.ticketId}`).emit(SocketEvent.TICKET_STATUS_CHANGED, data);
    if (data.zoneId) {
      io.to(`zone:${data.zoneId}`).emit(SocketEvent.TICKET_STATUS_CHANGED, data);
    }
  },

  emitSchedulePublished: (data: SchedulePublishedSocketPayload) => {
    if (!io) return;
    io.emit(SocketEvent.SCHEDULE_PUBLISHED, data);
    io.to('operators').emit(SocketEvent.SCHEDULE_PUBLISHED, data);
  },

  emitNotificationNew: (data: NotificationNewSocketPayload) => {
    if (!io) return;
    io.to(`user:${data.userId}`).emit(SocketEvent.NOTIFICATION_NEW, data);
    io.to(`customer:${data.userId}`).emit(SocketEvent.NOTIFICATION_NEW, data);
  }
};
