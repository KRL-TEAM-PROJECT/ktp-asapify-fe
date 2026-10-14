/// <reference lib="webworker" />
// Retired. This worker used to keep an offline copy of the app and receive push for the old /notifications page.
// Browsers that installed it fetch this file again (served no-cache); this version deletes every cache it made,
// unregisters itself and reloads the open tabs, so nobody stays on an old cached build. Keep the file name and the
// build entry until no browser can still hold the old worker; then delete both and the Hosting header.

export {};   // a module, so `self` below is this worker's own declaration
declare const self: ServiceWorkerGlobalScope;

self.addEventListener('install', () => { void self.skipWaiting(); });
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) await caches.delete(name);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: 'window' })) void (client as WindowClient).navigate(client.url);
  })());
});
