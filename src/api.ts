import {
  ApiError,
  type AgentInfo, type Api, type DayArchive, type DayIndex, type Decision, type OperatorAccess, type PeatRegions,
  type ProvinceBoundary, type RegionDetail, type RegionSummary, type TelegramGroup, type Verification, type JoinLink,
} from './types';
import { getOperatorToken, isOperator } from './auth';

const BASE = `${import.meta.env.VITE_API_BASE ?? ''}/api/v1`;

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let token: string | null = null;
  if (path.startsWith('/operator/')) {
    try { token = await getOperatorToken(); }
    catch { throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in again.'); }
  }
  const r = await fetch(BASE + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers },
  });
  if (!r.ok) {
    let code = `HTTP_${r.status}`;
    let message = r.statusText;
    try {
      const b = await r.json();
      code = b.error?.code ?? code;
      message = b.error?.message ?? message;
    } catch { /* body is not JSON */ }
    throw new ApiError(r.status, code, message);
  }
  return r.json() as Promise<T>;
}

async function file<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new ApiError(r.status, 'LAYER_UNAVAILABLE', 'The map layer is not available yet.');
  return (await r.json()) as T;
}

const enc = encodeURIComponent;
// Peat inside each region (KHG, clipped per NASA POWER cell): a static file built by the backend's tools/build_regions.py.
const peatRegions = () => file<PeatRegions>(`${import.meta.env.BASE_URL}regions.geojson`);

// Reads: operators use /operator (full detail, never cached); everyone else /public (no names, CDN-cached).
const read = async (path: string) => `${(await isOperator()) ? '/operator' : '/public'}${path}`;

export const api: Api = {
  provinces: () => file<ProvinceBoundary>(`${import.meta.env.BASE_URL}provinces.geojson`),
  regions: async () => req<RegionSummary[]>(await read('/regions')),
  // 4 slot records per hour are read per request (24 h = 96 reads), so ask only for what the page shows
  region: async (id, hours = 24, date) =>
    req<RegionDetail>(await read(`/regions/${enc(id)}?${date ? `date=${enc(date)}` : `hours=${hours}`}`)),
  // the day archive: one read per day, up to 33 per calendar month
  days: async (month) => req<DayIndex>(await read(`/days?month=${enc(month)}`)),
  day: async (date) => req<DayArchive>(await read(`/days/${enc(date)}`)),
  peatRegions,
  agent: async () => {
    if (!(await isOperator())) throw new ApiError(401, 'UNAUTHENTICATED', 'Operators only.');
    return req<AgentInfo>('/operator/agent');
  },
  verifyRegion: (id) => req<Verification>(`/operator/regions/${enc(id)}/verify`, { method: 'POST' }),
  decideRegion: (id, body) => req<Decision>(`/operator/regions/${enc(id)}/decision`, { method: 'POST', body: JSON.stringify(body) }),
  // addresses go in the body, never in the URL, so they stay out of request logs
  operatorAccess: () => req<OperatorAccess[]>('/operator/access'),
  grantOperator: (email) => req<OperatorAccess>('/operator/access', { method: 'POST', body: JSON.stringify({ email }) }),
  revokeOperator: async (email) => {
    await req('/operator/access/revoke', { method: 'POST', body: JSON.stringify({ email }) });
  },
  telegramGroups: () => req<TelegramGroup[]>('/operator/telegram-groups'),
  linkTelegramGroup: () => req<{ url: string; expires_in_seconds: number }>('/operator/telegram-groups/link', { method: 'POST' }),
  unlinkTelegramGroup: async (id) => {
    await req(`/operator/telegram-groups/${enc(id)}`, { method: 'DELETE' });
  },
  setTelegramInvite: (id, inviteUrl) =>
    req<TelegramGroup>(`/operator/telegram-groups/${enc(id)}`, { method: 'PUT', body: JSON.stringify({ invite_url: inviteUrl }) }),
  joinLinks: () => req<JoinLink[]>('/telegram/join'),
};

