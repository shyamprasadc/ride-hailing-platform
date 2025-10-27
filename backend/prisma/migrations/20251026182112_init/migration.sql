-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('OFFLINE', 'AVAILABLE', 'ON_RIDE', 'BREAK');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('SEDAN', 'SUV', 'HATCHBACK', 'LUXURY', 'AUTO');

-- CreateEnum
CREATE TYPE "RideStatus" AS ENUM ('SEARCHING', 'MATCHED', 'DRIVER_ARRIVING', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "RideType" AS ENUM ('ECONOMY', 'STANDARD', 'PREMIUM', 'XL', 'LUXURY');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('PENDING', 'STARTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('CARD', 'UPI', 'WALLET', 'CASH');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "EarningType" AS ENUM ('TRIP', 'BONUS', 'REFERRAL', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('RIDE_MATCHED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'TRIP_STARTED', 'TRIP_COMPLETED', 'PAYMENT_SUCCESS', 'PAYMENT_FAILED', 'RIDE_CANCELLED', 'RIDE_REQUEST', 'PROMO', 'SYSTEM');

-- CreateTable
CREATE TABLE "riders" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "profileImage" TEXT,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "totalRides" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "riders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "profileImage" TEXT,
    "licenseNumber" TEXT NOT NULL,
    "vehicleType" "VehicleType" NOT NULL,
    "vehicleNumber" TEXT NOT NULL,
    "vehicleModel" TEXT NOT NULL,
    "vehicleColor" TEXT NOT NULL,
    "status" "DriverStatus" NOT NULL DEFAULT 'OFFLINE',
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "totalTrips" INTEGER NOT NULL DEFAULT 0,
    "acceptanceRate" DOUBLE PRECISION NOT NULL DEFAULT 100.0,
    "currentLat" DOUBLE PRECISION,
    "currentLng" DOUBLE PRECISION,
    "lastLocationUpdate" TIMESTAMP(3),
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_locations" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "heading" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rides" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "driverId" TEXT,
    "pickupLat" DOUBLE PRECISION NOT NULL,
    "pickupLng" DOUBLE PRECISION NOT NULL,
    "pickupAddress" TEXT,
    "dropoffLat" DOUBLE PRECISION NOT NULL,
    "dropoffLng" DOUBLE PRECISION NOT NULL,
    "dropoffAddress" TEXT,
    "rideType" "RideType" NOT NULL DEFAULT 'STANDARD',
    "status" "RideStatus" NOT NULL DEFAULT 'SEARCHING',
    "estimatedFare" DOUBLE PRECISION,
    "estimatedDistance" DOUBLE PRECISION,
    "estimatedDuration" INTEGER,
    "surgeMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "notes" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "searchRadius" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "matchedAt" TIMESTAMP(3),
    "searchAttempts" INTEGER NOT NULL DEFAULT 0,
    "rejectedDriverIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" TEXT NOT NULL,
    "rideId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "duration" INTEGER,
    "actualDistance" DOUBLE PRECISION,
    "routePath" JSONB,
    "baseFare" DOUBLE PRECISION NOT NULL,
    "perKmRate" DOUBLE PRECISION NOT NULL,
    "perMinRate" DOUBLE PRECISION NOT NULL,
    "distanceFare" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "timeFare" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "surgeAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalFare" DOUBLE PRECISION NOT NULL,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finalFare" DOUBLE PRECISION NOT NULL,
    "platformFee" DOUBLE PRECISION NOT NULL,
    "driverEarnings" DOUBLE PRECISION NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'PENDING',
    "startOtp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "type" "PaymentType" NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "cardToken" TEXT,
    "cardLast4" TEXT,
    "cardBrand" TEXT,
    "cardExpiry" TEXT,
    "upiId" TEXT,
    "walletProvider" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "paymentMethodId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "pspName" TEXT,
    "pspTransactionId" TEXT,
    "pspResponse" JSONB,
    "idempotencyKey" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "failureReason" TEXT,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "pspRefundId" TEXT,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "breakdown" JSONB NOT NULL,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pdfUrl" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "earnings" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "type" "EarningType" NOT NULL,
    "description" TEXT,
    "referenceId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "riderId" TEXT,
    "driverId" TEXT,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "rideId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_configs" (
    "id" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "rideType" "RideType" NOT NULL,
    "baseFare" DOUBLE PRECISION NOT NULL,
    "perKmRate" DOUBLE PRECISION NOT NULL,
    "perMinRate" DOUBLE PRECISION NOT NULL,
    "minimumFare" DOUBLE PRECISION NOT NULL,
    "surgeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "maxSurge" DOUBLE PRECISION NOT NULL DEFAULT 3.0,
    "maxDistance" DOUBLE PRECISION NOT NULL DEFAULT 100.0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "surge_zones" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "boundaries" JSONB NOT NULL,
    "currentSurge" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "activeRides" INTEGER NOT NULL DEFAULT 0,
    "availableDrivers" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "surge_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_events" (
    "id" TEXT NOT NULL,
    "rideId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventData" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_logs" (
    "id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "responseTime" INTEGER NOT NULL,
    "userId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "errorMessage" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "riders_phone_key" ON "riders"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "riders_email_key" ON "riders"("email");

-- CreateIndex
CREATE INDEX "riders_phone_idx" ON "riders"("phone");

-- CreateIndex
CREATE INDEX "riders_email_idx" ON "riders"("email");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_phone_key" ON "drivers"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_email_key" ON "drivers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_licenseNumber_key" ON "drivers"("licenseNumber");

-- CreateIndex
CREATE INDEX "drivers_status_currentLat_currentLng_idx" ON "drivers"("status", "currentLat", "currentLng");

-- CreateIndex
CREATE INDEX "drivers_phone_idx" ON "drivers"("phone");

-- CreateIndex
CREATE INDEX "drivers_email_idx" ON "drivers"("email");

-- CreateIndex
CREATE INDEX "drivers_status_idx" ON "drivers"("status");

-- CreateIndex
CREATE INDEX "driver_locations_driverId_timestamp_idx" ON "driver_locations"("driverId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "driver_locations_timestamp_idx" ON "driver_locations"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "rides_idempotencyKey_key" ON "rides"("idempotencyKey");

-- CreateIndex
CREATE INDEX "rides_status_createdAt_idx" ON "rides"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "rides_riderId_createdAt_idx" ON "rides"("riderId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "rides_status_pickupLat_pickupLng_idx" ON "rides"("status", "pickupLat", "pickupLng");

-- CreateIndex
CREATE INDEX "rides_scheduledAt_idx" ON "rides"("scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "trips_rideId_key" ON "trips"("rideId");

-- CreateIndex
CREATE INDEX "trips_driverId_createdAt_idx" ON "trips"("driverId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "trips_status_idx" ON "trips"("status");

-- CreateIndex
CREATE INDEX "trips_startTime_endTime_idx" ON "trips"("startTime", "endTime");

-- CreateIndex
CREATE INDEX "payment_methods_riderId_isDefault_idx" ON "payment_methods"("riderId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tripId_key" ON "payments"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_pspTransactionId_key" ON "payments"("pspTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotencyKey_key" ON "payments"("idempotencyKey");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_pspTransactionId_idx" ON "payments"("pspTransactionId");

-- CreateIndex
CREATE INDEX "payments_createdAt_idx" ON "payments"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "refunds_pspRefundId_key" ON "refunds"("pspRefundId");

-- CreateIndex
CREATE INDEX "refunds_paymentId_idx" ON "refunds"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_tripId_key" ON "receipts"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_receiptNumber_key" ON "receipts"("receiptNumber");

-- CreateIndex
CREATE INDEX "receipts_receiptNumber_idx" ON "receipts"("receiptNumber");

-- CreateIndex
CREATE INDEX "earnings_driverId_date_idx" ON "earnings"("driverId", "date" DESC);

-- CreateIndex
CREATE INDEX "earnings_type_idx" ON "earnings"("type");

-- CreateIndex
CREATE INDEX "notifications_riderId_isRead_createdAt_idx" ON "notifications"("riderId", "isRead", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "notifications_driverId_isRead_createdAt_idx" ON "notifications"("driverId", "isRead", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "pricing_configs_region_isActive_idx" ON "pricing_configs"("region", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_configs_region_rideType_key" ON "pricing_configs"("region", "rideType");

-- CreateIndex
CREATE INDEX "surge_zones_region_isActive_idx" ON "surge_zones"("region", "isActive");

-- CreateIndex
CREATE INDEX "ride_events_rideId_timestamp_idx" ON "ride_events"("rideId", "timestamp");

-- CreateIndex
CREATE INDEX "ride_events_eventType_timestamp_idx" ON "ride_events"("eventType", "timestamp");

-- CreateIndex
CREATE INDEX "api_logs_endpoint_timestamp_idx" ON "api_logs"("endpoint", "timestamp");

-- CreateIndex
CREATE INDEX "api_logs_statusCode_timestamp_idx" ON "api_logs"("statusCode", "timestamp");

-- AddForeignKey
ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "rides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earnings" ADD CONSTRAINT "earnings_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;
