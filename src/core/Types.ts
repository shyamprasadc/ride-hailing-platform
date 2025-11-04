import { Request } from 'express';

// ==================== ENUMS ====================

export enum RideStatus {
  SEARCHING = 'SEARCHING',
  MATCHED = 'MATCHED',
  DRIVER_ARRIVING = 'DRIVER_ARRIVING',
  ARRIVED = 'ARRIVED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
}

export enum RideType {
  ECONOMY = 'ECONOMY',
  STANDARD = 'STANDARD',
  PREMIUM = 'PREMIUM',
  XL = 'XL',
  LUXURY = 'LUXURY',
}

export enum DriverStatus {
  OFFLINE = 'OFFLINE',
  AVAILABLE = 'AVAILABLE',
  ON_RIDE = 'ON_RIDE',
  BREAK = 'BREAK',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export enum TripStatus {
  PENDING = 'PENDING',
  STARTED = 'STARTED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum VehicleType {
  SEDAN = 'SEDAN',
  SUV = 'SUV',
  HATCHBACK = 'HATCHBACK',
  LUXURY = 'LUXURY',
  AUTO = 'AUTO',
}

// ==================== BASE TYPES ====================

export interface Location {
  lat: number;
  lng: number;
  address?: string;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginationResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface Result<T, E = Error> {
  success: boolean;
  data?: T;
  error?: E;
}

// ==================== REQUEST TYPES ====================

export interface CreateRideRequest {
  riderId: string;
  pickup: Location;
  dropoff: Location;
  rideType: RideType;
  paymentMethodId?: string;
  notes?: string;
  scheduledAt?: Date;
  idempotencyKey: string;
}

export interface UpdateLocationRequest {
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  accuracy?: number;
}

export interface AcceptRideRequest {
  rideId: string;
  driverId: string;
}

export interface StartTripRequest {
  tripId: string;
  startOtp: string;
}

export interface EndTripRequest {
  tripId: string;
  endLocation: Location;
  actualDistance: number;
  routePath?: Location[];
}

export interface ProcessPaymentRequest {
  tripId: string;
  paymentMethodId: string;
  idempotencyKey: string;
}

export interface CancelRideRequest {
  rideId: string;
  cancelledBy: 'rider' | 'driver' | 'system';
  reason?: string;
}

// ==================== RESPONSE TYPES ====================

export interface RideResponse {
  id: string;
  riderId: string;
  driverId?: string;
  pickup: Location;
  dropoff: Location;
  rideType: RideType;
  status: RideStatus;
  estimatedFare?: number;
  estimatedDistance?: number;
  estimatedDuration?: number;
  surgeMultiplier: number;
  matchedAt?: Date;
  createdAt: Date;
  driver?: DriverInfo;
}

export interface DriverInfo {
  id: string;
  name: string;
  phone: string;
  vehicleNumber: string;
  vehicleModel: string;
  vehicleColor: string;
  rating: number;
  currentLocation?: Location;
}

export interface TripResponse {
  id: string;
  rideId: string;
  driverId: string;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  actualDistance?: number;
  finalFare: number;
  status: TripStatus;
  driver: DriverInfo;
}

export interface PaymentResponse {
  id: string;
  tripId: string;
  amount: number;
  status: PaymentStatus;
  pspTransactionId?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface NearbyDriver {
  driverId: string;
  distance: number;
  rating: number;
  vehicleType: VehicleType;
  location: Location;
}

// ==================== SERVICE TYPES ====================

export interface FareCalculation {
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  surgeAmount: number;
  totalFare: number;
  discount: number;
  finalFare: number;
  platformFee: number;
  driverEarnings: number;
}

export interface MatchingOptions {
  radiusKm: number;
  maxAttempts: number;
  vehicleType?: VehicleType;
}

export interface PricingConfig {
  baseFare: number;
  perKmRate: number;
  perMinRate: number;
  minimumFare: number;
  surgeEnabled: boolean;
  maxSurge: number;
}

// ==================== EXPRESS TYPES ====================

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: 'rider' | 'driver' | 'admin';
  };
}

// ==================== UTILITY TYPES ====================

export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type AsyncResult<T> = Promise<Result<T>>;

// Pure function type helpers
export type Pure<T extends (...args: any[]) => any> = T;
export type AsyncPure<T extends (...args: any[]) => Promise<any>> = T;
