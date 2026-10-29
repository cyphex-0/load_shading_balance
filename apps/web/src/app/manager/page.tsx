'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart2,
  ShieldAlert,
  PlusCircle,
  Filter,
  Search,
  RefreshCw,
  CheckCircle2,
  TrendingUp,
  Clock,
  Zap,
  Activity,
  Layers,
  FileText,
  X
} from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { ApiClient } from '../../lib/api';
import { StatusBadge } from '../../components/StatusBadge';

export default function ZoneManagerPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [dashboard, setDashboard] = useState<any>(null);
  const [failureAnalytics, setFailureAnalytics] = useState<any[]>([]);
  const [technicianAnalytics, setTechnicianAnalytics] = useState<any[]>([]);
  const [upgradeRequests, setUpgradeRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'grid' | 'analytics' | 'requests'>('grid');

  // Upgrade Request Form Modal
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedFeederId, setSelectedFeederId] = useState('');
  const [upgradeReason, setUpgradeReason] = useState('');
  const [proposedAction, setProposedAction] = useState('');
  const [submittingUpgrade, setSubmittingUpgrade] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [dashRes, failRes, techRes, reqRes] = await Promise.all([
      ApiClient.get(`/api/zone-managers/me/dashboard?status=${statusFilter}&search=${search}`),
      ApiClient.get('/api/zone-managers/me/analytics/feeder-failure-rate'),
      ApiClient.get('/api/zone-managers/me/analytics/avg-resolution-time'),
      ApiClient.get('/api/infrastructure-requests')
    ]);

    if (dashRes.success && dashRes.data) setDashboard(dashRes.data);
    if (failRes.success && failRes.data) setFailureAnalytics(failRes.data);
    if (techRes.success && techRes.data) setTechnicianAnalytics(techRes.data);
    if (reqRes.success && reqRes.data) setUpgradeRequests(reqRes.data);
    setLoading(false);
  };

  useEffect(() => {
    if (!authLoading && (!user || (user.role !== 'ZONE_MANAGER' && user.role !== 'ADMIN'))) {
      router.push('/login');
      return;
    }
    if (user) {
      fetchData();
    }
  }, [user, authLoading, statusFilter]);

  const handleUpgradeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFeederId) return;

    setSubmittingUpgrade(true);
    const res = await ApiClient.post('/api/infrastructure-requests', {
      feederId: selectedFeederId,
      reason: upgradeReason,
      proposedAction,
      supportingMetrics: { requestedByManager: user?.name, timestamp: new Date().toISOString() }
    });
    setSubmittingUpgrade(false);

    if (res.success) {
      setShowUpgradeModal(false);
      setSelectedFeederId('');
      setUpgradeReason('');
      setProposedAction('');
      fetchData();
    } else {
      alert(res.error?.message || 'Failed to submit upgrade request');
    }
  };

  if (authLoading || loading) {
    return (
      <div className="py-24 text-center space-y-3">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-solid border-cyan-500 border-r-transparent" />
        <p className="text-xs font-mono text-slate-400">CONNECTING TO DISTRICT OVERSIGHT TELEMETRY...</p>
      </div>
    );
  }

  const feeders = dashboard?.feeders || [];

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800/80 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-cyan-500 animate-pulse" />
            <span className="text-[11px] font-mono font-semibold text-slate-400 uppercase tracking-wider">
              District Oversight Console
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <BarChart2 className="h-6 w-6 text-cyan-500" />
            Zone Operational Oversight
          </h1>
          <p className="text-xs text-slate-500">
            Assigned District: <strong className="text-slate-700 dark:text-slate-300">{dashboard?.zone?.name || 'All Scoped Zones'}</strong> · Feeder Health & Crew MTTR
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowUpgradeModal(true)}
            className="px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all"
          >
            <PlusCircle className="h-4 w-4" />
            Petition Upgrade
          </button>
          <button
            onClick={fetchData}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
            title="Refresh district telemetry"
            aria-label="Refresh district telemetry"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Hallmark Navigation Tabs */}
      <div className="flex border-b border-slate-200/80 dark:border-slate-800/80 gap-6 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('grid')}
          className={`pb-3.5 transition-all flex items-center gap-2 ${
            activeTab === 'grid'
              ? 'border-b-2 border-cyan-500 text-cyan-600 dark:text-cyan-400 font-bold'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Activity className="h-4 w-4" />
          District Feeder Matrix ({feeders.length})
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`pb-3.5 transition-all flex items-center gap-2 ${
            activeTab === 'analytics'
              ? 'border-b-2 border-cyan-500 text-cyan-600 dark:text-cyan-400 font-bold'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <TrendingUp className="h-4 w-4" />
          Failure Frequency & MTTR Telemetry
        </button>
        <button
          onClick={() => setActiveTab('requests')}
          className={`pb-3.5 transition-all flex items-center gap-2 ${
            activeTab === 'requests'
              ? 'border-b-2 border-cyan-500 text-cyan-600 dark:text-cyan-400 font-bold'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Layers className="h-4 w-4" />
          Upgrade Petitions ({upgradeRequests.length})
        </button>
      </div>

      {/* TAB 1: Live Grid Table */}
      {activeTab === 'grid' && (
        <div className="glass-panel rounded-3xl p-6 space-y-4 border border-slate-200/80 dark:border-slate-800/80">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-semibold text-slate-500">Status Filter:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="">All Statuses</option>
                <option value="ONLINE">Online Normal</option>
                <option value="PLANNED_OUTAGE">Planned Shedding</option>
                <option value="UNEXPECTED_FAULT">Unexpected Fault</option>
              </select>
            </div>

            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search feeder name or code..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 w-48 sm:w-64"
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/75 dark:bg-slate-900/75 font-mono text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-semibold">Feeder Identification</th>
                  <th className="py-3 px-4 font-semibold">Substation</th>
                  <th className="py-3 px-4 font-semibold">Capacity</th>
                  <th className="py-3 px-4 font-semibold">Transmission Status</th>
                  <th className="py-3 px-4 font-semibold">Open Outages</th>
                  <th className="py-3 px-4 font-semibold text-right">Shielding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {feeders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 font-mono text-xs">
                      No matching feeder lines found in this district.
                    </td>
                  </tr>
                ) : (
                  feeders.map((f: any) => (
                    <tr key={f.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 dark:text-white">{f.name}</div>
                        <span className="font-mono text-[10px] text-cyan-600 dark:text-cyan-400">{f.code}</span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">{f.substationName}</td>
                      <td className="py-3.5 px-4 font-mono-numbers text-slate-800 dark:text-slate-200">{f.capacityMW} MW</td>
                      <td className="py-3.5 px-4">
                        <StatusBadge status={f.status} size="sm" />
                      </td>
                      <td className="py-3.5 px-4">
                        {f.openTicketsCount > 0 ? (
                          <span className="font-mono font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded">
                            {f.openTicketsCount} ACTIVE
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono">0</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {f.isCritical ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                            SHIELDED
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono text-[11px]">Standard</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Analytics */}
      {activeTab === 'analytics' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Feeder Failure Rate */}
          <div className="glass-panel rounded-3xl p-6 space-y-4 border border-slate-200/80 dark:border-slate-800/80">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-rose-500" />
                Feeder Failure Frequency (Worst Lines First)
              </h3>
              <p className="text-[11px] text-slate-500">
                Pinpoints chronic transformer burnout and high-risk transmission lines.
              </p>
            </div>

            <div className="space-y-4 pt-2">
              {failureAnalytics.map((item) => (
                <div key={item.feederId} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-800 dark:text-slate-200 font-medium">
                      {item.feederName} ({item.feederCode})
                    </span>
                    <span className="font-mono text-rose-600 dark:text-rose-400 font-bold">
                      {item.faultCount} Outages
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800/80 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-rose-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (item.faultCount / 10) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Average Resolution Time (MTTR) */}
          <div className="glass-panel rounded-3xl p-6 space-y-4 border border-slate-200/80 dark:border-slate-800/80">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-cyan-500" />
                Mean Time to Repair per Field Crew (MTTR)
              </h3>
              <p className="text-[11px] text-slate-500">
                Resolution duration from initial technician dispatch to verified line restoration.
              </p>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {technicianAnalytics.map((tech) => (
                <div key={tech.technicianId} className="py-3.5 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white">{tech.technicianName}</span>
                    <p className="text-[11px] text-slate-400 font-mono">{tech.ticketCount} total repairs resolved</p>
                  </div>
                  <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded-lg border border-cyan-500/20">
                    {tech.avgResolutionMinutes > 0 ? `${tech.avgResolutionMinutes} mins` : 'N/A'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Infrastructure Requests */}
      {activeTab === 'requests' && (
        <div className="glass-panel rounded-3xl p-6 space-y-4 border border-slate-200/80 dark:border-slate-800/80">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">
              Submitted District Upgrade Petitions
            </h3>
            <button
              onClick={() => setShowUpgradeModal(true)}
              className="px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-sm transition-all"
            >
              + New Petition
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {upgradeRequests.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs font-mono">
                No infrastructure upgrade petitions submitted yet for this district.
              </div>
            ) : (
              upgradeRequests.map((req) => (
                <div key={req.id} className="py-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 dark:text-white text-sm">{req.feederName}</span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full font-mono font-bold text-[11px] border ${
                        req.status === 'APPROVED'
                          ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                          : req.status === 'REJECTED'
                          ? 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                          : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                      }`}
                    >
                      {req.status}
                    </span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300">
                    <strong className="text-slate-900 dark:text-white">Justification:</strong> {req.reason}
                  </p>
                  <p className="text-slate-600 dark:text-slate-300">
                    <strong className="text-slate-900 dark:text-white">Proposed Action:</strong> {req.proposedAction}
                  </p>
                  {req.adminNotes && (
                    <p className="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 p-2.5 rounded-xl border border-blue-500/20">
                      <strong>Admin Governance Remark:</strong> {req.adminNotes}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Upgrade Request Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel bg-white dark:bg-slate-950 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 sm:p-8 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <PlusCircle className="h-5 w-5 text-cyan-500" />
                Petition Feeder Infrastructure Upgrade
              </h3>
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-white"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUpgradeSubmit} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 dark:text-slate-300">Target Feeder Line</label>
                <select
                  required
                  value={selectedFeederId}
                  onChange={(e) => setSelectedFeederId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/70 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="">-- Select Feeder --</option>
                  {feeders.map((f: any) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.code}) — {f.capacityMW} MW
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 dark:text-slate-300">Engineering Justification</label>
                <textarea
                  required
                  rows={2}
                  value={upgradeReason}
                  onChange={(e) => setUpgradeReason(e.target.value)}
                  placeholder="e.g. Chronic transformer burnout due to high industrial load in Sector 4..."
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/70 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 dark:text-slate-300">Proposed Engineering Solution</label>
                <textarea
                  required
                  rows={2}
                  value={proposedAction}
                  onChange={(e) => setProposedAction(e.target.value)}
                  placeholder="e.g. Upgrade transformer capacity from 200kVA to 400kVA and split feeder line..."
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/70 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUpgradeModal(false)}
                  className="px-4 py-2 font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingUpgrade}
                  className="px-5 py-2 font-bold text-white bg-cyan-600 hover:bg-cyan-500 rounded-xl shadow-sm transition-all disabled:opacity-50"
                >
                  {submittingUpgrade ? 'Submitting...' : 'Submit Petition'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
