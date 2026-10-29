'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Zap,
  AlertTriangle,
  Clock,
  MapPin,
  CheckCircle2,
  ShieldCheck,
  X
} from 'lucide-react';
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
      <div className="py-24 text-center space-y-3">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-solid border-amber-500 border-r-transparent" />
        <p className="text-xs font-mono text-slate-500">CONNECTING TO METER TELEMETRY...</p>
      </div>
    );
  }

  const primaryMeter = dashboard?.primaryMeter;
  const feeder = primaryMeter?.feeder;
  const isPowerOnline = feeder?.status === 'ONLINE';

  return (
    <div className="space-y-6 pb-12">
      {/* Top Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-600" />
            <span className="text-[11px] font-mono font-semibold text-slate-500 uppercase tracking-wider">
              Customer Terminal
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Residential Power Console
          </h1>
          <p className="text-xs text-slate-600">
            Welcome, <strong className="text-slate-900">{user?.name}</strong>. Real-time feeder line monitoring and outage telemetry.
          </p>
        </div>

        <button
          onClick={() => {
            setReportFeedback(null);
            setShowReportModal(true);
          }}
          className="min-h-[44px] px-4 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm flex items-center gap-2 self-start transition-colors"
        >
          <AlertTriangle className="h-4 w-4" />
          Report Power Outage
        </button>
      </div>

      {/* Primary Power Status Console Card */}
      <div className="bg-white rounded-xl p-6 sm:p-8 space-y-6 border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-slate-200">
          <div className="space-y-3">
            <span className="text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider block">
              Current Power Supply State
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={feeder?.status || 'ONLINE'} size="lg" />
              {feeder?.isCritical && (
                <span className="text-xs font-mono font-bold text-purple-800 bg-purple-50 px-3 py-1.5 rounded-full border border-purple-200 flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-purple-600" />
                  Shielded Critical Line (Zero Shedding)
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600">
              {isPowerOnline
                ? 'Your transmission line is fully energized and operating under normal grid load.'
                : 'Power cut active. The system is tracking your feeder line status.'}
            </p>
          </div>

          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-left sm:text-right space-y-1">
            <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider block">
              Registered Electric Meter
            </span>
            <p className="text-lg font-mono font-extrabold text-amber-700">
              {primaryMeter ? primaryMeter.meterNumber : 'No Meter Linked'}
            </p>
            <span className="text-[10px] text-slate-500 block font-mono">
              Type: Smart Digital Postpaid
            </span>
          </div>
        </div>

        {/* Meter & Line Details Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-medium">
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
            <span className="text-slate-500 text-[11px] block">Premises Address</span>
            <p className="font-semibold text-slate-900 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span className="truncate">{primaryMeter?.address || 'House 14, Road 7, Dhaka'}</span>
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
            <span className="text-slate-500 text-[11px] block">Assigned Feeder Line</span>
            <p className="font-semibold text-slate-900 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span className="truncate">
                {feeder?.name || 'Feeder 1'} ({feeder?.code || 'FDR-01'})
              </span>
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
            <span className="text-slate-500 text-[11px] block">Substation & Zone</span>
            <p className="font-semibold text-slate-900">
              {primaryMeter?.substationName || 'Dhanmondi Central'} • {primaryMeter?.zoneName || 'Dhanmondi'}
            </p>
          </div>
        </div>
      </div>

      {/* Outage Reports Tracking Queue */}
      <div className="bg-white rounded-xl p-6 space-y-4 border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600" />
            Your Outage Ticket History ({dashboard?.activeOutages?.length || 0})
          </h2>
          <span className="text-[11px] font-mono font-medium text-slate-500">
            AUTO-REFRESH VIA WEBSOCKET
          </span>
        </div>

        {dashboard?.activeOutages?.length === 0 ? (
          <div className="py-12 text-center space-y-2 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
            <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto" />
            <p className="text-xs font-semibold text-slate-800">
              Zero Active Faults on Your Meter Line
            </p>
            <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
              If your power goes out suddenly, use the &quot;Report Power Outage&quot; button above. The system will instantly check for scheduled cuts before dispatching crews.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {dashboard.activeOutages.map((t: any) => (
              <div key={t.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono font-bold text-xs text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      {t.ticketNumber}
                    </span>
                    <StatusBadge status={t.status} size="sm" />
                  </div>
                  <p className="text-xs font-medium text-slate-800">{t.description}</p>
                  <span className="text-[10px] font-mono text-slate-500 block">
                    Reported on: {new Date(t.reportedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </div>

                <div className="text-xs font-semibold text-slate-600 text-right">
                  <span className="text-[11px] font-mono px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                    {t.status === 'REPORTED' && 'Waiting in Dispatch Queue'}
                    {t.status === 'ASSIGNED' && 'Technician Assigned'}
                    {t.status === 'EN_ROUTE' && 'Crew Traveling to Site'}
                    {t.status === 'REPAIRING' && 'Repair Work In Progress'}
                    {t.status === 'RESOLVED' && 'Electricity Restored'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Report Outage Modal with Smart Conflict Feedback */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 sm:p-8 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-rose-600" />
                Report Unexpected Electricity Outage
              </h3>
              <button
                onClick={() => setShowReportModal(false)}
                className="min-h-[44px] min-w-[44px] rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Smart Conflict Resolution Result Banner */}
            {reportFeedback && (
              <div
                className={`p-4 rounded-xl text-xs space-y-2 border ${
                  reportFeedback.isPlanned
                    ? 'bg-amber-50 text-amber-950 border-amber-300'
                    : reportFeedback.ticketCreated
                    ? 'bg-emerald-50 text-emerald-950 border-emerald-300'
                    : 'bg-rose-50 text-rose-950 border-rose-300'
                }`}
              >
                <div className="font-bold flex items-center gap-2 text-sm">
                  {reportFeedback.isPlanned ? (
                    <>
                      <Clock className="h-4 w-4 text-amber-700" />
                      Smart Conflict Intercepted: Planned Load Shedding Active
                    </>
                  ) : reportFeedback.ticketCreated ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                      Genuine Fault Ticket Created ({reportFeedback.ticket?.ticketNumber})
                    </>
                  ) : (
                    'Notice'
                  )}
                </div>
                <p className="leading-relaxed">{reportFeedback.message || reportFeedback.error}</p>
                {reportFeedback.scheduledEndTime && (
                  <p className="font-mono font-bold text-xs pt-1">
                    Expected Line Restoration:{' '}
                    {new Date(reportFeedback.scheduledEndTime).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                )}
              </div>
            )}

            {!reportFeedback?.ticketCreated && (
              <form onSubmit={handleReportSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    Associated Meter & Feeder
                  </label>
                  <input
                    type="text"
                    disabled
                    value={`${primaryMeter?.meterNumber || 'MTR'} — ${feeder?.name || 'Feeder'}`}
                    className="w-full text-xs px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-100 font-mono text-slate-600"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    Fault Observation / Symptoms
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={reportDescription}
                    onChange={(e) => setReportDescription(e.target.value)}
                    placeholder="e.g. Sudden voltage drop followed by blackout, heard transformer pop..."
                    className="w-full text-xs p-3 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 font-medium"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    Nearest Landmark (Optional)
                  </label>
                  <input
                    type="text"
                    value={reportLandmark}
                    onChange={(e) => setReportLandmark(e.target.value)}
                    placeholder="e.g. Opposite Central Park gate"
                    className="w-full text-xs px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 font-medium"
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowReportModal(false)}
                    className="min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingReport}
                    className="min-h-[44px] px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition-colors"
                  >
                    {submittingReport ? 'Evaluating Schedule...' : 'Verify & Submit Report'}
                  </button>
                </div>
              </form>
            )}

            {reportFeedback?.ticketCreated && (
              <button
                onClick={() => setShowReportModal(false)}
                className="w-full min-h-[44px] py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors"
              >
                Done
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
