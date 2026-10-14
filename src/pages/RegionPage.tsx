import { Link, useParams, useSearchParams } from 'react-router';
import { ApiError, type PowerSupport, type Quality, type RegionDetail, type SatelliteName, type SlotRecord, type Verification } from '../types';
import { api } from '../api';
import { useI18n } from '../i18n';
import { useLoad } from '../lib/useLoad';
import { errorText } from '../lib/errors';
import { fmtCoord, fmtDay, fmtNum, fmtSigned, fmtSlot } from '../lib/format';
import { agreement, SATELLITE_NAMES } from '../lib/satellites';
import { StatusBadge, STATUS_KEY } from '../components/StatusBadge';
import { RegionTimeline } from '../components/RegionTimeline';
import { RegionUtilities } from '../components/RegionUtilities';
import { ValidationBadge, VerificationCard } from '../components/VerificationCard';
import { DecisionPanel, DecisionState } from '../components/DecisionPanel';
import { IconAlert, IconArrowLeft } from '../components/icons';
import { m, reveal } from '../motion';
import '../regions.css';

const Q_CLASS: Record<Quality, string> = { ACCEPTED: 'q-ok', DEGRADED: 'q-mid', REJECTED: 'q-bad', MISSING: 'q-bad' };
const SATS: SatelliteName[] = ['himawari9', 'gk2a'];

function QualityTag({ q }: { q: Quality }) {
  const { t } = useI18n();
  return <span className={`pill outline ${Q_CLASS[q]}`}>{t(`q.${q}`)}</span>;
}

function ViewText({ flags }: { flags: string[] }) {
  const { t } = useI18n();
  const a = agreement(flags);
  return a ? <>{t(`view.${a.key}`, a.sat ? { sat: a.sat } : undefined)}</> : <>–</>;
}

