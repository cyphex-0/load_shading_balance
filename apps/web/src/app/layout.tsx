import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '../lib/auth-context';
import { Navbar } from '../components/Navbar';

export const metadata: Metadata = {
  title: 'GridSync BD — Load Shedding & Power Outage Management System',
  description: 'Automated fair load-shedding scheduling, real-time power outage tracking, and field technician dispatch platform.'
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
        <AuthProvider>
          <Navbar />
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
            {children}
          </main>
          <footer className="border-t border-slate-200 dark:border-slate-800 py-6 text-center text-xs text-slate-500">
            <p>© 2026 GridSync BD. Designed for National Electricity Grid Transparency and Fair Outage Management.</p>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
