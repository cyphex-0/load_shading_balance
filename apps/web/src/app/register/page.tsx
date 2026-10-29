'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Zap, User, Mail, Lock, Phone, Hash, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { ApiClient } from '../../lib/api';

export default function RegisterPage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [meterNumber, setMeterNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await ApiClient.post('/api/auth/register', {
      name,
      email,
      phone,
      password,
      meterNumber: meterNumber || undefined
    });

    setLoading(false);

    if (res.success) {
      setSuccess(true);
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } else {
      setError(res.error?.message || 'Registration failed. Check inputs.');
    }
  };

  return (
    <div className="max-w-md mx-auto py-8 space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex h-12 w-12 rounded-2xl bg-amber-500/10 text-amber-500 items-center justify-center mb-1">
          <Zap className="h-6 w-6 fill-current" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Create Customer Account</h1>
        <p className="text-xs text-slate-500">Register your electric meter to receive instant outage alerts and track schedules.</p>
      </div>

      <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>Registration successful! Redirecting to sign in...</span>
          </div>
        )}

        {!success && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Full Name</label>
              <div className="relative">
                <User className="h-4 w-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Rahim Ahmed"
                  className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Email Address</label>
              <div className="relative">
                <Mail className="h-4 w-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="rahim@example.com"
                  className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Mobile Phone (for SMS Alerts)</label>
              <div className="relative">
                <Phone className="h-4 w-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+8801712345678"
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
                  placeholder="At least 6 characters"
                  className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Electric Meter Number (Optional)
              </label>
              <div className="relative">
                <Hash className="h-4 w-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  value={meterNumber}
                  onChange={(e) => setMeterNumber(e.target.value)}
                  placeholder="e.g. MTR-DHN-101"
                  className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <span className="text-[11px] text-slate-400">Can be linked later from your profile.</span>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 text-white font-semibold text-xs transition-all shadow-sm flex items-center justify-center gap-2"
            >
              {loading ? 'Creating Account...' : 'Complete Registration'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        )}

        <div className="text-center pt-2 text-xs text-slate-500">
          Already have an account?{' '}
          <Link href="/login" className="font-bold text-blue-600 hover:underline">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
