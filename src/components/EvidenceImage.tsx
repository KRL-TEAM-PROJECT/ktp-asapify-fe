import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { AnimatePresence } from 'motion/react';
import type { EvidenceImg, LngLat, ViirsDetection } from '../types';
import { useI18n } from '../i18n';
import { fmtC, fmtNum, fmtSigned, fmtSlot } from '../lib/format';
import { distKm } from '../lib/geo';
import { gridCellAt, pixelCenter } from '../lib/grid';
import { cellLonLat, cellOf, hotRange, readingAt, thermalGradient } from '../lib/thermal';
import { exitFast, m, spring } from '../motion';
import { FloatingTip } from './FloatingTip';
import { CoordTip, ThermalTip, ViirsTip, satLabel } from './ProbeTips';
import { IconCrosshair, IconThermo } from './icons';

interface Props {
  img: EvidenceImg;
  centre: LngLat; // cluster coordinate = crop centre
  clusterPixels: string[]; // pixel ids of the cluster members
  repPixel: string;
  viirs: ViirsDetection[];
  /** Anomaly (K) from which the tooltip calls a cell hot; from the u_H attribute scale. */
  hotFrom?: number;
}

type Bbox = [number, number, number, number];
/** Who is probing: the cursor, a finger (stays until a tap outside), or the keyboard. */
type Via = 'mouse' | 'touch' | 'key';
type Probe = { kind: 'pt'; fx: number; fy: number; via: Via } | { kind: 'det'; i: number; via: Via };

const HIT_MOUSE = 9; // px: the nearest VIIRS point within this distance is picked on hover
const HIT_TOUCH = 16; // px: a finger is coarser
const KEY_STEP = 0.05; // arrow-key step on images without a grid (VIIRS), as a fraction of the image width
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

// Only one image tooltip is open at a time: a new one closes the old one (cursor on one image, focus on another).
let closeActive: (() => void) | null = null;

/** Position of a coordinate in the image as a fraction of width/height (linear lon/lat axes). */
const toFrac = (bbox: Bbox, lon: number, lat: number) => ({ fx: (lon - bbox[0]) / (bbox[2] - bbox[0]), fy: (bbox[3] - lat) / (bbox[3] - bbox[1]) });

/**
 * Evidence image. Crop ±0.2° (≈ 44 km); circle = 5 km radius around the cluster coordinate. Himawari thermal
 * images have a per-pixel temperature tooltip (both satellites); VIIRS images have a coordinate tooltip and
 * FIRMS detection points. Cursor, tap and arrow keys all work.
 */
