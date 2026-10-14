import { useEffect, useState } from 'react';
import { getUserToken } from '../auth';
import { API_MODE } from '../api';
import { useI18n } from '../i18n';

type Row = { group: string | null; status: string; error: string | null }; // group = its title; null once unlinked
const OPEN = new Set(['pending', 'sending']);
const WINDOW_MS = 3_600_000; // v1 delivery window: one hour after publishing (expires_at in the backend)
// Each poll reads every job of the alert and its group in Firestore; slow down once no job is running.
const POLL_OPEN_MS = 15_000;
const POLL_IDLE_MS = 60_000;

/** Delivery status per Telegram group. Every 15 s while a job is running, then every 60 s until the window ends. */
export function DeliveryStatus({ alertId, since }: { alertId: string; since: string }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (API_MODE !== 'live') return;
    let active = true;
    let timer: number | undefined;
    async function load() {
      let open = true;
      try {
        const token = await getUserToken();
        const response = await fetch(`${import.meta.env.VITE_API_BASE ?? ''}/api/v1/operator/alerts/${encodeURIComponent(alertId)}/deliveries`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error();
        const data = await response.json() as Row[];
        if (active) { setRows(data); setError(false); }
        open = data.some(row => OPEN.has(row.status));
      } catch { if (active) setError(true); }
      if (active && (open || Date.now() < Date.parse(since) + WINDOW_MS)) timer = window.setTimeout(() => void load(), open ? POLL_OPEN_MS : POLL_IDLE_MS);
    }
    void load();
    return () => { active = false; clearTimeout(timer); };
  }, [alertId, since]);
  if (API_MODE !== 'live') return null;
  if (error) return <p className="error">{t('dlv.error')}</p>;
  if (!rows) return <p className="muted">{t('dlv.loading')}</p>;
  const counts = new Map<string, number>();
  rows.forEach(row => {
    const label = `${row.group ?? t('dlv.unlinked')} · ${t(`dlv.st.${row.status}`)}${row.error ? ` (${row.error})` : ''}`;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });
  return <div aria-live="polite"><p className="muted small">{t('dlv.note')}</p>
    <ul>{[...counts].map(([label, count]) => <li key={label}>{label}: {count}</li>)}</ul></div>;
}
