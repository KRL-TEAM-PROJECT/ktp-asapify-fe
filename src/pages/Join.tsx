import { api } from '../api';
import { useI18n } from '../i18n';
import { ALERT_GROUP_URL } from '../lib/telegram';
import { useLoad } from '../lib/useLoad';
import type { JoinLink } from '../types';

/**
 * Public page: the Telegram groups anyone may join to get ASAPify alerts. The bot posts every alert an operator
 * publishes there; no account, subscription or inbox in the app. The team's alert group is always listed; other groups
 * appear once an operator saves their invite links on the Admin page.
 */
export function JoinPage() {
  const { t } = useI18n();
  const groups = useLoad(() => api.joinLinks().catch(() => [] as JoinLink[]), []);
  const listed = groups.data ?? [];
  const links: JoinLink[] = [
    ...(listed.some((g) => g.invite_url === ALERT_GROUP_URL) ? [] : [{ title: t('join.group'), invite_url: ALERT_GROUP_URL }]),
    ...listed,
  ];

  return (
    <div className="wrap join">
      <header className="join-head">
        <h1>{t('join.title')}</h1>
        <p className="lede">{t('join.lede')}</p>
      </header>
      <ul className="join-list">
        {links.map((g) => (
          <li key={g.invite_url}>
            <span className="join-name">{g.title}</span>
            <a className="btn primary" href={g.invite_url} target="_blank" rel="noopener noreferrer">{t('join.open')}</a>
          </li>
        ))}
      </ul>
      <ul className="join-notes muted small">
        <li>{t('join.note_what')}</li>
        <li>{t('join.note_where')}</li>
        <li>{t('join.note_indication')}</li>
        <li>{t('join.note_quiet')}</li>
      </ul>
    </div>
  );
}
