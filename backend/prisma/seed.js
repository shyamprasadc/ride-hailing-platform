const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // Clean existing data (optional - comment out in production)
  await prisma.$executeRaw`TRUNCATE TABLE "riders", "drivers", "rides", "trips", "payments", "payment_methods", "driver_locations", "notifications", "pricing_configs" CASCADE`;

  // ==================== SEED RIDERS ====================
  console.log('Creating riders...');

  const rider1 = await prisma.rider.create({
    data: {
      name: 'John Doe',
      phone: '+919876543210',
      email: 'john.doe@example.com',
      rating: 4.8,
      totalRides: 25,
    },
  });

  const rider2 = await prisma.rider.create({
    data: {
      name: 'Jane Smith',
      phone: '+919876543211',
      email: 'jane.smith@example.com',
      rating: 4.9,
      totalRides: 42,
    },
  });

  const rider3 = await prisma.rider.create({
    data: {
      name: 'Alice Johnson',
      phone: '+919876543212',
      email: 'alice.j@example.com',
      rating: 5.0,
      totalRides: 10,
    },
  });

  console.log(`Created ${3} riders`);

  // ==================== SEED PAYMENT METHODS ====================
  console.log('Creating payment methods...');

  await prisma.paymentMethod.create({
    data: {
      riderId: rider1.id,
      type: 'CARD',
      isDefault: true,
      cardToken: 'tok_visa_4242',
      cardLast4: '4242',
      cardBrand: 'Visa',
      cardExpiry: '12/25',
    },
  });

  await prisma.paymentMethod.create({
    data: {
      riderId: rider1.id,
      type: 'UPI',
      isDefault: false,
      upiId: 'john@paytm',
    },
  });

  await prisma.paymentMethod.create({
    data: {
      riderId: rider2.id,
      type: 'CARD',
      isDefault: true,
      cardToken: 'tok_mastercard_5555',
      cardLast4: '5555',
      cardBrand: 'Mastercard',
      cardExpiry: '06/26',
    },
  });

  console.log(`Created payment methods`);

  // ==================== SEED DRIVERS ====================
  console.log('Creating drivers...');

  const drivers = [];

  // Mumbai drivers (near Bandra)
  const mumbaiDrivers = [
    { name: 'Raj Kumar', lat: 19.0596, lng: 72.8295, vehicle: 'SEDAN' },
    { name: 'Amit Sharma', lat: 19.0656, lng: 72.8326, vehicle: 'SUV' },
    { name: 'Vikram Singh', lat: 19.0526, lng: 72.8456, vehicle: 'HATCHBACK' },
    { name: 'Sanjay Yadav', lat: 19.07, lng: 72.82, vehicle: 'SEDAN' },
    { name: 'Rahul Mehta', lat: 19.055, lng: 72.83, vehicle: 'LUXURY' },
  ];

  for (let i = 0; i < mumbaiDrivers.length; i++) {
    const d = mumbaiDrivers[i];
    const driver = await prisma.driver.create({
      data: {
        name: d.name,
        phone: `+9198765432${20 + i}`,
        email: `${d.name.toLowerCase().replace(' ', '.')}@driver.com`,
        licenseNumber: `DL-${1000 + i}`,
        vehicleType: d.vehicle,
        vehicleNumber: `MH02AB${1000 + i}`,
        vehicleModel:
          d.vehicle === 'SEDAN'
            ? 'Honda City'
            : d.vehicle === 'SUV'
            ? 'Toyota Innova'
            : 'Maruti Swift',
        vehicleColor: i % 2 === 0 ? 'White' : 'Black',
        status: 'AVAILABLE',
        rating: 4.5 + Math.random() * 0.5,
        totalTrips: Math.floor(Math.random() * 500) + 100,
        acceptanceRate: 85 + Math.random() * 10,
        currentLat: d.lat,
        currentLng: d.lng,
        lastLocationUpdate: new Date(),
        isVerified: true,
        verifiedAt: new Date(),
      },
    });
    drivers.push(driver);

    // Add location history
    await prisma.driverLocation.create({
      data: {
        driverId: driver.id,
        latitude: d.lat,
        longitude: d.lng,
        heading: Math.random() * 360,
        speed: Math.random() * 60,
        accuracy: 5 + Math.random() * 10,
      },
    });
  }

  console.log(`Created ${drivers.length} drivers with location history`);

  // ==================== SEED PRICING CONFIGS ====================
  console.log('Creating pricing configs...');

  const rideTypes = ['ECONOMY', 'STANDARD', 'PREMIUM', 'XL', 'LUXURY'];
  const pricingData = {
    ECONOMY: { base: 30, perKm: 8, perMin: 1.5, min: 50 },
    STANDARD: { base: 50, perKm: 12, perMin: 2, min: 80 },
    PREMIUM: { base: 80, perKm: 18, perMin: 3, min: 120 },
    XL: { base: 100, perKm: 20, perMin: 3.5, min: 150 },
    LUXURY: { base: 150, perKm: 30, perMin: 5, min: 200 },
  };

  for (const type of rideTypes) {
    const pricing = pricingData[type];
    await prisma.pricingConfig.create({
      data: {
        region: 'Mumbai',
        rideType: type,
        baseFare: pricing.base,
        perKmRate: pricing.perKm,
        perMinRate: pricing.perMin,
        minimumFare: pricing.min,
        surgeEnabled: true,
        maxSurge: 3.0,
        maxDistance: 100,
        isActive: true,
      },
    });
  }

  console.log(`Created ${rideTypes.length} pricing configs for Mumbai`);

  // ==================== SEED SAMPLE RIDES ====================
  console.log('Creating sample rides...');

  // Completed ride
  const completedRide = await prisma.ride.create({
    data: {
      riderId: rider1.id,
      driverId: drivers[0].id,
      pickupLat: 19.0596,
      pickupLng: 72.8295,
      pickupAddress: 'Bandra West, Mumbai',
      dropoffLat: 19.076,
      dropoffLng: 72.8777,
      dropoffAddress: 'Andheri East, Mumbai',
      rideType: 'STANDARD',
      status: 'COMPLETED',
      estimatedFare: 180,
      estimatedDistance: 8.5,
      estimatedDuration: 1200,
      surgeMultiplier: 1.2,
      matchedAt: new Date(Date.now() - 3600000), // 1 hour ago
    },
  });

  await prisma.trip.create({
    data: {
      rideId: completedRide.id,
      driverId: drivers[0].id,
      startTime: new Date(Date.now() - 3600000),
      endTime: new Date(Date.now() - 2400000),
      duration: 1200,
      actualDistance: 8.7,
      baseFare: 50,
      perKmRate: 12,
      perMinRate: 2,
      distanceFare: 104.4,
      timeFare: 40,
      surgeAmount: 38.88,
      totalFare: 233.28,
      discount: 0,
      finalFare: 233.28,
      platformFee: 46.66,
      driverEarnings: 186.62,
      status: 'COMPLETED',
      startOtp: '1234',
    },
  });

  // Active ride (searching)
  await prisma.ride.create({
    data: {
      riderId: rider2.id,
      pickupLat: 19.07,
      pickupLng: 72.82,
      pickupAddress: 'Linking Road, Bandra',
      dropoffLat: 19.1136,
      dropoffLng: 72.9083,
      dropoffAddress: 'Powai, Mumbai',
      rideType: 'PREMIUM',
      status: 'SEARCHING',
      estimatedFare: 320,
      estimatedDistance: 12.5,
      estimatedDuration: 1800,
      surgeMultiplier: 1.5,
      searchRadius: 5.0,
      searchAttempts: 2,
    },
  });

  console.log(`Created sample rides`);

  // ==================== SEED SURGE ZONES ====================
  console.log('Creating surge zones...');

  await prisma.surgeZone.create({
    data: {
      name: 'Bandra High Demand Zone',
      region: 'Mumbai',
      boundaries: [
        { lat: 19.05, lng: 72.82 },
        { lat: 19.05, lng: 72.84 },
        { lat: 19.07, lng: 72.84 },
        { lat: 19.07, lng: 72.82 },
      ],
      currentSurge: 1.5,
      activeRides: 25,
      availableDrivers: 8,
      isActive: true,
    },
  });

  console.log(`Created surge zones`);

  console.log('🎉 Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(' Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

// ==================== HELPER FUNCTIONS FOR YOUR APP ====================

// Add these to your services

// Example: Find nearby available drivers
async function findNearbyDrivers(lat, lng, radiusKm = 5, vehicleType = null) {
  // Using Haversine formula approximation
  const latDelta = radiusKm / 111.32; // 1 degree lat ≈ 111.32 km
  const lngDelta = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));

  const whereClause = {
    status: 'AVAILABLE',
    currentLat: {
      gte: lat - latDelta,
      lte: lat + latDelta,
    },
    currentLng: {
      gte: lng - lngDelta,
      lte: lng + lngDelta,
    },
    isVerified: true,
  };

  if (vehicleType) {
    whereClause.vehicleType = vehicleType;
  }

  return await prisma.driver.findMany({
    where: whereClause,
    orderBy: {
      rating: 'desc',
    },
    take: 10,
  });
}

