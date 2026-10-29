# Load Shedding & Power Outage Management System — API Endpoints Specification

> **Total Endpoints:** **81 REST API Endpoints** (across 10 functional domains)  
> **Real-Time WebSocket Events:** **5 Events**  
> **Background Scheduled Jobs:** **3 Jobs**

### 📊 Endpoint Breakdown by Domain

| Category / Functional Domain | Total Endpoints | Primary Roles |
|---|:---:|---|
| 🩺 **System & Health** | **3** | Public |
| 🔐 **Authentication & Session** | **8** | Public / Authenticated |
| 👤 **User Profile & Notifications** | **6** | Authenticated (All Roles) |
| 🌐 **Public Grid Discovery** | **3** | Public / Authenticated |
| 🏠 **Customer Journey** | **9** | Customer |
| ⚡ **Power Operator (Control Room & Scheduling)** | **8** | Power Operator / Control Room |
| 🛠️ **Field Technician (Repair Workflow)** | **6** | Field Technician |
| 📈 **Zone Manager (Oversight & Analytics)** | **8** | Zone Manager / Admin |
| 🛡️ **System Admin (Infrastructure, RBAC, Audit)** | **30** | Admin |
| **Grand Total** | **81** | |

This document provides the complete, authoritative catalog of all REST API endpoints and real-time WebSocket events for the **Load Shedding & Power Outage Management System**, compiled from the system requirements and implementation blueprints (`implementation_1.md`, `implementation_2.md`, and `implementation_3.md`).

---

## 1. Global API Standards

- **Standard Base Path:** `/api` (or `/api/v1` for versioned routing)
- **Data Exchange Format:** `application/json` (except file uploads: `multipart/form-data`)
- **Authentication:** Session cookie or Bearer JWT token (`Authorization: Bearer <token>`)
- **Standard Response Envelope:**
  ```json
  {
    "success": true,
    "data": { ... },
    "error": null,
    "timestamp": "2026-09-24T16:00:00.000Z"
  }
  ```
- **Standard Error Envelope:**
  ```json
  {
    "success": false,
    "data": null,
    "error": {
      "code": "ERROR_CODE",
      "message": "Human-readable error description",
      "details": []
    },
    "timestamp": "2026-09-24T16:00:00.000Z"
  }
  ```

---

## 2. Endpoints Summary Table

