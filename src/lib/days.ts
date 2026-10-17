import type { DayArchive, DaySlot, Status } from '../types';

// The backend's day archive (asapify_engine/geo.py, engine_days): one WIB calendar day keyed HHMM in UTC+7 by the
// satellites' 10-minute scan times, region statuses as one character each in `regions` order. The engine rates a slot
// every 15 minutes, so about one scan slot in three stays empty; the player steps over them.

export const DAY_SLOTS = 144;
const WIB_MS = 7 * 3_600_000;
const CODE: Record<string, Status> = { S: 'SAFE', W: 'WARNING', A: 'ALERT', N: 'NO_OBSERVABLE' };

const pad = (n: number) => String(n).padStart(2, '0');

/** WIB calendar day (YYYY-MM-DD) of a UTC instant. */
export const dayOf = (iso: string) => new Date(Date.parse(iso) + WIB_MS).toISOString().slice(0, 10);

/** Archive key HHMM (UTC+7) → slot index 0..143. */
export const slotIndex = (key: string) => (Number(key.slice(0, 2)) * 60 + Number(key.slice(2))) / 10;

/** Slot index → "HH:MM" (UTC+7). */
export const slotTime = (i: number) => `${pad(Math.floor(i / 6))}:${pad((i % 6) * 10)}`;

/** The archive's slots by index; null where nothing was archived. */
export function bySlot(a: DayArchive | null): (DaySlot | null)[] {
  const out: (DaySlot | null)[] = Array(DAY_SLOTS).fill(null);
  for (const s of a?.slots ?? []) out[slotIndex(s.key)] = s;
  return out;
}

/** Index of the last archived slot, -1 when there is none. */
export function lastSlot(slots: (DaySlot | null)[]): number {
  for (let i = slots.length - 1; i >= 0; i--) if (slots[i]) return i;
  return -1;
}

/** One region in one archived slot: its status, ΔT measured and, from 18 Oct 2026, ΔT as the rules counted it. */
export interface RegionAt {
  status: Status | null;
  delta_t: number | null;
  delta_t_eff: number | null; // null in days archived before
  delta_t_max_eff: number | null; // the strongest view's counted ΔT where it carried weight
}

/** Status and ΔT of every region in one slot. */
export function regionsAt(a: DayArchive, s: DaySlot): Map<string, RegionAt> {
  return new Map(a.regions.map((id, i) => [id, {
    status: CODE[s.status[i]] ?? null, delta_t: s.delta_t[i] ?? null,
    delta_t_eff: s.delta_t_eff?.[i] ?? null, delta_t_max_eff: s.delta_t_max_eff?.[i] ?? null,
  }]));
}

/** How many regions were at `code` (A, W, S, N) in a slot. */
export const countStatus = (s: DaySlot, code: string) => s.status.split(code).length - 1;