// Example: Create ride with transaction
async function createRideWithTransaction(rideData) {
  return await prisma.$transaction(async (tx) => {
    // Create ride
    const ride = await tx.ride.create({
      data: rideData,
    });

    // Log event
    await tx.rideEvent.create({
      data: {
        rideId: ride.id,
        eventType: 'ride_created',
        eventData: { pickupLat: rideData.pickupLat, pickupLng: rideData.pickupLng },
      },
    });

    return ride;
  });
}

// Example: Update driver location with recent history
async function updateDriverLocation(driverId, locationData) {
  return await prisma.$transaction(async (tx) => {
    // Update driver's current location
    await tx.driver.update({
      where: { id: driverId },
      data: {
        currentLat: locationData.latitude,
        currentLng: locationData.longitude,
        lastLocationUpdate: new Date(),
      },
    });

    // Add to location history
    await tx.driverLocation.create({
      data: {
        driverId,
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        heading: locationData.heading,
        speed: locationData.speed,
        accuracy: locationData.accuracy,
      },
    });
  });
}

// Example: Match ride with driver
async function matchRideWithDriver(rideId, driverId) {
  return await prisma.$transaction(async (tx) => {
    // Lock the ride
    const ride = await tx.ride.findFirst({
      where: { id: rideId, status: 'SEARCHING' },
    });

    if (!ride) {
      throw new Error('Ride not available for matching');
    }

    // Check driver availability
    const driver = await tx.driver.findFirst({
      where: { id: driverId, status: 'AVAILABLE' },
    });

    if (!driver) {
      throw new Error('Driver not available');
    }

    // Update ride
    await tx.ride.update({
      where: { id: rideId },
      data: {
        driverId,
        status: 'MATCHED',
        matchedAt: new Date(),
      },
    });

    // Update driver status
    await tx.driver.update({
      where: { id: driverId },
      data: {
        status: 'ON_RIDE',
      },
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

    // Log event
    await tx.rideEvent.create({
      data: {
        rideId: ride.id,
        eventType: 'driver_matched',
        eventData: { driverId, driverName: driver.name },
      },
    });

    return { ride, driver };
  });
}

// Example: Complete trip and calculate fare
async function completeTripWithFare(tripId, endLocationData) {
  return await prisma.$transaction(async (tx) => {
    const trip = await tx.trip.findUnique({
      where: { id: tripId },
      include: { ride: true, driver: true },
    });

    if (!trip || trip.status !== 'STARTED') {
      throw new Error('Trip not in progress');
    }

    const endTime = new Date();
    const duration = Math.floor((endTime - trip.startTime) / 1000); // seconds

    // Calculate fare
    const distanceFare = trip.actualDistance * trip.perKmRate;
    const timeFare = (duration / 60) * trip.perMinRate;
    const surgeAmount = (trip.baseFare + distanceFare + timeFare) * (trip.ride.surgeMultiplier - 1);
    const totalFare = trip.baseFare + distanceFare + timeFare + surgeAmount;
    const finalFare = totalFare - trip.discount;
    const platformFee = finalFare * 0.2; // 20% commission
    const driverEarnings = finalFare - platformFee;

    // Update trip
    const updatedTrip = await tx.trip.update({
      where: { id: tripId },
      data: {
        endTime,
        duration,
        distanceFare,
        timeFare,
        surgeAmount,
        totalFare,
        finalFare,
        platformFee,
        driverEarnings,
        status: 'COMPLETED',
      },
    });

    // Update ride status
    await tx.ride.update({
      where: { id: trip.rideId },
      data: { status: 'COMPLETED' },
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
        amount: driverEarnings,
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
          baseFare: trip.baseFare,
          distanceFare,
          timeFare,
          surgeAmount,
          discount: trip.discount,
          total: finalFare,
        },
        taxAmount: finalFare * 0.18, // 18% GST
      },
    });

    // Create notifications
    await tx.notification.create({
      data: {
        riderId: trip.ride.riderId,
        type: 'TRIP_COMPLETED',
        title: 'Trip Completed',
        message: `Your fare is ₹${finalFare.toFixed(2)}`,
        rideId: trip.rideId,
      },
    });

    // Log event
    await tx.rideEvent.create({
      data: {
        rideId: trip.rideId,
        eventType: 'trip_completed',
        eventData: { finalFare, duration, distance: trip.actualDistance },
      },
    });

    return updatedTrip;
  });
}

