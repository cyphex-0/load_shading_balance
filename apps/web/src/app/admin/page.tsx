'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Shield,
  Users,
  Zap,
  PlusCircle,
  ShieldCheck,
  Layers,
  FileText,
  X
} from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { ApiClient } from '../../lib/api';
import { UserRole } from '@load-shedding/shared';

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
      <div className="py-24 text-center space-y-3">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-solid border-purple-500 border-r-transparent" />
        <p className="text-xs font-mono text-slate-500">CONNECTING TO GOVERNANCE & REGISTRY TELEMETRY...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-purple-600" />
            <span className="text-[11px] font-mono font-semibold text-slate-500 uppercase tracking-wider">
              System Governance Hub
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2.5">
            <Shield className="h-6 w-6 text-purple-700" />
            National Utility System Administration
          </h1>
          <p className="text-xs text-slate-500">
            Grid infrastructure hierarchy, hospital critical-line shielding, staff provisioning, and audit governance.
          </p>
        </div>
      </div>

      {/* Hallmark Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-6 text-xs font-semibold overflow-x-auto">
        <button
          onClick={() => setActiveTab('infrastructure')}
          className={`pb-3.5 whitespace-nowrap transition-colors flex items-center gap-2 ${
            activeTab === 'infrastructure'
              ? 'border-b-2 border-purple-700 text-purple-900 font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Zap className="h-4 w-4" />
          Grid Feeders & Hospital Shielding ({feeders.length})
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`pb-3.5 whitespace-nowrap transition-colors flex items-center gap-2 ${
            activeTab === 'users'
              ? 'border-b-2 border-purple-700 text-purple-900 font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Users className="h-4 w-4" />
          Staff & User Management ({users.length})
        </button>
        <button
          onClick={() => setActiveTab('requests')}
          className={`pb-3.5 whitespace-nowrap transition-colors flex items-center gap-2 ${
            activeTab === 'requests'
              ? 'border-b-2 border-purple-700 text-purple-900 font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Layers className="h-4 w-4" />
          Upgrade Petitions ({upgradeRequests.length})
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`pb-3.5 whitespace-nowrap transition-colors flex items-center gap-2 ${
            activeTab === 'audit'
              ? 'border-b-2 border-purple-700 text-purple-900 font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <FileText className="h-4 w-4" />
          Audit Logs ({auditLogs.length})
        </button>
      </div>

      {/* TAB 1: Feeder Management & Critical Shielding */}
      {activeTab === 'infrastructure' && (
        <div className="bg-white rounded-xl p-6 space-y-4 border border-slate-200 shadow-sm">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Feeder Lines & Hospital Shielding Governance
            </h2>
            <p className="text-xs text-slate-500">
              Lines marked as Critical (e.g. Ibn Sina Hospital) are strictly shielded by the scheduling engine from power shedding.
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 font-mono text-slate-600 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-semibold">Feeder Identification</th>
                  <th className="py-3 px-4 font-semibold">Code</th>
                  <th className="py-3 px-4 font-semibold">Capacity</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold">Shield Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Protection Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-medium text-slate-800">
                {feeders.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-900">{f.name}</td>
                    <td className="py-3.5 px-4 font-mono text-slate-600">{f.code}</td>
                    <td className="py-3.5 px-4 font-mono-numbers text-slate-900">{f.capacityMW} MW</td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-slate-700">{f.status}</td>
                    <td className="py-3.5 px-4">
                      {f.isCritical ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold text-purple-900 bg-purple-50 px-2.5 py-1 rounded-full border border-purple-200">
                          <ShieldCheck className="h-3.5 w-3.5 text-purple-700" />
                          HOSPITAL SHIELD ACTIVE
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[11px] font-mono">Standard Feeder</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => handleToggleCritical(f.id, f.isCritical)}
                        className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold inline-flex items-center justify-center transition-colors ${
                          f.isCritical
                            ? 'bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300'
                            : 'bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-300'
                        }`}
                      >
                        {f.isCritical ? 'Disable Shield' : 'Activate Shield'}
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
        <div className="bg-white rounded-xl p-6 space-y-4 border border-slate-200 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Registered Utility Personnel & Consumers</h2>
              <p className="text-xs text-slate-500">Provision power operators, technicians, and district managers.</p>
            </div>
            <button
              onClick={() => setShowUserModal(true)}
              className="min-h-[44px] px-4 py-2 rounded-lg bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-colors self-start"
            >
              <PlusCircle className="h-4 w-4" /> Provision Staff User
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 font-mono text-slate-600 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-semibold">Staff Name</th>
                  <th className="py-3 px-4 font-semibold">Email</th>
                  <th className="py-3 px-4 font-semibold">Phone</th>
                  <th className="py-3 px-4 font-semibold">Assigned Role</th>
                  <th className="py-3 px-4 font-semibold">Account State</th>
                  <th className="py-3 px-4 font-semibold text-right">Governance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-medium text-slate-800">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-900">{u.name}</td>
                    <td className="py-3.5 px-4 font-mono text-slate-600">{u.email}</td>
                    <td className="py-3.5 px-4 font-mono text-slate-600">{u.phone || '—'}</td>
                    <td className="py-3.5 px-4">
                      <span className="font-mono text-[11px] font-bold text-purple-900 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
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
                    <td className="py-3.5 px-4 text-right">
                      {u.role !== 'ADMIN' && (
                        <button
                          onClick={() => handleToggleSuspend(u.id, u.status)}
                          className="min-h-[36px] px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-mono font-semibold inline-flex items-center justify-center transition-colors"
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
        <div className="bg-white rounded-xl p-6 space-y-4 border border-slate-200 shadow-sm">
          <h2 className="text-base font-bold text-slate-900">
            District Infrastructure Upgrade Petitions
          </h2>

          <div className="divide-y divide-slate-200">
            {upgradeRequests.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs font-mono">
                Zero pending infrastructure upgrade requests.
              </div>
            ) : (
              upgradeRequests.map((req) => (
                <div key={req.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2.5">
                      <span className="font-bold text-slate-900 text-sm">{req.feederName}</span>
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                        {req.status}
                      </span>
                    </div>
                    <p className="text-slate-600">
                      <strong className="text-slate-900">Engineering Justification:</strong> {req.reason}
                    </p>
                    <p className="text-slate-600">
                      <strong className="text-slate-900">Proposed Action:</strong> {req.proposedAction}
                    </p>
                    {req.adminNotes && (
                      <p className="text-blue-900 font-mono text-[11px]">
                        <strong>Governance Remark:</strong> {req.adminNotes}
                      </p>
                    )}
                  </div>

                  {req.status === 'PENDING' && (
                    <button
                      onClick={() => setSelectedRequest(req)}
                      className="min-h-[44px] px-4 py-2 rounded-lg bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs shadow-sm transition-colors self-start"
                    >
                      Review & Decide
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
        <div className="bg-white rounded-xl p-6 space-y-4 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">
              System Operations & Security Audit Trail
            </h2>
            <span className="text-[11px] font-mono text-slate-500">IMMUTABLE TAMPER-EVIDENT RECORD</span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 font-mono text-slate-600 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-semibold">Timestamp</th>
                  <th className="py-3 px-4 font-semibold">Action</th>
                  <th className="py-3 px-4 font-semibold">Target Entity</th>
                  <th className="py-3 px-4 font-semibold">Payload Audit Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-medium text-slate-800">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px]">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-purple-800">{log.action}</td>
                    <td className="py-3.5 px-4 font-medium text-slate-800">{log.entity}</td>
                    <td className="py-3.5 px-4 text-slate-600 font-mono text-[11px] max-w-xs truncate">
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
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 sm:p-8 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <PlusCircle className="h-5 w-5 text-purple-700" />
                Provision Utility Personnel Account
              </h3>
              <button
                onClick={() => setShowUserModal(false)}
                className="min-h-[44px] min-w-[44px] rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleProvisionSubmit} className="space-y-3.5 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700">Full Name</label>
                <input
                  type="text"
                  required
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="e.g. Engineer Farhan"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700">Staff Email</label>
                <input
                  type="email"
                  required
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="farhan@grid.gov.bd"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700">Mobile Phone</label>
                <input
                  type="text"
                  value={userPhone}
                  onChange={(e) => setUserPhone(e.target.value)}
                  placeholder="+8801700000000"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 font-mono focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700">Staff Role</label>
                <select
                  value={userRole}
                  onChange={(e) => setUserRole(e.target.value as UserRole)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600"
                >
                  <option value={UserRole.POWER_OPERATOR}>Power Operator (Control Room)</option>
                  <option value={UserRole.TECHNICIAN}>Field Technician (Repair Crew)</option>
                  <option value={UserRole.ZONE_MANAGER}>Zone Manager (District Supervisor)</option>
                  <option value={UserRole.ADMIN}>System Administrator</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700">Assigned Zone Scope (Optional)</label>
                <select
                  value={userZoneId}
                  onChange={(e) => setUserZoneId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600"
                >
                  <option value="">-- No specific district (System-wide) --</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>{z.name} ({z.code})</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="min-h-[44px] px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingUser}
                  className="min-h-[44px] px-5 py-2 font-bold text-white bg-purple-700 hover:bg-purple-800 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                >
                  {submittingUser ? 'Provisioning...' : 'Provision Staff'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Review Upgrade Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 sm:p-8 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Review Infrastructure Upgrade Petition
              </h3>
              <button
                onClick={() => setSelectedRequest(null)}
                className="min-h-[44px] min-w-[44px] rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1 font-mono text-[11px] text-slate-800">
              <p><strong>Feeder Line:</strong> {selectedRequest.feederName}</p>
              <p><strong>Engineering Reason:</strong> {selectedRequest.reason}</p>
              <p><strong>Proposed Action:</strong> {selectedRequest.proposedAction}</p>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700">
                Administrative Notes / Budget Rationale
              </label>
              <textarea
                rows={2}
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="e.g. Approved under FY26 infrastructure modernization grant..."
                className="w-full p-3 rounded-lg border border-slate-300 bg-white text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setSelectedRequest(null)}
                className="min-h-[44px] px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={approving}
                onClick={() => handleReviewRequest('REJECTED')}
                className="min-h-[44px] px-4 py-2 font-bold text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded-lg transition-colors"
              >
                Reject Petition
              </button>
              <button
                type="button"
                disabled={approving}
                onClick={() => handleReviewRequest('APPROVED')}
                className="min-h-[44px] px-5 py-2 font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors"
              >
                Approve & Fund
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
