# Load Shedding & Power Outage Management System — Complete Implementation Blueprint

> **Master roadmap for sequential implementation.** This document is derived from the supplied project description and the supplied implementation-plan requirements. It is intended to be handed to an AI coding agent/developer as the single implementation roadmap.

## 0. Project Source of Truth

The project is a **Load Shedding & Power Outage Management System** intended for power-instability regions. The explicit goals are to automate fair load-shedding allocation, provide transparent schedules, and distinguish planned load shedding from unexpected hardware faults so technicians are dispatched only to genuine emergencies.

The five explicit roles are **Customer/Resident, Power Operator, Technician, Zone Manager, and Admin**. The required journeys are: customer planning/reporting; operator algorithmic schedule generation and publication; technician repair workflow; zone-manager live oversight and analytics; and a backend smart conflict-resolution workflow that rejects a technician ticket when a report occurs inside an active planned outage.

### Explicit technology stack

- Frontend: **Next.js App Router, Tailwind CSS, Shadcn UI**.
- Backend: **Node.js, Express.js, Socket.io, Node-cron**.
- Database: **Neon Serverless PostgreSQL, Prisma ORM**.
- Cache: **Upstash Redis**.
- Authentication/RBAC: **Auth.js / NextAuth**.
- Notifications: **Twilio API** for SMS.

### Explicit hard business rules

1. Operator scheduling must exclude **Critical Feeders**.
2. A generated plan must prevent a single area from being cut twice in the same day.
3. Customers must see current status and upcoming planned outages.
4. A customer outage report during an active planned outage must **not** create a repair ticket.
5. An unexpected outage report must create an outage ticket and trigger an acknowledgement message.
6. A technician progresses through the stated workflow: **Accept & En Route → Repairing → Resolved** and uploads a repair photo.
7. Resolution updates operational status and notifies affected customers.
8. Manager dashboards are **sortable/filterable Shadcn data tables**, not maps.
9. Published schedules are cached in Redis.
10. Technician accept/resolve actions must reach the manager dashboard through Socket.io in real time.
11. Node-cron is used for the stated automated background jobs, including hourly/simulation behavior.

### Ambiguity register — do not silently invent these

The source does **not** specify exact API route names, exact database fields, the precise mathematical fairness formula, the exact definition of "area" for the no-double-cut rule, automatic technician assignment logic, repair-photo storage provider, file limits, push-notification provider, public registration/verification workflow, time-zone policy, schedule recurrence rules, audit retention, or deployment platform. This blueprint proposes deterministic implementation boundaries for those items and marks decisions that must be recorded before their affected phase is coded.


## 1. Implementation Discipline

- Implement phases in order unless a later phase is a strict technical dependency; do not pull unrelated future features forward.
- Do not invent functionality that is not in this plan or approved in the decision log.
- Do not change the stated technology stack without explicit approval.
- Do not redesign the relational grid hierarchy unnecessarily; preserve **Zone → Feeder → Meter**.
- Do not create duplicate APIs for the same business operation.
- Backend validation and authorization are authoritative; frontend guards exist for UX only.
- Keep current-phase changes isolated; avoid unrelated refactors.
- Do not expose secrets, stack traces, SQL text, session secrets, provider credentials, or raw storage paths.
- Do not mark a phase complete until its objective verification steps pass.
- Preserve working behavior from prior phases.
- Use meaningful, incremental Git commits.
- When an ambiguity materially affects architecture or a contract, update the decision log first and then keep the plan/code/docs consistent.

## 2. Planned Repository Architecture

```text
/
├─ implementation.md
├─ README.md
├─ .gitignore
├─ frontend/
│  ├─ app/
│  │  ├─ (public)/
│  │  ├─ (auth)/
│  │  ├─ customer/
│  │  ├─ operator/
│  │  ├─ technician/
│  │  ├─ manager/
│  │  └─ admin/
│  ├─ components/
│  ├─ hooks/
│  ├─ lib/
│  ├─ types/
│  └─ tests/
├─ backend/
│  ├─ src/
│  │  ├─ config/
│  │  ├─ middleware/
│  │  ├─ modules/
│  │  │  ├─ auth/ users/ grid/ schedules/ outages/
│  │  │  ├─ notifications/ analytics/ upgrades/
│  │  │  ├─ realtime/ jobs/ audit/
│  │  ├─ integrations/
│  │  │  ├─ redis/ twilio/ storage/
│  │  └─ server/
│  ├─ prisma/
│  │  ├─ schema.prisma
│  │  ├─ migrations/
│  │  └─ seed/
│  └─ tests/
└─ docs/
   ├─ architecture.md
   ├─ api/
   ├─ database.md
   ├─ security.md
   ├─ deployment.md
   └─ decisions.md
```

Exact filenames may change with the real repository, but domain boundaries should not be casually changed.

## 3. Global API Contract

Base path: **`/api/v1`**.

Default protected request headers:
```text
Authorization: Bearer <access-token>
Content-Type: application/json
Accept: application/json
```

If Auth.js is ultimately integrated through server-managed cookies/session verification instead of bearer transport, document the chosen transport once and do not mix two authentication conventions accidentally.

Every endpoint must specify: method/path, purpose, authentication, authorization, headers, path parameters, query parameters, request body, validation, business logic, DB interaction, cache/event/notification side effects, success response, and error responses.

List endpoints must use bounded pagination; date/time inputs must use one documented wire format; server-owned IDs, roles, timestamps, relationships, and audit fields must not be mass-assignable.

## 4. Global Error Contract

Use a single error envelope with a stable machine-readable `code`, human-readable `message`, optional field-level details, and request/correlation ID where appropriate. Map failures consistently to:
- `400` malformed request/query/path values
- `401` missing/invalid authentication
- `403` authenticated but forbidden by role/scope/ownership
- `404` resource not found or intentionally hidden
- `409` state/uniqueness/concurrency conflict
- `413` oversized upload/request
- `415` unsupported file/media type
- `422` valid shape but impossible/business-rule violation
- `429` rate limit
- `500` unexpected internal error
- `502/503` external dependency/service availability where appropriate

Never send internal stack traces or provider credentials to clients.

## 5. Roles and Access Baseline

| Role | Core access |
|---|---|
| Customer | Own meter/location, current status, published schedule, own outage reports/history, notifications. |
| Power Operator | Operational monitoring, generate/review/publish load-shedding plans, assign faults if permitted by the final scope model. |
| Technician | Assigned outage queue, accept/en-route, start repair, upload repair photo, resolve. |
| Zone Manager | Own-zone live grid, fault queue, technician oversight, analytics, infrastructure-upgrade requests. |
| Admin | User/role management, full grid-infrastructure maintenance, audit/notification oversight. |

The backend must enforce least privilege and resource scope. Frontend route guards must mirror these rules but are never the security boundary.

## 6. Planned Database Inventory

| Entity | Purpose | Main relationships | Phase |
|---|---|---|---:|
| `User` | Identity, role, account status | manager/technician scope; customer meter binding | 06–09 |
| `Zone` | Operational district | 1:N Feeders; manager scope | 06 |
| `Feeder` | Scheduling/outage unit | belongs Zone; has Meters; may belong Substation; critical flag | 06 |
| `Meter` | Customer service-point key | belongs Feeder; customer binding | 06/11 |
| `Substation` | Grid infrastructure | serves Feeders | 06 |
| `LoadSheddingPlan` | Generated/published schedule container | 1:N ScheduleSlot | 14 |
| `LoadSheddingSlot` | Dated feeder outage interval | N:1 Plan, N:1 Feeder | 14 |
| `ScheduleGenerationRun` | Algorithm execution/audit | operator + plan | 14–16 |
| `OutageTicket` | Unexpected fault lifecycle | customer, meter, feeder, zone, technician, substation | 20–23 |
| `Attachment` | Repair-photo metadata | outage + uploader | 24 |
| `Notification` | SMS/notification delivery record | user + trigger | 19/28/33 |
| `InfrastructureUpgradeRequest` | Manager request for feeder improvement | feeder + requester | 31 |
| `AuditEvent` | Privileged/business audit trail | actor + target | 33 |
| `OutageEvent` (optional) | Full transition history | outage ticket | 21/23 |

Indexes should support exact meter lookup, feeder/zone filtering, schedule time-window queries, active-outage lookup, notification history, and analytics aggregations. Use transactions for state transitions, publication, assignments, and other multi-write operations.

## 7. User Journey End-to-End

### Customer
```text
Login/onboarding
  ↓
Bind Meter ID / exact location
  ↓
Resolve Meter → Feeder → Zone
  ↓
Dashboard: current status + upcoming week schedule
  ↓
Report Outage
  ↓
Check active planned schedule at current time
  ├─ Planned → inform customer, NO ticket, NO technician
  └─ Not planned → create unexpected ticket + acknowledgement SMS
                ↓
             Assignment
                ↓
        Technician En Route
                ↓
            Repairing
                ↓
       Photo upload + Resolve
                ↓
      Restoration notification + UI update
```

### Operator
```text
Login → Control Room → observe deficit → Generate Plan
→ algorithm excludes critical feeders and respects no-double-cut rule
→ Review Draft → Publish
→ DB commit → Redis refresh/invalidation → SMS notifications
```

### Technician
```text
Login → Assigned Queue → Ticket Detail
→ Accept & En Route → Repairing → Upload Repair Photo → Resolved
→ customer/manager state updates + restoration notification
```

### Zone Manager
```text
Login → Live Grid Table → filter Unexpected Faults
→ inspect/assign technician → observe real-time progress
→ monthly analytics → feeder/technician metrics
→ submit infrastructure upgrade request
```

### Admin
```text
Login → manage users/roles/scopes
          + manage zones/feeders/substations/meters/critical flags
          + inspect audit + notification delivery visibility
```

## 8. Frontend Page Inventory