// Example: Process payment with idempotency
async function processPayment(tripId, paymentMethodId, idempotencyKey) {
  // Check for existing payment with idempotency key
  const existingPayment = await prisma.payment.findUnique({
    where: { idempotencyKey },
  });

  if (existingPayment) {
    return existingPayment; // Return existing payment (idempotent)
  }

  return await prisma.$transaction(async (tx) => {
    const trip = await tx.trip.findUnique({
      where: { id: tripId },
      include: { ride: true },
    });

    if (!trip) {
      throw new Error('Trip not found');
    }

    // Create payment record
    const payment = await tx.payment.create({
      data: {
        tripId,
        paymentMethodId,
        amount: trip.finalFare,
        currency: 'INR',
        status: 'PENDING',
        idempotencyKey,
        attempts: 1,
      },
    });

    // Here you would integrate with actual PSP (Stripe, Razorpay)
    // For now, simulate success
    const pspResponse = {
      transactionId: `txn_${Date.now()}`,
      status: 'success',
    };

    // Update payment with PSP response
    const updatedPayment = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'COMPLETED',
        pspTransactionId: pspResponse.transactionId,
        pspResponse,
        completedAt: new Date(),
      },
    });

    // Create notification
    await tx.notification.create({
      data: {
        riderId: trip.ride.riderId,
        type: 'PAYMENT_SUCCESS',
        title: 'Payment Successful',
        message: `₹${trip.finalFare.toFixed(2)} paid successfully`,
        rideId: trip.rideId,
      },
    });

    return updatedPayment;
  });
}

