# GridSync BD — Load Shedding & Power Outage Management System

A centralized, full-stack, enterprise-grade electricity load-shedding and power outage management platform designed for national and metropolitan power distribution authorities (e.g. DPDC, DESCO, BPDB, BREB in Bangladesh, or other deficit-prone regions globally).

---

## ⚡ Core Platform Capabilities

1. **Algorithmic Fair-Rotation Scheduling Engine:**
   - **Critical Feeder Shielding:** Feeders powering hospitals, water pumps, and emergency trauma facilities are strictly excluded from load shedding under all deficit levels.
   - **No-Double-Cut Rule:** Guaranteed protection against scheduling any feeder line more than once per calendar day.
   - **Fair Rotation:** Balances power cuts equitably across all eligible urban zones based on historical outage duration and frequency.
   - **Redis Cache Pre-warming & Batch SMS:** When a plan is published, schedules are cached in Redis (`schedules:published:{feederId}:{date}`) and SMS notifications are batched to registered customers.

2. **Smart Outage Conflict Resolution Engine:**
   - Differentiates *planned load shedding* from *unexpected hardware faults* when a customer reports a blackout.
   - If an area is under an active scheduled outage, the system immediately intercepts the report, returns the exact scheduled restoration time, and prevents false repair dispatches.
   - If unexpected, it creates an `OutageTicket` (`REPORTED`), updates the feeder status to `UNEXPECTED_FAULT`, alerts the control room, and dispatches an SMS confirmation.

3. **Field Technician Repair Lifecycle:**
   - Mobile-first state machine: `ASSIGNED` → `EN_ROUTE` → `REPAIRING` → `RESOLVED`.
   - Real-time customer and zone manager dashboard updates at each stage.
   - Requires resolution notes and photo proof (JPEG/PNG/WebP $\le$ 10MB) before a ticket can be resolved.
   - Automatic power restoration on feeder lines once all active faults are resolved.

4. **Zone Manager Oversight & Analytics:**
   - Real-time, sortable and filterable data table of all feeders and substations with status badges (`ONLINE`, `PLANNED_OUTAGE`, `UNEXPECTED_FAULT`).
   - Feeder Failure Frequency analytics (ranks chronic failure lines).
   - Average Resolution Time analytics (MTTR in minutes per technician crew).
   - Infrastructure Upgrade Request pipeline with Administrator approval workflows.

5. **5 Integrated Role Portals:**
   - 👤 **Customer:** Monitor meter line status, view weekly schedule, report blackouts, track tickets.
   - ⚡ **Power Operator:** Real-time grid demand/deficit telemetry, algorithmic schedule generator, dispatch board.
   - 🛠️ **Field Technician:** Mobile repair queue, single-tap state transitions, camera photo upload.
   - 📈 **Zone Manager:** District grid oversight, failure frequency charts, upgrade proposals.
   - 🛡️ **System Administrator:** Grid infrastructure CRUD, staff provisioning, critical feeder toggles, audit trails.

---

## 🏗️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | Next.js 14 (App Router), TypeScript, React, Tailwind CSS, Shadcn UI styling, Lucide React |
| **Backend API** | Node.js, Express.js, TypeScript, REST API (81 Endpoints), Zod validation |
| **Real-Time WebSockets** | Socket.io (5 Events: `feeder:status_changed`, `ticket:created`, `ticket:assigned`, `ticket:status_changed`, `schedule:published`) |
| **Background Automation** | Node-cron (3 Jobs: `sendNotificationsJob` [30s], `scheduleEnforcerJob` [1hr], `gridMetricsSimulationJob` [5m]) |
| **Database & ORM** | PostgreSQL (Neon Serverless compatible), Prisma ORM (20+ models & relations) |
| **Caching Layer** | Upstash Redis (with high-resilience in-memory fallback adapter) |
| **SMS & Notifications** | Twilio API (with graceful development simulator logger) |

---

## 🔑 One-Click Demo Credentials

All test accounts use the password: `Password123!`

