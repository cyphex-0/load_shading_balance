'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  BarChart2,
  PlusCircle,
  Search,
  RefreshCw,
  TrendingUp,
  Clock,
  Activity,
  Layers,
  X,
  Zap,
  ShieldCheck,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Copy,
  Check,
  Radio,
  FileText,
  Plus,
  HardHat,
  Cpu,
  ArrowRight,
  Filter
} from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { ApiClient } from '../../lib/api';
import { StatusBadge } from '../../components/StatusBadge';
import { getSocket } from '../../lib/socket';

interface DistrictFeeder {
  id: string;
  name: string;
  code: string;
  capacityMW: number;
  isCritical: boolean;
  status: string;
  substationId?: string;
  substationName?: string;
  zoneId?: string;
  zoneName?: string;
  openTicketsCount: number;
  totalMetersCount?: number;
}

interface FeederFailureRateItem {
  feederId: string;
  feederName: string;
  feederCode: string;
  faultCount: number;
}

interface TechnicianMttrItem {
  technicianId: string;
  technicianName: string;
  ticketCount: number;
  avgResolutionMinutes: number;
}

interface UpgradeRequestItem {
  id: string;
  feederId: string;
  feederName: string;
  reason: string;
  proposedAction: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  adminNotes?: string | null;
  createdAt: string;
}

type ManagerTab = 'grid' | 'analytics' | 'requests';
type FeederStatusFilter = 'ALL' | 'ONLINE' | 'PLANNED_OUTAGE' | 'UNEXPECTED_FAULT' | 'CRITICAL';

