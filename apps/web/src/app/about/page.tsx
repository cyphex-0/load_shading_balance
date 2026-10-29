import React from 'react';
import { ShieldCheck, Zap, RefreshCw, AlertTriangle, Users, Database } from 'lucide-react';

export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8 py-4">
      <div className="space-y-3">
        <span className="text-xs font-bold text-amber-500 uppercase tracking-wider">System Architecture & Standards</span>
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white">
          Why Algorithmic Load Shedding Matters
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          In regions experiencing power generation deficits, traditional load shedding is executed using manual spreadsheets and verbal dispatch. This leads to arbitrary power cuts, public frustration, and technician misallocation. GridSync BD replaces manual uncertainty with mathematical fairness and transparent operational governance.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4">
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="h-10 w-10 rounded-2xl bg-red-500/10 text-red-600 flex items-center justify-center font-bold">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <h3 className="font-bold text-base text-slate-900 dark:text-white">Rule 1: Critical Feeder Shielding</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Feeders supplying public hospitals, critical water treatment plants, and emergency medical trauma centers are hardcoded as critical. The scheduling algorithm strictly prevents them from being selected for load shedding under any deficit condition.
          </p>
        </div>

        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="h-10 w-10 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
            <RefreshCw className="h-5 w-5" />
          </div>
          <h3 className="font-bold text-base text-slate-900 dark:text-white">Rule 2: The No-Double-Cut Rule</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            A feeder line cannot be scheduled for load shedding more than once in the same calendar day (00:00 to 23:59). The backend validates draft time slots against all active and historical published schedules.
          </p>
        </div>

        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="h-10 w-10 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold">
            <Zap className="h-5 w-5" />
          </div>
          <h3 className="font-bold text-base text-slate-900 dark:text-white">Rule 3: Smart Conflict Resolution</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            When a resident reports a sudden blackout, the system resolves their meter to its feeder line and checks if a published load-shedding slot is currently active. If so, it intercepts the ticket, informs the user with an exact restoration time, and prevents false dispatches.
          </p>
        </div>

        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="h-10 w-10 rounded-2xl bg-purple-500/10 text-purple-600 flex items-center justify-center font-bold">
            <Database className="h-5 w-5" />
          </div>
          <h3 className="font-bold text-base text-slate-900 dark:text-white">Rule 4: Multi-Tier Modern Architecture</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Powered by Neon Serverless PostgreSQL, Prisma ORM, Upstash Redis caching, Express.js REST API with 81 endpoints, and real-time Socket.io bi-directional WebSocket telemetry for instantaneous dashboard refreshes.
          </p>
        </div>
      </div>
    </div>
  );
}
