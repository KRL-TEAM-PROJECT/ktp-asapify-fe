import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError } from '../types';
import { api } from '../api';
import { useI18n } from '../i18n';
import { useLoad } from '../lib/useLoad';
import { errorText } from '../lib/errors';
import { fmtCoord, fmtNum, fmtSlot } from '../lib/format';
import { T_ALERT, T_WARNING, WEIGHTS } from '../lib/maut';
import { buildCaption } from '../lib/caption';
import { StatusBadge } from '../components/StatusBadge';
import { EvidenceBadge } from '../components/EvidenceBadge';
import { UtilityChart } from '../components/UtilityChart';
import { AttributeBars } from '../components/AttributeBars';
import { NeighbourGrid } from '../components/NeighbourGrid';
import { SatelliteAgree } from '../components/SatelliteAgree';
import { EvidenceImage } from '../components/EvidenceImage';
import { ViirsList } from '../components/ViirsList';
import { ToolTrace } from '../components/ToolTrace';
import { DecisionPanel, DecisionState } from '../components/DecisionPanel';
import { IconAlert, IconArrowLeft } from '../components/icons';
import { m, reveal } from '../motion';

export function ClusterPage() {
  const { id = '' } = useParams();
  const { t } = useI18n();
  const { data: c, error, loading, reload } = useLoad(() => api.cluster(id), [id]);
  const caption = useMemo(() => (c ? buildCaption(c) : ''), [c]);

  if (loading && !c) {
    return (
      <div className="wrap detail">
        <div className="skel" style={{ height: 64 }} />
        <div className="detail-grid">
          <div className="col">{[220, 260, 180].map((h, i) => <div key={i} className="skel" style={{ height: h }} />)}</div>
          <div className="col">{[420, 280].map((h, i) => <div key={i} className="skel" style={{ height: h }} />)}</div>
        </div>
      </div>
    );
  }

  if (error || !c) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className="wrap detail">
        <Link className="back" to="/pixels"><IconArrowLeft />{t('cluster.back')}</Link>
        <p className="error" role="alert">
          {notFound ? t('cluster.not_found') : t('load_error', { msg: errorText(error, t) })}{' '}
          {!notFound && <button className="link-btn" onClick={reload}>{t('retry')}</button>}
        </p>
      </div>
    );
  }

  const v = c.verification;
  const [lon, lat] = c.centroid;

  return (
    <div className="wrap detail">
      <m.header className="detail-head" {...reveal(0)}>
        <Link className="back" to="/pixels"><IconArrowLeft />{t('cluster.back')}</Link>
        <div className="title-row">
          <h1 className="mono">{c.id}</h1>
          {c.state === 'closed' ? <span className="pill grey">{t('cluster.closed')}</span> : <StatusBadge status="ALERT" />}
          <SatelliteAgree nSat={c.n_sat} agree={c.n_sat >= 2} />
        </div>
        <p className="muted">
          {t(`prov.${c.province}`)} · {fmtCoord(lon, lat)} · {t('cluster.pixels', { n: c.pixels.length })} ·{' '}
          {t('cluster.trigger', { slot: fmtSlot(c.trigger_slot) })}
        </p>
        <dl className="facts">
          <div className="hot"><dt>{t('cluster.f_utility')}</dt><dd>{fmtNum(c.utility_score, 2)}</dd></div>
          <div><dt>{t('cluster.f_nbr')}</dt><dd>{Math.round(c.neighbour_support * 8)}/8</dd></div>
          <div><dt>{t('cluster.f_sat')}</dt><dd>{c.n_sat}/2</dd></div>
          <div><dt>{t('cluster.f_ver')}</dt><dd><EvidenceBadge result={v?.result ?? null} /></dd></div>
          <div><dt>{t('cluster.f_dec')}</dt><dd><DecisionState decision={c.decision} /></dd></div>
        </dl>
        <p className="callout"><IconAlert size={14} /> {t('alert.note')}</p>
      </m.header>

      <div className="detail-grid">
        <div className="col">
          <m.section className="card" aria-labelledby="chart-h" {...reveal(1)}>
            <h2 id="chart-h">{t('chart.title')}</h2>
            <UtilityChart series={c.series} thresholds={{ warning: T_WARNING, alert: T_ALERT }} triggerSlot={c.trigger_slot} />
          </m.section>
          <m.section className="card" aria-labelledby="attr-h" {...reveal(2)}>
            <h2 id="attr-h">{t('attr.title')}</h2>
            <AttributeBars attributes={c.attributes} neighbourSupport={c.neighbour_support} weights={WEIGHTS} details={c.attribute_details} />
          </m.section>
          <m.section className="card" aria-labelledby="nbr-h" {...reveal(3)}>
            <h2 id="nbr-h">{t('nbr.title')}</h2>
            <NeighbourGrid neighbours={c.neighbours} />
          </m.section>
        </div>

        <div className="col">
          <m.section className="card" aria-labelledby="ver-h" {...reveal(2)}>
            <div className="card-head">
              <h2 id="ver-h">{t('ver.title')}</h2>
              <EvidenceBadge result={v?.result ?? null} />
            </div>
            {!v ? (
              <p className="muted">{t('ver.pending')}</p>
            ) : (
              <>
                <p>{v.summary}</p>
                <p className="muted small">{t('ver.at', { when: fmtSlot(v.at) })}</p>
                <div className="evimgs">
                  {v.images.map((img) => (
                    <EvidenceImage key={img.source} img={img} centre={c.centroid} clusterPixels={c.pixels} repPixel={c.rep_pixel} viirs={v.viirs} hotFrom={c.attribute_details?.u_H?.scale[0]} />
                  ))}
                </div>

                <h3>{t('ver.viirs_title')}</h3>
                <ViirsList detections={v.viirs} />

                <h3>{t('ver.evidence')}</h3>
                <ul className="evidence">
                  {v.evidence.map((e, i) => (
                    <li key={i}>
                      <span className="lbl">{t(`ver.src.${e.source}`)}</span>
                      <span>{e.finding}</span>
                      {e.observed_at && (
                        <span className="muted small">
                          {fmtSlot(e.observed_at)}{e.age_h != null && ` · ${t('ver.age', { h: fmtNum(e.age_h, 1) })}`}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {v.smoke_visible !== true && <p className="callout info small">{t('ver.no_smoke_note')}</p>}
                <ToolTrace calls={v.tool_trace} />
              </>
            )}
          </m.section>

          <DecisionPanel
            key={`${c.id}-${c.decision?.at ?? 'open'}`} decision={c.decision} province={c.province} caption={caption}
            summary={<>
              ALERT · U {fmtNum(c.utility_score, 2)} · {t('map.nbr', { k: Math.round(c.neighbour_support * 8) })} ·{' '}
              {c.n_sat >= 2 ? t('sat.agree') : t('sat.single')} ·{' '}
              {v ? t(v.result === 'strong_evidence' ? 'evidence.strong' : 'evidence.inconclusive') : t('evidence.none')}
            </>}
            submit={(body) => api.decide(c.id, body)} onDecided={reload}
          />
        </div>
      </div>
    </div>
  );
}
