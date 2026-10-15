import { useEffect, useState, type FormEvent } from 'react';
import type { OperatorAccess as Access } from '../types';
import { api } from '../api';
import { useUser } from '../auth';
import { useI18n } from '../i18n';
import { errorText } from '../lib/errors';
import { fmtSlot } from '../lib/format';

const EMAIL = /^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/; // same check as the backend, so the operator gets a precise message

/**
 * Operators add and remove operators by email (backend asapify_api/access_routes.py). The list loads when the panel
 * opens: it asks Firebase for every operator account, so it is not fetched with every region refresh.
 */
export function OperatorAccess() {
  const { t } = useI18n();
  const me = useUser()?.email.toLowerCase();
  const [rows, setRows] = useState<Access[] | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try { setRows(await api.operatorAccess()); } catch (e) { setError(errorText(e, t)); }
  }
  async function run(job: () => Promise<string>) {
    setBusy(true); setError(null); setNote(null);
    try { setNote(await job()); await load(); } catch (e) { setError(errorText(e, t)); } finally { setBusy(false); }
  }
  function add(e: FormEvent) {
    e.preventDefault();
    if (!EMAIL.test(email.trim())) { setNote(null); setError(t('access.invalid')); return; }
    void run(async () => {
      const row = await api.grantOperator(email);
      setEmail('');
      return t(row.state === 'active' ? 'access.added_active' : 'access.added_pending', { email: row.email });
    });
  }
  function remove(target: string) {
    setConfirm(null);
    void run(async () => { await api.revokeOperator(target); return t('access.removed', { email: target }); });
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []);

  return (
    <section className="card rg-access">
      <h2>{t('access.title')}</h2>
      <p className="muted small">{t('access.lede')}</p>
      <form className="rg-access-form" onSubmit={add}>
        <label className="lbl" htmlFor="access-email">{t('access.email')}</label>
        <div className="rg-access-row">
          <input
            id="access-email" type="email" required autoComplete="off" inputMode="email" spellCheck={false}
            placeholder="name@example.org" value={email} disabled={busy} onChange={(e) => setEmail(e.target.value)}
          />
          <button className="btn primary" type="submit" disabled={busy || !email.trim()}>{t('access.add')}</button>
        </div>
      </form>
      {note && <p className="small" role="status">{note}</p>}
      {error && <p className="error small" role="alert">{error}</p>}
      {rows == null ? (!error && <div className="skel" style={{ height: 44 }} />) : (
        <ul className="rg-access-list" aria-label={t('access.list')}>
          {rows.map((r) => (
            <li key={r.email}>
              <span className="rg-access-who">
                <span className="mono small">{r.email}</span>
                <span className={`pill outline ${r.state === 'active' ? 'q-ok' : 'q-mid'}`}>{t(`access.${r.state}`)}</span>
              </span>
              {r.added_by && r.added_at && (
                <span className="muted small">{t('access.added_by', { who: r.added_by, when: fmtSlot(r.added_at) })}</span>
              )}
              <span className="rg-access-act">
                {r.email === me ? <span className="muted small">{t('access.you')}</span>
                  : confirm === r.email ? (
                    <>
                      <span className="small">{t('access.confirm', { email: r.email })}</span>
                      <button className="link-btn danger" disabled={busy} onClick={() => remove(r.email)}>{t('access.remove')}</button>
                      <button className="link-btn" disabled={busy} onClick={() => setConfirm(null)}>{t('access.cancel')}</button>
                    </>
                  ) : <button className="link-btn" disabled={busy} onClick={() => setConfirm(r.email)}>{t('access.remove')}</button>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
