import { useId, useRef, useState } from 'react';
import type { AttrDetail, AttrKey, AttrPart, Attributes } from '../types';
import { useI18n } from '../i18n';
import { fmtC, fmtDate, fmtNum, fmtNumM, fmtSigned } from '../lib/format';
import { ATTR_ORDER, T_WARNING, T_WATCH, utility } from '../lib/maut';
import { m, springSoft } from '../motion';
import { FloatingTip } from './FloatingTip';

interface Props {
  attributes: Attributes;
  neighbourSupport: number | null;
  weights: Record<AttrKey, number>;
  details?: Record<AttrKey, AttrDetail>; // measured number behind each u (FE proposal); without it only u and the weight
}

// Bars grow from empty when they enter the screen, top to bottom.
const grow = (pct: number, i: number) => ({
  initial: { width: 0 }, whileInView: { width: `${pct}%` }, viewport: { once: true }, transition: { ...springSoft, delay: i * 0.06 },
});

const hasScale = (d: AttrDetail) => Array.isArray(d.scale) && d.scale.length === 2;

/** Measured number in an attribute row, e.g. "+18.6 K" or "2 of 3 nights"; unknown units are written as is. */
function useMeasured() {
  const { t } = useI18n();
  return (d: AttrDetail): string => {
    if (d.value == null) return t('attr.na');
    if (d.unit === 'K') return `${fmtSigned(d.value, 1)} K`;
    if ((d.unit === 'nights' || d.unit === 'pixels') && hasScale(d)) return t(`attrd.val.${d.unit}`, { v: fmtNum(d.value, 0), n: fmtNum(d.scale[1], 0) });
    return `${fmtNumM(d.value, 1)} ${d.unit}`;
  };
}

/** Scale bounds: whole when whole, otherwise 1 decimal (the backend owns the scale; it may be fractional). */
const fmtScale = (v: number) => (Number.isInteger(v) ? fmtNum(v, 0) : fmtNum(v, 1));

/** One supporting number: absolute temperature in °C (K in the title), signed difference, plain σ, peak U with its date. */
function Part({ p }: { p: AttrPart }) {
  const { t } = useI18n();
  const label = p.key === 'night_peak' ? t('attrd.part.night_peak', { date: p.at ? fmtDate(`${p.at}T13:00:00Z`) : '' }).trim() : t(`attrd.part.${p.key}`);
  if (label === `attrd.part.${p.key}`) return null; // unknown keys are ignored
  let text = '—', title: string | undefined;
  if (p.value != null) {
    if (p.abs) { text = fmtC(p.value); title = `${fmtNum(p.value, 1)} K`; }
    else if (p.unit === 'U') text = fmtNum(p.value, 2);
    else text = p.key === 'sigma' ? `${fmtNum(p.value, 2)} K` : `${fmtSigned(p.value, 1)} K`;
  }
  return <span className="attr-part" title={title}><span>{label}</span> <b>{text}</b></span>;
}

/** The u bar; hover or focus shows its normalisation formula. */
function Bar({ k, u, d, index }: { k: AttrKey; u: number | null; d?: AttrDetail; index: number }) {
  const { t } = useI18n();
  const id = useId();
  const el = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const calc = d && d.value != null && u != null && hasScale(d) ? (() => {
    const [lo, hi] = d.scale;
    const raw = (d.value - lo) / (hi - lo);
    const f = (v: number) => (d.unit === 'K' ? fmtNumM(v, 1) : fmtScale(v)).replace('-', '−');
    return {
      text: t('attrd.calc', { v: f(d.value), lo: f(lo), hi: f(hi), u: fmtNum(u, 2) }),
      clip: raw > 1.005 ? t('attrd.clip_hi') : raw < -0.005 ? t('attrd.clip_lo') : null,
    };
  })() : null;

  return (
    <span
      ref={el} className={`attr-bar${calc ? ' has-tip' : ''}`} tabIndex={calc ? 0 : undefined} role={calc ? 'img' : undefined}
      aria-label={calc ? `${calc.text}${calc.clip ? `; ${calc.clip}` : ''}` : undefined} aria-hidden={calc ? undefined : true}
      aria-describedby={open ? id : undefined}
      onPointerEnter={(e) => { if (e.pointerType !== 'touch') setOpen(true); }} onPointerLeave={(e) => { if (e.pointerType !== 'touch') setOpen(false); }}
      onClick={(e) => { if ((e.nativeEvent as PointerEvent).pointerType === 'touch') setOpen((o) => !o); }}
      onFocus={(e) => { if (e.currentTarget.matches(':focus-visible')) setOpen(true); }} onBlur={() => setOpen(false)}
      onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
    >
      <m.i {...grow((u ?? 0) * 100, index)} />
      {calc && (
        <FloatingTip open={open} id={id} anchor={() => el.current?.getBoundingClientRect() ?? null} anchorKey={k}>
          <div className="tip-head"><b className="mono">{calc.text}</b></div>
          {calc.clip && <div className="tip-sub">{calc.clip}</div>}
        </FloatingTip>
      )}
    </span>
  );
}

