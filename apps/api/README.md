# @load-shedding/api - Express REST & Real-Time Backend

The backend service for the **Load Shedding & Power Outage Management System**, built with Node.js, TypeScript, Express.js, Prisma ORM, Socket.io, and Upstash Redis.

---

## 1. Quick Start

### Prerequisites
* **Node.js:** `>= 20.0.0`
* **npm:** `>= 10.0.0`

### Installation
From the repository root:
```bash
npm install
npm run prisma:generate --workspace=apps/api
npm run build --workspace=packages/shared
```

### Running the API in Development
```bash
# From workspace root
npm run dev:api

# Or from within apps/api
cd apps/api
npm run dev
```
The server will start on `http://localhost:4000` (WebSocket on `ws://localhost:4000`).

---

## 2. Available Scripts

| Command | Action |
|---|---|
| `npm run dev` | Starts server in watch mode with `tsx` |
| `npm run build` | Compiles TypeScript into `dist/` |
| `npm run start` | Runs compiled production server (`node dist/server.js`) |
| `npm run typecheck` | Verifies TypeScript types without emitting files (`tsc --noEmit`) |
| `npm run test` | Runs the automated HTTP integration test suite (`src/test/runner.ts`) |
| `npm run prisma:generate` | Generates typed Prisma Client from `prisma/schema.prisma` |
| `npm run prisma:push` | Pushes schema directly to database without creating migration files |
| `npm run prisma:seed` | Seeds database with initial grid topology and test users |

---

## 3. Environment Variables (.env)

Create an `.env` file in `apps/api` or project root based on `.env.example`:

```ini
# Server Configuration
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
OPERATIONAL_TIME_ZONE="Asia/Dhaka"

# Database Configuration (Neon Serverless PostgreSQL)
DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"

# Redis Cache & Locks (Upstash Redis)
REDIS_URL="rediss://default:password@endpoint:6379"

# Security & Authentication
JWT_SECRET="super-secret-jwt-key-replace-in-production"
JWT_EXPIRES_IN="7d"

# File Upload Storage (Local / S3)
UPLOAD_DIR="./uploads"
MAX_FILE_SIZE=5242880 # 5MB

# Twilio SMS Alerts (Optional for local dev)
TWILIO_ACCOUNT_SID=""
TWILIO_AUTH_TOKEN=""
TWILIO_PHONE_NUMBER=""

# Demo Simulator Flag
ENABLE_DEMO_SIMULATION=false
```

---

## 4. Architectural Highlights

### Dual-Mode Data Layer
* **Production Mode:** Connects to PostgreSQL using Prisma (`src/db/prisma.ts`).
* **In-Memory Fallback:** When `DATABASE_URL` is unavailable or during fast unit testing, the server automatically uses `src/db/store.ts`, a complete in-memory mock store that requires zero external infrastructure.

### Canonical Route Mounting
All endpoints are canonically mounted under **`/api/v1`** (e.g. `/api/v1/health`, `/api/v1/schedules/draft`), with `/api` backwards-compatible aliases mounted alongside for client compatibility.

### Automated Testing
The integration test suite (`src/test/runner.ts`) verifies:
* Health and liveness probes
* Role-based access control (403 Forbidden enforcement)
* Critical feeder exemption (Hospital line immunity)
* Feeder same-day repeat-cut prevention
* Smart conflict resolution (outage reports during scheduled cuts create no dispatch ticket)
* Field technician state transitions (`ASSIGNED` &rarr; `EN_ROUTE` &rarr; `REPAIRING` &rarr; `RESOLVED`)
* Zone Manager analytics & infrastructure upgrade requests
