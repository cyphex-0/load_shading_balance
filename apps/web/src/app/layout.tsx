import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '../lib/auth-context';
import { Navbar } from '../components/Navbar';
import { Zap, ShieldCheck, Heart } from 'lucide-react';

export const metadata: Metadata = {
  title: 'GridSync BD — National Load Shedding & Power Outage Management System',
  description:
    'Automated fair load-shedding scheduling, real-time power outage tracking, smart conflict resolution, and field technician dispatch platform.'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 dark:bg-[#070b12] text-slate-900 dark:text-slate-100 flex flex-col font-sans antialiased selection:bg-amber-500/20 selection:text-amber-500">
        <AuthProvider>
          <Navbar />
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
            {children}
          </main>
          <footer className="border-t border-slate-200/80 dark:border-slate-800/80 py-8 bg-white/50 dark:bg-slate-950/50 backdrop-blur-sm text-xs text-slate-500">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center">
                  <Zap className="h-3.5 w-3.5 fill-current" />
                </div>
                <span className="font-bold text-slate-800 dark:text-slate-200">GridSync BD</span>
                <span>— National Electricity Outage & Fair Rotation Management System</span>
              </div>
              <div className="flex items-center gap-4 text-[11px] font-mono text-slate-400">
                <span>BANGLADESH DISPATCH SPEC</span>
                <span>•</span>
                <span>REDIS CACHED</span>
                <span>•</span>
                <span>WEBSOCKET LIVE</span>
              </div>
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
