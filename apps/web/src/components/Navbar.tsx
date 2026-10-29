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
        return 'bg-purple-50 text-purple-800 border-purple-200';
      case UserRole.POWER_OPERATOR:
        return 'bg-blue-50 text-blue-800 border-blue-200';
      case UserRole.TECHNICIAN:
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case UserRole.ZONE_MANAGER:
        return 'bg-cyan-50 text-cyan-800 border-cyan-200';
      default:
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand with Grid Telemetry Indicator */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-amber-500 flex items-center justify-center text-slate-950 font-bold">
              <Zap className="h-5 w-5 fill-current" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-base tracking-tight text-slate-900 flex items-center gap-1.5 leading-none">
                GridSync
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                  BD-DISPATCH
                </span>
              </span>
              <span className="text-[10px] font-medium text-slate-500 leading-tight">
                National Outage Management
              </span>
            </div>
          </Link>

          {/* Real-time Socket Connection Status Pill */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium bg-slate-100 border border-slate-200 text-slate-700">
            <span
              className={`h-2 w-2 rounded-full ${
                socketConnected ? 'bg-emerald-600' : 'bg-amber-500'
              }`}
            />
            <span>{socketConnected ? 'TELEMETRY LIVE' : 'CONNECTING...'}</span>
          </div>
        </div>

        {/* Center Nav Links */}
        <nav className="hidden md:flex items-center gap-1.5">
          <Link
            href="/"
            className={`min-h-[44px] inline-flex items-center px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
              pathname === '/'
                ? 'text-amber-900 bg-amber-50 border border-amber-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            Live Grid
          </Link>
          <Link
            href="/schedules"
            className={`min-h-[44px] inline-flex items-center px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors gap-1.5 ${
              pathname === '/schedules'
                ? 'text-amber-900 bg-amber-50 border border-amber-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Calendar className="h-3.5 w-3.5 text-slate-500" />
            Schedules
          </Link>
          <Link
            href="/about"
            className={`min-h-[44px] inline-flex items-center px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors gap-1.5 ${
              pathname === '/about'
                ? 'text-amber-900 bg-amber-50 border border-amber-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Info className="h-3.5 w-3.5 text-slate-500" />
            Architecture
          </Link>

          {/* User's Contextual Portal Link */}
          {user && (
            <Link
              href={getDashboardLink()}
              className={`ml-2 min-h-[44px] inline-flex items-center px-3.5 py-2 text-xs font-bold rounded-lg transition-colors gap-1.5 ${
                pathname.startsWith('/customer') ||
                pathname.startsWith('/operator') ||
                pathname.startsWith('/technician') ||
                pathname.startsWith('/manager') ||
                pathname.startsWith('/admin')
                  ? 'text-white bg-slate-900'
                  : 'text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200'
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
                className={`text-[10px] font-mono font-bold uppercase px-2.5 py-1 rounded-full border ${getRoleBadgeStyle(
                  user.role
                )}`}
              >
                {user.role.replace(/_/g, ' ')}
              </span>

              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-bold text-slate-900 leading-tight">
                  {user.name}
                </span>
                <span className="text-[10px] font-mono text-slate-500 leading-tight">
                  {user.email}
                </span>
              </div>

              <button
                onClick={() => logout()}
                className="min-h-[44px] min-w-[44px] rounded-lg inline-flex items-center justify-center text-slate-500 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors"
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
                className="min-h-[44px] inline-flex items-center px-3.5 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="min-h-[44px] inline-flex items-center px-4 py-2 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg shadow-sm transition-colors"
              >
                Register
              </Link>
            </div>
          )}

          {/* Mobile Menu Toggle Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 border border-slate-200"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 py-4 space-y-2">
          <Link
            href="/"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded-lg text-sm font-semibold text-slate-800 hover:bg-slate-100"
          >
            Live Grid
          </Link>
          <Link
            href="/schedules"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded-lg text-sm font-semibold text-slate-800 hover:bg-slate-100"
          >
            Public Schedules
          </Link>
          <Link
            href="/about"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded-lg text-sm font-semibold text-slate-800 hover:bg-slate-100"
          >
            Architecture Rules
          </Link>
          {user && (
            <Link
              href={getDashboardLink()}
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-lg text-sm font-bold text-amber-900 bg-amber-50 border border-amber-200"
            >
              Go to Operational Portal ({user.role.replace(/_/g, ' ')})
            </Link>
          )}
        </div>
      )}
    </header>
  );
};
