import { useI18n } from '../i18n';
import { StatusBadge } from '../components/StatusBadge';
import type { Status } from '../types';
import { m, reveal } from '../motion';

// Steps 1–3 run as rules, 4 by the AI agent, 5 by a person; the top border colour follows who acts.
const STEPS: [number, 'rule' | 'ai' | 'human'][] = [[1, 'rule'], [2, 'rule'], [3, 'rule'], [4, 'ai'], [5, 'human']];
const STATUS_ROWS: [Status, string][] = [
  ['ALERT', 'about.st_alert'], ['WARNING', 'about.st_warning'], ['NO_OBSERVABLE', 'about.st_noobs'], ['SAFE', 'about.st_safe'],
];
// Initial values of the backend RuleConfig (asapify_engine/rules.py): hypotheses until calibrated on past fires.
const RULES: [string, string][] = [
  ['about.r_dt_low', '−∞ … 1–3 K'],
  ['about.r_dt_mid', '1–3 … 6–8 K'],
  ['about.r_dt_high', '6–8 K … ∞'],
  ['about.r_rh_high', '40–60 % … ∞'],
  ['about.r_rh_low', '−∞ … 30–40 %'],
  ['about.r_cloud', '> 60 %'],
  ['about.r_weights', 'SAFE 0.6·ΔT low + 0.4·RH high · WARNING 1.0·ΔT medium · ALERT 0.6·ΔT high + 0.4·RH low'],
  ['about.r_margin', '0.05'],
  ['about.r_agent', '6 h · 20 / day'],
];
const SOURCES: [string, string][] = [
  ['NASA POWER', 'about.src_power'],
  ['Open-Meteo', 'about.src_om'],
  ['NASA FIRMS VIIRS', 'about.src_firms'],
  ['KHG Indicative Peat Map', 'about.src_khg'],
  ['geoBoundaries IDN ADM1', 'about.src_gb'],
];

export function AboutPage() {
  const { t } = useI18n();
  return (
    <div className="wrap about">
      <m.header className="about-head" {...reveal(0)}>
        <h1>{t('about.title')}</h1>
        <p className="lede">{t('about.lede')}</p>
        <p>{t('about.scope')}</p>
        <p className="muted small">{t('about.name')}</p>
      </m.header>

      <section aria-labelledby="how-h">
        <h2 id="how-h">{t('about.how_title')}</h2>
        <ol className="steps">
          {STEPS.map(([n, who], i) => (
            <m.li key={n} className={`step by-${who}`} {...reveal(i)}>
              <span className="num">{n}</span>
              <h3>{t(`about.step${n}_t`)}</h3>
              <p>{t(`about.step${n}_d`)}</p>
            </m.li>
          ))}
        </ol>
        <p className="rule-line">{t('about.ai_rule')}</p>
      </section>

      <div className="grid-2">
        <m.section className="card" aria-labelledby="st-h" {...reveal(0)}>
          <h2 id="st-h">{t('about.status_title')}</h2>
          <dl className="status-def">
            {STATUS_ROWS.map(([s, k]) => (
              <div key={s}><dt><StatusBadge status={s} /></dt><dd>{t(k)}</dd></div>
            ))}
          </dl>
          <p className="muted small">{t('alert.note')}</p>
        </m.section>
        <m.section className="card" aria-labelledby="rules-h" {...reveal(1)}>
          <h2 id="rules-h">{t('about.rules_title')}</h2>
          <dl className="kv">
            {RULES.map(([k, v]) => <div key={k}><dt>{t(k)}</dt><dd className="mono">{v}</dd></div>)}
          </dl>
          <p className="muted small">{t('about.rules_note')}</p>
        </m.section>
      </div>

      <div className="grid-2">
        <m.section className="card" aria-labelledby="lim-h" {...reveal(0)}>
          <h2 id="lim-h">{t('about.limits_title')}</h2>
          <ul>{[1, 2, 3, 4, 5, 6].map((n) => <li key={n}>{t(`about.limit${n}`)}</li>)}</ul>
        </m.section>
        <m.section className="card" aria-labelledby="data-h" {...reveal(1)}>
          <h2 id="data-h">{t('about.data_title')}</h2>
          <dl className="kv">
            {SOURCES.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{t(v)}</dd></div>)}
          </dl>
          <p className="muted small">{t('about.data_note')}</p>
        </m.section>
      </div>
    </div>
  );
}
