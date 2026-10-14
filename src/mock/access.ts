import { ApiError, type OperatorAccess } from '../types';

// FICTIONAL operator list for the demo without a backend (the top bar says SAMPLE DATA). The rules mirror the
// backend (asapify_api/access_routes.py); demo addresses never have an account yet, so they stay "pending".

const SELF = 'operator@example.org'; // the demo sign-in in auth.ts
const EMAIL = /^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/;
let rows: OperatorAccess[] = [{ email: SELF, state: 'active', added_by: null, added_at: null, activated_at: null }];

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
};