// Example: Get rider ride history with pagination
async function getRiderRideHistory(riderId, page = 1, limit = 10) {
  const skip = (page - 1) * limit;

  const [rides, total] = await Promise.all([
    prisma.ride.findMany({
      where: { riderId },
      include: {
        trip: {
          include: {
            driver: {
              select: {
                id: true,
                name: true,
                vehicleNumber: true,
                vehicleModel: true,
                rating: true,
              },
            },
            payment: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.ride.count({ where: { riderId } }),
  ]);

  return {
    rides,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// Example: Get driver earnings summary
async function getDriverEarningsSummary(driverId, startDate, endDate) {
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
    { total: 0, byType: {} }
  );

  const trips = await prisma.trip.count({
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
    ...summary,
    tripCount: trips,
    averagePerTrip: trips > 0 ? summary.byType.TRIP / trips : 0,
  };
}

// Example: Cancel ride with reason
async function cancelRide(rideId, cancelledBy, reason) {
  return await prisma.$transaction(async (tx) => {
    const ride = await tx.ride.findUnique({
      where: { id: rideId },
      include: { trip: true },
    });

    if (!ride) {
      throw new Error('Ride not found');
    }

    if (['COMPLETED', 'CANCELLED'].includes(ride.status)) {
      throw new Error('Ride cannot be cancelled');
    }

    // Update ride status
    await tx.ride.update({
      where: { id: rideId },
      data: { status: 'CANCELLED' },
    });

    // If trip exists, cancel it
    if (ride.trip) {
      await tx.trip.update({
        where: { id: ride.trip.id },
        data: { status: 'CANCELLED' },
      });
    }

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
          message: `Ride cancelled by ${cancelledBy}`,
          rideId: ride.id,
        },
      });
    }

    // Notify rider
    await tx.notification.create({
      data: {
        riderId: ride.riderId,
        type: 'RIDE_CANCELLED',
        title: 'Ride Cancelled',
        message: reason || 'Ride has been cancelled',
        rideId: ride.id,
      },
    });

    // Log event
    await tx.rideEvent.create({
      data: {
        rideId: ride.id,
        eventType: 'ride_cancelled',
        eventData: { cancelledBy, reason },
      },
    });

    return ride;
  });
}

// Example: Clean up old location data (run as cron job)
async function cleanupOldLocations(daysToKeep = 7) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  const result = await prisma.driverLocation.deleteMany({
    where: {
      timestamp: {
        lt: cutoffDate,
      },
    },
  });

  console.log(`Deleted ${result.count} old location records`);
  return result;
}

module.exports = {
  findNearbyDrivers,
  createRideWithTransaction,
  updateDriverLocation,
  matchRideWithDriver,
  completeTripWithFare,
  processPayment,
  getRiderRideHistory,
  getDriverEarningsSummary,
  cancelRide,
  cleanupOldLocations,
};
