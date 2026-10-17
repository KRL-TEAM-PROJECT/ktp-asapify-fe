import { useId, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { SatelliteName, SlotRecord, Status } from '../types';
import { useI18n } from '../i18n';
import { dayOf } from '../lib/days';
import { fmtDate, fmtNum, fmtSigned, fmtSlot } from '../lib/format';
import { agreement } from '../lib/satellites';
import { STATUS_KEY, StatusBadge } from './StatusBadge';

// Wide on purpose: the chart spans both columns of the region page, so one slot is still a visible step on a day.
const W = 1040, PL = 64, PR = 84;
// Each panel's name sits in the gap above it, clear of the tick numbers on the left.
const STRIP = { y: 6, h: 16 };
const DT = { y: 50, h: 150 };
const RH = { y: 232, h: 72 };
const CLOUD = { y: 336, h: 62 };
const H = CLOUD.y + CLOUD.h + 28;
const NAME_GAP = 8; // from a panel name's baseline to the top of its panel
const STEP = 900_000; // one rated slot every 15 minutes; scans are 10 minutes apart, so the gaps alternate 10 and 20
const MAX_HALF = 600_000; // a slot reaches at most 10 minutes either side: a longer gap stays visible as a gap
const FILL: Record<Status, string> = { SAFE: 'var(--moss)', WARNING: 'var(--amber)', ALERT: 'var(--ember)', NO_OBSERVABLE: '' };
// status boundaries of the counted ΔT with the default curves and safety margin (backend rules.py)
const SAFE_MAX = 1.95, WARNING_MAX = 6.95;
// the map's marks: Himawari-9 blue, GK2A ink
const SAT: [SatelliteName, string, string][] = [['himawari9', 'H', 'var(--sat-h)'], ['gk2a', 'G', 'var(--ink-dim)']];

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

/** Where the pointer is, in viewBox units, and the slot whose centre is nearest to it. */
function nearest(centres: number[], vx: number): number {
  let lo = 0, hi = centres.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (centres[mid] < vx) lo = mid; else hi = mid; }
  return Math.abs(centres[lo] - vx) <= Math.abs(centres[hi] - vx) ? lo : hi;
}

/**
 * Slot by slot: rules-engine status (strip), the ΔT the rules counted (bold line: measured ΔT moved by dry air and the
 * sun) over the measured ΔT (thin line) with each satellite's own anomaly (dots: H Himawari-9, G GK2A), relative
 * humidity and cloud cover. The ΔT panel is banded by the status the counted ΔT falls in (Safe below about 2 K, Alert
 * above about 7 K), so the line reads against the zones; day slots are shaded grey. Lines draw at once: no entrance
 * animation can leave them blank, and `updating` dims the chart while a refresh is on its way.
 */
