import { PrismaClient } from '@prisma/client';
import {
  CreateRideRequest,
  RideResponse,
  RideStatus,
  RideType,
  Result,
  NotFoundError,
  ConflictError,
  ValidationError,
  PaginationParams,
  PaginationResult,
  CancelRideRequest,
  NearbyDriver,
  MatchingOptions,
  DriverInfo,
} from '../core/Types';
import {
  cacheRide,
  getCachedRide,
  invalidateRideCache,
  findNearbyDrivers,
  publishRideUpdate,
  trackActiveRide,
  withLock,
} from '../utils/redis';

const prisma = new PrismaClient();

/**
 * Calculate estimated fare based on distance and pricing config
 */
const calculateEstimatedFare = (
  distance: number,
  duration: number,
  baseFare: number,
  perKmRate: number,
  perMinRate: number,
  surgeMultiplier: number
): number => {
  const distanceFare = distance * perKmRate;
  const timeFare = (duration / 60) * perMinRate;
  const subtotal = baseFare + distanceFare + timeFare;
  return Math.round(subtotal * surgeMultiplier * 100) / 100;
};

/**
 * Calculate distance between two points using Haversine formula
 */
const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Estimate trip duration based on distance (simplified)
 */
const estimateDuration = (distanceKm: number): number => {
  const avgSpeedKmh = 30; // Average city speed
  return Math.round((distanceKm / avgSpeedKmh) * 3600); // seconds
};

/**
 * Validate ride request data
 */
const validateRideRequest = (request: CreateRideRequest): Result<true> => {
  if (!request.riderId) {
    return { success: false, error: new ValidationError('Rider ID is required') };
  }

  if (!request.pickup.lat || !request.pickup.lng) {
    return { success: false, error: new ValidationError('Valid pickup location is required') };
  }

  if (!request.dropoff.lat || !request.dropoff.lng) {
    return { success: false, error: new ValidationError('Valid dropoff location is required') };
  }

  if (request.pickup.lat < -90 || request.pickup.lat > 90) {
    return { success: false, error: new ValidationError('Invalid pickup latitude') };
  }

  if (request.pickup.lng < -180 || request.pickup.lng > 180) {
    return { success: false, error: new ValidationError('Invalid pickup longitude') };
  }

  if (request.dropoff.lat < -90 || request.dropoff.lat > 90) {
    return { success: false, error: new ValidationError('Invalid dropoff latitude') };
  }

  if (request.dropoff.lng < -180 || request.dropoff.lng > 180) {
    return { success: false, error: new ValidationError('Invalid dropoff longitude') };
  }

  if (!Object.values(RideType).includes(request.rideType)) {
    return { success: false, error: new ValidationError('Invalid ride type') };
  }

  return { success: true };
};

/**
 * Check if surge pricing is active for a zone
 */
const getSurgeMultiplier = async (lat: number, lng: number): Promise<number> => {
  try {
    // In production, check active surge zones from database
    const surgeZone = await prisma.surgeZone.findFirst({
      where: {
        isActive: true,
        // You'd check if lat/lng is within boundaries polygon here
      },
    });

    return surgeZone?.currentSurge || 1.0;
  } catch (error) {
    console.error('Error getting surge multiplier:', error);
    return 1.0; // Default to no surge
  }
};

/**
 * Transform driver entity to DriverInfo
 */
const toDriverInfo = (driver: any): DriverInfo => ({
  id: driver.id,
  name: driver.name,
  phone: driver.phone,
  vehicleNumber: driver.vehicleNumber,
  vehicleModel: driver.vehicleModel,
  vehicleColor: driver.vehicleColor,
  rating: driver.rating,
  currentLocation:
    driver.currentLat && driver.currentLng
      ? {
          lat: driver.currentLat,
          lng: driver.currentLng,
        }
      : undefined,
});

/**
 * Transform ride entity to RideResponse
 */
