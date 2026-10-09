import { useEffect, useState } from 'react';
import { useUser } from '../auth';
import { API_MODE } from '../api';
import { useI18n } from '../i18n';
import { PROVINCE_CODES, PROVINCES } from '../lib/provinces';
import { notifications, type Channel, type Notice, type Preferences, type Settings } from '../notification-api';
import '../notifications.css';

const NAMES: Record<Channel, string> = { telegram: 'Telegram', fcm: 'Push aplikasi (FCM)', web_push: 'Web Push', whatsapp: 'WhatsApp', sms: 'SMS', gmail: 'Email / Gmail', lora: 'LoRa / LoRaWAN', bluetooth_mesh: 'Bluetooth Mesh' };
const EMPTY: Preferences = { provinces: [], channels: [], consent: false, exercises: false };

function plain(value: string) {
  // React renders text; stripping markup here only improves captions inherited from Telegram.
  return value.replace(/<[^>]*>/g, '');
}

export function Notifikasi() {
  const user = useUser();
  const { lang } = useI18n();
  const l = (id: string, en: string) => lang === 'id' ? id : en;
  const cacheKey = 'asapify.inbox.' + (user?.uid ?? 'mock-operator');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState<Preferences>(EMPTY);
  const [items, setItems] = useState<Notice[]>([]);
  const [offline, setOffline] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [saveOffline, setSaveOffline] = useState(() => !!localStorage.getItem(cacheKey));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
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
      setError(e instanceof Error ? e.message : l('Tidak dapat memuat inbox.', 'Inbox unavailable.'));
    }
  }
  useEffect(() => {
    let active = true;
    void notifications.settings().then(s => {
      if (!active) return;
      setSettings(s); const { provinces, channels, consent, exercises } = s.preferences;
      setForm({ provinces, channels, consent, exercises });
    }).catch(e => { if (active) setError(String(e.message)); });
    void refresh();
    const onOnline = () => { void refresh(); };
    window.addEventListener('online', onOnline);
    return () => { active = false; window.removeEventListener('online', onOnline); };
  }, [cacheKey, saveOffline]);

  async function act(task: () => Promise<void>) {
    setBusy(true); setError(''); setMessage('');
    try { await task(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  function toggleProvince(value: string) {
    setForm(f => ({ ...f, provinces: f.provinces.includes(value) ? f.provinces.filter(p => p !== value) : [...f.provinces, value] }));
  }
  function toggleChannel(value: Channel) {
    setForm(f => ({ ...f, channels: f.channels.includes(value) ? f.channels.filter(c => c !== value) : [...f.channels, value] }));
  }

  return <div className="wrap notifications">
    <header className="notify-heading"><div>
      <p className="notify-kicker">ASAPify · {l('Pusat informasi', 'Information centre')}</p>
      <h1>{l('Tetap terhubung.', 'Stay connected.')}</h1>
      <p className="muted">{l('Pilih wilayah dan cara menerima informasi. Konfirmasi setiap pesan yang sudah kamu baca.', 'Choose your regions and channels. Confirm each message after reading it.')}</p>
    </div><span className="notify-mode">{API_MODE === 'mock' ? l('DEMO • Tidak mengirim pesan', 'DEMO • No messages sent') : settings?.mode === 'live' ? l('Kanal sesuai konfigurasi', 'Configured channels') : l('Uji tanpa pengiriman', 'Dry run')}</span></header>
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p className="notify-success" role="status">{message}</p>}
    {offline && <p className="notify-offline" role="status">{l('Koneksi tidak tersedia atau layanan belum siap. Salinan tersimpan tidak menunjukkan keadaan terkini.', 'Connection or service unavailable. Saved information does not represent current conditions.')} {cachedAt && new Date(cachedAt).toLocaleString(lang)}</p>}
    <div className="notify-layout">
      <section className="card notify-inbox" aria-labelledby="inbox-h">
        <div className="notify-row"><h2 id="inbox-h">{l('Inbox informasi', 'Information inbox')}</h2><button className="btn" disabled={busy} onClick={() => void act(refresh)}>{l('Muat ulang', 'Refresh')}</button></div>
        <label className="notify-check"><input type="checkbox" checked={saveOffline} disabled={busy} onChange={e => {
          const checked = e.target.checked;
          if (!checked) { localStorage.removeItem(cacheKey); setSaveOffline(false); return; }
          void act(async () => { await (await import('../notification-push')).registerOffline(); setSaveOffline(true); });
        }} />{l('Simpan inbox di perangkat ini untuk dibaca offline', 'Save inbox on this device for offline reading')}</label>
        <p className="muted small">{l('Offline hanya menampilkan pesan yang pernah dimuat. Konfirmasi baru tercatat ketika server menerima.', 'Offline shows previously loaded messages only. Confirmation is recorded when the server receives it.')}</p>
        {!loaded && <p role="status">{l('Memuat…', 'Loading…')}</p>}
        {loaded && items.length === 0 && <div className="notify-empty">{l('Belum ada informasi untuk akun ini.', 'No information for this account yet.')}</div>}
        {items.map(item => <article className="notify-item" key={item.id} id={item.id}>
          <div className="notify-row"><strong>{item.purpose === 'exercise' ? l('SIMULASI', 'EXERCISE') : 'AWAS'}</strong><span className="muted small">{item.alert_id}</span></div>
          <p className="notify-text">{plain(item.text)}</p>
          <p className="muted small">{new Date(item.published_at).toLocaleString(lang)} · {l('Provinsi', 'Province')} {item.province}</p>
          {Date.parse(item.expires_at) < Date.now() && <p className="muted small">{l('Masa berlaku pengiriman berakhir. Periksa pembaruan terbaru.', 'Delivery window expired. Check for newer updates.')}</p>}
          {item.acknowledged_at ? <p className="notify-success">✓ {l('Dikonfirmasi diterima', 'Receipt confirmed')} · {new Date(item.acknowledged_at).toLocaleString(lang)}</p> :
            <button className="btn primary" disabled={busy || offline} onClick={() => void act(async () => {
              const ack = await notifications.ack(item.id);
              setItems(values => values.map(n => n.id === item.id ? { ...n, ...ack } : n));
              await refresh();
            })}>{l('Konfirmasi diterima', 'Confirm receipt')}</button>}
        </article>)}
      </section>
      <section className="card" aria-labelledby="pref-h">
        <h2 id="pref-h">{l('Preferensi kamu', 'Your preferences')}</h2>
        <fieldset disabled={busy || !settings}><legend>{l('1. Wilayah', '1. Regions')}</legend>
          <div className="notify-regions">{PROVINCE_CODES.map(code => <label className="notify-check" key={code}><input type="checkbox" checked={form.provinces.includes(code)} onChange={() => toggleProvince(code)} />{PROVINCES[code][lang]}</label>)}</div>
        </fieldset>
        <fieldset disabled={busy || !settings}><legend>{l('2. Kanal', '2. Channels')}</legend>
          <div className="notify-channels">{settings?.channels.map(c => <label className={`notify-channel ${c.implemented ? '' : 'planned'}`} key={c.channel}>
            <input type="checkbox" checked={form.channels.includes(c.channel)} onChange={() => toggleChannel(c.channel)} />
            <span><strong>{NAMES[c.channel]}</strong><small>{!c.implemented ? l('Tahap berikutnya · belum mengirim', 'Next phase · no sending yet') : ['fcm', 'web_push'].includes(c.channel) ? l('Simulasi / non-darurat saja', 'Exercise / non-emergency only') : l('Pesan teks ringan', 'Lightweight text messages')}</small></span>
            <span className="notify-tag">{c.enabled ? l('Aktif', 'Enabled') : c.implemented ? l('Perlu setup', 'Setup needed') : l('Rencana', 'Planned')}</span>
          </label>)}</div>
        </fieldset>
        <div className="notify-setup">
          <button className="btn" disabled={busy || API_MODE === 'mock'} onClick={() => void act(async () => {
            const result = await notifications.telegram(); setTelegramUrl(result.url);
          })}>{settings?.preferences.telegram_linked ? l('Hubungkan ulang Telegram', 'Relink Telegram') : l('Hubungkan Telegram', 'Link Telegram')}</button>
          {telegramUrl && <a href={telegramUrl} target="_blank" rel="noreferrer">{l('Buka bot, lalu tekan Start (10 menit)', 'Open bot and press Start (10 min)')}</a>}
          <button className="btn" disabled={busy || API_MODE === 'mock'} onClick={() => void act(async () => {
            await (await import('../notification-push')).enableBrowserPush();
            setMessage(l('Perangkat terdaftar. Pilih Web Push dan simpan persetujuan untuk menerima simulasi.', 'Device registered. Select Web Push and save consent to receive exercises.'));
          })}>{l('Daftarkan push browser', 'Register browser push')}</button>
        </div>
        <label className="notify-check"><input type="checkbox" disabled={busy || !settings} checked={form.exercises} onChange={e => setForm({ ...form, exercises: e.target.checked })} />{l('Saya juga ingin menerima simulasi berlabel SIMULASI.', 'I also want messages labelled EXERCISE.')}</label>
        <label className="notify-check"><input type="checkbox" disabled={busy || !settings} checked={form.consent} onChange={e => setForm({ ...form, consent: e.target.checked })} />{l('Saya setuju menerima informasi untuk wilayah dan kanal pilihan. Saya dapat berhenti kapan saja.', 'I agree to receive information for my selected regions and channels. I can unsubscribe at any time.')}</label>
        <button className="btn primary wide" disabled={busy || !settings || (form.consent && !form.provinces.length)} onClick={() => void act(async () => {
          await notifications.save(form);
          setMessage(l(form.consent ? 'Preferensi dan persetujuan tersimpan.' : 'Langganan dihentikan.', form.consent ? 'Preferences and consent saved.' : 'Subscription stopped.'));
        })}>{busy ? l('Menyimpan…', 'Saving…') : form.consent ? l('Simpan preferensi', 'Save preferences') : l('Simpan / hentikan langganan', 'Save / unsubscribe')}</button>
        <p className="muted small">{l('WhatsApp, SMS, email, LoRa dan Bluetooth dicatat sebagai pilihan untuk tahap berikutnya. Kanal tersebut belum diaktifkan.', 'WhatsApp, SMS, email, LoRa and Bluetooth choices are saved for a later phase. These channels are not enabled yet.')}</p>
      </section>
    </div>
  </div>;
}
