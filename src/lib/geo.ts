import type { LngLat } from '../types';

const R_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle (haversine) distance between two [lon, lat] points, km. */
export function distKm([lon1, lat1]: LngLat, [lon2, lat2]: LngLat): number {
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(a));
}

const deg = (r: number) => (r * 180) / Math.PI;

/** Initial bearing (degrees from north) from a to b. */
export function bearingDeg([lon1, lat1]: LngLat, [lon2, lat2]: LngLat): number {
  const dLon = rad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(dLon);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** The point `km` away from `from` along `bearing` (degrees from north). */
export function destination([lon, lat]: LngLat, bearing: number, km: number): LngLat {
  const d = km / R_KM, b = rad(bearing);
  const lat2 = Math.asin(Math.sin(rad(lat)) * Math.cos(d) + Math.cos(rad(lat)) * Math.sin(d) * Math.cos(b));
  const lon2 = rad(lon) + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(rad(lat)), Math.cos(d) - Math.sin(rad(lat)) * Math.sin(lat2));
  return [deg(lon2), deg(lat2)];
}
