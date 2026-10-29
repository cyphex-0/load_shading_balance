'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, AlertTriangle, Clock, MapPin, CheckCircle2, ShieldAlert, PlusCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { ApiClient } from '../../lib/api';
import { StatusBadge } from '../../components/StatusBadge';
import { getSocket } from '../../lib/socket';

export default function CustomerDashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Outage report modal state
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportDescription, setReportDescription] = useState('');
  const [reportLandmark, setReportLandmark] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportFeedback, setReportFeedback] = useState<any>(null);

  const fetchDashboard = async () => {
    setLoading(true);
    const res = await ApiClient.get('/api/customers/me/dashboard');
    if (res.success && res.data) {
      setDashboard(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }
    if (user) {
      fetchDashboard();

      // Listen to real-time ticket status changes
      const socket = getSocket();
      socket.on('ticket:status_changed', (data) => {
        console.log('Real-time ticket status changed:', data);
        fetchDashboard();
      });

      return () => {
        socket.off('ticket:status_changed');
      };
    }
  }, [user, authLoading]);

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dashboard?.primaryMeter) return;

    setSubmittingReport(true);
    setReportFeedback(null);

    const res = await ApiClient.post('/api/customers/me/outage-reports', {
      meterId: dashboard.primaryMeter.id,
      description: reportDescription,
      landmark: reportLandmark
    });

    setSubmittingReport(false);

    if (res.success && res.data) {
      setReportFeedback(res.data);
      setReportDescription('');
      setReportLandmark('');
      fetchDashboard();
    } else {
      setReportFeedback({
        error: res.error?.message || 'Failed to submit report'
      });
    }
  };

  if (authLoading || loading) {
    return (
      <div className="py-16 text-center space-y-3">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent" />
        <p className="text-xs text-slate-500">Loading your meter status...</p>
      </div>
    );
  }

  const primaryMeter = dashboard?.primaryMeter;
  const feeder = primaryMeter?.feeder;

  return (
    <div className="space-y-8">
      {/* Top Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Customer Electricity Portal</h1>
          <p className="text-xs text-slate-500">Welcome, {user?.name}. Real-time power monitoring for your residence.</p>
        </div>

        <button
          onClick={() => {
            setReportFeedback(null);
            setShowReportModal(true);
          }}
          className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-sm flex items-center gap-2 self-start transition-all"
        >
          <AlertTriangle className="h-4 w-4" />
          Report Power Outage
        </button>
      </div>

      {/* Primary Power Status Banner */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-slate-100 dark:border-slate-800">
          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Current Power Status</span>
            <div className="flex items-center gap-3">
              <StatusBadge status={feeder?.status || 'ONLINE'} size="lg" />
              {feeder?.isCritical && (
                <span className="text-xs font-bold text-red-600 bg-red-50 dark:bg-red-950/40 px-2.5 py-1 rounded-full border border-red-200 dark:border-red-800">
                  Critical Facility (Protected)
                </span>
              )}
            </div>
          </div>

          <div className="text-left sm:text-right space-y-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Registered Meter</span>
            <p className="text-lg font-mono font-bold text-slate-900 dark:text-white">
              {primaryMeter ? primaryMeter.meterNumber : 'No Meter Linked'}
            </p>
          </div>
        </div>

        {/* Meter & Line Details Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 text-xs">
          <div className="space-y-1">
            <span className="text-slate-400">Physical Address</span>
            <p className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-slate-400" />
              {primaryMeter?.address || '—'}
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-slate-400">Assigned Feeder Line</span>
            <p className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              {feeder?.name || '—'} ({feeder?.code || '—'})
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-slate-400">Substation / Zone</span>
            <p className="font-medium text-slate-800 dark:text-slate-200">
              {primaryMeter?.substationName || 'Substation 1'} • {primaryMeter?.zoneName || 'District'}
            </p>
          </div>
        </div>
      </div>

      {/* Outage Reports Tracking */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-500" />
          Active Outage Tickets ({dashboard?.activeOutages?.length || 0})
        </h2>

        {dashboard?.activeOutages?.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs">
            No active outage reports. Your feeder line is operating normally.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {dashboard.activeOutages.map((t: any) => (
              <div key={t.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-xs text-blue-600">{t.ticketNumber}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                      {t.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300">{t.description}</p>
                  <span className="text-[11px] text-slate-400">
                    Reported at: {new Date(t.reportedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <div className="text-xs font-semibold text-slate-500">
                  {t.status === 'REPORTED' && 'Awaiting Dispatch'}
                  {t.status === 'ASSIGNED' && 'Technician Assigned'}
                  {t.status === 'EN_ROUTE' && 'Technician Dispatched (En Route)'}
                  {t.status === 'REPAIRING' && 'Repair Work in Progress'}
                  {t.status === 'RESOLVED' && 'Power Restored'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Report Outage Modal (With Smart Conflict Resolution Display) */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-lg w-full p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-rose-500" />
                Report Unexpected Blackout
              </h3>
              <button
                onClick={() => setShowReportModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* Smart Conflict Resolution Result Banner */}
            {reportFeedback && (
              <div
                className={`p-4 rounded-2xl text-xs space-y-1.5 border ${
                  reportFeedback.isPlanned
                    ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                    : reportFeedback.ticketCreated
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    : 'bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                }`}
              >
                <div className="font-bold flex items-center gap-1.5 text-sm">
                  {reportFeedback.isPlanned ? (
                    <>
                      <Clock className="h-4 w-4" />
                      Smart Conflict Intercept: Planned Outage Active
                    </>
                  ) : reportFeedback.ticketCreated ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Fault Ticket Created ({reportFeedback.ticket?.ticketNumber})
                    </>
                  ) : (
                    'Notice'
                  )}
                </div>
                <p>{reportFeedback.message || reportFeedback.error}</p>
                {reportFeedback.scheduledEndTime && (
                  <p className="font-semibold">
                    Expected Restoration: {new Date(reportFeedback.scheduledEndTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            )}

            {!reportFeedback?.ticketCreated && (
              <form onSubmit={handleReportSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Target Meter / Line
                  </label>
                  <input
                    type="text"
                    disabled
                    value={`${primaryMeter?.meterNumber || 'MTR'} — ${feeder?.name || 'Feeder'}`}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/50 text-slate-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Description of Fault
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={reportDescription}
                    onChange={(e) => setReportDescription(e.target.value)}
                    placeholder="e.g. Heard a loud bang from the transformer near Road 27 corner..."
                    className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Nearby Landmark (Optional)
                  </label>
                  <input
                    type="text"
                    value={reportLandmark}
                    onChange={(e) => setReportLandmark(e.target.value)}
                    placeholder="e.g. Opposite Central Mosque"
                    className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowReportModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingReport}
                    className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-xl shadow-sm transition-all"
                  >
                    {submittingReport ? 'Evaluating Schedule...' : 'Submit Blackout Report'}
                  </button>
                </div>
              </form>
            )}

            {reportFeedback?.ticketCreated && (
              <button
                onClick={() => setShowReportModal(false)}
                className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-xs font-semibold"
              >
                Close & Return to Dashboard
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