| Route | Access | Main purpose |
|---|---|---|
| `/` | Public | Explain service and entry points |
| `/login` | Public | Sign in |
| `/403` `/404` | Public | Safe error pages |
| `/customer/location` | Customer | Set meter/location |
| `/customer/dashboard` | Customer | Status, upcoming schedule, active outage |
| `/customer/schedule` | Customer | Published schedule |
| `/customer/outages` | Customer | Report/history |
| `/customer/outages/[id]` | Customer | Ticket detail/timeline |
| `/customer/notifications` | Customer | Notification history |
| `/operator/dashboard` | Operator | Control room |
| `/operator/schedules` | Operator | Plans list |
| `/operator/schedules/generate` | Operator | Generate draft |
| `/operator/schedules/[id]` | Operator | Review/edit/publish |
| `/technician/outages` | Technician | Assigned queue |
| `/technician/outages/[id]` | Technician | Accept/repair/resolve/upload |
| `/manager/dashboard` | Zone Manager | Live grid |
| `/manager/grid` | Zone Manager | Sort/filter grid table |
| `/manager/outages` | Zone Manager | Fault queue + assignment |
| `/manager/outages/[id]` | Zone Manager | Oversight |
| `/manager/analytics` | Zone Manager | Monthly analytics |
| `/manager/upgrade-requests` | Zone Manager | Upgrade requests |
| `/admin/users` `/admin/users/[id]` | Admin | User management |
| `/admin/infrastructure` | Admin | Grid hierarchy maintenance |
| `/admin/audit` | Admin | Audit events |
| `/admin/notifications` | Admin | Delivery monitoring |

## 9. Feature → API → Page → Entity → Role Map

| Feature | API | Page | Entities | Role |
|---|---|---|---|---|
| Meter binding | `/customers/me/location` | customer/location | User, Meter, Feeder, Zone | Customer |
| Grid status | `/grid/status` | dashboards | Feeder, Schedule, Outage | Customer/Operator/Manager |
| Published schedule | `/schedules/my` | customer/schedule | Plan, Slot, Feeder | Customer |
| Plan generation | `/operator/schedules/generate` | operator/generate | GenerationRun, Plan, Slot | Operator |
| Plan publish | `/operator/schedules/:id/publish` | operator/schedules/[id] | Plan, Slot | Operator |
| Smart report | `/customers/me/outages` | customer/outages | Schedule, OutageTicket | Customer/System |
| Technician queue | `/technician/outages` | technician/outages | OutageTicket, User | Technician |
| Repair photo | `/technician/outages/:id/attachments` | technician/outages/[id] | Attachment | Technician |
| Live manager grid | REST + Socket.io | manager/grid | Feeder, Outage, Plan | Manager |
| Analytics | manager analytics APIs | manager/analytics | OutageTicket, Feeder | Manager |
| Upgrade request | manager upgrade APIs | manager/upgrade-requests | UpgradeRequest, Feeder | Manager |
| Admin infrastructure | admin topology APIs | admin/infrastructure | Zone, Feeder, Meter, Substation | Admin |
| Admin user management | admin user APIs | admin/users | User | Admin |
| SMS | internal Twilio adapter | notification history | Notification, User | System |
## 22. Phase-by-Phase Roadmap

# Phase 01 — Requirements Baseline & Decision Register

## Objective
Freeze the source requirements and explicit ambiguities before coding.

## Depends On
None

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Extract roles, hard rules, journeys, named technologies, and decision points. Create a decision log and requirement matrix. Do not write application code.

## In Scope
Extract roles, hard rules, journeys, named technologies, and decision points. Create a decision log and requirement matrix. Do not write application code.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Extract roles, hard rules, journeys, named technologies, and decision points. Create a decision log and requirement matrix. Do not write application code.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
No runtime APIs. Reserve `/api/v1` naming and contract conventions only.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
None.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- None.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Review every requirement against the source and ensure every ambiguity is listed with impact.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 02 — Repository & Engineering Conventions

## Objective
Prevent structural drift between phases and keep the coding agent deterministic.

## Depends On
01

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Define frontend/backend/docs boundaries, TypeScript/formatting/linting policy, scripts, commit boundaries, ignored artifacts, and module naming. Keep current-phase changes isolated.

## In Scope
Define frontend/backend/docs boundaries, TypeScript/formatting/linting policy, scripts, commit boundaries, ignored artifacts, and module naming. Keep current-phase changes isolated.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Define frontend/backend/docs boundaries, TypeScript/formatting/linting policy, scripts, commit boundaries, ignored artifacts, and module naming. Keep current-phase changes isolated.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
No business endpoint.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
Create only root/public/auth shell scaffolding.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- Create only root/public/auth shell scaffolding.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Clean checkout, lint, type-check, and base build definitions work; `.env`, temp, and build artifacts are ignored.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 03 — Express Backend Foundation

## Objective
Establish the runtime all backend domains depend on.

## Depends On
02

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Bootstrap Express, config loader boundary, middleware order, JSON parsing, graceful shutdown, structured logger boundary, and error handler shell.

## In Scope
Bootstrap Express, config loader boundary, middleware order, JSON parsing, graceful shutdown, structured logger boundary, and error handler shell.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Bootstrap Express, config loader boundary, middleware order, JSON parsing, graceful shutdown, structured logger boundary, and error handler shell.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
`GET /api/v1/health` — public; returns minimal service health without secrets.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
None beyond optional dev health call.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- None beyond optional dev health call.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Start backend, hit health endpoint, send malformed JSON, stop cleanly.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 04 — Next.js Frontend Foundation

## Objective
Establish the App Router shell and UI conventions before portals.

## Depends On
02, 03

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Set Tailwind/Shadcn conventions, public/authenticated layout boundaries, API client boundary, loading/error UI, and responsive shell.

## In Scope
Set Tailwind/Shadcn conventions, public/authenticated layout boundaries, API client boundary, loading/error UI, and responsive shell.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Set Tailwind/Shadcn conventions, public/authenticated layout boundaries, API client boundary, loading/error UI, and responsive shell.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
No business endpoint; optional health consumer only.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
`/`, `/login`, `/403`, `/404`.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- `/`, `/login`, `/403`, `/404`.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Build frontend, render shell, verify responsive behavior and API error mapping.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 05 — Environment & Configuration Contract

## Objective
Make all later integrations deterministic across dev/staging/prod.

## Depends On
03, 04

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Validate backend configuration and document DB, Redis, Auth.js, Twilio, API URL, CORS, cron, and eventual storage variables. Never store real values.

## In Scope
Validate backend configuration and document DB, Redis, Auth.js, Twilio, API URL, CORS, cron, and eventual storage variables. Never store real values.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Validate backend configuration and document DB, Redis, Auth.js, Twilio, API URL, CORS, cron, and eventual storage variables. Never store real values.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
No new public endpoint.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
No business page.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- No business page.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Run config with missing/invalid/complete values and verify secret-free errors.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 06 — Prisma Grid Hierarchy Schema

## Objective
Create the relational foundation for all location and operational workflows.

## Depends On
03, 05

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Model User/Zone/Feeder/Meter/Substation and role/scope attributes required for authorization. Preserve foreign-key hierarchy; do not introduce PostGIS.

## In Scope
Model User/Zone/Feeder/Meter/Substation and role/scope attributes required for authorization. Preserve foreign-key hierarchy; do not introduce PostGIS.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Model User/Zone/Feeder/Meter/Substation and role/scope attributes required for authorization. Preserve foreign-key hierarchy; do not introduce PostGIS.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
No client API.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
None.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- None.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Prisma validate/migrate; verify parent/child and uniqueness constraints.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 07 — Seed Data & Development Topology

## Objective
Make every later workflow reproducible with deterministic connected data.

## Depends On
06

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Seed all five roles, multiple zones/feeders/meters/substations, critical and non-critical feeders, and test topology. No real credentials/data.

## In Scope
Seed all five roles, multiple zones/feeders/meters/substations, critical and non-critical feeders, and test topology. No real credentials/data.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Seed all five roles, multiple zones/feeders/meters/substations, critical and non-critical feeders, and test topology. No real credentials/data.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
No new public endpoint.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
None.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- None.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Reset and reseed twice; verify idempotency or documented reset semantics and all relationships.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 08 — Auth.js Authentication Core

## Objective
Establish identity/session behavior before protected portals.

## Depends On
04, 06, 07

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Configure Auth.js/NextAuth, login/logout, session identity, role claim transport, secure cookies/session behavior, password handling if credentials auth is chosen.

## In Scope
Configure Auth.js/NextAuth, login/logout, session identity, role claim transport, secure cookies/session behavior, password handling if credentials auth is chosen.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Configure Auth.js/NextAuth, login/logout, session identity, role claim transport, secure cookies/session behavior, password handling if credentials auth is chosen.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
Auth flow through Auth.js; exact provider route is framework-managed. Add a documented backend identity/session verification contract.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
`/login`.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- `/login`.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Log in as each seeded role, log out, test invalid/expired session behavior.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 09 — RBAC & Resource Authorization

## Objective
Enforce strict five-role access and scope/ownership checks.

## Depends On
08

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Implement auth middleware, role middleware, manager-zone and technician-assignment scope, ownership checks, deny-by-default behavior.

## In Scope
Implement auth middleware, role middleware, manager-zone and technician-assignment scope, ownership checks, deny-by-default behavior.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Implement auth middleware, role middleware, manager-zone and technician-assignment scope, ownership checks, deny-by-default behavior.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
Protect sample route(s) and all future routes; no new business feature.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
Role-protected layout guards for each future portal.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- Role-protected layout guards for each future portal.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Matrix-test no-auth, wrong-role, wrong-scope, correct-scope for representative protected resources.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 10 — Admin Infrastructure APIs

## Objective
Allow admins to maintain the zone/feeder/substation/meter topology.

## Depends On
09, 06

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Build transactional CRUD with parent validation, unique constraints, critical-feeder designation, and safe archive/delete rules.

