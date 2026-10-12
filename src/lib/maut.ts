import type { AttrKey, Attributes } from '../types';

// WORKLOG §7 — initial numbers, calibrated in the 2023 backtest.
export const WEIGHTS: Record<AttrKey, number> = {
  u_H: 0.25, u_G: 0.25, u_LST: 0.10, u_SAT: 0.05, u_T: 0.15, u_N: 0.20,
};
export const ATTR_ORDER: AttrKey[] = ['u_H', 'u_G', 'u_LST', 'u_SAT', 'u_T', 'u_N'];
export const T_WATCH = 0.30;
export const T_WARNING = 0.65;

/** U = Σ wᵢuᵢ / Σ wᵢ over the available attributes. */
export function utility(attrs: Attributes, uN: number | null): number {
  const all: Record<AttrKey, number | null> = { ...attrs, u_N: uN };
  let num = 0, den = 0;
  for (const k of ATTR_ORDER) {
    const v = all[k];
    if (v == null) continue;
    num += WEIGHTS[k] * v;
    den += WEIGHTS[k];
  }
  return den ? num / den : 0;
}
