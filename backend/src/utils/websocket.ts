import Logger from '../core/Logger';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { subscribeToRideUpdates, subscribeToLocationUpdates } from './redis';

export const setupWebSocket = (io: SocketIOServer): void => {
  io.on('connection', (socket: Socket) => {
    Logger.info('Client connected:', socket.id);

    // Rider subscribes to ride updates
    socket.on('subscribe:ride', (rideId: string) => {
      Logger.info(`Socket ${socket.id} subscribing to ride ${rideId}`);

      const unsubscribe = subscribeToRideUpdates(rideId, (data) => {
        socket.emit('ride:update', data);
      });

      // Clean up on disconnect
      socket.on('disconnect', () => {
        unsubscribe();
        Logger.info(`Socket ${socket.id} unsubscribed from ride ${rideId}`);
      });
    });

    // Rider subscribes to driver location
    socket.on('subscribe:driver', (driverId: string) => {
      Logger.info(`Socket ${socket.id} subscribing to driver ${driverId}`);

      const unsubscribe = subscribeToLocationUpdates(driverId, (data) => {
        socket.emit('driver:location', data);
      });

      // Clean up on disconnect
      socket.on('disconnect', () => {
        unsubscribe();
        Logger.info(`Socket ${socket.id} unsubscribed from driver ${driverId}`);
      });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      Logger.info('Client disconnected:', socket.id);
    });

    // Handle errors
    socket.on('error', (error) => {
      Logger.error('WebSocket error:', error);
    });
  });

  Logger.info(`WebSocket server initialized`);
};
