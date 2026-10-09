import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { notificationRequest } from './notification-api';

export async function registerOffline() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) throw new Error('Browser memerlukan HTTPS dan dukungan service worker.');
  await navigator.serviceWorker.register('/notification-sw.js', { type: 'module', scope: '/' });
  const registration = await navigator.serviceWorker.ready;
  const linkedAssets = [...document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src], link[rel="stylesheet"], link[rel="modulepreload"]')]
    .map(el => el instanceof HTMLScriptElement ? el.src : el.href)
    .filter(url => new URL(url).origin === location.origin);
  const assets = [...new Set([...linkedAssets, ...performance.getEntriesByType('resource').map(entry => entry.name)])]
    .filter(url => { const u = new URL(url); return u.origin === location.origin && u.pathname.startsWith('/assets/'); });
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => reject(new Error('Penyimpanan offline belum selesai. Coba lagi.')), 15000);
    channel.port1.onmessage = event => {
      clearTimeout(timeout); channel.port1.close();
      if (event.data?.ok) resolve(); else reject(new Error('Sebagian berkas offline gagal disimpan.'));
    };
    registration.active?.postMessage({ type: 'CACHE_SHELL', assets }, [channel.port2]);
  });
  return registration;
}

export async function enableBrowserPush() {
  if (!await isSupported()) throw new Error('Push belum didukung di browser/perangkat ini.');
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY, authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID, appId: import.meta.env.VITE_FIREBASE_APP_ID,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  };
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!vapidKey || Object.values(config).some(v => !v)) throw new Error('Konfigurasi push belum tersedia.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Izin notifikasi belum diberikan.');
  const registration = await registerOffline();
  const app = getApps().find(app => app.name === 'asapify-push') ?? initializeApp(config, 'asapify-push');
  const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: registration });
  await notificationRequest('/device', 'POST', { token });
}
