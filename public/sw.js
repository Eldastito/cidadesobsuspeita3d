/**
 * Cidade Sob Suspeita 3D — Service worker mínimo (PWA opcional, Fase 5)
 * Cache-first apenas para assets com hash no nome (imutáveis do Vite);
 * todo o resto — HTML, API e WebSocket — vai sempre à rede.
 * O jogo é online por natureza: o SW existe para instalação e partidas
 * mais rápidas de carregar, nunca para jogar offline.
 */

const CACHE_NAME = 'cidade-sob-suspeita-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Apenas assets imutáveis (nomes com hash do Vite) e o ícone
  if (!url.pathname.startsWith('/assets/') && url.pathname !== '/icon.svg') return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })()
  );
});
