# Decision Register (D-01 through D-18)

This document formalizes the architectural decisions for the **Load Shedding & Power Outage Management System**, resolving ambiguities across preliminary blueprints and freezing system-wide contracts.

---

### D-01: No-Repeat-Cut Meaning
* **Issue:** Source documents alternately used "feeder", "area", and "zone" when describing the prohibition against cutting power twice in one day.
* **Decision:** Enforced strictly at the **Feeder level**. A feeder cannot be scheduled for load shedding more than once in the same calendar day.
* **Rationale:** A zone encompasses multiple substations and dozens of feeders; excluding an entire zone after one 1-hour cut would make target deficit shedding mathematically impossible during heavy shortages.
* **Status:** **FROZEN**. Implemented in `apps/api/src/services/scheduler.service.ts`.

---

### D-02: Authentication Transport & Token Strategy
* **Issue:** Auth.js session vs Express JWT tokens.
* **Decision:** The backend issues and verifies short-lived JWTs (passed via Bearer header or HTTP-only cookies). Tokens are never exposed to browser `localStorage`.
* **Rationale:** Prevents XSS token exfiltration while ensuring Express remains the authoritative authorization boundary.
* **Status:** **FROZEN**. Implemented in `apps/api/src/middleware/auth.ts`.

---

### D-03: Email Delivery Provider
* **Issue:** Email verification endpoints exist, but no third-party email vendor was included in the approved stack.
* **Decision:** Decoupled adapter interface. In development and testing, verification links and reset tokens are logged to console and stored in memory.
* **Rationale:** Avoids requiring paid external API credentials during development while keeping production pluggable.
* **Status:** **FROZEN**. Implemented in `apps/api/src/services/notification.service.ts`.

---

### D-04: Operational Timezone
* **Issue:** Date math and "same calendar day" boundaries depend on timezone context.
* **Decision:** Set to **`Asia/Dhaka`** (configured via `OPERATIONAL_TIME_ZONE`).
* **Rationale:** Load shedding schedules and daily cut resets must evaluate relative to local grid time, not UTC or developer local clocks.
* **Status:** **FROZEN**. Configured in `apps/api/src/config/index.ts`.

---

### D-05: Automated Hourly Scheduling
* **Issue:** Some blueprints proposed an automated hourly background scheduler.
* **Decision:** Default to **manual review & publication**. The algorithm generates reviewable `DRAFT` plans; an Operator must explicitly review and click `PUBLISH`.
* **Rationale:** Real grid control rooms never grant automatic autonomous blacking-out authority to scripts without human operator sign-off.
* **Status:** **FROZEN**. Implemented in `apps/api/src/modules/operator.router.ts`.

---

### D-06: Background Job Inventory & Concurrency
* **Issue:** Potential collision between multiple API replicas running cron jobs.
* **Decision:** `node-cron` tasks are protected with distributed mutex locks in Redis (with in-memory locks in local development).
* **Rationale:** Prevents duplicate schedule activations or duplicate SMS dispatching when running multiple server instances.
* **Status:** **FROZEN**. Implemented in `apps/api/src/jobs/cron.ts`.

---

### D-07: Customer Meter Onboarding
* **Issue:** Whether a meter must be provided during user registration.
* **Decision:** Customers can self-register without a meter. Meter linking is supported at registration or post-registration.
* **Rationale:** Lowers onboarding friction; users can create an account first and add one or more household meters later.
* **Status:** **FROZEN**. Implemented in `apps/api/src/modules/customer.router.ts`.

---

### D-08: Account Provisioning & Verification
* **Issue:** How staff accounts (`OPERATOR`, `TECHNICIAN`, `ZONE_MANAGER`) are onboarded.
* **Decision:** Staff cannot self-register. Staff accounts are provisioned exclusively by an `ADMIN`. Customers self-register.
* **Rationale:** Prevents unauthorized elevation of privileges into operational control rooms.
* **Status:** **FROZEN**. Implemented in `apps/api/src/modules/admin.router.ts`.

---

