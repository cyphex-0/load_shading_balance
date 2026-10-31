'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Zap,
  AlertTriangle,
  Clock,
  MapPin,
  CheckCircle2,
  ShieldCheck,
  X,
  Plus,
  RefreshCw,
  Copy,
  Check,
  Radio,
  Layers,
  Bell,
  Star,
  Trash2,
  Building2,
  PhoneCall,
  Calendar,
  Activity,
  ArrowRight,
  Info,
  CheckCircle,
  Wrench,
  Truck,
  Flame,
  HelpCircle
} from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { ApiClient } from '../../lib/api';
import { StatusBadge } from '../../components/StatusBadge';
import { getSocket } from '../../lib/socket';

interface CustomerMeterItem {
  id: string; // Link ID
  meterId: string;
  meterNumber: string;
  address: string;
  isPrimary: boolean;
  nickname?: string;
  linkedAt?: string;
  feeder?: {
    id: string;
    name: string;
    code: string;
    status: string;
    isCritical?: boolean;
  } | null;
  substationName?: string;
  zoneName?: string;
  status?: string;
  updatedAt?: string;
}

interface UpcomingScheduleSlot {
  scheduleId: string;
  planningDate: string;
  scheduleStatus: string;
  slotId: string;
  startTime: string;
  endTime: string;
  targetDeficitMW: number;
  actualDeficitMW: number;
  feederLoadMW: number;
  isPublished: boolean;
}

interface OutageReportItem {
  id: string;
  type?: string;
  ticketNumber?: string | null;
  meterId: string;
  meterNumber?: string;
  feederId: string;
  feederName?: string;
  status: string;
  faultType?: string | null;
  description: string;
  landmark?: string | null;
  isPlanned?: boolean;
  scheduledEndTime?: string | null;
  reportedAt: string;
  resolvedAt?: string | null;
  assignedAt?: string | null;
  enRouteAt?: string | null;
  repairingAt?: string | null;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

type TabType = 'meters' | 'schedule' | 'tickets' | 'alerts';

const FAULT_TYPE_OPTIONS = [
  {
    value: 'OTHER',
    label: 'Sudden Blackout / No Power',
    icon: Zap,
    desc: 'Total unexpected power outage across premises'
  },
  {
    value: 'TRANSFORMER',
    label: 'Transformer Explosion / Spark',
    icon: Flame,
    desc: 'Loud pop, smoke, or fire from local pole transformer'
  },
  {
    value: 'LINE_DOWN',
    label: 'Downed / Snapped Overhead Cable',
    icon: AlertTriangle,
    desc: 'Snapped high or low voltage cable touching ground'
  },
  {
    value: 'METER_FAULT',
    label: 'Electric Meter Tripped / Dark',
    icon: Activity,
    desc: 'Digital meter display is blank or breaker burnt'
  },
  {
    value: 'CABLE_FAULT',
    label: 'Fluctuating / Low Phase Voltage',
    icon: Wrench,
    desc: 'Severe voltage flicker or single-phase brownout'
  }
];

export default function CustomerDashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  // Primary Data State
  const [dashboard, setDashboard] = useState<any>(null);
  const [metersList, setMetersList] = useState<CustomerMeterItem[]>([]);
  const [outageHistory, setOutageHistory] = useState<OutageReportItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Active Tab View
  const [activeTab, setActiveTab] = useState<TabType>('meters');

  // UI Micro-interactions
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [currentTimeBST, setCurrentTimeBST] = useState<string>('');
  const [socketConnected, setSocketConnected] = useState<boolean>(false);

  // Outage Report Modal State
  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  const [selectedMeterId, setSelectedMeterId] = useState<string>('');
  const [selectedFaultType, setSelectedFaultType] = useState<string>('OTHER');
  const [reportDescription, setReportDescription] = useState<string>('');
  const [reportLandmark, setReportLandmark] = useState<string>('');
  const [submittingReport, setSubmittingReport] = useState<boolean>(false);
  const [reportFeedback, setReportFeedback] = useState<any>(null);

  // Link New Meter Modal State
  const [showLinkModal, setShowLinkModal] = useState<boolean>(false);
  const [newMeterNumber, setNewMeterNumber] = useState<string>('');
  const [newMeterNickname, setNewMeterNickname] = useState<string>('');
  const [newMeterPrimary, setNewMeterPrimary] = useState<boolean>(false);
  const [linkingMeter, setLinkingMeter] = useState<boolean>(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Unlink / Set Primary Action State
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Live Bangladesh Standard Time (UTC+6)
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

  // Fetch all customer telemetry
  const fetchAllData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [dashRes, metersRes, reportsRes] = await Promise.all([
        ApiClient.get('/api/customers/me/dashboard'),
        ApiClient.get('/api/customers/me/meters'),
        ApiClient.get('/api/customers/me/outage-reports')
      ]);

      if (dashRes.success && dashRes.data) {
        setDashboard(dashRes.data);
      }

      if (metersRes.success && Array.isArray(metersRes.data)) {
        setMetersList(metersRes.data);
        if (!selectedMeterId && metersRes.data.length > 0) {
          const primary = metersRes.data.find((m: any) => m.isPrimary) || metersRes.data[0];
          setSelectedMeterId(primary.meterId);
        }
      }

      if (reportsRes.success && Array.isArray(reportsRes.data)) {
        setOutageHistory(reportsRes.data);
      }
    } catch {
      // Graceful error state
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }

