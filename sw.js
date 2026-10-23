'use strict';
/* Service worker de la PWA.
   - Los archivos de la app (mismo origen) van "red primero": siempre se ve la última versión y, sin conexión, la copia guardada.
   - Las fuentes y la librería de Supabase (CDN, con versión fija) van "caché primero".
   - Nunca se intercepta nada más (la API, la autenticación y las fotos de Supabase) ni los métodos distintos de GET:
     los datos del negocio no se guardan en caché. */

const BUILD = '__BUILD__';            // scripts/build.js lo reemplaza por una huella de los archivos
const CACHE = 'plante-' + BUILD;
const SHELL = ['__SHELL__'];          // scripts/build.js lo reemplaza por la lista de archivos de la app
const CDN = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // un archivo que falle no debe impedir instalar el resto
    await Promise.allSettled(SHELL.filter(u => !u.startsWith('__')).map(u => cache.add(new Request(u, {cache: 'reload'}))));
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('plante-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// la página avisa cuando el usuario acepta actualizar
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

const cacheable = r => r && (r.ok || r.type === 'opaque');

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        const hit = await cache.match(req, {ignoreSearch: true});
        if (hit) return hit;
        if (req.mode === 'navigate') { const shell = await cache.match('index.html'); if (shell) return shell; }
        throw err;
      }
    })());
    return;
  }

  if (CDN.includes(url.hostname)) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (cacheable(res)) cache.put(req, res.clone());
      return res;
    })());
  }
});
