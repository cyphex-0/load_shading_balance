# Load Shedding & Power Outage Management System — Unified Implementation Plan

> **Purpose:** This is the single authoritative implementation roadmap produced by semantically reconciling the three supplied implementation plans for the same system. It is intentionally not a concatenation. It selects one coherent architecture, preserves unique high-value details, resolves contradictions, removes redundant alternatives, and adds only engineering decisions required to make the system implementable and testable.
>
> **Execution rule:** An AI coding agent should implement the phases in order, satisfy each phase's prerequisites and completion criteria, and treat the contracts in this document as binding unless a recorded decision changes them.

## 1. Implementation Plan Overview

### 1.1 System purpose

The system automates fair load-shedding allocation across zones/feeders, exposes published outage schedules to customers, and separates planned outages from unexpected faults so technicians are dispatched only for genuine faults.

### 1.2 Non-negotiable functional rules

1. Critical feeders are never selected by the load-shedding scheduler.
2. A feeder/area must not be cut twice in the same calendar day.
3. Customers can view current power status and upcoming published schedules.
4. A customer outage report during an active planned outage creates **no dispatchable outage ticket** and no technician assignment.
5. An outage report outside an active planned outage creates an unexpected-fault ticket and acknowledgement notification.
6. Technician workflow is `ASSIGNED → EN_ROUTE → REPAIRING → RESOLVED`, with repair evidence required.
7. Resolution updates the effective feeder state and notifies affected customers.
8. Zone Manager monitoring uses sortable/filterable tables; no map/GIS dependency is introduced.
9. Published schedules are cached in Upstash Redis.
10. Socket.io provides scoped real-time updates; REST/database state remains authoritative after reconnect.
11. Node-cron runs the explicitly required background jobs and must be safe with multiple runtime replicas.
12. Backend validation, authorization, and ownership checks are authoritative; frontend checks are UX only.

### 1.3 Roles

| Role | Registration | Scope | Primary capabilities |
|---|---|---|---|
| Customer | Self-register | Own profile/meters | View status/schedule, report outages, notifications |
| Power Operator | Admin-created | Operational/global | Generate/review/publish schedules, operational oversight |
| Technician | Admin-created | Assigned zone/tickets | Accept, repair, upload proof, resolve |
| Zone Manager | Admin-created | One assigned zone | Live grid, fault oversight, analytics, upgrade requests |
| Admin | Seeded/admin-created | Global | Users, topology, audit, notifications, configuration |

## 2. Semantic Merge Decisions

| Topic | Reconciled decision |
|---|---|
| Architecture | Modular monorepo: Next.js App Router + Express REST API + Socket.io + node-cron + Prisma/Neon + Upstash Redis + Twilio |
| API | One versioned API namespace: `/api/v1`; no duplicate unversioned business APIs |
| Auth | Auth.js/NextAuth provides the web session; Express remains the authorization boundary. Credentials authentication produces a short-lived backend access token stored inside the Auth.js session; clients never persist it in localStorage. |
| DB hierarchy | Preserve `Zone → Substation → Feeder → Meter`; allow `CustomerProfile → many Meter` because multiple meters are a valid real-world case. |
| User state | `PENDING_VERIFICATION / ACTIVE / SUSPENDED`; customer-only write operations require verified/active state. Email verification/reset remain an abstraction point because no email provider is in the specified stack. |
| Planned-conflict reporting | Preserve the smartest behavior: do not create a dispatchable ticket. Record a lightweight `OutageReportEvent` audit record instead, plus an informational in-app/SMS notification. |
| Fault history | Use explicit `TicketStatusHistory` and `FeederStatusHistory`; these support analytics and auditability without duplicating fault tables. |
| Repair photos | Use a storage-neutral `Attachment` metadata model and signed upload/download URLs. |
| Scheduling | Pure deterministic fairness engine; persistence/publish are separate services. |
| Fairness | Rank by longest time since last cut, then rolling 7-day cut count, then oldest last scheduled start, then feeder code. Critical feeders and same-day overlaps are hard exclusions. |
| Technician assignment | Automatic same-zone assignment selects the least-busy eligible technician; operator/manager/admin can override. Assignment is transactionally protected against double assignment. |
| Notifications | DB-backed in-app notifications + Twilio SMS. No browser push provider is introduced. Notification failure does not roll back a committed domain transaction. |
| Background jobs | node-cron only, with Redis distributed locks and idempotent jobs; no message queue/microservice. |
| Deletes | Prefer deactivation/soft-delete for users; destructive topology deletes are blocked when dependent records exist and return `409`, rather than silently cascading operational history away. |
| File limits | Repair-photo uploads are JPEG/PNG only, max 5 MB application limit; signed URLs expire quickly. |
| Deployment | Provider-neutral application deployment; Express must run as a long-lived process for Socket.io. |

## 3. Final Architecture

