import { ApiError, type OperatorAccess, type TelegramGroup } from '../types';

// FICTIONAL operator list for the demo without a backend (the top bar says SAMPLE DATA). The rules mirror the
// backend (asapify_api/access_routes.py); demo addresses never have an account yet, so they stay "pending".

const SELF = 'operator@example.org'; // the demo sign-in in auth.ts
const EMAIL = /^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/;
let rows: OperatorAccess[] = [{ email: SELF, state: 'active', added_by: null, added_at: null, activated_at: null }];
let groups: TelegramGroup[] = [
  { id: 'a1b2'.repeat(16), title: 'Siaga Karhutla Kalteng (demo)', linked_by: SELF, linked_at: '2026-10-15T03:20:00Z' },
];

const wait = <T>(v: T, ms = 250): Promise<T> => new Promise((res) => setTimeout(() => res(structuredClone(v)), ms + Math.random() * 150));
const now = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

function normalise(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (!EMAIL.test(email)) throw new ApiError(400, 'VALIDATION', 'Enter one email address.');
  return email;
}

export const mockAccessApi = {
  list: async (): Promise<OperatorAccess[]> => wait([...rows].sort((a, b) => a.email.localeCompare(b.email))),
  grant: async (raw: string): Promise<OperatorAccess> => {
    const email = normalise(raw);
    const row: OperatorAccess = { email, state: 'pending', added_by: SELF, added_at: now(), activated_at: null };
    rows = [...rows.filter((r) => r.email !== email), row];
    return wait(row);
  },
  revoke: async (raw: string): Promise<void> => {
    const email = normalise(raw);
    if (email === SELF) throw new ApiError(409, 'CANNOT_REMOVE_SELF', 'You cannot remove your own operator access.');
    if (!rows.some((r) => r.email === email)) throw new ApiError(404, 'NOT_FOUND', 'This address has no operator access.');
    rows = rows.filter((r) => r.email !== email);
    return wait(undefined);
  },
  groups: async (): Promise<TelegramGroup[]> => wait(groups),
  // the demo link only opens Telegram; nothing gets linked without a backend
  linkGroup: async () => wait({ url: 'https://t.me/asapify_demo_bot?startgroup=demo', expires_in_seconds: 600 }),
  unlinkGroup: async (id: string): Promise<void> => {
    if (!groups.some((g) => g.id === id)) throw new ApiError(404, 'NOT_FOUND', 'Telegram group not found.');
    groups = groups.filter((g) => g.id !== id);
    return wait(undefined);
  },
};