## In Scope
Build transactional CRUD with parent validation, unique constraints, critical-feeder designation, and safe archive/delete rules.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Build transactional CRUD with parent validation, unique constraints, critical-feeder designation, and safe archive/delete rules.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
`POST/GET/PATCH /api/v1/admin/zones`; same CRUD pattern for `/substations`, `/feeders`, `/meters`; `PATCH /api/v1/admin/feeders/:feederId/critical`. Admin-only.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
Defer polished admin UI; keep API-first.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- Defer polished admin UI; keep API-first.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Create valid hierarchy; attempt invalid parent, duplicates, non-admin access, and unsafe deletes.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 11 — Customer Meter & Location Resolution

## Objective
Provide deterministic Meter→Feeder→Zone lookup for customer workflows.

## Depends On
10, 09

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Bind a customer to a meter or approved exact-location representation; resolve derived hierarchy and prevent cross-customer binding.

## In Scope
Bind a customer to a meter or approved exact-location representation; resolve derived hierarchy and prevent cross-customer binding.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Bind a customer to a meter or approved exact-location representation; resolve derived hierarchy and prevent cross-customer binding.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
`GET/PATCH /api/v1/customers/me/location` — customer-owned resource; PATCH body at minimum `{meterId}` unless decision log adds fields.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
`/customer/location`.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- `/customer/location`.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Bind valid meter; attempt invalid/already-owned/other-user cases; verify derived feeder/zone.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 12 — Effective Grid Status Service

## Objective
Create one authoritative status computation used by customer, manager, and conflict logic.

## Depends On
10, 11

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Define precedence between Online, Planned Outage, Unexpected Fault, and Technician Dispatched/repair states. Use time-aware service logic rather than duplicated page logic.

## In Scope
Define precedence between Online, Planned Outage, Unexpected Fault, and Technician Dispatched/repair states. Use time-aware service logic rather than duplicated page logic.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Define precedence between Online, Planned Outage, Unexpected Fault, and Technician Dispatched/repair states. Use time-aware service logic rather than duplicated page logic.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
`GET /api/v1/grid/status` with bounded role-scoped filters.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
No final dashboard yet.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- No final dashboard yet.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Unit-test time boundaries and precedence; confirm customer cannot enumerate other zones.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 13 — Customer Dashboard API

## Objective
Expose current state and planning information in one customer-focused contract.

## Depends On
11, 12

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Aggregate profile, current status, upcoming planning window, active ticket summary, and recent notification summary with bounded queries.

## In Scope
Aggregate profile, current status, upcoming planning window, active ticket summary, and recent notification summary with bounded queries.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Aggregate profile, current status, upcoming planning window, active ticket summary, and recent notification summary with bounded queries.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
`GET /api/v1/customers/me`; `GET /api/v1/customers/me/dashboard`.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
`/customer/dashboard` scaffold.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- `/customer/dashboard` scaffold.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Validate own-data scope, bounded date ranges, missing-meter behavior, and efficient query shape.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 14 — Load-Shedding Schedule Data Model

## Objective
Persist dated planned outages as reviewable plans and feeder-specific slots.

## Depends On
12, 13

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Create Plan/Slot/GenerationRun lifecycle and publication metadata. Published history becomes immutable; corrections are explicit.

## In Scope
Create Plan/Slot/GenerationRun lifecycle and publication metadata. Published history becomes immutable; corrections are explicit.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Create Plan/Slot/GenerationRun lifecycle and publication metadata. Published history becomes immutable; corrections are explicit.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
No public API until generation is ready.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
No page.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- No page.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Test interval validity, overlap rules, lifecycle transitions, critical-feeder exclusion support.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 15 — Fair-Rotation Scheduling Engine

## Objective
Implement the project's core scheduling logic as a pure deterministic module.

## Depends On
14

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Inputs include requested shed MW and eligible feeder/history data. Enforce hard rules: no critical feeders and no repeated area cut in a day. Make output reproducible and inspectable.

## In Scope
Inputs include requested shed MW and eligible feeder/history data. Enforce hard rules: no critical feeders and no repeated area cut in a day. Make output reproducible and inspectable.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Inputs include requested shed MW and eligible feeder/history data. Enforce hard rules: no critical feeders and no repeated area cut in a day. Make output reproducible and inspectable.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
No HTTP endpoint yet; define internal algorithm contract.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
No page.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- No page.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Table/property tests for constraints, determinism, insufficient capacity, zero target, and boundary dates.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 16 — Operator Schedule Generation API

## Objective
Turn algorithm output into a persisted draft plan.

## Depends On
15, 09

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Validate operator input; load eligible data; run engine; persist GenerationRun + draft Plan/Slots transactionally. Never auto-publish.

## In Scope
Validate operator input; load eligible data; run engine; persist GenerationRun + draft Plan/Slots transactionally. Never auto-publish.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Validate operator input; load eligible data; run engine; persist GenerationRun + draft Plan/Slots transactionally. Never auto-publish.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
`POST /api/v1/operator/schedules/generate` — OPERATOR only; body contains dated planning window + positive requested shed MW and only approved options.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
`/operator/schedules/generate`; draft review scaffold.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- `/operator/schedules/generate`; draft review scaffold.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Valid request creates draft; invalid/impossible requests return 400/422; no notification or customer visibility occurs.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 17 — Schedule Review & Publish

## Objective
Implement the required explicit review-then-publish workflow.

## Depends On
16

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Allow draft inspection/edit within constraints, revalidate on publish, persist publication atomically, and emit post-commit hooks for cache/notification.

## In Scope
Allow draft inspection/edit within constraints, revalidate on publish, persist publication atomically, and emit post-commit hooks for cache/notification.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Allow draft inspection/edit within constraints, revalidate on publish, persist publication atomically, and emit post-commit hooks for cache/notification.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
`GET/PATCH /api/v1/operator/schedules/:scheduleId`; `POST /api/v1/operator/schedules/:scheduleId/publish` — operator/admin read, operator publish.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
`/operator/schedules`; `/operator/schedules/[id]`.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- `/operator/schedules`; `/operator/schedules/[id]`.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Double-publish/concurrent publish tests; confirm published records are immutable and downstream effects occur only after commit.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 18 — Published Schedule Reads & Redis Cache

## Objective
Protect Postgres from read spikes during outages.

## Depends On
17, 05

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Implement cache-aside reads, feeder/date keys, TTL, publish invalidation/refresh, Postgres fallback, and authorization before serving personalized data.

## In Scope
Implement cache-aside reads, feeder/date keys, TTL, publish invalidation/refresh, Postgres fallback, and authorization before serving personalized data.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Implement cache-aside reads, feeder/date keys, TTL, publish invalidation/refresh, Postgres fallback, and authorization before serving personalized data.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
`GET /api/v1/schedules/my`; `GET /api/v1/schedules/feeders/:feederId` with bounded date filters.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
Wire customer schedule section.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- Wire customer schedule section.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Test cache hit/miss, Redis outage fallback, stale key behavior, and scope isolation.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 19 — Notification Domain & Twilio SMS

## Objective
Provide the required SMS alerts without coupling domain logic directly to Twilio.

## Depends On
17, 18, 05

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Create provider adapter, notification records, message templates, idempotency strategy, and failure logging. Trigger scheduled, acknowledgement, and restoration messages through domain events.

## In Scope
Create provider adapter, notification records, message templates, idempotency strategy, and failure logging. Trigger scheduled, acknowledgement, and restoration messages through domain events.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Create provider adapter, notification records, message templates, idempotency strategy, and failure logging. Trigger scheduled, acknowledgement, and restoration messages through domain events.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
No arbitrary client SMS endpoint. Optional development-only admin test route must be disabled/restricted in production.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
Customer notification history integration point.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- Customer notification history integration point.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Mock provider tests, duplicate-event tests, and integration failure behavior.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 20 — Smart Outage Conflict Resolution

## Objective
Implement the project's key rule that planned outages suppress unnecessary fault tickets.

## Depends On
12, 18, 19, 11

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Resolve customer's feeder, check active published schedule at report time, branch to PLANNED_OUTAGE informational response or create OPEN ticket + acknowledgement event.

## In Scope
Resolve customer's feeder, check active published schedule at report time, branch to PLANNED_OUTAGE informational response or create OPEN ticket + acknowledgement event.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Resolve customer's feeder, check active published schedule at report time, branch to PLANNED_OUTAGE informational response or create OPEN ticket + acknowledgement event.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
`POST /api/v1/customers/me/outages` — customer-only; planned branch returns no ticket; unplanned branch creates ticket.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
`/customer/outages` and dashboard report action.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- `/customer/outages` and dashboard report action.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Test exact schedule start/end boundaries and concurrent reports; verify planned branch creates no ticket.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 21 — Outage Ticket State Machine

## Objective
Make unexpected faults traceable from report through resolution.

## Depends On
20

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Define and enforce OPEN/ASSIGNED if used/EN_ROUTE/REPAIRING/RESOLVED transitions, timestamps, assignment references, and transition auditability.

## In Scope
Define and enforce OPEN/ASSIGNED if used/EN_ROUTE/REPAIRING/RESOLVED transitions, timestamps, assignment references, and transition auditability.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Define and enforce OPEN/ASSIGNED if used/EN_ROUTE/REPAIRING/RESOLVED transitions, timestamps, assignment references, and transition auditability.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
`GET /api/v1/customers/me/outages`; `GET /api/v1/outages/:outageId`; `POST /api/v1/outages/:outageId/assign` with operator/manager scope.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
`/customer/outages`; `/customer/outages/[id]`.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- `/customer/outages`; `/customer/outages/[id]`.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Test every valid and invalid transition and concurrent assignment conditions.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 22 — Technician Queue & Acceptance

## Objective
Give technicians a safe assigned-work queue and atomic Accept & En Route action.

## Depends On
21, 09

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Scope queue to assigned technician, show site/GPS context, and protect acceptance with atomic concurrency control.

## In Scope
Scope queue to assigned technician, show site/GPS context, and protect acceptance with atomic concurrency control.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Scope queue to assigned technician, show site/GPS context, and protect acceptance with atomic concurrency control.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
`GET /api/v1/technician/outages`; `POST /api/v1/technician/outages/:outageId/accept` — assigned technician only.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
`/technician/outages`; `/technician/outages/[id]`.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- `/technician/outages`; `/technician/outages/[id]`.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Run two-technician acceptance race; only the assigned/first valid transition succeeds.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 23 — Technician Repair Progress & Resolution

