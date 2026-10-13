import { Link, useParams } from 'react-router';
import { ApiError, type HourRecord, type Quality, type RegionDetail, type Verification } from '../types';
import { api } from '../api';
import { useI18n } from '../i18n';
import { useLoad } from '../lib/useLoad';
import { errorText } from '../lib/errors';
import { fmtC, fmtCoord, fmtNum, fmtSigned, fmtSlot } from '../lib/format';
import { StatusBadge, STATUS_KEY } from '../components/StatusBadge';
import { RegionTimeline } from '../components/RegionTimeline';
import { RegionUtilities } from '../components/RegionUtilities';
import { ValidationBadge, VerificationCard } from '../components/VerificationCard';
import { DecisionPanel, DecisionState } from '../components/DecisionPanel';
import { IconAlert, IconArrowLeft } from '../components/icons';
import { m, reveal } from '../motion';
import '../regions.css';

const Q_CLASS: Record<Quality, string> = { ACCEPTED: 'q-ok', DEGRADED: 'q-mid', REJECTED: 'q-bad', MISSING: 'q-bad' };

function QualityTag({ q }: { q: Quality }) {
  const { t } = useI18n();
  return <span className={`pill outline ${Q_CLASS[q]}`}>{t(`q.${q}`)}</span>;
}

function Inputs({ h }: { h: HourRecord }) {
  const { t } = useI18n();
  const i = h.inputs;
  return (
    <>
      <dl className="kv rg-kv">
        <div>
          <dt>{t('rgi.skin')}</dt>
          <dd>
            {i.skin_temperature_k != null ? <span className="mono">{fmtNum(i.skin_temperature_k, 2)} K ({fmtC(i.skin_temperature_k)})</span> : '–'}{' '}
            <QualityTag q={h.quality.skin_temperature} />
          </dd>
        </div>
        <div>
          <dt>{t('rgi.baseline')}</dt>
          <dd>
            {i.baseline_k != null ? <span className="mono">{fmtNum(i.baseline_k, 2)} K ± {fmtNum(i.baseline_std_k ?? 0, 2)}</span> : '–'}
            <br /><span className="small">{t('rgi.baseline_how', { how: i.baseline, n: i.baseline_samples })}</span>
          </dd>
        </div>
        <div>
          <dt>ΔT</dt>
          <dd><b className="mono">{i.delta_t_k != null ? `${fmtSigned(i.delta_t_k, 2)} K` : '–'}</b> <span className="small">{t('rgi.dt_note')}</span></dd>
        </div>
        <div>
          <dt>{t('rgi.rh')}</dt>
          <dd>{i.relative_humidity_pct != null ? <span className="mono">{fmtNum(i.relative_humidity_pct, 1)}%</span> : '–'} <QualityTag q={h.quality.relative_humidity} /></dd>
        </div>
        <div>
          <dt>{t('rgi.cloud')}</dt>
          <dd>{i.cloud_cover_pct != null ? <span className="mono">{fmtNum(i.cloud_cover_pct, 0)}%</span> : '–'} <QualityTag q={h.quality.cloud_cover} /></dd>
        </div>
      </dl>
      {h.flags.length > 0 && (
        <p className="small">
          <span className="lbl">{t('rgi.flags')}</span>{' '}
          {h.flags.map((f) => <span key={f} className="pill grey" title={t(`flag.${f}`)}>{f}</span>)}
        </p>
      )}
      <p className="muted small">{t('rgi.sources')}</p>
    </>
  );
}

function caption(r: RegionDetail, v: Verification, prov: string, t: (k: string, x?: Record<string, string | number>) => string) {
  if (v.draft_operator_alert) return `${v.draft_operator_alert.title}\n\n${v.draft_operator_alert.message}`;
  return t('rg.caption_default', { prov, id: r.id });
}

