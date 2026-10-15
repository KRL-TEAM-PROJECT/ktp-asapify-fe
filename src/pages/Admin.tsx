import { OperatorAccess } from '../components/OperatorAccess';
import { TelegramGroups } from '../components/TelegramGroups';
import { useI18n } from '../i18n';
import '../regions.css';

/** Operator-only settings that used to hide under the map's list: who is an operator, and the alert groups. */
export function AdminPage() {
  const { t } = useI18n();
  return (
    <div className="wrap admin">
      <header className="admin-head">
        <h1>{t('admin.title')}</h1>
        <p className="muted">{t('admin.lede')}</p>
      </header>
      <div className="admin-grid">
        <TelegramGroups />
        <OperatorAccess />
      </div>
    </div>
  );
}
