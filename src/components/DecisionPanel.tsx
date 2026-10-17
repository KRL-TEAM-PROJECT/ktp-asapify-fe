import { useState, type ReactNode } from 'react';
import { AnimatePresence } from 'motion/react';
import { ApiError, type Decision, type DecisionRequest, type ProvinceCode } from '../types';
import { useI18n } from '../i18n';
import { fmtSlot } from '../lib/format';
import { CAPTION_MAX } from '../lib/caption';
import { errorText } from '../lib/errors';
import { exitFast, m, reveal, spring } from '../motion';
import { IconCheck, IconClock, IconSend, IconX } from './icons';
import { DeliveryStatus } from './DeliveryStatus';

/** Decision label: text + icon, no level colour. */
export function DecisionState({ decision }: { decision: Decision | null }) {
  const { t } = useI18n();
  if (!decision) return <span className="dec-state"><IconClock size={12} />{t('decision.pending')}</span>;
  return decision.action === 'publish'
    ? <span className="dec-state"><IconSend size={12} />{t(decision.auto ? 'decision.auto' : 'decision.published')}</span>
    : <span className="dec-state"><IconX size={12} />{t('decision.rejected')}</span>;
}

interface Props {
  decision: Decision | null;
  province: ProvinceCode;
  summary: ReactNode; // one line under "Summary": what the operator is deciding on
  caption: string; // starting text of the notification
  details?: string | null; // lines the backend adds under the caption (coordinates, map link, slot), shown as a preview
  submit(body: DecisionRequest): Promise<unknown>;
  onDecided(): void;
  publishBlocked?: string | null; // why publishing is not possible; rejecting still is
  /** When the backend publishes this verification itself if nobody decides (backend publication.py); null = never. */
  autoAt?: string | null;
}

type Mode = 'idle' | 'confirm' | 'reject';

// the last line the worker adds to every message (backend asapify_api/notification_delivery.py, text_message)
const FOOTER = 'ALERT is an indication, not a confirmed fire.';

const slide = {
  initial: { opacity: 0, y: -8 }, animate: { opacity: 1, y: 0, transition: spring }, exit: { opacity: 0, transition: exitFast },
};

/** Two buttons only: Publish (caption editable) or Reject (reason required). Used for region verifications. */
export function DecisionPanel({ decision: d, province, summary, caption: initialCaption, details, submit: send, onDecided, publishBlocked, autoAt }: Props) {
  const { t } = useI18n();
  const [caption, setCaption] = useState(initialCaption);
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<Mode>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prov = t(`prov.${province}`);

  if (d) {
    return (
      <m.section className="card decision" aria-labelledby="dec-h" {...reveal(0)}>
        <h2 id="dec-h">{t('dec.title')}</h2>
        <p className="decided">
          {d.action === 'publish' ? <IconCheck /> : <IconX />}
          {d.auto ? t('dec.published_auto', { when: fmtSlot(d.at) })
            : t(d.action === 'publish' ? 'dec.published_by' : 'dec.rejected_by', { by: d.by, when: fmtSlot(d.at) })}
        </p>
        {d.auto && <p className="muted small">{t('dec.auto_why')}</p>}
        {d.alert_id && <p className="muted">{t('dec.alert', { id: d.alert_id })}</p>}
        {d.notifications && <p className="muted" role="status">{
          d.notifications.state === 'fanout_pending' ? t('dec.outbox_pending')
            : d.notifications.state === 'no_groups' ? t('dec.outbox_none')
              : t('dec.outbox_groups', { g: d.notifications.groups })}</p>}
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
      await send({
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
        <p>{summary}</p>
      </div>

      <label className="field-label" htmlFor="caption">
        <span>{t('dec.caption')}</span>
        <span className={tooLong ? 'over' : ''}>{t('dec.count', { n: caption.length })}</span>
      </label>
      <textarea
        id="caption" value={caption} rows={8} disabled={busy || mode === 'reject' || !!publishBlocked}
        onChange={(e) => setCaption(e.target.value)} aria-invalid={tooLong}
      />
      {details && (
        <div className="dec-details">
          <span className="lbl">{t('dec.details')}</span>
          <pre className="mono small">{`${details}\n${FOOTER}`}</pre>
        </div>
      )}
      {publishBlocked && <p className="callout info small">{publishBlocked}</p>}
      {!publishBlocked && autoAt && (
        <p className="callout info small" role="note">
          <IconClock size={14} />
          <span>{Date.parse(autoAt) <= Date.now() ? t('dec.auto_now') : t('dec.auto_at', { when: fmtSlot(autoAt) })}</span>
        </p>
      )}

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
            <button className="btn primary" disabled={busy || tooLong || !!publishBlocked} onClick={() => setMode('confirm')}>
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
