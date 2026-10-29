# Requirements Analysis & Specification
## Load Shedding & Power Outage Management System

### 1. Executive Summary & Problem Context
In regions experiencing grid power deficits (such as Bangladesh, South Africa, and parts of South America), load shedding is often managed through manual spreadsheets, informal phone trees, and delayed social media announcements. This creates severe civic friction:
1. **Unfair Outage Distribution:** Without algorithmic enforcement, certain neighborhoods suffer disproportionate blackouts while politically connected or higher-priority zones are shielded arbitrarily.
2. **Citizen Uncertainty:** Residents cannot plan household tasks, industrial operations, or commercial activities because schedules are either absent, unreliable, or outdated.
3. **Control Room Chaos & Technician Misallocation:** When power is cut for scheduled load shedding, thousands of citizens call or submit fault complaints. Power operators and dispatchers are overwhelmed, and field repair technicians are frequently dispatched to investigate non-existent "faults" that were actually planned shutdowns.
4. **Lack of Infrastructure Transparency:** Zone managers lack granular historical analytics (e.g., which feeder line burns transformers most frequently, which technician teams resolve faults fastest) to justify capital expenditure and transformer upgrades.

The **Load Shedding & Power Outage Management System** solves these challenges through:
- An **Algorithmic Fair-Rotation Engine** that calculates feeder cuts based on power deficit, enforcing hospital/critical feeder protection and the "no-double-cut" rule.
- A **Smart Outage Conflict Resolution Engine** that cross-references customer blackout reports against active planned load shedding in real time, automatically intercepting non-fault tickets.
- An **End-to-End Field Repair Workflow** with mobile state transitions and photographic proof verification.
- **Role-Based Real-Time Operational Dashboards** for Customers, Operators, Technicians, Zone Managers, and Administrators powered by WebSockets.

---

### 2. User Roles and Permission Matrix

The system strictly enforces five primary roles:

| Capability / Workflow | Customer | Power Operator | Field Technician | Zone Manager | Admin |
|---|:---:|:---:|:---:|:---:|:---:|
| Self-Registration & Password Reset | ✅ | ❌ | ❌ | ❌ | ❌ |
| Staff Account Provisioning | ❌ | ❌ | ❌ | ❌ | ✅ |
| Link/Unlink Electric Meters | ✅ | ❌ | ❌ | ❌ | ❌ |
| View Feeder Real-Time Power Status | Scoped (Own) | ✅ (All) | Scoped (Assigned) | Scoped (District) | ✅ (All) |
| View Load-Shedding Schedules | ✅ (Public) | ✅ | ✅ | ✅ | ✅ |
| Report Blackout / Outage | ✅ | ❌ | ❌ | ❌ | ❌ |
| Generate Draft Load Shedding Plan | ❌ | ✅ | ❌ | ❌ | ❌ |
| Manually Adjust Draft Schedule Slots | ❌ | ✅ | ❌ | ❌ | ❌ |
| Publish / Cancel Load Shedding Plan | ❌ | ✅ | ❌ | ❌ | ❌ |
| Dispatch Technician to Outage | ❌ | ✅ | ❌ | ✅ (Zone) | ❌ |
| Accept & Update Ticket Status | ❌ | ❌ | ✅ (Assigned) | ❌ | ❌ |
| Upload Repair Photographic Proof | ❌ | ❌ | ✅ (Assigned) | ❌ | ❌ |
| View Zone Real-Time Feeder Table | ❌ | ✅ | ❌ | ✅ (Zone) | ✅ |
| View Feeder Failure Rate Analytics | ❌ | ❌ | ❌ | ✅ (Zone) | ✅ |
| Submit Infrastructure Upgrade Request | ❌ | ❌ | ❌ | ✅ (Zone) | ❌ |
| Approve/Reject Infrastructure Request | ❌ | ❌ | ❌ | ❌ | ✅ |
| Toggle Critical Feeder Status | ❌ | ❌ | ❌ | ❌ | ✅ |
| CRUD Grid Hierarchy (Zone/Sub/Feeder/Meter) | ❌ | ❌ | ❌ | ❌ | ✅ |
| Access Audit Logs & Notification Logs | ❌ | ❌ | ❌ | ❌ | ✅ |
| Suspend / Reactivate User Accounts | ❌ | ❌ | ❌ | ❌ | ✅ |

