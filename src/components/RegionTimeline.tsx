import { useId } from 'react';
import type { HourRecord, Status } from '../types';
import { useI18n } from '../i18n';
import { fmtDate, fmtNum, fmtSigned, fmtSlot } from '../lib/format';
import { m } from '../motion';
import { STATUS_KEY } from './StatusBadge';

const W = 640, PL = 44, PR = 10;
const STRIP = { y: 6, h: 12 };
const DT = { y: 30, h: 92 };
const RH = { y: 136, h: 58 };
const CLOUD = { y: 208, h: 50 };
const H = CLOUD.y + CLOUD.h + 26;
const HOUR = 3_600_000;
const FILL: Record<Status, string> = { SAFE: 'var(--moss)', WARNING: 'var(--amber)', ALERT: 'var(--ember)', NO_OBSERVABLE: '' };

/** Line through the hours that have a value; breaks where a value is missing. */
function path(points: ({ x: number; y: number } | null)[]) {
  let d = '';
  let pen = false;
  for (const p of points) {
    if (!p) { pen = false; continue; }
    d += `${pen ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    pen = true;
  }
  return d;
}

/**
 * Hour by hour: rules-engine status (strip), ΔT against the baseline, relative humidity and cloud cover.
 * Dashed lines are the design document's breakpoints: ΔT 3 K / 8 K, humidity 30 % / 60 %, cloud 60 %.
 */
export function RegionTimeline({ hours }: { hours: HourRecord[] }) {
  const { t } = useI18n();
  const hatch = `rg-hatch-${useId().replace(/:/g, '')}`;
  if (!hours.length) return <p className="muted">{t('rgt.empty')}</p>;

  const t0 = Date.parse(hours[0].observed_at);
  const t1 = Date.parse(hours[hours.length - 1].observed_at);
  const span = Math.max(HOUR, t1 - t0);
  const slot = ((W - PL - PR) * HOUR) / (span + HOUR);
  const x = (iso: string) => PL + ((Date.parse(iso) - t0) / (span + HOUR)) * (W - PL - PR) + slot / 2;

  const dts = hours.map((h) => h.inputs.delta_t_k).filter((v): v is number => v != null);
  const lo = Math.min(-2, ...dts), hi = Math.max(10, ...dts);
  const yDt = (v: number) => DT.y + (1 - (v - lo) / (hi - lo)) * DT.h;
  const yPct = (band: { y: number; h: number }, v: number) => band.y + (1 - v / 100) * band.h;

  // Day labels at local midnight (UTC+7), as everywhere else in the UI.
  const days = hours.filter((h) => (new Date(h.observed_at).getUTCHours() + 7) % 24 === 0);

  return (
    <figure className="chart rg-timeline">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('rgt.aria', { n: hours.length })}>
        <defs>
          <pattern id={hatch} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--ink-dim)" strokeWidth="2.2" />
          </pattern>
        </defs>

        {/* status strip */}
        {hours.map((h) => (
          <rect
            key={h.observed_at} x={x(h.observed_at) - slot / 2} y={STRIP.y} width={slot + 0.4} height={STRIP.h}
            fill={h.status === 'NO_OBSERVABLE' ? `url(#${hatch})` : FILL[h.status]} opacity={h.status === 'NO_OBSERVABLE' ? 0.55 : 0.9}
          />
        ))}
        <text x={PL - 6} y={STRIP.y + 10} textAnchor="end" className="ax">{t('rgt.status')}</text>

        {/* panels */}
        {[DT, RH, CLOUD].map((b, i) => <rect key={i} x={PL} y={b.y} width={W - PL - PR} height={b.h} fill="var(--surface-2)" opacity="0.5" />)}
        <text x={PL - 6} y={DT.y + 10} textAnchor="end" className="ax">ΔT K</text>
        <text x={PL - 6} y={RH.y + 10} textAnchor="end" className="ax">RH %</text>
        <text x={PL - 6} y={CLOUD.y + 10} textAnchor="end" className="ax">{t('rgt.cloud')}</text>

        {/* thresholds */}
        {[[3, 'var(--amber)'], [8, 'var(--ember)']].map(([v, c]) => (
          <g key={v}>
            <line x1={PL} x2={W - PR} y1={yDt(v as number)} y2={yDt(v as number)} stroke={c as string} strokeDasharray="4 3" />
            <text x={W - PR - 4} y={yDt(v as number) - 3} textAnchor="end" className="ax" fill={c as string}>{v} K</text>
          </g>
        ))}
        <line x1={PL} x2={W - PR} y1={yDt(0)} y2={yDt(0)} stroke="var(--line)" />
        {[[30, 'var(--ember)'], [60, 'var(--moss)']].map(([v, c]) => (
          <g key={v}>
            <line x1={PL} x2={W - PR} y1={yPct(RH, v as number)} y2={yPct(RH, v as number)} stroke={c as string} strokeDasharray="4 3" />
            <text x={W - PR - 4} y={yPct(RH, v as number) - 3} textAnchor="end" className="ax" fill={c as string}>{v}%</text>
          </g>
        ))}
        <line x1={PL} x2={W - PR} y1={yPct(CLOUD, 60)} y2={yPct(CLOUD, 60)} stroke="var(--ink-dim)" strokeDasharray="4 3" />
        <text x={W - PR - 4} y={yPct(CLOUD, 60) - 3} textAnchor="end" className="ax">60%</text>

        {/* cloud bars */}
        {hours.map((h) => h.inputs.cloud_cover_pct == null ? null : (
          <rect
            key={h.observed_at} x={x(h.observed_at) - slot * 0.4} width={slot * 0.8}
            y={yPct(CLOUD, h.inputs.cloud_cover_pct)} height={CLOUD.y + CLOUD.h - yPct(CLOUD, h.inputs.cloud_cover_pct)}
            fill="var(--ink-dim)" opacity={h.inputs.cloud_cover_pct > 60 ? 0.65 : 0.3}
          />
        ))}

        {/* ΔT and humidity lines draw left to right */}
        <m.path
          d={path(hours.map((h) => (h.inputs.delta_t_k == null ? null : { x: x(h.observed_at), y: yDt(h.inputs.delta_t_k) })))}
          fill="none" stroke="var(--ink)" strokeWidth="1.8" strokeLinejoin="round"
          initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 0.9, ease: [0.32, 0.72, 0, 1] }}
        />
        <m.path
          d={path(hours.map((h) => (h.inputs.relative_humidity_pct == null ? null : { x: x(h.observed_at), y: yPct(RH, h.inputs.relative_humidity_pct) })))}
          fill="none" stroke="var(--sat)" strokeWidth="1.6" strokeLinejoin="round"
          initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 0.9, ease: [0.32, 0.72, 0, 1], delay: 0.15 }}
        />

        {/* day labels */}
        {days.map((h) => (
          <g key={h.observed_at}>
            <line x1={x(h.observed_at) - slot / 2} x2={x(h.observed_at) - slot / 2} y1={STRIP.y} y2={CLOUD.y + CLOUD.h} stroke="var(--line)" />
            <text x={x(h.observed_at) - slot / 2 + 3} y={H - 8} className="ax">{fmtDate(h.observed_at)}</text>
          </g>
        ))}

        {/* hover targets with a native tooltip per hour */}
        {hours.map((h) => (
          <rect key={`hit-${h.observed_at}`} x={x(h.observed_at) - slot / 2} y={STRIP.y} width={slot} height={CLOUD.y + CLOUD.h - STRIP.y} fill="transparent">
            <title>{[
              fmtSlot(h.observed_at),
              t(STATUS_KEY[h.status]),
              h.inputs.delta_t_k != null ? `ΔT ${fmtSigned(h.inputs.delta_t_k, 1)} K` : 'ΔT –',
              h.inputs.relative_humidity_pct != null ? `RH ${fmtNum(h.inputs.relative_humidity_pct, 0)}%` : 'RH –',
              h.inputs.cloud_cover_pct != null ? `${t('rgt.cloud')} ${fmtNum(h.inputs.cloud_cover_pct, 0)}%` : `${t('rgt.cloud')} –`,
            ].join(' · ')}</title>
          </rect>
        ))}
      </svg>
      <figcaption>{t('rgt.caption', { range: `${fmtSlot(hours[0].observed_at)} – ${fmtSlot(hours[hours.length - 1].observed_at)}` })}</figcaption>
    </figure>
  );
}
