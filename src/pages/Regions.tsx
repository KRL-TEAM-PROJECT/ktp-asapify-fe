import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { AnimatePresence } from 'motion/react';
import { ApiError, type ProvinceCode, type RegionSummary, type Status } from '../types';
import { api } from '../api';
import { useI18n } from '../i18n';
import { useLoad } from '../lib/useLoad';
import { errorText } from '../lib/errors';
import { fmtDay, fmtNum, fmtSigned, fmtSlot } from '../lib/format';
import { useStaleAge } from '../lib/stale';
import { useMediaQuery } from '../lib/useMediaQuery';
import { detectLite, loadLitePref } from '../lib/device';
import { ISLANDS, PROVINCES, REGION, provincesOf } from '../lib/provinces';
import { agreement } from '../lib/satellites';
import { bySlot, dayOf, lastSlot, regionsAt, slotTime } from '../lib/days';
import { RegionMapController } from '../map/regionMap';
import { StatusBadge, STATUS_KEY } from '../components/StatusBadge';
import { ValidationBadge } from '../components/VerificationCard';
import { Select } from '../components/Select';
import { Sheet } from '../components/Sheet';
import { DayPlayer } from '../components/DayPlayer';
import { StatusIcon } from '../components/icons';
import { LiteMotion, m, spring } from '../motion';
import '../regions.css';
import '../player.css';

type Filter = Status | 'NONE';
const FILTERS: Filter[] = ['ALERT', 'WARNING', 'NO_OBSERVABLE', 'SAFE', 'NONE'];
const RANK: Record<Filter, number> = { ALERT: 0, WARNING: 1, NO_OBSERVABLE: 2, SAFE: 3, NONE: 4 };
const REFRESH_MS = 15 * 60_000; // the engine rates one satellite slot every 15 minutes; polling faster only costs reads

type Sort = 'severity' | 'delta_t' | 'verified';
const dt = (r: RegionSummary) => r.inputs?.delta_t_k ?? -Infinity;
const SORTS: Record<Sort, (a: RegionSummary, b: RegionSummary) => number> = {
  severity: (a, b) => RANK[a.status ?? 'NONE'] - RANK[b.status ?? 'NONE'] || dt(b) - dt(a),
  delta_t: (a, b) => dt(b) - dt(a),
  verified: (a, b) => (b.verification?.at ?? '').localeCompare(a.verification?.at ?? ''), // ISO UTC sorts as text
};

// A day nothing was archived on (404) is an empty day, not an error.
const orNone = <T,>(p: Promise<T>) => p.catch((e) => { if (e instanceof ApiError && e.status === 404) return null; throw e; });

