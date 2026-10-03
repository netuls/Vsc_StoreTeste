// Push (FCM): a config chega pela URL de registro (?cfg=), definida no config.js
try {
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js', 'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
  firebase.initializeApp(JSON.parse(new URL(self.location).searchParams.get('cfg')));
  firebase.messaging().onBackgroundMessage(m => self.registration.showNotification(m.data.title, { body: m.data.body, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'pedido' }));
} catch (e) {}
self.addEventListener('notificationclick', e => { e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then(l => { const w = l.find(x => x.url.includes('admin.html')); return w ? w.focus() : clients.openWindow('admin.html'); })); });

const V = 'vsc-v3', SHELL = ['./', 'index.html', 'admin.html', 'style.css', 'app.js', 'admin.js', 'config.js', 'logo-emblem.png', 'logo-full.png', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;   // Firebase/CDN passam direto
  e.respondWith(fetch(r).then(res => { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); return res; }).catch(() => caches.match(r).then(m => m || caches.match('index.html'))));
});
