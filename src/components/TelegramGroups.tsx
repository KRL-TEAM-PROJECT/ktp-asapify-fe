import { useState, type FormEvent } from 'react';
import type { TelegramGroup } from '../types';
import { api } from '../api';
import { useI18n } from '../i18n';
import { errorText } from '../lib/errors';
import { fmtSlot } from '../lib/format';
import { INVITE } from '../lib/telegram';

/**
 * Telegram groups that receive every published alert (backend notification_store.py). Linking is a one-time
 * t.me/<bot>?startgroup= link: Telegram asks which group, adds the bot and hands the code back to the backend.
 * The link is fetched first and then opened by the operator's own click, so no popup blocker gets in the way.
 */
export function TelegramGroups() {
  const { t } = useI18n();
  const [rows, setRows] = useState<TelegramGroup[] | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invites, setInvites] = useState<Record<string, string>>({});

  async function load() {
    setError(null);
    try { setRows(await api.telegramGroups()); } catch (e) { setError(errorText(e, t)); }
  }
  async function create() {
    setBusy(true); setError(null);
    try { setLink((await api.linkTelegramGroup()).url); } catch (e) { setError(errorText(e, t)); } finally { setBusy(false); }
  }
  async function saveInvite(e: FormEvent, g: TelegramGroup) {
    e.preventDefault();
    const value = (invites[g.id] ?? g.invite_url ?? '').trim();
    if (value && !INVITE.test(value)) { setError(t('tg.invite_invalid')); return; }
    setBusy(true); setError(null);
    try { await api.setTelegramInvite(g.id, value || null); await load(); } catch (err) { setError(errorText(err, t)); } finally { setBusy(false); }
  }
  async function unlink(id: string) {
    setConfirm(null); setBusy(true); setError(null);
    try { await api.unlinkTelegramGroup(id); await load(); } catch (e) { setError(errorText(e, t)); } finally { setBusy(false); }
  }

  return (
    <details className="legend rg-access" onToggle={(e) => { if (e.currentTarget.open && !rows) void load(); }}>
      <summary>{t('tg.title')}</summary>
      <p className="muted small">{t('tg.lede')}</p>
      {link ? (
        <ol className="tg-steps small">
          <li><a href={link} target="_blank" rel="noopener noreferrer">{t('tg.open')}</a> {t('tg.step_pick')}</li>
          <li>{t('tg.step_back')} <button className="link-btn" disabled={busy} onClick={() => { setLink(null); void load(); }}>{t('tg.refresh')}</button></li>
        </ol>
      ) : (
        <button className="btn primary" disabled={busy} onClick={() => { void create(); }}>{t('tg.add')}</button>
      )}
      {error && <p className="error small" role="alert">{error}</p>}
      {rows == null ? (!error && <div className="skel" style={{ height: 44 }} />) : rows.length === 0 ? (
        <p className="muted small">{t('tg.none')}</p>
      ) : (
        <ul className="rg-access-list" aria-label={t('tg.list')}>
          {rows.map((g) => (
            <li key={g.id}>
              <span className="rg-access-who"><span className="small">{g.title || t('tg.untitled')}</span></span>
              {g.linked_by && g.linked_at && (
                <span className="muted small">{t('tg.linked_by', { who: g.linked_by, when: fmtSlot(g.linked_at) })}</span>
              )}
              <form className="rg-access-form" onSubmit={(e) => { void saveInvite(e, g); }}>
                <label className="lbl" htmlFor={`invite-${g.id}`}>{t('tg.invite')}</label>
                <div className="rg-access-row">
                  <input
                    id={`invite-${g.id}`} type="url" inputMode="url" autoComplete="off" spellCheck={false}
                    placeholder="https://t.me/+…" value={invites[g.id] ?? g.invite_url ?? ''} disabled={busy}
                    onChange={(e) => setInvites((v) => ({ ...v, [g.id]: e.target.value }))}
                  />
                  <button className="btn" type="submit" disabled={busy}>{t('tg.invite_save')}</button>
                </div>
                <span className="muted small">{t(g.invite_url ? 'tg.invite_listed' : 'tg.invite_hint')}</span>
              </form>
              <span className="rg-access-act">
                {confirm === g.id ? (
                  <>
                    <span className="small">{t('tg.confirm')}</span>
                    <button className="link-btn danger" disabled={busy} onClick={() => { void unlink(g.id); }}>{t('tg.unlink')}</button>
                    <button className="link-btn" disabled={busy} onClick={() => setConfirm(null)}>{t('access.cancel')}</button>
                  </>
                ) : <button className="link-btn" disabled={busy} onClick={() => setConfirm(g.id)}>{t('tg.unlink')}</button>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
