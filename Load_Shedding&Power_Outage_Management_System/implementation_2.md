# Implementation Plan — Load Shedding & Power Outage Management System

**Document type:** Master implementation blueprint for an AI coding agent
**Status:** Planning only — no application code has been written
**Source materials analyzed:** `Load Shedding & Power Outage idea and tech stack.txt` (project idea, roles, journeys, tech stack)

---

## 0. How To Use This Plan

This document is the single source of truth for building the Load Shedding & Power Outage Management System. It is organized as a sequence of **42 dependency-ordered phases**. Each phase is a self-contained, verifiable unit of work.

Rules for whoever (human or AI agent) implements this plan:

- Implement phases strictly in order unless a phase explicitly states it can run in parallel with another.
- Do not begin a phase until every phase listed in its **Depends On** section is complete and its **Completion Criteria** are satisfied.
- Do not implement functionality that belongs to a later phase, even if it seems convenient, unless the current phase's dependencies require it.
- Treat the **Data Model** in Section 5 and the API contracts defined per-phase as binding. Do not redesign them without recording the change in the "Open Questions / Decisions Required" section.
- See **Section 6 — Implementation Discipline** for the full non-negotiable rule set.

---

## 1. Project Overview

**System name:** Load Shedding & Power Outage Management System

**Problem it solves:** Power authorities in regions with unstable grids (e.g. Bangladesh, South Africa, parts of South America) currently manage load shedding with manual spreadsheets. Customers learn about outages informally (Facebook groups, phone calls, or when the lights simply go out).

**What the system does:**
1. Automates fair distribution of power cuts across city zones/feeders.
2. Gives the public an accurate, queryable outage schedule.
3. Distinguishes *planned* load shedding from *unexpected* hardware faults, and routes technicians only to genuine faults.

**The "smart" differentiator (Journey 5):** when a customer reports an outage that is actually inside an already-published planned load-shedding window for their feeder, the backend auto-resolves the report with an explanatory message instead of dispatching a technician.

---

## 2. User Roles Summary

| Role | Description | Primary Goals |
|---|---|---|
| **Customer** | Resident/business owner | See their status & upcoming schedule, report unplanned outages, get SMS updates |
| **Operator** (Power Operator / Control Room) | Grid engineer | Generate & publish load-shedding schedules using the fair-rotation algorithm |
| **Technician** (Field Worker) | Repair crew | Receive fault assignments, update repair status, upload proof of repair |
| **Zone Manager** | District supervisor | Monitor live grid/feeder status, view analytics, oversee technician performance |
| **Admin** | IT staff | Manage user accounts, zones, substations, feeders; maintain the system |

Each role has a distinct authenticated portal. No role can access another role's protected pages or APIs (enforced in Phase 08 and Phase 30).

---

## 3. Technology Stack (as specified — do not substitute)

**Frontend / Web App**
- Next.js (App Router) — server components, role-guarded portals
- Tailwind CSS + Shadcn UI — data tables, status badges, modal forms

**Backend / Algorithmic Engine**
- Node.js + Express.js — REST API, fair-rotation algorithm, conflict-resolution engine
- Socket.io — real-time push to the Zone Manager live dashboard
- node-cron — scheduled background jobs (grid fluctuation simulation, hourly load-shedding script)

**Database & Caching**
- Neon Serverless PostgreSQL — relational store, simple FK hierarchy `Zone → Feeder → Meter`
- Prisma ORM — schema, migrations, type-safe queries
- Upstash Redis — cache for published schedules, protects Postgres from read spikes

**Auth & Notifications**
- Auth.js (NextAuth) — session-based RBAC
- Twilio API — SMS alerts for outages/restorations

**Explicitly avoided (Rule 36 — do not introduce):** message queues, microservices, GraphQL, additional map/GIS libraries, additional AI agents, third-party push-notification services beyond what is listed above. If a future phase seems to need one of these, stop and add it to Section 7 (Open Questions) rather than silently adding it.

---

## 4. System Architecture

```text
                         ┌─────────────────────────────┐
                         │        Next.js (App Router)  │
                         │  Customer / Operator / Tech  │
                         │  / Zone Manager / Admin UIs  │
                         └───────────────┬──────────────┘
                                         │ REST (fetch) + Socket.io client
                                         ▼
                         ┌─────────────────────────────┐
                         │     Express.js REST API      │
                         │  Auth.js session validation  │
                         │  RBAC middleware              │
                         │  Controllers → Services       │
                         │  Socket.io server              │
                         │  node-cron background jobs    │
                         └───────┬───────────┬───────────┘
                                 │           │
                     Prisma ORM  │           │  Twilio SDK
                                 ▼           ▼
                  ┌───────────────────┐   ┌──────────────┐
                  │ Neon PostgreSQL     │   │  Twilio SMS   │
                  └───────────────────┘   └──────────────┘
                                 │
                                 ▼
                  ┌───────────────────┐
                  │  Upstash Redis      │  (published schedule cache)
                  └───────────────────┘
```

Request flow example (Operator publishes a schedule):
```text
Operator UI → POST /api/schedules/:id/publish → Express Controller
  → Service validates status transition
  → Prisma updates LoadSheddingSchedule + ScheduleFeederSlot rows
  → Redis cache for affected zones/feeders is refreshed
  → Notification service queues SMS to affected customers
  → Socket.io emits "schedule:published" to connected Zone Manager dashboards
  → 200 response → UI shows "Published" + toast
```

---

## 5. Data Model

### 5.1 Enums

```text
UserRole:          CUSTOMER | OPERATOR | TECHNICIAN | ZONE_MANAGER | ADMIN
UserStatus:         PENDING_VERIFICATION | ACTIVE | SUSPENDED
FeederStatus:       ONLINE | PLANNED_OUTAGE | UNEXPECTED_FAULT | MAINTENANCE
ScheduleStatus:     DRAFT | PUBLISHED | ACTIVE | COMPLETED | CANCELLED
SlotStatus:         PENDING | ACTIVE | COMPLETED | CANCELLED
TicketType:         UNPLANNED_FAULT | PLANNED_CONFLICT
TicketStatus:       REPORTED | AUTO_RESOLVED_NO_FAULT | ASSIGNED | EN_ROUTE | REPAIRING | RESOLVED | CANCELLED
FaultType:          TRANSFORMER | LINE_DOWN | CABLE_FAULT | METER_FAULT | OTHER
NotificationChannel:SMS
NotificationStatus: PENDING | SENT | FAILED | DELIVERED
```

### 5.2 Entities

**User**
`id (uuid, pk)`, `name`, `email (unique)`, `phone (unique)`, `passwordHash`, `role (UserRole)`, `status (UserStatus, default PENDING_VERIFICATION)`, `isVerified (bool, default false)`, `lastLoginAt (nullable)`, `createdAt`, `updatedAt`, `deletedAt (nullable, soft delete)`

**CustomerProfile** (1:1 with User where role = CUSTOMER)
`id (uuid, pk)`, `userId (fk → User, unique)`, `address`, `createdAt`, `updatedAt`

**Zone**
`id (uuid, pk)`, `name`, `code (unique)`, `description (nullable)`, `zoneManagerId (fk → User, nullable, unique)`, `createdAt`, `updatedAt`

**Substation**
`id (uuid, pk)`, `zoneId (fk → Zone)`, `name`, `code (unique)`, `location (text, nullable)`, `createdAt`, `updatedAt`

**Feeder**
`id (uuid, pk)`, `zoneId (fk → Zone)`, `substationId (fk → Substation, nullable)`, `name`, `code (unique)`, `isCritical (bool, default false)`, `status (FeederStatus, default ONLINE)`, `capacityMW (float, nullable)`, `createdAt`, `updatedAt`

**Meter**
`id (uuid, pk)`, `meterNumber (unique)`, `feederId (fk → Feeder)`, `customerProfileId (fk → CustomerProfile)`, `address`, `createdAt`, `updatedAt`

**LoadSheddingSchedule**
`id (uuid, pk)`, `createdByOperatorId (fk → User)`, `targetDeficitMW (float)`, `status (ScheduleStatus, default DRAFT)`, `notes (nullable)`, `publishedAt (nullable)`, `createdAt`, `updatedAt`

**ScheduleFeederSlot** (join: which feeder is off, when, under which schedule)
`id (uuid, pk)`, `scheduleId (fk → LoadSheddingSchedule)`, `feederId (fk → Feeder)`, `startTime (datetime)`, `endTime (datetime)`, `status (SlotStatus, default PENDING)`, `createdAt`, `updatedAt`
*Constraint:* a feeder must not have two overlapping slots on the same calendar day across any schedule (enforced in service layer, Phase 18).

**OutageTicket**
`id (uuid, pk)`, `meterId (fk → Meter)`, `customerId (fk → User)`, `feederId (fk → Feeder)`, `type (TicketType)`, `status (TicketStatus, default REPORTED)`, `faultType (FaultType, nullable)`, `description (text, nullable)`, `technicianId (fk → User, nullable)`, `repairPhotoUrl (nullable)`, `reportedAt (default now)`, `assignedAt (nullable)`, `enRouteAt (nullable)`, `repairingAt (nullable)`, `resolvedAt (nullable)`, `createdAt`, `updatedAt`

**TicketStatusHistory** (audit trail, powers Zone Manager analytics)
`id (uuid, pk)`, `ticketId (fk → OutageTicket)`, `status (TicketStatus)`, `changedByUserId (fk → User)`, `changedAt (default now)`, `note (nullable)`

**FeederStatusHistory** (analytics: "which feeder fails most often")
`id (uuid, pk)`, `feederId (fk → Feeder)`, `status (FeederStatus)`, `reason (nullable)`, `changedAt (default now)`

**Notification**
`id (uuid, pk)`, `userId (fk → User)`, `channel (NotificationChannel, default SMS)`, `message (text)`, `status (NotificationStatus, default PENDING)`, `relatedTicketId (fk → OutageTicket, nullable)`, `relatedScheduleId (fk → LoadSheddingSchedule, nullable)`, `sentAt (nullable)`, `createdAt`

**AuditLog**
`id (uuid, pk)`, `actorUserId (fk → User, nullable)`, `action (string)`, `entityType (string)`, `entityId (string)`, `metadata (json, nullable)`, `createdAt`

### 5.3 Relationships Summary

```text
User (1) ──── (0..1) CustomerProfile
Zone (1) ──── (0..*) Substation
Zone (1) ──── (0..*) Feeder
Zone (0..1) ──── (0..1) User [zoneManagerId]
Substation (1) ──── (0..*) Feeder
Feeder (1) ──── (0..*) Meter
CustomerProfile (1) ──── (0..*) Meter
Feeder (1) ──── (0..*) ScheduleFeederSlot
LoadSheddingSchedule (1) ──── (0..*) ScheduleFeederSlot
Meter (1) ──── (0..*) OutageTicket
User[customer] (1) ──── (0..*) OutageTicket
User[technician] (0..1) ──── (0..*) OutageTicket
OutageTicket (1) ──── (0..*) TicketStatusHistory
Feeder (1) ──── (0..*) FeederStatusHistory
User (1) ──── (0..*) Notification
```

### 5.4 Indexing & Constraints (applied in Phase 03)

- Unique: `User.email`, `User.phone`, `Zone.code`, `Substation.code`, `Feeder.code`, `Meter.meterNumber`, `CustomerProfile.userId`, `Zone.zoneManagerId`
- Index: `Feeder.zoneId`, `Meter.feederId`, `OutageTicket.status`, `OutageTicket.feederId`, `ScheduleFeederSlot.feederId`, `ScheduleFeederSlot.scheduleId`, `TicketStatusHistory.ticketId`, `Notification.userId`
- Soft delete: `User.deletedAt` only (all other entities use hard delete restricted to Admin actions with cascading rules defined per-phase)
- All entities: `createdAt` (default now), `updatedAt` (auto-updated)

---

## 6. Implementation Discipline (binding rules for the coding agent)

- Do not skip phases.
- Do not implement future-phase functionality early unless a current phase explicitly requires it as a dependency.
- Do not invent undocumented features.
- Do not change the technology stack (Section 3) without recording the change under Section 7.
- Do not redesign the database (Section 5) without justification recorded under Section 7.
- Do not create duplicate APIs for the same functionality — reuse services/controllers.
- Reuse existing utilities and components introduced in earlier phases.
- Follow the API contracts defined per-phase exactly (method, path, request/response shape).
- Follow the database relationships defined in Section 5.
- Validate both frontend and backend inputs; backend validation is always authoritative.
- Never expose secrets, stack traces, or raw database errors to end users.
- Do not mark a phase complete without running its Verification steps.
- If an ambiguity is discovered, add it to Section 7 before making a significant architectural decision.
- Keep changes limited to the current phase's declared scope (IN SCOPE / OUT OF SCOPE).
- Preserve working functionality from previous phases — do not silently remove or break it.

---

## 7. Open Questions / Decisions Required

These items were **not explicitly specified** in the source material. Each carries a recommended default so implementation is not blocked; the coding agent must not treat these as final requirements without sign-off.

| # | Missing Requirement | Why It Matters | Recommended Assumption |
|---|---|---|---|
| 1 | Exact fair-rotation algorithm rules (e.g. max cuts per feeder per week, rotation window length) | Core to Phase 18 | Round-robin by "days since last cut," skip `isCritical=true`, cap 1 slot per feeder per 24h, configurable `targetDeficitMW` satisfied by summing `capacityMW` of selected feeders |
| 2 | OTP/email verification requirement for registration | Affects Phase 09/11 flow | Email link verification for Customers/Operators/etc.; Admin-created accounts (Technician, Zone Manager, Operator, Admin) are pre-verified — see Rule below |
| 3 | Self-registration scope | Customers self-register; do Technicians/Operators/Zone Managers/Admins self-register too? | Only **Customer** self-registers. All other roles are created by an **Admin** (Phase 15) — standard practice for internal staff roles |
| 4 | Multi-meter customers | Doc implies one meter lookup but doesn't forbid multiple | Support 1 CustomerProfile → many Meters (a business could have several) |
| 5 | Photo storage location for technician repair proof | Not specified | Store on a simple cloud object storage (S3-compatible) reached via a signed upload URL; treat as a pluggable `FILE_STORAGE_*` env block so provider can be swapped without redesign |
| 6 | Exact SLA/analytics metrics the Zone Manager needs | Doc mentions "fails most often" and "average resolve time" only as examples | Implement exactly those two plus ticket-count-by-status; do not add speculative metrics |
| 7 | Push notifications beyond SMS | Doc only specifies Twilio SMS | In-app notification bell (DB-backed, read via API) + SMS; no separate push provider |

---
## 8. Implementation Phases