## Objective
Implement Repairing and Resolved actions from the source journey.

## Depends On
22

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Enforce EN_ROUTE→REPAIRING→RESOLVED, collect required resolution information, and emit one restoration event after commit.

## In Scope
Enforce EN_ROUTE→REPAIRING→RESOLVED, collect required resolution information, and emit one restoration event after commit.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Enforce EN_ROUTE→REPAIRING→RESOLVED, collect required resolution information, and emit one restoration event after commit.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
`POST /api/v1/technician/outages/:outageId/start-repair`; `POST /api/v1/technician/outages/:outageId/resolve`.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
Repair controls on technician detail page.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- Repair controls on technician detail page.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Complete a ticket end-to-end and attempt invalid state jumps/re-resolution.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 24 — Repair Photo Upload Boundary

## Objective
Support the required technician repair photo securely.

## Depends On
23

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Add multipart validation, attachment metadata, ownership checks, storage adapter abstraction, and safe reference handling. Do not store raw binaries in Postgres unless explicitly decided.

## In Scope
Add multipart validation, attachment metadata, ownership checks, storage adapter abstraction, and safe reference handling. Do not store raw binaries in Postgres unless explicitly decided.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Add multipart validation, attachment metadata, ownership checks, storage adapter abstraction, and safe reference handling. Do not store raw binaries in Postgres unless explicitly decided.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
`POST /api/v1/technician/outages/:outageId/attachments`; `GET /api/v1/outages/:outageId/attachments`.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
Technician detail upload UI.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- Technician detail upload UI.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Mock storage; test valid/invalid MIME, oversized file, wrong ticket, storage failure, and metadata access.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 25 — Socket.io Authenticated Event Backbone

## Objective
Broadcast technician status changes to authorized operational dashboards.

## Depends On
23, 09

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Add authenticated sockets, role-scoped rooms, event types, reconnect rules, and post-commit emission for outage/schedule changes.

## In Scope
Add authenticated sockets, role-scoped rooms, event types, reconnect rules, and post-commit emission for outage/schedule changes.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Add authenticated sockets, role-scoped rooms, event types, reconnect rules, and post-commit emission for outage/schedule changes.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
Socket events rather than new REST endpoint: `outage.created`, `outage.assigned`, `outage.en_route`, `outage.repairing`, `outage.resolved`, `schedule.published`.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
Add reusable socket provider/hook, no final dashboard yet.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- Add reusable socket provider/hook, no final dashboard yet.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Verify room authorization, reconnect, duplicate event tolerance, and post-commit event ordering.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 26 — Zone Manager Live Grid Dashboard

## Objective
Deliver the required real-time sortable/filterable data-table dashboard.

## Depends On
25, 12

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Build scoped manager grid, filter Unexpected Faults, show red/yellow/green badges for Unexpected/Planned/Online, and apply socket row updates.

## In Scope
Build scoped manager grid, filter Unexpected Faults, show red/yellow/green badges for Unexpected/Planned/Online, and apply socket row updates.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Build scoped manager grid, filter Unexpected Faults, show red/yellow/green badges for Unexpected/Planned/Online, and apply socket row updates.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
`GET /api/v1/manager/grid` — ZONE_MANAGER; query status/zone/feeder/search/sort/page/limit.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
`/manager/dashboard`; `/manager/grid`.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- `/manager/dashboard`; `/manager/grid`.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Trigger technician accept/resolve and verify row updates without manual full reload; verify socket disconnect fallback.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 27 — Operator Control Room Dashboard

## Objective
Complete the operator-facing monitoring and scheduling interface.

## Depends On
17, 18, 25

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Combine overview, current grid state, deficit input, generation action, draft list, review, and publish controls. Do not add unsourced telemetry integrations.

## In Scope
Combine overview, current grid state, deficit input, generation action, draft list, review, and publish controls. Do not add unsourced telemetry integrations.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Combine overview, current grid state, deficit input, generation action, draft list, review, and publish controls. Do not add unsourced telemetry integrations.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
`GET /api/v1/operator/overview` — operator/admin read; aggregation only, no duplicated business logic.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
`/operator/dashboard`.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- `/operator/dashboard`.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Walk login→overview→generate→review→publish; verify role rejection for all other roles.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 28 — Customer Schedule/Notification/Outage UX Completion

## Objective
Finish the transparent customer experience promised by the source journeys.

## Depends On
18, 19, 20, 21

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Complete schedule, outage report, ticket timeline, notifications, loading/empty/error states, and restoration messaging.

## In Scope
Complete schedule, outage report, ticket timeline, notifications, loading/empty/error states, and restoration messaging.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Complete schedule, outage report, ticket timeline, notifications, loading/empty/error states, and restoration messaging.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
`GET /api/v1/customers/me/notifications` plus prior customer contracts.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
`/customer/dashboard`, `/customer/schedule`, `/customer/outages`, `/customer/outages/[id]`, `/customer/notifications`.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- `/customer/dashboard`, `/customer/schedule`, `/customer/outages`, `/customer/outages/[id]`, `/customer/notifications`.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Run planned and unexpected report scenarios through UI and confirm different branches are obvious.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 29 — Manager Fault Queue & Assignment Oversight

## Objective
Let managers filter Unexpected Faults and ensure technician assignment/progress.

## Depends On
21, 22, 26

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Implement zone-scoped fault queue, technician list, assignment dialog, and live status integration. Baseline assignment is manual; no hidden auto-dispatch algorithm.

## In Scope
Implement zone-scoped fault queue, technician list, assignment dialog, and live status integration. Baseline assignment is manual; no hidden auto-dispatch algorithm.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Implement zone-scoped fault queue, technician list, assignment dialog, and live status integration. Baseline assignment is manual; no hidden auto-dispatch algorithm.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
`GET /api/v1/manager/outages`; `GET /api/v1/manager/technicians`; `PATCH /api/v1/manager/outages/:outageId/assignment`.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
`/manager/outages`; `/manager/outages/[id]`.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- `/manager/outages`; `/manager/outages/[id]`.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Test scope, no-eligible-technician, concurrency, and live status after assignment.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 30 — Manager Analytics & Monthly Reporting

## Objective
Provide the explicit feeder-failure and technician-resolution analytics.

## Depends On
21, 26, 29

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Use bounded aggregate queries and define metric semantics, timestamps, scope, and time-zone behavior. Avoid unbounded reports.

## In Scope
Use bounded aggregate queries and define metric semantics, timestamps, scope, and time-zone behavior. Avoid unbounded reports.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Use bounded aggregate queries and define metric semantics, timestamps, scope, and time-zone behavior. Avoid unbounded reports.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
`GET /api/v1/manager/analytics/feeder-failures`; `GET /api/v1/manager/analytics/technician-resolution`.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
`/manager/analytics`.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- `/manager/analytics`.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Use deterministic fixtures with known failure counts and resolution durations; compare exact results.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 31 — Infrastructure Upgrade Requests

## Objective
Implement the manager's formal request for feeder improvements.

## Depends On
30, 10, 09

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Persist feeder-linked requests, requester, rationale, evidence references/metrics, and status. Do not claim physical upgrade execution or a full approval system unless approved.

## In Scope
Persist feeder-linked requests, requester, rationale, evidence references/metrics, and status. Do not claim physical upgrade execution or a full approval system unless approved.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Persist feeder-linked requests, requester, rationale, evidence references/metrics, and status. Do not claim physical upgrade execution or a full approval system unless approved.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
`POST /api/v1/manager/upgrade-requests`; `GET /api/v1/manager/upgrade-requests`.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
`/manager/upgrade-requests`; analytics action.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- `/manager/upgrade-requests`; analytics action.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Create valid and out-of-scope requests; inspect audit/requester identity.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 32 — Admin User & Scope Management

## Objective
Allow Admin to maintain user accounts and operational scopes.

## Depends On
09, 10, 31

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
List/search users, change role, enable/disable, and assign manager/technician scope. Protect against unsafe self-disable/privilege mistakes.

## In Scope
List/search users, change role, enable/disable, and assign manager/technician scope. Protect against unsafe self-disable/privilege mistakes.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
List/search users, change role, enable/disable, and assign manager/technician scope. Protect against unsafe self-disable/privilege mistakes.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
`GET /api/v1/admin/users`; `GET /api/v1/admin/users/:userId`; `PATCH /role`; `PATCH /status`; `PATCH /scope`.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
`/admin/users`; `/admin/users/[id]`.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- `/admin/users`; `/admin/users/[id]`.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Change test user's role and verify access changes; attempt forbidden self-lockout behavior.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 33 — Admin Audit & Notification Visibility

## Objective
Provide administrative traceability for critical actions and SMS outcomes.

## Depends On
32, 19, 23

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Create audit-event recording for privileged/business actions and read-only admin views for audit and notification delivery metadata with redaction.

## In Scope
Create audit-event recording for privileged/business actions and read-only admin views for audit and notification delivery metadata with redaction.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Create audit-event recording for privileged/business actions and read-only admin views for audit and notification delivery metadata with redaction.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
`GET /api/v1/admin/audit`; `GET /api/v1/admin/notifications`.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
`/admin/audit`; `/admin/notifications`.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- `/admin/audit`; `/admin/notifications`.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Trigger publish/assign/resolve/role-change and verify audit rows without secrets.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 34 — Node-cron Background Jobs

## Objective
Implement the required hourly/simulation automation safely.

## Depends On
15, 17, 19, 20, 23

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Add explicit job handlers, cron schedules, idempotency/locking strategy, safe local disablement, and failure logging. Call domain services, never duplicate business rules.

