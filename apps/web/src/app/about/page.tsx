import React from 'react';
import { ShieldCheck, Zap, RefreshCw, AlertTriangle, Users, Database, Layers, Radio, Cpu } from 'lucide-react';

export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-10 py-6 pb-16">
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/25 text-xs font-mono font-semibold">
          <Cpu className="h-3.5 w-3.5 text-amber-500" />
          SYSTEM ARCHITECTURE & MATHEMATICAL FAIRNESS
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Why Algorithmic Outage Management Matters
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          In electricity distribution grids facing peak generation deficits, manual spreadsheet coordination creates arbitrary repeated power cuts, unfair burden distribution, and false emergency dispatches. GridSync BD replaces human guesswork with mathematical fairness, absolute critical line protection, and transparent public governance.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2">
        <div className="glass-panel p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 space-y-3 shadow-sm">
          <div className="h-10 w-10 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <h3 className="font-bold text-base text-slate-900 dark:text-white">
            Rule 1: Critical Hospital Shielding
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Feeders supplying public trauma hospitals, specialized cardiac centers (e.g. Ibn Sina Hospital), and critical water purification plants are shielded at the database layer. The deficit-rotation solver hard-excludes them from shed slots under any MW shortfall.
          </p>
        </div>

        <div className="glass-panel p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 space-y-3 shadow-sm">
          <div className="h-10 w-10 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
            <RefreshCw className="h-5 w-5" />
          </div>
          <h3 className="font-bold text-base text-slate-900 dark:text-white">
            Rule 2: The Strict No-Double-Cut Rule
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            A distribution feeder line cannot be scheduled for load shedding more than once in the same calendar day (00:00 to 23:59). The engine validates draft time intervals against historical schedules, ensuring equitable rotation across the population.
          </p>
        </div>

        <div className="glass-panel p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 space-y-3 shadow-sm">
          <div className="h-10 w-10 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
            <Zap className="h-5 w-5" />
          </div>
          <h3 className="font-bold text-base text-slate-900 dark:text-white">
            Rule 3: Smart Conflict Resolution
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            When a consumer submits a blackout report, the backend resolves their meter to its transmission line and checks if a published load-shedding slot is currently running. If so, it intercepts the ticket, calculates exact restoration time, and prevents false crew dispatches.
          </p>
        </div>

        <div className="glass-panel p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 space-y-3 shadow-sm">
          <div className="h-10 w-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
            <Database className="h-5 w-5" />
          </div>
          <h3 className="font-bold text-base text-slate-900 dark:text-white">
            Rule 4: Multi-Tier Modern Architecture
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Powered by Neon Serverless PostgreSQL, Prisma ORM with atomic transactions, Upstash Redis caching, Express.js REST API with all 81 endpoints, and real-time Socket.io bi-directional WebSocket telemetry for instantaneous dashboard refreshes.
          </p>
        </div>
      </div>
    </div>
  );
}
