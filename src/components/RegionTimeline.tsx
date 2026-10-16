import { useId } from 'react';
import type { SatelliteName, SlotRecord, Status } from '../types';
import { useI18n } from '../i18n';
import { fmtDate, fmtNum, fmtSigned, fmtSlot } from '../lib/format';
import { m } from '../motion';
import { STATUS_KEY } from './StatusBadge';

const W = 640, PL = 56, PR = 10;
const STRIP = { y: 6, h: 12 };
const DT = { y: 30, h: 92 };
const RH = { y: 136, h: 58 };
const CLOUD = { y: 208, h: 50 };
const H = CLOUD.y + CLOUD.h + 26;
const STEP = 900_000; // one rated slot every 15 minutes
const FILL: Record<Status, string> = { SAFE: 'var(--moss)', WARNING: 'var(--amber)', ALERT: 'var(--ember)', NO_OBSERVABLE: '' };
// the map's colours: Himawari-9 in thermal amber, GK2A in ink
const SAT: [SatelliteName, string, string][] = [['himawari9', 'H', 'var(--ember)'], ['gk2a', 'G', 'var(--ink-dim)']];

/** Line through the slots that have a value; breaks where a value is missing. */
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
 * Slot by slot: rules-engine status (strip), the ΔT the rules counted (bold line: measured ΔT moved by dry air and the
 * sun) over the measured ΔT (thin line) with each satellite's own anomaly (dots: H Himawari-9, G GK2A), relative
 * humidity and cloud cover. Day slots are shaded: there the sun raises the bar. Dashed lines are the status boundaries
 * of the counted ΔT (about 2 K and 7 K) and the cloud limit (60 %). Older records have no counted ΔT: the bold line
 * falls back to the measured one.
 */
