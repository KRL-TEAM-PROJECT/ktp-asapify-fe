import type { RatedStatus, SlotRecord } from '../types';
import { useI18n } from '../i18n';
import { fmtNum, fmtSigned } from '../lib/format';
import { m, springSoft } from '../motion';
import { StatusBadge } from './StatusBadge';

const ORDER: RatedStatus[] = ['ALERT', 'WARNING', 'SAFE'];
const MEMBERSHIPS = ['delta_t_high', 'delta_t_medium', 'delta_t_low'];
const OPTIONAL = ['humidity_low', 'humidity_high', 'viirs_support', 'power_support']; // shown only when they took part (humidity: older records)

/**
 * Fuzzy MAUT result of one slot: how dry air and the sun moved the measured ΔT, the utility per status, the
 * memberships behind it and the rule that picked the status.
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
  const keys = [...MEMBERSHIPS, ...OPTIONAL.filter((k) => k in record.memberships)];
  const a = record.adjust?.delta_t_eff_k != null ? record.adjust : null; // absent, null or {} without a shift
  const src = record.inputs.dry_source;
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
        </dl>
      )}
      <div className="rg-util-bars">
        {ORDER.map((s, i) => {
          const u = record.utilities[s] ?? 0;
          return (
            <div key={s} className={`rg-util-row${s === record.status ? ' on' : ''}`}>
              <StatusBadge status={s} />
              <span className="rg-bar" aria-hidden="true">
                <m.i
                  className={`fill-${s.toLowerCase()}`} initial={{ width: 0 }} whileInView={{ width: `${u * 100}%` }}
                  viewport={{ once: true }} transition={{ ...springSoft, delay: 0.1 + i * 0.06 }}
                />
              </span>
              <b className="mono">{fmtNum(u, 3)}</b>
            </div>
          );
        })}
      </div>
      <p className="small"><span className="lbl">{t('rgu.rule')}</span> {record.reason}</p>
      <dl className="rg-memb">
        {keys.map((k) => (
          <div key={k}><dt>{t(`rgu.m.${k}`)}</dt><dd className="mono">{k in record.memberships ? fmtNum(record.memberships[k], 2) : '–'}</dd></div>
        ))}
      </dl>
      <p className="muted small">{t('rgu.note')}</p>
    </div>
  );
}