## In Scope
Add explicit job handlers, cron schedules, idempotency/locking strategy, safe local disablement, and failure logging. Call domain services, never duplicate business rules.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Add explicit job handlers, cron schedules, idempotency/locking strategy, safe local disablement, and failure logging. Call domain services, never duplicate business rules.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
No public business endpoint; optional diagnostics later.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
No required page.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- No required page.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Run jobs manually in test mode and verify repeat execution does not duplicate schedules/tickets/notifications.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 35 — Realtime Refresh Extension

## Objective
Extend event-driven refresh where useful without making Socket.io the source of truth.

## Depends On
25, 26, 28

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Allow schedule publication and customer/operator status refresh events where approved; REST snapshot remains authoritative after reconnect.

## In Scope
Allow schedule publication and customer/operator status refresh events where approved; REST snapshot remains authoritative after reconnect.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Allow schedule publication and customer/operator status refresh events where approved; REST snapshot remains authoritative after reconnect.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
No new public endpoint.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
Reuse socket hooks on affected dashboards.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- Reuse socket hooks on affected dashboards.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Disconnect/reconnect after state mutation and verify snapshot reconciliation.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 36 — Complete Validation Contract

## Objective
Make every API/form deterministic and safe.

## Depends On
10–35

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Document and implement schemas for IDs, dates, numbers, enums, phone fields, schedule intervals, transition states, file uploads, filters, and cross-field rules. Backend remains authoritative.

## In Scope
Document and implement schemas for IDs, dates, numbers, enums, phone fields, schedule intervals, transition states, file uploads, filters, and cross-field rules. Backend remains authoritative.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Document and implement schemas for IDs, dates, numbers, enums, phone fields, schedule intervals, transition states, file uploads, filters, and cross-field rules. Backend remains authoritative.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
Review every endpoint introduced so far and freeze request/response schemas.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
Apply shared validation to every implemented form/page.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- Apply shared validation to every implemented form/page.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Run invalid-input matrix across all high-value endpoints and forms.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 37 — Central Error Handling & UX

## Objective
Prevent inconsistent exceptions and raw internal errors.

## Depends On
36, 03, 04

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Finalize error taxonomy, codes, request IDs, retry rules, frontend mapping, toast/inline/skeleton/empty/error states.

## In Scope
Finalize error taxonomy, codes, request IDs, retry rules, frontend mapping, toast/inline/skeleton/empty/error states.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Finalize error taxonomy, codes, request IDs, retry rules, frontend mapping, toast/inline/skeleton/empty/error states.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
Ensure every route returns stable status/code/shape.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
Update all role pages to handle 400/401/403/404/409/422/500/network/socket failures.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- Update all role pages to handle 400/401/403/404/409/422/500/network/socket failures.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Intentionally trigger representative errors and verify no stack traces or secrets reach the client.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 38 — Security Hardening

## Objective
Harden the system before performance and release work.

## Depends On
09, 24, 36, 37

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Apply secure auth/session settings, CORS, rate limits, request limits, input handling, IDOR prevention, upload security, secure headers, secret redaction, abuse controls.

## In Scope
Apply secure auth/session settings, CORS, rate limits, request limits, input handling, IDOR prevention, upload security, secure headers, secret redaction, abuse controls.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Apply secure auth/session settings, CORS, rate limits, request limits, input handling, IDOR prevention, upload security, secure headers, secret redaction, abuse controls.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
Review all protected endpoints for role/scope/ownership enforcement.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
Verify route guards and safe error states across all portals.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- Verify route guards and safe error states across all portals.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Run authorization matrix, upload abuse tests, oversized pagination, auth rate-limit tests, and dependency/security audit.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 39 — Performance & Query Optimization

## Objective
Make schedule reads and operational tables efficient under bursty usage.

## Depends On
18, 30, 38

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Add/refine indexes, bound page sizes/date ranges, remove N+1 queries, optimize aggregates, verify Redis cache-aside, debounce searches, minimize unnecessary client requests.

## In Scope
Add/refine indexes, bound page sizes/date ranges, remove N+1 queries, optimize aggregates, verify Redis cache-aside, debounce searches, minimize unnecessary client requests.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Add/refine indexes, bound page sizes/date ranges, remove N+1 queries, optimize aggregates, verify Redis cache-aside, debounce searches, minimize unnecessary client requests.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
No new public endpoint.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
Optimize schedule, manager grid, notifications, and analytics pages.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- Optimize schedule, manager grid, notifications, and analytics pages.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Use representative concurrent reads and inspect query plans/cache hit behavior.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 40 — Responsive, Accessible UX Completion

## Objective
Ensure dashboards and field workflows work on mobile/tablet/desktop.

## Depends On
26, 27, 28, 32

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Complete keyboard navigation, labels, focus management, status text plus color, responsive tables/forms/dialogs, and readable mobile technician flow.

## In Scope
Complete keyboard navigation, labels, focus management, status text plus color, responsive tables/forms/dialogs, and readable mobile technician flow.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Complete keyboard navigation, labels, focus management, status text plus color, responsive tables/forms/dialogs, and readable mobile technician flow.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
No backend change.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
All implemented pages.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- All implemented pages.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Manual keyboard pass and viewport checks from narrow mobile through desktop widths.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 41 — Backend Test Suite Completion

## Objective
Create a reliable regression suite for critical domain logic.

## Depends On
36, 37, 38

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Complete unit/service/controller/integration coverage for algorithm, conflict resolution, state machine, auth, cache fallback, Twilio adapter, file adapter, sockets, and cron handlers.

## In Scope
Complete unit/service/controller/integration coverage for algorithm, conflict resolution, state machine, auth, cache fallback, Twilio adapter, file adapter, sockets, and cron handlers.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Complete unit/service/controller/integration coverage for algorithm, conflict resolution, state machine, auth, cache fallback, Twilio adapter, file adapter, sockets, and cron handlers.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
Every endpoint gets happy-path + authorization + validation + material business-rule coverage.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
No new UI.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- No new UI.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Run tests from clean DB twice; verify deterministic fixtures and no production credentials.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 42 — Frontend Test Suite Completion

## Objective
Protect route guards, forms, tables, data states, and realtime UI.

## Depends On
41, 40

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Test critical components/pages, API client mapping, protected navigation, forms, table filters, loading/empty/error states, and socket updates.

## In Scope
Test critical components/pages, API client mapping, protected navigation, forms, table filters, loading/empty/error states, and socket updates.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Test critical components/pages, API client mapping, protected navigation, forms, table filters, loading/empty/error states, and socket updates.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
Use mocked/staging API contracts; no production dependency.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
All implemented pages.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- All implemented pages.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Run clean-install frontend test suite and verify role-specific flows.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 43 — End-to-End Role Journeys

## Objective
Prove the application works as a connected system.

## Depends On
41, 42, 34

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Automate customer planned/unplanned cases, operator scheduling, technician repair/photo, manager live/analytics/request, and admin maintenance.

## In Scope
Automate customer planned/unplanned cases, operator scheduling, technician repair/photo, manager live/analytics/request, and admin maintenance.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Automate customer planned/unplanned cases, operator scheduling, technician repair/photo, manager live/analytics/request, and admin maintenance.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
Exercise actual UI/API/DB/event/notification paths in a test environment.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
All core pages.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- All core pages.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Run all five journeys from clean seeded state, including at least one failure branch per journey.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 44 — Observability, Logging & Health

## Objective
Make production failures diagnosable without exposing sensitive information.

## Depends On
38, 39, 41

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Structured logs, request IDs, auth/business/cron logs, redaction, liveness/readiness, dependency health behavior. Monitoring vendor remains provider-neutral.

## In Scope
Structured logs, request IDs, auth/business/cron logs, redaction, liveness/readiness, dependency health behavior. Monitoring vendor remains provider-neutral.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Structured logs, request IDs, auth/business/cron logs, redaction, liveness/readiness, dependency health behavior. Monitoring vendor remains provider-neutral.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
`GET /api/v1/health/live`; `GET /api/v1/health/ready` where deployment needs them.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
Optional admin operational status if backed by real monitoring data.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- Optional admin operational status if backed by real monitoring data.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Fail dependencies in staging-like conditions and verify health/logging behavior.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 45 — API Documentation & Contract Freeze

## Objective
Eliminate API drift before deployment.

## Depends On
41, 42, 43

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Reconcile route registry, frontend calls, tests, API docs, Postman collection if used, headers, bodies, queries, errors, and auth scopes.

## In Scope
Reconcile route registry, frontend calls, tests, API docs, Postman collection if used, headers, bodies, queries, errors, and auth scopes.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Reconcile route registry, frontend calls, tests, API docs, Postman collection if used, headers, bodies, queries, errors, and auth scopes.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
Freeze all `/api/v1` contracts; de-duplicate accidental routes.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
No new page.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- No new page.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Every coded route appears in docs and every documented route exists; every frontend call maps to one contract.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 46 — Production Deployment Architecture

## Objective
Deploy the multi-service stack safely.

## Depends On
44, 45

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Document backend/frontend builds, Neon migration, Redis, Auth.js, Twilio, Socket.io/CORS, cron process behavior, health checks, and production env management. Provider-neutral until selected.

## In Scope
Document backend/frontend builds, Neon migration, Redis, Auth.js, Twilio, Socket.io/CORS, cron process behavior, health checks, and production env management. Provider-neutral until selected.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Document backend/frontend builds, Neon migration, Redis, Auth.js, Twilio, Socket.io/CORS, cron process behavior, health checks, and production env management. Provider-neutral until selected.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
Production route/startup/health behavior must match docs.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
Verify production build, API URL, cookies, websocket URL, and routing.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- Verify production build, API URL, cookies, websocket URL, and routing.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Run staging-like deployment smoke test from clean build artifacts.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 47 — Git, CI & Release Process

## Objective
Make the project reproducible and maintainable after initial delivery.

## Depends On
45, 46

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Add CI for lint/type-check/test/build, migration validation, clean-checkout verification, and phase-aligned commits. Keep secrets/artifacts out of source.

