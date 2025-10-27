import { PrismaClient } from '@prisma/client';
import {
  StartTripRequest,
  EndTripRequest,
  TripResponse,
  Result,
  NotFoundError,
  ValidationError,
  FareCalculation,
  RideStatus,
  TripStatus,
} from '../core/Types';
import Logger from '../core/Logger';
import { publishRideUpdate, invalidateRideCache, trackActiveRide } from '../utils/redis';

const prisma = new PrismaClient();

/**
 * Calculate final fare for completed trip
 */
const calculateFare = (
  distance: number,
  duration: number,
  baseFare: number,
  perKmRate: number,
  perMinRate: number,
  surgeMultiplier: number,
  discount: number = 0
): FareCalculation => {
  const distanceFare = distance * perKmRate;
  const timeFare = (duration / 60) * perMinRate;
  const surgeAmount = (baseFare + distanceFare + timeFare) * (surgeMultiplier - 1);
  const totalFare = baseFare + distanceFare + timeFare + surgeAmount;
  const finalFare = Math.max(0, totalFare - discount);
  const platformFee = finalFare * 0.2; // 20% commission
  const driverEarnings = finalFare - platformFee;

  return {
    baseFare: Math.round(baseFare * 100) / 100,
    distanceFare: Math.round(distanceFare * 100) / 100,
    timeFare: Math.round(timeFare * 100) / 100,
    surgeAmount: Math.round(surgeAmount * 100) / 100,
    totalFare: Math.round(totalFare * 100) / 100,
    discount: Math.round(discount * 100) / 100,
    finalFare: Math.round(finalFare * 100) / 100,
    platformFee: Math.round(platformFee * 100) / 100,
    driverEarnings: Math.round(driverEarnings * 100) / 100,
  };
};

/**
 * Validate OTP
 */
const validateOtp = (provided: string, expected: string): boolean => {
  return provided === expected;
};

/**
 * Transform trip entity to TripResponse
 */
const toTripResponse = (trip: any, ride: any, driver: any): TripResponse => ({
  id: trip.id,
  rideId: trip.rideId,
  driverId: trip.driverId,
  startTime: trip.startTime || undefined,
  endTime: trip.endTime || undefined,
  duration: trip.duration || undefined,
  actualDistance: trip.actualDistance || undefined,
  finalFare: trip.finalFare,
  status: trip.status as TripStatus,
  driver: {
    id: driver.id,
    name: driver.name,
    phone: driver.phone,
    vehicleNumber: driver.vehicleNumber,
    vehicleModel: driver.vehicleModel,
    vehicleColor: driver.vehicleColor,
    rating: driver.rating,
  },
});

/**
 * Start a trip
 */
export const startTrip = async (request: StartTripRequest): Promise<Result<TripResponse>> => {
  try {
    return await prisma.$transaction(async (tx) => {
      // Get trip with ride and driver info
      const trip = await tx.trip.findUnique({
        where: { id: request.tripId },
        include: {
          ride: true,
          driver: true,
        },
      });

      if (!trip) {
        return {
          success: false,
          error: new NotFoundError('Trip not found'),
        };
      }

      if (trip.status !== TripStatus.PENDING) {
        return {
          success: false,
          error: new ValidationError('Trip already started or completed'),
        };
      }

      // Validate OTP
      if (!trip.startOtp || !validateOtp(request.startOtp, trip.startOtp)) {
        return {
          success: false,
          error: new ValidationError('Invalid OTP'),
        };
      }

      // Update trip status
      const updatedTrip = await tx.trip.update({
        where: { id: request.tripId },
        data: {
          startTime: new Date(),
          status: TripStatus.STARTED,
        },
        include: {
          ride: true,
          driver: true,
        },
      });

      // Update ride status
      await tx.ride.update({
        where: { id: trip.rideId },
        data: { status: RideStatus.IN_PROGRESS },
      });

      // Notify rider
      await tx.notification.create({
        data: {
          riderId: trip.ride.riderId,
          type: 'TRIP_STARTED',
          title: 'Trip Started',
          message: 'Your trip has started. Have a safe journey!',
          rideId: trip.rideId,
        },
      });

      // Log event
      await tx.rideEvent.create({
        data: {
          rideId: trip.rideId,
          eventType: 'trip_started',
          eventData: { tripId: trip.id },
        },
      });

      // Invalidate cache and publish update
      await invalidateRideCache(trip.rideId);
      await publishRideUpdate(trip.rideId, {
        status: RideStatus.IN_PROGRESS,
        tripStartTime: updatedTrip.startTime,
      });

      const response = toTripResponse(updatedTrip, updatedTrip.ride, updatedTrip.driver);

      return { success: true, data: response };
    });
  } catch (error) {
    Logger.error('Error starting trip:', error);
    return { success: false, error: error as Error };
  }
};

/**
 * End a trip and calculate fare
 */
