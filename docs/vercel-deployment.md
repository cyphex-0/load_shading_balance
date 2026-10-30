# Vercel Frontend Deployment Guide
## Load Shedding & Power Outage Management System (Next.js 14)

This guide provides step-by-step instructions for deploying the Next.js 14 frontend (`apps/web`) on [Vercel](https://vercel.com).

---

## 1. Quick Overview & Architecture

* **Live Production Frontend:** [`https://load-shading-balance.vercel.app`](https://load-shading-balance.vercel.app)
* **Framework Preset:** `Next.js`
* **Root Directory:** `apps/web` *(or repository root `.`)*
* **Build Command:** Automatically handled via `prebuild` (`npm run build --workspace=packages/shared && next build`)
* **Output Directory:** Automatically detected by Next.js (`.next`)
* **Live Backend API Target:** `https://load-shading-balance.onrender.com`

---

## 2. Environment Variables Checklist for Vercel

Under your Vercel Project Settings &rarr; **Environment Variables**, configure:

| Variable Name | Value | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://load-shading-balance.onrender.com` | The live URL of the Render backend for REST endpoints, rewrites, and Socket.io connections. |

*(Note: In `apps/web/next.config.mjs` and `api.ts`, `NEXT_PUBLIC_API_URL` defaults to `https://load-shading-balance.onrender.com` automatically, but setting it explicitly in Vercel is best practice).*

---

## 3. Step-by-Step Deployment on Vercel

### Step 1: Import Repository
1. Log into your [Vercel Dashboard](https://vercel.com/dashboard).
2. Click **Add New...** &rarr; **Project**.
3. Select your GitHub repository: `cyphex-0/load_shading_balance`.

### Step 2: Configure Project Settings
In the Vercel project configuration screen:
1. **Framework Preset:** Select **Next.js**.
2. **Root Directory:**
   * Click **Edit** next to Root Directory.
   * Select **`apps/web`** and click **Continue**.
   * *(Vercel will automatically enable "Include source files outside of the Root Directory in the Build Step" to bundle `@load-shedding/shared`)*.
3. **Build & Development Settings:**
   * Leave them on Default (the prebuild script automatically compiles the shared package before building Next.js).
4. **Environment Variables:**
   * **Key:** `NEXT_PUBLIC_API_URL`
   * **Value:** `https://load-shading-balance.onrender.com`
5. Click **Deploy**.

---

## 4. Crucial Post-Deployment Step: Connect Frontend to Backend CORS

Once Vercel finishes deploying, Vercel will give you your live frontend domain, e.g.:
`https://load-shading-balance.vercel.app` (or your custom domain).

To allow the frontend to authenticate and communicate with the Render backend:
1. Open your [Render Dashboard](https://dashboard.render.com).
2. Navigate to your backend service: `load-shedding-backend`.
3. Go to the **Environment** tab.
4. Update the **`FRONTEND_URL`** variable with your new Vercel domain:
   ```env
   FRONTEND_URL=https://load-shading-balance.vercel.app,http://localhost:3000
   ```
5. Click **Save Changes**. Render will automatically restart and allow CORS & Socket.io handshakes from your Vercel app.

---

## 5. Verification

Once deployed:
1. Open your Vercel URL in your browser: `https://your-app.vercel.app`.
2. Navigate to `/login`:
   - Log in with default seed accounts:
     - **Admin:** `admin@grid.gov.bd` / `Password123!`
     - **Operator:** `operator@grid.gov.bd` / `Password123!`
     - **Technician:** `tech1@grid.gov.bd` / `Password123!`
     - **Zone Manager:** `manager.dhanmondi@grid.gov.bd` / `Password123!`
     - **Customer:** `customer@gmail.com` / `Password123!`
3. Verify live Socket.io real-time connection indicator on the operator/customer dashboard.
