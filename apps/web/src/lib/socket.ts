import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket && typeof window !== 'undefined') {
    const API_BASE_URL = (
      process.env.NEXT_PUBLIC_API_URL || 'https://load-shading-balance.onrender.com'
    ).replace(/\/$/, '');
    const token = localStorage.getItem('auth_token');

    socket = io(API_BASE_URL, {
      auth: { token },
      autoConnect: true,
      reconnection: true
    });
  }
  return socket as Socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

