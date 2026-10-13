import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { signIn, useAuthState } from '../auth';
import { API_MODE } from '../api';
import { useI18n } from '../i18n';
import type { Neighbour } from '../types';
import { NeighbourGrid } from '../components/NeighbourGrid';
import { m, springSoft } from '../motion';

// Rule illustration: the centre pixel + 3/8 hot neighbours, one cloudy, one not peat.
const RULE_DEMO: Neighbour[] = [
  { dir: 'nw', state: 'normal', u0: 0.1 }, { dir: 'n', state: 'anomaly', u0: 0.6 }, { dir: 'ne', state: 'non_peat', u0: null },
  { dir: 'w', state: 'normal', u0: 0.2 }, { dir: 'e', state: 'anomaly', u0: 0.7 },
  { dir: 'sw', state: 'cloud', u0: null }, { dir: 's', state: 'normal', u0: 0.1 }, { dir: 'se', state: 'anomaly', u0: 0.8 },
];

export function LoginPage() {
  const { t } = useI18n();
  const { user, loading, error: authError } = useAuthState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nav = useNavigate();
  const candidate = (useLocation().state as { from?: string } | null)?.from ?? '/';
  const from = candidate.startsWith('/') && !candidate.startsWith('//') ? candidate : '/';
  if (user) return <Navigate to={user.role === 'operator' ? from : '/notifications'} replace />;

  async function login() {
    setBusy(true); setError(null);
    try { const u = await signIn(); nav(u.role === 'operator' ? from : '/notifications', { replace: true }); }
    catch (e) {
      const code = e instanceof Error ? e.message : '';
      setError(t(code === 'FORBIDDEN' ? 'err.FORBIDDEN' : code === 'AUTH_NOT_CONFIGURED' ? 'login.config_error' : 'login.failed'));
    } finally { setBusy(false); }
  }

  return (
    <div className="login">
      <m.section
        className="login-aside" aria-labelledby="rule-h"
        initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ ...springSoft, delay: 0.05 }}
      >
        <span className="brand big"><i aria-hidden="true" />ASAPify</span>
        <h2 id="rule-h">{t('login.rule_t')}</h2>
        <p>{t('login.rule')}</p>
        <NeighbourGrid neighbours={RULE_DEMO} />
      </m.section>
      <m.div
        className="card login-card"
        initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ ...springSoft, delay: 0.12 }}
      >
        <h1>{t('login.title')}</h1>
        <p className="muted">{t('login.lede')}</p>
        <button className="btn primary wide" disabled={busy || loading} onClick={() => { void login(); }}>
          {t(busy || loading ? 'login.wait' : API_MODE === 'live' ? 'login.google' : 'login.btn')}
        </button>
        <p className="muted small">{t(API_MODE === 'live' ? 'login.live_note' : 'login.note')}</p>
        {(error || authError) && <p className="error" role="alert">{error ?? t(authError === 'FORBIDDEN' ? 'err.FORBIDDEN' : 'login.config_error')}</p>}
        <Link to="/about">{t('login.about')}</Link>
      </m.div>
    </div>
  );
}