export function RegionsPage({ dark }: { dark: boolean }) {
  const { t } = useI18n();
  const mapEl = useRef<HTMLDivElement>(null);
  const ctl = useRef<RegionMapController | null>(null);
  const lite = useMemo(() => loadLitePref() ?? detectLite() != null, []);
  const [filters, setFilters] = useState<Filter[]>(FILTERS);
  const [province, setProvince] = useState<ProvinceCode | ''>('');
  const [sort, setSort] = useState<Sort>('severity');
  const [selected, setSelected] = useState<string | null>(null);
  // phones open on the map (mobile first: where is it hot?); the list is one tap or drag away
  const [sheetOpen, setSheetOpen] = useState(() => !window.matchMedia('(max-width: 1023px)').matches);
  const [peekPx, setPeekPx] = useState(64);
  const isSheet = useMediaQuery('(max-width: 1023px)');
  const [daySel, setDaySel] = useState<string | null>(null); // null = the day of the latest slot
  const [slotSel, setSlotSel] = useState<number | null>(null); // null = the last archived slot of the open day
  const [playing, setPlaying] = useState(false);

  const regions = useLoad(() => api.regions(), []);
  const agent = useLoad(() => api.agent().catch(() => null), []);
  const peat = useLoad(() => api.peatRegions(), []);
  const provinces = useLoad(() => api.provinces(), []);

  // ---------- day archive: the date picker and the slot player ----------
  const all = regions.data ?? [];
  const latestSlot = useMemo(() => all.reduce<string | null>((a, r) => (r.observed_at && (!a || r.observed_at > a) ? r.observed_at : a), null), [all]);
  const stale = useStaleAge(latestSlot);
  const liveDay = latestSlot ? dayOf(latestSlot) : null;
  const live = daySel == null;
  const viewDay = daySel ?? liveDay;
  const index = useLoad(() => (liveDay ? api.days(liveDay.slice(0, 7)).catch(() => null) : Promise.resolve(null)), [liveDay]);
  const archive = useLoad(() => (viewDay ? orNone(api.day(viewDay)) : Promise.resolve(null)), [viewDay]);
  const day = archive.data?.date === viewDay ? archive.data : null; // ignore the previous day's data while loading
  const slots = useMemo(() => bySlot(day), [day]);
  const last = lastSlot(slots);
  const cur = slotSel ?? last;
  const atLatest = live && cur === last; // the map shows the API's current state, plus the last slot's pixels
  const shownSlot = cur >= 0 ? slots[cur] : null;

  // Poll while the tab is visible; coming back to a tab that missed a poll refreshes at once, so a page left in the
  // background does not show "Not current" for up to a whole interval.
  const polled = useRef(Date.now());
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      polled.current = Date.now();
      regions.reload(); agent.reload();
      if (live) archive.reload();
    };
    const id = setInterval(refresh, REFRESH_MS);
    const onShow = () => { if (Date.now() - polled.current >= REFRESH_MS) refresh(); };
    document.addEventListener('visibilitychange', onShow);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onShow); };
  }, [regions.reload, agent.reload, archive.reload, live]);

  // Statuses and ΔT of the open slot; the live list keeps everything the API sends.
  const shown = useMemo<RegionSummary[]>(() => {
    if (atLatest) return all;
    const at = day && shownSlot ? regionsAt(day, shownSlot) : null;
    return all.map((r) => {
      const x = at?.get(r.id);
      const view = shownSlot?.hot[r.id]?.view;
      return {
        ...r, status: x?.status ?? null, verification: null, quality: null, reason: null, night: null,
        flags: view ? [view] : null,
        inputs: x ? { delta_t_k: x.delta_t, cloud_cover_pct: null, relative_humidity_pct: null, hot_lat: null, hot_lon: null } : null,
      };
    });
  }, [all, atLatest, day, shownSlot]);

  // Player: advance to the next archived slot per tick until the day's last one, then stop.
  const curRef = useRef(cur);
  curRef.current = cur;
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      let next = curRef.current + 1;
      while (next < last && !slots[next]) next++;
      if (next >= last) { setPlaying(false); setSlotSel(null); } else setSlotSel(next);
    }, lite ? 900 : 550);
    return () => clearInterval(id);
  }, [playing, last, slots, lite]);

  const onPlay = (p: boolean) => {
    if (p && cur >= last) setSlotSel(slots.findIndex(Boolean));
    setPlaying(p);
  };
  // The engine rates a slot every 15 minutes, so about one scan slot in three is empty: the slider and the arrow keys
  // land on the nearest archived slot in the direction of travel (the other way when there is none).
  const onSlot = (i: number) => {
    setPlaying(false);
    const step = i >= cur ? 1 : -1;
    const seek = (dir: number) => { let j = i; while (j >= 0 && j <= last && !slots[j]) j += dir; return j >= 0 && j <= last ? j : -1; };
    const j = seek(step) >= 0 ? seek(step) : seek(-step);
    if (j >= 0) setSlotSel(j === last ? null : j);
  };
  const goDay = (d: string | null) => {
    setPlaying(false);
    setSlotSel(null);
    setDaySel(d == null || d === liveDay ? null : d);
  };

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
  useEffect(() => { if (regions.data) ctl.current?.setRegions(shown); }, [regions.data, shown]);
  useEffect(() => { ctl.current?.setPixels(shownSlot?.hot ?? {}); }, [shownSlot]);
  useEffect(() => { if (peat.data) ctl.current?.setPeat(peat.data); }, [peat.data]);
  useEffect(() => { if (provinces.data) ctl.current?.setProvinces(provinces.data); }, [provinces.data]);
  useEffect(() => { ctl.current?.setSelected(selected); }, [selected]);
  useEffect(() => { ctl.current?.fitBounds(province ? PROVINCES[province].bounds : REGION, 8); }, [province]);
  useEffect(() => { const id = setTimeout(() => ctl.current?.resize(), 220); return () => clearTimeout(id); }, [sheetOpen]);

  // ---------- derived ----------
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { ALERT: 0, WARNING: 0, NO_OBSERVABLE: 0, SAFE: 0, NONE: 0 };
    for (const r of shown) c[r.status ?? 'NONE'] += 1;
    return c;
  }, [shown]);
  const visible = useMemo(
    () => shown.filter((r) => filters.includes(r.status ?? 'NONE') && (!province || r.province === province)).sort(SORTS[sort]),
    [shown, filters, province, sort],
  );
  const toggle = (f: Filter) => setFilters((c) => (c.includes(f) ? c.filter((x) => x !== f) : [...c, f]));
  const viewTag = (r: RegionSummary) => {
    const a = agreement(r.flags);
    if (!a) return null;
    const view = t(`view.${a.key}`, a.sat ? { sat: a.sat } : undefined);
    return r.night != null ? `${view} · ${t(r.night ? 'rgt.night' : 'rgt.day')}` : view;
  };
  const detail = (id: string) => (atLatest || !viewDay ? `/regions/${id}` : `/regions/${id}?date=${viewDay}`);

  const focus = (r: RegionSummary) => {
    setSelected(r.id);
    const [w, s, e, n] = r.bounds;
    ctl.current?.fitBounds([[w, s], [e, n]], 9);
    if (window.matchMedia('(max-width: 1023px)').matches) setSheetOpen(false);
  };

  return (
    <LiteMotion lite={lite}>
      <div className={`map-page ${sheetOpen ? 'sheet-open' : ''} ${lite ? 'is-lite' : ''}`} style={{ ['--peek' as string]: `${peekPx}px` }}>
        <Sheet
          open={sheetOpen} onOpenChange={setSheetOpen} enabled={isSheet} label={t('rg.panel')} onPeekHeight={setPeekPx}
          peek={<>
            <span className="sw alert">{t('rg.peek_alert', { n: counts.ALERT })}</span>
            <span className="sw warning">{t('rg.peek_warning', { n: counts.WARNING })}</span>
            {(atLatest ? latestSlot : shownSlot?.at) && <span className="when">{fmtSlot((atLatest ? latestSlot : shownSlot?.at)!)}</span>}
            {stale && <span className="sw stale">{t('rg.stale_short')}</span>}
          </>}
        >
          <div className="rg-head">
            <h1 className="rg-title">{t('rg.title')}</h1>
            <p className="muted small">{t('rg.lede')}</p>
            <p className="small">
              {latestSlot ? t('rg.latest_slot', { when: fmtSlot(latestSlot) }) : t('rg.no_slot')}
              {agent.data && <> · {agent.data.configured ? t('agent.quota', { left: agent.data.remaining, total: agent.data.daily_quota }) : t('agent.off')}</>}
            </p>
            {stale && <p className="error small" role="status">{t('rg.stale', { age: stale })}</p>}
            {!atLatest && viewDay && (
              <p className="rg-archive small" role="status">
                {t('rg.archive', { date: fmtDay(viewDay), time: cur >= 0 ? slotTime(cur) : '–' })}{' '}
                <button className="link-btn" onClick={() => goDay(null)}>{t('rg.to_latest')}</button>
              </p>
            )}
            {shownSlot?.trimmed && <p className="muted small">{t('rg.trimmed')}</p>}
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
          {archive.error && !atLatest && (
            <div className="error" role="alert">
              {t('load_error', { msg: errorText(archive.error, t) })}{' '}
              <button className="link-btn" onClick={archive.reload}>{t('retry')}</button>
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
                          ΔT {r.inputs.delta_t_k != null ? `${fmtSigned(r.inputs.delta_t_k, 1)} K` : '–'}
                          {atLatest && <>
                            {' '}· RH {r.inputs.relative_humidity_pct != null ? `${fmtNum(r.inputs.relative_humidity_pct, 0)}%` : '–'} · {t('rgt.cloud')}{' '}
                            {r.inputs.cloud_cover_pct != null ? `${fmtNum(r.inputs.cloud_cover_pct, 0)}%` : '–'}
                          </>}
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
                    <Link className="qi-link" to={detail(r.id)}>{t('map.open_detail')}</Link>
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
              <li><i className="lg-px himawari9" />{t('rg.legend.himawari9')}</li>
              <li><i className="lg-px gk2a" />{t('rg.legend.gk2a')}</li>
              <li><i className="lg-px viirs" />{t('rg.legend.viirs')}</li>
            </ul>
            <p className="muted small">{t('rg.sources')}</p>
          </details>
        </Sheet>

        <div className="map-wrap">
          <div ref={mapEl} className="map" role="region" aria-label={t('rg.map_aria')} />
          {viewDay && index.data?.first && index.data.last && (
            <div className="map-overlay bottom">
              <DayPlayer
                day={viewDay} slots={slots} live={live} slot={cur} last={last}
                first={index.data.first} lastDay={index.data.last} playing={playing}
                onSlot={onSlot} onPlay={onPlay} onDay={goDay}
              />
            </div>
          )}
        </div>
      </div>
    </LiteMotion>
  );
}
