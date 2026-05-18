/* Glint Service Worker — v3 */
'use strict';

const CACHE   = 'glint-v3';
const SHELL   = [
  '/app.html',
  '/settings.html',
  '/wellness.html',
  '/login.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ── Install: cache app shell ─────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ───────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: network-first for API, cache-first for shell ──────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Skip cross-origin, non-GET, SSE streams
  if (e.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (e.request.headers.get('accept')?.includes('text/event-stream')) return;

  // API calls: network-first, no caching
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // App shell: stale-while-revalidate
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(e.request);
      const fetchPromise = fetch(e.request).then(res => {
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      }).catch(() => null);
      return cached || fetchPromise || new Response('Offline', { status: 503 });
    })
  );
});

// ── Push notifications ────────────────────────────────────────────────────────
self.addEventListener('push', e => {
  let data = { title: 'Glint', body: 'Nuovo aggiornamento disponibile.', tag: 'glint-update' };
  try { if (e.data) data = { ...data, ...e.data.json() }; } catch {}

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      tag:     data.tag || 'glint',
      icon:    '/icons/icon-192.png',
      badge:   '/icons/icon-192.png',
      vibrate: [200, 100, 200],
      data:    { url: data.url || '/app.html' },
      actions: data.actions || [],
      requireInteraction: data.requireInteraction || false,
    })
  );
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/app.html';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (new URL(c.url).pathname === new URL(url, self.location.origin).pathname) {
          return c.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

// ── Background sync (offline action queue) ────────────────────────────────────
self.addEventListener('sync', e => {
  if (e.tag === 'glint-sync') {
    e.waitUntil(flushOfflineQueue());
  }
});

async function flushOfflineQueue() {
  try {
    const db = await openIDB();
    const items = await idbGetAll(db, 'offlineQueue');
    for (const item of items) {
      try {
        await fetch(item.url, { method: item.method, headers: item.headers, body: item.body, credentials: 'include' });
        await idbDelete(db, 'offlineQueue', item.id);
      } catch {}
    }
  } catch {}
}

// ── Minimal IndexedDB helpers ─────────────────────────────────────────────────
function openIDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('glint-offline', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('offlineQueue', { keyPath: 'id', autoIncrement: true });
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}
function idbGetAll(db, store) {
  return new Promise((res, rej) => {
    const req = db.transaction(store,'readonly').objectStore(store).getAll();
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}
function idbDelete(db, store, key) {
  return new Promise((res, rej) => {
    const req = db.transaction(store,'readwrite').objectStore(store).delete(key);
    req.onsuccess = () => res();
    req.onerror   = e => rej(e.target.error);
  });
}
