import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { useUrlSync, useDataInit } from '@/hooks/useUrlSync';

// Lazy-loaded page components for route-level code splitting
const PortfolioBuilder = lazy(() =>
  import('@/components/builder/PortfolioBuilder').then(m => ({ default: m.PortfolioBuilder })),
);
const BacktestPage = lazy(() =>
  import('@/components/backtest/BacktestPage').then(m => ({ default: m.BacktestPage })),
);
const TemplatesPage = lazy(() =>
  import('@/components/templates/TemplatesPage').then(m => ({ default: m.TemplatesPage })),
);
const TemplateDetail = lazy(() =>
  import('@/components/templates/TemplateDetail').then(m => ({ default: m.TemplateDetail })),
);

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function AppRoutes() {
  useDataInit();
  useUrlSync();

  return (
    <AppShell>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<PortfolioBuilder />} />
          <Route path="/backtest" element={<BacktestPage />} />
          <Route path="/compare" element={<Navigate to="/backtest" replace />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/templates/:id" element={<TemplateDetail />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
