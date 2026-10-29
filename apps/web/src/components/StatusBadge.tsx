import React from 'react';
import { FeederStatus, OutageStatus } from '@load-shedding/shared';
import { CheckCircle2, Clock, AlertTriangle, ShieldCheck, Activity, Wrench, Check, XCircle } from 'lucide-react';

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
    md: 'text-xs font-medium px-2.5 py-1 gap-1.5',
    lg: 'text-sm font-semibold px-3.5 py-1.5 gap-2'
  };

  // 1. Feeder ONLINE
  if (normalized === 'ONLINE') {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25 font-mono-numbers ${sizeClasses[size]}`}
      >
        {showIcon && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse ring-2 ring-emerald-500/30" />}
        Online (Transmitting)
      </span>
    );
  }

  // 2. PLANNED_OUTAGE
  if (normalized === 'PLANNED_OUTAGE') {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/25 font-mono-numbers ${sizeClasses[size]}`}
      >
        {showIcon && <Clock className="h-3 w-3 text-amber-500 shrink-0" />}
        Planned Load Shedding
      </span>
    );
  }

  // 3. UNEXPECTED_FAULT
  if (normalized === 'UNEXPECTED_FAULT') {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/25 font-mono-numbers ${sizeClasses[size]}`}
      >
        {showIcon && <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0 animate-bounce" />}
        Emergency Grid Fault
      </span>
    );
  }

  // 4. Ticket Statuses
  if (normalized === 'PENDING') {
    return (
      <span className={`inline-flex items-center rounded-full bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border border-yellow-500/25 font-mono-numbers ${sizeClasses[size]}`}>
        {showIcon && <Clock className="h-3 w-3 text-yellow-500 shrink-0" />}
        Pending Triage
      </span>
    );
  }

  if (normalized === 'ASSIGNED') {
    return (
      <span className={`inline-flex items-center rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/25 font-mono-numbers ${sizeClasses[size]}`}>
        {showIcon && <Activity className="h-3 w-3 text-blue-500 shrink-0" />}
        Dispatched
      </span>
    );
  }

  if (normalized === 'EN_ROUTE') {
    return (
      <span className={`inline-flex items-center rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/25 font-mono-numbers ${sizeClasses[size]}`}>
        {showIcon && <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-ping" />}
        En Route to Site
      </span>
    );
  }

  if (normalized === 'REPAIRING') {
    return (
      <span className={`inline-flex items-center rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/25 font-mono-numbers ${sizeClasses[size]}`}>
        {showIcon && <Wrench className="h-3 w-3 text-amber-500 shrink-0" />}
        Repair in Progress
      </span>
    );
  }

  if (normalized === 'RESOLVED') {
    return (
      <span className={`inline-flex items-center rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25 font-mono-numbers ${sizeClasses[size]}`}>
        {showIcon && <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />}
        Power Restored
      </span>
    );
  }

  if (normalized === 'APPROVED') {
    return (
      <span className={`inline-flex items-center rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25 font-mono-numbers ${sizeClasses[size]}`}>
        {showIcon && <Check className="h-3 w-3 text-emerald-500 shrink-0" />}
        Approved
      </span>
    );
  }

  if (normalized === 'REJECTED') {
    return (
      <span className={`inline-flex items-center rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/25 font-mono-numbers ${sizeClasses[size]}`}>
        {showIcon && <XCircle className="h-3 w-3 text-rose-500 shrink-0" />}
        Rejected
      </span>
    );
  }

  // Default fallback badge
  return (
    <span
      className={`inline-flex items-center rounded-full bg-slate-500/10 text-slate-700 dark:text-slate-300 border border-slate-500/20 font-mono-numbers ${sizeClasses[size]}`}
    >
      {normalized.replace('_', ' ')}
    </span>
  );
};
