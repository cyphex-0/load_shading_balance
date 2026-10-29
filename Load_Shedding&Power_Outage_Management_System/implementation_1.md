# Load Shedding & Power Outage Management System — Implementation Blueprint

> **Purpose of this document:** This is the single, authoritative, dependency-ordered implementation roadmap for the entire Load Shedding & Power Outage Management System. Every phase builds upon previous phases. An AI coding agent or developer must follow this document sequentially, phase by phase, without skipping, guessing, or inventing undocumented features.

---

## Implementation Discipline

- Do not skip phases.
- Do not implement future-phase functionality early unless required for a dependency.
- Do not invent undocumented features.
- Do not change the technology stack without explicit approval.
- Do not redesign the database without justification.
- Do not create duplicate APIs for the same functionality.
- Reuse existing utilities and components when appropriate.
- Follow the API contracts defined in this document.
- Follow the database relationships defined in this document.
- Validate both frontend and backend inputs.
- Do not expose secrets.
- Do not mark a phase complete without running its verification steps.
- If an ambiguity is discovered, document it before making a significant architectural decision.
- Keep changes limited to the current phase.
- Preserve working functionality from previous phases.
- Do not silently remove existing requirements.

---

## Technology Stack (Source of Truth)

| Layer | Technology | Purpose |
|---|---|---|
| Frontend Framework | Next.js (App Router) | Web application with server components, role-guarded portals |
| Styling | Tailwind CSS + Shadcn UI | Rapid styling, accessible data-heavy components |
| Backend API | Node.js + Express.js | REST API, algorithms, conflict resolution engine |
| Real-time | Socket.io | WebSocket for live status updates |
| Scheduled Jobs | node-cron | Background jobs (grid simulation, hourly scheduling) |
| Database | Neon Serverless PostgreSQL | Relational data with foreign-key grid hierarchy |
| ORM | Prisma | Type-safe queries, migrations, relational joins |
| Cache | Upstash Redis | In-memory caching of published schedules |
| Authentication | Auth.js (NextAuth) | Session-based RBAC |
| Notifications | Twilio API | Automated SMS alerts |

---

## User Roles

| Role | Description | Registration | Key Capabilities |
|---|---|---|---|
| **Customer** | Residents / business owners | Self-registration (web app) | View schedule, report outages, receive notifications |
| **Power Operator** | Control room engineers | Admin-created account | Generate load-shedding plans, publish schedules, monitor grid |
| **Technician** | Field repair crews | Admin-created account | Accept fault tickets, update repair status, upload photos |
| **Zone Manager** | District supervisors | Admin-created account | View live grid status, analytics, request infrastructure upgrades |
| **Admin** | IT / system staff | Seeded initially, then Admin-created | Manage users, manage substations/zones/feeders, system configuration |

---

## Complete User Journeys

### Customer Journey

```
Self-Registration (email, location/meter ID)
    ↓
Email Verification (optional — see Open Questions)
    ↓
Login
    ↓
Dashboard: View current power status + upcoming schedule
    ↓
(Scenario A) Power goes out unexpectedly
    → Tap "Report Outage"
    → System checks: Is this area under planned load shedding?
        → YES: Auto-reply "Scheduled outage until HH:MM. Not a fault."
        → NO: Create fault ticket, assign technician, send SMS confirmation
    → Receive SMS when technician dispatched
    → Receive SMS when power restored
    ↓
(Scenario B) Planned outage approaching
    → Receive SMS notification ahead of scheduled outage
    → View countdown on dashboard
    ↓
Profile management (update location, meter ID, phone number)
    ↓
Logout
```

### Power Operator Journey

```
Login (admin-provisioned credentials)
    ↓
Control Room Dashboard: View national grid deficit, current demand
    ↓
Click "Generate Load Shedding Plan"
    → Backend algorithm selects feeders:
        - Ensures no zone is cut twice in one day
        - Excludes critical feeders (hospitals, etc.)
        - Fair rotation across zones
    → Algorithm returns proposed schedule
    ↓
Review generated schedule in table format
    ↓
Click "Publish"
    → Database updates (schedules table)
    → Redis cache refreshed
    → SMS blast sent to all customers on affected feeders
    ↓
View active/historical schedules
    ↓
Logout
```

### Technician Journey

```
Login (admin-provisioned credentials, mobile-optimized)
    ↓
View assigned fault tickets (sorted by priority/time)
    ↓
Receive real-time push when new fault assigned
    ↓
Tap "Accept & En Route"
    → Customer dashboard updates: "Technician Dispatched"
    → Zone Manager dashboard updates in real-time (Socket.io)
    ↓
Arrive at site → Tap "Repairing"
    → Status updates propagate
    ↓
Complete repair → Upload photo evidence → Tap "Resolved"
    → Fault ticket closed
    → Customer receives "Power Restored" SMS
    → Zone Manager dashboard updated
    ↓
View personal ticket history
    ↓
Logout
```

### Zone Manager Journey

```
Login (admin-provisioned credentials)
    ↓
Live Grid Status Dashboard:
    → Real-time sortable data table (Shadcn UI)
    → Rows: all zones and feeders
    → Status badges: Red (Unexpected Fault), Yellow (Planned Outage), Green (Online)
    ↓
Filter table: "Unexpected Faults" only
    → Verify technicians are assigned
    ↓
View individual feeder details
    ↓
Monthly Analytics Report:
    → "Which feeder fails most often?"
    → "Average resolution time per technician team?"
    → Exportable data
    ↓
Request infrastructure upgrade (form submission based on data)
    ↓
Logout
```

### Admin Journey

```
Login (seeded admin credentials initially)
    ↓
User Management:
    → Create accounts (Operator, Technician, Zone Manager, Admin)
    → Assign roles
    → Activate / deactivate accounts
    → View all users
    ↓
Grid Infrastructure Management:
    → Add / edit / delete Zones
    → Add / edit / delete Substations
    → Add / edit / delete Feeders (mark as critical)
    → Add / edit / delete Meters (link to feeders)
    ↓
System monitoring (view logs, system health)
    ↓
Logout
```

### System Journey — Smart Conflict Resolution

```
Customer clicks "Report Outage"
    ↓
Backend receives report with customer's Meter ID
    ↓
Query: What feeder does this meter belong to?
    ↓
Query: Is this feeder currently under a published planned outage?
    ↓
  YES → Auto-respond: "Your area is under scheduled load shedding until HH:MM. Not a fault."
       → Do NOT create a fault ticket
       → Do NOT dispatch a technician
    ↓
  NO → Create fault ticket
     → Assign to available technician in that zone
     → Send SMS to customer: "Report received. Technician being assigned."
     → Notify Zone Manager dashboard via Socket.io
```

---

## Database Design

### Entity-Relationship Summary

```
Zone (1) ──→ (N) Substation
Substation (1) ──→ (N) Feeder
Feeder (1) ──→ (N) Meter
Meter (N) ──→ (1) Customer (User)
Zone (1) ──→ (N) User (Zone Manager assignment)
Feeder (N) ──→ (N) Schedule (via ScheduleFeeder join)
Fault (N) ──→ (1) Feeder
Fault (N) ──→ (1) User (reported_by: Customer)
Fault (N) ──→ (1) User (assigned_to: Technician)
Fault (1) ──→ (N) FaultUpdate
Fault (1) ──→ (N) FaultPhoto
InfrastructureRequest (N) ──→ (1) Feeder
InfrastructureRequest (N) ──→ (1) User (requested_by: Zone Manager)
Notification (N) ──→ (1) User
```

### Entities

#### 1. User

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK, auto-generated | |
| email | VARCHAR(255) | UNIQUE, NOT NULL | |
| password_hash | VARCHAR(255) | NOT NULL | bcrypt hashed |
| name | VARCHAR(255) | NOT NULL | |
| phone | VARCHAR(20) | NULLABLE | Required for Customers (SMS) |
| role | ENUM('CUSTOMER','OPERATOR','TECHNICIAN','ZONE_MANAGER','ADMIN') | NOT NULL | |
| zone_id | UUID | FK → Zone, NULLABLE | For Technicians and Zone Managers |
| meter_id | UUID | FK → Meter, NULLABLE | For Customers |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | Account activation status |
| email_verified | BOOLEAN | NOT NULL, DEFAULT false | |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMP | NOT NULL, auto-update | |

**Indexes:** `email` (unique), `role`, `zone_id`, `meter_id`

#### 2. Zone

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| name | VARCHAR(255) | NOT NULL, UNIQUE | e.g., "Zone A — North District" |
| code | VARCHAR(50) | NOT NULL, UNIQUE | Short code, e.g., "ZONE-A" |
| description | TEXT | NULLABLE | |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMP | NOT NULL, auto-update | |

**Indexes:** `code` (unique), `name` (unique)

#### 3. Substation

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| name | VARCHAR(255) | NOT NULL | |
| code | VARCHAR(50) | NOT NULL, UNIQUE | |
| zone_id | UUID | FK → Zone, NOT NULL | CASCADE on delete |
| capacity_mw | DECIMAL(10,2) | NOT NULL | Capacity in megawatts |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMP | NOT NULL, auto-update | |

**Indexes:** `zone_id`, `code` (unique)

#### 4. Feeder

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| name | VARCHAR(255) | NOT NULL | |
| code | VARCHAR(50) | NOT NULL, UNIQUE | |
| substation_id | UUID | FK → Substation, NOT NULL | CASCADE on delete |
| capacity_mw | DECIMAL(10,2) | NOT NULL | |
| is_critical | BOOLEAN | NOT NULL, DEFAULT false | Hospitals, etc. — excluded from shedding |
| status | ENUM('ONLINE','PLANNED_OUTAGE','UNEXPECTED_FAULT') | NOT NULL, DEFAULT 'ONLINE' | |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMP | NOT NULL, auto-update | |

**Indexes:** `substation_id`, `code` (unique), `status`, `is_critical`

#### 5. Meter

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| meter_number | VARCHAR(100) | NOT NULL, UNIQUE | Physical meter identifier |
| feeder_id | UUID | FK → Feeder, NOT NULL | CASCADE on delete |
| address | TEXT | NULLABLE | Physical address |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMP | NOT NULL, auto-update | |

**Indexes:** `meter_number` (unique), `feeder_id`

#### 6. Schedule

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| title | VARCHAR(255) | NOT NULL | e.g., "Emergency 50MW Shed — Sept 23" |
| deficit_mw | DECIMAL(10,2) | NOT NULL | Total MW to shed |
| start_time | TIMESTAMP | NOT NULL | |
| end_time | TIMESTAMP | NOT NULL | |
| status | ENUM('DRAFT','PUBLISHED','ACTIVE','COMPLETED','CANCELLED') | NOT NULL, DEFAULT 'DRAFT' | |
| created_by | UUID | FK → User (Operator), NOT NULL | |
| published_at | TIMESTAMP | NULLABLE | |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMP | NOT NULL, auto-update | |

**Indexes:** `status`, `start_time`, `end_time`, `created_by`

#### 7. ScheduleFeeder (Join Table)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| schedule_id | UUID | FK → Schedule, NOT NULL | CASCADE on delete |
| feeder_id | UUID | FK → Feeder, NOT NULL | CASCADE on delete |
| start_time | TIMESTAMP | NOT NULL | Per-feeder override if different |
| end_time | TIMESTAMP | NOT NULL | Per-feeder override if different |

**Indexes:** Composite unique on (`schedule_id`, `feeder_id`)

#### 8. Fault

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| ticket_number | VARCHAR(50) | NOT NULL, UNIQUE | Auto-generated, e.g., "FLT-20260923-001" |
| feeder_id | UUID | FK → Feeder, NOT NULL | |
| reported_by | UUID | FK → User (Customer), NOT NULL | |
| assigned_to | UUID | FK → User (Technician), NULLABLE | |
| description | TEXT | NULLABLE | Customer's description |
| fault_type | ENUM('TRANSFORMER_BLOWN','LINE_DOWN','EQUIPMENT_FAILURE','OTHER') | NOT NULL, DEFAULT 'OTHER' | |
| status | ENUM('REPORTED','ASSIGNED','EN_ROUTE','REPAIRING','RESOLVED','CANCELLED') | NOT NULL, DEFAULT 'REPORTED' | |
| priority | ENUM('LOW','MEDIUM','HIGH','CRITICAL') | NOT NULL, DEFAULT 'MEDIUM' | |
| reported_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | |
| assigned_at | TIMESTAMP | NULLABLE | |
| resolved_at | TIMESTAMP | NULLABLE | |
| resolution_notes | TEXT | NULLABLE | |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMP | NOT NULL, auto-update | |

**Indexes:** `feeder_id`, `reported_by`, `assigned_to`, `status`, `ticket_number` (unique), `priority`

#### 9. FaultPhoto

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| fault_id | UUID | FK → Fault, NOT NULL | CASCADE on delete |
| uploaded_by | UUID | FK → User, NOT NULL | |
| file_path | VARCHAR(500) | NOT NULL | Relative path to stored image |
| file_name | VARCHAR(255) | NOT NULL | Original filename |
| file_size | INTEGER | NOT NULL | Bytes |
| mime_type | VARCHAR(100) | NOT NULL | e.g., "image/jpeg" |
| uploaded_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | |

**Indexes:** `fault_id`

#### 10. FaultUpdate

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| fault_id | UUID | FK → Fault, NOT NULL | CASCADE on delete |
| updated_by | UUID | FK → User, NOT NULL | |
| previous_status | ENUM (same as Fault.status) | NOT NULL | |
| new_status | ENUM (same as Fault.status) | NOT NULL | |
| notes | TEXT | NULLABLE | |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | |

**Indexes:** `fault_id`, `created_at`

#### 11. Notification

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| user_id | UUID | FK → User, NOT NULL | CASCADE on delete |
| type | ENUM('SMS','IN_APP','PUSH') | NOT NULL | |
| channel | VARCHAR(50) | NOT NULL | e.g., "TWILIO", "SOCKET" |
| title | VARCHAR(255) | NOT NULL | |
| message | TEXT | NOT NULL | |
| is_read | BOOLEAN | NOT NULL, DEFAULT false | For in-app notifications |
| sent_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | |
| delivered_at | TIMESTAMP | NULLABLE | |
| metadata | JSONB | NULLABLE | Extra data (fault_id, schedule_id, etc.) |

**Indexes:** `user_id`, `is_read`, `type`, `sent_at`

#### 12. InfrastructureRequest

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| feeder_id | UUID | FK → Feeder, NOT NULL | |
| requested_by | UUID | FK → User (Zone Manager), NOT NULL | |
| reason | TEXT | NOT NULL | |
| supporting_data | JSONB | NULLABLE | Analytics data backing the request |
| status | ENUM('PENDING','APPROVED','REJECTED','COMPLETED') | NOT NULL, DEFAULT 'PENDING' | |
| admin_notes | TEXT | NULLABLE | |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMP | NOT NULL, auto-update | |

**Indexes:** `feeder_id`, `requested_by`, `status`

#### 13. GridStatus (Singleton / Configuration)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| total_capacity_mw | DECIMAL(10,2) | NOT NULL | Total national grid capacity |
| current_demand_mw | DECIMAL(10,2) | NOT NULL | Current demand |
| deficit_mw | DECIMAL(10,2) | NOT NULL, DEFAULT 0 | Calculated deficit |
| updated_at | TIMESTAMP | NOT NULL, auto-update | |

**Indexes:** None needed (single row or few rows)

#### 14. AuditLog

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| user_id | UUID | FK → User, NULLABLE | NULL for system actions |
| action | VARCHAR(255) | NOT NULL | e.g., "SCHEDULE_PUBLISHED", "FAULT_RESOLVED" |
| entity_type | VARCHAR(100) | NOT NULL | e.g., "Schedule", "Fault", "User" |
| entity_id | UUID | NOT NULL | |
| details | JSONB | NULLABLE | Before/after data |
| ip_address | VARCHAR(45) | NULLABLE | |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | |

**Indexes:** `user_id`, `entity_type`, `entity_id`, `action`, `created_at`

---

## Backend Architecture

```
backend/
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
├── src/
│   ├── index.ts                  # Express server bootstrap
│   ├── app.ts                    # Express app configuration
│   ├── config/
│   │   ├── env.ts                # Environment variable validation
│   │   ├── database.ts           # Prisma client singleton
│   │   ├── redis.ts              # Upstash Redis client
│   │   ├── twilio.ts             # Twilio client
│   │   └── socket.ts             # Socket.io configuration
│   ├── middleware/
│   │   ├── auth.ts               # JWT/session verification
│   │   ├── rbac.ts               # Role-based access control
│   │   ├── validate.ts           # Request validation (Zod)
│   │   ├── errorHandler.ts       # Global error handler
│   │   ├── rateLimiter.ts        # Rate limiting
│   │   └── upload.ts             # File upload (multer)
│   ├── routes/
│   │   ├── index.ts              # Route aggregator
│   │   ├── auth.routes.ts
│   │   ├── user.routes.ts
│   │   ├── zone.routes.ts
│   │   ├── substation.routes.ts
│   │   ├── feeder.routes.ts
│   │   ├── meter.routes.ts
│   │   ├── schedule.routes.ts
│   │   ├── fault.routes.ts
│   │   ├── notification.routes.ts
│   │   ├── analytics.routes.ts
│   │   ├── grid.routes.ts
│   │   └── admin.routes.ts
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── user.controller.ts
│   │   ├── zone.controller.ts
│   │   ├── substation.controller.ts
│   │   ├── feeder.controller.ts
│   │   ├── meter.controller.ts
│   │   ├── schedule.controller.ts
│   │   ├── fault.controller.ts
│   │   ├── notification.controller.ts
│   │   ├── analytics.controller.ts
│   │   ├── grid.controller.ts
│   │   └── admin.controller.ts
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── user.service.ts
│   │   ├── zone.service.ts
│   │   ├── substation.service.ts
│   │   ├── feeder.service.ts
│   │   ├── meter.service.ts
│   │   ├── schedule.service.ts
│   │   ├── loadShedding.service.ts   # The algorithm
│   │   ├── conflictResolution.service.ts  # Smart conflict checker
│   │   ├── fault.service.ts
│   │   ├── notification.service.ts
│   │   ├── sms.service.ts           # Twilio wrapper
│   │   ├── cache.service.ts         # Redis wrapper
│   │   ├── analytics.service.ts
│   │   ├── grid.service.ts
│   │   ├── audit.service.ts
│   │   └── admin.service.ts
│   ├── validators/
│   │   ├── auth.validator.ts
│   │   ├── user.validator.ts
│   │   ├── zone.validator.ts
│   │   ├── substation.validator.ts
│   │   ├── feeder.validator.ts
│   │   ├── meter.validator.ts
│   │   ├── schedule.validator.ts
│   │   ├── fault.validator.ts
│   │   └── analytics.validator.ts
│   ├── jobs/
│   │   ├── gridSimulation.job.ts     # Simulates grid fluctuations
│   │   ├── scheduleActivation.job.ts # Activates/completes schedules
│   │   └── index.ts
│   ├── sockets/
│   │   ├── index.ts                  # Socket.io event handlers
│   │   └── gridUpdates.ts
│   ├── utils/
│   │   ├── apiResponse.ts            # Standardized response format
│   │   ├── apiError.ts               # Custom error classes
│   │   ├── ticketGenerator.ts        # Fault ticket number generator
│   │   ├── pagination.ts             # Pagination helper
│   │   └── logger.ts                 # Winston logger
│   └── types/
│       ├── express.d.ts              # Express type extensions
│       └── index.ts                  # Shared types
├── uploads/                          # Photo uploads directory
├── .env
├── .env.example
├── package.json
├── tsconfig.json
└── nodemon.json
```

### Frontend Architecture

```
frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx                # Root layout
│   │   ├── page.tsx                  # Landing page
│   │   ├── globals.css
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   ├── register/page.tsx
│   │   │   └── forgot-password/page.tsx
│   │   ├── (customer)/
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── schedule/page.tsx
│   │   │   ├── report-outage/page.tsx
│   │   │   ├── my-reports/page.tsx
│   │   │   └── profile/page.tsx
│   │   ├── (operator)/
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── generate-plan/page.tsx
│   │   │   ├── schedules/page.tsx
│   │   │   └── schedules/[id]/page.tsx
│   │   ├── (technician)/
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── tickets/page.tsx
│   │   │   ├── tickets/[id]/page.tsx
│   │   │   └── history/page.tsx
│   │   ├── (manager)/
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── grid-status/page.tsx
│   │   │   ├── analytics/page.tsx
│   │   │   └── infrastructure-requests/page.tsx
│   │   ├── (admin)/
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── users/page.tsx
│   │   │   ├── users/[id]/page.tsx
│   │   │   ├── zones/page.tsx
│   │   │   ├── substations/page.tsx
│   │   │   ├── feeders/page.tsx
│   │   │   ├── meters/page.tsx
│   │   │   ├── audit-log/page.tsx
│   │   │   └── infrastructure-requests/page.tsx
│   │   └── api/
│   │       └── auth/
│   │           └── [...nextauth]/route.ts
│   ├── components/
│   │   ├── ui/                       # Shadcn UI components
│   │   ├── layouts/
│   │   │   ├── PublicLayout.tsx
│   │   │   ├── CustomerLayout.tsx
│   │   │   ├── OperatorLayout.tsx
│   │   │   ├── TechnicianLayout.tsx
│   │   │   ├── ManagerLayout.tsx
│   │   │   └── AdminLayout.tsx
│   │   ├── navigation/
│   │   │   ├── Navbar.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── MobileNav.tsx
│   │   ├── common/
│   │   │   ├── StatusBadge.tsx
│   │   │   ├── DataTable.tsx
│   │   │   ├── Pagination.tsx
│   │   │   ├── SearchFilter.tsx
│   │   │   ├── ConfirmDialog.tsx
│   │   │   ├── LoadingSpinner.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   ├── ErrorState.tsx
│   │   │   ├── PageHeader.tsx
│   │   │   ├── StatCard.tsx
│   │   │   └── NotificationToast.tsx
│   │   ├── forms/
│   │   │   ├── LoginForm.tsx
│   │   │   ├── RegisterForm.tsx
│   │   │   ├── OutageReportForm.tsx
│   │   │   ├── ScheduleForm.tsx
│   │   │   ├── UserForm.tsx
│   │   │   ├── ZoneForm.tsx
│   │   │   ├── SubstationForm.tsx
│   │   │   ├── FeederForm.tsx
│   │   │   └── MeterForm.tsx
│   │   ├── dashboard/
│   │   │   ├── CustomerStatusCard.tsx
│   │   │   ├── ScheduleTimeline.tsx
│   │   │   ├── GridDeficitGauge.tsx
│   │   │   ├── FaultTicketCard.tsx
│   │   │   └── AnalyticsChart.tsx
│   │   └── realtime/
│   │       ├── SocketProvider.tsx
│   │       └── LiveStatusIndicator.tsx
│   ├── lib/
│   │   ├── api.ts                    # Axios/fetch wrapper
│   │   ├── auth.ts                   # NextAuth config
│   │   ├── socket.ts                 # Socket.io client
│   │   ├── utils.ts                  # General utilities
│   │   └── validations.ts           # Zod schemas for forms
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useSocket.ts
│   │   ├── useFaults.ts
│   │   ├── useSchedules.ts
│   │   └── useNotifications.ts
│   └── types/
│       └── index.ts                  # Shared frontend types
├── public/
├── .env.local
├── .env.example
├── next.config.js
├── tailwind.config.ts
├── components.json                   # Shadcn UI config
├── package.json
└── tsconfig.json
```

