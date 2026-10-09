import { Suspense, lazy, type ReactNode } from 'react';
import { BrowserRouter, Link, NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router';
import { I18nProvider, useI18n } from './i18n';
import { MotionProvider, m, spring, springSoft } from './motion';
import { signOut, useAuthState, useUser } from './auth';
import { useTheme } from './lib/theme';
import { API_MODE } from './api';
import { currentScenario } from './mock/scenario';
import { Masuk } from './pages/Masuk';
import { Tentang } from './pages/Tentang';

// MapLibre (±230 KB gzip), halaman detail kelompok (citra termal, grafik, tabel parameter), dan teks kontrak
// hanya dimuat di rutenya sendiri.
const PetaOperator = lazy(() => import('./pages/PetaOperator').then((m) => ({ default: m.PetaOperator })));
const Kelompok = lazy(() => import('./pages/Kelompok').then((m) => ({ default: m.Kelompok })));
const Notifikasi = lazy(() => import('./pages/Notifikasi').then((m) => ({ default: m.Notifikasi })));
const KontrakApi = lazy(() => import('./pages/KontrakApi').then((m) => ({ default: m.KontrakApi })));

function PageFallback() {
  return <div className="page-fallback" aria-busy="true"><div className="skel" /></div>;
}

function RequireAuth({ children, operator = true }: { children: ReactNode; operator?: boolean }) {
  const { user, loading } = useAuthState();
  const loc = useLocation();
  if (loading) return <PageFallback />;
  if (!user) return <Navigate to="/masuk" replace state={{ from: loc.pathname + loc.search }} />;
  if (operator && user.role !== 'operator') return <Navigate to="/notifikasi" replace />;
  return children;
}

/** Tautan navigasi; latar aktifnya meluncur dari satu tautan ke tautan berikutnya (layoutId bersama). */
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
  const { t, lang, setLang } = useI18n();
  const user = useUser();
  const nav = useNavigate();
  return (
    <header className="topnav">
      <div className="topnav-in">
        <Link className="brand" to={user ? '/' : '/tentang'}>
          <i aria-hidden="true" />ASAPify <small>{t('app.role')}</small>
        </Link>
        {API_MODE === 'mock' && (
          <span className="mock-badge" title={t('mock.title', { sc: currentScenario() })}>{t('mock.badge')}</span>
        )}
        <nav className="navlinks" aria-label={t('nav.label')}>
          {user?.role === 'operator' && <NavItem to="/" end>{t('nav.map')}</NavItem>}
          <NavItem to="/notifikasi">{lang === 'id' ? 'Notifikasi' : 'Notifications'}</NavItem>
          <NavItem to="/tentang">{t('nav.about')}</NavItem>
          <NavItem to="/kontrak-api">
            <span className="nl-full">{t('nav.api')}</span><span className="nl-short">{t('nav.api_short')}</span>
          </NavItem>
        </nav>
        <div className="tools">
          <div className="seg" role="group" aria-label={t('lang.switch')}>
            <button aria-pressed={lang === 'en'} onClick={() => setLang('en')}>
              {lang === 'en' && <m.i className="pill-bg seg-bg" layoutId="seg-pill" transition={spring} />}<span>EN</span>
            </button>
            <button aria-pressed={lang === 'id'} onClick={() => setLang('id')}>
              {lang === 'id' && <m.i className="pill-bg seg-bg" layoutId="seg-pill" transition={spring} />}<span>ID</span>
            </button>
          </div>
          <button className="icon-btn" onClick={theme.cycle} title={t(`theme.${theme.pref}`)} aria-label={t(`theme.${theme.pref}`)}>
            {theme.pref === 'auto' ? '◐' : theme.pref === 'light' ? '☀' : '☾'}
          </button>
          {user ? (
            <button className="link-btn" onClick={() => { void signOut().then(() => nav('/masuk')).catch(() => nav('/masuk')); }} title={user.email}>{t('nav.signout')}</button>
          ) : (
            <NavLink className="link-btn" to="/masuk">{t('nav.signin')}</NavLink>
          )}
        </div>
      </div>
    </header>
  );
}

function Shell({ theme }: { theme: ReturnType<typeof useTheme> }) {
  const loc = useLocation();
  return (
    <>
      <TopBar theme={theme} />
      <main className={loc.pathname === '/' ? 'main-map' : 'main'}>
        <Suspense fallback={<PageFallback />}>
          {/* Dipasang ulang tiap rute (dan setelah chunk malas selesai), jadi halaman baru selalu masuk dengan gerak. */}
          <m.div
            key={loc.pathname} className="route"
            initial={{ opacity: 0, y: loc.pathname === '/' ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} transition={springSoft}
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
        <Route path="/masuk" element={<Masuk />} />
        <Route path="/tentang" element={<Tentang />} />
        <Route path="/kontrak-api" element={<KontrakApi />} />
        <Route path="/notifikasi" element={<RequireAuth operator={false}><Notifikasi /></RequireAuth>} />
        <Route path="/" element={<RequireAuth><PetaOperator dark={theme.dark} /></RequireAuth>} />
        <Route path="/kelompok/:id" element={<RequireAuth><Kelompok /></RequireAuth>} />
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
