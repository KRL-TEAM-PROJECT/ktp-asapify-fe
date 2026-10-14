import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import {
  CONVENTIONS, ENDPOINTS, ERRORS, INTERNAL, SCHEMAS, STATIC_EXAMPLES,
  type Endpoint, type ExampleKey, type Field, type Origin, type Schema,
} from '../contract/spec';

const SCHEMA_NAMES = new Set(SCHEMAS.map((s) => s.name));
// The FE-proposal legend only shows while some item is not in backend.html yet.
const HAS_FE = SCHEMAS.some((s) => s.origin === 'fe' || s.fields.some((f) => f.origin === 'fe'))
  || ENDPOINTS.some((e) => e.params?.some((p) => p.origin === 'fe'));
const BASE = '/api/v1';

/** `code` in spec text → <code>. */
function rich(s: string): ReactNode {
  return s.split('`').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : <Fragment key={i}>{part}</Fragment>));
}

/** Schema names in the type column → links to the schema. */
function typeCell(type: string): ReactNode {
  return type.split(/\b([A-Z][A-Za-z]+)\b/).map((part, i) =>
    SCHEMA_NAMES.has(part) ? <a key={i} href={`#sc-${part}`}>{part}</a> : <Fragment key={i}>{part}</Fragment>,
  );
}

/** Long arrays and strings are trimmed so examples stay readable. */
function trim(v: unknown, note: (n: number) => string): unknown {
  if (typeof v === 'string' && v.length > 96) return `${v.slice(0, 64)}… (+${v.length - 64})`;
  if (Array.isArray(v)) {
    const head = v.slice(0, 3).map((x) => trim(x, note));
    return v.length > 4 ? [...head, note(v.length - 3)] : v.map((x) => trim(x, note));
  }
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'url' ? x : trim(x, note)])); // URLs stay whole
  }
  return v;
}

function JsonBlock({ value, label }: { value: unknown; label: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(value, null, 2);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  };
  return (
    <div className="json">
      <div className="json-head">
        <span>{label}</span>
        <button className="link-btn" onClick={copy}>{copied ? t('api.copied') : t('api.copy')}</button>
      </div>
      <pre>{text}</pre>
    </div>
  );
}

function OriginTag({ origin }: { origin: Origin }) {
  const { t } = useI18n();
  return origin === 'fe' ? <span className="tag fe">{t('api.fe_tag')}</span> : null;
}

