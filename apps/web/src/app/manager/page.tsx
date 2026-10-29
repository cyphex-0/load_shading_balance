'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart2, ShieldAlert, PlusCircle, Filter, Search, RefreshCw, CheckCircle2, TrendingUp, Clock } from 'lucide-react';
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
      <div className="py-16 text-center space-y-3">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-cyan-500 border-r-transparent" />
        <p className="text-xs text-slate-500">Loading district operational data...</p>
      </div>
    );
  }

  const feeders = dashboard?.feeders || [];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart2 className="h-6 w-6 text-cyan-500" />
            Zone Manager Operational Oversight
          </h1>
          <p className="text-xs text-slate-500">
            District: {dashboard?.zone?.name || 'All Scoped Zones'} • Live Telemetry & Feeder Analytics
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowUpgradeModal(true)}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all"
          >
            <PlusCircle className="h-4 w-4" />
            Request Upgrade
          </button>
          <button
            onClick={fetchData}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 hover:bg-slate-100"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('grid')}
          className={`pb-3 transition-colors ${
            activeTab === 'grid'
              ? 'border-b-2 border-cyan-500 text-cyan-600 dark:text-cyan-400'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Live Feeder Table ({feeders.length})
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`pb-3 transition-colors ${
            activeTab === 'analytics'
              ? 'border-b-2 border-cyan-500 text-cyan-600 dark:text-cyan-400'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Failure Rate & MTTR Analytics
        </button>
        <button
          onClick={() => setActiveTab('requests')}
          className={`pb-3 transition-colors ${
            activeTab === 'requests'
              ? 'border-b-2 border-cyan-500 text-cyan-600 dark:text-cyan-400'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Infrastructure Requests ({upgradeRequests.length})
        </button>
      </div>

      {/* TAB 1: Live Grid Table */}
      {activeTab === 'grid' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400">Filter Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              >
                <option value="">All Statuses</option>
                <option value="ONLINE">Online</option>
                <option value="PLANNED_OUTAGE">Planned Outage</option>
                <option value="UNEXPECTED_FAULT">Unexpected Fault</option>
              </select>
            </div>

            <input
              type="text"
              placeholder="Search feeder line..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-xs px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 w-48 sm:w-64"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Feeder Line</th>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Substation</th>
                  <th className="py-3 px-4">Capacity</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Open Faults</th>
                  <th className="py-3 px-4">Protection</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {feeders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No matching feeders found in this district.
                    </td>
                  </tr>
                ) : (
                  feeders.map((f: any) => (
                    <tr key={f.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">{f.name}</td>
                      <td className="py-3 px-4 font-mono text-slate-500">{f.code}</td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{f.substationName}</td>
                      <td className="py-3 px-4 font-medium">{f.capacityMW} MW</td>
                      <td className="py-3 px-4">
                        <StatusBadge status={f.status} size="sm" />
                      </td>
                      <td className="py-3 px-4">
                        {f.openTicketsCount > 0 ? (
                          <span className="font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded">
                            {f.openTicketsCount} active
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {f.isCritical ? (
                          <span className="text-[11px] font-bold text-red-600">Shielded (Hospital)</span>
                        ) : (
                          <span className="text-slate-400">Standard</span>
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
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-rose-500" />
                Feeder Failure Frequency (Worst Lines First)
              </h3>
              <p className="text-[11px] text-slate-400">Identifies chronic transformer overheating and failure lines.</p>
            </div>

            <div className="space-y-3">
              {failureAnalytics.map((item) => (
                <div key={item.feederId} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span>{item.feederName} ({item.feederCode})</span>
                    <span className="text-rose-600">{item.faultCount} Outages</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                    <div
                      className="bg-rose-500 h-2 rounded-full"
                      style={{ width: `${Math.min(100, (item.faultCount / 10) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Average Resolution Time (MTTR) */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-500" />
                Average Repair Time per Crew (MTTR)
              </h3>
              <p className="text-[11px] text-slate-400">Resolution duration from technician dispatch to power restored.</p>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {technicianAnalytics.map((tech) => (
                <div key={tech.technicianId} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{tech.technicianName}</span>
                    <p className="text-[11px] text-slate-400">{tech.ticketCount} total repairs completed</p>
                  </div>
                  <span className="font-mono font-bold text-blue-600 bg-blue-50 dark:bg-blue-950/40 px-2.5 py-1 rounded-lg">
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
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">
              Submitted Infrastructure Upgrade Requests
            </h3>
            <button
              onClick={() => setShowUpgradeModal(true)}
              className="px-3 py-1.5 rounded-xl bg-blue-600 text-white font-semibold text-xs"
            >
              + New Request
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {upgradeRequests.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">No upgrade requests submitted yet.</div>
            ) : (
              upgradeRequests.map((req) => (
                <div key={req.id} className="py-4 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 dark:text-white">{req.feederName}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full font-bold text-[11px] border ${
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
                  <p className="text-slate-600 dark:text-slate-300"><strong>Reason:</strong> {req.reason}</p>
                  <p className="text-slate-600 dark:text-slate-300"><strong>Proposed Action:</strong> {req.proposedAction}</p>
                  {req.adminNotes && (
                    <p className="text-blue-600 bg-blue-50 dark:bg-blue-950/40 p-2 rounded-lg">
                      <strong>Admin Remark:</strong> {req.adminNotes}
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
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Request Feeder Infrastructure Upgrade
              </h3>
              <button onClick={() => setShowUpgradeModal(false)} className="text-slate-400 font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleUpgradeSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">Target Feeder Line</label>
                <select
                  required
                  value={selectedFeederId}
                  onChange={(e) => setSelectedFeederId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  <option value="">-- Select Feeder --</option>
                  {feeders.map((f: any) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.code}) — {f.capacityMW} MW
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">Justification / Reason</label>
                <textarea
                  required
                  rows={2}
                  value={upgradeReason}
                  onChange={(e) => setUpgradeReason(e.target.value)}
                  placeholder="e.g. Chronic transformer burnout due to high industrial load in Sector 4..."
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">Proposed Engineering Action</label>
                <textarea
                  required
                  rows={2}
                  value={proposedAction}
                  onChange={(e) => setProposedAction(e.target.value)}
                  placeholder="e.g. Upgrade transformer capacity from 200kVA to 400kVA and split feeder line..."
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUpgradeModal(false)}
                  className="px-4 py-2 font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingUpgrade}
                  className="px-4 py-2 font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl"
                >
                  {submittingUpgrade ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
