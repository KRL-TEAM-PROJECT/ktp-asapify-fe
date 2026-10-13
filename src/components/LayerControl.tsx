import { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import type { Basemap } from '../types';
import type { LiteReason } from '../lib/device';
import type { LayerKey } from '../map/layers';
import { LAYER_KEYS } from '../map/layers';
import { useI18n } from '../i18n';
import { exitFast, m, spring } from '../motion';
import { IconX } from './icons';

interface Props {
  basemap: string;
  basemaps: Basemap[];
  layers: Record<LayerKey, boolean>;
  lite: boolean;
  liteReason: LiteReason | null;
  liteAuto: boolean;
  onBasemap(id: string): void;
  onLayer(key: LayerKey, on: boolean): void;
  onLite(on: boolean): void;
}

const IconLayers = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 2l6 3.2-6 3.2-6-3.2z" /><path d="M2 8.2l6 3.2 6-3.2" /><path d="M2 11l6 3.2 6-3.2" />
  </svg>
);

export function LayerControl({ basemap, basemaps, layers, lite, liteReason, liteAuto, onBasemap, onLayer, onLite }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const options = [
    { id: 'streets', label: t('lc.base_map') },
    ...basemaps.map((b) => ({ id: b.id, label: b.label })),
    { id: 'plain', label: t('lc.base_plain') },
  ];

  return (
    // layout="position": when the panel opens/closes, its siblings in the LayoutGroup (pixel inspector) slide along
    <m.div className="layer-ctl" layout="position" transition={spring}>
      <button className="map-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="layer-panel">
        <IconLayers /><span>{t('lc.title')}</span>
      </button>
      <AnimatePresence>
        {open && (
          <m.div
            key="panel" className="layer-panel" id="layer-panel" role="dialog" aria-label={t('lc.title')}
            initial={{ opacity: 0, scale: 0.94, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0, transition: spring }}
            exit={{ opacity: 0, scale: 0.97, y: -4, transition: exitFast }}
          >
            <header>
              <b>{t('lc.title')}</b>
              <button className="icon-btn sm" onClick={() => setOpen(false)} aria-label={t('insp.close')}><IconX size={13} /></button>
            </header>
            <fieldset>
              <legend>{t('lc.basemap')}</legend>
              {options.map((o) => (
                <label key={o.id} className="opt">
                  <input type="radio" name="basemap" checked={basemap === o.id} onChange={() => onBasemap(o.id)} />
                  <span>{o.label}</span>
                </label>
              ))}
              <p className="muted small">{t('lc.base_note')}</p>
            </fieldset>
            <fieldset>
              <legend>{t('lc.layers')}</legend>
              {LAYER_KEYS.map((k) => (
                <label key={k} className="opt switch">
                  <span>{t(`lc.layer_${k}`)}</span>
                  <input type="checkbox" role="switch" checked={layers[k]} onChange={(e) => onLayer(k, e.target.checked)} />
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>{t('lc.performance')}</legend>
              <label className="opt switch">
                <span>{t('lc.lite')}</span>
                <input type="checkbox" role="switch" checked={lite} onChange={(e) => onLite(e.target.checked)} />
              </label>
              <p className="muted small">
                {liteAuto && liteReason ? t('lc.lite_auto', { why: t(`lc.why_${liteReason}`) }) : t('lc.lite_note')}
              </p>
            </fieldset>
          </m.div>
        )}
      </AnimatePresence>
    </m.div>
  );
}