export function RegionPage() {
  const { id = '' } = useParams();
  const { t } = useI18n();
  const q = useLoad(() => api.region(id, 72), [id]);
  const agent = useLoad(() => api.agent().catch(() => null), [id]);
  const r = q.data;

  if (q.loading && !r) {
    return (
      <div className="wrap detail">
        <div className="skel" style={{ height: 64 }} />
        <div className="detail-grid">
          <div className="col">{[300, 220, 200].map((h, i) => <div key={i} className="skel" style={{ height: h }} />)}</div>
          <div className="col">{[360, 280].map((h, i) => <div key={i} className="skel" style={{ height: h }} />)}</div>
        </div>
      </div>
    );
  }

  if (q.error || !r) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return (
      <div className="wrap detail">
        <Link className="back" to="/"><IconArrowLeft />{t('rg.back')}</Link>
        <p className="error" role="alert">
          {notFound ? t('rg.not_found') : t('load_error', { msg: errorText(q.error, t) })}{' '}
          {!notFound && <button className="link-btn" onClick={q.reload}>{t('retry')}</button>}
        </p>
      </div>
    );
  }

  const latest = r.latest ?? r.hours[r.hours.length - 1];
  const v = r.verifications[0] ?? null;
  const prov = t(`prov.${r.province}`);
  const reload = () => { q.reload(); agent.reload(); };

  return (
    <div className="wrap detail">
      <m.header className="detail-head" {...reveal(0)}>
        <Link className="back" to="/"><IconArrowLeft />{t('rg.back')}</Link>
        <div className="title-row">
          <h1 className="mono">{r.id}</h1>
          {r.status ? <StatusBadge status={r.status} /> : <span className="pill grey">{t('rg.unprocessed')}</span>}
          {v && <ValidationBadge status={v.validation_status} />}
        </div>
        <p className="muted">
          {prov} · {fmtCoord(r.lon, r.lat)} · {t('rg.peat', { km2: fmtNum(r.peat_km2, 0) })}
          {r.since && <> · {t('rg.since', { status: r.status ? t(STATUS_KEY[r.status]) : '', when: fmtSlot(r.since) })}</>}
        </p>
        {latest && (
          <dl className="facts">
            <div className={latest.status === 'ALERT' ? 'hot' : ''}><dt>ΔT</dt><dd>{latest.inputs.delta_t_k != null ? `${fmtSigned(latest.inputs.delta_t_k, 1)} K` : '–'}</dd></div>
            <div><dt>{t('rg.f_rh')}</dt><dd>{latest.inputs.relative_humidity_pct != null ? `${fmtNum(latest.inputs.relative_humidity_pct, 0)}%` : '–'}</dd></div>
            <div><dt>{t('rg.f_cloud')}</dt><dd>{latest.inputs.cloud_cover_pct != null ? `${fmtNum(latest.inputs.cloud_cover_pct, 0)}%` : '–'}</dd></div>
            <div><dt>{t('rg.f_hour')}</dt><dd>{fmtSlot(latest.observed_at)}</dd></div>
            <div><dt>{t('cluster.f_dec')}</dt><dd><DecisionState decision={v?.decision ?? null} /></dd></div>
          </dl>
        )}
        <p className="callout"><IconAlert size={14} /> {t('rg.lag_note')}</p>
        {r.last_error && <p className="error" role="alert">{t('rg.last_error', { code: r.last_error })}</p>}
      </m.header>

      <div className="detail-grid">
        <div className="col">
          <m.section className="card" aria-labelledby="tl-h" {...reveal(1)}>
            <div className="card-head">
              <h2 id="tl-h">{t('rg.timeline')}</h2>
              <button className="link-btn" onClick={reload}>{t('notif.refresh')}</button>
            </div>
            <RegionTimeline hours={r.hours} />
          </m.section>
          {latest && (
            <m.section className="card" aria-labelledby="in-h" {...reveal(2)}>
              <h2 id="in-h">{t('rg.inputs', { when: fmtSlot(latest.observed_at) })}</h2>
              <Inputs h={latest} />
            </m.section>
          )}
          {latest && (
            <m.section className="card" aria-labelledby="ut-h" {...reveal(3)}>
              <h2 id="ut-h">{t('rg.utilities')}</h2>
              <RegionUtilities record={latest} />
            </m.section>
          )}
          <m.section className="card" aria-labelledby="tr-h" {...reveal(4)}>
            <h2 id="tr-h">{t('rg.transitions')}</h2>
            {r.transitions.length === 0 ? <p className="muted">{t('rg.no_transitions')}</p> : (
              <ul className="evidence">
                {r.transitions.map((x) => (
                  <li key={x.observed_at}>
                    <span className="small">
                      <span className="mono">{fmtSlot(x.observed_at)}</span> · {x.previous ? t(STATUS_KEY[x.previous]) : t('rg.first')} → <b>{t(STATUS_KEY[x.current])}</b>
                    </span>
                    <span className="muted small">{x.reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </m.section>
        </div>

        <div className="col">
          <VerificationCard regionId={r.id} latest={v} agent={agent.data ?? null} onVerified={reload} />
          {v && (
            <DecisionPanel
              key={`${v.id}-${v.decision?.at ?? 'open'}`} decision={v.decision} province={r.province}
              caption={caption(r, v, prov, t)}
              summary={<>
                {r.status ? t(STATUS_KEY[r.status]) : '–'} · {t(`vs.${v.validation_status}`)} ·{' '}
                {t('rg.dec_hotspots', { n: v.supporting_data?.firms_hotspot_count ?? 0 })} · {t('rg.dec_hour', { when: fmtSlot(v.observed_at) })}
              </>}
              publishBlocked={v.validation_status === 'REJECTED' ? t('rg.publish_rejected') : null}
              submit={(body) => api.decideRegion(r.id, { ...body, verification_id: v.id })} onDecided={reload}
            />
          )}
          {r.verifications.length > 1 && (
            <m.section className="card" aria-labelledby="past-h" {...reveal(3)}>
              <h2 id="past-h">{t('rg.past')}</h2>
              <ul className="evidence">
                {r.verifications.slice(1).map((x) => (
                  <li key={x.id}>
                    <span className="small"><span className="mono">{fmtSlot(x.at)}</span> · <ValidationBadge status={x.validation_status} /> · {t(x.trigger === 'auto' ? 'rg.auto' : 'rg.manual')}</span>
                    <span className="muted small"><DecisionState decision={x.decision} /></span>
                  </li>
                ))}
              </ul>
            </m.section>
          )}
        </div>
      </div>
    </div>
  );
}
