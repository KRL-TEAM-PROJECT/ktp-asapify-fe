import { useEffect, useState } from 'react';
import { API_MODE } from '../api';

// A healthy pipeline shows a slot at most about 60 minutes old: a slot only one satellite published waits 40 minutes,
// the worker ticks every 10 and this page polls every 10. Past 90 minutes something upstream has stopped.
const STALE_MS = 90 * 60_000;

/** "2 h 05 min" when the slot at `iso` is older than a healthy pipeline allows; null when current, unknown, or mock
 * data (its clock is fixed and the SAMPLE DATA badge already says what it is). */
export function staleAge(iso: string | null | undefined, now = Date.now()): string | null {
  if (API_MODE !== 'live' || !iso) return null;
  const ms = now - Date.parse(iso);
  if (!(ms > STALE_MS)) return null;
  const min = Math.floor(ms / 60_000);
  return min < 120 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

/** staleAge, checked again every minute: a page left open must notice when the data stops coming. It re-renders
 * only when the answer changes, so a current page never re-renders for it. */
export function useStaleAge(iso: string | null | undefined): string | null {
  const age = staleAge(iso);
  const [, setSeen] = useState(age);
  useEffect(() => {
    const id = setInterval(() => setSeen(staleAge(iso)), 60_000);
    return () => clearInterval(id);
  }, [iso]);
  return age;
}
