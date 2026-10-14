import { useCallback, useMemo, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import type { DaySlot, SatelliteName } from '../types';
import { useI18n } from '../i18n';
import { fmtDay } from '../lib/format';
import { DAY_SLOTS, countStatus, slotTime } from '../lib/days';
import { DayCalendar } from './DayCalendar';
import { IconCalendar } from './icons';

interface Props {
  day: string; // open WIB day, YYYY-MM-DD
  slots: (DaySlot | null)[]; // DAY_SLOTS entries; null = nothing archived for that slot
  live: boolean; // the day of the latest slot
  slot: number; // index shown, 0 = 00:00 UTC+7
  last: number; // last archived slot of the day, -1 = none
  first: string; // first and last archived day, for the calendar and the day arrows
  lastDay: string;
  playing: boolean;
  onSlot(i: number): void;
  onPlay(playing: boolean): void;
  onDay(day: string | null): void; // null = back to the latest slot; the page maps the live day to null too
}

const DAY_MS = 86_400_000;
const shiftDay = (d: string, n: number) => new Date(Date.parse(d) + n * DAY_MS).toISOString().slice(0, 10);
const TICKS = [0, 36, 72, 108]; // 00:00, 06:00, 12:00, 18:00 UTC+7
const SATS: [string, SatelliteName][] = [['H', 'himawari9'], ['G', 'gk2a']];

/**
 * Playable day ribbon: the ▲ row = regions at ALERT (red) or WARNING (amber) per slot, the H/G rows = which
 * satellites were read. The calendar opens other days. A slider (input range) sits on top for keyboard use.
 */
export function DayPlayer({ day, slots, live, slot, last, first, lastDay, playing, onSlot, onPlay, onDay }: Props) {
  const { t } = useI18n();
  const counts = useMemo(() => slots.map((s) => (s ? { a: countStatus(s, 'A'), w: countStatus(s, 'W') } : null)), [slots]);
  const most = Math.max(1, ...counts.map((c) => (c ? c.a + c.w : 0)));
  const [calOpen, setCalOpen] = useState(false);
  const closeCal = useCallback(() => setCalOpen(false), []);

  const atLatest = live && slot === last;
  const prev = shiftDay(day, -1), next = shiftDay(day, 1);
  const title = fmtDay(day);
  const dayLabel = day === lastDay ? t('player.day_latest', { date: title }) : title;
  const time = last < 0 ? '–' : `${slotTime(slot)} UTC+7`;

  return (
    <div className="player" role="group" aria-label={t('player.title', { date: title })}>
      <div className="player-head">
        <button
          className="play-btn" onClick={() => onPlay(!playing)} disabled={last < 1}
          aria-label={playing ? t('player.pause') : t('player.play')} title={playing ? t('player.pause') : t('player.play')}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <span className="player-slot">
          <b>{time}</b>
          <small>{last < 0 ? t('player.empty') : atLatest ? t('player.latest') : t('player.archive')}</small>
        </span>
        <span className="day-pick">
          <button className="icon-btn sm" onClick={() => onDay(prev)} disabled={prev < first} aria-label={t('player.day_prev')}>‹</button>
          <button
            className="day-btn" onClick={() => setCalOpen((o) => !o)} aria-expanded={calOpen} aria-haspopup="dialog"
            aria-label={`${t('player.day_pick')}: ${dayLabel}`}
          >
            <IconCalendar size={14} /><span>{dayLabel}</span>
          </button>
          <button className="icon-btn sm" onClick={() => onDay(next)} disabled={next > lastDay} aria-label={t('player.day_next')}>›</button>
          <AnimatePresence>
            {calOpen && (
              <DayCalendar
                key="cal" value={day} first={first} last={lastDay} onClose={closeCal}
                onPick={(d) => { setCalOpen(false); onDay(d); }}
              />
            )}
          </AnimatePresence>
        </span>
        <button className="link-btn" onClick={() => onDay(null)} disabled={atLatest}>{t('player.to_latest')}</button>
      </div>

      <div className={`ribbon${playing ? ' playing' : ''}`} style={{ ['--now' as string]: slot, ['--n' as string]: DAY_SLOTS }}>
        <div className="ribbon-row warning-row">
          <b aria-hidden="true">▲</b>
          <span className="ribbon-cells" aria-hidden="true">
            {counts.map((c, i) => (
              <i
                key={i} className={!c ? '' : c.a ? 'alert' : c.w ? 'hot' : 'zero'}
                style={c && c.a + c.w ? { ['--a' as string]: 0.35 + (0.65 * (c.a + c.w)) / most } : undefined}
              />
            ))}
          </span>
        </div>
        {SATS.map(([k, name]) => (
          <div className="ribbon-row" key={k}>
            <b aria-hidden="true">{k}</b>
            <span className="ribbon-cells" aria-hidden="true">
              {slots.map((s, i) => <i key={i} className={s ? (s.satellites.includes(name) ? 'have' : 'gap') : ''} />)}
            </span>
          </div>
        ))}
        <span className="ribbon-now" aria-hidden="true" />
        <input
          className="ribbon-range" type="range" min={0} max={Math.max(0, last)} step={1} value={Math.max(0, slot)}
          onChange={(e) => onSlot(Number(e.target.value))} disabled={last < 0}
          aria-label={t('player.slider')} aria-valuetext={time}
          style={{ ['--latest' as string]: Math.max(0, last) }}
        />
      </div>
      <div className="ribbon-axis" aria-hidden="true">
        {TICKS.map((i) => <span key={i} style={{ ['--i' as string]: i }}>{slotTime(i)}</span>)}
      </div>
    </div>
  );
}
