import { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { ApiError, type ClusterDetail, type Decision } from '../types';
import { api } from '../api';
import { useI18n } from '../i18n';
import { fmtNum, fmtSlot } from '../lib/format';
import { CAPTION_MAX } from '../lib/caption';
import { errorText } from '../lib/errors';
import { exitFast, m, reveal, spring } from '../motion';
import { IconCheck, IconClock, IconSend, IconX } from './icons';
import { DeliveryStatus } from './DeliveryStatus';

/** Decision label: text + icon, no level colour. */
export function DecisionState({ decision }: { decision: Decision | null }) {
  const { t } = useI18n();
  if (!decision) return <span className="dec-state"><IconClock size={12} />{t('decision.pending')}</span>;
  if (decision.action === 'publish' && decision.telegram && decision.telegram.status !== 'sent') {
    return <span className="dec-state"><IconClock size={12} />{t('dec.delivery_unconfirmed')}</span>;
  }
  return decision.action === 'publish'
    ? <span className="dec-state"><IconSend size={12} />{t('decision.published')}</span>
    : <span className="dec-state"><IconX size={12} />{t('decision.rejected')}</span>;
}

interface Props {
  cluster: ClusterDetail;
  caption: string;
  onDecided(): void;
}

type Mode = 'idle' | 'confirm' | 'reject';

const slide = {
  initial: { opacity: 0, y: -8 }, animate: { opacity: 1, y: 0, transition: spring }, exit: { opacity: 0, transition: exitFast },
};

/** Two buttons only: Publish (caption editable) or Reject (reason required). */
export function DecisionPanel({ cluster, caption: initialCaption, onDecided }: Props) {
  const { t } = useI18n();
  const [caption, setCaption] = useState(initialCaption);
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<Mode>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const v = cluster.verification;
  const d = cluster.decision;
  const prov = t(`prov.${cluster.province}`);

  if (d) {
    return (
      <m.section className="card decision" aria-labelledby="dec-h" {...reveal(0)}>
        <h2 id="dec-h">{t('dec.title')}</h2>
        <p className="decided">
          {d.action === 'publish' ? <IconCheck /> : <IconX />}
          {t(d.action === 'publish' ? 'dec.published_by' : 'dec.rejected_by', { by: d.by, when: fmtSlot(d.at) })}
        </p>
        {d.alert_id && <p className="muted">{t('dec.alert', { id: d.alert_id })}</p>}
        {d.action === 'publish' && d.telegram && d.telegram.status !== 'sent' && (
          <p className="error" role="alert">{t('dec.delivery_warning')}</p>
        )}
        {d.notifications && <p className="muted" role="status">{
          d.notifications.state === 'fanout_pending' ? t('dec.outbox_pending')
            : d.notifications.state === 'no_recipients' ? t('dec.outbox_none')
              : t('dec.outbox', { r: d.notifications.recipients, j: d.notifications.jobs })}</p>}
        {d.alert_id && d.notifications && <DeliveryStatus alertId={d.alert_id} since={d.at} />}
        {d.reason && <blockquote>{d.reason}</blockquote>}
      </m.section>
    );
  }

  const tooLong = caption.length > CAPTION_MAX;

  async function submit(action: 'publish' | 'reject') {
    setError(null);
    if (action === 'reject' && !reason.trim()) { setError(t('dec.reason_required')); return; }
    if (action === 'publish' && (tooLong || !caption.trim())) { setError(t('dec.too_long')); return; }
    setBusy(true);
    try {
      await api.decide(cluster.id, {
        action,
        caption: action === 'publish' ? caption : null,
        reason: action === 'reject' ? reason.trim() : null,
      });
      onDecided();
    } catch (e) {
      setError(errorText(e, t));
      if (e instanceof ApiError && e.code === 'ALREADY_DECIDED') onDecided();
    } finally {
      setBusy(false);
    }
  }

  return (
    <m.section className="card decision" aria-labelledby="dec-h" {...reveal(1)}>
      <h2 id="dec-h">{t('dec.title')}</h2>
      <div className="dec-summary">
        <span className="lbl">{t('dec.summary')}</span>
        <p>
          ALERT · U {fmtNum(cluster.utility_score, 2)} · {t('map.nbr', { k: Math.round(cluster.neighbour_support * 8) })} ·{' '}
          {cluster.n_sat >= 2 ? t('sat.agree') : t('sat.single')} ·{' '}
          {v ? t(v.result === 'strong_evidence' ? 'evidence.strong' : 'evidence.inconclusive') : t('evidence.none')}
        </p>
      </div>

      <label className="field-label" htmlFor="caption">
        <span>{t('dec.caption')}</span>
        <span className={tooLong ? 'over' : ''}>{t('dec.count', { n: caption.length })}</span>
      </label>
      <textarea
        id="caption" value={caption} rows={8} disabled={busy || mode === 'reject'}
        onChange={(e) => setCaption(e.target.value)} aria-invalid={tooLong}
      />

      {/* Blocks that appear/disappear fade in and out; elements below them (layout="position") slide to their new place. */}
      <AnimatePresence initial={false}>
        {mode === 'reject' && (
          <m.div key="reason" className="expand" {...slide}>
            <label className="field-label" htmlFor="reason"><span>{t('dec.reason')}</span></label>
            <textarea id="reason" value={reason} rows={3} required autoFocus disabled={busy} onChange={(e) => setReason(e.target.value)} />
          </m.div>
        )}
        {mode === 'confirm' && <m.p key="confirm" className="confirm" role="alert" {...slide}>{t('dec.confirm_publish', { prov })}</m.p>}
        {error && <m.p key="error" className="error" role="alert" {...slide}>{error}</m.p>}
      </AnimatePresence>

      <m.div
        key={mode} className="btns" layout="position" transition={spring}
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      >
        {mode === 'idle' && (
          <>
            <button className="btn primary" disabled={busy || tooLong} onClick={() => setMode('confirm')}>
              <IconSend />{t('btn.publish')}
            </button>
            <button className="btn" disabled={busy} onClick={() => { setMode('reject'); setError(null); }}>
              <IconX />{t('btn.reject')}
            </button>
          </>
        )}
        {mode === 'confirm' && (
          <>
            <button className="btn primary" disabled={busy} onClick={() => submit('publish')}>
              <IconSend />{busy ? t('dec.sending') : t('dec.confirm')}
            </button>
            <button className="btn" disabled={busy} onClick={() => setMode('idle')}>{t('dec.cancel')}</button>
          </>
        )}
        {mode === 'reject' && (
          <>
            <button className="btn danger" disabled={busy} onClick={() => submit('reject')}>
              <IconX />{busy ? t('dec.sending') : t('dec.confirm_reject')}
            </button>
            <button className="btn" disabled={busy} onClick={() => { setMode('idle'); setError(null); }}>{t('dec.cancel')}</button>
          </>
        )}
      </m.div>
      <m.p className="muted small" layout="position" transition={spring}>{t('dec.hint')}</m.p>
    </m.section>
  );
}
