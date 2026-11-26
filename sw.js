/* ------------------------------------------------------------------
   sw.js — offline support. Emitted to dist/sw.js by build.js, which
   stamps VERSION with a hash of everything it precaches, so each
   build gets a fresh cache and old ones are dropped.

   The page is fetched network-first. What comes back decides what the
   family sees:
     the app (200)            → show it, and keep it as the offline copy
     password screen (401)    → show it, so a lapsed session asks for the
       or a redirect            password instead of quietly serving an
                                old copy that can never update
     an error, no signal, or  → the offline copy
       nothing within 4 s
   Icons and the manifest are cache-first — they never change without
   the version changing too.
   ------------------------------------------------------------------ */
const VERSION = "2a19158fd2b1";
const CACHE = "widows-dower-" + VERSION;
const ASSETS = ["./","manifest.webmanifest","icon.svg","icon-192.png","icon-512.png","apple-touch-icon.png"];
const NETWORK_TIMEOUT_MS = 4000;
/* The one page worth keeping offline: the app at the root of our scope. */
const APP = new URL("./", self.registration.scope).href;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys
      .filter(k => k.startsWith("widows-dower-") && k !== CACHE)
      .map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function page(e) {
  const req = e.request;
  const isApp = new URL(req.url).pathname === new URL(APP).pathname;
  let saved;                                   // keeps the worker alive until
  e.waitUntil(new Promise(r => (saved = r)));  // the offline copy is written

  return new Promise(resolve => {
    let settled = false;
    const show = r => { if (!settled) { settled = true; resolve(r); } };
    const offline = () => caches.open(CACHE)
      .then(c => c.match(APP))
      .then(r => show(r || Response.error()));
    const timer = setTimeout(offline, NETWORK_TIMEOUT_MS);

    fetch(req).then(res => {
      clearTimeout(timer);
      if (res.status === 401 || res.type === "opaqueredirect") { saved(); return show(res); }
      if (!res.ok) { saved(); return offline(); }
      if (isApp) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(APP, copy)).then(saved, saved);
      } else saved();
      show(res);  // arrives after the timeout? Still refreshed the copy above.
    }).catch(() => { clearTimeout(timer); saved(); offline(); });
  });
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === "navigate") { e.respondWith(page(e)); return; }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req)));
});
