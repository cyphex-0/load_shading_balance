# User Profile & Notifications Architecture (Domain 3)

## 1. Overview & Objectives

Domain 3 specifies the platform's user-centric self-service and alert operations (Endpoints 12–17). It provides:
1. **Enriched Identity Retrieval:** Exposes user attributes, geographic zone boundaries, and linked physical electrical meters.
2. **Contact & Profile Mutation:** Allows users to update their name and SMS-enabled phone number with strict input validation.
3. **Secure Credential Rotation:** Enforces current-password cryptographic verification via bcrypt, prevents reuse of current credentials, and records audit timestamps.
4. **In-App Notification Stream:** Delivers paginated, filterable event notices with unread tracking.
5. **IDOR-Protected Alert Lifecycle:** Supports individual read receipts and bulk dismissals while preventing cross-user notification enumeration.

---

## 2. API Contract Specification (Endpoints 12–17)

### Endpoint 12: Profile Retrieval (`GET /api/v1/users/me`)
- **Authentication:** Bearer JWT / Cookie (`authenticateUser`).
- **Response Model:** [`UserProfileDto`](file:///g:/programming/CSE-3110/Zarin-loadshading/packages/shared/src/types.ts).
- **Behavior:** Resolves user profile from `store.users`. For consumer accounts, queries `store.customerMeters` and joins active meters with their parent feeder and zone.

```json
{
  "success": true,
  "data": {
    "id": "usr_customer_1",
    "name": "Anisur Rahman",
    "email": "customer@gmail.com",
    "phone": "+8801712345678",
    "role": "CUSTOMER",
    "status": "ACTIVE",
    "assignedZoneId": null,
    "zone": null,
    "meters": [
      {
        "id": "cm_1",
        "meterId": "mtr_dhn_101",
        "meterNumber": "MTR-DHN-101",
        "address": "House 12, Road 27, Dhanmondi",
        "isPrimary": true,
        "nickname": "Residence",
        "feederName": "Dhanmondi Road 27 Feeder",
        "zoneName": "Dhanmondi"
      }
    ],
    "emailVerified": "2026-10-29T10:00:00.000Z",
    "createdAt": "2026-10-29T10:00:00.000Z",
    "updatedAt": "2026-10-29T10:00:00.000Z"
  },
  "error": null,
  "timestamp": "2026-10-29T17:45:00.000Z"
}
```

---

### Endpoint 13: Profile Contact Mutation (`PATCH /api/v1/users/me`)
- **Validation:** [`updateProfileSchema`](file:///g:/programming/CSE-3110/Zarin-loadshading/packages/shared/src/validators.ts) (`name?: string.min(2)`, `phone?: string`).
- **Response Model:** [`UserProfileDto`](file:///g:/programming/CSE-3110/Zarin-loadshading/packages/shared/src/types.ts).
- **Behavior:** Updates mutable profile fields, writes `updatedAt`, and returns the refreshed profile envelope.

---

### Endpoint 14: Password Management (`POST /api/v1/users/me/password`)
- **Validation:** [`changePasswordSchema`](file:///g:/programming/CSE-3110/Zarin-loadshading/packages/shared/src/validators.ts) (`currentPassword: string.min(1)`, `newPassword: string.min(6)`).
- **Security Safeguards:**
  1. `bcrypt.compareSync(currentPassword, user.passwordHash)` verification.
     - *Failure:* Returns `400 Bad Request` with code `'INCORRECT_CURRENT_PASSWORD'`.
  2. `bcrypt.compareSync(newPassword, user.passwordHash)` identity check.
     - *Failure:* Returns `400 Bad Request` with code `'PASSWORD_SAME_AS_CURRENT'`.
  3. Rehashes new password using salted bcrypt (`genSaltSync(10)`).
  4. Subsequent logins require the newly established password.

---

### Endpoint 15: In-App Notifications Stream (`GET /api/v1/users/me/notifications`)
- **Query Validation:** [`notificationQuerySchema`](file:///g:/programming/CSE-3110/Zarin-loadshading/packages/shared/src/validators.ts) (`page?: number`, `pageSize?: number`, `unreadOnly?: boolean`).
- **Behavior:**
  - Scopes query strictly to `n.userId === req.user.sub`.
  - Calculates total `unreadCount` across all user notifications.
  - Returns paginated data envelope with pagination metadata and backwards-compatible root keys.

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "notif_1001",
        "userId": "usr_customer_1",
        "title": "Scheduled Outage Reminder",
        "message": "Planned maintenance window: 14:00 - 15:00",
        "type": "PLANNED_SCHEDULE",
        "isRead": false,
        "readAt": null,
        "metadata": { "feederCode": "FDR-DHN-27" },
        "createdAt": "2026-10-29T12:00:00.000Z"
      }
    ],
    "unreadCount": 1,
    "meta": {
      "page": 1,
      "pageSize": 10,
      "total": 1,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPrevPage": false
    }
  }
}
```

---

### Endpoint 16: Single Notification Read Receipt (`PATCH /api/v1/users/me/notifications/:id/read`)
- **Method Aliases:** Supported on both `PATCH` (canonical per spec) and `POST`.
- **IDOR Shielding:**
  - If the notification does not exist or `notif.userId !== req.user.sub`, the endpoint immediately raises:
    ```typescript
    throw new NotFoundError('Notification not found', 'NOTIFICATION_NOT_FOUND');
    ```
  - This prevents malicious actors from probing whether notification IDs belonging to other users exist.
- **Success:** Marks `isRead = true` and writes `readAt = new Date().toISOString()`.

---

### Endpoint 17: Bulk Notification Dismissal (`POST /api/v1/users/me/notifications/read-all`)
- **Method Aliases:** Supported on canonical `POST /users/me/notifications/read-all` as well as `PATCH /notifications/read-all`.
- **Behavior:** Marks all unread alerts for `req.user.sub` as read in a single atomic pass, returning `{ success: true, count: number }`.

---

## 3. Error Taxonomy Reference

| HTTP Status | Error Class | Domain Code | Trigger Condition |
| :---: | :--- | :--- | :--- |
| **400** | `BadRequestError` | `INCORRECT_CURRENT_PASSWORD` | Current password does not match database hash |
| **400** | `BadRequestError` | `PASSWORD_SAME_AS_CURRENT` | Attempting to rotate to the identical password |
| **400** | `ValidationError` | `VALIDATION_ERROR` | Malformed body, missing required fields |
| **401** | `UnauthorizedError` | `UNAUTHORIZED` | Missing or invalid Bearer token |
| **403** | `ForbiddenError` | `ACCOUNT_SUSPENDED` | User account suspended by Administrator |
| **404** | `NotFoundError` | `USER_NOT_FOUND` | User account does not exist or is soft-deleted |
| **404** | `NotFoundError` | `NOTIFICATION_NOT_FOUND` | Target notification not found or owned by another user |

---

## 4. Automated Test Verification Evidence

All Domain 3 endpoints are verified in [`apps/api/src/test/runner.ts`](file:///g:/programming/CSE-3110/Zarin-loadshading/apps/api/src/test/runner.ts) (Test 16):
- **Test 16a:** `GET /api/v1/users/me` returns user profile and linked active meters (`isPrimary: true`).
- **Test 16b:** `PATCH /api/v1/users/me` updates contact information and reflects in subsequent queries.
- **Test 16c:** `POST /api/v1/users/me/password` rejects incorrect password with `400 INCORRECT_CURRENT_PASSWORD`.
- **Test 16d:** `POST /api/v1/users/me/password` rejects identical password with `400 PASSWORD_SAME_AS_CURRENT`.
- **Test 16e:** `POST /api/v1/users/me/password` rotates bcrypt hash, allowing successful re-login.
- **Test 16f:** `GET /api/v1/users/me/notifications` returns paginated alerts, `unreadCount`, and filters on `unreadOnly=true`.
- **Test 16g:** IDOR defense confirms Customer B cannot mark Customer A's notification (`404 NOTIFICATION_NOT_FOUND`); Customer A marks read successfully.
- **Test 16h:** `POST /api/v1/users/me/notifications/read-all` dismisses all unread alerts, leaving `unreadCount === 0`.