---

### 3. Core Business Logic & Rules

#### Rule 1: Critical Feeder Shielding
- Any Feeder marked `isCritical = true` (e.g., feeders powering public hospitals, water pumping stations, emergency response centers) is hard-excluded from the automatic scheduling algorithm.
- Even in extreme power deficits, the algorithm must never suggest a critical feeder.
- Administrators can toggle this flag via `PATCH /api/v1/admin/feeders/:id/critical`.

#### Rule 2: No-Double-Cut Rule
- A feeder must not be scheduled for load shedding more than once within the same calendar day (00:00:00 to 23:59:59 in the operational timezone).
- The scheduling engine checks both the proposed schedule's earlier slots and any other published schedules on that date.

#### Rule 3: Algorithmic Fair Rotation
- To achieve equity, the scheduler prioritizes eligible feeders that:
  1. Have had the lowest cumulative load-shedding hours over the past rolling 7/30 days.
  2. Have had the longest elapsed time since their last power interruption.
  3. Offer a capacity (MW) that closely matches the remaining deficit target for the given time slot, preventing unnecessary over-shedding.

#### Rule 4: Smart Outage Conflict Resolution
- When a customer triggers `POST /api/customers/me/outage-reports`:
  1. Meter ownership is validated.
  2. The linked Feeder is retrieved.
  3. The system checks if there is an active `PUBLISHED` schedule slot containing this Feeder covering the current server timestamp.
  4. **If active planned schedule exists:** Response immediately intercepts with `isPlanned: true, ticketCreated: false` and the scheduled restoration time. No ticket is created.
  5. **If no planned schedule exists:** An `OutageTicket` with status `REPORTED` is created. Feeder status becomes `UNEXPECTED_FAULT`. Operators and Zone Managers receive instant real-time alerts.

#### Rule 5: Technician Repair State Machine
- Strict progression: `ASSIGNED` → `EN_ROUTE` → `REPAIRING` → `RESOLVED`.
- Technicians cannot jump states or resolve tickets assigned to other crews.
- Ticket resolution requires resolution notes and valid photographic proof (JPEG/PNG/WebP <= 10MB).
- Feeder status restoration: when all active outages on a feeder are resolved and no active scheduled outage applies, the feeder transitions back to `ONLINE`.

---

### 4. Background Jobs & Automation Requirements

1. **`sendNotificationsJob` (Every 30s):**
   - Polls `NotificationDeliveryLog` for pending SMS items.
   - Dispatches via Twilio API.
   - Handles retries (up to 3 attempts with exponential backoff).
   - Marks status as `SENT` or `FAILED`.

2. **`scheduleEnforcerJob` (Hourly / Time-Aware Check):**
   - Scans published schedules.
   - Automatically toggles feeder status to `PLANNED_OUTAGE` at slot start.
   - Reverts feeder status to `ONLINE` at slot end (provided no unexpected fault exists).
   - Refreshes Upstash Redis cache and triggers Socket.io events.

3. **`gridMetricsSimulationJob` (Every 5m):**
   - Generates simulated national grid load, available generation, and regional power deficits for operator control room testing and visual demonstrations.

---

### 5. Non-Functional Requirements & Security
- **Security:** Argon2id/Bcrypt password hashing; HTTP-only secure SameSite cookies; RBAC and Zone-scoping middleware; rate limiting on auth endpoints; input validation with Zod.
- **Performance:** Redis caching for public and customer schedule queries; database indexing on foreign keys (`feederId`, `zoneId`, `customerId`, `meterId`); server-side pagination.
- **Reliability:** Atomic Prisma transactions for multi-record operations (schedule publication, ticket resolution); graceful fallback when external Twilio or Redis services are unavailable in local development.