const toRideResponse = (ride: any, driver?: any): RideResponse => ({
  id: ride.id,
  riderId: ride.riderId,
  driverId: ride.driverId || undefined,
  pickup: {
    lat: ride.pickupLat,
    lng: ride.pickupLng,
    address: ride.pickupAddress || undefined,
  },
  dropoff: {
    lat: ride.dropoffLat,
    lng: ride.dropoffLng,
    address: ride.dropoffAddress || undefined,
  },
  rideType: ride.rideType as RideType,
  status: ride.status as RideStatus,
  estimatedFare: ride.estimatedFare || undefined,
  estimatedDistance: ride.estimatedDistance || undefined,
  estimatedDuration: ride.estimatedDuration || undefined,
  surgeMultiplier: ride.surgeMultiplier,
  matchedAt: ride.matchedAt || undefined,
  createdAt: ride.createdAt,
  driver: driver ? toDriverInfo(driver) : undefined,
});

// ==================== DATABASE OPERATIONS ====================

/**
 * Get pricing configuration for ride type and region
 */
const getPricingConfig = async (rideType: RideType, region: string = 'Mumbai') => {
  return await prisma.pricingConfig.findFirst({
    where: {
      rideType,
      region,
      isActive: true,
    },
  });
};

/**
 * Create ride in database
 */
const createRideInDb = async (
  request: CreateRideRequest,
  estimatedFare: number,
  estimatedDistance: number,
  estimatedDuration: number,
  surgeMultiplier: number
) => {
  return await prisma.ride.create({
    data: {
      riderId: request.riderId,
      pickupLat: request.pickup.lat,
      pickupLng: request.pickup.lng,
      pickupAddress: request.pickup.address,
      dropoffLat: request.dropoff.lat,
      dropoffLng: request.dropoff.lng,
      dropoffAddress: request.dropoff.address,
      rideType: request.rideType,
      status: RideStatus.SEARCHING,
      estimatedFare,
      estimatedDistance,
      estimatedDuration,
      surgeMultiplier,
      notes: request.notes,
      scheduledAt: request.scheduledAt,
      idempotencyKey: request.idempotencyKey,
      searchRadius: 5.0,
      searchAttempts: 0,
    },
  });
};

/**
 * Log ride event
 */
const logRideEvent = async (rideId: string, eventType: string, eventData?: any) => {
  await prisma.rideEvent.create({
    data: {
      rideId,
      eventType,
      eventData: eventData || {},
    },
  });
};

// ==================== MAIN SERVICE FUNCTIONS ====================

/**
 * Create a new ride request
 */
export const createRide = async (request: CreateRideRequest): Promise<Result<RideResponse>> => {
  try {
    // Validate request
    const validation = validateRideRequest(request);
    if (!validation.success) {
      // FIX return validation as Result<RideResponse>;
      return validation as any;
    }

    // Check for duplicate request using idempotency key
    if (request.idempotencyKey) {
      const existingRide = await prisma.ride.findUnique({
        where: { idempotencyKey: request.idempotencyKey },
        include: {
          trip: {
            include: { driver: true },
          },
        },
      });

      if (existingRide) {
        const cachedRide = await getCachedRide<RideResponse>(existingRide.id);
        if (cachedRide) {
          return { success: true, data: cachedRide };
        }
        const response = toRideResponse(existingRide, existingRide.trip?.driver);
        return { success: true, data: response };
      }
    }

    // Verify rider exists
    const rider = await prisma.rider.findUnique({
      where: { id: request.riderId },
    });

    if (!rider) {
      return {
        success: false,
        error: new NotFoundError('Rider not found'),
      };
    }

    // Get pricing configuration
    const pricingConfig = await getPricingConfig(request.rideType);
    if (!pricingConfig) {
      return {
        success: false,
        error: new NotFoundError('Pricing configuration not found'),
      };
    }

    // Calculate distance and duration
    const distance = calculateDistance(
      request.pickup.lat,
      request.pickup.lng,
      request.dropoff.lat,
      request.dropoff.lng
    );
    const duration = estimateDuration(distance);

    // Get surge multiplier
    const surgeMultiplier = await getSurgeMultiplier(request.pickup.lat, request.pickup.lng);

    // Calculate estimated fare
    const estimatedFare = calculateEstimatedFare(
      distance,
      duration,
      pricingConfig.baseFare,
      pricingConfig.perKmRate,
      pricingConfig.perMinRate,
      surgeMultiplier
    );

    // Create ride in database
    const ride = await createRideInDb(request, estimatedFare, distance, duration, surgeMultiplier);

    // Log event
    await logRideEvent(ride.id, 'ride_created', {
      estimatedFare,
      distance,
      duration,
    });

    // Track active ride
    await trackActiveRide(ride.id, true);

    // Prepare response
    const response = toRideResponse(ride);

    // Cache the ride
    await cacheRide(ride.id, response, 3600);

    // Start matching process asynchronously
    findAndMatchDriver(ride.id, request.pickup, request.rideType).catch((error) => {
      console.error('Error in background matching:', error);
    });

    return { success: true, data: response };
  } catch (error) {
    console.error('Error creating ride:', error);
    return { success: false, error: error as Error };
  }
};