| Category | Method | Endpoint Path | Primary Role | Description |
|---|---|---|---|---|
| **System** | `GET` | `/api/health` | Public | Service health & connectivity smoke test |
| **System** | `GET` | `/api/v1/health/live` | Public | Kubernetes / container liveness check |
| **System** | `GET` | `/api/v1/health/ready` | Public | Service readiness check (DB, Redis, etc.) |
| **Auth** | `POST` | `/api/auth/register` | Public | Customer self-registration |
| **Auth** | `POST` | `/api/auth/login` | Public | Credential login & session generation |
| **Auth** | `POST` | `/api/auth/logout` | Authenticated | Destroy active session |
| **Auth** | `GET` | `/api/auth/session` | Authenticated | Retrieve current session & identity details |
| **Auth** | `POST` | `/api/auth/verify-email/request` | Authenticated | Request email verification link/token |
| **Auth** | `POST` | `/api/auth/verify-email/confirm` | Public | Confirm email address with token |
| **Auth** | `POST` | `/api/auth/password/forgot` | Public | Request password reset token via email |
| **Auth** | `POST` | `/api/auth/password/reset` | Public | Reset password using reset token |
| **Users** | `GET` | `/api/users/me` | Authenticated | Get current user's profile |
| **Users** | `PATCH` | `/api/users/me` | Authenticated | Update current user's profile |
| **Users** | `POST` | `/api/users/me/password` | Authenticated | Change current user's password |
| **Notifications** | `GET` | `/api/users/me/notifications` | Authenticated | List in-app notifications (paginated) |
| **Notifications** | `POST` | `/api/users/me/notifications/:id/read`| Authenticated | Mark a single notification as read |
| **Notifications** | `PATCH`| `/api/notifications/read-all` | Authenticated | Mark all notifications as read |
| **Grid Lookup** | `GET` | `/api/zones` | Public / Customer | List active city zones |
| **Grid Lookup** | `GET` | `/api/feeders` | Public / Customer | List feeder lines (filter by `zoneId`) |
| **Grid Lookup** | `GET` | `/api/grid/status` | Authenticated | Real-time status of zones and feeders |
| **Customer** | `GET` | `/api/customers/me/dashboard` | Customer | Aggregated customer dashboard overview |
| **Customer** | `GET` | `/api/customers/me/status` | Customer | Current feeder power status for registered meter |
| **Customer** | `GET` | `/api/customers/me/schedule` | Customer | Upcoming load-shedding schedule (Redis cached) |
| **Customer** | `GET` | `/api/customers/me/meters` | Customer | List customer's linked meters |
| **Customer** | `POST` | `/api/customers/me/meters` | Customer | Link a meter / location to customer account |
| **Customer** | `DELETE`| `/api/customers/me/meters/:id` | Customer | Unlink a meter from customer account |
| **Customer** | `POST` | `/api/customers/me/outage-reports` | Customer | Report blackout (Smart Conflict Resolution) |
| **Customer** | `GET` | `/api/customers/me/outage-reports` | Customer | List outages reported by the customer |
| **Customer** | `GET` | `/api/customers/me/outage-reports/:id`| Customer | View specific reported outage status |
| **Operator** | `POST` | `/api/operator/schedules/draft` | Operator | Generate draft plan via fair-rotation algorithm |
| **Operator** | `GET` | `/api/operator/schedules/:id` | Operator / Admin | Inspect schedule details and feeder slots |
| **Operator** | `PATCH`| `/api/operator/schedules/:id/slots/:slotId` | Operator | Manually adjust a draft schedule slot |
| **Operator** | `POST` | `/api/operator/schedules/:id/publish` | Operator | Publish plan, bust Redis cache, blast SMS |
| **Operator** | `POST` | `/api/operator/schedules/:id/cancel` | Operator | Cancel a scheduled load-shedding plan |
| **Operator** | `GET` | `/api/operator/overview` | Operator / Admin | Real-time grid demand, deficit & outages |
| **Operator** | `GET` | `/api/operators/outage-reports` | Operator / Manager | List reported unexpected outages (`REPORTED`) |
| **Operator** | `POST` | `/api/operators/outage-reports/:id/assign` | Operator / Manager | Dispatch & assign ticket to a technician |
| **Technician** | `GET` | `/api/technicians/me/assignments` | Technician | View assigned fault tickets queue |
| **Technician** | `POST` | `/api/technicians/me/assignments/:id/accept` | Technician | Accept ticket (`ASSIGNED` → `EN_ROUTE`) |
| **Technician** | `POST` | `/api/technicians/me/assignments/:id/start-repair` | Technician | Begin repair on site (`EN_ROUTE` → `REPAIRING`) |
| **Technician** | `POST` | `/api/technicians/me/assignments/:id/resolve` | Technician | Mark repaired (`REPAIRING` → `RESOLVED`) |
| **Technician** | `POST` | `/api/technicians/me/uploads/repair-photo` | Technician | Upload repair proof photo (multipart) |
| **Technician** | `GET` | `/api/v1/outages/:id/attachments` | Tech / Mgr / Admin | Retrieve uploaded repair photos |
| **Zone Manager**| `GET` | `/api/zone-managers/me/dashboard` | Zone Manager / Admin | Sortable real-time grid table with status badges |
| **Zone Manager**| `GET` | `/api/v1/manager/outages` | Zone Manager | Filtered outage tickets in manager's district |
| **Zone Manager**| `GET` | `/api/v1/manager/technicians` | Zone Manager | List available technicians in zone |
| **Zone Manager**| `PATCH`| `/api/v1/manager/outages/:id/assignment` | Zone Manager | Reassign ticket to another technician |
| **Zone Manager**| `GET` | `/api/zone-managers/me/analytics/feeder-failure-rate` | Zone Manager / Admin | Analytics: most frequently failing feeder lines |
| **Zone Manager**| `GET` | `/api/zone-managers/me/analytics/avg-resolution-time` | Zone Manager / Admin | Analytics: average repair resolution duration |
| **Zone Manager**| `POST` | `/api/infrastructure-requests` | Zone Manager | Request infrastructure upgrades for bad feeders |
| **Zone Manager**| `GET` | `/api/infrastructure-requests` | Zone Manager / Admin | List infrastructure upgrade requests |
| **Admin** | `POST` | `/api/admin/zones` | Admin | Create a new city zone |
| **Admin** | `GET` | `/api/admin/zones` | Admin | List all zones |
| **Admin** | `GET` | `/api/admin/zones/:id` | Admin | Get zone details |
| **Admin** | `PATCH`| `/api/admin/zones/:id` | Admin | Update zone name / details |
| **Admin** | `DELETE`| `/api/admin/zones/:id` | Admin | Soft delete zone |
| **Admin** | `POST` | `/api/admin/substations` | Admin | Create an electrical substation |
| **Admin** | `GET` | `/api/admin/substations` | Admin | List substations (with zone filter) |
| **Admin** | `GET` | `/api/admin/substations/:id` | Admin | Get substation details |
| **Admin** | `PATCH`| `/api/admin/substations/:id` | Admin | Update substation details |
| **Admin** | `DELETE`| `/api/admin/substations/:id` | Admin | Soft delete substation |
| **Admin** | `POST` | `/api/admin/feeders` | Admin | Create a feeder power line |
| **Admin** | `GET` | `/api/admin/feeders` | Admin | List feeders (`zoneId`, `isCritical`, `status`) |
| **Admin** | `GET` | `/api/admin/feeders/:id` | Admin | Get feeder details |
| **Admin** | `PATCH`| `/api/admin/feeders/:id` | Admin | Update feeder capacity / status |
| **Admin** | `PATCH`| `/api/v1/admin/feeders/:id/critical` | Admin | Toggle critical status (e.g. Hospital feeder) |
| **Admin** | `DELETE`| `/api/admin/feeders/:id` | Admin | Soft delete feeder |
| **Admin** | `POST` | `/api/admin/meters` | Admin | Register new hardware electric meter |
| **Admin** | `GET` | `/api/admin/meters` | Admin | List registered meters |
| **Admin** | `GET` | `/api/admin/meters/:id` | Admin | Get meter details |
| **Admin** | `DELETE`| `/api/admin/meters/:id` | Admin | Soft delete meter |
| **Admin** | `POST` | `/api/admin/users` | Admin | Provision staff (Operator, Tech, Manager, Admin) |
| **Admin** | `GET` | `/api/admin/users` | Admin | List all system users with filters |
| **Admin** | `GET` | `/api/admin/users/:id` | Admin | Get detailed user record |
| **Admin** | `PATCH`| `/api/admin/users/:id` | Admin | Update user role, zone scope, or details |
| **Admin** | `DELETE`| `/api/admin/users/:id` | Admin | Soft delete user |
| **Admin** | `POST` | `/api/admin/users/:id/suspend` | Admin | Suspend active user account |
| **Admin** | `POST` | `/api/admin/users/:id/reactivate` | Admin | Reactivate suspended user |
| **Admin** | `PATCH`| `/api/infrastructure-requests/:id/status`| Admin | Approve / Reject infrastructure upgrade request |
| **Admin** | `GET` | `/api/admin/audit` | Admin | Read-only audit log of critical system events |
| **Admin** | `GET` | `/api/admin/notifications` | Admin | SMS & in-app notification dispatch log |

