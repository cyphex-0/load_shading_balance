# Implementation Roadmap (Phases 0 through 9)
## Load Shedding & Power Outage Management System

### Phase 0: Requirement Analysis & Repository Inspection (Current)
- [x] Inspect workspace and examine all reference specifications (`endpoint.md`, `requirment.txt`).
- [x] Create comprehensive system specifications in `docs/`:
  - `docs/requirements-analysis.md`
  - `docs/architecture.md`
  - `docs/database-design.md`
  - `docs/api-inventory.md`
  - `docs/implementation-roadmap.md`
- [ ] Initialize Git repository.
- [ ] Deliver Phase 0 synthesis report to user.

---

### Phase 1: Foundation & Project Setup
- [ ] Scaffold monorepo structure:
  - Root `package.json`, workspaces configuration, `.gitignore`, `.env.example`.
  - `packages/shared`: Shared types, Zod validation schemas, constants, error codes.
  - `apps/api`: Express.js, TypeScript, Prisma, Socket.io, Redis client, Winston/Pino logger.
  - `apps/web`: Next.js 14+ (App Router), TypeScript, Tailwind CSS, Shadcn UI setup.
- [ ] Implement central error handling & standard API response envelope utilities.
- [ ] Implement Health & System endpoints:
  - `GET /api/health`
  - `GET /api/v1/health/live`
  - `GET /api/v1/health/ready`
- [ ] Verify both API and Web builds/starts cleanly.

---

### Phase 2: Database & Authentication
- [ ] Create `prisma/schema.prisma` with all 20+ models, relations, indexes, and enums.
- [ ] Write rich database seed script (`prisma/seed.ts`) populating:
  - 1 System Admin (`admin@grid.gov.bd`)
  - 2 Power Operators (`operator@grid.gov.bd`, `operator2@grid.gov.bd`)
  - 3 Field Technicians (`tech1@grid.gov.bd`, `tech2@grid.gov.bd`, `tech3@grid.gov.bd`)
  - 2 Zone Managers (`manager.dhanmondi@grid.gov.bd`, `manager.mirpur@grid.gov.bd`)
  - 3 Customers (`customer1@gmail.com`, `customer2@gmail.com`, `customer3@gmail.com`)
  - 2 Zones (Dhanmondi, Mirpur) with 4 Substations, 10 Feeders (including Hospital critical feeder), 20 Meters.
- [ ] Implement all 8 Authentication & Session endpoints (`/api/auth/*`).
- [ ] Implement all 6 User Profile & Notification endpoints (`/api/users/*`).
- [ ] Implement authentication & RBAC middleware.
- [ ] Verify token generation, session cookies, and role enforcement.

---

### Phase 3: Grid Infrastructure Management
- [ ] Implement Public Grid Discovery endpoints:
  - `GET /api/zones`
  - `GET /api/feeders`
  - `GET /api/grid/status`
- [ ] Implement Customer Meter management:
  - `GET /api/customers/me/meters`
  - `POST /api/customers/me/meters` (and `/api/v1/customers/me/location`)
  - `DELETE /api/customers/me/meters/:id`
- [ ] Implement Admin Infrastructure endpoints:
  - Zones CRUD (`/api/admin/zones/*`)
  - Substations CRUD (`/api/admin/substations/*`)
  - Feeders CRUD (`/api/admin/feeders/*`) including critical toggle (`/api/v1/admin/feeders/:id/critical`)
  - Meters CRUD (`/api/admin/meters/*`)
  - User & Staff Provisioning and Suspension (`/api/admin/users/*`)
- [ ] Verify grid relationships, foreign key constraints, and soft deletes.

---

### Phase 4: Load-Shedding Scheduler Engine
- [ ] Implement `SchedulerService`:
  - Fairness rotation metric (historical outage count / hours).
  - Hard constraint: Critical Feeder Shielding.
  - Hard constraint: No-Double-Cut Rule per calendar day.
  - Optimization algorithm for capacity matching against target deficit MW.
