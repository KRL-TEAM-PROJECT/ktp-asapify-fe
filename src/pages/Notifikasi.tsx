import { useEffect, useState } from 'react';
import { useUser } from '../auth';
import { API_MODE } from '../api';
import { useI18n } from '../i18n';
import { errorText } from '../lib/errors';
import { fmtSlot } from '../lib/format';
import { PROVINCE_CODES, PROVINCES } from '../lib/provinces';
import { notifications, type Channel, type Notice, type Preferences, type Settings } from '../notification-api';
import { IconCheck } from '../components/icons';
import '../notifications.css';

const EMPTY: Preferences = { provinces: [], channels: [], consent: false, exercises: false };
const PUSH: Channel[] = ['fcm', 'web_push'];

function plain(value: string) {
  // React renders text; stripping markup here only improves captions inherited from Telegram.
  return value.replace(/<[^>]*>/g, '');
}

export function Notifikasi() {
  const user = useUser();
  const { t, lang } = useI18n();
  const cacheKey = 'asapify.inbox.' + (user?.uid ?? 'mock-operator');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState<Preferences>(EMPTY);
  const [items, setItems] = useState<Notice[]>([]);
  const [offline, setOffline] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [saveOffline, setSaveOffline] = useState(() => !!localStorage.getItem(cacheKey));
  const [busy, setBusy] = useState(false);
  // Galat dan pesan disimpan sebagai objek/kunci, diterjemahkan saat render: ganti bahasa ikut mengganti teksnya.
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState('');
  const [telegramUrl, setTelegramUrl] = useState('');
  const [loaded, setLoaded] = useState(false);

  async function refresh() {
    try {
      const next = await notifications.inbox();
      setItems(next); setOffline(false); setLoaded(true);
      if (saveOffline) {
        const at = new Date().toISOString();
        localStorage.setItem(cacheKey, JSON.stringify({ at, items: next })); setCachedAt(at);
      }
    } catch (e) {
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) ?? 'null');
        if (cached?.items) { setItems(cached.items); setCachedAt(cached.at); }
      } catch { /* no usable cache */ }
      setOffline(true); setLoaded(true);
      setError(e);
    }
  }
  useEffect(() => {
    let active = true;
    void notifications.settings().then(s => {
      if (!active) return;
      setSettings(s); const { provinces, channels, consent, exercises } = s.preferences;
      setForm({ provinces, channels, consent, exercises });
    }).catch(e => { if (active) setError(e); });
    void refresh();
    const onOnline = () => { void refresh(); };
    window.addEventListener('online', onOnline);
    return () => { active = false; window.removeEventListener('online', onOnline); };
  }, [cacheKey, saveOffline]);

  async function act(task: () => Promise<void>) {
    setBusy(true); setError(null); setMessage('');
    try { await task(); } catch (e) { setError(e); }
    finally { setBusy(false); }
  }
  function toggleProvince(value: string) {
    setForm(f => ({ ...f, provinces: f.provinces.includes(value) ? f.provinces.filter(p => p !== value) : [...f.provinces, value] }));
  }
  function toggleChannel(value: Channel) {
    setForm(f => ({ ...f, channels: f.channels.includes(value) ? f.channels.filter(c => c !== value) : [...f.channels, value] }));
  }

  const mode = API_MODE === 'mock' ? 'mock' : settings?.mode === 'live' ? 'live' : 'dry';
  // "Berhenti berlangganan" hanya bermakna bila persetujuan yang tersimpan sedang aktif.
  const stopping = !form.consent && !!settings?.preferences.consent;
  return <div className="wrap notifications">
    <header className="notify-head">
      <div>
        <h1>{t('notif.title')}</h1>
        <p className="muted">{t('notif.lede')}</p>
      </div>
      <span className={`notify-mode ${mode}`}>{t(`notif.mode_${mode}`)}</span>
    </header>
    {error != null && <p className="error" role="alert">{errorText(error, t)}</p>}
    {message && <p className="notify-ok" role="status"><IconCheck size={14} />{t(message)}</p>}
    {offline && <p className="callout" role="status">{cachedAt ? t('notif.offline_cached', { when: fmtSlot(cachedAt, lang) }) : t('notif.offline')}</p>}
    <div className="notify-layout">
      <section className="card" aria-labelledby="inbox-h">
        <div className="card-head">
          <h2 id="inbox-h">{t('notif.inbox')}</h2>
          <button className="btn" disabled={busy} onClick={() => void act(refresh)}>{t('notif.refresh')}</button>
        </div>
        <label className="opt switch">
          <span>{t('notif.offline_save')}</span>
          <input type="checkbox" role="switch" checked={saveOffline} disabled={busy} onChange={e => {
            const checked = e.target.checked;
            if (!checked) { localStorage.removeItem(cacheKey); setSaveOffline(false); return; }
            void act(async () => { await (await import('../notification-push')).registerOffline(); setSaveOffline(true); });
          }} />
        </label>
        <p className="muted small">{t('notif.offline_note')}</p>
        {!loaded && <p className="muted" role="status">{t('notif.loading')}</p>}
        {loaded && items.length === 0 && <p className="empty">{t('notif.empty')}</p>}
        {items.map(item => <article className="notify-item" key={item.id} id={item.id}>
          <div className="card-head">
            <strong>{item.purpose === 'exercise' ? t('notif.exercise') : 'AWAS'}</strong>
            <span className="mono muted small">{item.alert_id}</span>
          </div>
          <p className="notify-text">{plain(item.text)}</p>
          <p className="muted small">{fmtSlot(item.published_at, lang)} · {t(`prov.${item.province}`)}</p>
          {Date.parse(item.expires_at) < Date.now() && <p className="muted small">{t('notif.expired')}</p>}
          {item.acknowledged_at
            ? <p className="notify-ok"><IconCheck size={14} />{t('notif.acked', { when: fmtSlot(item.acknowledged_at, lang) })}</p>
            : <button className="btn primary" disabled={busy || offline} onClick={() => void act(async () => {
              const ack = await notifications.ack(item.id);
              setItems(values => values.map(n => n.id === item.id ? { ...n, ...ack } : n));
              await refresh();
            })}>{t('notif.ack')}</button>}
        </article>)}
      </section>
      <section className="card" aria-labelledby="pref-h">
        <h2 id="pref-h">{t('notif.prefs')}</h2>
        <fieldset disabled={busy || !settings}>
          <legend className="lbl">{t('notif.provinces')}</legend>
          <div className="notify-regions">{PROVINCE_CODES.map(code => <label className="opt check" key={code}>
            <input type="checkbox" checked={form.provinces.includes(code)} onChange={() => toggleProvince(code)} />
            <span>{PROVINCES[code][lang]}</span>
          </label>)}</div>
        </fieldset>
        <fieldset disabled={busy || !settings}>
          <legend className="lbl">{t('notif.channels')}</legend>
          <div className="notify-channels">{settings?.channels.map(c => <label className="opt check notify-channel" key={c.channel}>
            <input type="checkbox" checked={form.channels.includes(c.channel)} onChange={() => toggleChannel(c.channel)} />
            <span>{t(`notif.ch.${c.channel}`)}<small>{t(!c.implemented ? 'notif.ch_planned' : PUSH.includes(c.channel) ? 'notif.ch_push' : 'notif.ch_text')}</small></span>
            <span className="notify-tag">{t(c.enabled ? 'notif.tag_on' : c.implemented ? 'notif.tag_setup' : 'notif.tag_planned')}</span>
          </label>)}</div>
        </fieldset>
        <div className="btns">
          <button className="btn" disabled={busy || API_MODE === 'mock'} onClick={() => void act(async () => {
            const result = await notifications.telegram(); setTelegramUrl(result.url);
          })}>{t(settings?.preferences.telegram_linked ? 'notif.tg_relink' : 'notif.tg_link')}</button>
          <button className="btn" disabled={busy || API_MODE === 'mock'} onClick={() => void act(async () => {
            await (await import('../notification-push')).enableBrowserPush();
            setMessage('notif.push_done');
          })}>{t('notif.push_register')}</button>
        </div>
        {telegramUrl && <a href={telegramUrl} target="_blank" rel="noreferrer">{t('notif.tg_open')}</a>}
        <label className="opt switch">
          <span>{t('notif.exercises')}</span>
          <input type="checkbox" role="switch" disabled={busy || !settings} checked={form.exercises} onChange={e => setForm({ ...form, exercises: e.target.checked })} />
        </label>
        <label className="opt check notify-consent">
          <input type="checkbox" disabled={busy || !settings} checked={form.consent} onChange={e => setForm({ ...form, consent: e.target.checked })} />
          <span>{t('notif.consent')}</span>
        </label>
        <button className="btn primary wide" disabled={busy || !settings || (form.consent && !form.provinces.length)} onClick={() => void act(async () => {
          await notifications.save(form);
          setSettings(s => s && { ...s, preferences: { ...s.preferences, ...form } });
          setMessage(stopping ? 'notif.stopped' : 'notif.saved');
        })}>{t(busy ? 'notif.saving' : stopping ? 'notif.save_stop' : 'notif.save')}</button>
        <p className="muted small">{t('notif.planned_note')}</p>
      </section>
    </div>
  </div>;
}
