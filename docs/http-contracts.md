# Shared HTTP Contracts, Validation & Error Architecture (Phase 6)

## 1. Overview & Core Contracts

Phase 6 formalizes the HTTP perimeter contracts across the **Load Shedding & Power Outage Management System**. It guarantees consistency in data exchange between the Express backend (`apps/api`) and the Next.js web application (`apps/web`).

---

## 2. Global Wire Envelopes

### 2.1 Standard Success Envelope (`ApiResponse<T>`)
Every non-collection successful response returns:
```json
{
  "success": true,
  "data": { ... },
  "error": null,
  "timestamp": "2026-10-29T22:58:21.226Z",
  "requestId": "f233fd88"
}
```

### 2.2 Standard Paginated Collection Envelope (`PaginatedApiResponse<T>`)
Every paginated collection response returns an `items` array accompanied by structured `meta` pagination parameters:
```json
{
  "success": true,
  "data": {
    "items": [ ... ],
    "meta": {
      "page": 1,
      "pageSize": 20,
      "total": 45,
      "totalPages": 3,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  },
  "error": null,
  "timestamp": "2026-10-29T22:58:21.226Z",
  "requestId": "f233fd88"
}
```

### 2.3 Standard Error Envelope (`ApiResponse<null>`)
Any validation, application, or system failure returns:
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR | NOT_FOUND | FORBIDDEN | BAD_REQUEST | CONFLICT",
    "message": "Human-readable description of error.",
    "details": [
      { "path": "email", "message": "Invalid email address" }
    ]
  },
  "timestamp": "2026-10-29T22:58:21.226Z",
  "requestId": "f233fd88"
}
```

---

## 3. Validation Middleware Layer

Located in [`apps/api/src/middleware/validate.ts`](file:///g:/programming/CSE-3110/Zarin-loadshading/apps/api/src/middleware/validate.ts):

* **`validateBody(schema)`**: Intercepts `req.body`, parses it against a Zod schema, and replaces `req.body` with the coerced and sanitized output.
* **`validateQuery(schema)`**: Validates and coerces query parameters (e.g. converting `"1"` to `1`).
* **`validateParams(schema)`**: Validates URL route parameters (e.g. `:id`).

---

## 4. Application Error Taxonomy

Located in [`apps/api/src/utils/response.ts`](file:///g:/programming/CSE-3110/Zarin-loadshading/apps/api/src/utils/response.ts):

| Class | HTTP Status | Error Code | Typical Usage |
| :--- | :---: | :--- | :--- |
| **`BadRequestError`** | `400` | `BAD_REQUEST` | Malformed parameters, invalid password. |
| **`ValidationError`** | `400` | `VALIDATION_ERROR` | Schema validation rejections (with `details`). |
| **`UnauthorizedError`** | `401` | `UNAUTHORIZED` | Missing or invalid authentication token. |
| **`ForbiddenError`** | `403` | `FORBIDDEN` | Insufficient role or zone-scope privileges. |
| **`NotFoundError`** | `404` | `NOT_FOUND` / Custom | Feeder, Zone, or Outage ticket not found. |
| **`ConflictError`** | `409` | `CONFLICT` / Custom | Email already registered, duplicate code. |

---

## 5. Verification Test Suite

All Phase 6 contracts are verified in [`apps/api/src/test/runner.ts`](file:///g:/programming/CSE-3110/Zarin-loadshading/apps/api/src/test/runner.ts):
1. **Body Validation**: Rejects invalid payloads with HTTP 400 and returns structured error paths.
2. **Query String Coercion**: Verifies `page` and `pageSize` parsing and bounds.
3. **Paginated Envelope**: Validates that `items`, `meta.page`, `meta.pageSize`, and `meta.totalPages` match collection sizes.
4. **Error Subclasses**: Validates status codes and serialization.
5. **JSON Syntax Handler**: Traps broken JSON payloads with HTTP 400 `INVALID_JSON`.
