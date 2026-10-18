import { Link } from 'react-router';
import { useI18n } from '../i18n';
import { StatusIcon } from './icons';
import { STATUS_KEY } from './StatusBadge';

// Diagrams of the About page. They are plain HTML and CSS (no library, no image), so they reflow from a 360 px phone
// to a desktop, follow the theme and stay readable by screen readers. The step numbers tie them to "How it works".

type Glyph = 'clock' | 'gear' | 'db' | 'spark' | 'globe' | 'api' | 'queue' | 'chat';

// 16 px line icons in the style of components/icons.tsx.
const GLYPHS: Record<Glyph, string> = {
  clock: 'M8 1.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 8 1.8zM8 4.5V8l2.3 1.5',
  gear: 'M8 5.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8zM8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4',
  db: 'M3 4c0-1 2.2-1.8 5-1.8S13 3 13 4s-2.2 1.8-5 1.8S3 5 3 4zM3 4v8c0 1 2.2 1.8 5 1.8s5-.8 5-1.8V4M3 8c0 1 2.2 1.8 5 1.8S13 9 13 8',
  spark: 'M8 1.8l1.4 4.8 4.8 1.4-4.8 1.4L8 14.2l-1.4-4.8L1.8 8l4.8-1.4z',
  globe: 'M8 1.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 8 1.8zM1.8 8h12.4M8 1.8c1.7 1.8 2.5 3.8 2.5 6.2S9.7 12.4 8 14.2C6.3 12.4 5.5 10.4 5.5 8S6.3 3.6 8 1.8z',
  api: 'M2 3.5h12v9H2zM6.3 6.3L4.6 8l1.7 1.7M9.7 6.3L11.4 8 9.7 9.7',
  queue: 'M2.5 4.5h7M2.5 8h7M2.5 11.5h7M11.5 5.5L14 8l-2.5 2.5',
  chat: 'M2.5 3h11v7.5H6.5L2.5 13.5z',
};

function Icon({ glyph }: { glyph: Glyph }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={GLYPHS[glyph]} /></svg>
  );
}

function Arrow() {
  return (
    <svg className="flow-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 8h10M9 4.5L12.5 8 9 11.5" /></svg>
  );
}

/** A step reference, "Step 4" or "Steps 1–3", in the step colours' neutral outline. Not a link: the number is the link. */
export function StepRef({ from, to }: { from: number; to?: number }) {
  const { t } = useI18n();
  return <span className="step-ref">{to ? t('about.steps_ref', { from, to }) : t('about.step_ref', { n: from })}</span>;
}

type Node = { glyph: Glyph; key: string; outside?: boolean };
const PATHS: { title: string; text: string; steps?: [number, number?]; chains: { nodes: Node[]; label?: string }[] }[] = [
  {
    title: 'about.path1', text: 'about.path1_d', steps: [1, 4],
    chains: [
      { nodes: [{ glyph: 'clock', key: 'about.svc_scheduler' }, { glyph: 'gear', key: 'about.svc_worker' }, { glyph: 'db', key: 'about.svc_firestore' }] },
      { nodes: [{ glyph: 'gear', key: 'about.svc_worker' }, { glyph: 'spark', key: 'about.svc_gemini' }], label: 'about.on_alert' },
    ],
  },
  {
    title: 'about.path2', text: 'about.path2_d',
    chains: [{ nodes: [{ glyph: 'globe', key: 'about.svc_hosting' }, { glyph: 'api', key: 'about.svc_api' }, { glyph: 'db', key: 'about.svc_firestore' }] }],
  },
  {
    title: 'about.path3', text: 'about.path3_d', steps: [5],
    chains: [{ nodes: [{ glyph: 'api', key: 'about.svc_api' }, { glyph: 'queue', key: 'about.svc_tasks' }, { glyph: 'gear', key: 'about.svc_worker' }, { glyph: 'chat', key: 'about.svc_telegram', outside: true }] }],
  },
];
const INPUTS: [string, string, string][] = [
  ['himawari', 'Himawari-9, GK2A', 'NOAA Open Data on AWS'],
  ['firms', 'NASA FIRMS', 'VIIRS hotspots'],
  ['gibs', 'NASA GIBS', 'VIIRS images'],
  ['power', 'NASA POWER', 'humidity normal'],
  ['om', 'Open-Meteo', 'humidity, weather'],
];