export function RegionTimeline({ slots }: { slots: SlotRecord[] }) {
  const { t } = useI18n();
  const hatch = `rg-hatch-${useId().replace(/:/g, '')}`;
  if (!slots.length) return <p className="muted">{t('rgt.empty')}</p>;

  const t0 = Date.parse(slots[0].observed_at);
  const t1 = Date.parse(slots[slots.length - 1].observed_at);
  const span = Math.max(STEP, t1 - t0);
  const slot = ((W - PL - PR) * STEP) / (span + STEP);
  const x = (iso: string) => PL + ((Date.parse(iso) - t0) / (span + STEP)) * (W - PL - PR) + slot / 2;

  const counted = (s: SlotRecord) => s.adjust?.delta_t_eff_k ?? s.inputs.delta_t_k;
  const values = slots.flatMap((s) => [s.inputs.delta_t_k, counted(s), ...SAT.map(([n]) => s.views[n]?.max_anomaly_k ?? null)])
    .filter((v): v is number => v != null);
  const lo = Math.min(-2, ...values), hi = Math.max(10, ...values);
  const yDt = (v: number) => DT.y + (1 - (v - lo) / (hi - lo)) * DT.h;
  const yPct = (band: { y: number; h: number }, v: number) => band.y + (1 - v / 100) * band.h;

  // Day labels at local midnight (UTC+7), as everywhere else in the UI.
  const days = slots.filter((s) => { const d = new Date(s.observed_at); return (d.getUTCHours() + 7) % 24 === 0 && d.getUTCMinutes() === 0; });
  const viewText = (s: SlotRecord) => SAT.map(([n, k]) => {
    const v = s.views[n];
    return `${k} ${v == null ? '–' : v.max_anomaly_k == null ? t('rgt.no_view') : `${fmtSigned(v.max_anomaly_k, 1)} K`}`;
  }).join(' / ');

  return (
    <figure className="chart rg-timeline">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('rgt.aria', { n: slots.length })}>
        <defs>
          <pattern id={hatch} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--ink-dim)" strokeWidth="2.2" />
          </pattern>
        </defs>

        {/* status strip */}
        {slots.map((s) => (
          <rect
            key={s.observed_at} x={x(s.observed_at) - slot / 2} y={STRIP.y} width={slot + 0.4} height={STRIP.h}
            fill={s.status === 'NO_OBSERVABLE' ? `url(#${hatch})` : FILL[s.status]} opacity={s.status === 'NO_OBSERVABLE' ? 0.55 : 0.9}
          />
        ))}
        <text x={PL - 6} y={STRIP.y + 10} textAnchor="end" className="ax">{t('rgt.status')}</text>

        {/* panels, with day slots shaded */}
        {[DT, RH, CLOUD].map((b, i) => <rect key={i} x={PL} y={b.y} width={W - PL - PR} height={b.h} fill="var(--surface-2)" opacity="0.5" />)}
        {slots.map((s) => s.night ? null : (
          <rect key={`day-${s.observed_at}`} x={x(s.observed_at) - slot / 2} y={DT.y} width={slot + 0.4} height={CLOUD.y + CLOUD.h - DT.y} fill="var(--amber)" opacity="0.06" />
        ))}
        <text x={PL - 6} y={DT.y + 10} textAnchor="end" className="ax">ΔT K</text>
        <text x={PL - 6} y={RH.y + 10} textAnchor="end" className="ax">RH %</text>
        <text x={PL - 6} y={CLOUD.y + 10} textAnchor="end" className="ax">{t('rgt.cloud')}</text>

        {/* status boundaries of the counted ΔT: 1.95 K and 6.95 K with the default curves and safety margin */}
        {([[1.95, 2, 'var(--amber)'], [6.95, 7, 'var(--ember)']] as const).map(([v, label, c]) => (
          <g key={v}>
            <line x1={PL} x2={W - PR} y1={yDt(v)} y2={yDt(v)} stroke={c} strokeDasharray="4 3" />
            <text x={W - PR - 4} y={yDt(v) - 3} textAnchor="end" className="ax" fill={c}>{label} K</text>
          </g>
        ))}
        <line x1={PL} x2={W - PR} y1={yDt(0)} y2={yDt(0)} stroke="var(--line)" />
        <line x1={PL} x2={W - PR} y1={yPct(CLOUD, 60)} y2={yPct(CLOUD, 60)} stroke="var(--ink-dim)" strokeDasharray="4 3" />
        <text x={W - PR - 4} y={yPct(CLOUD, 60) - 3} textAnchor="end" className="ax">60%</text>

        {/* cloud bars */}
        {slots.map((s) => s.inputs.cloud_cover_pct == null ? null : (
          <rect
            key={s.observed_at} x={x(s.observed_at) - slot * 0.4} width={slot * 0.8}
            y={yPct(CLOUD, s.inputs.cloud_cover_pct)} height={CLOUD.y + CLOUD.h - yPct(CLOUD, s.inputs.cloud_cover_pct)}
            fill="var(--ink-dim)" opacity={s.inputs.cloud_cover_pct > 60 ? 0.65 : 0.3}
          />
        ))}

        {/* each satellite's own anomaly, then VIIRS support as a tick above the panel */}
        {SAT.map(([n, , c]) => slots.map((s) => {
          const v = s.views[n]?.max_anomaly_k;
          return v == null ? null : <circle key={`${n}-${s.observed_at}`} cx={x(s.observed_at)} cy={yDt(v)} r={1.6} fill={c} opacity={0.75} />;
        }))}
        {slots.map((s) => s.support.viirs_support == null ? null : (
          <line key={`v-${s.observed_at}`} x1={x(s.observed_at)} x2={x(s.observed_at)} y1={DT.y + 1} y2={DT.y + 7} stroke="var(--ember)" strokeWidth="1.4" />
        ))}

        {/* measured ΔT, the ΔT the rules counted and humidity draw left to right */}
        <path
          d={path(slots.map((s) => (s.inputs.delta_t_k == null ? null : { x: x(s.observed_at), y: yDt(s.inputs.delta_t_k) })))}
          fill="none" stroke="var(--ink-dim)" strokeWidth="1" strokeLinejoin="round" opacity="0.7"
        />
        <m.path
          d={path(slots.map((s) => { const v = counted(s); return v == null ? null : { x: x(s.observed_at), y: yDt(v) }; }))}
          fill="none" stroke="var(--ink)" strokeWidth="1.8" strokeLinejoin="round"
          initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 0.9, ease: [0.32, 0.72, 0, 1] }}
        />
        <m.path
          d={path(slots.map((s) => (s.inputs.relative_humidity_pct == null ? null : { x: x(s.observed_at), y: yPct(RH, s.inputs.relative_humidity_pct) })))}
          fill="none" stroke="var(--sat)" strokeWidth="1.6" strokeLinejoin="round"
          initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 0.9, ease: [0.32, 0.72, 0, 1], delay: 0.15 }}
        />

        {/* day labels */}
        {days.map((s) => (
          <g key={s.observed_at}>
            <line x1={x(s.observed_at) - slot / 2} x2={x(s.observed_at) - slot / 2} y1={STRIP.y} y2={CLOUD.y + CLOUD.h} stroke="var(--line)" />
            <text x={x(s.observed_at) - slot / 2 + 3} y={H - 8} className="ax">{fmtDate(s.observed_at)}</text>
          </g>
        ))}

        {/* hover targets with a native tooltip per slot */}
        {slots.map((s) => (
          <rect key={`hit-${s.observed_at}`} x={x(s.observed_at) - slot / 2} y={STRIP.y} width={slot} height={CLOUD.y + CLOUD.h - STRIP.y} fill="transparent">
            <title>{[
              fmtSlot(s.observed_at),
              `${t(STATUS_KEY[s.status])} (${t(s.night ? 'rgt.night' : 'rgt.day')})`,
              s.inputs.delta_t_k != null ? `ΔT ${fmtSigned(s.inputs.delta_t_k, 1)} K` : 'ΔT –',
              ...(s.adjust ? [`${t('rgt.counted')} ${fmtSigned(s.adjust.delta_t_eff_k, 1)} K`] : []),
              viewText(s),
              s.inputs.relative_humidity_pct != null ? `RH ${fmtNum(s.inputs.relative_humidity_pct, 0)}%` : 'RH –',
              s.inputs.cloud_cover_pct != null ? `${t('rgt.cloud')} ${fmtNum(s.inputs.cloud_cover_pct, 0)}%` : `${t('rgt.cloud')} –`,
            ].join(' · ')}</title>
          </rect>
        ))}
      </svg>
      <figcaption>
        {t('rgt.caption', { range: `${fmtSlot(slots[0].observed_at)} – ${fmtSlot(slots[slots.length - 1].observed_at)}` })}{' '}
        <span className="rg-key"><i className="line" />{t('rgt.counted')} <i className="line thin" />{t('rgt.measured')} <i style={{ background: 'var(--ember)' }} />H Himawari-9 <i style={{ background: 'var(--ink-dim)' }} />G GK2A <i className="tick" />{t('rgt.viirs')}</span>
      </figcaption>
    </figure>
  );
}
