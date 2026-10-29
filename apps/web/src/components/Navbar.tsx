'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Zap,
  LogOut,
  User,
  Shield,
  Activity,
  Wrench,
  BarChart2,
  Calendar,
  Info,
  Radio,
  Menu,
  X
} from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { UserRole } from '@load-shedding/shared';
import { getSocket } from '../lib/socket';

export const Navbar = () => {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [socketConnected, setSocketConnected] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    setSocketConnected(socket.connected);

    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

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

  const getRoleBadgeStyle = (role: UserRole) => {
    switch (role) {
      case UserRole.ADMIN:
        return 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30';
      case UserRole.POWER_OPERATOR:
        return 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30';
      case UserRole.TECHNICIAN:
        return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30';
      case UserRole.ZONE_MANAGER:
        return 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30';
      default:
        return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand with Grid Telemetry Indicator */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-400 flex items-center justify-center text-slate-950 shadow-sm group-hover:scale-105 transition-transform duration-200">
              <Zap className="h-5 w-5 fill-current" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-base tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5 leading-none">
                GridSync
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  BD-DISPATCH
                </span>
              </span>
              <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 leading-tight">
                National Outage Management
              </span>
            </div>
          </Link>

          {/* Real-time Socket Connection Status Pill */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500">
            <span
              className={`h-2 w-2 rounded-full ${
                socketConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
            <span>{socketConnected ? 'TELEMETRY LIVE' : 'CONNECTING...'}</span>
          </div>
        </div>

        {/* Center Nav Links */}
        <nav className="hidden md:flex items-center gap-1.5">
          <Link
            href="/"
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150 ${
              pathname === '/'
                ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900'
            }`}
          >
            Live Grid
          </Link>
          <Link
            href="/schedules"
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150 flex items-center gap-1.5 ${
              pathname === '/schedules'
                ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900'
            }`}
          >
            <Calendar className="h-3.5 w-3.5" />
            Schedules
          </Link>
          <Link
            href="/about"
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150 flex items-center gap-1.5 ${
              pathname === '/about'
                ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900'
            }`}
          >
            <Info className="h-3.5 w-3.5" />
            Architecture
          </Link>

          {/* User's Contextual Portal Link */}
          {user && (
            <Link
              href={getDashboardLink()}
              className={`ml-2 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all duration-150 flex items-center gap-1.5 ${
                pathname.startsWith('/customer') ||
                pathname.startsWith('/operator') ||
                pathname.startsWith('/technician') ||
                pathname.startsWith('/manager') ||
                pathname.startsWith('/admin')
                  ? 'text-white bg-slate-950 dark:bg-amber-500 dark:text-slate-950 shadow-sm'
                  : 'text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200'
              }`}
            >
              {user.role === UserRole.ADMIN && <Shield className="h-3.5 w-3.5" />}
              {user.role === UserRole.POWER_OPERATOR && <Activity className="h-3.5 w-3.5" />}
              {user.role === UserRole.TECHNICIAN && <Wrench className="h-3.5 w-3.5" />}
              {user.role === UserRole.ZONE_MANAGER && <BarChart2 className="h-3.5 w-3.5" />}
              {user.role === UserRole.CUSTOMER && <User className="h-3.5 w-3.5" />}
              Operational Portal
            </Link>
          )}
        </nav>

        {/* Right User Navigation */}
        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-2 sm:gap-3">
              <span
                className={`text-[10px] font-mono uppercase px-2.5 py-1 rounded-full border ${getRoleBadgeStyle(
                  user.role
                )}`}
              >
                {user.role.replace('_', ' ')}
              </span>

              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                  {user.name}
                </span>
                <span className="text-[10px] font-mono text-slate-400 leading-tight">
                  {user.email}
                </span>
              </div>

              <button
                onClick={() => logout()}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-500/10 transition-colors"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="px-4 py-2 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-xl shadow-sm transition-all"
              >
                Register
              </Link>
            </div>
          )}

          {/* Mobile Menu Toggle Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-4 py-4 space-y-2">
          <Link
            href="/"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded-lg text-sm font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Live Grid
          </Link>
          <Link
            href="/schedules"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded-lg text-sm font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Public Schedules
          </Link>
          <Link
            href="/about"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded-lg text-sm font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Architecture Rules
          </Link>
          {user && (
            <Link
              href={getDashboardLink()}
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-lg text-sm font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10"
            >
              Go to Operational Portal ({user.role.replace('_', ' ')})
            </Link>
          )}
        </div>
      )}
    </header>
  );
};
