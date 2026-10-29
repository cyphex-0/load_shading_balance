'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Wrench,
  MapPin,
  CheckCircle2,
  Clock,
  Navigation,
  Camera,
  AlertCircle,
  FileText,
  ArrowRight,
  Radio,
  Check,
  X
} from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { ApiClient } from '../../lib/api';
import { getSocket } from '../../lib/socket';

export default function TechnicianDashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Resolution modal state
  const [resolvingTicket, setResolvingTicket] = useState<any>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [submittingResolve, setSubmittingResolve] = useState(false);

  const fetchAssignments = async () => {
    setLoading(true);
    const res = await ApiClient.get('/api/technicians/me/assignments');
    if (res.success && res.data) {
      setAssignments(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!authLoading && (!user || (user.role !== 'TECHNICIAN' && user.role !== 'ADMIN'))) {
      router.push('/login');
      return;
    }
    if (user) {
      fetchAssignments();

      // Listen for personal dispatch alerts
      const socket = getSocket();
      socket.emit('subscribe:technician');

      socket.on('ticket:assigned', (data) => {
        console.log('Received dispatch alert:', data);
        fetchAssignments();
      });

      return () => {
        socket.off('ticket:assigned');
      };
    }
  }, [user, authLoading]);

  // Handle Accept (ASSIGNED -> EN_ROUTE)
  const handleAccept = async (ticketId: string) => {
    const res = await ApiClient.post(`/api/technicians/me/assignments/${ticketId}/accept`);
    if (res.success) {
      fetchAssignments();
    } else {
      alert(res.error?.message || 'Failed to accept assignment');
    }
  };

  // Handle Start Repair (EN_ROUTE -> REPAIRING)
  const handleStartRepair = async (ticketId: string) => {
    const res = await ApiClient.post(`/api/technicians/me/assignments/${ticketId}/start-repair`);
    if (res.success) {
      fetchAssignments();
    } else {
      alert(res.error?.message || 'Failed to start repair');
    }
  };

  // Handle Final Resolution (REPAIRING -> RESOLVED)
  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvingTicket) return;

    setSubmittingResolve(true);

    let attachmentId: string | undefined;

    // Upload proof photo if selected
    if (photoFile) {
      const formData = new FormData();
      formData.append('photo', photoFile);
      formData.append('ticketId', resolvingTicket.ticketId);

      const uploadRes = await ApiClient.post('/api/technicians/me/uploads/repair-photo', formData);
      if (uploadRes.success && uploadRes.data) {
        attachmentId = uploadRes.data.attachmentId;
      }
    }

    const res = await ApiClient.post(`/api/technicians/me/assignments/${resolvingTicket.ticketId}/resolve`, {
      resolutionNotes,
      attachmentId
    });

    setSubmittingResolve(false);

    if (res.success) {
      setResolvingTicket(null);
      setResolutionNotes('');
      setPhotoFile(null);
      fetchAssignments();
    } else {
      alert(res.error?.message || 'Failed to resolve ticket');
    }
  };

  if (authLoading || loading) {
    return (
      <div className="py-24 text-center space-y-3">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-solid border-amber-500 border-r-transparent" />
        <p className="text-xs font-mono text-slate-400">CONNECTING TO FIELD DISPATCH FEED...</p>
      </div>
    );
  }

  const activeCount = assignments.filter((a) => a.status !== 'RESOLVED').length;

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      {/* Mobile-First Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200/80 dark:border-slate-800/80">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-[11px] font-mono font-semibold text-slate-400 uppercase tracking-wider">
              Field Terminal
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Wrench className="h-5 w-5 text-amber-500" />
            Technician Repair Queue
          </h1>
          <p className="text-xs text-slate-500">
            Crew Member: <strong className="text-slate-700 dark:text-slate-300">{user?.name}</strong> · Live Dispatch
          </p>
        </div>

        <span className="text-xs font-mono font-bold px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30">
          {activeCount} {activeCount === 1 ? 'TASK' : 'TASKS'} ACTIVE
        </span>
      </div>

      {/* Assignments List */}
      <div className="space-y-5">
        {assignments.length === 0 ? (
          <div className="glass-panel rounded-3xl p-8 sm:p-12 text-center space-y-3 border border-slate-200 dark:border-slate-800">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
            <h3 className="font-bold text-slate-900 dark:text-white text-base">All Faults Cleared</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              No active fault dispatches currently assigned to your crew. Stand by for automated alerts.
            </p>
          </div>
        ) : (
          assignments.map((task) => (
            <div
              key={task.assignmentId}
              className="glass-panel rounded-3xl p-6 space-y-5 border border-slate-200/80 dark:border-slate-800/80 shadow-sm"
            >
              {/* Task Header */}
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg">
                  {task.ticketNumber}
                </span>

                <span
                  className={`text-xs font-mono font-bold px-2.5 py-1 rounded-full border ${
                    task.status === 'ASSIGNED'
                      ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                      : task.status === 'EN_ROUTE'
                      ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                      : task.status === 'REPAIRING'
                      ? 'bg-orange-500/10 text-orange-600 border-orange-500/20'
                      : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                  }`}
                >
                  {task.status}
                </span>
              </div>

              {/* Visual Lifecycle Stepper */}
              <div className="grid grid-cols-4 gap-1 text-[10px] font-mono font-bold text-center">
                <div
                  className={`py-1 rounded-lg border ${
                    task.status === 'ASSIGNED' || task.status === 'EN_ROUTE' || task.status === 'REPAIRING' || task.status === 'RESOLVED'
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                      : 'bg-slate-100 dark:bg-slate-800/50 border-transparent text-slate-400'
                  }`}
                >
                  1. ASSIGNED
                </div>
                <div
                  className={`py-1 rounded-lg border ${
                    task.status === 'EN_ROUTE' || task.status === 'REPAIRING' || task.status === 'RESOLVED'
                      ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400'
                      : 'bg-slate-100 dark:bg-slate-800/50 border-transparent text-slate-400'
                  }`}
                >
                  2. EN ROUTE
                </div>
                <div
                  className={`py-1 rounded-lg border ${
                    task.status === 'REPAIRING' || task.status === 'RESOLVED'
                      ? 'bg-orange-500/10 border-orange-500/30 text-orange-600 dark:text-orange-400'
                      : 'bg-slate-100 dark:bg-slate-800/50 border-transparent text-slate-400'
                  }`}
                >
                  3. REPAIRING
                </div>
                <div
                  className={`py-1 rounded-lg border ${
                    task.status === 'RESOLVED'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                      : 'bg-slate-100 dark:bg-slate-800/50 border-transparent text-slate-400'
                  }`}
                >
                  4. RESTORED
                </div>
              </div>

              {/* Task Details */}
              <div className="space-y-2.5 text-xs">
                <div>
                  <span className="text-[11px] text-slate-400 font-mono block">Feeder Line & Substation</span>
                  <p className="font-bold text-slate-900 dark:text-white text-sm">
                    {task.feederName} · {task.substationName} ({task.zoneName})
                  </p>
                </div>

                <div>
                  <span className="text-[11px] text-slate-400 font-mono block">Customer Outage Report</span>
                  <p className="text-slate-800 dark:text-slate-200 bg-slate-50/80 dark:bg-slate-900/80 p-3 rounded-xl border border-slate-200/50 dark:border-slate-800/50 leading-relaxed font-medium">
                    {task.description}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 text-slate-500 pt-1 font-medium">
                  <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span>{task.address || 'Field Grid Location'}</span>
                  {task.landmark && (
                    <span className="text-slate-400 font-semibold">· Landmark: {task.landmark}</span>
                  )}
                </div>
              </div>

              {/* Action Buttons with Minimum 44px Touch Targets */}
              <div className="pt-3 border-t border-slate-200/60 dark:border-slate-800/60">
                {task.status === 'ASSIGNED' && (
                  <button
                    onClick={() => handleAccept(task.ticketId)}
                    className="w-full min-h-[44px] py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
                  >
                    <Navigation className="h-4 w-4" />
                    Accept Dispatch & Mark En Route
                  </button>
                )}

                {task.status === 'EN_ROUTE' && (
                  <button
                    onClick={() => handleStartRepair(task.ticketId)}
                    className="w-full min-h-[44px] py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-sm flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
                  >
                    <Wrench className="h-4 w-4" />
                    Arrived on Site — Begin Repair Work
                  </button>
                )}

                {task.status === 'REPAIRING' && (
                  <button
                    onClick={() => setResolvingTicket(task)}
                    className="w-full min-h-[44px] py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
                  >
                    <Camera className="h-4 w-4" />
                    Upload Photo Proof & Restore Line Power
                  </button>
                )}

                {task.status === 'RESOLVED' && (
                  <div className="flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-semibold py-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Repair completed & power restored to feeder line.
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Resolution & Photo Proof Modal */}
      {resolvingTicket && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel bg-white dark:bg-slate-950 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 sm:p-8 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                Submit Repair Proof & Restore Feeder
              </h3>
              <button
                onClick={() => setResolvingTicket(null)}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-white"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleResolveSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Technician Work Notes (Required)
                </label>
                <textarea
                  required
                  rows={3}
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="e.g. Replaced blown 100kVA transformer drop-out fuse, tested voltage, re-energized feeder..."
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/70 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Camera className="h-3.5 w-3.5 text-slate-400" />
                  Repair Photo Proof (JPEG, PNG, WebP &lt; 10MB)
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setPhotoFile(e.target.files ? e.target.files[0] : null)}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-amber-500/10 file:text-amber-700 dark:file:text-amber-400 hover:file:bg-amber-500/20"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setResolvingTicket(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingResolve || !resolutionNotes}
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-sm transition-all disabled:opacity-50"
                >
                  {submittingResolve ? 'Restoring Power...' : 'Confirm Restoration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
