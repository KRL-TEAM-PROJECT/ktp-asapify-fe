import {
  ApiError,
  type AgentInfo, type Api, type Basemap, type ClusterDetail, type ClusterSummary, type Decision, type GridCompact,
  type Meta, type NightCompact, type NightSummary, type OperatorAccess, type PeatBoundary, type PeatRegions, type PixelIndex,
  type ProvinceBoundary, type RegionDetail, type RegionSummary, type Verification,
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
  meta: () => req<Meta>('/meta'),
  pixels: () => req<PixelIndex>('/operator/pixels'),
  gridCompact: (asOf) => req<GridCompact>(`/operator/grid?format=compact${asOf ? `&as_of=${enc(asOf)}` : ''}`),
  night: (night) => req<NightCompact>(`/operator/grid/night?night=${enc(night)}`),
  nights: (month) => req<NightSummary[]>(`/operator/nights?month=${enc(month)}`),
  basemaps: () => req<Basemap[]>('/operator/basemaps'),
  clusters: (night) => req<ClusterSummary[]>(night ? `/operator/clusters?night=${enc(night)}` : '/operator/clusters?state=active'),
  cluster: (id) => req<ClusterDetail>(`/operator/clusters/${enc(id)}`),
  decide: async (id, body) => {
    await req(`/operator/clusters/${enc(id)}/decision`, { method: 'POST', body: JSON.stringify(body) });
  },
  peatBoundary: () => file<PeatBoundary>(import.meta.env.VITE_PEAT_LAYER_URL, EMPTY_FC),
  provinces: () => file<ProvinceBoundary>(import.meta.env.VITE_PROVINCES_LAYER_URL, EMPTY_FC),
  regions: () => req<RegionSummary[]>('/operator/regions'),
  region: (id, hours = 72) => req<RegionDetail>(`/operator/regions/${enc(id)}?hours=${hours}`),
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
};

// Mock mode loads lazily: its code + fictional data stay out of the main chunk.
const mock = () => import('./mock/fixtures').then((m) => m.mockApi);
const mockRegions = () => import('./mock/regions').then((m) => m.mockRegionApi);
const mockAccess = () => import('./mock/access').then((m) => m.mockAccessApi);
const mockApi: Api = {
  meta: () => mock().then((m) => m.meta()),
  pixels: () => mock().then((m) => m.pixels()),
  gridCompact: (asOf) => mock().then((m) => m.gridCompact(asOf)),
  night: (night) => mock().then((m) => m.night(night)),
  nights: (month) => mock().then((m) => m.nights(month)),
  basemaps: () => mock().then((m) => m.basemaps()),
  clusters: (night) => mock().then((m) => m.clusters(night)),
  cluster: (id) => mock().then((m) => m.cluster(id)),
  decide: (id, body) => mock().then((m) => m.decide(id, body)),
  peatBoundary: () => mock().then((m) => m.peatBoundary()),
  provinces: () => mock().then((m) => m.provinces()),
  regions: () => mockRegions().then((m) => m.regions()),
  region: (id, hours) => mockRegions().then((m) => m.region(id, hours)),
  peatRegions,
  agent: () => mockRegions().then((m) => m.agent()),
  verifyRegion: (id) => mockRegions().then((m) => m.verifyRegion(id)),
  decideRegion: (id, body) => mockRegions().then((m) => m.decideRegion(id, body)),
  operatorAccess: () => mockAccess().then((m) => m.list()),
  grantOperator: (email) => mockAccess().then((m) => m.grant(email)),
  revokeOperator: (email) => mockAccess().then((m) => m.revoke(email)),
};

export const api: Api = API_MODE === 'live' ? liveApi : mockApi;
