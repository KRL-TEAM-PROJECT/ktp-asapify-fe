import type { SatelliteName } from '../types';

export const SATELLITE_NAMES: Record<SatelliteName, string> = { himawari9: 'Himawari-9', gk2a: 'GK2A' };

/** How the two satellites' views of a slot relate, from the backend's fusion flags; i18n key `view.<key>`. */
export function agreement(flags: string[] | null | undefined): { key: string; sat?: string } | null {
  if (!flags) return null;
  if (flags.includes('two_satellites_agree')) return { key: 'agree' };
  if (flags.includes('two_satellites_quiet')) return { key: 'quiet' };
  if (flags.includes('satellites_disagree')) return { key: 'disagree' };
  const one = flags.find((f) => f.startsWith('single_satellite:'));
  if (one) {
    const name = one.split(':')[1];
    return { key: 'single', sat: SATELLITE_NAMES[name as SatelliteName] ?? name };
  }
  if (flags.includes('no_clear_view')) return { key: 'no_view' };
  return null;
}