/**
 * Get ride by ID
 */
export const getRideById = async (rideId: string): Promise<Result<RideResponse>> => {
  try {
    // Check cache first
    const cachedRide = await getCachedRide<RideResponse>(rideId);
    if (cachedRide) {
      return { success: true, data: cachedRide };
    }

    // Fetch from database
    const ride = await prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        trip: {
          include: {
            driver: true,
          },
        },
      },
    });

    if (!ride) {
      return {
        success: false,
        error: new NotFoundError('Ride not found'),
      };
    }

    // Prepare response
    const response = toRideResponse(ride, ride.trip?.driver);

    // Cache the result
    await cacheRide(ride.id, response, 300);

    return { success: true, data: response };
  } catch (error) {
    console.error('Error getting ride:', error);
    return { success: false, error: error as Error };
  }
};

/**
 * Get rider's ride history with pagination
 */
export const getRiderRideHistory = async (
  riderId: string,
  params: PaginationParams
): Promise<Result<PaginationResult<RideResponse>>> => {
  try {
    const skip = (params.page - 1) * params.limit;

    const [rides, total] = await Promise.all([
      prisma.ride.findMany({
        where: { riderId },
        include: {
          trip: {
            include: {
              driver: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: params.limit,
      }),
      prisma.ride.count({ where: { riderId } }),
    ]);

    const data: RideResponse[] = rides.map((ride) => toRideResponse(ride, ride.trip?.driver));

    return {
      success: true,
      data: {
        data,
        pagination: {
          page: params.page,
          limit: params.limit,
          total,
          totalPages: Math.ceil(total / params.limit),
        },
      },
    };
  } catch (error) {
    console.error('Error getting ride history:', error);
    return { success: false, error: error as Error };
  }
};

/**
 * Get active rides for a rider
 */
export const getActiveRides = async (riderId: string): Promise<Result<RideResponse[]>> => {
  try {
    const rides = await prisma.ride.findMany({
      where: {
        riderId,
        status: {
          in: [
            RideStatus.SEARCHING,
            RideStatus.MATCHED,
            RideStatus.DRIVER_ARRIVING,
            RideStatus.ARRIVED,
            RideStatus.IN_PROGRESS,
          ],
        },
      },
      include: {
        trip: {
          include: {
            driver: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const data: RideResponse[] = rides.map((ride) => toRideResponse(ride, ride.trip?.driver));

    return { success: true, data };
  } catch (error) {
    console.error('Error getting active rides:', error);
    return { success: false, error: error as Error };
  }
};

/**
 * Cancel a ride
 */
export const cancelRide = async (request: CancelRideRequest): Promise<Result<RideResponse>> => {
  try {
    return await prisma.$transaction(async (tx) => {
      // Lock and fetch ride
      const ride = await tx.ride.findFirst({
        where: {
          id: request.rideId,
          status: {
            notIn: [RideStatus.COMPLETED, RideStatus.CANCELLED],
          },
        },
      });

      if (!ride) {
        return {
          success: false,
          error: new NotFoundError('Ride not found or cannot be cancelled'),
        };
      }

      // Calculate cancellation fee (if ride was matched)
      let cancellationFee = 0;
      if (
        ride.status === RideStatus.MATCHED ||
        ride.status === RideStatus.DRIVER_ARRIVING ||
        ride.status === RideStatus.ARRIVED
      ) {
        // Charge 10% of estimated fare as cancellation fee
        cancellationFee = Math.round((ride.estimatedFare || 0) * 0.1);
      }

      // Update ride status
      const updatedRide = await tx.ride.update({
        where: { id: request.rideId },
        data: { status: RideStatus.CANCELLED },
      });

      // If driver was assigned, free them up
      if (ride.driverId) {
        await tx.driver.update({
          where: { id: ride.driverId },
          data: { status: 'AVAILABLE' },
        });

        // Notify driver
        await tx.notification.create({
          data: {
            driverId: ride.driverId,
            type: 'RIDE_CANCELLED',
            title: 'Ride Cancelled',
            message: `Ride cancelled by ${request.cancelledBy}`,
            rideId: ride.id,
          },
        });

        // Add driver from available pool if offline
        // This would be done via Redis in the driver service
      }

      // Notify rider
      await tx.notification.create({
        data: {
          riderId: ride.riderId,
          type: 'RIDE_CANCELLED',
          title: 'Ride Cancelled',
          message: request.reason || 'Ride has been cancelled',
          rideId: ride.id,
          data: cancellationFee > 0 ? { cancellationFee } : undefined,
        },
      });

      // Cancel associated trip if exists
      const trip = await tx.trip.findFirst({
        where: { rideId: ride.id },
      });

      if (trip) {
        await tx.trip.update({
          where: { id: trip.id },
          data: { status: 'CANCELLED' },
        });
      }

      // Log event
      await tx.rideEvent.create({
        data: {
          rideId: ride.id,
          eventType: 'ride_cancelled',
          eventData: {
            cancelledBy: request.cancelledBy,
            reason: request.reason,
            cancellationFee,
          },
        },
      });

      // Remove from active rides
      await trackActiveRide(ride.id, false);

      // Invalidate cache
      await invalidateRideCache(ride.id);

      // Publish update
      await publishRideUpdate(ride.id, {
        status: RideStatus.CANCELLED,
        reason: request.reason,
        cancellationFee,
      });

      const response = toRideResponse(updatedRide);

      return { success: true, data: response };
    });
  } catch (error) {
    console.error('Error cancelling ride:', error);
    return { success: false, error: error as Error };
  }
};

/**
 * Update ride status
 */
export const updateRideStatus = async (
  rideId: string,
  status: RideStatus
): Promise<Result<RideResponse>> => {
  try {
    const ride = await prisma.ride.update({
      where: { id: rideId },
      data: { status },
      include: {
        trip: {
          include: {
            driver: true,
          },
        },
      },
    });

    // Log event
    await logRideEvent(ride.id, 'status_updated', { status });

    // Invalidate cache
    await invalidateRideCache(ride.id);

    // Publish update
    await publishRideUpdate(ride.id, { status });

    const response = toRideResponse(ride, ride.trip?.driver);

    return { success: true, data: response };
  } catch (error) {
    console.error('Error updating ride status:', error);
    return { success: false, error: error as Error };
  }
};

/**
 * Match ride with driver
 */
export const matchRideWithDriver = async (
  rideId: string,
  driverId: string
): Promise<Result<RideResponse>> => {
  try {
    // Use distributed lock to prevent race conditions
    return await withLock(`ride:${rideId}:matching`, 10, async () => {
      return await prisma.$transaction(async (tx) => {
        // Lock and fetch ride
        const ride = await tx.ride.findFirst({
          where: {
            id: rideId,
            status: RideStatus.SEARCHING,
          },
        });

        if (!ride) {
          return {
            success: false,
            error: new ConflictError('Ride not available for matching'),
          };
        }

        // Check driver availability
        const driver = await tx.driver.findFirst({
          where: {
            id: driverId,
            status: 'AVAILABLE',
          },
        });

        if (!driver) {
          return {
            success: false,
            error: new ConflictError('Driver not available'),
          };
        }

        // Update ride status
        const updatedRide = await tx.ride.update({
          where: { id: rideId },
          data: {
            driverId,
            status: RideStatus.MATCHED,
            matchedAt: new Date(),
          },
        });

        // Update driver status
        await tx.driver.update({
          where: { id: driverId },
          data: { status: 'ON_RIDE' },
        });

        // Create notification for rider
        await tx.notification.create({
          data: {
            riderId: ride.riderId,
            type: 'RIDE_MATCHED',
            title: 'Driver Found!',
            message: `${driver.name} is on the way`,
            rideId: ride.id,
            data: {
              driverName: driver.name,
              vehicleNumber: driver.vehicleNumber,
              rating: driver.rating,
            },
          },
        });

        // Create notification for driver
        await tx.notification.create({
          data: {
            driverId,
            type: 'RIDE_REQUEST',
            title: 'New Ride',
            message: 'You have been matched with a rider',
            rideId: ride.id,
          },
        });

        // Log event
        await tx.rideEvent.create({
          data: {
            rideId: ride.id,
            eventType: 'driver_matched',
            eventData: {
              driverId,
              driverName: driver.name,
            },
          },
        });

        // Invalidate ride cache
        await invalidateRideCache(ride.id);

        // Publish ride update
        await publishRideUpdate(ride.id, {
          status: RideStatus.MATCHED,
          driver: toDriverInfo(driver),
        });

        const response = toRideResponse(updatedRide, driver);

        return { success: true, data: response };
      });
    });
  } catch (error) {
    console.error('Error matching ride with driver:', error);
    return { success: false, error: error as Error };
  }
};

// ==================== BACKGROUND MATCHING PROCESS ====================

/**
 * Find and match driver to ride (async background process)
 */
const findAndMatchDriver = async (
  rideId: string,
  pickup: { lat: number; lng: number },
  rideType: RideType,
  options: MatchingOptions = { radiusKm: 5, maxAttempts: 3 }
): Promise<void> => {
  try {
    let attempts = 0;
    let matched = false;

    while (attempts < options.maxAttempts && !matched) {
      attempts++;

      // Find nearby drivers
      const nearbyDrivers = await findNearbyDrivers(pickup.lat, pickup.lng, options.radiusKm, 10);

      if (nearbyDrivers.length === 0) {
        console.log(`No drivers found near ride ${rideId}, attempt ${attempts}`);

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, 5000));
        continue;
      }

      console.log(`Found ${nearbyDrivers.length} drivers for ride ${rideId}, attempt ${attempts}`);

      // Sort drivers by distance and rating
      const sortedDrivers = nearbyDrivers.sort((a, b) => {
        if (Math.abs(a.distance - b.distance) < 0.5) {
          // If distance is similar, prefer higher rating
          return Number(b.rating) - Number(a.rating);
        }
        return a.distance - b.distance;
      });

      // Try to match with each driver (in production, send offers)
      for (const driver of sortedDrivers) {
        // Check if ride is still in SEARCHING status
        const currentRide = await prisma.ride.findUnique({
          where: { id: rideId },
        });

        if (currentRide?.status !== RideStatus.SEARCHING) {
          console.log(`Ride ${rideId} already matched or cancelled`);
          return;
        }

        // In production, send offer to driver and wait for acceptance
        // For now, auto-match with first available driver
        console.log(`Attempting to match ride ${rideId} with driver ${driver.driverId}`);

        const matchResult = await matchRideWithDriver(rideId, driver.driverId);

        if (matchResult.success) {
          console.log(`Successfully matched ride ${rideId} with driver ${driver.driverId}`);
          matched = true;
          break;
        } else {
          console.log(
            `Failed to match with driver ${driver.driverId}:`,
            matchResult.error?.message
          );
        }
      }

      if (!matched) {
        // Wait before next attempt
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    if (!matched) {
      console.log(`Failed to match ride ${rideId} after ${attempts} attempts`);

      // Update ride status to failed
      await prisma.ride.update({
        where: { id: rideId },
        data: {
          status: RideStatus.FAILED,
          searchAttempts: attempts,
        },
      });

      // Notify rider
      await prisma.notification.create({
        data: {
          riderId: (await prisma.ride.findUnique({ where: { id: rideId } }))!.riderId,
          type: 'SYSTEM',
          title: 'No Drivers Available',
          message: 'Sorry, no drivers are available at the moment. Please try again.',
          rideId,
        },
      });

      // Remove from active rides
      await trackActiveRide(rideId, false);

      // Publish update
      await publishRideUpdate(rideId, {
        status: RideStatus.FAILED,
        reason: 'No drivers available',
      });
    }
  } catch (error) {
    console.error('Error in driver matching:', error);
  }
};

export default {
  createRide,
  getRideById,
  getRiderRideHistory,
  getActiveRides,
  cancelRide,
  updateRideStatus,
  matchRideWithDriver,
};
