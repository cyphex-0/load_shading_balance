'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ShieldCheck,
  Zap,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Clock,
  Radio,
  Search,
  Filter,
  Users,
  Wrench,
  BarChart2,
  Cpu,
  Layers
} from 'lucide-react';
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
      (f.substation?.name && f.substation.name.toLowerCase().includes(search.toLowerCase()));
    const matchesZone = selectedZone === 'ALL' || f.zone?.id === selectedZone || f.zoneId === selectedZone;
    return matchesSearch && matchesZone;
  });

  // Extract unique zones for the filter dropdown
  const uniqueZones = Array.from(
    new Map(
      feeders
        .filter((f: any) => f.zone)
        .map((f: any) => [f.zone.id, f.zone])
    ).values()
  ) as any[];

  return (
    <div className="space-y-12 pb-12">
      {/* Hallmark Command Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-slate-950 text-white border border-slate-800/80 shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-transparent to-blue-500/10 pointer-events-none" />
        <div className="relative z-10 p-6 sm:p-10 lg:p-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          {/* Left Column: Mission Description */}
          <div className="lg:col-span-7 space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 text-xs font-mono font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              NATIONAL DISPATCH CENTER · BANGLADESH
            </div>
            
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-[1.15] text-white">
              Automated Load Shedding & Outage Operations
            </h1>
            
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-2xl">
              Algorithmic rotation eliminating double cuts, guaranteed hospital line protection, and instant smart conflict resolution distinguishing planned outages from emergency grid faults.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-3">
              <Link
                href={user ? (user.role === 'CUSTOMER' ? '/customer' : `/${user.role.toLowerCase()}`) : '/login'}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm shadow-md transition-all flex items-center gap-2"
              >
                {user ? 'Enter Console' : 'Access Operations Portals'}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/schedules"
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 font-semibold text-xs sm:text-sm border border-slate-700 transition-all flex items-center gap-2"
              >
                <Clock className="h-4 w-4 text-amber-400" />
                Public Timetables
              </Link>
            </div>
          </div>

          {/* Right Column: Live Grid Telemetry HUD */}
          <div className="lg:col-span-5 bg-slate-900/90 rounded-2xl border border-slate-800 p-5 space-y-4 backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-amber-400" />
                <span className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider">
                  Grid Telemetry HUD
                </span>
              </div>
              <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                50.02 Hz · NOMINAL
              </span>
            </div>

            {/* Demand vs Capacity Gauge */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-400">Current National Demand</span>
                <span className="text-white font-bold">14,850 MW</span>
              </div>
              <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden p-0.5">
                <div className="bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500 h-full rounded-full w-[88%]" />
              </div>
              <div className="flex justify-between text-[11px] font-mono text-slate-400">
                <span>Generation: 13,420 MW</span>
                <span className="text-rose-400 font-semibold">Deficit: -1,430 MW</span>
              </div>
            </div>

            {/* Mini HUD Indicators */}
            <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-xs">
              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <span className="text-[10px] text-slate-500 block uppercase">Rotation Algorithm</span>
                <span className="font-bold text-amber-400">Fair Round-Robin</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <span className="text-[10px] text-slate-500 block uppercase">Hospital Shielding</span>
                <span className="font-bold text-emerald-400">100% Protected</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Grid Telemetry Overview Metrics */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Feeders */}
        <div className="glass-panel rounded-2xl p-5 space-y-1 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Feeders</span>
            <Activity className="h-4 w-4 text-blue-500" />
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-mono-numbers">
            {gridStatus?.totalFeeders ?? '—'}
          </p>
          <span className="text-[11px] font-mono text-slate-400">Active distribution lines</span>
        </div>

        {/* Metric 2: Online Normal */}
        <div className="glass-panel rounded-2xl p-5 space-y-1 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Online Normal
            </span>
            <span className="text-[10px] font-mono text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded">
              TRANSMITTING
            </span>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono-numbers">
            {gridStatus?.onlineCount ?? '—'}
          </p>
          <span className="text-[11px] font-mono text-slate-400">Full power supplied</span>
        </div>

        {/* Metric 3: Planned Load Shedding */}
        <div className="glass-panel rounded-2xl p-5 space-y-1 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-amber-500" />
              Planned Shedding
            </span>
            <span className="text-[10px] font-mono text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded">
              ROTATING
            </span>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-amber-600 dark:text-amber-400 font-mono-numbers">
            {gridStatus?.plannedOutageCount ?? '0'}
          </p>
          <span className="text-[11px] font-mono text-slate-400">Fair deficit schedule</span>
        </div>

        {/* Metric 4: Unexpected Faults */}
        <div className="glass-panel rounded-2xl p-5 space-y-1 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
              Unexpected Faults
            </span>
            <span className="text-[10px] font-mono text-rose-600 bg-rose-500/10 px-1.5 py-0.5 rounded">
              DISPATCHED
            </span>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-rose-600 dark:text-rose-400 font-mono-numbers">
            {gridStatus?.unexpectedFaultCount ?? '0'}
          </p>
          <span className="text-[11px] font-mono text-slate-400">Field crews repairing</span>
        </div>
      </section>

      {/* Role-Based Operational Portals */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="h-5 w-5 text-amber-500" />
            Operational Console Matrix
          </h2>
          <p className="text-xs text-slate-500">
            Dedicated role consoles built for every stakeholder in the national power management lifecycle.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* 1. Customer */}
          <Link
            href="/login?role=customer"
            className="glass-panel rounded-2xl p-5 glass-card-hover group flex flex-col justify-between space-y-4 border"
          >
            <div>
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold mb-3 group-hover:scale-105 transition-transform">
                <Users className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">Customer Portal</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Check residential meter status, report unexpected outages, and view smart conflict results.
              </p>
            </div>
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              Launch Console <ArrowRight className="h-3 w-3" />
            </span>
          </Link>

          {/* 2. Power Operator */}
          <Link
            href="/login?role=operator"
            className="glass-panel rounded-2xl p-5 glass-card-hover group flex flex-col justify-between space-y-4 border"
          >
            <div>
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold mb-3 group-hover:scale-105 transition-transform">
                <Zap className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">Power Operator</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Execute algorithmic fair-rotation schedules, manage MW deficits, and assign field technicians.
              </p>
            </div>
            <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1">
              Control Room <ArrowRight className="h-3 w-3" />
            </span>
          </Link>

          {/* 3. Field Technician */}
          <Link
            href="/login?role=technician"
            className="glass-panel rounded-2xl p-5 glass-card-hover group flex flex-col justify-between space-y-4 border"
          >
            <div>
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold mb-3 group-hover:scale-105 transition-transform">
                <Wrench className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">Field Technician</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Mobile-optimized triage queue: Accept assignments, mark en route, upload photos, and restore power.
              </p>
            </div>
            <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
              Field Terminal <ArrowRight className="h-3 w-3" />
            </span>
          </Link>

          {/* 4. Zone Manager */}
          <Link
            href="/login?role=manager"
            className="glass-panel rounded-2xl p-5 glass-card-hover group flex flex-col justify-between space-y-4 border"
          >
            <div>
              <div className="h-10 w-10 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center font-bold mb-3 group-hover:scale-105 transition-transform">
                <BarChart2 className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">Zone Manager</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                District telemetry, feeder failure rates, technician MTTR performance, and upgrade petitions.
              </p>
            </div>
            <span className="text-[11px] font-bold text-cyan-600 dark:text-cyan-400 flex items-center gap-1">
              District HUD <ArrowRight className="h-3 w-3" />
            </span>
          </Link>

          {/* 5. System Admin */}
          <Link
            href="/login?role=admin"
            className="glass-panel rounded-2xl p-5 glass-card-hover group flex flex-col justify-between space-y-4 border"
          >
            <div>
              <div className="h-10 w-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold mb-3 group-hover:scale-105 transition-transform">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">System Admin</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Hospital feeder shielding toggles, staff RBAC provisioning, infrastructure approvals, and audit logs.
              </p>
            </div>
            <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400 flex items-center gap-1">
              Governance Hub <ArrowRight className="h-3 w-3" />
            </span>
          </Link>
        </div>
      </section>

      {/* Live Distribution Feeder Matrix */}
      <section className="glass-panel rounded-3xl overflow-hidden p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" />
              National Feeder Distribution Matrix
            </h2>
            <p className="text-xs text-slate-500">
              Real-time transmission status and capacity ratings across all urban electricity feeders.
            </p>
          </div>

          {/* Controls: Search, Zone Filter, Refresh */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search feeder or substation..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 w-48 sm:w-64"
              />
            </div>

            <select
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="ALL">All Zones ({feeders.length})</option>
              {uniqueZones.map((z: any) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>

            <button
              onClick={fetchStatus}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Refresh Feeder Matrix"
              aria-label="Refresh Feeder Matrix"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden sm:block overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800/80">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/75 dark:bg-slate-900/75 font-mono text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3 font-semibold">Feeder Identification</th>
                <th className="px-4 py-3 font-semibold">Substation / Zone</th>
                <th className="px-4 py-3 font-semibold">Capacity</th>
                <th className="px-4 py-3 font-semibold">Shielding Tier</th>
                <th className="px-4 py-3 font-semibold text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
              {loading && feeders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                    <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-amber-500 border-r-transparent mr-2 align-middle" />
                    Connecting to Grid Telemetry...
                  </td>
                </tr>
              ) : filteredFeeders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    No distribution lines match your filter.
                  </td>
                </tr>
              ) : (
                filteredFeeders.map((f: any) => (
                  <tr
                    key={f.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-900/50 transition-colors"
                  >
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-slate-900 dark:text-white">{f.name}</div>
                      <span className="font-mono text-[11px] text-amber-600 dark:text-amber-400">
                        {f.code}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">
                      <div>{f.substation?.name || 'Central Substation'}</div>
                      <span className="text-[10px] text-slate-400">{f.zone?.name || 'Dhaka Region'}</span>
                    </td>
                    <td className="px-4 py-3.5 font-mono-numbers text-slate-900 dark:text-slate-200">
                      {f.capacityMW} <span className="text-[10px] text-slate-400">MW</span>
                    </td>
                    <td className="px-4 py-3.5">
                      {f.isCritical ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/30">
                          <ShieldCheck className="h-3 w-3 text-purple-500" />
                          HOSPITAL SHIELDED
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400 font-mono">Standard Feeder</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <StatusBadge status={f.status} size="sm" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards Fallback */}
        <div className="sm:hidden space-y-3">
          {filteredFeeders.map((f: any) => (
            <div
              key={f.id}
              className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 space-y-2.5 text-xs"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white">{f.name}</h4>
                  <span className="font-mono text-[10px] text-amber-500">{f.code}</span>
                </div>
                <StatusBadge status={f.status} size="sm" />
              </div>
              <div className="flex items-center justify-between text-slate-500 font-mono text-[11px]">
                <span>{f.substation?.name || 'Substation'}</span>
                <span>{f.capacityMW} MW</span>
              </div>
              {f.isCritical && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono text-purple-600 dark:text-purple-300">
                    <ShieldCheck className="h-3 w-3" /> Shielded Hospital Line
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