/**
 * MAUT parameters: the measured number, the u value (0–1), the weight, and its contribution to U. Missing
 * attributes read "not available" and are left out of the sum.
 */
export function AttributeBars({ attributes, neighbourSupport, weights, details }: Props) {
  const { t } = useI18n();
  const measured = useMeasured();
  const values: Record<AttrKey, number | null> = { ...attributes, u_N: neighbourSupport };
  const U = utility(attributes, neighbourSupport);
  const f2 = (v: number) => fmtNum(v, 2);

  // u_N has no other number, so it is computed here when the backend has not sent attribute_details.
  const detailOf = (k: AttrKey): AttrDetail | undefined =>
    details?.[k] ?? (k === 'u_N' && neighbourSupport != null ? { value: Math.round(neighbourSupport * 8), unit: 'pixels', scale: [0, 8], parts: [] } : undefined);
  const anyDetail = details != null;

  let num = 0, den = 0;
  for (const k of ATTR_ORDER) if (values[k] != null) { num += weights[k] * values[k]!; den += weights[k]; }
  const missing = ATTR_ORDER.some((k) => values[k] == null);

  return (
    <div className={`attrs${anyDetail ? '' : ' no-meas'}`}>
      <div className="attr-cols" aria-hidden="true">
        <span>{t('attr.col_param')}</span>
        {anyDetail && <span className="r">{t('attr.col_value')}</span>}
        <span className="c-bar">{t('attr.col_u')}</span>
        <span className="r c-u" />
        <span className="r">{t('attr.col_w')}</span>
        <span className="r">{t('attr.col_c')}</span>
      </div>

      {ATTR_ORDER.map((k, i) => {
        const u = values[k], d = detailOf(k), w = weights[k];
        const parts = d?.parts ?? [];
        return (
          <div className={`attr${u == null ? ' na' : ''}`} key={k}>
            <span className="attr-name">
              <span>{t(`attr.${k}`)} <code>{k}</code></span>
              {anyDetail && d ? <small>{k === 'u_T' ? t('attrd.head.u_T_t', { t: f2(T_WATCH) }) : t(`attrd.head.${k}`)}</small> : u == null ? <small>{t('attr.na')}</small> : null}
            </span>
            {anyDetail && <b className="attr-meas">{d ? measured(d) : ''}</b>}
            <Bar k={k} u={u} d={d} index={i} />
            <span className="attr-nums">
              <b className={`attr-u${u == null ? ' na' : ''}`}><span className="lab">u </span>{u == null ? '—' : f2(u)}</b>
              <small className="attr-w"><span className="lab">{t('attr.col_w')} </span>{f2(w)}</small>
              <small className="attr-c"><span className="lab">{t('attr.col_c')} </span>{u == null ? '—' : f2(w * u)}</small>
            </span>
            {anyDetail && d && (parts.length > 0 || hasScale(d)) && (
              <p className="attr-parts">
                {parts.map((p, j) => <Part key={`${p.key}${p.at ?? j}`} p={p} />)}
                {d.value != null && hasScale(d) && (
                  <span className="attr-scale">{t('attrd.scale', { lo: `${fmtScale(d.scale[0])} ${d.unit}`, hi: `${fmtScale(d.scale[1])} ${d.unit}` })}</span>
                )}
              </p>
            )}
          </div>
        );
      })}

      <div className="attr total">
        <span className="attr-name"><span>{t('attr.total')}</span></span>
        {anyDetail && <b className="attr-meas thr">{t('attr.threshold', { t: f2(T_WARNING) })}</b>}
        <span className="attr-bar" aria-hidden="true">
          <m.i {...grow(U * 100, ATTR_ORDER.length)} className={U >= T_WARNING ? 'hot' : ''} />
          <em style={{ left: `${T_WARNING * 100}%` }} />
        </span>
        <span className="attr-nums">
          <b className="attr-u">{f2(U)}</b>
          <small className="attr-w">{anyDetail ? '' : `≥ ${f2(T_WARNING)}`}</small>
          <small className="attr-c" />
        </span>
        <p className="attr-parts">
          <span className="attr-formula">{t('attr.formula', { num: f2(num), den: f2(den), u: f2(U) })}</span>
          {missing && <span className="attr-scale">{t('attr.formula_note')}</span>}
        </p>
      </div>
    </div>
  );
}
