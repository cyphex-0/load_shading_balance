# Complete API Inventory (81 REST Endpoints)
## Load Shedding & Power Outage Management System

This document catalogs all **81 REST API Endpoints** and aliases specified in `endpoint.md`.

---

### Category 1: System & Health (3 Endpoints)

| # | Method | Path | Role | Description |
|---|---|---|---|---|
| 1 | `GET` | `/api/health` | Public | Connectivity smoke test for DB, Redis, and overall system health. |
| 2 | `GET` | `/api/v1/health/live` | Public | Kubernetes/Container liveness probe. Returns 200 OK if service process is running. |
| 3 | `GET` | `/api/v1/health/ready` | Public | Readiness probe checking database connectivity and Redis availability. |

---

### Category 2: Authentication & Session (8 Endpoints)

| # | Method | Path | Role | Description |
|---|---|---|---|---|
| 4 | `POST` | `/api/auth/register` | Public | Customer self-registration with name, email, phone, password, and optional initial meterNumber. |
| 5 | `POST` | `/api/auth/login` | Public | Authenticates credentials, verifies active status, issues session cookie/JWT. |
| 6 | `POST` | `/api/auth/logout` | Authenticated | Revokes session / clears auth cookie. |
| 7 | `GET` | `/api/auth/session` | Authenticated | Retrieves current session identity, role, zone scope, and permissions. (Alias: `/api/auth/me`) |
| 8 | `POST` | `/api/auth/verify-email/request` | Authenticated | Generates email verification token and queues verification email. |
| 9 | `POST` | `/api/auth/verify-email/confirm` | Public | Confirms email address using verification token. |
| 10 | `POST` | `/api/auth/password/forgot` | Public | Generates password reset token sent via email. |
| 11 | `POST` | `/api/auth/password/reset` | Public | Resets user password given valid token and new password. |

---

### Category 3: User Profile & Notifications (6 Endpoints)

| # | Method | Path | Role | Description |
|---|---|---|---|---|
| 12 | `GET` | `/api/users/me` | Authenticated | Retrieves current authenticated user profile, linked meters, and preferences. |
| 13 | `PATCH` | `/api/users/me` | Authenticated | Updates current user profile details (name, phone). |
| 14 | `POST` | `/api/users/me/password` | Authenticated | Changes current user's password given current password. |
| 15 | `GET` | `/api/users/me/notifications` | Authenticated | Paginated list of in-app notifications with unreadOnly filter. |
| 16 | `POST` | `/api/users/me/notifications/:id/read` | Authenticated | Marks a specific notification as read. |
| 17 | `PATCH` | `/api/notifications/read-all` | Authenticated | Marks all pending notifications for current user as read. |

---

### Category 4: Public & Shared Grid Discovery (3 Endpoints)

| # | Method | Path | Role | Description |
|---|---|---|---|---|
| 18 | `GET` | `/api/zones` | Public / Auth | Lists all active city zones. |
| 19 | `GET` | `/api/feeders` | Public / Auth | Lists feeder lines, optionally filtered by `zoneId`. |
| 20 | `GET` | `/api/grid/status` | Authenticated | Real-time operational power status of feeders and zones. |

---

### Category 5: Customer Journey (9 Endpoints)

| # | Method | Path | Role | Description |
|---|---|---|---|---|
| 21 | `GET` | `/api/customers/me/dashboard` | Customer | Aggregated customer dashboard overview (status, active tickets, schedules). |
| 22 | `GET` | `/api/customers/me/status` | Customer | Live electricity status badge for linked meter (`ONLINE`, `PLANNED_OUTAGE`, `UNEXPECTED_FAULT`). |
| 23 | `GET` | `/api/customers/me/schedule` | Customer | Upcoming weekly load-shedding schedule (Redis cached, alias `/api/v1/schedules/my`). |
| 24 | `GET` | `/api/customers/me/meters` | Customer | Lists customer's linked meters with feeder and address info. |
| 25 | `POST` | `/api/customers/me/meters` | Customer | Links a meter to customer account (alias `/api/v1/customers/me/location`). |
| 26 | `DELETE` | `/api/customers/me/meters/:id` | Customer | Unlinks a meter from customer account. |
| 27 | `POST` | `/api/customers/me/outage-reports` | Customer | Reports blackout; executes Smart Conflict Resolution (intercepts planned vs creates unplanned ticket). |
| 28 | `GET` | `/api/customers/me/outage-reports` | Customer | Paginated list of outage reports submitted by customer. |
| 29 | `GET` | `/api/customers/me/outage-reports/:id` | Customer | Detailed status tracking for a specific reported outage. |

