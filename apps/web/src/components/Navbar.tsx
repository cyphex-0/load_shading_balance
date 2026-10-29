'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Zap, LogOut, User, Bell, Shield, Activity, Wrench, BarChart2 } from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { UserRole } from '@load-shedding/shared';

export const Navbar = () => {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const getDashboardLink = () => {
    if (!user) return '/login';
    switch (user.role) {
      case UserRole.CUSTOMER:
        return '/customer';
      case UserRole.POWER_OPERATOR:
        return '/operator';
      case UserRole.TECHNICIAN:
        return '/technician';
      case UserRole.ZONE_MANAGER:
        return '/manager';
      case UserRole.ADMIN:
        return '/admin';
      default:
        return '/';
    }
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case UserRole.ADMIN:
        return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
      case UserRole.POWER_OPERATOR:
        return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case UserRole.TECHNICIAN:
        return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
      case UserRole.ZONE_MANAGER:
        return 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20';
      default:
        return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 font-bold text-lg text-slate-900 dark:text-white">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-400 flex items-center justify-center text-white shadow-sm">
            <Zap className="h-5 w-5 fill-current" />
          </div>
          <span className="tracking-tight">
            GridSync <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 ml-1">BD</span>
          </span>
        </Link>

        {/* Center Nav Links */}
        <nav className="hidden md:flex items-center gap-1">
          <Link
            href="/"
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              pathname === '/' ? 'text-blue-600 bg-blue-50 dark:bg-blue-950/40' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
            }`}
          >
            Live Grid
          </Link>
          <Link
            href="/schedules"
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              pathname === '/schedules' ? 'text-blue-600 bg-blue-50 dark:bg-blue-950/40' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
            }`}
          >
            Schedules
          </Link>
          <Link
            href="/about"
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              pathname === '/about' ? 'text-blue-600 bg-blue-50 dark:bg-blue-950/40' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
            }`}
          >
            Fair Rotation
          </Link>

          {/* Role-Specific Portal Links */}
          {user && (
            <Link
              href={getDashboardLink()}
              className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                pathname.startsWith('/customer') ||
                pathname.startsWith('/operator') ||
                pathname.startsWith('/technician') ||
                pathname.startsWith('/manager') ||
                pathname.startsWith('/admin')
                  ? 'text-blue-600 bg-blue-50 dark:bg-blue-950/40'
                  : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {user.role === UserRole.ADMIN && <Shield className="h-4 w-4" />}
              {user.role === UserRole.POWER_OPERATOR && <Activity className="h-4 w-4" />}
              {user.role === UserRole.TECHNICIAN && <Wrench className="h-4 w-4" />}
              {user.role === UserRole.ZONE_MANAGER && <BarChart2 className="h-4 w-4" />}
              {user.role === UserRole.CUSTOMER && <User className="h-4 w-4" />}
              My Portal
            </Link>
          )}
        </nav>

        {/* Right CTA / User State */}
        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-3">
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${getRoleBadge(user.role)}`}>
                {user.role.replace('_', ' ')}
              </span>

              <div className="hidden sm:flex flex-col text-right">
                <span className="text-sm font-semibold text-slate-900 dark:text-white leading-tight">
                  {user.name}
                </span>
                <span className="text-xs text-slate-500 leading-tight">
                  {user.email}
                </span>
              </div>

              <button
                onClick={() => logout()}
                className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors"
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:text-slate-900"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="px-4 py-2 text-sm font-semibold text-white bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 rounded-lg shadow-sm transition-all"
              >
                Register
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
