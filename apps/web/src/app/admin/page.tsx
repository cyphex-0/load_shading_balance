'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Shield,
  Users,
  Zap,
  PlusCircle,
  ShieldCheck,
  Layers,
  FileText,
  X,
  Search,
  Check,
  AlertTriangle,
  Building2,
  Radio,
  RefreshCw,
  Key,
  CheckCircle2,
  ChevronRight,
  Lock,
  Eye,
  Download,
  Info,
  Sparkles,
  Filter,
  Copy,
  ArrowRight,
  UserCheck,
  UserX,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { ApiClient } from '../../lib/api';
import { UserRole } from '@load-shedding/shared';
import { StatusBadge } from '../../components/StatusBadge';

interface FeederRecord {
  id: string;
  name: string;
  code: string;
  capacityMW: number;
  status: string;
  effectiveStatus?: string;
  isCritical: boolean;
  substationId?: string;
  substationName?: string;
  zoneId?: string;
  zoneName?: string;
  connectedMetersCount?: number;
}

interface ZoneRecord {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  substationsCount?: number;
}

interface UserRecord {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  status: 'ACTIVE' | 'SUSPENDED';
  assignedZoneId?: string | null;
  createdAt: string;
}

interface UpgradeRequestRecord {
  id: string;
  feederId: string;
  feederName: string;
  zoneId?: string;
  zoneName?: string;
  reason: string;
  proposedAction: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  adminNotes?: string | null;
  reviewedById?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
}

interface AuditLogRecord {
  id: string;
  actorId: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  details: any;
  ipAddress: string | null;
  createdAt: string;
}

interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

type AdminTab = 'infrastructure' | 'users' | 'requests' | 'audit';
type FeederShieldFilter = 'ALL' | 'CRITICAL' | 'STANDARD';
type UserRoleFilter = 'ALL' | UserRole;
type RequestStatusFilter = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED';

