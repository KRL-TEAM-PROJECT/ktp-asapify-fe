import { useEffect, useRef, useState } from 'react';
import { registerOperator } from '../auth';
import { useI18n } from '../i18n';
import { fmtDay } from '../lib/format';
import type { SignupStatus } from '../types';

interface Recaptcha {
  ready(cb: () => void): void;
  render(el: HTMLElement, options: Record<string, unknown>): number;
  reset(id?: number): void;
}
declare global { interface Window { grecaptcha?: { enterprise: Recaptcha } } }

const ACTION = 'operator_signup'; // the backend accepts only tokens made for this action
let script: Promise<Recaptcha> | null = null;
function recaptcha(): Promise<Recaptcha> {
  script ??= new Promise<Recaptcha>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = 'https://www.google.com/recaptcha/enterprise.js?render=explicit';
    el.async = true;
    el.onload = () => { const r = window.grecaptcha?.enterprise; if (r) r.ready(() => resolve(r)); else reject(new Error('CAPTCHA_UNAVAILABLE')); };
    el.onerror = () => { script = null; reject(new Error('CAPTCHA_UNAVAILABLE')); };
    document.head.appendChild(el);
  });
  return script;
}

/**
 * Hackathon judging period only: a signed-in account that is not an operator ticks the reCAPTCHA Enterprise box,
 * and the request goes out by itself once it is solved (backend POST /api/v1/access/signup).
 */
export function OperatorSignup({ status, email, onDone }: { status: SignupStatus; email: string; onDone(): void }) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<{ api: Recaptcha; id: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const until = status.until ? fmtDay(status.until) : '–';
  const message = (code: string) => { const key = `err.${code}`; const s = t(key); return s === key ? t('err.network') : s; };

  async function submit(token: string) {
    setBusy(true);
    setError(null);
    try {
      await registerOperator(token);
      onDone();
    } catch (e) {
      setError(message(e instanceof Error ? e.message : ''));
      if (widget.current) widget.current.api.reset(widget.current.id); // a token works once: tick again
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let live = true;
    recaptcha().then((api) => {
      if (!live || !box.current || widget.current) return;
      const dark = document.documentElement.dataset.theme === 'dark'
        || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
      widget.current = {
        api, id: api.render(box.current, {
          sitekey: status.site_key, action: ACTION, theme: dark ? 'dark' : 'light',
          callback: (token: string) => { void submit(token); }, 'expired-callback': () => setError(null),
        }),
      };
    }).catch(() => { if (live) setError(message('CAPTCHA_UNAVAILABLE')); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.site_key]);

  return (
    <div className="signup">
      <h1>{t('signup.title')}</h1>
      <p>{t('signup.lede', { email, date: until })}</p>
      <div ref={box} className="signup-box" aria-label={t('signup.box')} />
      {busy && <p className="small" role="status">{t('signup.sending')}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <p className="muted small">{t('signup.note', { date: until })}</p>
    </div>
  );
}
