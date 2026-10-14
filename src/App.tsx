import { Suspense, lazy, type ReactNode } from 'react';
import { BrowserRouter, Link, NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router';
import { I18nProvider, useI18n } from './i18n';
import { MotionProvider, m, spring, springSoft } from './motion';
import { signOut, useAuthState, useUser } from './auth';
import { useTheme } from './lib/theme';
import { API_MODE } from './api';
import { currentScenario } from './mock/scenario';
import { BrandLockup } from './components/BrandMark';
import { LoginPage } from './pages/Login';
import { AboutPage } from './pages/About';

// MapLibre (±230 KB gzip), the detail pages (charts, imagery, parameter tables) and the contract text load only
// on their own routes. "/" is the risk engine's region map; the earlier pixel map stays at /pixels.
const RegionsPage = lazy(() => import('./pages/Regions').then((m) => ({ default: m.RegionsPage })));
const RegionPage = lazy(() => import('./pages/RegionPage').then((m) => ({ default: m.RegionPage })));
const OperatorMapPage = lazy(() => import('./pages/OperatorMap').then((m) => ({ default: m.OperatorMapPage })));
const ClusterPage = lazy(() => import('./pages/ClusterPage').then((m) => ({ default: m.ClusterPage })));
const NotificationsPage = lazy(() => import('./pages/Notifications').then((m) => ({ default: m.NotificationsPage })));
const ApiContractPage = lazy(() => import('./pages/ApiContract').then((m) => ({ default: m.ApiContractPage })));

function PageFallback() {
  return <div className="page-fallback" aria-busy="true"><div className="skel" /></div>;
}

function RequireAuth({ children, operator = true }: { children: ReactNode; operator?: boolean }) {
  const { user, loading } = useAuthState();
  const loc = useLocation();
  if (loading) return <PageFallback />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  if (operator && user.role !== 'operator') return <Navigate to="/notifications" replace />;
  return children;
}

/** Navigation link; its active background slides from one link to the next (shared layoutId). */
function NavItem({ to, end, children }: { to: string; end?: boolean; children: ReactNode }) {
  return (
    <NavLink to={to} end={end}>
      {({ isActive }) => (
        <>
          {isActive && <m.i className="pill-bg nav-bg" layoutId="nav-pill" transition={spring} />}
          <span className="nl-label">{children}</span>
        </>
      )}
    </NavLink>
  );
}

function TopBar({ theme }: { theme: ReturnType<typeof useTheme> }) {
  const { t } = useI18n();
  const user = useUser();
  const nav = useNavigate();
  return (
    <header className="topnav">
      <div className="topnav-in">
        <Link className="brand" to={user ? '/' : '/about'}>
          <BrandLockup size={36} />
          <small>{t('app.role')}</small>
        </Link>
        {API_MODE === 'mock' && (
          <span className="mock-badge" title={t('mock.title', { sc: currentScenario() })}>{t('mock.badge')}</span>
        )}
        <nav className="navlinks" aria-label={t('nav.label')}>
          {user?.role === 'operator' && <NavItem to="/" end>{t('nav.regions')}</NavItem>}
          <NavItem to="/notifications">{t('nav.notifications')}</NavItem>
          <NavItem to="/about">{t('nav.about')}</NavItem>
          <NavItem to="/api-contract">
            <span className="nl-full">{t('nav.api')}</span><span className="nl-short">{t('nav.api_short')}</span>
          </NavItem>
        </nav>
        <div className="tools">
          <button className="icon-btn" onClick={theme.cycle} title={t(`theme.${theme.pref}`)} aria-label={t(`theme.${theme.pref}`)}>
            {theme.pref === 'auto' ? '◐' : theme.pref === 'light' ? '☀' : '☾'}
          </button>
          {user ? (
            <button className="link-btn" onClick={() => { void signOut().then(() => nav('/login')).catch(() => nav('/login')); }} title={user.email}>{t('nav.signout')}</button>
          ) : (
            <NavLink className="link-btn" to="/login">{t('nav.signin')}</NavLink>
          )}
        </div>
      </div>
    </header>
  );
}

function Shell({ theme }: { theme: ReturnType<typeof useTheme> }) {
  const loc = useLocation();
  const isMap = loc.pathname === '/' || loc.pathname === '/pixels';
  return (
    <>
      <TopBar theme={theme} />
      <main className={isMap ? 'main-map' : 'main'}>
        <Suspense fallback={<PageFallback />}>
          {/* Remounted on every route (and after a lazy chunk loads), so a new page always enters with motion. */}
          <m.div
            key={loc.pathname} className="route"
            initial={{ opacity: 0, y: isMap ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} transition={springSoft}
          >
            <Outlet />
          </m.div>
        </Suspense>
      </main>
    </>
  );
}

function Root() {
  const theme = useTheme();
  return (
    <Routes>
      <Route element={<Shell theme={theme} />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/api-contract" element={<ApiContractPage />} />
        <Route path="/notifications" element={<RequireAuth operator={false}><NotificationsPage /></RequireAuth>} />
        <Route path="/" element={<RequireAuth><RegionsPage dark={theme.dark} /></RequireAuth>} />
        <Route path="/regions/:id" element={<RequireAuth><RegionPage /></RequireAuth>} />
        <Route path="/pixels" element={<RequireAuth><OperatorMapPage dark={theme.dark} /></RequireAuth>} />
        <Route path="/clusters/:id" element={<RequireAuth><ClusterPage /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <I18nProvider>
      <MotionProvider>
        <BrowserRouter>
          <Root />
        </BrowserRouter>
      </MotionProvider>
    </I18nProvider>
  );
}
