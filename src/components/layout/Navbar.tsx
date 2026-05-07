import { useState, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDataStore } from '@/stores/data-store';
import { clearCache } from '@/data/loader';
import { clearBacktestCache } from '@/lib/cache';
import { APP_VERSION } from '@/version';

async function clearAllCachesAndReload() {
  // Clear localStorage backtest cache
  clearBacktestCache();
  // Clear module-level in-memory caches
  clearCache();
  // Clear Service Worker cache if available
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
  window.location.reload();
}

export function Navbar() {
  const { t, i18n } = useTranslation();
  const dataVersion = useDataStore((s) => s.dataVersion);
  const [refreshing, setRefreshing] = useState(false);

  const toggleLang = () => {
    const next = i18n.language === 'zh' ? 'en' : 'zh';
    i18n.changeLanguage(next);
    localStorage.setItem('i18nextLng', next);
    document.documentElement.lang = next;
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await clearAllCachesAndReload();
  }, []);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive
        ? 'bg-slate-200 text-slate-900'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
    }`;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 h-14">
        <div className="flex items-center gap-1">
          <span className="mr-4 text-lg font-bold text-slate-900">
            Lazy Portfolio
          </span>
          <span className="mr-4 text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
            v{APP_VERSION}
          </span>
          <NavLink to="/" className={linkClass} end>
            {t('nav.builder')}
          </NavLink>
          <NavLink to="/backtest" className={linkClass}>
            {t('nav.backtest')}
          </NavLink>
          <NavLink to="/templates" className={linkClass}>
            {t('nav.templates')}
          </NavLink>
        </div>

        <div className="flex items-center gap-3">
          {dataVersion && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400">
                {t('nav.dataUpdated')}: {dataVersion.lastUpdated}
              </span>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                title={t('nav.refreshData')}
                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100
                  transition-colors disabled:opacity-40"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={refreshing ? 'animate-spin' : ''}
                >
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                  <path d="M16 16h5v5" />
                </svg>
              </button>
            </div>
          )}
          <button
            onClick={toggleLang}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
          >
            {i18n.language === 'zh' ? 'EN' : '中文'}
          </button>
        </div>
      </div>
    </nav>
  );
}
