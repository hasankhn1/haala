import http from 'node:http';
import { createApp } from './app';
import { initRealtime } from './realtime/gateway';

/** Build the HTTP server with the Express app and socket.io attached. */
export const createServer = (): http.Server => {
  const app = createApp();
  const httpServer = http.createServer(app);
  initRealtime(httpServer);
  return httpServer;
};