## In Scope
Add CI for lint/type-check/test/build, migration validation, clean-checkout verification, and phase-aligned commits. Keep secrets/artifacts out of source.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Add CI for lint/type-check/test/build, migration validation, clean-checkout verification, and phase-aligned commits. Keep secrets/artifacts out of source.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
No new public endpoint.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
No new page.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- No new page.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
Clone clean repository and run CI-equivalent commands; inspect tracked files and `.gitignore`.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---

# Phase 48 — Final System Audit & Handoff

## Objective
Reconcile requirements, code contracts, database, pages, roles, tests, integrations, deployment, and documentation.

## Depends On
All previous phases

## Why This Phase Exists
This phase is placed here because later features depend on the contracts, data, security boundaries, or runtime behavior established in the dependency column. It must not absorb unrelated future work.

## Scope
Perform final API/page/entity mapping, dependency review, security review, journey review, and open-decision closure. No unrelated features are added during audit.

## In Scope
Perform final API/page/entity mapping, dependency review, security review, journey review, and open-decision closure. No unrelated features are added during audit.

## Out of Scope
Future-phase functionality, unrelated refactors, silent technology changes, and any requirement not listed in this phase.

## Backend Work
Perform final API/page/entity mapping, dependency review, security review, journey review, and open-decision closure. No unrelated features are added during audit.

## Database Work
Use only the entities/relationships required by this phase. Preserve existing migrations and constraints. If a new field/entity is necessary but not source-defined, record it in the decision log before implementation.

## API Work
Verify every endpoint is documented and permissioned.

For every API in this phase, the implementation must document: authentication, authorization, required headers, path/query parameters, request body, validation, success response, error responses, DB interaction, and side effects.

## Frontend Work
Verify every protected route and every journey.

Build loading, empty, success, error, and unauthorized states. Keep server/client component boundaries deliberate and reuse shared components instead of creating role-specific duplicates.

## Pages
- Verify every protected route and every journey.

## Components
Use the smallest reusable set needed by the listed page/workflow: forms, tables, filters, status badges, dialogs, skeletons, error states, and navigation primitives as applicable.

## User Journey
The phase must connect cleanly to the stated project journey and must not create a new user journey that is absent from the source. Where the phase is infrastructural, the output is consumed by a named role/workflow in later phases.

## Security
Enforce the role/scope/ownership boundary appropriate to this phase. Never trust IDs or role values supplied by the browser, and never expose secrets or internal implementation details.

## Error Handling
Reject malformed input, missing resources, invalid states, unauthorized access, business-rule conflicts, and external dependency failures with the global error contract.

## Testing
At minimum, cover the happy path, required validation failures, authorization failures, important business-rule failures, and regression behavior for prior phases.

## Documentation
Update the relevant API, architecture, database, user-journey, security, or deployment documentation immediately when this phase changes its contract.

## Environment Variables
Use only variables already defined in the environment contract or variables explicitly added to the decision log. Never place real secrets in code or documentation.

## Files Expected To Change
Expected locations are the corresponding backend module, Prisma migration/schema when required, frontend route/components when applicable, tests, and documentation. Do not invent exact filenames before the architecture establishes them.

## Completion Criteria
- [ ] The phase objective is implemented exactly within the stated scope.
- [ ] Required validation and authorization checks exist.
- [ ] No previously working behavior is broken.
- [ ] Required tests for the phase pass.
- [ ] API/UI/database documentation affected by the phase is updated.
- [ ] No secrets, temporary files, or unrelated changes are committed.

## Verification
All inventories reconcile; all critical E2E tests pass; unresolved decisions have documented owners/impact; blueprint and docs are internally consistent.

Then run the appropriate lint/type-check/test/build checks and inspect the changed DB/API/UI behavior before moving to the next phase.

## Output
A stable, testable milestone that exposes the exact dependency required by the next phase and does not require the coding agent to guess hidden work.

---


## 10. API Contract Details by Domain

The exact route names below are the planned contract because the source did not supply route names. The coding agent must not create a second naming scheme.

### Authentication
Auth.js/NextAuth owns the browser authentication flow. The exact provider is a decision. If the Express API receives bearer access tokens, validate them in backend middleware; if it uses secure server-managed sessions, document that boundary once. Do not accept an arbitrary user ID from a customer to identify the current user.

### Grid / customer location
**GET `/api/v1/grid/status`**
- Auth: authenticated.
- Authorization: role-scoped; customer gets only own feeder context; manager gets own zones; operator/admin get operational scope.
- Query: bounded `zoneId`, `feederId`, `status`, `search`, `sort`, `page`, `limit` as appropriate.
- Body: none.
- Response: rows containing zone/feeder identifiers, effective status, relevant interval/ticket timestamp.
- Errors: 400/401/403/404.

**GET `/api/v1/customers/me/location`**
- Auth: authenticated customer; no path/body.
- Response: customer-safe meter + feeder + zone summary.

**PATCH `/api/v1/customers/me/location`**
- Auth: authenticated customer.
- Body: `{ meterId, ...approved-location-fields }`; only fields explicitly approved in the decision log may be added.
- Errors: 400/404/409.

### Customer dashboard and schedule
**GET `/api/v1/customers/me`** — own profile summary.

**GET `/api/v1/customers/me/dashboard`**
- Query: bounded `from/to` or server default planning window.
- Response: current status, upcoming schedule slots, active outage summary, recent notification summary.

**GET `/api/v1/schedules/my`**
- Query: bounded `from/to`.
- Auth: customer.
- Logic: resolve own feeder, read Redis cache, fall back to Postgres.

**GET `/api/v1/schedules/feeders/:feederId`**
- Auth: operator/manager/admin; any customer access must still be self-scoped and must be explicitly approved.
- Query: bounded `from/to`.

### Operator scheduling
**POST `/api/v1/operator/schedules/generate`**
- Auth: OPERATOR.
- Body: planning date/window, requested shed MW, approved constraints.
- Validation: positive MW, valid interval, allowed date window.
- Logic: load eligible history, exclude critical feeders, enforce no-double-cut rule, run deterministic scheduler, persist draft.
- Success: 201.
- Errors: 400/403/409/422.

**GET `/api/v1/operator/schedules/:scheduleId`** — operator/admin read.

**PATCH `/api/v1/operator/schedules/:scheduleId`**
- Auth: OPERATOR.
- Only editable while draft.
- Re-run constraints on every edit.

**POST `/api/v1/operator/schedules/:scheduleId/publish`**
- Auth: OPERATOR.
- No customer-controlled payload needed.
- Revalidate, atomically publish, then trigger post-commit cache/notification work.

### Outage lifecycle
**POST `/api/v1/customers/me/outages`**
- Auth: CUSTOMER.
- Logic: resolve own feeder → check current planned interval → planned branch returns informational state with no ticket; otherwise create unexpected ticket.
- Errors: 400/401/404/409.

**GET `/api/v1/customers/me/outages`** — customer-owned history with bounded pagination.

**GET `/api/v1/outages/:outageId`** — customer/technician/manager/operator/admin, each subject to scope and field filtering.

**POST `/api/v1/outages/:outageId/assign`**
- Auth: operator/zone manager according to operational scope.
- Body: `{ technicianId }`.
- Logic: assignment only if ticket is in assignable state; emit event after commit.

### Technician operations
**GET `/api/v1/technician/outages`**
- Query: bounded status/search/page/sort.
- Returns only assigned work.

**POST `/api/v1/technician/outages/:outageId/accept`**
- Auth: assigned technician.
- Body: none.
- Logic: atomic OPEN/ASSIGNED → EN_ROUTE transition.

**POST `/api/v1/technician/outages/:outageId/start-repair`**
- Auth: assigned technician; optional note.
- Logic: EN_ROUTE → REPAIRING.

**POST `/api/v1/technician/outages/:outageId/resolve`**
- Auth: assigned technician.
- Body: resolution fields plus approved attachment reference.
- Logic: REPAIRING → RESOLVED, emit restoration event exactly once.

**POST `/api/v1/technician/outages/:outageId/attachments`**
- Auth: assigned technician.
- Header: `Content-Type: multipart/form-data`.
- Body: repair photo plus optional caption.
- Validation: provider-approved image MIME/type/size rules; exact limits must be decided and documented.

**GET `/api/v1/outages/:outageId/attachments`**
- Auth: same scope as ticket access.
- Never expose raw private filesystem/object-store credentials or paths.

### Manager operations
**GET `/api/v1/manager/grid`** — zone-scoped table; query status/search/sort/page/limit.

**GET `/api/v1/manager/outages`** — zone-scoped fault queue; query status/feeder/technician/search/sort/page/limit.

**GET `/api/v1/manager/technicians`** — technicians within manager scope.

**PATCH `/api/v1/manager/outages/:outageId/assignment`** — assign/change technician within scope.

**GET `/api/v1/manager/analytics/feeder-failures`** — bounded date range plus optional feeder/zone filters.

**GET `/api/v1/manager/analytics/technician-resolution`** — bounded date range plus optional technician filter; resolution duration based on documented timestamps.

**POST `/api/v1/manager/upgrade-requests`** — feeder + rationale + approved evidence fields.

**GET `/api/v1/manager/upgrade-requests`** — scoped, paginated list.

### Admin operations
Admin topology and user routes are described in the phase sections. Admin list endpoints must support bounded pagination/filtering, never return passwords/session secrets, and must protect role/scope mutation with explicit validation.

### Notifications
**GET `/api/v1/customers/me/notifications`** — own notification history only; bounded pagination.

**GET `/api/v1/admin/notifications`** — delivery metadata and provider status where available; no provider secrets.

### Audit
**GET `/api/v1/admin/audit`** — bounded read-only audit query with actor/action/entity/date filters.

### Health
`GET /api/v1/health` is basic service health. `/live` and `/ready` may be added where deployment requires separate liveness/readiness semantics. Health responses must not expose DB URLs, Redis tokens, or Twilio configuration.

## 11. Algorithm Contract

The scheduler must be a **pure, deterministic, testable module**. It receives normalized inputs and returns a draft plan plus an explanation/constraint trace.

### Hard constraints from the source