export function RegionTimeline({ slots, updating = false }: { slots: SlotRecord[]; updating?: boolean }) {
  const { t } = useI18n();
  const hatch = `rg-hatch-${useId().replace(/:/g, '')}`;
  const [sel, setSel] = useState<number | null>(null); // slot under the pointer or the keyboard
  if (!slots.length) return <p className="muted">{t('rgt.empty')}</p>;

  // Each slot reaches halfway to its neighbours, so uneven spacing neither overlaps nor leaves slivers.
  const at = slots.map((s) => Date.parse(s.observed_at));
  const half = (a: number, b: number) => Math.min(MAX_HALF, (b - a) / 2);
  const left = at.map((v, i) => (i > 0 ? half(at[i - 1], v) : i + 1 < at.length ? half(v, at[i + 1]) : STEP / 2));
  const right = at.map((v, i) => (i + 1 < at.length ? half(v, at[i + 1]) : left[i]));
  const t0 = at[0] - left[0], t1 = at[at.length - 1] + right[at.length - 1];
  const X = (ms: number) => PL + ((ms - t0) / (t1 - t0)) * (W - PL - PR);
  const x = (iso: string) => X(Date.parse(iso));
  const cells = at.map((v, i) => ({ x0: X(v - left[i]), w: X(v + right[i]) - X(v - left[i]) }));

  const counted = (s: SlotRecord) => s.adjust?.delta_t_eff_k ?? s.inputs.delta_t_k; // adjust may be {} in early records
  const values = slots.flatMap((s) => [s.inputs.delta_t_k, counted(s), ...SAT.map(([n]) => s.views[n]?.max_anomaly_k ?? null)])
    .filter((v): v is number => v != null);
  const lo = Math.min(-2, ...values), hi = Math.max(10, ...values);
  // symmetric log scale: the 0-7 K where the status changes keeps its room even when a fire reads 40 K
  const sl = (v: number) => Math.sign(v) * Math.log1p(Math.abs(v) / 2);
  const yDt = (v: number) => DT.y + (1 - (sl(Math.min(Math.max(v, lo), hi)) - sl(lo)) / (sl(hi) - sl(lo))) * DT.h;
  const yPct = (band: { y: number; h: number }, v: number) => band.y + (1 - v / 100) * band.h;
  const dtTicks = [0, SAFE_MAX, WARNING_MAX, ...[15, 30, 60, 100].filter((v) => v <= hi * 0.95)].filter((v) => v >= lo && v <= hi);
  const zones: [Status, number, number][] = [['SAFE', lo, SAFE_MAX], ['WARNING', SAFE_MAX, WARNING_MAX], ['ALERT', WARNING_MAX, hi]];

  // Day labels at local midnight (UTC+7), as everywhere else in the UI.
  const days = slots.map((_, i) => i).filter((i) => i > 0 && dayOf(slots[i].observed_at) !== dayOf(slots[i - 1].observed_at));

  // Hover layer: a crosshair snaps to the nearest slot and one tooltip lists everything about it. Tap and the arrow keys
  // reach the same tooltip; the native per-slot titles are gone.
  const centres = at.map(X);
  const cur = sel != null && sel < slots.length ? sel : null;
  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * W;
    setSel(vx < PL - 6 || vx > W - PR + 6 ? null : nearest(centres, vx));
  };
  const keys = (e: KeyboardEvent<SVGSVGElement>) => {
    const last = slots.length - 1, from = cur ?? last;
    const to = { ArrowLeft: Math.max(0, from - 1), ArrowRight: Math.min(last, from + 1), Home: 0, End: last }[e.key];
    if (to != null) { e.preventDefault(); setSel(to); } else if (e.key === 'Escape') setSel(null);
  };

  return (
    <figure className={`chart rg-timeline ${updating ? 'is-updating' : ''}`} aria-busy={updating}>
      <div className="rg-tl-plot">
      <svg
        viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${t('rgt.aria', { n: slots.length })}. ${t('rgt.keys')}`} tabIndex={0}
        onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => setSel(null)} onKeyDown={keys}
        onFocus={() => setSel((s) => s ?? slots.length - 1)} onBlur={() => setSel(null)}
      >
        <defs>
          <pattern id={hatch} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--ink-dim)" strokeWidth="2.2" />
          </pattern>
        </defs>

        {/* status strip */}
        {slots.map((s, i) => (
          <rect
            key={s.observed_at} x={cells[i].x0} y={STRIP.y} width={cells[i].w + 0.4} height={STRIP.h}
            fill={s.status === 'NO_OBSERVABLE' ? `url(#${hatch})` : FILL[s.status]} opacity={s.status === 'NO_OBSERVABLE' ? 0.55 : 0.9}
          />
        ))}
        <text x={PL - 8} y={STRIP.y + 12} textAnchor="end" className="ax">{t('rgt.status')}</text>

        {/* panels; the ΔT panel is banded by status zone, day slots are shaded grey */}
        {[RH, CLOUD].map((b, i) => <rect key={i} x={PL} y={b.y} width={W - PL - PR} height={b.h} fill="var(--surface-2)" opacity="0.6" />)}
        {zones.map(([st, a, b]) => (
          <g key={st}>
            <rect x={PL} y={yDt(b)} width={W - PL - PR} height={yDt(a) - yDt(b)} fill={FILL[st]} opacity="0.1" />
            <text x={W - PR + 6} y={(yDt(a) + yDt(b)) / 2 + 4} className="ax zone" fill={FILL[st]}>{t(STATUS_KEY[st])}</text>
          </g>
        ))}
        {slots.map((s, i) => s.night ? null : (
          <rect key={`day-${s.observed_at}`} x={cells[i].x0} y={DT.y} width={cells[i].w + 0.4} height={CLOUD.y + CLOUD.h - DT.y} fill="var(--ink)" opacity="0.045" />
        ))}

        {/* axes: panel names and numbered ticks */}
        <text x={PL} y={DT.y - NAME_GAP} className="ax name">{t('rgt.ax_dt')}</text>
        <text x={PL} y={RH.y - NAME_GAP} className="ax name">{t('rgt.ax_rh')}</text>
        <text x={PL} y={CLOUD.y - NAME_GAP} className="ax name">{t('rgt.ax_cloud')}</text>
        {dtTicks.map((v) => (
          <g key={`dt-${v}`}>
            <line x1={PL} x2={W - PR} y1={yDt(v)} y2={yDt(v)} stroke="var(--line-strong)" strokeDasharray={v === 0 ? undefined : '4 3'} />
            <text x={PL - 8} y={yDt(v) + 4} textAnchor="end" className="ax mono">{fmtNum(v, v % 1 ? 2 : 0)}</text>
          </g>
        ))}
        {[0, 50, 100].map((v) => <text key={`rh-${v}`} x={PL - 8} y={yPct(RH, v) + 4} textAnchor="end" className="ax mono">{v}</text>)}
        {[0, 60, 100].map((v) => <text key={`cl-${v}`} x={PL - 8} y={yPct(CLOUD, v) + 4} textAnchor="end" className="ax mono">{v}</text>)}
        <line x1={PL} x2={W - PR} y1={yPct(CLOUD, 60)} y2={yPct(CLOUD, 60)} stroke="var(--ink-dim)" strokeDasharray="4 3" />
        <text x={W - PR + 6} y={yPct(CLOUD, 60) + 4} className="ax">60%</text>

        {/* cloud bars */}
        {slots.map((s, i) => s.inputs.cloud_cover_pct == null ? null : (
          <rect
            key={s.observed_at} x={x(s.observed_at) - cells[i].w * 0.4} width={cells[i].w * 0.8}
            y={yPct(CLOUD, s.inputs.cloud_cover_pct)} height={CLOUD.y + CLOUD.h - yPct(CLOUD, s.inputs.cloud_cover_pct)}
            fill="var(--ink-dim)" opacity={s.inputs.cloud_cover_pct > 60 ? 0.65 : 0.3}
          />
        ))}

        {/* each satellite's own anomaly, then VIIRS support as a tick above the panel */}
        {SAT.map(([n, , c]) => slots.map((s) => {
          const v = s.views[n]?.max_anomaly_k;
          return v == null ? null : <circle key={`${n}-${s.observed_at}`} cx={x(s.observed_at)} cy={yDt(v)} r={2.4} fill={c} opacity={0.8} />;
        }))}
        {slots.map((s) => s.support.viirs_support == null ? null : (
          <line key={`v-${s.observed_at}`} x1={x(s.observed_at)} x2={x(s.observed_at)} y1={DT.y + 1} y2={DT.y + 9} stroke="var(--viirs)" strokeWidth="2" />
        ))}

        {/* measured ΔT, the ΔT the rules counted and humidity, drawn at once */}
        <path
          d={path(slots.map((s) => (s.inputs.delta_t_k == null ? null : { x: x(s.observed_at), y: yDt(s.inputs.delta_t_k) })))}
          fill="none" stroke="var(--ink-dim)" strokeWidth="1.2" strokeLinejoin="round" opacity="0.7"
        />
        <path
          d={path(slots.map((s) => { const v = counted(s); return v == null ? null : { x: x(s.observed_at), y: yDt(v) }; }))}
          fill="none" stroke="var(--ink)" strokeWidth="2.2" strokeLinejoin="round"
        />
        <path
          d={path(slots.map((s) => (s.inputs.relative_humidity_pct == null ? null : { x: x(s.observed_at), y: yPct(RH, s.inputs.relative_humidity_pct) })))}
          fill="none" stroke="var(--sat-h)" strokeWidth="1.8" strokeLinejoin="round"
        />

        {/* day labels */}
        {days.map((i) => (
          <g key={slots[i].observed_at}>
            <line x1={cells[i].x0} x2={cells[i].x0} y1={STRIP.y} y2={CLOUD.y + CLOUD.h} stroke="var(--line-strong)" />
            <text x={cells[i].x0 + 4} y={H - 8} className="ax">{fmtDate(slots[i].observed_at)}</text>
          </g>
        ))}

        {/* crosshair on the slot under the pointer, with its values marked on each line */}
        {cur != null && (() => {
          const s = slots[cur], cx = centres[cur], c = counted(s);
          return (
            <g pointerEvents="none">
              <rect x={cells[cur].x0} y={STRIP.y} width={cells[cur].w} height={STRIP.h} fill="none" stroke="var(--ink)" strokeWidth="1.5" />
              <line x1={cx} x2={cx} y1={STRIP.y + STRIP.h} y2={CLOUD.y + CLOUD.h} stroke="var(--ink)" strokeWidth="1" opacity="0.55" />
              {s.inputs.delta_t_k != null && <circle cx={cx} cy={yDt(s.inputs.delta_t_k)} r={3.5} fill="var(--ink-dim)" stroke="var(--surface)" strokeWidth="2" />}
              {c != null && <circle cx={cx} cy={yDt(c)} r={5} fill="var(--ink)" stroke="var(--surface)" strokeWidth="2" />}
              {s.inputs.relative_humidity_pct != null && (
                <circle cx={cx} cy={yPct(RH, s.inputs.relative_humidity_pct)} r={4} fill="var(--sat-h)" stroke="var(--surface)" strokeWidth="2" />
              )}
            </g>
          );
        })()}
      </svg>
      {cur != null && <SlotTip s={slots[cur]} side={centres[cur] > W * 0.58 ? 'left' : 'right'} at={(centres[cur] / W) * 100} top={(DT.y / H) * 100} />}
      </div>
      <figcaption>
        {t('rgt.caption', { range: `${fmtSlot(slots[0].observed_at)} – ${fmtSlot(slots[slots.length - 1].observed_at)}` })}{' '}
        · {t('rgt.hover')}{' '}
        <span className="rg-key">
          <i className="line" />{t('rgt.counted')} <i className="line thin" />{t('rgt.measured')}
          <i style={{ background: 'var(--sat-h)', borderRadius: '50%' }} />H Himawari-9 <i style={{ background: 'var(--ink-dim)', borderRadius: '50%' }} />G GK2A
          <i className="line rh" />RH <i className="tick" />{t('rgt.viirs')}
        </span>
      </figcaption>
      <details className="rg-howto">
        <summary>{t('rgt.howto')}</summary>
        <ol className="small">
          <li>{t('rgt.howto_1')}</li>
          <li>{t('rgt.howto_2')}</li>
          <li>{t('rgt.howto_3')}</li>
          <li>{t('rgt.howto_4')}</li>
          <li>{t('rgt.howto_5')}</li>
        </ol>
      </details>
    </figure>
  );
}

