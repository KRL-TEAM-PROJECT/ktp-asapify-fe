import { useState } from 'react';
import type { AgentInfo, Verification, ValidationStatus } from '../types';
import { api } from '../api';
import { useI18n } from '../i18n';
import { errorText } from '../lib/errors';
import { fmtC, fmtNum, fmtSigned, fmtSlot } from '../lib/format';
import { m, reveal } from '../motion';
import { IconSpark } from './icons';

const VS_CLASS: Record<ValidationStatus, string> = { CONFIRMED: 'vs-confirmed', REJECTED: 'vs-rejected', NEEDS_MANUAL_REVIEW: 'vs-review' };

export function ValidationBadge({ status }: { status: ValidationStatus }) {
  const { t } = useI18n();
  return <span className={`pill ${VS_CLASS[status]}`}>{t(`vs.${status}`)}</span>;
}

function errorNote(code: string, t: (k: string, v?: Record<string, string | number>) => string) {
  if (code.startsWith('AGENT_ERROR:')) return t('agent.err.AGENT_ERROR', { what: code.slice(12) });
  const key = `agent.err.${code}`;
  const s = t(key);
  return s === key ? code : s;
}

interface Props {
  regionId: string;
  latest: Verification | null;
  agent: AgentInfo | null;
  onVerified(): void;
  readOnly?: boolean; // the public view: the result, without the Re-verify button or the quota
}

/** The agent's latest result for a region, with the Re-verify button and every piece of evidence it used. */
export function VerificationCard({ regionId, latest: v, agent, onVerified, readOnly = false }: Props) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const blocked = !agent ? null : !agent.configured ? t('agent.not_configured') : agent.remaining <= 0 ? t('agent.quota_used') : null;
  const confidence = (c: string) => { const key = `agent.conf.${c}`; const s = t(key); return s === key ? c : s; }; // VIIRS l/n/h; anything else as sent

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      await api.verifyRegion(regionId);
      onVerified();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <m.section className="card rg-ver" aria-labelledby="ver-h" {...reveal(1)}>
      <div className="card-head">
        <h2 id="ver-h">{t('ver.title')}</h2>
        {v && <ValidationBadge status={v.validation_status} />}
      </div>

      {!readOnly && <div className="rg-ver-run">
        <button className="btn" disabled={busy || !!blocked} onClick={() => void verify()}>
          <IconSpark />{busy ? t('agent.running') : t(v ? 'agent.reverify' : 'agent.verify')}
        </button>
        {agent && (
          <span className="muted small">
            {t('agent.quota', { left: agent.remaining, total: agent.daily_quota })} · <span className="mono">{agent.model}</span>
          </span>
        )}
      </div>}
      {busy && <p className="muted small" role="status">{t('agent.running_note')}</p>}
      {blocked && !readOnly && <p className="callout info small">{blocked}</p>}
      {error != null && <p className="error" role="alert">{errorText(error, t)}</p>}

      {!v ? (
        <p className="muted">{t('agent.none')}</p>
      ) : (
        <>
          <p className="muted small">
            {t(v.trigger === 'auto' ? 'agent.by_auto' : v.requested_by ? 'agent.by_manual' : 'agent.by_operator', { who: v.requested_by ?? '' })} · {fmtSlot(v.at)} ·{' '}
            {t('agent.hour', { when: fmtSlot(v.observed_at) })}
          </p>
          {v.error && <p className="callout small">{errorNote(v.error, t)}</p>}
          {v.agent_validation_status && v.agent_validation_status !== v.validation_status && (
            <div className="callout small">
              <span>{t('agent.downgraded', { from: t(`vs.${v.agent_validation_status}`) })}</span>
            </div>
          )}
          {v.checks.length > 0 && <ul className="small rg-checks">{v.checks.map((c) => <li key={c}>{c}</li>)}</ul>}

          <p>{v.analysis}</p>
          <dl className="rg-facts">
            <div><dt>{t('agent.confidence')}</dt><dd className="mono">{v.confidence_score != null ? fmtNum(v.confidence_score, 2) : '–'}</dd></div>
            <div><dt>{t('agent.hotspots')}</dt><dd className="mono">{v.supporting_data ? fmtNum(v.supporting_data.firms_hotspot_count, 0) : '–'}</dd></div>
            <div>
              <dt>{t('agent.brightest')}</dt>
              <dd className="mono">
                {v.supporting_data?.highest_brightness_temp != null
                  ? `${fmtNum(v.supporting_data.highest_brightness_temp, 1)} K (${fmtC(v.supporting_data.highest_brightness_temp)})` : '–'}
              </dd>
            </div>
          </dl>
          <p className="muted small">{t('agent.confidence_note')}</p>

          {v.draft_operator_alert && (
            <>
              <h3>{t('agent.draft')}</h3>
              <blockquote className="rg-draft"><b>{v.draft_operator_alert.title}</b><br />{v.draft_operator_alert.message}</blockquote>
            </>
          )}

          {v.evidence.length > 0 && (
            <>
              <h3>{t('agent.evidence', { n: v.evidence.length })}</h3>
              <div className="rg-table-wrap">
                <table className="rg-table">
                  <thead>
                    <tr><th>{t('agent.col.when')}</th><th>{t('agent.col.dist')}</th><th>{t('agent.col.conf')}</th><th>FRP</th><th>{t('agent.col.bt')}</th></tr>
                  </thead>
                  <tbody>
                    {v.evidence.map((h, i) => (
                      <tr key={i}>
                        <td>{fmtSlot(h.acquired_at)} <span className="muted">({fmtSigned(h.hours_from_observation, 1)} h)</span></td>
                        <td className="mono">{fmtNum(h.distance_km, 1)} km</td>
                        <td>{confidence(h.confidence)}</td>
                        <td className="mono">{h.frp_mw != null ? `${fmtNum(h.frp_mw, 1)} MW` : '–'}</td>
                        <td className="mono">{h.brightness_k != null ? `${fmtNum(h.brightness_k, 1)} K` : '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <details className="rg-trace">
            <summary>{t('agent.trace', { n: v.tool_calls.length })}</summary>
            <ol>
              {v.tool_calls.map((c, i) => (
                <li key={i} className="small">
                  <code>fetch_firms_data(hours_window={c.hours_window}, buffer_km={c.buffer_km})</code>{' → '}
                  {c.error ? <span className="muted">{c.error}</span> : t('agent.trace_result', { n: c.hotspot_count ?? 0, c: c.confident_count ?? 0 })}
                </li>
              ))}
            </ol>
            <p className="muted small">
              {t('agent.usage', {
                calls: v.usage.model_calls ?? 0, input: fmtNum(v.usage.prompt_tokens ?? 0, 0),
                output: fmtNum((v.usage.output_tokens ?? 0) + (v.usage.thought_tokens ?? 0), 0), s: fmtNum(v.duration_s, 1),
              })}
            </p>
          </details>
          <p className="callout info small">{t('agent.no_imagery')}</p>
        </>
      )}
    </m.section>
  );
}
