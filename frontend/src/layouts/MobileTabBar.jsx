import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookUser, LayoutDashboard, Menu, Receipt, ShoppingCart } from 'lucide-react';
import { cx } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useNavBadges } from '../hooks/useNavBadges';
import { prefetchRoute } from '../utils/routes';

const TABS = [
  { path: '/dashboard', key: 'dashboard', icon: LayoutDashboard, roles: ['admin'] },
  { path: '/pos', key: 'pos', icon: ShoppingCart, roles: ['admin', 'cashier'] },
  { path: '/sales', key: 'sales', icon: Receipt, roles: ['admin', 'cashier'] },
  { path: '/customers', key: 'customers', icon: BookUser, roles: ['admin', 'cashier'] },
];

/** Phone-only bottom navigation: thumb-friendly shortcuts to the pages used all day, plus the full menu. */
export default function MobileTabBar({ onMenu }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const badges = useNavBadges();
  const tabs = TABS.filter((x) => x.roles.includes(user.role));
  return (
    <nav aria-label={t('tabs.label')} className="glass safe-bottom no-print fixed inset-x-3 bottom-3 z-30 flex items-stretch justify-around rounded-[26px] border border-line px-1.5 pt-1.5 shadow-pop lg:hidden">
      {tabs.map(({ path, key, icon: Icon }) => (
        <NavLink key={path} to={path} onTouchStart={() => prefetchRoute(path)} onMouseEnter={() => prefetchRoute(path)} className="group relative flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1 text-[11px] font-semibold">
          {({ isActive }) => (
            <>
              <span className={cx('relative flex h-9 w-14 items-center justify-center rounded-2xl transition-all duration-300', isActive ? 'icon-brand scale-100' : 'text-muted group-active:scale-90')}>
                <Icon className="h-5 w-5" aria-hidden="true" />
                {badges[key] && <span className="absolute end-2.5 top-1 h-2 w-2 rounded-full bg-danger ring-2 ring-surface" aria-hidden="true" />}
              </span>
              <span className={cx('truncate transition-colors', isActive ? 'text-ink' : 'text-muted')}>{t(`tabs.${key}`)}</span>
            </>
          )}
        </NavLink>
      ))}
      <button type="button" onClick={onMenu} className="group flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1 text-[11px] font-semibold text-muted" aria-label={t('nav.open')}>
        <span className="flex h-9 w-14 items-center justify-center rounded-2xl transition group-active:scale-90"><Menu className="h-5 w-5" aria-hidden="true" /></span>
        <span>{t('tabs.menu')}</span>
      </button>
    </nav>
  );
}