/** The tooltip of one slot: values first, in ink; what they are, after them, muted. */
function SlotTip({ s, side, at, top }: { s: SlotRecord; side: 'left' | 'right'; at: number; top: number }) {
  const { t } = useI18n();
  const k = (v: number | null | undefined, d = 2) => (v == null ? '–' : `${fmtSigned(v, d)} K`);
  const pct = (v: number | null | undefined) => (v == null ? '–' : `${fmtNum(v, 0)}%`);
  const sat = (n: SatelliteName) => {
    const v = s.views[n];
    return v == null ? t('rgi.no_data') : v.max_anomaly_k == null ? t('rgt.no_view') : k(v.max_anomaly_k, 1);
  };
  const view = agreement(s.flags);
  const rows: [string, string, string][] = [
    ['line', k(s.adjust?.delta_t_eff_k ?? s.inputs.delta_t_k), t('rgt.counted')],
    ['line thin', k(s.inputs.delta_t_k), t('rgt.tip_measured')],
    ...(s.adjust?.delta_t_max_eff_k != null   // the stronger view, a second attribute when both satellites see
      ? [['', k(s.adjust.delta_t_max_eff_k), t('rgt.tip_max', { w: fmtNum((s.adjust.max_weight ?? 0) * 100, 0) })] as [string, string, string]]
      : []),
    ['dot h', sat('himawari9'), 'Himawari-9'],
    ['dot g', sat('gk2a'), 'GK2A'],
    ...(s.adjust?.delta_t_eff_k != null
      ? [['', `${k(s.adjust.rh_shift_k)} / ${k(-s.adjust.sun_shift_k)}`, t('rgt.tip_shift')] as [string, string, string]]
      : []),
    ['line rh', pct(s.inputs.relative_humidity_pct), 'RH'],
    ['box', pct(s.inputs.cloud_cover_pct), t('rgt.cloud')],
    ...(s.support.viirs_support != null ? [['tick', fmtNum(s.support.viirs_support, 2), t('rgt.viirs')] as [string, string, string]] : []),
    ...(view ? [['', t(`view.${view.key}`, view.sat ? { sat: view.sat } : undefined), t('rg.f_view')] as [string, string, string]] : []),
  ];
  return (
    <div
      className="rg-tip" role="status" aria-live="polite"
      style={{ top: `${top}%`, ...(side === 'right' ? { left: `calc(${at}% + 14px)` } : { right: `calc(${100 - at}% + 14px)` }) }}
    >
      <div className="rg-tip-head">
        <span><b className="mono">{fmtSlot(s.observed_at)}</b> <span className="muted">{t(s.night ? 'rgt.night' : 'rgt.day')}</span></span>
        <StatusBadge status={s.status} />
      </div>
      <dl>
        {rows.map(([key, value, label]) => (
          <div key={label}><i className={key} aria-hidden="true" /><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>
    </div>
  );
}
