import type { Meta } from '../types';
import { useI18n } from '../i18n';
import { fmtNight, fmtSlot } from '../lib/format';

const LATE_MIN = 40;

/**
 * Latest slot + satellites; amber when one satellite is > 40 minutes late, blue for replay and archive.
 * The night ribbon lives in SlotPlayer.
 */
export function DataBanner({ meta, cloudy, archive, noData }: { meta: Meta; cloudy: boolean; archive: string | null; noData: boolean }) {
  const { t } = useI18n();
  const sats = [
    ['Himawari', meta.sats.himawari],
    ['GK2A', meta.sats.gk2a],
  ] as const;
  const late = sats.filter(([, s]) => s.last_slot == null || (s.delay_min ?? 0) > LATE_MIN);

  return (
    <div className="banners" role="status">
      <div className="banner slot">
        <span className="slot-time">{t('banner.slot', { slot: fmtSlot(meta.last_slot) })}</span>
        <span className="slot-sats">
          {sats.map(([name, s]) => {
            const isLate = late.some(([n]) => n === name);
            return (
              <span key={name} className={isLate ? 'late' : 'ok'}>
                {name} {isLate ? `✕ ${t('sat.late', { min: s.delay_min ?? '?' })}` : '✓'}
              </span>
            );
          })}
        </span>
      </div>
      {archive && <div className="banner info">{t('banner.archive', { date: fmtNight(archive) })}</div>}
      {archive && noData && <div className="banner warn">{t('banner.no_data')}</div>}
      {!archive && meta.replay && <div className="banner info">{t('banner.replay', { when: fmtSlot(meta.as_of) })}</div>}
      {late.length > 0 && <div className="banner warn">{t('banner.one_sat', { sat: late.map(([n]) => n).join(' + ') })}</div>}
      {!meta.is_night && <div className="banner">{t('banner.day')}</div>}
      {cloudy && <div className="banner">{t('banner.cloudy')}</div>}
    </div>
  );
}