---

# Phase 01 — Repository & Monorepo Foundation

## Objective
Establish the project's repository structure so backend and frontend can be developed independently but share conventions (env files, linting, TypeScript configs).

## Depends On
- None (first phase)

## Why This Phase Exists
Every later phase writes files into a structure. That structure must exist and be predictable before any code is written.

## Scope
**IN SCOPE:** repo layout, package manager choice, root tooling (ESLint, Prettier, TypeScript base config), `.gitignore`, README skeleton.
**OUT OF SCOPE:** any backend or frontend logic.

## Backend Work
- Create `backend/` directory: `src/`, `prisma/`, `tests/`.
- Initialize `backend/package.json` (Node.js, TypeScript, Express, ts-node-dev for local dev).

## Database Work
- None yet (Prisma init happens in Phase 03).

## Frontend Work
- Create `frontend/` directory via `create-next-app` with App Router + TypeScript + Tailwind CSS enabled at scaffold time.

## Pages
- None yet.

## Components
- None yet.

## User Journey
- N/A — foundational.

## Security
- Add `.env`, `.env.*.local`, `node_modules`, `.next`, `dist` to root `.gitignore`.

## Error Handling
- N/A.

## Testing
- Confirm `npm run dev` (or equivalent) starts an empty Next.js app and an empty Express server without errors.

## Documentation
- `README.md` root: project name, one-paragraph purpose (from Section 1), links to `backend/README.md` and `frontend/README.md` (created empty, filled in later phases).

## Environment Variables
- None yet (introduced Phase 02).

## Files Expected To Change
```text
/README.md
/.gitignore
/backend/package.json
/backend/tsconfig.json
/frontend/  (create-next-app output)
```

## Completion Criteria
- [ ] `backend/` and `frontend/` directories exist with independent package.json files
- [ ] `npm install` succeeds in both directories
- [ ] Next.js dev server boots to a default page
- [ ] Express skeleton (empty `app.listen`) boots without error
- [ ] `.gitignore` excludes secrets and build artifacts

## Verification
1. Run `npm run dev` inside `frontend/` → visit `http://localhost:3000` → see default Next.js page.
2. Run `npm run dev` inside `backend/` → confirm console prints "Server running on port <PORT>".

## Output
Two independently runnable, empty applications with correct tooling, ready for configuration.

---

# Phase 02 — Environment Configuration & Secrets Management

## Depends On
- Phase 01

## Objective
Define every environment variable the whole system will ever need, with placeholders, before any integration is coded, so later phases never invent ad-hoc config.

## Why This Phase Exists
Rule 20 requires all env vars documented up front; doing this early prevents later phases from hardcoding secrets or guessing variable names.

## Scope
**IN SCOPE:** `.env.example` for backend and frontend, a config-loader module (backend) that validates required vars at boot.
**OUT OF SCOPE:** actual secret values, third-party account setup.

## Backend Work
- `backend/src/config/env.ts`: loads and validates env vars (fail fast if a required one is missing) using a small schema (e.g. zod).
- `backend/.env.example` populated with every variable below.

## Environment Variables

| Name | Purpose | Required | Dev usage | Prod usage |
|---|---|---|---|---|
| `PORT` | Express port | Yes | 4000 | platform-assigned |
| `NODE_ENV` | environment flag | Yes | development | production |
| `DATABASE_URL` | Neon Postgres connection string | Yes | Neon dev branch | Neon prod branch |
| `JWT_SECRET` / `AUTH_SECRET` | Auth.js/session signing secret | Yes | random dev value | strong secret from vault |
| `NEXTAUTH_URL` | Auth.js callback base URL | Yes (frontend) | http://localhost:3000 | production domain |
| `UPSTASH_REDIS_REST_URL` | Redis REST endpoint | Yes | Upstash free tier | Upstash prod |
| `UPSTASH_REDIS_REST_TOKEN` | Redis REST token | Yes | Upstash dev token | Upstash prod token |
| `TWILIO_ACCOUNT_SID` | Twilio account id | Yes | Twilio trial | Twilio prod |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | Yes | Twilio trial | Twilio prod |
| `TWILIO_FROM_NUMBER` | Sender SMS number | Yes | Twilio trial number | verified prod number |
| `FILE_STORAGE_BUCKET` | Object storage bucket name (repair photos) | Yes | dev bucket | prod bucket |
| `FILE_STORAGE_ACCESS_KEY` / `FILE_STORAGE_SECRET_KEY` | Storage credentials | Yes | dev keys | prod keys (vault) |
| `CRON_ENABLED` | toggles node-cron jobs | No (default true) | true | true |
| `SOCKET_CORS_ORIGIN` | allowed origin for Socket.io | Yes | http://localhost:3000 | prod frontend domain |
| `NEXT_PUBLIC_API_BASE_URL` | frontend → backend base URL | Yes (frontend) | http://localhost:4000 | prod API domain |

*Never place real secrets in `implementation.md`, `.env.example`, or commits — placeholders only.*

## Completion Criteria
- [ ] `backend/.env.example` lists every variable above with a comment
- [ ] `frontend/.env.example` lists `NEXTAUTH_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_API_BASE_URL`
- [ ] Backend fails to boot with a clear error message if a required var is missing
- [ ] `.env*` (non-example) files are git-ignored

## Verification
1. Delete a required var locally → run backend → confirm it exits with a descriptive error, not a stack trace.
2. Restore var → backend boots.

## Output
A fully documented, validated environment configuration layer used by every subsequent backend phase.

---

# Phase 03 — Database Schema Design (Prisma Schema)

## Depends On
- Phase 02

## Objective
Translate Section 5 (Data Model) into a complete `schema.prisma` file: every entity, enum, relation, index, and constraint.

## Why This Phase Exists
All backend logic from Phase 05 onward reads/writes through this schema. It must be complete and correct before any API is built.

## Scope
**IN SCOPE:** `backend/prisma/schema.prisma` with all models from Section 5.2–5.4.
**OUT OF SCOPE:** migrations execution (Phase 04), seed data (Phase 04/40).

## Database Work
- Write Prisma `enum` blocks for every enum in 5.1.
- Write Prisma `model` blocks for every entity in 5.2 with exact fields, `@relation`, `@unique`, `@@index`, `@default`, `@updatedAt`.
- Add `@@index` per Section 5.4.
- Configure `datasource db { provider = "postgresql", url = env("DATABASE_URL") }` and `generator client { provider = "prisma-client-js" }`.

## Completion Criteria
- [ ] `npx prisma validate` passes
- [ ] `npx prisma format` produces no diff (schema is clean)
- [ ] Every entity in Section 5.2 has a corresponding Prisma model
- [ ] Every relationship in Section 5.3 is represented bidirectionally

## Verification
1. Run `npx prisma validate`.
2. Run `npx prisma generate` → confirm Prisma Client builds without error.

## Output
A validated, generation-ready `schema.prisma` representing the entire system's data model.

---

# Phase 04 — Migrations & Seed Strategy Setup

## Depends On
- Phase 03

## Objective
Create the initial migration and the seed-script scaffold (actual seed data content is Phase 40; here we build the mechanism).

## Scope
**IN SCOPE:** initial migration, `backend/prisma/seed.ts` entry point wired to `package.json` (`prisma.seed` field), a `db:reset` script.
**OUT OF SCOPE:** populating real seed records (Phase 40).

## Database Work
- `npx prisma migrate dev --name init` against a dev Neon branch.
- `seed.ts`: empty function `main()` that logs "seed placeholder — see Phase 40" and exits 0.

## Completion Criteria
- [ ] Initial migration applies cleanly to a fresh Neon database
- [ ] `npx prisma migrate reset` works end-to-end (drops, migrates, seeds placeholder)
- [ ] Migration files are committed to version control

## Verification
1. Point `DATABASE_URL` at a throwaway Neon branch.
2. Run `npx prisma migrate reset --force`.
3. Confirm all tables from Section 5.2 exist via `npx prisma studio` or `\dt` in psql.

## Output
Reproducible database provisioning for every environment (dev, CI, prod).

---

# Phase 05 — Backend Bootstrap (Express App Skeleton)

## Depends On
- Phase 02, Phase 03

## Objective
Stand up the Express application shell: middleware pipeline, folder architecture, centralized error handling, logging — with no business routes yet.

## Scope
**IN SCOPE:** `backend/src/app.ts`, `server.ts`, folder architecture, global middleware, error-handling middleware, request logger, health-check endpoint.
**OUT OF SCOPE:** any domain route (auth, users, zones, etc.).

## Backend Work
Folder architecture:
```text
backend/src/
  app.ts               # express app, middleware wiring
  server.ts             # http server bootstrap, reads PORT
  config/env.ts          # from Phase 02
  prisma/client.ts        # singleton PrismaClient
  middleware/
    errorHandler.ts
    requestLogger.ts
    notFound.ts
  routes/
    index.ts             # route aggregator (empty router for now)
  controllers/
  services/
  repositories/
  utils/
    ApiError.ts           # custom error class {statusCode, message, code}
    asyncHandler.ts        # wraps async controllers
  sockets/                # Phase 25
  jobs/                   # Phase 20
```
- Global middleware order: `helmet()` → `cors()` (using `SOCKET_CORS_ORIGIN`/explicit allow-list) → `express.json()` → `requestLogger` → routes → `notFound` → `errorHandler`.
- `ApiError` class carries `statusCode`, `message`, `code`, optional `details`; `errorHandler` returns a consistent JSON envelope: `{ "success": false, "error": { "code", "message", "details" } }` and never leaks stack traces when `NODE_ENV=production`.
- Success envelope convention (used by all future endpoints): `{ "success": true, "data": <payload>, "meta": <optional pagination/etc> }`.

## API Work
### GET /api/health
- Purpose: liveness/readiness check for deployment platform.
- Authentication: public.
- Response: `200 { success: true, data: { status: "ok", timestamp } }`.
- Error cases: none (always 200 if process is up); DB check optional ping.

## Completion Criteria
- [ ] `GET /api/health` returns 200 with the standard envelope
- [ ] Throwing an `ApiError` anywhere returns the standard error envelope with correct status code
- [ ] Unhandled routes return 404 in the standard error envelope
- [ ] No stack traces leak when `NODE_ENV=production`

## Verification
1. `curl http://localhost:4000/api/health` → 200.
2. `curl http://localhost:4000/api/nonexistent` → 404 standard envelope.
3. Temporarily throw an `ApiError(400,"test")` in a dummy route → confirm 400 envelope, then remove the dummy route.

## Output
A production-shaped Express skeleton that every later API phase plugs into.

---

# Phase 06 — Redis (Upstash) Caching Layer

## Depends On
- Phase 02, Phase 05

## Objective
Wire up the Upstash Redis client and a thin caching utility used later to cache published schedules (Phase 19) and protect Postgres from read spikes.

## Scope
**IN SCOPE:** Redis client singleton, `cache.get/set/del` utility with JSON (de)serialization and TTL support.
**OUT OF SCOPE:** actual schedule-caching logic (Phase 19).

## Backend Work
- `backend/src/utils/cache.ts`: wraps `@upstash/redis` REST client using `UPSTASH_REDIS_REST_URL`/`TOKEN`.
- Functions: `cacheGet<T>(key): Promise<T|null>`, `cacheSet(key, value, ttlSeconds)`, `cacheDel(key)`, `cacheDelByPrefix(prefix)` (used when a schedule is republished/cancelled).
- Cache key convention: `schedule:zone:<zoneId>:active`, `schedule:feeder:<feederId>:active`.

## Error Handling
- Cache failures must never crash a request — wrap in try/catch, log, and fall back to a direct DB read (cache is an optimization, not a source of truth).

## Completion Criteria
- [ ] `cacheSet`/`cacheGet`/`cacheDel` round-trip correctly against a real Upstash instance
- [ ] A simulated Redis outage (wrong token) does not crash the health endpoint or any route that uses cache

## Verification
1. `cacheSet('test:key', {a:1}, 30)` then `cacheGet('test:key')` in a scratch script → confirms round trip.
2. Temporarily set an invalid Upstash token → confirm app still boots and a cache-using stub function falls back gracefully (logged, not thrown).

## Output
A resilient caching utility ready for Phase 19.

---
# Phase 07 — Authentication Strategy & Auth.js Configuration

## Depends On
- Phase 03, Phase 05

## Objective
Define and implement the session/token strategy shared by frontend (Auth.js/NextAuth) and backend (Express) so every later phase treats auth the same way.

## Why This Phase Exists
Registration, login, RBAC middleware, and every protected page all depend on one agreed authentication mechanism. Decide it once, here.

## Scope
**IN SCOPE:** Auth.js Credentials provider configuration (email/phone + password against the `User` table via Prisma), JWT session strategy, shared secret between frontend and backend, backend session-verification middleware contract.
**OUT OF SCOPE:** the registration/login HTTP endpoints themselves (Phase 09–10), UI (Phase 29).

## Backend Work
- Decide on **JWT session strategy**: Auth.js issues a signed JWT (via `AUTH_SECRET`, shared with backend `JWT_SECRET`) containing `{ sub: userId, role, status }`.
- Backend Express API is stateless: every protected request must include `Authorization: Bearer <token>`. A `verifyToken(token)` utility in `backend/src/utils/jwt.ts` verifies signature + expiry and returns the decoded payload.
- Password hashing: bcrypt (or argon2), cost factor documented in `backend/src/utils/password.ts` (`hashPassword`, `comparePassword`).

## Security
- Tokens expire after 24h; refresh handled by Auth.js re-issuing on the frontend session refresh (no separate refresh-token endpoint needed given session-based frontend).
- Passwords never logged, never returned in any API response.
- `AUTH_SECRET` (frontend) and `JWT_SECRET` (backend) must be the **same value** in every environment — document this explicitly in `.env.example` comments from Phase 02.

## Explicitly Documented Behavior
- **Token expired:** backend returns `401 { code: "TOKEN_EXPIRED" }`; frontend Auth.js triggers re-login.
- **Token invalid/tampered:** `401 { code: "TOKEN_INVALID" }`.
- **User logged out:** frontend clears session; backend has no server-side session to invalidate (stateless JWT) — session simply expires or is discarded client-side.
- **Account disabled (`status = SUSPENDED`):** `403 { code: "ACCOUNT_SUSPENDED" }` even with a valid token.
- **Verification incomplete (`isVerified = false`):** allowed to log in, but customer-only write actions (e.g. reporting an outage) are blocked with `403 { code: "VERIFICATION_REQUIRED" }` until Phase 11's verification flow completes. Read-only dashboard access is still allowed.

