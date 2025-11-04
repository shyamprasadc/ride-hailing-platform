import { PrismaClient } from '@prisma/client';
import {
  UpdateLocationRequest,
  AcceptRideRequest,
  DriverInfo,
  Result,
  DriverStatus,
  RideStatus,
} from '../core/Types';
import { BadRequestError, NotFoundError, UnprocessableEntityError } from '../core/ApiError';
import {
  addAvailableDriver,
  removeAvailableDriver,
  queueLocationUpdate,
  publishLocationUpdate,
  getCachedDriverProfile,
  cacheDriverProfile,
  withLock,
  publishRideUpdate,
  invalidateRideCache,
} from '../utils/redis';

const prisma = new PrismaClient();

/**
 * Validate location data
 */
const validateLocation = (location: UpdateLocationRequest): Result<true> => {
  if (location.latitude < -90 || location.latitude > 90) {
    throw new UnprocessableEntityError('Invalid latitude');
  }

  if (location.longitude < -180 || location.longitude > 180) {
    throw new UnprocessableEntityError('Invalid longitude');
  }

  if (location.speed !== undefined && location.speed < 0) {
    throw new UnprocessableEntityError('Speed cannot be negative');
  }

  return { success: true };
};

/**
 * Check if driver can accept rides
 */
const canAcceptRides = (status: DriverStatus): boolean => {
  return status === DriverStatus.AVAILABLE;
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
 * Get driver from database
 */
const getDriverFromDb = async (driverId: string) => {
  return await prisma.driver.findUnique({
    where: { id: driverId },
  });
};

/**
 * Update driver location in database
 */
const updateDriverLocationInDb = async (driverId: string, location: UpdateLocationRequest) => {
  return await prisma.driver.update({
    where: { id: driverId },
    data: {
      currentLat: location.latitude,
      currentLng: location.longitude,
      lastLocationUpdate: new Date(),
    },
  });
};

/**
 * Update driver status in database
 */
const updateDriverStatusInDb = async (driverId: string, status: DriverStatus) => {
  return await prisma.driver.update({
    where: { id: driverId },
    data: { status },
  });
};

/**
 * Get active trip for driver
 */
const getActiveTrip = async (driverId: string) => {
  return await prisma.trip.findFirst({
    where: {
      driverId,
      status: { in: ['PENDING', 'STARTED'] },
    },
    include: {
      ride: true,
    },
  });
};

/**
 * Update driver location
 */
export const updateDriverLocation = async (
  driverId: string,
  location: UpdateLocationRequest
): Promise<Result<{ success: boolean }>> => {
  // Validate location
  validateLocation(location);
  // Get driver from cache or database
  let driver = await getCachedDriverProfile(driverId);
  if (!driver) {
    const dbDriver = await getDriverFromDb(driverId);
    if (!dbDriver) {
      throw new BadRequestError('Driver not found');
    }
    driver = toDriverInfo(dbDriver);
  }

  // Queue location update for batch processing (handles 200k/sec)
  await queueLocationUpdate(
    driverId,
    location.latitude,
    location.longitude,
    location.heading,
    location.speed,
    location.accuracy
  );

  // If driver is on active trip, broadcast to rider in real-time
  const activeTrip = await getActiveTrip(driverId);
  if (activeTrip && activeTrip.ride) {
    await publishLocationUpdate(driverId, {
      driverId,
      lat: location.latitude,
      lng: location.longitude,
      heading: location.heading,
      speed: location.speed,
      accuracy: location.accuracy,
    });

    // Also publish to ride channel
    await publishRideUpdate(activeTrip.ride.id, {
      driverLocation: {
        lat: location.latitude,
        lng: location.longitude,
      },
    });
  }

  return { success: true, data: { success: true } };
};

/**
 * Update driver availability status
 */
export const updateDriverAvailability = async (
  driverId: string,
  status: DriverStatus
): Promise<Result<DriverInfo>> => {
  // Get driver
  const driver = await getDriverFromDb(driverId);
  if (!driver) {
    throw new NotFoundError('Driver not found');
  }

  // Update status in database
  const updatedDriver = await updateDriverStatusInDb(driverId, status);

  // Update Redis geo index
  if (status === DriverStatus.AVAILABLE) {
    if (driver.currentLat && driver.currentLng) {
      await addAvailableDriver(driverId, driver.currentLat, driver.currentLng, {
        vehicleType: driver.vehicleType,
        rating: driver.rating,
      });
    }
  } else {
    await removeAvailableDriver(driverId);
  }

  // Update cache
  const driverInfo = toDriverInfo(updatedDriver);
  await cacheDriverProfile(driverId, driverInfo, 600);

  return { success: true, data: driverInfo };
};

/**
 * Accept ride request
 */
export const acceptRide = async (
  request: AcceptRideRequest
): Promise<Result<{ rideId: string; message: string }>> => {
  // Use distributed lock to prevent race conditions
  return await withLock(`ride:${request.rideId}:matching`, 10, async () => {
    return await prisma.$transaction(async (tx) => {
      // Lock and fetch ride
      const ride = await tx.ride.findFirst({
        where: {
          id: request.rideId,
          status: RideStatus.SEARCHING,
        },
      });

      if (!ride) {
        throw new BadRequestError('Ride not found or not available for matching');
      }

      // Check driver availability
      const driver = await tx.driver.findFirst({
        where: {
          id: request.driverId,
          status: DriverStatus.AVAILABLE,
        },
      });

      if (!driver) {
        throw new BadRequestError('Driver not found or not available');
      }

      // Update ride status
      await tx.ride.update({
        where: { id: request.rideId },
        data: {
          driverId: request.driverId,
          status: RideStatus.MATCHED,
          matchedAt: new Date(),
        },
      });

      // Update driver status
      await tx.driver.update({
        where: { id: request.driverId },
        data: { status: DriverStatus.ON_RIDE },
      });

      // Remove driver from available pool
      await removeAvailableDriver(request.driverId);

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
          driverId: request.driverId,
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
            driverId: request.driverId,
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

      return {
        success: true,
        data: {
          rideId: ride.id,
          message: 'Ride accepted successfully',
        },
      };
    });
  });
};

/**
 * Get driver by ID
 */
export const getDriverById = async (driverId: string): Promise<Result<DriverInfo>> => {
  // Check cache first
  const cachedDriver = await getCachedDriverProfile(driverId);
  if (cachedDriver) {
    return { success: true, data: cachedDriver };
  }

  // Fetch from database
  const driver = await getDriverFromDb(driverId);
  if (!driver) {
    throw new NotFoundError('Driver not found');
  }

  const driverInfo = toDriverInfo(driver);

  // Cache the result
  await cacheDriverProfile(driverId, driverInfo, 600);

  return { success: true, data: driverInfo };
};

/**
 * Update driver to "arriving" status
 */
export const updateDriverArriving = async (
  rideId: string,
  driverId: string
): Promise<Result<{ success: boolean }>> => {
  return await prisma.$transaction(async (tx) => {
    const ride = await tx.ride.findFirst({
      where: {
        id: rideId,
        driverId,
        status: RideStatus.MATCHED,
      },
    });

    if (!ride) {
      throw new NotFoundError('Ride not found');
    }

    // Update ride status
    await tx.ride.update({
      where: { id: rideId },
      data: { status: RideStatus.DRIVER_ARRIVING },
    });

    // Notify rider
    await tx.notification.create({
      data: {
        riderId: ride.riderId,
        type: 'DRIVER_ARRIVING',
        title: 'Driver Arriving',
        message: 'Your driver is on the way to pickup location',
        rideId: ride.id,
      },
    });

    // Log event
    await tx.rideEvent.create({
      data: {
        rideId: ride.id,
        eventType: 'driver_arriving',
        eventData: { driverId },
      },
    });

    // Invalidate cache and publish update
    await invalidateRideCache(ride.id);
    await publishRideUpdate(ride.id, {
      status: RideStatus.DRIVER_ARRIVING,
    });

    return { success: true, data: { success: true } };
  });
};

/**
 * Mark driver as arrived at pickup location
 */
export const markDriverArrived = async (
  rideId: string,
  driverId: string
): Promise<Result<{ success: boolean; otp: string }>> => {
  return await prisma.$transaction(async (tx) => {
    const ride = await tx.ride.findFirst({
      where: {
        id: rideId,
        driverId,
        status: RideStatus.DRIVER_ARRIVING,
      },
    });

    if (!ride) {
      throw new NotFoundError('Ride not found');
    }

    // Generate OTP for trip start
    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    // Update ride status
    await tx.ride.update({
      where: { id: rideId },
      data: { status: RideStatus.ARRIVED },
    });

    // Create or update trip with OTP
    const existingTrip = await tx.trip.findFirst({
      where: { rideId },
    });

    if (existingTrip) {
      await tx.trip.update({
        where: { id: existingTrip.id },
        data: { startOtp: otp },
      });
    } else {
      // Get pricing config for trip
      const pricingConfig = await tx.pricingConfig.findFirst({
        where: {
          rideType: ride.rideType,
          region: 'Mumbai',
          isActive: true,
        },
      });

      await tx.trip.create({
        data: {
          rideId: ride.id,
          driverId,
          startOtp: otp,
          baseFare: pricingConfig?.baseFare || 50,
          perKmRate: pricingConfig?.perKmRate || 12,
          perMinRate: pricingConfig?.perMinRate || 2,
          totalFare: ride.estimatedFare || 0,
          finalFare: ride.estimatedFare || 0,
          platformFee: (ride.estimatedFare || 0) * 0.2,
          driverEarnings: (ride.estimatedFare || 0) * 0.8,
          status: 'PENDING',
        },
      });
    }

    // Notify rider with OTP
    await tx.notification.create({
      data: {
        riderId: ride.riderId,
        type: 'DRIVER_ARRIVED',
        title: 'Driver Arrived',
        message: `Your driver has arrived. OTP: ${otp}`,
        rideId: ride.id,
        data: { otp },
      },
    });

    // Log event
    await tx.rideEvent.create({
      data: {
        rideId: ride.id,
        eventType: 'driver_arrived',
        eventData: { driverId },
      },
    });

    // Invalidate cache and publish update
    await invalidateRideCache(ride.id);
    await publishRideUpdate(ride.id, {
      status: RideStatus.ARRIVED,
    });

    return { success: true, data: { success: true, otp } };
  });
};

/**
 * Get driver's earnings summary
 */
export const getDriverEarnings = async (
  driverId: string,
  startDate: Date,
  endDate: Date
): Promise<
  Result<{
    total: number;
    tripCount: number;
    averagePerTrip: number;
    byType: Record<string, number>;
  }>
> => {
  const earnings = await prisma.earning.findMany({
    where: {
      driverId,
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  const summary = earnings.reduce(
    (acc, earning) => {
      acc.total += earning.amount;
      acc.byType[earning.type] = (acc.byType[earning.type] || 0) + earning.amount;
      return acc;
    },
    { total: 0, byType: {} as Record<string, number> }
  );

  const tripCount = await prisma.trip.count({
    where: {
      driverId,
      status: 'COMPLETED',
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  return {
    success: true,
    data: {
      total: summary.total,
      tripCount,
      averagePerTrip: tripCount > 0 ? summary.byType.TRIP / tripCount : 0,
      byType: summary.byType,
    },
  };
};

export default {
  updateDriverLocation,
  updateDriverAvailability,
  acceptRide,
  getDriverById,
  updateDriverArriving,
  markDriverArrived,
  getDriverEarnings,
};
