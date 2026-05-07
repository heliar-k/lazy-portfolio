import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { PortfolioBuilder } from '@/components/builder/PortfolioBuilder';
import { BacktestPage } from '@/components/backtest/BacktestPage';
import { ComparePage } from '@/components/compare/ComparePage';
import { TemplatesPage } from '@/components/templates/TemplatesPage';
import { MarketPage } from '@/components/market/MarketPage';
import { useUrlSync, useDataInit } from '@/hooks/useUrlSync';

function AppRoutes() {
  useDataInit();
  useUrlSync();

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<PortfolioBuilder />} />
        <Route path="/backtest" element={<BacktestPage />} />
        <Route path="/compare" element={<ComparePage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/market" element={<MarketPage />} />
      </Routes>
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
