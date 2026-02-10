/**
 * Custom Service Worker Extensions
 *
 * Ce fichier contient la logique personnalisée du service worker
 * pour les fonctionnalités offline avancées de COFIN&CO-M
 */

/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

// Import Workbox modules
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute, Route } from 'workbox-routing';
import {
  NetworkFirst,
  CacheFirst,
  StaleWhileRevalidate,
  NetworkOnly
} from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import { BackgroundSyncPlugin, Queue } from 'workbox-background-sync';

// ========== CONSTANTS ==========

const CACHE_NAMES = {
  STATIC: 'cofin-static-v1',
  API: 'cofin-api-v1',
  IMAGES: 'cofin-images-v1',
  MAPS: 'cofin-maps-v1',
  DOCUMENTS: 'cofin-docs-v1',
  OFFLINE: 'cofin-offline-v1'
} as const;

const OFFLINE_FALLBACK_PAGE = '/offline.html';
const OFFLINE_FALLBACK_IMAGE = '/icons/offline-image.svg';

// ========== PRECACHING ==========

// Precache static assets (injected by Workbox build)
precacheAndRoute(self.__WB_MANIFEST || []);
cleanupOutdatedCaches();

// ========== BACKGROUND SYNC QUEUES ==========

// Queue for financial operations (critical)
const financialSyncQueue = new Queue('financial-operations', {
  maxRetentionTime: 24 * 60 * 7, // 7 days
  onSync: async ({ queue }) => {
    let entry: any;
    while ((entry = await queue.shiftRequest())) {
      try {
        const response = await fetch(entry.request.clone());

        if (!response.ok && response.status !== 409) {
          // Re-add to queue if not a conflict
          await queue.unshiftRequest(entry);
          throw new Error(`Sync failed: ${response.status}`);
        }

        // Notify client of successful sync
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
          client.postMessage({
            type: 'SYNC_COMPLETED',
            payload: {
              url: entry.request.url,
              timestamp: Date.now(),
              status: response.ok ? 'success' : 'conflict'
            }
          });
        });
      } catch (error) {
        console.error('[SW] Sync error:', error);
        await queue.unshiftRequest(entry);
        throw error;
      }
    }
  }
});

// Queue for non-critical operations
const generalSyncQueue = new Queue('general-operations', {
  maxRetentionTime: 24 * 60 // 24 hours
});

// ========== API CACHING STRATEGIES ==========

// Critical financial operations - Network only with background sync
const financialOperationsPlugin = new BackgroundSyncPlugin('financial-operations', {
  maxRetentionTime: 24 * 60 * 7 // 7 days
});

registerRoute(
  ({ url }) => url.pathname.match(/^\/api\/(caisse|transactions|operations|transfers)/),
  async ({ request, event }) => {
    if (request.method === 'GET') {
      // GET requests use network first
      return new NetworkFirst({
        cacheName: CACHE_NAMES.API,
        networkTimeoutSeconds: 10,
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 })
        ]
      }).handle({ request, event });
    } else {
      // POST/PUT/DELETE use network only with background sync
      try {
        return await fetch(request.clone());
      } catch (error) {
        // Queue for later sync
        await financialSyncQueue.pushRequest({ request });

        // Return optimistic response
        return new Response(
          JSON.stringify({
            success: true,
            offline: true,
            queued: true,
            message: 'Opération mise en file d\'attente pour synchronisation'
          }),
          {
            status: 202,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }
    }
  }
);

// Client data - Stale while revalidate for faster access
registerRoute(
  ({ url }) => url.pathname.match(/^\/api\/clients/),
  new StaleWhileRevalidate({
    cacheName: CACHE_NAMES.API,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 })
    ]
  })
);

// Static configuration - Cache first
registerRoute(
  ({ url }) => url.pathname.match(/^\/api\/(agences|regions|departements|parametres|roles|config)/),
  new CacheFirst({
    cacheName: CACHE_NAMES.STATIC,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 })
    ]
  })
);

// Dashboard stats - Network first with short cache
registerRoute(
  ({ url }) => url.pathname.match(/^\/api\/(dashboard|stats|analytics)/),
  new NetworkFirst({
    cacheName: CACHE_NAMES.API,
    networkTimeoutSeconds: 5,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 5 })
    ]
  })
);

// ========== STATIC ASSETS ==========

// Images
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: CACHE_NAMES.IMAGES,
    plugins: [
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 })
    ]
  })
);

// CSS & JS
registerRoute(
  ({ request }) =>
    request.destination === 'style' ||
    request.destination === 'script',
  new StaleWhileRevalidate({
    cacheName: CACHE_NAMES.STATIC
  })
);

// Fonts
registerRoute(
  ({ request }) => request.destination === 'font',
  new CacheFirst({
    cacheName: CACHE_NAMES.STATIC,
    plugins: [
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 })
    ]
  })
);

// ========== MAP TILES ==========

registerRoute(
  ({ url }) => url.hostname.includes('tile.openstreetmap.org'),
  new CacheFirst({
    cacheName: CACHE_NAMES.MAPS,
    plugins: [
      new ExpirationPlugin({ maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 30 })
    ]
  })
);

// ========== DOCUMENT STORAGE ==========

registerRoute(
  ({ url }) => url.pathname.startsWith('/api/storage/'),
  new CacheFirst({
    cacheName: CACHE_NAMES.DOCUMENTS,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 })
    ]
  })
);

