import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { useUrlSync, useDataInit } from '@/hooks/useUrlSync';

// Lazy-loaded page components for route-level code splitting
const PortfolioBuilder = lazy(() =>
  import('@/components/builder/PortfolioBuilder').then(m => ({ default: m.PortfolioBuilder })),
);
const BacktestPage = lazy(() =>
  import('@/components/backtest/BacktestPage').then(m => ({ default: m.BacktestPage })),
);
const ComparePage = lazy(() =>
  import('@/components/compare/ComparePage').then(m => ({ default: m.ComparePage })),
);
const TemplatesPage = lazy(() =>
  import('@/components/templates/TemplatesPage').then(m => ({ default: m.TemplatesPage })),
);
const TemplateDetail = lazy(() =>
  import('@/components/templates/TemplateDetail').then(m => ({ default: m.TemplateDetail })),
);
const MarketPage = lazy(() =>
  import('@/components/market/MarketPage').then(m => ({ default: m.MarketPage })),
);
const WithdrawalPage = lazy(() =>
  import('@/components/withdrawal/WithdrawalPage').then(m => ({ default: m.WithdrawalPage })),
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
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/templates/:id" element={<TemplateDetail />} />
          <Route path="/market" element={<MarketPage />} />
          <Route path="/withdrawal" element={<WithdrawalPage />} />
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
