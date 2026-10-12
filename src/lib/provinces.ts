import type { ProvinceCode } from '../types';

type Bounds = [[number, number], [number, number]];
export type Island = 'sumatra' | 'kalimantan';

/** Monitored region: Sumatra + Kalimantan peat. */
export const REGION: Bounds = [[94.9, -6.1], [119.4, 6.0]];

// Bounding boxes from the geoBoundaries province outlines (for fitBounds when filtering), not official borders.
export const PROVINCES: Record<ProvinceCode, { name: string; island: Island; bounds: Bounds }> = {
  '11': { name: 'Aceh', island: 'sumatra', bounds: [[95.01, 2.0], [98.29, 5.91]] },
  '12': { name: 'North Sumatra', island: 'sumatra', bounds: [[97.06, -0.6], [100.44, 4.3]] },
  '13': { name: 'West Sumatra', island: 'sumatra', bounds: [[98.6, -3.35], [101.89, 0.9]] },
  '14': { name: 'Riau', island: 'sumatra', bounds: [[100.07, -1.12], [103.81, 2.56]] },
  '15': { name: 'Jambi', island: 'sumatra', bounds: [[101.12, -2.77], [104.49, -0.75]] },
  '16': { name: 'South Sumatra', island: 'sumatra', bounds: [[102.06, -4.92], [106.1, -1.63]] },
  '17': { name: 'Bengkulu', island: 'sumatra', bounds: [[101.03, -5.51], [103.78, -2.28]] },
  '18': { name: 'Lampung', island: 'sumatra', bounds: [[103.6, -5.94], [105.92, -3.72]] },
  '19': { name: 'Bangka Belitung Islands', island: 'sumatra', bounds: [[105.11, -3.27], [108.98, -1.5]] },
  '21': { name: 'Riau Islands', island: 'sumatra', bounds: [[103.31, -0.68], [109.12, 4.77]] },
  '61': { name: 'West Kalimantan', island: 'kalimantan', bounds: [[108.84, -3.04], [114.21, 2.08]] },
  '62': { name: 'Central Kalimantan', island: 'kalimantan', bounds: [[110.73, -3.54], [115.85, 0.8]] },
  '63': { name: 'South Kalimantan', island: 'kalimantan', bounds: [[114.35, -4.18], [116.55, -1.3]] },
  '64': { name: 'East Kalimantan', island: 'kalimantan', bounds: [[113.84, -2.42], [118.99, 2.61]] },
  '65': { name: 'North Kalimantan', island: 'kalimantan', bounds: [[114.56, 1.05], [118.0, 4.41]] },
};
export const PROVINCE_CODES = Object.keys(PROVINCES).sort() as ProvinceCode[];
export const ISLANDS: Island[] = ['sumatra', 'kalimantan'];
export const provincesOf = (island: Island) => PROVINCE_CODES.filter((c) => PROVINCES[c].island === island);
