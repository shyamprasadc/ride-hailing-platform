// src/services/ride.service.ts
// Complete Ride Service Implementation - Functional Programming

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

// ==================== PURE FUNCTIONS ====================

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
