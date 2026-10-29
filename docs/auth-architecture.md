# Authentication & Session Architecture (Phase 7)

## 1. Overview & Core Standards

Phase 7 establishes the identity, registration, session lifecycle, and credential recovery mechanisms for the **Load Shedding & Power Outage Management System**.

---

## 2. Canonical Route Inventory (Domain 2: `/api/v1/auth/*`)

| Method | Endpoint Path | Access | Purpose | Status Codes |
| :--- | :--- | :---: | :--- | :--- |
| `POST` | `/api/v1/auth/register` | Public | Customer self-registration with upfront meter validation. | 201, 400, 404, 409 |
| `POST` | `/api/v1/auth/login` | Public | Credential authentication with JWT issuance and HTTP-only cookie. | 200, 400, 401, 403 |
| `POST` | `/api/v1/auth/logout` | Public | Clears `auth_token` session cookie. | 200 |
| `GET` | `/api/v1/auth/session` | Authenticated | Resolves current authenticated identity and permissions (alias: `/auth/me`). | 200, 401, 403 |
| `POST` | `/api/v1/auth/refresh` | Authenticated | Renews token for active users, updates cookie and returns new JWT. | 200, 401, 403 |
| `POST` | `/api/v1/auth/verify-email/request` | Authenticated | Dispatches 24-hour single-use email verification token. | 200, 401 |
| `POST` | `/api/v1/auth/verify-email/confirm` | Public | Confirms email verification token and sets `emailVerified`. | 200, 400 |
| `POST` | `/api/v1/auth/password/forgot` | Public | Dispatches 1-hour password reset token (constant-time anti-enumeration). | 200, 400 |
| `POST` | `/api/v1/auth/password/reset` | Public | Updates user password hash with single-use token. | 200, 400, 404 |

---

## 3. Key Security & Architectural Invariants

### 3.1 Dual Transport Model (Decision D-02)
* **Bearer Header:** Used by mobile apps and programmatic API clients (`Authorization: Bearer <jwt>`).
* **HTTP-Only Cookie:** Set on login and refresh (`auth_token`, `SameSite=lax`, `secure` in production, `maxAge: 7 days`).
* **Authoritative Boundary:** Express `authenticateUser` middleware is the single source of truth for token verification across both transport channels.

### 3.2 Customer-Only Registration (Decision D-08)
* Public registration forces `role = UserRole.CUSTOMER`.
* Staff roles (`POWER_OPERATOR`, `FIELD_TECHNICIAN`, `ZONE_MANAGER`, `ADMIN`) cannot self-register; they are provisioned exclusively by Admins in Phase 10.

### 3.3 Strict Meter Verification
When an optional `meterNumber` is supplied during registration:
* If the meter does not exist in grid inventory &rarr; rejects with `404 METER_NOT_FOUND`.
* If the meter is already bound to another customer &rarr; rejects with `409 METER_ALREADY_LINKED`.
* Meter verification is evaluated before creating the user record, ensuring atomic registration.

### 3.4 Anti-Enumeration & Suspension Protection
* **Password Reset Anti-Enumeration:** `POST /api/v1/auth/password/forgot` always returns 200 OK with a generic acknowledgement message whether the email exists or not.
* **Immediate Access Revocation:** If an administrator suspends an account (`status === 'SUSPENDED'`), both login and active session queries immediately return `403 ACCOUNT_SUSPENDED`.

---

## 4. Verification Evidence

All 10 workflows in Phase 7 are covered in the automated test runner ([`apps/api/src/test/runner.ts`](file:///g:/programming/CSE-3110/Zarin-loadshading/apps/api/src/test/runner.ts)):
1. Customer registration with valid meter binding.
2. Duplicate email rejection (`409 EMAIL_EXISTS`).
3. Non-existent meter rejection (`404 METER_NOT_FOUND`).
4. Already-linked meter rejection (`409 METER_ALREADY_LINKED`).
5. Session resolution (`GET /api/v1/auth/session`).
6. Token renewal (`POST /api/v1/auth/refresh`).
7. Suspended account rejection (`403 ACCOUNT_SUSPENDED`).
8. Email verification request and confirm round-trip.
9. Password reset request and confirm round-trip.
10. Logout session clearance.
