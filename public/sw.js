// Minimal service worker: makes the app installable. It deliberately caches
// nothing: all data and photos are private and must always come from the server.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