---

## 3. Detailed Endpoint Specifications by Domain

### 3.1. System & Health

#### `GET /api/health`
- **Access:** Public
- **Description:** Basic service health and connectivity smoke check.
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "status": "HEALTHY",
      "uptime": 14235,
      "services": {
        "database": "UP",
        "redis": "UP"
      }
    }
  }
  ```

#### `GET /api/v1/health/live` & `GET /api/v1/health/ready`
- **Access:** Public
- **Description:** Standard container/Kubernetes liveness and readiness probe routes.

---

### 3.2. Authentication & Session

#### `POST /api/auth/register`
- **Access:** Public (Self-registration for Customers)
- **Description:** Registers a new resident/customer account.
- **Request Body:**
  ```json
  {
    "name": "Rahim Ahmed",
    "email": "rahim@example.com",
    "phone": "+8801712345678",
    "password": "SecurePassword123!",
    "meterNumber": "MTR-88201" // Optional initial meter link
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "usr_9981",
        "name": "Rahim Ahmed",
        "email": "rahim@example.com",
        "role": "CUSTOMER"
      }
    }
  }
  ```

#### `POST /api/auth/login`
- **Access:** Public
- **Request Body:**
  ```json
  {
    "email": "rahim@example.com",
    "password": "SecurePassword123!"
  }
  ```
- **Response (200 OK):** Returns session cookie or JWT token + user summary.

#### `POST /api/auth/logout`
- **Access:** Authenticated
- **Response (200 OK):** Invalidates active session / clears cookies.

#### `GET /api/auth/session` (or `GET /api/auth/me`)
- **Access:** Authenticated
- **Response (200 OK):** Current session metadata, user ID, role, permissions, and assigned zone.

#### `POST /api/auth/verify-email/request` & `POST /api/auth/verify-email/confirm`
- **Access:** Authenticated / Token validation
- **Description:** Sends verification email and confirms user's email address.

#### `POST /api/auth/password/forgot` & `POST /api/auth/password/reset`
- **Access:** Public
- **Description:** Issues password reset token to user's email and resets password.

---

### 3.3. Users & Notifications

#### `GET /api/users/me`
- **Access:** Authenticated
- **Response (200 OK):** User's full profile information, notification preferences, and associated entity links.

#### `PATCH /api/users/me`
- **Access:** Authenticated
- **Request Body:** `{ "name": "Updated Name", "phone": "+8801711223344" }`

#### `POST /api/users/me/password`
- **Access:** Authenticated
- **Request Body:** `{ "currentPassword": "OldPassword123!", "newPassword": "NewSecurePassword456!" }`

#### `GET /api/users/me/notifications`
- **Access:** Authenticated
- **Query Parameters:** `page`, `pageSize`, `unreadOnly=true/false`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "notifications": [
        {
          "id": "notif_101",
          "title": "Planned Outage Notification",
          "message": "Feeder F-104 will experience load shedding today from 18:00 to 20:00.",
          "type": "PLANNED_SCHEDULE",
          "readAt": null,
          "createdAt": "2026-09-24T10:00:00Z"
        }
      ],
      "total": 1
    }
  }
  ```

