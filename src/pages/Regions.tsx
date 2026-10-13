import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { AnimatePresence } from 'motion/react';
import type { ProvinceCode, RegionSummary, Status } from '../types';
import { api } from '../api';
import { useI18n } from '../i18n';
import { useLoad } from '../lib/useLoad';
import { errorText } from '../lib/errors';
import { fmtNum, fmtSigned, fmtSlot } from '../lib/format';
import { useMediaQuery } from '../lib/useMediaQuery';
import { detectLite, loadLitePref } from '../lib/device';
import { ISLANDS, PROVINCES, REGION, provincesOf } from '../lib/provinces';
import { agreement } from '../lib/satellites';
import { RegionMapController } from '../map/regionMap';
import { StatusBadge, STATUS_KEY } from '../components/StatusBadge';
import { ValidationBadge } from '../components/VerificationCard';
import { Select } from '../components/Select';
import { Sheet } from '../components/Sheet';
import { StatusIcon } from '../components/icons';
import { LiteMotion, m, spring } from '../motion';
import '../regions.css';

type Filter = Status | 'NONE';
const FILTERS: Filter[] = ['ALERT', 'WARNING', 'NO_OBSERVABLE', 'SAFE', 'NONE'];
const RANK: Record<Filter, number> = { ALERT: 0, WARNING: 1, NO_OBSERVABLE: 2, SAFE: 3, NONE: 4 };
const REFRESH_MS = 10 * 60_000; // one satellite slot every 10 minutes; polling faster only costs reads

type Sort = 'severity' | 'delta_t' | 'verified';
const dt = (r: RegionSummary) => r.inputs?.delta_t_k ?? -Infinity;
const SORTS: Record<Sort, (a: RegionSummary, b: RegionSummary) => number> = {
  severity: (a, b) => RANK[a.status ?? 'NONE'] - RANK[b.status ?? 'NONE'] || dt(b) - dt(a),
  delta_t: (a, b) => dt(b) - dt(a),
  verified: (a, b) => (b.verification?.at ?? '').localeCompare(a.verification?.at ?? ''), // ISO UTC sorts as text
};

