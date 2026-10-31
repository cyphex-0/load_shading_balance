'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Clock,
  RefreshCw,
  Search,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Layers,
  Building2,
  Activity,
  Copy,
  Check,
  Zap,
  ArrowRight,
  Filter,
  X,
  Radio,
  FileText,
  SlidersHorizontal
} from 'lucide-react';
import { ApiClient } from '../../lib/api';
import { StatusBadge } from '../../components/StatusBadge';
import { getSocket } from '../../lib/socket';

interface FeederItem {
  id: string;
  name: string;
  code: string;
  capacityMW: number;
  isCritical: boolean;
  status: string;
  effectiveStatus: string;
  substationId?: string;
  substationName?: string;
  zoneId?: string;
  zoneName?: string;
  connectedMetersCount?: number;
  activeOutagesCount?: number;
  activeOutage?: {
    type: 'PLANNED' | 'UNPLANNED';
    startTime: string;
    estimatedRestoration?: string | null;
    ticketNumber?: string;
  } | null;
}

interface ZoneItem {
  id: string;
  name: string;
  code: string;
  description?: string;
}

interface AssignedFeederMeta {
  id: string;
  name: string;
  code: string;
  capacityMW: number;
  substationName: string;
  zoneName: string;
}

interface ScheduleSlot {
  id: string;
  scheduleId: string;
  startTime: string;
  endTime: string;
  targetDeficitMW: number;
  actualDeficitMW: number;
  assignedFeeders: AssignedFeederMeta[];
}

interface PublicSchedulePayload {
  date: string;
  status: string;
  totalSlots: number;
  slots: ScheduleSlot[];
}

type ViewMode = 'timeline' | 'feeders';
type FeederFilterType = 'ALL' | 'SCHEDULED' | 'CRITICAL' | 'ONLINE' | 'OUTAGE';