---

## Environment Variables

### Backend (.env)

| Variable | Purpose | Required | Example |
|---|---|---|---|
| `PORT` | Express server port | Yes | `4000` |
| `NODE_ENV` | Environment mode | Yes | `development` / `production` |
| `DATABASE_URL` | Neon PostgreSQL connection string | Yes | `postgresql://user:pass@host/db?sslmode=require` |
| `DIRECT_DATABASE_URL` | Direct connection for migrations | Yes | `postgresql://user:pass@host/db` |
| `REDIS_URL` | Upstash Redis connection URL | Yes | `rediss://default:token@host:6379` |
| `REDIS_TOKEN` | Upstash Redis REST token | Yes | `<token>` |
| `JWT_SECRET` | JWT signing secret | Yes | `<random-64-char-string>` |
| `JWT_EXPIRES_IN` | Token expiry | Yes | `7d` |
| `TWILIO_ACCOUNT_SID` | Twilio account SID | Yes | `ACxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | Yes | `<token>` |
| `TWILIO_PHONE_NUMBER` | Twilio sender number | Yes | `+1234567890` |
| `CORS_ORIGIN` | Allowed frontend origin | Yes | `http://localhost:3000` |
| `UPLOAD_DIR` | Photo upload directory | No | `./uploads` |
| `LOG_LEVEL` | Logging level | No | `info` |

### Frontend (.env.local)

| Variable | Purpose | Required | Example |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | Backend API base URL | Yes | `http://localhost:4000/api` |
| `NEXT_PUBLIC_SOCKET_URL` | Socket.io server URL | Yes | `http://localhost:4000` |
| `NEXTAUTH_URL` | NextAuth callback URL | Yes | `http://localhost:3000` |
| `NEXTAUTH_SECRET` | NextAuth encryption secret | Yes | `<random-64-char-string>` |

---

## Open Questions / Decisions Required

1. **Email Verification:** The requirements mention SMS but not email verification. Recommendation: implement email verification as optional, with the system functional without it. Customers are identified primarily by Meter ID.

2. **Mobile App vs. Mobile-Responsive Web:** The requirements mention "web/mobile app" for customers and "mobile app" for technicians. Recommendation: build a responsive web app for all roles (Next.js handles this well), rather than a native mobile app, unless explicitly required. The technician view should be optimized for mobile screens.

3. **GPS Location for Technicians:** Step 2 of Technician journey mentions "GPS location." Recommendation: store a text-based address/location description on the feeder/substation rather than implementing full GPS/map integration, since the Zone Manager journey explicitly replaces a map with a data table approach. Display the address/directions as text.

4. **Push Notifications:** Requirements mention "push notifications." Recommendation: implement in-app notifications via Socket.io and SMS via Twilio. Browser push notifications (Web Push API) can be added as a stretch goal but are not core to the system.

5. **Technician Assignment:** Requirements do not specify how technicians are assigned to faults. Recommendation: auto-assign to a technician in the same zone who has the fewest active tickets (simple load balancing). Admin/Manager can manually reassign.

6. **Payment/Billing:** No billing or payment features are mentioned. None will be implemented.

7. **Multi-language Support:** Not mentioned. Not implemented.

---

# PHASES

---

# Phase 01 — Project Initialization & Repository Setup

## Objective

Set up the monorepo structure with separate backend and frontend directories, initialize version control, and establish coding standards.

## Depends On

- Nothing (this is the foundation)

## Why This Phase Exists

Every subsequent phase requires an initialized, properly structured project. Without this, no code can be written or organized.

## Scope

**IN SCOPE:**
- Create monorepo folder structure
- Initialize Git repository
- Create `.gitignore` files
- Create root `package.json` (if using workspaces) or separate `package.json` files
- Create `README.md` stub
- Create `.env.example` files for both backend and frontend

**OUT OF SCOPE:**
- Installing any application dependencies
- Writing any application code
- Database setup

## Backend Work

- Create `backend/` directory
- Create `backend/package.json` with project metadata (no dependencies yet)
- Create `backend/.env.example` with all variable names from the Environment Variables section
- Create `backend/.gitignore` (node_modules, .env, dist, uploads/)
- Create `backend/tsconfig.json` stub

## Frontend Work

- Create `frontend/` directory
- Create `frontend/.env.example`

## Database Work

None.

## API Work

None.

## Pages

None.

## Components

None.

## User Journey

None.

## Security

- `.env` files must be in `.gitignore`
- Never commit real secrets

## Error Handling

N/A

## Testing

N/A

## Documentation

- Create root `README.md` with project name, description, and tech stack overview
- Create `backend/README.md` stub
- Create `frontend/README.md` stub

## Environment Variables

Define all `.env.example` files as documented in the Environment Variables section.

## Files Expected To Change

```
.gitignore
README.md
backend/
  package.json
  tsconfig.json
  .env.example
  .gitignore
  README.md
frontend/
  .env.example
  README.md
```

## Completion Criteria

- [ ] Directory structure exists: `backend/`, `frontend/`
- [ ] Git repository initialized with proper `.gitignore`
- [ ] `.env.example` files exist for both backend and frontend
- [ ] No real secrets are committed
- [ ] `README.md` files exist

## Verification

1. `git status` shows clean working tree after initial commit
2. `.env.example` files contain all expected variable names
3. `.gitignore` covers `node_modules`, `.env`, `dist`, `uploads/`

## Output

An empty but organized monorepo ready for dependency installation.

**Commit:** `chore: initialize project repository structure`

---

# Phase 02 — Backend Project Initialization & Dependencies

## Objective

Initialize the Express.js + TypeScript backend with all required dependencies, configure TypeScript compilation, and create the entry point.

## Depends On

- Phase 01

## Why This Phase Exists

The backend server is the foundation for all API work, database connections, and business logic. It must be properly bootstrapped before any features can be developed.

## Scope

**IN SCOPE:**
- Install backend dependencies
- Configure TypeScript
- Create Express application bootstrap
- Create basic server that starts and listens on a port
- Configure development tooling (nodemon, ts-node)

**OUT OF SCOPE:**
- Database connection
- Any routes or controllers
- Authentication
- Frontend

## Backend Work

### Dependencies to install:

**Production:**
- `express` — Web framework
- `cors` — Cross-origin resource sharing
- `helmet` — Security headers
- `morgan` — HTTP request logging
- `dotenv` — Environment variables
- `zod` — Schema validation
- `winston` — Application logging
- `express-rate-limit` — Rate limiting
- `multer` — File uploads
- `bcryptjs` — Password hashing
- `jsonwebtoken` — JWT tokens
- `socket.io` — WebSocket server
- `node-cron` — Scheduled jobs
- `@prisma/client` — Database ORM client
- `@upstash/redis` — Redis client
- `twilio` — SMS notifications
- `uuid` — UUID generation

**Development:**
- `typescript`
- `ts-node`
- `nodemon`
- `@types/express`
- `@types/cors`
- `@types/morgan`
- `@types/bcryptjs`
- `@types/jsonwebtoken`
- `@types/multer`
- `@types/node`
- `@types/uuid`
- `prisma` — Prisma CLI

### Files to create:

**`backend/tsconfig.json`:**
- Target: ES2020
- Module: CommonJS
- OutDir: `./dist`
- RootDir: `./src`
- Strict mode enabled
- esModuleInterop enabled

**`backend/nodemon.json`:**
- Watch `src/` directory
- Extension: `.ts`
- Exec: `ts-node src/index.ts`

**`backend/src/config/env.ts`:**
- Load and validate all environment variables using Zod
- Export typed config object
- Throw descriptive error if required variables are missing

**`backend/src/utils/logger.ts`:**
- Configure Winston with console transport
- Log levels: error, warn, info, debug
- Include timestamps
- Redact sensitive data patterns

**`backend/src/utils/apiResponse.ts`:**
- `sendSuccess(res, data, message, statusCode)` — Standardized success response
- `sendError(res, message, statusCode, errors)` — Standardized error response
- Response shape:
  ```json
  {
    "success": true/false,
    "message": "...",
    "data": { ... },
    "errors": [ ... ]
  }
  ```

**`backend/src/utils/apiError.ts`:**
- Custom `ApiError` class extending Error
- Properties: `statusCode`, `message`, `errors`
- Static factory methods: `badRequest()`, `unauthorized()`, `forbidden()`, `notFound()`, `conflict()`, `validationError()`, `internal()`

**`backend/src/middleware/errorHandler.ts`:**
- Global Express error handler
- Catches `ApiError` instances → structured error response
- Catches `ZodError` → 422 with field-level errors
- Catches unknown errors → 500 with generic message
- Logs all errors via Winston
- Never exposes stack traces in production

**`backend/src/app.ts`:**
- Create Express application
- Apply middleware: `helmet()`, `cors()`, `morgan()`, `express.json()`, `express.urlencoded()`
- Mount health check route: `GET /api/health` → `{ status: "ok", timestamp: ... }`
- Apply error handler middleware (must be last)

**`backend/src/index.ts`:**
- Import app from `app.ts`
- Load environment config
- Start HTTP server on configured port
- Log startup message

## Database Work

None.

## API Work

### GET /api/health

- **Purpose:** Health check endpoint
- **Authentication:** Public
- **Headers:** None required
- **Request body:** None
- **Response:**
  ```json
  {
    "success": true,
    "message": "Server is running",
    "data": {
      "status": "ok",
      "timestamp": "2026-09-23T17:00:00Z",
      "environment": "development"
    }
  }
  ```
- **Error cases:** 500 if server fails to respond

## Frontend Work

None.

## Pages

None.

## Components

None.

## User Journey

None.

## Security

- Helmet for secure HTTP headers
- CORS configured to allow only the frontend origin
- Rate limiting middleware skeleton created (not yet applied to routes)
- Environment variable validation prevents startup with missing secrets

## Error Handling

- Global error handler catches all unhandled errors
- Structured error responses with appropriate HTTP status codes
- Stack traces hidden in production

## Testing

- Manually verify server starts with `npm run dev`
- Hit `GET /api/health` and confirm response

## Documentation

- Update `backend/README.md` with setup instructions, `npm install`, `npm run dev`

## Environment Variables

- `PORT` — used now
- `NODE_ENV` — used now
- `CORS_ORIGIN` — used now
- All others defined in `.env.example` but not yet consumed

## Files Expected To Change

```
backend/package.json (updated with dependencies)
backend/tsconfig.json
backend/nodemon.json
backend/src/index.ts
backend/src/app.ts
backend/src/config/env.ts
backend/src/utils/logger.ts
backend/src/utils/apiResponse.ts
backend/src/utils/apiError.ts
backend/src/middleware/errorHandler.ts
```

## Completion Criteria

- [ ] `npm install` completes without errors
- [ ] `npm run dev` starts the server
- [ ] Server listens on configured PORT
- [ ] `GET /api/health` returns 200 with expected JSON
- [ ] Invalid env vars cause descriptive startup error
- [ ] TypeScript compiles without errors
- [ ] Winston logger outputs to console

## Verification

1. Run `cd backend && npm install`
2. Create `.env` from `.env.example` with minimal values (`PORT=4000`, `NODE_ENV=development`, `CORS_ORIGIN=http://localhost:3000`)
3. Run `npm run dev`
4. `curl http://localhost:4000/api/health` → expect `{ "success": true, ... }`
5. Stop server, remove `PORT` from `.env`, restart → expect descriptive error

## Output

A running Express server with health check, structured error handling, logging, and environment validation.

**Commit:** `feat: initialize backend with Express, TypeScript, and core utilities`

---

# Phase 03 — Database Schema & Prisma Setup

## Objective

Define the complete Prisma schema for all database entities, generate the Prisma client, run initial migration, and verify database connectivity.

## Depends On

- Phase 02

## Why This Phase Exists

Every backend service and API depends on the database. The schema must be fully defined and migrated before any data-related code can be written.

## Scope

**IN SCOPE:**
- Prisma initialization and configuration
- Complete schema definition for all 14 entities
- Initial database migration
- Prisma client generation
- Database connection utility
- Connection verification at startup

**OUT OF SCOPE:**
- Seed data (Phase 04)
- Any API routes
- Any business logic

## Backend Work

### `backend/prisma/schema.prisma`

Define all entities as specified in the Database Design section:

1. **User** — with role enum, zone/meter relations
2. **Zone** — with substations relation
3. **Substation** — with zone FK, feeders relation
4. **Feeder** — with substation FK, status enum, meters relation
5. **Meter** — with feeder FK, unique meter_number
6. **Schedule** — with status enum, created_by FK
7. **ScheduleFeeder** — join table with composite unique
8. **Fault** — with status/priority/fault_type enums, feeder/reporter/assignee FKs
9. **FaultPhoto** — with fault FK, file metadata
10. **FaultUpdate** — with fault FK, status transition tracking
11. **Notification** — with user FK, type enum
12. **InfrastructureRequest** — with feeder/user FKs, status enum
13. **GridStatus** — singleton configuration
14. **AuditLog** — action tracking with JSONB details

**Enums to define in Prisma:**
- `Role`: CUSTOMER, OPERATOR, TECHNICIAN, ZONE_MANAGER, ADMIN
- `FeederStatus`: ONLINE, PLANNED_OUTAGE, UNEXPECTED_FAULT
- `ScheduleStatus`: DRAFT, PUBLISHED, ACTIVE, COMPLETED, CANCELLED
- `FaultType`: TRANSFORMER_BLOWN, LINE_DOWN, EQUIPMENT_FAILURE, OTHER
- `FaultStatus`: REPORTED, ASSIGNED, EN_ROUTE, REPAIRING, RESOLVED, CANCELLED
- `Priority`: LOW, MEDIUM, HIGH, CRITICAL
- `NotificationType`: SMS, IN_APP, PUSH
- `InfrastructureRequestStatus`: PENDING, APPROVED, REJECTED, COMPLETED

**All models must include:**
- UUID `id` as `@id @default(uuid())`
- `createdAt` and `updatedAt` with `@default(now())` and `@updatedAt`
- Proper `@relation` annotations
- `@@index` for frequently queried fields
- `@@unique` for composite unique constraints

### `backend/src/config/database.ts`

- Create Prisma client singleton
- Apply best practice: reuse client in development to avoid exhausting connections
- Export `prisma` instance

### Update `backend/src/index.ts`

- On startup, verify database connectivity: `prisma.$connect()`
- Log success or exit with error

## Database Work

- Run `npx prisma init` (if not already done)
- Configure `datasource db` with `postgresql` provider and `DATABASE_URL`
- Set `directUrl` to `DIRECT_DATABASE_URL` for Neon compatibility
- Run `npx prisma migrate dev --name init` to create initial migration
- Run `npx prisma generate` to generate client

## API Work

None (health check already exists from Phase 02).

## Frontend Work

None.

## Pages

None.

## Components

None.

## User Journey

None.

## Security

- Database URL contains credentials — must never be logged or exposed
- Use parameterized queries (Prisma handles this by default)

## Error Handling

- If database connection fails at startup, log error and exit process
- Prisma errors should be caught and transformed to ApiError in future phases

## Testing

- Verify migration runs successfully
- Verify `npx prisma studio` shows all tables
- Verify application starts and connects to database

## Documentation

- Document how to run migrations in `backend/README.md`
- Document Prisma Studio usage

## Environment Variables

- `DATABASE_URL` — now consumed
- `DIRECT_DATABASE_URL` — now consumed

## Files Expected To Change

```
backend/prisma/schema.prisma
backend/prisma/migrations/ (auto-generated)
backend/src/config/database.ts
backend/src/index.ts (updated for DB connection)
```

## Completion Criteria

- [ ] Prisma schema defines all 14 entities with correct relationships
- [ ] All enums are defined
- [ ] Migration runs without errors
- [ ] Prisma client generates without errors
- [ ] Application starts and connects to database
- [ ] `npx prisma studio` shows all tables with correct columns
- [ ] Foreign key relationships are correct in the database

## Verification

1. `npx prisma migrate dev --name init` → succeeds
2. `npx prisma generate` → succeeds
3. `npx prisma studio` → all 14 tables visible with correct columns and relationships
4. `npm run dev` → server starts and logs "Database connected successfully"
5. Intentionally break `DATABASE_URL` → server logs descriptive error and exits

## Output

A fully migrated PostgreSQL database with all tables, relationships, indexes, and a working Prisma client.

**Commit:** `feat: add complete database schema with Prisma migrations`

---

# Phase 04 — Database Seeding

## Objective

Create seed data that provides a realistic development environment with all user roles, grid infrastructure, sample schedules, and fault tickets.

## Depends On

- Phase 03

## Why This Phase Exists

Development and testing require pre-populated data. Without seed data, every subsequent phase requires manual data creation to test features.

## Scope

**IN SCOPE:**
- Create seed script
- Seed admin user
- Seed all role test accounts
- Seed zones, substations, feeders, meters
- Seed sample grid status
- Add seed command to package.json

**OUT OF SCOPE:**
- Seed schedules/faults (those require business logic from later phases)
- Authentication system
- API routes

## Backend Work

### `backend/prisma/seed.ts`

Create a comprehensive seed script:

**Users (6 accounts):**

| Email | Password | Role | Notes |
|---|---|---|---|
| admin@powerapp.dev | Admin@123 | ADMIN | System administrator |
| operator@powerapp.dev | Operator@123 | OPERATOR | Control room engineer |
| tech1@powerapp.dev | Tech@123 | TECHNICIAN | Field worker (Zone A) |
| tech2@powerapp.dev | Tech@123 | TECHNICIAN | Field worker (Zone B) |
| manager@powerapp.dev | Manager@123 | ZONE_MANAGER | Zone A supervisor |
| customer@powerapp.dev | Customer@123 | CUSTOMER | Test customer (linked to Meter) |

All passwords must be bcrypt-hashed in the seed script.
All accounts: `is_active: true`, `email_verified: true`.

**Grid Infrastructure:**

```
Zone A — North District
  ├── Substation A1 (50 MW)
  │   ├── Feeder A1-F1 (10 MW, status: ONLINE)
  │   │   ├── Meter MTR-A1F1-001
  │   │   ├── Meter MTR-A1F1-002
  │   │   └── Meter MTR-A1F1-003
  │   ├── Feeder A1-F2 (12 MW, status: ONLINE)
  │   │   ├── Meter MTR-A1F2-001
  │   │   └── Meter MTR-A1F2-002
  │   └── Feeder A1-F3 (8 MW, status: ONLINE, is_critical: true) ← Hospital
  │       └── Meter MTR-A1F3-001
  └── Substation A2 (40 MW)
      ├── Feeder A2-F1 (15 MW, status: ONLINE)
      │   ├── Meter MTR-A2F1-001
      │   └── Meter MTR-A2F1-002
      └── Feeder A2-F2 (10 MW, status: ONLINE)
          └── Meter MTR-A2F2-001

Zone B — South District
  ├── Substation B1 (60 MW)
  │   ├── Feeder B1-F1 (20 MW, status: ONLINE)
  │   │   ├── Meter MTR-B1F1-001
  │   │   └── Meter MTR-B1F1-002
  │   └── Feeder B1-F2 (15 MW, status: ONLINE)
  │       └── Meter MTR-B1F2-001
  └── Substation B2 (45 MW)
      ├── Feeder B2-F1 (18 MW, status: ONLINE)
      │   └── Meter MTR-B2F1-001
      └── Feeder B2-F2 (12 MW, status: ONLINE)
          └── Meter MTR-B2F2-001

Zone C — East District
  └── Substation C1 (55 MW)
      ├── Feeder C1-F1 (25 MW, status: ONLINE)
      │   ├── Meter MTR-C1F1-001
      │   └── Meter MTR-C1F1-002
      └── Feeder C1-F2 (20 MW, status: ONLINE)
          └── Meter MTR-C1F2-001
```

**Associations:**
- `customer@powerapp.dev` → linked to `MTR-A1F1-001`
- `tech1@powerapp.dev` → assigned to Zone A
- `tech2@powerapp.dev` → assigned to Zone B
- `manager@powerapp.dev` → assigned to Zone A

**Grid Status (1 row):**
- Total Capacity: 295 MW
- Current Demand: 250 MW
- Deficit: 0 MW

### Update `backend/package.json`

Add `"prisma": { "seed": "ts-node prisma/seed.ts" }` to enable `npx prisma db seed`.

## Database Work

- Run `npx prisma db seed` to populate all tables

## API Work

None.

## Frontend Work

None.

## Pages

None.

## Components

None.

## User Journey

None (seed data enables testing all journeys in later phases).

## Security

- Seed passwords are for development only
- Never use seed passwords in production
- Add comment in seed script: "// DEVELOPMENT ONLY — change all passwords in production"

## Error Handling

- Seed script uses `upsert` to be idempotent (safe to re-run)
- Script logs progress for each entity type seeded

## Testing

- Verify seed completes without errors
- Verify all data is visible in Prisma Studio

## Documentation

- Document seed command in `backend/README.md`
- Document test account credentials

## Environment Variables

None new.

## Files Expected To Change

```
backend/prisma/seed.ts
backend/package.json (prisma seed config)
```

## Completion Criteria

