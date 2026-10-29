# Source Register & Requirements Traceability

This document records all authoritative source documents provided for the **Load Shedding & Power Outage Management System**, their roles, and how their specifications are traced into the codebase.

---

## 1. Catalog of Authoritative Sources

| Source File | Role & Purpose | Key Contributions & Scope |
| :--- | :--- | :--- |
| **`requirment.txt`** | Project Inception & Core Vision | Defines the 5 core roles (`Customer`, `Power Operator`, `Technician`, `Zone Manager`, `Admin`), the 5 primary user journeys, the tabular SCADA UI concept (no maps), and high-level stack. |
| **`FEATURES.md`** | Consolidated Feature Matrix | Reconciles the feature requirements, defines the negative boundaries (no microservices, no GraphQL, no fake telemetry), and cataloged the open architecture decisions. |
| **`endpoint.md`** | API Catalog | Complete inventory of 81 REST endpoints across 10 functional domains, 5 Socket.io real-time events, and 3 background cron jobs. |
| **`implementation_1.md`** | Architecture Blueprint (Variant 1) | Detailed phase breakdown with initial data model drafts and dependency chains. |
| **`implementation_2.md`** | Architecture Blueprint (Variant 2) | Alternative 42-phase roadmap with emphasis on operational edge cases. |
| **`implementation_3.md`** | Architecture Blueprint (Variant 3) | Alternative implementation breakdown with initial test criteria. |
| **`implementation.md`** | Reconciled Full-Stack Unified Plan | Synthesized master plan reconciling variants 1, 2, and 3 into a single full-stack architecture across 36 sections. |
| **`BACKEND_IMPLEMENTATION.md`** | Authoritative Backend Implementation Specification | Distilled 26-phase (Phase 0–25) execution roadmap strictly focused on the Node.js/Express/Prisma/Redis backend, defining canonical `/api/v1` routes and the D-01 to D-18 Decision Register. |

---

## 2. Traceability Matrix to Implementation

| Feature / Domain Area | Authoritative Source | Implementation Target | Verification Point |
| :--- | :--- | :--- | :--- |
| **Critical Feeder Immunity** | `requirment.txt`, `FEATURES.md` §3 | `apps/api/src/services/scheduler.service.ts` | Test runner assertion: Hospital feeder excluded |
| **Same-Day Repeat Cut Protection** | `FEATURES.md` §3, `BACKEND_IMPLEMENTATION.md` §Phase 13 | `apps/api/src/services/scheduler.service.ts` | Schedule generation rule checks existing calendar items |
| **Smart Outage Report Interception** | `requirment.txt` Journey 5, `FEATURES.md` §3 | `apps/api/src/services/conflict.service.ts` | Test runner assertion: Report during planned cut returns planned status, creates `OutageReportEvent`, creates NO `OutageTicket` |
| **Field Technician Repair Workflow** | `requirment.txt` Journey 3 | `apps/api/src/modules/technician.router.ts` | State machine: `ASSIGNED` &rarr; `EN_ROUTE` &rarr; `REPAIRING` &rarr; `RESOLVED` |
| **Repair Photo Evidence Gate** | `BACKEND_IMPLEMENTATION.md` §Phase 19 | `apps/api/src/middleware/upload.ts` | Mandatory file upload before ticket resolution |
| **Role-Based Access Control (5 Roles)** | `requirment.txt`, `endpoint.md` | `apps/api/src/middleware/auth.ts` | Verified server-side JWT with `requireRole` guards |
| **Relational Grid Hierarchy** | `requirment.txt`, `BACKEND_IMPLEMENTATION.md` §Phase 4 | `apps/api/prisma/schema.prisma` | $\text{Zone} \to \text{Substation} \to \text{Feeder} \to \text{Transformer} \to \text{Meter}$ |
| **Dual-Mode Data Layer** | `BACKEND_IMPLEMENTATION.md` §Phase 5 | `apps/api/src/db/prisma.ts` & `store.ts` | Seamless fallback from Prisma to in-memory store for instant testability |
