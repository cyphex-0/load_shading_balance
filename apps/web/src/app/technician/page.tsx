'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Wrench,
  MapPin,
  CheckCircle2,
  Navigation,
  Camera,
  X,
  Radio,
  RefreshCw,
  AlertTriangle,
  Clock,
  Building2,
  Phone,
  ShieldCheck,
  Check,
  Copy,
  ArrowRight,
  ExternalLink,
  FileText,
  Upload,
  HardHat,
  Zap,
  PhoneCall,
  Activity,
  Layers,
  ChevronRight
} from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { ApiClient } from '../../lib/api';
import { getSocket } from '../../lib/socket';

interface TechnicianTask {
  assignmentId: string;
  ticketId: string;
  ticketNumber: string;
  feederId: string;
  feederName: string;
  substationName: string;
  zoneName: string;
  description: string;
  address?: string;
  landmark?: string;
  status: 'ASSIGNED' | 'EN_ROUTE' | 'REPAIRING' | 'RESOLVED';
  reportedAt: string;
  acceptedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}

interface TechnicianStats {
  totalAssignedCount: number;
  resolvedTicketsCount: number;
  activeAssignmentsCount: number;
  todayResolvedCount: number;
  averageRepairMinutes: number;
  resolutionRatePercentage: number;
}

type TechnicianTab = 'active' | 'history' | 'safety';

