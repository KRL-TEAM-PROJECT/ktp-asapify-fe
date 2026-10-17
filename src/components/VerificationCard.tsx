import { useState } from 'react';
import type { AgentInfo, Verification, ValidationStatus, VerificationWeather } from '../types';
import { api } from '../api';
import { useI18n } from '../i18n';
import { errorText } from '../lib/errors';
import { fmtNum, fmtSigned, fmtSlot } from '../lib/format';
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

/** The WMS request's own size, so the card keeps its height while GIBS renders (seconds) and buttons stay put. */
function imageSize(url: string): { width?: number; height?: number } {
  try {
    const q = new URL(url).searchParams;
    const width = Number(q.get('WIDTH')), height = Number(q.get('HEIGHT'));
    return width > 0 && height > 0 ? { width, height } : {};
  } catch {
    return {};
  }
}

// VIIRS I-4 (3.7 µm) saturates at about 367 K: a hotspot at that value is a pixel at the sensor's limit, not a fire temperature
const I4_SATURATION_K = 367;

/** The FIRMS tool result the verdict's numbers come from (the last one with the same hotspot count), else null. */
function usedCall(v: Verification) {
  const count = v.supporting_data?.firms_hotspot_count;
  if (count == null) return null;
  return [...v.tool_calls].reverse().find((c) => !c.error && c.hotspot_count === count) ?? null;
}

/** The weather line, or null when Open-Meteo gave nothing for that hour. */
function weatherText(w: VerificationWeather | null | undefined, t: (k: string, v?: Record<string, string | number>) => string) {
  if (!w || w.error || !w.at) return null;
  const n = (x: number | null | undefined, d: number) => (x != null ? fmtNum(x, d) : '–');
  return t('agent.weather', {
    dir: n(w.wind_from_deg, 0), speed: n(w.wind_speed_ms, 1), rain: n(w.precipitation_24h_mm, 1), rh: n(w.relative_humidity_pct, 0),
  });
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
  const [failed, setFailed] = useState<string[]>([]); // images the browser could not load: left out, not shown broken
  const images = (v?.imagery?.images ?? []).filter((img) => !failed.includes(img.url));
  const viewName = (k: string) => { const key = `agent.image_view.${k}`; const s = t(key); return s === key ? k : s; };
  const weather = weatherText(v?.weather, t);
  const call = v ? usedCall(v) : null;
  const brightest = v?.supporting_data?.highest_brightness_temp ?? null;

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
            {t('agent.quota', { left: agent.remaining, total: agent.daily_quota })} · {t('agent.quota_reset')} · <span className="mono">{agent.model}</span>
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
            <div>
              <dt>{t('agent.hotspots')}</dt>
              <dd className="mono">{v.supporting_data ? fmtNum(v.supporting_data.firms_hotspot_count, 0) : '–'}</dd>
              {call?.confident_count != null && <dd className="sub">{t('agent.hotspots_confident', { c: fmtNum(call.confident_count, 0) })}</dd>}
            </div>
            <div>
              <dt>{t('agent.brightest')}</dt>
              <dd className="mono">{brightest != null ? `${fmtNum(brightest, 1)} K` : '–'}</dd>
              {brightest != null && brightest >= I4_SATURATION_K - 0.5 && <dd className="sub">{t('agent.brightest_saturated')}</dd>}
            </div>
          </dl>
          <div className="rg-conf small">
            <p>{t('agent.confidence_source')}</p>
            {call && call.hotspot_count != null && (
              <p>{t('agent.confidence_basis', {
                n: fmtNum(call.hotspot_count, 0), c: fmtNum(call.confident_count ?? 0, 0),
                h: call.hours_window ?? '–', km: call.buffer_km != null ? fmtNum(call.buffer_km, 0) : '–',
              })}</p>
            )}
            <p className="muted">{t('agent.confidence_note')}</p>
          </div>

          {images.length > 0 && v.imagery && (
            <>
              <h3>{t('agent.images', { date: v.imagery.date ?? '–', h: v.imagery.hours_before_observation != null ? fmtNum(v.imagery.hours_before_observation, 1) : '–' })}</h3>
              <div className="rg-images">
                {images.map((img) => (
                  <figure key={img.url}>
                    <a href={img.url} target="_blank" rel="noreferrer">
                      <img
                        src={img.url} alt={viewName(img.view)} loading="lazy" {...imageSize(img.url)}
                        onError={() => setFailed((f) => [...f, img.url])}
                      />
                    </a>
                    <figcaption className="small">{viewName(img.view)}</figcaption>
                  </figure>
                ))}
              </div>
              <p className="muted small">{t('agent.images_note')}</p>
            </>
          )}
          {v.visual_evidence && (
            <>
              <h3>{t('agent.visual')}</h3>
              <dl className="rg-facts">
                <div><dt>{t('agent.visual.smoke')}</dt><dd>{t(`agent.seen.${v.visual_evidence.smoke}`)}</dd></div>
                <div><dt>{t('agent.visual.burn_scar')}</dt><dd>{t(`agent.seen.${v.visual_evidence.burn_scar}`)}</dd></div>
              </dl>
              {v.visual_evidence.notes && <p className="small">{v.visual_evidence.notes}</p>}
              {v.imagery?.date && v.imagery.images.length > 0 && (
                <p className="muted small">{t('agent.visual_when', {
                  date: v.imagery.date, h: v.imagery.hours_before_observation != null ? fmtNum(v.imagery.hours_before_observation, 1) : '–',
                })}</p>
              )}
            </>
          )}
          {weather && <p className="small">{weather}</p>}

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
          {images.length === 0 && <p className="callout info small">{t('agent.no_imagery')}</p>}
        </>
      )}
    </m.section>
  );
}
