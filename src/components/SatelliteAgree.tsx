import { useI18n } from '../i18n';
import { IconSat } from './icons';

export function SatelliteAgree({ nSat, agree }: { nSat: number; agree: boolean }) {
  const { t } = useI18n();
  if (nSat >= 2 && agree) return <span className="pill sat"><IconSat size={12} />{t('sat.agree')}</span>;
  return (
    <span className="pill caution" title={t('sat.single_note')}>
      <IconSat size={12} />{t('sat.single')} · {t('sat.single_note')}
    </span>
  );
}