export default function TechnicianDashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  // Primary Data State
  const [assignments, setAssignments] = useState<TechnicianTask[]>([]);
  const [stats, setStats] = useState<TechnicianStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Active Tab
  const [activeTab, setActiveTab] = useState<TechnicianTab>('active');

  // Resolution & Photo Upload Modal State
  const [resolvingTicket, setResolvingTicket] = useState<TechnicianTask | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [submittingResolve, setSubmittingResolve] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  // UI Micro-interactions
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [currentTimeBST, setCurrentTimeBST] = useState('');
  const [socketConnected, setSocketConnected] = useState(false);
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);

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

  // Fetch assignments and performance stats
  const fetchAllData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      const [assignmentsRes, statsRes] = await Promise.all([
        ApiClient.get<TechnicianTask[]>('/api/technicians/me/assignments'),
        ApiClient.get<TechnicianStats>('/api/technicians/me/stats')
      ]);

      if (assignmentsRes.success && Array.isArray(assignmentsRes.data)) {
        setAssignments(assignmentsRes.data);
      }

      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data);
      }
    } catch {
      // Graceful error state
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!authLoading && (!user || (user.role !== 'TECHNICIAN' && user.role !== 'ADMIN'))) {
      router.push('/login');
      return;
    }

    if (user) {
      fetchAllData();

      // Subscribe to technician dispatch socket room
      const socket = getSocket();
      socket.emit('subscribe:technician');
      setSocketConnected(socket.connected);

      const onConnect = () => setSocketConnected(true);
      const onDisconnect = () => setSocketConnected(false);
      const onAssigned = () => fetchAllData(true);
      const onTicketChanged = () => fetchAllData(true);

      socket.on('connect', onConnect);
      socket.on('disconnect', onDisconnect);
      socket.on('ticket:assigned', onAssigned);
      socket.on('ticket:status_changed', onTicketChanged);

      return () => {
        socket.off('connect', onConnect);
        socket.off('disconnect', onDisconnect);
        socket.off('ticket:assigned', onAssigned);
        socket.off('ticket:status_changed', onTicketChanged);
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

  // Handle Accept Dispatch (ASSIGNED -> EN_ROUTE)
  const handleAccept = async (ticketId: string) => {
    setActionInProgressId(ticketId);
    const res = await ApiClient.post(`/api/technicians/me/assignments/${ticketId}/accept`);
    setActionInProgressId(null);

    if (res.success) {
      fetchAllData(true);
    } else {
      alert(res.error?.message || 'Failed to accept dispatch');
    }
  };

  // Handle Start Repair (EN_ROUTE -> REPAIRING)
  const handleStartRepair = async (ticketId: string) => {
    setActionInProgressId(ticketId);
    const res = await ApiClient.post(`/api/technicians/me/assignments/${ticketId}/start-repair`);
    setActionInProgressId(null);

    if (res.success) {
      fetchAllData(true);
    } else {
      alert(res.error?.message || 'Failed to start repair');
    }
  };

  // Handle Photo Selection & Preview
  const handlePhotoChange = (file: File | null) => {
    setPhotoFile(file);
    if (file) {
      const preview = URL.createObjectURL(file);
      setPhotoPreviewUrl(preview);
    } else {
      setPhotoPreviewUrl(null);
    }
  };

  // Handle Final Resolution (REPAIRING -> RESOLVED)
  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvingTicket) return;

    setSubmittingResolve(true);
    setResolveError(null);

    let attachmentId: string | undefined;

    try {
      // 1. Upload proof photo if provided
      if (photoFile) {
        const formData = new FormData();
        formData.append('photo', photoFile);
        formData.append('ticketId', resolvingTicket.ticketId);

        const uploadRes = await ApiClient.post('/api/technicians/me/uploads/repair-photo', formData);
        if (uploadRes.success && uploadRes.data) {
          attachmentId = uploadRes.data.attachmentId;
        } else {
          setResolveError(uploadRes.error?.message || 'Failed to upload repair photo evidence');
          setSubmittingResolve(false);
          return;
        }
      }

      // 2. Submit resolution notes & attachmentId
      const res = await ApiClient.post(
        `/api/technicians/me/assignments/${resolvingTicket.ticketId}/resolve`,
        {
          resolutionNotes: resolutionNotes.trim(),
          attachmentId
        }
      );

      setSubmittingResolve(false);

      if (res.success) {
        setResolvingTicket(null);
        setResolutionNotes('');
        setPhotoFile(null);
        setPhotoPreviewUrl(null);
        fetchAllData(true);
      } else {
        setResolveError(res.error?.message || 'Failed to resolve ticket. Please try again.');
      }
    } catch (err: any) {
      setSubmittingResolve(false);
      setResolveError(err.message || 'An unexpected error occurred during resolution');
    }
  };

  // Filter tasks
  const activeTasks = useMemo(() => {
    return assignments.filter((t) => t.status !== 'RESOLVED');
  }, [assignments]);

  const completedTasks = useMemo(() => {
    return assignments.filter((t) => t.status === 'RESOLVED');
  }, [assignments]);

  if (authLoading || loading) {
    return (
      <div className="py-24 text-center space-y-4">
        <div className="inline-block h-10 w-10 animate-spin rounded-full border-3 border-solid border-amber-500 border-r-transparent" />
        <div className="space-y-1">
          <p className="text-sm font-mono font-bold text-slate-800">CONNECTING TO FIELD DISPATCH STREAM...</p>
          <p className="text-xs text-slate-500">Authenticating certified crew credentials...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-7 pb-16">
      {/* 1. Rugged Mobile Field Masthead */}
      <div className="bg-white rounded-3xl p-5 sm:p-7 border border-slate-200/90 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                <span className={`h-2 w-2 rounded-full bg-emerald-500 ${socketConnected ? 'animate-telemetry-pulse' : ''}`} />
                DISPATCH RADIO CONNECTED
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                <HardHat className="h-3 w-3 text-amber-600" />
                HIGH-VOLTAGE CREW
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2.5">
              <Wrench className="h-6 w-6 text-amber-500 shrink-0" />
              <span>Field Technician Mobile Terminal</span>
            </h1>

            <p className="text-xs sm:text-sm text-slate-600">
              Crew Member: <strong className="text-slate-900">{user?.name}</strong> · ID: <strong className="font-mono text-slate-800">{user?.id?.slice(0, 8)}</strong> · Direct Dispatch Telemetry
            </p>
          </div>

          {/* Masthead Live Clock & Hotline */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-slate-700">
              <Radio className="h-3.5 w-3.5 text-rose-500 animate-pulse" />
              <span className="text-slate-400 font-sans font-medium">BST:</span>
              <span className="font-bold text-slate-900 font-mono-numbers">{currentTimeBST || '--:--:--'}</span>
            </div>

            <button
              onClick={() => fetchAllData(true)}
              disabled={refreshing}
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-mono font-semibold inline-flex items-center gap-1.5 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-amber-500/20 active:scale-[0.98] disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-amber-600 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'SYNCING...' : 'REFRESH'}</span>
            </button>

            <a
              href="tel:16116"
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-2 shadow-sm transition-all"
              title="Call National Load Dispatch Center"
            >
              <PhoneCall className="h-3.5 w-3.5 text-amber-400" />
              <span className="hidden sm:inline">NLDC Hotline</span>
            </a>
          </div>
        </div>

        {/* 2. Field Performance Bento Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Card 1: Active Work Orders */}
          <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-1">
            <div className="flex items-center justify-between text-slate-500 text-[11px] font-mono font-semibold uppercase">
              <span>Active Orders</span>
              <Activity className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl sm:text-3xl font-extrabold font-mono-numbers ${activeTasks.length > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
                {activeTasks.length}
              </span>
              <span className="text-[11px] text-slate-500 font-mono">dispatches</span>
            </div>
            <p className="text-[10px] text-slate-500">
              {activeTasks.length > 0 ? 'Immediate action required' : 'Queue clear'}
            </p>
          </div>

          {/* Card 2: Restored Today */}
          <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-1">
            <div className="flex items-center justify-between text-slate-500 text-[11px] font-mono font-semibold uppercase">
              <span>Resolved Today</span>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold text-emerald-700 font-mono-numbers">
                {stats?.todayResolvedCount ?? completedTasks.length}
              </span>
              <span className="text-[11px] text-slate-500 font-mono">circuits</span>
            </div>
            <p className="text-[10px] text-emerald-700/80">Power restored to grid</p>
          </div>

          {/* Card 3: Average Turnaround Time */}
          <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-1">
            <div className="flex items-center justify-between text-slate-500 text-[11px] font-mono font-semibold uppercase">
              <span>Avg Repair MTTR</span>
              <Clock className="h-3.5 w-3.5 text-cyan-600" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono-numbers">
                {stats?.averageRepairMinutes || 38}
              </span>
              <span className="text-xs text-slate-500 font-mono">mins</span>
            </div>
            <p className="text-[10px] text-slate-500">Accept to energized</p>
          </div>

          {/* Card 4: Field Status */}
          <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-1">
            <div className="flex items-center justify-between text-slate-500 text-[11px] font-mono font-semibold uppercase">
              <span>Field Status</span>
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            </div>
            <div className="flex items-center gap-1.5 pt-1">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-sm font-extrabold text-slate-900 font-mono">ON DUTY</span>
            </div>
            <p className="text-[10px] text-slate-500">Dhaka Metropolitan Grid</p>
          </div>
        </div>
      </div>

      {/* 3. Segmented Navigation Tabs */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200/90 shadow-sm flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setActiveTab('active')}
            className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'active'
                ? 'bg-slate-900 text-white shadow-sm font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
            <span>Active Dispatches ({activeTasks.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'history'
                ? 'bg-slate-900 text-white shadow-sm font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            <span>Restored History ({completedTasks.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('safety')}
            className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'safety'
                ? 'bg-slate-900 text-white shadow-sm font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <HardHat className="h-3.5 w-3.5 text-amber-500" />
            <span>High-Voltage Safety SOP</span>
          </button>
        </div>

        <div className="px-3 py-1 text-[11px] font-mono text-slate-500 hidden sm:block">
          STATUS: <strong className="text-emerald-700">READY FOR DISPATCH</strong>
        </div>
      </div>

      {/* 4. Tab 1: Active Dispatches */}
      {activeTab === 'active' && (
        <div className="space-y-6">
          {activeTasks.length === 0 ? (
            <div className="bg-white rounded-3xl p-10 sm:p-14 text-center space-y-4 border border-slate-200/90 shadow-sm">
              <div className="h-16 w-16 mx-auto rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-lg font-bold text-slate-900">All Field Repairs Cleared</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  No active breakdown tickets currently assigned to your crew. Stand by on radio frequency for automated NLDC dispatch alerts.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {activeTasks.map((task) => {
                const isAssigned = task.status === 'ASSIGNED';
                const isEnRoute = task.status === 'EN_ROUTE';
                const isRepairing = task.status === 'REPAIRING';
                const isLoadingAction = actionInProgressId === task.ticketId;

                return (
                  <div
                    key={task.assignmentId}
                    className="bg-white rounded-3xl p-5 sm:p-7 space-y-5 border border-slate-200/90 shadow-sm clean-card-hover transition-all"
                  >
                    {/* Header: Ticket Number & Stage Badge */}
                    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-amber-900 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg inline-flex items-center gap-1.5">
                          <span>{task.ticketNumber}</span>
                          <button
                            onClick={() => handleCopy(task.ticketNumber)}
                            className="p-0.5 hover:bg-amber-100 rounded text-amber-700"
                            title="Copy ticket number"
                          >
                            {copiedCode === task.ticketNumber ? (
                              <Check className="h-3 w-3 text-emerald-600" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </span>

                        <span className="text-[11px] font-mono text-slate-500">
                          Reported: {new Date(task.reportedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} BST
                        </span>
                      </div>

                      <span
                        className={`text-xs font-mono font-bold px-3 py-1 rounded-full border ${
                          isAssigned
                            ? 'bg-blue-50 text-blue-800 border-blue-200'
                            : isEnRoute
                            ? 'bg-amber-50 text-amber-800 border-amber-200 animate-pulse'
                            : 'bg-orange-50 text-orange-800 border-orange-200 animate-pulse'
                        }`}
                      >
                        {isAssigned && 'NEW DISPATCH'}
                        {isEnRoute && 'CREW EN ROUTE'}
                        {isRepairing && 'REPAIR IN PROGRESS'}
                      </span>
                    </div>

                    {/* 4-Step Tactile Progress Stepper */}
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-4 gap-1.5 text-center text-xs">
                        {/* Step 1: Assigned */}
                        <div
                          className={`py-2 px-1 rounded-xl border text-[11px] font-mono font-bold transition-all ${
                            isAssigned || isEnRoute || isRepairing
                              ? 'bg-blue-50 text-blue-900 border-blue-300'
                              : 'bg-slate-50 text-slate-400 border-slate-200'
                          }`}
                        >
                          1. ASSIGNED
                        </div>

                        {/* Step 2: En Route */}
                        <div
                          className={`py-2 px-1 rounded-xl border text-[11px] font-mono font-bold transition-all ${
                            isEnRoute || isRepairing
                              ? 'bg-amber-50 text-amber-900 border-amber-300'
                              : 'bg-slate-50 text-slate-400 border-slate-200'
                          }`}
                        >
                          2. EN ROUTE
                        </div>

                        {/* Step 3: Repairing */}
                        <div
                          className={`py-2 px-1 rounded-xl border text-[11px] font-mono font-bold transition-all ${
                            isRepairing
                              ? 'bg-orange-50 text-orange-900 border-orange-300'
                              : 'bg-slate-50 text-slate-400 border-slate-200'
                          }`}
                        >
                          3. REPAIRING
                        </div>

                        {/* Step 4: Restored */}
                        <div className="py-2 px-1 rounded-xl border text-[11px] font-mono font-bold bg-slate-50 text-slate-400 border-slate-200">
                          4. RESTORED
                        </div>
                      </div>
                    </div>

                    {/* Task Location & Feeder Details */}
                    <div className="space-y-3">
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
                        <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
                          <span>GRID SUBSTATION & FEEDER</span>
                          <span className="text-slate-700 font-bold">{task.zoneName}</span>
                        </div>
                        <div className="text-sm font-bold text-slate-900">
                          {task.feederName} · <span className="font-normal text-slate-600">{task.substationName}</span>
                        </div>
                      </div>

                      {/* Customer Incident Report */}
                      <div className="space-y-1">
                        <span className="text-[11px] font-mono uppercase text-slate-400 font-semibold block">
                          Outage Symptoms & Customer Notes
                        </span>
                        <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200/80 text-xs text-slate-800 leading-relaxed font-medium">
                          {task.description}
                        </div>
                      </div>

                      {/* Location & GPS Navigation Action */}
                      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-mono text-slate-400 uppercase block">Site Location</span>
                          <div className="flex items-center gap-1.5 text-slate-800 font-medium">
                            <MapPin className="h-4 w-4 text-rose-500 shrink-0" />
                            <span>{task.address || 'Dhaka Grid Distribution Area'}</span>
                          </div>
                          {task.landmark && (
                            <span className="text-[11px] text-slate-500 pl-5 block">
                              Landmark: <strong>{task.landmark}</strong>
                            </span>
                          )}
                        </div>

                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                            `${task.address || ''} ${task.landmark || ''} ${task.substationName || ''} Dhaka`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors self-start sm:self-auto shrink-0 shadow-2xs"
                        >
                          <Navigation className="h-3.5 w-3.5 text-blue-600" />
                          <span>Open GPS Directions</span>
                          <ExternalLink className="h-3 w-3 text-slate-400" />
                        </a>
                      </div>
                    </div>

                    {/* Big Tactile Action Buttons (Min 48px Height) */}
                    <div className="pt-3 border-t border-slate-100">
                      {isAssigned && (
                        <button
                          onClick={() => handleAccept(task.ticketId)}
                          disabled={isLoadingAction}
                          className="w-full min-h-[48px] py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2.5 transition-all active:scale-[0.99] disabled:opacity-60"
                        >
                          <Navigation className={`h-4 w-4 ${isLoadingAction ? 'animate-spin' : ''}`} />
                          <span>{isLoadingAction ? 'Accepting Dispatch...' : 'Accept Dispatch & Mark En Route'}</span>
                        </button>
                      )}

                      {isEnRoute && (
                        <button
                          onClick={() => handleStartRepair(task.ticketId)}
                          disabled={isLoadingAction}
                          className="w-full min-h-[48px] py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2.5 transition-all active:scale-[0.99] disabled:opacity-60"
                        >
                          <Wrench className={`h-4 w-4 ${isLoadingAction ? 'animate-spin' : ''}`} />
                          <span>{isLoadingAction ? 'Updating Status...' : 'Arrived on Site — Begin Repair Work'}</span>
                        </button>
                      )}

                      {isRepairing && (
                        <button
                          onClick={() => {
                            setResolvingTicket(task);
                            setResolutionNotes('');
                            setPhotoFile(null);
                            setPhotoPreviewUrl(null);
                            setResolveError(null);
                          }}
                          className="w-full min-h-[48px] py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2.5 transition-all active:scale-[0.99]"
                        >
                          <Camera className="h-4 w-4" />
                          <span>Upload Photo Proof & Restore Line Power</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 5. Tab 2: Restored History */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <span>Completed Field Work Orders</span>
              </h3>
              <p className="text-xs text-slate-500">
                Log of successfully repaired distribution transformers, lines, and substations restored to the grid.
              </p>
            </div>

            <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-200 self-start sm:self-auto">
              TOTAL RESTORED: {completedTasks.length}
            </span>
          </div>

          {completedTasks.length === 0 ? (
            <div className="bg-white rounded-3xl p-10 sm:p-14 text-center space-y-3 border border-slate-200/90 shadow-sm">
              <CheckCircle2 className="h-10 w-10 text-slate-300 mx-auto" />
              <h4 className="text-base font-bold text-slate-900">No Resolved Tasks Recorded Today</h4>
              <p className="text-xs text-slate-500">
                Completed work orders will appear here once power is confirmed restored and evidence is verified.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {completedTasks.map((task) => (
                <div
                  key={task.assignmentId}
                  className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 space-y-3 shadow-sm"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                        {task.ticketNumber}
                      </span>
                      <span className="font-bold text-sm text-slate-900">
                        {task.feederName}
                      </span>
                    </div>

                    <span className="font-mono text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      ✓ ENERGIZED & RESTORED
                    </span>
                  </div>

                  <p className="text-xs text-slate-600">
                    {task.description}
                  </p>

                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-2 border-t border-slate-50">
                    <span>{task.substationName} ({task.zoneName})</span>
                    <span>
                      {task.completedAt
                        ? `Restored: ${new Date(task.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} BST`
                        : 'Completed'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 6. Tab 3: High-Voltage Safety SOP Guide */}
      {activeTab === 'safety' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-sm space-y-1">
            <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
              <HardHat className="h-5 w-5 text-amber-500" />
              <span>National Grid Standard Operating Safety Protocols</span>
            </h3>
            <p className="text-xs text-slate-500">
              Mandatory safety requirements for 11kV / 33kV high-voltage lines under Bangladesh Electricity Safety Regulations.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-700">
            <div className="p-5 rounded-2xl bg-white border border-slate-200/90 space-y-2 shadow-sm">
              <div className="flex items-center gap-2 text-rose-600 font-bold font-mono text-sm">
                <AlertTriangle className="h-4 w-4" />
                <span>1. Lockout / Tagout (LOTO)</span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Before physical contact with any fallen line or distribution transformer, verify de-energization with the NLDC Control Room via telephone or radio. Always apply padlocks and caution tags to the isolator.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-slate-200/90 space-y-2 shadow-sm">
              <div className="flex items-center gap-2 text-amber-600 font-bold font-mono text-sm">
                <Zap className="h-4 w-4" />
                <span>2. Voltage Testing & Earthing</span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Test conductors with calibrated contact voltage detectors. Attach temporary earthing sets to all phases before performing conductor splicing, fuse replacement, or jumper tightening.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-slate-200/90 space-y-2 shadow-sm">
              <div className="flex items-center gap-2 text-blue-600 font-bold font-mono text-sm">
                <ShieldCheck className="h-4 w-4" />
                <span>3. Certified Personal Protective Equipment</span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                High-voltage Class 4 insulated rubber gloves, arc-flash face shields, flame-resistant overalls, and dielectric safety boots must be inspected for pinholes and worn at all times on site.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-slate-200/90 space-y-2 shadow-sm">
              <div className="flex items-center gap-2 text-emerald-600 font-bold font-mono text-sm">
                <Camera className="h-4 w-4" />
                <span>4. Photographic Evidence & Audit</span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Capture clear photographic evidence of the repaired component (transformer, drop-out fuse, insulator, or overhead cable) before re-energizing the circuit to satisfy regulatory audit gate requirements.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: RESOLVE WORK ORDER WITH PHOTO EVIDENCE ================= */}
      {resolvingTicket && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 sm:p-8 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Submit Repair Proof & Re-energize
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Verify repair work and restore electricity to feeder line
                  </p>
                </div>
              </div>

              <button
                onClick={() => setResolvingTicket(null)}
                className="min-h-[44px] min-w-[44px] rounded-xl inline-flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Error Banner */}
            {resolveError && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{resolveError}</span>
              </div>
            )}

            {/* Task Info Pill */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono space-y-1 text-slate-800">
              <div className="flex justify-between">
                <span className="text-slate-500">Ticket:</span>
                <strong>{resolvingTicket.ticketNumber}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Feeder:</span>
                <strong>{resolvingTicket.feederName}</strong>
              </div>
            </div>

            <form onSubmit={handleResolveSubmit} className="space-y-4">
              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Technician Work Notes & Re-energization Actions (Required)
                </label>
                <textarea
                  required
                  rows={3}
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="e.g. Replaced 100kVA blown transformer fuse, cleared tree branch from line, tested phase continuity, reclosed circuit breaker..."
                  className="w-full text-xs p-3 rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                />
              </div>

              {/* Photo Evidence Upload Dropzone */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Camera className="h-3.5 w-3.5 text-slate-500" />
                    Repair Photo Evidence (JPEG, PNG, WebP)
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">Max 10MB</span>
                </label>

                <div className="border-2 border-dashed border-slate-300 rounded-2xl p-4 text-center hover:border-emerald-500 bg-slate-50/50 transition-colors">
                  {photoPreviewUrl ? (
                    <div className="space-y-3">
                      <img
                        src={photoPreviewUrl}
                        alt="Repair Evidence Preview"
                        className="h-32 mx-auto rounded-xl object-cover border border-slate-200 shadow-xs"
                      />
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-xs font-mono text-slate-600 truncate max-w-xs">
                          {photoFile?.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => handlePhotoChange(null)}
                          className="text-xs text-rose-600 hover:underline font-semibold"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="h-8 w-8 mx-auto text-slate-400" />
                      <div className="text-xs text-slate-600">
                        <label
                          htmlFor="repairPhotoInput"
                          className="font-bold text-emerald-700 hover:underline cursor-pointer"
                        >
                          Take a photo or browse
                        </label>
                        <span className="text-slate-400"> to attach proof</span>
                      </div>
                      <input
                        id="repairPhotoInput"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        capture="environment"
                        onChange={(e) => handlePhotoChange(e.target.files ? e.target.files[0] : null)}
                        className="hidden"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setResolvingTicket(null)}
                  className="min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={submittingResolve || !resolutionNotes.trim()}
                  className="min-h-[44px] px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-2"
                >
                  {submittingResolve ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Re-energizing Feeder...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Confirm Power Restored</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