#### `POST /api/users/me/notifications/:id/read`
- **Access:** Authenticated
- **Description:** Marks a single in-app notification as read.

#### `PATCH /api/notifications/read-all`
- **Access:** Authenticated
- **Description:** Marks all pending notifications for the current user as read.

---

### 3.4. Public & Shared Grid Discovery

#### `GET /api/zones`
- **Access:** Public / Authenticated
- **Response (200 OK):** List of all active city zones (e.g., Dhanmondi, Gulshan, Mirpur).

#### `GET /api/feeders?zoneId={zoneId}`
- **Access:** Public / Authenticated
- **Query Parameters:** `zoneId` (UUID/string)
- **Response (200 OK):** List of feeders belonging to the specified zone.

#### `GET /api/grid/status`
- **Access:** Authenticated (Role-scoped)
- **Description:** Real-time operational status of feeders. Customers see their own feeder context; operators and managers view district/system-wide data.

---

### 3.5. Customer Journey Endpoints

#### `GET /api/customers/me/dashboard`
- **Access:** Customer
- **Description:** Aggregates power status, upcoming schedules, active outage tickets, and alerts for the customer's linked meter.

#### `GET /api/customers/me/status`
- **Access:** Customer
- **Description:** Quick check of current power status:
  - `ONLINE` (Green badge)
  - `PLANNED_OUTAGE` (Yellow badge)
  - `UNEXPECTED_FAULT` (Red badge)

