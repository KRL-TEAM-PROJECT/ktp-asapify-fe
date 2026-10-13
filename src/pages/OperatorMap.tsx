import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { AnimatePresence, LayoutGroup } from 'motion/react';
import type { ClusterSummary, ProvinceBoundary, ProvinceCode, Status, StatusCode } from '../types';
import { api } from '../api';
import { useI18n } from '../i18n';
import { useLoad } from '../lib/useLoad';
import { errorText } from '../lib/errors';
import { fmtNight, fmtNum, fmtSlot } from '../lib/format';
import { load, save } from '../lib/storage';
import { useMediaQuery } from '../lib/useMediaQuery';
import { detectLite, loadLitePref, saveLitePref } from '../lib/device';
import { ISLANDS, PROVINCES, REGION, provincesOf } from '../lib/provinces';
import {
  NIGHT_SLOTS, STATUS_CODE, cellAt, cellByPixelId, cellCenter, decodeUtility, nightOf, nightStart, slotIndex, utilityAt,
} from '../lib/grid';
import { MapController, type LayerKey } from '../map/map';
import { StatusBadge, STATUS_KEY } from '../components/StatusBadge';
import { EvidenceBadge } from '../components/EvidenceBadge';
import { DataBanner } from '../components/DataBanner';
import { DecisionState } from '../components/DecisionPanel';
import { SlotPlayer } from '../components/SlotPlayer';
import { PixelInspector } from '../components/PixelInspector';
import { LayerControl } from '../components/LayerControl';
import { Select } from '../components/Select';
import { Sheet } from '../components/Sheet';
import { LiteMotion, m, spring } from '../motion';
import { StatusIcon } from '../components/icons';

const ALL: Status[] = ['ALERT', 'WARNING', 'NO_OBSERVABLE', 'SAFE'];
const COORD = /^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/;

type Sort = 'utility' | 'newest' | 'oldest';
const SORTS: Record<Sort, (a: ClusterSummary, b: ClusterSummary) => number> = {
  utility: (a, b) => b.utility_score - a.utility_score,
  newest: (a, b) => b.trigger_slot.localeCompare(a.trigger_slot), // ISO UTC: lexical order = time order
  oldest: (a, b) => a.trigger_slot.localeCompare(b.trigger_slot),
};

/** Index of the last slot that already has a status. */
function lastFilled(status: (string | null)[]): number {
  let i = status.length - 1;
  while (i >= 0 && status[i] == null) i--;
  return i;
}

