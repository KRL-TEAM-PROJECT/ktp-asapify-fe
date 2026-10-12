import type { ClusterDetail } from '../types';
import { PROVINCES } from './provinces';
import { fmtNum, fmtSlot } from './format';

export const CAPTION_MAX = 1024;

/** Telegram caption template (ui.html 03b). Numbers come from the data, never retyped. */
export function buildCaption(c: ClusterDetail): string {
  const [lon, lat] = c.centroid;
  const nNbr = Math.round(c.neighbour_support * 8);
  const v = c.verification;
  const reason = v?.evidence.find((e) => e.source !== 'rule_engine')?.finding;
  const verLine = v
    ? `${v.result === 'strong_evidence' ? 'Strong evidence' : 'Inconclusive'}: ${reason ?? '-'}`
    : 'Not verified by the agent yet';
  return [
    '<b>WARNING · Suspected smouldering peat</b>',
    `📍 ${PROVINCES[c.province].name} · ${lat.toFixed(2)}, ${lon.toFixed(2)} · ${c.pixels.length} pixels`,
    `🛰️ Himawari + GK2A agree · utility ${fmtNum(c.utility_score, 2)} · neighbours ${nNbr}/8`,
    `🔎 ${verLine}`,
    `🕙 Slot ${fmtSlot(c.trigger_slot)}`,
    'WARNING status comes from satellite rules; it is not a field confirmation.',
  ].join('\n');
}