#### `GET /api/customers/me/schedule` (or `GET /api/v1/schedules/my`)
- **Access:** Customer
- **Query Parameters:** `from` (ISO date), `to` (ISO date)
- **Description:** Retrieves weekly published load-shedding schedules for the customer's feeder line. Cached in **Upstash Redis** to handle massive concurrent traffic spikes.

#### `GET /api/customers/me/meters`
- **Access:** Customer
- **Response (200 OK):** List of meters linked to the customer account.

#### `POST /api/customers/me/meters` (or `PATCH /api/v1/customers/me/location`)
- **Access:** Customer
- **Description:** Links a physical meter to the customer's profile.
- **Request Body:**
  ```json
  {
    "meterNumber": "MTR-88201",
    "address": "House 12, Road 5, Dhanmondi"
  }
  ```

#### `DELETE /api/customers/me/meters/:id`
- **Access:** Customer
- **Description:** Unlinks a meter from the customer's profile.

#### `POST /api/customers/me/outage-reports` (The "Smart" Conflict Resolution Engine — Journey 5)
- **Access:** Customer
- **Description:** When an unexpected blackout happens, customer clicks "Report Outage".
- **Backend Smart Logic:**
  1. Identifies customer's feeder via linked `meterId`.
  2. Checks Redis/DB for any active **Planned Load Shedding** slot for this feeder right now.
  3. **Case A (Planned Outage):** Intercepts request, creates NO repair ticket, and returns auto-resolution:
     > *"Your area is currently under scheduled load shedding until 14:00. This is not a fault. No technician will be dispatched."*
  4. **Case B (Unexpected Fault):** Creates an `OutageTicket` with status `REPORTED`, sends instant confirmation SMS, and alerts the control room.
- **Request Body:**
  ```json
  {
    "meterId": "mtr_402",
    "description": "Explosion heard from transformer near road corner",
    "landmark": "Near Central Mosque"
  }
  ```
- **Response (200 OK - Intercepted Planned):**
  ```json
  {
    "success": true,
    "data": {
      "isPlanned": true,
      "message": "Your area is currently under scheduled load shedding until 14:00. No technician will be dispatched.",
      "scheduledEndTime": "2026-09-24T14:00:00.000Z",
      "ticketCreated": false
    }
  }
  ```
- **Response (201 Created - Genuine Unplanned Fault):**
  ```json
  {
    "success": true,
    "data": {
      "isPlanned": false,
      "ticketCreated": true,
      "ticket": {
        "id": "tkt_5051",
        "status": "REPORTED",
        "feederId": "fdr_12",
        "createdAt": "2026-09-24T14:05:00.000Z"
      },
      "message": "We have received your report. A technician is being assigned."
    }
  }
  ```

#### `GET /api/customers/me/outage-reports`
- **Access:** Customer
- **Response (200 OK):** Paginated history of outages reported by this customer.

#### `GET /api/customers/me/outage-reports/:id`
- **Access:** Customer
- **Response (200 OK):** Detailed status updates (e.g. `REPORTED` → `TECHNICIAN_DISPATCHED` → `REPAIRING` → `RESOLVED`).

---

### 3.6. Power Operator (Control Room & Fair Rotation Scheduling)

#### `POST /api/operator/schedules/draft` (or `POST /api/v1/operator/schedules/generate`)
- **Access:** Operator
- **Description:** Runs the algorithmic scheduling engine to generate a fair load-shedding draft plan.
- **Constraints Enforced by Backend Algorithm:**
  - Never cuts **Critical Feeders** (e.g. Hospital lines).
  - Enforces **No-Double-Cut Rule** (no feeder cut twice on the same calendar day).
  - Rotates outages fairly across all eligible zones to meet requested deficit MW.
- **Request Body:**
  ```json
  {
    "planningDate": "2026-09-25",
    "deficitMW": 50.0,
    "startTime": "08:00",
    "endTime": "22:00",
    "slotDurationMinutes": 60
  }
  ```
- **Response (201 Created):** Returns draft plan with slot assignments and explanation traces.

