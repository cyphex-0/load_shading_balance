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
  Search,
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
    <div className="space-y-8 pb-12">
      {/* Clean Enterprise Command Hero */}
      <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 lg:p-10 shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column: Mission Description */}
          <div className="lg:col-span-7 space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-300 text-xs font-mono font-semibold">
              <span className="h-2 w-2 rounded-full bg-amber-600" />
              NATIONAL DISPATCH CENTER · BANGLADESH
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight text-slate-900">
              Automated Load Shedding & Outage Operations
            </h1>

            <p className="text-slate-600 text-sm sm:text-base leading-relaxed max-w-2xl font-normal">
              Algorithmic rotation eliminating double cuts, guaranteed hospital line protection, and instant smart conflict resolution distinguishing planned outages from emergency grid faults.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                href={user ? (user.role === 'CUSTOMER' ? '/customer' : `/${user.role.toLowerCase()}`) : '/login'}
                className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm shadow-sm transition-colors flex items-center gap-2"
              >
                {user ? 'Enter Console' : 'Access Operations Portals'}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/schedules"
                className="px-5 py-2.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs sm:text-sm border border-slate-300 transition-colors flex items-center gap-2"
              >
                <Clock className="h-4 w-4 text-slate-500" />
                Public Timetables
              </Link>
            </div>
          </div>

          {/* Right Column: Live Grid Telemetry HUD */}
          <div className="lg:col-span-5 bg-slate-50 rounded-xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-slate-700" />
                <span className="text-xs font-mono font-bold text-slate-800 uppercase tracking-wider">
                  Grid Telemetry HUD
                </span>
              </div>
              <span className="text-[11px] font-mono font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300">
                50.02 Hz · NOMINAL
              </span>
            </div>

            {/* Demand vs Capacity Gauge */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-600">Current National Demand</span>
                <span className="text-slate-900 font-bold">14,850 MW</span>
              </div>
              <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                <div className="bg-emerald-600 h-full rounded-full w-[88%]" />
              </div>
              <div className="flex justify-between text-[11px] font-mono text-slate-600">
                <span>Generation: 13,420 MW</span>
                <span className="text-rose-700 font-semibold">Deficit: -1,430 MW</span>
              </div>
            </div>

            {/* Mini HUD Indicators */}
            <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-xs">
              <div className="p-3 rounded-lg bg-white border border-slate-200">
                <span className="text-[10px] text-slate-500 block uppercase font-medium">Rotation Algorithm</span>
                <span className="font-bold text-amber-800">Fair Round-Robin</span>
              </div>
              <div className="p-3 rounded-lg bg-white border border-slate-200">
                <span className="text-[10px] text-slate-500 block uppercase font-medium">Hospital Shielding</span>
                <span className="font-bold text-emerald-800">100% Protected</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Grid Telemetry Overview Metrics */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Feeders */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-1 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Total Feeders</span>
            <Activity className="h-4 w-4 text-blue-600" />
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono-numbers">
            {gridStatus?.totalFeeders ?? '—'}
          </p>
          <span className="text-[11px] font-mono text-slate-500">Active distribution lines</span>
        </div>

        {/* Metric 2: Online Normal */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-1 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-600" />
              Online Normal
            </span>
            <span className="text-[10px] font-mono font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              TRANSMITTING
            </span>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-emerald-700 font-mono-numbers">
            {gridStatus?.onlineCount ?? '—'}
          </p>
          <span className="text-[11px] font-mono text-slate-500">Full power supplied</span>
        </div>

        {/* Metric 3: Planned Load Shedding */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-1 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-amber-600" />
              Planned Shedding
            </span>
            <span className="text-[10px] font-mono font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
              ROTATING
            </span>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-amber-700 font-mono-numbers">
            {gridStatus?.plannedOutageCount ?? '0'}
          </p>
          <span className="text-[11px] font-mono text-slate-500">Fair deficit schedule</span>
        </div>

        {/* Metric 4: Unexpected Faults */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-1 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-800 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
              Unexpected Faults
            </span>
            <span className="text-[10px] font-mono font-semibold text-rose-800 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
              DISPATCHED
            </span>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-rose-700 font-mono-numbers">
            {gridStatus?.unexpectedFaultCount ?? '0'}
          </p>
          <span className="text-[11px] font-mono text-slate-500">Field crews repairing</span>
        </div>
      </section>

      {/* Role-Based Operational Portals */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Layers className="h-5 w-5 text-amber-600" />
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
            className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 p-5 flex flex-col justify-between space-y-4 shadow-sm hover:shadow-md transition-all group"
          >
            <div>
              <div className="h-10 w-10 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center font-bold mb-3">
                <Users className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-slate-900 text-sm">Customer Portal</h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Check residential meter status, report unexpected outages, and view smart conflict results.
              </p>
            </div>
            <span className="text-[11px] font-bold text-emerald-800 flex items-center gap-1">
              Launch Console <ArrowRight className="h-3 w-3" />
            </span>
          </Link>

          {/* 2. Power Operator */}
          <Link
            href="/login?role=operator"
            className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 p-5 flex flex-col justify-between space-y-4 shadow-sm hover:shadow-md transition-all group"
          >
            <div>
              <div className="h-10 w-10 rounded-lg bg-blue-50 text-blue-700 border border-blue-100 flex items-center justify-center font-bold mb-3">
                <Zap className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-slate-900 text-sm">Power Operator</h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Execute algorithmic fair-rotation schedules, manage MW deficits, and assign field technicians.
              </p>
            </div>
            <span className="text-[11px] font-bold text-blue-800 flex items-center gap-1">
              Control Room <ArrowRight className="h-3 w-3" />
            </span>
          </Link>

          {/* 3. Field Technician */}
          <Link
            href="/login?role=technician"
            className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 p-5 flex flex-col justify-between space-y-4 shadow-sm hover:shadow-md transition-all group"
          >
            <div>
              <div className="h-10 w-10 rounded-lg bg-amber-50 text-amber-700 border border-amber-100 flex items-center justify-center font-bold mb-3">
                <Wrench className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-slate-900 text-sm">Field Technician</h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Mobile-optimized triage queue: Accept assignments, mark en route, upload photos, and restore power.
              </p>
            </div>
            <span className="text-[11px] font-bold text-amber-800 flex items-center gap-1">
              Field Terminal <ArrowRight className="h-3 w-3" />
            </span>
          </Link>

          {/* 4. Zone Manager */}
          <Link
            href="/login?role=manager"
            className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 p-5 flex flex-col justify-between space-y-4 shadow-sm hover:shadow-md transition-all group"
          >
            <div>
              <div className="h-10 w-10 rounded-lg bg-cyan-50 text-cyan-700 border border-cyan-100 flex items-center justify-center font-bold mb-3">
                <BarChart2 className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-slate-900 text-sm">Zone Manager</h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                District telemetry, feeder failure rates, technician MTTR performance, and upgrade petitions.
              </p>
            </div>
            <span className="text-[11px] font-bold text-cyan-800 flex items-center gap-1">
              District HUD <ArrowRight className="h-3 w-3" />
            </span>
          </Link>

          {/* 5. System Admin */}
          <Link
            href="/login?role=admin"
            className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 p-5 flex flex-col justify-between space-y-4 shadow-sm hover:shadow-md transition-all group"
          >
            <div>
              <div className="h-10 w-10 rounded-lg bg-purple-50 text-purple-700 border border-purple-100 flex items-center justify-center font-bold mb-3">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-slate-900 text-sm">System Admin</h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Hospital feeder shielding toggles, staff RBAC provisioning, infrastructure approvals, and audit logs.
              </p>
            </div>
            <span className="text-[11px] font-bold text-purple-800 flex items-center gap-1">
              Governance Hub <ArrowRight className="h-3 w-3" />
            </span>
          </Link>
        </div>
      </section>

      {/* Live Distribution Feeder Matrix */}
      <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
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
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 w-48 sm:w-64"
              />
            </div>

            <select
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
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
              className="p-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 transition-colors text-slate-600"
              title="Refresh Feeder Matrix"
              aria-label="Refresh Feeder Matrix"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden sm:block overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 font-mono text-slate-600 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold">Feeder Identification</th>
                <th className="px-4 py-3 font-semibold">Substation / Zone</th>
                <th className="px-4 py-3 font-semibold">Capacity</th>
                <th className="px-4 py-3 font-semibold">Shielding Tier</th>
                <th className="px-4 py-3 font-semibold text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-medium text-slate-800">
              {loading && feeders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                    <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-amber-500 border-r-transparent mr-2 align-middle" />
                    Connecting to Grid Telemetry...
                  </td>
                </tr>
              ) : filteredFeeders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No distribution lines match your filter.
                  </td>
                </tr>
              ) : (
                filteredFeeders.map((f: any) => (
                  <tr
                    key={f.id}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-slate-900">{f.name}</div>
                      <span className="font-mono text-[11px] text-amber-700 font-medium">
                        {f.code}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">
                      <div>{f.substation?.name || 'Central Substation'}</div>
                      <span className="text-[10px] text-slate-500">{f.zone?.name || 'Dhaka Region'}</span>
                    </td>
                    <td className="px-4 py-3.5 font-mono-numbers text-slate-900 font-semibold">
                      {f.capacityMW} <span className="text-[10px] text-slate-500 font-normal">MW</span>
                    </td>
                    <td className="px-4 py-3.5">
                      {f.isCritical ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-purple-50 text-purple-800 border border-purple-200">
                          <ShieldCheck className="h-3 w-3 text-purple-600" />
                          HOSPITAL SHIELDED
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500 font-mono">Standard Feeder</span>
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
              className="p-4 rounded-xl border border-slate-200 bg-white space-y-2.5 text-xs shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900">{f.name}</h4>
                  <span className="font-mono text-[10px] text-amber-700 font-medium">{f.code}</span>
                </div>
                <StatusBadge status={f.status} size="sm" />
              </div>
              <div className="flex items-center justify-between text-slate-600 font-mono text-[11px]">
                <span>{f.substation?.name || 'Substation'}</span>
                <span>{f.capacityMW} MW</span>
              </div>
              {f.isCritical && (
                <div className="pt-2 border-t border-slate-200">
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-purple-800">
                    <ShieldCheck className="h-3 w-3 text-purple-600" /> Shielded Hospital Line
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
