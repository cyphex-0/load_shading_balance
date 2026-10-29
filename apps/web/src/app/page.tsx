'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, ShieldCheck, Zap, AlertTriangle, ArrowRight, RefreshCw, Clock, Users } from 'lucide-react';
import { ApiClient } from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../lib/auth-context';

export default function HomePage() {
  const { user } = useAuth();
  const [gridStatus, setGridStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedZone, setSelectedZone] = useState<string>('ALL');

  const fetchStatus = async () => {
    setLoading(true);
    const res = await ApiClient.get('/api/grid/status');
    if (res.success && res.data) {
      setGridStatus(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const feeders = gridStatus?.feeders || [];
  const filteredFeeders = feeders.filter((f: any) => {
    const matchesSearch =
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.code.toLowerCase().includes(search.toLowerCase()) ||
      f.substation?.name.toLowerCase().includes(search.toLowerCase());
    const matchesZone = selectedZone === 'ALL' || f.zone?.id === selectedZone;
    return matchesSearch && matchesZone;
  });

  return (
    <div className="space-y-10">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-3xl bg-slate-900 text-white p-8 sm:p-12 border border-slate-800 shadow-xl">
        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-semibold">
            <Zap className="h-3.5 w-3.5 fill-current" />
            National Smart Grid Outage Management
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
            Transparent, Fair & Automated Electricity Load Shedding
          </h1>
          <p className="text-slate-300 text-base sm:text-lg">
            Guaranteed critical hospital feeder protection, algorithmic no-double-cut rotation, and instant distinction between planned outages and genuine emergency faults.
          </p>

          <div className="flex flex-wrap gap-3 pt-4">
            <Link
              href={user ? (user.role === 'CUSTOMER' ? '/customer' : `/${user.role.toLowerCase()}`) : '/login'}
              className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm shadow-md transition-all flex items-center gap-2"
            >
              {user ? 'Open My Dashboard' : 'Access Grid Portals'}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/schedules"
              className="px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm border border-slate-700 transition-all flex items-center gap-2"
            >
              <Clock className="h-4 w-4" />
              Published Schedules
            </Link>
          </div>
        </div>

        {/* Background decorative glow */}
        <div className="absolute right-0 top-0 -mt-16 -mr-16 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      </section>

      {/* Grid Status Metrics Bar */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
          <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-blue-500" />
            Total Grid Feeders
          </span>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">
            {gridStatus?.totalFeeders || '—'}
          </p>
          <span className="text-xs text-slate-400">Monitored 24/7</span>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
          <span className="text-xs font-medium text-emerald-600 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Feeders Online
          </span>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {gridStatus?.onlineCount || '—'}
          </p>
          <span className="text-xs text-slate-400">Normal transmission</span>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
          <span className="text-xs font-medium text-amber-600 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-amber-500" />
            Planned Load Shedding
          </span>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
            {gridStatus?.plannedOutageCount || '0'}
          </p>
          <span className="text-xs text-slate-400">Scheduled deficit cuts</span>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
          <span className="text-xs font-medium text-rose-600 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
            Unexpected Faults
          </span>
          <p className="text-2xl font-bold text-rose-600 dark:text-rose-400">
            {gridStatus?.unexpectedFaultCount || '0'}
          </p>
          <span className="text-xs text-slate-400">Crews dispatched</span>
        </div>
      </section>

      {/* Role Cards Quick-Access */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Role-Based Operations Portals</h2>
          <p className="text-sm text-slate-500">Select any user role to experience the end-to-end platform workflow.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <Link
            href="/login?role=customer"
            className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 hover:shadow-md transition-all group"
          >
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold text-sm mb-3 group-hover:scale-105 transition-transform">
              👤
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base">Customer</h3>
            <p className="text-xs text-slate-500 mt-1">Check meter power status, report blackouts, view schedules.</p>
          </Link>

          <Link
            href="/login?role=operator"
            className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500/50 hover:shadow-md transition-all group"
          >
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold text-sm mb-3 group-hover:scale-105 transition-transform">
              ⚡
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base">Power Operator</h3>
            <p className="text-xs text-slate-500 mt-1">Generate fair rotation schedules and dispatch technicians.</p>
          </Link>

          <Link
            href="/login?role=technician"
            className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-orange-500/50 hover:shadow-md transition-all group"
          >
            <div className="h-10 w-10 rounded-xl bg-orange-500/10 text-orange-600 flex items-center justify-center font-bold text-sm mb-3 group-hover:scale-105 transition-transform">
              🛠️
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base">Field Technician</h3>
            <p className="text-xs text-slate-500 mt-1">Accept fault tickets, upload photo proof, restore feeder power.</p>
          </Link>

          <Link
            href="/login?role=manager"
            className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-cyan-500/50 hover:shadow-md transition-all group"
          >
            <div className="h-10 w-10 rounded-xl bg-cyan-500/10 text-cyan-600 flex items-center justify-center font-bold text-sm mb-3 group-hover:scale-105 transition-transform">
              📈
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base">Zone Manager</h3>
            <p className="text-xs text-slate-500 mt-1">Live grid data table, feeder failure rates, upgrade requests.</p>
          </Link>

          <Link
            href="/login?role=admin"
            className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-purple-500/50 hover:shadow-md transition-all group"
          >
            <div className="h-10 w-10 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center font-bold text-sm mb-3 group-hover:scale-105 transition-transform">
              🛡️
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base">System Admin</h3>
            <p className="text-xs text-slate-500 mt-1">Grid hierarchy, staff provisioning, critical feeder toggles.</p>
          </Link>
        </div>
      </section>

      {/* Live Feeder Table */}
      <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" />
              Live Feeder Line Status Table
            </h2>
            <p className="text-xs text-slate-500">Instant transmission status across all urban distribution feeders.</p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search feeder or substation..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 w-48 sm:w-64"
            />
            <button
              onClick={fetchStatus}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Feeder Name</th>
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Substation</th>
                <th className="py-3 px-4">Zone</th>
                <th className="py-3 px-4">Capacity</th>
                <th className="py-3 px-4">Shielding</th>
                <th className="py-3 px-4">Power Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredFeeders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No matching feeder lines found.
                  </td>
                </tr>
              ) : (
                filteredFeeders.map((f: any) => (
                  <tr key={f.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                      {f.name}
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-mono">
                      {f.code}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                      {f.substation?.name || 'Substation'}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                      {f.zone?.name || 'District'}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-700 dark:text-slate-200">
                      {f.capacityMW} MW
                    </td>
                    <td className="py-3 px-4">
                      {f.isCritical ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded border border-red-200 dark:border-red-800">
                          <ShieldCheck className="h-3 w-3" /> Critical (Hospital)
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">Standard</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={f.status} size="sm" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