export default function ZoneManagerPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  // Primary Data State
  const [dashboard, setDashboard] = useState<any>(null);
  const [failureAnalytics, setFailureAnalytics] = useState<FeederFailureRateItem[]>([]);
  const [technicianAnalytics, setTechnicianAnalytics] = useState<TechnicianMttrItem[]>([]);
  const [upgradeRequests, setUpgradeRequests] = useState<UpgradeRequestItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Active Tab & Filter State
  const [activeTab, setActiveTab] = useState<ManagerTab>('grid');
  const [statusFilter, setStatusFilter] = useState<FeederStatusFilter>('ALL');
  const [search, setSearch] = useState<string>('');

  // Upgrade Petition Modal State
  const [showUpgradeModal, setShowUpgradeModal] = useState<boolean>(false);
  const [selectedFeederId, setSelectedFeederId] = useState<string>('');
  const [upgradeReason, setUpgradeReason] = useState<string>('');
  const [proposedAction, setProposedAction] = useState<string>('');
  const [submittingUpgrade, setSubmittingUpgrade] = useState<boolean>(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

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

  // Fetch all zone oversight data
  const fetchData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      const [dashRes, failRes, techRes, reqRes] = await Promise.all([
        ApiClient.get(`/api/zone-managers/me/dashboard`),
        ApiClient.get('/api/zone-managers/me/analytics/feeder-failure-rate'),
        ApiClient.get('/api/zone-managers/me/analytics/avg-resolution-time'),
        ApiClient.get('/api/infrastructure-requests')
      ]);

      if (dashRes.success && dashRes.data) setDashboard(dashRes.data);
      if (failRes.success && Array.isArray(failRes.data)) setFailureAnalytics(failRes.data);
      if (techRes.success && Array.isArray(techRes.data)) setTechnicianAnalytics(techRes.data);
      if (reqRes.success && Array.isArray(reqRes.data)) setUpgradeRequests(reqRes.data);
    } catch {
      // Graceful error state
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!authLoading && (!user || (user.role !== 'ZONE_MANAGER' && user.role !== 'ADMIN'))) {
      router.push('/login');
      return;
    }

    if (user) {
      fetchData();

      const socket = getSocket();
      setSocketConnected(socket.connected);

      const onConnect = () => setSocketConnected(true);
      const onDisconnect = () => setSocketConnected(false);
      const onFeederChanged = () => fetchData(true);
      const onTicketChanged = () => fetchData(true);

      socket.on('connect', onConnect);
      socket.on('disconnect', onDisconnect);
      socket.on('feeder:status_changed', onFeederChanged);
      socket.on('ticket:status_changed', onTicketChanged);

      return () => {
        socket.off('connect', onConnect);
        socket.off('disconnect', onDisconnect);
        socket.off('feeder:status_changed', onFeederChanged);
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

  // Submit Upgrade Petition
  const handleUpgradeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFeederId || !upgradeReason.trim() || !proposedAction.trim()) return;

    setSubmittingUpgrade(true);
    setUpgradeError(null);

    const res = await ApiClient.post('/api/infrastructure-requests', {
      feederId: selectedFeederId,
      reason: upgradeReason.trim(),
      proposedAction: proposedAction.trim(),
      supportingMetrics: {
        requestedByManager: user?.name,
        timestamp: new Date().toISOString()
      }
    });

    setSubmittingUpgrade(false);

    if (res.success) {
      setShowUpgradeModal(false);
      setSelectedFeederId('');
      setUpgradeReason('');
      setProposedAction('');
      fetchData(true);
    } else {
      setUpgradeError(res.error?.message || 'Failed to submit upgrade petition');
    }
  };

  const feeders: DistrictFeeder[] = dashboard?.feeders || [];

  // Filtered Feeders List
  const filteredFeeders = useMemo(() => {
    return feeders.filter((f) => {
      // Search filter
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesName = f.name.toLowerCase().includes(query);
        const matchesCode = f.code.toLowerCase().includes(query);
        const matchesSub = (f.substationName || '').toLowerCase().includes(query);
        if (!matchesName && !matchesCode && !matchesSub) return false;
      }

      // Status filter
      if (statusFilter === 'ONLINE') return f.status === 'ONLINE';
      if (statusFilter === 'PLANNED_OUTAGE') return f.status === 'PLANNED_OUTAGE';
      if (statusFilter === 'UNEXPECTED_FAULT') return f.status === 'UNEXPECTED_FAULT';
      if (statusFilter === 'CRITICAL') return f.isCritical;

      return true;
    });
  }, [feeders, search, statusFilter]);

  // Aggregate Metrics
  const totalCapacityMW = feeders.reduce((acc, f) => acc + (f.capacityMW || 0), 0);
  const onlineFeedersCount = feeders.filter((f) => f.status === 'ONLINE').length;
  const criticalHospitalCount = feeders.filter((f) => f.isCritical).length;
  const activeFaultsCount = feeders.filter((f) => f.status === 'UNEXPECTED_FAULT' || f.openTicketsCount > 0).length;
  const pendingRequestsCount = upgradeRequests.filter((r) => r.status === 'PENDING').length;

  // Average District MTTR
  const avgDistrictMttr = useMemo(() => {
    if (technicianAnalytics.length === 0) return 38;
    const valid = technicianAnalytics.filter((t) => t.avgResolutionMinutes > 0);
    if (valid.length === 0) return 38;
    const sum = valid.reduce((acc, t) => acc + t.avgResolutionMinutes, 0);
    return Math.round(sum / valid.length);
  }, [technicianAnalytics]);

  if (authLoading || loading) {
    return (
      <div className="py-24 text-center space-y-4">
        <div className="inline-block h-10 w-10 animate-spin rounded-full border-3 border-solid border-cyan-600 border-r-transparent" />
        <div className="space-y-1">
          <p className="text-sm font-mono font-bold text-slate-800">CONNECTING TO DISTRICT OVERSIGHT TELEMETRY...</p>
          <p className="text-xs text-slate-500">Retrieving feeder matrix, crew MTTR, and capital petitions...</p>
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
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-cyan-50 text-cyan-800 border border-cyan-200">
              <span className={`h-2 w-2 rounded-full bg-cyan-600 ${socketConnected ? 'animate-telemetry-pulse' : ''}`} />
              DISTRICT TELEMETRY STREAM
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              <BarChart2 className="h-3 w-3 text-slate-500" />
              REGIONAL GRID OVERSIGHT HUD
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-purple-50 text-purple-700 border border-purple-200">
              <Building2 className="h-3 w-3 text-purple-600" />
              INFRASTRUCTURE GOVERNANCE
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
            <Cpu className="h-7 w-7 text-cyan-700 shrink-0" />
            <span>Zone District Manager Command HUD</span>
          </h1>

          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            Jurisdiction: <strong className="text-slate-900">{dashboard?.zone?.name || 'All Scoped Metropolitan Districts'}</strong> ({dashboard?.zone?.code || 'METRO'}) · Continuous feeder health monitoring, crew MTTR analytics, and capital upgrade petitions.
          </p>
        </div>

        {/* Masthead Live Clock & Actions */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 shadow-sm text-xs font-mono text-slate-700">
            <Radio className="h-3.5 w-3.5 text-cyan-600 animate-pulse" />
            <span className="text-slate-400 font-sans font-medium">BST:</span>
            <span className="font-bold text-slate-900 font-mono-numbers">{currentTimeBST || '--:--:--'}</span>
          </div>

          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-mono font-semibold inline-flex items-center gap-1.5 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-cyan-500/20 active:scale-[0.98] disabled:opacity-60"
            title="Refresh district telemetry"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-cyan-700 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'SYNCING...' : 'REFRESH'}</span>
          </button>

          <button
            onClick={() => {
              setUpgradeError(null);
              setShowUpgradeModal(true);
            }}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-cyan-700 hover:bg-cyan-800 text-white font-bold text-xs shadow-md inline-flex items-center gap-2 transition-all active:scale-[0.98]"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Petition Upgrade</span>
          </button>
        </div>
      </div>

      {/* 2. District Telemetry Bento Overview Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Feeder Health & Online Ratio */}
        <div className="clean-card clean-card-hover p-4 sm:p-5 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-cyan-600" />
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span className="font-mono uppercase font-semibold">Feeder Transmission</span>
            <Activity className="h-4 w-4 text-cyan-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono-numbers">
              {onlineFeedersCount}
            </span>
            <span className="text-xs text-slate-500 font-mono">/ {feeders.length} online</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Energized Ratio:</span>
            <span className="font-mono font-bold text-cyan-800">
              {feeders.length > 0 ? Math.round((onlineFeedersCount / feeders.length) * 100) : 100}%
            </span>
          </div>
        </div>

        {/* Card 2: Total Monitored Capacity */}
        <div className="clean-card clean-card-hover p-4 sm:p-5 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span className="font-mono uppercase font-semibold">District Capacity</span>
            <Zap className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono-numbers">
              {totalCapacityMW.toFixed(1)}
            </span>
            <span className="text-xs text-slate-500 font-mono">MW</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Hospital Lines (Law 1):</span>
            <strong className="font-mono text-purple-700">{criticalHospitalCount} Shielded</strong>
          </div>
        </div>

        {/* Card 3: Mean Time to Repair (MTTR) */}
        <div className="clean-card clean-card-hover p-4 sm:p-5 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span className="font-mono uppercase font-semibold">District Avg MTTR</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono-numbers">
              {avgDistrictMttr}
            </span>
            <span className="text-xs text-slate-500 font-mono">mins</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Roster Performance:</span>
            <span className="font-mono text-amber-700 font-semibold">NOMINAL</span>
          </div>
        </div>

        {/* Card 4: Capital Upgrade Petitions */}
        <div className="clean-card clean-card-hover p-4 sm:p-5 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-purple-500" />
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span className="font-mono uppercase font-semibold">Capital Petitions</span>
            <Layers className="h-4 w-4 text-purple-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono-numbers">
              {upgradeRequests.length}
            </span>
            <span className="text-xs text-slate-500 font-mono">proposals</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Awaiting Review:</span>
            <strong className="font-mono text-purple-800">{pendingRequestsCount} Pending</strong>
          </div>
        </div>
      </div>

      {/* 3. Command Console Navigation Tabs */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200/90 shadow-sm flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setActiveTab('grid')}
            className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'grid'
                ? 'bg-slate-900 text-white shadow-sm font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Activity className="h-3.5 w-3.5 text-cyan-400" />
            <span>District Feeder Matrix ({feeders.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'analytics'
                ? 'bg-slate-900 text-white shadow-sm font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5 text-rose-500" />
            <span>Failure Frequency & Crew MTTR</span>
          </button>

          <button
            onClick={() => setActiveTab('requests')}
            className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'requests'
                ? 'bg-slate-900 text-white shadow-sm font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Layers className="h-3.5 w-3.5 text-purple-400" />
            <span>Infrastructure Petitions ({upgradeRequests.length})</span>
          </button>
        </div>

        <div className="px-3 py-1 text-[11px] font-mono text-slate-500 hidden sm:block">
          SECTOR: <strong className="text-cyan-900">{dashboard?.zone?.code || 'METRO'}</strong>
        </div>
      </div>

      {/* 4. Tab 1: District Feeder Matrix */}
      {activeTab === 'grid' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <Activity className="h-5 w-5 text-cyan-700" />
                  <span>Substation & Distribution Feeder Telemetry</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Real-time status, line capacity, and open outage tickets across scoped substations.
                </p>
              </div>

              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-3 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search feeder name or code..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="min-h-[42px] pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 shadow-sm w-60 sm:w-72"
                />
              </div>
            </div>

            {/* Filter Chips */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setStatusFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    statusFilter === 'ALL'
                      ? 'bg-slate-900 text-white font-semibold'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  All Lines ({feeders.length})
                </button>

                <button
                  onClick={() => setStatusFilter('ONLINE')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    statusFilter === 'ONLINE'
                      ? 'bg-emerald-600 text-white font-bold'
                      : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  Online Normal ({feeders.filter((f) => f.status === 'ONLINE').length})
                </button>

                <button
                  onClick={() => setStatusFilter('PLANNED_OUTAGE')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    statusFilter === 'PLANNED_OUTAGE'
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  Planned Shedding ({feeders.filter((f) => f.status === 'PLANNED_OUTAGE').length})
                </button>

                <button
                  onClick={() => setStatusFilter('UNEXPECTED_FAULT')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    statusFilter === 'UNEXPECTED_FAULT'
                      ? 'bg-rose-600 text-white font-bold'
                      : 'bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100'
                  }`}
                >
                  Emergency Fault ({feeders.filter((f) => f.status === 'UNEXPECTED_FAULT').length})
                </button>

                <button
                  onClick={() => setStatusFilter('CRITICAL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    statusFilter === 'CRITICAL'
                      ? 'bg-purple-600 text-white font-bold'
                      : 'bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100'
                  }`}
                >
                  Hospital Shielded ({criticalHospitalCount})
                </button>
              </div>

              <span className="font-mono text-[11px] text-slate-500">
                SHOWING <strong className="text-slate-800">{filteredFeeders.length}</strong> LINES
              </span>
            </div>
          </div>

          {/* Feeders Matrix Table */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 font-mono text-slate-600 uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3.5 px-4 font-semibold">Feeder Identification</th>
                    <th className="py-3.5 px-4 font-semibold">Substation</th>
                    <th className="py-3.5 px-4 font-semibold">Line Capacity</th>
                    <th className="py-3.5 px-4 font-semibold">Transmission State</th>
                    <th className="py-3.5 px-4 font-semibold">Active Outages</th>
                    <th className="py-3.5 px-4 font-semibold">Law 1 Shielding</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                  {filteredFeeders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-500 font-mono text-xs">
                        <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto mb-2" />
                        No matching feeder lines found in this district.
                      </td>
                    </tr>
                  ) : (
                    filteredFeeders.map((f) => (
                      <tr key={f.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900 text-sm">{f.name}</div>
                          <div className="flex items-center gap-1 font-mono text-[11px] text-cyan-800 font-semibold pt-0.5">
                            <span>{f.code}</span>
                            <button
                              onClick={() => handleCopy(f.code)}
                              className="p-0.5 text-slate-400 hover:text-slate-700"
                              title="Copy feeder code"
                            >
                              {copiedCode === f.code ? (
                                <Check className="h-3 w-3 text-emerald-600" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-slate-600">
                          {f.substationName || 'Primary Substation'}
                        </td>

                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                          {f.capacityMW} MW
                        </td>

                        <td className="py-3.5 px-4">
                          <StatusBadge status={f.status} size="sm" />
                        </td>

                        <td className="py-3.5 px-4">
                          {f.openTicketsCount > 0 ? (
                            <span className="font-mono font-bold text-rose-800 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded text-[11px]">
                              {f.openTicketsCount} ACTIVE
                            </span>
                          ) : (
                            <span className="text-slate-400 font-mono text-[11px]">0</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          {f.isCritical ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-purple-800 bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-200">
                              <ShieldCheck className="h-3 w-3 text-purple-600" />
                              SHIELDED
                            </span>
                          ) : (
                            <span className="text-slate-500 font-mono text-[11px]">Standard</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => {
                              setSelectedFeederId(f.id);
                              setShowUpgradeModal(true);
                            }}
                            className="min-h-[34px] px-3 py-1 rounded-lg bg-slate-100 hover:bg-cyan-50 hover:text-cyan-800 text-slate-700 font-semibold text-xs border border-slate-200 transition-colors inline-flex items-center gap-1"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            <span>Petition</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 5. Tab 2: Failure Frequency & Crew MTTR Analytics */}
      {activeTab === 'analytics' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Feeder Failure Rate */}
          <div className="bg-white rounded-3xl p-6 sm:p-7 space-y-5 border border-slate-200/90 shadow-sm">
            <div className="border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-rose-600" />
                <h3 className="font-extrabold text-slate-900 text-base">
                  Chronic Feeder Failure Frequency (Worst Lines First)
                </h3>
              </div>
              <p className="text-xs text-slate-500 pt-1">
                Identifies recurring transformer burnout and overloaded lines requiring capital equipment replacement.
              </p>
            </div>

            <div className="space-y-4">
              {failureAnalytics.length === 0 ? (
                <div className="py-8 text-center text-xs font-mono text-slate-500">
                  No breakdown incidents recorded in this district.
                </div>
              ) : (
                failureAnalytics.map((item, idx) => {
                  const faultCount = item.faultCount || 0;
                  const isHighRisk = faultCount >= 5;

                  return (
                    <div key={item.feederId || idx} className="p-3.5 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-500">#{idx + 1}</span>
                          <span className="text-slate-900 font-bold">
                            {item.feederName}
                          </span>
                          <span className="font-mono text-[10px] text-cyan-800 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                            {item.feederCode}
                          </span>
                        </div>

                        <span
                          className={`font-mono font-bold text-xs px-2.5 py-0.5 rounded-full border ${
                            isHighRisk
                              ? 'bg-rose-50 text-rose-800 border-rose-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}
                        >
                          {faultCount} Outages
                        </span>
                      </div>

                      <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            isHighRisk ? 'bg-rose-600' : 'bg-amber-500'
                          }`}
                          style={{ width: `${Math.min(100, (faultCount / 10) * 100)}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                        <span>Risk Tier: {isHighRisk ? 'HIGH RISK HOTSPOT' : 'ELEVATED VULNERABILITY'}</span>
                        <button
                          onClick={() => {
                            setSelectedFeederId(item.feederId);
                            setUpgradeReason(`Chronic transformer burnout: Feeder experienced ${faultCount} unplanned breakdowns`);
                            setShowUpgradeModal(true);
                          }}
                          className="text-cyan-700 hover:underline font-bold"
                        >
                          Petition Upgrade →
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Average Resolution Time (MTTR) per Field Crew */}
          <div className="bg-white rounded-3xl p-6 sm:p-7 space-y-5 border border-slate-200/90 shadow-sm">
            <div className="border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-cyan-700" />
                <h3 className="font-extrabold text-slate-900 text-base">
                  Mean Time to Repair (MTTR) by Field Crew
                </h3>
              </div>
              <p className="text-xs text-slate-500 pt-1">
                Turnaround efficiency benchmarked from technician acceptance to verified line re-energization.
              </p>
            </div>

            <div className="divide-y divide-slate-100">
              {technicianAnalytics.length === 0 ? (
                <div className="py-8 text-center text-xs font-mono text-slate-500">
                  No repair resolution metrics recorded yet for this district roster.
                </div>
              ) : (
                technicianAnalytics.map((tech) => (
                  <div key={tech.technicianId} className="py-4 flex items-center justify-between text-xs">
                    <div className="space-y-0.5">
                      <span className="font-bold text-slate-900 text-sm block">{tech.technicianName}</span>
                      <p className="text-[11px] text-slate-500 font-mono">
                        {tech.ticketCount} total repairs resolved
                      </p>
                    </div>

                    <div className="text-right space-y-1">
                      <span className="font-mono font-bold text-cyan-900 bg-cyan-50 px-3 py-1 rounded-xl border border-cyan-200 text-xs inline-block">
                        {tech.avgResolutionMinutes > 0 ? `${tech.avgResolutionMinutes} mins` : 'Pending'}
                      </span>
                      <span className="block text-[10px] font-mono text-slate-400">Average MTTR</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. Tab 3: Infrastructure Petitions */}
      {activeTab === 'requests' && (
        <div className="bg-white rounded-3xl p-6 sm:p-7 space-y-6 border border-slate-200/90 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="space-y-1">
              <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                <Layers className="h-5 w-5 text-purple-600" />
                <span>Submitted District Upgrade Petitions</span>
              </h3>
              <p className="text-xs text-slate-500">
                Official engineering proposals for capital substation expansions, transformer upgrades, and feeder bifurcation.
              </p>
            </div>

            <button
              onClick={() => setShowUpgradeModal(true)}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-cyan-700 hover:bg-cyan-800 text-white font-bold text-xs shadow-sm inline-flex items-center gap-1.5 transition-colors self-start sm:self-auto shrink-0"
            >
              <PlusCircle className="h-4 w-4" />
              <span>Submit New Petition</span>
            </button>
          </div>

          <div className="space-y-4">
            {upgradeRequests.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs font-mono border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                No infrastructure upgrade petitions submitted yet for this district.
              </div>
            ) : (
              upgradeRequests.map((req) => (
                <div
                  key={req.id}
                  className="p-5 rounded-2xl border border-slate-200/90 bg-white space-y-3.5 shadow-sm clean-card-hover"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">{req.feederName}</span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {new Date(req.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>

                    <span
                      className={`px-3 py-1 rounded-full font-mono font-bold text-[11px] border self-start sm:self-auto ${
                        req.status === 'APPROVED'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : req.status === 'REJECTED'
                          ? 'bg-rose-50 text-rose-800 border-rose-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}
                    >
                      {req.status === 'APPROVED' && 'APPROVED BY ADMIN'}
                      {req.status === 'REJECTED' && 'REJECTED'}
                      {req.status === 'PENDING' && 'PENDING ADMIN GOVERNANCE'}
                    </span>
                  </div>

                  <div className="text-xs space-y-2 text-slate-700">
                    <p className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <strong className="text-slate-900 block mb-0.5">Engineering Justification:</strong>
                      {req.reason}
                    </p>
                    <p className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <strong className="text-slate-900 block mb-0.5">Proposed Technical Solution:</strong>
                      {req.proposedAction}
                    </p>

                    {req.adminNotes && (
                      <div className="bg-blue-50 p-3 rounded-xl border border-blue-200 text-blue-950">
                        <strong className="block mb-0.5">National Grid Administration Remark:</strong>
                        {req.adminNotes}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ================= MODAL: PETITION INFRASTRUCTURE UPGRADE ================= */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 sm:p-8 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-50 text-cyan-700 border border-cyan-200">
                  <PlusCircle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Petition Feeder Infrastructure Upgrade
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Submit capital engineering proposal to National Administration
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowUpgradeModal(false)}
                className="min-h-[44px] min-w-[44px] rounded-xl inline-flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {upgradeError && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{upgradeError}</span>
              </div>
            )}

            <form onSubmit={handleUpgradeSubmit} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700">Target Distribution Feeder</label>
                <select
                  required
                  value={selectedFeederId}
                  onChange={(e) => setSelectedFeederId(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 shadow-sm"
                >
                  <option value="">-- Select Feeder Circuit --</option>
                  {feeders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.code}) — {f.capacityMW} MW
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700">Engineering Justification</label>
                <textarea
                  required
                  rows={3}
                  value={upgradeReason}
                  onChange={(e) => setUpgradeReason(e.target.value)}
                  placeholder="e.g. Chronic transformer burnout due to high industrial air conditioning load; 7 unplanned trips recorded this month..."
                  className="w-full p-3 rounded-xl border border-slate-300 bg-white text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 shadow-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700">Proposed Engineering Solution</label>
                <textarea
                  required
                  rows={3}
                  value={proposedAction}
                  onChange={(e) => setProposedAction(e.target.value)}
                  placeholder="e.g. Upgrade pole transformer rating from 200kVA to 400kVA, bifurcate feeder line into dual circuits..."
                  className="w-full p-3 rounded-xl border border-slate-300 bg-white text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 shadow-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowUpgradeModal(false)}
                  className="min-h-[44px] px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={submittingUpgrade || !selectedFeederId || !upgradeReason.trim() || !proposedAction.trim()}
                  className="min-h-[44px] px-5 py-2.5 font-bold text-white bg-cyan-700 hover:bg-cyan-800 rounded-xl shadow-md transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-2"
                >
                  {submittingUpgrade ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Submitting Petition...</span>
                    </>
                  ) : (
                    <>
                      <PlusCircle className="h-3.5 w-3.5" />
                      <span>Submit Proposal to Admin</span>
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
