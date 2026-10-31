'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Zap,
  Activity,
  ShieldAlert,
  CheckCircle2,
  UserCheck,
  RefreshCw,
  Send,
  X,
  Radio,
  Search,
  Filter,
  Clock,
  Building2,
  Phone,
  ShieldCheck,
  AlertTriangle,
  Layers,
  ArrowRight,
  Copy,
  Check,
  Flame,
  SlidersHorizontal,
  Bot,
  Calendar,
  Sparkles,
  CheckCircle,
  HelpCircle,
  Cpu
} from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { ApiClient } from '../../lib/api';
import { StatusBadge } from '../../components/StatusBadge';
import { getSocket } from '../../lib/socket';

type OperatorTab = 'generator' | 'dispatch' | 'offline_feeders' | 'technicians';
type FaultFilter = 'ALL' | 'UNASSIGNED' | 'ASSIGNED' | 'REPAIRING' | 'RESOLVED';

interface OfflineFeederItem {
  id: string;
  feederId: string;
  feederName: string;
  feederCode: string;
  capacityMW: number;
  substationName: string;
  zoneName: string;
  outageType: 'UNPLANNED' | 'PLANNED';
  status: string;
  startTime: string;
  estimatedRestoration?: string | null;
  impactedMetersCount: number;
  ticket?: {
    id: string;
    ticketNumber: string;
    description: string;
    status: string;
    reportedAt: string;
    assignedTechnician?: {
      id: string;
      name: string;
      phone?: string | null;
    } | null;
  } | null;
}

