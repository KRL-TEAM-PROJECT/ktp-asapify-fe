import { useId } from 'react';
import type { SeriesPoint } from '../types';
import { useI18n } from '../i18n';
import { fmtDate, fmtNum } from '../lib/format';
import { m, spring } from '../motion';

interface Props {
  series: SeriesPoint[];
  thresholds: { warning: number; alert: number };
  triggerSlot: string;
}

const W = 640, H = 210, PL = 30, PR = 8, PT = 12, PB = 30, GAP = 14, SLOTS = 48;
const SLOT_MS = 600_000;

/** Utility per slot, one panel per night (13:00–20:50 UTC). Unobserved slots are hatched. */
export function UtilityChart({ series, thresholds, triggerSlot }: Props) {
  const { t } = useI18n();
  const hatch = `hatch-${useId().replace(/:/g, '')}`;

  const nights = [...new Set(series.map((p) => p.slot.slice(0, 10)))];
  const nw = (W - PL - PR - GAP * (nights.length - 1)) / nights.length;
  const ih = H - PT - PB;
  const y = (u: number) => PT + (1 - u) * ih;
  const pos = (slot: string) => {
    const d = slot.slice(0, 10);
    const ni = nights.indexOf(d);
    const idx = (Date.parse(slot) - Date.parse(`${d}T13:00:00Z`)) / SLOT_MS;
    return { ni, x: PL + ni * (nw + GAP) + (idx / (SLOTS - 1)) * nw };
  };
  const slotW = nw / (SLOTS - 1);

  // break the line at slots without an observation
  const segments: string[][] = [];
  let cur: string[] = [];
  let curNight = -1;
  for (const p of series) {
    const { ni, x } = pos(p.slot);
    if (p.U == null || ni !== curNight) {
      if (cur.length) segments.push(cur);
      cur = [];
      curNight = ni;
      if (p.U == null) continue;
    }
    cur.push(`${x.toFixed(1)},${y(p.U).toFixed(1)}`);
  }
  if (cur.length) segments.push(cur);

  const trig = series.find((p) => p.slot === triggerSlot);
  const tp = trig ? pos(trig.slot) : null;
  const first = series[0]?.slot, last = series[series.length - 1]?.slot;

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('chart.aria', { u: trig?.U != null ? fmtNum(trig.U, 2) : '-' })}>
        <defs>
          <pattern id={hatch} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--line)" strokeWidth="3" />
          </pattern>
        </defs>
        {nights.map((d, i) => (
          <g key={d}>
            <rect x={PL + i * (nw + GAP)} y={PT} width={nw} height={ih} fill="var(--surface-2)" opacity="0.5" />
            <text x={PL + i * (nw + GAP) + nw / 2} y={H - 10} textAnchor="middle" className="ax">{fmtDate(`${d}T13:00:00Z`)}</text>
          </g>
        ))}
        {series.filter((p) => p.U == null).map((p) => {
          const { x } = pos(p.slot);
          return <rect key={p.slot} x={x - slotW / 2} y={PT} width={slotW} height={ih} fill={`url(#${hatch})`} />;
        })}
        {[0, 0.5, 1].map((v) => (
          <text key={v} x={PL - 6} y={y(v) + 3} textAnchor="end" className="ax">{fmtNum(v, 1)}</text>
        ))}
        <line x1={PL} x2={W - PR} y1={y(thresholds.alert)} y2={y(thresholds.alert)} stroke="var(--ember)" strokeDasharray="4 3" />
        <text x={PL + 4} y={y(thresholds.alert) - 4} className="ax" fill="var(--ember)">{fmtNum(thresholds.alert, 2)} ALERT</text>
        <line x1={PL} x2={W - PR} y1={y(thresholds.warning)} y2={y(thresholds.warning)} stroke="var(--amber)" strokeDasharray="4 3" />
        <text x={PL + 4} y={y(thresholds.warning) - 4} className="ax" fill="var(--amber)">{fmtNum(thresholds.warning, 2)}</text>
        {segments.map((s, i) =>
          s.length === 1
            ? <circle key={i} cx={s[0].split(',')[0]} cy={s[0].split(',')[1]} r="1.6" fill="var(--ink)" />
            : (
              // the utility line draws left to right when the chart enters the screen
              <m.polyline
                key={i} points={s.join(' ')} fill="none" stroke="var(--ink)" strokeWidth="1.8" strokeLinejoin="round"
                initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }}
                transition={{ duration: 0.9, ease: [0.32, 0.72, 0, 1], delay: 0.1 + i * 0.25 }}
              />
            ),
        )}
        {tp && trig?.U != null && (
          <g>
            <line x1={tp.x} x2={tp.x} y1={PT} y2={PT + ih} stroke="var(--ember)" strokeWidth="1" />
            <m.circle
              cx={tp.x} cy={y(trig.U)} fill="var(--ember)" stroke="var(--surface)" strokeWidth="1.5"
              initial={{ r: 0 }} whileInView={{ r: 4.5 }} viewport={{ once: true }} transition={{ ...spring, delay: 0.9 }}
            />
            <text x={tp.x - 6} y={PT + ih - 6} textAnchor="end" className="ax" fill="var(--ember)">{t('chart.trigger')}</text>
          </g>
        )}
      </svg>
      {first && last && (
        <figcaption>{t('chart.caption', { range: `${fmtDate(first)} – ${fmtDate(last)}` })}</figcaption>
      )}
    </figure>
  );
}
