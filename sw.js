/**
 * Service Worker mínimo — necessário para o Chrome considerar o site
 * "instalável" (requisito do beforeinstallprompt). Cache básico app-shell.
 *
 * Bump CACHE_NAME a cada deploy com mudança de conteúdo — é o que força o
 * browser a tratar isso como um SW novo (senão ele nunca reinstala, e o
 * app-shell antigo fica preso em cache pra sempre nos clientes já visitados).
 */

const CACHE_NAME = 'mtg-counter-v2';
const APP_SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/ui.js',
  './js/game.js',
  './js/dice.js',
  './js/oracle.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/**
 * Stale-while-revalidate: responde com o cache na hora (rápido, funciona
 * offline), mas sempre busca uma versão nova em paralelo e atualiza o
 * cache pra próxima visita — assim um deploy novo se propaga sozinho em
 * no máximo duas cargas de página, sem depender de lembrar de trocar
 * CACHE_NAME toda vez.
 */
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('script.google.com')) return; // API do Apps Script: sempre rede

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
