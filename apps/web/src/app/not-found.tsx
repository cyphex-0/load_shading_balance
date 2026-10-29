import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Zap } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="py-24 max-w-md mx-auto text-center space-y-5">
      <div className="inline-flex h-12 w-12 rounded-lg bg-amber-500 text-slate-950 items-center justify-center font-bold">
        <Zap className="h-6 w-6 fill-current" />
      </div>
      <h1 className="text-3xl font-extrabold text-slate-900">404 — Page Not Found</h1>
      <p className="text-xs text-slate-500">
        The requested transmission line or portal route does not exist.
      </p>
      <Link
        href="/"
        className="min-h-[44px] px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs inline-flex items-center gap-2 shadow-sm transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Return to Live Grid
      </Link>
    </div>
  );
}