export function EvidenceImage({ img, centre, clusterPixels, repPixel, viirs, hotFrom }: Props) {
  const { t } = useI18n();
  const tipId = useId();
  const frame = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [probe, setProbe] = useState<Probe | null>(null);

  const thermal = img.thermal;
  const bbox = useMemo<Bbox>(
    () => thermal?.bbox ?? img.bbox ?? [centre[0] - 0.2, centre[1] - 0.2, centre[0] + 0.2, centre[1] + 0.2],
    [thermal, img.bbox, centre],
  );
  const interactive = !failed && (!!thermal || img.source === 'viirs_image');

  const members = useMemo(() => new Set(clusterPixels), [clusterPixels]);
  const memberCells = useMemo(() => (thermal ? clusterPixels.flatMap((id) => {
    const c = pixelCenter(id);
    if (!c) return [];
    const { fx, fy } = toFrac(bbox, c[0], c[1]);
    return [{ id, col: Math.floor(fx * thermal.cols), row: Math.floor(fy * thermal.rows) }];
  }) : []), [clusterPixels, thermal, bbox]);
  const dets = useMemo(() => (img.source !== 'viirs_image' ? [] : viirs).flatMap((d, i) => {
    const { fx, fy } = toFrac(bbox, d.lon, d.lat);
    return fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1 ? [{ d, i, fx, fy }] : [];
  }), [viirs, bbox, img.source]);

  // Representative pixel: where the keyboard starts and the source of the summary line in the caption.
  const home = useMemo(() => {
    const c = pixelCenter(repPixel);
    if (!thermal || !c) return { fx: 0.5, fy: 0.5, reading: null };
    const { fx, fy } = toFrac(bbox, c[0], c[1]);
    const { col, row } = cellOf(thermal, fx, fy);
    return { fx: (col + 0.5) / thermal.cols, fy: (row + 0.5) / thermal.rows, reading: readingAt(thermal, col, row)[0] ?? null };
  }, [thermal, bbox, repPixel]);
  const range = thermal ? hotRange(thermal) : null;

  // ---------- cursor / finger / keyboard ----------
  const frac = (e: PointerEvent) => {
    const r = frame.current!.getBoundingClientRect();
    return { fx: clamp01((e.clientX - r.left) / r.width), fy: clamp01((e.clientY - r.top) / r.height) };
  };
  /** On gridded images, moving within the same cell changes nothing. */
  const point = (fx: number, fy: number, via: Via) => setProbe((p) => {
    if (thermal && p?.kind === 'pt' && p.via === via) {
      const a = cellOf(thermal, p.fx, p.fy), b = cellOf(thermal, fx, fy);
      if (a.col === b.col && a.row === b.row) return p;
    }
    return { kind: 'pt', fx, fy, via };
  });
  /** The VIIRS point nearest to the pointer (px), if within reach; stacked points never hide one another. */
  const nearestDet = (e: PointerEvent, reach: number) => {
    const r = frame.current!.getBoundingClientRect();
    let best: { i: number; dist: number } | null = null;
    for (const { i, fx, fy } of dets) {
      const dist = Math.hypot(r.left + fx * r.width - e.clientX, r.top + fy * r.height - e.clientY);
      if (dist <= reach && (!best || dist < best.dist)) best = { i, dist };
    }
    return best?.i ?? null;
  };
  const probeAt = (e: PointerEvent, via: Via, reach: number) => {
    const i = nearestDet(e, reach);
    if (i != null) { setProbe((p) => (p?.kind === 'det' && p.i === i && p.via === via ? p : { kind: 'det', i, via })); return; }
    const { fx, fy } = frac(e);
    point(fx, fy, via);
  };
  const onMove = (e: PointerEvent) => { if (e.pointerType !== 'touch') probeAt(e, 'mouse', HIT_MOUSE); };
  const onDown = (e: PointerEvent) => { if (e.pointerType === 'touch') probeAt(e, 'touch', HIT_TOUCH); };
  const onLeave = (e: PointerEvent) => { if (e.pointerType !== 'touch') setProbe((p) => (p?.via === 'mouse' ? null : p)); };
  // A finger gesture that turns into a page scroll is cancelled by the browser: never leave a tooltip hanging.
  const onCancel = () => setProbe((p) => (p?.via === 'touch' ? null : p));

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { if (probe) { e.stopPropagation(); setProbe(null); } return; }
    const a = ARROWS[e.key];
    if (!a || e.target !== e.currentTarget || e.altKey || e.ctrlKey || e.metaKey) return; // never steal browser shortcuts
    e.preventDefault();
    if (probe?.kind !== 'pt') { point(home.fx, home.fy, 'key'); return; } // first press: start at the representative pixel
    if (thermal) {
      const c = cellOf(thermal, probe.fx, probe.fy);
      const col = Math.min(thermal.cols - 1, Math.max(0, c.col + a[0]));
      const row = Math.min(thermal.rows - 1, Math.max(0, c.row + a[1]));
      point((col + 0.5) / thermal.cols, (row + 0.5) / thermal.rows, 'key');
    } else {
      point(clamp01(probe.fx + a[0] * KEY_STEP), clamp01(probe.fy + a[1] * KEY_STEP), 'key');
    }
  };

  // A tap outside the image closes a tooltip opened by a finger.
  const touching = probe?.via === 'touch';
  useEffect(() => {
    if (!touching) return;
    const down = (e: globalThis.PointerEvent) => { if (!frame.current?.contains(e.target as Node)) setProbe(null); };
    document.addEventListener('pointerdown', down);
    return () => document.removeEventListener('pointerdown', down);
  }, [touching]);

  // While a tooltip is open: Escape closes it from anywhere (WCAG 1.4.13), another tooltip closes this one, and
  // it closes when the image scrolls off screen (a tooltip must never hang without its anchor).
  const open = probe != null;
  useEffect(() => {
    if (!open) return;
    const close = () => setProbe(null);
    if (closeActive && closeActive !== close) closeActive();
    closeActive = close;
    const key = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', key);
    const el = frame.current;
    const io = el ? new IntersectionObserver(([en]) => { if (!en.isIntersecting) close(); }) : null;
    if (el) io?.observe(el);
    return () => {
      document.removeEventListener('keydown', key);
      io?.disconnect();
      if (closeActive === close) closeActive = null;
    };
  }, [open]);

  // ---------- what is being pointed at ----------
  const cell = thermal && probe?.kind === 'pt' ? cellOf(thermal, probe.fx, probe.fy) : null;
  const here: LngLat | null = probe?.kind === 'pt' ? [bbox[0] + probe.fx * (bbox[2] - bbox[0]), bbox[3] - probe.fy * (bbox[3] - bbox[1])] : null;
  const cellInfo = useMemo(() => {
    if (!thermal || !cell) return null;
    const [lon, lat] = cellLonLat(thermal, cell.col, cell.row);
    return { lon, lat, id: gridCellAt(lon, lat).id, readings: readingAt(thermal, cell.col, cell.row) };
  }, [thermal, cell?.col, cell?.row]); // eslint-disable-line react-hooks/exhaustive-deps

  const anchor = (): DOMRect | null => {
    const r = frame.current?.getBoundingClientRect();
    if (!r || !probe) return null;
    if (probe.kind === 'det') {
      const d = dets.find((x) => x.i === probe.i);
      return d ? new DOMRect(r.left + d.fx * r.width - 6, r.top + d.fy * r.height - 6, 12, 12) : null;
    }
    if (thermal && cell) {
      return new DOMRect(r.left + (cell.col / thermal.cols) * r.width, r.top + (cell.row / thermal.rows) * r.height, r.width / thermal.cols, r.height / thermal.rows);
    }
    return new DOMRect(r.left + probe.fx * r.width, r.top + probe.fy * r.height, 0, 0);
  };
  const anchorKey = !probe ? 'none' : probe.kind === 'det' ? `d${probe.i}` : cell ? `${cell.col},${cell.row}` : `${probe.fx.toFixed(3)},${probe.fy.toFixed(3)}`;

  // Screen readers: a summary of the numbers in the cell probed with the keyboard.
  const srText = useMemo(() => {
    if (probe?.via !== 'key' || !cellInfo) return '';
    const parts = cellInfo.readings.map((r) => (r.hot.k == null
      ? t('probe.cloud')
      : `${r.sat === 'himawari' ? 'Himawari' : 'GK2A'} ${r.hot.band} ${fmtC(r.hot.k)}${r.ref.k != null ? `, ${r.ref.band} ${fmtC(r.ref.k)}` : ''}${r.anomaly != null ? `, ${t('probe.row_anom')} ${fmtSigned(r.anomaly, 1)} K` : ''}`));
    return t('probe.sr', { id: cellInfo.id, summary: parts.join('; ') });
  }, [probe?.via, cellInfo, t]);

  const label = `${t(`ver.src.${img.source}`)} · ${fmtSlot(img.observed_at)}`;
  const mk = toFrac(bbox, centre[0], centre[1]); // marker at the cluster coordinate, not always at the crop centre
  const marker = { left: `${mk.fx * 100}%`, top: `${mk.fy * 100}%` };
  const cellPos = cell && thermal ? { left: `${(cell.col / thermal.cols) * 100}%`, top: `${(cell.row / thermal.rows) * 100}%` } : null;
  const crossPos = !thermal && probe?.kind === 'pt' ? { left: `${probe.fx * 100}%`, top: `${probe.fy * 100}%` } : null;
  const det = probe?.kind === 'det' ? dets.find((x) => x.i === probe.i)?.d : undefined;

  return (
    <figure className="evimg">
      <div
        ref={frame} className={`evimg-frame${interactive ? ' probeable' : ''}`}
        tabIndex={interactive ? 0 : undefined} role={interactive ? 'group' : undefined}
        aria-label={interactive ? `${label}. ${t(thermal ? 'probe.thermal_aria' : 'probe.viirs_aria', { n: thermal?.cols ?? 0 })}` : undefined}
        aria-describedby={interactive && probe?.via === 'key' && probe.kind === 'pt' ? tipId : undefined}
        onPointerMove={interactive ? onMove : undefined} onPointerDown={interactive ? onDown : undefined} onPointerLeave={interactive ? onLeave : undefined}
        onPointerCancel={interactive ? onCancel : undefined}
        onKeyDown={interactive ? onKey : undefined}
        onFocus={interactive ? (e) => { if (e.target === e.currentTarget && e.currentTarget.matches(':focus-visible')) point(home.fx, home.fy, 'key'); } : undefined}
        onBlur={interactive ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setProbe((p) => (p?.via === 'key' ? null : p)); } : undefined}
      >
        {failed ? (
          <div className="evimg-missing">{t('ver.img_missing')}</div>
        ) : (
          <img src={img.url} alt={interactive ? '' : label} loading="lazy" draggable={false} onError={() => setFailed(true)} />
        )}
        {!img.marker_drawn && !failed && <span className="evimg-marker" aria-hidden="true" style={marker} />}

        {interactive && (
          <>
            {thermal && (
              <svg className={`probe-members${probe ? ' on' : ''}`} viewBox={`0 0 ${thermal.cols} ${thermal.rows}`} preserveAspectRatio="none" aria-hidden="true">
                {memberCells.map((c) => <rect key={c.id} x={c.col + 0.06} y={c.row + 0.06} width={0.88} height={0.88} />)}
              </svg>
            )}

            <AnimatePresence>
              {thermal && cellPos && (
                <m.i
                  key="cell" className="probe-cell" aria-hidden="true" style={{ width: `${100 / thermal.cols}%`, height: `${100 / thermal.rows}%` }}
                  initial={{ opacity: 0, scale: 0.5, ...cellPos }} animate={{ opacity: 1, scale: 1, ...cellPos }} exit={{ opacity: 0, transition: exitFast }} transition={spring}
                />
              )}
              {crossPos && (
                <m.i
                  key="cross" className="probe-cross" aria-hidden="true"
                  initial={{ opacity: 0, ...crossPos }} animate={{ opacity: 1, ...crossPos }} exit={{ opacity: 0, transition: exitFast }} transition={spring}
                />
              )}
            </AnimatePresence>

            {dets.map(({ d, i, fx, fy }) => (
              <button
                key={`${d.src}-${d.time_utc}`} type="button" className={`viirs-dot${d.distance_km <= 2 ? ' near' : ''}`}
                style={{ left: `${fx * 100}%`, top: `${fy * 100}%` }}
                aria-label={`${t('probe.viirs_pt', { sat: satLabel(d.src) })}, ${fmtSlot(d.time_utc)}, ${t('probe.from_marker', { km: fmtNum(d.distance_km, 1) })}`}
                aria-describedby={probe?.kind === 'det' && probe.i === i ? tipId : undefined}
                onFocus={(e) => { if (e.currentTarget.matches(':focus-visible')) setProbe({ kind: 'det', i, via: 'key' }); }}
                onBlur={() => setProbe((p) => (p?.kind === 'det' && p.via === 'key' ? null : p))}
              />
            ))}

            <span className={`evimg-hint${probe ? ' off' : ''}`} aria-hidden="true">
              {thermal ? <IconThermo size={12} /> : <IconCrosshair size={12} />}
              {t(thermal ? 'probe.thermal_hint' : 'probe.viirs_hint')}
            </span>
          </>
        )}
      </div>

      {range && (
        <div className="thermal-legend" aria-hidden="true" title={t('probe.legend')}>
          <span>{fmtC(range[0])}</span>
          <i style={{ background: thermalGradient(range[0], range[1]) }} />
          <span>{fmtC(range[1])}</span>
        </div>
      )}

      <figcaption>
        <b>{t(`ver.src.${img.source}`)}</b>
        <span>{img.layer}</span>
        <span>{fmtSlot(img.observed_at)} · {t('ver.age', { h: fmtNum(img.age_h, 1) })}</span>
        {home.reading?.hot.k != null && home.reading.anomaly != null && (
          <span className="evimg-rep">
            {t('probe.rep_line', { c: `${fmtC(home.reading.hot.k)} (${home.reading.hot.band})`, a: fmtSigned(home.reading.anomaly, 1) })}
          </span>
        )}
      </figcaption>

      <span className="sr-only" role="status" aria-live="polite">{srText}</span>

      <FloatingTip open={interactive && !!probe} id={tipId} anchor={anchor} anchorKey={anchorKey}>
        {det ? (
          <ViirsTip d={det} />
        ) : cellInfo ? (
          <ThermalTip
            readings={cellInfo.readings} pixelId={cellInfo.id} lon={cellInfo.lon} lat={cellInfo.lat}
            km={distKm(centre, [cellInfo.lon, cellInfo.lat])} member={members.has(cellInfo.id)} rep={cellInfo.id === repPixel} hotFrom={hotFrom}
          />
        ) : here ? (
          <CoordTip lon={here[0]} lat={here[1]} km={distKm(centre, here)} />
        ) : null}
      </FloatingTip>
    </figure>
  );
}
