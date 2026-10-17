import type { ReactNode } from 'react';
import type { SatelliteName, SlotAdjust, SlotRecord } from '../types';
import { useI18n } from '../i18n';
import { fmtNum, fmtSigned } from '../lib/format';
import { plainReason } from '../lib/reason';
import { SATELLITE_NAMES } from '../lib/satellites';
import { STATUS_KEY, StatusBadge } from './StatusBadge';
import { IconAlert } from './icons';

// Status boundaries of the counted ΔT with the default curves and safety margin (backend rules.py, About → Rules).
const SAFE_MAX = 1.95, WARNING_MAX = 6.95;
const LO = 0, HI = 10; // K shown on the scale; values outside sit at its ends
const pct = (k: number) => ((Math.min(Math.max(k, LO), HI) - LO) / (HI - LO)) * 100;
// backend fusion.py / rules.py: a satellite observes the region with 40 % of its cell clear; the strongest view weighs
// 0.4 × its validity against the consensus' 0.6
const MIN_CLEAR = 0.4, MEAN_W = 0.6, MAX_W = 0.4;
const SATS: SatelliteName[] = ['himawari9', 'gk2a'];

type T = (key: string, vars?: Record<string, string | number>) => string;
const n2 = (x: number) => fmtNum(x, 2);
/** "+ 0.30" / "− 0.04" between the terms of an equation (a real minus sign). */
const term = (x: number) => `${x < 0 && Math.abs(x) >= 0.005 ? '−' : '+'} ${n2(Math.abs(x))}`;

/** The satellites whose value went into ΔT measured, as fusion.py picks them: a verdict and at least 40 % clear. */
function seenViews(record: SlotRecord) {
  return SATS.flatMap((name) => {
    const v = record.views?.[name];
    if (!v || v.max_anomaly_k == null || 1 - v.cloud_fraction < MIN_CLEAR) return [];
    return [{ name, k: v.max_anomaly_k, clear: 1 - v.cloud_fraction }];
  });
}

/** Why ΔT measured has this value: the anomaly itself, then how the satellites were combined. */
function measuredWhy(record: SlotRecord, a: SlotAdjust, t: T): string[] {
  const out = [t('rgu.w.measured')];
  const seen = seenViews(record);
  if (!seen.length) return out;
  const mean = seen.reduce((s, v) => s + v.clear * v.k, 0) / seen.reduce((s, v) => s + v.clear, 0);
  if (Math.abs(mean - a.delta_t_k) > 0.02) return out; // an older record whose views do not add up the same way
  if (seen.length === 1) {
    out.push(t('rgu.w.single', { sat: SATELLITE_NAMES[seen[0].name], dt: fmtSigned(seen[0].k, 2) }));
  } else {
    const [h, g] = seen;
    out.push(t('rgu.w.mean', {
      a: SATELLITE_NAMES[h.name], ak: fmtSigned(h.k, 2), ac: fmtNum(h.clear * 100, 0),
      b: SATELLITE_NAMES[g.name], bk: fmtSigned(g.k, 2), bc: fmtNum(g.clear * 100, 0),
      eq: `(${n2(h.clear)} × ${n2(h.k)} + ${n2(g.clear)} × ${n2(g.k)}) ÷ (${n2(h.clear)} + ${n2(g.clear)}) = ${n2(a.delta_t_k)} K`,
    }));
  }
  if (a.delta_t_k === 0) out.push(t('rgu.w.no_fire'));
  return out;
}

function dryWhy(a: SlotAdjust, src: string | null | undefined, t: T): string {
  if (a.dry_z == null) return t('rgu.w.dry_none');
  const how = t(a.dry_z >= 0 ? 'rgu.w.drier' : 'rgu.w.wetter', { z: fmtNum(Math.abs(a.dry_z), 2) });
  return t('rgu.w.dry', {
    how, src: src === 'open_meteo_fallback' ? t('rgu.w.src_fallback') : t('rgu.w.src_power'),
    eq: `1 K × tanh(${fmtNum(a.dry_z, 2).replace('-', '−')} ÷ 2) = ${fmtSigned(a.rh_shift_k, 2)} K`,
  });
}

