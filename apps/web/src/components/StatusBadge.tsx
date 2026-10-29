import React from 'react';
import { FeederStatus } from '@load-shedding/shared';
import { CheckCircle2, Clock, AlertTriangle } from 'lucide-react';

interface StatusBadgeProps {
  status: FeederStatus | string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  showIcon = true
}) => {
  const isOnline = status === FeederStatus.ONLINE || status === 'ONLINE';
  const isPlanned = status === FeederStatus.PLANNED_OUTAGE || status === 'PLANNED_OUTAGE';
  const isFault = status === FeederStatus.UNEXPECTED_FAULT || status === 'UNEXPECTED_FAULT';

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-xs font-semibold px-2.5 py-1',
    lg: 'text-sm font-semibold px-3 py-1.5'
  };

  if (isOnline) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 ${sizeClasses[size]}`}
      >
        {showIcon && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
        Online (Normal)
      </span>
    );
  }

  if (isPlanned) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 ${sizeClasses[size]}`}
      >
        {showIcon && <Clock className="h-3 w-3" />}
        Planned Outage
      </span>
    );
  }

  if (isFault) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 ${sizeClasses[size]}`}
      >
        {showIcon && <AlertTriangle className="h-3 w-3" />}
        Unexpected Fault
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center rounded-full bg-slate-500/10 text-slate-700 dark:text-slate-300 border border-slate-500/20 ${sizeClasses[size]}`}
    >
      {status}
    </span>
  );
};
