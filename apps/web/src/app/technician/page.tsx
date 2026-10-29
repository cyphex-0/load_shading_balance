'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wrench, MapPin, CheckCircle2, Clock, Navigation, Camera, AlertCircle, FileText, ArrowRight } from 'lucide-react';
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
      <div className="py-16 text-center space-y-3">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-orange-500 border-r-transparent" />
        <p className="text-xs text-slate-500">Loading assigned tasks...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Wrench className="h-5 w-5 text-orange-500" />
            Field Technician Repair Queue
          </h1>
          <p className="text-xs text-slate-500">Crew Member: {user?.name} • Scoped Dispatch</p>
        </div>
        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-orange-500/10 text-orange-600 border border-orange-500/20">
          {assignments.filter((a) => a.status !== 'RESOLVED').length} Active
        </span>
      </div>

      {/* Assignments List */}
      <div className="space-y-4">
        {assignments.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 text-center space-y-2">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
            <h3 className="font-bold text-slate-900 dark:text-white text-base">All Caught Up!</h3>
            <p className="text-xs text-slate-500">No active fault assignments currently in your dispatch queue.</p>
          </div>
        ) : (
          assignments.map((task) => (
            <div
              key={task.assignmentId}
              className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-xs text-blue-600 bg-blue-50 dark:bg-blue-950/40 px-2.5 py-1 rounded-lg">
                  {task.ticketNumber}
                </span>

                <span
                  className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
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

              {/* Task Location & Description */}
              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-slate-400 font-medium">Feeder & Substation</span>
                  <p className="font-bold text-slate-800 dark:text-slate-200">
                    {task.feederName} • {task.substationName} ({task.zoneName})
                  </p>
                </div>

                <div>
                  <span className="text-slate-400 font-medium">Customer Reported Fault</span>
                  <p className="text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                    {task.description}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 text-slate-500 pt-1">
                  <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span>{task.address || 'Field Location'}</span>
                  {task.landmark && <span className="text-slate-400 font-semibold">• Landmark: {task.landmark}</span>}
                </div>
              </div>

              {/* Action Buttons Based on Current State */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                {task.status === 'ASSIGNED' && (
                  <button
                    onClick={() => handleAccept(task.ticketId)}
                    className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-2 transition-all"
                  >
                    <Navigation className="h-4 w-4" />
                    Accept Dispatch & Mark En Route
                  </button>
                )}

                {task.status === 'EN_ROUTE' && (
                  <button
                    onClick={() => handleStartRepair(task.ticketId)}
                    className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-sm flex items-center justify-center gap-2 transition-all"
                  >
                    <Wrench className="h-4 w-4" />
                    Arrived on Site — Start Repair
                  </button>
                )}

                {task.status === 'REPAIRING' && (
                  <button
                    onClick={() => setResolvingTicket(task)}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-2 transition-all"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Upload Photo & Resolve Ticket
                  </button>
                )}

                {task.status === 'RESOLVED' && (
                  <div className="flex items-center gap-2 text-emerald-600 text-xs font-semibold py-1">
                    <CheckCircle2 className="h-4 w-4" />
                    Repair completed & power restored to feeder.
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Resolution & Photo Proof Modal */}
      {resolvingTicket && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                Submit Repair Proof & Resolve
              </h3>
              <button
                onClick={() => setResolvingTicket(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleResolveSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Resolution Notes (Required)
                </label>
                <textarea
                  required
                  rows={3}
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="e.g. Replaced 100kVA blown drop-out fuse and re-energized feeder..."
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Camera className="h-3.5 w-3.5 text-slate-400" />
                  Repair Photo Proof (JPEG, PNG, WebP &lt; 10MB)
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setPhotoFile(e.target.files ? e.target.files[0] : null)}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResolvingTicket(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingResolve || !resolutionNotes}
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-sm transition-all"
                >
                  {submittingResolve ? 'Verifying & Restoring...' : 'Confirm Restoration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