function sunWhy(record: SlotRecord, a: SlotAdjust, t: T): string {
  const deg = record.sun_elevation_deg;
  const d = deg != null ? fmtNum(deg, 0).replace('-', '−') : '–';
  if (deg == null || a.sun_shift_k === 0) return t('rgu.w.sun_none', { deg: d });
  return t('rgu.w.sun_day', { deg: d, eq: `1 K × sin(${d}°) = ${n2(a.sun_shift_k)} K` });
}

function zoneOf(k: number, t: T): string {
  return k < SAFE_MAX ? t('rgu.w.zone_safe', { b: SAFE_MAX }) : k < WARNING_MAX
    ? t('rgu.w.zone_warning', { a: SAFE_MAX, b: WARNING_MAX }) : t('rgu.w.zone_alert', { b: WARNING_MAX });
}

/** The stronger satellite as the second attribute: which one, and how much of the rating it carried. */
function maxWhy(record: SlotRecord, a: SlotAdjust, t: T): string {
  const strongest = seenViews(record).sort((x, y) => y.k - x.k)[0];
  const v = a.max_validity ?? 0;
  return t('rgu.w.max', {
    sat: strongest ? SATELLITE_NAMES[strongest.name] : t('rgu.w.max_sat'),
    eq: `${n2(MAX_W)} × ${n2(v)} ÷ (${n2(MEAN_W)} + ${n2(MAX_W)} × ${n2(v)}) = ${fmtNum((a.max_weight ?? 0) * 100, 0)}%`,
  });
}

function Row({ label, value, why, sum = false }: { label: string; value: ReactNode; why?: string[]; sum?: boolean }) {
  return (
    <div className={sum ? 'sum' : undefined}>
      <dt>{label}</dt>
      <dd className="mono">{value}</dd>
      {why && why.length > 0 && <p className="why">{why.map((w, i) => <span key={i}>{w}</span>)}</p>}
    </div>
  );
}

/**
 * Fuzzy MAUT result of one slot: how dry air and the sun moved the measured ΔT, and where the counted ΔT falls on
 * the Safe | Warning | Alert scale. Each line says where its number comes from, with the slot's own values in the
 * equation, so an operator can follow +12.42 K to Alert without opening the backend. Since 17 Oct 2026, when both
 * satellites see, the stronger one is a second attribute: its counted ΔT is a hollow mark on the scale and its weight
 * is listed, and the utilities are shown because two attributes make them graded.
 */
