import { Server as SocketIOServer } from 'socket.io';
import Logger from './core/Logger';
import { port, corsOrigin } from './config';
import app from './app';
// import { setupWebSocket } from '../src/utils/websocket';

const server = app
  .listen(port, () => {
    Logger.info(`server running on port : ${port}`);
  })
  .on('error', (e) => Logger.error(e));

process.on('uncaughtException', (e) => {
  Logger.error(e);
});

process.on('SIGTERM', () => {
  Logger.info('SIGTERM received');
  server.close();
});

const io = new SocketIOServer(server, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
  },
  path: '/socket.io',
});

// setupWebSocket(io);
