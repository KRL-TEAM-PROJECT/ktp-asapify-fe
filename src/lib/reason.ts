/**
 * The rules engine's reason (backend rules.py) without its utility numbers, e.g. "ΔT 3.56 K counted as 4.06 K (air
 * 1.1σ drier than normal +0.50 K)". The status itself is shown next to it; reasons of other shapes pass through.
 */
export function plainReason(reason: string): string {
  return reason
    .replace(/^[A-Z_]+ has the highest utility \([\d.]+\)(;\s*)?/, '')
    .replace(/^[A-Z_]+ chosen over [A-Z_]+: utilities within the [\d.]+ safety margin \([\d.]+\)(;\s*)?/, '');
}
