import { Link } from 'react-router';
import { useI18n } from '../i18n';
import { StatusBadge } from '../components/StatusBadge';
import { StatusScale, StepRef, WhereItRuns } from '../components/AboutDiagrams';
import type { Status } from '../types';
import { m, reveal } from '../motion';

type Who = 'rule' | 'ai' | 'human';
// Steps 1–3 run as rules, 4 by the AI agent, 5 by a person; the top rule's colour follows who acts.
const STEPS: [number, Who][] = [[1, 'rule'], [2, 'rule'], [3, 'rule'], [4, 'ai'], [5, 'human']];
const WHO_KEY: Record<Who, string> = { rule: 'about.who_rule', ai: 'about.who_ai', human: 'about.who_human' };
const STATUS_ROWS: [Status, string][] = [
  ['ALERT', 'about.st_alert'], ['WARNING', 'about.st_warning'], ['NO_OBSERVABLE', 'about.st_noobs'], ['SAFE', 'about.st_safe'],
];
// Initial values of the backend (asapify_engine/contextual.py, fusion.py, rules.py): hypotheses until calibrated
// against VIIRS (tools/backtest_rules.py replays stored slots with the current rules). Grouped by the step they serve.
const RULES: [number, string, string][] = [
  [2, 'about.r_hot', 'ΔBT ≥ 3 K and ≥ 3σ · 3.9 µm ≥ 2 K and ≥ 3σ'],
  [3, 'about.r_agree', '≤ 8 km (quality flag only)'],
  [3, 'about.r_fuse', 'ΔT = mean of the satellites that see, weighted by clear fraction'],
  [3, 'about.r_maut', 'U = (0.6·μ(ΔT mean) + 0.4·v·μ(ΔT max)) / (0.6 + 0.4·v), v = clear share of the stronger satellite'],
  [3, 'about.r_dry', '+1 K · tanh(z / 2), z = (POWER normal RH − RH) / σ'],
  [3, 'about.r_sun', '−1 K · sin(sun elevation), by day'],
  [3, 'about.r_dt_low', '−∞ … 1–3 K'],
  [3, 'about.r_dt_mid', '1–3 … 6–8 K'],
  [3, 'about.r_dt_high', '6–8 K … ∞'],
  [3, 'about.r_bounds', 'Safe < 1.95 K ≤ Warning < 6.95 K ≤ Alert'],
  [3, 'about.r_cloud', '> 60 %'],
  [3, 'about.r_support', '(U Alert + 0.2·VIIRS + 0.1·POWER) / (1 + their weights), upward only, only when U Alert > 0'],
  [3, 'about.r_margin', '0.05'],
  [4, 'about.r_agent', '24 h · 20 per UTC day (resets 07:00 UTC+7)'],
];
// Each limitation points back to the step it bears on, or to the data source behind it.
const LIMITS: [number, number | null][] = [[1, 1], [2, 3], [3, 3], [4, 4], [5, null]];

type Source = { id: string; name: string; text: string; steps?: [number, number?]; used?: string; links: [string, string][] };
// The links are the sources' own pages; the same ones are in both READMEs.
const SOURCES: Source[] = [
  { id: 'himawari', name: 'Himawari-9 AHI', text: 'about.src_himawari', steps: [1, 3],
    links: [['about.link_registry', 'https://registry.opendata.aws/noaa-himawari/']] },
  { id: 'gk2a', name: 'GK2A AMI', text: 'about.src_gk2a', steps: [1, 3],
    links: [['about.link_registry', 'https://registry.opendata.aws/noaa-gk2a-pds/']] },
  { id: 'firms', name: 'NASA FIRMS VIIRS', text: 'about.src_firms', steps: [3, 4],
    links: [['about.link_site', 'https://firms.modaps.eosdis.nasa.gov/'], ['about.link_api', 'https://firms.modaps.eosdis.nasa.gov/api/']] },
  { id: 'gibs', name: 'NASA GIBS', text: 'about.src_gibs', steps: [4],
    links: [['about.link_docs', 'https://nasa-gibs.github.io/gibs-api-docs/'], ['about.link_worldview', 'https://worldview.earthdata.nasa.gov/']] },
  { id: 'power', name: 'NASA POWER', text: 'about.src_power', steps: [3],
    links: [['about.link_site', 'https://power.larc.nasa.gov/'], ['about.link_api', 'https://power.larc.nasa.gov/docs/services/api/']] },
  { id: 'om', name: 'Open-Meteo', text: 'about.src_om', steps: [3, 4],
    links: [['about.link_site', 'https://open-meteo.com/']] },
  { id: 'khg', name: 'KHG Indicative Peat Map', text: 'about.src_khg', used: 'about.src_regions',
    links: [['about.link_repo', 'https://github.com/KRL-TEAM-PROJECT/ktp-asapify-be/tree/main/tools/khg']] },
  { id: 'gb', name: 'geoBoundaries IDN ADM1', text: 'about.src_gb', used: 'about.src_map',
    links: [['about.link_site', 'https://www.geoboundaries.org/']] },
  { id: 'osm', name: 'OpenFreeMap, OpenStreetMap', text: 'about.src_osm', used: 'about.src_map',
    links: [['about.link_site', 'https://openfreemap.org/'], ['about.link_copyright', 'https://www.openstreetmap.org/copyright']] },
];
// Which sources feed each step (the "Data" line under a step); step 5 posts to the Telegram group instead.
const STEP_DATA: Record<number, string[]> = { 1: ['himawari', 'gk2a'], 2: ['himawari', 'gk2a', 'khg'], 3: ['power', 'om', 'firms'], 4: ['firms', 'gibs', 'om'] };
const NAME: Record<string, string> = { himawari: 'Himawari-9', gk2a: 'GK2A', khg: 'KHG peat map', power: 'NASA POWER', om: 'Open-Meteo', firms: 'NASA FIRMS', gibs: 'NASA GIBS' };

