import type { HourRecord, RatedStatus } from '../types';
import { useI18n } from '../i18n';
import { fmtNum } from '../lib/format';
import { m, springSoft } from '../motion';
import { StatusBadge } from './StatusBadge';

const ORDER: RatedStatus[] = ['ALERT', 'WARNING', 'SAFE'];
const MEMBERSHIPS = ['delta_t_high', 'delta_t_medium', 'delta_t_low', 'humidity_low', 'humidity_high'];

/** Fuzzy MAUT result of one hour: utility per status, the memberships behind it and the rule that picked the status. */
export function RegionUtilities({ record }: { record: HourRecord }) {
  const { t } = useI18n();
  if (record.status === 'NO_OBSERVABLE') {
    return (
      <div className="rg-util">
        <p>{t('rgu.none')}</p>
        <p className="muted small">{record.reason}</p>
      </div>
    );
  }
  return (
    <div className="rg-util">
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
        {MEMBERSHIPS.map((k) => (
          <div key={k}><dt>{t(`rgu.m.${k}`)}</dt><dd className="mono">{fmtNum(record.memberships[k] ?? 0, 2)}</dd></div>
        ))}
      </dl>
      <p className="muted small">{t('rgu.note')}</p>
    </div>
  );
}
