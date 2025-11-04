import Logger from '../core/Logger';
import { redis } from '../config';
import Redis from 'ioredis';

interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  retryStrategy?: (times: number) => number;
  maxRetriesPerRequest: number;
  enableReadyCheck: boolean;
  lazyConnect: boolean;
}

interface DriverMetadata {
  lat: number;
  lng: number;
  status: string;
  lastUpdate: number;
  vehicleType?: string;
  rating?: number;
  [key: string]: any;
}

interface NearbyDriver {
  driverId: string;
  distance: number;
  lat?: string;
  lng?: string;
  status?: string;
  lastUpdate?: string;
  vehicleType?: string;
  rating?: string;
}

interface Location {
  lat: number;
  lng: number;
}

interface RateLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
  resetIn: number;
}

interface LocationUpdate {
  driverId: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  accuracy?: number;
}

interface CacheOptions {
  expirySeconds?: number;
}

// ==================== REDIS CLIENT CONFIGURATION ====================

const redisConfig: RedisConfig = {
  host: redis.host,
  port: parseInt(redis.port, 10),
  password: redis.password,
  db: parseInt(redis.db, 10),
  retryStrategy: (times: number): number => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
};

// Create Redis clients
const redisClient = new Redis(redisConfig);
const redisSubscriber = new Redis(redisConfig);
const redisPublisher = new Redis(redisConfig);

// Connection event handlers
redisClient.on('connect', () => {
  Logger.info('Redis client connected');
});

redisClient.on('error', (err: Error) => {
  Logger.error('Redis client error:', err);
});

redisClient.on('ready', () => {
  Logger.info('Redis client ready');
});

// ==================== GEOSPATIAL OPERATIONS ====================

/**
 * Add driver to available drivers geospatial index
 */
export async function addAvailableDriver(
  driverId: string,
  lat: number,
  lng: number,
  metadata: Partial<DriverMetadata> = {}
): Promise<boolean> {
  const key = 'drivers:available';

  // Add to geospatial index
  await redisClient.geoadd(key, lng, lat, driverId);

  // Store driver metadata
  const metadataKey = `driver:${driverId}:meta`;
  const metadataToStore: DriverMetadata = {
    lat,
    lng,
    status: 'AVAILABLE',
    lastUpdate: Date.now(),
    ...metadata,
  };

  await redisClient.hmset(metadataKey, metadataToStore as any);

  // Set expiry for metadata (5 minutes)
  await redisClient.expire(metadataKey, 300);

  return true;
}

/**
 * Remove driver from available drivers
 */
export async function removeAvailableDriver(driverId: string): Promise<boolean> {
  const key = 'drivers:available';

  await redisClient.zrem(key, driverId);
  await redisClient.del(`driver:${driverId}:meta`);
  return true;
}

/**
 * Find nearby available drivers
 */
export async function findNearbyDrivers(
  lat: number,
  lng: number,
  radiusKm: number = 5,
  count: number = 10
): Promise<NearbyDriver[]> {
  const key = 'drivers:available';

  // GEORADIUS returns drivers within radius
  const result = await redisClient.georadius(
    key,
    lng,
    lat,
    radiusKm,
    'km',
    'WITHDIST',
    'ASC',
    'COUNT',
    count
  );

  // Format result and fetch metadata
  const drivers = await Promise.all(
    result.map(async ([driverId, distance]: [string, string]) => {
      const metadata = await redisClient.hgetall(`driver:${driverId}:meta`);
      return {
        driverId,
        distance: parseFloat(distance),
        ...metadata,
      };
    })
  );

  return drivers;
}

/**
 * Update driver location (for tracking during ride)
 */
export async function updateDriverLocation(
  driverId: string,
  lat: number,
  lng: number
): Promise<boolean> {
  const key = 'drivers:available';

  // Update in geo index
  await redisClient.geoadd(key, lng, lat, driverId);

  // Update metadata
  const metadataKey = `driver:${driverId}:meta`;
  await redisClient.hmset(metadataKey, {
    lat: lat.toString(),
    lng: lng.toString(),
    lastUpdate: Date.now().toString(),
  });

  return true;
}

/**
 * Get driver location
 */
export async function getDriverLocation(driverId: string): Promise<Location | null> {
  const key = 'drivers:available';

  const result = await redisClient.geopos(key, driverId);
  if (!result || !result[0]) return null;

  const [lng, lat] = result[0];
  return {
    lat: parseFloat(lat!),
    lng: parseFloat(lng!),
  };
}

