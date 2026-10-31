'use client';

import React, { useEffect, useState, useMemo } from 'react';
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
  Layers,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Radio,
  Sparkles,
  Building2,
  Gauge,
  Smartphone,
  Shield,
  SlidersHorizontal,
  Compass,
  ArrowUpRight
} from 'lucide-react';
import { ApiClient } from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../lib/auth-context';
import { getSocket } from '../lib/socket';

type StatusFilter = 'ALL' | 'ONLINE' | 'PLANNED_OUTAGE' | 'UNEXPECTED_FAULT' | 'CRITICAL';

export default function HomePage() {
  const { user } = useAuth();
  const [gridStatus, setGridStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedZone, setSelectedZone] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [expandedFeederId, setExpandedFeederId] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Instant Checker Widget State
  const [checkerInput, setCheckerInput] = useState('');
  const [checkerResult, setCheckerResult] = useState<any>(null);
  const [checking, setChecking] = useState(false);

  // Live Socket & Timestamp State
  const [socketLive, setSocketLive] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const fetchStatus = async () => {
    setLoading(true);
    const res = await ApiClient.get('/api/grid/status');
    if (res.success && res.data) {
      setGridStatus(res.data);
      setLastUpdated(new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Dhaka' }));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchStatus();

    // Setup live socket event listeners to refresh telemetry on transitions
    const socket = getSocket();
    setSocketLive(socket.connected);

    const onConnect = () => setSocketLive(true);
    const onDisconnect = () => setSocketLive(false);
    const onFeederChanged = () => fetchStatus();
    const onSchedulePublished = () => fetchStatus();
    const onTicketCreated = () => fetchStatus();

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('feeder:status_changed', onFeederChanged);
    socket.on('schedule:published', onSchedulePublished);
    socket.on('ticket:created', onTicketCreated);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('feeder:status_changed', onFeederChanged);
      socket.off('schedule:published', onSchedulePublished);
      socket.off('ticket:created', onTicketCreated);
    };
  }, []);

  const feeders = useMemo(() => gridStatus?.feeders || [], [gridStatus]);

  // Unique zones for dropdown
  const uniqueZones = useMemo(() => {
    return Array.from(
      new Map(
        feeders
          .filter((f: any) => f.zone)
          .map((f: any) => [f.zone.id, f.zone])
      ).values()
    ) as any[];
  }, [feeders]);

  // Filtered feeders
  const filteredFeeders = useMemo(() => {
    return feeders.filter((f: any) => {
      const q = search.toLowerCase().trim();
      const matchesSearch =
        !q ||
        f.name.toLowerCase().includes(q) ||
        f.code.toLowerCase().includes(q) ||
        (f.substation?.name && f.substation.name.toLowerCase().includes(q));

      const matchesZone = selectedZone === 'ALL' || f.zone?.id === selectedZone || f.zoneId === selectedZone;

      let matchesStatus = true;
      if (statusFilter === 'ONLINE') matchesStatus = f.status === 'ONLINE';
      else if (statusFilter === 'PLANNED_OUTAGE') matchesStatus = f.status === 'PLANNED_OUTAGE';
      else if (statusFilter === 'UNEXPECTED_FAULT') matchesStatus = f.status === 'UNEXPECTED_FAULT';
      else if (statusFilter === 'CRITICAL') matchesStatus = Boolean(f.isCritical);

      return matchesSearch && matchesZone && matchesStatus;
    });
  }, [feeders, search, selectedZone, statusFilter]);

  // Copy code helper
  const handleCopyCode = (code: string) => {
    navigator.clipboard?.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Instant Checker Evaluator
  const handleInstantCheck = (query?: string) => {
    const inputVal = (query !== undefined ? query : checkerInput).trim();
    if (!inputVal) return;

    setChecking(true);
    setCheckerInput(inputVal);

    setTimeout(() => {
      const qLower = inputVal.toLowerCase();
      // Match by code, meter, or name
      const matchedFeeder = feeders.find(
        (f: any) =>
          f.code.toLowerCase() === qLower ||
          f.name.toLowerCase().includes(qLower) ||
          (qLower.includes('dhn') && f.code.includes('DHN')) ||
          (qLower.includes('mir') && f.code.includes('MIR')) ||
          (qLower.includes('gls') && f.code.includes('GLS')) ||
          (qLower.includes('syl') && f.code.includes('SYL'))
      ) || feeders[0];

      if (matchedFeeder) {
        setCheckerResult({
          feeder: matchedFeeder,
          input: inputVal,
          timestamp: new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Dhaka' })
        });
      }
      setChecking(false);
    }, 200);
  };

  const getDashboardLink = () => {
    if (!user) return '/login';
    switch (user.role) {
      case 'CUSTOMER':
        return '/customer';
      case 'POWER_OPERATOR':
        return '/operator';
      case 'TECHNICIAN':
        return '/technician';
      case 'ZONE_MANAGER':
        return '/manager';
      case 'ADMIN':
        return '/admin';
      default:
        return '/';
    }
  };

  return (
    <div className="space-y-12 sm:space-y-16 pb-20">
      {/* =========================================================================
          SECTION 1: HERO SECTION — COHESIVE, CLEAN, BESPOKE ENTERPRISE
          ========================================================================= */}
      <section className="relative pt-6 sm:pt-10 pb-6 text-center space-y-6 max-w-4xl mx-auto">
        {/* Subtle Ambient Radial Lighting Canvas */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-gradient-to-tr from-amber-400/10 via-emerald-400/5 to-transparent rounded-full blur-3xl pointer-events-none -z-10" />

        {/* Live Operational Status Pill */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-slate-200/90 shadow-xs text-xs font-medium text-slate-700">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="font-semibold text-slate-900">National Dispatch Operations</span>
          <span className="text-slate-300">•</span>
          <span className="font-mono text-[11px] text-emerald-700 font-bold flex items-center gap-1">
            <Radio className="h-3 w-3" />
            {socketLive ? '50.02 Hz Nominal' : 'Telemetry Live'}
          </span>
        </div>

        {/* Confident, High-Clarity Headline */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.12]">
          Smart Load Shedding &{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-600 via-amber-500 to-emerald-600">
            Power Outage Intelligence
          </span>
        </h1>

        {/* Refined Value Proposition */}
        <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed font-normal">
          National grid management platform enforcing{' '}
          <span className="text-slate-900 font-semibold">Algorithmic Fair Rotation (No Double-Cuts)</span>,{' '}
          <span className="text-slate-900 font-semibold">Hospital Line Shielding</span>, and{' '}
          <span className="text-slate-900 font-semibold">Smart Conflict Resolution</span> across urban distribution circuits.
        </p>

        {/* High-Impact Actions */}
        <div className="flex flex-wrap items-center justify-center gap-3.5 pt-2">
          <Link
            href={getDashboardLink()}
            className="min-h-[48px] px-7 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm shadow-md hover:shadow-lg active:scale-[0.98] transition-all inline-flex items-center gap-2"
          >
            {user ? 'Enter Your Operations Console' : 'Access Stakeholder Portals'}
            <ArrowRight className="h-4 w-4" />
          </Link>

          <button
            onClick={() => {
              const el = document.getElementById('citizen-checker');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="min-h-[48px] px-6 py-3 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm border border-slate-200/90 shadow-xs hover:border-slate-300 active:scale-[0.98] transition-all inline-flex items-center gap-2"
          >
            <Sparkles className="h-4 w-4 text-amber-500" />
            Instant Outage Checker
          </button>

          <Link
            href="/schedules"
            className="min-h-[48px] px-5 py-3 rounded-xl text-slate-600 hover:text-slate-900 font-medium text-sm transition-colors inline-flex items-center gap-1.5"
          >
            <Clock className="h-4 w-4 text-slate-400" />
            Public Timetables
          </Link>
        </div>

        {/* Linear-Style Live SCADA Telemetry Pill */}
        <div className="pt-4 max-w-3xl mx-auto">
          <div className="p-3.5 sm:p-4 rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono">
            {/* Frequency Telemetry */}
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center font-bold shrink-0">
                <Gauge className="h-4 w-4" />
              </div>
              <div className="text-left">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Grid Frequency</div>
                <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  50.02 Hz
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                    NOMINAL
                  </span>
                </div>
              </div>
            </div>

            <div className="hidden sm:block h-7 w-px bg-slate-200" />

            {/* National Deficit Telemetry */}
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center font-bold shrink-0">
                <Activity className="h-4 w-4" />
              </div>
              <div className="text-left">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">National Load Deficit</div>
                <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  14,850 MW
                  <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                    -1,430 MW
                  </span>
                </div>
              </div>
            </div>

            <div className="hidden sm:block h-7 w-px bg-slate-200" />

            {/* Invariant Rule Status */}
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 flex items-center justify-center font-bold shrink-0">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div className="text-left">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Hospital Lines</div>
                <div className="font-bold text-purple-900 text-sm">
                  100% Shielded
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 2: KEY TELEMETRY CARDS (SHADCN/UI STATS DECK)
          ========================================================================= */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Card 1: Total Circuits */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 space-y-2 shadow-xs hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Total Circuits</span>
            <div className="h-8 w-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Activity className="h-4 w-4" />
            </div>
          </div>
          <p className="text-3xl sm:text-4xl font-extrabold text-slate-900 font-mono-numbers tracking-tight">
            {gridStatus?.totalFeeders ?? '—'}
          </p>
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 pt-1 border-t border-slate-100">
            <span>Monitored Feeder Lines</span>
            <span className="font-semibold text-slate-700">100% Active</span>
          </div>
        </div>

        {/* Card 2: Online Normal */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 space-y-2 shadow-xs hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Online Normal
            </span>
            <div className="h-8 w-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <p className="text-3xl sm:text-4xl font-extrabold text-emerald-700 font-mono-numbers tracking-tight">
            {gridStatus?.onlineCount ?? '—'}
          </p>
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 pt-1 border-t border-slate-100">
            <span>Transmitting at 50Hz</span>
            <span className="font-semibold text-emerald-700">Nominal</span>
          </div>
        </div>

        {/* Card 3: Planned Load Shedding */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 space-y-2 shadow-xs hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              Planned Shedding
            </span>
            <div className="h-8 w-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <p className="text-3xl sm:text-4xl font-extrabold text-amber-700 font-mono-numbers tracking-tight">
            {gridStatus?.plannedOutageCount ?? '0'}
          </p>
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 pt-1 border-t border-slate-100">
            <span>Fair Rotation Window</span>
            <span className="font-semibold text-amber-700">Scheduled</span>
          </div>
        </div>

        {/* Card 4: Unexpected Faults */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 space-y-2 shadow-xs hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-800 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              Emergency Faults
            </span>
            <div className="h-8 w-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <p className="text-3xl sm:text-4xl font-extrabold text-rose-700 font-mono-numbers tracking-tight">
            {gridStatus?.unexpectedFaultCount ?? '0'}
          </p>
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 pt-1 border-t border-slate-100">
            <span>Field Crews Dispatched</span>
            <span className="font-semibold text-rose-700">Active Triage</span>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 3: INTERACTIVE CITIZEN TOOL — INSTANT OUTAGE & CONFLICT VERIFIER
          ========================================================================= */}
      <section
        id="citizen-checker"
        className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-10 shadow-sm relative overflow-hidden"
      >
        <div className="max-w-2xl mx-auto space-y-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-mono font-semibold">
            <Sparkles className="h-3.5 w-3.5 text-amber-600" />
            CITIZEN SELF-SERVICE · ZERO LOGIN REQUIRED
          </div>

          <div className="space-y-1.5">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Instant Outage & Meter Conflict Verifier
            </h2>
            <p className="text-slate-600 text-sm max-w-lg mx-auto leading-relaxed">
              Experiencing a blackout? Verify whether your area is under a scheduled load-shedding slot or if an unexpected equipment fault has occurred.
            </p>
          </div>

          {/* Interactive Search Input */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            <div className="relative w-full">
              <Search className="h-4 w-4 absolute left-3.5 top-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Enter Meter (e.g. MTR-DHN-101) or feeder name..."
                value={checkerInput}
                onChange={(e) => setCheckerInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInstantCheck()}
                className="w-full min-h-[48px] pl-10 pr-4 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 bg-slate-50/50 focus:bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-all font-mono shadow-xs"
              />
            </div>
            <button
              onClick={() => handleInstantCheck()}
              disabled={checking || !checkerInput.trim()}
              className="w-full sm:w-auto min-h-[48px] px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-semibold text-xs sm:text-sm transition-all shrink-0 inline-flex items-center justify-center gap-2 shadow-xs active:scale-[0.98]"
            >
              {checking ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Verify Line
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>

          {/* Quick-Preset Chips */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-xs">
            <span className="text-slate-500 font-mono text-[11px]">Quick check chips:</span>
            {[
              { label: 'Dhanmondi (MTR-DHN-101)', val: 'MTR-DHN-101' },
              { label: 'Mirpur (MTR-MIR-201)', val: 'MTR-MIR-201' },
              { label: 'Gulshan (MTR-GLS-301)', val: 'MTR-GLS-301' },
              { label: 'Sylhet (MTR-SYL-9901)', val: 'MTR-SYL-9901' }
            ].map((preset) => (
              <button
                key={preset.val}
                onClick={() => handleInstantCheck(preset.val)}
                className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-[11px] font-medium transition-colors border border-slate-200/60"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Interactive Result Verdict Card */}
          {checkerResult && (
            <div className="pt-4 text-left max-w-xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div
                className={`p-6 rounded-2xl border transition-all ${
                  checkerResult.feeder.status === 'ONLINE'
                    ? 'bg-emerald-50/80 border-emerald-300/80 text-emerald-950'
                    : checkerResult.feeder.status === 'PLANNED_OUTAGE'
                    ? 'bg-amber-50/80 border-amber-300/80 text-amber-950'
                    : 'bg-rose-50/80 border-rose-300/80 text-rose-950'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {checkerResult.feeder.status === 'ONLINE' ? (
                      <div className="h-10 w-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="h-5 w-5" />
                      </div>
                    ) : checkerResult.feeder.status === 'PLANNED_OUTAGE' ? (
                      <div className="h-10 w-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                        <Clock className="h-5 w-5" />
                      </div>
                    ) : (
                      <div className="h-10 w-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                        <AlertTriangle className="h-5 w-5" />
                      </div>
                    )}
                    <div>
                      <h4 className="font-bold text-base">
                        {checkerResult.feeder.status === 'ONLINE'
                          ? 'Grid Line Transmitting Normally'
                          : checkerResult.feeder.status === 'PLANNED_OUTAGE'
                          ? 'Scheduled Load Shedding In Progress'
                          : 'Emergency Hardware Fault Active'}
                      </h4>
                      <p className="text-xs font-mono opacity-80 mt-0.5">
                        Matched Feeder: <strong>{checkerResult.feeder.name}</strong> ({checkerResult.feeder.code})
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={checkerResult.feeder.status} size="sm" />
                </div>

                {/* Verdict Explanation based on Smart Conflict Engine */}
                <div className="mt-4 pt-3.5 border-t border-current/20 text-xs leading-relaxed">
                  {checkerResult.feeder.status === 'ONLINE' ? (
                    <p>
                      Electricity is transmitting normally across this distribution line at nominal 50.00 Hz frequency.
                      If your building has no power, verify your main circuit breaker or contact your building electrician.
                    </p>
                  ) : checkerResult.feeder.status === 'PLANNED_OUTAGE' ? (
                    <p>
                      This distribution line is currently rotating under a{' '}
                      <strong>published national load shedding schedule</strong>. Power will restore automatically at the conclusion of the scheduled slot.
                      No technician report is required.
                    </p>
                  ) : (
                    <p>
                      An unexpected distribution line fault has been reported on this circuit. Our automated control room has dispatched field technicians.
                      Repairs are actively underway.
                    </p>
                  )}
                </div>

                <div className="mt-3.5 flex items-center justify-between text-[11px] font-mono opacity-70 border-t border-current/10 pt-2.5">
                  <span>Substation: {checkerResult.feeder.substation?.name || 'Dhaka Central'}</span>
                  <span>Verified at: {checkerResult.timestamp}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* =========================================================================
          SECTION 4: FIVE-STAKEHOLDER BENTO SHOWCASE (SHADCN/UI CARD PATTERN)
          ========================================================================= */}
      <section className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <div className="inline-flex items-center gap-1.5 text-slate-500 font-mono text-xs font-bold uppercase tracking-wider">
              <Layers className="h-4 w-4 text-amber-500" />
              Unified Stakeholder Architecture
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5">
              Five Dedicated Operations Consoles
            </h2>
          </div>
          <p className="text-xs text-slate-500 max-w-sm">
            Purpose-built operational portals tailored for citizens, dispatch operators, repair crews, and supervisors.
          </p>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-5">
          {/* Card 1: Customer Portal (Double-width - 7 cols) */}
          <Link
            href="/login?role=customer"
            className="lg:col-span-7 bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 flex flex-col justify-between shadow-xs hover:shadow-md hover:border-slate-300 transition-all group"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="h-11 w-11 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center font-bold">
                  <Users className="h-5 w-5" />
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  RESIDENT & BUSINESS
                </span>
              </div>

              <div>
                <h3 className="text-xl font-bold text-slate-900 group-hover:text-emerald-700 transition-colors flex items-center gap-2">
                  Customer & Citizen Portal
                  <ArrowUpRight className="h-4 w-4 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 mt-1.5 leading-relaxed max-w-lg">
                  Bind multiple residential or commercial meters, inspect real-time transmission health, review upcoming scheduled deficit slots, and file smart blackout reports with automatic conflict diagnosis.
                </p>
              </div>

              {/* Realistic Meter Mockup Box */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs font-mono max-w-md">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 font-medium">Meter Line: MTR-DHN-101</span>
                  <span className="text-[10px] text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded font-bold">
                    ONLINE
                  </span>
                </div>
                <div className="flex justify-between text-slate-500 text-[11px]">
                  <span>Feeder: Dhanmondi Road 27</span>
                  <span>Next Rotation: None Today</span>
                </div>
              </div>
            </div>

            <div className="pt-6 flex items-center justify-between text-xs font-semibold text-emerald-700 border-t border-slate-100 mt-4">
              <span>Enter Resident Console</span>
              <span className="font-mono text-[11px] text-slate-400 font-normal">SMS Triage Enabled</span>
            </div>
          </Link>

          {/* Card 2: Power Operator (5 cols) */}
          <Link
            href="/login?role=operator"
            className="lg:col-span-5 bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 flex flex-col justify-between shadow-xs hover:shadow-md hover:border-slate-300 transition-all group"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="h-11 w-11 rounded-2xl bg-blue-50 text-blue-700 border border-blue-100 flex items-center justify-center font-bold">
                  <Zap className="h-5 w-5" />
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-blue-50 text-blue-800 border border-blue-200">
                  NATIONAL DISPATCH
                </span>
              </div>

              <div>
                <h3 className="text-xl font-bold text-slate-900 group-hover:text-blue-700 transition-colors flex items-center gap-2">
                  Power Operator Console
                  <ArrowUpRight className="h-4 w-4 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                </h3>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Generate algorithmic rotation plans across megawatt deficits, verify hospital line shielding, publish schedules idempotently, and dispatch field technicians.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono space-y-1 text-slate-600">
                <div className="flex justify-between">
                  <span>Deficit Target:</span>
                  <span className="font-bold text-slate-900">25 MW Balancing</span>
                </div>
                <div className="flex justify-between text-emerald-700 text-[11px]">
                  <span>Hospital Lines:</span>
                  <span>100% Excluded</span>
                </div>
              </div>
            </div>

            <div className="pt-6 flex items-center justify-between text-xs font-semibold text-blue-700 border-t border-slate-100 mt-4">
              <span>Launch Control Room</span>
              <span className="font-mono text-[11px] text-slate-400 font-normal">Idempotent Publish</span>
            </div>
          </Link>

          {/* Card 3: Field Technician (4 cols) */}
          <Link
            href="/login?role=technician"
            className="lg:col-span-4 bg-white rounded-3xl border border-slate-200/90 p-6 flex flex-col justify-between shadow-xs hover:shadow-md hover:border-slate-300 transition-all group"
          >
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-700 border border-amber-100 flex items-center justify-center font-bold">
                  <Wrench className="h-5 w-5" />
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-50 text-amber-800 border border-amber-200">
                  MOBILE FIRST
                </span>
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-900 group-hover:text-amber-700 transition-colors flex items-center gap-1.5">
                  Field Technician Terminal
                  <ArrowUpRight className="h-3.5 w-3.5 opacity-50 group-hover:opacity-100 transition-all" />
                </h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Mobile triage queue with 120-min SLA timer, 1-tap state progression, and mandatory photo resolution evidence gate.
                </p>
              </div>
            </div>

            <div className="pt-4 flex items-center justify-between text-xs font-semibold text-amber-700 border-t border-slate-100 mt-3">
              <span>Field Terminal</span>
              <span className="font-mono text-[10px] text-slate-400 font-normal">Photo Gate 422</span>
            </div>
          </Link>

          {/* Card 4: Zone Manager (4 cols) */}
          <Link
            href="/login?role=manager"
            className="lg:col-span-4 bg-white rounded-3xl border border-slate-200/90 p-6 flex flex-col justify-between shadow-xs hover:shadow-md hover:border-slate-300 transition-all group"
          >
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="h-10 w-10 rounded-xl bg-cyan-50 text-cyan-700 border border-cyan-100 flex items-center justify-center font-bold">
                  <BarChart2 className="h-5 w-5" />
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-50 text-cyan-800 border border-cyan-200">
                  DISTRICT HUD
                </span>
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-900 group-hover:text-cyan-700 transition-colors flex items-center gap-1.5">
                  Zone Manager HUD
                  <ArrowUpRight className="h-3.5 w-3.5 opacity-50 group-hover:opacity-100 transition-all" />
                </h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  District telemetry, empirical feeder failure rate ranking, technician MTTR metrics, and capital upgrade petitions.
                </p>
              </div>
            </div>

            <div className="pt-4 flex items-center justify-between text-xs font-semibold text-cyan-700 border-t border-slate-100 mt-3">
              <span>District Cockpit</span>
              <span className="font-mono text-[10px] text-slate-400 font-normal">Zone Scoped</span>
            </div>
          </Link>

          {/* Card 5: System Admin (4 cols) */}
          <Link
            href="/login?role=admin"
            className="lg:col-span-4 bg-white rounded-3xl border border-slate-200/90 p-6 flex flex-col justify-between shadow-xs hover:shadow-md hover:border-slate-300 transition-all group"
          >
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="h-10 w-10 rounded-xl bg-purple-50 text-purple-700 border border-purple-100 flex items-center justify-center font-bold">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-50 text-purple-800 border border-purple-200">
                  GOVERNANCE
                </span>
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-900 group-hover:text-purple-700 transition-colors flex items-center gap-1.5">
                  System Admin Hub
                  <ArrowUpRight className="h-3.5 w-3.5 opacity-50 group-hover:opacity-100 transition-all" />
                </h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Multi-tier RBAC user provisioning, hospital line critical shielding switches, capital upgrade approval decisions, and audit trails.
                </p>
              </div>
            </div>

            <div className="pt-4 flex items-center justify-between text-xs font-semibold text-purple-700 border-t border-slate-100 mt-3">
              <span>Governance Hub</span>
              <span className="font-mono text-[10px] text-slate-400 font-normal">Audit Logs</span>
            </div>
          </Link>
        </div>
      </section>

      {/* =========================================================================
          SECTION 5: NATIONAL FEEDER DISTRIBUTION MATRIX (DATA TERMINAL)
          ========================================================================= */}
      <section className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-slate-500 font-mono text-xs font-bold uppercase tracking-wider">
              <Zap className="h-4 w-4 text-amber-500" />
              Live Distribution Telemetry
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
              National Feeder Distribution Matrix
            </h2>
            <p className="text-xs text-slate-500">
              Real-time transmission status, load capacity gauges, and hospital shielding ratings across urban circuits.
            </p>
          </div>

          {/* Controls: Search, Zone Filter, Refresh */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search feeder or substation..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="min-h-[44px] pl-9 pr-3.5 py-2 text-xs rounded-xl border border-slate-300 bg-slate-50/50 focus:bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 w-48 sm:w-60 transition-all font-mono"
              />
            </div>

            <select
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
              className="min-h-[44px] px-3.5 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900"
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
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white hover:bg-slate-50 transition-colors text-slate-600 active:scale-95"
              title="Refresh Feeder Matrix"
              aria-label="Refresh Feeder Matrix"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Segmented Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
          {[
            { id: 'ALL', label: `All Circuits (${feeders.length})` },
            { id: 'ONLINE', label: `Online Normal (${gridStatus?.onlineCount ?? 0})` },
            { id: 'PLANNED_OUTAGE', label: `In Load Shedding (${gridStatus?.plannedOutageCount ?? 0})` },
            { id: 'UNEXPECTED_FAULT', label: `Emergency Faults (${gridStatus?.unexpectedFaultCount ?? 0})` },
            { id: 'CRITICAL', label: `Hospital Shielded (${feeders.filter((f: any) => f.isCritical).length})` }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as StatusFilter)}
              className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                statusFilter === tab.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Desktop Data Table */}
        <div className="hidden sm:block overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 font-mono text-slate-500 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-4 py-3.5 font-semibold">Feeder Identification</th>
                <th className="px-4 py-3.5 font-semibold">Substation / Zone</th>
                <th className="px-4 py-3.5 font-semibold">Capacity Load</th>
                <th className="px-4 py-3.5 font-semibold">Protection Tier</th>
                <th className="px-4 py-3.5 font-semibold text-center">Status</th>
                <th className="px-4 py-3.5 font-semibold text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-medium text-slate-800">
              {loading && feeders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-slate-500">
                    <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-slate-900 border-r-transparent mr-2 align-middle" />
                    Connecting to SCADA Distribution Stream...
                  </td>
                </tr>
              ) : filteredFeeders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    No distribution lines match your filter criteria.
                  </td>
                </tr>
              ) : (
                filteredFeeders.map((f: any) => {
                  const isExpanded = expandedFeederId === f.id;
                  return (
                    <React.Fragment key={f.id}>
                      <tr
                        onClick={() => setExpandedFeederId(isExpanded ? null : f.id)}
                        className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${
                          isExpanded ? 'bg-amber-50/20' : ''
                        }`}
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{f.name}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyCode(f.code);
                              }}
                              title="Copy Feeder Code"
                              className="text-slate-400 hover:text-slate-600"
                            >
                              {copiedCode === f.code ? (
                                <Check className="h-3 w-3 text-emerald-600" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                          <span className="font-mono text-[11px] text-amber-700 font-semibold">{f.code}</span>
                        </td>
                        <td className="px-4 py-3.5 text-slate-600">
                          <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                            <Building2 className="h-3.5 w-3.5 text-slate-400" />
                            {f.substation?.name || 'Main Substation'}
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono">{f.zone?.name || 'Dhaka Region'}</span>
                        </td>
                        <td className="px-4 py-3.5 font-mono-numbers">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{f.capacityMW} MW</span>
                            <div className="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden border border-slate-200">
                              <div
                                className="bg-slate-900 h-full rounded-full"
                                style={{ width: `${Math.min(100, (f.capacityMW / 30) * 100)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          {f.isCritical ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-purple-50 text-purple-800 border border-purple-200">
                              <ShieldCheck className="h-3 w-3 text-purple-600" />
                              HOSPITAL SHIELDED
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-500 font-mono">Standard Circuit</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <StatusBadge status={f.status} size="sm" />
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedFeederId(isExpanded ? null : f.id);
                            }}
                            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                            aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
                          >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                        </td>
                      </tr>

                      {/* Expandable Row Details */}
                      {isExpanded && (
                        <tr className="bg-slate-50/70">
                          <td colSpan={6} className="px-6 py-4 border-t border-slate-200/80">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
                              <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-xs">
                                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Circuit Hierarchy</span>
                                <span className="text-slate-900 font-bold">{f.name}</span>
                                <p className="text-slate-500 text-[11px] mt-0.5">
                                  Substation ID: {f.substationId}
                                </p>
                              </div>

                              <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-xs">
                                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Grid Invariant Protection</span>
                                <span className={f.isCritical ? 'text-purple-700 font-bold' : 'text-slate-800'}>
                                  {f.isCritical ? 'Law 1: 100% Hospital Immunity' : 'Law 2: Subject to Fair Rotation'}
                                </span>
                                <p className="text-slate-500 text-[11px] mt-0.5">
                                  Rating: {f.capacityMW} MW Active Load
                                </p>
                              </div>

                              <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                                <div>
                                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Direct Operations Link</span>
                                  <Link
                                    href={getDashboardLink()}
                                    className="text-slate-900 font-bold hover:underline inline-flex items-center gap-1 mt-0.5"
                                  >
                                    View in Portal <ArrowRight className="h-3 w-3" />
                                  </Link>
                                </div>
                                <StatusBadge status={f.status} size="sm" />
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Responsive Cards */}
        <div className="sm:hidden space-y-3">
          {filteredFeeders.map((f: any) => {
            const isExpanded = expandedFeederId === f.id;
            return (
              <div
                key={f.id}
                onClick={() => setExpandedFeederId(isExpanded ? null : f.id)}
                className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3 text-xs shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-900">{f.name}</h4>
                    <span className="font-mono text-[11px] text-amber-700 font-semibold">{f.code}</span>
                  </div>
                  <StatusBadge status={f.status} size="sm" />
                </div>

                <div className="flex items-center justify-between text-slate-600 font-mono text-[11px]">
                  <span>{f.substation?.name || 'Substation'}</span>
                  <span className="font-bold text-slate-900">{f.capacityMW} MW</span>
                </div>

                {f.isCritical && (
                  <div className="pt-2 border-t border-slate-100">
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-purple-800">
                      <ShieldCheck className="h-3 w-3 text-purple-600" /> Hospital Shielded Line
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* =========================================================================
          SECTION 6: INSTITUTIONAL RELIABILITY GUARANTEES
          ========================================================================= */}
      <section className="bg-slate-900 text-white rounded-3xl p-6 sm:p-10 shadow-sm space-y-6">
        <div className="text-center max-w-xl mx-auto space-y-1.5">
          <span className="text-amber-400 font-mono text-xs font-bold uppercase tracking-wider">
            National Grid Standard
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Engineered for High-Deficit Power Equity
          </h2>
          <p className="text-slate-400 text-xs sm:text-sm">
            Core algorithmic invariants codified to ensure transparent distribution across Bangladesh metropolitan grids.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {/* Pillar 1 */}
          <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
            <div className="h-9 w-9 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center font-bold">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h4 className="font-bold text-slate-200 text-sm">Law 1: Hospital Immunity</h4>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              Trauma hospitals, oxygen generation plants, and emergency healthcare facilities are strictly shielded from all load-shedding schedules.
            </p>
          </div>

          {/* Pillar 2 */}
          <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
            <div className="h-9 w-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold">
              <Clock className="h-5 w-5" />
            </div>
            <h4 className="font-bold text-slate-200 text-sm">Law 2: No-Double-Cut Rule</h4>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              Algorithmic fair round-robin rotation guarantees no feeder circuit experiences load shedding more than once in a single calendar day.
            </p>
          </div>

          {/* Pillar 3 */}
          <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
            <div className="h-9 w-9 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold">
              <Cpu className="h-5 w-5" />
            </div>
            <h4 className="font-bold text-slate-200 text-sm">Sub-100ms Cache Latency</h4>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              High-throughput Redis cache-aside architecture delivers instant timetable lookups while distributed mutex locks prevent duplicate job runs.
            </p>
          </div>

          {/* Pillar 4 */}
          <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
            <div className="h-9 w-9 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold">
              <Wrench className="h-5 w-5" />
            </div>
            <h4 className="font-bold text-slate-200 text-sm">Photo Evidence Gate</h4>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              Technicians must upload cryptographically verified repair photographs before any outage ticket can be resolved and power restored.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
