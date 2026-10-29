'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Users, Zap, CheckCircle2, XCircle, AlertCircle, PlusCircle, ToggleLeft, ToggleRight, FileText } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { ApiClient } from '../../lib/api';
import { UserRole, UserStatus } from '@load-shedding/shared';

export default function AdminDashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [activeTab, setActiveTab] = useState<'infrastructure' | 'users' | 'requests' | 'audit'>('infrastructure');
  const [feeders, setFeeders] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [upgradeRequests, setUpgradeRequests] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // New staff user form state
  const [showUserModal, setShowUserModal] = useState(false);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [userRole, setUserRole] = useState<UserRole>(UserRole.POWER_OPERATOR);
  const [userZoneId, setUserZoneId] = useState('');
  const [submittingUser, setSubmittingUser] = useState(false);

  // Upgrade approval modal
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [approving, setApproving] = useState(false);

  const fetchAllData = async () => {
    setLoading(true);
    const [feedersRes, zonesRes, usersRes, reqsRes, auditRes] = await Promise.all([
      ApiClient.get('/api/admin/feeders'),
      ApiClient.get('/api/admin/zones'),
      ApiClient.get('/api/admin/users'),
      ApiClient.get('/api/infrastructure-requests'),
      ApiClient.get('/api/admin/audit')
    ]);

    if (feedersRes.success) setFeeders(feedersRes.data || []);
    if (zonesRes.success) setZones(zonesRes.data || []);
    if (usersRes.success) setUsers(usersRes.data || []);
    if (reqsRes.success) setUpgradeRequests(reqsRes.data || []);
    if (auditRes.success) setAuditLogs(auditRes.data || []);
    setLoading(false);
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

  // Toggle Critical status on a Feeder
  const handleToggleCritical = async (feederId: string, currentStatus: boolean) => {
    const res = await ApiClient.patch(`/api/v1/admin/feeders/${feederId}/critical`, {
      isCritical: !currentStatus
    });
    if (res.success) {
      fetchAllData();
    } else {
      alert(res.error?.message || 'Failed to toggle critical status');
    }
  };

  // Suspend/Reactivate user
  const handleToggleSuspend = async (userId: string, currentStatus: string) => {
    const endpoint = currentStatus === 'SUSPENDED' ? `/api/admin/users/${userId}/reactivate` : `/api/admin/users/${userId}/suspend`;
    const res = await ApiClient.post(endpoint);
    if (res.success) {
      fetchAllData();
    } else {
      alert(res.error?.message || 'Failed to update account status');
    }
  };

  // Provision new staff user
  const handleProvisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingUser(true);
    const res = await ApiClient.post('/api/admin/users', {
      name: userName,
      email: userEmail,
      phone: userPhone,
      role: userRole,
      assignedZoneId: userZoneId || undefined
    });
    setSubmittingUser(false);

    if (res.success) {
      setShowUserModal(false);
      setUserName('');
      setUserEmail('');
      setUserPhone('');
      setUserZoneId('');
      fetchAllData();
    } else {
      alert(res.error?.message || 'Failed to provision staff account');
    }
  };

  // Approve or Reject Upgrade Request
  const handleReviewRequest = async (status: 'APPROVED' | 'REJECTED') => {
    if (!selectedRequest) return;
    setApproving(true);
    const res = await ApiClient.patch(`/api/infrastructure-requests/${selectedRequest.id}/status`, {
      status,
      adminNotes
    });
    setApproving(false);

    if (res.success) {
      setSelectedRequest(null);
      setAdminNotes('');
      fetchAllData();
    } else {
      alert(res.error?.message || 'Failed to update request');
    }
  };

  if (authLoading || loading) {
    return (
      <div className="py-16 text-center space-y-3">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-purple-600 border-r-transparent" />
        <p className="text-xs text-slate-500">Loading Admin Infrastructure & User registries...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Shield className="h-6 w-6 text-purple-600" />
            System Administration & Grid Governance
          </h1>
          <p className="text-xs text-slate-500">Infrastructure hierarchy, staff provisioning, and audit logs.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('infrastructure')}
          className={`pb-3 ${
            activeTab === 'infrastructure'
              ? 'border-b-2 border-purple-600 text-purple-600 dark:text-purple-400'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Grid Feeders & Critical Shielding ({feeders.length})
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`pb-3 ${
            activeTab === 'users'
              ? 'border-b-2 border-purple-600 text-purple-600 dark:text-purple-400'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Staff & User Management ({users.length})
        </button>
        <button
          onClick={() => setActiveTab('requests')}
          className={`pb-3 ${
            activeTab === 'requests'
              ? 'border-b-2 border-purple-600 text-purple-600 dark:text-purple-400'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Upgrade Approvals ({upgradeRequests.length})
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`pb-3 ${
            activeTab === 'audit'
              ? 'border-b-2 border-purple-600 text-purple-600 dark:text-purple-400'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Audit Logs ({auditLogs.length})
        </button>
      </div>

      {/* TAB 1: Feeder Management & Critical Shielding */}
      {activeTab === 'infrastructure' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Feeder Lines & Hospital Shielding Toggle
            </h2>
            <p className="text-xs text-slate-500">
              Lines marked as Critical (e.g. Ibn Sina Hospital) are strictly shielded from automatic load-shedding cuts.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Feeder Name</th>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Capacity</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Critical Protection</th>
                  <th className="py-3 px-4">Toggle Shield</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {feeders.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">{f.name}</td>
                    <td className="py-3 px-4 font-mono text-slate-500">{f.code}</td>
                    <td className="py-3 px-4 font-medium">{f.capacityMW} MW</td>
                    <td className="py-3 px-4 font-semibold">{f.status}</td>
                    <td className="py-3 px-4">
                      {f.isCritical ? (
                        <span className="text-[11px] font-bold text-red-600 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded border border-red-200 dark:border-red-800">
                          🛡️ Critical Shield Active
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">Normal Feeder</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleToggleCritical(f.id, f.isCritical)}
                        className={`px-3 py-1 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all ${
                          f.isCritical
                            ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 border border-rose-200 hover:bg-rose-100'
                            : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 border border-emerald-200 hover:bg-emerald-100'
                        }`}
                      >
                        {f.isCritical ? 'Disable Shield' : 'Make Critical'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Users & Staff Management */}
      {activeTab === 'users' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Registered Users & Staff Accounts</h2>
              <p className="text-xs text-slate-500">Provision power operators, technicians, and district managers.</p>
            </div>
            <button
              onClick={() => setShowUserModal(true)}
              className="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-sm flex items-center gap-1.5"
            >
              <PlusCircle className="h-4 w-4" /> Provision Staff User
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">{u.name}</td>
                    <td className="py-3 px-4 text-slate-500">{u.email}</td>
                    <td className="py-3 px-4 text-slate-500">{u.phone || '—'}</td>
                    <td className="py-3 px-4 font-semibold text-purple-600">{u.role}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                          u.status === 'ACTIVE'
                            ? 'bg-emerald-500/10 text-emerald-600'
                            : 'bg-rose-500/10 text-rose-600'
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {u.role !== 'ADMIN' && (
                        <button
                          onClick={() => handleToggleSuspend(u.id, u.status)}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-[11px] font-semibold"
                        >
                          {u.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Upgrade Request Approvals */}
      {activeTab === 'requests' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Infrastructure Upgrade Requests
          </h2>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {upgradeRequests.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">No pending upgrade requests.</div>
            ) : (
              upgradeRequests.map((req) => (
                <div key={req.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white text-sm">{req.feederName}</span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                        {req.status}
                      </span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300"><strong>Justification:</strong> {req.reason}</p>
                    <p className="text-slate-600 dark:text-slate-300"><strong>Action:</strong> {req.proposedAction}</p>
                    {req.adminNotes && <p className="text-blue-600"><strong>Notes:</strong> {req.adminNotes}</p>}
                  </div>

                  {req.status === 'PENDING' && (
                    <button
                      onClick={() => setSelectedRequest(req)}
                      className="px-3 py-1.5 rounded-xl bg-purple-600 text-white font-semibold text-xs self-start"
                    >
                      Review & Approve
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 4: Audit Logs */}
      {activeTab === 'audit' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">System Security & Operations Audit Trail</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Entity</th>
                  <th className="py-3 px-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="py-3 px-4 text-slate-400 font-mono">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 font-bold text-purple-600">{log.action}</td>
                    <td className="py-3 px-4 font-medium text-slate-700 dark:text-slate-300">{log.entity}</td>
                    <td className="py-3 px-4 text-slate-500 font-mono text-[11px] max-w-xs truncate">
                      {JSON.stringify(log.details || {})}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Staff Provisioning Modal */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Provision New Staff Account</h3>
              <button onClick={() => setShowUserModal(false)} className="text-slate-400 font-bold">✕</button>
            </div>

            <form onSubmit={handleProvisionSubmit} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">Full Name</label>
                <input
                  type="text"
                  required
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="e.g. Engineer Farhan"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">Staff Email</label>
                <input
                  type="email"
                  required
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="farhan@grid.gov.bd"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">Phone</label>
                <input
                  type="text"
                  value={userPhone}
                  onChange={(e) => setUserPhone(e.target.value)}
                  placeholder="+8801700000000"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">Staff Role</label>
                <select
                  value={userRole}
                  onChange={(e) => setUserRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  <option value={UserRole.POWER_OPERATOR}>Power Operator (Control Room)</option>
                  <option value={UserRole.TECHNICIAN}>Field Technician (Repair Crew)</option>
                  <option value={UserRole.ZONE_MANAGER}>Zone Manager (District Supervisor)</option>
                  <option value={UserRole.ADMIN}>System Administrator</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">Assigned Zone Scope (Optional)</label>
                <select
                  value={userZoneId}
                  onChange={(e) => setUserZoneId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  <option value="">-- No specific district (System-wide) --</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>{z.name} ({z.code})</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowUserModal(false)} className="px-4 py-2 font-semibold text-slate-600">Cancel</button>
                <button type="submit" disabled={submittingUser} className="px-4 py-2 font-bold text-white bg-purple-600 hover:bg-purple-500 rounded-xl">
                  {submittingUser ? 'Provisioning...' : 'Provision Staff'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Review Upgrade Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 space-y-4 text-xs">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Review Upgrade Request</h3>
            <p><strong>Feeder:</strong> {selectedRequest.feederName}</p>
            <p><strong>Reason:</strong> {selectedRequest.reason}</p>
            <p><strong>Proposed:</strong> {selectedRequest.proposedAction}</p>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700 dark:text-slate-300">Administrative Notes / Budget Rationale</label>
              <textarea
                rows={2}
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="e.g. Budget allocated under Q3 maintenance program..."
                className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedRequest(null)}
                className="px-3 py-1.5 font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={approving}
                onClick={() => handleReviewRequest('REJECTED')}
                className="px-4 py-1.5 font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded-xl"
              >
                Reject
              </button>
              <button
                type="button"
                disabled={approving}
                onClick={() => handleReviewRequest('APPROVED')}
                className="px-4 py-1.5 font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl"
              >
                Approve Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
