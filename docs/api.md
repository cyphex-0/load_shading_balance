# Canonical REST API Specification (/api/v1)
## Load Shedding & Power Outage Management System

This document is the authoritative, canonical API specification for the **Load Shedding & Power Outage Management System**. Every route is canonically mounted under **`/api/v1`** (with backwards-compatible aliases mounted at `/api`).

---

## 1. Global Wire Standards & Conventions

### 1.1 Base URL & Content Type
* **Canonical Base Path:** `/api/v1`
* **Compatibility Base Path:** `/api`
* **Wire Format:** `application/json` (except photo uploads: `multipart/form-data`)
* **Time Format:** ISO-8601 UTC string (e.g. `2026-10-29T12:00:00.000Z`)
* **Operational Timezone:** `Asia/Dhaka` (for daily schedule cut resets)

### 1.2 Standard Success Envelope
```json
{
  "success": true,
  "data": { ... },
  "error": null,
  "timestamp": "2026-10-29T12:00:00.000Z",
  "requestId": "req_xyz123"
}
```

### 1.3 Standard Error Envelope
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR | UNAUTHORIZED | FORBIDDEN | NOT_FOUND | CONFLICT",
    "message": "Human-readable description of the error.",
    "details": []
  },
  "timestamp": "2026-10-29T12:00:00.000Z",
  "requestId": "req_xyz123"
}
```

---

## 2. Complete Canonical Route Inventory (81 REST Endpoints)

### Domain 1: System & Health (3 Endpoints)
| # | Method | Path | Role | Description | Status Codes |
|---|---|---|---|---|---|
| 1 | `GET` | `/api/v1/health` | Public | System smoke test checking database, Redis, and memory. | 200, 503 |
| 2 | `GET` | `/api/v1/health/live` | Public | Liveness probe returning `{ status: "LIVE" }`. | 200 |
| 3 | `GET` | `/api/v1/health/ready` | Public | Readiness probe checking database connectivity. | 200, 503 |

---

### Domain 2: Authentication & Session (8 Endpoints)
| # | Method | Path | Role | Description | Status Codes |
|---|---|---|---|---|---|
| 4 | `POST` | `/api/v1/auth/register` | Public | Self-registration for Customers. | 201, 400, 409 |
| 5 | `POST` | `/api/v1/auth/login` | Public | Authenticates credentials, returns user profile and JWT. | 200, 400, 401 |
| 6 | `POST` | `/api/v1/auth/logout` | Authenticated | Clears auth cookies / invalidates session. | 200 |
| 7 | `GET` | `/api/v1/auth/session` | Authenticated | Retrieves current identity, role, and zone scope. (Alias: `/auth/me`) | 200, 401 |
| 8 | `POST` | `/api/v1/auth/verify-email/request` | Authenticated | Queues verification email and token. | 200, 401 |
| 9 | `POST` | `/api/v1/auth/verify-email/confirm` | Public | Confirms email verification token. | 200, 400 |
| 10 | `POST` | `/api/v1/auth/password/forgot` | Public | Generates password reset token sent via email. | 200 |
| 11 | `POST` | `/api/v1/auth/password/reset` | Public | Resets password with valid reset token. | 200, 400 |

---

### Domain 3: User Profile & In-App Notifications (6 Endpoints)
| # | Method | Path | Role | Description | Status Codes |
|---|---|---|---|---|---|
| 12 | `GET` | `/api/v1/users/me` | Authenticated | Returns current profile and linked meters. | 200, 401 |
| 13 | `PATCH` | `/api/v1/users/me` | Authenticated | Updates name, phone number. | 200, 400, 401 |
| 14 | `POST` | `/api/v1/users/me/password` | Authenticated | Updates account password. | 200, 400, 401 |
| 15 | `GET` | `/api/v1/users/me/notifications` | Authenticated | Paginated in-app alerts with unread filter. | 200, 401 |
| 16 | `PATCH` | `/api/v1/users/me/notifications/:id/read` | Authenticated | Marks a single notification as read. | 200, 404 |
| 17 | `POST` | `/api/v1/users/me/notifications/read-all` | Authenticated | Marks all user notifications as read. | 200 |

---

### Domain 4: Public Grid Discovery (3 Endpoints)
| # | Method | Path | Role | Description | Status Codes |
|---|---|---|---|---|---|
| 18 | `GET` | `/api/v1/zones` | Public | Lists all active geographical zones. | 200 |
| 19 | `GET` | `/api/v1/feeders` | Public | Lists all active distribution feeders. | 200 |
| 20 | `GET` | `/api/v1/schedules/public` | Public | Returns published load shedding schedules for the public portal. | 200 |

---

### Domain 5: Customer Journey & Reporting (9 Endpoints)
| # | Method | Path | Role | Description | Status Codes |
|---|---|---|---|---|---|
| 21 | `POST` | `/api/v1/customers/me/meters` | Customer | Links a meter number to the customer profile. | 201, 400, 409 |
| 22 | `GET` | `/api/v1/customers/me/meters` | Customer | Lists all linked meters with current feeder power status. | 200 |
| 23 | `DELETE` | `/api/v1/customers/me/meters/:id` | Customer | Unlinks an electric meter. | 200, 404 |
| 24 | `GET` | `/api/v1/customers/me/meters/:id/status` | Customer | Real-time live status for a specific meter (`ONLINE`, `SCHEDULED_OUTAGE`, `FAULT_OUTAGE`). | 200, 404 |
| 25 | `GET` | `/api/v1/customers/me/meters/:id/schedules` | Customer | Upcoming published load shedding schedules for this meter's feeder. | 200, 404 |
| 26 | `POST` | `/api/v1/customers/me/outage-reports` | Customer | **Smart Outage Report**: Triage against active planned outages. If planned &rarr; suppressed. If unplanned &rarr; creates ticket & dispatches. | 201, 200, 400 |
| 27 | `GET` | `/api/v1/customers/me/outage-reports` | Customer | Historical log of outage reports submitted by customer. | 200 |
| 28 | `GET` | `/api/v1/customers/me/outage-reports/:id` | Customer | Real-time tracking of repair progress for reported blackout. | 200, 404 |
| 29 | `POST` | `/api/v1/customers/me/outage-reports/:id/cancel` | Customer | Cancels an open outage report if power restored prematurely. | 200, 400 |

---

### Domain 6: Power Operator Control Room (8 Endpoints)
| # | Method | Path | Role | Description | Status Codes |
|---|---|---|---|---|---|
| 30 | `GET` | `/api/v1/operator/grid-overview` | Operator | Live overview of total demand, deficit, active outages, and feeder counts. | 200 |
| 31 | `POST` | `/api/v1/operator/schedules/draft` | Operator | **Algorithmic Draft Generator**: Allocates target deficit, strictly exempts critical feeders, enforces no-repeat-cut rule. | 201, 400 |
| 32 | `GET` | `/api/v1/operator/schedules` | Operator | Paginated list of schedules filtered by status (`DRAFT`, `PUBLISHED`, `ACTIVE`, `COMPLETED`). | 200 |
| 33 | `GET` | `/api/v1/operator/schedules/:id` | Operator | Detailed schedule review including all assigned feeder slots. | 200, 404 |
| 34 | `PATCH` | `/api/v1/operator/schedules/:id/slots` | Operator | Manually add/remove/adjust draft feeder slots before publishing. | 200, 400 |
| 35 | `POST` | `/api/v1/operator/schedules/:id/publish` | Operator | Publishes draft schedule, updates Redis cache, and queues SMS alerts. | 200, 400 |
| 36 | `POST` | `/api/v1/operator/schedules/:id/cancel` | Operator | Cancels an active or published schedule and invalidates cache. | 200, 400 |
| 37 | `GET` | `/api/v1/operator/outages/active` | Operator | Real-time list of all feeders currently offline (both planned and unplanned). | 200 |

---

### Domain 7: Field Technician Repair (6 Endpoints)
| # | Method | Path | Role | Description | Status Codes |
|---|---|---|---|---|---|
| 38 | `GET` | `/api/v1/technicians/me/assignments` | Technician | View active and historical repair tickets assigned to logged-in technician. | 200 |
| 39 | `POST` | `/api/v1/technicians/me/assignments/:id/accept` | Technician | Moves ticket status from `ASSIGNED` &rarr; `EN_ROUTE`. | 200, 400 |
| 40 | `POST` | `/api/v1/technicians/me/assignments/:id/start-repair` | Technician | Moves ticket status from `EN_ROUTE` &rarr; `REPAIRING`. | 200, 400 |
| 41 | `POST` | `/api/v1/technicians/me/assignments/:id/upload-photo` | Technician | Uploads repair photographic evidence to S3/local storage (`multipart/form-data`). | 200, 400 |
| 42 | `POST` | `/api/v1/technicians/me/assignments/:id/resolve` | Technician | **Resolves ticket**: Requires photo proof, sets feeder to `ONLINE`, blasts SMS. | 200, 400 |
| 43 | `GET` | `/api/v1/technicians/me/stats` | Technician | Performance metrics: resolved tickets count, average repair duration. | 200 |

---

### Domain 8: Zone Manager Oversight & Analytics (8 Endpoints)
| # | Method | Path | Role | Description | Status Codes |
|---|---|---|---|---|---|
| 44 | `GET` | `/api/v1/zone-managers/me/feeders` | Zone Manager | Live sortable/filterable SCADA grid table for assigned zone. | 200 |
| 45 | `GET` | `/api/v1/zone-managers/me/tickets` | Zone Manager | Outage tickets within the manager's zone with filter by status. | 200 |
| 46 | `GET` | `/api/v1/zone-managers/me/technicians` | Zone Manager | Technician roster for the zone with current availability status. | 200 |
| 47 | `GET` | `/api/v1/zone-managers/me/analytics/feeder-failure-rate` | Zone Manager | Monthly ranking of worst-performing feeder lines based on fault frequency. | 200 |
| 48 | `GET` | `/api/v1/zone-managers/me/analytics/mttr` | Zone Manager | Mean Time to Resolution (MTTR) analytics broken down by technician teams. | 200 |
| 49 | `GET` | `/api/v1/zone-managers/me/analytics/daily-deficit` | Zone Manager | Aggregated power deficit shed in zone over the last 30 days. | 200 |
| 50 | `POST` | `/api/v1/infrastructure-requests` | Zone Manager | Submits infrastructure upgrade request for chronic failing transformers/feeders. | 201, 400 |
| 51 | `GET` | `/api/v1/infrastructure-requests` | Zone Manager / Admin | Lists all submitted infrastructure requests. | 200 |

---

### Domain 9: System Admin (30 Endpoints)
| # | Method | Path | Role | Description | Status Codes |
|---|---|---|---|---|---|
| 52 | `GET` | `/api/v1/admin/users` | Admin | Paginated list of system users filtered by role, status, and zone. | 200 |
| 53 | `POST` | `/api/v1/admin/users` | Admin | Provisions staff accounts (`OPERATOR`, `TECHNICIAN`, `ZONE_MANAGER`). | 201, 400 |
| 54 | `GET` | `/api/v1/admin/users/:id` | Admin | Retrieves specific user profile and assigned zone scope. | 200, 404 |
| 55 | `PATCH` | `/api/v1/admin/users/:id` | Admin | Updates user name, email, phone number. | 200, 400 |
| 56 | `PATCH` | `/api/v1/admin/users/:id/role` | Admin | Reassigns user role and permissions. | 200, 400 |
| 57 | `PATCH` | `/api/v1/admin/users/:id/status` | Admin | Suspends or activates a user account. | 200, 400 |
| 58 | `DELETE` | `/api/v1/admin/users/:id` | Admin | Soft-deletes a user account. | 200, 404 |
| 59 | `GET` | `/api/v1/admin/zones` | Admin | Paginated list of electrical zones. | 200 |
| 60 | `POST` | `/api/v1/admin/zones` | Admin | Creates a new geographical zone. | 201, 400 |
| 61 | `GET` | `/api/v1/admin/zones/:id` | Admin | Returns zone details and substations count. | 200, 404 |
| 62 | `PATCH` | `/api/v1/admin/zones/:id` | Admin | Updates zone name or code. | 200, 400 |
| 63 | `DELETE` | `/api/v1/admin/zones/:id` | Admin | Soft-deletes a zone. | 200, 404 |
| 64 | `GET` | `/api/v1/admin/substations` | Admin | Lists substations filtered by zone. | 200 |
| 65 | `POST` | `/api/v1/admin/substations` | Admin | Adds a new electrical substation. | 201, 400 |
| 66 | `GET` | `/api/v1/admin/substations/:id` | Admin | Substation details and capacity. | 200, 404 |
| 67 | `PATCH` | `/api/v1/admin/substations/:id` | Admin | Updates substation parameters. | 200, 400 |
| 68 | `DELETE` | `/api/v1/admin/substations/:id` | Admin | Removes a substation. | 200, 404 |
| 69 | `GET` | `/api/v1/admin/feeders` | Admin | Lists feeders with critical flag and capacity. | 200 |
| 70 | `POST` | `/api/v1/admin/feeders` | Admin | Creates a feeder with `isCritical` configuration. | 201, 400 |
| 71 | `GET` | `/api/v1/admin/feeders/:id` | Admin | Feeder details and connected transformers. | 200, 404 |
| 72 | `PATCH` | `/api/v1/admin/feeders/:id` | Admin | Updates feeder capacity or toggles `isCritical`. | 200, 400 |
| 73 | `DELETE` | `/api/v1/admin/feeders/:id` | Admin | Deactivates a feeder line. | 200, 404 |
| 74 | `GET` | `/api/v1/admin/transformers` | Admin | Lists transformers with capacity and location. | 200 |
| 75 | `POST` | `/api/v1/admin/transformers` | Admin | Adds a transformer to a feeder line. | 201, 400 |
| 76 | `PATCH` | `/api/v1/admin/transformers/:id` | Admin | Updates transformer capacity. | 200, 400 |
| 77 | `DELETE` | `/api/v1/admin/transformers/:id` | Admin | Deactivates a transformer. | 200, 404 |
| 78 | `GET` | `/api/v1/admin/meters` | Admin | Master meter directory with linked customer status. | 200 |
| 79 | `POST` | `/api/v1/admin/meters` | Admin | Registers a physical electric meter into the grid. | 201, 400 |
| 80 | `GET` | `/api/v1/admin/audit-logs` | Admin | Paginated security audit trail with actor and IP filters. | 200 |
| 81 | `PATCH` | `/api/v1/infrastructure-requests/:id/status` | Admin | Approves or rejects a Zone Manager's upgrade request. | 200, 400 |

---

## 3. Real-Time WebSocket Events (Socket.io)

| Event Name | Direction | Room Scope | Payload | Trigger |
|---|---|---|---|---|
| `grid:feeder_status_changed` | Server &rarr; Client | `zone_{zoneId}`, `global` | `{ feederId, newStatus, timestamp }` | Schedule activation or technician ticket resolution. |
| `ticket:created` | Server &rarr; Client | `zone_{zoneId}`, `operator` | `{ ticketId, feederId, priority }` | Genuine unexpected outage report verified. |
| `ticket:updated` | Server &rarr; Client | `ticket_{ticketId}`, `technician_{id}` | `{ ticketId, status, enRouteAt }` | State transitions (`ASSIGNED`, `EN_ROUTE`, `REPAIRING`, `RESOLVED`). |
| `schedule:published` | Server &rarr; Client | `global` | `{ scheduleId, targetDate, totalDeficit }` | Operator publishes schedule. |
| `notification:new` | Server &rarr; Client | `user_{userId}` | `{ id, title, message, channel }` | Individual customer alert. |

---

## 4. Background Scheduled Jobs (node-cron)

| Job Name | Schedule | Distributed Lock Key | Purpose |
|---|---|---|---|
| **Schedule Enforcer** | `*/1 * * * *` (Every min) | `lock:job:schedule-enforcer` | Automatically activates upcoming slots and completes finished slots; updates feeder statuses. |
| **Notification Dispatcher**| `*/30 * * * * *` (Every 30s) | `lock:job:notification-dispatcher` | Dispatches pending SMS queue via Twilio adapter with retry logic. |
| **Demo Simulator** | `*/5 * * * *` (Every 5 min) | `lock:job:demo-simulator` | Simulates grid load fluctuations (strictly gated by `ENABLE_DEMO_SIMULATION=true`). |
