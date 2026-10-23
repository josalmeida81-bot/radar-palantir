const NOME = 'radar-v1';
const FICHEIROS = ['./', './index.html', './app.js', './manifest.json', './icon.svg'];
self.addEventListener('install', e => e.waitUntil(caches.open(NOME).then(c => c.addAll(FICHEIROS))));
self.addEventListener('fetch', e => {
  if (e.request.url.includes('financialmodelingprep')) return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