1. Never select a Critical Feeder.
2. Do not cut a protected area twice within the same day.
3. Do not output intervals outside the requested planning window.
4. If the requested shed amount is impossible under the hard constraints, return an explicit unsatisfied-capacity result rather than violating a rule.

### Fairness behavior

The source requires a fair-rotation approach but does not define the exact mathematical objective. Therefore the plan must not invent a hidden score and present it as a source requirement. The first implementation should maintain the history necessary for deterministic rotation/tie-breaking and document the exact chosen formula in `docs/decisions.md` before relying on it for production scheduling.

### Algorithm outputs

At minimum:
- selected feeders/slots,
- requested vs achievable shed amount,
- excluded critical feeders,
- duplicate-cut constraint decisions,
- date/time interval used,
- generation metadata sufficient for operator review.

## 12. State Machines

### Schedule
```text
DRAFT → PUBLISHED
DRAFT → CANCELLED (only if cancellation is selected)
PUBLISHED → immutable history; corrections require a documented new plan/correction flow
```

### Unexpected outage
```text
OPEN/ASSIGNED → EN_ROUTE → REPAIRING → RESOLVED
```

A report inside an active planned slot does not enter the fault-ticket state machine.

## 13. Notifications

Required domain triggers:
1. **Published schedule:** notify affected customers by Twilio SMS.
2. **Unexpected fault report accepted:** acknowledgement SMS.
3. **Outage resolved:** restoration SMS to affected customers.

Use an adapter interface so controllers/services never call Twilio directly. Provider failures must be logged and represented in notification status without rolling back an already-committed domain state unless an explicitly chosen transactional-outbox design says otherwise.

The source mentions push notifications but does not name a push provider. Do not add a push SDK until that decision is explicit.

## 14. Background Jobs

Node-cron jobs must be thin orchestration wrappers around domain services. The source calls for automated background work including an hourly load-shedding script and simulated national-grid fluctuations.

Requirements:
- explicit cron expressions,
- `CRON_ENABLED` or equivalent control,
- idempotency,
- safe behavior across restarts,
- clear logs and failure metrics,
- no duplicated business rules inside cron handlers,
- no production use of simulation logic as if it were real telemetry.

## 15. Performance & Data Access Rules

- All list endpoints are paginated.
- All analytics date windows are bounded.
- Schedule reads are cache-aside through Upstash Redis.
- Customer-specific cache keys must never be reusable across users without a verified scope design.
- Use Prisma `select`/bounded relations to avoid over-fetching.
- Avoid N+1 hierarchy queries.
- Add indexes based on real endpoint access patterns.
- Debounce searchable tables and do not refetch unchanged data unnecessarily.
- Optimize before introducing additional infrastructure; the source does not require microservices or a message queue.

## 16. Security Plan

Security is incremental, not a final-only phase:
- Auth.js secure session/cookie configuration.
- Server-side RBAC and ownership/scope checks.
- CORS allowlist.
- Authentication and mutation rate limits.
- Request/body/page-size limits.
- Input validation and safe output handling.
- Prisma parameterized queries; avoid unsafe raw SQL.
- Upload MIME/size/content validation and access checks.
- Secure headers.
- No secrets in source/logs/client bundles.
- Redacted provider/audit logs.
- IDOR/privilege-escalation tests across all roles.

## 17. Testing Strategy

### Backend
Unit-test pure scheduling and state-transition logic. Integration-test each endpoint with authentication, authorization, validation, DB behavior, cache fallback, Twilio mock, storage mock, Socket.io events, and cron handlers.

### Frontend
Test protected navigation, forms, tables, filter/sort, loading/empty/error states, API error mapping, and realtime row refresh.

### End-to-end
Run the five explicit journeys from clean seeded state. Include planned-vs-unplanned outage reporting as separate branches because they intentionally have different side effects.

## 18. Deployment Strategy

Provider-neutral until deployment target is selected. Production architecture must support:
- Next.js production build,
- Express production process,
- Socket.io websocket connectivity,
- Neon PostgreSQL migrations,
- Upstash Redis credentials,
- Auth.js secure secret/config,
- Twilio production credentials,
- storage provider credentials after selection,
- cron execution strategy that does not accidentally multiply jobs across horizontally scaled replicas.

## 19. Environment Variable Inventory

| Variable | Purpose | Required |
|---|---|---:|
| `DATABASE_URL` | Neon/Postgres connection | Yes |
| `DIRECT_URL` | Direct migration/Prisma connection if required | Conditional |
| `UPSTASH_REDIS_REST_URL` | Redis endpoint | Yes for cache |
| `UPSTASH_REDIS_REST_TOKEN` | Redis token | Yes for cache |
| `AUTH_SECRET` | Auth.js secret | Yes |
| Auth provider variables | Chosen Auth.js provider | Conditional |
| `TWILIO_ACCOUNT_SID` | Twilio account | Yes for SMS |
| `TWILIO_AUTH_TOKEN` | Twilio credential | Yes for SMS |
| `TWILIO_FROM_NUMBER` | SMS sender | Yes for SMS |
| `API_BASE_URL` | Frontend API base | Yes |
| `NEXTAUTH_URL` / equivalent | Auth.js public URL | Conditional |
| `CORS_ORIGINS` | Allowed browser origins | Yes |
| `PORT` | Express port | Usually |
| `CRON_ENABLED` | Enable jobs | Yes |
| Storage variables | Repair-photo storage | Conditional until provider chosen |
| `NODE_ENV` | Runtime mode | Standard |

Never commit real values.

## 20. Git / Commit Strategy

Use phase-aligned incremental commits such as:

```text
chore: initialize project conventions
feat: add prisma grid hierarchy
feat: implement authjs authentication
feat: enforce role authorization
feat: add admin infrastructure apis
feat: implement fair scheduling engine
feat: add schedule publication
feat: cache published schedules
feat: add twilio notification service
feat: implement outage conflict resolution
feat: implement technician repair workflow
feat: add repair photo uploads
feat: add socketio realtime events
feat: implement manager live grid
feat: add manager analytics
feat: add admin user management
security: harden authorization and uploads
test: complete backend regression suite
test: add end to end role journeys
chore: configure production deployment
docs: finalize implementation audit
```

Do not use one bulk `feat: complete entire project` commit. Do not commit `.env`, secrets, build output, temporary agent files, or inappropriate test artifacts.

## 21. Final Pre-Implementation Checklist

- [ ] Source description and journeys fully represented.
- [ ] Five roles fully represented.
- [ ] Zone→Feeder→Meter hierarchy preserved.
- [ ] Critical-feeder exclusion explicit.
- [ ] No-double-cut rule explicit.
- [ ] Smart planned-vs-unplanned conflict rule explicit.
- [ ] Schedule draft/review/publish lifecycle explicit.
- [ ] Redis schedule caching explicit.
- [ ] Twilio SMS integration isolated behind an adapter.
- [ ] Technician repair photo boundary explicit.
- [ ] Socket.io scope/room rules explicit.
- [ ] Node-cron behavior explicit.
- [ ] Backend RBAC and ownership/scope checks explicit.
- [ ] Validation/error/security/performance/test/deployment work is phased.
- [ ] Every major endpoint specifies headers/body/query/path/auth/error logic.
- [ ] Every page has a role/access purpose and API dependency.
- [ ] API/page/entity/role mapping is complete.
- [ ] Dependency graph is complete.
- [ ] Open questions are not silently treated as source facts.
- [ ] Minimum 30 meaningful phases requirement is exceeded: 48 phases.


## 23. Consolidated API Inventory

| Method | Endpoint | Auth | Role | Purpose | Phase |
|---|---|---|---|---|---:|
| GET | `/api/v1/health` | Public | All | Service health | 03 |
| GET | `/api/v1/grid/status` | Auth | Scoped | Effective grid status | 12 |
| GET | `/api/v1/customers/me` | Auth | Customer | Own profile | 13 |
| GET | `/api/v1/customers/me/dashboard` | Auth | Customer | Dashboard aggregation | 13 |
| GET/PATCH | `/api/v1/customers/me/location` | Auth | Customer | Meter/location binding | 11 |
| GET | `/api/v1/schedules/my` | Auth | Customer | Published own-feeder schedule | 18 |
| GET | `/api/v1/schedules/feeders/:feederId` | Auth | Ops scoped | Feeder schedule | 18 |
| POST | `/api/v1/customers/me/outages` | Auth | Customer | Report outage / smart conflict resolution | 20 |
| GET | `/api/v1/customers/me/outages` | Auth | Customer | Own outage history | 21 |
| GET | `/api/v1/outages/:outageId` | Auth | Scoped | Outage detail | 21 |
| POST | `/api/v1/outages/:outageId/assign` | Auth | Operator/Manager | Technician assignment | 21 |
| GET | `/api/v1/technician/outages` | Auth | Technician | Assigned queue | 22 |
| POST | `/api/v1/technician/outages/:outageId/accept` | Auth | Technician | Accept + en route | 22 |
| POST | `/api/v1/technician/outages/:outageId/start-repair` | Auth | Technician | Start repair | 23 |
| POST | `/api/v1/technician/outages/:outageId/resolve` | Auth | Technician | Resolve ticket | 23 |
| POST | `/api/v1/technician/outages/:outageId/attachments` | Auth | Technician | Repair photo | 24 |
| GET | `/api/v1/outages/:outageId/attachments` | Auth | Scoped | Attachment metadata/reference | 24 |
| GET | `/api/v1/manager/grid` | Auth | Zone Manager | Live grid table | 26 |
| GET | `/api/v1/operator/overview` | Auth | Operator/Admin | Control-room overview | 27 |
| GET | `/api/v1/customers/me/notifications` | Auth | Customer | Notification history | 28 |
| GET | `/api/v1/manager/outages` | Auth | Zone Manager | Fault queue | 29 |
| GET | `/api/v1/manager/technicians` | Auth | Zone Manager | Technician list | 29 |
| PATCH | `/api/v1/manager/outages/:outageId/assignment` | Auth | Zone Manager | Assignment change | 29 |
| GET | `/api/v1/manager/analytics/feeder-failures` | Auth | Zone Manager | Failure frequency | 30 |
| GET | `/api/v1/manager/analytics/technician-resolution` | Auth | Zone Manager | Resolution duration | 30 |
| POST | `/api/v1/manager/upgrade-requests` | Auth | Zone Manager | Create upgrade request | 31 |
| GET | `/api/v1/manager/upgrade-requests` | Auth | Zone Manager | List upgrade requests | 31 |
| POST/GET/PATCH | `/api/v1/admin/zones` | Auth | Admin | Zone maintenance | 10 |
| POST/GET/PATCH | `/api/v1/admin/substations` | Auth | Admin | Substation maintenance | 10 |
| POST/GET/PATCH | `/api/v1/admin/feeders` | Auth | Admin | Feeder maintenance | 10 |
| POST/GET/PATCH | `/api/v1/admin/meters` | Auth | Admin | Meter maintenance | 10 |
| PATCH | `/api/v1/admin/feeders/:feederId/critical` | Auth | Admin | Critical feeder designation | 10 |
| POST | `/api/v1/operator/schedules/generate` | Auth | Operator | Generate draft plan | 16 |
| GET/PATCH | `/api/v1/operator/schedules/:scheduleId` | Auth | Operator/Admin | Read/edit draft | 17 |
| POST | `/api/v1/operator/schedules/:scheduleId/publish` | Auth | Operator | Publish | 17 |
| GET | `/api/v1/admin/users` | Auth | Admin | User list | 32 |
| GET | `/api/v1/admin/users/:userId` | Auth | Admin | User detail | 32 |
| PATCH | `/api/v1/admin/users/:userId/role` | Auth | Admin | Role change | 32 |
| PATCH | `/api/v1/admin/users/:userId/status` | Auth | Admin | Account status | 32 |
| PATCH | `/api/v1/admin/users/:userId/scope` | Auth | Admin | Operational scope | 32 |
| GET | `/api/v1/admin/audit` | Auth | Admin | Audit records | 33 |
| GET | `/api/v1/admin/notifications` | Auth | Admin | Notification delivery metadata | 33 |
| GET | `/api/v1/health/live` | Public | All | Liveness | 44 |
| GET | `/api/v1/health/ready` | Public | All | Readiness | 44 |

