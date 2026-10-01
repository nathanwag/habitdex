/* Service worker: app offline + exibicao dos lembretes (push).
 *
 * Cache no mesmo esquema do Glub: navegacao rede-primeiro, demais arquivos
 * cache-primeiro com revalidacao. Bumpar VERSION e como se deploya.
 */

const VERSION = 'habitos-v2';

// Em localhost o cache atrapalha mais do que ajuda; o SW fica transparente
// (mas continua exibindo push, pra testar notificacao no desktop).
const DEV = self.location.hostname === 'localhost';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/ui.js',
  './js/db.js',
  './js/reminder.js',
  './js/habits.js',
  './js/views/today.js',
  './js/views/habit.js',
  './js/views/habit-form.js',
  './js/views/habits.js',
];

// Cache e so aceleracao: se o CacheStorage falhar, segue sem ele.
const quiet = (promise) => promise.catch(() => null);

self.addEventListener('install', (event) => {
  if (DEV) { self.skipWaiting(); return; }
  event.waitUntil((async () => {
    // Falha de cache nao pode derrubar a instalacao: sem SW nao ha push, e
    // lembrete importa mais que abrir offline. Por isso o try, e o add um a
    // um (addAll aborta tudo se um item falhar).
    try {
      const cache = await caches.open(VERSION);
      await Promise.all(ASSETS.map((url) => cache.add(url).catch(() => {})));
    } catch (err) {
      console.error('precache falhou', err);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = (await quiet(caches.keys())) || [];
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => quiet(caches.delete(k))));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (DEV) return;
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // A API e sempre ao vivo: estado de lembrete em cache mentiria.
  if (url.origin !== self.location.origin || url.pathname.includes('/api/')) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        quiet(caches.open(VERSION).then((c) => c.put('./index.html', fresh.clone())));
        return fresh;
      } catch {
        return (await quiet(caches.match('./index.html'))) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await quiet(caches.match(req));
    const network = fetch(req)
      .then((res) => {
        if (res && res.ok) quiet(caches.open(VERSION).then((c) => c.put(req, res.clone())));
        return res;
      })
      .catch(() => null);
    return cached || (await network) || Response.error();
  })());
});
