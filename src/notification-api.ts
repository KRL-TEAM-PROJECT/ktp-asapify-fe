import { getUserToken } from './auth';
import { API_MODE } from './api';

export const CHANNELS = ['telegram', 'fcm', 'web_push', 'whatsapp', 'sms', 'gmail', 'lora', 'bluetooth_mesh'] as const;
export type Channel = typeof CHANNELS[number];
export interface Preferences { provinces: string[]; channels: Channel[]; consent: boolean; exercises: boolean }
export interface Settings {
  preferences: Preferences & { telegram_linked?: boolean; device_registered?: boolean };
  channels: { channel: Channel; implemented: boolean; enabled: boolean; restriction: string | null }[];
  mode: string;
}
export interface Notice {
  id: string; alert_id: string; province: string; text: string; purpose: 'exercise' | 'emergency';
  published_at: string; expires_at: string; acknowledged_at: string | null; status: string;
}
const INITIAL: Preferences = { provinces: [], channels: [], consent: false, exercises: false };
const MOCK_KEY = 'asapify.notification-demo';
const DEMO_ID = 'a'.repeat(64);
let mockAck: string | null = null;

export async function notificationRequest<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const token = await getUserToken();
  const response = await fetch(`${import.meta.env.VITE_API_BASE ?? ''}/api/v1/notifications${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error?.message ?? `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const notifications = {
  async settings(): Promise<Settings> {
    if (API_MODE === 'live') return notificationRequest('/settings');
    let preferences = INITIAL;
    try { preferences = JSON.parse(sessionStorage.getItem(MOCK_KEY) ?? 'null') ?? INITIAL; } catch { /* clean demo */ }
    return { preferences, mode: 'dry_run', channels: CHANNELS.map(channel => ({ channel,
      implemented: ['telegram', 'fcm', 'web_push'].includes(channel), enabled: false,
      restriction: ['fcm', 'web_push'].includes(channel) ? 'NON_EMERGENCY_ONLY' : null })) };
  },
  async save(preferences: Preferences) {
    if (API_MODE === 'live') return notificationRequest('/preferences', 'PUT', preferences);
    sessionStorage.setItem(MOCK_KEY, JSON.stringify(preferences));
    return preferences;
  },
  async inbox(): Promise<Notice[]> {
    if (API_MODE === 'live') return notificationRequest('/inbox');
    return [{ id: DEMO_ID, alert_id: 'DEMO-01', province: '62', purpose: 'exercise', status: 'active',
      text: 'SIMULASI: contoh informasi anomali termal untuk menguji tombol konfirmasi. Data ini bukan kejadian nyata.',
      published_at: new Date().toISOString(), expires_at: new Date(Date.now() + 3600000).toISOString(), acknowledged_at: mockAck }];
  },
  async ack(id: string): Promise<{ acknowledged_at: string }> {
    if (API_MODE === 'live') return notificationRequest(`/inbox/${encodeURIComponent(id)}/ack`, 'POST');
    mockAck ??= new Date().toISOString(); return { acknowledged_at: mockAck };
  },
  async telegram(): Promise<{ url: string }> {
    if (API_MODE !== 'live') throw new Error('Bot Telegram tersedia setelah backend dikonfigurasi.');
    return notificationRequest('/telegram-link', 'POST');
  },
};
