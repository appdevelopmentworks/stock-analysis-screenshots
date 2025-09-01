self.addEventListener('install', () => {
  // Minimal SW for PWA installability; no heavy caching in MVP
  self.skipWaiting()
})

self.addEventListener('activate', (event: any) => {
  event.waitUntil(self.clients.claim())
})

export {}