export const endTrip = async (request: EndTripRequest): Promise<Result<TripResponse>> => {
  try {
    return await prisma.$transaction(async (tx) => {
      // Get trip with ride info
      const trip = await tx.trip.findUnique({
        where: { id: request.tripId },
        include: {
          ride: true,
          driver: true,
        },
      });

      if (!trip) {
        return {
          success: false,
          error: new NotFoundError('Trip not found'),
        };
      }

      if (trip.status !== TripStatus.STARTED) {
        return {
          success: false,
          error: new ValidationError('Trip not in progress'),
        };
      }

      if (!trip.startTime) {
        return {
          success: false,
          error: new ValidationError('Trip start time not found'),
        };
      }

      // Calculate trip duration
      const endTime = new Date();
      const duration = Math.floor((endTime.getTime() - trip.startTime.getTime()) / 1000);

      // Calculate fare
      const fareCalculation = calculateFare(
        request.actualDistance,
        duration,
        trip.baseFare,
        trip.perKmRate,
        trip.perMinRate,
        trip.ride.surgeMultiplier,
        trip.discount
      );

      // Update trip with fare calculation
      const updatedTrip = await tx.trip.update({
        where: { id: request.tripId },
        data: {
          endTime,
          duration,
          actualDistance: request.actualDistance,
          routePath: JSON.stringify(request.routePath),
          distanceFare: fareCalculation.distanceFare,
          timeFare: fareCalculation.timeFare,
          surgeAmount: fareCalculation.surgeAmount,
          totalFare: fareCalculation.totalFare,
          finalFare: fareCalculation.finalFare,
          platformFee: fareCalculation.platformFee,
          driverEarnings: fareCalculation.driverEarnings,
          status: TripStatus.COMPLETED,
        },
        include: {
          ride: true,
          driver: true,
        },
      });

      // Update ride status
      await tx.ride.update({
        where: { id: trip.rideId },
        data: { status: RideStatus.COMPLETED },
      });

      // Update driver status and stats
      await tx.driver.update({
        where: { id: trip.driverId },
        data: {
          status: 'AVAILABLE',
          totalTrips: { increment: 1 },
        },
      });

      // Update rider stats
      await tx.rider.update({
        where: { id: trip.ride.riderId },
        data: {
          totalRides: { increment: 1 },
        },
      });

      // Add driver earnings
      await tx.earning.create({
        data: {
          driverId: trip.driverId,
          amount: fareCalculation.driverEarnings,
          type: 'TRIP',
          referenceId: trip.id,
          description: `Trip earnings for ride ${trip.rideId.slice(0, 8)}`,
        },
      });

      // Generate receipt
      await tx.receipt.create({
        data: {
          tripId: trip.id,
          receiptNumber: `RCP-${Date.now()}-${trip.id.slice(0, 8)}`,
          breakdown: {
            baseFare: fareCalculation.baseFare,
            distanceFare: fareCalculation.distanceFare,
            timeFare: fareCalculation.timeFare,
            surgeAmount: fareCalculation.surgeAmount,
            discount: fareCalculation.discount,
            total: fareCalculation.finalFare,
          },
          taxAmount: fareCalculation.finalFare * 0.18, // 18% GST
        },
      });

      // Notify rider
      await tx.notification.create({
        data: {
          riderId: trip.ride.riderId,
          type: 'TRIP_COMPLETED',
          title: 'Trip Completed',
          message: `Your fare is ₹${fareCalculation.finalFare.toFixed(2)}`,
          rideId: trip.rideId,
          data: { fare: fareCalculation.finalFare },
        },
      });

      // Log event
      await tx.rideEvent.create({
        data: {
          rideId: trip.rideId,
          eventType: 'trip_completed',
          eventData: {
            finalFare: fareCalculation.finalFare,
            duration,
            distance: request.actualDistance,
          },
        },
      });

      // Remove from active rides
      await trackActiveRide(trip.rideId, false);

      // Invalidate cache and publish update
      await invalidateRideCache(trip.rideId);
      await publishRideUpdate(trip.rideId, {
        status: RideStatus.COMPLETED,
        finalFare: fareCalculation.finalFare,
        tripEndTime: endTime,
      });

      const response = toTripResponse(updatedTrip, updatedTrip.ride, updatedTrip.driver);

      return { success: true, data: response };
    });
  } catch (error) {
    Logger.error('Error ending trip:', error);
    return { success: false, error: error as Error };
  }
};

/**
 * Get trip by ID
 */
export const getTripById = async (tripId: string): Promise<Result<TripResponse>> => {
  try {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        ride: true,
        driver: true,
      },
    });

    if (!trip) {
      return {
        success: false,
        error: new NotFoundError('Trip not found'),
      };
    }

    const response = toTripResponse(trip, trip.ride, trip.driver);
    return { success: true, data: response };
  } catch (error) {
    Logger.error('Error getting trip:', error);
    return { success: false, error: error as Error };
  }
};

export default {
  startTrip,
  endTrip,
  getTripById,
};
