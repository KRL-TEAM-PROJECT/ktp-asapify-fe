import { api } from '../api';
import { useI18n } from '../i18n';
import { errorText } from '../lib/errors';
import { useLoad } from '../lib/useLoad';

/**
 * Public page: the Telegram groups anyone may join to get ASAPify alerts. The bot posts every alert an operator
 * publishes there; no account, subscription or inbox in the app. Operators set the invite links on the Regions page.
 */
export function JoinPage() {
  const { t } = useI18n();
  const groups = useLoad(() => api.joinLinks(), []);

  return (
    <div className="wrap join">
      <header className="join-head">
        <h1>{t('join.title')}</h1>
        <p className="lede">{t('join.lede')}</p>
      </header>
      {groups.error != null ? <p className="error" role="alert">{errorText(groups.error, t)}</p>
        : !groups.data ? <div className="skel" style={{ height: 72 }} />
          : groups.data.length === 0 ? <p className="empty">{t('join.none')}</p>
            : (
              <ul className="join-list">
                {groups.data.map((g) => (
                  <li key={g.invite_url}>
                    <span className="join-name">{g.title}</span>
                    <a className="btn primary" href={g.invite_url} target="_blank" rel="noopener noreferrer">{t('join.open')}</a>
                  </li>
                ))}
              </ul>
            )}
      <ul className="join-notes muted small">
        <li>{t('join.note_what')}</li>
        <li>{t('join.note_indication')}</li>
        <li>{t('join.note_quiet')}</li>
      </ul>
    </div>
  );
}
