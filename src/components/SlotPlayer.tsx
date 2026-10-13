import { useCallback, useMemo, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import type { Meta, NightCompact, SatState } from '../types';
import { useI18n } from '../i18n';
import { fmtNight, fmtTime } from '../lib/format';
import { NIGHT_SLOTS, SLOT_MS, slotIndex } from '../lib/grid';
import { NightCalendar } from './NightCalendar';
import { IconCalendar } from './icons';

interface Props {
  meta: Meta;
  nightKey: string; // open night, YYYY-MM-DD
  night: NightCompact | null;
  isCurrent: boolean; // latest replay night
  slot: number;
  last: number; // last slot that exists that night
  playing: boolean;
  onSlot(i: number): void;
  onPlay(playing: boolean): void;
  onNight(night: string | null): void; // null = back to the latest night
}

const LATE_MIN = 40;
const DAY_MS = 86_400_000;
const shiftDay = (d: string, n: number) => new Date(Date.parse(d) + n * DAY_MS).toISOString().slice(0, 10);

/**
 * Playable night ribbon: the ▲ row = WARNING pixels per slot, the H/G rows = satellite data
 * available. The calendar opens archive nights. A slider (input range) sits on top of the ribbon for keyboard use.
 */
export function SlotPlayer({ meta, nightKey, night, isCurrent, slot, last, playing, onSlot, onPlay, onNight }: Props) {
  const { t } = useI18n();
  const start = Date.parse(`${nightKey}T13:00:00Z`);
  const slotIso = (i: number) => new Date(start + i * SLOT_MS).toISOString();

  // WARNING count per slot, computed once per night of data.
  const warning = useMemo(() => night?.status.map((s) => (s == null ? null : s.split('A').length - 1)) ?? [], [night]);
  const maxWarning = Math.max(1, ...warning.map((n) => n ?? 0));

  const [calOpen, setCalOpen] = useState(false);
  const closeCal = useCallback(() => setCalOpen(false), []);

  const sats: [string, SatState][] = [['H', meta.sats.himawari], ['G', meta.sats.gk2a]];
  const ticks = [0, 12, 24, 36, 48];
  const atLatest = isCurrent && slot === last;
  const prev = shiftDay(nightKey, -1), next = shiftDay(nightKey, 1);
  const goto = (d: string) => onNight(d === meta.nights.last ? null : d);
  const title = fmtNight(nightKey);
  const nightLabel = nightKey === meta.nights.last ? t('player.night_latest', { date: title }) : title;

  return (
    <div className="player" role="group" aria-label={t('player.title', { date: title })}>
      <div className="player-head">
        <button
          className="play-btn" onClick={() => onPlay(!playing)} disabled={!night || last < 1}
          aria-label={playing ? t('player.pause') : t('player.play')} title={playing ? t('player.pause') : t('player.play')}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <span className="player-slot">
          <b>{fmtTime(slotIso(slot))} UTC+7</b>
          <small>{atLatest ? t('player.latest') : isCurrent ? t('player.replaying') : t('player.archive')}</small>
        </span>
        <span className="night-pick">
          <button className="icon-btn sm" onClick={() => goto(prev)} disabled={prev < meta.nights.first} aria-label={t('player.night_prev')}>‹</button>
          <button
            className="night-btn" onClick={() => setCalOpen((o) => !o)} aria-expanded={calOpen} aria-haspopup="dialog"
            aria-label={`${t('player.night_pick')}: ${nightLabel}`}
          >
            <IconCalendar size={14} /><span>{nightLabel}</span>
          </button>
          <button className="icon-btn sm" onClick={() => goto(next)} disabled={next > meta.nights.last} aria-label={t('player.night_next')}>›</button>
          <AnimatePresence>
            {calOpen && (
              <NightCalendar
                key="cal" value={nightKey} first={meta.nights.first} last={meta.nights.last} onClose={closeCal}
                onPick={(d) => { setCalOpen(false); goto(d); }}
              />
            )}
          </AnimatePresence>
        </span>
        <button className="link-btn" onClick={() => (isCurrent ? onSlot(last) : onNight(null))} disabled={atLatest}>{t('player.to_latest')}</button>
      </div>

      <div className={`ribbon${playing ? ' playing' : ''}`} style={{ ['--now' as string]: slot }}>
        <div className="ribbon-row warning-row">
          <b aria-hidden="true">▲</b>
          <span className="ribbon-cells" aria-hidden="true">
            {Array.from({ length: NIGHT_SLOTS }, (_, i) => {
              const n = warning[i];
              return (
                <i key={i} className={n == null ? '' : n > 0 ? 'hot' : 'zero'}
                  style={n ? { ['--a' as string]: 0.35 + (0.65 * n) / maxWarning } : undefined} />
              );
            })}
          </span>
        </div>
        {sats.map(([k, s]) => {
          // Latest night: from the satellite delay in /meta. Archive night: the slots that have data.
          const lastHave = isCurrent ? slotIndex(s.last_slot, start) : last;
          const late = isCurrent && (s.last_slot == null || (s.delay_min ?? 0) > LATE_MIN);
          return (
            <div className="ribbon-row" key={k}>
              <b aria-hidden="true">{k}</b>
              <span className="ribbon-cells" aria-hidden="true">
                {Array.from({ length: NIGHT_SLOTS }, (_, i) => (
                  <i key={i} className={i <= lastHave ? (late ? 'have late' : 'have') : i <= last ? 'gap' : ''} />
                ))}
              </span>
            </div>
          );
        })}
        <span className="ribbon-now" aria-hidden="true" />
        <input
          className="ribbon-range" type="range" min={0} max={Math.max(0, last)} step={1} value={slot}
          onChange={(e) => onSlot(Number(e.target.value))}
          aria-label={t('player.slider')} aria-valuetext={`${fmtTime(slotIso(slot))} UTC+7`}
          style={{ ['--latest' as string]: last }}
        />
      </div>
      <div className="ribbon-axis" aria-hidden="true">
        {ticks.map((i) => <span key={i} style={{ ['--i' as string]: i }}>{fmtTime(slotIso(i))}</span>)}
      </div>
    </div>
  );
}