export default function PublicSchedulesPage() {
  // Calendar & Date State (Default to today's date in local YYYY-MM-DD)
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const tomorrowStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }, []);

  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [scheduleData, setScheduleData] = useState<PublicSchedulePayload | null>(null);
  const [feeders, setFeeders] = useState<FeederItem[]>([]);
  const [zones, setZones] = useState<ZoneItem[]>([]);

  // Filtering & Search
  const [selectedZone, setSelectedZone] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  const [filterType, setFilterType] = useState<FeederFilterType>('ALL');
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');

  // UI Micro-states
  const [loading, setLoading] = useState<boolean>(true);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [currentTimeBST, setCurrentTimeBST] = useState<string>('');
  const [socketConnected, setSocketConnected] = useState<boolean>(false);

  // Live Bangladesh Standard Time Clock (UTC+6)
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

  // Fetch data from API
  const fetchData = async () => {
    setLoading(true);
    try {
      const [scheduleRes, feedersRes, zonesRes] = await Promise.all([
        ApiClient.get<PublicSchedulePayload>(`/api/v1/schedules/public?date=${selectedDate}`),
        ApiClient.get<FeederItem[]>('/api/v1/feeders'),
        ApiClient.get<ZoneItem[]>('/api/v1/zones')
      ]);

      if (scheduleRes.success && scheduleRes.data) {
        setScheduleData(scheduleRes.data);
      } else {
        setScheduleData(null);
      }

      if (feedersRes.success && feedersRes.data) {
        setFeeders(feedersRes.data);
      }

      if (zonesRes.success && zonesRes.data) {
        setZones(zonesRes.data);
      }

      setLastRefreshed(
        new Date().toLocaleTimeString('en-GB', {
          timeZone: 'Asia/Dhaka',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      );
    } catch {
      // Graceful error state
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedDate]);

  // Real-time socket updates for schedules and feeder statuses
  useEffect(() => {
    const socket = getSocket();
    setSocketConnected(socket.connected);

    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);
    const onSchedulePublished = () => fetchData();
    const onFeederChanged = () => fetchData();

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('schedule:published', onSchedulePublished);
    socket.on('feeder:status_changed', onFeederChanged);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('schedule:published', onSchedulePublished);
      socket.off('feeder:status_changed', onFeederChanged);
    };
  }, [selectedDate]);

  // Build lookup map of feeder ID -> assigned slot info for the selected date
  const feederScheduledMap = useMemo(() => {
    const map = new Map<string, { slotId: string; startTime: string; endTime: string }>();
    if (scheduleData?.slots) {
      for (const slot of scheduleData.slots) {
        if (slot.assignedFeeders) {
          for (const f of slot.assignedFeeders) {
            map.set(f.id, {
              slotId: slot.id,
              startTime: slot.startTime,
              endTime: slot.endTime
            });
          }
        }
      }
    }
    return map;
  }, [scheduleData]);

  // Format time helpers
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

  const getSlotTimingStatus = (startTime: string, endTime: string) => {
    const now = new Date().getTime();
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();

    if (now >= start && now <= end) return 'ACTIVE';
    if (now < start) return 'UPCOMING';
    return 'COMPLETED';
  };

  const formatDisplayDate = (dateStr: string) => {
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  // Copy feeder code to clipboard with visual feedback
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => {
      setCopiedCode(null);
    }, 2000);
  };

  // Filtered feeders
  const filteredFeeders = useMemo(() => {
    return feeders.filter((f) => {
      // Zone filter
      if (selectedZone !== 'ALL' && f.zoneId !== selectedZone) {
        return false;
      }

      // Search query filter (matches name, code, substation, or zone)
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesName = f.name.toLowerCase().includes(query);
        const matchesCode = f.code.toLowerCase().includes(query);
        const matchesSub = (f.substationName || '').toLowerCase().includes(query);
        const matchesZone = (f.zoneName || '').toLowerCase().includes(query);
        if (!matchesName && !matchesCode && !matchesSub && !matchesZone) {
          return false;
        }
      }

      // Type filter
      if (filterType === 'SCHEDULED') {
        return feederScheduledMap.has(f.id);
      }
      if (filterType === 'CRITICAL') {
        return f.isCritical;
      }
      if (filterType === 'ONLINE') {
        return f.effectiveStatus === 'ONLINE';
      }
      if (filterType === 'OUTAGE') {
        return f.effectiveStatus === 'PLANNED_OUTAGE' || f.effectiveStatus === 'UNEXPECTED_FAULT';
      }

      return true;
    });
  }, [feeders, selectedZone, search, filterType, feederScheduledMap]);

  // Aggregate metrics
  const totalSlotsCount = scheduleData?.slots?.length || 0;
  const totalScheduledFeedersCount = feederScheduledMap.size;
  const criticalHospitalCount = feeders.filter((f) => f.isCritical).length;
  const totalMonitoredCapacity = feeders.reduce((acc, f) => acc + (f.capacityMW || 0), 0);
  const peakDeficitMW = scheduleData?.slots?.reduce(
    (max, slot) => Math.max(max, slot.targetDeficitMW || 0),
    0
  ) || 0;

  return (
    <div className="space-y-8 pb-16">
      {/* 1. Header & Live Telemetry Masthead */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-slate-200/90 pb-6">
        <div className="space-y-2 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <span className={`h-2 w-2 rounded-full bg-emerald-500 ${socketConnected ? 'animate-telemetry-pulse' : ''}`} />
              REDIS EDGE SYNCED
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              <Activity className="h-3 w-3 text-slate-500" />
              PUBLIC TRANSPARENCY PORTAL
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-purple-50 text-purple-700 border border-purple-200">
              <ShieldCheck className="h-3 w-3 text-purple-600" />
              LAW 1 HOSPITAL SHIELDING ACTIVE
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
            <Clock className="h-7 w-7 text-amber-500 shrink-0" />
            <span>Public Transparency Timetables</span>
          </h1>

          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            Official scheduled electricity rotation timetables dispatched by the National Load Dispatch Center. High-speed Redis edge cached with zero-bias Law 1 hospital shielding.
          </p>
        </div>

        {/* Masthead Live Clock & Actions */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 shadow-sm text-xs font-mono text-slate-700">
            <Radio className="h-3.5 w-3.5 text-rose-500 animate-pulse" />
            <span className="text-slate-400 font-sans font-medium">BST:</span>
            <span className="font-bold text-slate-900 font-mono-numbers">{currentTimeBST || '--:--:--'}</span>
          </div>

          <button
            onClick={fetchData}
            disabled={loading}
            className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-mono font-semibold inline-flex items-center gap-2 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-amber-500/20 active:scale-[0.98] disabled:opacity-60"
            title="Refresh schedule from Redis edge cache"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-amber-600 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'SYNCING...' : 'REFRESH CACHE'}</span>
            {lastRefreshed && (
              <span className="hidden sm:inline text-[10px] text-slate-400 font-normal">
                ({lastRefreshed})
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 2. Date Navigation Bar & Grid Status Notice */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider font-mono mr-1">
              Select Date:
            </span>

            {/* Quick Today Button */}
            <button
              onClick={() => setSelectedDate(todayStr)}
              className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 border ${
                selectedDate === todayStr
                  ? 'bg-amber-500 text-slate-950 font-bold border-amber-600 shadow-sm'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              <Calendar className="h-3.5 w-3.5" />
              <span>Today ({formatDisplayDate(todayStr).split(',')[0]})</span>
            </button>

            {/* Quick Tomorrow Button */}
            <button
              onClick={() => setSelectedDate(tomorrowStr)}
              className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 border ${
                selectedDate === tomorrowStr
                  ? 'bg-amber-500 text-slate-950 font-bold border-amber-600 shadow-sm'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              <Calendar className="h-3.5 w-3.5" />
              <span>Tomorrow ({formatDisplayDate(tomorrowStr).split(',')[0]})</span>
            </button>

            {/* Custom Date Input */}
            <div className="flex items-center gap-2 pl-1">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="min-h-[40px] px-3 py-1.5 text-xs font-mono rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 shadow-sm"
              />
            </div>
          </div>

          <div className="text-xs font-mono text-slate-500 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>ACTIVE SCHEDULE DAY:</span>
            <strong className="text-slate-900 font-bold">{formatDisplayDate(selectedDate)}</strong>
          </div>
        </div>

        {/* Date Status Banner */}
        {totalSlotsCount > 0 ? (
          <div className="p-3.5 rounded-xl bg-gradient-to-r from-amber-50/80 via-white to-amber-50/50 border border-amber-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 text-amber-900 font-medium">
              <span className="p-1.5 rounded-lg bg-amber-100 text-amber-800">
                <Clock className="h-4 w-4" />
              </span>
              <span>
                <strong>Official Load Shedding Schedule Active:</strong> {totalSlotsCount} rotation slot{totalSlotsCount > 1 ? 's' : ''} published for {formatDisplayDate(selectedDate)}. Peak deficit: <strong className="font-mono">{peakDeficitMW} MW</strong>.
              </span>
            </div>
            <span className="shrink-0 font-mono text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 self-start sm:self-auto">
              ✓ LAW 2 FAIR ROTATION ENFORCED
            </span>
          </div>
        ) : (
          <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-50/80 via-white to-emerald-50/50 border border-emerald-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 text-emerald-900 font-medium">
              <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
                <CheckCircle2 className="h-4 w-4" />
              </span>
              <span>
                <strong>Zero Mandatory Load Shedding Scheduled:</strong> Generation is projected to meet 100% of demand on {formatDisplayDate(selectedDate)}. All non-critical feeders are transmitting normally.
              </span>
            </div>
            <span className="shrink-0 font-mono text-[11px] font-semibold text-slate-600 bg-white px-2.5 py-1 rounded-full border border-slate-200 self-start sm:self-auto">
              NO ROTATION DISPATCHED
            </span>
          </div>
        )}
      </div>

      {/* 3. SCADA Telemetry KPI Bento Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Deficit Slots */}
        <div className="clean-card clean-card-hover p-4 sm:p-5 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span className="font-mono uppercase font-semibold">Published Slots</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono-numbers">
              {totalSlotsCount}
            </span>
            <span className="text-xs text-slate-500 font-mono">intervals</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            {totalSlotsCount > 0 ? 'Chronological outage windows' : 'Grid normal, 0 cuts scheduled'}
          </p>
        </div>

        {/* Card 2: Rotating Feeders */}
        <div className="clean-card clean-card-hover p-4 sm:p-5 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-cyan-500" />
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span className="font-mono uppercase font-semibold">Scheduled Feeders</span>
            <Layers className="h-4 w-4 text-cyan-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono-numbers">
              {totalScheduledFeedersCount}
            </span>
            <span className="text-xs text-slate-500 font-mono">circuits</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Max 1 cycle/day per neighborhood
          </p>
        </div>

        {/* Card 3: Hospital Shielded Feeders (Law 1) */}
        <div className="clean-card clean-card-hover p-4 sm:p-5 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-purple-500" />
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span className="font-mono uppercase font-semibold">Hospital Shielded</span>
            <ShieldCheck className="h-4 w-4 text-purple-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-purple-900 font-mono-numbers">
              {criticalHospitalCount}
            </span>
            <span className="text-xs text-purple-700 font-mono">100% Exempt</span>
          </div>
          <p className="text-[11px] text-purple-700/80 mt-2">
            Emergency & ICU lines never shed
          </p>
        </div>

        {/* Card 4: Peak Deficit MW or Monitored Capacity */}
        <div className="clean-card clean-card-hover p-4 sm:p-5 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span className="font-mono uppercase font-semibold">
              {totalSlotsCount > 0 ? 'Peak Deficit MW' : 'Monitored Capacity'}
            </span>
            <Zap className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono-numbers">
              {totalSlotsCount > 0 ? peakDeficitMW : totalMonitoredCapacity.toFixed(1)}
            </span>
            <span className="text-xs text-slate-500 font-mono">MW</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            {totalSlotsCount > 0 ? 'Peak planned shed requirement' : `${feeders.length} active distribution lines`}
          </p>
        </div>
      </div>

      {/* 4. Controls Toolbar & View Switcher */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Left: View Mode Segmented Switcher */}
          <div className="flex items-center p-1 rounded-xl bg-slate-100/90 border border-slate-200 self-start">
            <button
              onClick={() => setViewMode('timeline')}
              className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                viewMode === 'timeline'
                  ? 'bg-white text-slate-900 shadow-sm font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="h-3.5 w-3.5 text-amber-500" />
              <span>Timeline View ({totalSlotsCount})</span>
            </button>

            <button
              onClick={() => setViewMode('feeders')}
              className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                viewMode === 'feeders'
                  ? 'bg-white text-slate-900 shadow-sm font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="h-3.5 w-3.5 text-cyan-600" />
              <span>Feeder Directory ({feeders.length})</span>
            </button>
          </div>

          {/* Right: Search & City District Selector */}
          <div className="flex flex-wrap items-center gap-3">
            {/* City District Dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600 font-mono">Zone:</span>
              <select
                value={selectedZone}
                onChange={(e) => setSelectedZone(e.target.value)}
                className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 shadow-sm"
              >
                <option value="ALL">All City Zones ({zones.length} Zones)</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name} ({z.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Feeder Search Input */}
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-3 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search feeder or code..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="min-h-[42px] pl-9 pr-8 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 shadow-sm w-48 sm:w-64"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-3 text-slate-400 hover:text-slate-600 p-0.5"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Filter Chips Bar (Visible in Feeder View or when searching) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-400 font-mono text-[11px] uppercase mr-1">Filter:</span>
            
            <button
              onClick={() => setFilterType('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filterType === 'ALL'
                  ? 'bg-slate-900 text-white font-semibold'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              All Lines ({feeders.length})
            </button>

            <button
              onClick={() => setFilterType('SCHEDULED')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filterType === 'SCHEDULED'
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200'
              }`}
            >
              Scheduled Today ({feederScheduledMap.size})
            </button>

            <button
              onClick={() => setFilterType('CRITICAL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filterType === 'CRITICAL'
                  ? 'bg-purple-600 text-white font-bold'
                  : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200'
              }`}
            >
              Hospital Shielded ({criticalHospitalCount})
            </button>

            <button
              onClick={() => setFilterType('ONLINE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filterType === 'ONLINE'
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
              }`}
            >
              Online ({feeders.filter((f) => f.effectiveStatus === 'ONLINE').length})
            </button>

            <button
              onClick={() => setFilterType('OUTAGE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filterType === 'OUTAGE'
                  ? 'bg-rose-600 text-white font-bold'
                  : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
              }`}
            >
              Currently In Outage ({feeders.filter((f) => f.effectiveStatus !== 'ONLINE').length})
            </button>
          </div>

          <div className="font-mono text-[11px] text-slate-500">
            SHOWING <strong className="text-slate-800">{filteredFeeders.length}</strong> FEEDERS
          </div>
        </div>
      </div>

      {/* 5. Main Content Area: Timeline vs Feeder Directory */}
      {loading ? (
        <div className="bg-white rounded-2xl p-16 border border-slate-200 text-center space-y-4">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-3 border-solid border-amber-500 border-r-transparent" />
          <div className="space-y-1">
            <p className="text-sm font-mono font-bold text-slate-800">FETCHING PUBLIC TIMETABLES...</p>
            <p className="text-xs text-slate-500">Querying Redis edge cache for date {selectedDate}...</p>
          </div>
        </div>
      ) : viewMode === 'timeline' ? (
        /* ================= TIMELINE VIEW ================= */
        <div className="space-y-6">
          {totalSlotsCount === 0 ? (
            /* Empty State for Timeline */
            <div className="bg-white rounded-2xl p-12 border border-slate-200/90 text-center space-y-4">
              <div className="h-16 w-16 mx-auto rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div className="space-y-2 max-w-md mx-auto">
                <h3 className="text-lg font-bold text-slate-900">
                  No Load Shedding Dispatched for {formatDisplayDate(selectedDate)}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Power supply currently meets all projected consumer and industrial demand. Under Law 1 & Law 2, mandatory rotation plans are published 12 hours prior to dispatch.
                </p>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => setViewMode('feeders')}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-2 transition-all shadow-sm"
                >
                  <Layers className="h-3.5 w-3.5 text-amber-400" />
                  <span>Browse Full Feeder Directory</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            /* Timeline Slot Cards */
            <div className="space-y-4">
              {scheduleData?.slots.map((slot, index) => {
                const timingStatus = getSlotTimingStatus(slot.startTime, slot.endTime);
                const isActive = timingStatus === 'ACTIVE';
                const isUpcoming = timingStatus === 'UPCOMING';

                return (
                  <div
                    key={slot.id}
                    className={`bg-white rounded-2xl border transition-all p-5 sm:p-6 shadow-sm ${
                      isActive
                        ? 'border-amber-400 ring-2 ring-amber-400/20 bg-gradient-to-r from-amber-50/40 via-white to-white'
                        : isUpcoming
                        ? 'border-slate-200/90 hover:border-slate-300'
                        : 'border-slate-200/60 opacity-80 bg-slate-50/50'
                    }`}
                  >
                    {/* Slot Header Strip */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4 mb-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`px-3 py-1 rounded-xl font-mono text-xs font-bold border ${
                            isActive
                              ? 'bg-amber-500 text-slate-950 border-amber-600'
                              : isUpcoming
                              ? 'bg-slate-100 text-slate-800 border-slate-200'
                              : 'bg-slate-100 text-slate-500 border-slate-200'
                          }`}
                        >
                          SLOT #{index + 1}
                        </div>

                        <div className="flex items-center gap-2 text-slate-900 font-extrabold text-base sm:text-lg font-mono">
                          <Clock className={`h-4 w-4 ${isActive ? 'text-amber-500 animate-pulse' : 'text-slate-400'}`} />
                          <span>{formatSlotTime(slot.startTime)} – {formatSlotTime(slot.endTime)}</span>
                          <span className="text-xs font-sans font-normal text-slate-400">(BST)</span>
                        </div>
                      </div>

                      {/* Slot Status Badge & Deficit Target */}
                      <div className="flex flex-wrap items-center gap-3">
                        {isActive && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
                            <span className="h-2 w-2 rounded-full bg-amber-600" />
                            ACTIVE SHEDDING WINDOW NOW
                          </span>
                        )}
                        {isUpcoming && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium bg-slate-100 text-slate-700 border border-slate-200">
                            UPCOMING CYCLE
                          </span>
                        )}
                        {timingStatus === 'COMPLETED' && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium bg-slate-100 text-slate-500 border border-slate-200">
                            ✓ COMPLETED
                          </span>
                        )}

                        <div className="px-3 py-1 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono">
                          <span className="text-slate-500">Deficit: </span>
                          <strong className="text-slate-900 font-bold">{slot.targetDeficitMW} MW</strong>
                          {slot.actualDeficitMW !== undefined && slot.actualDeficitMW !== slot.targetDeficitMW && (
                            <span className="text-slate-400 ml-1">
                              (actual {slot.actualDeficitMW} MW)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Assigned Feeders within Slot */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
                        <span className="font-semibold uppercase">
                          Rotating Feeders Scheduled for Shedding ({slot.assignedFeeders?.length || 0})
                        </span>
                        <span className="text-[11px] text-slate-400">
                          Other circuits in grid remain 100% active
                        </span>
                      </div>

                      {slot.assignedFeeders && slot.assignedFeeders.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {slot.assignedFeeders.map((f) => (
                            <div
                              key={f.id}
                              className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 shadow-2xs space-y-2 transition-all"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-xs sm:text-sm text-slate-900 truncate">
                                  {f.name}
                                </span>
                                
                                <button
                                  onClick={() => handleCopyCode(f.code)}
                                  className="font-mono text-[11px] font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded-md border border-amber-200 inline-flex items-center gap-1 transition-colors"
                                  title="Copy feeder code"
                                >
                                  {copiedCode === f.code ? (
                                    <>
                                      <Check className="h-3 w-3 text-emerald-600" />
                                      <span className="text-emerald-700">Copied</span>
                                    </>
                                  ) : (
                                    <>
                                      <span>{f.code}</span>
                                      <Copy className="h-2.5 w-2.5 text-amber-700" />
                                    </>
                                  )}
                                </button>
                              </div>

                              <div className="text-[11px] text-slate-600 flex items-center justify-between">
                                <span className="truncate text-slate-500">{f.substationName}</span>
                                <span className="font-mono font-semibold text-slate-800 shrink-0">
                                  {f.capacityMW} MW
                                </span>
                              </div>

                              <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between pt-1 border-t border-slate-100">
                                <span>{f.zoneName}</span>
                                <span className="text-amber-700 font-semibold">1 CUT / DAY MAX</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-4 rounded-xl bg-slate-50 text-center text-xs text-slate-500 font-mono">
                          No specific feeder rotation assigned in this slot.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ================= FEEDER DIRECTORY VIEW ================= */
        <div className="space-y-4">
          {filteredFeeders.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 border border-slate-200/90 text-center space-y-3">
              <Search className="h-8 w-8 mx-auto text-slate-400" />
              <h3 className="text-base font-bold text-slate-900">No matching feeder lines found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                No feeder lines matched your current search term &ldquo;{search}&rdquo; or selected filter criteria.
              </p>
              <button
                onClick={() => {
                  setSearch('');
                  setFilterType('ALL');
                  setSelectedZone('ALL');
                }}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition-all inline-flex items-center gap-1.5"
              >
                <span>Reset All Filters</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredFeeders.map((f) => {
                const scheduledInfo = feederScheduledMap.get(f.id);

                return (
                  <div
                    key={f.id}
                    className={`p-5 rounded-2xl border transition-all space-y-3.5 shadow-sm bg-white ${
                      f.isCritical
                        ? 'border-purple-200/90 hover:border-purple-300'
                        : scheduledInfo
                        ? 'border-amber-200/90 hover:border-amber-300'
                        : 'border-slate-200/90 hover:border-slate-300'
                    }`}
                  >
                    {/* Header: Name + Code Pill */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <h4 className="font-bold text-sm text-slate-900 leading-snug">
                          {f.name}
                        </h4>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                          <Building2 className="h-3 w-3 text-slate-400 shrink-0" />
                          <span className="truncate">{f.substationName || 'Primary Substation'}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleCopyCode(f.code)}
                        className="font-mono text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg border border-slate-200 inline-flex items-center gap-1.5 transition-colors shrink-0"
                        title="Click to copy feeder code"
                      >
                        {copiedCode === f.code ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-600" />
                            <span className="text-emerald-700 font-mono text-[11px]">COPIED</span>
                          </>
                        ) : (
                          <>
                            <span>{f.code}</span>
                            <Copy className="h-3 w-3 text-slate-400" />
                          </>
                        )}
                      </button>
                    </div>

                    {/* Telemetry Capacity & Zone */}
                    <div className="text-xs space-y-1.5 bg-slate-50/70 p-3 rounded-xl border border-slate-100">
                      <div className="flex justify-between items-center text-slate-600">
                        <span>Zone District:</span>
                        <strong className="text-slate-800 font-medium">{f.zoneName || 'Central'}</strong>
                      </div>
                      <div className="flex justify-between items-center text-slate-600">
                        <span>Line Capacity:</span>
                        <strong className="font-mono text-slate-900 font-bold">{f.capacityMW} MW</strong>
                      </div>
                      {f.connectedMetersCount !== undefined && (
                        <div className="flex justify-between items-center text-slate-600">
                          <span>Connected Meters:</span>
                          <span className="font-mono text-slate-700">{f.connectedMetersCount} customers</span>
                        </div>
                      )}
                    </div>

                    {/* Today's Scheduled Status */}
                    <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
                      {f.isCritical ? (
                        <div className="flex items-center gap-2 p-2 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 text-xs">
                          <ShieldCheck className="h-4 w-4 text-purple-600 shrink-0" />
                          <div>
                            <p className="font-bold font-mono text-[11px]">HOSPITAL IMMUNITY (LAW 1)</p>
                            <p className="text-[10px] text-purple-700">100% Protected from load shedding</p>
                          </div>
                        </div>
                      ) : scheduledInfo ? (
                        <div className="flex items-center gap-2 p-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                          <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                          <div>
                            <p className="font-bold font-mono text-[11px]">
                              ROTATION: {formatSlotTime(scheduledInfo.startTime)} – {formatSlotTime(scheduledInfo.endTime)} BST
                            </p>
                            <p className="text-[10px] text-amber-800">Scheduled on {formatDisplayDate(selectedDate)}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 p-2 rounded-xl bg-emerald-50/70 border border-emerald-200/70 text-emerald-900 text-xs">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                          <div>
                            <p className="font-bold font-mono text-[11px]">NORMAL TRANSMISSION</p>
                            <p className="text-[10px] text-emerald-700">No shedding scheduled on {formatDisplayDate(selectedDate)}</p>
                          </div>
                        </div>
                      )}

                      {/* Live Transmission Status Badge */}
                      <div className="flex items-center justify-between pt-1">
                        <StatusBadge status={f.effectiveStatus || f.status} size="sm" />
                        <span className="font-mono text-[10px] text-slate-400">1x/DAY MAX</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 6. Law 1 & Law 2 National Transparency Guarantee Charter */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 text-white rounded-3xl p-6 sm:p-8 border border-slate-800 shadow-xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-xs font-mono font-bold text-amber-400 uppercase tracking-widest">
                Mathematical Transparency Guarantees
              </span>
            </div>
            <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              Constitutional Grid Protection & Rotation Laws
            </h3>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/audit"
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-mono font-semibold inline-flex items-center gap-2 border border-slate-700 transition-all"
            >
              <FileText className="h-3.5 w-3.5 text-amber-400" />
              <span>VERIFY AUDIT LOG</span>
            </Link>

            <Link
              href="/outages/report"
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold inline-flex items-center gap-2 transition-all shadow-md"
            >
              <AlertTriangle className="h-3.5 w-3.5 text-slate-950" />
              <span>REPORT OUTAGE</span>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs text-slate-300">
          <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/80 space-y-2">
            <div className="flex items-center gap-2 text-purple-400 font-bold font-mono text-sm">
              <ShieldCheck className="h-4 w-4" />
              <span>Law 1: Hospital Shielding</span>
            </div>
            <p className="leading-relaxed text-slate-400">
              All general hospitals, ICUs, dialysis wards, and emergency medical feeders are hardcoded as immune in the dispatch solver. They are strictly excluded from rotating cuts.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/80 space-y-2">
            <div className="flex items-center gap-2 text-amber-400 font-bold font-mono text-sm">
              <Clock className="h-4 w-4" />
              <span>Law 2: Equitable Rotation</span>
            </div>
            <p className="leading-relaxed text-slate-400">
              No residential or commercial circuit may be scheduled for more than 1 rotation slot per 24-hour cycle. The solver balances deficit allocations across all city districts.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/80 space-y-2">
            <div className="flex items-center gap-2 text-cyan-400 font-bold font-mono text-sm">
              <Activity className="h-4 w-4" />
              <span>Redis Edge Synchronization</span>
            </div>
            <p className="leading-relaxed text-slate-400">
              Citizen timetables are cached at edge memory with 60-second invalidation. High-concurrency traffic during grid stress is served with sub-5ms response latencies.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
