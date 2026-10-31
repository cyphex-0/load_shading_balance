import { io, Socket } from 'socket.io-client';
import { getApiBaseUrl } from './api';

let socket: Socket | null = null;

export const getSocketTargetUrl = (): string => {
  return getApiBaseUrl();
};

export const getSocket = (): Socket => {
  if (!socket && typeof window !== 'undefined') {
    const targetUrl = getApiBaseUrl();
    const token = localStorage.getItem('auth_token');

    socket = io(targetUrl, {
      auth: { token },
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
      transports: ['websocket', 'polling']
    });
  }
  return socket as Socket;
};

/**
 * Updates the socket authentication credentials dynamically (e.g. on login/logout)
 * and triggers a reconnection so the backend places the client in authenticated role rooms.
 */
export const updateSocketAuth = (token?: string | null) => {
  if (typeof window === 'undefined') return;

  const currentToken = token !== undefined ? token : localStorage.getItem('auth_token');

  if (socket) {
    socket.auth = { token: currentToken };
    if (socket.connected) {
      socket.disconnect().connect();
    } else {
      socket.connect();
    }
  } else {
    getSocket();
  }
};

/**
 * Force reconnects the active Socket.IO connection.
 */
export const reconnectSocket = () => {
  if (socket) {
    socket.disconnect().connect();
  } else {
    getSocket();
  }
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
