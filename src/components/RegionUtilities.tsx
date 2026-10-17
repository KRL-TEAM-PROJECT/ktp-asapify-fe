import type { SlotRecord } from '../types';
import { useI18n } from '../i18n';
import { fmtNum, fmtSigned } from '../lib/format';
import { plainReason } from '../lib/reason';
import { STATUS_KEY, StatusBadge } from './StatusBadge';

// Status boundaries of the counted ΔT with the default curves and safety margin (backend rules.py, About → Rules).
const SAFE_MAX = 1.95, WARNING_MAX = 6.95;
const LO = 0, HI = 10; // K shown on the scale; values outside sit at its ends
const pct = (k: number) => ((Math.min(Math.max(k, LO), HI) - LO) / (HI - LO)) * 100;

/**
 * Fuzzy MAUT result of one slot: how dry air and the sun moved the measured ΔT, and where the counted ΔT falls on
 * the Safe | Warning | Alert scale. Since 17 Oct 2026, when both satellites see, the stronger one is a second
 * attribute: its counted ΔT is a hollow mark on the scale and its weight is listed, and the utilities are shown
 * because two attributes make them graded (one attribute leaves them at 1 and 0 across most of the range).
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
      {a && (
        <dl className="rg-adjust" aria-label={t('rgu.adjust')}>
          <div><dt>{t('rgu.a.measured')}</dt><dd className="mono">{fmtSigned(a.delta_t_k, 2)} K</dd></div>
          <div>
            <dt>{a.dry_z != null ? t('rgu.a.dry', { z: fmtSigned(a.dry_z, 1), src: src ? t(`rgu.src.${src}`) : '–' }) : t('rgu.a.dry_none')}</dt>
            <dd className="mono">{fmtSigned(a.rh_shift_k, 2)} K</dd>
          </div>
          <div><dt>{t('rgu.a.sun')}</dt><dd className="mono">{fmtSigned(-a.sun_shift_k, 2)} K</dd></div>
          <div className="sum"><dt>{t('rgu.a.counted')}</dt><dd className="mono"><b>{fmtSigned(a.delta_t_eff_k, 2)} K</b></dd></div>
          {maxEff != null && a.delta_t_max_k != null && (
            <div className="sum">
              <dt>{t('rgu.a.max', { w: fmtNum((a.max_weight ?? 0) * 100, 0), v: fmtNum(a.max_validity ?? 0, 2) })}</dt>
              <dd className="mono">{fmtSigned(a.delta_t_max_k, 2)} → <b>{fmtSigned(maxEff, 2)} K</b></dd>
            </div>
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
            <span style={{ left: '100%' }}>{HI} K</span>
          </div>
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
