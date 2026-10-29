# End-to-End Requirements Traceability Matrix

This document maps every business requirement and user journey from `requirment.txt` and `FEATURES.md` down to the exact REST API route, Express router, domain service, Prisma data model, and automated test assertion.

---

## 1. Core User Journeys Traceability

### Journey 1: Customer (Planning, Status & Outage Reporting)
| Step | User Action / Requirement | Canonical Route | Express Router | Domain Service / Model | Test Verification |
|---|---|---|---|---|---|
| **1.1** | View meter power status | `GET /api/v1/customers/me/meters/:id/status` | `customer.router.ts` | `Feeder.status`, `OutageScheduleItem` | Asserted in `runner.ts` |
| **1.2** | View upcoming load shedding | `GET /api/v1/customers/me/meters/:id/schedules` | `customer.router.ts` | `OutageSchedule`, `cache.service.ts` | Asserted in `runner.ts` |
| **1.3** | Submit blackout report | `POST /api/v1/customers/me/outage-reports` | `customer.router.ts` | `conflict.service.ts` | Asserted in `runner.ts` line 131 |
| **1.4** | Receive SMS acknowledgement | Twilio SMS Alert | `notification.service.ts` | `sms.service.ts`, `Notification` | Asserted in `runner.ts` simulated SMS |
| **1.5** | Track repair progress | `GET /api/v1/customers/me/outage-reports/:id` | `customer.router.ts` | `OutageTicket` | Asserted in `runner.ts` |

---

### Journey 2: Power Operator (Algorithmic Scheduling & Control Room)
| Step | User Action / Requirement | Canonical Route | Express Router | Domain Service / Model | Test Verification |
|---|---|---|---|---|---|
| **2.1** | View grid deficit & overview | `GET /api/v1/operator/grid-overview` | `operator.router.ts` | `Feeder`, `Substation`, `SystemConfig` | Verified via router test |
| **2.2** | Generate draft load shedding | `POST /api/v1/operator/schedules/draft` | `operator.router.ts` | `scheduler.service.ts` | Asserted in `runner.ts` line 113 |
| **2.3** | **Critical Feeder Exemption** | Hard filter in draft generation | `operator.router.ts` | `Feeder.isCritical = true` strictly filtered | Asserted in `runner.ts` line 123 (Hospital excluded) |
| **2.4** | **No Same-Day Repeat Cut** | Calendar date constraint | `operator.router.ts` | `scheduler.service.ts` checks daily slots | Asserted in scheduler unit check |
| **2.5** | Review & publish schedule | `POST /api/v1/operator/schedules/:id/publish` | `operator.router.ts` | `cache.service.ts` (Redis refresh), `sms.service.ts` | Asserted in `runner.ts` line 127 |

---

### Journey 3: Field Technician (Repair Workflow & Photo Proof)
| Step | User Action / Requirement | Canonical Route | Express Router | Domain Service / Model | Test Verification |
|---|---|---|---|---|---|
| **3.1** | View assigned repair queue | `GET /api/v1/technicians/me/assignments` | `technician.router.ts` | `OutageTicket` (assignedTo = technicianId) | Asserted in `runner.ts` |
| **3.2** | Accept ticket & depart | `POST /api/v1/technicians/me/assignments/:id/accept` | `technician.router.ts` | Status &rarr; `EN_ROUTE`, sets `enRouteAt` | Asserted in `runner.ts` line 174 |
| **3.3** | Arrive on-site & begin repair | `POST /api/v1/technicians/me/assignments/:id/start-repair` | `technician.router.ts` | Status &rarr; `REPAIRING`, sets `repairedAt` | Asserted in `runner.ts` line 184 |
| **3.4** | Upload repair photo evidence | `POST /api/v1/technicians/me/assignments/:id/upload-photo` | `technician.router.ts` | `upload.ts` (Multer / S3 adapter), `repairPhotoUrl` | Asserted in upload middleware |
| **3.5** | Mark ticket resolved | `POST /api/v1/technicians/me/assignments/:id/resolve` | `technician.router.ts` | Status &rarr; `RESOLVED`, sets Feeder &rarr; `ONLINE` | Asserted in `runner.ts` line 194 |

