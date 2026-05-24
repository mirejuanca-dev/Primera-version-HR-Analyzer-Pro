// ============================================================
// HR Analyzer Pro — Service Worker
// Versión de caché: actualiza CACHE_VERSION para forzar
// recarga en todos los dispositivos al subir cambios.
// ============================================================

const CACHE_VERSION = 'hra-v1';
const CACHE_NAME = `hr-analyzer-${CACHE_VERSION}`;

// Recursos que se cachean en la instalación (shell de la app)
const PRECACHE_URLS = [
  '/Primera-version-HR-Analyzer-Pro/',
  '/Primera-version-HR-Analyzer-Pro/index.html',
  '/Primera-version-HR-Analyzer-Pro/manifest.json',
  // jsPDF desde CDN — se cachea para uso offline
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
];

// ============================================================
// INSTALL — descarga y cachea todos los recursos esenciales
// ============================================================
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Precacheando recursos…');
      return Promise.allSettled(
        PRECACHE_URLS.map(url =>
          cache.add(url).catch(err =>
            console.warn('[SW] No se pudo cachear:', url, err)
          )
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ============================================================
// ACTIVATE — elimina cachés antiguas
// ============================================================
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith('hr-analyzer-') && key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Eliminando caché antigua:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ============================================================
// FETCH — estrategia Cache First con fallback a red
//
// Lógica:
// 1. Busca en caché → si existe, devuelve inmediatamente
// 2. Si no está en caché → va a la red, guarda la respuesta
//    en caché para la próxima vez y la devuelve
// 3. Si la red falla y no hay caché → devuelve página offline
// ============================================================
self.addEventListener('fetch', event => {
  // Solo intercepta GET
  if (event.request.method !== 'GET') return;

  // No intercepta chrome-extension ni otros esquemas
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Recurso en caché: sirve inmediatamente
        // y actualiza en segundo plano (stale-while-revalidate)
        const fetchPromise = fetch(event.request)
          .then(response => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(() => {}); // Sin conexión: ignorar actualización silenciosamente

        return cached;
      }

      // No está en caché: va a la red
      return fetch(event.request)
        .then(response => {
          if (!response || response.status !== 200 || response.type === 'opaque') {
            return response;
          }
          // Guarda en caché para futuras visitas offline
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => {
          // Sin red y sin caché — devuelve página offline mínima
          return new Response(
            `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>HR Analyzer Pro — Sin conexión</title>
  <style>
    body { font-family: system-ui; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; margin: 0;
           background: #f0f2f5; color: #111827; text-align: center; padding: 20px; }
    .card { background: #fff; border-radius: 12px; padding: 32px;
            max-width: 320px; box-shadow: 0 4px 20px rgba(0,0,0,.1); }
    h1 { color: #0070f3; font-size: 20px; margin-bottom: 8px; }
    p { color: #6b7280; font-size: 14px; line-height: 1.6; }
    .icon { font-size: 48px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">📡</div>
    <h1>HR Analyzer Pro</h1>
    <p>Sin conexión a internet.<br>
    Conéctate una vez para que la app quede disponible offline.</p>
  </div>
</body>
</html>`,
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        });
    })
  );
});