- [ ] Seed script runs without errors: `npx prisma db seed`
- [ ] 6 users created with correct roles
- [ ] 3 zones created
- [ ] 5 substations created
- [ ] 12 feeders created (1 marked critical)
- [ ] 16 meters created
- [ ] 1 grid status row created
- [ ] Customer user linked to meter
- [ ] Technicians linked to zones
- [ ] Manager linked to zone
- [ ] Seed is idempotent (running twice doesn't create duplicates)

## Verification

1. `npx prisma db seed` → completes successfully
2. `npx prisma studio` → verify row counts in each table
3. Run seed again → no duplicate errors
4. Check User table: 6 rows, password_hash is not plaintext
5. Check Feeder table: 1 row has `is_critical: true`
6. Check Meter table: customer user's meter_id matches a meter record

## Output

A development database populated with realistic test data covering all entities and relationships.

**Commit:** `feat: add database seed script with test data`

---

# Phase 05 — Redis Cache Setup

## Objective

Configure and integrate Upstash Redis for caching published load-shedding schedules. Create a reusable cache service.

## Depends On

- Phase 02

## Why This Phase Exists

The requirements explicitly specify Redis caching for published schedules to protect PostgreSQL from read-heavy traffic during planned blackouts. This must be established before schedule publishing is implemented.

## Scope

**IN SCOPE:**
- Upstash Redis client configuration
- Cache service with get/set/delete/invalidate operations
- Connection verification at startup
- Cache key naming conventions

**OUT OF SCOPE:**
- Caching specific data (done in later phases when schedules are implemented)
- Any API routes

## Backend Work

### `backend/src/config/redis.ts`

- Import `@upstash/redis` (REST-based client)
- Initialize with `REDIS_URL` and `REDIS_TOKEN`
- Export client instance

### `backend/src/services/cache.service.ts`

Create a reusable cache service:

```typescript
class CacheService {
  // Set a value with optional TTL (seconds)
  async set(key: string, value: any, ttlSeconds?: number): Promise<void>

  // Get a value, return null if not found
  async get<T>(key: string): Promise<T | null>

  // Delete a specific key
  async delete(key: string): Promise<void>

  // Delete all keys matching a pattern
  async invalidatePattern(pattern: string): Promise<void>

  // Check if key exists
  async exists(key: string): Promise<boolean>
}
```

**Cache key conventions:**
- `schedule:active` — Currently active schedules
- `schedule:{scheduleId}` — Individual schedule details
- `schedule:feeder:{feederId}` — Schedule for a specific feeder
- `grid:status` — Current grid status

### Update `backend/src/index.ts`

- Verify Redis connectivity on startup (simple ping or set/get test)
- Log Redis connection status
- Do not crash if Redis is unavailable — log warning and continue (graceful degradation)

## Database Work

None.

## API Work

None.

## Frontend Work

None.

## Pages

None.

## Components

None.

## User Journey

None.

## Security

- Redis credentials must not be logged
- Cache keys should not contain sensitive user data

## Error Handling

- Redis failures should not crash the application
- Cache misses should fall back to database queries
- Log cache errors as warnings, not as fatal errors

## Testing

- Verify Redis connection on startup
- Manually test set/get/delete operations via a temporary test script

## Documentation

- Document Redis setup in `backend/README.md`

## Environment Variables

- `REDIS_URL` — now consumed
- `REDIS_TOKEN` — now consumed

## Files Expected To Change

```
backend/src/config/redis.ts
backend/src/services/cache.service.ts
backend/src/index.ts (updated)
```

## Completion Criteria

- [ ] Redis client initializes without errors
- [ ] Cache service `set` / `get` / `delete` operations work
- [ ] Server starts and logs Redis connection status
- [ ] Server does not crash if Redis is unavailable

## Verification

1. Start server → logs "Redis connected" or similar
2. Temporarily add a test in `index.ts`: set key, get key, delete key, verify results
3. Intentionally break `REDIS_URL` → server logs warning but still starts
4. Remove the temporary test

## Output

A configured Redis client and reusable cache service ready for schedule caching.

**Commit:** `feat: add Upstash Redis configuration and cache service`

---

# Phase 06 — Authentication Backend (Registration & Login)

## Objective

Implement the core authentication system: customer registration, login for all roles, JWT token generation, and authentication middleware.

## Depends On

- Phase 03 (database with User model)
- Phase 04 (seed data for testing)

## Why This Phase Exists

Authentication is a prerequisite for every protected endpoint. No role-specific features can be built without login functionality.

## Scope

**IN SCOPE:**
- Customer registration endpoint
- Login endpoint (all roles)
- JWT token generation and verification
- Authentication middleware
- Password hashing
- Request validation

**OUT OF SCOPE:**
- Role-based authorization middleware (Phase 07)
- Password reset (Phase 08)
- Frontend auth pages (Phase 12)
- NextAuth integration (Phase 12)

## Backend Work

### `backend/src/validators/auth.validator.ts`

**Registration schema (Zod):**
- `email`: string, email format, required, max 255 chars
- `password`: string, required, min 8 chars, must contain uppercase, lowercase, number
- `name`: string, required, min 2 chars, max 255 chars
- `phone`: string, optional, valid phone format
- `meterNumber`: string, optional, existing meter number

**Login schema (Zod):**
- `email`: string, email format, required
- `password`: string, required

### `backend/src/services/auth.service.ts`

**`register(data)`:**
1. Validate input against schema
2. Check if email already exists → 409 Conflict
3. If `meterNumber` provided, verify it exists in Meter table → 404 if not found
4. If `meterNumber` provided, verify no other user is already linked to it → 409 Conflict
5. Hash password with bcrypt (salt rounds: 12)
6. Create User with role `CUSTOMER`
7. If meterNumber provided, link user to meter (set `meter_id`)
8. Generate JWT token
9. Return user data (without password_hash) and token

**`login(data)`:**
1. Validate input against schema
2. Find user by email → 401 "Invalid credentials" if not found
3. Check `is_active` → 403 "Account deactivated" if false
4. Compare password with bcrypt → 401 "Invalid credentials" if mismatch
5. Generate JWT token containing: `{ userId, role, email }`
6. Return user data (without password_hash) and token

**`generateToken(user)`:**
- Sign JWT with `JWT_SECRET`
- Payload: `{ userId: user.id, role: user.role, email: user.email }`
- Expiry: from `JWT_EXPIRES_IN` env variable

**`verifyToken(token)`:**
- Verify JWT with `JWT_SECRET`
- Return decoded payload or throw

### `backend/src/middleware/auth.ts`

**`authenticate` middleware:**
1. Extract `Authorization` header
2. Verify it starts with `Bearer `
3. Extract token
4. Call `verifyToken(token)`
5. Query User from database by `userId` from token payload
6. If user not found or `is_active: false` → 401
7. Attach `req.user` with user object (id, role, email, name)
8. Call `next()`

### `backend/src/controllers/auth.controller.ts`

- `register` — calls `authService.register`, returns 201
- `login` — calls `authService.login`, returns 200

### `backend/src/routes/auth.routes.ts`

- `POST /api/auth/register` → `authController.register`
- `POST /api/auth/login` → `authController.login`

### `backend/src/middleware/validate.ts`

- Generic validation middleware that accepts a Zod schema
- Validates `req.body` against the schema
- Returns 422 with field-level errors if validation fails

### Update `backend/src/routes/index.ts`

- Create route aggregator
- Mount auth routes

### Update `backend/src/app.ts`

- Mount routes from route aggregator

## Database Work

None (User model already exists from Phase 03).

## API Work

### POST /api/auth/register

- **Purpose:** Register a new customer account
- **Authentication:** Public
- **Headers:** `Content-Type: application/json`
- **Request body:**
  ```json
  {
    "email": "user@example.com",
    "password": "SecurePass1",
    "name": "John Doe",
    "phone": "+8801712345678",
    "meterNumber": "MTR-A1F1-001"
  }
  ```
- **Validation:**
  - `email`: required, valid email, max 255
  - `password`: required, min 8, must have uppercase + lowercase + number
  - `name`: required, min 2, max 255
  - `phone`: optional, valid phone format
  - `meterNumber`: optional, must exist in database if provided
- **Business logic:** Only creates CUSTOMER role. Other roles are admin-created.
- **Success response (201):**
  ```json
  {
    "success": true,
    "message": "Registration successful",
    "data": {
      "user": {
        "id": "uuid",
        "email": "user@example.com",
        "name": "John Doe",
        "role": "CUSTOMER",
        "phone": "+8801712345678",
        "meterId": "uuid"
      },
      "token": "jwt-token-string"
    }
  }
  ```
- **Error cases:**
  - 422: Validation errors (missing fields, weak password, invalid email)
  - 409: Email already registered
  - 409: Meter already linked to another user
  - 404: Meter number not found (if provided)
  - 500: Internal server error

### POST /api/auth/login

- **Purpose:** Authenticate any user and return JWT token
- **Authentication:** Public
- **Headers:** `Content-Type: application/json`
- **Request body:**
  ```json
  {
    "email": "user@example.com",
    "password": "SecurePass1"
  }
  ```
- **Validation:**
  - `email`: required, valid email
  - `password`: required
- **Business logic:** Works for all roles. Returns role in response so frontend can redirect appropriately.
- **Success response (200):**
  ```json
  {
    "success": true,
    "message": "Login successful",
    "data": {
      "user": {
        "id": "uuid",
        "email": "user@example.com",
        "name": "John Doe",
        "role": "CUSTOMER",
        "phone": "+8801712345678"
      },
      "token": "jwt-token-string"
    }
  }
  ```
- **Error cases:**
  - 422: Validation errors
  - 401: Invalid credentials (wrong email or password — same message for both)
  - 403: Account deactivated
  - 500: Internal server error
- **Database interaction:** Read from User table

## Frontend Work

None.

## Pages

None.

## Components

None.

## User Journey

This phase enables:
- Customer: self-registration and login
- All roles: login with admin-provisioned credentials

## Security

- Passwords hashed with bcrypt (12 salt rounds)
- JWT secret from environment variable
- Login does not reveal whether email exists (same error for wrong email/password)
- Rate limiting on auth routes: 10 requests per 15 minutes per IP

## Error Handling

- 422 for validation failures with field-level detail
- 409 for duplicate email
- 401 for wrong credentials (generic message)
- 403 for deactivated accounts

## Testing

- Register with valid data → 201
- Register with existing email → 409
- Register with invalid email → 422
- Register with weak password → 422
- Register with non-existent meter → 404
- Login with valid credentials → 200
- Login with wrong password → 401
- Login with non-existent email → 401
- Login with deactivated account → 403
- Access protected endpoint without token → 401
- Access protected endpoint with invalid token → 401
- Access protected endpoint with valid token → success

## Documentation

- Document auth endpoints in `backend/README.md`

## Environment Variables

- `JWT_SECRET` — now consumed
- `JWT_EXPIRES_IN` — now consumed

## Files Expected To Change

```
backend/src/validators/auth.validator.ts
backend/src/services/auth.service.ts
backend/src/controllers/auth.controller.ts
backend/src/routes/auth.routes.ts
backend/src/routes/index.ts
backend/src/middleware/auth.ts
backend/src/middleware/validate.ts
backend/src/app.ts (mount routes)
```

## Completion Criteria

- [ ] Registration endpoint creates user with hashed password
- [ ] Registration rejects duplicate emails with 409
- [ ] Registration validates all fields
- [ ] Login returns JWT token for valid credentials
- [ ] Login rejects invalid credentials with 401
- [ ] Login rejects deactivated accounts with 403
- [ ] JWT contains userId, role, email
- [ ] Authentication middleware extracts and verifies token
- [ ] Authentication middleware attaches user to request
- [ ] Rate limiting applied to auth routes

## Verification

1. `POST /api/auth/register` with valid data → 201, user in database
2. `POST /api/auth/register` with same email → 409
3. `POST /api/auth/login` with `admin@powerapp.dev` / `Admin@123` → 200 + token
4. `POST /api/auth/login` with wrong password → 401
5. `GET /api/health` with `Authorization: Bearer <token>` → still works (public)
6. Check database: new user has hashed password, not plaintext
7. Verify token decodes with correct payload using jwt.io or similar

## Output

A working authentication system with registration, login, JWT tokens, and auth middleware.

**Commit:** `feat: implement authentication with registration, login, and JWT`

---

# Phase 07 — Authorization Middleware (RBAC)

## Objective

Implement role-based access control middleware that restricts endpoints by user role.

## Depends On

- Phase 06

## Why This Phase Exists

Different user roles have different permissions. Without RBAC middleware, all authenticated users can access all endpoints, which is a security violation.

## Scope

**IN SCOPE:**
- RBAC middleware factory function
- Role hierarchy definition
- Applying RBAC to test route

**OUT OF SCOPE:**
- Applying RBAC to all routes (done as each route is created)
- Frontend route guards (Phase 12)

## Backend Work

### `backend/src/middleware/rbac.ts`

**`authorize(...roles: Role[])` middleware factory:**
1. Returns Express middleware
2. Checks if `req.user` exists (must be after `authenticate`)
3. Checks if `req.user.role` is in the allowed `roles` array
4. If not → 403 Forbidden: "You do not have permission to access this resource"
5. If yes → `next()`

**Usage example:**
```typescript
router.get('/admin/users', authenticate, authorize('ADMIN'), controller.getUsers);
router.get('/operator/dashboard', authenticate, authorize('OPERATOR', 'ADMIN'), controller.getDashboard);
```

### Create test protected route

Add temporary test routes to verify RBAC:
- `GET /api/auth/me` — `authenticate` only → returns current user
- `GET /api/test/admin-only` — `authenticate` + `authorize('ADMIN')` → returns "Admin access granted"

## Database Work

None.

## API Work

### GET /api/auth/me

- **Purpose:** Return current authenticated user's profile
- **Authentication:** Authenticated (any role)
- **Headers:** `Authorization: Bearer <token>`
- **Response (200):**
  ```json
  {
    "success": true,
    "data": {
      "id": "uuid",
      "email": "...",
      "name": "...",
      "role": "...",
      "phone": "...",
      "isActive": true,
      "createdAt": "..."
    }
  }
  ```
- **Error cases:** 401 Unauthorized

## Frontend Work

None.

## Pages

None.

## Components

None.

## User Journey

N/A — infrastructure phase.

## Security

- Roles checked on every protected request
- No role escalation possible
- Error messages do not reveal which roles are required

## Error Handling

- Missing authentication → 401
- Wrong role → 403
- Clear error messages for debugging in development

## Testing

- Admin token → admin-only route → 200
- Customer token → admin-only route → 403
- Operator token → admin-only route → 403
- Any valid token → `/api/auth/me` → 200

## Documentation

- Document RBAC usage pattern in code comments

## Environment Variables

None new.

## Files Expected To Change

```
backend/src/middleware/rbac.ts
backend/src/routes/auth.routes.ts (add /me)
backend/src/controllers/auth.controller.ts (add getMe)
```

## Completion Criteria

- [ ] `authorize()` middleware rejects unauthorized roles with 403
- [ ] `authorize()` middleware allows authorized roles
- [ ] `GET /api/auth/me` returns current user
- [ ] Multiple roles can be specified: `authorize('ADMIN', 'OPERATOR')`

## Verification

1. Login as admin → `GET /api/test/admin-only` → 200
2. Login as customer → `GET /api/test/admin-only` → 403
3. Login as any user → `GET /api/auth/me` → 200 with user data
4. No token → `GET /api/auth/me` → 401

## Output

A reusable RBAC middleware ready to protect all future endpoints.

**Commit:** `feat: implement role-based access control middleware`

---

# Phase 08 — User Profile & Password Management APIs

## Objective

Implement user profile viewing, updating, and password change endpoints.

## Depends On

- Phase 07

## Why This Phase Exists

Users need to manage their profiles and security settings. This is foundational for all role-specific features.

## Scope

**IN SCOPE:**
- Get own profile
- Update own profile
- Change password
- Admin: update any user's profile (for user management)

**OUT OF SCOPE:**
- Forgot password / reset via email (documented as stretch goal — Twilio is for SMS, no email service specified)
- User CRUD by admin (Phase 09)

## Backend Work

### `backend/src/validators/user.validator.ts`

**Update profile schema:**
- `name`: optional, string, min 2, max 255
- `phone`: optional, valid phone format
- `meterNumber`: optional, existing meter number

**Change password schema:**
- `currentPassword`: required, string
- `newPassword`: required, string, min 8, uppercase + lowercase + number
- `confirmPassword`: required, must match `newPassword`

### `backend/src/services/user.service.ts`

**`getProfile(userId)`:**
- Fetch user by ID with related meter, zone data
- Exclude `password_hash`
- Include feeder/zone info for context

**`updateProfile(userId, data)`:**
- Update allowed fields only (name, phone, meterNumber)
- If meterNumber changes, validate new meter exists and isn't taken
- Return updated user

**`changePassword(userId, currentPassword, newPassword)`:**
- Verify current password → 401 if wrong
- Hash new password
- Update in database
- Return success

### `backend/src/controllers/user.controller.ts`

- `getProfile` — GET own profile
- `updateProfile` — PATCH own profile
- `changePassword` — POST change password

### `backend/src/routes/user.routes.ts`

- `GET /api/users/profile` → authenticate → getProfile
- `PATCH /api/users/profile` → authenticate, validate → updateProfile
- `POST /api/users/change-password` → authenticate, validate → changePassword

## API Work

### GET /api/users/profile

- **Purpose:** Get current user's full profile
- **Authentication:** Authenticated (any role)
- **Headers:** `Authorization: Bearer <token>`
- **Response (200):**
  ```json
  {
    "success": true,
    "data": {
      "id": "uuid",
      "email": "...",
      "name": "...",
      "role": "CUSTOMER",
      "phone": "...",
      "isActive": true,
      "meter": {
        "id": "uuid",
        "meterNumber": "MTR-A1F1-001",
        "feeder": {
          "id": "uuid",
          "name": "Feeder A1-F1",
          "status": "ONLINE",
          "substation": {
            "zone": { "id": "uuid", "name": "Zone A" }
          }
        }
      },
      "zone": { "id": "uuid", "name": "Zone A" },
      "createdAt": "..."
    }
  }
  ```
- **Error cases:** 401

### PATCH /api/users/profile

- **Purpose:** Update current user's profile
- **Authentication:** Authenticated (any role)
- **Headers:** `Authorization: Bearer <token>`, `Content-Type: application/json`
- **Request body:**
  ```json
  {
    "name": "Updated Name",
    "phone": "+8801700000000",
    "meterNumber": "MTR-A1F1-002"
  }
  ```
- **Validation:** All fields optional, validated if present
- **Success response (200):** Updated user object
- **Error cases:** 401, 409 (meter taken), 404 (meter not found), 422

### POST /api/users/change-password

- **Purpose:** Change current user's password
- **Authentication:** Authenticated (any role)
- **Headers:** `Authorization: Bearer <token>`, `Content-Type: application/json`
- **Request body:**
  ```json
  {
    "currentPassword": "OldPass1",
    "newPassword": "NewPass1",
    "confirmPassword": "NewPass1"
  }
  ```
- **Validation:** All required, newPassword strength rules, confirm must match
- **Success response (200):** `{ "success": true, "message": "Password changed successfully" }`
- **Error cases:** 401 (wrong current password), 422 (validation)

## Frontend Work

None.

## Pages

None.

## Components

None.

## User Journey

All roles can manage their profiles and change passwords.

## Security

- Users can only access their own profile
- Current password required for password change
- New password must meet strength requirements

## Error Handling

- Wrong current password → 401
- Meter conflicts → 409
- Validation failures → 422

## Testing

- Get profile → returns correct data without password_hash
- Update name → name changes
- Update meter → meter association changes
- Change password with correct current → success
- Change password with wrong current → 401
- Login with new password → success

## Environment Variables

None new.

## Files Expected To Change

```
backend/src/validators/user.validator.ts
backend/src/services/user.service.ts
backend/src/controllers/user.controller.ts
backend/src/routes/user.routes.ts
backend/src/routes/index.ts (mount user routes)
```

## Completion Criteria

- [ ] GET profile returns user data without password_hash
- [ ] PATCH profile updates name, phone, meter
- [ ] Change password works with correct current password
- [ ] Change password fails with incorrect current password
- [ ] Meter validation enforced on update

## Verification

1. Login → `GET /api/users/profile` → full profile with meter/zone data
2. `PATCH /api/users/profile` with `{ "name": "New Name" }` → 200
3. `POST /api/users/change-password` with correct current → 200
4. Login with new password → success
5. `POST /api/users/change-password` with wrong current → 401

## Output

Working user profile management for all roles.

**Commit:** `feat: implement user profile and password management APIs`

---

# Phase 09 — Admin User Management APIs

## Objective

Implement admin-only endpoints for creating, viewing, updating, and deactivating user accounts of all roles.

## Depends On

- Phase 07 (RBAC middleware)
- Phase 08 (user service foundation)

## Why This Phase Exists

The requirements specify that Operators, Technicians, Zone Managers, and additional Admins are created by the Admin role. Customers self-register, but admins also need to manage all accounts.

## Scope

**IN SCOPE:**
- List all users with filtering/pagination
- Get user by ID
- Create user (any role)
- Update user (role, zone assignment, activation)
- Deactivate / reactivate user
- All admin-only

**OUT OF SCOPE:**
- Hard-deleting users (soft-delete via `is_active`)
- User self-registration (Phase 06)

## Backend Work

### `backend/src/validators/admin.validator.ts`

**Create user schema:**
- `email`: required, email format
- `password`: required, strong password
- `name`: required, min 2
- `role`: required, one of CUSTOMER, OPERATOR, TECHNICIAN, ZONE_MANAGER, ADMIN
- `phone`: optional
- `zoneId`: required if role is TECHNICIAN or ZONE_MANAGER
- `meterNumber`: optional, only for CUSTOMER

**Update user schema:**
- `name`: optional
- `phone`: optional
- `role`: optional, one of the role enums
- `zoneId`: optional
- `isActive`: optional, boolean

**List users query params schema:**
- `page`: optional, integer, min 1, default 1
- `limit`: optional, integer, min 1, max 100, default 20
- `role`: optional, filter by role
- `search`: optional, search by name or email
- `isActive`: optional, filter by active status

### `backend/src/services/admin.service.ts`

**`createUser(data)`:**
1. Check email uniqueness → 409
2. Validate zone exists if zoneId provided
3. Validate meter exists if meterNumber provided
4. Hash password
5. Create user with specified role
6. Return user data (no password_hash)

**`listUsers(filters)`:**
1. Build Prisma query with filters (role, search, isActive)
2. Apply pagination
3. Return paginated list with total count

**`getUserById(id)`:**
1. Fetch user by ID with relations (zone, meter)
2. 404 if not found
3. Return user data

**`updateUser(id, data)`:**
1. Fetch user → 404
2. If role changes, validate zone assignment
3. Update fields
4. Return updated user

**`toggleUserStatus(id, isActive)`:**
1. Fetch user → 404
2. Prevent deactivating self
3. Update `is_active`
4. Return updated user

### `backend/src/controllers/admin.controller.ts`

### `backend/src/routes/admin.routes.ts`

All routes: `authenticate` + `authorize('ADMIN')`

## API Work

### GET /api/admin/users

- **Purpose:** List all users with filtering and pagination
- **Authentication:** Admin only
- **Query parameters:** `page`, `limit`, `role`, `search`, `isActive`
- **Success response (200):**
  ```json
  {
    "success": true,
    "data": {
      "users": [ ... ],
      "pagination": {
        "page": 1,
        "limit": 20,
        "total": 45,
        "totalPages": 3
      }
    }
  }
  ```
- **Error cases:** 401, 403

### GET /api/admin/users/:id

- **Purpose:** Get user details by ID
- **Authentication:** Admin only
- **Path parameters:** `id` (UUID)
- **Success response (200):** User object with relations
- **Error cases:** 401, 403, 404

### POST /api/admin/users

- **Purpose:** Create a new user with any role
- **Authentication:** Admin only
- **Request body:** As defined in validator
- **Success response (201):** Created user object
- **Error cases:** 401, 403, 409 (duplicate email), 422

### PATCH /api/admin/users/:id

- **Purpose:** Update user details
- **Authentication:** Admin only
- **Request body:** Partial user data
- **Success response (200):** Updated user object
- **Error cases:** 401, 403, 404, 422

### PATCH /api/admin/users/:id/status

- **Purpose:** Activate or deactivate a user account
- **Authentication:** Admin only
- **Request body:** `{ "isActive": false }`
- **Business logic:** Cannot deactivate own account
- **Success response (200):** Updated user
- **Error cases:** 401, 403, 404, 400 (self-deactivation)

## Frontend Work

None.

## Pages

None.

## Components

None.

## User Journey

Admin → User Management: create accounts, assign roles, deactivate users.

## Security

- All endpoints admin-only
- Cannot deactivate own account (prevents lockout)
- Password always hashed before storage

## Error Handling

- 404 for user not found
- 409 for duplicate email
- 400 for self-deactivation attempt
- 422 for validation failures

## Testing

- Create user as admin → 201
- Create user as non-admin → 403
- Create user with duplicate email → 409
- List users with role filter → correct results
- Deactivate user → `is_active: false`
- Deactivate self → 400

## Environment Variables

None new.

## Files Expected To Change

```
backend/src/validators/admin.validator.ts
backend/src/services/admin.service.ts
backend/src/controllers/admin.controller.ts
backend/src/routes/admin.routes.ts
backend/src/routes/index.ts (mount admin routes)
backend/src/utils/pagination.ts
```

## Completion Criteria

- [ ] Admin can create users of any role
- [ ] Admin can list users with filtering and pagination
- [ ] Admin can view individual user details
- [ ] Admin can update user information
- [ ] Admin can deactivate/reactivate accounts
- [ ] Non-admin users get 403 on all admin endpoints
- [ ] Duplicate email prevented
- [ ] Self-deactivation prevented

## Verification

1. Login as admin → `POST /api/admin/users` with operator data → 201
2. Login as customer → `POST /api/admin/users` → 403
3. `GET /api/admin/users?role=TECHNICIAN` → filtered results
4. `PATCH /api/admin/users/:id/status` with `{ "isActive": false }` → user deactivated
5. Login as deactivated user → 403
6. `PATCH /api/admin/users/:adminId/status` with `{ "isActive": false }` → 400

## Output

Complete admin user management system.

**Commit:** `feat: implement admin user management APIs`

---

# Phase 10 — Grid Infrastructure Management APIs (Zones, Substations, Feeders, Meters)

## Objective

Implement CRUD APIs for managing the grid infrastructure hierarchy: Zones → Substations → Feeders → Meters.

## Depends On

- Phase 07 (RBAC)
- Phase 03 (database models)

## Why This Phase Exists

The grid infrastructure is the backbone of the entire system. Schedules, faults, and customer associations all depend on the zone/substation/feeder/meter hierarchy.

## Scope

**IN SCOPE:**
- CRUD for Zones (Admin only)
- CRUD for Substations (Admin only)
- CRUD for Feeders (Admin only, including critical flag)
- CRUD for Meters (Admin only)
- Read-only access for other roles where needed
- Hierarchical queries (get feeders by substation, meters by feeder)

**OUT OF SCOPE:**
- Feeder status changes (handled by schedule/fault logic)
- Grid status management (Phase 16)

## Backend Work

### Validators

**Zone validator:**
- `name`: required, min 2, max 255
- `code`: required, min 2, max 50, alphanumeric with hyphens
- `description`: optional, max 1000

**Substation validator:**
- `name`: required
- `code`: required, unique
- `zoneId`: required, valid UUID, must exist
- `capacityMw`: required, number, min 0.01

**Feeder validator:**
- `name`: required
- `code`: required, unique
- `substationId`: required, valid UUID, must exist
- `capacityMw`: required, number, min 0.01
- `isCritical`: optional, boolean, default false

**Meter validator:**
- `meterNumber`: required, unique
- `feederId`: required, valid UUID, must exist
- `address`: optional, max 500

### Services

Create `zone.service.ts`, `substation.service.ts`, `feeder.service.ts`, `meter.service.ts` with:
- `create(data)` — Create entity, validate foreign keys
- `list(filters)` — Paginated list with filters and includes
- `getById(id)` — Single entity with relations
- `update(id, data)` — Update entity
- `delete(id)` — Soft-delete (set `is_active: false`) or hard-delete if no dependent records

### Controllers and Routes

Create controllers and routes for each entity.

## API Work

### Zone APIs

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | /api/zones | Auth (any) | List all zones |
| GET | /api/zones/:id | Auth (any) | Get zone with substations |
| POST | /api/zones | Admin | Create zone |
| PATCH | /api/zones/:id | Admin | Update zone |
| DELETE | /api/zones/:id | Admin | Delete zone |

### Substation APIs

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | /api/substations | Auth (any) | List substations (filterable by zoneId) |
| GET | /api/substations/:id | Auth (any) | Get substation with feeders |
| POST | /api/substations | Admin | Create substation |
| PATCH | /api/substations/:id | Admin | Update substation |
| DELETE | /api/substations/:id | Admin | Delete substation |

### Feeder APIs

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | /api/feeders | Auth (any) | List feeders (filterable by substationId, zoneId, status) |
| GET | /api/feeders/:id | Auth (any) | Get feeder with meters and current status |
| POST | /api/feeders | Admin | Create feeder |
| PATCH | /api/feeders/:id | Admin | Update feeder (including critical flag) |
| DELETE | /api/feeders/:id | Admin | Delete feeder |

### Meter APIs

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | /api/meters | Auth (any) | List meters (filterable by feederId) |
| GET | /api/meters/:id | Auth (any) | Get meter with feeder/zone info |
| POST | /api/meters | Admin | Create meter |
| PATCH | /api/meters/:id | Admin | Update meter |
| DELETE | /api/meters/:id | Admin | Delete meter |

**For each endpoint, full request/response specifications follow the patterns established in Phase 06 and 09. Key details:**

- All list endpoints support pagination (`page`, `limit`) and sorting
- GET endpoints include relational data (zone includes substations count, substation includes feeders count, etc.)
- DELETE validates no active dependent records exist (cannot delete zone with active substations)
- Feeder GET includes current status badge data

## Frontend Work

None.

## User Journey

Admin → Grid Management → Add zones, substations, feeders, meters.

## Security

- Write operations: Admin only
- Read operations: Any authenticated user
- Cascading delete protection (cannot delete zone with child substations that have child feeders)

## Error Handling

- 404: Entity not found
- 409: Duplicate code/meter_number
- 400: Cannot delete entity with active dependents
- 422: Validation errors

## Testing

- CRUD for each entity type
- Hierarchical queries (feeders by zone)
- Delete protection (zone with substations)
- Duplicate code rejection
- Non-admin write rejection

## Documentation

Document all grid infrastructure endpoints.

## Environment Variables

None new.

## Files Expected To Change

```
backend/src/validators/zone.validator.ts
backend/src/validators/substation.validator.ts
backend/src/validators/feeder.validator.ts
backend/src/validators/meter.validator.ts
backend/src/services/zone.service.ts
backend/src/services/substation.service.ts
backend/src/services/feeder.service.ts
backend/src/services/meter.service.ts
backend/src/controllers/zone.controller.ts
backend/src/controllers/substation.controller.ts
backend/src/controllers/feeder.controller.ts
backend/src/controllers/meter.controller.ts
backend/src/routes/zone.routes.ts
backend/src/routes/substation.routes.ts
backend/src/routes/feeder.routes.ts
backend/src/routes/meter.routes.ts
backend/src/routes/index.ts (mount all)
```

## Completion Criteria

- [ ] CRUD operations work for Zones, Substations, Feeders, Meters
- [ ] Hierarchical queries work (feeders by substation, substations by zone)
- [ ] Critical feeders can be flagged
- [ ] Duplicate codes/meter numbers are rejected
- [ ] Delete protection for entities with children
- [ ] Non-admin users cannot create/update/delete
- [ ] Pagination works on all list endpoints

## Verification

1. Create Zone → Create Substation in Zone → Create Feeder in Substation → Create Meter in Feeder
2. GET zone with `include=substations` → includes substations
3. Try to delete zone with substations → 400
4. Mark feeder as critical → verify `isCritical: true`
5. Non-admin POST → 403
6. Duplicate feeder code → 409

## Output

Complete grid infrastructure management API.

**Commit:** `feat: implement grid infrastructure CRUD APIs`

---

# Phase 11 — Audit Logging Service

## Objective

Implement an audit logging service that records important system actions for accountability and debugging.

## Depends On

- Phase 07 (RBAC — user context)
- Phase 03 (AuditLog model)

## Why This Phase Exists

Audit logs track who did what and when, essential for a utility management system where actions have real-world consequences.

## Scope

**IN SCOPE:**
- Audit log service (create log entries)
- Integration points for existing services (auth, admin, grid)
- Admin API to view audit logs

**OUT OF SCOPE:**
- Log rotation / archival
- Real-time audit streaming

## Backend Work

### `backend/src/services/audit.service.ts`

```typescript
class AuditService {
  async log(params: {
    userId?: string;
    action: string;
    entityType: string;
    entityId: string;
    details?: object;
    ipAddress?: string;
  }): Promise<void>

  async getAuditLogs(filters: {
    userId?: string;
    action?: string;
    entityType?: string;
    entityId?: string;
    startDate?: Date;
    endDate?: Date;
    page: number;
    limit: number;
  }): Promise<PaginatedResult<AuditLog>>
}
```

**Actions to log:**
- `USER_REGISTERED`, `USER_LOGIN`, `USER_LOGIN_FAILED`
- `USER_CREATED`, `USER_UPDATED`, `USER_DEACTIVATED`, `USER_REACTIVATED`
- `ZONE_CREATED`, `ZONE_UPDATED`, `ZONE_DELETED`
- `SUBSTATION_CREATED`, `SUBSTATION_UPDATED`, `SUBSTATION_DELETED`
- `FEEDER_CREATED`, `FEEDER_UPDATED`, `FEEDER_DELETED`
- `METER_CREATED`, `METER_UPDATED`, `METER_DELETED`
- (More actions added in subsequent phases)

### Integrate into existing services

Add `auditService.log()` calls into:
- `auth.service.ts` — login, registration
- `admin.service.ts` — user CRUD
- Zone, Substation, Feeder, Meter services — CRUD operations

### `GET /api/admin/audit-logs`

- **Purpose:** View audit trail
- **Authentication:** Admin only
- **Query params:** `page`, `limit`, `userId`, `action`, `entityType`, `startDate`, `endDate`
- **Response:** Paginated list of audit log entries with user name/email

## Frontend Work

None.

## Completion Criteria

- [ ] Audit log entries created for all existing CRUD operations
- [ ] Admin can query audit logs with filters
- [ ] Logs include user, action, entity, timestamp

## Verification

1. Login as admin → check `GET /api/admin/audit-logs` → see login entry
2. Create a zone → check audit log → see ZONE_CREATED entry
3. Filter by action → correct results

## Output

Working audit trail system.

**Commit:** `feat: implement audit logging service`

---

# Phase 12 — Frontend Initialization & Authentication Pages

## Objective

Initialize the Next.js frontend application with Tailwind CSS, Shadcn UI, NextAuth configuration, and create authentication pages (login, registration).

## Depends On

- Phase 06 (backend auth APIs)
- Phase 07 (RBAC)

## Why This Phase Exists

The frontend is the primary interface for all users. Authentication pages are the entry point for every user journey.

## Scope

**IN SCOPE:**
- Initialize Next.js project with App Router
- Configure Tailwind CSS
- Install and configure Shadcn UI
- Configure NextAuth with credentials provider
- Create Login page
- Create Registration page (customer only)
- Create public layout
- Create API client utility
- Role-based redirect after login

**OUT OF SCOPE:**
- Dashboard pages (subsequent phases)
- Role-specific layouts (subsequent phases)

## Frontend Work

### Project Initialization

1. Initialize Next.js project in `frontend/` directory:
   - App Router
   - TypeScript
   - Tailwind CSS
   - src/ directory
   - ESLint

2. Install additional dependencies:
   - `next-auth` — Authentication
   - `axios` — API client
   - `zod` — Form validation
   - `react-hook-form` — Form handling
   - `@hookform/resolvers` — Zod resolver for react-hook-form
   - `socket.io-client` — WebSocket client
   - `lucide-react` — Icons
   - `date-fns` — Date formatting
   - `recharts` — Charts (for analytics in later phases)

3. Initialize Shadcn UI:
   - Run `npx shadcn-ui@latest init`
   - Install components: Button, Input, Label, Card, Form, Toast, Dialog, Table, Badge, Select, Dropdown Menu, Avatar, Sheet, Separator, Skeleton, Tabs, Alert

### Design System

**`frontend/src/app/globals.css`:**
- Dark mode as default theme
- Color palette: Deep indigo/slate dark backgrounds, electric blue/cyan accents, warm amber for warnings, emerald for success, rose for errors
- Custom CSS variables for the color system
- Smooth transitions globally

**Typography:**
- Import Google Font: Inter (400, 500, 600, 700)
- Apply as default font

### API Client

**`frontend/src/lib/api.ts`:**
- Create Axios instance with `NEXT_PUBLIC_API_URL` as base URL
- Request interceptor: attach JWT token from session/localStorage
- Response interceptor: handle 401 → redirect to login
- Type-safe response handler

### NextAuth Configuration

**`frontend/src/lib/auth.ts`:**
- Credentials provider that calls `POST /api/auth/login`
- Session callback includes user role, id, and token
- JWT callback stores backend JWT token
- Redirect based on role after login:
  - CUSTOMER → `/customer/dashboard`
  - OPERATOR → `/operator/dashboard`
  - TECHNICIAN → `/technician/dashboard`
  - ZONE_MANAGER → `/manager/dashboard`
  - ADMIN → `/admin/dashboard`

**`frontend/src/app/api/auth/[...nextauth]/route.ts`:**
- Export NextAuth route handler

### Auth Pages

**`frontend/src/app/(auth)/login/page.tsx`:**
- Route: `/login`
- Access: Public (redirect if already logged in)
- **Layout:**
  - Split screen on desktop: Left = branding + illustration, Right = login form
  - Full-width form on mobile
  - Dark theme with gradient background
- **Form fields:**
  - Email: required, email validation
  - Password: required, show/hide toggle
  - "Remember me" checkbox
  - Submit button with loading state
- **Behavior:**
  - On submit → call NextAuth `signIn('credentials', ...)`
  - On success → redirect based on role
  - On error → display error toast
  - Link to registration page
- **States:** default, loading, error, success (redirect)
- **Components used:** Card, Input, Label, Button, Form, Toast

**`frontend/src/app/(auth)/register/page.tsx`:**
- Route: `/register`
- Access: Public
- **Layout:** Same split-screen as login
- **Form fields:**
  - Name: required, min 2 chars
  - Email: required, email format
  - Phone: optional, phone format hint
  - Password: required, min 8, strength indicator
  - Confirm Password: required, must match
  - Meter Number: optional, with helper text explaining what it is
- **Behavior:**
  - On submit → call `POST /api/auth/register` via API client
  - On success → auto-login and redirect to customer dashboard
  - On error → display specific field errors
  - Link to login page
- **Validation:** Client-side (react-hook-form + Zod) mirrors backend validation
- **Components used:** Card, Input, Label, Button, Form, Toast

### Root Layout

**`frontend/src/app/layout.tsx`:**
- NextAuth SessionProvider wrapper
- Toast provider (Shadcn Toaster)
- Global font (Inter)
- Dark mode class on HTML element

### Public Layout

**`frontend/src/app/(auth)/layout.tsx`:**
- Centered layout for auth pages
- Redirect if already authenticated

### Shared Components (initial)

**`frontend/src/components/common/LoadingSpinner.tsx`:**
- Animated spinner with configurable size

**`frontend/src/components/common/PageHeader.tsx`:**
- Reusable page header with title, description, and optional actions

## Backend Work

None.

## Database Work

None.

## API Work (consumed)

- `POST /api/auth/register` (from Phase 06)
- `POST /api/auth/login` (from Phase 06)

## Pages

| Route | Access | Purpose |
|---|---|---|
| `/login` | Public | User login |
| `/register` | Public | Customer registration |

## Components

- LoginForm
- RegisterForm
- LoadingSpinner
- PageHeader
- PublicLayout

## User Journey

```
User opens app → Sees login page
    → (New customer) Click "Register" → Fill form → Submit → Auto-login → Dashboard
    → (Existing user) Enter credentials → Submit → Role-based redirect to dashboard
```

## Security

- Passwords never stored in frontend
- JWT stored in NextAuth session (httpOnly cookie)
- CSRF protection via NextAuth
- Input sanitization on forms

## Error Handling

- Invalid credentials → "Invalid email or password" toast
- Network error → "Unable to connect to server" toast
- Validation errors → Inline field-level errors
- Already logged in → redirect to dashboard

## Testing

- Register with valid data → success → redirect
- Register with existing email → error message
- Login with valid credentials → redirect to correct dashboard based on role
- Login with invalid credentials → error toast
- Visit login while authenticated → redirect to dashboard
- Form validation → inline errors for each invalid field

## Documentation

- Update `frontend/README.md` with setup and run instructions

## Environment Variables

- `NEXT_PUBLIC_API_URL` — now consumed
- `NEXTAUTH_URL` — now consumed
- `NEXTAUTH_SECRET` — now consumed

## Files Expected To Change

```
frontend/ (entire Next.js project initialized)
frontend/src/app/layout.tsx
frontend/src/app/globals.css
frontend/src/app/(auth)/layout.tsx
frontend/src/app/(auth)/login/page.tsx
frontend/src/app/(auth)/register/page.tsx
frontend/src/app/api/auth/[...nextauth]/route.ts
frontend/src/lib/api.ts
frontend/src/lib/auth.ts
frontend/src/lib/validations.ts
frontend/src/components/common/LoadingSpinner.tsx
frontend/src/components/common/PageHeader.tsx
frontend/src/components/forms/LoginForm.tsx
frontend/src/components/forms/RegisterForm.tsx
```

## Completion Criteria

- [ ] Next.js project runs with `npm run dev`
- [ ] Tailwind CSS is configured and working
- [ ] Shadcn UI components are installed
- [ ] Login page renders correctly
- [ ] Registration page renders correctly
- [ ] Login with valid credentials redirects to correct dashboard (route exists, page may be stub)
- [ ] Registration creates account and auto-logs in
- [ ] Validation errors display inline
- [ ] Auth errors display as toasts
- [ ] Dark theme applied
- [ ] Responsive on mobile/tablet/desktop

## Verification

1. `cd frontend && npm run dev` → starts on port 3000
2. Visit `http://localhost:3000/login` → login page renders
3. Visit `http://localhost:3000/register` → register page renders
4. Register new customer → redirects to `/customer/dashboard` (404 is OK at this point — just verify redirect)
5. Login as admin → redirects to `/admin/dashboard`
6. Login as operator → redirects to `/operator/dashboard`
7. Resize browser → responsive layout adjusts
8. Submit empty form → validation errors appear inline

## Output

A functional Next.js frontend with authentication pages and NextAuth integration.

**Commit:** `feat: initialize frontend with auth pages and NextAuth`

---

# Phase 13 — Frontend Route Protection & Role-Based Layouts

## Objective

Implement middleware/guards to protect routes based on authentication and role. Create role-specific sidebar layouts for each portal.

## Depends On

- Phase 12

## Why This Phase Exists

Each user role has different accessible pages. Without route protection, any user could access any page. Without layouts, each portal would need to duplicate navigation structure.

## Scope

**IN SCOPE:**
- Next.js middleware for route protection
- Role-based layout components with sidebars
- Navigation items per role
- User avatar/dropdown in header
- Logout functionality
- Mobile-responsive navigation
- Placeholder dashboard pages for each role

**OUT OF SCOPE:**
- Dashboard content (subsequent phases)
- Real data on dashboards

## Frontend Work

### Middleware

**`frontend/src/middleware.ts`:**
- Intercept all requests
- Public routes: `/`, `/login`, `/register`, `/forgot-password`
- Protected routes: all others
- If not authenticated → redirect to `/login`
- If authenticated but wrong role for route prefix:
  - `/customer/*` → CUSTOMER only
  - `/operator/*` → OPERATOR only
  - `/technician/*` → TECHNICIAN only
  - `/manager/*` → ZONE_MANAGER only
  - `/admin/*` → ADMIN only
- If wrong role → redirect to own dashboard

### Role-Based Layouts

**Each layout includes:**
- Collapsible sidebar (desktop: always visible, mobile: sheet/drawer)
- Header with: app logo, search (optional), notifications icon, user avatar + dropdown
- Main content area
- User dropdown: profile link, logout

**Sidebar Navigation Items:**

**Customer:**
- Dashboard (`/customer/dashboard`)
- My Schedule (`/customer/schedule`)
- Report Outage (`/customer/report-outage`)
- My Reports (`/customer/my-reports`)
- Profile (`/customer/profile`)

**Operator:**
- Dashboard (`/operator/dashboard`)
- Generate Plan (`/operator/generate-plan`)
- Schedules (`/operator/schedules`)

**Technician:**
- Dashboard (`/technician/dashboard`)
- My Tickets (`/technician/tickets`)
- History (`/technician/history`)

**Zone Manager:**
- Dashboard (`/manager/dashboard`)
- Grid Status (`/manager/grid-status`)
- Analytics (`/manager/analytics`)
- Infrastructure Requests (`/manager/infrastructure-requests`)

**Admin:**
- Dashboard (`/admin/dashboard`)
- Users (`/admin/users`)
- Zones (`/admin/zones`)
- Substations (`/admin/substations`)
- Feeders (`/admin/feeders`)
- Meters (`/admin/meters`)
- Infrastructure Requests (`/admin/infrastructure-requests`)
- Audit Log (`/admin/audit-log`)

### Placeholder Dashboard Pages

Create stub pages for each role's dashboard route that display:
- Role name as heading
- "Dashboard coming soon" message
- Confirms user is authenticated and routed correctly

### Shared Components

**`frontend/src/components/navigation/Sidebar.tsx`:**
- Accepts navigation items as props
- Active route highlighting
- Collapsible on desktop (icon-only mode)
- Sheet overlay on mobile

**`frontend/src/components/navigation/Navbar.tsx`:**
- App logo (text-based)
- Mobile menu toggle
- User avatar + dropdown (name, email, role badge, profile link, logout)

**`frontend/src/components/navigation/MobileNav.tsx`:**
- Sheet component with full navigation for mobile

## Pages

| Route | Access | Purpose |
|---|---|---|
| `/customer/dashboard` | CUSTOMER | Stub dashboard |
| `/operator/dashboard` | OPERATOR | Stub dashboard |
| `/technician/dashboard` | TECHNICIAN | Stub dashboard |
| `/manager/dashboard` | ZONE_MANAGER | Stub dashboard |
| `/admin/dashboard` | ADMIN | Stub dashboard |

## Completion Criteria

- [ ] Unauthenticated users redirected to `/login`
- [ ] Each role can only access their own routes
- [ ] Wrong role redirected to own dashboard
- [ ] Sidebar renders correct navigation for each role
- [ ] Logout works (clears session, redirects to login)
- [ ] Mobile navigation works via sheet/drawer
- [ ] Active route highlighted in sidebar
- [ ] User info displayed in header

## Verification

1. Visit `/admin/dashboard` without login → redirected to `/login`
2. Login as customer → visit `/admin/dashboard` → redirected to `/customer/dashboard`
3. Login as admin → see admin sidebar with all nav items
4. Click logout → redirected to login, session cleared
5. Resize to mobile → sidebar becomes drawer
6. Each role sees only their navigation items

## Output

Protected, role-specific navigation layouts.

**Commit:** `feat: implement route protection and role-based layouts`

---

# Phase 14 — Customer Dashboard & Schedule View

## Objective

Build the Customer dashboard showing current power status and the upcoming load-shedding schedule.

## Depends On

- Phase 13 (customer layout)
- Phase 10 (grid infrastructure APIs for feeder/meter data)
- Phase 08 (user profile with meter association)

## Why This Phase Exists

The customer's primary need is to see their power status and upcoming schedule. This is the first interaction point described in the Customer Journey.

## Scope

**IN SCOPE:**
- Customer dashboard page with status card
- Schedule view page (upcoming week)
- Backend API for customer-facing schedule data
- Backend API for customer's current power status

**OUT OF SCOPE:**
- Report outage (Phase 17)
- Schedule generation (Phase 15)
- Real-time updates (Phase 22)

## Backend Work

### `GET /api/customer/status`

- **Purpose:** Get current power status for the logged-in customer
- **Authentication:** Customer only
- **Business logic:**
  1. Get customer's meter → feeder → current status
  2. Check if feeder is under active schedule
  3. Return status: "NORMAL", "PLANNED_OUTAGE" (with end time), or "UNEXPECTED_FAULT"
- **Success response (200):**
  ```json
  {
    "success": true,
    "data": {
      "status": "NORMAL",
      "feederName": "Feeder A1-F1",
      "zoneName": "Zone A — North District",
      "meterNumber": "MTR-A1F1-001",
      "currentOutage": null,
      "nextScheduledOutage": {
        "startTime": "2026-09-24T12:00:00Z",
        "endTime": "2026-09-24T14:00:00Z"
      }
    }
  }
  ```
- **Error cases:** 401, 404 (no meter linked)

### `GET /api/customer/schedule`

- **Purpose:** Get upcoming week's schedule for customer's feeder
- **Authentication:** Customer only
- **Query parameters:** `days` (optional, default 7)
- **Business logic:**
  1. Get customer's meter → feeder
  2. Query ScheduleFeeder for this feeder within the date range
  3. Return list of scheduled outages
- **Success response (200):**
  ```json
  {
    "success": true,
    "data": {
      "feederName": "Feeder A1-F1",
      "schedules": [
        {
          "id": "uuid",
          "title": "Planned Outage",
          "startTime": "2026-09-24T12:00:00Z",
          "endTime": "2026-09-24T14:00:00Z",
          "status": "PUBLISHED"
        }
      ]
    }
  }
  ```

## Frontend Work

### Customer Dashboard Page (`/customer/dashboard`)

- **Status Card:** Large card at top showing:
  - Power status with colored indicator (green = Normal, yellow = Planned Outage, red = Fault)
  - Meter number and zone info
  - If outage active: countdown timer to restoration
  - If outage upcoming: time until next outage
- **Quick Actions:** Report Outage button, View Full Schedule link
- **Next Outage Card:** Shows the next scheduled outage with date, time, duration
- **States:** Loading (skeleton), Error, No meter linked (prompt to update profile)

### Schedule Page (`/customer/schedule`)

- **Timeline/list view:** Shows the next 7 days of scheduled outages
- Each entry shows: date, start time, end time, duration, status
- Empty state: "No scheduled outages for the upcoming week"
- Calendar-like visual grouping by day

### Components

- `CustomerStatusCard` — Power status display with indicator
- `ScheduleTimeline` — List of upcoming outages
- `StatCard` — Reusable stat display card

## Completion Criteria

- [ ] Customer dashboard shows current power status
- [ ] Customer dashboard shows next scheduled outage
- [ ] Schedule page shows upcoming week's outages
- [ ] "No meter linked" state handled gracefully
- [ ] Loading and error states implemented
- [ ] Responsive on mobile

## Verification

1. Login as customer → dashboard shows status card
2. If no schedules exist → "No upcoming outages" message
3. API returns correct feeder status
4. Mobile view renders properly

## Output

Functional customer dashboard with status and schedule views.

**Commit:** `feat: implement customer dashboard and schedule view`

---

# Phase 15 — Load Shedding Algorithm & Schedule Generation API

## Objective

Implement the core load-shedding algorithm that generates fair-rotation schedules and the API for operators to trigger it.

## Depends On

- Phase 10 (grid infrastructure APIs — feeders, zones)
- Phase 05 (Redis cache)
- Phase 07 (RBAC)

## Why This Phase Exists

This is the "algorithmic engine" — the heart of the system. The Operator needs to generate load-shedding plans that fairly distribute outages while protecting critical feeders.

## Scope

**IN SCOPE:**
- Load-shedding algorithm service
- Schedule generation endpoint
- Schedule review (list drafts)
- Schedule publishing endpoint
- Redis cache update on publish
- Fair rotation logic
- Critical feeder exclusion

**OUT OF SCOPE:**
- SMS notifications on publish (Phase 20)
- Customer dashboard updates (already built in Phase 14, will show data once published)

## Backend Work

### `backend/src/services/loadShedding.service.ts`

**The Algorithm:**

**Input:**
- `deficitMw`: Amount of power (MW) that needs to be shed
- `startTime`: When the shedding should begin
- `durationHours`: How long the shedding should last

**Process:**
1. Fetch all active, non-critical feeders with their capacity
2. Exclude feeders already scheduled for an outage on the same day (fair rotation)
3. Sort remaining feeders by "days since last outage" (longest first = most fair)
4. Greedily select feeders until cumulative capacity ≥ deficit_mw
5. If not enough capacity available → return error with message
6. Create Schedule (status: DRAFT) with selected feeders in ScheduleFeeder
7. Return the generated schedule for review

**Fair Rotation Rules:**
- No feeder is shed twice in one day
- Feeders that haven't been shed recently are prioritized
- Critical feeders (hospitals, etc.) are NEVER included
- The algorithm distributes load across different zones when possible

### `backend/src/services/schedule.service.ts`

**`generateSchedule(data)`:**
- Validate inputs
- Call `loadSheddingService.generatePlan()`
- Create Schedule and ScheduleFeeder records (status: DRAFT)
- Return schedule with feeder details

**`listSchedules(filters)`:**
- Filter by status, date range
- Paginated
- Include feeder count per schedule

**`getScheduleById(id)`:**
- Include all feeders with zone information

**`publishSchedule(id)`:**
1. Fetch schedule → 404
2. Verify status is DRAFT → 400 if not
3. Update status to PUBLISHED
4. Set `published_at` timestamp
5. Update all affected feeders status to PLANNED_OUTAGE
6. Cache schedule in Redis (key: `schedule:active`, and per-feeder keys)
7. Return published schedule
8. (SMS notification trigger added in Phase 20)

**`cancelSchedule(id)`:**
1. Fetch schedule → 404
2. Verify status is DRAFT or PUBLISHED
3. Update status to CANCELLED
4. If was PUBLISHED: revert feeder statuses to ONLINE
5. Invalidate Redis cache for affected feeders

### `backend/src/controllers/schedule.controller.ts`

### `backend/src/routes/schedule.routes.ts`

## API Work

### POST /api/schedules/generate

- **Purpose:** Generate a load-shedding plan
- **Authentication:** Operator only
- **Request body:**
  ```json
  {
    "deficitMw": 50,
    "startTime": "2026-09-24T12:00:00Z",
    "durationHours": 2
  }
  ```
- **Validation:**
  - `deficitMw`: required, number > 0
  - `startTime`: required, must be in the future
  - `durationHours`: required, number > 0, max 12
- **Business logic:** Runs the load-shedding algorithm
- **Success response (201):**
  ```json
  {
    "success": true,
    "data": {
      "schedule": {
        "id": "uuid",
        "title": "Load Shedding Plan — 50MW",
        "deficitMw": 50,
        "startTime": "...",
        "endTime": "...",
        "status": "DRAFT",
        "feeders": [
          {
            "id": "uuid",
            "name": "Feeder A1-F1",
            "capacityMw": 10,
            "zone": "Zone A",
            "daysSinceLastOutage": 5
          }
        ],
        "totalCapacityShed": 52
      }
    }
  }
  ```
- **Error cases:** 401, 403, 422, 400 (insufficient capacity)

### GET /api/schedules

- **Purpose:** List schedules
- **Authentication:** Operator, Admin
- **Query params:** `status`, `startDate`, `endDate`, `page`, `limit`
- **Response:** Paginated schedule list

### GET /api/schedules/:id

- **Purpose:** Get schedule details with feeders
- **Authentication:** Operator, Admin
- **Response:** Schedule with full feeder list

### POST /api/schedules/:id/publish

- **Purpose:** Publish a draft schedule
- **Authentication:** Operator only
- **Business logic:** Updates status, caches in Redis, updates feeder statuses
- **Success response (200):** Published schedule
- **Error cases:** 404, 400 (not in DRAFT status)

### POST /api/schedules/:id/cancel

- **Purpose:** Cancel a schedule
- **Authentication:** Operator, Admin
- **Business logic:** Reverts feeder statuses if was published
- **Success response (200):** Cancelled schedule
- **Error cases:** 404, 400 (already completed)

## Frontend Work

None (Operator frontend in Phase 18).

## Completion Criteria

- [ ] Algorithm selects feeders to meet deficit requirement
- [ ] Critical feeders excluded
- [ ] No feeder scheduled twice in same day
- [ ] Fair rotation based on days since last outage
- [ ] Schedule created in DRAFT status
- [ ] Publish updates feeder statuses and caches in Redis
- [ ] Cancel reverts feeder statuses
- [ ] Insufficient capacity returns descriptive error

## Verification

1. `POST /api/schedules/generate` with `{ "deficitMw": 50, ... }` → returns feeder selection
2. Verify critical feeder NOT in selection
3. Verify total capacity ≥ 50 MW
4. `POST /api/schedules/:id/publish` → feeder statuses change to PLANNED_OUTAGE
5. Check Redis for cached schedule
6. `POST /api/schedules/:id/cancel` → feeder statuses revert to ONLINE
7. Generate with deficit > total available capacity → descriptive error
8. Customer API (Phase 14) now returns the published schedule

## Output

Working load-shedding algorithm and schedule management API.

**Commit:** `feat: implement load shedding algorithm and schedule management`

---

# Phase 16 — Grid Status Management API

## Objective

Implement the grid status management API that tracks national grid capacity, demand, and deficit.

## Depends On

- Phase 10 (grid infrastructure)
- Phase 07 (RBAC)

## Why This Phase Exists

The Operator needs to see the current grid deficit to know how much load shedding is needed. The grid status drives the "Generate Load Shedding Plan" workflow.

## Scope

**IN SCOPE:**
- Get current grid status API
- Update grid status API (Operator)
- Grid status in dashboard data

**OUT OF SCOPE:**
- node-cron simulation (Phase 23)

## Backend Work

### `backend/src/services/grid.service.ts`

**`getGridStatus()`:**
- Fetch current GridStatus record
- Calculate derived values (deficit = demand - capacity if demand > capacity, else 0)

**`updateGridStatus(data)`:**
- Update capacity and/or demand
- Recalculate deficit
- Return updated status

### `backend/src/controllers/grid.controller.ts`

### `backend/src/routes/grid.routes.ts`

## API Work

### GET /api/grid/status

- **Purpose:** Get current national grid status
- **Authentication:** Operator, Zone Manager, Admin
- **Response (200):**
  ```json
  {
    "success": true,
    "data": {
      "totalCapacityMw": 295,
      "currentDemandMw": 345,
      "deficitMw": 50,
      "status": "DEFICIT",
      "updatedAt": "..."
    }
  }
  ```

### PATCH /api/grid/status

- **Purpose:** Update grid capacity/demand (simulating real-world grid monitoring)
- **Authentication:** Operator, Admin
- **Request body:**
  ```json
  {
    "totalCapacityMw": 280,
    "currentDemandMw": 350
  }
  ```
- **Response:** Updated grid status

## Completion Criteria

- [ ] Grid status returns current capacity, demand, deficit
- [ ] Operator can update grid status
- [ ] Deficit calculated correctly

## Verification

1. `GET /api/grid/status` → returns seeded grid data
2. `PATCH /api/grid/status` with higher demand → deficit increases
3. Customer cannot update grid status → 403

## Output

Working grid status API.

**Commit:** `feat: implement grid status management API`

---

# Phase 17 — Fault Reporting & Conflict Resolution API

## Objective

Implement the fault reporting system with smart conflict resolution that distinguishes between planned outages and real faults.

## Depends On

- Phase 15 (schedules — needed for conflict checking)
- Phase 10 (feeders, meters)

## Why This Phase Exists

This is the "coolest part of the project" — the smart conflict resolution engine. When a customer reports an outage, the system checks if their feeder is under a planned outage before creating a fault ticket.

## Scope

**IN SCOPE:**
- Report outage endpoint (Customer)
- Smart conflict resolution logic
- Fault ticket creation
- Fault listing endpoints
- Fault detail endpoint

**OUT OF SCOPE:**
- Technician assignment logic (Phase 18)
- Technician status updates (Phase 18)
- SMS notifications (Phase 20)
- Real-time updates (Phase 22)

## Backend Work

### `backend/src/services/conflictResolution.service.ts`

**`checkPlannedOutage(meterId: string)`:**
1. Get meter → feeder
2. Query active/published schedules for this feeder where `NOW()` is between `start_time` and `end_time`
3. If found → return `{ isPlannedOutage: true, endTime: schedule.endTime }`
4. If not found → return `{ isPlannedOutage: false }`

### `backend/src/services/fault.service.ts`

**`reportOutage(userId, data)`:**
1. Get customer's meter → feeder
2. Call `conflictResolution.checkPlannedOutage(meterId)`
3. If planned outage:
   - Return immediate response: "Your area is under scheduled load shedding until {endTime}. This is not a fault."
   - Do NOT create a fault ticket
   - Log in audit trail
4. If NOT planned outage:
   - Create Fault record with status REPORTED
   - Generate ticket number: `FLT-{YYYYMMDD}-{sequential}`
   - Update feeder status to UNEXPECTED_FAULT
   - Create initial FaultUpdate record
   - Return fault ticket details with confirmation message

**`listFaults(filters)`:**
- Filter by: status, feederId, zoneId, assignedTo, priority
- Pagination
- Include feeder and zone info

**`getFaultById(id)`:**
- Include feeder, reporter, assignee, updates, photos

**`getCustomerFaults(userId)`:**
- Get faults reported by this customer
- Sorted by most recent

### `backend/src/validators/fault.validator.ts`

**Report outage schema:**
- `description`: optional, string, max 1000
- `faultType`: optional, enum (TRANSFORMER_BLOWN, LINE_DOWN, EQUIPMENT_FAILURE, OTHER), default OTHER

### `backend/src/controllers/fault.controller.ts`

### `backend/src/routes/fault.routes.ts`

## API Work

### POST /api/faults/report

- **Purpose:** Report a power outage (Customer)
- **Authentication:** Customer only
- **Request body:**
  ```json
  {
    "description": "Power went out suddenly at 2:00 PM",
    "faultType": "TRANSFORMER_BLOWN"
  }
  ```
- **Business logic:**
  1. Check conflict resolution
  2. If planned outage → auto-reply without creating ticket
  3. If real fault → create ticket
- **Success response — Planned outage detected (200):**
  ```json
  {
    "success": true,
    "data": {
      "isPlannedOutage": true,
      "message": "Your area is currently under scheduled load shedding until 14:00. This is not a fault. No technician will be dispatched.",
      "scheduledEndTime": "2026-09-24T14:00:00Z"
    }
  }
  ```
- **Success response — Fault ticket created (201):**
  ```json
  {
    "success": true,
    "message": "Outage reported successfully. A technician will be assigned.",
    "data": {
      "fault": {
        "id": "uuid",
        "ticketNumber": "FLT-20260924-001",
        "status": "REPORTED",
        "description": "...",
        "feederName": "Feeder A1-F1",
        "zoneName": "Zone A"
      }
    }
  }
  ```
- **Error cases:** 401, 403, 404 (no meter linked), 400 (already active fault on same feeder by this user)

### GET /api/faults

- **Purpose:** List faults
- **Authentication:** Operator, Technician (own zone), Zone Manager (own zone), Admin
- **Query params:** `status`, `feederId`, `zoneId`, `assignedTo`, `priority`, `page`, `limit`
- **Response:** Paginated fault list

### GET /api/faults/:id

- **Purpose:** Get fault details
- **Authentication:** Reporter (own fault), assigned Technician, Zone Manager (own zone), Operator, Admin
- **Response:** Full fault with updates, photos

### GET /api/customer/faults

- **Purpose:** Get faults reported by current customer
- **Authentication:** Customer only
- **Response:** List of customer's fault tickets

## Completion Criteria

- [ ] Conflict resolution correctly identifies planned outages
- [ ] Planned outage → auto-reply, no ticket created
- [ ] Unplanned outage → ticket created with unique number
- [ ] Feeder status updated to UNEXPECTED_FAULT
- [ ] Customer can view their own fault tickets
- [ ] Faults filterable by status, zone, feeder
- [ ] Duplicate fault prevention (same feeder, same user, active fault)

## Verification

1. Publish a schedule for Feeder A1-F1 → Customer reports outage → gets planned outage message
2. No schedule active → Customer reports outage → fault ticket created
3. Check database: Fault record created, feeder status = UNEXPECTED_FAULT
4. `GET /api/customer/faults` → shows the reported fault
5. Report again on same feeder → 400 (already active)

## Output

Working fault reporting with smart conflict resolution.

**Commit:** `feat: implement fault reporting with conflict resolution`

---

# Phase 18 — Technician Fault Management API

## Objective

Implement the technician workflow: assignment, accept, en route, repairing, resolved — with photo upload.

## Depends On

- Phase 17 (fault reporting)

## Why This Phase Exists

Technicians need to manage fault tickets through the complete repair lifecycle. This is the core field-worker workflow.

## Scope

**IN SCOPE:**
- Auto-assignment of technicians to faults
- Technician status updates (accept → en route → repairing → resolved)
- Photo upload for repair evidence
- Fault status transition validation
- FaultUpdate history tracking

**OUT OF SCOPE:**
- Socket.io real-time notifications (Phase 22)
- SMS notifications (Phase 20)

## Backend Work

### `backend/src/middleware/upload.ts`

Configure multer:
- Storage: disk storage in `uploads/` directory
- File filter: images only (jpeg, jpg, png, webp)
- Size limit: 5MB per file
- Filename: `{faultId}-{timestamp}-{random}.{ext}`

### Update `backend/src/services/fault.service.ts`

**`autoAssignTechnician(faultId)`:**
1. Get fault → feeder → substation → zone
2. Find active technicians in the same zone
3. Sort by active ticket count (ascending — load balancing)
4. Assign the least-busy technician
5. Update fault status to ASSIGNED, set `assigned_to` and `assigned_at`
6. Create FaultUpdate record
7. If no technician available → leave as REPORTED, log warning

**`updateFaultStatus(faultId, technicianId, data)`:**
1. Verify technician is assigned to this fault
2. Validate status transition:
   - ASSIGNED → EN_ROUTE
   - EN_ROUTE → REPAIRING
   - REPAIRING → RESOLVED
   - Any status → CANCELLED (by Admin/Manager only)
3. Update Fault status
4. If RESOLVED: set `resolved_at`, `resolution_notes`, update feeder status to ONLINE
5. Create FaultUpdate record
6. Return updated fault

**`uploadFaultPhoto(faultId, technicianId, file)`:**
1. Verify technician is assigned to this fault
2. Save file via multer
3. Create FaultPhoto record
4. Return photo metadata

**`getTechnicianFaults(technicianId, status?)`:**
- Get faults assigned to this technician
- Filter by status if provided
- Sort: active first, then by assigned_at

### Valid Status Transitions:

```
REPORTED → ASSIGNED (auto or manual)
ASSIGNED → EN_ROUTE (technician accepts)
EN_ROUTE → REPAIRING (technician arrives)
REPAIRING → RESOLVED (technician completes)
Any → CANCELLED (admin/manager only)
```

## API Work

### PATCH /api/faults/:id/assign

- **Purpose:** Manually assign or reassign a technician
- **Authentication:** Admin, Zone Manager
- **Request body:** `{ "technicianId": "uuid" }`
- **Business logic:** Validate technician exists and is in the same zone
- **Response:** Updated fault

### PATCH /api/faults/:id/status

- **Purpose:** Update fault status (technician workflow)
- **Authentication:** Assigned Technician, Admin, Zone Manager
- **Request body:**
  ```json
  {
    "status": "EN_ROUTE",
    "notes": "On my way to substation 4"
  }
  ```
- **Validation:** Status must be a valid transition from current status
- **Response:** Updated fault with new status

### POST /api/faults/:id/photos

- **Purpose:** Upload repair photo
- **Authentication:** Assigned Technician
- **Request:** `multipart/form-data` with `photo` field
- **Validation:** Image files only, max 5MB
- **Response (201):** Photo metadata

### GET /api/technician/faults

- **Purpose:** Get faults assigned to current technician
- **Authentication:** Technician only
- **Query params:** `status`, `page`, `limit`
- **Response:** Paginated fault list

## Completion Criteria

- [ ] Fault auto-assigns to least-busy technician in zone
- [ ] Technician can update status through valid transitions
- [ ] Invalid transitions rejected (e.g., REPORTED → RESOLVED)
- [ ] Photo upload works (images only, max 5MB)
- [ ] RESOLVED status updates feeder to ONLINE
- [ ] FaultUpdate history created for each status change
- [ ] Technician can only manage their own assigned faults

## Verification

1. Report fault → auto-assigned to technician in zone
2. Login as technician → `PATCH /api/faults/:id/status` with `EN_ROUTE` → 200
3. Try skip to RESOLVED from EN_ROUTE → 400
4. Update to REPAIRING → then RESOLVED with notes → feeder status = ONLINE
5. Upload photo → file saved, FaultPhoto record created
6. `GET /api/technician/faults` → shows assigned faults

## Output

Complete technician fault management workflow.

**Commit:** `feat: implement technician fault management with photo upload`

---

# Phase 19 — Analytics & Reporting API

## Objective

Implement analytics endpoints for Zone Manager reporting — feeder failure frequency, technician resolution times, and zone performance.

## Depends On

- Phase 17 (fault data)
- Phase 18 (resolution data)
- Phase 15 (schedule data)

## Why This Phase Exists

The Zone Manager journey requires analytics to answer: "Which feeder fails most?" and "What is the average resolution time?" This data drives infrastructure upgrade decisions.

## Scope

**IN SCOPE:**
- Feeder failure frequency report
- Technician performance report (average resolution time)
- Zone overview statistics
- Date range filtering
- Schedule history statistics

**OUT OF SCOPE:**
- Exportable reports (stretch goal)
- Infrastructure request form (Phase 21)

## Backend Work

### `backend/src/services/analytics.service.ts`

**`getFeederFailureReport(zoneId?, startDate?, endDate?)`:**
- Count faults per feeder within date range
- Return sorted by failure count (descending)
- Include feeder name, zone, total faults, resolved count, average resolution time

**`getTechnicianPerformanceReport(zoneId?, startDate?, endDate?)`:**
- For each technician: total tickets, resolved count, average resolution time (hours)
- Sort by average resolution time
- Include technician name, zone

**`getZoneOverview(zoneId?)`:**
- Total feeders, online count, fault count, planned outage count
- Active faults count
- Total customers affected by current outages

**`getScheduleStats(startDate?, endDate?)`:**
- Total schedules, published count, completed count, cancelled count
- Total MW shed
- Average shedding duration

### `backend/src/validators/analytics.validator.ts`

**Query params:**
- `zoneId`: optional UUID
- `startDate`: optional ISO date
- `endDate`: optional ISO date
- `page`: optional
- `limit`: optional

### `backend/src/controllers/analytics.controller.ts`

### `backend/src/routes/analytics.routes.ts`

## API Work

### GET /api/analytics/feeder-failures

- **Auth:** Zone Manager, Operator, Admin
- **Query:** `zoneId`, `startDate`, `endDate`
- **Response:** Array of `{ feederId, feederName, zone, faultCount, resolvedCount, avgResolutionHours }`

### GET /api/analytics/technician-performance

- **Auth:** Zone Manager, Admin
- **Query:** `zoneId`, `startDate`, `endDate`
- **Response:** Array of `{ technicianId, name, totalTickets, resolvedCount, avgResolutionHours }`

### GET /api/analytics/zone-overview

- **Auth:** Zone Manager, Operator, Admin
- **Query:** `zoneId`
- **Response:** `{ totalFeeders, onlineCount, faultCount, plannedOutageCount, activeFaults, affectedCustomers }`

### GET /api/analytics/schedule-stats

- **Auth:** Operator, Admin
- **Query:** `startDate`, `endDate`
- **Response:** `{ totalSchedules, publishedCount, completedCount, cancelledCount, totalMwShed, avgDurationHours }`

## Completion Criteria

- [ ] Feeder failure report returns correct aggregated data
- [ ] Technician performance calculated correctly
- [ ] Zone overview shows real-time counts
- [ ] Date filtering works
- [ ] Zone filtering works

## Verification

1. Create some faults and resolve them → analytics endpoints return correct counts
2. Filter by date range → only matching faults included
3. Filter by zone → only zone-specific data returned
4. Non-authorized role → 403

## Output

Working analytics API for Zone Manager and Operator dashboards.

**Commit:** `feat: implement analytics and reporting APIs`

---

# Phase 20 — Twilio SMS Notification Service

## Objective

Implement SMS notifications via Twilio for schedule publishing and fault status updates.

## Depends On

- Phase 15 (schedule publishing)
- Phase 18 (fault status updates)

## Why This Phase Exists

The requirements explicitly specify automated SMS alerts for customers when their feeder is scheduled for an outage or when power is restored.

## Scope

**IN SCOPE:**
- Twilio client configuration
- SMS service with send function
- Notification record creation
- Integration with schedule publishing
- Integration with fault resolution
- Integration with technician assignment

**OUT OF SCOPE:**
- In-app notifications (Phase 22)
- Push notifications (stretch goal)

## Backend Work

### `backend/src/config/twilio.ts`

- Initialize Twilio client with `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`
- Export client and sender phone number

### `backend/src/services/sms.service.ts`

**`sendSms(to: string, message: string)`:**
1. If `NODE_ENV === 'development'`: log message to console instead of sending (to avoid Twilio charges during dev)
2. If `NODE_ENV === 'production'`: send via Twilio
3. Return delivery status
4. Handle Twilio errors gracefully (log but don't crash)

### `backend/src/services/notification.service.ts`

**`notifySchedulePublished(scheduleId)`:**
1. Get schedule → feeders → meters → customers (users)
2. For each customer with a phone number:
   - Compose message: "Power outage scheduled for your area ({feederName}) from {startTime} to {endTime}. Plan accordingly."
   - Call `smsService.sendSms()`
   - Create Notification record (type: SMS)

**`notifyFaultAssigned(faultId)`:**
1. Get fault → reporter (customer)
2. Compose: "We received your outage report (#{ticketNumber}). A technician has been assigned."
3. Send SMS and create Notification

**`notifyFaultResolved(faultId)`:**
1. Get fault → feeder → all customers on that feeder
2. Compose: "Power has been restored in your area ({feederName}). Thank you for your patience."
3. Send SMS to all affected customers

**`notifyTechnicianAssigned(faultId)`:**
1. Get fault → assigned technician
2. Compose: "New fault assigned: {feederName} — {faultType}. Ticket #{ticketNumber}."
3. Send SMS to technician

### Integration Points

Update existing services:
- `schedule.service.ts` `publishSchedule()` → call `notificationService.notifySchedulePublished()`
- `fault.service.ts` `autoAssignTechnician()` → call `notificationService.notifyFaultAssigned()` and `notifyTechnicianAssigned()`
- `fault.service.ts` `updateFaultStatus()` when RESOLVED → call `notificationService.notifyFaultResolved()`

## API Work

### GET /api/notifications

- **Purpose:** Get current user's notifications
- **Authentication:** Any authenticated user
- **Query params:** `isRead`, `type`, `page`, `limit`
- **Response:** Paginated notification list

### PATCH /api/notifications/:id/read

- **Purpose:** Mark notification as read
- **Authentication:** Owner of notification
- **Response:** Updated notification

### PATCH /api/notifications/read-all

- **Purpose:** Mark all notifications as read
- **Authentication:** Any authenticated user
- **Response:** Count of updated notifications

## Completion Criteria

- [ ] SMS sent (or logged in dev) when schedule published
- [ ] SMS sent when technician assigned to fault
- [ ] SMS sent when fault resolved
- [ ] Notification records created in database
- [ ] Notification API returns user's notifications
- [ ] Mark-as-read works
- [ ] Twilio errors don't crash the application

## Verification

1. Publish schedule → console shows SMS log for each affected customer (dev mode)
2. Report fault + auto-assign → SMS logged for customer and technician
3. Resolve fault → SMS logged for affected customers
4. `GET /api/notifications` → returns notification records
5. Mark notification as read → `isRead: true`
6. Break Twilio config → notifications still created, error logged but no crash

## Output

Working SMS notification system integrated with core workflows.

**Commit:** `feat: implement Twilio SMS notification service`

---

# Phase 21 — Infrastructure Request API

## Objective

Implement the infrastructure upgrade request feature for Zone Managers.

## Depends On

- Phase 19 (analytics data to support requests)
- Phase 10 (feeder data)

## Why This Phase Exists

The Zone Manager journey describes requesting infrastructure upgrades based on analytics data for worst-performing feeders.

## Scope

**IN SCOPE:**
- Create infrastructure request (Zone Manager)
- List and filter requests
- Admin approve/reject requests
- Include supporting analytics data

**OUT OF SCOPE:**
- Workflow beyond approve/reject (actual procurement, etc.)

## Backend Work

### `backend/src/services/admin.service.ts` (extended)

**`listInfrastructureRequests(filters)`**
**`updateInfrastructureRequestStatus(id, status, adminNotes)`**

### New service methods and routes

## API Work

### POST /api/infrastructure-requests

- **Auth:** Zone Manager
- **Body:** `{ "feederId": "uuid", "reason": "...", "supportingData": { ... } }`
- **Response (201):** Created request

### GET /api/infrastructure-requests

- **Auth:** Zone Manager (own zone), Admin (all)
- **Query:** `status`, `feederId`, `page`, `limit`

### PATCH /api/infrastructure-requests/:id/status

- **Auth:** Admin
- **Body:** `{ "status": "APPROVED", "adminNotes": "Budget approved for Q1" }`

## Completion Criteria

- [ ] Zone Manager can create requests with supporting data
- [ ] Admin can approve/reject with notes
- [ ] Requests linked to specific feeders

## Verification

1. Login as manager → create request → 201
2. Login as admin → approve request → status changes
3. Login as customer → create request → 403

## Output

Working infrastructure request system.

**Commit:** `feat: implement infrastructure request management`

---

# Phase 22 — Socket.io Real-Time Updates

## Objective

Implement real-time WebSocket communication for live dashboard updates when fault statuses change, schedules are published, or grid status updates.

## Depends On

- Phase 17 (faults)
- Phase 18 (fault status updates)
- Phase 15 (schedules)

## Why This Phase Exists

The requirements specify Socket.io for "instantaneous status updates to the Zone Manager's dashboard tables when a technician accepts or resolves an outage."

## Scope

**IN SCOPE:**
- Socket.io server integration with Express
- Authentication for socket connections
- Event emission on fault status changes
- Event emission on schedule publish
- Event emission on grid status changes
- Room-based broadcasting (per zone, per feeder)

**OUT OF SCOPE:**
- Frontend socket integration (Phase 26)

## Backend Work

### `backend/src/config/socket.ts`

- Initialize Socket.io with the HTTP server
- Configure CORS for socket connections
- Export `io` instance

### `backend/src/sockets/index.ts`

**Connection handling:**
1. On connection → authenticate using JWT from handshake auth
2. If invalid → disconnect
3. Join user to rooms based on role:
   - Zone Manager → `zone:{zoneId}` room
   - Technician → `zone:{zoneId}` room
   - Customer → `feeder:{feederId}` room (via meter)
   - Operator → `control-room` room
   - Admin → `admin` room

### `backend/src/sockets/gridUpdates.ts`

**Events to emit:**

| Event | Rooms | Payload | Trigger |
|---|---|---|---|
| `fault:created` | `zone:{zoneId}`, `control-room`, `admin` | Fault summary | Fault report creates ticket |
| `fault:statusChanged` | `zone:{zoneId}`, `feeder:{feederId}`, `control-room` | Fault ID, old status, new status | Technician updates status |
| `fault:resolved` | `zone:{zoneId}`, `feeder:{feederId}` | Fault summary | Technician resolves fault |
| `schedule:published` | `control-room`, all affected `feeder:{feederId}` rooms | Schedule summary | Operator publishes |
| `grid:statusChanged` | `control-room` | Grid status | Grid status updated |
| `feeder:statusChanged` | `zone:{zoneId}`, `feeder:{feederId}` | Feeder ID, new status | Any feeder status change |

### Integration Points

Update services to emit events after successful operations:
- `fault.service.ts` → emit on report, status change, resolve
- `schedule.service.ts` → emit on publish
- `grid.service.ts` → emit on update

## Completion Criteria

- [ ] Socket.io server runs alongside Express
- [ ] JWT authentication on socket connections
- [ ] Rooms assigned based on user role
- [ ] Events emitted on fault status changes
- [ ] Events emitted on schedule publish
- [ ] Events emitted on grid status changes
- [ ] Unauthorized connections rejected

## Verification

1. Connect with valid JWT → connection accepted, joined to correct rooms
2. Connect without JWT → connection rejected
3. Trigger fault status change → event received in correct rooms
4. Use Socket.io admin UI or test client to verify

## Output

Working real-time event system.

**Commit:** `feat: implement Socket.io real-time updates`

---

# Phase 23 — Background Jobs (node-cron)

## Objective

Implement scheduled background jobs for grid simulation and automatic schedule lifecycle management.

## Depends On

- Phase 15 (schedules)
- Phase 16 (grid status)

## Why This Phase Exists

The requirements specify node-cron for "simulating national grid power fluctuations" and "running the hourly load-shedding script." Schedules also need automatic activation and completion based on time.

## Scope

**IN SCOPE:**
- Schedule activation job (PUBLISHED → ACTIVE when start_time reached)
- Schedule completion job (ACTIVE → COMPLETED when end_time reached, revert feeder statuses)
- Grid simulation job (randomly adjust demand to simulate real-world fluctuations)
- Redis cache cleanup on schedule completion

**OUT OF SCOPE:**
- Complex demand prediction algorithms

## Backend Work

### `backend/src/jobs/scheduleActivation.job.ts`

**Runs every minute:**
1. Find PUBLISHED schedules where `start_time <= NOW()`
2. Update status to ACTIVE
3. Emit `schedule:activated` event via Socket.io

**Runs every minute:**
1. Find ACTIVE schedules where `end_time <= NOW()`
2. Update status to COMPLETED
3. Revert affected feeder statuses to ONLINE (unless they have an active fault)
4. Invalidate Redis cache
5. Emit `schedule:completed` event

### `backend/src/jobs/gridSimulation.job.ts`

**Runs every 5 minutes (configurable):**
1. Get current grid status
2. Randomly adjust demand by ±5-15%
3. Update grid status
4. If deficit > threshold → emit warning event
5. Log the simulation change

### `backend/src/jobs/index.ts`

- Initialize all cron jobs
- Expose start/stop functions
- Log job registrations on startup

### Update `backend/src/index.ts`

- Start cron jobs after server and database are ready

## Completion Criteria

- [ ] Published schedules auto-activate at start_time
- [ ] Active schedules auto-complete at end_time
- [ ] Feeders revert to ONLINE after schedule completes
- [ ] Grid simulation runs periodically
- [ ] Redis cache invalidated on completion
- [ ] Jobs log their activity
- [ ] Jobs do not crash the server on error

## Verification

1. Publish schedule with start_time 1 minute from now → wait → status changes to ACTIVE
2. Set end_time 2 minutes from now → wait → status changes to COMPLETED, feeder ONLINE
3. Check logs → grid simulation adjustments logged
4. Check Redis → cache cleared after completion

## Output

Working background job system.

**Commit:** `feat: implement background jobs for schedule lifecycle and grid simulation`

---

# Phase 24 — Operator Dashboard Frontend

## Objective

Build the Operator's control room dashboard with grid status display, schedule generation, review, and publishing UI.

## Depends On

- Phase 13 (operator layout)
- Phase 15 (schedule APIs)
- Phase 16 (grid status API)

## Why This Phase Exists

The Operator needs a visual interface to see grid deficit, generate load-shedding plans, review them, and publish.

## Scope

**IN SCOPE:**
- Operator dashboard page with grid status
- Generate Plan page with form and results
- Schedules list page
- Schedule detail page with publish/cancel actions

**OUT OF SCOPE:**
- Real-time updates on dashboard (Phase 26)

## Frontend Work

### Operator Dashboard (`/operator/dashboard`)

- **Grid Status Card:** Shows total capacity, current demand, deficit with visual gauge/bar
- **Deficit indicator:** Color-coded (green = no deficit, yellow = moderate, red = critical)
- **Quick Stats:** Active schedules count, today's scheduled outages count
- **Quick Actions:** "Generate New Plan" button, "View All Schedules" link

### Generate Plan Page (`/operator/generate-plan`)

- **Form:**
  - Deficit to shed (MW): number input, pre-filled from current grid deficit
  - Start time: datetime picker (must be future)
  - Duration (hours): number input, 1-12
  - Submit: "Generate Plan" button with loading state
- **Results (after generation):**
  - Table showing selected feeders: name, zone, capacity, days since last outage
  - Total MW to be shed
  - Warning if critical feeders were excluded
  - Actions: "Publish" button, "Cancel" button, "Regenerate" button

### Schedules Page (`/operator/schedules`)

- **Shadcn DataTable** with columns: Title, Status (badge), Start Time, End Time, MW, Feeders Count, Created At
- **Filters:** Status dropdown, date range picker
- **Status badges:** DRAFT (gray), PUBLISHED (blue), ACTIVE (yellow), COMPLETED (green), CANCELLED (red)
- **Row click → navigate to detail page**

### Schedule Detail Page (`/operator/schedules/[id]`)

- Schedule metadata (title, status, times, deficit)
- Table of affected feeders with zone info
- Actions based on status:
  - DRAFT: Publish, Cancel
  - PUBLISHED: Cancel
  - ACTIVE: (no actions — in progress)
  - COMPLETED/CANCELLED: (view only)
- Confirmation dialog before publish/cancel

### Components

- `GridDeficitGauge` — Visual capacity/demand/deficit display
- `ScheduleForm` — Generate plan form
- `ScheduleTable` — DataTable for schedules
- `ScheduleDetail` — Detail view component

## Pages

| Route | Access | Purpose |
|---|---|---|
| `/operator/dashboard` | OPERATOR | Control room overview |
| `/operator/generate-plan` | OPERATOR | Generate load shedding plan |
| `/operator/schedules` | OPERATOR | List all schedules |
| `/operator/schedules/[id]` | OPERATOR | Schedule detail |

## Completion Criteria

- [ ] Dashboard shows current grid status with visual gauge
- [ ] Generate plan form submits and shows results
- [ ] Critical feeders excluded and noted
- [ ] Schedule list with proper status badges and filtering
- [ ] Publish flow with confirmation dialog
- [ ] Cancel flow with confirmation dialog
- [ ] Responsive on all screen sizes
- [ ] Loading, empty, and error states

## Verification

1. Login as operator → dashboard shows grid status
2. Click "Generate Plan" → fill form → submit → see selected feeders
3. Click "Publish" → confirmation → schedule status changes
4. View schedules list → correct status badges
5. Mobile view renders properly

## Output

Complete Operator dashboard frontend.

**Commit:** `feat: implement operator dashboard and schedule management UI`

---

# Phase 25 — Technician Dashboard Frontend

## Objective

Build the Technician's mobile-optimized interface for managing fault tickets.

## Depends On

- Phase 13 (technician layout)
- Phase 18 (technician fault APIs)

## Why This Phase Exists

Technicians need a mobile-first interface to receive assignments, update status, and upload repair photos from the field.

## Scope

**IN SCOPE:**
- Technician dashboard with active tickets summary
- Ticket list with status filtering
- Ticket detail with status update workflow
- Photo upload
- Ticket history

**OUT OF SCOPE:**
- GPS/maps integration

## Frontend Work

### Technician Dashboard (`/technician/dashboard`)

- **Active Tickets Summary:** Count of tickets by status (assigned, en route, repairing)
- **Urgent Ticket Card:** Most recent assigned ticket with prominent "Accept" action
- **Quick access to ticket list**
- Mobile-optimized: large touch targets, clear status indicators

### Ticket List (`/technician/tickets`)

- List of assigned tickets (card layout on mobile, table on desktop)
- Each card: ticket number, feeder name, fault type, status badge, time since reported
- Filter tabs: All, Assigned, En Route, Repairing
- Pull-to-refresh concept (button-based refresh)

### Ticket Detail (`/technician/tickets/[id]`)

- **Header:** Ticket number, status badge, priority badge
- **Info Section:** Feeder name, zone, fault type, reporter info, description
- **Location Info:** Substation address/description
- **Status Action Buttons:**
  - If ASSIGNED: "Accept & Go" button → changes to EN_ROUTE
  - If EN_ROUTE: "Start Repair" button → changes to REPAIRING
  - If REPAIRING: "Upload Photo" + "Mark Resolved" with resolution notes textarea
- **Photo Section:** Grid of uploaded photos, "Add Photo" button
- **Timeline:** FaultUpdate history showing status transitions with timestamps
- **Confirmation dialogs** for each status change

### Ticket History (`/technician/history`)

- Resolved/cancelled tickets
- Search by ticket number
- Date range filter

### Components

- `FaultTicketCard` — Card display for ticket list
- `FaultTimeline` — Status transition history
- `PhotoGrid` — Display and upload photos
- `StatusActionButton` — Context-aware status update button

## Pages

| Route | Access | Purpose |
|---|---|---|
| `/technician/dashboard` | TECHNICIAN | Overview with active tickets |
| `/technician/tickets` | TECHNICIAN | Ticket list |
| `/technician/tickets/[id]` | TECHNICIAN | Ticket detail with actions |
| `/technician/history` | TECHNICIAN | Resolved ticket history |

## Completion Criteria

- [ ] Dashboard shows active ticket summary
- [ ] Ticket list displays with status badges
- [ ] Status transitions work through UI buttons
- [ ] Photo upload works from detail page
- [ ] Resolution notes required when resolving
- [ ] Timeline shows status history
- [ ] Mobile-optimized layout with large touch targets
- [ ] Loading and error states handled

## Verification

1. Login as technician → dashboard shows assigned tickets count
2. Click ticket → see detail with "Accept & Go" button
3. Accept → status changes to EN_ROUTE in UI
4. Start Repair → upload photo → Mark Resolved → ticket completed
5. Check history → resolved ticket appears
6. Test on mobile viewport → layout is usable

## Output

Complete Technician dashboard frontend.

**Commit:** `feat: implement technician dashboard and ticket management UI`

---

# Phase 26 — Zone Manager Dashboard Frontend

## Objective

Build the Zone Manager's dashboard with live grid status table, analytics views, and infrastructure request form.

## Depends On

- Phase 13 (manager layout)
- Phase 19 (analytics APIs)
- Phase 21 (infrastructure request API)
- Phase 22 (Socket.io for real-time)

## Why This Phase Exists

The Zone Manager needs real-time oversight of grid health, technician performance analytics, and the ability to request infrastructure upgrades.

## Scope

**IN SCOPE:**
- Live Grid Status page with Shadcn DataTable
- Real-time Socket.io integration for live updates
- Analytics page with charts
- Infrastructure request form
- Socket.io client setup

**OUT OF SCOPE:**
- Map view (explicitly replaced by data table per requirements)

## Frontend Work

### Socket.io Client Setup

**`frontend/src/lib/socket.ts`:**
- Initialize Socket.io client with `NEXT_PUBLIC_SOCKET_URL`
- Include JWT in handshake auth
- Export client and connection hooks

**`frontend/src/components/realtime/SocketProvider.tsx`:**
- React context provider for socket connection
- Auto-connect on mount, disconnect on unmount

**`frontend/src/hooks/useSocket.ts`:**
- Subscribe to events
- Unsubscribe on cleanup

### Live Grid Status (`/manager/grid-status`)

- **Real-time Shadcn UI DataTable** with columns:
  - Zone, Feeder Name, Substation, Capacity (MW), Status (badge), Active Fault (ticket #), Assigned Technician
- **Status badges:**
  - Green "Online" badge
  - Yellow "Planned Outage" badge
  - Red "Unexpected Fault" badge
- **Filters:** Zone dropdown, Status filter, search by feeder name
- **Sorting:** All columns sortable
- **Real-time:** Socket.io events update rows without page refresh
  - `feeder:statusChanged` → update status badge
  - `fault:statusChanged` → update fault info

**`frontend/src/components/realtime/LiveStatusIndicator.tsx`:**
- Pulsing dot indicating live connection status

### Analytics Page (`/manager/analytics`)

- **Date range selector** (last 7 days, 30 days, 90 days, custom)
- **Feeder Failure Chart:** Bar chart (recharts) showing fault count per feeder
- **Technician Performance Table:** Name, tickets, avg resolution time
- **Zone Overview Cards:** Total feeders, online %, active faults, affected customers
- **Tabs:** Feeder Analysis, Technician Performance, Overview

### Infrastructure Requests Page (`/manager/infrastructure-requests`)

- **Request Form:**
  - Select feeder (dropdown of zone's feeders)
  - Reason (textarea)
  - Auto-attach analytics data as supporting evidence
  - Submit button
- **My Requests Table:** List of submitted requests with status badges
  - PENDING (yellow), APPROVED (green), REJECTED (red), COMPLETED (blue)

### Components

- `AnalyticsChart` — Recharts wrapper for bar/line charts
- `LiveStatusIndicator` — Connection status dot
- `DataTable` (enhanced) — Real-time capable Shadcn DataTable

## Pages

| Route | Access | Purpose |
|---|---|---|
| `/manager/dashboard` | ZONE_MANAGER | Overview stats |
| `/manager/grid-status` | ZONE_MANAGER | Live feeder status table |
| `/manager/analytics` | ZONE_MANAGER | Reports and charts |
| `/manager/infrastructure-requests` | ZONE_MANAGER | Request upgrades |

## Completion Criteria

- [ ] Grid status table renders all feeders with correct status badges
- [ ] Filters and sorting work
- [ ] Real-time updates change rows without refresh
- [ ] Analytics charts render correctly
- [ ] Infrastructure request form submits successfully
- [ ] Request status visible in list
- [ ] Live connection indicator works
- [ ] Responsive design

## Verification

1. Login as manager → grid status shows feeders
2. Change a feeder status (via fault) → table updates in real-time
3. View analytics → charts render with data
4. Submit infrastructure request → appears in list
5. Disconnect socket → indicator shows offline

## Output

Complete Zone Manager dashboard with real-time features.

**Commit:** `feat: implement zone manager dashboard with real-time grid status`

---

# Phase 27 — Admin Dashboard Frontend

## Objective

Build the Admin dashboard with user management, grid infrastructure CRUD, audit logs, and infrastructure request management.

## Depends On

- Phase 13 (admin layout)
- Phase 09 (admin user APIs)
- Phase 10 (grid infrastructure APIs)
- Phase 11 (audit log API)
- Phase 21 (infrastructure requests)

## Why This Phase Exists

The Admin needs a comprehensive management interface for users, grid infrastructure, and system oversight.

## Scope

**IN SCOPE:**
- Admin dashboard with system stats
- User management CRUD pages
- Zone/Substation/Feeder/Meter management pages
- Audit log viewer
- Infrastructure request management

**OUT OF SCOPE:**
- System configuration / settings

## Frontend Work

### Admin Dashboard (`/admin/dashboard`)

- **System Stats Cards:** Total users (by role), total zones, total feeders, active faults, active schedules
- **Recent Activity:** Last 5 audit log entries
- **Quick Actions:** Create User, Add Zone

### User Management

**Users List (`/admin/users`):**
- DataTable: Name, Email, Role (badge), Zone, Status (active/inactive badge), Created At
- Filters: role, status, search
- Actions: Create User button, row click → detail
- Pagination

**User Detail (`/admin/users/[id]`):**
- User info display
- Edit form (name, phone, role, zone)
- Activate/Deactivate toggle with confirmation
- Activity history from audit log

**Create User (modal/dialog from users list):**
- Form: email, password, name, phone, role (dropdown), zone (dropdown, shown for TECHNICIAN/ZONE_MANAGER)
- Validation feedback

### Grid Infrastructure Management

**For each entity (Zones, Substations, Feeders, Meters):**
- List page with DataTable, search, filters
- Create modal/dialog
- Edit modal/dialog
- Delete with confirmation (shows warning if has dependents)
- Show relationship info (zone shows substation count, substation shows feeder count, etc.)

### Audit Log (`/admin/audit-log`)

- DataTable: Timestamp, User (name/email), Action, Entity Type, Entity ID
- Filters: user, action, entity type, date range
- Pagination
- Row click → detail modal with full details JSON

### Infrastructure Requests (`/admin/infrastructure-requests`)

- DataTable: Feeder, Requested By, Reason (truncated), Status, Created At
- Approve/Reject actions with notes input dialog
- Filter by status

## Pages

| Route | Access | Purpose |
|---|---|---|
| `/admin/dashboard` | ADMIN | System overview |
| `/admin/users` | ADMIN | User management list |
| `/admin/users/[id]` | ADMIN | User detail/edit |
| `/admin/zones` | ADMIN | Zone management |
| `/admin/substations` | ADMIN | Substation management |
| `/admin/feeders` | ADMIN | Feeder management |
| `/admin/meters` | ADMIN | Meter management |
| `/admin/audit-log` | ADMIN | Audit log viewer |
| `/admin/infrastructure-requests` | ADMIN | Manage requests |

## Components

- `UserForm` — Create/edit user form
- `ZoneForm` — Zone CRUD form
- `SubstationForm` — Substation CRUD form
- `FeederForm` — Feeder CRUD form (with critical flag)
- `MeterForm` — Meter CRUD form
- `ConfirmDialog` — Reusable confirmation dialog
- `AuditLogDetail` — Detail view for audit entries

## Completion Criteria

- [ ] Dashboard shows system stats
- [ ] CRUD operations work for all entities
- [ ] User role assignment works
- [ ] Activate/deactivate users works
- [ ] Audit log displays and filters correctly
- [ ] Infrastructure requests can be approved/rejected
- [ ] Delete protection shows warnings
- [ ] Responsive design
- [ ] All forms validate inputs

## Verification

1. Login as admin → dashboard shows stats
2. Create new operator user → appears in user list
3. Create zone → substation → feeder → meter (full hierarchy)
4. Try delete zone with substations → warning shown
5. View audit log → see recent actions
6. Approve infrastructure request → status changes

## Output

Complete Admin management dashboard.

**Commit:** `feat: implement admin dashboard with full management UI`

---

# Phase 28 — Customer Outage Reporting & My Reports Frontend

## Objective

Build the customer's outage reporting page and fault tracking views.

## Depends On

- Phase 14 (customer dashboard)
- Phase 17 (fault reporting API)

## Why This Phase Exists

Customers need to report outages and track their reports through resolution.

## Scope

**IN SCOPE:**
- Report Outage page with form
- Conflict resolution UI feedback
- My Reports page with ticket list and detail
- Status tracking

**OUT OF SCOPE:**
- Real-time ticket updates (added via Socket.io in existing setup)

## Frontend Work

### Report Outage Page (`/customer/report-outage`)

- **Pre-check:** If no meter linked → show message to update profile
- **Form:**
  - Fault Type: dropdown (Transformer Blown, Line Down, Equipment Failure, Other)
  - Description: textarea (optional, max 1000 chars)
  - Submit button with loading state
- **Success Scenarios:**
  - **Planned Outage Detected:** Show prominent info card:
    - "Your area is currently under scheduled load shedding until {time}."
    - "This is not a fault. No technician will be dispatched."
    - Link to schedule page
  - **Fault Ticket Created:** Show success card:
    - "Outage reported. Ticket #{number} created."
    - "A technician will be assigned shortly."
    - Link to My Reports

### My Reports Page (`/customer/my-reports`)

- List of reported faults (card layout)
- Each card: ticket number, status badge, fault type, feeder, reported date
- Status badges with colors matching the workflow:
  - REPORTED (gray), ASSIGNED (blue), EN_ROUTE (indigo), REPAIRING (amber), RESOLVED (green), CANCELLED (red)
- Click card → detail view
- Detail view shows: full info, status timeline, assigned technician name

### Components

- `OutageReportForm`
- `ConflictResolutionCard` — Planned outage auto-response display
- `FaultTicketCard` — Report card for customer view

## Pages

| Route | Access | Purpose |
|---|---|---|
| `/customer/report-outage` | CUSTOMER | Report a power outage |
| `/customer/my-reports` | CUSTOMER | View my fault reports |

## Completion Criteria

- [ ] Report form submits and handles both responses (planned vs fault)
- [ ] Planned outage response displayed clearly
- [ ] Fault ticket confirmation displayed
- [ ] My Reports shows all customer's tickets
- [ ] Status badges accurate
- [ ] Detail view shows status timeline
- [ ] Mobile-friendly

## Verification

1. Report outage during planned schedule → planned outage message
2. Report outage with no schedule → ticket created, confirmation shown
3. View My Reports → ticket listed with correct status
4. Click ticket → detail with timeline

## Output

Complete customer outage reporting and tracking frontend.

**Commit:** `feat: implement customer outage reporting and tracking UI`

---

# Phase 29 — Customer Profile Page Frontend

## Objective

Build the customer profile management page.

## Depends On

- Phase 08 (profile APIs)
- Phase 14 (customer layout)

## Why This Phase Exists

Customers need to update their profile, phone number, and meter association.

## Scope

**IN SCOPE:**
- Profile display page
- Edit profile form
- Change password form
- Meter association display

**OUT OF SCOPE:**
- Profile photo

## Frontend Work

### Profile Page (`/customer/profile`)

- **Profile Info Card:** Name, email, phone, meter number, zone, feeder
- **Edit Profile Form:** Name, phone, meter number (with helper text)
- **Change Password Section:** Current password, new password, confirm password with strength indicator
- **Account Info:** Account created date, last login (if tracked)

## Pages

| Route | Access | Purpose |
|---|---|---|
| `/customer/profile` | CUSTOMER | Profile management |

## Completion Criteria

- [ ] Profile displays current info
- [ ] Edit form updates profile
- [ ] Change password works
- [ ] Meter association displayed with zone/feeder context

## Verification

1. View profile → correct info shown
2. Update name → reflected on page
3. Change password → login with new password works

## Output

Customer profile management page.

**Commit:** `feat: implement customer profile page`

---

# Phase 30 — Landing Page

## Objective

Create a public landing page that introduces the system and directs users to login/register.

## Depends On

- Phase 12 (frontend initialized)

## Why This Phase Exists

The app needs a landing page for first-time visitors before they log in or register.

## Scope

**IN SCOPE:**
- Hero section with app name and tagline
- Features overview section
- How it works section
- CTA buttons (Login / Register)
- Footer
- Responsive design

**OUT OF SCOPE:**
- SEO optimization (Phase 39)

## Frontend Work

### Landing Page (`/`)

- **Hero Section:**
  - App name: "PowerGrid — Load Shedding & Power Outage Management"
  - Tagline: "Know when your power goes. Report when it shouldn't."
  - CTA: "Get Started" → register, "Login" → login
  - Visual element (animated gradient or abstract grid illustration)
- **Features Section:** (3-4 feature cards)
  - Real-time schedule tracking
  - Smart outage reporting
  - Instant SMS notifications
  - Fair rotation algorithm
- **How It Works Section:** Simple 3-step flow
  - 1. Enter your meter number
  - 2. See your schedule
  - 3. Report unexpected outages
- **Footer:** App name, copyright, links

### Design

- Dark theme consistent with rest of app
- Smooth scroll animations
- Gradient backgrounds
- Glass-morphism cards
- Micro-animations on hover

## Pages

| Route | Access | Purpose |
|---|---|---|
| `/` | Public | Landing page |

## Completion Criteria

- [ ] Landing page renders with all sections
- [ ] Navigation to login and register works
- [ ] Responsive on mobile/tablet/desktop
- [ ] Premium, modern design aesthetic
- [ ] Animations are smooth and not distracting

## Verification

1. Visit `/` → landing page renders
2. Click "Login" → navigates to `/login`
3. Click "Get Started" → navigates to `/register`
4. Resize to mobile → responsive layout

## Output

A polished, public-facing landing page.

**Commit:** `feat: implement landing page`

---

# Phase 31 — Frontend-Backend Full Integration Testing

## Objective

Verify all frontend pages correctly communicate with all backend APIs, end-to-end.

## Depends On

- All previous phases (24-30)

## Why This Phase Exists

Individual phases tested their own scope. This phase performs cross-cutting integration validation.

## Scope

**IN SCOPE:**
- Test every frontend page against live backend
- Verify every API call from frontend works
- Test role-based access in the browser
- Test error states
- Fix any integration issues discovered

**OUT OF SCOPE:**
- Automated test scripts (Phase 33)

## Frontend Work / Backend Work

Manual testing checklist:

### Authentication Flows
- [ ] Register new customer → auto-login → dashboard
- [ ] Login as each role → correct dashboard
- [ ] Logout → redirect to login
- [ ] Access wrong role's page → redirect
- [ ] Expired token → redirect to login

### Customer Flows
- [ ] Dashboard shows correct status
- [ ] Schedule page shows upcoming outages
- [ ] Report outage during planned shedding → conflict message
- [ ] Report outage without shedding → ticket created
- [ ] My Reports shows tickets with status
- [ ] Profile update works
- [ ] Password change works

### Operator Flows
- [ ] Dashboard shows grid status
- [ ] Generate plan with deficit → feeders selected
- [ ] Publish schedule → statuses update
- [ ] Cancel schedule → statuses revert
- [ ] Schedule list filters work

### Technician Flows
- [ ] Dashboard shows assigned tickets
- [ ] Accept ticket → status EN_ROUTE
- [ ] Start repair → status REPAIRING
- [ ] Upload photo → success
- [ ] Resolve → feeder ONLINE, customer notified
- [ ] History shows resolved tickets

### Zone Manager Flows
- [ ] Grid status table renders
- [ ] Real-time updates work (change fault status → table updates)
- [ ] Analytics charts render with data
- [ ] Infrastructure request submission works

### Admin Flows
- [ ] User CRUD operations work
- [ ] Grid infrastructure CRUD works
- [ ] Audit log shows actions
- [ ] Infrastructure request approve/reject works

## Completion Criteria

- [ ] Every checklist item above passes
- [ ] No console errors in browser
- [ ] No unhandled API errors
- [ ] All pages load within 3 seconds

## Verification

Walk through every checklist item manually.

## Output

Validated, integration-tested application.

**Commit:** `fix: resolve integration issues from full system testing`

---

# Phase 32 — Error Handling & Edge Cases Polish

## Objective

Implement comprehensive error handling for edge cases and improve error UX across the application.

## Depends On

- Phase 31

## Why This Phase Exists

Edge cases, race conditions, and unexpected states must be handled gracefully to prevent user confusion.

## Scope

**IN SCOPE:**
- Frontend error boundaries
- Network failure handling
- Session expiry handling
- Empty state screens for all pages
- Loading skeleton screens
- Form resubmission prevention
- API timeout handling
- Concurrent modification handling

**OUT OF SCOPE:**
- Performance optimization (Phase 36)

## Frontend Work

- Add React error boundaries at layout level
- Add retry buttons on network errors
- Add session expiry detection (401 → re-login prompt)
- Add skeletons for every data-loading page
- Add empty states with helpful messages for every list page
- Double-submit prevention on all forms
- Toast notifications for all error/success responses

## Backend Work

- Add API request timeout configuration
- Add better Prisma error handling (unique constraint, foreign key violations → user-friendly messages)
- Add input sanitization (strip HTML/scripts from text inputs)

## Completion Criteria

- [ ] No unhandled errors in frontend console
- [ ] Network failures show user-friendly messages
- [ ] Empty lists show helpful empty states
- [ ] Loading shows skeleton screens
- [ ] Double-submit prevented
- [ ] Session expiry handled gracefully

## Verification

1. Disconnect backend → frontend shows network error
2. Visit list pages with no data → empty states rendered
3. Load pages → skeletons appear before data loads
4. Rapidly click submit → only one request sent

## Output

Polished error handling and edge case coverage.

**Commit:** `feat: implement comprehensive error handling and edge case polish`

---

# Phase 33 — Backend Unit & Integration Tests

## Objective

Write automated tests for backend services, controllers, and API endpoints.

## Depends On

- Phase 31 (fully integrated system)

## Why This Phase Exists

Automated tests prevent regressions and verify business logic correctness.

## Scope

**IN SCOPE:**
- Test framework setup (Jest)
- Service unit tests
- API integration tests
- Authentication/authorization tests
- Load shedding algorithm tests
- Conflict resolution tests
- Validation tests

**OUT OF SCOPE:**
- Frontend tests (Phase 34)
- E2E tests (Phase 35)

## Backend Work

### Setup
- Install `jest`, `ts-jest`, `supertest`, `@types/jest`, `@types/supertest`
- Configure Jest for TypeScript
- Create test database configuration
- Create test utilities (auth helper, database cleanup)

### Test Suites

**Auth tests:**
- Registration success/failure
- Login success/failure
- Token validation
- Protected route access

**RBAC tests:**
- Each role accessing own endpoints → success
- Each role accessing other role's endpoints → 403

**Load Shedding Algorithm tests:**
- Correct feeder selection
- Critical feeder exclusion
- Fair rotation enforcement
- Insufficient capacity handling

**Conflict Resolution tests:**
- Report during planned outage → conflict detected
- Report outside planned outage → fault created

**CRUD tests:**
- Create, read, update, delete for each entity
- Validation enforcement
- Foreign key constraints

**Notification tests (mocked):**
- SMS service called with correct parameters
- Notification records created

## Completion Criteria

- [ ] Test suite passes: `npm test`
- [ ] >80% coverage on services
- [ ] All critical business logic tested
- [ ] Algorithm edge cases covered

## Verification

1. `npm test` → all tests pass
2. `npm test -- --coverage` → review coverage report

## Output

Comprehensive backend test suite.

**Commit:** `test: add backend unit and integration tests`

---

# Phase 34 — Frontend Component & Page Tests

## Objective

Write frontend tests for critical components, forms, and page behaviors.

## Depends On

- Phase 33 (backend tests provide patterns)
- Phase 31 (all pages implemented)

## Why This Phase Exists

Frontend tests ensure UI components render correctly and forms validate properly.

## Scope

**IN SCOPE:**
- Testing library setup (Jest + React Testing Library)
- Component rendering tests
- Form validation tests
- Authentication flow tests (mocked)
- Protected route behavior tests

**OUT OF SCOPE:**
- Visual regression tests
- E2E tests (Phase 35)

## Completion Criteria

- [ ] Component tests pass
- [ ] Form validation tests pass
- [ ] Auth flow tests pass

## Output

Frontend test suite.

**Commit:** `test: add frontend component and page tests`

---

# Phase 35 — End-to-End Tests

## Objective

Write E2E tests for complete user journeys.

## Depends On

- Phase 33 (backend tests)
- Phase 34 (frontend tests)

## Why This Phase Exists

E2E tests verify the entire system works together from the user's perspective.

## Scope

**IN SCOPE:**
- E2E test framework setup (Playwright or Cypress)
- Customer journey: register → login → view schedule → report outage → view report
- Operator journey: login → view grid → generate plan → publish
- Technician journey: login → view ticket → accept → repair → resolve
- Admin journey: login → create user → create zone → create feeder

**OUT OF SCOPE:**
- Performance testing
- Load testing

## Completion Criteria

- [ ] All E2E journey tests pass
- [ ] Tests run in CI-compatible mode (headless)

## Output

E2E test suite covering critical user journeys.

**Commit:** `test: add end-to-end tests for critical user journeys`

---

# Phase 36 — Performance Optimization

## Objective

Optimize database queries, frontend loading, and API response times.

## Depends On

- Phase 31 (fully working system)

## Why This Phase Exists

A utility management system must be responsive, especially during outage events when traffic spikes.

## Scope

**IN SCOPE:**
- Database query optimization (review Prisma queries for N+1)
- Implement Redis caching for frequently read data (feeder status, grid status)
- Frontend code splitting and lazy loading
- Image optimization (uploaded photos)
- API response compression
- Pagination verification on all list endpoints

**OUT OF SCOPE:**
- CDN setup
- Database replication

## Backend Work

- Add compression middleware (`compression` package)
- Review and optimize Prisma queries with `include` and `select`
- Add Redis caching for grid status and feeder status endpoints
- Add ETag headers for cacheable responses
- Optimize photo serving (serve static files efficiently)

## Frontend Work

- Implement `next/dynamic` for heavy components (charts, tables)
- Optimize `next/image` for uploaded photos
- Reduce bundle size (analyze with `@next/bundle-analyzer`)

## Completion Criteria

- [ ] No N+1 query issues
- [ ] Grid status cached in Redis
- [ ] API response times < 200ms for common endpoints
- [ ] Frontend bundle size reasonable
- [ ] Images properly optimized

## Verification

1. Check Prisma query logs → no excessive queries
2. Hit cached endpoint twice → second response faster
3. Run Lighthouse → check performance score

## Output

Optimized application performance.

**Commit:** `perf: optimize database queries, caching, and frontend loading`

---

# Phase 37 — Security Hardening

## Objective

Implement comprehensive security measures across the application.

## Depends On

- Phase 31 (fully working system)

## Why This Phase Exists

A utility management system handles sensitive infrastructure data and must be secure against common attack vectors.

## Scope

**IN SCOPE:**
- Rate limiting on all endpoints (not just auth)
- Input sanitization verification
- SQL injection protection verification (Prisma handles this)
- XSS protection (Content Security Policy headers)
- CSRF protection verification (NextAuth handles this)
- Secure headers audit (Helmet configuration)
- File upload security (type verification, size limits, path traversal prevention)
- Sensitive data redaction in logs
- Environment variable audit

**OUT OF SCOPE:**
- Penetration testing
- WAF setup

## Backend Work

- Configure rate limiters per endpoint category:
  - Auth: 10 req/15min per IP
  - API general: 100 req/min per user
  - File upload: 5 req/min per user
- Add `express-mongo-sanitize` or equivalent for input sanitization
- Verify Helmet CSP configuration
- Audit all endpoints for proper authorization
- Ensure file uploads validate content type (not just extension)
- Add request size limits (`express.json({ limit: '1mb' })`)

## Completion Criteria

- [ ] Rate limiting active on all routes
- [ ] Input sanitization verified
- [ ] File upload security verified
- [ ] No sensitive data in logs
- [ ] Security headers present

## Verification

1. Exceed rate limit → 429 Too Many Requests
2. Submit XSS payload → sanitized/rejected
3. Upload non-image with image extension → rejected
4. Check response headers → security headers present
5. Check logs → no passwords, tokens, or secrets logged

## Output

Security-hardened application.

**Commit:** `security: implement comprehensive security hardening`

---

# Phase 38 — Logging & Monitoring

## Objective

Implement structured application logging and monitoring endpoints.

## Depends On

- Phase 37 (security — log redaction)

## Why This Phase Exists

Production systems need structured logging for debugging, monitoring, and alerting.

## Scope

**IN SCOPE:**
- Structured Winston logging (JSON format for production)
- Request/response logging with appropriate detail levels
- Authentication event logging
- Business event logging (schedule published, fault reported, etc.)
- Health check endpoint enhancement (include database, Redis status)
- Error tracking with context

**OUT OF SCOPE:**
- Third-party monitoring services (Sentry, Datadog)
- Log aggregation infrastructure

## Backend Work

- Configure Winston with JSON format for production, pretty format for development
- Add request ID generation middleware (`uuid` per request)
- Add request duration logging
- Log business events: schedule lifecycle, fault lifecycle, user management
- Enhance health check:
  ```json
  {
    "status": "ok",
    "database": "connected",
    "redis": "connected",
    "uptime": 3600,
    "timestamp": "..."
  }
  ```

## Completion Criteria

- [ ] Structured JSON logs in production mode
- [ ] Request IDs in all log entries
- [ ] Business events logged
- [ ] Health check includes dependency status
- [ ] No sensitive data in logs

## Verification

1. Run in production mode → JSON logs
2. Make API request → request ID in logs
3. Publish schedule → business event logged
4. Health check → shows database and Redis status
5. Search logs for passwords/tokens → none found

## Output

Production-ready logging and monitoring.

**Commit:** `feat: implement structured logging and monitoring`

---

# Phase 39 — SEO & Accessibility

## Objective

Implement SEO best practices for public pages and accessibility improvements across the application.

## Depends On

- Phase 30 (landing page)
- Phase 12 (auth pages)

## Why This Phase Exists

Public-facing pages should be discoverable and the application should be accessible to all users.

## Scope

**IN SCOPE:**
- Meta tags for public pages (landing, login, register)
- Open Graph tags
- Proper heading hierarchy on all pages
- ARIA labels on interactive elements
- Keyboard navigation for all interactive elements
- Color contrast verification
- Screen reader compatibility for status badges and alerts

**OUT OF SCOPE:**
- Sitemap generation
- robots.txt (private application)

## Frontend Work

- Add `<title>` and `<meta>` to all pages
- Ensure single `<h1>` per page
- Add `aria-label` to buttons, links, and interactive elements
- Verify color contrast ratios meet WCAG AA standards
- Add `role` attributes where needed
- Test keyboard navigation through forms and tables

## Completion Criteria

- [ ] All pages have proper `<title>` tags
- [ ] Public pages have meta descriptions
- [ ] Heading hierarchy correct
- [ ] Interactive elements keyboard-accessible
- [ ] Color contrast meets WCAG AA

## Verification

1. Check page source → meta tags present
2. Tab through forms → all fields accessible
3. Use browser accessibility audit → no critical issues

## Output

SEO and accessibility improvements.

**Commit:** `feat: implement SEO and accessibility improvements`

---

# Phase 40 — Documentation

## Objective

Create comprehensive project documentation.

## Depends On

- All previous phases

## Why This Phase Exists

Documentation enables future development, onboarding, and maintenance.

## Scope

**IN SCOPE:**
- Root `README.md`: project overview, tech stack, quick start
- `backend/README.md`: setup, environment, API overview, testing
- `frontend/README.md`: setup, environment, pages, components
- API documentation (can be README-based or separate file)
- Database documentation (ER description)
- Architecture overview
- Deployment guide
- Troubleshooting guide

**OUT OF SCOPE:**
- Swagger/OpenAPI auto-generation
- User manual

## Documentation Structure

```
README.md                    # Project overview and quick start
docs/
├── architecture.md          # System architecture overview
├── api-reference.md         # Complete API documentation
├── database.md              # Database schema and relationships
├── deployment.md            # Deployment guide
├── environment.md           # Environment variable reference
└── troubleshooting.md       # Common issues and solutions
backend/README.md            # Backend-specific setup
frontend/README.md           # Frontend-specific setup
```

## Completion Criteria

- [ ] README has clear setup instructions
- [ ] All API endpoints documented
- [ ] Database relationships documented
- [ ] Deployment steps documented
- [ ] Environment variables documented

## Verification

1. Follow README setup instructions from scratch → system runs
2. API documentation matches actual endpoints

## Output

Comprehensive project documentation.

**Commit:** `docs: add comprehensive project documentation`

---

# Phase 41 — Deployment Configuration

## Objective

Prepare the application for production deployment.

## Depends On

- All previous phases

## Why This Phase Exists

The application must be deployable to production environments.

## Scope

**IN SCOPE:**
- Backend build configuration (TypeScript compilation)
- Frontend production build configuration
- Production environment variable documentation
- Docker configuration (optional but recommended)
- Database migration strategy for production
- CORS configuration for production domains
- Start scripts for production

**OUT OF SCOPE:**
- Actual deployment to a cloud provider (project-specific)
- CI/CD pipeline setup
- Domain configuration

## Backend Work

- Add build script: `tsc` compilation to `dist/`
- Add production start script: `node dist/index.js`
- Add `.dockerignore` and `Dockerfile` (optional)
- Configure production logging (JSON, no debug)
- Configure production CORS (specific domain, not wildcard)
- Ensure `prisma migrate deploy` runs in production

## Frontend Work

- `next build` configuration
- Output: standalone or static (based on deployment target)
- Production API URL configuration
- Environment variable validation at build time

## Completion Criteria

- [ ] `npm run build` succeeds for both backend and frontend
- [ ] Backend runs in production mode
- [ ] Frontend production build works
- [ ] Database migrations deployable
- [ ] No development-only code in production builds

## Verification

1. `cd backend && npm run build` → compiles TypeScript to `dist/`
2. `NODE_ENV=production node dist/index.js` → server starts
3. `cd frontend && npm run build` → Next.js production build
4. `npm start` → serves production frontend

## Output

Deployment-ready application.

**Commit:** `chore: add production build and deployment configuration`

---

# Phase 42 — Final Integration Verification & Cleanup

## Objective

Final comprehensive verification of the entire system and code cleanup.

## Depends On

- All previous phases

## Why This Phase Exists

This is the final quality gate before the project is considered complete.

## Scope

**IN SCOPE:**
- Full system walkthrough for every user role
- Code cleanup (remove TODO comments, unused imports, temporary test routes)
- Verify all tests pass
- Verify production build works
- Final security audit
- Documentation accuracy verification

**OUT OF SCOPE:**
- New feature development

## Verification Checklist

### System Walkthrough
- [ ] Landing page renders and navigates to auth pages
- [ ] Customer: register → dashboard → view schedule → report outage (both scenarios) → view reports → profile
- [ ] Operator: login → dashboard → generate plan → publish → view schedules
- [ ] Technician: login → dashboard → accept ticket → en route → repair → upload photo → resolve
- [ ] Zone Manager: login → grid status (real-time) → analytics → infrastructure request
- [ ] Admin: login → manage users → manage grid → audit log → infrastructure requests
- [ ] SMS notifications sent (logged in dev)
- [ ] Socket.io real-time updates working
- [ ] Background jobs running (schedule lifecycle, grid simulation)

### Code Quality
- [ ] No `console.log` statements in production code (use logger)
- [ ] No hardcoded secrets
- [ ] No unused dependencies
- [ ] No TODO/FIXME comments without tracking
- [ ] Consistent code style

### Tests
- [ ] `npm test` passes in backend
- [ ] Frontend tests pass
- [ ] E2E tests pass

### Build
- [ ] Backend builds without errors
- [ ] Frontend builds without errors
- [ ] Production mode works

## Output

A complete, verified, production-ready Load Shedding & Power Outage Management System.

**Commit:** `chore: final cleanup and verification`

---

# FINAL SYSTEM MAP

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │ Customer  │ │ Operator │ │Technician│ │Zone Manager│  │
│  │  Portal   │ │  Portal  │ │  Portal  │ │   Portal   │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────┘  │
│  ┌──────────────────────────────────────────────────┐   │
│  │                Admin Portal                       │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │         NextAuth (Session + RBAC)                 │   │
│  └──────────────────────────────────────────────────┘   │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP (REST API) + WebSocket (Socket.io)
┌───────────────────────▼─────────────────────────────────┐
│                  Backend (Express.js)                     │
│  ┌─────────┐ ┌──────────┐ ┌────────────┐ ┌──────────┐  │
│  │  Auth    │ │ Schedule │ │   Fault    │ │ Analytics │  │
│  │ Service  │ │ Service  │ │  Service   │ │  Service  │  │
│  └─────────┘ └──────────┘ └────────────┘ └──────────┘  │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────┐   │
│  │ Load Shedding│ │  Conflict    │ │  Notification  │   │
│  │  Algorithm   │ │ Resolution   │ │   Service      │   │
│  └──────────────┘ └──────────────┘ └────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  node-cron (Schedule Lifecycle, Grid Simulation)  │   │
│  └──────────────────────────────────────────────────┘   │
└───────────┬──────────────────┬──────────────┬───────────┘
            │                  │              │
     ┌──────▼──────┐   ┌──────▼──────┐ ┌─────▼──────┐
     │   Neon       │   │  Upstash    │ │  Twilio    │
     │ PostgreSQL   │   │   Redis     │ │   SMS      │
     │  (Prisma)    │   │  (Cache)    │ │            │
     └─────────────┘   └─────────────┘ └────────────┘
```

## User Roles Summary

| Role | Registration | Portal Path Prefix | Key Actions |
|---|---|---|---|
| Customer | Self-register | `/customer/` | View schedule, report outage, track tickets |
| Operator | Admin-created | `/operator/` | Generate/publish load shedding plans |
| Technician | Admin-created | `/technician/` | Accept/manage fault tickets |
| Zone Manager | Admin-created | `/manager/` | Monitor grid, analytics, request upgrades |
| Admin | Seeded/Admin-created | `/admin/` | Manage users, infrastructure, system |

---

# COMPLETE API INVENTORY

| Method | Endpoint | Auth | Role(s) | Purpose | Phase |
|---|---|---|---|---|---|
| GET | /api/health | Public | All | Health check | 02 |
| POST | /api/auth/register | Public | All | Customer registration | 06 |
| POST | /api/auth/login | Public | All | User login | 06 |
| GET | /api/auth/me | Auth | All | Current user info | 07 |
| GET | /api/users/profile | Auth | All | Get own profile | 08 |
| PATCH | /api/users/profile | Auth | All | Update own profile | 08 |
| POST | /api/users/change-password | Auth | All | Change password | 08 |
| GET | /api/admin/users | Auth | Admin | List users | 09 |
| GET | /api/admin/users/:id | Auth | Admin | Get user by ID | 09 |
| POST | /api/admin/users | Auth | Admin | Create user | 09 |
| PATCH | /api/admin/users/:id | Auth | Admin | Update user | 09 |
| PATCH | /api/admin/users/:id/status | Auth | Admin | Activate/deactivate user | 09 |
| GET | /api/zones | Auth | All | List zones | 10 |
| GET | /api/zones/:id | Auth | All | Get zone details | 10 |
| POST | /api/zones | Auth | Admin | Create zone | 10 |
| PATCH | /api/zones/:id | Auth | Admin | Update zone | 10 |
| DELETE | /api/zones/:id | Auth | Admin | Delete zone | 10 |
| GET | /api/substations | Auth | All | List substations | 10 |
| GET | /api/substations/:id | Auth | All | Get substation details | 10 |
| POST | /api/substations | Auth | Admin | Create substation | 10 |
| PATCH | /api/substations/:id | Auth | Admin | Update substation | 10 |
| DELETE | /api/substations/:id | Auth | Admin | Delete substation | 10 |
| GET | /api/feeders | Auth | All | List feeders | 10 |
| GET | /api/feeders/:id | Auth | All | Get feeder details | 10 |
| POST | /api/feeders | Auth | Admin | Create feeder | 10 |
| PATCH | /api/feeders/:id | Auth | Admin | Update feeder | 10 |
| DELETE | /api/feeders/:id | Auth | Admin | Delete feeder | 10 |
| GET | /api/meters | Auth | All | List meters | 10 |
| GET | /api/meters/:id | Auth | All | Get meter details | 10 |
| POST | /api/meters | Auth | Admin | Create meter | 10 |
| PATCH | /api/meters/:id | Auth | Admin | Update meter | 10 |
| DELETE | /api/meters/:id | Auth | Admin | Delete meter | 10 |
| GET | /api/admin/audit-logs | Auth | Admin | View audit logs | 11 |
| GET | /api/customer/status | Auth | Customer | Get power status | 14 |
| GET | /api/customer/schedule | Auth | Customer | Get upcoming schedule | 14 |
| POST | /api/schedules/generate | Auth | Operator | Generate load shedding plan | 15 |
| GET | /api/schedules | Auth | Operator, Admin | List schedules | 15 |
| GET | /api/schedules/:id | Auth | Operator, Admin | Get schedule details | 15 |
| POST | /api/schedules/:id/publish | Auth | Operator | Publish schedule | 15 |
| POST | /api/schedules/:id/cancel | Auth | Operator, Admin | Cancel schedule | 15 |
| GET | /api/grid/status | Auth | Operator, ZM, Admin | Get grid status | 16 |
| PATCH | /api/grid/status | Auth | Operator, Admin | Update grid status | 16 |
| POST | /api/faults/report | Auth | Customer | Report outage | 17 |
| GET | /api/faults | Auth | Operator, Tech, ZM, Admin | List faults | 17 |
| GET | /api/faults/:id | Auth | Varies | Get fault details | 17 |
| GET | /api/customer/faults | Auth | Customer | Get own fault reports | 17 |
| PATCH | /api/faults/:id/assign | Auth | Admin, ZM | Assign technician | 18 |
| PATCH | /api/faults/:id/status | Auth | Tech, Admin, ZM | Update fault status | 18 |
| POST | /api/faults/:id/photos | Auth | Tech | Upload fault photo | 18 |
| GET | /api/technician/faults | Auth | Technician | Get assigned faults | 18 |
| GET | /api/analytics/feeder-failures | Auth | ZM, Operator, Admin | Feeder failure report | 19 |
| GET | /api/analytics/technician-performance | Auth | ZM, Admin | Technician performance | 19 |
| GET | /api/analytics/zone-overview | Auth | ZM, Operator, Admin | Zone statistics | 19 |
| GET | /api/analytics/schedule-stats | Auth | Operator, Admin | Schedule statistics | 19 |
| GET | /api/notifications | Auth | All | Get notifications | 20 |
| PATCH | /api/notifications/:id/read | Auth | Owner | Mark notification read | 20 |
| PATCH | /api/notifications/read-all | Auth | All | Mark all read | 20 |
| POST | /api/infrastructure-requests | Auth | ZM | Create request | 21 |
| GET | /api/infrastructure-requests | Auth | ZM, Admin | List requests | 21 |
| PATCH | /api/infrastructure-requests/:id/status | Auth | Admin | Approve/reject request | 21 |

---

# COMPLETE PAGE INVENTORY

| Route | Access | Purpose | Main APIs | Phase |
|---|---|---|---|---|
| `/` | Public | Landing page | None | 30 |
| `/login` | Public | User login | POST /api/auth/login | 12 |
| `/register` | Public | Customer registration | POST /api/auth/register | 12 |
| `/customer/dashboard` | Customer | Power status & schedule summary | GET /customer/status, /customer/schedule | 14 |
| `/customer/schedule` | Customer | Full upcoming schedule | GET /customer/schedule | 14 |
| `/customer/report-outage` | Customer | Report power outage | POST /faults/report | 28 |
| `/customer/my-reports` | Customer | View own fault tickets | GET /customer/faults | 28 |
| `/customer/profile` | Customer | Profile management | GET/PATCH /users/profile, POST /users/change-password | 29 |
| `/operator/dashboard` | Operator | Control room overview | GET /grid/status, GET /schedules | 24 |
| `/operator/generate-plan` | Operator | Generate load shedding plan | POST /schedules/generate | 24 |
| `/operator/schedules` | Operator | Schedule list | GET /schedules | 24 |
| `/operator/schedules/[id]` | Operator | Schedule detail | GET /schedules/:id, POST publish/cancel | 24 |
| `/technician/dashboard` | Technician | Active tickets overview | GET /technician/faults | 25 |
| `/technician/tickets` | Technician | Ticket list | GET /technician/faults | 25 |
| `/technician/tickets/[id]` | Technician | Ticket detail with actions | GET /faults/:id, PATCH status, POST photos | 25 |
| `/technician/history` | Technician | Resolved tickets history | GET /technician/faults?status=RESOLVED | 25 |
| `/manager/dashboard` | Zone Manager | Overview stats | GET /analytics/zone-overview | 26 |
| `/manager/grid-status` | Zone Manager | Live feeder status table | GET /feeders, Socket.io | 26 |
| `/manager/analytics` | Zone Manager | Reports & charts | GET /analytics/* | 26 |
| `/manager/infrastructure-requests` | Zone Manager | Request upgrades | GET/POST /infrastructure-requests | 26 |
| `/admin/dashboard` | Admin | System overview | GET /admin/users, various counts | 27 |
| `/admin/users` | Admin | User management list | GET /admin/users | 27 |
| `/admin/users/[id]` | Admin | User detail/edit | GET/PATCH /admin/users/:id | 27 |
| `/admin/zones` | Admin | Zone management | GET/POST/PATCH/DELETE /zones | 27 |
| `/admin/substations` | Admin | Substation management | GET/POST/PATCH/DELETE /substations | 27 |
| `/admin/feeders` | Admin | Feeder management | GET/POST/PATCH/DELETE /feeders | 27 |
| `/admin/meters` | Admin | Meter management | GET/POST/PATCH/DELETE /meters | 27 |
| `/admin/audit-log` | Admin | Audit log viewer | GET /admin/audit-logs | 27 |
| `/admin/infrastructure-requests` | Admin | Manage requests | GET/PATCH /infrastructure-requests | 27 |

---

# COMPLETE DATABASE INVENTORY

| Entity | Purpose | Key Relationships | Phase |
|---|---|---|---|
| User | All system users with role-based access | → Zone, → Meter | 03 |
| Zone | Geographic grid districts | → Substations, → Users (technicians, managers) | 03 |
| Substation | Power substations within zones | → Zone, → Feeders | 03 |
| Feeder | Power distribution lines | → Substation, → Meters, → ScheduleFeeder, → Faults | 03 |
| Meter | Customer power meters | → Feeder, → User | 03 |
| Schedule | Load shedding schedule plans | → User (creator), → ScheduleFeeder | 03 |
| ScheduleFeeder | Join: Schedule ↔ Feeder | → Schedule, → Feeder | 03 |
| Fault | Outage fault tickets | → Feeder, → User (reporter), → User (technician) | 03 |
| FaultPhoto | Repair evidence photos | → Fault, → User | 03 |
| FaultUpdate | Fault status change history | → Fault, → User | 03 |
| Notification | SMS and in-app notifications | → User | 03 |
| InfrastructureRequest | Upgrade requests from managers | → Feeder, → User | 03 |
| GridStatus | National grid capacity/demand | Standalone | 03 |
| AuditLog | Action audit trail | → User | 03 |

---

# FEATURE → API → PAGE → DATABASE → ROLE MAPPING

| Feature | Backend API | Frontend Page | Database Entities | User Role |
|---|---|---|---|---|
| User Registration | POST /auth/register | /register | User, Meter | Customer |
| User Login | POST /auth/login | /login | User | All |
| View Power Status | GET /customer/status | /customer/dashboard | User, Meter, Feeder, Schedule | Customer |
| View Schedule | GET /customer/schedule | /customer/schedule | ScheduleFeeder, Schedule, Feeder | Customer |
| Report Outage | POST /faults/report | /customer/report-outage | Fault, Feeder, Schedule (conflict check) | Customer |
| Track Reports | GET /customer/faults | /customer/my-reports | Fault, FaultUpdate | Customer |
| Profile Management | GET/PATCH /users/profile | /customer/profile | User, Meter | All |
| Generate LS Plan | POST /schedules/generate | /operator/generate-plan | Schedule, ScheduleFeeder, Feeder | Operator |
| Publish Schedule | POST /schedules/:id/publish | /operator/schedules/[id] | Schedule, Feeder, Notification | Operator |
| Grid Monitoring | GET /grid/status | /operator/dashboard | GridStatus | Operator |
| Accept Fault Ticket | PATCH /faults/:id/status | /technician/tickets/[id] | Fault, FaultUpdate | Technician |
| Resolve Fault | PATCH /faults/:id/status | /technician/tickets/[id] | Fault, FaultUpdate, Feeder, Notification | Technician |
| Upload Photo | POST /faults/:id/photos | /technician/tickets/[id] | FaultPhoto | Technician |
| Live Grid Status | GET /feeders + Socket.io | /manager/grid-status | Feeder, Fault | Zone Manager |
| Analytics | GET /analytics/* | /manager/analytics | Fault, Schedule, User | Zone Manager |
| Infrastructure Request | POST /infrastructure-requests | /manager/infrastructure-requests | InfrastructureRequest, Feeder | Zone Manager |
| User Management | GET/POST/PATCH /admin/users | /admin/users | User | Admin |
| Grid Management | CRUD /zones /substations /feeders /meters | /admin/zones, etc. | Zone, Substation, Feeder, Meter | Admin |
| Audit Log | GET /admin/audit-logs | /admin/audit-log | AuditLog | Admin |
| SMS Notifications | (internal) | N/A | Notification | System |
| Conflict Resolution | (internal, via POST /faults/report) | /customer/report-outage | Schedule, Feeder | System |
| Schedule Lifecycle | (node-cron) | N/A | Schedule, Feeder | System |
| Grid Simulation | (node-cron) | N/A | GridStatus | System |

---

# FINAL DEPENDENCY GRAPH

```
Phase 01 — Project Init
  ↓
Phase 02 — Backend Init
  ├── Phase 03 — Database Schema
  │     ├── Phase 04 — Seed Data
  │     ├── Phase 05 — Redis Setup
  │     ├── Phase 06 — Auth Backend
  │     │     ↓
  │     │   Phase 07 — RBAC
  │     │     ├── Phase 08 — User Profile APIs
  │     │     │     ↓
  │     │     │   Phase 09 — Admin User Management
  │     │     ├── Phase 10 — Grid Infrastructure APIs
  │     │     │     ↓
  │     │     │   Phase 11 — Audit Logging
  │     │     ├── Phase 12 — Frontend Init & Auth Pages
  │     │     │     ↓
  │     │     │   Phase 13 — Route Protection & Layouts
  │     │     │     ├── Phase 14 — Customer Dashboard (+ Phase 10)
  │     │     │     ├── Phase 24 — Operator Dashboard (+ Phase 15, 16)
  │     │     │     ├── Phase 25 — Technician Dashboard (+ Phase 18)
  │     │     │     ├── Phase 26 — Zone Manager Dashboard (+ Phase 19, 21, 22)
  │     │     │     ├── Phase 27 — Admin Dashboard (+ Phase 09, 10, 11, 21)
  │     │     │     ├── Phase 28 — Customer Outage Reporting (+ Phase 17)
  │     │     │     ├── Phase 29 — Customer Profile Page (+ Phase 08)
  │     │     │     └── Phase 30 — Landing Page
  │     │     └── Phase 15 — Load Shedding Algorithm (+ Phase 10, 05)
  │     │           ├── Phase 16 — Grid Status API
  │     │           ├── Phase 17 — Fault Reporting & Conflict Resolution
  │     │           │     ↓
  │     │           │   Phase 18 — Technician Fault Management
  │     │           │     ↓
  │     │           │   Phase 19 — Analytics API
  │     │           ├── Phase 20 — SMS Notifications (+ Phase 18)
  │     │           ├── Phase 22 — Socket.io Real-Time (+ Phase 17, 18)
  │     │           └── Phase 23 — Background Jobs (+ Phase 16)
  │     └── Phase 21 — Infrastructure Requests (+ Phase 19, 10)
  │
  ↓ (all above complete)
Phase 31 — Full Integration Testing
  ↓
Phase 32 — Error Handling Polish
  ↓
Phase 33 — Backend Tests
  ↓
Phase 34 — Frontend Tests
  ↓
Phase 35 — E2E Tests
  ↓
Phase 36 — Performance Optimization
  ↓
Phase 37 — Security Hardening
  ↓
Phase 38 — Logging & Monitoring
  ↓
Phase 39 — SEO & Accessibility
  ↓
Phase 40 — Documentation
  ↓
Phase 41 — Deployment Configuration
  ↓
Phase 42 — Final Verification & Cleanup
```

---

# GIT COMMIT STRATEGY

Follow this commit convention throughout implementation:

```
chore:     Infrastructure, config, tooling changes
feat:      New features and functionality
fix:       Bug fixes and corrections
test:      Test additions and modifications
docs:      Documentation changes
perf:      Performance improvements
security:  Security-related changes
refactor:  Code restructuring without behavior change
```

**Commit per phase (minimum). Each commit message references the phase.**

**Never commit:**
- `.env` files (only `.env.example`)
- `node_modules/`
- `dist/` or `.next/` build output
- `uploads/` directory contents (only the directory placeholder)
- Temporary test files

**`.gitignore` must include:**
```
node_modules/
.env
.env.local
dist/
.next/
uploads/*
!uploads/.gitkeep
*.log
```

---

# PRE-IMPLEMENTATION CHECKLIST VERIFICATION

- [x] Entire project description analyzed (requirements.txt fully read)
- [x] Overall user journey analyzed (5 journeys documented)
- [x] Tech stack analyzed (10 technologies documented)
- [x] Every user role documented (5 roles)
- [x] Every major feature documented
- [x] Database planned (14 entities with full schemas)
- [x] Backend architecture planned (folder structure, services, controllers)
- [x] Every API endpoint planned (50+ endpoints)
- [x] Authentication planned (JWT, NextAuth, credentials provider)
- [x] Authorization planned (RBAC middleware, route protection)
- [x] Validation planned (Zod schemas for every form/API)
- [x] Error handling planned (global handler, structured responses)
- [x] Security planned (Phase 37 dedicated)
- [x] Every frontend page planned (29 pages)
- [x] Frontend components planned (30+ components)
- [x] Frontend/API integration mapped (Feature → API → Page → DB → Role table)
- [x] Testing planned (Phases 33, 34, 35)
- [x] Deployment planned (Phase 41)
- [x] Environment variables documented (14 backend + 4 frontend)
- [x] Documentation planned (Phase 40)
- [x] Git strategy included
- [x] 42 meaningful phases exist (exceeds minimum 30)
- [x] Every phase has dependencies
- [x] Every phase has completion criteria
- [x] Every phase has verification steps
- [x] API inventory complete (50+ endpoints)
- [x] Page inventory complete (29 pages)
- [x] Database inventory complete (14 entities)
- [x] Feature/API/page mapping complete
- [x] Dependency graph complete
- [x] No major requirement silently omitted