// ==================== CACHING OPERATIONS ====================

/**
 * Generic cache get with JSON parsing
 */
export async function cacheGet<T = any>(key: string): Promise<T | null> {
  const value = await redisClient.get(key);
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return value as T;
  }
}

/**
 * Generic cache set with JSON stringification
 */
export async function cacheSet<T = any>(
  key: string,
  value: T,
  expirySeconds: number = 300
): Promise<boolean> {
  const stringValue = typeof value === 'string' ? value : JSON.stringify(value);

  if (expirySeconds) {
    await redisClient.setex(key, expirySeconds, stringValue);
  } else {
    await redisClient.set(key, stringValue);
  }

  return true;
}

/**
 * Delete cache key
 */
export async function cacheDel(key: string): Promise<boolean> {
  await redisClient.del(key);
  return true;
}

/**
 * Delete multiple cache keys by pattern
 */
export async function cacheDelPattern(pattern: string): Promise<number> {
  const keys = await redisClient.keys(pattern);
  if (keys.length > 0) {
    await redisClient.del(...keys);
  }
  return keys.length;
}

/**
 * Cache ride details
 */
export async function cacheRide(
  rideId: string,
  rideData: any,
  expirySeconds: number = 3600
): Promise<boolean> {
  const key = `ride:${rideId}`;
  return await cacheSet(key, rideData, expirySeconds);
}

/**
 * Get cached ride
 */
export async function getCachedRide<T = any>(rideId: string): Promise<T | null> {
  const key = `ride:${rideId}`;
  return await cacheGet<T>(key);
}

/**
 * Invalidate ride cache
 */
export async function invalidateRideCache(rideId: string): Promise<boolean> {
  const key = `ride:${rideId}`;
  return await cacheDel(key);
}

/**
 * Cache driver profile
 */
export async function cacheDriverProfile(
  driverId: string,
  driverData: any,
  expirySeconds: number = 600
): Promise<boolean> {
  const key = `driver:${driverId}:profile`;
  return await cacheSet(key, driverData, expirySeconds);
}

/**
 * Get cached driver profile
 */
export async function getCachedDriverProfile<T = any>(driverId: string): Promise<T | null> {
  const key = `driver:${driverId}:profile`;
  return await cacheGet<T>(key);
}

// ==================== IDEMPOTENCY ====================

/**
 * Check and set idempotency key
 */
export async function checkIdempotency(
  key: string,
  expirySeconds: number = 3600
): Promise<boolean> {
  const result = await redisClient.set(key, '1', 'EX', expirySeconds, 'NX');
  return result === 'OK'; // Returns true if key was set (first request)
}

/**
 * Store idempotent response
 */
export async function storeIdempotentResponse<T = any>(
  key: string,
  response: T,
  expirySeconds: number = 3600
): Promise<boolean> {
  const responseKey = `${key}:response`;
  return await cacheSet(responseKey, response, expirySeconds);
}

/**
 * Get idempotent response
 */
export async function getIdempotentResponse<T = any>(key: string): Promise<T | null> {
  const responseKey = `${key}:response`;
  return await cacheGet<T>(responseKey);
}

// ==================== RATE LIMITING ====================

/**
 * Rate limit check using sliding window
 */
export async function checkRateLimit(
  identifier: string,
  limit: number = 100,
  windowSeconds: number = 60
): Promise<RateLimitResult> {
  const key = `ratelimit:${identifier}`;
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;

  const pipeline = redisClient.pipeline();

  // Remove old entries
  pipeline.zremrangebyscore(key, '-inf', windowStart);

  // Count requests in current window
  pipeline.zcard(key);

  // Add current request
  pipeline.zadd(key, now, `${now}-${Math.random()}`);

  // Set expiry
  pipeline.expire(key, windowSeconds);

  const results = await pipeline.exec();
  const count = results![1][1] as number;

  return {
    allowed: count < limit,
    current: count + 1,
    limit,
    resetIn: windowSeconds,
  };
}

// ==================== PUB/SUB FOR REAL-TIME UPDATES ====================

/**
 * Publish location update
 */
export async function publishLocationUpdate(
  driverId: string,
  locationData: LocationUpdate
): Promise<boolean> {
  const channel = `location:${driverId}`;
  await redisPublisher.publish(channel, JSON.stringify(locationData));
  return true;
}

/**
 * Subscribe to location updates
 */
