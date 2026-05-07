import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export function Navbar() {
  const { t, i18n } = useTranslation();

  const toggleLang = () => {
    const next = i18n.language === 'zh' ? 'en' : 'zh';
    i18n.changeLanguage(next);
    localStorage.setItem('i18nextLng', next);
    document.documentElement.lang = next;
  };

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
          <NavLink to="/" className={linkClass} end>
            {t('nav.builder')}
          </NavLink>
          <NavLink to="/backtest" className={linkClass}>
            {t('nav.backtest')}
          </NavLink>
          <NavLink to="/compare" className={linkClass}>
            {t('nav.compare')}
          </NavLink>
          <NavLink to="/templates" className={linkClass}>
            {t('nav.templates')}
          </NavLink>
          <NavLink to="/market" className={linkClass}>
            {t('nav.market')}
          </NavLink>
        </div>
        <button
          onClick={toggleLang}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
        >
          {i18n.language === 'zh' ? 'EN' : '中文'}
        </button>
      </div>
    </nav>
  );
}
