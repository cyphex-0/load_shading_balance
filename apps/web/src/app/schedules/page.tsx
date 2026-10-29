'use client';

import React, { useEffect, useState } from 'react';
import { Clock, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { ApiClient } from '../../lib/api';

export default function PublicSchedulesPage() {
  const [feeders, setFeeders] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [selectedZone, setSelectedZone] = useState('ALL');
  const [search, setSearch] = useState('');
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
    const matchesZone = selectedZone === 'ALL' || f.zoneId === selectedZone;
    const matchesSearch =
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.code.toLowerCase().includes(search.toLowerCase());
    return matchesZone && matchesSearch;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="text-[11px] font-mono font-semibold text-slate-500 uppercase tracking-wider">
              Transparency Portal
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2.5">
            <Clock className="h-6 w-6 text-amber-500" />
            Public Load Shedding Timetables
          </h1>
          <p className="text-xs text-slate-500">
            Official scheduled power rotation timetables published by national electricity distribution authorities. High-speed Redis edge cache.
          </p>
        </div>

        <button
          onClick={fetchPublicGrid}
          className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-mono font-semibold flex items-center gap-2 self-start transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> REFRESH CACHE
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs border border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">City District:</span>
            <select
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
            >
              <option value="ALL">All City Zones ({feeders.length} Feeders)</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name} ({z.code})
                </option>
              ))}
            </select>
          </div>

          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-3 top-2 text-slate-400" />
            <input
              type="text"
              placeholder="Search feeder..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 w-40 sm:w-56"
            />
          </div>
        </div>

        <span className="text-[11px] font-mono text-slate-500 font-medium">
          SHOWING {filteredFeeders.length} LINES
        </span>
      </div>

      {/* Schedule Rotation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-16 text-center text-xs font-mono text-slate-500">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-solid border-amber-500 border-r-transparent mb-2" />
            <p>FETCHING SCHEDULED TIMETABLES...</p>
          </div>
        ) : filteredFeeders.length === 0 ? (
          <div className="col-span-full py-12 text-center text-xs font-mono text-slate-500">
            No feeder schedules found matching the filter criteria.
          </div>
        ) : (
          filteredFeeders.map((f) => (
            <div
              key={f.id}
              className="bg-white p-5 rounded-xl space-y-3.5 border border-slate-200 shadow-sm hover:border-slate-300 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-slate-900">{f.name}</span>
                <span className="font-mono text-xs text-amber-900 bg-amber-50 px-2 py-0.5 rounded font-bold border border-amber-200">
                  {f.code}
                </span>
              </div>

              <div className="text-xs space-y-1.5 text-slate-600">
                <p className="flex justify-between">
                  <span>Substation:</span>
                  <strong className="text-slate-800">{f.substationName || 'Central'}</strong>
                </p>
                <p className="flex justify-between">
                  <span>Line Capacity:</span>
                  <strong className="font-mono text-slate-800">{f.capacityMW} MW</strong>
                </p>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-xs">
                {f.isCritical ? (
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold text-purple-800 bg-purple-50 px-2.5 py-1 rounded-full border border-purple-200">
                    <ShieldCheck className="h-3 w-3 text-purple-600" />
                    Hospital Line (No Cuts)
                  </span>
                ) : (
                  <span className="text-[11px] font-mono font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                    Rotates Fairly 08:00 – 14:00
                  </span>
                )}
                <span className="font-mono text-[10px] text-slate-500">1x/DAY MAX</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