## 24. Complete Page Inventory

| Route | Access | Purpose | Major APIs | Phase |
|---|---|---|---|---:|
| `/` | Public | Service overview | None | 04 |
| `/login` | Public | Authentication | Auth.js | 08 |
| `/403` | Public | Forbidden | None | 04 |
| `/404` | Public | Missing route/resource | None | 04 |
| `/customer/location` | Customer | Bind meter | location APIs | 11 |
| `/customer/dashboard` | Customer | Current status + upcoming schedule | dashboard/schedule/outage | 13/28 |
| `/customer/schedule` | Customer | Published schedules | schedule API | 28 |
| `/customer/outages` | Customer | Report/history | outage APIs | 20/21 |
| `/customer/outages/[id]` | Customer | Ticket detail | outage detail | 21/28 |
| `/customer/notifications` | Customer | Notification history | notifications API | 28 |
| `/operator/dashboard` | Operator | Control room | overview/grid/schedule | 27 |
| `/operator/schedules` | Operator | Plan list | schedules | 17 |
| `/operator/schedules/generate` | Operator | Generate draft | generate | 16 |
| `/operator/schedules/[id]` | Operator | Review/publish | schedule detail/publish | 17 |
| `/technician/outages` | Technician | Work queue | technician queue | 22 |
| `/technician/outages/[id]` | Technician | Accept/repair/resolve/photo | technician/outage APIs | 22–24 |
| `/manager/dashboard` | Zone Manager | Live grid | manager grid + Socket.io | 26 |
| `/manager/grid` | Zone Manager | Filter/sort status table | manager grid | 26 |
| `/manager/outages` | Zone Manager | Fault queue | manager outage APIs | 29 |
| `/manager/outages/[id]` | Zone Manager | Oversight | outage/assignment | 29 |
| `/manager/analytics` | Zone Manager | Monthly analytics | analytics APIs | 30 |
| `/manager/upgrade-requests` | Zone Manager | Upgrade requests | upgrade APIs | 31 |
| `/admin/users` | Admin | User administration | admin user APIs | 32 |
| `/admin/users/[id]` | Admin | User detail/scope/role | admin user APIs | 32 |
| `/admin/infrastructure` | Admin | Grid topology | admin infra APIs | 10/32 |
| `/admin/audit` | Admin | Audit trail | audit API | 33 |
| `/admin/notifications` | Admin | SMS delivery state | admin notification API | 33 |

## 25. Complete Database Inventory

| Entity | Purpose | Key relationships | Phase |
|---|---|---|---:|
| User | Identity/role/status | meter binding; technician/manager scope | 06–09 |
| Zone | District | 1:N Feeder | 06 |
| Feeder | Distribution/scheduling unit | Zone; Meter; optional Substation | 06 |
| Meter | Customer location key | Feeder; customer | 06/11 |
| Substation | Infrastructure site | Feeder | 06 |
| LoadSheddingPlan | Schedule container | 1:N Slot | 14 |
| LoadSheddingSlot | Planned interval | Feeder + Plan | 14 |
| ScheduleGenerationRun | Algorithm execution | operator + plan | 14–16 |
| OutageTicket | Unexpected fault | customer, meter, feeder, zone, technician | 20–23 |
| Attachment | Repair evidence metadata | outage + uploader | 24 |
| Notification | Customer/provider delivery record | user | 19/28/33 |
| InfrastructureUpgradeRequest | Manager improvement request | feeder + requester | 31 |
| AuditEvent | Traceability | actor + target | 33 |
| OutageEvent (optional) | Transition history | outage | 21/23 |

## 26. Feature Mapping Cross-Check

| Feature | Required role | Required backend | Required frontend | Required persistence |
|---|---|---|---|---|
| Customer schedule transparency | Customer | schedule + grid status | dashboard/schedule | Plan/Slot/Feeder |
| Fair scheduling | Operator/System | pure engine + generate/publish | operator scheduling UI | Plan/Slot/GenerationRun |
| Critical-feeder protection | Operator/System | scheduler constraint | review visibility | Feeder |
| Smart conflict resolution | Customer/System | outage report + status query | report flow | Schedule + OutageTicket |
| Technician repair | Technician | queue + transitions + attachments | technician portal | OutageTicket + Attachment |
| Live oversight | Manager | grid + Socket.io | live data table | Outage/Schedule/Feeder |
| Analytics | Manager | bounded aggregates | analytics table/report | OutageTicket + Feeder |
| Upgrade request | Manager | request APIs | request page | UpgradeRequest |
| Infrastructure admin | Admin | topology APIs | admin infra | Zone/Feeder/Meter/Substation |
| User admin | Admin | role/status/scope APIs | admin users | User |
| SMS | System/Customer | Twilio adapter | notification history | Notification |

## 27. Final Dependency Graph

```text
01 Requirements
  ↓
02 Repo conventions
  ├─→ 03 Express foundation
  └─→ 04 Next.js foundation
        ↓
05 Environment contract
        ↓
06 Prisma grid hierarchy
        ↓
07 Seed topology
        ↓
08 Auth.js
        ↓
09 RBAC
   ├─→ 10 Admin infrastructure
   │    ↓
   │   11 Customer meter/location
   │    ↓
   │   12 Effective grid status
   │    ↓
   │   13 Customer dashboard
   │
   └─→ 32 Admin users (operationally later)

12/13
  ↓
14 Schedule model
  ↓
15 Scheduling engine
  ↓
16 Generate draft
  ↓
17 Review/publish
  ↓
18 Redis cached schedule reads
  ↓
19 Notification/Twilio adapter
  ↓
20 Smart conflict resolution
  ↓
21 Outage state machine
  ├─→ 22 Technician queue/accept
  │    ↓
  │   23 Repair/resolve
  │    ↓
  │   24 Repair photo
  │    ↓
  │   25 Socket.io
  │    ↓
  │   26 Manager live grid
  │    ↓
  │   29 Manager fault assignment
  │    ↓
  │   30 Analytics
  │    ↓
  │   31 Upgrade requests
  │
  ├─→ 27 Operator dashboard
  └─→ 28 Customer UX

25 → 35 Realtime refresh
10–35 → 36 Validation → 37 Errors → 38 Security → 39 Performance
→ 40 Responsive/A11y → 41 Backend tests → 42 Frontend tests
→ 43 E2E → 44 Observability → 45 API freeze → 46 Deployment
→ 47 CI/Git → 48 Final audit
```

## 28. Final Consistency Audit Rules

Before release, verify:

- Every frontend feature calls a documented backend contract.
- Every protected endpoint has a corresponding role/scope rule.
- Every protected page has a corresponding frontend guard.
- Every API operation references valid persistent entities or an explicit external integration.
- Every customer-owned action resolves the current user from trusted session state, not a browser-supplied customer ID.
- Planned outage reports cannot create repair tickets.
- Unexpected outage reports can create only properly scoped tickets.
- Critical feeders cannot enter an auto-generated plan.
- The scheduler cannot produce a same-area duplicate cut inside the protected same-day window.
- Publishing is explicit and auditable.
- Redis failure falls back safely to Postgres for schedule reads.
- Twilio failure does not corrupt committed outage/schedule state.
- Technician status changes reach Socket.io only after successful state change.
- Zone Managers receive only authorized zone events/data.
- Repair-photo access is scoped to the ticket and role.
- Analytics use bounded windows and documented metric definitions.
- No phase depends on a later phase.
- All open decisions are recorded and their dependent docs/contracts remain synchronized.

## 29. Definition of Done for the Entire Project

The system is considered complete only when all 48 phases are verified, the five explicit user journeys can be demonstrated end-to-end, the complete API/page/entity inventories reconcile with the implementation, security and authorization tests pass, and deployment/configuration documentation matches the final runtime architecture.
