import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { notificationRequest } from './notification-api';
import { ApiError } from './types';

// Browser-side errors use the same codes as API errors, so the UI words them through err.{code}.
const fail = (code: string, message: string) => new ApiError(0, code, message);

export async function registerOffline() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) throw fail('PUSH_NO_SW', 'This browser needs HTTPS and service worker support.');
  try { await navigator.serviceWorker.register('/notification-sw.js', { type: 'module', scope: '/' }); }
  catch { throw fail('OFFLINE_UNAVAILABLE', 'The service worker could not be installed.'); }
  const registration = await navigator.serviceWorker.ready;
  const linkedAssets = [...document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src], link[rel="stylesheet"], link[rel="modulepreload"]')]
    .map(el => el instanceof HTMLScriptElement ? el.src : el.href)
    .filter(url => new URL(url).origin === location.origin);
  const assets = [...new Set([...linkedAssets, ...performance.getEntriesByType('resource').map(entry => entry.name)])]
    .filter(url => { const u = new URL(url); return u.origin === location.origin && u.pathname.startsWith('/assets/'); });
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => reject(fail('OFFLINE_TIMEOUT', 'Saving for offline use did not finish. Try again.')), 15000);
    channel.port1.onmessage = event => {
      clearTimeout(timeout); channel.port1.close();
      if (event.data?.ok) resolve(); else reject(fail('OFFLINE_PARTIAL', 'Some offline files could not be saved.'));
    };
    registration.active?.postMessage({ type: 'CACHE_SHELL', assets }, [channel.port2]);
  });
  return registration;
}

export async function enableBrowserPush() {
  if (!await isSupported()) throw fail('PUSH_UNSUPPORTED', 'Push is not supported on this browser/device yet.');
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY, authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID, appId: import.meta.env.VITE_FIREBASE_APP_ID,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  };
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!vapidKey || Object.values(config).some(v => !v)) throw fail('PUSH_NOT_CONFIGURED', 'Push configuration is not available yet.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw fail('PUSH_DENIED', 'Notification permission has not been granted.');
  const registration = await registerOffline();
  const app = getApps().find(app => app.name === 'asapify-push') ?? initializeApp(config, 'asapify-push');
  let token: string;
  try { token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: registration }); }
  catch { throw fail('PUSH_FAILED', 'Push registration failed.'); }
  await notificationRequest('/device', 'POST', { token });
}