### D-09: Automated Technician Assignment
* **Issue:** Algorithm for assigning field repair tickets.
* **Decision:** Deterministic least-busy selection:
  1. Filter technicians assigned to the ticket's zone.
  2. Order by fewest open (`ASSIGNED`, `EN_ROUTE`, `REPAIRING`) tickets.
  3. Tie-breaker: oldest `lastAssignedAt`, then user ID.
* **Rationale:** Fair workload distribution among field crews with reproducible assignment behavior.
* **Status:** **FROZEN**. Implemented in `apps/api/src/services/conflict.service.ts`.

---

### D-10: Planned Conflict Persistence
* **Issue:** How to record a customer outage report made during an active planned cut.
* **Decision:** Store an **`OutageReportEvent`** audit row. **Do NOT create an `OutageTicket`** and do not assign a technician.
* **Rationale:** Preserves customer engagement data for auditing without cluttering the emergency repair dispatch queue.
* **Status:** **FROZEN**. Implemented in `apps/api/src/services/conflict.service.ts`.

---

### D-11: Repair Evidence File Storage
* **Issue:** Where technician repair proof photos are stored.
* **Decision:** S3-compatible storage adapter with local Multer storage fallback serving `/uploads`.
* **Rationale:** Ensures the application works out-of-the-box locally while supporting S3 presigned URLs in production.
* **Status:** **FROZEN**. Implemented in `apps/api/src/middleware/upload.ts`.

---

### D-12: Redis Unavailability Fallback
* **Issue:** What happens if Upstash Redis connection fails or times out.
* **Decision:** Automatic graceful fallback to in-memory cache and direct PostgreSQL queries.
* **Rationale:** Temporary cache outages must never cause downtime for core grid operations.
* **Status:** **FROZEN**. Implemented in `apps/api/src/services/cache.service.ts`.

---

### D-13: Socket.io Delivery Policy
* **Issue:** Real-time state consistency.
* **Decision:** WebSockets deliver ephemeral alerts and refresh hints; REST/database state remains authoritative. On reconnect, clients re-fetch REST state.
* **Rationale:** Eliminates complex WebSocket message replaying or event sourcing requirements.
* **Status:** **FROZEN**. Implemented in `apps/api/src/sockets/socket.server.ts`.

---

### D-14: Grid Simulation Guardrails
* **Issue:** Demo simulation vs live telemetry integrity.
* **Decision:** The demo fluctuation simulator is strictly isolated and gated by `ENABLE_DEMO_SIMULATION=true`.
* **Rationale:** Prevents demo scripts from corrupting genuine historical failure analytics or audit logs.
* **Status:** **FROZEN**. Configured in `apps/api/src/config/index.ts`.

---

### D-15: Public Grid Metadata Discovery
* **Issue:** What grid information is accessible without logging in.
* **Decision:** Public endpoints expose active Zone and Feeder names and published schedules. Detailed grid capacities, transformer health, and customer data require authentication.
* **Rationale:** Transparency for citizens without exposing operational grid vulnerability data.
* **Status:** **FROZEN**. Implemented in `apps/api/src/modules/grid.router.ts`.

---

### D-16: SMS Notification Dispatch
* **Issue:** External messaging dependency during development.
* **Decision:** Twilio SMS adapter. In development without credentials, SMS payloads are logged cleanly to the console.
* **Rationale:** Allows complete end-to-end testing without incurring carrier costs during local development.
* **Status:** **FROZEN**. Implemented in `apps/api/src/services/sms.service.ts`.

---

### D-17: Performance & Latency Targets
* **Issue:** Production SLA vs academic benchmark targets.
* **Decision:** Read endpoints target $< 100\text{ms}$ (via Redis/in-memory cache); complex draft generation targets $< 500\text{ms}$.
* **Rationale:** Realistic and benchmarkable across development machines and cloud tiers.
* **Status:** **FROZEN**. Verified in test runner suite.

---

### D-18: Canonical Route Namespace
* **Issue:** Mixed `/api` and `/api/v1` routes in legacy endpoint documents.
* **Decision:** **`/api/v1`** is the canonical namespace. Routes are also mounted at `/api` for frontend backwards compatibility.
* **Rationale:** Meets strict versioning specifications without breaking existing web clients.
* **Status:** **FROZEN**. Implemented in `apps/api/src/app.ts`.