```text
Browser
  │
  ├── Next.js App Router UI
  │     ├── Auth.js session
  │     ├── Server components / server actions / API client
  │     └── Socket.io client for live dashboards
  │
  └────────────── HTTPS / WebSocket ──────────────┐
                                                  ▼
                                      Express REST API
                                      `/api/v1/*`
                                      ├── auth / RBAC middleware
                                      ├── validation / errors
                                      ├── domain controllers
                                      ├── domain services
                                      ├── Socket.io server
                                      └── node-cron orchestration
                                           │
                     ┌─────────────────────┼────────────────────┐
                     ▼                     ▼                    ▼
               Prisma ORM             Upstash Redis          Twilio
                     │               cache + locks             SMS
                     ▼
               Neon PostgreSQL
                     │
                     ▼
        S3-compatible private object storage
             (repair photo evidence)
```

### 3.1 Core design principles

- Controllers contain transport logic; services contain business rules.
- Domain services do not know about Express request/response objects.
- Prisma access is centralized in repositories/data-access helpers where useful; direct Prisma use is permitted inside cohesive domain services for simple operations.
- No raw SQL unless parameterization and explicit review are justified.
- Redis is a cache and coordination mechanism, never the source of truth.
- Socket.io events are hints for UI refresh; a reconnect always reconciles from REST.
- Cron handlers call domain services and never duplicate domain logic.
- External services are adapter interfaces (`Twilio`, object storage) with test doubles.

## 4. Technology Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js App Router |
| Styling/UI | Tailwind CSS + Shadcn UI |
| Backend | Node.js + Express.js |
| Realtime | Socket.io |
| Jobs | node-cron |
| Database | Neon Serverless PostgreSQL |
| ORM | Prisma |
| Cache/locks | Upstash Redis |
| Authentication | Auth.js / NextAuth |
| SMS | Twilio |
| File storage | S3-compatible object storage via adapter |
| Testing | Vitest, Supertest, React Testing Library, Playwright |
| CI | GitHub Actions |
| API style | REST + JSON, `/api/v1` |

### 4.1 Explicit non-goals

Do not introduce microservices, GraphQL, message queues, GIS/map libraries, browser push providers, or additional AI agents unless an approved architecture decision changes this plan.

## 5. Repository Structure

```text
/
├── implementation.md
├── README.md
├── .gitignore
├── frontend/
│   ├── app/
│   │   ├── (public)/
│   │   ├── (auth)/
│   │   ├── customer/
│   │   ├── operator/
│   │   ├── technician/
│   │   ├── manager/
│   │   └── admin/
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   │   ├── api/
│   │   ├── auth/
│   │   ├── realtime/
│   │   └── validation/
│   ├── types/
│   └── tests/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── middleware/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── users/
│   │   │   ├── grid/
│   │   │   ├── schedules/
│   │   │   ├── outages/
│   │   │   ├── notifications/
│   │   │   ├── analytics/
│   │   │   ├── upgrades/
│   │   │   ├── audit/
│   │   │   ├── realtime/
│   │   │   └── jobs/
│   │   ├── integrations/
│   │   │   ├── redis/
│   │   │   ├── twilio/
│   │   │   └── storage/
│   │   ├── server/
│   │   └── utils/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   └── seed/
│   └── tests/
├── docs/
│   ├── architecture.md
│   ├── database.md
│   ├── api/
│   ├── security.md
│   ├── deployment.md
│   └── decisions.md
└── .github/
    └── workflows/
        └── ci.yml
```

## 6. Database Architecture

### 6.1 Enums

```text
UserRole:
  CUSTOMER | OPERATOR | TECHNICIAN | ZONE_MANAGER | ADMIN

UserStatus:
  PENDING_VERIFICATION | ACTIVE | SUSPENDED

FeederStatus:
  ONLINE | PLANNED_OUTAGE | UNEXPECTED_FAULT | MAINTENANCE

ScheduleStatus:
  DRAFT | PUBLISHED | ACTIVE | COMPLETED | CANCELLED

SlotStatus:
  PENDING | ACTIVE | COMPLETED | CANCELLED

TicketType:
  UNPLANNED_FAULT | PLANNED_CONFLICT

TicketStatus:
  REPORTED | AUTO_RESOLVED_NO_FAULT | ASSIGNED | EN_ROUTE |
  REPAIRING | RESOLVED | CANCELLED

FaultType:
  TRANSFORMER | LINE_DOWN | CABLE_FAULT | METER_FAULT | OTHER

NotificationChannel:
  SMS | IN_APP

NotificationStatus:
  PENDING | SENDING | SENT | FAILED | DELIVERED

UpgradeRequestStatus:
  PENDING | APPROVED | REJECTED | COMPLETED
```

### 6.2 Entity specification

#### User

| Field | Type | Constraints |
|---|---|---|
| id | UUID | PK, generated |
| name | VARCHAR(255) | NOT NULL |
| email | VARCHAR(255) | NOT NULL, UNIQUE |
| phone | VARCHAR(20) | NOT NULL for customer SMS, UNIQUE when present |
| passwordHash | VARCHAR(255) | NOT NULL |
| role | UserRole | NOT NULL |
| status | UserStatus | NOT NULL, default `PENDING_VERIFICATION` |
| isVerified | BOOLEAN | NOT NULL, default `false` |
| lastLoginAt | TIMESTAMPTZ | nullable |
| zoneId | UUID | nullable FK → Zone; required for Technician/Zone Manager |
| deletedAt | TIMESTAMPTZ | nullable; used for soft deletion |
| createdAt/updatedAt | TIMESTAMPTZ | NOT NULL/default now |

Indexes: email unique, phone unique, role, status, zoneId.

#### CustomerProfile

`id UUID PK`, `userId UUID UNIQUE FK → User`, `address TEXT nullable`, timestamps.

Relationship: one user with role CUSTOMER has one profile.

#### Zone

`id UUID PK`, `name VARCHAR(255) UNIQUE`, `code VARCHAR(50) UNIQUE`, `description TEXT nullable`, `zoneManagerId UUID nullable UNIQUE FK → User`, `isActive BOOLEAN default true`, timestamps.

A zone has many substations/feeders; at most one assigned Zone Manager.

#### Substation

`id UUID PK`, `zoneId UUID FK`, `name VARCHAR(255)`, `code VARCHAR(50) UNIQUE`, `location TEXT nullable`, `capacityMW DECIMAL(10,2) nullable`, `isActive BOOLEAN default true`, timestamps.

Indexes: zoneId, code.

#### Feeder

`id UUID PK`, `zoneId UUID FK`, `substationId UUID nullable FK`, `name VARCHAR(255)`, `code VARCHAR(50) UNIQUE`, `capacityMW DECIMAL(10,2) nullable`, `isCritical BOOLEAN default false`, `status FeederStatus default ONLINE`, `isActive BOOLEAN default true`, timestamps.

Indexes: zoneId, substationId, code, status, isCritical.

Rules:
- A feeder cannot be scheduled when inactive.
- `isCritical=true` is an absolute scheduler exclusion.

#### Meter

`id UUID PK`, `meterNumber VARCHAR(100) UNIQUE`, `feederId UUID FK`, `customerProfileId UUID FK nullable`, `address TEXT nullable`, `isActive BOOLEAN default true`, timestamps.

Indexes: meterNumber unique, feederId, customerProfileId.

A customer may own multiple meters. A meter belongs to at most one customer at a time.

#### GridStatus

Singleton operational snapshot:
`id UUID PK`, `totalCapacityMW DECIMAL(10,2)`, `currentDemandMW DECIMAL(10,2)`, `deficitMW DECIMAL(10,2) default 0`, `updatedAt TIMESTAMPTZ`.

Constraint: exactly one active row for the application environment.

#### LoadSheddingSchedule

`id UUID PK`, `title VARCHAR(255)`, `targetDeficitMW DECIMAL(10,2)`, `status ScheduleStatus default DRAFT`, `notes TEXT nullable`, `createdByOperatorId UUID FK → User`, `publishedAt TIMESTAMPTZ nullable`, timestamps.

Indexes: status, createdByOperatorId, publishedAt.

#### ScheduleFeederSlot

`id UUID PK`, `scheduleId UUID FK`, `feederId UUID FK`, `startTime TIMESTAMPTZ`, `endTime TIMESTAMPTZ`, `status SlotStatus default PENDING`, timestamps.

Unique: `(scheduleId, feederId, startTime)`.
Indexes: feederId, scheduleId, startTime, endTime, status.

Business constraint: no overlapping slot for the same feeder on the same calendar day across all non-cancelled schedules. Enforce in the service layer inside a transaction; PostgreSQL exclusion constraints may be introduced only after timezone semantics are frozen.

#### ScheduleGenerationRun

`id UUID PK`, `operatorId UUID FK`, `targetDeficitMW`, input window start/end, `algorithmVersion VARCHAR(50)`, `selectedCapacityMW`, `shortfallMW`, `result JSONB`, `createdAt`.

Purpose: reproducibility/audit of generated drafts.

#### OutageTicket

`id UUID PK`, `ticketNumber VARCHAR(50) UNIQUE`, `meterId UUID FK`, `customerId UUID FK → User`, `feederId UUID FK`, `zoneId UUID FK`, `substationId UUID nullable FK`, `type TicketType`, `status TicketStatus default REPORTED`, `faultType FaultType nullable`, `description TEXT nullable`, `priority VARCHAR/enum LOW|MEDIUM|HIGH|CRITICAL default MEDIUM`, `technicianId UUID nullable FK → User`, `reportedAt`, `assignedAt`, `enRouteAt`, `repairingAt`, `resolvedAt`, `resolutionNotes TEXT nullable`, timestamps.

Indexes: ticketNumber unique, meterId, customerId, feederId, zoneId, technicianId, status, priority, reportedAt.

Rules:
- `PLANNED_CONFLICT` is never visible in technician dispatch queues.
- `RESOLVED` requires repair evidence and, for unexpected faults, resolution notes.
- Transitions are enforced by service code and transactionally recorded in history.

#### TicketStatusHistory

`id UUID PK`, `ticketId UUID FK`, `status TicketStatus`, `changedByUserId UUID FK`, `note TEXT nullable`, `changedAt TIMESTAMPTZ`.

Index: ticketId + changedAt.

#### FeederStatusHistory

`id UUID PK`, `feederId UUID FK`, `status FeederStatus`, `reason TEXT nullable`, `changedAt`.

Indexes: feederId + changedAt, status.

#### Attachment

`id UUID PK`, `outageTicketId UUID FK`, `uploadedByUserId UUID FK`, `storageKey VARCHAR(500) UNIQUE`, `originalFileName VARCHAR(255)`, `contentType VARCHAR(100)`, `sizeBytes INTEGER`, `verified BOOLEAN default false`, `createdAt`.

Index: outageTicketId.

Only private storage keys are persisted; never expose bucket credentials.

#### Notification

`id UUID PK`, `userId UUID FK`, `channel NotificationChannel`, `status NotificationStatus default PENDING`, `title VARCHAR(255) nullable`, `message TEXT`, `relatedTicketId UUID nullable FK`, `relatedScheduleId UUID nullable FK`, `providerMessageId VARCHAR(255) nullable`, `attemptCount INTEGER default 0`, `sentAt`, `deliveredAt`, `readAt`, `lastError TEXT nullable`, timestamps.

Indexes: userId + createdAt, status, relatedTicketId, relatedScheduleId.

Idempotency: unique logical event key at service level so publishing one schedule does not send duplicate notifications to the same customer.

#### InfrastructureUpgradeRequest

`id UUID PK`, `feederId UUID FK`, `requestedByUserId UUID FK`, `reason TEXT`, `supportingData JSONB nullable`, `status UpgradeRequestStatus default PENDING`, `adminNotes TEXT nullable`, timestamps.

Indexes: feederId, requestedByUserId, status, createdAt.

#### AuditLog

`id UUID PK`, `actorUserId UUID nullable FK`, `action VARCHAR(255)`, `entityType VARCHAR(100)`, `entityId VARCHAR(100)`, `details JSONB nullable`, `ipAddress VARCHAR(45) nullable`, `createdAt`.

Indexes: actorUserId, entityType + entityId, action, createdAt.

### 6.3 Relationships

```text
User 1 ── 0..1 CustomerProfile
Zone 1 ── N Substation
Zone 1 ── N Feeder
Substation 1 ── N Feeder
Zone 0..1 ── 0..1 ZoneManager(User)
CustomerProfile 1 ── N Meter
Feeder 1 ── N Meter
LoadSheddingSchedule 1 ── N ScheduleFeederSlot
Feeder 1 ── N ScheduleFeederSlot
LoadSheddingSchedule 1 ── N ScheduleGenerationRun
Meter 1 ── N OutageTicket
User(Customer) 1 ── N OutageTicket
User(Technician) 1 ── N OutageTicket
OutageTicket 1 ── N TicketStatusHistory
Feeder 1 ── N FeederStatusHistory
OutageTicket 1 ── N Attachment
User 1 ── N Notification
Feeder 1 ── N InfrastructureUpgradeRequest
User 1 ── N AuditLog
```

### 6.4 Delete/cascade policy

- User: soft delete by `deletedAt`; retain audit/history.
- Meter: deactivation preferred; hard delete only when never referenced.
- Zone/Substation/Feeder: hard delete is blocked with `409 DEPENDENCIES_EXIST` if descendants or historical operational rows exist.
- Schedule/ticket/history/audit/notification records are never silently cascaded from user actions.
- Database `ON DELETE CASCADE` is used only for purely dependent child records where deleting the parent cannot destroy operational history unexpectedly; otherwise `RESTRICT`.

## 7. Authentication & Authorization

### 7.1 Authentication architecture

- Auth.js/NextAuth is the web session layer.
- Credentials authentication validates against the Express auth service.
- Password hashing uses Argon2id where available; bcrypt is the compatible fallback required by the implementation environment.
- Backend access token is short-lived (15 minutes target) and stored inside the protected Auth.js session; do not store tokens in localStorage/sessionStorage.
- Session expiry/sign-out behavior is documented explicitly; stale backend tokens return `401`.
- Account status is checked on every backend request, so a suspended user cannot keep access through an old token.
- Admin-created internal users are provisioned as already verified/active only when policy allows.

### 7.2 Customer registration

Fields: name, email, phone, password, meter number or meter selection if onboarding requires it.

Validation:
- email normalized and unique;
- phone normalized to E.164-compatible storage;
- password minimum 10 characters with at least one non-letter;
- name length bounded;
- meter must exist and be active;
- customer cannot bind a meter already owned by another customer.

Because the source stack does not define an email provider, implement `EmailService` as an abstraction but do not add an unapproved email SDK. Until a provider is selected, customer verification can be seeded/development-only; production activation policy must be recorded in `docs/decisions.md`.

### 7.3 Authorization layers

1. Authentication middleware resolves user identity.
2. Role middleware checks role.
3. Scope middleware checks zone ownership.
4. Ownership helpers check that a customer owns the meter/ticket/notification being requested.
5. Resource state checks verify legal transitions.

Examples:
- Customer may only read/update own profile/meters/tickets.
- Technician may only mutate tickets assigned to them.
- Zone Manager may only operate on feeders/tickets in their assigned zone.
- Operator can operate across the configured operational scope.
- Admin can manage all resources.

Never trust role, userId, zoneId, feederId, or customerId supplied by a browser when the value can be derived from the authenticated identity.

## 8. API Architecture & Global Contracts

### 8.1 Base and headers

Base path: `/api/v1`.

JSON requests use:
```http
Content-Type: application/json
Accept: application/json
Authorization: Bearer <access-token>
```

Auth.js/session-bound browser calls may use protected cookies at the Next.js layer; the backend contract remains bearer-verifiable and versioned.

Date/time wire format: ISO-8601 UTC with explicit `Z` unless the endpoint documents a local-time conversion. Store all operational timestamps as `TIMESTAMPTZ`.

### 8.2 Success envelope

```json
{
  "success": true,
  "data": {}
}
```

Lists:
```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 25,
    "total": 100
  }
}
```

### 8.3 Error envelope

```json
{
  "success": false,
  "error": {
    "code": "INVALID_STATE",
    "message": "Schedule is already published.",
    "fields": {},
    "requestId": "..."
  }
}
```

Status mapping:
`400` malformed request, `401` unauthenticated/invalid token, `403` forbidden/suspended/ownership, `404` not found or intentionally hidden, `409` concurrency/uniqueness/state conflict, `413` oversized payload, `415` unsupported media, `422` valid shape but business-rule failure, `429` rate limited, `500` internal, `502/503` unavailable dependency.

### 8.4 API behavior matrix

| Method | Endpoint | Auth / role | Request | Success | Important errors / rules | Side effects |
|---|---|---|---|---|---|---|
| GET | `/api/v1/health` | Public | none | 200 health | 503 if dependency readiness is requested here | none |
| POST | `/api/v1/auth/register` | Public, CUSTOMER only | name,email,phone,password, optional meterId | 201 user/session-safe response | 409 duplicate email/phone/meter, 422 validation | user/profile/audit |
| POST | `/api/v1/auth/login` | Public | email, password | 200 session token/user summary | 401 invalid credentials, 403 suspended | lastLoginAt, audit |
| POST | `/api/v1/auth/logout` | Auth | none | 200 | 401 if absent/invalid | session invalidation at web layer, audit |
| GET | `/api/v1/auth/me` | Auth | none | 200 current user | 401 | none |
| GET | `/api/v1/users/me` | Auth | none | 200 profile | 401 | none |
| PATCH | `/api/v1/users/me` | Auth | editable profile fields | 200 | 422 validation, 409 phone conflict | audit |
| POST | `/api/v1/users/me/password` | Auth | currentPassword,newPassword | 200 | 401 wrong current, 422 validation | revoke/rotate auth session, audit |
| GET | `/api/v1/customers/me/meters` | CUSTOMER | page/filter | 200 list | 401 | none |
| POST | `/api/v1/customers/me/meters` | CUSTOMER | meterId | 201 binding | 403/404/409 | meter ownership change, audit |
| DELETE | `/api/v1/customers/me/meters/:meterId` | CUSTOMER | path meterId | 200 | 403/404/409 active primary/binding rules | audit |
| GET | `/api/v1/customers/me/location` | CUSTOMER | none | 200 resolved location | 404 no active meter | none |
| PATCH | `/api/v1/customers/me/location` | CUSTOMER | meterId | 200 | 403/404/409 | audit |
| GET | `/api/v1/grid/status` | Auth, scoped | `zoneId` optional | 200 effective status | 403 scope, 404 | none |
| GET | `/api/v1/customers/me/dashboard` | CUSTOMER | optional date range | 200 dashboard aggregate | 422 invalid range | cache reads |
| GET | `/api/v1/schedules/my` | CUSTOMER | from,to,page | 200 published slots | 422 invalid date/range | Redis cache-aside |
| GET | `/api/v1/schedules/feeders/:feederId` | OPERATOR/MANAGER/ADMIN | from,to | 200 schedule | 403 scope | Redis cache-aside |
| POST | `/api/v1/operator/schedules/generate` | OPERATOR | title,targetDeficitMW,zoneIds,windowStart,windowEnd,slotDurationMinutes | 201 draft + shortfall + generationRun | 422 no eligible capacity, 403 scope | schedule/slots/run, audit |
| GET | `/api/v1/operator/schedules` | OPERATOR/ADMIN | status,date,page | 200 list | 422 filters | none |
| GET | `/api/v1/operator/schedules/:scheduleId` | OPERATOR/ADMIN | path | 200 detail | 404/403 | none |
| PATCH | `/api/v1/operator/schedules/:scheduleId` | OPERATOR | title,notes | 200 | 409 not draft, 422 | audit |
| PATCH | `/api/v1/operator/schedules/:scheduleId/slots/:slotId` | OPERATOR | feederId,start,end | 200 slot | 403/404/409 overlap/critical/non-draft | audit |
| POST | `/api/v1/operator/schedules/:scheduleId/publish` | OPERATOR | optional idempotency key | 200 | 409 invalid state/concurrent publish | DB tx, cache, notifications, socket |
| POST | `/api/v1/operator/schedules/:scheduleId/cancel` | OPERATOR | none | 200 | 409 active/already cancelled | DB tx, cache, notification |
| POST | `/api/v1/customers/me/outages` | CUSTOMER, verified | meterId,description,faultType?,priority? | 201 ticket or auto-resolve result | 403 ownership/verification, 409 duplicate active report | ticket/history or audit + notification + socket |
| GET | `/api/v1/customers/me/outages` | CUSTOMER | page,status | 200 history | 422 | none |
| GET | `/api/v1/outages/:outageId` | Scoped | path | 200 detail | 403/404 | none |
| GET | `/api/v1/outages/:outageId/history` | Scoped | path | 200 timeline | 403/404 | none |
| GET | `/api/v1/technician/outages` | TECHNICIAN | status,page | 200 assigned queue | 403 | none |
| POST | `/api/v1/outages/:outageId/assign` | OPERATOR/MANAGER/ADMIN | technicianId | 200 assignment | 403/404/409 ineligible technician/state | history, socket, notification |
| POST | `/api/v1/technician/outages/:outageId/accept` | TECHNICIAN | none | 200 ticket | 403/409 state/ownership | history, feeder status if needed, socket |
| POST | `/api/v1/technician/outages/:outageId/start-repair` | TECHNICIAN | note? | 200 ticket | 403/409 | history, socket |
| POST | `/api/v1/technician/outages/:outageId/resolve` | TECHNICIAN | resolutionNotes,attachmentId | 200 ticket | 403/409/no verified photo | history, feeder status, customer notification, socket |
| POST | `/api/v1/technician/outages/:outageId/attachments` | TECHNICIAN | fileName,contentType,sizeBytes | 201 upload session | 403/404/415/413 | signed upload URL, attachment row |
| POST | `/api/v1/technician/attachments/:attachmentId/complete` | TECHNICIAN | checksum/size optional | 200 verified attachment | 403/404/409 | storage metadata verification |
| GET | `/api/v1/outages/:outageId/attachments` | Scoped | path | 200 metadata + short-lived view URLs | 403/404 | signed GET |
| GET | `/api/v1/manager/grid` | ZONE_MANAGER | sort,filter,page | 200 table snapshot | 403 | none |
| GET | `/api/v1/manager/outages` | ZONE_MANAGER | status,priority,page | 200 queue | 403 | none |
| GET | `/api/v1/manager/technicians` | ZONE_MANAGER | availability,page | 200 technicians | 403 | none |
| PATCH | `/api/v1/manager/outages/:outageId/assignment` | ZONE_MANAGER | technicianId | 200 | 403/409 | history/socket |
| GET | `/api/v1/manager/analytics/feeder-failures` | ZONE_MANAGER | month,zone | 200 aggregate | 403/422 | bounded aggregate |
| GET | `/api/v1/manager/analytics/technician-resolution` | ZONE_MANAGER | month,zone | 200 aggregate | 403/422 | bounded aggregate |
| POST | `/api/v1/manager/upgrade-requests` | ZONE_MANAGER | feederId,reason,supportingData? | 201 | 403/422 | audit |
| GET | `/api/v1/manager/upgrade-requests` | ZONE_MANAGER | status,page | 200 | 403 | none |
| PATCH | `/api/v1/admin/zones/:zoneId` | ADMIN | editable zone fields | 200 | 404/409/422 | audit |
| PATCH | `/api/v1/admin/substations/:id` | ADMIN | editable fields | 200 | 404/409/422 | audit |
| PATCH | `/api/v1/admin/feeders/:id` | ADMIN | editable fields | 200 | 404/409/422 | audit/status history |
| PATCH | `/api/v1/admin/feeders/:id/critical` | ADMIN | `{isCritical}` | 200 | 409 active schedule conflict | audit |
| PATCH | `/api/v1/admin/meters/:id` | ADMIN | feeder/customer/active fields | 200 | 409 ownership/dependency | audit |
| GET | `/api/v1/admin/users` | ADMIN | role,status,zone,page | 200 | 403 | none |
| GET | `/api/v1/admin/users/:userId` | ADMIN | path | 200 | 404 | none |
| PATCH | `/api/v1/admin/users/:userId/role` | ADMIN | `{role}` | 200 | 409 invalid scope/state | audit |
| PATCH | `/api/v1/admin/users/:userId/status` | ADMIN | `{status}` | 200 | 409 cannot suspend last admin | audit |
| PATCH | `/api/v1/admin/users/:userId/scope` | ADMIN | `{zoneId}` | 200 | 409 incompatible role | audit |
| GET | `/api/v1/admin/audit` | ADMIN | filters/page | 200 | 422 | none |
| GET | `/api/v1/admin/notifications` | ADMIN | status/channel/page | 200 | 422 | none |
| PATCH | `/api/v1/admin/upgrade-requests/:id` | ADMIN | status,adminNotes | 200 | 404/409 | audit + optional requester notification |
| GET | `/api/v1/customers/me/notifications` | CUSTOMER | page,unreadOnly | 200 | 422 | none |
| PATCH | `/api/v1/customers/me/notifications/:id/read` | CUSTOMER | none | 200 | 403/404 | readAt |
| POST | `/api/v1/customers/me/notifications/read-all` | CUSTOMER | none | 200 | 403 | readAt bulk |
| GET | `/api/v1/health/live` | Public | none | 200 | 503 process unavailable | none |
| GET | `/api/v1/health/ready` | Public | none | 200 | 503 DB/Redis unavailable | none |
| POST | `/api/v1/integrations/twilio/status-callback` | Twilio-signed callback | Twilio payload | 200 | 401 invalid signature | notification delivery update |

### 8.5 Pagination and filtering

- Default page size 25; maximum 100.
- Prefer cursor pagination for long operational queues; offset pagination is acceptable for bounded admin tables.
- Every sort field must be allowlisted.
- Every date filter must have a bounded maximum range.
- Never allow arbitrary Prisma `orderBy`, field names, filters, or raw query fragments from clients.

## 9. Scheduling Algorithm

### 9.1 Pure engine input

```ts
type GenerateScheduleInput = {
  zoneIds: string[];
  targetDeficitMW: number;
  windowStart: Date;
  windowEnd: Date;
  slotDurationMinutes: number;
  now: Date;
  algorithmVersion: string;
};
```

### 9.2 Eligibility rules

A feeder is eligible only when:
- active;
- non-critical;
- in an eligible operational state;
- in an allowed zone;
- not already scheduled for an overlapping interval on the same calendar day.

### 9.3 Fairness score/order

Sort ascending only after computing these descending-priority keys:

1. `daysSinceLastCut` descending.
2. `rolling7dCutCount` ascending.
3. `lastScheduledStart` ascending, with `NULL` first.
4. `feeder.code` ascending for deterministic tie-breaking.

Never use random ordering.

### 9.4 Selection

Greedily select eligible feeders until cumulative `capacityMW >= targetDeficitMW`.

Return:
- selected feeder slots;
- total selected MW;
- `shortfallMW = max(targetDeficitMW - selectedMW, 0)`;
- skipped reasons for diagnostics;
- algorithm version.

A shortfall is a valid result and must be visible to the Operator. The API must not pretend the target was met.

### 9.5 Manual edits

Operator changes reuse the same validation service:
- no critical feeder;
- no overlap;
- feeder active;
- within plan window;
- no illegal schedule state transition.

### 9.6 State transitions

```text
Schedule:
DRAFT → PUBLISHED → ACTIVE → COMPLETED
DRAFT → CANCELLED
PUBLISHED → CANCELLED

Slot:
PENDING → ACTIVE → COMPLETED
PENDING → CANCELLED

OutageTicket:
REPORTED → ASSIGNED → EN_ROUTE → REPAIRING → RESOLVED
REPORTED → CANCELLED
ASSIGNED → CANCELLED
```

`AUTO_RESOLVED_NO_FAULT` is terminal for planned-conflict reports.

## 10. Smart Conflict Resolution

When a customer reports an outage:

1. Authenticate customer and verify account.
2. Validate meter ownership.
3. Resolve `Meter → Feeder → Zone`.
4. Query currently effective planned slot covering `now`.
5. If active planned slot exists:
   - do not create an `OutageTicket`;
   - create an `AuditLog`/`OutageReportEvent` entry with the reason `PLANNED_CONFLICT`;
   - return `200` or `201` with `status=KNOW_PLANNED_OUTAGE`;
   - show remaining planned outage end time;
   - create informational in-app/SMS notification if configured.
6. Otherwise:
   - create `OutageTicket(type=UNPLANNED_FAULT,status=REPORTED)`;
   - create `TicketStatusHistory`;
   - choose a technician using the assignment policy;
   - send acknowledgement notification;
   - emit `ticket:created`.

Duplicate suppression: prevent multiple active customer reports for the same meter/feeder within a short configurable window unless an operator explicitly reopens the report.

## 11. Technician Assignment & Ticket Workflow

### 11.1 Automatic assignment

For an eligible unplanned fault:
- same zone as feeder;
- active account;
- technician not suspended;
- technician has no conflicting exclusive assignment if capacity limits are enabled.

Select least number of open assigned/active tickets, then oldest `lastAssignedAt`, then user id for deterministic tie-break.

Assignment runs in a transaction and uses row/optimistic locking to prevent two reports from claiming the same technician under the same capacity decision.

If no technician is available:
- keep ticket `REPORTED`;
- notify manager/operator;
- do not fabricate an assignment;
- retry/assign manually.

### 11.2 Transition rules

| Current | Allowed next | Actor |
|---|---|---|
| REPORTED | ASSIGNED, CANCELLED | Operator/Manager/Admin/service |
| ASSIGNED | EN_ROUTE, CANCELLED | Assigned Technician |
| EN_ROUTE | REPAIRING | Assigned Technician |
| REPAIRING | RESOLVED | Assigned Technician |
| Any terminal | none | Admin only through explicit reopen workflow if later approved |

Every transition:
- verifies actor scope;
- writes `TicketStatusHistory`;
- timestamps the appropriate field;
- writes an audit event for privileged mutations;
- emits a Socket.io event;
- updates effective feeder status where relevant.

## 12. File/Image Handling

- Only repair evidence photos are supported.
- Allowed media: JPEG and PNG.
- Application max: 5 MB.
- Client validation is UX; server-generated signed URL policy is authoritative.
- Upload path/prefix must be generated by the server and contain no user-controlled path segments.
- Object storage bucket is private.
- Signed upload URL expiry: 5 minutes.
- Signed read URL expiry: short-lived and role/scope checked.
- Store attachment metadata in PostgreSQL.
- Verify actual object exists and matches expected type/size before allowing `RESOLVED`.
- Never trust the original filename for storage paths.
- Reject polyglot/suspicious uploads when provider validation permits; at minimum enforce media type/size and do not execute uploaded content.

## 13. Redis Strategy

### Cache keys

```text
schedule:feeder:{feederId}:active
schedule:zone:{zoneId}:active
schedule:customer:{userId}:upcoming:{dateKey}
grid:status:{scopeKey}
```

### Rules

- Use cache-aside reads.
- Published schedule writes invalidate/set affected feeder/zone keys.
- Cache TTL is short enough to prevent stale operational status; exact value is environment-configurable.
- Never cache authorization decisions.
- Never reuse a customer-specific cache entry across users without explicit scope in the key.
- Cache failures fall back to Postgres and are logged; Redis outage does not make the application unavailable.
- Redis distributed locks protect cron jobs and singleton-style scheduled work.

## 14. Notifications

### Triggers

1. Schedule published → affected customers.
2. Unexpected outage accepted → acknowledgement.
3. Technician assigned/dispatched → customer.
4. Outage resolved → restoration.
5. Planned-conflict report → informational explanation.
6. Notification delivery callback → update delivery metadata.

### Provider abstraction

```ts
interface SmsProvider {
  send(input: { to: string; body: string; idempotencyKey: string }): Promise<{providerMessageId:string}>;
}

interface NotificationService {
  create(input: NotificationInput): Promise<Notification>;
  dispatch(notificationId: string): Promise<void>;
}
```

Controllers/services never call Twilio SDK directly.

### Delivery policy

- Domain transaction commits first.
- Notification record is persisted as `PENDING`.
- Cron/safe background execution dispatches pending rows.
- Retry with bounded attempts and exponential delay.
- Twilio callback verifies provider signature before changing delivery status.
- Provider failure changes notification state and emits an operational log; it does not roll back ticket/schedule state.

## 15. Background Jobs

Required jobs:

1. **Schedule activation job**: finds published slots whose `startTime <= now` and marks slots/schedules/feeder status consistently.
2. **Schedule completion job**: completes expired slots/schedules and restores feeder state when no other active condition applies.
3. **Pending notification dispatcher**: sends/retries pending notifications.
4. **National grid fluctuation simulation**: development/demo only; never represented as real telemetry in production.
5. **Hourly scheduling job**: only when enabled by configuration and only using the same generation/publish service, never a duplicated algorithm.

Every job:
- has an explicit cron expression;
- respects `CRON_ENABLED`;
- acquires a Redis lock;
- is idempotent;
- records start/success/failure duration;
- handles restarts;
- does not overlap itself;
- is testable via direct service invocation.

## 16. Socket.io Contract

### Authentication

Handshake must carry the authenticated token/session-derived credential. Reject invalid/suspended clients.

### Rooms

- `zone:{zoneId}` for zone-scoped dashboards.
- Zone Manager may join only their own zone.
- Operator/Admin may join authorized operational rooms.
- Never publish cross-zone data into a room accidentally.

### Events

```text
schedule:published
feeder:status_changed
ticket:created
ticket:assigned
ticket:status_changed
notification:created   (customer-scoped where used)
```

Payloads contain IDs, zone scope, status, and minimal display fields. Do not broadcast full customer PII.

### Reconnect rule

On reconnect:
1. client reconnects;
2. dashboard fetches authoritative REST snapshot;
3. event stream resumes after snapshot;
4. duplicate/out-of-order events are tolerated by version/timestamp checks.

## 17. Frontend Architecture

### Shared components

- App shell/navigation
- Role-aware sidebar
- Data table with sorting/filtering/pagination
- Status badge
- Form field wrappers
- Confirm dialog
- Toast/alert
- Skeleton/loading state
- Empty state
- Inline error state
- Error boundary
- Notification bell/list
- Date/time display
- Schedule timeline/countdown
- Ticket timeline
- Photo upload panel

### Shared client behavior

- Central API client normalizes errors.
- Never duplicate endpoint logic inside individual pages.
- Server-side fetching is preferred for initial page data.
- Client components use small focused hooks for mutations/realtime subscriptions.
- Do not place secrets in public environment variables.
- All role routes enforce both frontend guard and backend authorization.

## 18. Frontend Route Inventory

| Route | Role | Purpose |
|---|---|---|
| `/` | Public | Service overview |
| `/login` | Public | Sign in |
| `/register` | Public | Customer registration |
| `/403` | Public | Forbidden |
| `/404` | Public | Not found |
| `/customer/dashboard` | Customer | Current status + next outage |
| `/customer/schedule` | Customer | Published schedule |
| `/customer/meters` | Customer | Meter bindings |
| `/customer/report-outage` | Customer | Smart report flow |
| `/customer/my-reports` | Customer | Report history |
| `/customer/my-reports/[id]` | Customer | Timeline/detail |
| `/customer/notifications` | Customer | Notification history |
| `/customer/profile` | Customer | Profile/password |
| `/operator/control-room` | Operator | Deficit + live operations |
| `/operator/schedules` | Operator | Plans |
| `/operator/schedules/generate` | Operator | Draft generation |
| `/operator/schedules/[id]` | Operator | Review/edit/publish |
| `/technician/assignments` | Technician | Assigned queue |
| `/technician/assignments/[id]` | Technician | Workflow |
| `/technician/history` | Technician | Closed tickets |
| `/manager/dashboard` | Zone Manager | Live grid |
| `/manager/grid` | Zone Manager | Sort/filter table |
| `/manager/outages` | Zone Manager | Fault queue |
| `/manager/outages/[id]` | Zone Manager | Oversight |
| `/manager/analytics` | Zone Manager | Monthly metrics |
| `/manager/upgrade-requests` | Zone Manager | Upgrade requests |
| `/admin/overview` | Admin | Admin summary |
| `/admin/users` | Admin | User management |
| `/admin/users/[id]` | Admin | Role/status/scope |
| `/admin/infrastructure` | Admin | Topology |
| `/admin/audit` | Admin | Audit log |
| `/admin/notifications` | Admin | Delivery monitoring |
| `/admin/upgrade-requests` | Admin | Request decisions |

### 18.1 Page-state requirements

Every protected page must define:
- loading;
- empty;
- validation error;
- API error;
- forbidden;
- session-expired;
- success;
- retry/reconnect where relevant;
- responsive behavior.

## 19. Environment Configuration

### Backend

```text
NODE_ENV
PORT
DATABASE_URL
DIRECT_URL                 # only when required by Neon/Prisma migration strategy
AUTH_SECRET
AUTH_ISSUER                # if used by token verifier
API_BASE_URL
FRONTEND_ORIGIN
CORS_ORIGINS
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_FROM_NUMBER
TWILIO_WEBHOOK_AUTH_TOKEN # if used in application callback verification
FILE_STORAGE_ENDPOINT
FILE_STORAGE_BUCKET
FILE_STORAGE_REGION
FILE_STORAGE_ACCESS_KEY
FILE_STORAGE_SECRET_KEY
CRON_ENABLED
SOCKET_CORS_ORIGIN
LOG_LEVEL
RATE_LIMIT_REDIS_PREFIX
```

### Frontend public variables

Only non-secret public values:
```text
NEXT_PUBLIC_API_BASE_URL
NEXT_PUBLIC_SOCKET_URL
NEXT_PUBLIC_APP_NAME
```

Never commit `.env`, credentials, access tokens, or real provider secrets.

## 20. Observability and Logging

- Structured JSON logs in production.
- Correlation/request ID generated or propagated.
- Log request method/path/status/duration without passwords/tokens/PII beyond operational need.
- Audit privileged mutations separately from general application logs.
- Log external provider IDs, not credentials.
- Health endpoints: liveness and readiness.
- Record job run outcomes.
- Record notification failure counts and retry exhaustion.
- Do not return stack traces to clients.

## 21. Implementation Phases

### Phase 01 — Requirements Baseline & Decision Register

**Phase Goal:** Freeze requirements, hard business rules, source-of-truth stack, unresolved decisions, and implementation boundaries before code.

**Prerequisites:** None

**Files/Folders:** implementation.md; docs/decisions.md; docs/requirements.md

**Implementation Tasks:**
- Extract functional/non-functional requirements from all three source plans and mark each as MUST, SHOULD, or deferred decision.
- Record the resolved architecture decisions from Section 2 plus any still-open provider choice.
- Create a requirement-to-phase matrix so every requirement maps to implementation and verification.

**Business Logic:** Do not add product features while resolving ambiguity. Any new architectural choice must be recorded before the affected phase.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Validate the decision matrix for contradictions in stack, roles, APIs, entities, routes, and deployment.

**Error Handling:** Fail the phase if two source-derived requirements cannot be reconciled without an explicit decision entry.

**Security:** Security scope, role boundaries, data classification, secret handling and audit requirements must be present in the register.

**Testing:** Review every requirement against the three source plans; confirm no major unique requirement was silently dropped.

**Completion Criteria:** All requirements have an owner/phase; no unresolved contradiction remains hidden; decision log is authoritative.

**Git Commit:** `docs: freeze requirements and architecture decisions`

### Phase 02 — Repository & Engineering Conventions

**Phase Goal:** Create the monorepo structure, coding conventions, tooling, and shared quality gates.

**Prerequisites:** 1

**Files/Folders:** root configs; frontend/package.json; backend/package.json; .gitignore; .editorconfig; docs/architecture.md

**Implementation Tasks:**
- Create frontend/, backend/, docs/, and CI directories exactly as defined.
- Configure TypeScript, linting, formatting, test scripts, import aliases, and consistent naming.
- Add README with local development commands and phase execution discipline.

**Business Logic:** Do not introduce alternate frameworks or package managers.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Verify package scripts, type-check/lint commands, and a clean workspace build.

**Error Handling:** Tooling failures must be reported without masking exit codes.

**Security:** Keep secrets out of repo; configure ignore rules before any local env files are created.

**Testing:** Run lint/type-check on minimal placeholder modules.

**Completion Criteria:** Repository boots with deterministic scripts and no unrelated scaffolding.

**Git Commit:** `chore: initialize repository conventions`

### Phase 03 — Express Backend Foundation

**Phase Goal:** Create the long-lived Express service, middleware pipeline, versioned router, and health endpoints.

**Prerequisites:** 2

**Files/Folders:** backend/src/server/index.ts; backend/src/app.ts; backend/src/config/*; backend/src/middleware/*; backend/src/routes/index.ts

**Implementation Tasks:**
- Create HTTP server so Socket.io can attach later; do not call app.listen in a way that prevents websocket integration.
- Install/configure Express, CORS, Helmet, structured logger, request ID, JSON limits, 404 handler, and central error handler.
- Mount `/api/v1`; implement `/api/v1/health` plus liveness/readiness placeholders.

**Business Logic:** Order middleware: request ID/logging → security headers → CORS → body parsing → routes → 404 → error handler.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Reject malformed JSON and oversized bodies using the global error contract.

**Error Handling:** No route may expose stack traces or raw errors.

**Security:** Use an explicit CORS allowlist and never wildcard production origins.

**Testing:** Supertest health, malformed JSON, unknown route, CORS, and error-envelope tests.

**Completion Criteria:** Express starts cleanly and returns stable health/error responses.

**Git Commit:** `feat: add express backend foundation`

### Phase 04 — Next.js Frontend Foundation

**Phase Goal:** Create the App Router shell, public routes, layout primitives, and role-portal scaffolding.

**Prerequisites:** 2

**Files/Folders:** frontend/app/*; frontend/components/*; frontend/lib/api/*; frontend/lib/auth/*; frontend/styles/*

**Implementation Tasks:**
- Create public, auth, and role route groups.
- Configure Tailwind/Shadcn, global styles, typography, navigation shell primitives, error/not-found/forbidden pages.
- Create a typed frontend API client and common loading/empty/error components.

**Business Logic:** Do not put secrets into NEXT_PUBLIC_* variables.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Build the app with no runtime dependency on unimplemented business APIs.

**Error Handling:** Missing API configuration must fail with a safe configuration error, not expose values.

**Security:** Keep public bundle free of backend credentials and session secrets.

**Testing:** Run Next.js build and render `/`, `/login`, `/403`, `/404`.

**Completion Criteria:** Frontend foundation builds and route shells exist.

**Git Commit:** `feat: add nextjs frontend foundation`

### Phase 05 — Environment & Configuration Contract

**Phase Goal:** Freeze validated environment variables and runtime configuration.

**Prerequisites:** 3,4

**Files/Folders:** backend/src/config/env.ts; frontend/.env.example; backend/.env.example; docs/deployment.md

**Implementation Tasks:**
- Validate all required variables at startup; distinguish required in production from optional in development.
- Document database, Redis, Auth.js, Twilio, storage, CORS, socket, logging and cron variables.
- Ensure frontend only exposes explicitly public variables.

**Business Logic:** Never read raw process.env throughout the codebase; use typed config.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Missing required production variables must stop startup with a safe message.

**Error Handling:** Do not include secret values in validation errors or logs.

**Security:** Add secret scanning/ignore rules.

**Testing:** Test startup with complete, missing, and malformed configs.

**Completion Criteria:** `.env.example` files are complete and startup validation is deterministic.

**Git Commit:** `chore: define environment contract`

### Phase 06 — Prisma Grid Hierarchy Schema

**Phase Goal:** Implement relational identity/topology schema and foundational migrations.

**Prerequisites:** 5

**Files/Folders:** backend/prisma/schema.prisma; backend/prisma/migrations/*; backend/src/config/database.ts

**Implementation Tasks:**
- Create User, CustomerProfile, Zone, Substation, Feeder, Meter with UUID PKs and required FKs/indexes.
- Implement role/status enums, soft-delete users, active flags, unique codes/numbers, and restrictive topology deletes.
- Configure Neon/Prisma connection and migration scripts.

**Business Logic:** Preserve Zone → Substation → Feeder → Meter and CustomerProfile → many Meter.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Reject duplicate codes/phone/email/meter numbers and invalid FK references.

**Error Handling:** Database errors are mapped to stable 409/422 codes.

**Security:** Least-privilege DB credentials and no credentials in schema or logs.

**Testing:** Migration applies to clean DB; Prisma generate/type-check passes; relationship queries work.

**Completion Criteria:** Grid schema exists with all constraints/indexes and no data-loss cascade surprises.

**Git Commit:** `feat: add prisma grid hierarchy`

### Phase 07 — Seed Data & Development Topology

**Phase Goal:** Create deterministic demo topology and role accounts without production secrets.

**Prerequisites:** 6

**Files/Folders:** backend/prisma/seed/*; backend/src/utils/password.ts; README.md

**Implementation Tasks:**
- Seed several zones, substations, critical/non-critical feeders with capacities, meters, customer profiles, an operator, technicians, manager, and admin.
- Generate stable IDs/codes where useful and seed realistic schedule/ticket states only when later phases exist.
- Document demo credentials through environment-driven seed inputs; never hardcode production credentials.

**Business Logic:** Seed must be idempotent or explicitly reset-and-reseed; never create duplicates on repeat execution.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Invalid fixture relationships fail loudly.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** Seed passwords must be strong development-only values and never reused in production.

**Testing:** Run seed twice and compare counts/identities.

**Completion Criteria:** One command produces a predictable dev dataset used by all later verification.

**Git Commit:** `chore: add deterministic development seed`

### Phase 08 — Auth.js Authentication Core

**Phase Goal:** Implement Auth.js/NextAuth web sessions and Express authentication-token verification.

**Prerequisites:** 7

**Files/Folders:** frontend/app/api/auth/*; frontend/lib/auth/*; backend/src/modules/auth/*; backend/src/middleware/auth.ts

**Implementation Tasks:**
- Implement credentials login backed by the Express auth service.
- Store the short-lived backend API token inside the protected Auth.js session; never use localStorage/sessionStorage for auth tokens.
- Implement password hashing/compare, token signing/verification, session callback, current-user resolution, and safe logout.

**Business Logic:** Target 15-minute backend access token; Auth.js session may outlive it, but API calls must re-authenticate/refresh via the chosen web flow rather than silently accepting expired tokens.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Invalid/expired token → 401; suspended account → 403; unknown user → 401/403 without account enumeration.

**Error Handling:** Never log passwords, bearer tokens, session cookies, or secrets.

**Security:** Auth.js cookie flags, CSRF protections, same-site policy, secure production cookies and origin checks must be configured.

**Testing:** Unit tests for hash/compare/token; integration tests for login and protected request.

**Completion Criteria:** Valid session reaches protected API; invalid/tampered/expired credentials are rejected safely.

**Git Commit:** `feat: implement authjs authentication`

### Phase 09 — RBAC & Resource Authorization

**Phase Goal:** Build reusable role, ownership, and zone-scope authorization middleware.

**Prerequisites:** 8

**Files/Folders:** backend/src/middleware/rbac.ts; backend/src/modules/auth/authorization.ts; backend/src/modules/users/*

**Implementation Tasks:**
- Implement `requireRole`, `requireVerifiedCustomer`, `requireZoneScope`, and ownership helpers.
- Derive actor id/role/scope only from authenticated identity and database state.
- Write an authorization matrix covering all five roles and resource types.

**Business Logic:** Frontend guards are not a security boundary.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Unauthorized and cross-zone access returns 403; deliberately hidden resources may return 404.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** Prevent privilege escalation by ignoring role/userId/zoneId fields from untrusted requests.

**Testing:** Create IDOR and role-escalation tests for customer, technician, manager, operator, and admin paths.

**Completion Criteria:** Every protected route can declare and enforce role/scope/ownership checks.

**Git Commit:** `security: enforce rbac and resource scope`

### Phase 10 — Admin Infrastructure APIs

**Phase Goal:** Implement Admin CRUD for zones, substations, feeders, meters and critical flags.

**Prerequisites:** 6,9

**Files/Folders:** backend/src/modules/grid/*; backend/src/routes/adminGrid.ts; backend/src/validators/grid.ts

**Implementation Tasks:**
- Create typed controllers/services for create/list/read/update/deactivate operations.
- Validate hierarchy consistency: feeder zone must match substation zone when substation is set.
- Block destructive deletes when operational dependencies exist; prefer deactivate.

**Business Logic:** Admin only. Critical-flag changes must check published/active schedules before allowing a change that would invalidate an active plan.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Map uniqueness to 409 and invalid hierarchy/state to 422.

**Error Handling:** Audit every privileged topology mutation.

**Security:** Enforce admin-only access and prevent deleting the last admin or active operational scope required for service.

**Testing:** CRUD/integrity/authorization tests.

**Completion Criteria:** Admin can safely maintain topology without corrupting historical operations.

**Git Commit:** `feat: add admin infrastructure api`

### Phase 11 — Customer Meter & Location Resolution

**Phase Goal:** Implement customer meter binding and deterministic Meter → Feeder → Zone resolution.

**Prerequisites:** 10,9

**Files/Folders:** backend/src/modules/customers/*; frontend/app/customer/meters/*; frontend/app/customer/location/*

**Implementation Tasks:**
- Allow customers to list/add/remove their own meter bindings and choose an active meter for dashboard/reporting.
- Validate meter active state and ownership; block binding a meter already owned by another customer.
- Centralize resolution service used by dashboard, schedule and outage-reporting flows.

**Business Logic:** Support multiple meters per customer; every customer-facing operational request must identify the meter explicitly or resolve a single active/default meter.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** 403 for another customer's meter; 404 inactive/missing meter; 409 already owned.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** Do not expose meters outside the authenticated customer scope.

**Testing:** Test multi-meter customers and cross-customer access.

**Completion Criteria:** Meter binding and location resolution work from UI through DB.

**Git Commit:** `feat: add customer meter resolution`

### Phase 12 — Effective Grid Status Service

**Phase Goal:** Compute a single authoritative feeder status from current planned slots, unexpected faults, maintenance, and configured base status.

**Prerequisites:** 11

**Files/Folders:** backend/src/modules/grid/statusService.ts; backend/src/modules/grid/controllers.ts; backend/src/modules/grid/repositories.ts

**Implementation Tasks:**
- Implement `getEffectiveFeederStatus` and bulk status query for zone/customer views.
- Precedence: active unexpected fault > active maintenance > active planned outage > online/base status.
- Record FeederStatusHistory whenever an effective operational status changes due to a domain event.

**Business Logic:** Do not infer status from stale cached snapshots; database state is authoritative.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Conflicting active conditions must resolve deterministically by precedence and record the reason.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** Scope status queries by role; do not expose unrelated customer details.

**Testing:** Test planned vs unexpected precedence and no-active-condition behavior.

**Completion Criteria:** All dashboards can reuse the same status service.

**Git Commit:** `feat: add effective grid status`

### Phase 13 — Customer Dashboard API

**Phase Goal:** Expose one customer dashboard aggregate and current identity data.

**Prerequisites:** 12,11

**Files/Folders:** backend/src/modules/customers/dashboard/*; backend/src/routes/customer.ts

**Implementation Tasks:**
- Return current meter, zone/feeder, effective status, active planned outage if any, next published slots, open ticket summary, and unread notification count.
- Bound all schedule windows and use a single server-side aggregation service.
- Keep sensitive fields out of the response.

**Business Logic:** Customer sees only their own operational context.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Unbound customer gets a recoverable onboarding state rather than a 500.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** Do not expose technician contact details or another customer's ticket data.

**Testing:** API tests for bound/unbound/multi-meter/scheduled/fault states.

**Completion Criteria:** Dashboard API supports the customer journey with one stable contract.

**Git Commit:** `feat: add customer dashboard api`

### Phase 14 — Load-Shedding Schedule Data Model

**Phase Goal:** Add schedule, slot, and generation-run persistence.

**Prerequisites:** 12

**Files/Folders:** backend/prisma/schema.prisma; backend/src/modules/schedules/*; migrations

**Implementation Tasks:**
- Create LoadSheddingSchedule, ScheduleFeederSlot, ScheduleGenerationRun.
- Implement status/slot enums, audit timestamps, indexes, unique relationship constraints.
- Create service helpers for overlap checks and legal schedule/slot transitions.

**Business Logic:** Schedule times are UTC; the calendar-day no-double-cut rule is evaluated in the documented operating timezone stored/configured for the deployment.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Overlap conflicts return 409; endTime must be after startTime; slots must fit the parent schedule window unless explicitly edited within allowed bounds.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** All writes use transactions where multiple rows must remain consistent.

**Testing:** Migration tests and overlap-rule unit tests.

**Completion Criteria:** Schedule persistence is ready for pure algorithm generation and publication.

**Git Commit:** `feat: add schedule persistence`

### Phase 15 — Fair-Rotation Scheduling Engine

**Phase Goal:** Implement the deterministic pure scheduler and fairness metrics.

**Prerequisites:** 14,12

**Files/Folders:** backend/src/modules/schedules/algorithm/*; backend/src/modules/schedules/fairness.ts; backend/src/modules/schedules/__tests__/*

**Implementation Tasks:**
- Load eligible feeders with capacity and schedule history.
- Rank by days since last cut desc, rolling-7-day cut count asc, last scheduled start asc with null first, then feeder code asc.
- Greedily select until target MW is met or eligible capacity is exhausted; return shortfall and skipped reasons.
- Hard skip critical/inactive/overlapping feeders and never randomly reorder ties.

**Business Logic:** Default slot duration is 2 hours unless explicitly supplied within configured bounds.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Do not mutate DB from the pure algorithm.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** Fairness calculation must not leak customer data.

**Testing:** Unit test critical exclusion, same-day overlap, fairness order, exact/over target, and insufficient capacity.

**Completion Criteria:** Deterministic input produces identical output; algorithm reports honest shortfall.

**Git Commit:** `feat: implement fair scheduling engine`

### Phase 16 — Operator Schedule Generation API

**Phase Goal:** Expose draft generation to Operators and persist a reproducible generation run.

**Prerequisites:** 15,14

**Files/Folders:** backend/src/modules/schedules/generateController.ts; service/repository/validators; routes/operatorSchedules.ts

**Implementation Tasks:**
- POST `/api/v1/operator/schedules/generate` validates target deficit, zones, window and duration, invokes pure engine, and writes plan/slots/run in one transaction.
- Persist algorithmVersion, selected MW, shortfall, and diagnostic result.
- Return draft with slot details and shortfall.

**Business Logic:** Operator only.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Reject unknown/inactive zones, invalid times, negative/zero deficit, and no eligible capacity with stable 422/409 codes.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** Audit generation request and actor.

**Testing:** Test authorization, validation, deterministic output, persistence transaction and rollback.

**Completion Criteria:** Operator can generate an auditable draft without publication side effects.

**Git Commit:** `feat: add schedule generation api`

### Phase 17 — Schedule Review, Edit, Publish & Cancel

**Phase Goal:** Implement operator review/edit and transactional publication.

**Prerequisites:** 16,14

**Files/Folders:** backend/src/modules/schedules/*; frontend/app/operator/schedules/*; routes/operatorSchedules.ts

**Implementation Tasks:**
- List/get draft schedules; edit title/notes and individual slots only while DRAFT.
- Publish only from DRAFT; validate every slot again, set PUBLISHED/publishedAt, create notification rows, invalidate/refresh Redis, emit event after commit.
- Cancel only DRAFT/PUBLISHED; cancel pending slots and related unsent notification intent.
- Use transaction + idempotency protection to prevent double publication.

**Business Logic:** Publishing future schedules must not mark feeders planned-outage until slot activation.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** 409 for invalid state, concurrent publish, slot overlap, critical feeder, or missing dependencies.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** Privileged actions get audit logs; no SMS credentials in schedule service.

**Testing:** Test publish concurrency, repeated publish, invalid edited slot, cancellation and rollback.

**Completion Criteria:** Publication is atomic from the domain perspective and has clear cache/notification side effects.

**Git Commit:** `feat: add schedule publication workflow`

### Phase 18 — Published Schedule Reads & Redis Cache

**Phase Goal:** Provide cached schedule queries for customer and scoped operational views.

**Prerequisites:** 17,12

**Files/Folders:** backend/src/modules/schedules/readService.ts; backend/src/integrations/redis/*; routes

**Implementation Tasks:**
- Implement cache-aside by feeder/zone/customer scope; cache published/active schedules only.
- Invalidate affected keys on publish/cancel/slot change and let cache miss fall back to Postgres.
- Bound date ranges and pagination.

**Business Logic:** Redis never becomes source of truth and authorization is always re-evaluated.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Cache outages must degrade to DB reads, not return empty schedule data.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** Never cache customer-specific data under a shared key.

**Testing:** Test cache hit/miss/fallback/invalidation and key isolation.

**Completion Criteria:** Published schedule reads are fast and correct under Redis failure.

**Git Commit:** `feat: cache published schedules`

### Phase 19 — Notification Domain & Twilio SMS Adapter

**Phase Goal:** Build DB-backed notification creation, SMS adapter, delivery status and in-app notifications.

**Prerequisites:** 17,18

**Files/Folders:** backend/src/modules/notifications/*; backend/src/integrations/twilio/*; backend/src/routes/customerNotifications.ts

**Implementation Tasks:**
- Persist notifications for schedule publication, outage acknowledgement, dispatch, planned-conflict explanation, restoration, and approved upgrade-request changes.
- Implement Twilio adapter, retry-safe dispatch, providerMessageId, status updates and signed callback verification.
- Add customer notification list/read/read-all APIs.

**Business Logic:** Notification creation is part of the domain transaction when practical; dispatch is asynchronous and retryable without a queue.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Provider errors update notification state and are not surfaced as domain-transaction failures.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** Redact SMS content/PII where logs do not need the full message.

**Testing:** Mock Twilio; integration test callback signature and retry/idempotency behavior.

**Completion Criteria:** Notifications are reliable enough for demo/production operation without coupling domain writes to Twilio availability.

**Git Commit:** `feat: add notification and twilio adapter`

### Phase 20 — Smart Outage Conflict Resolution

**Phase Goal:** Implement the core rule that an outage report during an active planned outage is not a dispatchable fault.

**Prerequisites:** 19,12,11

**Files/Folders:** backend/src/modules/outages/conflictResolver.ts; customer outage controller/service; validators

**Implementation Tasks:**
- Resolve customer meter to feeder; query active published slot covering current time.
- If planned outage exists: do not create OutageTicket; persist an OutageReportEvent/AuditLog entry and return explanatory status/end time; optionally create informational notification.
- If not planned: create UNPLANNED_FAULT ticket and TicketStatusHistory, then proceed to assignment.
- Guard against duplicate active reports for the same meter/feeder within the configured suppression interval.

**Business Logic:** Only active published/active slots count; DRAFT schedules never suppress faults.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Ownership/verification failures are 403; duplicate active reports are 409 or an idempotent success response per contract.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** No technician queue should ever receive planned-conflict reports.

**Testing:** Tests must cover active planned, future planned, expired planned, online feeder, cross-meter, and duplicate-report cases.

**Completion Criteria:** Planned-conflict reports are recorded for traceability but cannot trigger dispatch.

**Git Commit:** `feat: implement outage conflict resolution`

### Phase 21 — Outage Ticket State Machine & History

**Phase Goal:** Create ticket lifecycle services, transition validation, priority, and history.

**Prerequisites:** 20

**Files/Folders:** backend/src/modules/outages/*; schema migrations; route/controller/service/validators

**Implementation Tasks:**
- Create OutageTicket, TicketStatusHistory, and required indexes.
- Implement a single transition service that validates current status, actor, scope and prerequisites then writes ticket/history in one transaction.
- Maintain timestamps for assigned/en-route/repairing/resolved and create feeder status history where effective status changes.

**Business Logic:** State transitions are finite and auditable; no controller directly mutates status.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Illegal transition returns 409 INVALID_STATE.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** Customer can never change technician-owned statuses.

**Testing:** Unit/integration tests for every allowed and rejected transition.

**Completion Criteria:** Ticket lifecycle is impossible to bypass through alternate endpoints.

**Git Commit:** `feat: add outage state machine`

### Phase 22 — Technician Queue & Acceptance

**Phase Goal:** Provide technician-scoped queue and accept/en-route workflow.

**Prerequisites:** 21

**Files/Folders:** backend/src/modules/outages/technician/*; frontend/app/technician/assignments/*; routes

**Implementation Tasks:**
- List only dispatchable tickets assigned to the current technician; order by priority then reportedAt.
- Implement accept transition and real-time event publication after commit.
- Support empty/no-assignment states and history view.

**Business Logic:** Technician cannot accept someone else's ticket.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** 409 if ticket was reassigned/resolved/cancelled concurrently.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** Do not expose other customers' unnecessary PII.

**Testing:** Test queue scope, concurrent acceptance, wrong-technician access and state transition.

**Completion Criteria:** Technicians can safely accept assigned work and enter EN_ROUTE.

**Git Commit:** `feat: add technician queue and acceptance`

### Phase 23 — Technician Repair Progress & Resolution

**Phase Goal:** Implement repair-in-progress and resolution actions with required evidence.

**Prerequisites:** 22,21

**Files/Folders:** backend/src/modules/outages/technician/*; frontend/app/technician/assignments/[id]/*

**Implementation Tasks:**
- Implement START-REPAIR and RESOLVE actions through transition service.
- RESOLVED requires at least one verified repair-photo attachment and resolution notes.
- On resolve, update feeder effective status; notify affected customers; append history and audit; emit socket event after commit.

**Business Logic:** Only assigned technician can mutate the ticket.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** 409 for illegal state; 422 for missing evidence/notes.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** Prevent a technician from resolving across zones or tickets they do not own.

**Testing:** Integration tests for full workflow and missing-photo rejection.

**Completion Criteria:** Resolution cannot happen before repair state/evidence requirements are satisfied.

**Git Commit:** `feat: complete technician repair workflow`

### Phase 24 — Repair Photo Storage & Attachment Verification

**Phase Goal:** Implement private S3-compatible signed upload/read flow.

**Prerequisites:** 23

**Files/Folders:** backend/src/modules/attachments/*; backend/src/integrations/storage/*; frontend/components/repair-photo/*; schema migration

**Implementation Tasks:**
- Create Attachment metadata model and signed PUT/GET adapters.
- Allow JPEG/PNG only, max 5 MB; generate server-owned storage key and 5-minute signed upload URL.
- Provide completion endpoint to verify object exists, size/type, then mark attachment verified.
- Resolve never accepts a URL supplied directly by the client; it references verified Attachment id.

**Business Logic:** Storage bucket is private; original filename is metadata only.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** 413 oversized, 415 unsupported media, 403 wrong ticket, 409 attachment state.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** Never expose storage credentials or raw bucket paths; signed reads require scope.

**Testing:** Test upload URL issuance, wrong content type, oversize, object verification and signed read access.

**Completion Criteria:** Repair evidence is private, verified, and tied to a ticket/uploader.

**Git Commit:** `feat: add repair attachment storage`

### Phase 25 — Socket.io Authenticated Event Backbone

**Phase Goal:** Attach Socket.io to the Express HTTP server with role/scope-aware rooms and events.

**Prerequisites:** 24,19,21

**Files/Folders:** backend/src/modules/realtime/*; backend/src/server/socket.ts; frontend/lib/realtime/socket.ts

**Implementation Tasks:**
- Authenticate handshake; verify current account role/status.
- Join `zone:{zoneId}` rooms only when authorized; Operator/Admin may join approved zones.
- Emit schedule:published, feeder:status_changed, ticket:created, ticket:assigned, ticket:status_changed with minimal payloads.
- Publish only after successful DB commit.

**Business Logic:** Socket events are not authoritative data.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Invalid/suspended connections are rejected; unauthorized room join is denied.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** Never broadcast customer PII or cross-zone data.

**Testing:** Two-zone isolation test and reconnect test.

**Completion Criteria:** Real-time backbone is secure and scoped.

**Git Commit:** `feat: add authenticated socketio backbone`

### Phase 26 — Zone Manager Live Grid Dashboard

**Phase Goal:** Implement manager live grid table with filters, sorting, pagination, and realtime refresh.

**Prerequisites:** 25,12

**Files/Folders:** frontend/app/manager/dashboard/*; frontend/app/manager/grid/*; backend manager grid route/service

**Implementation Tasks:**
- Provide REST snapshot with feeder, zone, substation, effective status, active schedule window, current ticket summary and technician assignment summary.
- Consume Socket.io events to refresh affected rows; REST remains authoritative after reconnect.
- Support filters for unexpected faults/planned/offline and sortable columns.

**Business Logic:** Manager may only see assigned zone.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Bound page size and filter/sort fields; return 403 outside zone.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** No customer PII beyond what is operationally necessary.

**Testing:** Frontend integration test for filters, empty/error/loading and event-driven refresh.

**Completion Criteria:** Manager can monitor all relevant feeders without maps.

**Git Commit:** `feat: add manager live grid`

### Phase 27 — Operator Control Room Dashboard

**Phase Goal:** Implement operator overview and schedule workflow UI.

**Prerequisites:** 25,16,17

**Files/Folders:** frontend/app/operator/control-room/*; frontend/app/operator/schedules/*; shared table/forms

**Implementation Tasks:**
- Show GridStatus deficit/current demand, schedule list, generate form, draft review, slot edit, publish/cancel actions.
- Display algorithm shortfall and critical-feeder exclusion visibility.
- Use optimistic UX only for noncritical display; refetch authoritative data after mutations.

**Business Logic:** Operator permissions are still enforced by backend.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Handle validation/state conflicts with field-level or inline errors.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** Never display hidden credentials or sensitive admin-only data.

**Testing:** Component/page tests for generation, review, publish conflict and empty schedules.

**Completion Criteria:** Operator can complete generate → review → publish journey.

**Git Commit:** `feat: add operator control room`

### Phase 28 — Customer Schedule, Notification & Outage UX

**Phase Goal:** Complete customer-facing workflow: schedule transparency, report outage, notifications and ticket history.

**Prerequisites:** 20,19,13,18

**Files/Folders:** frontend/app/customer/*; frontend/components/schedule/*; frontend/components/outage/*

**Implementation Tasks:**
- Dashboard shows current effective status, next outage countdown/window, active fault/ticket, and meter context.
- Schedule page shows published feeder windows with clear planned vs unexpected distinctions.
- Report-outage page surfaces smart conflict response; never implies a technician exists when planned conflict suppressed it.
- Ticket detail displays status timeline and restoration notification.
- Notification page supports read/unread and safe retry.

**Business Logic:** Customer sees only their meters and tickets.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Forms validate locally but API response is final; handle 401 session expiry and 403/409/422.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** Escape all user-supplied text; no raw HTML.

**Testing:** RTL/component/E2E smoke coverage for core customer journey.

**Completion Criteria:** Customer journey is complete from login to schedule/report/restoration history.

**Git Commit:** `feat: complete customer experience`

### Phase 29 — Manager Fault Queue & Assignment Oversight

**Phase Goal:** Give Zone Manager fault visibility and manual assignment/reassignment.

**Prerequisites:** 26,21,22

**Files/Folders:** backend/src/modules/outages/manager/*; frontend/app/manager/outages/*

**Implementation Tasks:**
- List zone-scoped unassigned/active tickets sorted by priority and age.
- List eligible technicians and expose deterministic workload counts.
- Allow assign/reassign; preserve assignment history and emit ticket:assigned/status events.

**Business Logic:** Manager cannot assign a ticket outside own zone; technician must be active and scoped to that zone.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** 409 for terminal ticket or concurrent reassignment.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** All assignment changes audited; no hidden role changes.

**Testing:** Test cross-zone, inactive technician, concurrent assignment and queue filtering.

**Completion Criteria:** Manager can reliably oversee and correct technician assignments.

**Git Commit:** `feat: add manager fault oversight`

### Phase 30 — Manager Analytics & Monthly Reporting

**Phase Goal:** Implement the required bounded analytics without speculative metrics.

**Prerequisites:** 29,21

**Files/Folders:** backend/src/modules/analytics/*; frontend/app/manager/analytics/*

**Implementation Tasks:**
- Implement feeder failure frequency and average resolution time per technician/team.
- Add ticket-count-by-status as the third supported metric from the source plans.
- Require explicit month or bounded date range; use efficient indexed aggregates and return export-ready tabular JSON.

**Business Logic:** Analytics are read-only and zone-scoped.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Reject unbounded date ranges or invalid months.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** Exclude data outside the manager's zone.

**Testing:** Seed known ticket history and verify aggregate results exactly.

**Completion Criteria:** Manager analytics answer the documented questions with reproducible bounded queries.

**Git Commit:** `feat: add manager analytics`

### Phase 31 — Infrastructure Upgrade Requests

**Phase Goal:** Implement manager requests for feeder upgrades and admin decisions.

**Prerequisites:** 30,10

**Files/Folders:** backend/src/modules/upgrades/*; frontend/app/manager/upgrade-requests/*; frontend/app/admin/upgrade-requests/*

**Implementation Tasks:**
- Create InfrastructureUpgradeRequest with feeder, requester, reason, supporting data and status.
- Manager create/list within own zone; Admin list/update status/notes.
- Notify requester when status changes where notification channel is enabled.

**Business Logic:** Manager can only request for feeders in their zone.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** 409 invalid status transition; 422 missing reason/invalid feeder.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** Audit every admin decision and prevent privilege escalation through requester fields.

**Testing:** CRUD/authorization/state tests.

**Completion Criteria:** Upgrade request lifecycle is traceable and scoped.

**Git Commit:** `feat: add infrastructure upgrade requests`

### Phase 32 — Admin User & Scope Management

**Phase Goal:** Complete Admin user administration and operational scope management.

**Prerequisites:** 9,31

**Files/Folders:** backend/src/modules/users/admin/*; frontend/app/admin/users/*

**Implementation Tasks:**
- List/search users by role/status/zone.
- Create internal users; set role/status/zone scope; reset or force credential rotation via supported safe flow.
- Prevent incompatible scopes and prevent suspending/deleting the last active Admin.

**Business Logic:** Internal roles are Admin-created; customers remain self-registration.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** 409 for last-admin or incompatible scope; 422 invalid role/scope.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** Admin endpoints require ADMIN role; all changes are audited.

**Testing:** Authorization matrix plus lifecycle tests.

**Completion Criteria:** Admins can manage identities without opening privilege-escalation paths.

**Git Commit:** `feat: add admin user management`

### Phase 33 — Admin Audit & Notification Visibility

**Phase Goal:** Provide operational audit and notification delivery views.

**Prerequisites:** 32,19

**Files/Folders:** backend/src/modules/audit/*; backend/src/modules/notifications/admin/*; frontend/app/admin/audit/*; frontend/app/admin/notifications/*

**Implementation Tasks:**
- Paginate and filter AuditLog by actor/action/entity/date.
- Show notification state, attempts, provider message id and last error without secrets.
- Expose enough context to troubleshoot failed SMS while redacting sensitive values.

**Business Logic:** Admin-only.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Use bounded pagination and safe filter allowlists.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** Never expose Twilio credentials or full confidential content unnecessarily.

**Testing:** Audit/notification API tests and UI redaction checks.

**Completion Criteria:** Admin can trace privileged actions and delivery failures.

**Git Commit:** `feat: add admin audit and notification views`

### Phase 34 — Node-cron Background Jobs

**Phase Goal:** Implement idempotent scheduled orchestration for activation/completion/notifications and explicitly approved simulation.

**Prerequisites:** 18,19,20,23

**Files/Folders:** backend/src/modules/jobs/*; backend/src/config/cron.ts

**Implementation Tasks:**
- Activation job: publish→active slot transitions and feeder status refresh.
- Completion job: active→completed and restore feeder state when no other active condition exists.
- Notification dispatcher: select pending notifications with bounded batch/retry.
- Grid simulation/hourly scheduling only when enabled and only through domain services; simulation disabled in production by default.
- Use Redis distributed locks for each job.

**Business Logic:** Jobs must be safe across multiple replicas and restarts.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Failures are logged/metriced and retried by idempotent logic; never duplicate notifications or tickets.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** Do not let simulated telemetry masquerade as real grid data.

**Testing:** Run each job twice; verify no duplicate state transitions or notifications.

**Completion Criteria:** Background automation works without a message queue and is safe in multi-instance deployment.

**Git Commit:** `feat: add idempotent cron jobs`

### Phase 35 — Realtime Refresh Extension

**Phase Goal:** Complete event-driven refresh and reconnect reconciliation across affected portals.

**Prerequisites:** 25,26,28

**Files/Folders:** frontend/lib/realtime/*; backend realtime event helpers; affected dashboards

**Implementation Tasks:**
- Refresh operator/customer/manager snapshots on schedule publication, status changes and ticket transitions.
- On disconnect/reconnect, fetch authoritative REST data and reconcile timestamps/versions.
- Debounce repeated event-triggered fetches.

**Business Logic:** Socket layer does not become a second persistence system.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Socket errors must degrade to polling/manual refresh UI where appropriate.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** Do not leak unauthorized events during room changes.

**Testing:** Reconnect, duplicate-event and cross-zone tests.

**Completion Criteria:** Live pages remain correct after disconnect/reconnect/event bursts.

**Git Commit:** `feat: complete realtime refresh behavior`

### Phase 36 — Complete Validation Contract

**Phase Goal:** Freeze and apply shared validation for every endpoint and form.

**Prerequisites:** 10-35

**Files/Folders:** backend validators; frontend/lib/validation/*; docs/api/*; tests

**Implementation Tasks:**
- Use a single schema validation library and shared definitions where transport types can safely be shared.
- Validate UUIDs, enums, ISO dates, decimal MW values, phone/email, pagination, filters, schedule windows, state transitions and upload metadata.
- Define cross-field rules and reject unknown server-owned fields.
- Freeze request/response schemas after this phase unless versioned.

**Business Logic:** Backend validation is authoritative.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Map shape errors to 400/422 consistently.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** Reject mass assignment and prototype/unsafe object patterns.

**Testing:** Run an invalid-input matrix against every high-value endpoint and form.

**Completion Criteria:** All endpoints/forms have deterministic, documented validation behavior.

**Git Commit:** `chore: freeze validation contracts`

### Phase 37 — Central Error Handling & UX

**Phase Goal:** Make backend and frontend failure behavior consistent.

**Prerequisites:** 36,3,4

**Files/Folders:** backend/src/utils/errors.ts; middleware/errorHandler.ts; frontend/lib/api/errors.ts; error UI components

**Implementation Tasks:**
- Finalize machine-readable error codes, request IDs and retryability rules.
- Map 401 to session recovery, 403 to forbidden messaging, 404 to not-found, 409 to refresh/reconcile, 422 to field errors, 429 to backoff, 500/503 to safe retry messaging.
- Ensure every error response uses the global envelope.

**Business Logic:** No route may bypass the error handler.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** External provider errors are normalized.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** Do not reveal stack traces, SQL, provider responses or secrets.

**Testing:** Trigger representative failures and verify user-safe output.

**Completion Criteria:** All implemented pages and APIs expose consistent error behavior.

**Git Commit:** `feat: unify error handling`

### Phase 38 — Security Hardening

**Phase Goal:** Perform the dedicated production security pass.

**Prerequisites:** 36,37,24,25

**Files/Folders:** backend security middleware; auth/rbac modules; upload adapters; frontend security config; docs/security.md

**Implementation Tasks:**
- Configure secure headers, explicit CORS, request/body limits and Redis-backed rate limiting.
- Rate-limit registration/login/outage reporting and generic authenticated writes.
- Audit IDOR, role escalation, raw SQL, XSS, CSRF/session handling, file uploads and secrets.
- Review frontend for unsafe HTML rendering and backend logs for sensitive values.

**Business Logic:** Example limits: register 5/hour/IP; login 10/15m/IP plus 5/15m/account; forgot-password only if implemented; outage reports 10/hour/account; other authenticated writes 100/min/account.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** 429 with Retry-After where possible; no user-enumeration through auth.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** Use Helmet/CSP appropriately, secure cookies, signed upload URLs, private bucket, provider signature verification.

**Testing:** Automate rate-limit, IDOR, XSS, queryRawUnsafe, secret-scan and upload-abuse checks.

**Completion Criteria:** No known high-risk security gap remains and critical tests pass.

**Git Commit:** `security: harden authentication authorization and uploads`

### Phase 39 — Performance & Query Optimization

**Phase Goal:** Optimize real access patterns without adding infrastructure.

**Prerequisites:** 38,30

**Files/Folders:** backend repositories/services; Prisma indexes; frontend data hooks

**Implementation Tasks:**
- Audit query plans and add/adjust indexes for feeder/zone/status/time, notification status, ticket queues and schedule windows.
- Use Prisma select/includes carefully and remove N+1 hierarchy loads.
- Cache published schedules and bounded dashboard aggregates where beneficial.
- Debounce table filters and avoid unnecessary refetches.

**Business Logic:** Do not introduce microservices or queues for performance.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Set bounded query/page limits and timeouts.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** Ensure optimization never bypasses authorization filters.

**Testing:** Load-test the main list/dashboard endpoints and compare query counts.

**Completion Criteria:** Core pages remain responsive under the agreed demo load and query counts are bounded.

**Git Commit:** `perf: optimize operational query paths`

### Phase 40 — Responsive & Accessible UX Completion

**Phase Goal:** Finish responsive, keyboard-accessible, data-dense interfaces.

**Prerequisites:** 39,28,26,27

**Files/Folders:** frontend/components/*; frontend/app/*; accessibility tests

**Implementation Tasks:**
- Ensure Shadcn tables, dialogs, forms and navigation work keyboard-first.
- Provide focus states, labels, error associations, semantic headings, responsive tables/cards, mobile technician workflow.
- Keep status meaning available through text, not color alone.

**Business Logic:** Do not use color as the only state indicator.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Forms preserve validation feedback at mobile widths.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** No PII is revealed through accessibility-only hidden text.

**Testing:** Run component accessibility checks and manual keyboard/mobile smoke passes.

**Completion Criteria:** All portals are usable at desktop and mobile breakpoints with accessible semantics.

**Git Commit:** `feat: finish responsive accessible ui`

### Phase 41 — Backend Test Suite Completion

**Phase Goal:** Complete backend unit, integration and security regression coverage.

**Prerequisites:** 36,37,38,39

**Files/Folders:** backend/tests/*; module __tests__/*; test database setup

**Implementation Tasks:**
- Cover scheduler, overlap, fairness, conflict resolver, state machine, RBAC, ownership, admin mutations, cache fallback, notifications, uploads, Socket.io, cron and analytics.
- Every endpoint gets happy-path, validation, permission and material business-rule coverage.
- Use isolated test DB/fixtures and deterministic clocks where time matters.

**Business Logic:** Tests must not depend on production services or credentials.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** External integrations use contract tests/mocks plus a small opt-in sandbox test.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** Include abuse/security regressions.

**Testing:** Run clean DB migration+seed then full test suite.

**Completion Criteria:** Backend regression suite is green and materially covers all critical business rules.

**Git Commit:** `test: complete backend regression suite`

### Phase 42 — Frontend Test Suite Completion

**Phase Goal:** Complete page/component/hook tests for all role portals.

**Prerequisites:** 40,28

**Files/Folders:** frontend/tests/*; component tests; route-level tests

**Implementation Tasks:**
- Test auth guards, forms, tables, loading/empty/error states, API error mapping, status transitions, schedule countdown, notification read state and socket refresh behavior.
- Mock API contracts rather than duplicating backend logic.
- Verify mobile-sensitive critical interactions where practical.

**Business Logic:** Tests assert user-visible behavior, not internal implementation details.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Expired session and forbidden routes must show correct UX.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** Ensure no test exposes real environment secrets.

**Testing:** Run full React Testing Library/Vitest suite.

**Completion Criteria:** Frontend regression suite covers every main journey and role portal.

**Git Commit:** `test: complete frontend suite`

### Phase 43 — End-to-End Role Journeys

**Phase Goal:** Verify the five complete user journeys against a real local/staging stack.

**Prerequisites:** 41,42

**Files/Folders:** Playwright tests; seed fixtures; E2E config

**Implementation Tasks:**
- Customer: register/login → bind meter → dashboard → planned conflict report → unexpected report → ticket → restoration.
- Operator: control room → generate → review/edit → publish → customer notification.
- Technician: queue → accept → repair → upload photo → resolve.
- Manager: live grid → fault oversight → assignment → analytics → upgrade request.
- Admin: users → topology → audit/notification views.

**Business Logic:** Use deterministic test data and clock control where needed.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Handle concurrent assignment/publish scenarios as separate E2E tests.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** Run E2E with non-production credentials and isolated data.

**Testing:** Capture screenshots/videos only for failed runs or CI artifacts.

**Completion Criteria:** All role journeys succeed end-to-end and the smart conflict behavior is proven.

**Git Commit:** `test: add end to end role journeys`

### Phase 44 — Observability, Logging & Health

**Phase Goal:** Finalize structured logging, health probes and operational diagnostics.

**Prerequisites:** 34,41,43

**Files/Folders:** backend logger; health controllers; docs/deployment.md; CI smoke checks

**Implementation Tasks:**
- Implement liveness and readiness endpoints.
- Add correlation IDs, request timing, job timing, notification delivery metrics and error counters.
- Document expected alerts/operational checks without requiring a specific monitoring vendor.

**Business Logic:** Readiness must fail when required DB connectivity is unavailable; Redis may be degraded with documented behavior.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Health responses must not leak dependency credentials or raw errors.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** Redact secrets and PII; separate audit events from debug logs.

**Testing:** Smoke-test health, dependency failure, logging redaction and job failure paths.

**Completion Criteria:** Operators can distinguish process health, dependency health and business failures.

**Git Commit:** `chore: finalize observability and health`

### Phase 45 — API Documentation & Contract Freeze

**Phase Goal:** Freeze and publish API, data, realtime and error contracts.

**Prerequisites:** 44,36

**Files/Folders:** docs/api/*; docs/architecture.md; README.md; OpenAPI artifact if used

**Implementation Tasks:**
- Document every endpoint with method/path, auth/role, headers, params, body, validation, response, status, errors, business rules and side effects.
- Document socket events/rooms, pagination, date-time rules and idempotency behavior.
- Cross-check docs against route registration and tests; no undocumented business endpoint remains.

**Business Logic:** Do not introduce a second API contract in prose.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Contract changes after freeze require a decision-log entry/version update.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** Docs must not contain real tokens/secrets.

**Testing:** Run a contract checklist against route files and integration tests.

**Completion Criteria:** API and realtime docs are complete and internally consistent.

**Git Commit:** `docs: freeze api and integration contracts`

### Phase 46 — Production Deployment Architecture

**Phase Goal:** Prepare a provider-neutral production deployment for Next.js, long-lived Express, Postgres, Redis, Twilio, storage and cron.

**Prerequisites:** 45,44

**Files/Folders:** deployment manifests/docs; Dockerfiles if selected; migration scripts; runtime configs

**Implementation Tasks:**
- Build frontend and backend separately; run DB migrations before enabling new code that depends on them.
- Ensure Express runs as a long-lived websocket-capable process and deployment routes websocket traffic.
- Configure Neon, Upstash, Auth.js, Twilio, storage and CORS using secret management.
- Run only one cron executor or use Redis locks so horizontal scaling does not duplicate jobs.

**Business Logic:** Deployment target remains provider-neutral until selected; document the chosen target before production.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Health/readiness gates deployment; failed migrations stop release.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** Use TLS, secure cookies, private storage and least-privilege service credentials.

**Testing:** Stage deployment smoke test plus rollback/recovery drill.

**Completion Criteria:** Production deployment is reproducible and does not duplicate jobs or break Socket.io.

**Git Commit:** `chore: prepare production deployment`

### Phase 47 — Git, CI & Release Process

**Phase Goal:** Finalize automated quality gates and incremental release process.

**Prerequisites:** 46

**Files/Folders:** .github/workflows/ci.yml; package scripts; docs/deployment.md; CHANGELOG.md

**Implementation Tasks:**
- CI: install locked dependencies, lint, type-check, unit/integration tests, frontend tests, build, migration validation, security scans.
- Use phase-aligned commits and conventional messages; no giant completion commit.
- Define release checklist, migration order, rollback notes, environment promotion and artifact retention.

**Business Logic:** CI must fail on test/type/lint/security-critical failures.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Never print secret environment values in CI logs.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** Secret scanning and dependency audit run on every protected branch.

**Testing:** Open PR from clean checkout and verify all gates.

**Completion Criteria:** Repository has repeatable CI and a documented release/rollback path.

**Git Commit:** `ci: finalize release pipeline`

### Phase 48 — Final System Audit & Handoff

**Phase Goal:** Perform the final consistency audit, verify all journeys/contracts/inventories, and hand off the system with no hidden contradictions.

**Prerequisites:** All previous phases

**Files/Folders:** implementation.md; docs/*; final verification scripts; README.md

**Implementation Tasks:**
- Cross-check source requirements against final architecture, database, API, frontend pages, role matrix, jobs, notifications, realtime events and tests.
- Verify no duplicate API, conflicting stack choice, stale route, mismatched entity name, unversioned business endpoint or unsupported feature remains.
- Run clean install → migrate → seed → backend tests → frontend tests → E2E → build → deployment smoke path.
- Verify every phase completion criterion is satisfied and all decision-log entries are closed or explicitly deferred with owner/impact.

**Business Logic:** Do not add new feature scope during final audit.

**API / Data Contracts:** Honor the global `/api/v1` JSON/error/pagination/date-time contracts. Server-owned IDs, roles, timestamps, scopes and audit fields are not mass-assignable.

**Edge Cases:** Handle missing resources, inactive/deleted entities, duplicate submissions, concurrent mutations, stale clients, and external dependency failure where applicable.

**Validation:** Any inconsistency blocks completion until the source of truth is updated consistently.

**Error Handling:** Use the global error contract; failures must be normalized and must not expose internal details.

**Security:** Re-run secret/security scans and verify no production credentials are present.

**Testing:** Execute final checklist plus all five role journeys and the API/data/realtime cross-check.

**Completion Criteria:** Definition of Done is met only when all 48 phases are complete, the five journeys pass, contracts reconcile, and deployment/docs match the implementation.

**Git Commit:** `docs: finalize system audit and handoff`


## 22. Final Integration

After all feature phases are complete, integrate in this order:

1. Run Prisma migrations against a clean test database.
2. Seed the deterministic topology and role accounts.
3. Start Express and verify `/api/v1/health/live` and `/api/v1/health/ready`.
4. Start Next.js with the API/socket URLs configured.
5. Verify Auth.js login/session → backend bearer authorization.
6. Verify customer meter binding → dashboard → published schedule reads.
7. Generate and publish a schedule; confirm DB, Redis, notification intent, and socket events.
8. Activate the schedule via the job; confirm effective feeder status.
9. Submit a planned-conflict outage report; confirm no dispatchable ticket.
10. Submit an unexpected outage; confirm assignment, technician workflow, photo verification, resolution, notification and status update.
11. Verify Zone Manager live table and analytics against the same source records.
12. Verify Admin changes are audited and cannot destroy historical operational data.

### Integration invariants

- Postgres is authoritative.
- Every externally visible mutation has one domain service and one canonical API.
- Cache/event/notification side effects cannot create a contradictory primary record.
- A reconnecting client can rebuild its complete view from REST alone.
- All role portals consume the same status and ticket state machines.

## 23. Complete Testing Strategy

### 23.1 Unit tests

Cover:
- password hashing and token verification;
- input schemas;
- fair-rotation ranking/selection;
- schedule overlap calculation;
- effective feeder status precedence;
- ticket state transition rules;
- technician selection;
- conflict resolution;
- notification message/idempotency generation;
- pagination/sort allowlists;
- cache-key generation;
- cron lock/idempotency helpers.

### 23.2 Integration/API tests

Every endpoint must test:
- successful response;
- malformed/invalid input;
- authentication failure;
- wrong role;
- wrong resource scope/ownership;
- invalid state;
- uniqueness/concurrency conflict;
- relevant external dependency failure/fallback.

Critical transactional tests:
- schedule publication rolls back domain writes if the transaction fails;
- assignment cannot create two conflicting technicians from a race;
- ticket resolution cannot become RESOLVED without verified photo;
- planned-conflict detection cannot accidentally create a dispatchable ticket.

### 23.3 Database tests

- Clean migration applies.
- Seed is deterministic.
- Unique constraints work.
- Foreign-key rules work.
- Destructive deletes are restricted where history exists.
- Required indexes exist in migration/schema.
- Queries return correct data under multiple zones/meters/tickets.

### 23.4 Frontend tests

Test each role's primary routes for:
- loading;
- empty;
- success;
- validation;
- 401/session expiry;
- 403;
- 404;
- 409 conflict;
- 422 field errors;
- network/offline;
- socket reconnect;
- responsive table/form interactions.

### 23.5 E2E acceptance scenarios

1. Customer registers/binds meter and sees status.
2. Operator generates a draft with a deterministic selected feeder set and visible shortfall.
3. Operator publishes; affected customer sees planned outage and receives notification intent.
4. Customer reports during the active planned window; no technician dispatch is created.
5. Customer reports outside the window; fault is created and assigned.
6. Technician accepts, repairs, uploads proof and resolves.
7. Customer sees restoration; Manager sees realtime status.
8. Manager opens monthly analytics and creates an upgrade request.
9. Admin changes feeder critical flag/user scope and sees audit records.

## 24. Security Audit Checklist

### Authentication
- [ ] Passwords are never stored plaintext.
- [ ] Access/session tokens are short-lived and never stored in browser local storage.
- [ ] Suspended users are rejected even with a previously issued token.
- [ ] Auth.js cookie settings are secure in production.
- [ ] CSRF protections are correctly applied to cookie-authenticated browser actions.

### Authorization
- [ ] Every backend route declares role and scope.
- [ ] Customer resource ownership is checked.
- [ ] Technician ticket ownership is checked.
- [ ] Zone Manager zone scope is checked.
- [ ] Admin mutations cannot be reached by lower roles.
- [ ] Last active Admin cannot be suspended/removed accidentally.

### Input and API security
- [ ] All inputs are schema validated.
- [ ] Unknown server-owned fields are rejected/ignored.
- [ ] Sort/filter fields are allowlisted.
- [ ] Pagination and request sizes are bounded.
- [ ] Raw SQL is absent or explicitly reviewed/parameterized.
- [ ] Error responses contain no stack traces or secrets.

### Browser and realtime security
- [ ] Production CORS is allowlisted.
- [ ] Secure headers are configured.
- [ ] No unsafe user HTML rendering.
- [ ] Socket connections are authenticated.
- [ ] Socket room membership is scope-checked.
- [ ] Socket payloads omit unnecessary PII.

### Uploads
- [ ] JPEG/PNG only.
- [ ] Maximum 5 MB.
- [ ] Signed upload URLs expire in 5 minutes.
- [ ] Objects are private.
- [ ] Signed read URLs require authorization.
- [ ] Verified attachment is required for ticket resolution.

### Abuse and secrets
- [ ] Auth/outage write endpoints have rate limits.
- [ ] Redis-backed rate limiting works across replicas.
- [ ] Secret scanning is enabled.
- [ ] Provider credentials are absent from logs/client bundles.
- [ ] Notification retries are bounded.

## 25. Performance & Scalability

### Baseline targets

Establish measurable staging targets before production and keep the application within the agreed budget rather than inventing arbitrary SLAs.

### Query strategy

- Index every operational queue by the fields used for scope, status and time.
- Use bounded date ranges.
- Use selective Prisma queries.
- Avoid N+1 loading of Zone → Substation → Feeder → Meter.
- Pre-aggregate only the documented manager metrics when needed.
- Cache published schedule reads.
- Do not cache authorization decisions.

### Concurrency

- Use transactions for publication, assignment and ticket transitions.
- Use optimistic/version checks or transaction isolation to prevent stale state overwrites.
- Use Redis locks for singleton cron work.
- Use idempotency keys for externally retryable mutations such as publish and notification dispatch.

### Scaling

The system can scale frontend/backend replicas horizontally provided:
- Socket.io uses a compatible deployment/transport configuration;
- cron execution is singleton/lock-protected;
- Postgres remains authoritative;
- Redis cache/locks are shared;
- no in-memory process state is required for correctness.

Do not add a message queue or microservice merely to address ordinary read/write load.

## 26. Deployment

### Build order

1. CI passes.
2. Build frontend/backend artifacts.
3. Apply backward-compatible DB migration.
4. Deploy backend.
5. Verify readiness.
6. Deploy frontend.
7. Verify websocket and auth flows.
8. Run smoke tests.
9. Enable cron only after the new code is ready.

### Runtime requirements

- HTTPS for browser/API traffic.
- Websocket-capable long-lived Express process.
- Neon Postgres reachable from backend.
- Upstash Redis reachable for cache/locks.
- Twilio credentials available only to backend.
- Private object storage reachable from backend for signing operations.
- Secret management outside source control.

### Rollback

- Keep migrations backward-compatible where possible.
- If application rollback is required, use a database state compatible with the older application.
- Never roll back by deleting operational records.
- Disable cron before rolling back a job contract if needed.
- Document provider-specific rollback commands after a deployment target is selected.

## 27. CI/CD

`.github/workflows/ci.yml` should run:

```text
install locked dependencies
→ lint
→ type-check
→ schema/migration validation
→ backend unit + integration tests
→ frontend unit/component tests
→ security/secret scans
→ production builds
→ optional E2E against an isolated database
```

Protected branches must reject failed gates.

Release workflow:
```text
merge → build artifacts → migrate → deploy backend → health check
      → deploy frontend → websocket/auth smoke → enable/verify cron
```

No CI job may echo secrets.

## 28. Documentation Deliverables

Maintain:
- `README.md` — setup, commands, architecture summary, role accounts for development only.
- `docs/architecture.md` — component boundaries, auth transport, realtime, cache, jobs.
- `docs/database.md` — ER model, entity fields, constraints, indexes, migration rules.
- `docs/api/` — one page/spec per API domain or an OpenAPI document.
- `docs/security.md` — threat model, RBAC, upload, secrets, rate limits.
- `docs/deployment.md` — environments, build, migration, runtime, health, rollback.
- `docs/decisions.md` — only unresolved/approved decisions and their impact.
- `implementation.md` — this authoritative roadmap; update only when implementation contracts change.

Documentation must match implemented route names, schema names, environment variables and deployment topology.

## 29. Final Verification Checklist

### Requirements
- [ ] Every material requirement from all three source plans is mapped to a final phase.
- [ ] No source requirement was copied merely because it existed; alternatives were reconciled into one architecture.
- [ ] No contradictory database, API or authentication architectures remain.

### Architecture
- [ ] Next.js App Router, Express, Prisma/Neon, Upstash Redis, Auth.js, Socket.io, node-cron and Twilio are used consistently.
- [ ] No accidental GraphQL, message queue, microservice or GIS dependency exists.
- [ ] Socket.io is attached to a long-lived HTTP server.

### Database
- [ ] Entity names are consistent across Prisma, services, APIs and docs.
- [ ] Zone/Substation/Feeder/Meter hierarchy is intact.
- [ ] Multiple meters per customer are supported safely.
- [ ] History/audit records preserve operational traceability.
- [ ] Deletes cannot destroy required history.

### APIs
- [ ] All business endpoints use `/api/v1`.
- [ ] Every endpoint documents auth, role, request, validation, response, status/errors, business rules and side effects.
- [ ] Pagination/date/filter conventions are consistent.
- [ ] No duplicate endpoint implements the same operation.

### Authentication and authorization
- [ ] Auth.js session and backend token flow are documented once.
- [ ] Customer verification policy is documented.
- [ ] Every protected route enforces role/scope/ownership on the backend.

### Scheduling
- [ ] Critical feeders can never be selected.
- [ ] Same-day double-cut prevention is enforced.
- [ ] Fairness ordering is deterministic.
- [ ] Shortfall is reported honestly.
- [ ] Publish is transactional/idempotent.

### Outages
- [ ] Planned conflict creates no dispatchable ticket.
- [ ] Unexpected fault creates a ticket.
- [ ] Technician workflow is enforced by a state machine.
- [ ] Resolution requires verified photo evidence.

### Notifications/realtime
- [ ] Twilio is isolated behind an adapter.
- [ ] Notifications are persisted and retryable.
- [ ] Socket events are scope-safe and emitted after commits.
- [ ] REST is authoritative after reconnect.

### Operations
- [ ] Cron jobs are idempotent and lock-protected.
- [ ] Health/readiness endpoints work.
- [ ] Redis failures degrade safely.
- [ ] Logs redact secrets.

### Testing
- [ ] Unit, integration, frontend and E2E suites pass.
- [ ] Security/IDOR/rate-limit/upload tests pass.
- [ ] All five role journeys pass.

## 30. Complete User Journey

### Customer Journey

```text
Register
  → verify/activate according to configured policy
  → Login
  → Bind/select meter
  → Resolve Meter → Feeder → Zone
  → Dashboard: current status + upcoming schedule
  → Planned outage occurs
      → dashboard/countdown reflects planned state
  OR
  → Unexpected outage occurs
      → Report outage
      → conflict check
          → active planned slot: inform customer, no dispatch ticket
          → otherwise: create fault
                → acknowledgement
                → assignment
                → Technician En Route
                → Repairing
                → verified repair photo
                → Resolved
                → restoration notification
  → Notification/ticket history
  → Profile/password
  → Logout
```

### Operator Journey

```text
Login
 → Control Room
 → View GridStatus deficit/current demand
 → Generate Schedule
 → Fairness engine
 → Review draft + shortfall
 → Edit valid slots if needed
 → Publish
 → Redis refresh
 → Notification intent
 → Socket update
 → Monitor schedules/history
```

### Technician Journey

```text
Login
 → Assigned Queue
 → Open ticket
 → Accept & En Route
 → Arrive
 → Start Repair
 → Upload JPEG/PNG proof
 → Complete evidence verification
 → Resolve
 → Customer + Manager updates
 → History
```

### Zone Manager Journey

```text
Login
 → Live Grid table
 → Sort/filter feeders
 → Inspect unexpected faults
 → Inspect technician assignment
 → Observe realtime transitions
 → Monthly analytics
 → Create infrastructure upgrade request
 → Track request
```

### Admin Journey

```text
Login
 → User management
 → Role/status/scope changes
 → Grid topology management
 → Critical feeder controls
 → Audit review
 → Notification delivery review
 → Upgrade-request decisions
```

## 31. Complete API Journey

```text
Authentication
  /auth/register → /auth/login → /auth/me

Customer
  /customers/me
  → /customers/me/meters
  → /customers/me/dashboard
  → /schedules/my
  → /customers/me/outages
  → /customers/me/notifications

Operator
  /operator/overview
  → /operator/schedules/generate
  → /operator/schedules/:id
  → /operator/schedules/:id/slots/:slotId
  → /operator/schedules/:id/publish

Outage
  /customers/me/outages
  → /outages/:id
  → /outages/:id/assign
  → /technician/outages/:id/accept
  → /technician/outages/:id/start-repair
  → /technician/outages/:id/attachments
  → /technician/attachments/:id/complete
  → /technician/outages/:id/resolve

Manager
  /manager/grid
  /manager/outages
  /manager/outages/:id/assignment
  /manager/analytics/*
  /manager/upgrade-requests

Admin
  /admin/users/*
  /admin/zones/*
  /admin/substations/*
  /admin/feeders/*
  /admin/meters/*
  /admin/audit
  /admin/notifications
  /admin/upgrade-requests/*
```

## 32. Complete Role-Based Journey Matrix

| Capability | Customer | Operator | Technician | Zone Manager | Admin |
|---|---:|---:|---:|---:|---:|
| Self-register | ✓ | — | — | — | — |
| View own schedule | ✓ | — | — | — | — |
| Report outage | ✓ | — | — | — | — |
| Generate schedule | — | ✓ | — | — | — |
| Publish schedule | — | ✓ | — | — | — |
| Accept assigned fault | — | — | ✓ | — | — |
| Resolve fault | — | — | ✓ | — | — |
| Upload repair evidence | — | — | ✓ | — | — |
| Live zone grid | — | operational view | — | ✓ | ✓ |
| Assign technician | — | ✓ within scope | — | ✓ own zone | ✓ |
| Manager analytics | — | — | — | ✓ | ✓/admin view |
| Upgrade request | — | — | — | ✓ | decide |
| Manage topology | — | — | — | — | ✓ |
| Manage users/roles | — | — | — | — | ✓ |
| Audit logs | — | — | — | — | ✓ |
| Notification delivery visibility | — | limited operational | — | limited zone | ✓ |

## 33. Definition of Done

The project is complete only when:

1. All 48 phases are implemented and verified.
2. The final repository matches the architecture and folder/module boundaries in this document.
3. Prisma migrations and seed data work on a clean environment.
4. Every business endpoint uses `/api/v1` and matches the documented contract.
5. Backend role/scope/ownership authorization passes the full matrix.
6. The scheduler is deterministic, fair by the documented rule, critical-feeder safe, and honest about shortfall.
7. Planned-conflict reports never enter technician dispatch.
8. Unexpected outage tickets progress only through legal states and require verified repair evidence for resolution.
9. Redis cache failures degrade safely.
10. Twilio failures do not corrupt committed domain state.
11. Socket.io is authenticated, zone-scoped and reconnect-safe.
12. Cron jobs are idempotent and multi-instance safe.
13. Rate limits, secure headers, secret handling, upload controls and IDOR protections pass the security audit.
14. Unit, integration, frontend and end-to-end tests pass.
15. CI is reproducible from a clean checkout.
16. Production deployment and rollback procedures are documented.
17. README/API/database/security/deployment documentation agrees with the implementation.
18. The customer, operator, technician, Zone Manager and Admin journeys can all be demonstrated end-to-end.
19. No undocumented feature, duplicate API, contradictory entity/route name or silent architecture change remains.

## 34. Source Coverage & Reconciliation Record

This final plan deliberately preserves the strongest source-specific details rather than merging contradictory alternatives:

- **Plan 1 contributions retained:** explicit five-role journeys; GridStatus operational snapshot; fault priority; auto-assignment; Fault/Photo/Update-style history concepts; detailed backend/frontend module boundaries; Redis cache, Twilio and cron separation; administrator topology management; operational logging.
- **Plan 2 contributions retained:** CustomerProfile one-to-one identity boundary with one-to-many meters; User status/verification concepts; ScheduleGenerationRun; TicketStatusHistory; FeederStatusHistory; deterministic fairness/shortfall contract; signed upload flow; notification status/retry behavior; soft-delete user policy; rate-limit specifics; admin delete safeguards.
- **Plan 3 contributions retained:** dependency-ordered 48-phase roadmap; global `/api/v1` contract; global error taxonomy; explicit role/scope model; centralized repository architecture; feature→API→page→entity mapping; Socket.io room contract; Redis/cache rules; cron idempotency; performance/security/test/deployment sections; final audit and Definition of Done.

Where the source plans conflicted, this document uses one implementation:
- versioned REST, not parallel REST/GraphQL;
- one coherent Auth.js + Express authentication flow, not multiple auth systems;
- one normalized outage domain model, with planned-conflict reports recorded for traceability but excluded from dispatch;
- one storage abstraction for repair photos rather than filesystem/public URL alternatives;
- one deterministic scheduler rather than multiple fairness formulas.

## 35. AI Coding-Agent Operating Rules

1. Read the relevant phase completely before modifying files.
2. Check every prerequisite phase's completion criteria before starting.
3. Search the repository for an existing module/service/component before creating a new one.
4. Reuse canonical services for business rules; never implement the same rule in a controller, cron handler and UI independently.
5. Match exact endpoint names, entity names, enum values, status transitions and response envelopes from this document.
6. Prefer additive, backward-compatible changes when later phases require shared infrastructure.
7. Run phase verification immediately after implementation.
8. Keep commits isolated by phase or coherent sub-phase.
9. When implementation reality conflicts with this blueprint, update `docs/decisions.md`, reconcile dependent sections, and only then continue.
10. Never silently substitute technology, invent data, weaken authorization, or remove requirements to make a test pass.

## 36. Final Handoff Checklist

```text
[ ] Clean clone succeeds
[ ] Dependencies install from lockfiles
[ ] Environment examples are complete
[ ] Database migrates from empty state
[ ] Seed succeeds
[ ] Backend starts
[ ] Frontend starts
[ ] Auth works
[ ] RBAC works
[ ] Customer schedule works
[ ] Schedule generation works
[ ] Schedule publication works
[ ] Redis cache works and fails safely
[ ] Planned-conflict suppression works
[ ] Unexpected outage ticket works
[ ] Technician workflow works
[ ] Repair photo verification works
[ ] SMS adapter works in test mode
[ ] In-app notifications work
[ ] Socket.io room isolation works
[ ] Cron jobs are idempotent
[ ] Manager analytics match known fixtures
[ ] Admin audit is populated
[ ] Accessibility smoke passes
[ ] Security audit passes
[ ] Backend tests pass
[ ] Frontend tests pass
[ ] E2E journeys pass
[ ] Production build passes
[ ] Deployment smoke passes
[ ] Rollback notes are documented
[ ] API/database/security docs match code
[ ] No secrets are committed
[ ] All 48 phases are marked complete
```
