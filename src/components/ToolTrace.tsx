import type { ToolCall } from '../types';
import { useI18n } from '../i18n';
import { fmtNum } from '../lib/format';
import { IconCheck, IconX } from './icons';

/** The order of tools the agent called; shown in the demo video. */
export function ToolTrace({ calls }: { calls: ToolCall[] }) {
  const { t } = useI18n();
  return (
    <details className="trace">
      <summary>{t('trace.title', { n: calls.length })}</summary>
      <p className="muted">{t('trace.note')}</p>
      <ol>
        {calls.map((c, i) => (
          <li key={i}>
            <span className={c.ok ? 'ok' : 'bad'}>{c.ok ? <IconCheck size={12} /> : <IconX size={12} />}</span>
            <code className="tool-name">{c.tool}</code>
            <span className="dur">{c.duration_ms >= 1000 ? `${fmtNum(c.duration_ms / 1000, 2)} s` : `${c.duration_ms} ms`}</span>
            <code className="args">{JSON.stringify(c.args)}</code>
          </li>
        ))}
      </ol>
    </details>
  );
}