export function AboutPage() {
  const { t } = useI18n();
  const groups = [2, 3, 4].map((n) => [n, RULES.filter(([s]) => s === n)] as const);
  return (
    <div className="wrap about">
      <m.header className="about-head" {...reveal(0)}>
        <h1>{t('about.title')}</h1>
        <p className="lede">{t('about.lede')}</p>
        <p>{t('about.scope')}</p>
        <p className="muted small">{t('about.name')}</p>
      </m.header>

      <section aria-labelledby="how-h">
        <div className="sec-head">
          <h2 id="how-h">{t('about.how_title')}</h2>
          <p className="who-key" aria-label={t('about.who_label')}>
            {(['rule', 'ai', 'human'] as Who[]).map((w) => <span key={w}><i className={`by-${w}`} />{t(WHO_KEY[w])}</span>)}
          </p>
        </div>
        <ol className="steps">
          {STEPS.map(([n, who], i) => (
            <m.li key={n} id={`step-${n}`} className={`step by-${who}`} {...reveal(i)}>
              <div className="step-top"><span className="num">{n}</span><span className="who">{t(WHO_KEY[who])}</span></div>
              <h3>{t(`about.step${n}_t`)}</h3>
              <p>{t(`about.step${n}_d`)}</p>
              {STEP_DATA[n] ? (
                <p className="step-data"><span>{t('about.step_data')}</span>
                  {STEP_DATA[n].map((id) => <a key={id} href={`#src-${id}`}>{NAME[id]}</a>)}
                </p>
              ) : (
                <p className="step-data"><span>{t('about.step5_to')}</span><Link to="/join">{t('about.step5_group')}</Link></p>
              )}
            </m.li>
          ))}
        </ol>
        <div className="outcomes">
          <Link className="outcome" to="/"><b>{t('about.out_map_t')}</b><span>{t('about.out_map_d')}</span></Link>
          <Link className="outcome" to="/join"><b>{t('about.out_tg_t')}</b><span>{t('about.out_tg_d')}</span></Link>
        </div>
        <p className="rule-line">{t('about.ai_rule')}</p>
      </section>

      <m.section aria-labelledby="run-h" {...reveal(0)}>
        <h2 id="run-h">{t('about.run_title')}</h2>
        <p className="sec-lede">{t('about.run_lede')}</p>
        <WhereItRuns />
        <div className="run-more">
          <span className="muted small">{t('about.run_more')}</span>
          <a href="https://github.com/KRL-TEAM-PROJECT/ktp-asapify-be#readme">{t('about.run_more_be')}</a>
          <a href="https://github.com/KRL-TEAM-PROJECT/ktp-asapify-fe#readme">{t('about.run_more_fe')}</a>
        </div>
      </m.section>

      <div className="grid-2">
        <m.section className="card" aria-labelledby="st-h" {...reveal(0)}>
          <h2 id="st-h">{t('about.status_title')}</h2>
          <StatusScale />
          <dl className="status-def">
            {STATUS_ROWS.map(([s, k]) => (
              <div key={s}><dt><StatusBadge status={s} /></dt><dd>{t(k)}</dd></div>
            ))}
          </dl>
          <p className="muted small">{t('alert.note')}</p>
        </m.section>
        <m.section className="card" aria-labelledby="rules-h" {...reveal(1)}>
          <h2 id="rules-h">{t('about.rules_title')}</h2>
          {groups.map(([n, rows]) => (
            <div key={n} className="rule-group">
              <h3><span className="num">{n}</span>{t(`about.step${n}_t`)}</h3>
              <dl className="kv">
                {rows.map(([, k, v]) => <div key={k}><dt>{t(k)}</dt><dd className="mono">{v}</dd></div>)}
              </dl>
            </div>
          ))}
          <p className="muted small">{t('about.rules_note')}</p>
        </m.section>
      </div>

      <div className="grid-2">
        <m.section className="card" aria-labelledby="lim-h" {...reveal(0)}>
          <h2 id="lim-h">{t('about.limits_title')}</h2>
          <ul className="limits">
            {LIMITS.map(([n, step]) => (
              <li key={n}>{t(`about.limit${n}`)} {step ? <StepRef from={step} /> : <span className="step-ref">{NAME.khg}</span>}</li>
            ))}
          </ul>
        </m.section>
        <m.section className="card" aria-labelledby="data-h" {...reveal(1)}>
          <h2 id="data-h">{t('about.data_title')}</h2>
          <dl className="kv sources">
            {SOURCES.map((s) => (
              <div key={s.id} id={`src-${s.id}`}>
                <dt>{s.name}</dt>
                <dd>
                  {t(s.text)}
                  <span className="src-foot">
                    <span className="src-used">{t('about.src_used')} {s.steps ? <StepRef from={s.steps[0]} to={s.steps[1]} /> : t(s.used!)}</span>
                    {s.links.map(([label, href]) => (
                      <a key={href} href={href} target="_blank" rel="noreferrer">{t(label)}</a>
                    ))}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="muted small">{t('about.data_note')}</p>
        </m.section>
      </div>
    </div>
  );
}
