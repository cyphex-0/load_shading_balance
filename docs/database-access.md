# Database Access Layer, Transactions, Seed Data, and Test Fixtures
## Load Shedding & Power Outage Management System

This document specifies the persistence architecture, transaction retry policies, query helpers, idempotent database seeding, and testing fixture builders for the backend.

---

## 1. Persistence Layer Architecture

The persistence layer is structured for dual-mode execution:
1. **Neon PostgreSQL via Prisma ORM (`apps/api/src/db/prisma.ts`):** Production and staging persistence utilizing connection pooling, relational constraints, and ACID transactions.
2. **In-Memory Store (`apps/api/src/db/store.ts`):** Zero-dependency testing store pre-seeded with the Dhaka power grid topology, allowing comprehensive integration tests to run with sub-second execution without external cloud dependencies.

### Single Prisma Client Lifecycle
To prevent connection exhaustion and memory leaks across serverless lambdas or hot-reloading development instances, `prisma.ts` maintains a global singleton instance (`global.__prisma`). Database connections are cleanly terminated during server shutdown via `disconnectDatabase()` triggered by `SIGTERM` / `SIGINT` signals.

---

## 2. Transaction Management & Concurrency Retry Policy

In high-concurrency power grid operations, competing transactions (e.g. concurrent customer outage reports on the same feeder line or simultaneous schedule slot activations) can cause PostgreSQL serialization conflicts or deadlocks.

The transaction manager (`apps/api/src/db/transactions.ts`) provides `withTransaction()` with automated transient conflict retries:

### 2.1 Transient Error Identification
The system intercepts and classifies the following error codes as transient conflicts:
* **Prisma `P2034`:** Transaction failed due to a write conflict or a deadlock.
* **PostgreSQL `40001`:** `serialization_failure` (cannot serialize access due to concurrent update).
* **PostgreSQL `40P01`:** `deadlock_detected` (two or more transactions blocked each other).

### 2.2 Retry Backoff Algorithm
* **Maximum Retry Bounds:** Bounded to **3 attempts**.
* **Exponential Backoff with Jitter:**
  $$t_{\text{wait}} = 2^{\text{attempt}} \times 50\text{ms} + \text{jitter}(0, 25\text{ms})$$
* **Non-Transient Fast-Fail:** Constraint violations (e.g., `P2002` Unique Constraint or `P2003` Foreign Key Violation) are non-transient and fail immediately without retrying.

```typescript
import { withTransaction } from '../db/prisma';

await withTransaction(async (tx) => {
  // Atomic updates across feeder and ticket records
  await tx.feeder.update({ where: { id: feederId }, data: { status: 'PLANNED_OUTAGE' } });
  await tx.outageTicket.create({ data: { ... } });
});
```

---

## 3. Query & Serialization Helpers

Domain helpers in `apps/api/src/db/helpers.ts` guarantee data integrity and security across all HTTP endpoints:

### 3.1 Soft-Delete Filtering (`whereNotDeleted`)
Prevents soft-deleted entities from leaking into queries:
```typescript
const activeZones = await prisma.zone.findMany({
  where: whereNotDeleted({ code: 'DHN' })
});
```

### 3.2 Safe User Serialization (`toSafeUser`)
Strips sensitive credentials (`passwordHash`, private reset tokens) from user objects before returning HTTP response envelopes:
```typescript
const safeUserData = toSafeUser(userRecord);
```

### 3.3 Active Meter Lookup (`findActiveMeterByNumber`)
Traverses the physical grid hierarchy from meter to upstream feeder, substation, and zone, supporting both live Prisma databases and the in-memory mock store:
```typescript
const meter = await findActiveMeterByNumber('MTR-DHN-101');
```

### 3.4 User Zone Scope (`getUserZoneScope`)
Calculates the operational geographic boundary for a user:
* `ADMIN` & `POWER_OPERATOR` $\implies$ Global scope (`isGlobal: true`).
* `ZONE_MANAGER` & `TECHNICIAN` $\implies$ Scoped to assigned zone (`zoneId: string`).
* `CUSTOMER` $\implies$ Scoped to linked meters.

---

## 4. Idempotent Database Seeding

The development seed script (`apps/api/prisma/seed.ts`) populates the database with the baseline Dhaka metropolitan grid and test accounts.

### 4.1 Seed Grid Topology
* **Zones:** Dhanmondi (`DHN`), Mirpur (`MIR`).
* **Substations:** Dhanmondi 33/11kV Substation 1 (`SUB-DHN-01`), Mirpur 33/11kV Substation 1 (`SUB-MIR-01`).
* **Feeders:**
  * Dhanmondi Road 27 Feeder (`FDR-DHN-27`, 12.5 MW, Ordinary).
  * **Ibn Sina Hospital Critical Feeder (`FDR-DHN-HOSP`, 8.0 MW, `isCritical: true` - protected under Rule 1).**
  * Mirpur 10 Circle Feeder (`FDR-MIR-10`, 20.0 MW, Ordinary).
* **Meters:** `MTR-DHN-101` linked to customer account.
* **Default Users (5 System Roles):**
  * `admin@grid.gov.bd` (`ADMIN`)
  * `operator@grid.gov.bd` (`POWER_OPERATOR`)
  * `tech1@grid.gov.bd` (`TECHNICIAN`, assigned to Dhanmondi)
  * `manager.dhanmondi@grid.gov.bd` (`ZONE_MANAGER`, assigned to Dhanmondi)
  * `customer@gmail.com` (`CUSTOMER`, linked to `MTR-DHN-101`)

### 4.2 Credential Policy & Idempotency
* **Configurable Seed Password:** Sourced from `process.env.SEED_DEFAULT_PASSWORD` (defaults to local test credential `Password123!`).
* **Upsert Operations:** Every record uses `prisma[entity].upsert()`. Running `npm run prisma:seed` repeatedly will not cause key duplication or database corruption.
* **Missing Database Graceful Exit:** When `DATABASE_URL` is omitted, the script exits cleanly without throwing connection errors.

---

## 5. In-Memory Store Isolation & Test Fixture Builders

To prevent test cross-contamination:

### 5.1 Store Reset Mechanism (`store.reset()`)
The `MemoryStore` in `apps/api/src/db/store.ts` provides a `.reset()` method that wipes all maps and restores the pristine initial seed state.
* **Production Guard:** Throws a security error if invoked when `NODE_ENV === 'production'`.

### 5.2 Deterministic Fixture Builders (`apps/api/src/test/fixtures.ts`)
Provides pure builder functions for unit and integration testing:
* `buildTestUser(overrides)`
* `buildTestZone(overrides)`
* `buildTestSubstation(zoneId, overrides)`
* `buildTestFeeder(substationId, overrides)`
* `buildTestMeter(feederId, overrides)`
* `buildTestOutageTicket(customerId, meterId, feederId, overrides)`
* `buildTestSchedule(planningDate, overrides)`

### 5.3 Deterministic Mock Clock (`MockClock`)
Allows tests to freeze time or fast-forward across load shedding slot boundaries without relying on real system clock time:
```typescript
const clock = createMockClock('2026-09-25T14:00:00.000Z');
clock.advanceHours(2);
```