## Completion Criteria
- [ ] `hashPassword`/`comparePassword` utilities tested with known vectors
- [ ] `verifyToken` correctly rejects expired and tampered tokens
- [ ] Shared secret convention documented in both `.env.example` files

## Verification
1. Hash a password, compare correct/incorrect → confirm true/false.
2. Sign a test JWT with a wrong secret → `verifyToken` throws/returns invalid.
3. Sign a valid JWT with a past `exp` → `verifyToken` reports `TOKEN_EXPIRED`.

## Output
A single, documented authentication contract every later phase relies on.

---

# Phase 08 — Backend RBAC Middleware & Authorization Framework

## Depends On
- Phase 07

## Objective
Build the reusable middleware that (a) requires a valid session and (b) restricts by role, used by every protected route from Phase 09 onward.

## Backend Work
- `middleware/requireAuth.ts`: verifies `Authorization` header via `verifyToken`, attaches `req.user = { id, role, status }`, else `401`.
- `middleware/requireRole(...roles)`: `403 { code: "FORBIDDEN_ROLE" }` if `req.user.role` not in list.
- `middleware/requireOwnership(resolver)`: generic helper for "customer can only access their own ticket/meter" checks — takes a resolver function that loads the resource and compares its owning-user id to `req.user.id`; `403 { code: "FORBIDDEN_RESOURCE" }` on mismatch.
- `middleware/requireVerified.ts`: blocks write actions for `isVerified = false` customers per Phase 07 rule.

## Explicitly Documented Behavior
- **User accesses another role's page/API:** `403 FORBIDDEN_ROLE`.
- **User accesses another user's resource:** `403 FORBIDDEN_RESOURCE`.

## Completion Criteria
- [ ] `requireAuth` rejects missing/invalid tokens with 401
- [ ] `requireRole` rejects mismatched roles with 403
- [ ] `requireOwnership` correctly allows the owner and rejects a non-owner in a unit test using two seeded users

## Verification
1. Call a dummy protected route with no token → 401.
2. Call with a Customer token against a route guarded by `requireRole('ADMIN')` → 403.
3. Two customers, one ticket → non-owning customer blocked via `requireOwnership`.

## Output
A composable authorization toolkit reused by every API phase from here on.

---

# Phase 09 — Auth API: Registration

## Depends On
- Phase 07, Phase 08

## Scope
**IN SCOPE:** Customer self-registration only (per Section 7, item 3). Staff-role creation is Phase 15 (Admin-only).

## API Work

### POST /api/auth/register
- Purpose: Create a new Customer account.
- Authentication: Public.
- Request body: `{ name (string, 2-100), email (valid email), phone (E.164 string), password (string, min 8, at least 1 letter + 1 number) }`
- Validation: email/phone uniqueness checked against `User`; all fields required.
- Business logic: hash password, create `User{role: CUSTOMER, status: PENDING_VERIFICATION, isVerified:false}` + associated `CustomerProfile` in one Prisma transaction; trigger verification flow (Phase 11 sends the email/link — this endpoint only creates the pending verification token record).
- Database interaction: `User` (insert), `CustomerProfile` (insert).
- Success response: `201 { success:true, data: { userId, email } }` (never returns the password hash).
- Error cases: `409 EMAIL_TAKEN`, `409 PHONE_TAKEN`, `422 VALIDATION_ERROR`.
- Dependencies: Phase 03 schema, Phase 07 password hashing.

## Security
- Rate-limit this endpoint (see Phase 39) to prevent registration spam.
- Generic error messaging: do not reveal whether it was email or phone that collided if that would aid enumeration — acceptable here to be specific per UX needs, but log both attempts for abuse monitoring.

## Testing
- Valid registration succeeds.
- Duplicate email rejected with `409`.
- Weak password rejected with `422`.
- Missing fields rejected with `422`.

## Completion Criteria
- [ ] Endpoint implemented and covered by the tests above
- [ ] No password ever appears in a response or log

## Verification
Run the four test cases above via the test suite (Phase 40 formalizes this; a manual `curl`/Postman pass is sufficient here to close the phase).

## Output
Working customer self-registration.

---

# Phase 10 — Auth API: Login, Logout, Session

## Depends On
- Phase 09

## API Work

### POST /api/auth/login
- Purpose: authenticate and issue a session token.
- Authentication: Public.
- Request body: `{ emailOrPhone (string), password (string) }`.
- Business logic: look up user, `comparePassword`, check `status !== SUSPENDED`, issue JWT `{sub, role, status}`, update `lastLoginAt`.
- Success response: `200 { success:true, data: { token, user: { id, name, role, isVerified } } }`.
- Error cases: `401 INVALID_CREDENTIALS` (generic — do not reveal whether email or password was wrong), `403 ACCOUNT_SUSPENDED`.

### POST /api/auth/logout
- Purpose: client-side session termination signal (stateless JWT — this endpoint mainly exists for consistency/audit logging).
- Authentication: Authenticated (any role).
- Business logic: write an `AuditLog` entry `action:"LOGOUT"`; frontend discards its token.
- Success response: `200 { success:true }`.

### GET /api/auth/session
- Purpose: return the current authenticated user (used by frontend to hydrate session state).
- Authentication: Authenticated.
- Success response: `200 { success:true, data: { id, name, email, role, isVerified, status } }`.
- Error cases: `401` if token invalid/expired.

## Security
- Login attempts rate-limited per IP + per account (Phase 39).
- Failed logins logged to `AuditLog` (action `LOGIN_FAILED`) without storing the attempted password.

## Testing
- Correct credentials → 200 + token.
- Wrong password → 401 generic message.
- Suspended account with correct password → 403.
- `/session` with valid token → correct user echoed; with expired token → 401.

## Completion Criteria
- [ ] All three endpoints implemented and tested
- [ ] `lastLoginAt` updates on successful login

## Verification
Manual/automated pass of the four test cases above.

## Output
Complete login/logout/session-check flow, ready for NextAuth's Credentials provider (Phase 29) to call.

---

# Phase 11 — Auth API: Password Reset & Email Verification

## Depends On
- Phase 10

## API Work

### POST /api/auth/verify-email/request
- Purpose: (re)send a verification link/token to the customer's email.
- Authentication: Authenticated (self only).
- Business logic: generate a short-lived signed token, store hash server-side (or encode expiry+userId signed with `JWT_SECRET`, stateless), send via email (Note: doc specifies Twilio for **SMS**, not email — use a minimal transactional-email approach; see Open Question below).
- Success response: `200 { success:true }`.

### POST /api/auth/verify-email/confirm
- Purpose: mark `isVerified = true`, `status = ACTIVE`.
- Authentication: Public (token carries identity).
- Request body: `{ token }`.
- Error cases: `400 TOKEN_INVALID_OR_EXPIRED`.

### POST /api/auth/password/forgot
- Purpose: request a password-reset link.
- Authentication: Public.
- Request body: `{ email }`.
- Business logic: always respond `200` regardless of whether the email exists (prevents enumeration); if it exists, generate a signed reset token and email it.

### POST /api/auth/password/reset
- Purpose: set a new password using a valid reset token.
- Request body: `{ token, newPassword }`.
- Validation: same password rules as registration.
- Error cases: `400 TOKEN_INVALID_OR_EXPIRED`, `422 VALIDATION_ERROR`.

## Open Question Flagged
Doc specifies Twilio SMS for outage notifications but does not specify an email provider for verification/reset links. **Recommended default:** use a simple transactional email utility (e.g. Nodemailer against any SMTP provider) behind a `sendEmail(to, subject, body)` abstraction in `backend/src/services/emailService.ts`, so the concrete provider can be swapped without touching call sites. Record actual provider choice here once decided.

## Security
- Reset/verification tokens: single-use, short expiry (30 min reset / 24h verification), invalidated after use.

## Testing
- Request → confirm with valid token → success.
- Confirm with expired/reused token → rejected.
- Forgot-password always returns 200 whether or not the email exists.

## Completion Criteria
- [ ] All four endpoints implemented and tested
- [ ] Tokens are single-use and expire correctly

## Verification
Run through full reset cycle against a seeded test user in a dev environment.

## Output
Complete self-service verification and password-recovery flow.

---

# Phase 12 — User Profile APIs

## Depends On
- Phase 10

## API Work

### GET /api/users/me
- Authentication: Authenticated (any role).
- Success response: full profile including role-specific sub-object (`customerProfile` if role=CUSTOMER, else omitted).

### PATCH /api/users/me
- Authentication: Authenticated.
- Request body: `{ name?, phone? }` (email change intentionally excluded — treated as a security-sensitive action requiring re-verification, out of scope unless later requested).
- Validation: phone format + uniqueness if changed.
- Success response: updated user object.

### POST /api/users/me/password
- Purpose: change password while logged in (distinct from forgot-password flow).
- Request body: `{ currentPassword, newPassword }`.
- Business logic: verify `currentPassword` before allowing change.
- Error cases: `401 CURRENT_PASSWORD_INCORRECT`.

## Testing
- Fetch own profile; update name/phone; change password with correct/incorrect current password.

## Completion Criteria
- [ ] All three endpoints implemented, tested, and role-agnostic (work identically for all 5 roles)

## Verification
Manual pass for one user of each role.

## Output
Self-service profile management for every role.

---

# Phase 13 — Admin API: Zone Management

## Depends On
- Phase 08, Phase 12

## API Work

### POST /api/admin/zones
- Authentication: Admin only (`requireRole('ADMIN')`).
- Request body: `{ name, code (unique), description?, zoneManagerId? (must reference a user with role=ZONE_MANAGER) }`.
- Validation: `code` uniqueness; `zoneManagerId` if provided must exist and have the correct role and not already manage another zone (unique constraint).
- Error cases: `409 CODE_TAKEN`, `422 INVALID_ZONE_MANAGER`.

### GET /api/admin/zones
- Query params: `page`, `pageSize`, `search` (by name/code).
- Success response: paginated list.

### GET /api/admin/zones/:id
- Path param: `id`. `404 ZONE_NOT_FOUND` if missing.

### PATCH /api/admin/zones/:id
- Body: any subset of create fields.