| Role | Email | Password | Primary Scope |
|---|---|---|---|
| **Customer** | `customer@gmail.com` | `Password123!` | Resident, Meter `MTR-DHN-101` |
| **Power Operator** | `operator@grid.gov.bd` | `Password123!` | National Control Room |
| **Field Technician** | `tech1@grid.gov.bd` | `Password123!` | Dhanmondi Field Repair Crew |
| **Zone Manager** | `manager.dhanmondi@grid.gov.bd` | `Password123!` | Dhanmondi District Supervisor |
| **System Admin** | `admin@grid.gov.bd` | `Password123!` | System-wide IT Governance |

---

## 🚀 Quickstart & Development Guide

### 1. Prerequisites
- **Node.js:** v18+ or v20+ (Tested on Node v24)
- **Git**

### 2. Install Dependencies
```bash
# In the root repository directory
npm install
```

### 3. Run Automated API Test Suite
```bash
# Executes all 18 automated integration tests (Auth, RBAC, Scheduler, Smart Conflict, Tech Workflow, Upgrades)
cd apps/api
npm test
```

### 4. Start the Express API Server
```bash
cd apps/api
npm run dev
# Server boots on http://localhost:4000
# WebSocket listener running on ws://localhost:4000/socket.io
```

### 5. Start the Next.js Frontend
```bash
cd apps/web
npm run dev
# Frontend web portal boots on http://localhost:3000
```

### 6. Production Builds
```bash
# Compile shared packages
cd packages/shared && npm run build

# Compile backend API
cd apps/api && npm run build

# Compile Next.js Frontend
cd apps/web && npm run build
```

---

## 📊 Complete API Endpoint Catalog (81 Endpoints)

All 81 REST API endpoints defined in `endpoint.md` are implemented and active:
1. **System & Health (3):** `GET /api/health`, `GET /api/v1/health/live`, `GET /api/v1/health/ready`
2. **Authentication & Session (8):** `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`, `POST /api/auth/verify-email/request`, `POST /api/auth/verify-email/confirm`, `POST /api/auth/password/forgot`, `POST /api/auth/password/reset`
3. **User Profile & Notifications (6):** `GET /api/users/me`, `PATCH /api/users/me`, `POST /api/users/me/password`, `GET /api/users/me/notifications`, `POST /api/users/me/notifications/:id/read`, `PATCH /api/notifications/read-all`
4. **Public Grid Discovery (3):** `GET /api/zones`, `GET /api/feeders`, `GET /api/grid/status`
5. **Customer Journey (9):** `GET /api/customers/me/dashboard`, `GET /api/customers/me/status`, `GET /api/customers/me/schedule`, `GET /api/customers/me/meters`, `POST /api/customers/me/meters`, `DELETE /api/customers/me/meters/:id`, `POST /api/customers/me/outage-reports`, `GET /api/customers/me/outage-reports`, `GET /api/customers/me/outage-reports/:id`
6. **Power Operator (8):** `POST /api/operator/schedules/draft`, `GET /api/operator/schedules/:id`, `PATCH /api/operator/schedules/:id/slots/:slotId`, `POST /api/operator/schedules/:id/publish`, `POST /api/operator/schedules/:id/cancel`, `GET /api/operator/overview`, `GET /api/operators/outage-reports`, `POST /api/operators/outage-reports/:id/assign`
7. **Field Technician (6):** `GET /api/technicians/me/assignments`, `POST /api/technicians/me/assignments/:id/accept`, `POST /api/technicians/me/assignments/:id/start-repair`, `POST /api/technicians/me/assignments/:id/resolve`, `POST /api/technicians/me/uploads/repair-photo`, `GET /api/v1/outages/:id/attachments`
8. **Zone Manager (8):** `GET /api/zone-managers/me/dashboard`, `GET /api/v1/manager/outages`, `GET /api/v1/manager/technicians`, `PATCH /api/v1/manager/outages/:id/assignment`, `GET /api/zone-managers/me/analytics/feeder-failure-rate`, `GET /api/zone-managers/me/analytics/avg-resolution-time`, `POST /api/infrastructure-requests`, `GET /api/infrastructure-requests`
9. **System Admin (30):** Zones CRUD (5), Substations CRUD (5), Feeders CRUD + Critical Toggle (6), Meters CRUD (4), User Provisioning & Management (7), Upgrade Approvals (1), Audit Logs (1), Notification Delivery Logs (1).
