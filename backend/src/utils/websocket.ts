import { Server as SocketIOServer, Socket } from 'socket.io';
import { subscribeToRideUpdates, subscribeToLocationUpdates } from './redis';

export const setupWebSocket = (io: SocketIOServer): void => {
  io.on('connection', (socket: Socket) => {
    console.log('Client connected:', socket.id);

    // Rider subscribes to ride updates
    socket.on('subscribe:ride', (rideId: string) => {
      console.log(`Socket ${socket.id} subscribing to ride ${rideId}`);

      const unsubscribe = subscribeToRideUpdates(rideId, (data) => {
        socket.emit('ride:update', data);
      });

      // Clean up on disconnect
      socket.on('disconnect', () => {
        unsubscribe();
        console.log(`Socket ${socket.id} unsubscribed from ride ${rideId}`);
      });
    });

    // Rider subscribes to driver location
    socket.on('subscribe:driver', (driverId: string) => {
      console.log(`Socket ${socket.id} subscribing to driver ${driverId}`);

      const unsubscribe = subscribeToLocationUpdates(driverId, (data) => {
        socket.emit('driver:location', data);
      });

      // Clean up on disconnect
      socket.on('disconnect', () => {
        unsubscribe();
        console.log(`Socket ${socket.id} unsubscribed from driver ${driverId}`);
      });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  console.log(`WebSocket server initialized`);
};
