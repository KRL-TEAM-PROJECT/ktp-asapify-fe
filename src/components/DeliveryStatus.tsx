import { useEffect, useState } from 'react';
import { getUserToken } from '../auth';
import { API_MODE } from '../api';
import { useI18n } from '../i18n';

type Row = { channel: string; status: string; error: string | null; acknowledged_at: string | null };
export function DeliveryStatus({ alertId }: { alertId: string }) {
  const { lang } = useI18n();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (API_MODE !== 'live') return;
    let active = true;
    async function load() {
      try {
        const token = await getUserToken();
        const response = await fetch(`${import.meta.env.VITE_API_BASE ?? ''}/api/v1/operator/alerts/${encodeURIComponent(alertId)}/deliveries`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error();
        const data = await response.json() as Row[];
        if (active) { setRows(data); setError(false); }
      } catch { if (active) setError(true); }
    }
    void load(); const timer = setInterval(() => void load(), 15000);
    return () => { active = false; clearInterval(timer); };
  }, [alertId]);
  if (API_MODE !== 'live') return null;
  if (error) return <p className="error">{lang === 'id' ? 'Status pengiriman belum dapat dimuat.' : 'Delivery status unavailable.'}</p>;
  if (!rows) return <p className="muted">{lang === 'id' ? 'Memuat status kanal…' : 'Loading channel status…'}</p>;
  const counts = new Map<string, number>();
  rows.forEach(row => {
    const label = `${row.channel} · ${row.acknowledged_at ? (lang === 'id' ? 'dikonfirmasi' : 'acknowledged') : row.status}${row.error ? ` (${row.error})` : ''}`;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });
  return <div aria-live="polite"><p className="muted small">{lang === 'id' ? 'accepted = diterima penyedia, belum berarti dibaca. Pembaruan setiap 15 detik.' : 'accepted = provider accepted, not necessarily read. Refreshes every 15 seconds.'}</p>
    <ul>{[...counts].map(([label, count]) => <li key={label}>{label}: {count}</li>)}</ul></div>;
}