#### `GET /api/operator/schedules/:id`
- **Access:** Operator / Admin
- **Response (200 OK):** Detailed breakdown of planned slots and affected feeders.

#### `PATCH /api/operator/schedules/:id/slots/:slotId`
- **Access:** Operator
- **Description:** Allows manual slot adjustment on draft plans prior to publication.

#### `POST /api/operator/schedules/:id/publish`
- **Access:** Operator
- **Description:**
  1. Atomically marks schedule as `PUBLISHED`.
  2. Updates feeder status in Postgres.
  3. Pre-warms and updates **Upstash Redis** cache with feeder schedules.
  4. Triggers **Twilio SMS / push notifications** batch to all customers in affected zones.
  5. Emits real-time Socket.io event to connected dashboards.
- **Response (200 OK):** Confirmation with total customers notified.

#### `POST /api/operator/schedules/:id/cancel`
- **Access:** Operator
- **Description:** Cancels an active or future plan, invalidating Redis cache and notifying affected users.

#### `GET /api/operator/overview`
- **Access:** Operator / Admin
- **Description:** Live control room summary: current grid load, power deficit, active outages, and technician availability.

#### `GET /api/operators/outage-reports?status=REPORTED`
- **Access:** Operator / Zone Manager
- **Description:** Live queue of unassigned unexpected fault tickets awaiting technician dispatch.

#### `POST /api/operators/outage-reports/:id/assign`
- **Access:** Operator / Zone Manager
- **Request Body:** `{ "technicianId": "tech_usr_88" }`
- **Logic:** Assigns technician to ticket, moves status to `ASSIGNED`, and pings the technician via WebSocket & SMS.

---

### 3.7. Field Technician (Repair Workflow)

#### `GET /api/technicians/me/assignments`
- **Access:** Technician
- **Query Parameters:** `status` (`ASSIGNED`, `EN_ROUTE`, `REPAIRING`, `RESOLVED`)
- **Response (200 OK):** Queue of assigned fault tickets with substation location, GPS coordinates, and fault notes.

#### `POST /api/technicians/me/assignments/:id/accept`
- **Access:** Assigned Technician
- **Description:** Technician taps "Accept & En Route".
- **Status Change:** `ASSIGNED` → `EN_ROUTE`.
- **Side Effect:** Real-time status update pushed to Customer dashboard: *"Technician Dispatched"*.

#### `POST /api/technicians/me/assignments/:id/start-repair`
- **Access:** Assigned Technician
- **Description:** Technician arrives at site and begins work.
- **Status Change:** `EN_ROUTE` → `REPAIRING`.
- **Side Effect:** Real-time status badge on Zone Manager & Customer screens updates to *"Repairing"*.

#### `POST /api/technicians/me/uploads/repair-photo` (or `POST /api/v1/technician/outages/:id/attachments`)
- **Access:** Assigned Technician
- **Content-Type:** `multipart/form-data`
- **Description:** Uploads photo proof of completed repair (e.g. fixed transformer, repaired jumper wire).
- **Validation:** Image MIME types (`image/jpeg`, `image/png`, `image/webp`), max 10MB.
- **Response (201 Created):** `{ "attachmentId": "att_771", "url": "/uploads/repairs/..." }`

#### `POST /api/technicians/me/assignments/:id/resolve`
- **Access:** Assigned Technician
- **Description:** Technician finishes repair and submits resolution.
- **Request Body:**
  ```json
  {
    "resolutionNotes": "Replaced blown 100kVA transformer fuse and reconnected drop-out link.",
    "attachmentId": "att_771"
  }
  ```
- **Status Change:** `REPAIRING` → `RESOLVED`.
- **Side Effects:**
  1. Feeder status restored to `ONLINE`.
  2. Customers receive SMS: *"Power restored. Your outage ticket has been resolved."*
  3. Zone Manager live table updates immediately via Socket.io.

#### `GET /api/v1/outages/:id/attachments`
- **Access:** Technician / Zone Manager / Admin
- **Description:** View repair photos attached to a ticket.

---

### 3.8. Zone Manager (District Oversight & Analytics)

