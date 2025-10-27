# ride-hailing-platform

## 1. System Architecture Overview
```
┌─────────────────────────────────────────────────────────────┐
│                        React Frontend                        │
│  (Rider App, Driver App, Real-time Updates via WebSocket)  │
└──────────────────┬──────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────┐
│                     API Gateway / Load Balancer              │
│                    (NGINX or AWS ALB)                        │
└──────────────────┬──────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────┐
│                   Node.js Backend Services                   │
│  ┌──────────────┬──────────────┬─────────────┬────────────┐│
│  │ Ride Service │ Driver Svc   │ Payment Svc │ Notif. Svc ││
│  └──────────────┴──────────────┴─────────────┴────────────┘│
└───┬────────────┬─────────────┬──────────────┬──────────────┘
    │            │             │              │
┌───▼────┐  ┌───▼─────┐  ┌───▼────┐    ┌───▼─────┐
│PostgreSQL│  │  Redis  │  │ Message│    │New Relic│
│(Primary) │  │ (Cache/ │  │ Queue  │    │Monitoring│
│          │  │  Geospatial)│(Optional)│   │         │
└──────────┘  └─────────┘  └────────┘    └─────────┘
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

**PostgreSQL (Primary Database) + PostGis + Prisma ORM**
```
Tables:
- riders (id, name, phone, email, payment_methods)
- drivers (id, name, phone, vehicle_info, status, current_location)
- rides (id, rider_id, pickup_location, dropoff_location, status, tier, created_at)
- trips (id, ride_id, driver_id, start_time, end_time, fare, distance)
- payments (id, trip_id, amount, status, psp_transaction_id, idempotency_key)
- driver_locations (driver_id, lat, lng, timestamp) - partitioned by timestamp
```

**Redis (Caching & Geospatial)**
```
Use Cases:
- Geospatial indexing: GEOADD drivers:available {lng} {lat} {driver_id}
- Active rides cache: rides:{ride_id}
- Driver availability: drivers:available:{driver_id}
- Rate limiting & idempotency keys
- Session management
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
