# ride-hailing-platform

## 1. System Architecture Overview
### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     React Frontend Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  Rider App   │  │  Driver App  │  │  Admin Panel │         │
│  │  (Web/Mobile)│  │  (Mobile)    │  │  (Dashboard) │         │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │
└─────────┼──────────────────┼──────────────────┼─────────────────┘
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────────┐
│                   API Gateway / Load Balancer                     │
│              (NGINX with Rate Limiting & SSL)                     │
└────────────────────────────┬─────────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────────┐
│                  Node.js Backend Services Layer                   │
│  ┌─────────────┬──────────────┬──────────────┬─────────────┐   │
│  │ Ride Service│ Driver Service│Payment Service│Notification │   │
│  │             │               │              │   Service   │   │
│  │ - Create    │ - Location    │ - Process    │ - WebSocket │   │
│  │ - Match     │ - Status      │ - Refund     │ - Push      │   │
│  │ - Cancel    │ - Accept      │ - Receipt    │ - Email     │   │
│  └─────────────┴──────────────┴──────────────┴─────────────┘   │
└──────┬──────────────┬─────────────┬──────────────┬──────────────┘
       │              │             │              │
┌──────▼─────┐  ┌────▼──────┐  ┌───▼────┐   ┌───▼──────┐
│ PostgreSQL │  │   Redis   │  │ BullMQ │   │New Relic │
│  (Primary) │  │  (Cache/  │  │(Queues)│   │(Monitoring)│
│            │  │ Geospatial│  │        │   │          │
│ - ACID     │  │ - Sub-ms  │  │- Async │   │- APM     │
│ - PostGIS  │  │ - Pub/Sub │  │- Jobs  │   │- Metrics │
└────────────┘  └───────────┘  └────────┘   └──────────┘
```

### Service Architecture (Microservices Pattern)

```
┌─────────────────────────────────────────────────────┐
│                  Ride Service                        │
│  • Create ride requests                             │
│  • Driver matching (with retry logic)               │
│  • Ride lifecycle management                        │
│  • Fare estimation                                  │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                 Driver Service                       │
│  • Real-time location updates (batch processing)    │
│  • Availability management                          │
│  • Ride acceptance/rejection                        │
│  • Earnings tracking                                │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                  Trip Service                        │
│  • Trip start/end with OTP verification             │
│  • Real-time fare calculation                       │
│  • Route tracking                                   │
│  • Receipt generation                               │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                Payment Service                       │
│  • Idempotent payment processing                    │
│  • PSP integration (Stripe/Razorpay)               │
│  • Refund management                                │
│  • Transaction history                              │
└─────────────────────────────────────────────────────┘
```

## 2. Core Components & Tech Stack

### Backend Services (Node.js)

**A. Ride Service**
- Handle ride requests, matching, trip lifecycle
- Endpoints: POST /v1/rides, GET /v1/rides/{id}, POST /v1/trips/{id}/end

**B. Driver Service**
- Location updates, availability, ride acceptance
- Endpoints: POST /v1/drivers/{id}/location, POST /v1/drivers/{id}/accept
- Real-time location tracking

**C. Payment Service**
- Integration with PSP (Stripe/Razorpay)
- Endpoint: POST /v1/payments
- Handle fare calculation

**D. Notification Service**
- WebSocket server for real-time updates
- Push notifications for ride events

### Database Layer

**PostgreSQL (Primary Database) + PostGIS + Prisma ORM**
```
Tables:
- riders (id, name, phone, email, rating, total_rides)
- drivers (id, name, phone, vehicle_info, status, current_location, rating)
- rides (id, rider_id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, status, ride_type, surge_multiplier)
- trips (id, ride_id, driver_id, start_time, end_time, fare, distance, driver_earnings)
- payments (id, trip_id, amount, status, psp_transaction_id, idempotency_key)
- payment_methods (id, rider_id, type, card_token, upi_id, is_default)
- driver_locations (driver_id, lat, lng, timestamp, heading, speed) - partitioned by timestamp
- notifications (id, rider_id, driver_id, type, message, is_read)
- ride_events (id, ride_id, event_type, event_data, timestamp)
- pricing_configs (id, region, ride_type, base_fare, per_km_rate, per_min_rate)
- surge_zones (id, region, boundaries, current_surge, active_rides, available_drivers)

Indexes (for performance):
- rides(status, created_at DESC) - Active rides dashboard
- rides(rider_id, created_at DESC) - Rider history
- drivers(status, current_lat, current_lng) - Nearby driver search
- driver_locations(driver_id, timestamp DESC) - Recent locations
- payments(idempotency_key) - Prevent duplicate payments
```

**Redis (Caching & Geospatial)**
```
Use Cases:
- Geospatial indexing: 
  * Key: "drivers:available"
  * Command: GEOADD drivers:available {lng} {lat} {driver_id}
  * Query: GEORADIUS drivers:available {lng} {lat} 5 km WITHDIST ASC

- Ride caching:
  * Key: "ride:{ride_id}"
  * TTL: 300-3600 seconds
  * Invalidate on status change

- Driver metadata:
  * Key: "driver:{driver_id}:meta"
  * Fields: {lat, lng, status, lastUpdate, rating}
  * TTL: 300 seconds

- Idempotency:
  * Key: "payment:{idempotency_key}"
  * TTL: 3600 seconds
  * Prevents duplicate payments

- Rate limiting:
  * Key: "ratelimit:{identifier}"
  * Algorithm: Sliding window with sorted sets
  * Limit: 100 requests per 60 seconds

- Distributed locks:
  * Key: "lock:{resource_id}"
  * TTL: 10 seconds
  * Prevents race conditions in ride matching

- Pub/Sub channels:
  * Channel: "ride:{ride_id}" - Ride status updates
  * Channel: "location:{driver_id}" - Driver location updates
```

## 3. Key Workflows

### Workflow 1: Ride Request & Matching
```
1. Rider creates ride request
   ↓
2. Store in PostgreSQL + Cache in Redis
   ↓
3. Query nearby drivers using Redis GEORADIUS
   (within 5km, available status)
   ↓
4. Calculate driver scores (distance, rating, acceptance rate)
   ↓
5. Send ride offer to top drivers (sequential or parallel)
   ↓
6. First driver to accept gets the ride
   ↓
7. Update ride status + notify rider via WebSocket
   ↓
8. Remove driver from available pool
```

**Optimization for <1s p95 latency:**
- Keep available drivers in Redis with geospatial index
- Use database indexes on status, location
- Implement connection pooling
- Cache driver profiles

### Workflow 2: Location Updates
```
1. Driver app sends location every 1-2 seconds
   ↓
2. API validates and updates Redis GEOADD
   (Don't write every update to PostgreSQL)
   ↓
3. Batch write to PostgreSQL every 10-30 seconds
   (Background job for persistence)
   ↓
4. If driver is on active trip:
   → Broadcast location to rider via WebSocket
```

**Optimization:**
- Write to Redis immediately (in-memory, fast)
- Async batch writes to PostgreSQL
- Use Redis pub/sub for real-time rider updates

### Workflow 3: Trip Lifecycle
```
START:
Driver → POST /v1/trips/{id}/start
  - Update trip.start_time
  - Update ride.status = 'in_progress'
  - Notify rider

DURING TRIP:
  - Continuous location updates
  - Calculate estimated fare dynamically

END:
Driver → POST /v1/trips/{id}/end
  - Update trip.end_time
  - Calculate final fare (distance × rate + surge)
  - Trigger payment flow
  - Update driver availability
  - Send receipt notification
```

### New Relic Custom Metrics Integration

This module sends custom application metrics (latency, error counts, success counts) to **New Relic** using the `@newrelic/telemetry-sdk`.
It also includes a **Performance Observer** that automatically measures function or code block execution time using Node.js `perf_hooks`, and sends the latency data to New Relic.

#### Usage

```ts
import PerformanceMetric from '../core/PerformanceMetric';
import { performance } from 'perf_hooks';

// Example: Measure surge lookup latency
const getSurgeMultiplier = async (lat: number, lng: number): Promise<number> => {
  const perfId = performance.now().toString();

  PerformanceMetric.startPerf('surge_lookup', perfId);

  const surgeZone = await prisma.surgeZone.findFirst({ where: { isActive: true } });

  PerformanceMetric.endPerf('surge_lookup', perfId);
};
```

#### Internal Details

* Metrics are sent through `pushCustomMetric()` using a single `MetricClient` instance.
* Each metric includes standard context:

  * `service.name`, `service.version`, `environment`, `region`, `host.name`, `client.id`, `timestamp`
* Performance timing uses `performance.mark` and `performance.measure`.
* The observer converts `PerformanceEntry` events into latency metrics and pushes them automatically.
* Errors are safely logged without breaking execution flow.

### Steps to Run

#### Require Node.js V14+

```
create .env file on root of the folder with environment variable keys from .env.sample file
npm install

Start Development
npm run watch

Start Production
npm run start

```