#### `GET /api/zone-managers/me/dashboard` (or `GET /api/v1/manager/grid`)
- **Access:** Zone Manager (scoped to assigned zone) / Admin
- **Query Parameters:** `status` (`ONLINE`, `PLANNED_OUTAGE`, `UNEXPECTED_FAULT`), `search`, `page`, `limit`
- **Description:** Sortable live data-table listing all Feeders in district with status badges and open ticket counts (matches Journey 4 Step 2).

#### `GET /api/v1/manager/outages`
- **Access:** Zone Manager
- **Description:** Filtered view of unexpected faults within the manager's district.

#### `GET /api/v1/manager/technicians`
- **Access:** Zone Manager
- **Description:** List of technicians in the zone and their current task status.

#### `PATCH /api/v1/manager/outages/:id/assignment`
- **Access:** Zone Manager
- **Description:** Reassign or dispatch a technician to an outage ticket.

#### `GET /api/zone-managers/me/analytics/feeder-failure-rate`
- **Access:** Zone Manager / Admin
- **Query Parameters:** `from` (ISO date), `to` (ISO date)
- **Description:** Answers *"Which Feeder line fails the most often?"* Aggregates `UNEXPECTED_FAULT` occurrences per feeder, sorted descending.
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": [
      { "feederId": "fdr_12", "feederName": "Dhanmondi Feeder-4", "faultCount": 9 },
      { "feederId": "fdr_08", "feederName": "Dhanmondi Feeder-1", "faultCount": 4 }
    ]
  }
  ```

#### `GET /api/zone-managers/me/analytics/avg-resolution-time`
- **Access:** Zone Manager / Admin
- **Query Parameters:** `technicianId` (optional), `from`, `to`
- **Description:** Answers *"What is the average time it takes for Technician Team A to resolve a ticket?"* Computes `resolvedAt - assignedAt` in minutes.
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": [
      { "technicianId": "usr_tech_1", "technicianName": "Team Delta", "avgResolutionMinutes": 84.5, "ticketCount": 14 }
    ]
  }
  ```

#### `POST /api/infrastructure-requests` (or `POST /api/v1/manager/upgrade-requests`)
- **Access:** Zone Manager
- **Description:** Formally requests infrastructure upgrades or transformer replacements for bad feeders based on monthly analytics (Journey 4 Step 5).
- **Request Body:**
  ```json
  {
    "feederId": "fdr_12",
    "reason": "Repeated transformer burnouts due to commercial overload",
    "proposedAction": "Upgrade transformer from 200kVA to 400kVA",
    "supportingMetrics": { "faultsLast30Days": 9 }
  }
  ```

#### `GET /api/infrastructure-requests`
- **Access:** Zone Manager / Admin
- **Description:** Lists submitted infrastructure upgrade requests.

---

### 3.9. System Admin (Infrastructure, RBAC & Auditing)

#### Zone Management
- `POST /api/admin/zones`: Create new city zone. Body: `{ "name": "Mirpur", "code": "MIR" }`.
- `GET /api/admin/zones`: List all zones with substations count.
- `GET /api/admin/zones/:id`: Get zone by ID.
- `PATCH /api/admin/zones/:id`: Update zone details.
- `DELETE /api/admin/zones/:id`: Soft delete zone.

#### Substation Management
- `POST /api/admin/substations`: Create substation. Body: `{ "name": "Substation 4", "zoneId": "zn_01", "capacityMW": 120.0 }`.
- `GET /api/admin/substations`: List substations, filterable by `zoneId`.
- `GET /api/admin/substations/:id`: View substation details.
- `PATCH /api/admin/substations/:id`: Update capacity or name.
- `DELETE /api/admin/substations/:id`: Soft delete substation.

#### Feeder Management
- `POST /api/admin/feeders`: Create feeder. Body: `{ "name": "Feeder-1", "substationId": "sub_01", "isCritical": false, "capacityMW": 15.0 }`.
- `GET /api/admin/feeders`: List all feeders. Supports query filters: `zoneId`, `isCritical`, `status`.
- `GET /api/admin/feeders/:id`: Get feeder details.
- `PATCH /api/admin/feeders/:id`: Update feeder properties or operational status.
- `PATCH /api/v1/admin/feeders/:id/critical`: Toggle `isCritical: true/false` (ensures hospitals/emergency facilities are shielded from automatic load shedding).
- `DELETE /api/admin/feeders/:id`: Soft delete feeder.

