'use client';

import React, { useEffect, useState } from 'react';
import { Clock, Calendar, Zap, RefreshCw, Search } from 'lucide-react';
import { ApiClient } from '../../lib/api';

export default function PublicSchedulesPage() {
  const [feeders, setFeeders] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [selectedZone, setSelectedZone] = useState('ALL');
  const [loading, setLoading] = useState(true);

  const fetchPublicGrid = async () => {
    setLoading(true);
    const [feedersRes, zonesRes] = await Promise.all([
      ApiClient.get('/api/feeders'),
      ApiClient.get('/api/zones')
    ]);

    if (feedersRes.success) setFeeders(feedersRes.data || []);
    if (zonesRes.success) setZones(zonesRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchPublicGrid();
  }, []);

  const filteredFeeders = feeders.filter((f) => {
    if (selectedZone === 'ALL') return true;
    return f.zoneId === selectedZone;
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Clock className="h-6 w-6 text-amber-500" />
          Public Load Shedding Schedules & Rotations
        </h1>
        <p className="text-xs text-slate-500">
          Official load-shedding timetables published by national electricity distribution authorities. High-speed cache enabled.
        </p>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-500">Filter by City Zone:</span>
          <select
            value={selectedZone}
            onChange={(e) => setSelectedZone(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-medium"
          >
            <option value="ALL">All City Zones</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>{z.name} ({z.code})</option>
            ))}
          </select>
        </div>

        <button
          onClick={fetchPublicGrid}
          className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 flex items-center gap-1.5 self-start"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh Schedule
        </button>
      </div>

      {/* Schedule Rotation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-12 text-center text-xs text-slate-400">Loading schedules...</div>
        ) : filteredFeeders.length === 0 ? (
          <div className="col-span-full py-12 text-center text-xs text-slate-400">No schedules found for this selection.</div>
        ) : (
          filteredFeeders.map((f) => (
            <div
              key={f.id}
              className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-slate-900 dark:text-white">{f.name}</span>
                <span className="font-mono text-xs text-blue-600 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded font-bold">
                  {f.code}
                </span>
              </div>

              <div className="text-xs space-y-1 text-slate-500">
                <p><strong>District:</strong> {f.zoneName || 'City Zone'}</p>
                <p><strong>Substation:</strong> {f.substationName || 'Central'}</p>
                <p><strong>Capacity:</strong> {f.capacityMW} MW</p>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                {f.isCritical ? (
                  <span className="font-bold text-red-600 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded">
                    Shielded Hospital Line (No Cuts)
                  </span>
                ) : (
                  <span className="font-semibold text-slate-600 dark:text-slate-300">
                    Rotation Interval: 1 hr / slot
                  </span>
                )}
                <span className="text-[11px] font-mono font-medium text-emerald-600">
                  {f.status === 'ONLINE' ? 'Currently Online' : f.status}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
