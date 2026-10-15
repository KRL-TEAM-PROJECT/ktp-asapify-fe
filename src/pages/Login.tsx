import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { signIn, useAuthState } from '../auth';
import { API_MODE } from '../api';
import { useI18n } from '../i18n';
import { BrandMark, BrandWordmark } from '../components/BrandMark';
import { m, springSoft } from '../motion';

// Full screen without the app chrome: the mark and one line on the left, the sign-in on the right.
export function LoginPage() {
  const { t } = useI18n();
  const { user, loading, error: authError } = useAuthState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nav = useNavigate();
  const candidate = (useLocation().state as { from?: string } | null)?.from ?? '/';
  const from = candidate.startsWith('/') && !candidate.startsWith('//') ? candidate : '/';
  if (user) return <Navigate to={user.role === 'operator' ? from : '/'} replace />;

  async function login() {
    setBusy(true); setError(null);
    try { const u = await signIn(); nav(u.role === 'operator' ? from : '/', { replace: true }); }
    catch (e) {
      const code = e instanceof Error ? e.message : '';
      setError(t(code === 'FORBIDDEN' ? 'err.FORBIDDEN' : code === 'AUTH_NOT_CONFIGURED' ? 'login.config_error' : 'login.failed'));
    } finally { setBusy(false); }
  }

  return (
    <main className="login">
      <m.section
        className="login-hero" aria-label="ASAPify"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={springSoft}
      >
        <BrandMark />
        <BrandWordmark />
        <p className="login-tagline">
          {t('login.tagline')} <span className="login-beat">{t('login.tagline_beat')}</span>
        </p>
      </m.section>
      <m.div
        className="login-card"
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springSoft, delay: 0.08 }}
      >
        <h1>{t('login.title')}</h1>
        <button className="btn primary wide" disabled={busy || loading} onClick={() => { void login(); }}>
          {t(busy || loading ? 'login.wait' : API_MODE === 'live' ? 'login.google' : 'login.btn')}
        </button>
        <p className="muted small">{t(API_MODE === 'live' ? 'login.live_note' : 'login.note')}</p>
        {(error || authError) && <p className="error" role="alert">{error ?? t(authError === 'FORBIDDEN' ? 'err.FORBIDDEN' : 'login.config_error')}</p>}
        <Link className="small" to="/about">{t('login.about')}</Link>
      </m.div>
    </main>
  );
}
