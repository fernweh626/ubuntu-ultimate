/*
 * Makes the web version "cross-origin isolated" so the on-device database (expo-sqlite, which runs
 * as WebAssembly and needs SharedArrayBuffer) works on hosts that can't set the COOP/COEP headers
 * themselves — the Expo dev server's HTML page, and static hosts like GitHub Pages.
 * Runs in two places: as a service worker (adds the headers to every response) and as a normal
 * script in the page (registers the worker, then reloads once so it takes effect).
 */
if (typeof window === 'undefined') {
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
  self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;
    event.respondWith(
      fetch(request).then((response) => {
        if (response.status === 0) return response;
        const headers = new Headers(response.headers);
        headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
        headers.set('Cross-Origin-Opener-Policy', 'same-origin');
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
      }),
    );
  });
} else if (!window.crossOriginIsolated && window.isSecureContext && 'serviceWorker' in navigator) {
  // Reload at most once per tab, so a browser that can't be isolated doesn't loop.
  const tried = sessionStorage.getItem('coi-reloaded');
  navigator.serviceWorker.register(document.currentScript.src).then(() => {
    navigator.serviceWorker.ready.then(() => {
      if (!tried) {
        sessionStorage.setItem('coi-reloaded', '1');
        window.location.reload();
      }
    });
  });
}
