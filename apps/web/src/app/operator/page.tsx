'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Zap,
  Activity,
  ShieldAlert,
  CheckCircle2,
  UserCheck,
  RefreshCw,
  Send,
  X
} from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { ApiClient } from '../../lib/api';
import { StatusBadge } from '../../components/StatusBadge';
import { getSocket } from '../../lib/socket';

export default function OperatorDashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [overview, setOverview] = useState<any>(null);
  const [outages, setOutages] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Scheduler Form State
  const [planningDate, setPlanningDate] = useState('2026-09-25');
  const [deficitMW, setDeficitMW] = useState(25);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('14:00');
  const [slotDurationMinutes, setSlotDurationMinutes] = useState(60);
  const [generating, setGenerating] = useState(false);
  const [draftPlan, setDraftPlan] = useState<any>(null);
  const [publishSuccess, setPublishSuccess] = useState<string | null>(null);

  // Dispatch modal state
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [selectedTechId, setSelectedTechId] = useState('');
  const [dispatching, setDispatching] = useState(false);

  const fetchOverview = async () => {
    const res = await ApiClient.get('/api/operator/overview');
    if (res.success && res.data) setOverview(res.data);
  };

  const fetchOutages = async () => {
    const res = await ApiClient.get('/api/operators/outage-reports');
    if (res.success && res.data) setOutages(res.data);
  };

  const fetchTechnicians = async () => {
    const res = await ApiClient.get('/api/v1/manager/technicians');
    if (res.success && res.data) setTechnicians(res.data);
  };

  useEffect(() => {
    if (!authLoading && (!user || (user.role !== 'POWER_OPERATOR' && user.role !== 'ADMIN'))) {
      router.push('/login');
      return;
    }
    if (user) {
      setLoading(true);
      Promise.all([fetchOverview(), fetchOutages(), fetchTechnicians()]).finally(() => {
        setLoading(false);
      });

      // Socket.io room subscription & event listeners
      const socket = getSocket();
      socket.emit('subscribe:operator');

      socket.on('ticket:created', (data) => {
        console.log('New outage ticket reported:', data);
        fetchOutages();
        fetchOverview();
      });

      socket.on('feeder:status_changed', () => {
        fetchOverview();
        fetchOutages();
      });

      return () => {
        socket.off('ticket:created');
        socket.off('feeder:status_changed');
      };
    }
  }, [user, authLoading]);

  // Handle generating draft plan via fair-rotation algorithm
  const handleGeneratePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setPublishSuccess(null);

    const res = await ApiClient.post('/api/operator/schedules/draft', {
      planningDate,
      deficitMW: Number(deficitMW),
      startTime,
      endTime,
      slotDurationMinutes: Number(slotDurationMinutes)
    });

    setGenerating(false);

    if (res.success && res.data) {
      setDraftPlan(res.data);
    } else {
      alert(res.error?.message || 'Failed to generate schedule plan');
    }
  };

  // Handle publishing schedule
  const handlePublishPlan = async () => {
    if (!draftPlan?.id) return;
    const res = await ApiClient.post(`/api/operator/schedules/${draftPlan.id}/publish`);
    if (res.success && res.data) {
      setPublishSuccess(
        `Plan published successfully! Redis cache pre-warmed. Broadcast SMS queued for ${res.data.customersNotified} customers.`
      );
      setDraftPlan(null);
      fetchOverview();
    } else {
      alert(res.error?.message || 'Failed to publish plan');
    }
  };

  // Handle technician dispatch
  const handleDispatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !selectedTechId) return;

    setDispatching(true);
    const res = await ApiClient.post(`/api/operators/outage-reports/${selectedTicket.id}/assign`, {
      technicianId: selectedTechId
    });
    setDispatching(false);

    if (res.success) {
      setSelectedTicket(null);
      setSelectedTechId('');
      fetchOutages();
      fetchOverview();
    } else {
      alert(res.error?.message || 'Failed to assign technician');
    }
  };

  if (authLoading || loading) {
    return (
      <div className="py-24 text-center space-y-3">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-solid border-amber-500 border-r-transparent" />
        <p className="text-xs font-mono text-slate-500">INITIALIZING POWER CONTROL ROOM TELEMETRY...</p>
      </div>
    );
  }

  const metrics = overview?.metrics;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-600" />
            <span className="text-[11px] font-mono font-semibold text-slate-500 uppercase tracking-wider">
              Control Room Console
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2.5">
            <Activity className="h-6 w-6 text-blue-600" />
            National Dispatch & Deficit Management
          </h1>
          <p className="text-xs text-slate-500">
            Real-time generation deficit mitigation, fair-rotation scheduling, and emergency fault dispatch.
          </p>
        </div>

        <button
          onClick={() => {
            fetchOverview();
            fetchOutages();
          }}
          className="min-h-[44px] px-4 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-mono font-semibold inline-flex items-center gap-2 self-start transition-colors"
        >
          <RefreshCw className="h-4 w-4" /> REFRESH METRICS
        </button>
      </div>

      {/* Grid Load & Deficit Real-Time Telemetry Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-1 shadow-sm">
          <span className="text-xs font-semibold text-slate-600">System Demand</span>
          <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono-numbers">
            {metrics?.totalDemandMW ? `${metrics.totalDemandMW.toLocaleString()} MW` : '12,500 MW'}
          </p>
          <span className="text-[11px] font-mono text-blue-700">National grid load</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-1 shadow-sm">
          <span className="text-xs font-semibold text-emerald-800">Available Generation</span>
          <p className="text-2xl sm:text-3xl font-extrabold text-emerald-700 font-mono-numbers">
            {metrics?.availableCapacityMW ? `${metrics.availableCapacityMW.toLocaleString()} MW` : '11,200 MW'}
          </p>
          <span className="text-[11px] font-mono text-emerald-700">Active power supply</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-1 shadow-sm">
          <span className="text-xs font-semibold text-amber-800">Generation Deficit</span>
          <p className="text-2xl sm:text-3xl font-extrabold text-amber-700 font-mono-numbers">
            {metrics?.currentDeficitMW ? `${metrics.currentDeficitMW.toLocaleString()} MW` : '1,300 MW'}
          </p>
          <span className="text-[11px] font-mono text-amber-700">Requires fair rotation</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-1 shadow-sm">
          <span className="text-xs font-semibold text-rose-800">Unexpected Fault Tickets</span>
          <p className="text-2xl sm:text-3xl font-extrabold text-rose-700 font-mono-numbers">
            {outages.length}
          </p>
          <span className="text-[11px] font-mono text-rose-700">Field repair queue</span>
        </div>
      </div>

      {/* Load Shedding Algorithmic Plan Generator */}
      <div className="bg-white rounded-xl p-6 sm:p-8 space-y-6 border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            Fair-Rotation Load Shedding Engine
          </h2>
          <p className="text-xs text-slate-500">
            Enforces Hospital Line Shielding, No-Double-Cut Rule, and least-cut round robin rotation.
          </p>
        </div>

        {publishSuccess && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-semibold flex items-center gap-2.5">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
            <span>{publishSuccess}</span>
          </div>
        )}

        <form onSubmit={handleGeneratePlan} className="grid grid-cols-1 sm:grid-cols-5 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Target Date</label>
            <input
              type="date"
              required
              value={planningDate}
              onChange={(e) => setPlanningDate(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Deficit (MW)</label>
            <input
              type="number"
              required
              min={1}
              value={deficitMW}
              onChange={(e) => setDeficitMW(Number(e.target.value))}
              className="w-full text-xs px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Start Time</label>
            <input
              type="time"
              required
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">End Time</label>
            <input
              type="time"
              required
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={generating}
              className="w-full min-h-[44px] py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-sm transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Zap className="h-4 w-4" />
              {generating ? 'Calculating...' : 'Calculate Slots'}
            </button>
          </div>
        </form>

        {/* Generated Draft Plan Preview */}
        {draftPlan && (
          <div className="pt-6 border-t border-slate-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-mono font-bold text-amber-900 uppercase tracking-wider block">
                  Draft Schedule #{draftPlan.id} · {draftPlan.planningDate}
                </span>
                <p className="text-xs text-slate-600">
                  Total Shortfall: <strong className="text-slate-900">{draftPlan.totalDeficitMW} MW</strong> across {draftPlan.slots?.length} rotation intervals.
                </p>
              </div>

              <button
                onClick={handlePublishPlan}
                className="min-h-[44px] px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-colors flex items-center gap-2 self-start"
              >
                <Send className="h-4 w-4" />
                Publish Schedule & Notify Customers
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {draftPlan.slots?.map((slot: any, idx: number) => (
                <div
                  key={slot.id}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between font-bold text-slate-900">
                    <span>
                      Slot {idx + 1}: {new Date(slot.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {new Date(slot.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="font-mono text-amber-800">
                      {slot.actualDeficitMW} MW Curtailed
                    </span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] text-slate-500 font-medium">Curtailed Feeder Lines:</span>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {slot.feeders?.map((f: any) => (
                        <span
                          key={f.feederId}
                          className="px-2 py-0.5 rounded bg-white border border-slate-200 font-mono text-[11px] text-slate-800"
                        >
                          {f.code} ({f.capacityMW} MW)
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Outage Reports & Technician Dispatch Board */}
      <div className="bg-white rounded-xl p-6 space-y-4 border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-rose-600" />
              Unexpected Outages Queue & Field Dispatch
            </h2>
            <p className="text-xs text-slate-500">Live feed of verified unplanned faults awaiting repair crew assignment.</p>
          </div>
          <span className="text-[11px] font-mono font-bold text-rose-800 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200">
            {outages.length} ACTIVE FAULTS
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 font-mono text-slate-600 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 font-semibold">Ticket</th>
                <th className="py-3 px-4 font-semibold">Feeder Line</th>
                <th className="py-3 px-4 font-semibold">District</th>
                <th className="py-3 px-4 font-semibold">Fault Description</th>
                <th className="py-3 px-4 font-semibold">Reported</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold">Crew</th>
                <th className="py-3 px-4 font-semibold text-right">Dispatch</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-medium text-slate-800">
              {outages.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 font-mono text-xs">
                    No active unexpected faults reported. Grid lines normal.
                  </td>
                </tr>
              ) : (
                outages.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-amber-700">{t.ticketNumber}</td>
                    <td className="py-3.5 px-4 font-bold text-slate-900">{t.feederName}</td>
                    <td className="py-3.5 px-4 text-slate-600">{t.zoneName || 'District'}</td>
                    <td className="py-3.5 px-4 text-slate-700 max-w-xs truncate">{t.description}</td>
                    <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px]">
                      {new Date(t.reportedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={t.status} size="sm" />
                    </td>
                    <td className="py-3.5 px-4">
                      {t.assignedTechnician ? (
                        <span className="text-emerald-700 font-semibold">{t.assignedTechnician.name}</span>
                      ) : (
                        <span className="text-slate-400 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => setSelectedTicket(t)}
                        className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 font-bold text-xs inline-flex items-center justify-center transition-colors"
                      >
                        {t.assignedTechnician ? 'Reassign' : 'Dispatch Crew'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dispatch Modal */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 sm:p-8 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-blue-600" />
                Dispatch Field Technician Crew
              </h3>
              <button
                onClick={() => setSelectedTicket(null)}
                className="min-h-[44px] min-w-[44px] rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1 font-mono text-slate-800">
              <p><strong>Ticket:</strong> {selectedTicket.ticketNumber}</p>
              <p><strong>Feeder:</strong> {selectedTicket.feederName}</p>
              <p className="truncate"><strong>Description:</strong> {selectedTicket.description}</p>
            </div>

            <form onSubmit={handleDispatchSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Select Active Technician Crew
                </label>
                <select
                  required
                  value={selectedTechId}
                  onChange={(e) => setSelectedTechId(e.target.value)}
                  className="w-full text-xs px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                >
                  <option value="">-- Choose Field Crew --</option>
                  {technicians.map((tech) => (
                    <option key={tech.id} value={tech.id}>
                      {tech.name} ({tech.phone || 'No phone'}) — [{tech.currentTaskStatus}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedTicket(null)}
                  className="min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={dispatching || !selectedTechId}
                  className="min-h-[44px] px-5 py-2 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                >
                  {dispatching ? 'Assigning...' : 'Confirm Dispatch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
