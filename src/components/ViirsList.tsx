import type { ViirsDetection } from '../types';
import { useI18n } from '../i18n';
import { fmtNum, fmtSlot } from '../lib/format';
import { satLabel } from './ProbeTips';

export function ViirsList({ detections }: { detections: ViirsDetection[] }) {
  const { t } = useI18n();
  if (!detections.length) return <p className="muted">{t('ver.viirs_empty')}</p>;
  return (
    <ul className="viirs">
      {detections.map((d) => (
        <li key={`${d.src}-${d.time_utc}`}>
          <span>{satLabel(d.src)} · {fmtSlot(d.time_utc)}</span>
          <b className={d.distance_km <= 2 ? 'near' : ''}>{fmtNum(d.distance_km, 1)} km</b>
        </li>
      ))}
    </ul>
  );
}