// ========== NAVIGATION (SPA) ==========

// Navigation requests - serve index.html
registerRoute(
  new NavigationRoute(
    new NetworkFirst({
      cacheName: CACHE_NAMES.STATIC,
      networkTimeoutSeconds: 5,
      plugins: [
        new CacheableResponsePlugin({ statuses: [0, 200] })
      ]
    }),
    {
      denylist: [/^\/api\//, /^\/ws/]
    }
  )
);

// ========== OFFLINE FALLBACKS ==========

// Cache offline fallback page during install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAMES.OFFLINE).then((cache) => {
      return cache.addAll([
        OFFLINE_FALLBACK_PAGE,
        OFFLINE_FALLBACK_IMAGE,
        '/cofin-logo.png'
      ]).catch(err => {
        console.log('[SW] Some offline resources not available:', err);
      });
    })
  );
});

// Serve offline fallback for failed navigation
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cache = await caches.open(CACHE_NAMES.OFFLINE);
        const cachedResponse = await cache.match(OFFLINE_FALLBACK_PAGE);
        return cachedResponse || new Response('Offline - Page non disponible', {
          status: 503,
          headers: { 'Content-Type': 'text/html' }
        });
      })
    );
  }
});

// ========== PUSH NOTIFICATIONS ==========

self.addEventListener('push', (event) => {
  let data: any = {};

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'COFIN&CO-M', body: event.data.text() };
    }
  }

  const options: any = {
    body: data.body || 'Nouvelle notification',
    icon: data.icon || '/icons/icon-192x192.png',
    badge: data.badge || '/icons/badge-72x72.png',
    image: data.image,
    vibrate: [200, 100, 200],
    tag: data.tag || 'cofin-notification',
    requireInteraction: data.requireInteraction || false,
    renotify: true,
    data: {
      url: data.data?.url || '/',
      type: data.data?.type || 'general',
      ...data.data
    },
    actions: data.actions || [
      { action: 'view', title: 'Voir' },
      { action: 'dismiss', title: 'Fermer' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'COFIN&CO-M', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const action = event.action;
  const url = event.notification.data?.url || '/';

  if (action === 'dismiss') return;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ((client.url as string).includes(self.location.origin) && 'focus' in client) {
            (client as WindowClient).focus();
            if (url && url !== '/') {
              (client as WindowClient).navigate(url);
            }
            return;
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      })
  );
});

// ========== BACKGROUND SYNC ==========

self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);

  if (event.tag === 'financial-operations') {
    event.waitUntil(financialSyncQueue.replayRequests());
  } else if (event.tag === 'general-operations') {
    event.waitUntil(generalSyncQueue.replayRequests());
  }
});

// ========== PERIODIC SYNC ==========

self.addEventListener('periodicsync', (event: any) => {
  console.log('[SW] Periodic sync:', event.tag);

  if (event.tag === 'sync-pending-operations') {
    event.waitUntil(syncPendingOperations());
  } else if (event.tag === 'refresh-cache') {
    event.waitUntil(refreshCriticalCache());
  }
});

async function syncPendingOperations(): Promise<void> {
  // Notify clients to trigger sync
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'PERIODIC_SYNC_TRIGGER' });
  });
}

async function refreshCriticalCache(): Promise<void> {
  const cache = await caches.open(CACHE_NAMES.API);
  const criticalUrls = [
    '/api/parametres/general',
    '/api/agences',
    '/api/user/profile'
  ];

  for (const url of criticalUrls) {
    try {
      const response = await fetch(url, { credentials: 'include' });
      if (response.ok) {
        await cache.put(url, response);
      }
    } catch (error) {
      console.log('[SW] Failed to refresh:', url);
    }
  }
}

// ========== MESSAGE HANDLING ==========

self.addEventListener('message', async (event) => {
  const { type, payload } = event.data || {};

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'CACHE_URLS':
      if (Array.isArray(payload?.urls)) {
        const cache = await caches.open(CACHE_NAMES.API);
        await Promise.allSettled(
          payload.urls.map((url: string) =>
            fetch(url, { credentials: 'include' })
              .then(response => response.ok ? cache.put(url, response) : null)
          )
        );
      }
      break;

    case 'CLEAR_CACHE':
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(name => name.startsWith('cofin-'))
          .map(name => caches.delete(name))
      );
      break;

    case 'GET_QUEUE_STATUS':
      const financialCount = await financialSyncQueue.size();
      const generalCount = await generalSyncQueue.size();

      event.ports?.[0]?.postMessage({
        financial: financialCount,
        general: generalCount,
        total: financialCount + generalCount
      });
      break;

    case 'FORCE_SYNC':
      try {
        await financialSyncQueue.replayRequests();
        await generalSyncQueue.replayRequests();
        event.ports?.[0]?.postMessage({ success: true });
      } catch (error) {
        event.ports?.[0]?.postMessage({ success: false, error: String(error) });
      }
      break;
  }
});

// ========== ACTIVATION ==========

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating new service worker...');

  event.waitUntil(
    (async () => {
      // Clean up old caches
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(name => !Object.values(CACHE_NAMES).includes(name as any))
          .map(name => caches.delete(name))
      );

      // Take control of all clients
      await self.clients.claim();

      console.log('[SW] Service worker activated and controlling');
    })()
  );
});

export {};