export function RegionUtilities({ record }: { record: SlotRecord }) {
  const { t } = useI18n();
  if (record.status === 'NO_OBSERVABLE') {
    return (
      <div className="rg-util">
        <p>{t('rgu.none')}</p>
        <p className="muted small">{record.reason}</p>
      </div>
    );
  }
  const a = record.adjust?.delta_t_eff_k != null ? record.adjust : null; // absent in records older than 16 Oct
  const src = record.inputs.dry_source;
  const counted = a?.delta_t_eff_k ?? null;
  const maxEff = a?.delta_t_max_eff_k ?? null; // only when two views carried weight
  const raised = record.status === 'ALERT' && counted != null && counted < WARNING_MAX
    && (maxEff == null || maxEff < WARNING_MAX); // VIIRS / POWER support
  const graded = maxEff != null && Object.keys(record.utilities).length > 0;
  return (
    <div className="rg-util">
      {/* the dry-air shift needs NASA POWER's humidity normal; without one it is 0, which the operator should know */}
      {a && a.dry_z == null && <p className="callout" role="note"><IconAlert size={14} /> <span>{t('rgu.dry_missing')}</span></p>}
      {a && (
        <dl className="rg-adjust" aria-label={t('rgu.adjust')}>
          <Row label={t('rgu.a.measured')} value={`${fmtSigned(a.delta_t_k, 2)} K`} why={measuredWhy(record, a, t)} />
          <Row
            label={a.dry_z != null ? t('rgu.a.dry', { z: fmtSigned(a.dry_z, 2), src: src ? t(`rgu.src.${src}`) : '–' }) : t('rgu.a.dry_none')}
            value={`${fmtSigned(a.rh_shift_k, 2)} K`} why={[dryWhy(a, src, t)]}
          />
          <Row label={t('rgu.a.sun')} value={`${fmtSigned(-a.sun_shift_k, 2)} K`} why={[sunWhy(record, a, t)]} />
          <Row
            sum label={t('rgu.a.counted')} value={<b>{fmtSigned(a.delta_t_eff_k, 2)} K</b>}
            why={[t('rgu.w.counted', {
              eq: `${n2(a.delta_t_k)} ${term(a.rh_shift_k)} − ${n2(a.sun_shift_k)} = ${n2(a.delta_t_eff_k)} K`,
              zone: zoneOf(a.delta_t_eff_k, t),
            })]}
          />
          {maxEff != null && a.delta_t_max_k != null && (
            <Row
              sum label={t('rgu.a.max', { w: fmtNum((a.max_weight ?? 0) * 100, 0), v: fmtNum(a.max_validity ?? 0, 2) })}
              value={<>{fmtSigned(a.delta_t_max_k, 2)} → <b>{fmtSigned(maxEff, 2)} K</b></>}
              why={[maxWhy(record, a, t)]}
            />
          )}
        </dl>
      )}
      <div className="rg-result">
        <StatusBadge status={record.status} />
        {counted != null && <span className="small mono">{t('rgu.result', { dt: fmtSigned(counted, 2) })}</span>}
      </div>
      {counted != null && (
        <div className="rg-scale-wrap">
          <div className="rg-scale" role="img" aria-label={t('rgu.scale', { dt: fmtSigned(counted, 2), status: t(STATUS_KEY[record.status]) })}>
            <span className="z z-safe" style={{ left: 0, width: `${pct(SAFE_MAX)}%` }} />
            <span className="z z-warning" style={{ left: `${pct(SAFE_MAX)}%`, width: `${pct(WARNING_MAX) - pct(SAFE_MAX)}%` }} />
            <span className="z z-alert" style={{ left: `${pct(WARNING_MAX)}%`, right: 0 }} />
            {maxEff != null && <i className="mark max" style={{ left: `${pct(maxEff)}%` }} title={t('rgu.max_mark')} />}
            <i className="mark" style={{ left: `${pct(counted)}%` }} />
          </div>
          <div className="rg-scale-axis small mono" aria-hidden="true">
            <span style={{ left: '0%' }}>{LO} K</span>
            <span style={{ left: `${pct(SAFE_MAX)}%` }}>{SAFE_MAX}</span>
            <span style={{ left: `${pct(WARNING_MAX)}%` }}>{WARNING_MAX}</span>
            <span style={{ left: '100%' }}>{HI}+ K</span>
          </div>
          {counted > HI && <p className="muted small">{t('rgu.off_scale', { dt: fmtSigned(counted, 2), hi: HI })}</p>}
        </div>
      )}
      {graded && (
        <dl className="rg-utils small mono" aria-label={t('rgu.utilities')}>
          {(['SAFE', 'WARNING', 'ALERT'] as const).map((st) => (
            <div key={st}>
              <dt>{t(STATUS_KEY[st])}</dt>
              <dd><span className={`bar b-${st.toLowerCase()}`} style={{ width: `${(record.utilities[st] ?? 0) * 100}%` }} />{fmtNum(record.utilities[st] ?? 0, 2)}</dd>
            </div>
          ))}
        </dl>
      )}
      {graded && <p className="small">{t('rgu.two_views')}</p>}
      {raised && <p className="small">{t('rgu.raised')}</p>}
      {!a && record.reason && <p className="small">{plainReason(record.reason)}</p>}
      <p className="muted small">{t('rgu.note')}</p>
    </div>
  );
}