function FieldTable({ fields, origin }: { fields: Field[]; origin: Origin }) {
  const { t } = useI18n();
  return (
    <div className="table-wrap">
      <table className="fields">
        <thead>
          <tr><th>{t('api.field')}</th><th>{t('api.type')}</th><th>{t('api.req')}</th><th>{t('api.desc')}</th></tr>
        </thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f.name}>
              {/* FE-proposal schemas are tagged in the title; a row is tagged only when it differs from its schema. */}
              <th scope="row"><code>{f.name}</code> {origin !== 'fe' && <OriginTag origin={f.origin ?? origin} />}</th>
              <td className="type">{typeCell(f.type)}</td>
              <td>{f.req ? t('api.yes') : t('api.no')}</td>
              <td>{rich(f.desc)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EndpointCard({ ep, examples }: { ep: Endpoint; examples: Record<string, unknown> }) {
  const { t } = useI18n();
  const note = (n: number) => `… +${n} ${t('api.trimmed')}`;
  const ex = (k?: ExampleKey) => (k && k in examples ? trim(examples[k], note) : undefined);
  return (
    <article className="ep" id={`ep-${ep.id}`}>
      <header className="ep-head">
        <span className={`m m-${ep.method.toLowerCase()}`}>{ep.method}</span>
        <code className="ep-path">{BASE}{ep.path}</code>
        <span className={`auth ${ep.auth}`}>{t(`api.${ep.auth}`)}</span>
      </header>
      <h3>{ep.title}</h3>
      <p>{rich(ep.purpose)}</p>
      {ep.usedBy
        ? <p className="used"><b>{t('api.used_by')}:</b> {ep.usedBy}</p>
        : <p className="used none">{t('api.not_used')}</p>}

      {ep.params && (
        <>
          <h4>{t('api.params')}</h4>
          <FieldTable fields={ep.params} origin="backend" />
        </>
      )}

      {ep.body && (
        <>
          <h4>{t('api.body')} · <a href={`#sc-${ep.body.schema}`}>{ep.body.schema}</a></h4>
          <JsonBlock value={ex(ep.body.example)} label={`${t('api.example')} · ${t('api.request')}`} />
        </>
      )}

      <h4>{t('api.response')}</h4>
      {ep.responses.map((r) => (
        <div className="resp" key={`${r.code}-${r.schema}`}>
          <p>
            <span className={`code c${String(r.code)[0]}`}>{r.code}</span>{' '}
            <a href={`#sc-${r.schema}`}>{r.schema}</a>
            {r.note && <span className="muted"> · {rich(r.note)}</span>}
          </p>
          {r.example && <JsonBlock value={ex(r.example)} label={`${t('api.example')} · ${r.code}`} />}
        </div>
      ))}

      {ep.errors.length > 0 && (
        <p className="ep-errors">
          <b>{t('api.errors_short')}:</b>{' '}
          {ep.errors.map((c) => <a key={c} href="#errors" className="tag">{c}</a>)}
        </p>
      )}
    </article>
  );
}

function SchemaCard({ s }: { s: Schema }) {
  return (
    <article className="schema" id={`sc-${s.name}`}>
      <h3><code>{s.name}</code> <OriginTag origin={s.origin} /></h3>
      <p className="muted">{rich(s.desc)}</p>
      <FieldTable fields={s.fields} origin={s.origin} />
    </article>
  );
}

export function ApiContractPage() {
  const { t } = useI18n();

  // A direct link to #ep-… opens before React renders, so the browser cannot scroll there by itself.
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);

  return (
    <div className="wrap contract">
      <header className="contract-head">
        <h1>{t('api.title')}</h1>
        <p className="lede">{t('api.lede')}</p>
        <div className="legend-tags">
          <span><span className="tag">backend.html</span> {t('api.legend_backend')}</span>
          {HAS_FE && <span><span className="tag fe">{t('api.fe_tag')}</span> {t('api.legend_fe')}</span>}
          <span className="muted">{t('api.count', { e: ENDPOINTS.length, s: SCHEMAS.length })}</span>
        </div>
      </header>

      <div className="contract-grid">
        <nav className="toc" aria-label={t('api.toc')}>
          <a href="#conventions">{t('api.conventions')}</a>
          <a href="#errors">{t('api.errors')}</a>
          <span className="toc-h">{t('api.endpoints')}</span>
          {ENDPOINTS.map((e) => (
            <a key={e.id} href={`#ep-${e.id}`} className="toc-ep">
              <span className={`m m-${e.method.toLowerCase()}`}>{e.method}</span><code>{e.path}</code>
            </a>
          ))}
          <span className="toc-h">{t('api.schemas')}</span>
          {SCHEMAS.map((s) => <a key={s.name} href={`#sc-${s.name}`} className="toc-sc"><code>{s.name}</code></a>)}
          <a href="#internal">{t('api.internal')}</a>
        </nav>

        <div className="contract-body">
          <section id="conventions" aria-labelledby="conv-h">
            <h2 id="conv-h">{t('api.conventions')}</h2>
            <div className="conv">
              {CONVENTIONS.map((c) => (
                <div key={c.title} className="conv-item">
                  <h3>{rich(c.title)}</h3>
                  <p>{rich(c.body)}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="errors" aria-labelledby="errors-h">
            <h2 id="errors-h">{t('api.errors')}</h2>
            <div className="table-wrap">
              <table className="fields">
                <thead><tr><th>{t('api.code')}</th><th>{t('api.http')}</th><th>{t('api.when')}</th></tr></thead>
                <tbody>
                  {ERRORS.map((e) => (
                    <tr key={e.code}><th scope="row"><code>{e.code}</code></th><td className="type">{e.http}</td><td>{rich(e.when)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="ep-h">
            <h2 id="ep-h">{t('api.endpoints')}</h2>
            {ENDPOINTS.map((e) => <EndpointCard key={e.id} ep={e} examples={STATIC_EXAMPLES} />)}
          </section>

          <section aria-labelledby="sc-h">
            <h2 id="sc-h">{t('api.schemas')}</h2>
            {SCHEMAS.map((s) => <SchemaCard key={s.name} s={s} />)}
          </section>

          <section id="internal" aria-labelledby="int-h">
            <h2 id="int-h">{t('api.internal')}</h2>
            <p className="muted">{t('api.internal_note')}</p>
            <ul className="internal">
              {INTERNAL.map((i) => (
                <li key={i.path}><span className="m m-post">{i.method}</span> <code>{i.path}</code> · {i.desc}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
