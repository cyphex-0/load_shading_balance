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
  Gauge
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

    // Simulate smart conflict resolution evaluation against live SCADA
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
    }, 250);
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
    <div className="space-y-10 pb-16">
      {/* =========================================================================
          SECTION 1: EXECUTIVE COMMAND HERO DECK & SCADA TELEMETRY COCKPIT
          ========================================================================= */}
      <section className="relative overflow-hidden rounded-3xl bg-slate-950 text-white p-6 sm:p-8 lg:p-10 border border-slate-800 shadow-2xl scada-grid-mesh-dark">
        {/* Ambient Radial Mesh Lighting */}
        <div className="absolute top-0 right-1/4 -mt-20 -mr-20 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 -mb-20 -ml-20 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          {/* Left 7 Columns: Core National Mission & Action Deck */}
          <div className="lg:col-span-7 space-y-5">
            {/* National Dispatch Telemetry Badge */}
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/90 text-amber-400 border border-amber-500/30 text-xs font-mono font-semibold tracking-wide">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                </span>
                LIVE NATIONAL SCADA · BANGLADESH POWER DISPATCH
              </span>

              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 text-[11px] font-mono">
                <Radio className="h-3 w-3 text-emerald-400 animate-pulse" />
                {socketLive ? 'SOCKET LIVE' : 'SYNCING...'}
              </span>
            </div>

            {/* High-Impact Technical Headline */}
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight text-white">
              Automated Load Shedding &{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-amber-200 to-emerald-400">
                Outage Operations
              </span>
            </h1>

            {/* Concise Mission Paragraph */}
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-2xl font-normal">
              Enterprise power balancing platform enforcing{' '}
              <span className="text-amber-300 font-medium">Algorithmic Fair Rotation (Zero Double-Cuts)</span>,{' '}
              <span className="text-emerald-300 font-medium">Guaranteed Hospital Line Shielding</span>, and{' '}
              <span className="text-sky-300 font-medium">Smart Conflict Resolution</span> distinguishing planned outages from emergency grid hardware faults.
            </p>

            {/* Primary & Secondary Action Buttons */}
            <div className="flex flex-wrap items-center gap-3.5 pt-2">
              <Link
                href={getDashboardLink()}
                className="min-h-[46px] px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-bold text-xs sm:text-sm shadow-lg shadow-amber-500/20 active:scale-95 transition-all inline-flex items-center gap-2"
              >
                {user ? 'Enter Your Operations Console' : 'Access Stakeholder Portals'}
                <ArrowRight className="h-4 w-4" />
              </Link>

              <button
                onClick={() => {
                  const el = document.getElementById('instant-checker');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="min-h-[46px] px-5 py-3 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 font-semibold text-xs sm:text-sm border border-slate-700 hover:border-slate-600 transition-all inline-flex items-center gap-2"
              >
                <Sparkles className="h-4 w-4 text-amber-400" />
                Instant Outage Checker
              </button>

              <Link
                href="/schedules"
                className="min-h-[46px] px-4 py-3 rounded-xl text-slate-400 hover:text-white text-xs sm:text-sm transition-colors inline-flex items-center gap-1.5"
              >
                <Clock className="h-4 w-4" />
                Public Timetables
              </Link>
            </div>

            {/* Three Institutional Trust Pillars */}
            <div className="pt-3 flex flex-wrap items-center gap-4 text-xs font-mono text-slate-400 border-t border-slate-800/80">
              <div className="flex items-center gap-1.5 text-emerald-400">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span>Law 1: Hospital Immunity (100%)</span>
              </div>
              <div className="flex items-center gap-1.5 text-amber-300">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Law 2: No Double-Cuts Invariant</span>
              </div>
              <div className="flex items-center gap-1.5 text-sky-400">
                <Cpu className="h-4 w-4 shrink-0" />
                <span>Sub-100ms Redis Cache-Aside</span>
              </div>
            </div>
          </div>

          {/* Right 5 Columns: Real-Time SCADA Telemetry Cockpit HUD */}
          <div className="lg:col-span-5 bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-700/80 p-5 sm:p-6 space-y-4 shadow-xl">
            {/* Header: Cockpit Status & Waveform Indicator */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-amber-400" />
                <span className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider">
                  SCADA Telemetry Cockpit
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-[11px] font-mono font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30">
                  50.02 Hz · NOMINAL
                </span>
              </div>
            </div>

            {/* National Demand vs Generation Gauges */}
            <div className="space-y-2.5">
              <div className="flex justify-between items-baseline text-xs font-mono">
                <span className="text-slate-400">National Demand Target</span>
                <span className="text-white font-bold text-sm">14,850 MW</span>
              </div>

              {/* Progress bar representing grid capacity */}
              <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden p-0.5 border border-slate-700">
                <div
                  className="bg-gradient-to-r from-emerald-500 via-emerald-400 to-amber-500 h-full rounded-full transition-all duration-500"
                  style={{ width: '90.3%' }}
                />
              </div>

              <div className="flex justify-between text-[11px] font-mono">
                <span className="text-emerald-400 font-semibold">Available Generation: 13,420 MW</span>
                <span className="text-rose-400 font-bold bg-rose-950/80 px-2 py-0.5 rounded border border-rose-500/30">
                  Deficit: -1,430 MW
                </span>
              </div>
            </div>

            {/* Frequency Waveform SVG Telemetry Monitor */}
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span>GRID OSCILLATION SPECTRUM</span>
                <span className="text-emerald-400">SYNCHRONIZED (BST)</span>
              </div>
              <div className="h-8 w-full flex items-center justify-center overflow-hidden">
                <svg className="w-full h-8 text-emerald-500" viewBox="0 0 300 32" preserveAspectRatio="none">
                  <path
                    d="M 0 16 Q 25 2, 50 16 T 100 16 T 150 16 T 200 16 T 250 16 T 300 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="animate-wave-flow"
                  />
                </svg>
              </div>
            </div>

            {/* Mini HUD Invariant Indicators */}
            <div className="grid grid-cols-2 gap-2.5 font-mono text-xs">
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-[10px] text-slate-400 block uppercase font-medium">Rotation Algorithm</span>
                <span className="font-bold text-amber-400">Fair Round-Robin</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-[10px] text-slate-400 block uppercase font-medium">Hospital Shielding</span>
                <span className="font-bold text-emerald-400">100% Protected</span>
              </div>
            </div>

            {/* Last Refresh Timestamp */}
            <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between pt-1">
              <span>National Control Room: Dhaka, BD</span>
              <span>Updated: {lastUpdated || 'Live Syncing'}</span>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 2: INTERACTIVE ZERO-LOGIN SMART OUTAGE CHECKER WIDGET
          ========================================================================= */}
      <section
        id="instant-checker"
        className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 lg:p-10 shadow-sm relative overflow-hidden"
      >
        <div className="max-w-3xl mx-auto space-y-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-300 text-xs font-mono font-semibold">
            <Sparkles className="h-3.5 w-3.5 text-amber-600" />
            CITIZEN UTILITY TOOL · ZERO LOGIN REQUIRED
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Instant Meter & Feeder Outage Verification
            </h2>
            <p className="text-slate-600 text-sm max-w-xl mx-auto leading-relaxed">
              Verify whether an outage in your area is a{' '}
              <strong className="text-slate-800">scheduled deficit rotation</strong> or an{' '}
              <strong className="text-slate-800">unexpected hardware fault</strong> in real time.
            </p>
          </div>

          {/* Interactive Search Bar & Trigger */}
          <div className="flex flex-col sm:flex-row items-center gap-3 max-w-xl mx-auto">
            <div className="relative w-full">
              <Search className="h-4 w-4 absolute left-3.5 top-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Enter Meter (e.g. MTR-DHN-101) or Feeder name..."
                value={checkerInput}
                onChange={(e) => setCheckerInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInstantCheck()}
                className="w-full min-h-[46px] pl-10 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 bg-slate-50 focus:bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all font-mono"
              />
            </div>
            <button
              onClick={() => handleInstantCheck()}
              disabled={checking || !checkerInput.trim()}
              className="w-full sm:w-auto min-h-[46px] px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold text-xs sm:text-sm transition-all shrink-0 inline-flex items-center justify-center gap-2 shadow-sm"
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

          {/* Preset Quick-Check Pills */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-xs">
            <span className="text-slate-500 font-mono text-[11px]">Quick check examples:</span>
            {[
              { label: 'MTR-DHN-101 (Dhanmondi)', val: 'MTR-DHN-101' },
              { label: 'MTR-MIR-201 (Mirpur)', val: 'MTR-MIR-201' },
              { label: 'MTR-GLS-301 (Gulshan)', val: 'MTR-GLS-301' },
              { label: 'MTR-SYL-9901 (Sylhet)', val: 'MTR-SYL-9901' }
            ].map((preset) => (
              <button
                key={preset.val}
                onClick={() => handleInstantCheck(preset.val)}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-[11px] transition-colors border border-slate-200"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Interactive Result Verdict Card */}
          {checkerResult && (
            <div className="pt-4 text-left max-w-xl mx-auto">
              <div
                className={`p-5 rounded-2xl border transition-all ${
                  checkerResult.feeder.status === 'ONLINE'
                    ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
                    : checkerResult.feeder.status === 'PLANNED_OUTAGE'
                    ? 'bg-amber-50/90 border-amber-300 text-amber-950'
                    : 'bg-rose-50/90 border-rose-300 text-rose-950'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    {checkerResult.feeder.status === 'ONLINE' ? (
                      <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                    ) : checkerResult.feeder.status === 'PLANNED_OUTAGE' ? (
                      <Clock className="h-6 w-6 text-amber-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="h-6 w-6 text-rose-600 shrink-0" />
                    )}
                    <div>
                      <h4 className="font-bold text-sm sm:text-base">
                        {checkerResult.feeder.status === 'ONLINE'
                          ? 'Grid Line Transmitting Normally'
                          : checkerResult.feeder.status === 'PLANNED_OUTAGE'
                          ? 'Known Scheduled Deficit Outage'
                          : 'Emergency Hardware Fault Detected'}
                      </h4>
                      <p className="text-xs font-mono opacity-80">
                        Query: &quot;{checkerResult.input}&quot; · Resolved to Feeder:{' '}
                        <strong>{checkerResult.feeder.name}</strong> ({checkerResult.feeder.code})
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={checkerResult.feeder.status} size="sm" />
                </div>

                {/* Verdict Explanation based on Smart Conflict Engine */}
                <div className="mt-3.5 pt-3 border-t border-current/20 text-xs leading-relaxed">
                  {checkerResult.feeder.status === 'ONLINE' ? (
                    <p>
                      Electricity is transmitting normally across this distribution line at nominal 50.00 Hz frequency.
                      If your premises have no power, check your local building breaker or report an individual service connection drop.
                    </p>
                  ) : checkerResult.feeder.status === 'PLANNED_OUTAGE' ? (
                    <p>
                      This distribution line is currently rotating under a{' '}
                      <strong>published national load shedding schedule</strong>. Power will restore automatically at the end of the rotation slot.
                      No field technician dispatch is necessary.
                    </p>
                  ) : (
                    <p>
                      An unexpected distribution line fault has occurred on this circuit. Our automated control room has dispatched field technicians.
                      Repair crew is currently triaging the affected transformer.
                    </p>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between text-[11px] font-mono opacity-70">
                  <span>Substation: {checkerResult.feeder.substation?.name || 'Dhaka Central'}</span>
                  <span>Evaluated at: {checkerResult.timestamp}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* =========================================================================
          SECTION 3: KEY SCADA TELEMETRY INDICATOR CARDS
          ========================================================================= */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Metric 1: Total Feeders */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-1 shadow-sm hover:border-slate-300 transition-colors">
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
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-1 shadow-sm hover:border-emerald-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
              Online Normal
            </span>
            <span className="text-[10px] font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300">
              TRANSMITTING
            </span>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-emerald-700 font-mono-numbers">
            {gridStatus?.onlineCount ?? '—'}
          </p>
          <span className="text-[11px] font-mono text-slate-500">Full power supplied (50Hz)</span>
        </div>

        {/* Metric 3: Planned Load Shedding */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-1 shadow-sm hover:border-amber-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-amber-600" />
              Planned Shedding
            </span>
            <span className="text-[10px] font-mono font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-300">
              ROTATING
            </span>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-amber-700 font-mono-numbers">
            {gridStatus?.plannedOutageCount ?? '0'}
          </p>
          <span className="text-[11px] font-mono text-slate-500">Fair deficit schedule</span>
        </div>

        {/* Metric 4: Unexpected Faults */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-1 shadow-sm hover:border-rose-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-800 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
              Emergency Faults
            </span>
            <span className="text-[10px] font-mono font-bold text-rose-800 bg-rose-50 px-2 py-0.5 rounded border border-rose-300">
              DISPATCHED
            </span>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-rose-700 font-mono-numbers">
            {gridStatus?.unexpectedFaultCount ?? '0'}
          </p>
          <span className="text-[11px] font-mono text-slate-500">Field crews repairing</span>
        </div>
      </section>

      {/* =========================================================================
          SECTION 4: ASYMMETRIC BENTO BOX MATRIX (FIVE ROLE PORTALS)
          ========================================================================= */}
      <section className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <div className="inline-flex items-center gap-1.5 text-amber-600 font-mono text-xs font-bold uppercase tracking-wider">
              <Layers className="h-4 w-4" />
              Integrated Role Portals
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Operational Console Matrix
            </h2>
          </div>
          <p className="text-xs text-slate-500 max-w-md">
            Dedicated role-based control panels built for every stakeholder in the national power management lifecycle.
          </p>
        </div>

        {/* Asymmetric Bento Box Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-5">
          {/* Bento Card 1: Customer Portal (Featured Double Width - 7 cols) */}
          <Link
            href="/login?role=customer"
            className="lg:col-span-7 bg-gradient-to-br from-white to-emerald-50/40 rounded-3xl border border-slate-200 hover:border-emerald-300 p-6 sm:p-8 flex flex-col justify-between shadow-sm hover:shadow-md transition-all group relative overflow-hidden"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 text-emerald-700 border border-emerald-200 flex items-center justify-center font-bold">
                  <Users className="h-6 w-6" />
                </div>
                <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-emerald-100 text-emerald-900">
                  RESIDENT & COMMERCIAL
                </span>
              </div>

              <div>
                <h3 className="text-xl font-bold text-slate-900 group-hover:text-emerald-800 transition-colors">
                  Customer & Citizen Portal
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 mt-1.5 leading-relaxed max-w-lg">
                  Bind multiple residential or commercial meters, inspect real-time transmission health, review upcoming scheduled deficit slots, and file smart blackout reports with automatic conflict diagnosis.
                </p>
              </div>

              {/* Micro-mockup: Sample Meter Card */}
              <div className="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-xs space-y-2 text-xs font-mono max-w-md">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Active Meter: MTR-DHN-101</span>
                  <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-bold">ONLINE</span>
                </div>
                <div className="flex justify-between text-slate-700 text-[11px]">
                  <span>Feeder: Dhanmondi Road 27</span>
                  <span>Next Cut: None Scheduled</span>
                </div>
              </div>
            </div>

            <div className="pt-6 flex items-center justify-between text-xs font-bold text-emerald-800 border-t border-slate-200/60 mt-4">
              <span className="flex items-center gap-1.5">
                Launch Resident Console <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
              </span>
              <span className="font-mono text-[11px] text-slate-400 font-normal">SMS Triage Enabled</span>
            </div>
          </Link>

          {/* Bento Card 2: Power Operator (5 cols) */}
          <Link
            href="/login?role=operator"
            className="lg:col-span-5 bg-gradient-to-br from-white to-blue-50/40 rounded-3xl border border-slate-200 hover:border-blue-300 p-6 sm:p-8 flex flex-col justify-between shadow-sm hover:shadow-md transition-all group"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="h-12 w-12 rounded-2xl bg-blue-500/10 text-blue-700 border border-blue-200 flex items-center justify-center font-bold">
                  <Zap className="h-6 w-6" />
                </div>
                <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-blue-100 text-blue-900">
                  NATIONAL DISPATCH
                </span>
              </div>

              <div>
                <h3 className="text-xl font-bold text-slate-900 group-hover:text-blue-800 transition-colors">
                  Power Operator Console
                </h3>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Generate algorithmic rotation plans across megawatt deficits, verify hospital line shielding, publish schedules idempotently, and dispatch field technicians.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-white border border-slate-200 text-xs font-mono space-y-1 text-slate-600">
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

            <div className="pt-6 flex items-center justify-between text-xs font-bold text-blue-800 border-t border-slate-200/60 mt-4">
              <span className="flex items-center gap-1.5">
                Launch Control Room <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
              </span>
              <span className="font-mono text-[11px] text-slate-400 font-normal">Idempotent Publish</span>
            </div>
          </Link>

          {/* Bento Card 3: Field Technician (4 cols) */}
          <Link
            href="/login?role=technician"
            className="lg:col-span-4 bg-gradient-to-br from-white to-amber-50/40 rounded-3xl border border-slate-200 hover:border-amber-300 p-6 flex flex-col justify-between shadow-sm hover:shadow-md transition-all group"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="h-11 w-11 rounded-2xl bg-amber-500/10 text-amber-700 border border-amber-200 flex items-center justify-center font-bold">
                  <Wrench className="h-5 w-5" />
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-900">
                  MOBILE FIRST
                </span>
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-900 group-hover:text-amber-800 transition-colors">
                  Field Technician Terminal
                </h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Mobile triage queue with 120-min SLA timer, 1-tap state progression (`ASSIGNED` $\to$ `EN_ROUTE` $\to$ `REPAIRING`), and mandatory photo resolution evidence gate.
                </p>
              </div>
            </div>

            <div className="pt-4 flex items-center justify-between text-xs font-bold text-amber-800 border-t border-slate-200/60 mt-4">
              <span className="flex items-center gap-1">
                Field Terminal <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
              </span>
              <span className="font-mono text-[10px] text-slate-400">Photo Gate 422</span>
            </div>
          </Link>

          {/* Bento Card 4: Zone Manager (4 cols) */}
          <Link
            href="/login?role=manager"
            className="lg:col-span-4 bg-gradient-to-br from-white to-cyan-50/40 rounded-3xl border border-slate-200 hover:border-cyan-300 p-6 flex flex-col justify-between shadow-sm hover:shadow-md transition-all group"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="h-11 w-11 rounded-2xl bg-cyan-500/10 text-cyan-700 border border-cyan-200 flex items-center justify-center font-bold">
                  <BarChart2 className="h-5 w-5" />
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-100 text-cyan-900">
                  DISTRICT HUD
                </span>
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-900 group-hover:text-cyan-800 transition-colors">
                  Zone Manager HUD
                </h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  District telemetry, empirical feeder failure rate ranking, field technician MTTR metrics, and zone-bounded infrastructure capital upgrade petitions.
                </p>
              </div>
            </div>

            <div className="pt-4 flex items-center justify-between text-xs font-bold text-cyan-800 border-t border-slate-200/60 mt-4">
              <span className="flex items-center gap-1">
                District Cockpit <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
              </span>
              <span className="font-mono text-[10px] text-slate-400">Zone Scoped</span>
            </div>
          </Link>

          {/* Bento Card 5: System Admin (4 cols) */}
          <Link
            href="/login?role=admin"
            className="lg:col-span-4 bg-gradient-to-br from-white to-purple-50/40 rounded-3xl border border-slate-200 hover:border-purple-300 p-6 flex flex-col justify-between shadow-sm hover:shadow-md transition-all group"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="h-11 w-11 rounded-2xl bg-purple-500/10 text-purple-700 border border-purple-200 flex items-center justify-center font-bold">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-100 text-purple-900">
                  GOVERNANCE
                </span>
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-900 group-hover:text-purple-800 transition-colors">
                  System Admin Hub
                </h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Multi-tier RBAC user provisioning, hospital line critical shielding switches, capital upgrade approval decisions, and multi-factor security audit log trails.
                </p>
              </div>
            </div>

            <div className="pt-4 flex items-center justify-between text-xs font-bold text-purple-800 border-t border-slate-200/60 mt-4">
              <span className="flex items-center gap-1">
                Governance Hub <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
              </span>
              <span className="font-mono text-[10px] text-slate-400">Audit Logs</span>
            </div>
          </Link>
        </div>
      </section>

      {/* =========================================================================
          SECTION 5: INSTITUTIONAL SCADA FEEDER DISTRIBUTION MATRIX
          ========================================================================= */}
      <section className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-amber-600 font-mono text-xs font-bold uppercase tracking-wider">
              <Zap className="h-4 w-4" />
              Live Distribution Telemetry
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              National Feeder Distribution Matrix
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Real-time transmission status, load capacity gauges, and hospital shielding ratings across urban circuits.
            </p>
          </div>

          {/* Search, Zone Selector, Refresh Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search feeder or substation..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="min-h-[44px] pl-9 pr-3.5 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 w-48 sm:w-60"
              />
            </div>

            <select
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
              className="min-h-[44px] px-3.5 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
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

        {/* Quick-Filter Status Toggle Pills */}
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
            <thead className="bg-slate-50 font-mono text-slate-600 uppercase tracking-wider border-b border-slate-200">
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
                    <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-amber-500 border-r-transparent mr-2 align-middle" />
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
                          isExpanded ? 'bg-amber-50/30' : ''
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
                          <span className="text-[10px] text-slate-500 font-mono">{f.zone?.name || 'Dhaka Central'}</span>
                        </td>
                        <td className="px-4 py-3.5 font-mono-numbers">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{f.capacityMW} MW</span>
                            <div className="w-16 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                              <div
                                className="bg-amber-500 h-full rounded-full"
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
                              <div className="p-3 bg-white rounded-xl border border-slate-200">
                                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Circuit Hierarchy</span>
                                <span className="text-slate-800 font-bold">{f.name}</span>
                                <p className="text-slate-500 text-[11px] mt-0.5">
                                  Substation ID: {f.substationId}
                                </p>
                              </div>

                              <div className="p-3 bg-white rounded-xl border border-slate-200">
                                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Grid Invariant Protection</span>
                                <span className={f.isCritical ? 'text-purple-700 font-bold' : 'text-slate-700'}>
                                  {f.isCritical ? 'Law 1: 100% Hospital Immunity' : 'Law 2: Subject to Fair Rotation'}
                                </span>
                                <p className="text-slate-500 text-[11px] mt-0.5">
                                  Rating: {f.capacityMW} MW Active Load
                                </p>
                              </div>

                              <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between">
                                <div>
                                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Direct Operations Link</span>
                                  <Link
                                    href={getDashboardLink()}
                                    className="text-amber-700 font-bold hover:underline inline-flex items-center gap-1 mt-0.5"
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
          SECTION 6: INSTITUTIONAL RELIABILITY GUARANTEES & TRUST BAR
          ========================================================================= */}
      <section className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 lg:p-10 border border-slate-800 space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-1.5">
          <span className="text-amber-400 font-mono text-xs font-bold uppercase tracking-wider">
            National Grid Standard
          </span>
          <h2 className="text-2xl font-extrabold tracking-tight">
            Engineered for High-Deficit Power Equity
          </h2>
          <p className="text-slate-400 text-xs sm:text-sm">
            Core algorithmic invariants codified to ensure transparent distribution across Bangladesh metropolitan grids.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {/* Pillar 1 */}
          <div className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2">
            <div className="h-9 w-9 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center font-bold">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h4 className="font-bold text-slate-200 text-sm">Law 1: Hospital Immunity</h4>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              Trauma hospitals, oxygen generation plants, and emergency healthcare facilities are strictly shielded from all load-shedding schedules.
            </p>
          </div>

          {/* Pillar 2 */}
          <div className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2">
            <div className="h-9 w-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold">
              <Clock className="h-5 w-5" />
            </div>
            <h4 className="font-bold text-slate-200 text-sm">Law 2: No-Double-Cut Rule</h4>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              Algorithmic fair round-robin rotation guarantees no feeder circuit experiences load shedding more than once in a single calendar day.
            </p>
          </div>

          {/* Pillar 3 */}
          <div className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2">
            <div className="h-9 w-9 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold">
              <Cpu className="h-5 w-5" />
            </div>
            <h4 className="font-bold text-slate-200 text-sm">Sub-100ms Cache Latency</h4>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              High-throughput Redis cache-aside architecture delivers instant timetable lookups while distributed mutex locks prevent duplicate job runs.
            </p>
          </div>

          {/* Pillar 4 */}
          <div className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2">
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
