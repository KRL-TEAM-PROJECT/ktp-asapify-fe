import { useSyncExternalStore } from 'react';
import type { Auth, User as FirebaseUser } from 'firebase/auth';

/** signupUntil: last day (WIB) of a self-registered operator's access for the judging period; null = added by the team. */
export interface User { uid: string; email: string; name: string; role: 'operator' | 'subscriber'; signupUntil: string | null }
interface AuthState { user: User | null; loading: boolean; error: string | null }
const listeners = new Set<() => void>();
let firebaseAuth: Auth | null = null;
let sequence = 0;

let state: AuthState = { user: null, loading: true, error: null };
function set(next: AuthState) {
  state = next;
  listeners.forEach((notify) => notify());
}
const API = import.meta.env.VITE_API_BASE ?? '';
const wibToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
async function verifiedUser(user: FirebaseUser): Promise<User> {
  const token = await user.getIdTokenResult();
  if (!user.emailVerified) throw new Error('FORBIDDEN');
  const until = typeof token.claims.signup_until === 'string' ? token.claims.signup_until : null;
  const operator = token.claims.role === 'operator' && !(until && wibToday() > until); // a judging access ends by itself
  return { uid: user.uid, email: user.email ?? user.uid, name: user.displayName ?? user.email ?? 'ASAPify', role: operator ? 'operator' : 'subscriber', signupUntil: operator ? until : null };
}
let activation: { uid: string; done: Promise<boolean> } | null = null;
/**
 * An address an operator added before this account existed becomes an operator at its first sign-in
 * (backend asapify_api/access_routes.py). Asked once per account and page load; a failure leaves the role as it is.
 */
function activate(user: FirebaseUser): Promise<boolean> {
  if (activation?.uid !== user.uid) {
    activation = { uid: user.uid, done: (async () => {
      const response = await fetch(`${API}/api/v1/access/activate`, {
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
const ready: Promise<void> = (async () => {
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
});

export async function signIn(): Promise<User> {
  await ready;
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
/**
 * Self-registration for the hackathon judging period (backend POST /api/v1/access/signup): the reCAPTCHA token goes
 * to the backend, which grants role=operator with signup_until. Throws the backend's error code.
 */
export async function registerOperator(captchaToken: string): Promise<User> {
  await ready;
  const current = firebaseAuth?.currentUser;
  if (!current) throw new Error('UNAUTHENTICATED');
  const response = await fetch(`${API}/api/v1/access/signup`, {
    method: 'POST', body: JSON.stringify({ token: captchaToken }),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await current.getIdToken()}` },
  });
  if (!response.ok) {
    let code = `HTTP_${response.status}`;
    try { code = ((await response.json()) as { error?: { code?: string } }).error?.code ?? code; } catch { /* not JSON */ }
    throw new Error(code);
  }
  await current.getIdToken(true); // the new claim only comes with a fresh token
  const user = await verifiedUser(current);
  ++sequence;
  set({ user, loading: false, error: null });
  return user;
}
export async function signOut(): Promise<void> {
  await ready;
  if (firebaseAuth) await (await import('firebase/auth')).signOut(firebaseAuth);
  activation = null; // the next sign-in on this page asks again
  ++sequence;
  set({ user: null, loading: false, error: null });
}
export async function getUserToken(): Promise<string> {
  await ready;
  if (!state.user || !firebaseAuth?.currentUser) throw new Error('UNAUTHENTICATED');
  return firebaseAuth.currentUser.getIdToken();
}
export const getOperatorToken = getUserToken;
/** Operators read the operator endpoints (full detail); everyone else reads the public, CDN-cached ones. */
export async function isOperator(): Promise<boolean> {
  await ready;
  return state.user?.role === 'operator';
}
export function useAuthState(): AuthState {
  return useSyncExternalStore(
    (notify) => { listeners.add(notify); return () => { listeners.delete(notify); }; },
    () => state,
  );
}
export function useUser(): User | null { return useAuthState().user; }
