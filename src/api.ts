import {
  ApiError,
  type AgentInfo, type Api, type DayArchive, type DayIndex, type Decision, type OperatorAccess, type PeatRegions,
  type ProvinceBoundary, type RegionDetail, type RegionSummary, type TelegramGroup, type Verification, type JoinLink,
} from './types';
import { getOperatorToken } from './auth';

export const API_MODE: 'mock' | 'live' = import.meta.env.VITE_API_MODE === 'live' ? 'live' : 'mock';

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

async function file<T>(url: string | undefined, empty: T): Promise<T> {
  if (!url) return empty;
  const r = await fetch(url);
  if (!r.ok) throw new ApiError(r.status, 'LAYER_UNAVAILABLE', 'The map layer is not available yet.');
  return (await r.json()) as T;
}

const enc = encodeURIComponent;
const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] };
// Peat inside each region (KHG, clipped per NASA POWER cell): a static file built by the backend's tools/build_regions.py.
const peatRegions = () => file<PeatRegions>(`${import.meta.env.BASE_URL}regions.geojson`, EMPTY_FC);

const liveApi: Api = {
  provinces: () => file<ProvinceBoundary>(import.meta.env.VITE_PROVINCES_LAYER_URL, EMPTY_FC),
  regions: () => req<RegionSummary[]>('/operator/regions'),
  // 6 slot records per hour are read per request (24 h = 144 reads), so ask only for what the page shows
  region: (id, hours = 24, date) =>
    req<RegionDetail>(`/operator/regions/${enc(id)}?${date ? `date=${enc(date)}` : `hours=${hours}`}`),
  // the day archive: one read per day, up to 33 per calendar month
  days: (month) => req<DayIndex>(`/operator/days?month=${enc(month)}`),
  day: (date) => req<DayArchive>(`/operator/days/${enc(date)}`),
  peatRegions,
  agent: () => req<AgentInfo>('/operator/agent'),
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

// Mock mode loads lazily: its code + fictional data stay out of the main chunk.
const mockRegions = () => import('./mock/regions').then((m) => m.mockRegionApi);
const mockAccess = () => import('./mock/access').then((m) => m.mockAccessApi);
const mockApi: Api = {
  provinces: () => file<ProvinceBoundary>(`${import.meta.env.BASE_URL}mock/provinces.geojson`, EMPTY_FC),
  regions: () => mockRegions().then((m) => m.regions()),
  region: (id, hours, date) => mockRegions().then((m) => m.region(id, hours, date)),
  days: (month) => mockRegions().then((m) => m.days(month)),
  day: (date) => mockRegions().then((m) => m.day(date)),
  peatRegions,
  agent: () => mockRegions().then((m) => m.agent()),
  verifyRegion: (id) => mockRegions().then((m) => m.verifyRegion(id)),
  decideRegion: (id, body) => mockRegions().then((m) => m.decideRegion(id, body)),
  operatorAccess: () => mockAccess().then((m) => m.list()),
  grantOperator: (email) => mockAccess().then((m) => m.grant(email)),
  revokeOperator: (email) => mockAccess().then((m) => m.revoke(email)),
  telegramGroups: () => mockAccess().then((m) => m.groups()),
  linkTelegramGroup: () => mockAccess().then((m) => m.linkGroup()),
  unlinkTelegramGroup: (id) => mockAccess().then((m) => m.unlinkGroup(id)),
  setTelegramInvite: (id, inviteUrl) => mockAccess().then((m) => m.setInvite(id, inviteUrl)),
  joinLinks: () => mockAccess().then((m) => m.joinLinks()),
};

export const api: Api = API_MODE === 'live' ? liveApi : mockApi;