export function subscribeToLocationUpdates(
  driverId: string,
  callback: (data: LocationUpdate) => void
): () => void {
  const channel = `location:${driverId}`;

  redisSubscriber.subscribe(channel, (err) => {
    if (err) {
      Logger.error('Error subscribing to location updates:', err);
    }
  });

  const messageHandler = (ch: string, message: string) => {
    if (ch === channel) {
      try {
        const data: LocationUpdate = JSON.parse(message);
        callback(data);
      } catch (error) {
        Logger.error('Error parsing location update:', error);
      }
    }
  };

  redisSubscriber.on('message', messageHandler);

  return () => {
    redisSubscriber.off('message', messageHandler);
    redisSubscriber.unsubscribe(channel);
  };
}

/**
 * Publish ride status update
 */
export async function publishRideUpdate(rideId: string, updateData: any): Promise<boolean> {
  const channel = `ride:${rideId}`;
  await redisPublisher.publish(channel, JSON.stringify(updateData));
  return true;
}

/**
 * Subscribe to ride updates
 */
export function subscribeToRideUpdates(rideId: string, callback: (data: any) => void): () => void {
  const channel = `ride:${rideId}`;

  redisSubscriber.subscribe(channel, (err) => {
    if (err) {
      Logger.error('Error subscribing to ride updates:', err);
    }
  });

  const messageHandler = (ch: string, message: string) => {
    if (ch === channel) {
      try {
        const data = JSON.parse(message);
        callback(data);
      } catch (error) {
        Logger.error('Error parsing ride update:', error);
      }
    }
  };

  redisSubscriber.on('message', messageHandler);

  return () => {
    redisSubscriber.off('message', messageHandler);
    redisSubscriber.unsubscribe(channel);
  };
}

// ==================== DISTRIBUTED LOCKS ====================

/**
 * Acquire distributed lock
 */
export async function acquireLock(
  lockKey: string,
  ttlSeconds: number = 10
): Promise<string | null> {
  const lockValue = `${Date.now()}-${Math.random()}`;
  const key = `lock:${lockKey}`;

  const result = await redisClient.set(key, lockValue, 'EX', ttlSeconds, 'NX');

  if (result === 'OK') {
    return lockValue; // Return lock value for release verification
  }
  return null;
}

/**
 * Release distributed lock
 */
export async function releaseLock(lockKey: string, lockValue: string): Promise<boolean> {
  const key = `lock:${lockKey}`;

  // Lua script to ensure we only delete if the lock value matches
  const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

  const result = await redisClient.eval(script, 1, key, lockValue);
  return result === 1;
}

/**
 * Execute with lock (wrapper function)
 */
export async function withLock<T>(
  lockKey: string,
  ttlSeconds: number,
  callback: () => Promise<T>
): Promise<T> {
  const lockValue = await acquireLock(lockKey, ttlSeconds);

  if (!lockValue) {
    throw new Error('Could not acquire lock');
  }

  try {
    return await callback();
  } finally {
    await releaseLock(lockKey, lockValue);
  }
}

// ==================== BATCH OPERATIONS ====================

const locationUpdateQueue: LocationUpdate[] = [];
let batchTimeout: NodeJS.Timeout | null = null;

/**
 * Queue location update for batch processing
 */
export async function queueLocationUpdate(
  driverId: string,
  lat: number,
  lng: number,
  heading?: number,
  speed?: number,
  accuracy?: number
): Promise<void> {
  locationUpdateQueue.push({ driverId, lat, lng, heading, speed, accuracy });

  const batchSize = parseInt(process.env.LOCATION_BATCH_SIZE || '100', 10);
  const batchInterval = parseInt(process.env.LOCATION_BATCH_INTERVAL_MS || '10000', 10);

  // Process batch if size threshold reached
  if (locationUpdateQueue.length >= batchSize) {
    await processLocationBatch();
  } else if (!batchTimeout) {
    // Or process after timeout
    batchTimeout = setTimeout(processLocationBatch, batchInterval);
  }
}

/**
 * Process batched location updates
 */
export async function processLocationBatch(): Promise<void> {
  if (locationUpdateQueue.length === 0) return;

  const batch = locationUpdateQueue.splice(0);
  if (batchTimeout) {
    clearTimeout(batchTimeout);
    batchTimeout = null;
  }

  const pipeline = redisClient.pipeline();

  for (const { driverId, lat, lng } of batch) {
    pipeline.geoadd('drivers:available', lng, lat, driverId);
    pipeline.hmset(`driver:${driverId}:meta`, {
      lat: lat.toString(),
      lng: lng.toString(),
      lastUpdate: Date.now().toString(),
    });
  }

  await pipeline.exec();
  Logger.info(`Processed ${batch.length} location updates`);
}

