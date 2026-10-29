import React from 'react';
import { FeederStatus, OutageStatus } from '@load-shedding/shared';
import { CheckCircle2, Clock, AlertTriangle, Activity, Wrench, Check, XCircle } from 'lucide-react';

interface StatusBadgeProps {
  status: FeederStatus | OutageStatus | string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  showIcon = true
}) => {
  const normalized = String(status).toUpperCase();

  const sizeClasses = {
    sm: 'text-[11px] px-2 py-0.5 gap-1',
    md: 'text-xs font-semibold px-2.5 py-1 gap-1.5',
    lg: 'text-sm font-semibold px-3 py-1.5 gap-2'
  };

  // 1. Feeder ONLINE
  if (normalized === 'ONLINE') {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300 font-mono-numbers ${sizeClasses[size]}`}
      >
        {showIcon && <span className="h-2 w-2 rounded-full bg-emerald-600 shrink-0" />}
        Online (Transmitting)
      </span>
    );
  }

  // 2. PLANNED_OUTAGE
  if (normalized === 'PLANNED_OUTAGE') {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-amber-50 text-amber-800 border border-amber-300 font-mono-numbers ${sizeClasses[size]}`}
      >
        {showIcon && <Clock className="h-3 w-3 text-amber-700 shrink-0" />}
        Planned Load Shedding
      </span>
    );
  }

  // 3. UNEXPECTED_FAULT
  if (normalized === 'UNEXPECTED_FAULT') {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-rose-50 text-rose-800 border border-rose-300 font-mono-numbers ${sizeClasses[size]}`}
      >
        {showIcon && <AlertTriangle className="h-3 w-3 text-rose-700 shrink-0" />}
        Emergency Grid Fault
      </span>
    );
  }

  // 4. Ticket Statuses
  if (normalized === 'REPORTED') {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-amber-50 text-amber-800 border border-amber-300 font-mono-numbers ${sizeClasses[size]}`}
      >
        {showIcon && <Clock className="h-3 w-3 text-amber-700 shrink-0" />}
        Reported (Awaiting Triage)
      </span>
    );
  }

  if (normalized === 'PENDING') {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-amber-50 text-amber-800 border border-amber-300 font-mono-numbers ${sizeClasses[size]}`}
      >
        {showIcon && <Clock className="h-3 w-3 text-amber-700 shrink-0" />}
        Pending Triage
      </span>
    );
  }

  if (normalized === 'ASSIGNED') {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-blue-50 text-blue-800 border border-blue-300 font-mono-numbers ${sizeClasses[size]}`}
      >
        {showIcon && <Activity className="h-3 w-3 text-blue-700 shrink-0" />}
        Dispatched
      </span>
    );
  }

  if (normalized === 'EN_ROUTE') {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-indigo-50 text-indigo-800 border border-indigo-300 font-mono-numbers ${sizeClasses[size]}`}
      >
        {showIcon && <span className="h-2 w-2 rounded-full bg-indigo-600 shrink-0" />}
        En Route to Site
      </span>
    );
  }

  if (normalized === 'REPAIRING') {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-orange-50 text-orange-800 border border-orange-300 font-mono-numbers ${sizeClasses[size]}`}
      >
        {showIcon && <Wrench className="h-3 w-3 text-orange-700 shrink-0" />}
        Repair in Progress
      </span>
    );
  }

  if (normalized === 'RESOLVED') {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300 font-mono-numbers ${sizeClasses[size]}`}
      >
        {showIcon && <CheckCircle2 className="h-3 w-3 text-emerald-700 shrink-0" />}
        Power Restored
      </span>
    );
  }

  if (normalized === 'APPROVED') {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300 font-mono-numbers ${sizeClasses[size]}`}
      >
        {showIcon && <Check className="h-3 w-3 text-emerald-700 shrink-0" />}
        Approved
      </span>
    );
  }

  if (normalized === 'REJECTED') {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-rose-50 text-rose-800 border border-rose-300 font-mono-numbers ${sizeClasses[size]}`}
      >
        {showIcon && <XCircle className="h-3 w-3 text-rose-700 shrink-0" />}
        Rejected
      </span>
    );
  }

  if (normalized === 'CANCELLED') {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-slate-100 text-slate-700 border border-slate-300 font-mono-numbers ${sizeClasses[size]}`}
      >
        {showIcon && <XCircle className="h-3 w-3 text-slate-500 shrink-0" />}
        Cancelled
      </span>
    );
  }

  if (normalized === 'PUBLISHED') {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300 font-mono-numbers ${sizeClasses[size]}`}
      >
        {showIcon && <CheckCircle2 className="h-3 w-3 text-emerald-700 shrink-0" />}
        Published
      </span>
    );
  }

  if (normalized === 'DRAFT') {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-slate-100 text-slate-800 border border-slate-300 font-mono-numbers ${sizeClasses[size]}`}
      >
        {showIcon && <Clock className="h-3 w-3 text-slate-500 shrink-0" />}
        Draft
      </span>
    );
  }

  if (normalized === 'ACTIVE') {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300 font-mono-numbers ${sizeClasses[size]}`}
      >
        {showIcon && <CheckCircle2 className="h-3 w-3 text-emerald-700 shrink-0" />}
        Active
      </span>
    );
  }

  if (normalized === 'SUSPENDED') {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-rose-50 text-rose-800 border border-rose-300 font-mono-numbers ${sizeClasses[size]}`}
      >
        {showIcon && <XCircle className="h-3 w-3 text-rose-700 shrink-0" />}
        Suspended
      </span>
    );
  }

  // Default fallback badge
  return (
    <span
      className={`inline-flex items-center rounded-full bg-slate-100 text-slate-800 border border-slate-300 font-mono-numbers ${sizeClasses[size]}`}
    >
      {normalized.replace(/_/g, ' ')}
    </span>
  );
};
