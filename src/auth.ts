import { useSyncExternalStore } from 'react';
import { load, save } from './lib/storage';
import type { Auth, User as FirebaseUser } from 'firebase/auth';

export interface User { uid: string; email: string; name: string; role: 'operator' | 'subscriber' }
interface AuthState { user: User | null; loading: boolean; error: string | null }
const LIVE = import.meta.env.VITE_API_MODE === 'live';
const KEY = 'asapify.user';
const listeners = new Set<() => void>();
let firebaseAuth: Auth | null = null;
let sequence = 0;

function readDemo(): User | null {
  if (LIVE) return null; // A previous mock login never grants live access.
  try { return JSON.parse(load(KEY) ?? 'null') as User | null; } catch { return null; }
}
let state: AuthState = { user: readDemo(), loading: LIVE, error: null };
function set(next: AuthState) {
  state = next;
  if (!LIVE) save(KEY, next.user ? JSON.stringify(next.user) : null);
  listeners.forEach((notify) => notify());
}
async function verifiedUser(user: FirebaseUser): Promise<User> {
  const token = await user.getIdTokenResult();
  if (!user.emailVerified) throw new Error('FORBIDDEN');
  return { uid: user.uid, email: user.email ?? user.uid, name: user.displayName ?? user.email ?? 'ASAPify', role: token.claims.role === 'operator' ? 'operator' : 'subscriber' };
}
let activation: { uid: string; done: Promise<boolean> } | null = null;
/**
 * An address an operator added before this account existed becomes an operator at its first sign-in
 * (backend asapify_api/access_routes.py). Asked once per account and page load; a failure leaves the role as it is.
 */
function activate(user: FirebaseUser): Promise<boolean> {
  if (activation?.uid !== user.uid) {
    activation = { uid: user.uid, done: (async () => {
      const response = await fetch(`${import.meta.env.VITE_API_BASE ?? ''}/api/v1/access/activate`, {
        method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      if (!response.ok) return false;
      const body = (await response.json()) as { changed?: boolean };
      if (body.changed) await user.getIdToken(true); // the new claim only comes with a fresh token
      return body.changed === true;
    })().catch(() => false) };
  }
  return activation.done;
}
const ready: Promise<void> = LIVE ? (async () => {
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
  if (Object.values(config).some((v) => !v)) throw new Error('AUTH_NOT_CONFIGURED');
  const [{ initializeApp }, sdk] = await Promise.all([import('firebase/app'), import('firebase/auth')]);
  firebaseAuth = sdk.getAuth(initializeApp(config));
  await new Promise<void>((resolve) => {
    sdk.onIdTokenChanged(firebaseAuth!, async (user) => {
      const ticket = ++sequence;
      try {
        let verified = user ? await verifiedUser(user) : null;
        if (user && verified?.role === 'subscriber' && await activate(user)) verified = await verifiedUser(user);
        if (ticket === sequence) set({ user: verified, loading: false, error: null });
      } catch {
        if (ticket === sequence) set({ user: null, loading: false, error: 'FORBIDDEN' });
      } finally { resolve(); }
    }, () => { set({ user: null, loading: false, error: 'AUTH_UNAVAILABLE' }); resolve(); });
  });
})().catch((e: unknown) => {
  set({ user: null, loading: false, error: e instanceof Error ? e.message : 'AUTH_UNAVAILABLE' });
}) : Promise.resolve();

export async function signIn(): Promise<User> {
  await ready;
  if (!LIVE) {
    const user: User = { uid: 'mock-operator', email: 'operator@example.org', name: 'Demo Operator', role: 'operator' };
    set({ user, loading: false, error: null });
    return user;
  }
  if (!firebaseAuth) throw new Error(state.error ?? 'AUTH_NOT_CONFIGURED');
  const sdk = await import('firebase/auth');
  const provider = new sdk.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const credential = await sdk.signInWithPopup(firebaseAuth, provider);
  try {
    let user = await verifiedUser(credential.user);
    if (user.role !== 'operator' && await activate(credential.user)) user = await verifiedUser(credential.user);
    set({ user, loading: false, error: null });
    return user;
  } catch (e) {
    await sdk.signOut(firebaseAuth);
    set({ user: null, loading: false, error: 'FORBIDDEN' });
    throw e;
  }
}
export async function signOut(): Promise<void> {
  await ready;
  if (LIVE && firebaseAuth) await (await import('firebase/auth')).signOut(firebaseAuth);
  const uid = state.user?.uid;
  if (uid) localStorage.removeItem('asapify.inbox.' + uid);
  activation = null; // the next sign-in on this page asks again
  ++sequence;
  set({ user: null, loading: false, error: null });
}
export async function getUserToken(): Promise<string | null> {
  await ready;
  if (!LIVE) return null;
  if (!state.user || !firebaseAuth?.currentUser) throw new Error('UNAUTHENTICATED');
  return firebaseAuth.currentUser.getIdToken();
}
export const getOperatorToken = getUserToken;
export function useAuthState(): AuthState {
  return useSyncExternalStore(
    (notify) => { listeners.add(notify); return () => { listeners.delete(notify); }; },
    () => state,
  );
}
export function useUser(): User | null { return useAuthState().user; }