#### Meter Management
- `POST /api/admin/meters`: Register physical electric meter. Body: `{ "meterNumber": "MTR-9001", "feederId": "fdr_01" }`.
- `GET /api/admin/meters`: List registered meters with filter by `feederId`.
- `GET /api/admin/meters/:id`: View meter details.
- `DELETE /api/admin/meters/:id`: Soft delete meter.

#### User & Staff Account Management
- `POST /api/admin/users`: Provision staff accounts (Power Operator, Technician, Zone Manager, Admin). Body includes `name`, `email`, `phone`, `role`, `assignedZoneId`.
- `GET /api/admin/users`: Paginated list of users filterable by `role`, `status`, `zoneId`.
- `GET /api/admin/users/:id`: Get full user details.
- `PATCH /api/admin/users/:id`: Edit user role, phone, or assigned district.
- `DELETE /api/admin/users/:id`: Soft delete user (blocks if technician has active assigned tickets).
- `POST /api/admin/users/:id/suspend`: Suspend user account immediately.
- `POST /api/admin/users/:id/reactivate`: Reactivate suspended user account.

#### Infrastructure Upgrade Approvals
- `PATCH /api/infrastructure-requests/:id/status`: Admin approves or rejects upgrade requests. Body: `{ "status": "APPROVED", "adminNotes": "Budget allocated for Q2." }`.

#### Auditing & Notification Monitoring
- `GET /api/admin/audit`: Filterable log of security and administrative operations (`actorId`, `action`, `entity`, `timestamp`).
- `GET /api/admin/notifications`: Delivery history of SMS and in-app messages sent via Twilio (`recipient`, `type`, `status: SENT/FAILED`, `attempts`).

---

## 4. Real-Time WebSocket Events (Socket.io)

### Connection & Authentication
- **Namespace / URL:** `ws://localhost:4000/socket.io`
- **Auth Payload:** `{ "token": "<JWT-token-or-session>" }`

### Client Subscriptions (Rooms)
- `subscribe:zone` — `{ "zoneId": "zn_01" }`: Subscribes Zone Manager to district events.
- `subscribe:operator` — Control room engineers subscribe to all system-wide grid events.
- `subscribe:technician` — Technicians subscribe to personal dispatch alerts.

### Server-Emitted Events
| Event Name | Target Room | Trigger | Payload |
|---|---|---|---|
| `feeder:status_changed` | `subscribe:zone`, `subscribe:operator` | Outage begins, restores, or plan published | `{ feederId, status, timestamp }` |
| `ticket:created` | `subscribe:operator`, `subscribe:zone` | Customer reports genuine unexpected fault | `{ ticketId, feederId, description }` |
| `ticket:assigned` | `subscribe:technician` | Operator dispatches technician | `{ ticketId, substation, location }` |
| `ticket:status_changed`| `subscribe:zone`, `customer:{userId}` | Tech taps Accept, Repairing, or Resolved | `{ ticketId, status, resolvedAt }` |
| `schedule:published` | Public broadcast | Operator publishes schedule plan | `{ scheduleId, affectedFeeders, planDate }` |

---

## 5. Background Scheduled Jobs (node-cron)

| Job Name | Schedule | Purpose |
|---|---|---|
| `sendNotificationsJob` | `*/30 * * * * *` (Every 30s) | Flushes pending Twilio SMS queue and handles retries (up to 3 attempts). |
| `scheduleEnforcerJob` | `0 * * * *` (Hourly) | Compares current clock with published schedules, auto-toggling feeder statuses to `PLANNED_OUTAGE` and back to `ONLINE`. |
| `gridMetricsSimulationJob` | `*/5 * * * *` (Every 5m) | Simulates regional power demand / grid fluctuations for demo & testing. |