/** Open data, then Google Cloud's three paths, then the people who read the result. */
export function WhereItRuns() {
  const { t } = useI18n();
  return (
    <div className="run">
      <section className="run-zone run-in" aria-labelledby="run-in-h">
        <h3 id="run-in-h">{t('about.run_in')}</h3>
        <ul className="run-list">
          {INPUTS.map(([id, name, what]) => (
            <li key={id}><a href={`#src-${id}`}><b>{name}</b><span>{what}</span></a></li>
          ))}
        </ul>
      </section>
      <div className="run-arrow" aria-hidden="true"><Arrow /></div>
      <section className="run-zone run-cloud" aria-labelledby="run-cloud-h">
        <h3 id="run-cloud-h">{t('about.run_cloud')}</h3>
        <p className="muted small">{t('about.run_cloud_d')}</p>
        <ol className="paths">
          {PATHS.map((p) => (
            <li key={p.title} className="path">
              <div className="path-head"><h4>{t(p.title)}</h4>{p.steps && <StepRef from={p.steps[0]} to={p.steps[1]} />}</div>
              {p.chains.map((c, i) => (
                <p className="chain" key={i} aria-label={c.nodes.map((n) => t(n.key)).join(', then ')}>
                  {c.nodes.map((n, j) => (
                    <span key={j} className="chain-step">
                      {j > 0 && <Arrow />}
                      {j > 0 && c.label && j === 1 && <span className="chain-label">{t(c.label)}</span>}
                      <span className={`svc${n.outside ? ' outside' : ''}`}><Icon glyph={n.glyph} />{t(n.key)}</span>
                    </span>
                  ))}
                </p>
              ))}
              <p className="path-text">{t(p.text)}</p>
            </li>
          ))}
        </ol>
        <p className="muted small">{t('about.run_foot')}</p>
      </section>
      <div className="run-arrow" aria-hidden="true"><Arrow /></div>
      <section className="run-zone run-out" aria-labelledby="run-out-h">
        <h3 id="run-out-h">{t('about.run_out')}</h3>
        <ul className="run-list">
          <li><Link to="/"><b>{t('about.ppl_all')}</b><span>{t('about.ppl_all_d')}</span></Link></li>
          <li><div><b>{t('about.ppl_ops')}</b><span>{t('about.ppl_ops_d')}</span></div></li>
          <li><Link to="/join"><b>{t('about.ppl_tg')}</b><span>{t('about.ppl_tg_d')}</span></Link></li>
        </ul>
      </section>
    </div>
  );
}

// The status boundaries of asapify_engine/rules.py on a 0-10 K axis: Safe < 1.95 K <= Warning < 6.95 K <= Alert.
const AXIS = 10;
const BOUNDS = [1.95, 6.95];

/** ΔT counted on a line, cut into the three statuses, with the shifts that move a reading along it. */
export function StatusScale() {
  const { t } = useI18n();
  const segs: ['SAFE' | 'WARNING' | 'ALERT', number][] = [
    ['SAFE', BOUNDS[0]], ['WARNING', BOUNDS[1] - BOUNDS[0]], ['ALERT', AXIS - BOUNDS[1]],
  ];
  const name = (s: 'SAFE' | 'WARNING' | 'ALERT') => t(STATUS_KEY[s]);
  return (
    <figure className="scale">
      <figcaption className="lbl">{t('about.scale_cap')}</figcaption>
      <div className="scale-bar" role="img"
        aria-label={`${name('SAFE')} < 1.95 K ≤ ${name('WARNING')} < 6.95 K ≤ ${name('ALERT')}`}>
        {segs.map(([s, w]) => (
          <span key={s} className={`seg seg-${s.toLowerCase()}`} style={{ flexGrow: w }} aria-hidden="true">
            <StatusIcon status={s} size={12} />{name(s)}
          </span>
        ))}
      </div>
      <div className="scale-ticks" aria-hidden="true">
        <span style={{ left: '0%' }}>0 K</span>
        {BOUNDS.map((b) => <span key={b} style={{ left: `${(b / AXIS) * 100}%` }}>{b} K</span>)}
      </div>
      <p className="small muted">{t('about.scale_note')}</p>
    </figure>
  );
}
