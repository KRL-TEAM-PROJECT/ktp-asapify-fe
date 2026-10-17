import { useState } from 'react';
import type { Status } from '../types';
import { useI18n } from '../i18n';
import { load, save } from '../lib/storage';
import { STATUS_KEY } from './StatusBadge';
import { IconChevron } from './icons';

const STATUSES: Status[] = ['ALERT', 'WARNING', 'NO_OBSERVABLE', 'SAFE'];
const MARKS = ['himawari9', 'gk2a', 'viirs'] as const;
const KEY = 'asapify.legend'; // '0' = the operator hid it; open otherwise

/**
 * The map's legend: open by default, two short columns (region status fills | detection marks, drawn as the map draws
 * them) so it leaves the map readable on a phone, with a labelled Hide button so it is plain that it folds away (the
 * choice is remembered). "Details" opens the full meaning of each key.
 */
export function MapLegend() {
  const { t } = useI18n();
  const [open, setOpen] = useState(() => load(KEY) !== '0');
  const [more, setMore] = useState(false);
  const toggle = () => setOpen((o) => { save(KEY, o ? '0' : null); return !o; });

  if (!open) {
    return (
      <section className="map-legend" aria-label={t('map.legend')}>
        <button className="lg-pill" type="button" aria-expanded={false} aria-controls="lg-body" onClick={toggle}>
          <span className="lg-title">{t('map.legend')}</span>
          <span className="lg-act">{t('lg.show')}<IconChevron size={14} /></span>
        </button>
      </section>
    );
  }
  return (
    <section className="map-legend open" aria-label={t('map.legend')}>
      <div className="lg-head">
        <span className="lg-title">{t('map.legend')}</span>
        <button className="lg-act" type="button" aria-expanded={more} aria-controls="lg-desc" onClick={() => setMore((m) => !m)}>
          {t(more ? 'lg.less' : 'lg.more')}
        </button>
        <button className="lg-act" type="button" aria-expanded aria-controls="lg-body" onClick={toggle}>
          {t('lg.hide')}<IconChevron size={14} up />
        </button>
      </div>
      <div id="lg-body" className="lg-body">
        <ul className="lg-grid">
          {STATUSES.map((s) => <li key={s}><i className={`lg-sw ${s.toLowerCase()}`} />{t(STATUS_KEY[s])}</li>)}
          {MARKS.map((k) => <li key={k}><i className={`lg-px ${k}`} />{t(`lg.${k}`)}</li>)}
          <li><i className="lg-cell" />{t('lg.cell')}</li>
        </ul>
        {more && (
          <div id="lg-desc" className="lg-desc">
            <dl>
              {STATUSES.map((s) => (
                <div key={s}><dt><i className={`lg-sw ${s.toLowerCase()}`} />{t(STATUS_KEY[s])}</dt><dd>{t(`rg.legend.${s}`)}</dd></div>
              ))}
              {MARKS.map((k) => <div key={k}><dt><i className={`lg-px ${k}`} />{t(`lg.${k}`)}</dt><dd>{t(`rg.legend.${k}`)}</dd></div>)}
              <div><dt><i className="lg-cell" />{t('lg.cell')}</dt><dd>{t('rg.legend.cell')}</dd></div>
            </dl>
            <p className="muted">{t('rg.sources')}</p>
          </div>
        )}
      </div>
    </section>
  );
}