- [ ] Implement Operator Scheduling endpoints:
  - `POST /api/operator/schedules/draft`
  - `GET /api/operator/schedules/:id`
  - `PATCH /api/operator/schedules/:id/slots/:slotId`
  - `POST /api/operator/schedules/:id/publish` (with Redis cache pre-warming & mass notifications)
  - `POST /api/operator/schedules/:id/cancel`
- [ ] Write unit & integration tests verifying zero critical feeder cuts and zero double-cuts.

---

### Phase 5: Outage Reporting & Technician Workflow
- [ ] Implement Smart Outage Conflict Resolution Engine:
  - `POST /api/customers/me/outage-reports`
  - Check active planned schedules -> intercept with explanation if planned.
  - If unplanned -> create `OutageTicket` (`REPORTED`) and mark feeder `UNEXPECTED_FAULT`.
- [ ] Implement customer ticket history endpoints (`/api/customers/me/outage-reports/*`).
- [ ] Implement Operator & Manager dispatch endpoints:
  - `GET /api/operators/outage-reports`
  - `POST /api/operators/outage-reports/:id/assign`
- [ ] Implement Technician repair state machine:
  - `GET /api/technicians/me/assignments`
  - `POST /api/technicians/me/assignments/:id/accept`
  - `POST /api/technicians/me/assignments/:id/start-repair`
  - `POST /api/technicians/me/uploads/repair-photo` (with MIME & file size validation)
  - `POST /api/technicians/me/assignments/:id/resolve` (restoring feeder power)
- [ ] Verify full end-to-end blackout-to-restoration workflow.

---

### Phase 6: Dashboards & Real-Time Features
- [ ] Setup Socket.io server with JWT authentication and room subscriptions:
  - `subscribe:zone`, `subscribe:operator`, `subscribe:technician`, `customer:{userId}`.
- [ ] Build Frontend interfaces using Next.js App Router, Tailwind CSS, Shadcn UI, and Lucide:
  - Public Website (Home, About, Live Status, Schedules).
  - Auth Pages (Login, Register, Forgot Password, Reset Password, Verify Email).
  - Customer Portal (Live status badge, linked meters, report blackout dialog, ticket tracker).
  - Operator Control Room (Live grid demand & deficit, algorithmic schedule generator, dispatch board).
  - Technician Mobile App (Ticket cards, GPS location, single-tap transitions, camera upload).
  - Zone Manager Dashboard (Sortable live Feeder table with status badges, technician reassign).
  - Admin Portal (Infrastructure management, user provisioning, audit viewer).
- [ ] Connect WebSocket listeners to UI for instant status updates without page refresh.

---

### Phase 7: Analytics, Notifications & Administration
- [ ] Implement Zone Manager Analytics:
  - `GET /api/zone-managers/me/analytics/feeder-failure-rate`
  - `GET /api/zone-managers/me/analytics/avg-resolution-time`
- [ ] Implement Infrastructure Upgrade Workflow:
  - `POST /api/infrastructure-requests` & `GET /api/infrastructure-requests`
  - `PATCH /api/infrastructure-requests/:id/status` (Admin approval/rejection)
- [ ] Implement Background Cron Workers:
  - `sendNotificationsJob` (Twilio SMS queue flusher & retries)
  - `scheduleEnforcerJob` (Hourly status updater)
  - `gridMetricsSimulationJob` (5m grid demand fluctuation)
- [ ] Implement Admin Auditing & Notification logs:
  - `GET /api/admin/audit`
  - `GET /api/admin/notifications`

---

### Phase 8: Testing, Security & Optimization
- [ ] Run automated API tests for all 81 endpoints.
- [ ] Verify RBAC security: ensure customers cannot access operator/admin APIs; ensure managers cannot access outside their zone.
- [ ] Test file upload security: prevent non-image extensions and files > 10MB.
- [ ] Benchmark Redis caching and database query performance with indexes.

---

### Phase 9: Deployment & Final Verification
- [ ] Generate comprehensive `.env.example`.
- [ ] Build and verify Next.js production build (`npm run build`).
- [ ] Build and verify Express API TypeScript compilation.
- [ ] Provide complete demo credentials, seed scripts, and startup instructions in `README.md`.