export function OperatorMapPage({ dark }: { dark: boolean }) {
  const { t } = useI18n();
  const mapEl = useRef<HTMLDivElement>(null);
  const ctl = useRef<MapController | null>(null);

  // ---------- lite mode + display preferences ----------
  const liteReason = useMemo(detectLite, []);
  const [litePref, setLitePref] = useState<boolean | null>(loadLitePref);
  const lite = litePref ?? liteReason != null;
  const [basemap, setBasemap] = useState<string>(() => load('asapify.basemap.v2') ?? (lite ? 'plain' : 'streets'));
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    status: true, clusters: true, peat: true, provinces: !lite, viirs: true,
  });

  // ---------- filters + selection ----------
  const [statuses, setStatuses] = useState<Status[]>(ALL);
  const [province, setProvince] = useState<ProvinceCode | ''>('');
  const [sort, setSort] = useState<Sort>('utility');
  const [nightSel, setNightSel] = useState<string | null>(null); // null = latest replay night
  const [selected, setSelected] = useState<string | null>(null);
  const [cell, setCell] = useState(-1);
  const [slot, setSlot] = useState<number | null>(null); // null = last slot of the open night
  const [playing, setPlaying] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(true);
  const isSheet = useMediaQuery('(max-width: 1023px)'); // the panel becomes a bottom sheet
  const [query, setQuery] = useState('');
  const [searchMsg, setSearchMsg] = useState<string | null>(null);

  // ---------- data ----------
  const base = useLoad(() => Promise.all([api.meta(), api.pixels(), api.gridCompact(), api.basemaps()]), []);
  const [meta, index, compact, basemaps] = base.data ?? [];
  const currentNight = meta ? nightOf(meta.last_slot) : null;
  const isCurrent = nightSel == null;
  const viewNight = nightSel ?? currentNight;
  const night = useLoad(() => (viewNight ? api.night(viewNight) : Promise.resolve(null)), [viewNight]);
  const nightData = night.data?.night === viewNight ? night.data : null; // ignore the previous night's data while loading
  // Latest night: active clusters. Archive night: clusters at ALERT that night, whatever their state.
  const clustersQ = useLoad(() => (meta ? api.clusters(nightSel ?? undefined) : Promise.resolve(null)), [meta, nightSel]);
  const clusters = clustersQ.loading ? null : (clustersQ.data ?? null);
  const peat = useLoad(() => api.peatBoundary(), []);
  // Province outlines load when their layer is on OR a province is selected (for the highlight outline).
  const provRef = useRef<Promise<ProvinceBoundary> | null>(null);
  const needProv = layers.provinces || province !== '';
  const provinces = useLoad(
    () => (needProv ? (provRef.current ??= api.provinces().catch((e) => { provRef.current = null; throw e; })) : Promise.resolve(null)),
    [needProv],
  );

  const latest = meta ? slotIndex(meta.last_slot, nightStart(meta.last_slot)) : 0;
  const last = isCurrent ? latest : nightData ? lastFilled(nightData.status) : NIGHT_SLOTS - 1;
  // An archive night without a single slot of data: every pixel is shown as "not observed".
  const noData = !isCurrent && nightData != null && last < 0;
  const allUnobserved = useMemo(() => (index ? 'N'.repeat(index.rows.length) : null), [index]);
  const cur = slot ?? Math.max(0, last);
  const atLast = cur === last;
  const statusStr = noData
    ? allUnobserved
    : isCurrent && atLast ? (compact?.status ?? null) : (nightData?.status[cur] ?? null);
  const clusterCells = isCurrent ? compact?.clusters : nightData?.clusters;
  const utility = useMemo(() => (compact ? decodeUtility(compact.utility) : null), [compact]);
  const clusterOfCell = useMemo(() => {
    const m = new Map<number, string>();
    for (const [id, cells] of Object.entries(clusterCells ?? {})) for (const i of cells) m.set(i, id);
    return m;
  }, [clusterCells]);

  // ---------- map ----------
  const onCell = useRef<(i: number) => void>(() => {});
  onCell.current = (i) => {
    if (i < 0 || !statusStr) { setCell(-1); return; }
    const code = statusStr[i] as StatusCode;
    if (!statuses.some((s) => STATUS_CODE[s] === code)) return; // that status is hidden
    setCell(i);
    const id = clusterOfCell.get(i);
    if (id) setSelected(id);
    if (window.matchMedia('(max-width: 1023px)').matches) setSheetOpen(false);
  };

  useEffect(() => {
    const c = new MapController(mapEl.current!, {
      dark, lite, basemap, basemaps: [], onCell: (i) => onCell.current(i),
    });
    ctl.current = c;
    return () => { c.destroy(); ctl.current = null; };
    // the map is created once; other changes go through controller methods
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { ctl.current?.setBasemap(basemap, dark, basemaps ?? []); save('asapify.basemap.v2', basemap); }, [basemap, dark, basemaps]);
  useEffect(() => { ctl.current?.setLite(lite); }, [lite]);
  useEffect(() => { if (index) ctl.current?.setData({ index }); }, [index]);
  useEffect(() => { ctl.current?.setData({ clusters: clusterCells ?? {} }); }, [clusterCells]);
  useEffect(() => { if (peat.data) ctl.current?.setData({ peat: peat.data }); }, [peat.data]);
  useEffect(() => { if (provinces.data) ctl.current?.setData({ provinces: provinces.data }); }, [provinces.data]);
  useEffect(() => { ctl.current?.setStatus(statusStr); }, [statusStr]);
  useEffect(() => { ctl.current?.setStatusFilter(statuses); }, [statuses]);
  useEffect(() => { ctl.current?.setSelectedCell(cell); }, [cell]);
  useEffect(() => {
    for (const [k, on] of Object.entries(layers) as [LayerKey, boolean][]) ctl.current?.setLayer(k, on);
  }, [layers]);
  useEffect(() => {
    ctl.current?.setProvince(province);
    ctl.current?.fitBounds(province ? PROVINCES[province].bounds : REGION);
  }, [province]);

  // VIIRS points only for the selected cluster (verification evidence, not periodic ingest).
  useEffect(() => {
    ctl.current?.setSelectedCluster(selected);
    if (!selected) { ctl.current?.setData({ viirs: [] }); return; }
    let alive = true;
    api.cluster(selected).then(
      (d) => { if (alive) ctl.current?.setData({ viirs: d.verification?.viirs ?? [] }); },
      () => { if (alive) ctl.current?.setData({ viirs: [] }); },
    );
    return () => { alive = false; };
  }, [selected]);

  // Player: advance one slot per tick until the night's last slot, then stop.
  const curRef = useRef(cur);
  curRef.current = cur;
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const next = curRef.current + 1;
      if (next >= last) { setPlaying(false); setSlot(null); } else setSlot(next);
    }, lite ? 900 : 550);
    return () => clearInterval(id);
  }, [playing, last, lite]);

  // Panel switched between wide/narrow → resize the canvas.
  useEffect(() => { const id = setTimeout(() => ctl.current?.resize(), 220); return () => clearTimeout(id); }, [sheetOpen]);

  // ---------- derived values for the UI ----------
  const visible = useMemo(
    () => (clusters ?? []).filter((c) => !province || c.province === province).sort(SORTS[sort]),
    [clusters, province, sort],
  );
  const cloudy = useMemo(() => {
    if (!statusStr) return false;
    return (statusStr.split('N').length - 1) / statusStr.length > 0.5;
  }, [statusStr]);
  const history = useMemo(
    () => (cell >= 0 ? (nightData?.status ?? []).map((s) => (s ? (s[cell] as StatusCode) : null)) : []),
    [nightData, cell],
  );

  const toggle = (s: Status) => setStatuses((c) => (c.includes(s) ? c.filter((x) => x !== s) : [...c, s]));

  const select = (id: string, center: [number, number]) => {
    setSelected(id);
    setCell(-1);
    ctl.current?.flyTo(center);
    if (window.matchMedia('(max-width: 1023px)').matches) setSheetOpen(false);
  };

  const focusCell = (i: number) => {
    if (!index) return;
    setCell(i);
    ctl.current?.flyTo(cellCenter(index, i), 12);
    const id = clusterOfCell.get(i);
    if (id) setSelected(id);
    if (window.matchMedia('(max-width: 1023px)').matches) setSheetOpen(false);
  };

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    setSearchMsg(null);
    if (!q) return;
    const c = clusters?.find((x) => x.id.toLowerCase() === q.toLowerCase());
    if (c) { select(c.id, c.centroid); return; }
    if (index) {
      const byId = cellByPixelId(index, q);
      if (byId >= 0) { focusCell(byId); return; }
      const m = COORD.exec(q);
      if (m) {
        let a = Number(m[1]), b = Number(m[2]);
        if (Math.abs(a) > Math.abs(b)) [a, b] = [b, a]; // accept both "lat, lon" and "lon, lat"
        const [lat, lon] = [a, b];
        const [[w, s], [e2, n]] = REGION;
        if (lon < w || lon > e2 || lat < s || lat > n) { setCell(-1); setSearchMsg(t('search.outside')); return; }
        const i = cellAt(index, lon, lat);
        if (i >= 0) focusCell(i);
        else { setCell(-1); ctl.current?.flyTo([lon, lat], 11); setSearchMsg(t('search.not_peat')); }
        return;
      }
    }
    setCell(-1);
    setSearchMsg(t('search.none'));
  };

  const onPlay = (p: boolean) => {
    if (p && atLast) setSlot(0);
    setPlaying(p);
  };

  const goNight = (n: string | null) => {
    setPlaying(false);
    setSlot(null);
    setCell(-1);
    setSelected(null);
    setNightSel(n == null || n === currentNight ? null : n);
  };

  const setLite = (on: boolean) => {
    const pref = on === (liteReason != null) ? null : on; // back to automatic when it equals the detection
    setLitePref(pref);
    saveLitePref(pref);
  };

  const loadError = base.error ?? clustersQ.error;

  return (
    <LiteMotion lite={lite}>
      <div className={`map-page ${sheetOpen ? 'sheet-open' : ''} ${lite ? 'is-lite' : ''}`}>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen} enabled={isSheet} label={t('map.panel')}>
          {meta ? <DataBanner meta={meta} cloudy={cloudy && !noData} archive={isCurrent ? null : viewNight} noData={noData} /> : <div className="skel" style={{ height: 30 }} />}

          <form className="search" onSubmit={onSearch} role="search">
            <label htmlFor="map-q" className="lbl">{t('search.label')}</label>
            <div className="search-row">
              <input
                id="map-q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('search.placeholder')}
                autoComplete="off" spellCheck={false} enterKeyHint="search"
              />
              <button className="btn" type="submit">{t('search.go')}</button>
            </div>
            {searchMsg && <p className="search-msg" role="status">{searchMsg}</p>}
          </form>

          <div className="filters">
            <div className="chips" role="group" aria-label={t('map.filter_status')}>
              {ALL.map((s) => (
                <button key={s} className={`chip st-${s.toLowerCase()}`} aria-pressed={statuses.includes(s)} onClick={() => toggle(s)}>
                  <StatusIcon status={s} size={12} />{t(STATUS_KEY[s])}
                </button>
              ))}
            </div>
            <div className="select">
              <span className="lbl" id="prov-lbl">{t('map.filter_province')}</span>
              <Select
                labelledBy="prov-lbl" value={province} onChange={(v) => setProvince(v as ProvinceCode | '')}
                items={[
                  { value: '', label: t('map.all_provinces') },
                  ...ISLANDS.map((isl) => ({
                    label: t(`island.${isl}`),
                    options: provincesOf(isl).map((p) => ({ value: p, label: t(`prov.${p}`) })),
                  })),
                ]}
              />
            </div>
          </div>

          <div className="list-head">
            <b>{t('map.clusters_title', { n: visible.length })}</b>
            <Select
              size="sm" align="end" label={t('map.sort_label')} value={sort} onChange={(v) => setSort(v as Sort)}
              items={[
                { value: 'utility', label: t('map.sort_utility') },
                { value: 'newest', label: t('map.sort_newest') },
                { value: 'oldest', label: t('map.sort_oldest') },
              ]}
            />
          </div>

          {loadError && (
            <div className="error" role="alert">
              {t('load_error', { msg: errorText(loadError, t) })}{' '}
              <button className="link-btn" onClick={() => { base.reload(); clustersQ.reload(); }}>{t('retry')}</button>
            </div>
          )}

          {!clusters && !loadError ? (
            <div className="queue">{[0, 1, 2].map((i) => <div key={i} className="skel" style={{ height: 92 }} />)}</div>
          ) : visible.length === 0 && !loadError ? (
            <p className="empty">{isCurrent ? t('map.empty') : t('map.empty_night', { date: fmtNight(viewNight!) })}</p>
          ) : (
            <ul className="queue">
              {/* Order/filter changed → cards slide to their new place; new cards stagger in, removed ones shrink away. */}
              <AnimatePresence mode="popLayout">
                {visible.map((c, i) => (
                  <m.li
                    key={c.id} layout="position" className={`queue-item ${selected === c.id ? 'on' : ''} ${c.decision ? 'is-decided' : ''}`}
                    initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0, transition: { ...spring, delay: Math.min(i, 8) * 0.04 } }}
                    exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.14 } }} transition={spring}
                  >
                    <button className="qi-main" onClick={() => select(c.id, c.centroid)} aria-pressed={selected === c.id}>
                      <span className="qi-top">
                        <b className="qi-id">{c.id}</b>
                        <span className="qi-u" aria-label={`${t('map.utility')} ${fmtNum(c.utility_score, 2)}`}>
                          <small>U</small>{fmtNum(c.utility_score, 2)}
                          <i style={{ ['--u' as string]: c.utility_score }} />
                        </span>
                      </span>
                      <span className="qi-row muted">
                        {t(`prov.${c.province}`)} · {t('map.pixels', { n: c.pixels.length })} · {t('map.nbr', { k: Math.round(c.neighbour_support * 8) })}
                      </span>
                      <span className="qi-row muted">{t('map.triggered', { when: fmtSlot(c.trigger_slot) })}</span>
                      <span className="qi-row"><EvidenceBadge result={c.verification?.result ?? null} /><DecisionState decision={c.decision} /></span>
                    </button>
                    <Link className="qi-link" to={`/clusters/${c.id}`}>{t('map.open_detail')}</Link>
                  </m.li>
                ))}
              </AnimatePresence>
            </ul>
          )}

          <details className="legend">
            <summary>{t('map.legend')}</summary>
            <ul>
              {ALL.map((s) => <li key={s}><StatusBadge status={s} /></li>)}
              <li><i className="lg-line dash" />{t('map.peat')}</li>
              <li><i className="lg-line thin" />{t('lc.layer_provinces')}</li>
              <li><i className="lg-line focus" />{t('map.province_focus')}</li>
              <li><i className="lg-line thick" />{t('map.cluster')}</li>
              <li><i className="lg-dot" />{t('map.viirs')}</li>
            </ul>
            <p className="muted small">{t('alert.note')}</p>
          </details>
        </Sheet>

        <div className="map-wrap">
          <div ref={mapEl} className="map" role="region" aria-label={t('map.aria')} />
          <LayoutGroup>
            <div className="map-overlay top-left">
              <LayerControl
                basemap={basemap} basemaps={basemaps ?? []} layers={layers} lite={lite} liteReason={liteReason}
                liteAuto={litePref == null} onBasemap={setBasemap}
                onLayer={(k, on) => setLayers((l) => ({ ...l, [k]: on }))} onLite={setLite}
              />
              <AnimatePresence>
                {index && cell >= 0 && statusStr && (
                  <PixelInspector
                    key="inspector"
                    index={index} cell={cell}
                    status={statusStr[cell] as StatusCode}
                    latestStatus={isCurrent ? ((compact?.status[cell] as StatusCode) ?? null) : null}
                    utility={isCurrent ? utilityAt(utility, cell) : undefined}
                    nSat={isCurrent && atLast ? (compact?.n_sat ?? null) : (nightData?.n_sat[cur] ?? null)}
                    clusterId={clusterOfCell.get(cell) ?? null} history={history} slot={cur} isLatest={atLast}
                    night={isCurrent ? null : viewNight}
                    onClose={() => setCell(-1)}
                  />
                )}
              </AnimatePresence>
            </div>
          </LayoutGroup>
          {meta && viewNight && (
            <div className="map-overlay bottom">
              <SlotPlayer
                meta={meta} nightKey={viewNight} night={nightData} isCurrent={isCurrent}
                slot={cur} last={last} playing={playing}
                onSlot={(i) => { setPlaying(false); setSlot(i === last ? null : i); }} onPlay={onPlay}
                onNight={goNight}
              />
            </div>
          )}
        </div>
      </div>
    </LiteMotion>
  );
}
