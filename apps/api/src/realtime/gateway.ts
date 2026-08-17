import type { Server as HttpServer } from 'node:http';
import { Server as IOServer, type Socket } from 'socket.io';
import { verifyAccessToken } from '../common/jwt';
import { logger } from '../common/logger';

let io: IOServer | null = null;

export const userRoom = (userId: string): string => `user:${userId}`;
export const orderRoom = (orderId: string): string => `order:${orderId}`;

/**
 * Attach socket.io to the HTTP server. Every socket must present a valid access
 * token in the handshake; the socket then auto-joins its user room. Clients
 * subscribe to a specific order to receive live status + rider location.
 */
export const initRealtime = (httpServer: HttpServer): IOServer => {
  io = new IOServer(httpServer, {
    cors: { origin: '*' },
    transports: ['websocket', 'polling'],
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('unauthorized'));
    try {
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      socket.data.role = payload.role;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string;
    socket.join(userRoom(userId));
    logger.debug({ userId, role: socket.data.role }, 'socket connected');

    socket.on('order:subscribe', (orderId: string) => socket.join(orderRoom(orderId)));
    socket.on('order:unsubscribe', (orderId: string) => socket.leave(orderRoom(orderId)));
    socket.on('disconnect', () => logger.debug({ userId }, 'socket disconnected'));
  });

  logger.info('Realtime gateway initialised');
  return io;
};

export const getIO = (): IOServer => {
  if (!io) throw new Error('Realtime gateway not initialised');
  return io;
};

/** Fire-and-forget emit to a user's room (no-op if realtime not yet up). */
export const emitToUser = (userId: string, event: string, payload: unknown): void => {
  io?.to(userRoom(userId)).emit(event, payload);
};

/** Fire-and-forget emit to everyone watching an order. */
export const emitToOrder = (orderId: string, event: string, payload: unknown): void => {
  io?.to(orderRoom(orderId)).emit(event, payload);
};