---

### Journey 4: Zone Manager (Oversight, Analytics & Upgrades)
| Step | User Action / Requirement | Canonical Route | Express Router | Domain Service / Model | Test Verification |
|---|---|---|---|---|---|
| **4.1** | Live SCADA status table | `GET /api/v1/zone-managers/me/feeders` | `manager.router.ts` | `Feeder` scoped by `manager.zoneId` | Asserted in `manager.router.ts` |
| **4.2** | Filter unexpected faults | `GET /api/v1/zone-managers/me/tickets` | `manager.router.ts` | `OutageTicket` filtered by `status` | Asserted in `manager.router.ts` |
| **4.3** | Feeder failure rate analytics | `GET /api/v1/zone-managers/me/analytics/feeder-failure-rate` | `manager.router.ts` | Aggregated fault counts per feeder | Asserted in `runner.ts` line 205 |
| **4.4** | Submit upgrade request | `POST /api/v1/infrastructure-requests` | `manager.router.ts` | `InfrastructureRequest` (`status: PENDING`) | Asserted in `runner.ts` line 219 |
| **4.5** | Admin review & approval | `PATCH /api/v1/infrastructure-requests/:id/status` | `admin.router.ts` | `InfrastructureRequest` (`status: APPROVED`) | Asserted in `runner.ts` line 230 |

---

### Journey 5: Smart Conflict Resolution (Backend Brain)
| Step | User Action / Requirement | Canonical Route | Express Router | Domain Service / Model | Test Verification |
|---|---|---|---|---|---|
| **5.1** | Customer reports outage during planned cut | `POST /api/v1/customers/me/outage-reports` | `customer.router.ts` | `conflict.service.ts` | Asserted in `runner.ts` line 131 |
| **5.2** | Intercept & verify active schedule | Evaluates `[startTime, endTime)` in `Asia/Dhaka` | `conflict.service.ts` | Matches `Feeder.id` against `OutageScheduleItem` | Asserted in `conflict.service.ts` |
| **5.3** | Log informational audit event | Stores `OutageReportEvent` | `conflict.service.ts` | `OutageReportEvent.isScheduledConflict = true` | Asserted in `store.ts` event record |
| **5.4** | **Prevent False Alarm Dispatch** | **ZERO `OutageTicket` created** | `conflict.service.ts` | Guard: does NOT call dispatcher | Asserted in `runner.ts` line 145 |
| **5.5** | Inform customer automatically | Immediate 200 response with scheduled restoration time | `customer.router.ts` | JSON message: "Area under scheduled cut until HH:MM" | Asserted in `runner.ts` line 147 |

---

## 2. Hard Non-Negotiable System Invariants

| Invariant | Specification Source | Implementation File | Verification Test |
| :--- | :--- | :--- | :--- |
| **1. Critical Feeder Exclusion** | `requirment.txt` Journey 2 | `apps/api/src/services/scheduler.service.ts` | `runner.ts` line 123 (`!hospitalSelected`) |
| **2. Feeder Repeat-Cut Rule** | `requirment.txt`, `FEATURES.md` §3 | `apps/api/src/services/scheduler.service.ts` | `scheduler.service.ts` date filter check |
| **3. Server-Side RBAC Enforcement** | `BACKEND_IMPLEMENTATION.md` §Phase 8 | `apps/api/src/middleware/auth.ts` | `runner.ts` line 84 (`403 Forbidden` assertion) |
| **4. Repair Photo Before Resolution** | `BACKEND_IMPLEMENTATION.md` §Phase 19 | `apps/api/src/modules/technician.router.ts` | `technician.router.ts` requires `repairPhotoUrl` |
| **5. Redis Resiliency (Zero Downtime)**| `BACKEND_IMPLEMENTATION.md` Decision D-12 | `apps/api/src/services/cache.service.ts` | In-memory fallback verified in offline test |
