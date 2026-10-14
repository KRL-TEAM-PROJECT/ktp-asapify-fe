// Store UTC, display UTC+7 (Asia/Jakarta, worklog §10 rule 8).
const TZ = 'Asia/Jakarta';
const LOCALE = 'en-US';

function parts(iso: string) {
  const f = new Intl.DateTimeFormat(LOCALE, {
    timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(new Date(iso))) p[x.type] = x.value;
  return { day: p.day, month: p.month.replace('.', ''), hour: p.hour, minute: p.minute };
}

export function fmtTime(iso: string): string {
  const p = parts(iso);
  return `${p.hour}:${p.minute}`;
}

export function fmtDate(iso: string): string {
  const p = parts(iso);
  return `${p.day} ${p.month}`;
}

/** "24 Sep 22:10 UTC+7" */
export function fmtSlot(iso: string): string {
  return `${fmtDate(iso)} ${fmtTime(iso)} UTC+7`;
}

/** Night YYYY-MM-DD (the UTC+7 date when the night starts) → "Sun, 24 Sep 2023". */
export function fmtNight(night: string): string {
  // en-US gives "Sep" (en-GB now writes "Sept"); the order is assembled below.
  const f = new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(new Date(`${night}T12:00:00Z`))) p[x.type] = x.value;
  return `${p.weekday.replace('.', '')}, ${p.day} ${p.month.replace('.', '')} ${p.year}`;
}

export function fmtNum(n: number, digits: number): string {
  return n.toLocaleString(LOCALE, {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  });
}

export function fmtCoord(lon: number, lat: number): string {
  return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
}

/** Signed number for differences: "+12.4" / "−0.7" (a real minus sign, not a hyphen). */
export function fmtSigned(n: number, digits: number): string {
  const s = fmtNum(Math.abs(n), digits);
  return `${n < 0 && Number(s.replace(/,/g, '')) !== 0 ? '−' : '+'}${s}`;
}

/** Brightness temperature K → "38.4 °C". */
export const fmtC = (k: number) => `${fmtNum(k - 273.15, 1)} °C`;
