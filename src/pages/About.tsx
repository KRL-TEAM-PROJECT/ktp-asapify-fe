import { useI18n } from '../i18n';
import { StatusBadge } from '../components/StatusBadge';
import type { Status } from '../types';
import { m, reveal } from '../motion';

// Steps 1–3 run as rules, 4 by the AI agent, 5 by a person; the top border colour follows who acts.
const STEPS: [number, 'rule' | 'ai' | 'human'][] = [[1, 'rule'], [2, 'rule'], [3, 'rule'], [4, 'ai'], [5, 'human']];
const STATUS_ROWS: [Status, string][] = [
  ['ALERT', 'about.st_alert'], ['WARNING', 'about.st_warning'], ['NO_OBSERVABLE', 'about.st_noobs'], ['SAFE', 'about.st_safe'],
];
// Initial values of the backend (asapify_engine/contextual.py, fusion.py, rules.py): hypotheses until calibrated
// against VIIRS (tools/backtest_rules.py replays stored slots with the current rules).
const RULES: [string, string][] = [
  ['about.r_hot', 'ΔBT ≥ 3 K and ≥ 3σ · 3.9 µm ≥ 2 K and ≥ 3σ'],
  ['about.r_agree', '≤ 8 km (quality flag only)'],
  ['about.r_fuse', 'ΔT = mean of the satellites that see, weighted by clear fraction'],
  ['about.r_dry', '+1 K · tanh(z / 2), z = (POWER normal RH − RH) / σ'],
  ['about.r_sun', '−1 K · sin(sun elevation), by day'],
  ['about.r_dt_low', '−∞ … 1–3 K'],
  ['about.r_dt_mid', '1–3 … 6–8 K'],
  ['about.r_dt_high', '6–8 K … ∞'],
  ['about.r_bounds', 'Safe < 1.95 K ≤ Warning < 6.95 K ≤ Alert'],
  ['about.r_cloud', '> 60 %'],
  ['about.r_support', 'ALERT + 0.2·VIIRS + 0.1·POWER, upward only, only when ΔT high > 0'],
  ['about.r_margin', '0.05'],
  ['about.r_agent', '24 h · 20 / day'],
];
const SOURCES: [string, string][] = [
  ['Himawari-9 AHI', 'about.src_himawari'],
  ['GK2A AMI', 'about.src_gk2a'],
  ['NASA FIRMS VIIRS', 'about.src_firms'],
  ['NASA GIBS', 'about.src_gibs'],
  ['NASA POWER', 'about.src_power'],
  ['Open-Meteo', 'about.src_om'],
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
          <ul>{[1, 2, 3, 4, 5].map((n) => <li key={n}>{t(`about.limit${n}`)}</li>)}</ul>
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
