import type { Status } from '../types';
import { useI18n } from '../i18n';
import { StatusIcon } from './icons';

export const STATUS_KEY: Record<Status, string> = {
  SAFE: 'status.safe',
  NO_OBSERVATION: 'status.no_obs',
  WATCH: 'status.watch',
  WARNING: 'status.warning',
};

export function StatusBadge({ status }: { status: Status }) {
  const { t } = useI18n();
  return (
    <span className={`pill st-${status.toLowerCase()}`}>
      <StatusIcon status={status} size={12} />
      {t(STATUS_KEY[status])}
    </span>
  );
}
