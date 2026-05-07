import type { ReactNode } from 'react';
import { Navbar } from './Navbar';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-7xl p-4 pt-20">
        {children}
      </main>
    </div>
  );
}
