'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Zap,
  Lock,
  Mail,
  ArrowRight,
  Shield,
  AlertCircle,
  Users,
  Activity,
  Wrench,
  BarChart2
} from 'lucide-react';
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
    <div className="max-w-md mx-auto py-8 sm:py-12 space-y-6">
      {/* Brand Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex h-12 w-12 rounded-xl bg-amber-500 items-center justify-center mb-1 text-slate-950 font-bold shadow-sm">
          <Zap className="h-6 w-6 fill-current" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
          Sign In to GridSync BD
        </h1>
        <p className="text-xs text-slate-500">
          Enter your national utility credentials or select a verified test profile.
        </p>
      </div>

      {/* Main Authentication Card */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm space-y-6 border border-slate-200">
        {error && (
          <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">
              Email Address
            </label>
            <div className="relative">
              <Mail className="h-4 w-4 absolute left-3.5 top-3 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@grid.gov.bd"
                className="w-full text-xs pl-10 pr-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 font-medium"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">
                Password
              </label>
              <span className="text-[11px] font-mono text-slate-400">
                Default: Password123!
              </span>
            </div>
            <div className="relative">
              <Lock className="h-4 w-4 absolute left-3.5 top-3 text-slate-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full text-xs pl-10 pr-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 font-medium"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[44px] py-2.5 px-4 rounded-lg font-bold text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors shadow-sm flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
          >
            {loading ? (
              <div className="h-4 w-4 border-2 border-slate-950 border-r-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Access Console</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        {/* 1-Click Role Switcher Demo Deck */}
        <div className="pt-4 border-t border-slate-200 space-y-2.5">
          <span className="text-[11px] font-mono font-semibold text-slate-500 uppercase tracking-wider block text-center">
            Instant 1-Click Role Switcher
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleQuickLogin('customer@gmail.com')}
              className={`p-2.5 rounded-lg border text-left transition-colors text-xs flex items-center gap-2 ${
                email === 'customer@gmail.com'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold'
                  : 'border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}
            >
              <Users className="h-4 w-4 text-emerald-700 shrink-0" />
              <div className="truncate">
                <span className="block leading-tight font-semibold">Customer</span>
                <span className="text-[10px] text-slate-500 truncate font-mono">customer@gmail.com</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('operator@grid.gov.bd')}
              className={`p-2.5 rounded-lg border text-left transition-colors text-xs flex items-center gap-2 ${
                email === 'operator@grid.gov.bd'
                  ? 'bg-blue-50 border-blue-300 text-blue-900 font-bold'
                  : 'border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}
            >
              <Activity className="h-4 w-4 text-blue-700 shrink-0" />
              <div className="truncate">
                <span className="block leading-tight font-semibold">Power Operator</span>
                <span className="text-[10px] text-slate-500 truncate font-mono">operator@grid.gov.bd</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('tech1@grid.gov.bd')}
              className={`p-2.5 rounded-lg border text-left transition-colors text-xs flex items-center gap-2 ${
                email === 'tech1@grid.gov.bd'
                  ? 'bg-amber-50 border-amber-300 text-amber-900 font-bold'
                  : 'border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}
            >
              <Wrench className="h-4 w-4 text-amber-700 shrink-0" />
              <div className="truncate">
                <span className="block leading-tight font-semibold">Field Technician</span>
                <span className="text-[10px] text-slate-500 truncate font-mono">tech1@grid.gov.bd</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('manager.dhanmondi@grid.gov.bd')}
              className={`p-2.5 rounded-lg border text-left transition-colors text-xs flex items-center gap-2 ${
                email === 'manager.dhanmondi@grid.gov.bd'
                  ? 'bg-cyan-50 border-cyan-300 text-cyan-900 font-bold'
                  : 'border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}
            >
              <BarChart2 className="h-4 w-4 text-cyan-700 shrink-0" />
              <div className="truncate">
                <span className="block leading-tight font-semibold">Zone Manager</span>
                <span className="text-[10px] text-slate-500 truncate font-mono">manager.dhanmondi</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('admin@grid.gov.bd')}
              className={`col-span-full p-2.5 rounded-lg border text-left transition-colors text-xs flex items-center justify-between ${
                email === 'admin@grid.gov.bd'
                  ? 'bg-purple-50 border-purple-300 text-purple-900 font-bold'
                  : 'border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-purple-700 shrink-0" />
                <span className="font-semibold">System Administrator (admin@grid.gov.bd)</span>
              </div>
              <span className="text-[10px] font-mono font-bold text-purple-800 bg-purple-100 px-2 py-0.5 rounded">
                FULL ACCESS
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="text-center text-xs text-slate-600">
        Don&apos;t have a customer meter account yet?{' '}
        <Link href="/register" className="font-bold text-amber-700 hover:underline">
          Register New Meter
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="py-24 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-solid border-amber-500 border-r-transparent" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
