import { useEffect, useState, type FormEvent } from 'react';
import type { TelegramGroup } from '../types';
import { api } from '../api';
import { useI18n } from '../i18n';
import { errorText } from '../lib/errors';
import { fmtSlot } from '../lib/format';
import { INVITE } from '../lib/telegram';

/**
 * Telegram groups that receive every published alert (backend notification_store.py). The backend gives a one-time
 * t.me/<bot>?startgroup=<code> link; the group is linked when the bot sees `/start@<bot> <code>` in it. Telegram does
 * not always send that message when it adds the bot (never when the bot is already in the group), so the panel shows
 * the message to send by hand, with the link as the way to add the bot first.
 */
function linkCommand(url: string): string {
  const u = new URL(url);
  return `/start@${u.pathname.slice(1)} ${u.searchParams.get('startgroup') ?? ''}`;
}

export function TelegramGroups() {
  const { t } = useI18n();
  const [rows, setRows] = useState<TelegramGroup[] | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invites, setInvites] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  async function load() {
    setError(null);
    try { setRows(await api.telegramGroups()); } catch (e) { setError(errorText(e, t)); }
  }
  async function create() {
    setBusy(true); setError(null);
    setCopied(false);
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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []);

  return (
    <section className="card rg-access">
      <h2>{t('tg.title')}</h2>
      <p className="muted small">{t('tg.lede')}</p>
      {link ? (
        <div className="tg-link small">
          <p>{t('tg.step_send')}</p>
          <div className="tg-cmd">
            <code>{linkCommand(link)}</code>
            <button className="btn" type="button" onClick={() => {
              void navigator.clipboard?.writeText(linkCommand(link)).then(() => setCopied(true), () => setCopied(false));
            }}>{t(copied ? 'tg.copied' : 'tg.copy')}</button>
          </div>
          <p className="muted">
            {t('tg.step_add')} <a href={link} target="_blank" rel="noopener noreferrer">{t('tg.open')}</a>
          </p>
          <button className="btn primary" type="button" disabled={busy} onClick={() => { setLink(null); void load(); }}>{t('tg.refresh')}</button>
        </div>
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
                {g.invite_url ? <span className="muted small">{t('tg.invite_listed')}</span>
                  : <span className="callout small">{t('tg.invite_hint')}</span>}
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
    </section>
  );
}
