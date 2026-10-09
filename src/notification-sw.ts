/// <reference lib="webworker" />
import { initializeApp } from 'firebase/app';
import { getMessaging, isSupported } from 'firebase/messaging/sw';

declare const self: ServiceWorkerGlobalScope;
const CACHE = 'asapify-public-shell-v1';
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY, projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID, messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
};
if (Object.values(config).every(Boolean)) {
  void isSupported().then(ok => { if (ok) getMessaging(initializeApp(config)); });
}
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/', '/notifikasi'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
self.addEventListener('message', event => {
  if (event.data?.type !== 'CACHE_SHELL' || !Array.isArray(event.data.assets)) return;
  const urls = (event.data.assets as unknown[]).filter((s): s is string => typeof s === 'string').filter(s => {
    const url = new URL(s, self.location.origin);
    return url.origin === self.location.origin && url.pathname.startsWith('/assets/');
  }).slice(0, 60);
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(urls))
    .then(() => event.ports[0]?.postMessage({ ok: true }))
    .catch(() => event.ports[0]?.postMessage({ ok: false })));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/_internal/')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(async () => (await caches.match('/notifikasi'))!));
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.open(CACHE).then(async cache => {
      const hit = await cache.match(event.request);
      if (hit) return hit;
      const response = await fetch(event.request);
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    }));
  }
});