/** What each satellite saw in the slot, then what the rules used. */
function Satellites({ s, power }: { s: SlotRecord; power: PowerSupport | null | undefined }) {
  const { t } = useI18n();
  const i = s.inputs;
  // A missing view or verdict is said once, in the first row; the rows below show a dash.
  const cell = (name: SatelliteName, show: (v: NonNullable<SlotRecord['views'][SatelliteName]>) => string, first = false) => {
    const v = s.views[name];
    if (!v) return <td key={name} className="na">{first ? t('rgi.no_data') : '–'}</td>;
    if (v.max_anomaly_k == null) return <td key={name} className="na">{first ? t('rgi.no_verdict') : '–'}</td>;
    return <td key={name} className="mono">{show(v)}</td>;
  };
  const support = Object.entries(s.support);
  return (
    <>
      <div className="rg-table-wrap">
        <table className="rg-table rg-sats">
          <thead><tr><th />{SATS.map((n) => <th key={n}>{SATELLITE_NAMES[n]}</th>)}</tr></thead>
          <tbody>
            <tr><td>{t('rgi.anomaly')}</td>{SATS.map((n) => cell(n, (v) => `${fmtSigned(v.max_anomaly_k!, 1)} K${v.max_z ? ` · z ${fmtNum(v.max_z, 1)}` : ''}`, true))}</tr>
            <tr><td>{t('rgi.hot')}</td>{SATS.map((n) => cell(n, (v) => t('rgi.hot_n', { n: v.n_hot, peat: v.n_hot_peat })))}</tr>
            <tr><td>{t('rgi.bt')}</td>{SATS.map((n) => cell(n, (v) => v.mwir_k != null && v.lwir_k != null ? `${fmtNum(v.mwir_k, 1)} / ${fmtNum(v.lwir_k, 1)} K` : '–'))}</tr>
            <tr><td>{t('rgi.where')}</td>{SATS.map((n) => cell(n, (v) => v.hot_lat != null && v.hot_lon != null ? `${fmtCoord(v.hot_lon, v.hot_lat)}${v.hot_on_peat ? ` · ${t('rgi.on_peat')}` : ''}` : '–'))}</tr>
            <tr><td>{t('rgi.cloud_sat')}</td>{SATS.map((n) => {
              const v = s.views[n];
              return <td key={n} className={v ? 'mono' : 'na'}>{v ? `${fmtNum(v.cloud_fraction * 100, 0)}%` : t('rgi.no_data')}</td>;
            })}</tr>
          </tbody>
        </table>
      </div>
      <dl className="kv rg-kv">
        <div>
          <dt>{t('rgi.dt')}</dt>
          <dd>
            <b className="mono">{i.delta_t_k != null ? `${fmtSigned(i.delta_t_k, 1)} K` : '–'}</b> <QualityTag q={s.quality.thermal} />
            <span className="small"><ViewText flags={s.flags} /></span>
          </dd>
        </div>
        <div>
          <dt>{t('rgi.sun')}</dt>
          <dd>{t(s.night ? 'rgi.night' : 'rgi.day', { deg: fmtNum(s.sun_elevation_deg, 0) })}</dd>
        </div>
        <div>
          <dt>{t('rgi.rh')}</dt>
          <dd>{i.relative_humidity_pct != null ? <span className="mono">{fmtNum(i.relative_humidity_pct, 0)}%</span> : '–'} <QualityTag q={s.quality.relative_humidity} /></dd>
        </div>
        <div>
          <dt>{t('rgi.cloud')}</dt>
          <dd>{i.cloud_cover_pct != null ? <span className="mono">{fmtNum(i.cloud_cover_pct, 0)}%</span> : '–'}</dd>
        </div>
        <div>
          <dt>{t('rgi.support')}</dt>
          <dd>{support.length ? support.map(([k, v]) => <span key={k} className="pill grey">{t(`rgu.m.${k}`)} {fmtNum(v, 2)}</span>) : <span className="small">{t('rgi.no_support')}</span>}</dd>
        </div>
        {s.viirs && (
          <div>
            <dt>{t('rgi.viirs')}</dt>
            <dd>
              {s.viirs.length
                ? <span className="mono">{t('rgi.viirs_n', { n: s.viirs.length, km: fmtNum(s.viirs[0].distance_km, 1), when: fmtSlot(s.viirs[0].acquired_at) })}</span>
                : <span className="small">{t('rgi.no_viirs')}</span>}
            </dd>
          </div>
        )}
        <div>
          <dt>{t('rgi.power')}</dt>
          <dd>
            {power?.delta_t_k != null
              ? <span className="mono">ΔT {fmtSigned(power.delta_t_k, 1)} K · RH {power.relative_humidity_pct != null ? `${fmtNum(power.relative_humidity_pct, 0)}%` : '–'}</span>
              : '–'}
            {power && <span className="small">{t('rgi.power_when', { when: fmtSlot(power.observed_at) })}</span>}
          </dd>
        </div>
      </dl>
      {s.flags.length > 0 && (
        <p className="small">
          <span className="lbl">{t('rgi.flags')}</span>{' '}
          {s.flags.map((f) => <span key={f} className="pill grey" title={t(`flag.${f.split(':')[0]}`)}>{f}</span>)}
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
  const [params] = useSearchParams();
  const { t } = useI18n();
  // ?date=YYYY-MM-DD (from the map's day player): that WIB day's slots instead of the last 24 hours
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') ?? '') ? params.get('date') : null;
  const q = useLoad(() => api.region(id, 24, date ?? undefined), [id, date]);
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

  // until the first satellite slot lands, `latest` can still be an hourly NASA POWER record without `views`
  const slots = r.slots ?? [];
  const latest = !date && r.latest && 'views' in r.latest ? r.latest : slots[slots.length - 1];
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
        {date && (
          <p className="rg-archive small" role="status">
            {t('rg.day_banner', { date: fmtDay(date) })} <Link className="link-btn" to={`/regions/${r.id}`}>{t('rg.back_live')}</Link>
          </p>
        )}
        {latest && (
          <dl className="facts">
            <div className={latest.status === 'ALERT' ? 'hot' : ''}><dt>ΔT</dt><dd>{latest.inputs.delta_t_k != null ? `${fmtSigned(latest.inputs.delta_t_k, 1)} K` : '–'}</dd></div>
            <div className="rg-fact-text"><dt>{t('rg.f_view')}</dt><dd><ViewText flags={latest.flags} /> · {t(latest.night ? 'rgt.night' : 'rgt.day')}</dd></div>
            <div><dt>{t('rg.f_rh')}</dt><dd>{latest.inputs.relative_humidity_pct != null ? `${fmtNum(latest.inputs.relative_humidity_pct, 0)}%` : '–'}</dd></div>
            <div><dt>{t('rg.f_cloud')}</dt><dd>{latest.inputs.cloud_cover_pct != null ? `${fmtNum(latest.inputs.cloud_cover_pct, 0)}%` : '–'}</dd></div>
            <div><dt>{t('rg.f_slot')}</dt><dd>{fmtSlot(latest.observed_at)}</dd></div>
            {v && <div><dt>{t('cluster.f_dec')}</dt><dd><DecisionState decision={v.decision} /></dd></div>}
          </dl>
        )}
        <p className="callout"><IconAlert size={14} /> {t('rg.lag_note')}</p>
        {r.last_error && <p className="error" role="alert">{t('rg.last_error', { code: r.last_error })}</p>}
      </m.header>

      <div className="detail-grid">
        <div className="col">
          <m.section className="card" aria-labelledby="tl-h" {...reveal(1)}>
            <div className="card-head">
              <h2 id="tl-h">{date ? t('rg.timeline_day', { date: fmtDay(date) }) : t('rg.timeline')}</h2>
              <button className="link-btn" onClick={reload}>{t('notif.refresh')}</button>
            </div>
            <RegionTimeline slots={slots} />
          </m.section>
          {latest && (
            <m.section className="card" aria-labelledby="in-h" {...reveal(2)}>
              <h2 id="in-h">{t('rg.inputs', { when: fmtSlot(latest.observed_at) })}</h2>
              <Satellites s={latest} power={r.power} />
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
                {t('rg.dec_hotspots', { n: v.supporting_data?.firms_hotspot_count ?? 0 })} · {t('rg.dec_slot', { when: fmtSlot(v.observed_at) })}
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
