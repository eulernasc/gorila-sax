const CACHE = 'gorila-sax-v1';
const FILES = ['./','./index.html','./style.css','./app.js','./manifest.webmanifest','./assets/icon.svg','./assets/sax-riff.wav'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));