### DELETE /api/admin/zones/:id
- Business logic: blocked (`409 ZONE_HAS_DEPENDENTS`) if the zone has feeders/substations attached — admin must reassign/delete those first (explicit cascading decision to avoid silent data loss, per Rule 36's spirit of not over-automating destructive cascades).

## Testing
- CRUD happy paths; duplicate code rejected; delete-with-dependents rejected; non-admin role rejected with 403.

## Completion Criteria
- [ ] Full CRUD implemented, tested, and Admin-restricted

## Verification
Create → read → update → attempt delete with a dependent Feeder (expect 409) → delete a clean zone (expect 200).

## Output
Admin-managed Zone entity, the top of the grid hierarchy.

---

# Phase 14 — Admin API: Substation & Feeder Management

## Depends On
- Phase 13

## API Work

### POST /api/admin/substations
- Body: `{ zoneId, name, code (unique), location? }`. `404 ZONE_NOT_FOUND` if `zoneId` invalid.

### GET /api/admin/substations`, `GET /api/admin/substations/:id`, `PATCH /api/admin/substations/:id`, `DELETE /api/admin/substations/:id`
- Same conventions as Phase 13 (pagination, 404s, dependent-blocking delete if feeders reference it).

### POST /api/admin/feeders
- Body: `{ zoneId, substationId?, name, code (unique), isCritical (bool), capacityMW? }`.
- Business logic: on create, also write a `FeederStatusHistory` row `{status: ONLINE, reason: "created"}`.

### GET /api/admin/feeders` (list, filterable by `zoneId`, `isCritical`, `status`), `GET /:id`, `PATCH /:id`, `DELETE /:id`
- `PATCH` changing `status` directly (e.g. Admin manually flags MAINTENANCE) must also append a `FeederStatusHistory` row — reused by Phase 18/21/27 logic.
- `DELETE` blocked (`409 FEEDER_HAS_METERS`) if meters are attached.

## Database Interaction
- `Zone`, `Substation`, `Feeder`, `FeederStatusHistory`.

## Testing
- Feeder creation under a valid zone/substation; rejection with invalid `zoneId`; `isCritical` flag round-trips correctly; status change appends history row.

## Completion Criteria
- [ ] Substation and Feeder CRUD complete, tested, Admin-restricted
- [ ] Every feeder status change is recorded in `FeederStatusHistory`

## Verification
Create zone → substation → feeder chain; confirm `GET /api/admin/feeders?zoneId=` returns it; change status via `PATCH`; confirm a new `FeederStatusHistory` row exists.

## Output
Admin can fully build out the grid hierarchy (`Zone → Substation → Feeder`) that every later phase depends on.

---

# Phase 15 — Admin API: User & Role Management

## Depends On
- Phase 08, Phase 12

## Objective
Give Admin the ability to create/manage Operator, Technician, Zone Manager, and Admin accounts (Customers self-register per Phase 09).

## API Work

### POST /api/admin/users
- Body: `{ name, email, phone, role (OPERATOR|TECHNICIAN|ZONE_MANAGER|ADMIN), temporaryPassword }`.
- Business logic: creates `User` with `status: ACTIVE, isVerified: true` (staff accounts are pre-verified — Section 7 item 3), forces password change on first login (`mustChangePassword` handled via a login-response flag rather than a new field: reuse `isVerified` semantics is wrong, so add `User.mustChangePassword (bool, default true for admin-created accounts)` — **schema note:** this field must be retro-added to Phase 03's schema before this phase starts; flagged here rather than silently invented).
- Error cases: `409 EMAIL_TAKEN`/`PHONE_TAKEN`, `422 VALIDATION_ERROR` (role must be one of the 4 staff roles — CUSTOMER is rejected here with `422 USE_SELF_REGISTRATION`).

### GET /api/admin/users
- Query: `role`, `status`, `search`, `page`, `pageSize`.

### GET /api/admin/users/:id`, `PATCH /api/admin/users/:id` (name, phone, role, status), `DELETE` (soft delete via `deletedAt`, blocked if user has active dependent records like unresolved tickets assigned to a technician — `409 USER_HAS_ACTIVE_ASSIGNMENTS`).

### POST /api/admin/users/:id/suspend` / `POST /api/admin/users/:id/reactivate`
- Toggle `status` between `ACTIVE`/`SUSPENDED`; logged to `AuditLog`.

## Security
- Every admin mutation writes an `AuditLog` row (`actorUserId`, `action`, `entityType:"User"`, `entityId`).

## Testing
- Create each staff role; reject CUSTOMER role; list/filter by role; suspend blocks login (covered by Phase 10 test); delete blocked when technician has open tickets.

## Completion Criteria
- [ ] Full staff-account lifecycle implemented and tested
- [ ] All mutations audit-logged

## Verification
Create one user per staff role → confirm each can log in (Phase 10) → suspend one → confirm login now returns 403.

## Output
Admin fully controls the staff side of the user base; Zone Manager/Operator/Technician/Admin accounts can now exist for use in every later phase's testing.

---
# Phase 16 — Customer API: Meter Registration & Association

## Depends On
- Phase 09, Phase 14

## Objective
Let a Customer associate a Meter (identified by `meterNumber`) with their account, and let Admin pre-register meters against feeders.

## API Work

### POST /api/admin/meters
- Authentication: Admin.
- Body: `{ meterNumber (unique), feederId, address }` — created unassociated (`customerProfileId` nullable at creation, or associated immediately if the customer is known; default: unassociated, customer links it themselves).
- **Schema note:** `Meter.customerProfileId` must be nullable to support this pre-registration flow — flagged as an amendment to Section 5.2 (originally listed as required FK); recorded here rather than silently changed.

### POST /api/customers/me/meters
- Authentication: Customer, verified (`requireVerified`).
- Body: `{ meterNumber }`.
- Business logic: find meter by number; `404 METER_NOT_FOUND` if none; `409 METER_ALREADY_LINKED` if already linked to another customer; else set `customerProfileId`.

### GET /api/customers/me/meters
- Authentication: Customer.
- Returns all meters linked to the caller with their feeder + zone summary.

### DELETE /api/customers/me/meters/:id
- Unlinks (does not delete the Meter record — Admin-owned asset).

## Database Interaction
- `Meter`, `CustomerProfile`, `Feeder`.

## Testing
- Admin pre-registers a meter; customer links by number; second customer attempting to link the same meter gets 409; unlink works.

## Completion Criteria
- [ ] Admin meter pre-registration and customer self-linking both implemented and tested

## Verification
Admin creates meter `MTR-001` under a seeded feeder → customer A links it → customer B attempts to link same number → 409 → customer A unlinks → customer B can now link it.

## Output
Customers can now identify themselves to the system by meter, unblocking all customer-facing status/reporting features.

---

# Phase 17 — Public/Authenticated Read APIs: Zone, Feeder, Schedule Lookup

## Depends On
- Phase 14, Phase 16

## Objective
Provide the read endpoints every dashboard (Customer, Zone Manager, Operator) needs to look up current grid status, before the scheduling algorithm (Phase 18) exists — using directly-queried DB state (cache integration comes in Phase 19).

## API Work

### GET /api/zones
- Authentication: Authenticated (any role). Returns id/name/code list (used in dropdowns).

### GET /api/feeders?zoneId=
- Authentication: Authenticated. Returns feeders with current `status`, `isCritical`.

### GET /api/customers/me/status
- Authentication: Customer.
- Business logic: for each linked meter, resolve its feeder's current status and, if `PLANNED_OUTAGE`, the active `ScheduleFeederSlot` window.
- Response shape: `{ meterNumber, feederStatus, activeSlot: { startTime, endTime } | null }[]`.

### GET /api/customers/me/schedule
- Authentication: Customer.
- Purpose: upcoming week's planned slots for the customer's feeder(s).
- Response: list of `{ feederId, startTime, endTime, status }` for `PUBLISHED`/`ACTIVE` slots within the next 7 days.

## Testing
- Zone/feeder lists return correctly; customer status reflects a feeder manually set to `PLANNED_OUTAGE` via Phase 14's `PATCH`; customer with no linked meters gets an empty array, not an error.

## Completion Criteria
- [ ] All four endpoints implemented and tested against seeded data

## Verification
Manually set a feeder to `PLANNED_OUTAGE` (Phase 14 API) → confirm a linked customer's `/status` reflects it.

## Output
Baseline read APIs powering Customer dashboards (Phase 31) ahead of the full scheduling engine.

---

# Phase 18 — Load Shedding Algorithm: Draft Schedule Generation Engine

## Depends On
- Phase 14, Phase 17

## Objective
Implement the fair-rotation algorithm described in Journey 2: given a target MW deficit, select feeder groups to shut off, skip critical feeders, and avoid double-cutting the same feeder in one day.

## Why This Phase Exists
This is the system's core differentiator. It must exist as a pure, testable service before it is exposed via an API (Phase 19).

## Scope
**IN SCOPE:** `backend/src/services/scheduleAlgorithm.ts` — a pure function `generateDraftSlots(input): ScheduleFeederSlotDraft[]`.
**OUT OF SCOPE:** persistence, publishing, notifications (Phase 19).

## Backend Work
Algorithm (per Section 7, item 1 assumption):
1. Load all non-critical feeders (`isCritical = false`) for the target zone(s), each with `capacityMW` and "days since feeder's last `ScheduleFeederSlot`" (fairness score).
2. Sort feeders by fairness score descending (longest since last cut goes first).
3. Greedily select feeders, summing `capacityMW`, until the running sum ≥ `targetDeficitMW`, skipping any feeder that already has a slot overlapping the requested time window on the same calendar day.
4. Return a `LoadSheddingSchedule` (status `DRAFT`) with its list of proposed `ScheduleFeederSlot` drafts (feederId, proposed startTime/endTime — default a 2-hour window, configurable input).
5. Never select a feeder flagged `isCritical = true` under any circumstance — this is a hard invariant, not a soft preference.

## Database Interaction
- Read-only against `Feeder`, `ScheduleFeederSlot` (for fairness/overlap calculation). No writes in this phase.

## Testing (unit tests, pure function — no HTTP needed)
- Critical feeders are never selected, even if they'd perfectly satisfy the deficit.
- A feeder with an existing overlapping slot that day is skipped.
- Fairness ordering: a feeder untouched for 10 days is chosen before one cut yesterday, all else equal.
- Deficit exactly met or slightly exceeded, never under-selected when sufficient non-critical capacity exists.
- Insufficient total non-critical capacity → function returns the best-effort selection plus a `shortfallMW` figure rather than throwing.

## Completion Criteria
- [ ] Algorithm implemented as a pure, dependency-injectable function
- [ ] All five test cases above pass

## Verification
Run the unit test suite for `scheduleAlgorithm.ts` in isolation (no DB writes, no server needed beyond fixture data).

## Output
A tested, deterministic scheduling engine ready to be wrapped in an API in Phase 19.

---

# Phase 19 — Load Shedding API: Draft, Publish, Cache Refresh, Notification Trigger

## Depends On
- Phase 06, Phase 18

## API Work

### POST /api/operator/schedules/draft
- Authentication: Operator only.
- Body: `{ zoneIds[], targetDeficitMW, windowStart, windowEnd }`.
- Business logic: calls Phase 18's algorithm, persists `LoadSheddingSchedule{status:DRAFT}` + `ScheduleFeederSlot{status:PENDING}` rows in a transaction.
- Success response: the draft schedule with its slots and any `shortfallMW`.

### GET /api/operator/schedules/:id
- Authentication: Operator, Zone Manager (read), Admin.
- Returns schedule + slots + feeder names.

### PATCH /api/operator/schedules/:id/slots/:slotId
- Purpose: allow Operator to manually adjust a proposed slot (swap a feeder, adjust time) before publishing.
- Validation: replacement feeder must not be `isCritical` and must not already have an overlapping slot that day (reuse Phase 18's overlap check as a service function).

### POST /api/operator/schedules/:id/publish
- Authentication: Operator only.
- Business logic (transactional):
  1. Validate schedule `status = DRAFT`; else `409 INVALID_STATE`.
  2. Set `status = PUBLISHED`, `publishedAt = now`; set each slot `status = PENDING` (becomes `ACTIVE` automatically when `startTime` arrives — handled by the Phase 20 cron job).
  3. Set affected feeders' `status = PLANNED_OUTAGE` is **not** done immediately at publish time — only when the slot actually starts (Phase 20 cron flips it); publishing only schedules the future state.
  4. Refresh Redis cache keys `schedule:feeder:<feederId>:active` for all affected feeders (invalidate/set upcoming window) and `schedule:zone:<zoneId>:active`.
  5. Enqueue a `Notification{channel:SMS}` row per affected customer (resolved via `Feeder → Meter → CustomerProfile → User`) — actual sending happens in Phase 26's notification service, this phase only creates the `PENDING` notification records inside the same transaction.
- Success response: published schedule.
- Error cases: `404 SCHEDULE_NOT_FOUND`, `409 INVALID_STATE` (already published/cancelled).

### POST /api/operator/schedules/:id/cancel
- Authentication: Operator.
- Business logic: only allowed while `status` is `DRAFT` or `PUBLISHED` (not yet `ACTIVE`); sets `status = CANCELLED`, cancels its `PENDING` slots, invalidates related cache keys, queues cancellation SMS.

## Database Interaction
- `LoadSheddingSchedule`, `ScheduleFeederSlot`, `Feeder`, `Notification`.

## Testing
- Draft → publish happy path; publish on already-published schedule rejected; cache keys correctly set/invalidated (mock Redis in tests); notification rows created for every affected customer, not duplicated per meter if a customer has multiple meters on the same feeder.

## Completion Criteria
- [ ] Draft/adjust/publish/cancel endpoints implemented and tested
- [ ] Cache is refreshed transactionally with the DB write (or immediately after, with a documented "cache may lag DB by <1s" note)
- [ ] Notification rows are created (sending is Phase 26's job)

## Verification
Draft a schedule for a seeded zone → publish it → confirm `schedule:feeder:<id>:active` exists in Redis → confirm `Notification` rows exist with `status:PENDING` for the right customers.

## Output
Operator can generate and publish fair, cached, notification-triggering load-shedding schedules — completing Journey 2.

---

# Phase 20 — node-cron Background Jobs

## Depends On
- Phase 19

## Objective
Automate time-based state transitions that the doc requires to happen without manual action: slots becoming active/completed, and the "hourly load-shedding script" / grid-fluctuation simulation mentioned in the tech stack.

## Backend Work
`backend/src/jobs/`:
1. **`activateSlotsJob`** (runs every minute): find `ScheduleFeederSlot{status:PENDING}` where `startTime <= now`; set `status = ACTIVE`, set the related `Feeder.status = PLANNED_OUTAGE`, append `FeederStatusHistory`, invalidate/refresh the relevant Redis key, emit a Socket.io event `feeder:status_changed` (consumed in Phase 25).
2. **`completeSlotsJob`** (runs every minute): find `ScheduleFeederSlot{status:ACTIVE}` where `endTime <= now`; set `status = COMPLETED`, set `Feeder.status = ONLINE` (unless another active slot or an unresolved fault ticket says otherwise — check for an open `UNEXPECTED_FAULT` on that feeder first), append `FeederStatusHistory`, invalidate cache, emit socket event, queue a "power restored" SMS `Notification` for affected customers, and mark the parent `LoadSheddingSchedule` as `COMPLETED` once all its slots are `COMPLETED`/`CANCELLED`.
3. **`gridFluctuationSimulationJob`** (configurable interval, disabled by default in production via `CRON_ENABLED`/a dedicated `SIMULATE_GRID=false` flag): dev/demo-only job that randomly flips a non-critical feeder to `UNEXPECTED_FAULT` to exercise Journey 3/5 without needing real hardware — must be explicitly documented as a **development aid**, never enabled in production.

## Error Handling
- Each job wraps its work in try/catch; a failure in one feeder's transition must not abort the batch for other feeders (process per-item, collect errors, log them, continue).

## Testing
- Seed a slot with `startTime` in the past, `status:PENDING` → run `activateSlotsJob` manually → confirm feeder flips to `PLANNED_OUTAGE` and history/cache/socket all fire.
- Seed an `ACTIVE` slot with `endTime` in the past → run `completeSlotsJob` → confirm feeder returns `ONLINE` and schedule completes when all slots are done.

## Completion Criteria
- [ ] Both activation/completion jobs implemented, scheduled, and independently testable by direct invocation (not only by waiting for the cron tick)
- [ ] Simulation job is explicitly gated off in production

## Verification
Manually invoke each job function in a test script against seeded time-shifted data; confirm DB/cache/socket side effects.

## Output
The schedule lifecycle (`PENDING → ACTIVE → COMPLETED`) is now fully automated, matching the real-time nature described in the journeys.

---

# Phase 21 — Outage Reporting API + Conflict Resolution Engine (Journey 5)

## Depends On
- Phase 16, Phase 19, Phase 20

## Objective
Implement the customer's "Report Outage" action and the backend's automatic distinction between a real fault and a known planned outage.

## API Work

### POST /api/customers/me/outage-reports
- Authentication: Customer, verified.
- Body: `{ meterId, description? }` — meter must belong to the calling customer (`requireOwnership`).
- Business logic (the conflict-resolution engine):
  1. Resolve `meterId → feederId`.
  2. Check for an `ACTIVE` `ScheduleFeederSlot` on that feeder covering `now`.
  3. **If found:** create `OutageTicket{type: PLANNED_CONFLICT, status: AUTO_RESOLVED_NO_FAULT}` (kept for audit/analytics, not dispatched), respond immediately with the explanatory message quoted in Journey 5, and queue an SMS with the same message.
  4. **If not found:** create `OutageTicket{type: UNPLANNED_FAULT, status: REPORTED}`, append `TicketStatusHistory`, queue the "report received, technician being assigned" SMS, and make the ticket visible to Zone Managers/Operators for assignment (Phase 22).
- Success response: `201 { success:true, data: { ticketId, type, status, message } }`.
- Error cases: `404 METER_NOT_FOUND`, `403 FORBIDDEN_RESOURCE` (not their meter), `403 VERIFICATION_REQUIRED`.

### GET /api/customers/me/outage-reports
- List the caller's own ticket history with status.

### GET /api/customers/me/outage-reports/:id
- Detail view; ownership-checked.

## Database Interaction
- `OutageTicket`, `TicketStatusHistory`, `ScheduleFeederSlot`, `Notification`.

## Testing
- Report during an `ACTIVE` slot on the customer's feeder → `AUTO_RESOLVED_NO_FAULT`, no technician-visible ticket created for dispatch purposes.
- Report with no active slot → `REPORTED`, appears in the unassigned-fault queue (Phase 22).
- Report against a meter not owned by caller → 403.

## Completion Criteria
- [ ] Conflict-resolution logic implemented exactly as Journey 5 describes
- [ ] Both ticket types are persisted for analytics, but only genuine faults enter the dispatch queue

## Verification
Using Phase 19/20 to get a feeder into an `ACTIVE` planned-outage state, report an outage from a customer on that feeder → confirm auto-resolution message; report from a customer on an `ONLINE` feeder → confirm a real ticket is queued.

## Output
Journey 5 fully implemented — the system's core "smart" behavior.

---

# Phase 22 — Technician Assignment & Dispatch API

## Depends On
- Phase 15, Phase 21

## API Work

### GET /api/operators/outage-reports?status=REPORTED
- Authentication: Operator, Zone Manager.
- Purpose: unassigned-fault queue.

### POST /api/operators/outage-reports/:id/assign
- Authentication: Operator, Zone Manager.
- Body: `{ technicianId }` (must be role `TECHNICIAN`, `status ACTIVE`).
- Business logic: set `ticket.status = ASSIGNED`, `technicianId`, `assignedAt = now`; append `TicketStatusHistory`; queue SMS to the technician (in-app notification, not necessarily SMS — reuse the `Notification` model with `channel: SMS` per current scope) and to the customer ("Technician Dispatched" per Journey 3 Step 2 is actually triggered on **Accept**, not on assignment — see Phase 23).
- Error cases: `404 TICKET_NOT_FOUND`, `422 INVALID_TECHNICIAN`, `409 TICKET_ALREADY_ASSIGNED`.

### GET /api/technicians/me/assignments
- Authentication: Technician.
- Returns tickets where `technicianId = caller`, filterable by status.

## Testing
- Assign an unassigned ticket → status/technician set correctly; assigning an already-assigned ticket rejected; assigning a non-technician user rejected.

## Completion Criteria
- [ ] Assignment endpoint implemented and tested
- [ ] Technician's own-assignments list correctly scoped (ownership-checked)

## Verification
Create a fault ticket (Phase 21) → Operator assigns it to a seeded technician → confirm it appears in that technician's `/assignments` and not another technician's.

## Output
Faults are now routable from the queue to a specific technician — completing the first half of Journey 3.

---

# Phase 23 — Technician Ticket Workflow API

## Depends On
- Phase 22

## API Work

### POST /api/technicians/me/assignments/:id/accept
- Authentication: Technician (must be the assigned technician — `requireOwnership`).
- Business logic: `status: EN_ROUTE`, `enRouteAt = now`; append history; update customer-facing status to "Technician Dispatched" (this is what Journey 3 Step 2 actually describes) — queue customer SMS "Technician Dispatched."
- Error cases: `409 INVALID_STATE` if not currently `ASSIGNED`.

### POST /api/technicians/me/assignments/:id/start-repair
- `status: REPAIRING`, `repairingAt = now`; valid only from `EN_ROUTE`.

### POST /api/technicians/me/assignments/:id/resolve
- Body: `{ repairPhotoUrl (required, from Phase 24's upload), notes? }`.
- Business logic: `status: RESOLVED`, `resolvedAt = now`; if the ticket's feeder had `status = UNEXPECTED_FAULT`, flip it back to `ONLINE` and append `FeederStatusHistory`; queue "Power restored" SMS to affected customers on that feeder (not just the reporter — anyone linked to that feeder, since a fault likely affected the whole feeder); emit Socket.io `ticket:resolved` for the Zone Manager dashboard.
- Validation: `repairPhotoUrl` required — resolving without proof is rejected (`422 REPAIR_PHOTO_REQUIRED`).
- Valid only from `REPAIRING`.

## State Machine (enforced server-side, invalid transitions rejected with `409 INVALID_STATE`)
```text
REPORTED → ASSIGNED → EN_ROUTE → REPAIRING → RESOLVED
REPORTED → AUTO_RESOLVED_NO_FAULT   (handled entirely in Phase 21, not by technician)
any of ASSIGNED/EN_ROUTE/REPAIRING → CANCELLED (Operator/Zone Manager override, admin action — simple endpoint added here: POST /api/operators/outage-reports/:id/cancel)
```

## Testing
- Full happy-path walk of the state machine; each out-of-order transition attempt rejected; resolve without photo rejected.

## Completion Criteria
- [ ] Full workflow implemented, state machine enforced, tested end to end

## Verification
Walk one seeded ticket through accept → start-repair → resolve with a mock photo URL; confirm feeder flips `ONLINE`, customer notifications queued at each step, and Zone Manager socket event fires.

## Output
Journey 3 (Technician repair workflow) fully implemented.

---

# Phase 24 — File Upload Handling (Repair Photos)

## Depends On
- Phase 23

## Objective
Let a Technician attach a photo as proof of repair (required by Phase 23's `resolve` endpoint).

## Scope
**IN SCOPE:** signed-upload-URL pattern against the object storage configured in Phase 02 (`FILE_STORAGE_*`).
**OUT OF SCOPE:** any other file type in the system (none is required elsewhere).

## API Work

### POST /api/technicians/me/uploads/repair-photo
- Authentication: Technician.
- Body: `{ fileName, contentType }` (`contentType` must be `image/jpeg` or `image/png`; max 10MB, enforced both client-side and via storage-provider policy).
- Business logic: generate a short-lived signed PUT URL scoped to a `repair-photos/` prefix; the technician's client uploads the binary directly to storage (not through the Express server, to avoid proxying large binaries).
- Success response: `{ uploadUrl, publicUrl }` — `publicUrl` is what gets passed as `repairPhotoUrl` to Phase 23's `resolve` endpoint.
- Error cases: `422 INVALID_CONTENT_TYPE`.

## Security
- Signed URLs expire in 5 minutes.
- Bucket policy: uploaded objects are private by default; `publicUrl` is served through a short-lived signed GET when displayed (Zone Manager UI, Phase 35/36) rather than being world-readable, unless the chosen storage provider's free tier only supports public buckets — if so, record that trade-off here rather than silently accepting it.

## Testing
- Request an upload URL, PUT a test image to it, confirm the object exists and `contentType` mismatch is rejected up front.

## Completion Criteria
- [ ] Signed-upload flow implemented and tested against the real storage provider in a dev bucket

## Verification
Request an upload URL → `curl -X PUT` a sample JPEG to it → confirm retrievable via the storage provider's console/API.

## Output
Technicians can attach real repair evidence, unblocking Phase 23's `resolve` step in production use.

---
# Phase 25 — Socket.io Real-Time Layer

## Depends On
- Phase 08, Phase 20, Phase 23

## Objective
Deliver instantaneous status updates to the Zone Manager's live dashboard table, per Journey 4 Step 2 and the tech-stack note on Socket.io.

## Backend Work
- `backend/src/sockets/index.ts`: attach Socket.io to the same HTTP server as Express; configure CORS via `SOCKET_CORS_ORIGIN`.
- Auth: on connection, client sends its JWT in the handshake `auth` payload; server verifies via Phase 07's `verifyToken`; reject connection (`disconnect`) if invalid or role is not `ZONE_MANAGER`/`ADMIN`/`OPERATOR` (customers/technicians do not need the live table).
- Room strategy: clients join a room per zone they're authorized for (`zone:<zoneId>`) — a Zone Manager only joins their own zone's room (`Zone.zoneManagerId` match); Admin/Operator may join any zone room they request.
- Events emitted (server → client), all already triggered at their origin in earlier phases — this phase wires the actual `io.to(room).emit(...)` calls into those existing service functions:
  - `feeder:status_changed` `{ feederId, zoneId, status }` (from Phase 20's jobs and Phase 23's resolve step)
  - `ticket:created` `{ ticketId, feederId, zoneId, type }` (from Phase 21)
  - `ticket:status_changed` `{ ticketId, status }` (from Phase 22/23)
  - `schedule:published` `{ scheduleId, zoneId }` (from Phase 19)

## Frontend Work (client wiring only — UI consumption is Phase 35)
- `frontend/src/lib/socket.ts`: a `socket.io-client` singleton that connects with the current session's token and exposes a `useSocketEvent(eventName, handler)` hook.

## Security
- Reject any connection without a valid, current-role-appropriate token.
- Never emit another zone's data into a room the connecting user isn't authorized for.

## Testing
- Connect with a valid Zone Manager token scoped to Zone A; trigger a Phase 20 job affecting Zone B's feeder → confirm the client receives nothing; trigger it for Zone A → confirm the event arrives.

## Completion Criteria
- [ ] Socket server authenticates and room-scopes every connection
- [ ] All four events fire correctly from their already-implemented origins

## Verification
Using two Socket.io test clients authenticated as Zone Managers of two different zones, trigger a status change in Zone A and confirm only the Zone A client receives the event.

## Output
Real-time backbone for the Zone Manager dashboard (Phase 35).

---

# Phase 26 — Twilio SMS Notification Service

## Depends On
- Phase 02, Phase 19, Phase 21, Phase 23

## Objective
Actually send the `Notification{status:PENDING}` rows that earlier phases have been queuing, via Twilio, and track delivery status.

## Backend Work
- `backend/src/services/notificationService.ts`: `sendPendingNotifications()` — batches `Notification{status:PENDING}` rows, calls Twilio's `messages.create({to, from: TWILIO_FROM_NUMBER, body})`, sets `status: SENT, sentAt: now` on success or `status: FAILED` on error (with the error reason logged, not exposed to the end user).
- Triggered two ways: (a) a node-cron job (`backend/src/jobs/sendNotificationsJob.ts`, runs every 30 seconds) that flushes the pending queue, decoupling notification sending from the request/response cycle of Phases 19/21/23; (b) directly invoked synchronously is explicitly **not** done, to avoid slowing down user-facing requests on a third-party API call.
- Retry policy: a `FAILED` notification is retried up to 3 times with backoff (tracked via a simple `attempts` counter — **schema amendment**: add `Notification.attempts (int, default 0)`, recorded here as an addition to Section 5.2).

## API Work

### GET /api/users/me/notifications
- Authentication: Authenticated.
- Purpose: in-app notification list (Section 7 item 7) mirroring what was sent by SMS, for users to review in-app.
- Query: `page`, `pageSize`, `unreadOnly`.

### POST /api/users/me/notifications/:id/read
- Marks an in-app notification as read (**schema amendment**: add `Notification.readAt (nullable)`).

## Security
- Twilio credentials only ever read server-side from env vars; never exposed to frontend.
- Phone numbers formatted/validated E.164 before send; malformed numbers logged and marked `FAILED` without crashing the batch.

## Testing
- Queue a notification, run `sendPendingNotifications()` against Twilio's test credentials/sandbox → confirm `status:SENT`; simulate a Twilio error (invalid number) → confirm `status:FAILED` with `attempts` incremented, not crashing the job.

## Completion Criteria
- [ ] Pending notifications are actually delivered via Twilio on a short interval
- [ ] Failures are retried up to 3 times then left `FAILED` for manual/admin review
- [ ] In-app notification list API works

## Verification
Trigger Phase 19's publish flow in a dev environment with Twilio sandbox credentials → confirm real SMS delivery (or sandbox log) within the cron interval.

## Output
Every notification promised in Journeys 1, 2, and 3 is now actually delivered, closing the loop opened by earlier phases.

---

# Phase 27 — Zone Manager Analytics API

## Depends On
- Phase 14, Phase 21, Phase 23

## Objective
Implement Journey 4 Step 4's two named analytics questions, plus basic ticket-status counts — nothing beyond what's specified (Section 7 item 6).

## API Work

### GET /api/zone-managers/me/dashboard
- Authentication: Zone Manager (scoped to their own `Zone` via `zoneManagerId`), Admin (any zone via `?zoneId=`).
- Response: sortable table data — all feeders in the zone with current `status`, `isCritical`, and open-ticket count; matches Journey 4 Step 2's Shadcn data-table requirement.
- Query: `status` filter (supports "view only Unexpected Faults" per Journey 4 Step 3).

### GET /api/zone-managers/me/analytics/feeder-failure-rate
- Purpose: "which Feeder line fails the most often."
- Business logic: `GROUP BY feederId` over `FeederStatusHistory` where `status = UNEXPECTED_FAULT`, `COUNT(*)`, within an optional `?from=&to=` date range; sorted descending.
- Response: `[{ feederId, feederName, faultCount }]`.

### GET /api/zone-managers/me/analytics/avg-resolution-time
- Purpose: "average time it takes for Technician Team [X] to resolve a ticket."
- Query: `?technicianId=` (optional — omit for zone-wide average).
- Business logic: average of `resolvedAt - assignedAt` over `OutageTicket{status: RESOLVED}` in the zone (join via `feederId → zoneId`), grouped by `technicianId` if not filtered.
- Response: `[{ technicianId, technicianName, avgResolutionMinutes, ticketCount }]`.

## Database Interaction
- Read-only aggregate queries over `Feeder`, `FeederStatusHistory`, `OutageTicket`.

## Testing
- Seed known fault history and resolved tickets with predictable timestamps → assert the aggregate numbers match hand-calculated expectations.

## Completion Criteria
- [ ] All three endpoints implemented, correctly scoped to the caller's zone, and tested against known seeded aggregates

## Verification
Seed 3 faults on Feeder A and 1 on Feeder B → confirm failure-rate endpoint ranks A above B with correct counts.

## Output
Journey 4 fully implemented at the API layer — ready for the Phase 36 UI.

---
# Phase 28 — Frontend Foundation (Next.js, Tailwind, Shadcn, Global Layout)

## Depends On
- Phase 01, Phase 05 (backend must expose `/api/health` for a connectivity smoke test)

## Objective
Establish the frontend's shared shell before any real page is built: theming, Shadcn UI installation, base layout, API client utility.

## Scope
**IN SCOPE:** Tailwind config/tokens, Shadcn UI init + base component installs (button, input, table, badge, dialog, form, toast/sonner, dropdown-menu, card, tabs), root layout, typed API client.
**OUT OF SCOPE:** any role-specific page.

## Frontend Work
- `frontend/src/app/layout.tsx`: root layout, font, `<Toaster />`.
- `frontend/src/lib/apiClient.ts`: thin `fetch` wrapper reading `NEXT_PUBLIC_API_BASE_URL`, auto-attaching the session's bearer token (once Phase 29 exists — stubbed here to accept a token param), parsing the `{success,data,error}` envelope from Phase 05, throwing a typed `ApiClientError` on `success:false`.
- Design tokens: status-badge color mapping shared across the app — `ONLINE=green`, `PLANNED_OUTAGE=yellow`, `UNEXPECTED_FAULT=red`, `MAINTENANCE=gray` (matches Journey 4 Step 2's badge colors exactly).

## Components
- `StatusBadge` (feeder/ticket status → colored Shadcn badge)
- `AppShell` (sidebar + header layout used by all authenticated portals)
- `LoadingSpinner`, `EmptyState`, `ErrorState` — generic, reused by every page from Phase 31 onward.

## Completion Criteria
- [ ] Tailwind + Shadcn fully configured; base components install without error
- [ ] `apiClient` successfully calls `GET /api/health` and renders the result on a scratch page (removed before Phase 29)
- [ ] `StatusBadge`, `AppShell`, and generic state components exist and are used nowhere yet (ready for later phases)

## Verification
Render a temporary page that calls `apiClient.get('/api/health')` and displays "ok" — confirms frontend↔backend connectivity end to end. Delete the temporary page once confirmed.

## Output
A themed, connected frontend shell ready for authentication (Phase 29).

---

# Phase 29 — Frontend Auth Integration (NextAuth Client, Login/Register Pages)

## Depends On
- Phase 07, Phase 09, Phase 10, Phase 28

## API Work (frontend-side, wiring to Phase 09/10 backend endpoints)
- Configure Auth.js `CredentialsProvider`: its `authorize()` calls `POST /api/auth/login` on the backend and, on success, returns `{id, name, role, isVerified}` for Auth.js to embed in the session JWT (shared-secret strategy from Phase 07).
- `session` callback exposes `role`, `isVerified`, `status` on `session.user` for use by route guards (Phase 30).

## Pages

### `/login`
- Access: public.
- Purpose: authenticate any role.
- Components: `LoginForm` (email/phone + password, Shadcn `Form` + `Input`).
- API dependency: Auth.js `signIn('credentials', ...)`.
- States: loading (submit disabled + spinner), error (`INVALID_CREDENTIALS` → inline message), success (redirect by role — see Phase 30's redirect table).
- Validation: required fields, client-side email/phone format check mirroring backend rules.

### `/register`
- Access: public.
- Purpose: Customer self-registration only (Phase 09 scope).
- Components: `RegisterForm`.
- API dependency: `POST /api/auth/register` directly (not via Auth.js, since it's account creation, not login), then auto-redirect to `/login?registered=true`.
- States: loading, field-level validation errors (`422` mapped per-field), duplicate-email/phone error (`409` shown inline), success.

### `/forgot-password`, `/reset-password`
- Wraps Phase 11's forgot/reset endpoints; same state conventions.

### `/verify-email`
- Handles the confirmation link from Phase 11; shows success/expired states.

## Completion Criteria
- [ ] All five pages implemented and functionally connected to their Phase 09–11 backend endpoints
- [ ] A successful login produces a working Auth.js session with `role` available client-side

## Verification
Register a new customer → confirm redirect to login → log in → confirm session contains `role: "CUSTOMER"` (inspect via a temporary debug output, then remove).

## Output
Working authentication UI for every role, ready for route-guarding (Phase 30).

---

# Phase 30 — Frontend Route Guards & Role-Based Middleware

## Depends On
- Phase 29

## Objective
Ensure each role only reaches its own portal, both for UX (correct redirect) and security-in-depth (backend already enforces this per Phase 08 — frontend guarding is a UX layer, never the sole line of defense).

## Frontend Work
- `frontend/src/middleware.ts` (Next.js middleware): reads the Auth.js session; for any path under `/customer`, `/operator`, `/technician`, `/zone-manager`, `/admin`, redirects to `/login` if unauthenticated, or to a role-appropriate "not authorized" page if the session role doesn't match the path prefix.
- Post-login redirect table:

| Role | Redirect Target |
|---|---|
| CUSTOMER | `/customer/dashboard` |
| OPERATOR | `/operator/control-room` |
| TECHNICIAN | `/technician/assignments` |
| ZONE_MANAGER | `/zone-manager/dashboard` |
| ADMIN | `/admin/overview` |

## Pages
### `/unauthorized`
- Access: any authenticated user landing on the wrong role's route.
- Purpose: explain the mismatch, link back to their own dashboard.

## Completion Criteria
- [ ] Every role-prefixed route is guarded
- [ ] Unauthenticated access to any protected route redirects to `/login`
- [ ] Cross-role access redirects to `/unauthorized`, never silently renders

## Verification
Log in as a Customer, manually navigate to `/admin/overview` → confirm redirect to `/unauthorized`, not a rendered admin page.

## Output
A safe navigational foundation for every role-specific page built in Phases 31–37.

---

# Phase 31 — Customer Dashboard & Status Pages

## Depends On
- Phase 16, Phase 17, Phase 30

## Pages

### `/customer/dashboard`
- Access: CUSTOMER.
- Purpose: Journey 1 Steps 1–2 — show current status and upcoming schedule per linked meter.
- Components: `MeterStatusCard` (per meter: `StatusBadge` + next planned window if any), `UpcomingScheduleList`.
- API dependencies: `GET /api/customers/me/meters`, `GET /api/customers/me/status`, `GET /api/customers/me/schedule`.
- States: loading (skeleton cards), empty (no linked meters → prompt to link one), error (`ErrorState` with retry).

### `/customer/meters`
- Purpose: link/unlink meters (Phase 16).
- Components: `LinkMeterForm`, `MeterList`.
- States: loading, empty, success/error toasts on link/unlink.

## Completion Criteria
- [ ] Dashboard correctly reflects live feeder status and schedule for a seeded customer with a linked meter
- [ ] Empty state correctly prompts an unlinked customer to add a meter

## Verification
Using a seeded customer + meter + an Operator-published schedule (Phases 09–19), log in as that customer and confirm the dashboard shows the correct upcoming window.

## Output
Journey 1 Steps 1–2 fully implemented.

---

# Phase 32 — Customer Outage Reporting UI

## Depends On
- Phase 21, Phase 31

## Pages

### `/customer/report-outage`
- Access: CUSTOMER, verified only (unverified users see a `VerificationRequiredBanner` instead of the form — matches backend's `403 VERIFICATION_REQUIRED`).
- Purpose: Journey 1 Steps 3–6.
- Components: `ReportOutageForm` (meter selector if multiple meters, optional description), `TicketStatusTimeline` (shows `REPORTED → ASSIGNED → EN_ROUTE → REPAIRING → RESOLVED` or the `AUTO_RESOLVED_NO_FAULT` explanatory message).
- API dependencies: `POST /api/customers/me/outage-reports`, `GET /api/customers/me/outage-reports`, `GET /api/customers/me/outage-reports/:id`.
- States: loading, submitting, the two distinct success outcomes (auto-resolved message vs. "technician being assigned" message — rendered differently per Journey 5 vs Journey 1), error.

### `/customer/reports`
- History list of the customer's own tickets with `StatusBadge`.

## Completion Criteria
- [ ] Reporting during a known planned outage shows the auto-resolved message, not a fake "technician assigned" message
- [ ] Reporting a genuine fault shows the tracked timeline and updates live as Phase 23 backend transitions occur (polling is acceptable here; Socket.io is reserved for the Zone Manager dashboard per Phase 25's scope)

## Verification
Reproduce both Phase 21 test scenarios (report during active slot vs. report on an online feeder) through the UI and confirm the correct message/timeline in each case.

## Output
Journey 1 Steps 3–6 and Journey 5 fully implemented from the customer's perspective.

---

# Phase 33 — Operator Control Room Dashboard UI

## Depends On
- Phase 18, Phase 19, Phase 30

## Pages

### `/operator/control-room`
- Access: OPERATOR.
- Purpose: Journey 2 in full.
- Components: `DeficitForm` (zone multi-select, `targetDeficitMW`, time window → calls draft), `DraftSlotsTable` (Shadcn data table, editable rows using Phase 19's `PATCH .../slots/:slotId`, with an `isCritical` feeder visually disabled from selection), `PublishConfirmDialog`.
- API dependencies: `POST /api/operator/schedules/draft`, `PATCH .../slots/:id`, `POST .../publish`, `POST .../cancel`.
- States: loading, drafting, shortfall warning (if `shortfallMW > 0`, shown prominently before publish is allowed), publish success (toast + table updates to "Published"), error.

### `/operator/schedules`
- History/list of past schedules with status filter.

## Completion Criteria
- [ ] Operator can generate a draft, see and adjust proposed feeder slots, and publish, exactly matching Journey 2 Steps 1–5
- [ ] Critical feeders are never selectable in the UI (defense in depth alongside the backend's hard invariant)

## Verification
Walk Journey 2 end to end in the UI against seeded zones/feeders; confirm a shortfall scenario surfaces its warning before allowing publish.

## Output
Journey 2 fully implemented.

---

# Phase 34 — Technician Mobile-Responsive App UI

## Depends On
- Phase 22, Phase 23, Phase 24, Phase 30

## Pages

### `/technician/assignments`
- Access: TECHNICIAN.
- Purpose: Journey 3 in full; must be usable on a phone screen (field workers).
- Components: `AssignmentCard` (fault summary, GPS/location text, action button matching current status: "Accept & En Route" → "Repairing" → "Resolve"), `PhotoUploadField` (wired to Phase 24's signed-URL flow), `ResolveForm` (notes + required photo).
- API dependencies: `GET /api/technicians/me/assignments`, the three action endpoints from Phase 23, the upload endpoint from Phase 24.
- States: loading, empty ("No assignments"), per-card action-in-progress, upload-in-progress, success toast + card moves to resolved history, error (e.g. missing photo blocks submit client-side too).
- Responsive behavior: single-column card list on mobile (primary target), unchanged on desktop — no dense table here, deliberately, per the field-use context.

### `/technician/history`
- Resolved-tickets list.

## Completion Criteria
- [ ] Full state-machine walk (accept → repairing → resolve with photo) works on a narrow (375px) viewport without horizontal scrolling
- [ ] Resolve is blocked client-side until a photo has successfully uploaded

## Verification
Using a seeded assigned ticket, walk the full flow in a mobile-width browser viewport; confirm the customer's status (Phase 31) updates to "Technician Dispatched" after Accept, matching Journey 3 Step 2.

## Output
Journey 3 fully implemented, mobile-first.

---

# Phase 35 — Zone Manager Live Grid Status Data Table UI

## Depends On
- Phase 25, Phase 27, Phase 30

## Pages

### `/zone-manager/dashboard`
- Access: ZONE_MANAGER (own zone), ADMIN (zone selector).
- Purpose: Journey 4 Steps 1–3 — exactly the sortable Shadcn data table described, not a map.
- Components: `LiveGridTable` (columns: Zone, Feeder, Status badge, open-ticket count; sortable, filterable by status — "Unexpected Faults" quick filter per Journey 4 Step 3), subscribes to Phase 25's socket events to update rows in place without a full refetch.
- API dependencies: `GET /api/zone-managers/me/dashboard` (initial load), Socket.io events (`feeder:status_changed`, `ticket:created`, `ticket:status_changed`) for live updates.
- States: loading, empty (zone has no feeders yet), live-update flash-highlight on row change, disconnected-socket fallback (falls back to polling every 30s with a visible "reconnecting" indicator).

## Completion Criteria
- [ ] Table matches Journey 4 Step 2's exact badge scheme (red/yellow/green)
- [ ] A backend-triggered status change (e.g. via Phase 20's cron job) appears in the table within the socket round-trip, without a manual page refresh
- [ ] "Unexpected Faults only" filter works

## Verification
With the dashboard open, trigger a fault via a seeded/manual DB update or Phase 21's reporting flow from another session, and confirm the row updates live.

## Output
Journey 4 Steps 1–3 fully implemented.

---

# Phase 36 — Zone Manager Analytics UI

## Depends On
- Phase 27, Phase 35

## Pages

### `/zone-manager/analytics`
- Access: ZONE_MANAGER, ADMIN.
- Purpose: Journey 4 Steps 4–5.
- Components: `FeederFailureRateChart` (bar chart, worst feeders first), `AvgResolutionTimeTable` (per technician), date-range picker feeding both.
- API dependencies: Phase 27's two analytics endpoints.
- States: loading, empty (no data in range), error.

## Completion Criteria
- [ ] Both analytics views render correctly against seeded historical data and match the hand-calculated values from Phase 27's tests

## Verification
Cross-check the UI's displayed numbers against the same seeded fixtures used in Phase 27's backend test.

## Output
Journey 4 fully implemented end to end.

---

# Phase 37 — Admin Panel UI

## Depends On
- Phase 13, Phase 14, Phase 15, Phase 30

## Pages

### `/admin/overview`
- Access: ADMIN. Summary counts (zones, feeders, users by role, open tickets).

### `/admin/zones`, `/admin/substations`, `/admin/feeders`
- Full CRUD UI over Phase 13/14, using Shadcn `Table` + `Dialog` forms; delete actions show a confirmation dialog and surface the backend's `409 ...HAS_DEPENDENTS` error clearly rather than a generic failure toast.

### `/admin/users`
- Full CRUD UI over Phase 15: create staff account form (role selector limited to the 4 staff roles), suspend/reactivate toggle, filter by role/status.

## Completion Criteria
- [ ] Every Phase 13–15 backend capability is reachable and usable from the Admin UI
- [ ] Destructive actions (delete) always confirm first and surface specific backend error reasons

## Verification
Perform one full CRUD cycle (create/edit/attempt-blocked-delete/successful-delete) for Zone, Feeder, and a staff User through the UI.

## Output
Admin can fully operate the system without direct database access.

---

# Phase 38 — Global Component Library Finalization & Notifications UI

## Depends On
- Phase 26, Phase 28, Phase 31–37

## Objective
Consolidate and finalize the reusable components sketched in Phase 28, and add the in-app notification bell using Phase 26's API.

## Components
- `NotificationBell` (header component, unread count badge, dropdown list, "mark read" action) — used in `AppShell`, visible to all authenticated roles.
- Confirm no duplicate ad-hoc status-badge/table/dialog implementations exist across Phases 31–37 (refactor any drift back onto the Phase 28 shared components — this phase's job is consolidation, not new features).

## Completion Criteria
- [ ] `NotificationBell` implemented and functional against Phase 26's API for at least one role
- [ ] No page duplicates a component that already exists in the shared library

## Verification
Trigger a notification (e.g. publish a schedule) → confirm it appears in the affected customer's bell within the polling/refresh interval.

## Output
A consistent, de-duplicated component layer and working in-app notifications across the whole app.

---
# Phase 39 — Security Hardening Pass

## Depends On
- Phase 08, Phase 09, Phase 10, Phase 24, Phase 26 (every phase that introduced a public or write endpoint)

## Objective
Apply a dedicated, cross-cutting security pass rather than leaving it entirely to the final phase (Rule: "implemented incrementally rather than left until the final phase" — this phase closes remaining gaps that individual phases intentionally deferred here).

## Scope
**IN SCOPE:** rate limiting, CORS finalization, input sanitization audit, secure headers, secrets audit, file-upload hardening review.
**OUT OF SCOPE:** new features.

## Backend Work
- **Rate limiting** (`express-rate-limit`, backed by the same Redis instance from Phase 06 for multi-instance correctness):
  - `POST /api/auth/register`: 5 requests / hour / IP.
  - `POST /api/auth/login`: 10 requests / 15 min / IP, plus 5 / 15 min / account (email/phone) to blunt credential stuffing.
  - `POST /api/auth/password/forgot`: 3 / hour / IP.
  - `POST /api/customers/me/outage-reports`: 10 / hour / account (prevents report spam).
  - All other authenticated write endpoints: a general 100 / min / account ceiling.
- **CORS:** lock down to explicit `NEXT_PUBLIC_API_BASE_URL`'s origin in production (no wildcard).
- **Secure headers:** `helmet()` defaults reviewed — confirm `Content-Security-Policy`, `X-Frame-Options`, `Strict-Transport-Security` are appropriate for an API-only server (frontend's CSP is Next.js's own concern, documented in Phase 45).
- **Input sanitization audit:** confirm every Prisma call uses parameterized queries (Prisma does this by default — audit for any raw `$queryRawUnsafe` usage and eliminate it) and every user-supplied string rendered in SMS/email templates is not used to construct HTML (SMS is plain text so injection risk is low, but audit anyway).
- **XSS:** confirm the frontend never uses `dangerouslySetInnerHTML` with user-supplied content anywhere across Phases 31–38.
- **File-upload security review:** re-confirm Phase 24's content-type/size limits are enforced server-side (not just client-side), and that signed URLs are scoped and short-lived.
- **Secrets audit:** grep the full repo for accidentally committed secrets; confirm `.env*` (non-example) never appears in git history.
- **Abuse prevention:** confirm `requireVerified` is applied everywhere a customer write action was specified as requiring it (Phase 21).

## Testing
- Automated test hitting `/api/auth/login` 11 times in 15 minutes from one IP → 11th request returns `429`.
- Grep-based CI check for `dangerouslySetInnerHTML` and `queryRawUnsafe`.

## Completion Criteria
- [ ] Rate limits implemented and tested on every endpoint listed above
- [ ] CORS locked to explicit origins in production config
- [ ] No raw/unparameterized SQL and no unsanitized HTML injection points found in the audit
- [ ] No secrets present in git history

## Verification
Run the rate-limit test; run the grep-based checks; manually review `helmet()` config output via response headers on a live request.

## Output
A hardened system with security controls applied at every layer they were deferred to, not just bolted on at the end.

---

# Phase 40 — Testing Suite (Backend, Frontend, E2E) + Seed Data

## Depends On
- All of Phases 01–38

## Objective
Formalize automated testing across the stack and populate realistic seed data for development, demos, and CI.

## Backend Testing
- **Unit tests:** `scheduleAlgorithm.ts` (Phase 18, already specified), password/JWT utilities (Phase 07), notification retry logic (Phase 26).
- **Service tests:** conflict-resolution engine (Phase 21), ticket state machine (Phase 23), analytics aggregates (Phase 27).
- **Controller/integration tests** (supertest against a test Postgres schema, migrated fresh per run): every endpoint listed in the Complete API Inventory (Section 10), covering at minimum: happy path, one validation-failure case, one authorization-failure case.
- **Authentication tests:** the full expired/invalid/suspended/unverified matrix from Phase 07.
- **Database tests:** cascading/blocked-delete behavior from Phases 13–15.

## Frontend Testing
- **Component tests** (React Testing Library): `StatusBadge`, `LoginForm`, `ReportOutageForm`, `DraftSlotsTable`, `LiveGridTable`.
- **Page behavior tests:** loading/empty/error states render correctly for at least one page per role.
- **Form validation tests:** register/login/report-outage client-side validation matches backend rules.
- **Protected-route tests:** Phase 30's middleware redirect behavior.

## End-to-End Testing (Playwright or Cypress, against a full docker-composed stack: Postgres, Redis, backend, frontend)
Cover the five journeys explicitly:
1. Customer: register → verify → login → link meter → view dashboard → report outage (both auto-resolved and genuine-fault variants).
2. Operator: login → draft schedule → adjust a slot → publish → confirm cache/notification side effects.
3. Technician: login → accept → start repair → upload photo → resolve.
4. Zone Manager: login → view live table → filter faults → view analytics.
5. Journey 5 specifically: publish a schedule, wait/simulate slot activation, have a customer on that feeder report an outage, assert auto-resolution.

## Test Data and Seeding
- `backend/prisma/seed.ts` (replacing Phase 04's placeholder): 2 Zones, each with 1 Zone Manager, 2 Substations, 6 Feeders (1 marked critical per zone), ~10 Meters distributed across feeders, 1 Operator, 1 Admin, 2 Technicians, 5 Customers (one per meter-owning pattern including a multi-meter customer), one already-published schedule with an active slot (to make Journey-5 testing immediate without waiting on cron timing), and a couple of historical resolved tickets for analytics testing.
- No real credentials: seeded users get a clearly-fake password (e.g. `DevPassword123!`) documented only in `backend/README.md` under a "local development only" heading, never committed as a production credential.
- `npm run db:reset` (Phase 04) now also runs this real seed.

## Completion Criteria
- [ ] Every endpoint in the Section 10 API Inventory has at least one integration test
- [ ] All 5 E2E journeys pass against a fresh seeded stack
- [ ] `npm run db:reset` produces a fully usable demo dataset

## Verification
Run the full test suite (`npm test` backend, `npm test` frontend, `npm run e2e`) against a clean CI environment; all green.

## Output
A tested, demo-ready system with confidence at unit, integration, and end-to-end levels.

---

# Phase 41 — Logging, Monitoring & Documentation

## Depends On
- Phase 05, Phase 40

## Objective
Add production-grade observability and finish the documentation set that supports ongoing development (not postponed entirely to the end, but finalized here once the full API/page surface is stable).

## Logging & Monitoring
- Structured request logging (already scaffolded in Phase 05's `requestLogger`) extended to include: method, path, status, duration, `userId` (if authenticated), request id.
- Authentication events (`LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGOUT`) and key business events (`SCHEDULE_PUBLISHED`, `TICKET_RESOLVED`, `NOTIFICATION_FAILED`) logged at `info`/`warn` level distinctly from routine request logs.
- Sensitive-data redaction: passwords, tokens, and Twilio/storage credentials must never appear in any log line — add a redaction utility applied to the logger's serializer.
- `GET /api/health` (Phase 05) extended to check DB connectivity (`SELECT 1`) and Redis connectivity, returning `503` if either is down, for use as the deployment platform's health check.

## Documentation
- `backend/README.md`: setup, env vars (link to Section 3's table), running migrations/seed, running tests, API doc link.
- `frontend/README.md`: setup, env vars, running dev server, running tests.
- `docs/api.md`: generated or hand-maintained from the Section 10 API Inventory — every endpoint with method/path/auth/purpose (a condensed version of what's already fully specified per-phase above).
- `docs/architecture.md`: the Section 4 diagram plus a short explanation of each component.
- `docs/database.md`: the Section 5 data model plus the ER relationships.
- `docs/user-journeys.md`: the five journeys from the source material, restated with links to the phases that implement each step.
- `docs/deployment.md`: placeholder pointing to Phase 42 (filled there).
- `docs/troubleshooting.md`: common local-dev issues (env var misconfiguration, Prisma migration drift, Redis/Twilio sandbox setup).

## Completion Criteria
- [ ] Health check reflects true DB/Redis status
- [ ] All business/auth events are distinctly logged and redacted of secrets
- [ ] All seven documentation files exist and are accurate as of the current phase

## Verification
Stop the Redis connection locally → confirm `/api/health` returns `503` with a clear (non-secret-leaking) reason; restore it → `200`.

## Output
An observable system with a documentation set sufficient for a new developer to onboard without reading source code first.

---

# Phase 42 — Deployment (Backend, Frontend, Database) + Final QA

## Depends On
- All prior phases

## Objective
Ship the system to a production-like environment and perform the final consistency audit (Section 47's rules) before considering the project complete.

## Backend Deployment
- Production environment variables set from Section 3's table (real values, never committed).
- `npx prisma migrate deploy` run against the production Neon database as part of the deploy pipeline (never `migrate dev` in production).
- Build: `tsc` compile step; start command runs the compiled output, not `ts-node`.
- Health check endpoint (Phase 41) wired into the hosting platform's readiness probe.
- CORS origin set to the exact production frontend domain.
- `CRON_ENABLED=true`, `SIMULATE_GRID=false` explicitly set in production.

## Frontend Deployment
- Build: `next build`.
- `NEXT_PUBLIC_API_BASE_URL` pointed at the production backend domain.
- `NEXTAUTH_URL`/`AUTH_SECRET` set to production values (matching the backend's `JWT_SECRET` per Phase 07's shared-secret rule).
- Deployment platform configured for Next.js App Router routing (server components supported).

## Database
- Confirm Neon production branch is separate from the dev branch used throughout Phases 01–41.
- Migration strategy: `migrate deploy` only, run before the new backend version receives traffic.
- Seed strategy: production does **not** run the Phase 40 demo seed; only genuinely required reference data (if any) is loaded via a separate, reviewed script.
- Backup: rely on Neon's built-in point-in-time recovery; document the retention window actually configured on the account.

## Final Consistency Audit (performed once, here, against the finished system)
- **API consistency:** every frontend `apiClient` call (Phases 29–38) matches an endpoint in Section 10.
- **Database consistency:** every API operation references a valid entity in Section 5/12.
- **Authorization consistency:** every protected endpoint in Section 10 has a role listed; cross-check against Phase 08's middleware usage.
- **Frontend consistency:** every page in Section 11 has an access role and is covered by Phase 30's guard.
- **Journey consistency:** re-walk all five journeys (Section 1, `docs/user-journeys.md`) end-to-end in the deployed environment.
- **Phase consistency:** confirm no phase's implementation ended up depending on a later phase's output (spot-check imports/calls).
- **Requirement consistency:** re-read the original source material line by line; confirm nothing was silently dropped.
- **Technology consistency:** confirm the deployed stack matches Section 3 exactly, with any deviations recorded in Section 7.

## Completion Criteria
- [ ] Backend and frontend both live and reachable at production URLs
- [ ] `GET /api/health` returns `200` in production
- [ ] All five journeys manually re-verified in production
- [ ] Final consistency audit checklist (above) fully checked off with no discrepancies

## Verification
Perform one full manual pass of each of the five journeys against the live production URLs using freshly created (non-seed) accounts.

## Output
A deployed, audited, production system implementing the full Load Shedding & Power Outage Management System as specified.

---
## 9. Final System Map

### Architecture
```text
Next.js Frontend (role-guarded portals)
        ↓  REST (fetch) + Socket.io client
Express.js API (RBAC middleware → Controllers → Services)
        ↓ Prisma ORM              ↓ Twilio SDK           ↓ Signed URLs
Neon PostgreSQL             Twilio SMS              Object Storage
        ↓
Upstash Redis (schedule cache)
```

### User Roles
Customer, Power Operator, Technician, Zone Manager, Admin (Section 2).

### Pages
See Section 11 — Complete Page Inventory.

### API Endpoints
See Section 10 — Complete API Inventory.

### Database Entities
User, CustomerProfile, Zone, Substation, Feeder, Meter, LoadSheddingSchedule, ScheduleFeederSlot, OutageTicket, TicketStatusHistory, FeederStatusHistory, Notification, AuditLog (Section 5, Section 12).

### Major Features
- Role-based authentication & RBAC (Phases 07–12)
- Grid hierarchy management: Zone → Substation → Feeder → Meter (Phases 13–16)
- Fair-rotation load-shedding scheduling engine (Phases 18–20)
- Planned-vs-fault conflict resolution engine (Phase 21)
- Technician dispatch & repair workflow (Phases 22–24)
- Real-time Zone Manager live grid dashboard (Phase 25, 35)
- SMS notifications (Phase 26)
- Zone Manager analytics (Phase 27, 36)
- Full Admin console (Phases 13–15, 37)

### Integrations
Neon PostgreSQL, Upstash Redis, Twilio SMS, Auth.js/NextAuth, object storage (repair photos).

---

## 10. Complete API Inventory

| Method | Endpoint | Auth | Role | Purpose | Phase |
|---|---|---|---|---|---|
| GET | /api/health | Public | — | Liveness/readiness check | 05, 41 |
| POST | /api/auth/register | Public | — | Customer self-registration | 09 |
| POST | /api/auth/login | Public | — | Login, issue session token | 10 |
| POST | /api/auth/logout | Auth | Any | Logout / audit log | 10 |
| GET | /api/auth/session | Auth | Any | Current session user | 10 |
| POST | /api/auth/verify-email/request | Auth | Any | Send verification link | 11 |
| POST | /api/auth/verify-email/confirm | Public | — | Confirm verification token | 11 |
| POST | /api/auth/password/forgot | Public | — | Request reset link | 11 |
| POST | /api/auth/password/reset | Public | — | Reset password with token | 11 |
| GET | /api/users/me | Auth | Any | Own profile | 12 |
| PATCH | /api/users/me | Auth | Any | Update own profile | 12 |
| POST | /api/users/me/password | Auth | Any | Change password | 12 |
| GET | /api/users/me/notifications | Auth | Any | In-app notification list | 26 |
| POST | /api/users/me/notifications/:id/read | Auth | Any | Mark notification read | 26 |
| POST | /api/admin/zones | Auth | Admin | Create zone | 13 |
| GET | /api/admin/zones | Auth | Admin | List zones | 13 |
| GET | /api/admin/zones/:id | Auth | Admin | Zone detail | 13 |
| PATCH | /api/admin/zones/:id | Auth | Admin | Update zone | 13 |
| DELETE | /api/admin/zones/:id | Auth | Admin | Delete zone | 13 |
| POST | /api/admin/substations | Auth | Admin | Create substation | 14 |
| GET | /api/admin/substations | Auth | Admin | List substations | 14 |
| GET | /api/admin/substations/:id | Auth | Admin | Substation detail | 14 |
| PATCH | /api/admin/substations/:id | Auth | Admin | Update substation | 14 |
| DELETE | /api/admin/substations/:id | Auth | Admin | Delete substation | 14 |
| POST | /api/admin/feeders | Auth | Admin | Create feeder | 14 |
| GET | /api/admin/feeders | Auth | Admin | List feeders | 14 |
| GET | /api/admin/feeders/:id | Auth | Admin | Feeder detail | 14 |
| PATCH | /api/admin/feeders/:id | Auth | Admin | Update feeder / status | 14 |
| DELETE | /api/admin/feeders/:id | Auth | Admin | Delete feeder | 14 |
| POST | /api/admin/users | Auth | Admin | Create staff account | 15 |
| GET | /api/admin/users | Auth | Admin | List users | 15 |
| GET | /api/admin/users/:id | Auth | Admin | User detail | 15 |
| PATCH | /api/admin/users/:id | Auth | Admin | Update user | 15 |
| DELETE | /api/admin/users/:id | Auth | Admin | Soft-delete user | 15 |
| POST | /api/admin/users/:id/suspend | Auth | Admin | Suspend account | 15 |
| POST | /api/admin/users/:id/reactivate | Auth | Admin | Reactivate account | 15 |
| POST | /api/admin/meters | Auth | Admin | Pre-register meter | 16 |
| POST | /api/customers/me/meters | Auth | Customer | Link meter | 16 |
| GET | /api/customers/me/meters | Auth | Customer | List own meters | 16 |
| DELETE | /api/customers/me/meters/:id | Auth | Customer | Unlink meter | 16 |
| GET | /api/zones | Auth | Any | Zone lookup list | 17 |
| GET | /api/feeders | Auth | Any | Feeder lookup list | 17 |
| GET | /api/customers/me/status | Auth | Customer | Current feeder status | 17 |
| GET | /api/customers/me/schedule | Auth | Customer | Upcoming schedule | 17 |
| POST | /api/operator/schedules/draft | Auth | Operator | Generate draft schedule | 19 |
| GET | /api/operator/schedules/:id | Auth | Operator, ZM, Admin | Schedule detail | 19 |
| PATCH | /api/operator/schedules/:id/slots/:slotId | Auth | Operator | Adjust proposed slot | 19 |
| POST | /api/operator/schedules/:id/publish | Auth | Operator | Publish schedule | 19 |
| POST | /api/operator/schedules/:id/cancel | Auth | Operator | Cancel schedule | 19 |
| POST | /api/customers/me/outage-reports | Auth | Customer | Report outage | 21 |
| GET | /api/customers/me/outage-reports | Auth | Customer | Own ticket history | 21 |
| GET | /api/customers/me/outage-reports/:id | Auth | Customer | Own ticket detail | 21 |
| GET | /api/operators/outage-reports | Auth | Operator, ZM | Unassigned fault queue | 22 |
| POST | /api/operators/outage-reports/:id/assign | Auth | Operator, ZM | Assign technician | 22 |
| POST | /api/operators/outage-reports/:id/cancel | Auth | Operator, ZM | Cancel ticket | 23 |
| GET | /api/technicians/me/assignments | Auth | Technician | Own assignments | 22 |
| POST | /api/technicians/me/assignments/:id/accept | Auth | Technician | Accept & en route | 23 |
| POST | /api/technicians/me/assignments/:id/start-repair | Auth | Technician | Start repair | 23 |
| POST | /api/technicians/me/assignments/:id/resolve | Auth | Technician | Resolve with photo | 23 |
| POST | /api/technicians/me/uploads/repair-photo | Auth | Technician | Get signed upload URL | 24 |
| GET | /api/zone-managers/me/dashboard | Auth | Zone Manager, Admin | Live grid table data | 27 |
| GET | /api/zone-managers/me/analytics/feeder-failure-rate | Auth | Zone Manager, Admin | Failure-rate analytics | 27 |
| GET | /api/zone-managers/me/analytics/avg-resolution-time | Auth | Zone Manager, Admin | Resolution-time analytics | 27 |

---

## 11. Complete Page Inventory

| Route | Access | Purpose | Main APIs | Phase |
|---|---|---|---|---|
| /login | Public | Login for any role | POST /api/auth/login | 29 |
| /register | Public | Customer self-registration | POST /api/auth/register | 29 |
| /forgot-password | Public | Request password reset | POST /api/auth/password/forgot | 29 |
| /reset-password | Public | Set new password | POST /api/auth/password/reset | 29 |
| /verify-email | Public | Confirm email verification | POST /api/auth/verify-email/confirm | 29 |
| /unauthorized | Authenticated | Wrong-role landing page | — | 30 |
| /customer/dashboard | Customer | Status + upcoming schedule | GET .../status, .../schedule | 31 |
| /customer/meters | Customer | Link/unlink meters | .../meters | 31 |
| /customer/report-outage | Customer (verified) | Report an outage | POST .../outage-reports | 32 |
| /customer/reports | Customer | Ticket history | GET .../outage-reports | 32 |
| /operator/control-room | Operator | Generate & publish schedules | .../schedules/* | 33 |
| /operator/schedules | Operator | Schedule history | GET .../schedules | 33 |
| /technician/assignments | Technician | Fault queue & repair workflow | .../assignments/* | 34 |
| /technician/history | Technician | Resolved tickets | GET .../assignments | 34 |
| /zone-manager/dashboard | Zone Manager, Admin | Live grid status table | GET .../dashboard + sockets | 35 |
| /zone-manager/analytics | Zone Manager, Admin | Failure-rate & resolution analytics | .../analytics/* | 36 |
| /admin/overview | Admin | System summary counts | multiple | 37 |
| /admin/zones | Admin | Zone CRUD | /api/admin/zones | 37 |
| /admin/substations | Admin | Substation CRUD | /api/admin/substations | 37 |
| /admin/feeders | Admin | Feeder CRUD | /api/admin/feeders | 37 |
| /admin/users | Admin | Staff account CRUD | /api/admin/users | 37 |

---

## 12. Complete Database Inventory

| Entity | Purpose | Relationships | Phase |
|---|---|---|---|
| User | All accounts, all roles | 1:1 CustomerProfile; referenced by Zone, OutageTicket, Notification, AuditLog | 03 |
| CustomerProfile | Customer-specific data | 1:many Meter | 03 |
| Zone | Top of grid hierarchy | 1:many Substation, Feeder; 0:1 zoneManager (User) | 03 |
| Substation | Physical substation | 1:many Feeder | 03 |
| Feeder | Sheddable unit of the grid | 1:many Meter, ScheduleFeederSlot, FeederStatusHistory | 03 |
| Meter | Customer's connection point | many:1 Feeder, CustomerProfile; 1:many OutageTicket | 03 |
| LoadSheddingSchedule | A planned shedding plan | 1:many ScheduleFeederSlot | 03 |
| ScheduleFeederSlot | A feeder's planned-off window | many:1 Schedule, Feeder | 03 |
| OutageTicket | A customer-reported fault or conflict | many:1 Meter, Customer, Feeder, Technician; 1:many TicketStatusHistory | 03 |
| TicketStatusHistory | Audit trail of ticket transitions | many:1 OutageTicket | 03 |
| FeederStatusHistory | Audit trail of feeder status changes | many:1 Feeder | 03 |
| Notification | Queued/sent SMS + in-app messages | many:1 User; optional link to Ticket/Schedule | 03, 26 (fields added) |
| AuditLog | Generic admin/security audit trail | many:1 User (actor) | 03 |

---

## 13. Feature → API → Page Mapping

```text
Customer status & schedule viewing
    → GET /api/customers/me/status, /schedule
    → /customer/dashboard
    → Feeder, ScheduleFeederSlot
    → CUSTOMER

Outage reporting + conflict resolution
    → POST /api/customers/me/outage-reports
    → /customer/report-outage
    → OutageTicket, ScheduleFeederSlot, TicketStatusHistory
    → CUSTOMER

Fair-rotation schedule generation & publishing
    → POST /api/operator/schedules/draft, .../publish
    → /operator/control-room
    → LoadSheddingSchedule, ScheduleFeederSlot, Feeder, Notification
    → OPERATOR

Technician dispatch & repair
    → POST /api/operators/outage-reports/:id/assign, /api/technicians/.../accept|start-repair|resolve
    → /technician/assignments
    → OutageTicket, TicketStatusHistory, Feeder
    → OPERATOR (assign), TECHNICIAN (repair)

Live grid monitoring
    → GET /api/zone-managers/me/dashboard + Socket.io events
    → /zone-manager/dashboard
    → Feeder, OutageTicket
    → ZONE_MANAGER

Grid analytics
    → GET /api/zone-managers/me/analytics/*
    → /zone-manager/analytics
    → FeederStatusHistory, OutageTicket
    → ZONE_MANAGER

System administration
    → /api/admin/* (zones, substations, feeders, users)
    → /admin/*
    → Zone, Substation, Feeder, User
    → ADMIN
```

---

## 14. Final Dependency Graph

```text
Phase 01 (Repo Foundation)
  ↓
Phase 02 (Env Config)
  ↓
Phase 03 (Prisma Schema)
  ↓
Phase 04 (Migrations & Seed Scaffold)
  ↓
Phase 05 (Express Bootstrap)
  ├── Phase 06 (Redis)
  └── Phase 07 (Auth Strategy)
        ↓
      Phase 08 (RBAC Middleware)
        ↓
      Phase 09 (Register) → Phase 10 (Login/Logout/Session) → Phase 11 (Verify/Reset)
        ↓
      Phase 12 (Profile APIs)
        ↓
      Phase 13 (Zones) → Phase 14 (Substations/Feeders) → Phase 15 (Staff Users)
        ↓
      Phase 16 (Meters) → Phase 17 (Read APIs)
        ↓
      Phase 18 (Algorithm) → Phase 19 (Schedule API, needs Phase 06) → Phase 20 (Cron Jobs)
        ↓
      Phase 21 (Outage Reporting + Conflict Resolution)
        ↓
      Phase 22 (Assignment) → Phase 23 (Ticket Workflow) → Phase 24 (File Upload)
        ↓
      Phase 25 (Socket.io) ── Phase 26 (Twilio SMS) ── Phase 27 (Analytics)
        ↓
Phase 28 (Frontend Foundation, needs Phase 05)
  ↓
Phase 29 (Auth UI, needs Phase 07/09/10)
  ↓
Phase 30 (Route Guards)
  ├── Phase 31 (Customer Dashboard, needs 16/17) → Phase 32 (Reporting UI, needs 21)
  ├── Phase 33 (Operator UI, needs 18/19)
  ├── Phase 34 (Technician UI, needs 22/23/24)
  ├── Phase 35 (ZM Live Table, needs 25/27) → Phase 36 (ZM Analytics, needs 27)
  └── Phase 37 (Admin UI, needs 13/14/15)
        ↓
      Phase 38 (Component Consolidation + Notifications UI, needs 26 + 31–37)
        ↓
      Phase 39 (Security Hardening, needs all write endpoints)
        ↓
      Phase 40 (Testing + Seed Data, needs everything)
        ↓
      Phase 41 (Logging, Monitoring, Docs)
        ↓
      Phase 42 (Deployment + Final QA)
```

---

## 15. Final Pre-Implementation Checklist

- [x] Entire project description was analyzed
- [x] Overall user journey was analyzed (all 5 journeys)
- [x] Tech stack was analyzed (Section 3, used exactly as specified)
- [x] Every user role is documented (Section 2)
- [x] Every major feature is documented (Section 9)
- [x] Database is planned (Section 5, Phases 03–04)
- [x] Backend architecture is planned (Phase 05)
- [x] Every API endpoint is planned (Section 10, per-phase detail)
- [x] Authentication is planned (Phase 07, 09–11)
- [x] Authorization is planned (Phase 08)
- [x] Validation is planned (per-endpoint, every phase)
- [x] Error handling is planned (Phase 05 envelope + per-endpoint error cases)
- [x] Security is planned (Phase 39, plus incremental measures per phase)
- [x] Every frontend page is planned (Section 11)
- [x] Frontend components are planned (Phase 28, 38)
- [x] Frontend/API integration is mapped (Section 13)
- [x] Testing is planned (Phase 40)
- [x] Deployment is planned (Phase 42)
- [x] Environment variables are documented (Phase 02)
- [x] Documentation requirements are planned (Phase 41)
- [x] Git strategy is included (Section 16, below)
- [x] At least 30 meaningful phases exist (42 phases)
- [x] Every phase has dependencies (Depends On, every phase)
- [x] Every phase has completion criteria
- [x] Every phase has verification steps
- [x] API inventory is complete (Section 10)
- [x] Page inventory is complete (Section 11)
- [x] Database inventory is complete (Section 12)
- [x] Feature/API/page mapping is complete (Section 13)
- [x] Dependency graph is complete (Section 14)
- [x] No major requirement from the source material is silently omitted (cross-checked against all 5 journeys and both listed tech-stack blocks)

---

## 16. Git / Version Control Plan

Commit at phase boundaries with meaningful, scoped messages, e.g.:

```text
chore: initialize repo structure and tooling (Phase 01)
chore: add environment config and validation (Phase 02)
feat: add complete Prisma schema (Phase 03)
chore: add initial migration and seed scaffold (Phase 04)
feat: bootstrap Express app with error handling (Phase 05)
feat: add Redis caching utility (Phase 06)
feat: define auth strategy and JWT utilities (Phase 07)
feat: add RBAC middleware (Phase 08)
feat: implement customer registration (Phase 09)
feat: implement login/logout/session (Phase 10)
feat: implement password reset and email verification (Phase 11)
feat: add user profile APIs (Phase 12)
feat: add admin zone management APIs (Phase 13)
feat: add admin substation and feeder APIs (Phase 14)
feat: add admin staff user management APIs (Phase 15)
feat: add meter registration and linking APIs (Phase 16)
feat: add zone/feeder/schedule read APIs (Phase 17)
feat: implement fair-rotation scheduling algorithm (Phase 18)
feat: add schedule draft/publish/cancel APIs (Phase 19)
feat: add node-cron slot lifecycle jobs (Phase 20)
feat: implement outage reporting and conflict resolution (Phase 21)
feat: add technician assignment APIs (Phase 22)
feat: add technician ticket workflow APIs (Phase 23)
feat: add repair photo upload flow (Phase 24)
feat: add Socket.io real-time layer (Phase 25)
feat: add Twilio SMS notification service (Phase 26)
feat: add zone manager analytics APIs (Phase 27)
chore: scaffold frontend foundation and shared components (Phase 28)
feat: implement frontend auth pages (Phase 29)
feat: add route guards and role-based middleware (Phase 30)
feat: implement customer dashboard (Phase 31)
feat: implement customer outage reporting UI (Phase 32)
feat: implement operator control room UI (Phase 33)
feat: implement technician mobile UI (Phase 34)
feat: implement zone manager live grid UI (Phase 35)
feat: implement zone manager analytics UI (Phase 36)
feat: implement admin panel UI (Phase 37)
chore: consolidate components and add notifications UI (Phase 38)
chore: security hardening pass (Phase 39)
test: add full backend/frontend/e2e test suite and seed data (Phase 40)
chore: add logging, monitoring, and documentation (Phase 41)
chore: deploy to production and complete final QA (Phase 42)
```

Never commit: `.env` (non-example) files, real secrets, `node_modules`, `.next`/`dist` build output, test artifacts, uploaded repair photos.

---

*End of implementation plan. 42 phases, fully dependency-ordered, covering database, backend, APIs, authentication, frontend, business logic, integrations, validation, security, testing, and deployment for the Load Shedding & Power Outage Management System.*