---

### Category 6: Power Operator Control Room & Scheduling (8 Endpoints)

| # | Method | Path | Role | Description |
|---|---|---|---|---|
| 30 | `POST` | `/api/operator/schedules/draft` | Operator | Algorithmic generation of fair draft schedule (alias `/api/v1/operator/schedules/generate`). |
| 31 | `GET` | `/api/operator/schedules/:id` | Operator / Admin | Inspects schedule slots and feeder allocations. |
| 32 | `PATCH` | `/api/operator/schedules/:id/slots/:slotId` | Operator | Manually adjust a draft schedule slot before publishing. |
| 33 | `POST` | `/api/operator/schedules/:id/publish` | Operator | Finalizes schedule, warms Redis cache, queues SMS, emits WebSocket. |
| 34 | `POST` | `/api/operator/schedules/:id/cancel` | Operator | Cancels published schedule, busts Redis cache, alerts users. |
| 35 | `GET` | `/api/operator/overview` | Operator / Admin | Live control room summary of grid demand, deficit, active outages. |
| 36 | `GET` | `/api/operators/outage-reports` | Operator / Mgr | Live queue of unassigned unexpected outage tickets awaiting technician dispatch. |
| 37 | `POST` | `/api/operators/outage-reports/:id/assign` | Operator / Mgr | Dispatches a technician to an outage ticket (`ASSIGNED`). |

---

### Category 7: Field Technician Repair Workflow (6 Endpoints)

| # | Method | Path | Role | Description |
|---|---|---|---|---|
| 38 | `GET` | `/api/technicians/me/assignments` | Technician | View assigned fault tickets queue with status filter. |
| 39 | `POST` | `/api/technicians/me/assignments/:id/accept` | Technician | Accept ticket (`ASSIGNED` → `EN_ROUTE`). |
| 40 | `POST` | `/api/technicians/me/assignments/:id/start-repair` | Technician | Mark arrived on site and work begun (`EN_ROUTE` → `REPAIRING`). |
| 41 | `POST` | `/api/technicians/me/assignments/:id/resolve` | Technician | Complete repair (`REPAIRING` → `RESOLVED`), restore feeder power. |
| 42 | `POST` | `/api/technicians/me/uploads/repair-photo` | Technician | Upload repair proof photo (multipart/form-data, alias `/api/v1/technician/outages/:id/attachments`). |
| 43 | `GET` | `/api/v1/outages/:id/attachments` | Tech / Mgr / Admin | Retrieve uploaded repair photos for an outage ticket. |

---

### Category 8: Zone Manager Oversight & Analytics (8 Endpoints)

| # | Method | Path | Role | Description |
|---|---|---|---|---|
| 44 | `GET` | `/api/zone-managers/me/dashboard` | Zone Mgr / Admin | Live sortable/filterable data-table of all feeders in district (alias `/api/v1/manager/grid`). |
| 45 | `GET` | `/api/v1/manager/outages` | Zone Mgr | Filtered view of unexpected faults in manager's assigned zone. |
| 46 | `GET` | `/api/v1/manager/technicians` | Zone Mgr | List of technicians in zone and current task status. |
| 47 | `PATCH` | `/api/v1/manager/outages/:id/assignment` | Zone Mgr | Reassign ticket to another technician. |
| 48 | `GET` | `/api/zone-managers/me/analytics/feeder-failure-rate` | Zone Mgr / Admin | Analytics: most frequently failing feeder lines ranked descending. |
| 49 | `GET` | `/api/zone-managers/me/analytics/avg-resolution-time` | Zone Mgr / Admin | Analytics: average technician resolution duration in minutes. |
| 50 | `POST` | `/api/infrastructure-requests` | Zone Mgr | Submits formal upgrade request for a troubled feeder (alias `/api/v1/manager/upgrade-requests`). |
| 51 | `GET` | `/api/infrastructure-requests` | Zone Mgr / Admin | Lists submitted infrastructure upgrade requests. |