    if (user) {
      fetchAllData();

      // Listen to real-time ticket & schedule changes via Socket.IO
      const socket = getSocket();
      setSocketConnected(socket.connected);

      const onConnect = () => setSocketConnected(true);
      const onDisconnect = () => setSocketConnected(false);
      const onTicketChanged = () => fetchAllData(true);
      const onSchedulePublished = () => fetchAllData(true);
      const onFeederChanged = () => fetchAllData(true);

      socket.on('connect', onConnect);
      socket.on('disconnect', onDisconnect);
      socket.on('ticket:status_changed', onTicketChanged);
      socket.on('schedule:published', onSchedulePublished);
      socket.on('feeder:status_changed', onFeederChanged);

      return () => {
        socket.off('connect', onConnect);
        socket.off('disconnect', onDisconnect);
        socket.off('ticket:status_changed', onTicketChanged);
        socket.off('schedule:published', onSchedulePublished);
        socket.off('feeder:status_changed', onFeederChanged);
      };
    }
  }, [user, authLoading]);

  // Copy to clipboard helper
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => {
      setCopiedCode(null);
    }, 2000);
  };

  // Submit Outage Report (Smart Conflict Resolution)
  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMeterId) return;

    setSubmittingReport(true);
    setReportFeedback(null);

    const res = await ApiClient.post('/api/customers/me/outage-reports', {
      meterId: selectedMeterId,
      faultType: selectedFaultType,
      description: reportDescription,
      landmark: reportLandmark || undefined
    });

    setSubmittingReport(false);

    if (res.success && res.data) {
      setReportFeedback(res.data);
      setReportDescription('');
      setReportLandmark('');
      fetchAllData(true);
    } else {
      setReportFeedback({
        error: res.error?.message || 'Failed to submit outage report. Please try again.'
      });
    }
  };

  // Link New Meter Handler
  const handleLinkMeterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMeterNumber.trim()) return;

    setLinkingMeter(true);
    setLinkError(null);

    const res = await ApiClient.post('/api/customers/me/meters', {
      meterNumber: newMeterNumber.trim().toUpperCase(),
      nickname: newMeterNickname.trim() || undefined,
      isPrimary: newMeterPrimary
    });

    setLinkingMeter(false);

    if (res.success) {
      setNewMeterNumber('');
      setNewMeterNickname('');
      setNewMeterPrimary(false);
      setShowLinkModal(false);
      fetchAllData(true);
    } else {
      setLinkError(
        res.error?.message ||
          'Failed to link meter. Ensure the meter number is valid and not registered to another account.'
      );
    }
  };

  // Set Meter as Primary
  const handleSetPrimary = async (linkId: string) => {
    setActionLoadingId(linkId);
    const res = await ApiClient.patch(`/api/customers/me/meters/${linkId}/primary`);
    setActionLoadingId(null);
    if (res.success) {
      fetchAllData(true);
    }
  };

  // Unlink Meter
  const handleUnlinkMeter = async (linkId: string, meterNumber: string) => {
    if (!confirm(`Are you sure you want to unlink meter ${meterNumber}?`)) return;

    setActionLoadingId(linkId);
    const res = await ApiClient.delete(`/api/customers/me/meters/${linkId}`);
    setActionLoadingId(null);
    if (res.success) {
      fetchAllData(true);
    }
  };

  // Helper date & time formats
  const formatSlotTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Dhaka'
      });
    } catch {
      return isoString;
    }
  };

  const formatDisplayDate = (dateStr: string) => {
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  // Aggregate Metrics
  const primaryMeter = metersList.find((m) => m.isPrimary) || metersList[0] || dashboard?.primaryMeter;
  const totalMetersCount = metersList.length;
  const isAnyMeterInShedding = metersList.some(
    (m) => m.status === 'PLANNED_OUTAGE' || m.feeder?.status === 'OFFLINE'
  );
  const activeTickets = outageHistory.filter(
    (t) => t.status !== 'RESOLVED' && t.status !== 'CANCELLED' && !t.isPlanned
  );
  const upcomingSchedules: UpcomingScheduleSlot[] = dashboard?.upcomingSchedules || [];
  const notifications: NotificationItem[] = dashboard?.notifications?.recent || [];
  const unreadNotificationsCount = dashboard?.notifications?.unreadCount || 0;

  // Next Upcoming Shedding Slot
  const nextSlot = upcomingSchedules[0];

  if (authLoading || loading) {
    return (
      <div className="py-24 text-center space-y-4">
        <div className="inline-block h-10 w-10 animate-spin rounded-full border-3 border-solid border-amber-500 border-r-transparent" />
        <div className="space-y-1">
          <p className="text-sm font-mono font-bold text-slate-800">CONNECTING TO METER TELEMETRY...</p>
          <p className="text-xs text-slate-500">Retrieving real-time power status and substation metrics...</p>
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
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <span className={`h-2 w-2 rounded-full bg-emerald-500 ${socketConnected ? 'animate-telemetry-pulse' : ''}`} />
              METER TELEMETRY LIVE
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              <ShieldCheck className="h-3 w-3 text-slate-600" />
              SMART CONFLICT RESOLVER ARMED
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-purple-50 text-purple-700 border border-purple-200">
              <Building2 className="h-3 w-3 text-purple-600" />
              RESIDENTIAL & COMMERCIAL
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
            <Zap className="h-7 w-7 text-amber-500 shrink-0" />
            <span>Resident & Business Customer Portal</span>
          </h1>

          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            Welcome back, <strong className="text-slate-900">{user?.name}</strong>. Real-time meter monitoring, scheduled load shedding timetables, and emergency outage dispatch across your connected circuits.
          </p>
        </div>

        {/* Masthead Actions & Live Clock */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 shadow-sm text-xs font-mono text-slate-700">
            <Radio className="h-3.5 w-3.5 text-rose-500 animate-pulse" />
            <span className="text-slate-400 font-sans font-medium">BST:</span>
            <span className="font-bold text-slate-900 font-mono-numbers">{currentTimeBST || '--:--:--'}</span>
          </div>

          <button
            onClick={() => fetchAllData(true)}
            disabled={refreshing}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-mono font-semibold inline-flex items-center gap-1.5 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-amber-500/20 active:scale-[0.98] disabled:opacity-60"
            title="Refresh telemetry"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-amber-600 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'SYNCING...' : 'REFRESH'}</span>
          </button>

          <button
            onClick={() => {
              setLinkError(null);
              setShowLinkModal(true);
            }}
            className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-xs shadow-sm inline-flex items-center gap-2 transition-all active:scale-[0.98]"
          >
            <Plus className="h-4 w-4 text-slate-600" />
            <span>Link Meter</span>
          </button>

          <button
            onClick={() => {
              setReportFeedback(null);
              setShowReportModal(true);
            }}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md inline-flex items-center gap-2 transition-all active:scale-[0.98]"
          >
            <AlertTriangle className="h-4 w-4" />
            <span>Report Outage</span>
          </button>
        </div>
      </div>

      {/* 2. SCADA Telemetry Bento Overview Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Power Transmission Status */}
        <div className="clean-card clean-card-hover p-4 sm:p-5 rounded-2xl relative overflow-hidden">
          <div
            className={`absolute top-0 left-0 right-0 h-1 ${
              isAnyMeterInShedding ? 'bg-amber-500' : 'bg-emerald-500'
            }`}
          />
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span className="font-mono uppercase font-semibold">Power Status</span>
            <Activity className="h-4 w-4 text-slate-400" />
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`h-3 w-3 rounded-full shrink-0 ${
                isAnyMeterInShedding ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
              }`}
            />
            <span className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
              {isAnyMeterInShedding ? 'Outage Active' : 'Normal Grid Supply'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            {isAnyMeterInShedding
              ? 'One or more meters undergoing scheduled or emergency cut'
              : 'All premises transmitting standard voltage'}
          </p>
        </div>

        {/* Card 2: Registered Electric Meters */}
        <div className="clean-card clean-card-hover p-4 sm:p-5 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-cyan-500" />
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span className="font-mono uppercase font-semibold">Connected Meters</span>
            <Layers className="h-4 w-4 text-cyan-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono-numbers">
              {totalMetersCount}
            </span>
            <span className="text-xs text-slate-500 font-mono">meters</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-2 truncate">
            {primaryMeter ? `Primary: ${primaryMeter.meterNumber}` : 'No meter linked yet'}
          </div>
        </div>

        {/* Card 3: Upcoming Shedding Rotation */}
        <div className="clean-card clean-card-hover p-4 sm:p-5 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span className="font-mono uppercase font-semibold">Next Rotation</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <div className="flex items-baseline gap-1.5">
            {nextSlot ? (
              <span className="text-base sm:text-lg font-extrabold text-amber-900 font-mono">
                {formatSlotTime(nextSlot.startTime)} – {formatSlotTime(nextSlot.endTime)}
              </span>
            ) : (
              <span className="text-lg sm:text-xl font-extrabold text-emerald-800">
                Zero Cuts Today
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            {nextSlot ? `Date: ${formatDisplayDate(nextSlot.planningDate)}` : 'Demand met by generation'}
          </p>
        </div>

        {/* Card 4: Active Emergency Tickets */}
        <div className="clean-card clean-card-hover p-4 sm:p-5 rounded-2xl relative overflow-hidden">
          <div
            className={`absolute top-0 left-0 right-0 h-1 ${
              activeTickets.length > 0 ? 'bg-rose-500' : 'bg-slate-400'
            }`}
          />
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span className="font-mono uppercase font-semibold">Active Fault Tickets</span>
            <AlertTriangle
              className={`h-4 w-4 ${activeTickets.length > 0 ? 'text-rose-600' : 'text-slate-400'}`}
            />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono-numbers">
              {activeTickets.length}
            </span>
            <span className="text-xs text-slate-500 font-mono">open</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            {activeTickets.length > 0 ? 'Crew dispatch or repair in progress' : 'No reported faults'}
          </p>
        </div>
      </div>

      {/* 3. Navigation Tabs Bar */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200/90 shadow-sm flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setActiveTab('meters')}
            className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'meters'
                ? 'bg-slate-900 text-white shadow-sm font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Connected Meters ({metersList.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('schedule')}
            className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'schedule'
                ? 'bg-slate-900 text-white shadow-sm font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Clock className="h-3.5 w-3.5 text-amber-500" />
            <span>My Rotation Schedule ({upcomingSchedules.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('tickets')}
            className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'tickets'
                ? 'bg-slate-900 text-white shadow-sm font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
            <span>Outage History & Tracking ({outageHistory.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('alerts')}
            className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'alerts'
                ? 'bg-slate-900 text-white shadow-sm font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Bell className="h-3.5 w-3.5 text-cyan-600" />
            <span>Alerts & SMS</span>
            {unreadNotificationsCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500 text-slate-950">
                {unreadNotificationsCount}
              </span>
            )}
          </button>
        </div>

        <div className="px-3 py-1 text-[11px] font-mono text-slate-500 hidden sm:block">
          CUSTOMER ID: <strong className="text-slate-800">{user?.id?.slice(0, 12)}</strong>
        </div>
      </div>

      {/* 4. Tab 1: Connected Meters & Feeder Telemetry */}
      {activeTab === 'meters' && (
        <div className="space-y-6">
          {metersList.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 border border-slate-200/90 text-center space-y-4 shadow-sm">
              <div className="h-16 w-16 mx-auto rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                <Zap className="h-8 w-8" />
              </div>
              <div className="space-y-2 max-w-md mx-auto">
                <h3 className="text-lg font-bold text-slate-900">No Electric Meter Linked Yet</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Connect your prepaid or postpaid smart electric meter to monitor real-time transmission, view load shedding schedules, and report emergency faults.
                </p>
              </div>
              <button
                onClick={() => {
                  setLinkError(null);
                  setShowLinkModal(true);
                }}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs inline-flex items-center gap-2 shadow-sm transition-all"
              >
                <Plus className="h-4 w-4" />
                <span>Link Your First Meter</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {metersList.map((m) => {
                const feederObj = m.feeder;
                const isOnline = m.status === 'ONLINE' || feederObj?.status === 'ONLINE';

                return (
                  <div
                    key={m.id}
                    className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 space-y-5 shadow-sm clean-card-hover transition-all"
                  >
                    {/* Meter Header */}
                    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-extrabold text-base text-slate-900">
                            {m.nickname || 'Premises Meter'}
                          </h3>
                          {m.isPrimary && (
                            <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                              <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                              PRIMARY
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-xs font-mono">
                          <span className="text-slate-500 font-sans">Meter #:</span>
                          <span className="font-bold text-slate-900">{m.meterNumber}</span>
                          <button
                            onClick={() => handleCopy(m.meterNumber)}
                            className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 transition-colors"
                            title="Copy meter number"
                          >
                            {copiedCode === m.meterNumber ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      <StatusBadge status={m.status || feederObj?.status || 'ONLINE'} size="sm" />
                    </div>

                    {/* Address & Grid Metadata */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                        <span className="text-[11px] font-mono text-slate-400 uppercase">Premises Location</span>
                        <p className="font-semibold text-slate-800 flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{m.address || 'Dhaka Metropolitan Area'}</span>
                        </p>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                        <span className="text-[11px] font-mono text-slate-400 uppercase">Substation & Zone</span>
                        <p className="font-semibold text-slate-800 flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">
                            {m.substationName || 'Primary Substation'} • {m.zoneName || 'Dhaka'}
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Assigned Feeder Strip */}
                    <div className="p-4 rounded-xl bg-gradient-to-r from-slate-50 via-white to-slate-50 border border-slate-200 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-medium flex items-center gap-1.5">
                          <Zap className="h-3.5 w-3.5 text-amber-500" />
                          Distribution Feeder Line:
                        </span>
                        {feederObj?.code && (
                          <span className="font-mono font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                            {feederObj.code}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 text-sm">
                          {feederObj?.name || 'Local Distribution Circuit'}
                        </span>
                        {feederObj?.isCritical ? (
                          <span className="font-mono text-[10px] font-bold text-purple-800 bg-purple-50 px-2.5 py-1 rounded-full border border-purple-200 flex items-center gap-1">
                            <ShieldCheck className="h-3 w-3 text-purple-600" />
                            Law 1 Hospital Shielded
                          </span>
                        ) : (
                          <span className="font-mono text-[10px] text-slate-500">
                            Equitable 1x/day rotation
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action Bar for this Meter */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
                      <div className="flex items-center gap-2">
                        {!m.isPrimary && (
                          <button
                            onClick={() => handleSetPrimary(m.id)}
                            disabled={actionLoadingId === m.id}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold transition-colors disabled:opacity-60 flex items-center gap-1.5"
                          >
                            <Star className="h-3 w-3 text-amber-500" />
                            <span>Set as Primary</span>
                          </button>
                        )}

                        <button
                          onClick={() => {
                            setSelectedMeterId(m.meterId);
                            setReportFeedback(null);
                            setShowReportModal(true);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold border border-rose-200 transition-colors flex items-center gap-1.5"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          <span>Report Outage</span>
                        </button>
                      </div>

                      {metersList.length > 1 && (
                        <button
                          onClick={() => handleUnlinkMeter(m.id, m.meterNumber)}
                          disabled={actionLoadingId === m.id}
                          className="px-2.5 py-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors inline-flex items-center gap-1 text-[11px]"
                          title="Unlink this meter from account"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Unlink</span>
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

      {/* 5. Tab 2: My Feeder Rotation Schedule */}
      {activeTab === 'schedule' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-500" />
                <span>Published Rotation Timetables for Your Meters</span>
              </h3>
              <p className="text-xs text-slate-500">
                Official load shedding slots dispatched by the National Load Dispatch Center affecting your feeder lines.
              </p>
            </div>

            <Link
              href="/schedules"
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors self-start sm:self-auto shrink-0"
            >
              <span>View Full City Schedule</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {upcomingSchedules.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 border border-slate-200/90 text-center space-y-4 shadow-sm">
              <div className="h-16 w-16 mx-auto rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div className="space-y-2 max-w-md mx-auto">
                <h4 className="text-base font-bold text-slate-900">
                  Zero Load Shedding Scheduled Today
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Power supply to your registered feeder lines is projected to remain fully energized. No rotation slots have been assigned to your neighborhood today.
                </p>
              </div>
              <span className="inline-block font-mono text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                ✓ ALL METERS NORMAL
              </span>
            </div>
          ) : (
            <div className="space-y-4">
              {upcomingSchedules.map((slot, idx) => (
                <div
                  key={slot.slotId || idx}
                  className="bg-white rounded-2xl border border-amber-200/90 p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start sm:items-center gap-4">
                    <div className="p-3 rounded-2xl bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                      <Clock className="h-6 w-6" />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded">
                          SLOT #{idx + 1}
                        </span>
                        <span className="text-xs font-mono text-slate-500">
                          {formatDisplayDate(slot.planningDate)}
                        </span>
                      </div>

                      <div className="text-lg font-extrabold text-slate-900 font-mono">
                        {formatSlotTime(slot.startTime)} – {formatSlotTime(slot.endTime)}
                        <span className="text-xs font-sans text-slate-400 font-normal ml-1.5">(BST)</span>
                      </div>

                      <p className="text-xs text-slate-500">
                        Planned load shedding rotation window. Power will restore automatically at {formatSlotTime(slot.endTime)}.
                      </p>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono space-y-1 text-left sm:text-right shrink-0">
                    <div>
                      <span className="text-slate-500">Feeder Demand: </span>
                      <strong className="text-slate-900">{slot.feederLoadMW || slot.targetDeficitMW} MW</strong>
                    </div>
                    <div className="text-[11px] text-amber-800 font-semibold">
                      1x/DAY ROTATION MAXIMUM
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 6. Tab 3: Outage Ticket History & Real-Time Stepper */}
      {activeTab === 'tickets' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-rose-600" />
                <span>Outage Ticket Tracker & Historical Dispatch</span>
              </h3>
              <p className="text-xs text-slate-500">
                Track live field crew dispatch, smart conflict interceptions, and emergency repair progress in real time.
              </p>
            </div>

            <button
              onClick={() => {
                setReportFeedback(null);
                setShowReportModal(true);
              }}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs inline-flex items-center gap-2 shadow-sm transition-all self-start sm:self-auto shrink-0"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Report New Outage</span>
            </button>
          </div>

          {outageHistory.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 border border-slate-200/90 text-center space-y-4 shadow-sm">
              <div className="h-16 w-16 mx-auto rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div className="space-y-2 max-w-md mx-auto">
                <h4 className="text-base font-bold text-slate-900">Zero Outage Tickets Reported</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  You have not submitted any outage tickets. If your power suddenly drops or a cable snaps, click &quot;Report Outage&quot; above for immediate control room review.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {outageHistory.map((ticket) => {
                const isPlannedConflict = ticket.isPlanned || ticket.type === 'PLANNED_CONFLICT';

                // Stepper stages
                const stages = ['REPORTED', 'ASSIGNED', 'EN_ROUTE', 'REPAIRING', 'RESOLVED'];
                const currentStageIdx = stages.indexOf(ticket.status);

                return (
                  <div
                    key={ticket.id}
                    className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 space-y-5 shadow-sm"
                  >
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {ticket.ticketNumber ? (
                            <span className="font-mono font-bold text-xs text-amber-900 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200 inline-flex items-center gap-1.5">
                              <span>{ticket.ticketNumber}</span>
                              <button
                                onClick={() => handleCopy(ticket.ticketNumber || '')}
                                className="p-0.5 hover:bg-amber-100 rounded text-amber-700"
                                title="Copy ticket number"
                              >
                                {copiedCode === ticket.ticketNumber ? (
                                  <Check className="h-3 w-3 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>
                            </span>
                          ) : (
                            <span className="font-mono text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                              PLANNED INTERCEPTION
                            </span>
                          )}

                          <StatusBadge status={ticket.status} size="sm" />

                          {ticket.faultType && (
                            <span className="text-[11px] font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                              {ticket.faultType}
                            </span>
                          )}
                        </div>

                        <p className="text-sm font-semibold text-slate-900 pt-1">
                          {ticket.description}
                        </p>
                      </div>

                      <div className="text-[11px] font-mono text-slate-500 text-left sm:text-right shrink-0">
                        <div>Reported: {new Date(ticket.reportedAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                        {ticket.landmark && (
                          <div className="text-slate-400 truncate max-w-xs">
                            Near: {ticket.landmark}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Smart Conflict vs Genuine Fault View */}
                    {isPlannedConflict ? (
                      <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1.5">
                        <div className="font-bold flex items-center gap-2">
                          <Clock className="h-4 w-4 text-amber-700" />
                          <span>Smart Conflict Intercepted: Ongoing Planned Rotation</span>
                        </div>
                        <p className="text-amber-800 leading-relaxed">
                          Your line is currently undergoing scheduled national grid load shedding. No equipment failure was detected.
                        </p>
                        {ticket.scheduledEndTime && (
                          <div className="font-mono font-bold pt-1">
                            Scheduled Restoration: {formatSlotTime(ticket.scheduledEndTime)} BST
                          </div>
                        )}
                      </div>
                    ) : (
                      /* 5-Step Visual Stepper */
                      <div className="space-y-3 pt-2">
                        <div className="text-[11px] font-mono uppercase font-bold text-slate-400">
                          Field Restoration Lifecycle
                        </div>

                        <div className="grid grid-cols-5 gap-2 text-center text-xs">
                          {/* Step 1: Reported */}
                          <div className="space-y-1">
                            <div
                              className={`h-2 rounded-full ${
                                currentStageIdx >= 0 ? 'bg-emerald-500' : 'bg-slate-200'
                              }`}
                            />
                            <span className="text-[11px] font-semibold text-slate-700 block">1. Logged</span>
                            <span className="text-[9px] font-mono text-slate-400 block hidden sm:block">Queue</span>
                          </div>

                          {/* Step 2: Assigned */}
                          <div className="space-y-1">
                            <div
                              className={`h-2 rounded-full ${
                                currentStageIdx >= 1 ? 'bg-emerald-500' : 'bg-slate-200'
                              }`}
                            />
                            <span className="text-[11px] font-semibold text-slate-700 block">2. Assigned</span>
                            <span className="text-[9px] font-mono text-slate-400 block hidden sm:block">Crew Ready</span>
                          </div>

                          {/* Step 3: En Route */}
                          <div className="space-y-1">
                            <div
                              className={`h-2 rounded-full ${
                                currentStageIdx >= 2 ? 'bg-emerald-500' : 'bg-slate-200'
                              }`}
                            />
                            <span className="text-[11px] font-semibold text-slate-700 block">3. En Route</span>
                            <span className="text-[9px] font-mono text-slate-400 block hidden sm:block">Vehicle Out</span>
                          </div>

                          {/* Step 4: Repairing */}
                          <div className="space-y-1">
                            <div
                              className={`h-2 rounded-full ${
                                currentStageIdx >= 3 ? 'bg-emerald-500' : 'bg-slate-200'
                              }`}
                            />
                            <span className="text-[11px] font-semibold text-slate-700 block">4. Repairing</span>
                            <span className="text-[9px] font-mono text-slate-400 block hidden sm:block">On Site</span>
                          </div>

                          {/* Step 5: Resolved */}
                          <div className="space-y-1">
                            <div
                              className={`h-2 rounded-full ${
                                currentStageIdx >= 4 ? 'bg-emerald-500' : 'bg-slate-200'
                              }`}
                            />
                            <span className="text-[11px] font-semibold text-slate-700 block">5. Restored</span>
                            <span className="text-[9px] font-mono text-slate-400 block hidden sm:block">Energized</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 7. Tab 4: System Alerts & Notifications */}
      {activeTab === 'alerts' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-sm space-y-1">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Bell className="h-5 w-5 text-cyan-600" />
              <span>SMS Dispatches & In-App Alerts</span>
            </h3>
            <p className="text-xs text-slate-500">
              Audit trail of automated notifications sent to your registered telephone number and customer profile.
            </p>
          </div>

          {notifications.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 border border-slate-200/90 text-center space-y-4 shadow-sm">
              <CheckCircle2 className="h-8 w-8 text-slate-400 mx-auto" />
              <h4 className="text-base font-bold text-slate-900">No New Notifications</h4>
              <p className="text-xs text-slate-500">
                You are completely up to date. Schedule publications and field ticket status changes will appear here.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200/90 divide-y divide-slate-100 shadow-sm overflow-hidden">
              {notifications.map((n) => (
                <div key={n.id} className="p-4 sm:p-5 flex items-start gap-3.5 hover:bg-slate-50/50 transition-colors">
                  <div className="p-2 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 shrink-0 mt-0.5">
                    <Bell className="h-4 w-4" />
                  </div>
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-xs sm:text-sm text-slate-900">{n.title}</span>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">
                        {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{n.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 8. National Grid Support Hotline Banner */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 text-white rounded-3xl p-6 sm:p-8 border border-slate-800 shadow-xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="space-y-1">
            <span className="text-xs font-mono font-bold text-amber-400 uppercase tracking-widest block">
              Customer Rights & Grid Safety
            </span>
            <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              24/7 National Electricity Emergency Support
            </h3>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="tel:16116"
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold inline-flex items-center gap-2 transition-all shadow-md"
            >
              <PhoneCall className="h-3.5 w-3.5" />
              <span>CALL 16116 TOLL-FREE</span>
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs text-slate-300">
          <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/80 space-y-2">
            <span className="font-bold font-mono text-amber-400 block text-sm">Law 1: Hospital Immunity</span>
            <p className="text-slate-400 leading-relaxed">
              If your meter is on a feeder line with trauma centers or critical ICUs, it is shielded 100% from algorithmic load shedding.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/80 space-y-2">
            <span className="font-bold font-mono text-cyan-400 block text-sm">Law 2: Anti-Monopoly Rotation</span>
            <p className="text-slate-400 leading-relaxed">
              Distribution operators are prohibited by law from shedding the same residential feeder more than 1 cycle within a 24-hour day.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/80 space-y-2">
            <span className="font-bold font-mono text-purple-400 block text-sm">Cryptographic Audit Trail</span>
            <p className="text-slate-400 leading-relaxed">
              Every schedule publication and manual operator override is immutably hashed into SHA-256 public logs at <Link href="/audit" className="text-amber-400 underline">/audit</Link>.
            </p>
          </div>
        </div>
      </div>

      {/* ================= MODAL 1: REPORT OUTAGE ================= */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-xl w-full p-6 sm:p-8 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-200">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Report Electricity Outage / Fault
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Smart conflict engine validates active load shedding before dispatching emergency crews
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowReportModal(false)}
                className="min-h-[44px] min-w-[44px] rounded-xl inline-flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Smart Conflict Resolution Result Banner */}
            {reportFeedback && (
              <div
                className={`p-4 rounded-2xl text-xs space-y-2 border ${
                  reportFeedback.isPlanned
                    ? 'bg-amber-50 text-amber-950 border-amber-300'
                    : reportFeedback.ticketCreated
                    ? 'bg-emerald-50 text-emerald-950 border-emerald-300'
                    : 'bg-rose-50 text-rose-950 border-rose-300'
                }`}
              >
                <div className="font-bold flex items-center gap-2 text-sm">
                  {reportFeedback.isPlanned ? (
                    <>
                      <Clock className="h-4 w-4 text-amber-700" />
                      <span>Smart Conflict Intercepted: Planned Load Shedding Active</span>
                    </>
                  ) : reportFeedback.ticketCreated ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                      <span>Emergency Fault Ticket Created ({reportFeedback.ticket?.ticketNumber})</span>
                    </>
                  ) : (
                    <span>Notice</span>
                  )}
                </div>

                <p className="leading-relaxed">{reportFeedback.message || reportFeedback.error}</p>

                {reportFeedback.scheduledEndTime && (
                  <p className="font-mono font-bold text-xs pt-1">
                    Expected Line Restoration: {formatSlotTime(reportFeedback.scheduledEndTime)} BST
                  </p>
                )}
              </div>
            )}

            {!reportFeedback?.ticketCreated && (
              <form onSubmit={handleReportSubmit} className="space-y-4">
                {/* Meter Selection */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    Affected Electric Meter
                  </label>
                  <select
                    value={selectedMeterId}
                    onChange={(e) => setSelectedMeterId(e.target.value)}
                    required
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 shadow-sm"
                  >
                    {metersList.map((m) => (
                      <option key={m.meterId} value={m.meterId}>
                        {m.meterNumber} — {m.nickname || m.address || 'Meter'} ({m.feeder?.name || 'Feeder'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Fault Type Radio Cards */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700">
                    Fault Observation / Incident Type
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {FAULT_TYPE_OPTIONS.map((f) => {
                      const IconComp = f.icon;
                      const isSelected = selectedFaultType === f.value;

                      return (
                        <button
                          key={f.value}
                          type="button"
                          onClick={() => setSelectedFaultType(f.value)}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            isSelected
                              ? 'border-amber-500 bg-amber-50/50 ring-1 ring-amber-500'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <IconComp
                              className={`h-4 w-4 ${isSelected ? 'text-amber-600' : 'text-slate-400'}`}
                            />
                            <span className="font-bold text-xs text-slate-900">{f.label}</span>
                          </div>
                          <p className="text-[10px] text-slate-500 leading-tight">{f.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    Description & Observations
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={reportDescription}
                    onChange={(e) => setReportDescription(e.target.value)}
                    placeholder="e.g. Heard a loud electrical pop outside, whole street blackout, sparks on transformer..."
                    className="w-full text-xs p-3 rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                  />
                </div>

                {/* Nearest Landmark */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    Nearest Landmark / Street (For Field Crew)
                  </label>
                  <input
                    type="text"
                    value={reportLandmark}
                    onChange={(e) => setReportLandmark(e.target.value)}
                    placeholder="e.g. Opposite Dhanmondi Lake Gate 3, near City Hospital"
                    className="w-full min-h-[44px] text-xs px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium shadow-sm"
                  />
                </div>

                {/* Modal Actions */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowReportModal(false)}
                    className="min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={submittingReport}
                    className="min-h-[44px] px-5 py-2.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md transition-all active:scale-[0.98] disabled:opacity-60 flex items-center gap-2"
                  >
                    {submittingReport ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        <span>Evaluating Grid State...</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span>Verify & Submit Report</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {reportFeedback?.ticketCreated && (
              <div className="pt-2">
                <button
                  onClick={() => setShowReportModal(false)}
                  className="w-full min-h-[44px] py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all"
                >
                  Close & View Tracking
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= MODAL 2: LINK NEW METER ================= */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 sm:p-8 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-50 text-cyan-700 border border-cyan-200">
                  <Plus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Link Electric Meter</h3>
                  <p className="text-[11px] text-slate-500">Bind digital meter ID to your account</p>
                </div>
              </div>

              <button
                onClick={() => setShowLinkModal(false)}
                className="min-h-[44px] min-w-[44px] rounded-xl inline-flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {linkError && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{linkError}</span>
              </div>
            )}

            <form onSubmit={handleLinkMeterSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Meter Number (e.g. MTR-DHN-101, MTR-MIR-201)
                </label>
                <input
                  type="text"
                  required
                  value={newMeterNumber}
                  onChange={(e) => setNewMeterNumber(e.target.value)}
                  placeholder="MTR-DHN-101"
                  className="w-full min-h-[44px] text-xs font-mono uppercase px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 shadow-sm"
                />
                <span className="text-[10px] text-slate-400 block">
                  Found on your digital prepaid card, meter front faceplate, or electricity bill.
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Premises Nickname (Optional)
                </label>
                <input
                  type="text"
                  value={newMeterNickname}
                  onChange={(e) => setNewMeterNickname(e.target.value)}
                  placeholder="e.g. Home (Floor 4), Corner Grocery Store"
                  className="w-full min-h-[44px] text-xs px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 shadow-sm"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="primaryMeterCheck"
                  checked={newMeterPrimary}
                  onChange={(e) => setNewMeterPrimary(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                />
                <label htmlFor="primaryMeterCheck" className="text-xs text-slate-700 font-medium">
                  Set this meter as my Primary Residence / Premises
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowLinkModal(false)}
                  className="min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={linkingMeter}
                  className="min-h-[44px] px-5 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-md transition-all active:scale-[0.98] disabled:opacity-60 flex items-center gap-2"
                >
                  {linkingMeter ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Verifying Meter...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5" />
                      <span>Link Meter</span>
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