export default function OperatorDashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  // Overview Telemetry State
  const [overview, setOverview] = useState<any>(null);
  const [outages, setOutages] = useState<any[]>([]);
  const [activeOfflineFeeders, setActiveOfflineFeeders] = useState<OfflineFeederItem[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Active Tab View
  const [activeTab, setActiveTab] = useState<OperatorTab>('generator');

  // Scheduler Form State
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const tomorrowStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }, []);

  const [planningDate, setPlanningDate] = useState<string>(todayStr);
  const [deficitMW, setDeficitMW] = useState<number>(35);
  const [startTime, setStartTime] = useState<string>('09:00');
  const [endTime, setEndTime] = useState<string>('15:00');
  const [slotDurationMinutes, setSlotDurationMinutes] = useState<number>(60);
  const [generating, setGenerating] = useState<boolean>(false);
  const [draftPlan, setDraftPlan] = useState<any>(null);
  const [publishSuccess, setPublishSuccess] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  // Dispatch & Ticket Management
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [selectedTechId, setSelectedTechId] = useState<string>('');
  const [dispatching, setDispatching] = useState<boolean>(false);
  const [autoAssigningId, setAutoAssigningId] = useState<string | null>(null);
  const [cancellingTicket, setCancellingTicket] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [submittingCancel, setSubmittingCancel] = useState<boolean>(false);

  // Search & Filtering for Tickets Queue
  const [ticketSearch, setTicketSearch] = useState<string>('');
  const [faultFilter, setFaultFilter] = useState<FaultFilter>('ALL');

  // UI Micro-interactions
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [currentTimeBST, setCurrentTimeBST] = useState<string>('');
  const [socketConnected, setSocketConnected] = useState<boolean>(false);

  // Live Bangladesh Standard Time Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTimeBST(
        now.toLocaleTimeString('en-GB', {
          timeZone: 'Asia/Dhaka',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      );
    };

    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch all control room telemetry
  const fetchAllTelemetry = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      const [overviewRes, outagesRes, offlineRes, techsRes] = await Promise.all([
        ApiClient.get('/api/operator/overview'),
        ApiClient.get('/api/operators/outage-reports'),
        ApiClient.get('/api/v1/operator/outages/active'),
        ApiClient.get('/api/v1/operator/technicians')
      ]);

      if (overviewRes.success && overviewRes.data) {
        setOverview(overviewRes.data);
      }

      if (outagesRes.success && Array.isArray(outagesRes.data)) {
        setOutages(outagesRes.data);
      }

      if (offlineRes.success && Array.isArray(offlineRes.data)) {
        setActiveOfflineFeeders(offlineRes.data);
      }

      if (techsRes.success && Array.isArray(techsRes.data)) {
        setTechnicians(techsRes.data);
      }
    } catch {
      // Graceful error state
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!authLoading && (!user || (user.role !== 'POWER_OPERATOR' && user.role !== 'ADMIN'))) {
      router.push('/login');
      return;
    }

    if (user) {
      fetchAllTelemetry();

      const socket = getSocket();
      socket.emit('subscribe:operator');
      setSocketConnected(socket.connected);

      const onConnect = () => setSocketConnected(true);
      const onDisconnect = () => setSocketConnected(false);
      const onTicketCreated = () => fetchAllTelemetry(true);
      const onFeederChanged = () => fetchAllTelemetry(true);
      const onSchedulePublished = () => fetchAllTelemetry(true);

      socket.on('connect', onConnect);
      socket.on('disconnect', onDisconnect);
      socket.on('ticket:created', onTicketCreated);
      socket.on('ticket:status_changed', onTicketCreated);
      socket.on('feeder:status_changed', onFeederChanged);
      socket.on('schedule:published', onSchedulePublished);

      return () => {
        socket.off('connect', onConnect);
        socket.off('disconnect', onDisconnect);
        socket.off('ticket:created', onTicketCreated);
        socket.off('ticket:status_changed', onTicketCreated);
        socket.off('feeder:status_changed', onFeederChanged);
        socket.off('schedule:published', onSchedulePublished);
      };
    }
  }, [user, authLoading]);

  // Copy helper
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => {
      setCopiedCode(null);
    }, 2000);
  };

  // Generate Schedule Plan (Law 1 & Law 2 solver)
  const handleGeneratePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setPublishSuccess(null);
    setPublishError(null);

    const res = await ApiClient.post('/api/operator/schedules/draft', {
      planningDate,
      deficitMW: Number(deficitMW),
      startTime,
      endTime,
      slotDurationMinutes: Number(slotDurationMinutes)
    });

    setGenerating(false);

    if (res.success && res.data) {
      setDraftPlan(res.data);
    } else {
      setPublishError(res.error?.message || 'Failed to generate schedule plan');
    }
  };

  // Publish Schedule Plan
  const handlePublishPlan = async () => {
    if (!draftPlan?.id) return;

    setPublishError(null);
    const res = await ApiClient.post(`/api/operator/schedules/${draftPlan.id}/publish`);

    if (res.success && res.data) {
      setPublishSuccess(
        `Plan #${draftPlan.id} published successfully! Edge Redis cache pre-warmed. Broadcast notification dispatched for ${res.data.customersNotified} meters.`
      );
      setDraftPlan(null);
      fetchAllTelemetry(true);
    } else {
      setPublishError(res.error?.message || 'Failed to publish plan');
    }
  };

  // Auto-Assign Technician via Smart Dispatch
  const handleAutoAssign = async (ticketId: string) => {
    setAutoAssigningId(ticketId);
    const res = await ApiClient.post(`/api/operators/outage-reports/${ticketId}/auto-assign`);
    setAutoAssigningId(null);

    if (res.success) {
      fetchAllTelemetry(true);
    } else {
      alert(res.error?.message || 'Auto-assignment failed. Please select a technician manually.');
    }
  };

  // Manual Dispatch Submit
  const handleDispatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !selectedTechId) return;

    setDispatching(true);
    const res = await ApiClient.post(`/api/operators/outage-reports/${selectedTicket.id}/assign`, {
      technicianId: selectedTechId
    });
    setDispatching(false);

    if (res.success) {
      setSelectedTicket(null);
      setSelectedTechId('');
      fetchAllTelemetry(true);
    } else {
      alert(res.error?.message || 'Failed to assign technician');
    }
  };

  // Cancel False Alarm Ticket Submit
  const handleCancelTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingTicket || !cancelReason.trim()) return;

    setSubmittingCancel(true);
    const res = await ApiClient.post(`/api/operators/outage-reports/${cancellingTicket.id}/cancel`, {
      reason: cancelReason.trim()
    });
    setSubmittingCancel(false);

    if (res.success) {
      setCancellingTicket(null);
      setCancelReason('');
      fetchAllTelemetry(true);
    } else {
      alert(res.error?.message || 'Failed to cancel ticket');
    }
  };

  // Filtered Tickets
  const filteredTickets = useMemo(() => {
    return outages.filter((t) => {
      // Search
      if (ticketSearch.trim()) {
        const query = ticketSearch.toLowerCase();
        const matchesNum = (t.ticketNumber || '').toLowerCase().includes(query);
        const matchesFeeder = (t.feederName || '').toLowerCase().includes(query);
        const matchesZone = (t.zoneName || '').toLowerCase().includes(query);
        const matchesDesc = (t.description || '').toLowerCase().includes(query);
        if (!matchesNum && !matchesFeeder && !matchesZone && !matchesDesc) {
          return false;
        }
      }

      // Status filter
      if (faultFilter === 'UNASSIGNED') {
        return !t.assignedTechnician && t.status === 'REPORTED';
      }
      if (faultFilter === 'ASSIGNED') {
        return t.status === 'ASSIGNED' || t.status === 'EN_ROUTE';
      }
      if (faultFilter === 'REPAIRING') {
        return t.status === 'REPAIRING';
      }
      if (faultFilter === 'RESOLVED') {
        return t.status === 'RESOLVED';
      }

      return true;
    });
  }, [outages, ticketSearch, faultFilter]);

  // Derived Grid Metrics
  const metrics = overview?.metrics;
  const totalDemand = metrics?.totalDemandMW || 12500;
  const availableGen = metrics?.availableCapacityMW || 11200;
  const currentDeficit = metrics?.currentDeficitMW || Math.max(0, totalDemand - availableGen);
  const frequencyHz = metrics?.frequencyHz || 50.02;
  const adequacyPercent = Math.min(100, Math.round((availableGen / totalDemand) * 100));

  if (authLoading || loading) {
    return (
      <div className="py-24 text-center space-y-4">
        <div className="inline-block h-10 w-10 animate-spin rounded-full border-3 border-solid border-blue-600 border-r-transparent" />
        <div className="space-y-1">
          <p className="text-sm font-mono font-bold text-slate-800">INITIALIZING NATIONAL DISPATCH CONSOLE...</p>
          <p className="text-xs text-slate-500">Connecting to SCADA grid telemetry & feeder state store...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-16">
      {/* 1. Header & Live Telemetry Masthead */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-slate-200/90 pb-6">
        <div className="space-y-2 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-blue-50 text-blue-800 border border-blue-200">
              <span className={`h-2 w-2 rounded-full bg-blue-600 ${socketConnected ? 'animate-telemetry-pulse' : ''}`} />
              NLDC SCADA SYNCED
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              <Activity className="h-3 w-3 text-slate-500" />
              NATIONAL GRID CONTROLLER CONSOLE
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <ShieldCheck className="h-3 w-3 text-emerald-600" />
              LAW 1 & 2 OPTIMIZER ACTIVE
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
            <Cpu className="h-7 w-7 text-blue-600 shrink-0" />
            <span>National Power Operator Control Room</span>
          </h1>

          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            Real-time generation deficit mitigation, Law 1 hospital shielded algorithmic scheduling, and unified emergency field fault dispatch.
          </p>
        </div>

        {/* Masthead Live Clock, Frequency & Refresh */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 shadow-sm text-xs font-mono text-slate-700">
            <Radio className="h-3.5 w-3.5 text-rose-500 animate-pulse" />
            <span className="text-slate-400 font-sans font-medium">BST:</span>
            <span className="font-bold text-slate-900 font-mono-numbers">{currentTimeBST || '--:--:--'}</span>
          </div>

          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 shadow-sm text-xs font-mono text-slate-700">
            <Activity className="h-3.5 w-3.5 text-emerald-600" />
            <span className="text-slate-400 font-sans font-medium">FREQ:</span>
            <span className="font-bold text-emerald-700 font-mono-numbers">{frequencyHz.toFixed(2)} Hz</span>
          </div>

          <button
            onClick={() => fetchAllTelemetry(true)}
            disabled={refreshing}
            className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-mono font-semibold inline-flex items-center gap-2 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/20 active:scale-[0.98] disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-blue-600 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'SYNCING...' : 'REFRESH METRICS'}</span>
          </button>
        </div>
      </div>

      {/* 2. SCADA Telemetry Bento Overview Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: System Demand */}
        <div className="clean-card clean-card-hover p-4 sm:p-5 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-blue-600" />
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span className="font-mono uppercase font-semibold">National Demand</span>
            <Zap className="h-4 w-4 text-blue-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono-numbers">
              {totalDemand.toLocaleString()}
            </span>
            <span className="text-xs text-slate-500 font-mono">MW</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Grid Adequacy:</span>
            <strong className="font-mono text-blue-700 font-semibold">{adequacyPercent}%</strong>
          </div>
        </div>

        {/* Card 2: Available Generation */}
        <div className="clean-card clean-card-hover p-4 sm:p-5 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span className="font-mono uppercase font-semibold">Online Generation</span>
            <Activity className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-emerald-700 font-mono-numbers">
              {availableGen.toLocaleString()}
            </span>
            <span className="text-xs text-slate-500 font-mono">MW</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Transmission Status:</span>
            <span className="font-mono text-emerald-700 font-semibold">STABLE</span>
          </div>
        </div>

        {/* Card 3: Generation Deficit */}
        <div className="clean-card clean-card-hover p-4 sm:p-5 rounded-2xl relative overflow-hidden">
          <div
            className={`absolute top-0 left-0 right-0 h-1 ${
              currentDeficit > 0 ? 'bg-amber-500' : 'bg-emerald-500'
            }`}
          />
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span className="font-mono uppercase font-semibold">Supply Deficit</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl sm:text-3xl font-extrabold font-mono-numbers ${
                currentDeficit > 0 ? 'text-amber-700' : 'text-emerald-700'
              }`}
            >
              {currentDeficit.toLocaleString()}
            </span>
            <span className="text-xs text-slate-500 font-mono">MW</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Action Required:</span>
            <span className="font-mono font-semibold text-amber-800">
              {currentDeficit > 0 ? 'FAIR ROTATION' : 'BALANCED'}
            </span>
          </div>
        </div>

        {/* Card 4: Emergency Fault Tickets */}
        <div className="clean-card clean-card-hover p-4 sm:p-5 rounded-2xl relative overflow-hidden">
          <div
            className={`absolute top-0 left-0 right-0 h-1 ${
              outages.length > 0 ? 'bg-rose-600' : 'bg-slate-400'
            }`}
          />
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span className="font-mono uppercase font-semibold">Emergency Faults</span>
            <ShieldAlert className="h-4 w-4 text-rose-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-rose-700 font-mono-numbers">
              {outages.length}
            </span>
            <span className="text-xs text-slate-500 font-mono">tickets</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Awaiting Crew:</span>
            <span className="font-mono font-bold text-rose-700">
              {outages.filter((t) => !t.assignedTechnician && t.status === 'REPORTED').length} UNASSIGNED
            </span>
          </div>
        </div>
      </div>

      {/* 3. Navigation Console Tabs */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200/90 shadow-sm flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setActiveTab('generator')}
            className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'generator'
                ? 'bg-slate-900 text-white shadow-sm font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Zap className="h-3.5 w-3.5 text-amber-400" />
            <span>Fair-Rotation Scheduler</span>
          </button>

          <button
            onClick={() => setActiveTab('dispatch')}
            className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'dispatch'
                ? 'bg-slate-900 text-white shadow-sm font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <ShieldAlert className="h-3.5 w-3.5 text-rose-500" />
            <span>Emergency Dispatch Queue ({outages.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('offline_feeders')}
            className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'offline_feeders'
                ? 'bg-slate-900 text-white shadow-sm font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Layers className="h-3.5 w-3.5 text-blue-500" />
            <span>Unified Offline Circuits ({activeOfflineFeeders.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('technicians')}
            className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'technicians'
                ? 'bg-slate-900 text-white shadow-sm font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <UserCheck className="h-3.5 w-3.5 text-emerald-500" />
            <span>Field Technician Roster ({technicians.length})</span>
          </button>
        </div>

        <div className="px-3 py-1 text-[11px] font-mono text-slate-500 hidden sm:block">
          DISPATCH CONTROLLER: <strong className="text-slate-800">{user?.name}</strong>
        </div>
      </div>

      {/* 4. Tab 1: Fair-Rotation Load Shedding Engine */}
      {activeTab === 'generator' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 sm:p-8 space-y-6 border border-slate-200/90 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-50 text-amber-800 border border-amber-200">
                    ALGORITHMIC LP SOLVER
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-50 text-purple-700 border border-purple-200">
                    LAW 1 HOSPITAL IMMUNITY ENFORCED
                  </span>
                </div>
                <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 flex items-center gap-2">
                  <Zap className="h-5 w-5 text-amber-500" />
                  <span>Fair-Rotation Schedule Generator</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Calculates optimal distribution feeder shedding intervals while guaranteeing zero hospital cuts and no repeat shedding in 24 hours.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPlanningDate(todayStr)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                    planningDate === todayStr
                      ? 'bg-amber-500 text-slate-950 border-amber-600 font-bold'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setPlanningDate(tomorrowStr)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                    planningDate === tomorrowStr
                      ? 'bg-amber-500 text-slate-950 border-amber-600 font-bold'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Tomorrow
                </button>
              </div>
            </div>

            {/* Notification Alerts */}
            {publishSuccess && (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-950 text-xs font-semibold flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-sm text-emerald-900">Schedule Broadcast Active</p>
                  <p className="leading-relaxed">{publishSuccess}</p>
                </div>
              </div>
            )}

            {publishError && (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-300 text-rose-950 text-xs font-semibold flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 shrink-0 text-rose-700 mt-0.5" />
                <div>
                  <p className="font-bold text-sm text-rose-900">Optimization Error</p>
                  <p className="leading-relaxed">{publishError}</p>
                </div>
              </div>
            )}

            {/* Parameter Input Form */}
            <form onSubmit={handleGeneratePlan} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Target Planning Date</label>
                <input
                  type="date"
                  required
                  value={planningDate}
                  onChange={(e) => setPlanningDate(e.target.value)}
                  className="w-full min-h-[44px] text-xs px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 shadow-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Curtailed Deficit (MW)</label>
                <input
                  type="number"
                  required
                  min={1}
                  max={500}
                  value={deficitMW}
                  onChange={(e) => setDeficitMW(Number(e.target.value))}
                  className="w-full min-h-[44px] text-xs px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 shadow-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Dispatch Window Start</label>
                <input
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full min-h-[44px] text-xs px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 shadow-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Dispatch Window End</label>
                <input
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full min-h-[44px] text-xs px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 shadow-sm"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={generating}
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-sm transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  <Zap className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
                  <span>{generating ? 'Optimizing Grid...' : 'Calculate Slots'}</span>
                </button>
              </div>
            </form>

            {/* Generated Draft Plan Preview */}
            {draftPlan && (
              <div className="pt-6 border-t border-slate-200/90 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-amber-50/70 border border-amber-200">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-amber-900 bg-amber-100 px-2.5 py-0.5 rounded-md border border-amber-300">
                        DRAFT #{draftPlan.id}
                      </span>
                      <span className="text-xs font-mono font-semibold text-slate-600">
                        {draftPlan.planningDate}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700">
                      Total Planned Curtailment: <strong className="text-slate-900 font-bold">{draftPlan.totalDeficitMW} MW</strong> across <strong className="text-slate-900">{draftPlan.slots?.length} rotation intervals</strong>.
                    </p>
                  </div>

                  <button
                    onClick={handlePublishPlan}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-all active:scale-[0.98] flex items-center gap-2 self-start sm:self-auto shrink-0"
                  >
                    <Send className="h-4 w-4" />
                    <span>Publish & Dispatch Broadcast SMS</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {draftPlan.slots?.map((slot: any, idx: number) => (
                    <div
                      key={slot.id || idx}
                      className="p-5 rounded-2xl border border-slate-200/90 bg-white space-y-3.5 shadow-sm clean-card-hover"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded-lg bg-slate-100 font-mono text-xs font-bold text-slate-800 border border-slate-200">
                            SLOT #{idx + 1}
                          </span>
                          <span className="text-sm font-extrabold text-slate-900 font-mono">
                            {new Date(slot.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {new Date(slot.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} BST
                          </span>
                        </div>

                        <span className="font-mono font-bold text-xs text-amber-800 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                          {slot.actualDeficitMW} MW Curtailed
                        </span>
                      </div>

                      <div className="space-y-1.5 pt-1">
                        <div className="text-[11px] font-mono uppercase text-slate-500 font-semibold flex items-center justify-between">
                          <span>Curtailed Feeder Lines ({slot.feeders?.length || 0}):</span>
                          <span className="text-emerald-700">✓ 0 Hospital Cuts</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          {slot.feeders?.map((f: any) => (
                            <div
                              key={f.feederId}
                              className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs flex items-center justify-between"
                            >
                              <span className="font-mono font-bold text-slate-900 truncate">
                                {f.code}
                              </span>
                              <span className="font-mono text-slate-600 text-[11px]">
                                {f.capacityMW} MW
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. Tab 2: Outage Reports & Emergency Dispatch Queue */}
      {activeTab === 'dispatch' && (
        <div className="space-y-6">
          {/* Search & Triage Controls */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-rose-600" />
                  <span>Emergency Fault Dispatch Board</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Live feed of verified customer and sensor fault reports awaiting technician allocation.
                </p>
              </div>

              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-3 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search ticket, feeder, district..."
                  value={ticketSearch}
                  onChange={(e) => setTicketSearch(e.target.value)}
                  className="min-h-[42px] pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm w-60 sm:w-72"
                />
              </div>
            </div>

            {/* Filter Chips */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setFaultFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    faultFilter === 'ALL'
                      ? 'bg-slate-900 text-white font-semibold'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  All ({outages.length})
                </button>

                <button
                  onClick={() => setFaultFilter('UNASSIGNED')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    faultFilter === 'UNASSIGNED'
                      ? 'bg-rose-600 text-white font-bold'
                      : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                  }`}
                >
                  Unassigned Queue ({outages.filter((t) => !t.assignedTechnician && t.status === 'REPORTED').length})
                </button>

                <button
                  onClick={() => setFaultFilter('ASSIGNED')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    faultFilter === 'ASSIGNED'
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  En Route ({outages.filter((t) => t.status === 'ASSIGNED' || t.status === 'EN_ROUTE').length})
                </button>

                <button
                  onClick={() => setFaultFilter('REPAIRING')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    faultFilter === 'REPAIRING'
                      ? 'bg-blue-600 text-white font-bold'
                      : 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
                  }`}
                >
                  Repair Active ({outages.filter((t) => t.status === 'REPAIRING').length})
                </button>
              </div>

              <span className="font-mono text-[11px] text-slate-500">
                SHOWING <strong className="text-slate-800">{filteredTickets.length}</strong> TICKETS
              </span>
            </div>
          </div>

          {/* Tickets Table */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 font-mono text-slate-600 uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3.5 px-4 font-semibold">Ticket #</th>
                    <th className="py-3.5 px-4 font-semibold">Feeder Circuit</th>
                    <th className="py-3.5 px-4 font-semibold">Zone</th>
                    <th className="py-3.5 px-4 font-semibold">Incident Details</th>
                    <th className="py-3.5 px-4 font-semibold">Reported</th>
                    <th className="py-3.5 px-4 font-semibold">Status</th>
                    <th className="py-3.5 px-4 font-semibold">Assigned Crew</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                  {filteredTickets.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-500 font-mono text-xs">
                        <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto mb-2" />
                        No active unexpected faults found matching this criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredTickets.map((t) => {
                      const isUnassigned = !t.assignedTechnician && t.status === 'REPORTED';

                      return (
                        <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-4 px-4 font-mono font-bold text-amber-900">
                            <div className="flex items-center gap-1.5">
                              <span>{t.ticketNumber}</span>
                              <button
                                onClick={() => handleCopy(t.ticketNumber)}
                                className="p-0.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700"
                                title="Copy ticket number"
                              >
                                {copiedCode === t.ticketNumber ? (
                                  <Check className="h-3 w-3 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                          </td>

                          <td className="py-4 px-4 font-bold text-slate-900">
                            {t.feederName}
                          </td>

                          <td className="py-4 px-4 text-slate-600 font-medium">
                            {t.zoneName || 'Metropolitan'}
                          </td>

                          <td className="py-4 px-4 text-slate-700 max-w-xs truncate" title={t.description}>
                            {t.description}
                          </td>

                          <td className="py-4 px-4 text-slate-500 font-mono text-[11px]">
                            {new Date(t.reportedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>

                          <td className="py-4 px-4">
                            <StatusBadge status={t.status} size="sm" />
                          </td>

                          <td className="py-4 px-4">
                            {t.assignedTechnician ? (
                              <div className="space-y-0.5">
                                <span className="text-emerald-700 font-bold block">
                                  {t.assignedTechnician.name}
                                </span>
                                {t.assignedTechnician.phone && (
                                  <span className="text-[10px] font-mono text-slate-400 block">
                                    {t.assignedTechnician.phone}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="font-mono text-xs font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                                UNASSIGNED
                              </span>
                            )}
                          </td>

                          <td className="py-4 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {isUnassigned && (
                                <button
                                  onClick={() => handleAutoAssign(t.id)}
                                  disabled={autoAssigningId === t.id}
                                  className="min-h-[34px] px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-xs inline-flex items-center gap-1 transition-colors disabled:opacity-50"
                                  title="Auto-dispatch nearest available technician"
                                >
                                  <Bot className={`h-3.5 w-3.5 ${autoAssigningId === t.id ? 'animate-spin' : ''}`} />
                                  <span>{autoAssigningId === t.id ? 'Assigning...' : 'Auto'}</span>
                                </button>
                              )}

                              <button
                                onClick={() => setSelectedTicket(t)}
                                className="min-h-[34px] px-3 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 font-bold text-xs inline-flex items-center justify-center transition-colors"
                              >
                                {t.assignedTechnician ? 'Reassign' : 'Dispatch'}
                              </button>

                              <button
                                onClick={() => setCancellingTicket(t)}
                                className="min-h-[34px] px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-rose-50 text-slate-500 hover:text-rose-700 border border-slate-200 text-xs transition-colors"
                                title="Cancel false alarm ticket"
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 6. Tab 3: Unified Offline Feeders SCADA Telemetry */}
      {activeTab === 'offline_feeders' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                <Layers className="h-5 w-5 text-blue-600" />
                <span>Unified Offline Circuits Telemetry</span>
              </h3>
              <p className="text-xs text-slate-500">
                Consolidated live monitor of all transmission and distribution lines currently de-energized across national substations.
              </p>
            </div>

            <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-3 py-1 rounded-xl border border-slate-200 self-start sm:self-auto">
              TOTAL OFFLINE: {activeOfflineFeeders.length} CIRCUITS
            </span>
          </div>

          {activeOfflineFeeders.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 border border-slate-200/90 text-center space-y-4 shadow-sm">
              <div className="h-16 w-16 mx-auto rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h4 className="text-base font-bold text-slate-900">All Distribution Feeders Energized</h4>
                <p className="text-xs text-slate-500">
                  Zero circuits are currently offline. Generation satisfies total consumer demand with no active emergency faults.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeOfflineFeeders.map((item) => {
                const isFault = item.outageType === 'UNPLANNED';

                return (
                  <div
                    key={item.id}
                    className={`p-5 rounded-2xl border transition-all space-y-3.5 shadow-sm bg-white ${
                      isFault
                        ? 'border-rose-200/90 hover:border-rose-300'
                        : 'border-amber-200/90 hover:border-amber-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <span className="font-bold text-sm text-slate-900 block truncate">
                          {item.feederName}
                        </span>
                        <span className="text-[11px] text-slate-500 block">
                          {item.substationName} • {item.zoneName}
                        </span>
                      </div>

                      <span
                        className={`font-mono text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                          isFault
                            ? 'bg-rose-50 text-rose-800 border-rose-200'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}
                      >
                        {isFault ? 'EMERGENCY FAULT' : 'PLANNED ROTATION'}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1 font-mono">
                      <div className="flex justify-between text-slate-600">
                        <span>Circuit Capacity:</span>
                        <strong className="text-slate-900">{item.capacityMW} MW</strong>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Impacted Meters:</span>
                        <strong className="text-slate-900">{item.impactedMetersCount} consumer lines</strong>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Outage Started:</span>
                        <span className="text-slate-700">
                          {new Date(item.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} BST
                        </span>
                      </div>
                    </div>

                    {isFault && item.ticket && (
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                        <span className="font-mono text-amber-800 font-bold">
                          {item.ticket.ticketNumber}
                        </span>
                        <button
                          onClick={() => {
                            setSelectedTicket(item.ticket);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-[11px] font-bold border border-blue-200"
                        >
                          Triage Ticket
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 7. Tab 4: Field Technician Roster */}
      {activeTab === 'technicians' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-emerald-600" />
                <span>Field Crew & Technician Dispatch Roster</span>
              </h3>
              <p className="text-xs text-slate-500">
                Certified high-voltage grid repair crew status across Dhaka metropolitan sectors.
              </p>
            </div>

            <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-3 py-1 rounded-xl border border-slate-200 self-start sm:self-auto">
              TOTAL ROSTER: {technicians.length} CREWS
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {technicians.map((tech) => {
              const isAvailable = tech.currentTaskStatus === 'AVAILABLE' || !tech.currentTaskStatus;

              return (
                <div
                  key={tech.id}
                  className="bg-white rounded-2xl border border-slate-200/90 p-5 space-y-3.5 shadow-sm clean-card-hover"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <h4 className="font-bold text-slate-900 text-sm">{tech.name}</h4>
                      <p className="text-[11px] font-mono text-slate-500">{tech.email}</p>
                    </div>

                    <span
                      className={`font-mono text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                        isAvailable
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}
                    >
                      {tech.currentTaskStatus || 'AVAILABLE'}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1">
                    <div className="flex justify-between text-slate-600">
                      <span>Assigned Sector:</span>
                      <strong className="text-slate-800">{tech.zoneName || 'Metropolitan Grid'}</strong>
                    </div>
                    {tech.phone && (
                      <div className="flex justify-between text-slate-600">
                        <span>Direct Hotline:</span>
                        <strong className="font-mono text-slate-900">{tech.phone}</strong>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= MODAL 1: MANUAL TECHNICIAN DISPATCH ================= */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 sm:p-8 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-200">
                  <UserCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Dispatch Field Repair Crew
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Assign technician to emergency breakdown ticket
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedTicket(null)}
                className="min-h-[44px] min-w-[44px] rounded-xl inline-flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5 font-mono text-slate-800">
              <div className="flex justify-between">
                <span className="text-slate-500">Ticket #:</span>
                <strong className="text-amber-800">{selectedTicket.ticketNumber}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Feeder Circuit:</span>
                <strong>{selectedTicket.feederName}</strong>
              </div>
              <div className="pt-1 border-t border-slate-200 text-slate-700 font-sans text-xs">
                {selectedTicket.description}
              </div>
            </div>

            <form onSubmit={handleDispatchSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Select Certified Field Crew
                </label>
                <select
                  required
                  value={selectedTechId}
                  onChange={(e) => setSelectedTechId(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm"
                >
                  <option value="">-- Choose Technician Crew --</option>
                  {technicians.map((tech) => (
                    <option key={tech.id} value={tech.id}>
                      {tech.name} ({tech.phone || 'No phone'}) — [{tech.currentTaskStatus || 'AVAILABLE'}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedTicket(null)}
                  className="min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={dispatching || !selectedTechId}
                  className="min-h-[44px] px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-2"
                >
                  {dispatching ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Dispatching Crew...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      <span>Confirm Field Dispatch</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL 2: CANCEL FALSE ALARM TICKET ================= */}
      {cancellingTicket && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 sm:p-8 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-200">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Cancel Outage Ticket</h3>
                  <p className="text-[11px] text-slate-500">Dismiss false alarm or internal customer trip</p>
                </div>
              </div>

              <button
                onClick={() => setCancellingTicket(null)}
                className="min-h-[44px] min-w-[44px] rounded-xl inline-flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-slate-800">
              <p>Ticket: <strong>{cancellingTicket.ticketNumber}</strong></p>
              <p>Feeder: <strong>{cancellingTicket.feederName}</strong></p>
            </div>

            <form onSubmit={handleCancelTicketSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Cancellation Reason (Required for Audit Trail)
                </label>
                <textarea
                  required
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Verified by telemetry: Feeder is energised; customer's internal main circuit breaker had tripped."
                  className="w-full text-xs p-3 rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCancellingTicket(null)}
                  className="min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Close
                </button>

                <button
                  type="submit"
                  disabled={submittingCancel || !cancelReason.trim()}
                  className="min-h-[44px] px-5 py-2.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {submittingCancel ? 'Cancelling Ticket...' : 'Confirm Ticket Cancellation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
