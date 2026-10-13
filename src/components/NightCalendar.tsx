import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, type Variants } from 'motion/react';
import type { NightSummary } from '../types';
import { api } from '../api';
import { useI18n } from '../i18n';
import { fmtNight } from '../lib/format';
import { exitFast, m, spring, springSoft } from '../motion';
import { Select } from './Select';

interface Props {
  value: string; // night currently open, YYYY-MM-DD
  first: string; // Meta.nights.first
  last: string; // Meta.nights.last
  onPick(night: string): void;
  onClose(): void;
}

const pad = (n: number) => String(n).padStart(2, '0');
const monthOf = (d: string) => d.slice(0, 7);
const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};

// One month = 6 fixed rows, so the calendar height never jumps between months.
const CELLS = 42;

// The new month enters from its direction (forward = from the right); the old one leaves the other way.
const slide: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 28 }),
  center: { opacity: 1, x: 0, transition: springSoft },
  exit: (dir: number) => ({ opacity: 0, x: dir * -28, transition: exitFast }),
};

/**
 * Archive night calendar: one month per view, month and year navigation, nights without data
 * disabled, nights with ALERT clusters marked with a dot. Content from GET /operator/nights?month=.
 */
export function NightCalendar({ value, first, last, onPick, onClose }: Props) {
  const { t } = useI18n();
  const locale = 'en-US';
  const [month, setMonth] = useState(monthOf(value));
  const [dir, setDir] = useState(1); // direction of the last month change: 1 forward, -1 back
  const goMonth = (ym: string) => { setDir(ym > month ? 1 : -1); setMonth(ym); };
  const [days, setDays] = useState<Map<string, NightSummary> | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const cache = useRef(new Map<string, NightSummary[]>());
  const root = useRef<HTMLDivElement>(null);
  const focused = useRef(false);

  useEffect(() => { setMonth(monthOf(value)); }, [value]);

  useEffect(() => {
    const hit = cache.current.get(month);
    if (hit) { setDays(new Map(hit.map((n) => [n.night, n]))); return; }
    let alive = true;
    setDays(null);
    setError(false);
    api.nights(month).then(
      (list) => { cache.current.set(month, list); if (alive) setDays(new Map(list.map((n) => [n.night, n]))); },
      () => { if (alive) setError(true); },
    );
    return () => { alive = false; };
  }, [month, retry]);

  // Focus the selected night once, when the first month has loaded.
  useEffect(() => {
    if (!days || focused.current) return;
    focused.current = true;
    const pick = (sel: string) => root.current?.querySelector<HTMLButtonElement>(sel);
    (pick('.cal-day.on:not(:disabled)') ?? pick('.cal-day:not(:disabled)'))?.focus();
  }, [days]);

  // Close with Escape or a click outside the night picker (the opening button lives in .night-pick).
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const down = (e: PointerEvent) => { if (!(e.target as Element).closest('.night-pick')) onClose(); };
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', down);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('pointerdown', down); };
  }, [onClose]);

  const weekdays = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
    return Array.from({ length: 7 }, (_, i) => f.format(new Date(Date.UTC(2023, 0, 2 + i))).replace('.', '')); // 2 Jan 2023 = Monday
  }, [locale]);
  const monthNames = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' });
    return Array.from({ length: 12 }, (_, i) => f.format(new Date(Date.UTC(2023, i, 15))));
  }, [locale]);

  const firstMonth = monthOf(first), lastMonth = monthOf(last);
  const years: number[] = [];
  for (let y = Number(first.slice(0, 4)); y <= Number(last.slice(0, 4)); y++) years.push(y);
  const clamp = (ym: string) => (ym < firstMonth ? firstMonth : ym > lastMonth ? lastMonth : ym);

  const [year, mon] = month.split('-').map(Number); // not `m`: that is the motion component
  const lead = (new Date(Date.UTC(year, mon - 1, 1)).getUTCDay() + 6) % 7; // first column = Monday
  const count = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: count }, (_, i) => `${month}-${pad(i + 1)}`),
  ];
  while (cells.length < CELLS) cells.push(null);

  const dayLabel = (d: string, s: NightSummary | undefined) => {
    const date = fmtNight(d);
    if (!s?.has_data) return t('cal.day_none', { date });
    return s.alert_clusters > 0 ? t('cal.day_alert', { date, n: s.alert_clusters }) : date;
  };

  return (
    <m.div
      className="cal" ref={root} role="dialog" aria-label={t('cal.title')}
      initial={{ opacity: 0, scale: 0.92, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0, transition: spring }}
      exit={{ opacity: 0, scale: 0.96, y: 6, transition: exitFast }}
    >
      <div className="cal-head">
        <button className="icon-btn sm" onClick={() => goMonth(addMonths(month, -1))} disabled={month <= firstMonth} aria-label={t('cal.prev_month')}>‹</button>
        <Select
          size="sm" className="cal-month" label={t('cal.month')} value={String(mon)}
          onChange={(v) => goMonth(clamp(`${year}-${pad(Number(v))}`))}
          items={monthNames.map((name, i) => {
            const ym = `${year}-${pad(i + 1)}`;
            return { value: String(i + 1), label: name, disabled: ym < firstMonth || ym > lastMonth };
          })}
        />
        <Select
          size="sm" className="cal-year" label={t('cal.year')} value={String(year)}
          onChange={(v) => goMonth(clamp(`${v}-${pad(mon)}`))}
          items={years.map((yy) => ({ value: String(yy), label: String(yy) }))}
        />
        <button className="icon-btn sm" onClick={() => goMonth(addMonths(month, 1))} disabled={month >= lastMonth} aria-label={t('cal.next_month')}>›</button>
      </div>

      <div className="cal-dows" aria-hidden="true">
        {weekdays.map((w) => <span key={w} className="cal-dow">{w}</span>)}
      </div>
      <div className="cal-body">
        <AnimatePresence initial={false} mode="popLayout" custom={dir}>
          <m.div key={month} className="cal-grid" aria-busy={!days} custom={dir} variants={slide} initial="enter" animate="center" exit="exit">
            {cells.map((d, i) => {
              if (!d) return <span key={`x${i}`} />;
              const s = days?.get(d);
              return (
                <button
                  key={d} className={`cal-day${d === value ? ' on' : ''}${s?.alert_clusters ? ' hot' : ''}`}
                  disabled={!s?.has_data} aria-pressed={d === value} aria-label={dayLabel(d, s)} title={dayLabel(d, s)}
                  onClick={() => onPick(d)}
                >
                  {Number(d.slice(8))}
                </button>
              );
            })}
          </m.div>
        </AnimatePresence>
      </div>

      {error ? (
        <p className="cal-note" role="alert">{t('cal.error')} <button className="link-btn" onClick={() => setRetry((r) => r + 1)}>{t('retry')}</button></p>
      ) : !days ? (
        <p className="cal-note">{t('cal.loading')}</p>
      ) : (
        <p className="cal-note"><i className="cal-dot" aria-hidden="true" />{t('cal.legend_alert')} · {t('cal.legend_none')}</p>
      )}
    </m.div>
  );
}