---

### Category 9: System Admin Infrastructure, RBAC & Audit (30 Endpoints)

| # | Method | Path | Role | Description |
|---|---|---|---|---|
| 52 | `POST` | `/api/admin/zones` | Admin | Create a new city zone. |
| 53 | `GET` | `/api/admin/zones` | Admin | List all zones with substation count. |
| 54 | `GET` | `/api/admin/zones/:id` | Admin | Get zone details by ID. |
| 55 | `PATCH` | `/api/admin/zones/:id` | Admin | Update zone name, code, or description. |
| 56 | `DELETE` | `/api/admin/zones/:id` | Admin | Soft delete zone. |
| 57 | `POST` | `/api/admin/substations` | Admin | Create an electrical substation. |
| 58 | `GET` | `/api/admin/substations` | Admin | List substations (with zone filter). |
| 59 | `GET` | `/api/admin/substations/:id` | Admin | Get substation details. |
| 60 | `PATCH` | `/api/admin/substations/:id` | Admin | Update substation details and capacity. |
| 61 | `DELETE` | `/api/admin/substations/:id` | Admin | Soft delete substation. |
| 62 | `POST` | `/api/admin/feeders` | Admin | Create a feeder power line. |
| 63 | `GET` | `/api/admin/feeders` | Admin | List all feeders with filters (`zoneId`, `isCritical`, `status`). |
| 64 | `GET` | `/api/admin/feeders/:id` | Admin | Get feeder details. |
| 65 | `PATCH` | `/api/admin/feeders/:id` | Admin | Update feeder capacity and operational status. |
| 66 | `PATCH` | `/api/v1/admin/feeders/:id/critical` | Admin | Toggle `isCritical: true/false` (shields hospitals from cuts). |
| 67 | `DELETE` | `/api/admin/feeders/:id` | Admin | Soft delete feeder. |
| 68 | `POST` | `/api/admin/meters` | Admin | Register physical hardware electric meter. |
| 69 | `GET` | `/api/admin/meters` | Admin | List registered meters (filterable by `feederId`). |
| 70 | `GET` | `/api/admin/meters/:id` | Admin | Get meter details. |
| 71 | `DELETE` | `/api/admin/meters/:id` | Admin | Soft delete meter. |
| 72 | `POST` | `/api/admin/users` | Admin | Provision staff account (Operator, Tech, Manager, Admin). |
| 73 | `GET` | `/api/admin/users` | Admin | Paginated list of users with filters (`role`, `status`, `zoneId`). |
| 74 | `GET` | `/api/admin/users/:id` | Admin | Get full user profile and status record. |
| 75 | `PATCH` | `/api/admin/users/:id` | Admin | Update user role, zone scope, or details. |
| 76 | `DELETE` | `/api/admin/users/:id` | Admin | Soft delete user. |
| 77 | `POST` | `/api/admin/users/:id/suspend` | Admin | Suspend active user account. |
| 78 | `POST` | `/api/admin/users/:id/reactivate` | Admin | Reactivate suspended user account. |
| 79 | `PATCH` | `/api/infrastructure-requests/:id/status` | Admin | Approve or reject infrastructure upgrade request. |
| 80 | `GET` | `/api/admin/audit` | Admin | Read-only audit log of critical system events. |
| 81 | `GET` | `/api/admin/notifications` | Admin | SMS & in-app notification dispatch log. |

---

### Real-Time WebSocket Events (Socket.io)

1. `feeder:status_changed`: Broadcast when feeder changes status (Online / Planned / Unexpected).
2. `ticket:created`: Emitted to operator/zone manager when unplanned outage is reported.
3. `ticket:assigned`: Emitted to assigned technician upon dispatch.
4. `ticket:status_changed`: Emitted to customer, manager, and operator on repair progress.
5. `schedule:published`: Broadcast to all public & customer subscribers when schedule is published.

---

### Background Cron Jobs (node-cron)

1. `sendNotificationsJob`: Runs `*/30 * * * * *` (every 30 seconds) to flush SMS queue.
2. `scheduleEnforcerJob`: Runs `0 * * * *` (hourly) to toggle scheduled outages.
3. `gridMetricsSimulationJob`: Runs `*/5 * * * *` (every 5 minutes) to update demonstration grid demand.

