'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Zap, Lock, Mail, ArrowRight, Shield, AlertCircle } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { ApiClient } from '../../lib/api';
import { UserRole } from '@load-shedding/shared';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('Password123!');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill role from query param if available
  useEffect(() => {
    const roleParam = searchParams.get('role');
    if (roleParam === 'customer') {
      setEmail('customer@gmail.com');
    } else if (roleParam === 'operator') {
      setEmail('operator@grid.gov.bd');
    } else if (roleParam === 'technician') {
      setEmail('tech1@grid.gov.bd');
    } else if (roleParam === 'manager') {
      setEmail('manager.dhanmondi@grid.gov.bd');
    } else if (roleParam === 'admin') {
      setEmail('admin@grid.gov.bd');
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await ApiClient.post('/api/auth/login', { email, password });
    setLoading(false);

    if (res.success && res.data) {
      login(res.data.token, res.data.user);
      const role = res.data.user.role;
      if (role === UserRole.CUSTOMER) router.push('/customer');
      else if (role === UserRole.POWER_OPERATOR) router.push('/operator');
      else if (role === UserRole.TECHNICIAN) router.push('/technician');
      else if (role === UserRole.ZONE_MANAGER) router.push('/manager');
      else if (role === UserRole.ADMIN) router.push('/admin');
      else router.push('/');
    } else {
      setError(res.error?.message || 'Login failed. Check your credentials.');
    }
  };

  const handleQuickLogin = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('Password123!');
  };

  return (
    <div className="max-w-md mx-auto py-8 space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex h-12 w-12 rounded-2xl bg-amber-500/10 text-amber-500 items-center justify-center mb-1">
          <Zap className="h-6 w-6 fill-current" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Sign In to GridSync BD</h1>
        <p className="text-xs text-slate-500">Access your role-specific dashboard and live operations.</p>
      </div>

      <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Email Address</label>
            <div className="relative">
              <Mail className="h-4 w-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@grid.gov.bd"
                className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Password</label>
            <div className="relative">
              <Lock className="h-4 w-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 text-white font-semibold text-xs transition-all shadow-sm flex items-center justify-center gap-2"
          >
            {loading ? 'Authenticating...' : 'Sign In'}
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        {/* Demo Quick Logins */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block text-center">
            One-Click Demo Credentials
          </span>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => handleQuickLogin('customer@gmail.com')}
              className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-medium hover:bg-emerald-100 transition-colors text-left"
            >
              👤 Customer
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('operator@grid.gov.bd')}
              className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 font-medium hover:bg-blue-100 transition-colors text-left"
            >
              ⚡ Operator
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('tech1@grid.gov.bd')}
              className="p-2 rounded-lg bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 font-medium hover:bg-orange-100 transition-colors text-left"
            >
              🛠️ Technician
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('manager.dhanmondi@grid.gov.bd')}
              className="p-2 rounded-lg bg-cyan-50 dark:bg-cyan-950/30 text-cyan-700 dark:text-cyan-400 font-medium hover:bg-cyan-100 transition-colors text-left"
            >
              📈 Zone Manager
            </button>
          </div>

          <button
            type="button"
            onClick={() => handleQuickLogin('admin@grid.gov.bd')}
            className="w-full p-2 rounded-lg bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-400 font-medium hover:bg-purple-100 transition-colors text-center text-xs"
          >
            🛡️ System Administrator
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-xs text-slate-400">Loading sign-in portal...</div>}>
      <LoginForm />
    </Suspense>
  );
}
