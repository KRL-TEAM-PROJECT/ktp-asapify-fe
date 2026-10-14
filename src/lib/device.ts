import { load } from './storage';

export type LiteReason = 'save_data' | 'memory' | 'cpu' | 'motion';

/** Signs of a weak device / data saver. null = none detected. */
export function detectLite(): LiteReason | null {
  const n = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  const mem = n.deviceMemory ?? 8; // Safari/Firefox do not report RAM
  const cores = n.hardwareConcurrency ?? 8;
  if (n.connection?.saveData) return 'save_data';
  if (mem <= 2) return 'memory';
  // 4 cores alone is not weak (many mid-range laptops); 4 cores + RAM ≤ 4 GB is usually a low-end phone.
  if (cores <= 2 || (cores <= 4 && mem <= 4)) return 'cpu';
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'motion';
  return null;
}

const KEY = 'asapify.lite';

/** The operator's choice overrides automatic detection. */
export function loadLitePref(): boolean | null {
  const v = load(KEY);
  return v === '1' ? true : v === '0' ? false : null;
}