// ==================== ANALYTICS & METRICS ====================

/**
 * Increment counter
 */
export async function incrementCounter(
  key: string,
  expirySeconds: number | null = null
): Promise<number | null> {
  const result = await redisClient.incr(key);

  if (expirySeconds && result === 1) {
    await redisClient.expire(key, expirySeconds);
  }

  return result;
}

/**
 * Get counter value
 */
export async function getCounter(key: string): Promise<number> {
  const value = await redisClient.get(key);
  return value ? parseInt(value, 10) : 0;
}

/**
 * Track active rides count
 */
export async function trackActiveRide(rideId: string, add: boolean = true): Promise<number> {
  const key = 'metrics:active_rides';

  if (add) {
    await redisClient.sadd(key, rideId);
  } else {
    await redisClient.srem(key, rideId);
  }

  return await redisClient.scard(key);
}

/**
 * Get active rides count
 */
export async function getActiveRidesCount(): Promise<number> {
  const key = 'metrics:active_rides';

  return await redisClient.scard(key);
}

/**
 * Track surge zone metrics
 */
export async function updateSurgeMetrics(
  zone: string,
  activeRides: number,
  availableDrivers: number
): Promise<number> {
  const key = `surge:${zone}`;

  const ratio = availableDrivers > 0 ? activeRides / availableDrivers : 0;
  let multiplier = 1.0;

  if (ratio > 3) multiplier = 2.5;
  else if (ratio > 2) multiplier = 2.0;
  else if (ratio > 1.5) multiplier = 1.5;
  else if (ratio > 1) multiplier = 1.2;

  await redisClient.hmset(key, {
    activeRides: activeRides.toString(),
    availableDrivers: availableDrivers.toString(),
    ratio: ratio.toFixed(2),
    multiplier: multiplier.toFixed(1),
    lastUpdate: Date.now().toString(),
  });

  await redisClient.expire(key, 300); // 5 minutes

  return multiplier;
}

/**
 * Get surge multiplier for zone
 */
export async function getSurgeMultiplier(zone: string): Promise<number> {
  const key = `surge:${zone}`;

  const data = await redisClient.hgetall(key);
  return data.multiplier ? parseFloat(data.multiplier) : 1.0;
}

// ==================== HEALTH CHECK ====================

/**
 * Check Redis health
 */
export async function healthCheck(): Promise<boolean> {
  const result = await redisClient.ping();
  return result === 'PONG';
}

/**
 * Get Redis info
 */
export async function getRedisInfo(): Promise<Record<string, string> | null> {
  const info = await redisClient.info();
  const lines = info.split('\r\n');
  const data: Record<string, string> = {};

  lines.forEach((line) => {
    if (line && !line.startsWith('#')) {
      const [key, value] = line.split(':');
      if (key && value) {
        data[key] = value;
      }
    }
  });

  return data;
}

// ==================== CLEANUP ====================

/**
 * Graceful shutdown
 */
export async function disconnect(): Promise<void> {
  await redisClient.quit();
  await redisSubscriber.quit();
  await redisPublisher.quit();
  Logger.info('Redis connections closed');
}

export { redisClient, redisSubscriber, redisPublisher };

export default {
  // Geospatial
  addAvailableDriver,
  removeAvailableDriver,
  findNearbyDrivers,
  updateDriverLocation,
  getDriverLocation,

  // Caching
  cacheGet,
  cacheSet,
  cacheDel,
  cacheDelPattern,
  cacheRide,
  getCachedRide,
  invalidateRideCache,
  cacheDriverProfile,
  getCachedDriverProfile,

  // Idempotency
  checkIdempotency,
  storeIdempotentResponse,
  getIdempotentResponse,

  // Rate Limiting
  checkRateLimit,

  // Pub/Sub
  publishLocationUpdate,
  subscribeToLocationUpdates,
  publishRideUpdate,
  subscribeToRideUpdates,

  // Distributed Locks
  acquireLock,
  releaseLock,
  withLock,

  // Batch Operations
  queueLocationUpdate,
  processLocationBatch,

  // Metrics
  incrementCounter,
  getCounter,
  trackActiveRide,
  getActiveRidesCount,
  updateSurgeMetrics,
  getSurgeMultiplier,

  // Health
  healthCheck,
  getRedisInfo,
  disconnect,
};