export function RegionsPage({ dark }: { dark: boolean }) {
  const { t } = useI18n();
  const mapEl = useRef<HTMLDivElement>(null);
  const ctl = useRef<RegionMapController | null>(null);
  const lite = useMemo(() => loadLitePref() ?? detectLite() != null, []);
  const [filters, setFilters] = useState<Filter[]>(FILTERS);
  const [province, setProvince] = useState<ProvinceCode | ''>('');
  const [sort, setSort] = useState<Sort>('severity');
  const [selected, setSelected] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(true);
  const isSheet = useMediaQuery('(max-width: 1023px)');

  const regions = useLoad(() => api.regions(), []);
  const agent = useLoad(() => api.agent().catch(() => null), []);
  const peat = useLoad(() => api.peatRegions(), []);
  const provinces = useLoad(() => api.provinces(), []);

  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible') { regions.reload(); agent.reload(); } }, REFRESH_MS);
    return () => clearInterval(id);
  }, [regions.reload, agent.reload]);

  // ---------- map ----------
  const onSelect = useRef<(id: string | null) => void>(() => {});
  onSelect.current = (id) => {
    setSelected(id);
    if (id) document.getElementById(`rg-${id}`)?.scrollIntoView({ block: 'nearest', behavior: lite ? 'auto' : 'smooth' });
    if (id && window.matchMedia('(max-width: 1023px)').matches) setSheetOpen(true);
  };
  useEffect(() => {
    const c = new RegionMapController(mapEl.current!, { dark, lite, onSelect: (id) => onSelect.current(id) });
    ctl.current = c;
    return () => { c.destroy(); ctl.current = null; };
    // created once; later changes go through the controller
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { ctl.current?.setTheme(dark); }, [dark]);
  useEffect(() => { if (regions.data) ctl.current?.setRegions(regions.data); }, [regions.data]);
  useEffect(() => { if (peat.data) ctl.current?.setPeat(peat.data); }, [peat.data]);
  useEffect(() => { if (provinces.data) ctl.current?.setProvinces(provinces.data); }, [provinces.data]);
  useEffect(() => { ctl.current?.setSelected(selected); }, [selected]);
  // FIRMS hotspots of the selected region's latest verification (evidence, not a periodic feed).
  useEffect(() => {
    if (!selected) { ctl.current?.setHotspots([]); return; }
    let alive = true;
    api.region(selected, 1).then(
      (d) => { if (alive) ctl.current?.setHotspots(d.verifications[0]?.evidence ?? []); },
      () => { if (alive) ctl.current?.setHotspots([]); },
    );
    return () => { alive = false; };
  }, [selected]);
  useEffect(() => { ctl.current?.fitBounds(province ? PROVINCES[province].bounds : REGION, 8); }, [province]);
  useEffect(() => { const id = setTimeout(() => ctl.current?.resize(), 220); return () => clearTimeout(id); }, [sheetOpen]);

  // ---------- derived ----------
  const all = regions.data ?? [];
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { ALERT: 0, WARNING: 0, NO_OBSERVABLE: 0, SAFE: 0, NONE: 0 };
    for (const r of all) c[r.status ?? 'NONE'] += 1;
    return c;
  }, [all]);
  const latestSlot = useMemo(() => all.reduce<string | null>((a, r) => (r.observed_at && (!a || r.observed_at > a) ? r.observed_at : a), null), [all]);
  const visible = useMemo(
    () => all.filter((r) => filters.includes(r.status ?? 'NONE') && (!province || r.province === province)).sort(SORTS[sort]),
    [all, filters, province, sort],
  );
  const toggle = (f: Filter) => setFilters((c) => (c.includes(f) ? c.filter((x) => x !== f) : [...c, f]));
  const viewTag = (r: RegionSummary) => {
    const a = agreement(r.flags);
    return a && r.night != null ? `${t(`view.${a.key}`, a.sat ? { sat: a.sat } : undefined)} · ${t(r.night ? 'rgt.night' : 'rgt.day')}` : null;
  };

  const focus = (r: RegionSummary) => {
    setSelected(r.id);
    const [w, s, e, n] = r.bounds;
    ctl.current?.fitBounds([[w, s], [e, n]], 9);
    if (window.matchMedia('(max-width: 1023px)').matches) setSheetOpen(false);
  };

  return (
    <LiteMotion lite={lite}>
      <div className={`map-page ${sheetOpen ? 'sheet-open' : ''} ${lite ? 'is-lite' : ''}`}>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen} enabled={isSheet} label={t('rg.panel')}>
          <div className="rg-head">
            <h1 className="rg-title">{t('rg.title')}</h1>
            <p className="muted small">{t('rg.lede')}</p>
            <p className="small">
              {latestSlot ? t('rg.latest_slot', { when: fmtSlot(latestSlot) }) : t('rg.no_slot')}
              {agent.data && <> · {agent.data.configured ? t('agent.quota', { left: agent.data.remaining, total: agent.data.daily_quota }) : t('agent.off')}</>}
            </p>
          </div>

          <div className="filters">
            <div className="chips" role="group" aria-label={t('map.filter_status')}>
              {FILTERS.map((f) => (
                <button key={f} className={`chip st-${f.toLowerCase()}`} aria-pressed={filters.includes(f)} onClick={() => toggle(f)}>
                  {f !== 'NONE' && <StatusIcon status={f} size={12} />}{f === 'NONE' ? t('rg.unprocessed') : t(STATUS_KEY[f])}
                  <span className="mono rg-count">{counts[f]}</span>
                </button>
              ))}
            </div>
            <div className="select">
              <span className="lbl" id="rg-prov-lbl">{t('map.filter_province')}</span>
              <Select
                labelledBy="rg-prov-lbl" value={province} onChange={(v) => setProvince(v as ProvinceCode | '')}
                items={[
                  { value: '', label: t('map.all_provinces') },
                  ...ISLANDS.map((isl) => ({ label: t(`island.${isl}`), options: provincesOf(isl).map((p) => ({ value: p, label: t(`prov.${p}`) })) })),
                ]}
              />
            </div>
          </div>

          <div className="list-head">
            <b>{t('rg.count', { n: visible.length, total: all.length })}</b>
            <Select
              size="sm" align="end" label={t('map.sort_label')} value={sort} onChange={(v) => setSort(v as Sort)}
              items={[
                { value: 'severity', label: t('rg.sort_severity') },
                { value: 'delta_t', label: t('rg.sort_dt') },
                { value: 'verified', label: t('rg.sort_verified') },
              ]}
            />
          </div>

          {regions.error && (
            <div className="error" role="alert">
              {t('load_error', { msg: errorText(regions.error, t) })}{' '}
              <button className="link-btn" onClick={regions.reload}>{t('retry')}</button>
            </div>
          )}

          {!regions.data && !regions.error ? (
            <div className="queue">{[0, 1, 2].map((i) => <div key={i} className="skel" style={{ height: 96 }} />)}</div>
          ) : visible.length === 0 && !regions.error ? (
            <p className="empty">{t('rg.empty')}</p>
          ) : (
            <ul className="queue">
              <AnimatePresence mode="popLayout">
                {visible.map((r, i) => (
                  <m.li
                    key={r.id} id={`rg-${r.id}`} layout="position"
                    className={`queue-item rg-item rg-${(r.status ?? 'none').toLowerCase()} ${selected === r.id ? 'on' : ''}`}
                    initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0, transition: { ...spring, delay: Math.min(i, 8) * 0.03 } }}
                    exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.14 } }} transition={spring}
                  >
                    <button className="qi-main" onClick={() => focus(r)} aria-pressed={selected === r.id}>
                      <span className="qi-top">
                        <b className="qi-id">{r.id}</b>
                        {r.status ? <StatusBadge status={r.status} /> : <span className="pill grey">{t('rg.unprocessed')}</span>}
                      </span>
                      <span className="qi-row muted">{t(`prov.${r.province}`)} · {t('rg.peat', { km2: fmtNum(r.peat_km2, 0) })}</span>
                      {r.inputs && (
                        <span className="qi-row mono small">
                          ΔT {r.inputs.delta_t_k != null ? `${fmtSigned(r.inputs.delta_t_k, 1)} K` : '–'} · RH{' '}
                          {r.inputs.relative_humidity_pct != null ? `${fmtNum(r.inputs.relative_humidity_pct, 0)}%` : '–'} · {t('rgt.cloud')}{' '}
                          {r.inputs.cloud_cover_pct != null ? `${fmtNum(r.inputs.cloud_cover_pct, 0)}%` : '–'}
                        </span>
                      )}
                      {viewTag(r) && <span className="qi-row muted rg-view">{viewTag(r)}</span>}
                      {r.verification && (
                        <span className="qi-row small">
                          <ValidationBadge status={r.verification.validation_status} />
                          <span className="muted">{fmtSlot(r.verification.at)}</span>
                        </span>
                      )}
                    </button>
                    <Link className="qi-link" to={`/regions/${r.id}`}>{t('map.open_detail')}</Link>
                  </m.li>
                ))}
              </AnimatePresence>
            </ul>
          )}

          <details className="legend">
            <summary>{t('map.legend')}</summary>
            <ul>
              {(['ALERT', 'WARNING', 'NO_OBSERVABLE', 'SAFE'] as Status[]).map((s) => <li key={s}><StatusBadge status={s} /> {t(`rg.legend.${s}`)}</li>)}
              <li><i className="lg-line thin" />{t('rg.legend.cell')}</li>
              <li><i className="lg-dot" />{t('rg.legend.hotspot')}</li>
            </ul>
            <p className="muted small">{t('rg.sources')}</p>
          </details>
          <p className="muted small"><Link to="/pixels">{t('rg.pixels_link')}</Link></p>
        </Sheet>

        <div className="map-wrap">
          <div ref={mapEl} className="map" role="region" aria-label={t('rg.map_aria')} />
        </div>
      </div>
    </LiteMotion>
  );
}