export default function AdminDashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [activeTab, setActiveTab] = useState<AdminTab>('infrastructure');
  const [feeders, setFeeders] = useState<FeederRecord[]>([]);
  const [zones, setZones] = useState<ZoneRecord[]>([]);
  const [usersList, setUsersList] = useState<UserRecord[]>([]);
  const [upgradeRequests, setUpgradeRequests] = useState<UpgradeRequestRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');
  const [currentTimeBST, setCurrentTimeBST] = useState<string>('');

  // Toast Notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Tab 1: Feeder Search & Filters
  const [feederSearch, setFeederSearch] = useState<string>('');
  const [feederZoneFilter, setFeederZoneFilter] = useState<string>('ALL');
  const [feederShieldFilter, setFeederShieldFilter] = useState<FeederShieldFilter>('ALL');
  const [shieldModalFeeder, setShieldModalFeeder] = useState<FeederRecord | null>(null);
  const [shieldSubmitting, setShieldSubmitting] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Tab 2: User Search & Filters & Modal
  const [userSearch, setUserSearch] = useState<string>('');
  const [userRoleFilter, setUserRoleFilter] = useState<UserRoleFilter>('ALL');
  const [userStatusFilter, setUserStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED'>('ALL');
  const [showUserModal, setShowUserModal] = useState(false);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [userRole, setUserRole] = useState<UserRole>(UserRole.POWER_OPERATOR);
  const [userZoneId, setUserZoneId] = useState('');
  const [submittingUser, setSubmittingUser] = useState(false);

  // Tab 3: Request Filters & Modal
  const [requestStatusFilter, setRequestStatusFilter] = useState<RequestStatusFilter>('ALL');
  const [selectedRequest, setSelectedRequest] = useState<UpgradeRequestRecord | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [approving, setApproving] = useState(false);

  // Tab 4: Audit Filters & Detail Drawer
  const [auditSearch, setAuditSearch] = useState<string>('');
  const [auditActionFilter, setAuditActionFilter] = useState<string>('ALL');
  const [selectedAuditLog, setSelectedAuditLog] = useState<AuditLogRecord | null>(null);

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

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [feedersRes, zonesRes, usersRes, reqsRes, auditRes] = await Promise.all([
        ApiClient.get<FeederRecord[]>('/api/admin/feeders'),
        ApiClient.get<ZoneRecord[]>('/api/admin/zones'),
        ApiClient.get<UserRecord[]>('/api/admin/users'),
        ApiClient.get<UpgradeRequestRecord[]>('/api/infrastructure-requests'),
        ApiClient.get<AuditLogRecord[]>('/api/admin/audit')
      ]);

      if (feedersRes.success && feedersRes.data) setFeeders(feedersRes.data);
      if (zonesRes.success && zonesRes.data) setZones(zonesRes.data);
      if (usersRes.success && usersRes.data) setUsersList(usersRes.data);
      if (reqsRes.success && reqsRes.data) setUpgradeRequests(reqsRes.data);
      if (auditRes.success && auditRes.data) setAuditLogs(auditRes.data);

      setLastRefreshed(
        new Date().toLocaleTimeString('en-GB', {
          timeZone: 'Asia/Dhaka',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      );
    } catch {
      showToast('Error syncing system governance telemetry', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'ADMIN')) {
      router.push('/login');
      return;
    }
    if (user) {
      fetchAllData();
    }
  }, [user, authLoading]);

  // Copy code helper
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Toggle Critical status on a Feeder with confirmation
  const handleToggleCriticalConfirm = async () => {
    if (!shieldModalFeeder) return;
    setShieldSubmitting(true);
    const newStatus = !shieldModalFeeder.isCritical;

    try {
      const res = await ApiClient.patch(`/api/v1/admin/feeders/${shieldModalFeeder.id}/critical`, {
        isCritical: newStatus
      });

      if (res.success) {
        showToast(
          newStatus
            ? `Law 1 Shield Activated: ${shieldModalFeeder.name} is now 100% immune from shedding`
            : `Law 1 Shield Revoked: ${shieldModalFeeder.name} returned to standard rotation`,
          'success'
        );
        setShieldModalFeeder(null);
        fetchAllData();
      } else {
        showToast(res.error?.message || 'Failed to toggle hospital shield status', 'error');
      }
    } catch {
      showToast('Network error updating feeder status', 'error');
    } finally {
      setShieldSubmitting(false);
    }
  };

  // Suspend/Reactivate user
  const handleToggleSuspend = async (targetUser: UserRecord) => {
    const isSuspended = targetUser.status === 'SUSPENDED';
    const endpoint = isSuspended
      ? `/api/admin/users/${targetUser.id}/reactivate`
      : `/api/admin/users/${targetUser.id}/suspend`;

    try {
      const res = await ApiClient.post(endpoint);
      if (res.success) {
        showToast(
          isSuspended
            ? `User account reactivated for ${targetUser.name}`
            : `User account suspended for ${targetUser.name}`,
          'info'
        );
        fetchAllData();
      } else {
        showToast(res.error?.message || 'Failed to update user status', 'error');
      }
    } catch {
      showToast('Network error updating user state', 'error');
    }
  };

  // Provision new staff user
  const handleProvisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingUser(true);
    try {
      const res = await ApiClient.post('/api/admin/users', {
        name: userName,
        email: userEmail,
        phone: userPhone || undefined,
        role: userRole,
        assignedZoneId: userZoneId || undefined
      });

      if (res.success) {
        showToast(`Staff user provisioned successfully for ${userName} (${userRole})`, 'success');
        setShowUserModal(false);
        setUserName('');
        setUserEmail('');
        setUserPhone('');
        setUserZoneId('');
        fetchAllData();
      } else {
        showToast(res.error?.message || 'Failed to provision staff account', 'error');
      }
    } catch {
      showToast('Network error during user provisioning', 'error');
    } finally {
      setSubmittingUser(false);
    }
  };

  // Approve or Reject Upgrade Request
  const handleReviewRequest = async (status: 'APPROVED' | 'REJECTED') => {
    if (!selectedRequest) return;
    setApproving(true);
    try {
      const res = await ApiClient.patch(`/api/infrastructure-requests/${selectedRequest.id}/status`, {
        status,
        adminNotes
      });

      if (res.success) {
        showToast(
          status === 'APPROVED'
            ? `Petition Approved: Modernization funding granted for ${selectedRequest.feederName}`
            : `Petition Rejected for ${selectedRequest.feederName}`,
          status === 'APPROVED' ? 'success' : 'info'
        );
        setSelectedRequest(null);
        setAdminNotes('');
        fetchAllData();
      } else {
        showToast(res.error?.message || 'Failed to evaluate infrastructure request', 'error');
      }
    } catch {
      showToast('Network error updating request', 'error');
    } finally {
      setApproving(false);
    }
  };

  // Export Audit Logs to CSV
  const handleExportAuditCSV = () => {
    try {
      const headers = ['Timestamp (BST)', 'Action', 'Actor Name', 'Actor Email', 'Entity', 'Entity ID', 'IP Address', 'Details'];
      const rows = auditLogs.map((log) => [
        new Date(log.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' }),
        log.action,
        log.actorName || 'System Automated',
        log.actorEmail || 'system@nldc.gov.bd',
        log.entity,
        log.entityId || '—',
        log.ipAddress || '127.0.0.1',
        JSON.stringify(log.details || {}).replace(/"/g, '""')
      ]);

      const csvContent = [headers.join(','), ...rows.map((r) => r.map((field) => `"${field}"`).join(','))].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `grid-governance-audit-trail-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Audit log CSV exported successfully', 'success');
    } catch {
      showToast('Failed to export audit logs', 'error');
    }
  };

  // Filtered Feeders
  const filteredFeeders = useMemo(() => {
    return feeders.filter((f) => {
      if (feederZoneFilter !== 'ALL' && f.zoneId !== feederZoneFilter) return false;
      if (feederShieldFilter === 'CRITICAL' && !f.isCritical) return false;
      if (feederShieldFilter === 'STANDARD' && f.isCritical) return false;

      if (feederSearch.trim()) {
        const q = feederSearch.toLowerCase();
        const matchesName = f.name.toLowerCase().includes(q);
        const matchesCode = f.code.toLowerCase().includes(q);
        const matchesSub = (f.substationName || '').toLowerCase().includes(q);
        const matchesZone = (f.zoneName || '').toLowerCase().includes(q);
        if (!matchesName && !matchesCode && !matchesSub && !matchesZone) return false;
      }
      return true;
    });
  }, [feeders, feederZoneFilter, feederShieldFilter, feederSearch]);

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return usersList.filter((u) => {
      if (userRoleFilter !== 'ALL' && u.role !== userRoleFilter) return false;
      if (userStatusFilter !== 'ALL' && u.status !== userStatusFilter) return false;

      if (userSearch.trim()) {
        const q = userSearch.toLowerCase();
        const matchesName = u.name.toLowerCase().includes(q);
        const matchesEmail = u.email.toLowerCase().includes(q);
        const matchesPhone = (u.phone || '').toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesPhone) return false;
      }
      return true;
    });
  }, [usersList, userRoleFilter, userStatusFilter, userSearch]);

  // Filtered Upgrade Requests
  const filteredRequests = useMemo(() => {
    return upgradeRequests.filter((r) => {
      if (requestStatusFilter !== 'ALL' && r.status !== requestStatusFilter) return false;
      return true;
    });
  }, [upgradeRequests, requestStatusFilter]);

  // Filtered Audit Logs
  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      if (auditActionFilter !== 'ALL' && !log.action.includes(auditActionFilter)) return false;
      if (auditSearch.trim()) {
        const q = auditSearch.toLowerCase();
        const matchesAction = log.action.toLowerCase().includes(q);
        const matchesEntity = log.entity.toLowerCase().includes(q);
        const matchesActor = (log.actorName || '').toLowerCase().includes(q) || (log.actorEmail || '').toLowerCase().includes(q);
        const matchesDetails = JSON.stringify(log.details || {}).toLowerCase().includes(q);
        if (!matchesAction && !matchesEntity && !matchesActor && !matchesDetails) return false;
      }
      return true;
    });
  }, [auditLogs, auditActionFilter, auditSearch]);

  // Aggregate Metrics for Bento
  const criticalFeedersCount = feeders.filter((f) => f.isCritical).length;
  const criticalCapacityMW = feeders
    .filter((f) => f.isCritical)
    .reduce((sum, f) => sum + (f.capacityMW || 0), 0);
  const totalGridCapacityMW = feeders.reduce((sum, f) => sum + (f.capacityMW || 0), 0);
  const pendingRequestsCount = upgradeRequests.filter((r) => r.status === 'PENDING').length;
  const activeStaffCount = usersList.filter((u) => u.status === 'ACTIVE').length;

  if (authLoading || loading) {
    return (
      <div className="py-28 text-center space-y-4">
        <div className="inline-block h-10 w-10 animate-spin rounded-full border-3 border-solid border-purple-600 border-r-transparent" />
        <div className="space-y-1">
          <p className="text-sm font-mono font-bold text-slate-800">CONNECTING TO GOVERNANCE & REGISTRY TELEMETRY...</p>
          <p className="text-xs text-slate-500">Verifying Level 5 Administrator clearance and loading immutable records...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Toast Notification Container */}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-md w-full pointer-events-none">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`p-4 rounded-xl border shadow-xl text-xs font-medium flex items-center justify-between gap-3 pointer-events-auto transition-all animate-in slide-in-from-bottom-2 ${
                toast.type === 'success'
                  ? 'bg-slate-900 text-white border-emerald-500/40 ring-1 ring-emerald-500/20'
                  : toast.type === 'error'
                  ? 'bg-rose-950 text-white border-rose-500/40 ring-1 ring-rose-500/20'
                  : 'bg-slate-900 text-white border-cyan-500/40 ring-1 ring-cyan-500/20'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {toast.type === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />}
                {toast.type === 'error' && <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />}
                {toast.type === 'info' && <Info className="h-4 w-4 text-cyan-400 shrink-0" />}
                <span>{toast.message}</span>
              </div>
              <button
                onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                className="text-slate-400 hover:text-white p-0.5"
                aria-label="Dismiss toast"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 1. Header & Governance Masthead */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-slate-200/90 pb-6">
        <div className="space-y-2 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-purple-50 text-purple-900 border border-purple-200">
              <Shield className="h-3 w-3 text-purple-700" />
              GOVERNANCE & SYSTEM REGISTRY
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-slate-100 text-slate-800 border border-slate-200">
              <Key className="h-3 w-3 text-slate-600" />
              CLEARANCE LEVEL: 5 (ADMIN)
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-telemetry-pulse" />
              TAMPER-EVIDENT AUDIT SYNCED
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
            <Shield className="h-7 w-7 text-purple-700 shrink-0" />
            <span>National Utility System Administration</span>
          </h1>

          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            Central constitutional authority for electrical grid topology, Law 1 hospital shielding hardcoding, RBAC personnel provisioning, and forensic audit governance.
          </p>
        </div>

        {/* Masthead Live Actions */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 shadow-sm text-xs font-mono text-slate-700">
            <Radio className="h-3.5 w-3.5 text-purple-600 animate-pulse" />
            <span className="text-slate-400 font-sans font-medium">BST:</span>
            <span className="font-bold text-slate-900 font-mono-numbers">{currentTimeBST || '--:--:--'}</span>
          </div>

          <button
            onClick={fetchAllData}
            disabled={loading}
            className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-mono font-semibold inline-flex items-center gap-2 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-purple-500/20 active:scale-[0.98] disabled:opacity-60"
            title="Refresh governance records"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-purple-600 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'SYNCING...' : 'REFRESH REGISTRY'}</span>
            {lastRefreshed && (
              <span className="hidden sm:inline text-[10px] text-slate-400 font-normal">
                ({lastRefreshed})
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 2. Executive Telemetry & Governance KPI Bento Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Law 1 Hospital Shielding */}
        <div className="clean-card clean-card-hover p-4 sm:p-5 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-purple-600" />
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span className="font-mono uppercase font-semibold">Hospital Immunity (Law 1)</span>
            <ShieldCheck className="h-4 w-4 text-purple-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-purple-900 font-mono-numbers">
              {criticalFeedersCount}
            </span>
            <span className="text-xs text-purple-700 font-mono">feeders</span>
          </div>
          <p className="text-[11px] text-purple-700/80 mt-2 font-mono">
            {criticalCapacityMW.toFixed(1)} MW 100% exempt from cuts
          </p>
        </div>

        {/* KPI 2: Total Grid Infrastructure */}
        <div className="clean-card clean-card-hover p-4 sm:p-5 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-cyan-600" />
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span className="font-mono uppercase font-semibold">Grid Feeders</span>
            <Zap className="h-4 w-4 text-cyan-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono-numbers">
              {feeders.length}
            </span>
            <span className="text-xs text-slate-500 font-mono">lines ({zones.length} zones)</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2 font-mono">
            {totalGridCapacityMW.toFixed(1)} MW total grid capacity
          </p>
        </div>

        {/* KPI 3: Registered Personnel */}
        <div className="clean-card clean-card-hover p-4 sm:p-5 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-600" />
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span className="font-mono uppercase font-semibold">Active Personnel</span>
            <Users className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono-numbers">
              {activeStaffCount}
            </span>
            <span className="text-xs text-slate-500 font-mono">of {usersList.length} total</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Operators, Technicians, Managers
          </p>
        </div>

        {/* KPI 4: Upgrade Petitions */}
        <div className="clean-card clean-card-hover p-4 sm:p-5 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span className="font-mono uppercase font-semibold">Upgrade Petitions</span>
            <Layers className="h-4 w-4 text-amber-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono-numbers">
              {pendingRequestsCount}
            </span>
            <span className="text-xs text-slate-500 font-mono">pending review</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            {upgradeRequests.length} total district submissions
          </p>
        </div>
      </div>

      {/* 3. Hallmark Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-2 sm:gap-6 text-xs font-semibold overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab('infrastructure')}
          className={`pb-3 whitespace-nowrap transition-all flex items-center gap-2 border-b-2 px-1 ${
            activeTab === 'infrastructure'
              ? 'border-purple-700 text-purple-950 font-bold'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Zap className="h-4 w-4 text-purple-700" />
          <span>Grid Feeders & Law 1 Shielding</span>
          <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-purple-50 text-purple-900 border border-purple-200">
            {feeders.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`pb-3 whitespace-nowrap transition-all flex items-center gap-2 border-b-2 px-1 ${
            activeTab === 'users'
              ? 'border-purple-700 text-purple-950 font-bold'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Users className="h-4 w-4 text-purple-700" />
          <span>Staff & User Governance</span>
          <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-100 text-slate-700 border border-slate-200">
            {usersList.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('requests')}
          className={`pb-3 whitespace-nowrap transition-all flex items-center gap-2 border-b-2 px-1 ${
            activeTab === 'requests'
              ? 'border-purple-700 text-purple-950 font-bold'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Layers className="h-4 w-4 text-purple-700" />
          <span>Upgrade Petitions</span>
          {pendingRequestsCount > 0 ? (
            <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
              {pendingRequestsCount} PENDING
            </span>
          ) : (
            <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-100 text-slate-700 border border-slate-200">
              {upgradeRequests.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`pb-3 whitespace-nowrap transition-all flex items-center gap-2 border-b-2 px-1 ${
            activeTab === 'audit'
              ? 'border-purple-700 text-purple-950 font-bold'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <FileText className="h-4 w-4 text-purple-700" />
          <span>Forensic Audit Trail</span>
          <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-100 text-slate-700 border border-slate-200">
            {auditLogs.length}
          </span>
        </button>
      </div>

      {/* ================= TAB 1: GRID FEEDERS & HOSPITAL SHIELDING ================= */}
      {activeTab === 'infrastructure' && (
        <div className="space-y-6">
          {/* Law 1 Constitutional Banner */}
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-purple-50/80 via-white to-purple-50/50 border border-purple-200/90 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
            <div className="flex items-start sm:items-center gap-3">
              <span className="p-2 rounded-xl bg-purple-100 text-purple-800 shrink-0">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div className="space-y-0.5">
                <h3 className="font-bold text-purple-950 text-sm">
                  Law 1: Constitutional Hospital & Critical Life-Support Shielding
                </h3>
                <p className="text-purple-900/80 leading-relaxed">
                  Feeders marked with active shielding (e.g. general hospitals, ICU wards, emergency command stations) are hardcoded into the dispatch solver with 100% immunity. They are mathematically excluded from rotating outages.
                </p>
              </div>
            </div>
            <div className="shrink-0 font-mono text-[11px] font-bold text-purple-900 bg-white px-3 py-1 rounded-full border border-purple-300 shadow-2xs self-start md:self-auto">
              {criticalFeedersCount} OF {feeders.length} LINES IMMUNE
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-sm space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              {/* Feeder Search */}
              <div className="relative flex-1 max-w-md">
                <Search className="h-4 w-4 absolute left-3.5 top-3 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search feeder name, code (e.g. FDR-MIR-10), substation..."
                  value={feederSearch}
                  onChange={(e) => setFeederSearch(e.target.value)}
                  className="w-full pl-10 pr-9 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 shadow-sm"
                />
                {feederSearch && (
                  <button
                    onClick={() => setFeederSearch('')}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Zone Dropdown */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-semibold text-slate-600">District Zone:</span>
                  <select
                    value={feederZoneFilter}
                    onChange={(e) => setFeederZoneFilter(e.target.value)}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 shadow-sm"
                  >
                    <option value="ALL">All City Districts ({zones.length} Zones)</option>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name} ({z.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Quick Shield Filter Pills */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-400 font-mono text-[11px] uppercase mr-1">Shield Status:</span>

                <button
                  onClick={() => setFeederShieldFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    feederShieldFilter === 'ALL'
                      ? 'bg-slate-900 text-white font-semibold'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                  }`}
                >
                  All Circuits ({feeders.length})
                </button>

                <button
                  onClick={() => setFeederShieldFilter('CRITICAL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    feederShieldFilter === 'CRITICAL'
                      ? 'bg-purple-700 text-white font-bold shadow-sm'
                      : 'bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200'
                  }`}
                >
                  Law 1 Shielded ({criticalFeedersCount})
                </button>

                <button
                  onClick={() => setFeederShieldFilter('STANDARD')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    feederShieldFilter === 'STANDARD'
                      ? 'bg-amber-600 text-white font-bold shadow-sm'
                      : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200'
                  }`}
                >
                  Standard Rotating ({feeders.length - criticalFeedersCount})
                </button>
              </div>

              <div className="font-mono text-[11px] text-slate-500">
                SHOWING <strong className="text-slate-800">{filteredFeeders.length}</strong> LINES
              </div>
            </div>
          </div>

          {/* Feeder Lines Governance Table */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-mono uppercase text-[11px]">
                  <tr>
                    <th className="px-4 py-3.5 font-semibold">Feeder Identification</th>
                    <th className="px-4 py-3.5 font-semibold">Code</th>
                    <th className="px-4 py-3.5 font-semibold">Substation & Zone</th>
                    <th className="px-4 py-3.5 font-semibold text-right">Capacity (MW)</th>
                    <th className="px-4 py-3.5 font-semibold">Grid State</th>
                    <th className="px-4 py-3.5 font-semibold">Hospital Shield (Law 1)</th>
                    <th className="px-4 py-3.5 font-semibold text-right">Governance Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredFeeders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-slate-500 font-mono">
                        No feeder lines found matching your search or filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredFeeders.map((f) => (
                      <tr key={f.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3.5">
                          <div className="font-bold text-slate-900 text-sm">{f.name}</div>
                          {f.connectedMetersCount !== undefined && (
                            <div className="text-[10px] text-slate-500 font-mono">
                              {f.connectedMetersCount} connected meters
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3.5">
                          <button
                            onClick={() => handleCopy(f.code)}
                            className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded border border-slate-200 inline-flex items-center gap-1 transition-colors"
                            title="Click to copy feeder code"
                          >
                            <span>{f.code}</span>
                            {copiedCode === f.code ? (
                              <Check className="h-3 w-3 text-emerald-600" />
                            ) : (
                              <Copy className="h-2.5 w-2.5 text-slate-400" />
                            )}
                          </button>
                        </td>

                        <td className="px-4 py-3.5">
                          <div className="text-slate-800 font-medium">{f.substationName || 'Primary Substation'}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{f.zoneName || 'Central Zone'}</div>
                        </td>

                        <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900 text-sm">
                          {f.capacityMW} MW
                        </td>

                        <td className="px-4 py-3.5">
                          <StatusBadge status={f.effectiveStatus || f.status} size="sm" />
                        </td>

                        <td className="px-4 py-3.5">
                          {f.isCritical ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[11px] font-bold text-purple-900 bg-purple-50 border border-purple-300">
                              <ShieldCheck className="h-3.5 w-3.5 text-purple-700" />
                              HOSPITAL SHIELD ACTIVE
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-mono text-[10px] text-slate-500 bg-slate-50 border border-slate-200">
                              Standard Rotating Feeder
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-right">
                          <button
                            onClick={() => setShieldModalFeeder(f)}
                            className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold inline-flex items-center justify-center transition-all ${
                              f.isCritical
                                ? 'bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200'
                                : 'bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-300'
                            }`}
                          >
                            {f.isCritical ? 'Revoke Shield' : 'Activate Shield'}
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

      {/* ================= TAB 2: STAFF & USER MANAGEMENT (RBAC) ================= */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          {/* Top Actions & Filters Bar */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-0.5">
                <h2 className="text-base font-bold text-slate-900">
                  Utility Staff Directory & Role-Based Access Control (RBAC)
                </h2>
                <p className="text-xs text-slate-500">
                  Manage clearance levels for Control Room Operators, Repair Crew Technicians, and District Managers.
                </p>
              </div>

              <button
                onClick={() => setShowUserModal(true)}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs shadow-sm flex items-center gap-2 transition-all self-start active:scale-[0.98]"
              >
                <PlusCircle className="h-4 w-4" />
                <span>Provision Staff User</span>
              </button>
            </div>

            {/* User Search & Role Filter Tabs */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pt-3 border-t border-slate-100">
              <div className="relative flex-1 max-w-md">
                <Search className="h-4 w-4 absolute left-3.5 top-3 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search staff by name, email, or mobile..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full pl-10 pr-9 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 shadow-sm"
                />
                {userSearch && (
                  <button
                    onClick={() => setUserSearch('')}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <button
                  onClick={() => setUserRoleFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                    userRoleFilter === 'ALL'
                      ? 'bg-slate-900 text-white font-semibold'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  All ({usersList.length})
                </button>

                <button
                  onClick={() => setUserRoleFilter(UserRole.POWER_OPERATOR)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                    userRoleFilter === UserRole.POWER_OPERATOR
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-200'
                  }`}
                >
                  Operators ({usersList.filter((u) => u.role === UserRole.POWER_OPERATOR).length})
                </button>

                <button
                  onClick={() => setUserRoleFilter(UserRole.TECHNICIAN)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                    userRoleFilter === UserRole.TECHNICIAN
                      ? 'bg-cyan-600 text-white font-bold'
                      : 'bg-cyan-50 text-cyan-900 hover:bg-cyan-100 border border-cyan-200'
                  }`}
                >
                  Technicians ({usersList.filter((u) => u.role === UserRole.TECHNICIAN).length})
                </button>

                <button
                  onClick={() => setUserRoleFilter(UserRole.ZONE_MANAGER)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                    userRoleFilter === UserRole.ZONE_MANAGER
                      ? 'bg-blue-600 text-white font-bold'
                      : 'bg-blue-50 text-blue-900 hover:bg-blue-100 border border-blue-200'
                  }`}
                >
                  Managers ({usersList.filter((u) => u.role === UserRole.ZONE_MANAGER).length})
                </button>

                <button
                  onClick={() => setUserRoleFilter(UserRole.ADMIN)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                    userRoleFilter === UserRole.ADMIN
                      ? 'bg-purple-700 text-white font-bold'
                      : 'bg-purple-50 text-purple-900 hover:bg-purple-100 border border-purple-200'
                  }`}
                >
                  Admins ({usersList.filter((u) => u.role === UserRole.ADMIN).length})
                </button>
              </div>
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-mono uppercase text-[11px]">
                  <tr>
                    <th className="px-4 py-3.5 font-semibold">Staff Personnel</th>
                    <th className="px-4 py-3.5 font-semibold">Official Contact</th>
                    <th className="px-4 py-3.5 font-semibold">Assigned Role</th>
                    <th className="px-4 py-3.5 font-semibold">District Scope</th>
                    <th className="px-4 py-3.5 font-semibold">Account State</th>
                    <th className="px-4 py-3.5 font-semibold text-right">Access Governance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-slate-500 font-mono">
                        No registered staff accounts match your current filter.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const assignedZone = zones.find((z) => z.id === u.assignedZoneId);

                      return (
                        <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-3">
                              <div
                                className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                                  u.role === UserRole.ADMIN
                                    ? 'bg-purple-100 text-purple-900'
                                    : u.role === UserRole.POWER_OPERATOR
                                    ? 'bg-amber-100 text-amber-900'
                                    : u.role === UserRole.TECHNICIAN
                                    ? 'bg-cyan-100 text-cyan-900'
                                    : u.role === UserRole.ZONE_MANAGER
                                    ? 'bg-blue-100 text-blue-900'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {u.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-bold text-slate-900 text-sm">{u.name}</div>
                                <div className="text-[10px] text-slate-400 font-mono">ID: {u.id}</div>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3.5">
                            <div className="font-mono text-slate-800">{u.email}</div>
                            <div className="text-[11px] text-slate-500 font-mono">{u.phone || 'No phone registered'}</div>
                          </td>

                          <td className="px-4 py-3.5">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-mono text-[11px] font-bold border ${
                                u.role === UserRole.ADMIN
                                  ? 'bg-purple-50 text-purple-900 border-purple-200'
                                  : u.role === UserRole.POWER_OPERATOR
                                  ? 'bg-amber-50 text-amber-900 border-amber-200'
                                  : u.role === UserRole.TECHNICIAN
                                  ? 'bg-cyan-50 text-cyan-900 border-cyan-200'
                                  : u.role === UserRole.ZONE_MANAGER
                                  ? 'bg-blue-50 text-blue-900 border-blue-200'
                                  : 'bg-slate-50 text-slate-700 border-slate-200'
                              }`}
                            >
                              {u.role}
                            </span>
                          </td>

                          <td className="px-4 py-3.5 text-slate-700 font-medium">
                            {assignedZone ? (
                              <span className="font-medium text-slate-800">
                                {assignedZone.name} ({assignedZone.code})
                              </span>
                            ) : (
                              <span className="text-slate-400 font-mono text-[11px]">System-Wide (All Zones)</span>
                            )}
                          </td>

                          <td className="px-4 py-3.5">
                            <span
                              className={`px-2.5 py-0.5 rounded-full font-mono font-bold text-[10px] border ${
                                u.status === 'ACTIVE'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-rose-50 text-rose-800 border-rose-200'
                              }`}
                            >
                              {u.status}
                            </span>
                          </td>

                          <td className="px-4 py-3.5 text-right">
                            {u.role !== UserRole.ADMIN ? (
                              <button
                                onClick={() => handleToggleSuspend(u)}
                                className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-mono font-semibold inline-flex items-center gap-1.5 transition-all ${
                                  u.status === 'ACTIVE'
                                    ? 'bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200'
                                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
                                }`}
                              >
                                {u.status === 'ACTIVE' ? (
                                  <>
                                    <UserX className="h-3.5 w-3.5" />
                                    <span>Suspend</span>
                                  </>
                                ) : (
                                  <>
                                    <UserCheck className="h-3.5 w-3.5" />
                                    <span>Reactivate</span>
                                  </>
                                )}
                              </button>
                            ) : (
                              <span className="text-[10px] font-mono text-slate-400">Master Root</span>
                            )}
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

      {/* ================= TAB 3: UPGRADE PETITIONS ================= */}
      {activeTab === 'requests' && (
        <div className="space-y-6">
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-0.5">
                <h2 className="text-base font-bold text-slate-900">
                  District Infrastructure Upgrade Petitions
                </h2>
                <p className="text-xs text-slate-500">
                  Capital equipment & line replacement proposals submitted by Zone District Managers based on chronic failure rates.
                </p>
              </div>

              {/* Status Filter Tabs */}
              <div className="flex items-center gap-1.5 text-xs">
                <button
                  onClick={() => setRequestStatusFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                    requestStatusFilter === 'ALL'
                      ? 'bg-slate-900 text-white font-semibold'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  All ({upgradeRequests.length})
                </button>
                <button
                  onClick={() => setRequestStatusFilter('PENDING')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                    requestStatusFilter === 'PENDING'
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-200'
                  }`}
                >
                  Pending ({upgradeRequests.filter((r) => r.status === 'PENDING').length})
                </button>
                <button
                  onClick={() => setRequestStatusFilter('APPROVED')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                    requestStatusFilter === 'APPROVED'
                      ? 'bg-emerald-600 text-white font-bold'
                      : 'bg-emerald-50 text-emerald-900 hover:bg-emerald-100 border border-emerald-200'
                  }`}
                >
                  Approved ({upgradeRequests.filter((r) => r.status === 'APPROVED').length})
                </button>
                <button
                  onClick={() => setRequestStatusFilter('REJECTED')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                    requestStatusFilter === 'REJECTED'
                      ? 'bg-rose-600 text-white font-bold'
                      : 'bg-rose-50 text-rose-900 hover:bg-rose-100 border border-rose-200'
                  }`}
                >
                  Rejected ({upgradeRequests.filter((r) => r.status === 'REJECTED').length})
                </button>
              </div>
            </div>
          </div>

          {/* Petition Cards Stream */}
          <div className="space-y-4">
            {filteredRequests.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 border border-slate-200/90 text-center space-y-3">
                <Layers className="h-8 w-8 mx-auto text-slate-400" />
                <h3 className="text-base font-bold text-slate-900">Zero Upgrade Petitions Found</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  No district infrastructure upgrade proposals match the selected status filter.
                </p>
              </div>
            ) : (
              filteredRequests.map((req) => (
                <div
                  key={req.id}
                  className={`bg-white rounded-2xl border p-5 sm:p-6 shadow-sm transition-all space-y-4 ${
                    req.status === 'PENDING'
                      ? 'border-amber-300 ring-1 ring-amber-300/30'
                      : req.status === 'APPROVED'
                      ? 'border-emerald-200/90'
                      : 'border-slate-200/80 opacity-85'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-bold text-slate-900 text-base">{req.feederName}</span>
                      <span
                        className={`font-mono text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                          req.status === 'PENDING'
                            ? 'bg-amber-100 text-amber-900 border-amber-300'
                            : req.status === 'APPROVED'
                            ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                            : 'bg-rose-100 text-rose-900 border-rose-300'
                        }`}
                      >
                        {req.status}
                      </span>
                      <span className="text-xs text-slate-500 font-mono">
                        Submitted: {new Date(req.createdAt).toLocaleDateString('en-GB')}
                      </span>
                    </div>

                    {req.status === 'PENDING' && (
                      <button
                        onClick={() => setSelectedRequest(req)}
                        className="min-h-[40px] px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs shadow-sm transition-all self-start sm:self-auto active:scale-[0.98]"
                      >
                        Review & Adjudicate
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                      <div className="text-[11px] font-mono font-bold text-slate-500 uppercase">
                        Engineering Justification:
                      </div>
                      <p className="text-slate-800 leading-relaxed font-medium">{req.reason}</p>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                      <div className="text-[11px] font-mono font-bold text-slate-500 uppercase">
                        Proposed Modernization Action:
                      </div>
                      <p className="text-slate-800 leading-relaxed font-medium">{req.proposedAction}</p>
                    </div>
                  </div>

                  {req.adminNotes && (
                    <div className="p-3 rounded-xl bg-purple-50/70 border border-purple-200/80 text-xs text-purple-950 font-mono space-y-0.5">
                      <div className="font-bold flex items-center gap-1.5 text-purple-900">
                        <ShieldCheck className="h-3.5 w-3.5 text-purple-700" />
                        <span>Governance Decision Record:</span>
                      </div>
                      <p>{req.adminNotes}</p>
                      {req.reviewedAt && (
                        <p className="text-[10px] text-purple-700 pt-0.5">
                          Adjudicated on {new Date(req.reviewedAt).toLocaleString('en-GB')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ================= TAB 4: FORENSIC AUDIT TRAIL ================= */}
      {activeTab === 'audit' && (
        <div className="space-y-6">
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-xs font-mono font-bold text-slate-700 uppercase tracking-wider">
                    Cryptographic Security & System Operations Ledger
                  </span>
                </div>
                <h2 className="text-base font-bold text-slate-900">
                  Immutable Forensic Audit Trail
                </h2>
                <p className="text-xs text-slate-500">
                  Tamper-evident log of all staff provisioning, hospital shielding changes, dispatch schedules, and infrastructure reviews.
                </p>
              </div>

              <button
                onClick={handleExportAuditCSV}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-2 shadow-sm transition-all self-start active:scale-[0.98]"
              >
                <Download className="h-3.5 w-3.5 text-purple-700" />
                <span>Export Audit CSV</span>
              </button>
            </div>

            {/* Audit Search & Action Filters */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pt-3 border-t border-slate-100">
              <div className="relative flex-1 max-w-md">
                <Search className="h-4 w-4 absolute left-3.5 top-3 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search audit actions, actors, or entities..."
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  className="w-full pl-10 pr-9 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 shadow-sm"
                />
                {auditSearch && (
                  <button
                    onClick={() => setAuditSearch('')}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <button
                  onClick={() => setAuditActionFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                    auditActionFilter === 'ALL'
                      ? 'bg-slate-900 text-white font-semibold'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  All Logs ({auditLogs.length})
                </button>
                <button
                  onClick={() => setAuditActionFilter('CRITICAL')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                    auditActionFilter === 'CRITICAL'
                      ? 'bg-purple-700 text-white font-bold'
                      : 'bg-purple-50 text-purple-900 hover:bg-purple-100 border border-purple-200'
                  }`}
                >
                  Shielding
                </button>
                <button
                  onClick={() => setAuditActionFilter('USER')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                    auditActionFilter === 'USER'
                      ? 'bg-cyan-700 text-white font-bold'
                      : 'bg-cyan-50 text-cyan-900 hover:bg-cyan-100 border border-cyan-200'
                  }`}
                >
                  Personnel
                </button>
                <button
                  onClick={() => setAuditActionFilter('INFRASTRUCTURE')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                    auditActionFilter === 'INFRASTRUCTURE'
                      ? 'bg-amber-600 text-white font-bold'
                      : 'bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-200'
                  }`}
                >
                  Petitions
                </button>
              </div>
            </div>
          </div>

          {/* Forensic Audit Table */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-mono uppercase text-[11px]">
                  <tr>
                    <th className="px-4 py-3.5 font-semibold">Timestamp (BST)</th>
                    <th className="px-4 py-3.5 font-semibold">Action</th>
                    <th className="px-4 py-3.5 font-semibold">Actor Personnel</th>
                    <th className="px-4 py-3.5 font-semibold">Target Entity</th>
                    <th className="px-4 py-3.5 font-semibold">Payload Summary</th>
                    <th className="px-4 py-3.5 font-semibold text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {filteredAuditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-slate-500 font-mono">
                        No audit records matched your current query.
                      </td>
                    </tr>
                  ) : (
                    filteredAuditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3.5 text-slate-500 text-[11px] whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString('en-GB', {
                            timeZone: 'Asia/Dhaka',
                            year: 'numeric',
                            month: 'short',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })}
                        </td>

                        <td className="px-4 py-3.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              log.action.includes('CRITICAL')
                                ? 'bg-purple-50 text-purple-900 border-purple-200'
                                : log.action.includes('USER')
                                ? 'bg-cyan-50 text-cyan-900 border-cyan-200'
                                : log.action.includes('INFRASTRUCTURE')
                                ? 'bg-amber-50 text-amber-900 border-amber-200'
                                : 'bg-slate-100 text-slate-800 border-slate-200'
                            }`}
                          >
                            {log.action}
                          </span>
                        </td>

                        <td className="px-4 py-3.5 text-slate-800">
                          <div className="font-sans font-bold">{log.actorName || 'System Automated'}</div>
                          <div className="text-[10px] text-slate-400">{log.actorEmail || 'nldc-engine@gov.bd'}</div>
                        </td>

                        <td className="px-4 py-3.5 text-slate-700">
                          <div className="font-semibold">{log.entity}</div>
                          {log.entityId && <div className="text-[10px] text-slate-400">{log.entityId}</div>}
                        </td>

                        <td className="px-4 py-3.5 text-slate-600 text-[11px] max-w-xs truncate">
                          {JSON.stringify(log.details || {})}
                        </td>

                        <td className="px-4 py-3.5 text-right">
                          <button
                            onClick={() => setSelectedAuditLog(log)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-purple-700 hover:bg-purple-50 transition-colors"
                            title="Inspect full JSON payload"
                          >
                            <Eye className="h-4 w-4" />
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

      {/* ================= MODAL 1: LAW 1 HOSPITAL SHIELD CONFIRMATION ================= */}
      {shieldModalFeeder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 sm:p-8 space-y-5 animate-in fade-in-50 zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5 text-purple-900 font-extrabold text-base">
                <ShieldCheck className="h-6 w-6 text-purple-700" />
                <span>Confirm Hospital Shield Modification</span>
              </div>
              <button
                onClick={() => setShieldModalFeeder(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-4 rounded-2xl bg-purple-50/80 border border-purple-200 space-y-2">
                <div className="font-bold text-sm text-purple-950">{shieldModalFeeder.name}</div>
                <div className="flex flex-wrap items-center gap-3 font-mono text-slate-600">
                  <span>Code: {shieldModalFeeder.code}</span>
                  <span>Capacity: {shieldModalFeeder.capacityMW} MW</span>
                  <span>Zone: {shieldModalFeeder.zoneName || 'Central'}</span>
                </div>
              </div>

              {shieldModalFeeder.isCritical ? (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>Warning: Revoking Law 1 Immunity</span>
                  </div>
                  <p className="leading-relaxed">
                    By disabling hospital shielding, this feeder will no longer be protected from rotational load-shedding schedules dispatched by the National Load Dispatch Center.
                  </p>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>Activating Law 1 Hardcoded Immunity</span>
                  </div>
                  <p className="leading-relaxed">
                    This feeder supplies critical healthcare, ICU facilities, or essential public infrastructure. The LP solver will hardcode 100% shedding exemption across all 24-hour schedules.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShieldModalFeeder(null)}
                className="min-h-[44px] px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={shieldSubmitting}
                onClick={handleToggleCriticalConfirm}
                className={`min-h-[44px] px-5 py-2 font-bold text-white rounded-xl shadow-sm transition-all active:scale-[0.98] ${
                  shieldModalFeeder.isCritical
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-purple-700 hover:bg-purple-800'
                }`}
              >
                {shieldSubmitting
                  ? 'Updating Shield...'
                  : shieldModalFeeder.isCritical
                  ? 'Confirm Revocation'
                  : 'Confirm Hospital Immunity'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL 2: STAFF PROVISIONING ================= */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 sm:p-8 space-y-5 animate-in fade-in-50 zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <PlusCircle className="h-5 w-5 text-purple-700" />
                Provision Utility Personnel Account
              </h3>
              <button
                onClick={() => setShowUserModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleProvisionSubmit} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700">Full Name</label>
                <input
                  type="text"
                  required
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="e.g. Engineer Farhan"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 shadow-2xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700">Staff Official Email</label>
                <input
                  type="email"
                  required
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="farhan@grid.gov.bd"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 shadow-2xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700">Mobile Phone (+880)</label>
                <input
                  type="text"
                  value={userPhone}
                  onChange={(e) => setUserPhone(e.target.value)}
                  placeholder="+8801700000000"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 shadow-2xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700">Role & Security Clearance</label>
                <select
                  value={userRole}
                  onChange={(e) => setUserRole(e.target.value as UserRole)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 shadow-2xs"
                >
                  <option value={UserRole.POWER_OPERATOR}>Power Operator (National Load Dispatch Center)</option>
                  <option value={UserRole.TECHNICIAN}>Field Technician (Rapid Repair Crew)</option>
                  <option value={UserRole.ZONE_MANAGER}>Zone Manager (District HUD & Planning)</option>
                  <option value={UserRole.ADMIN}>System Administrator (Clearance Level 5)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700">Assigned Zone Scope</label>
                <select
                  value={userZoneId}
                  onChange={(e) => setUserZoneId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 shadow-2xs"
                >
                  <option value="">-- No specific district (System-Wide Scope) --</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name} ({z.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="min-h-[44px] px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingUser}
                  className="min-h-[44px] px-5 py-2 font-bold text-white bg-purple-700 hover:bg-purple-800 rounded-xl shadow-sm transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {submittingUser ? 'Provisioning...' : 'Provision Staff User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL 3: REVIEW UPGRADE PETITION ================= */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 sm:p-8 space-y-5 text-xs animate-in fade-in-50 zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Layers className="h-5 w-5 text-purple-700" />
                Review District Infrastructure Petition
              </h3>
              <button
                onClick={() => setSelectedRequest(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 font-mono text-[11px] text-slate-800">
              <p>
                <strong className="text-slate-900">Feeder Line:</strong> {selectedRequest.feederName}
              </p>
              <p>
                <strong className="text-slate-900">Reason:</strong> {selectedRequest.reason}
              </p>
              <p>
                <strong className="text-slate-900">Proposed Action:</strong> {selectedRequest.proposedAction}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700">
                Administrative Notes / Budget Grant Rationale
              </label>
              <textarea
                rows={3}
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="e.g. Approved under FY26 infrastructure modernization grant with priority equipment procurement..."
                className="w-full p-3.5 rounded-xl border border-slate-300 bg-white text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 shadow-2xs"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedRequest(null)}
                className="min-h-[44px] px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={approving}
                onClick={() => handleReviewRequest('REJECTED')}
                className="min-h-[44px] px-4 py-2 font-bold text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded-xl transition-all"
              >
                Reject Petition
              </button>
              <button
                type="button"
                disabled={approving}
                onClick={() => handleReviewRequest('APPROVED')}
                className="min-h-[44px] px-5 py-2 font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition-all active:scale-[0.98]"
              >
                Approve & Grant Modernization
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL 4: AUDIT LOG PAYLOAD INSPECTOR ================= */}
      {selectedAuditLog && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-xl w-full p-6 sm:p-8 space-y-4 animate-in fade-in-50 zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-purple-700" />
                <h3 className="text-base font-bold text-slate-900 font-mono">
                  Audit Entry: {selectedAuditLog.action}
                </h3>
              </div>
              <button
                onClick={() => setSelectedAuditLog(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="text-xs space-y-3 font-mono">
              <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-[11px]">
                <div>
                  <span className="text-slate-400">Timestamp: </span>
                  <strong>{new Date(selectedAuditLog.createdAt).toLocaleString('en-GB')}</strong>
                </div>
                <div>
                  <span className="text-slate-400">IP Address: </span>
                  <strong>{selectedAuditLog.ipAddress || '127.0.0.1'}</strong>
                </div>
                <div>
                  <span className="text-slate-400">Actor: </span>
                  <strong>{selectedAuditLog.actorName || 'System'}</strong>
                </div>
                <div>
                  <span className="text-slate-400">Target Entity: </span>
                  <strong>{selectedAuditLog.entity} ({selectedAuditLog.entityId || 'N/A'})</strong>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-slate-500 font-semibold uppercase text-[10px]">
                  Raw Cryptographic Audit Payload:
                </span>
                <pre className="p-4 rounded-xl bg-slate-950 text-slate-100 text-[11px] overflow-x-auto max-h-60 border border-slate-800">
                  {JSON.stringify(selectedAuditLog.details || {}, null, 2)}
                </pre>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedAuditLog(null)}
                className="min-h-[44px] px-5 py-2 font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
