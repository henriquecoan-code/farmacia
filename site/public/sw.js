// O site antigo (Firebase) registrava um service worker neste mesmo endereço e guardava as páginas
// antigas em cache. Este arquivo toma o lugar dele: apaga esses caches, se desregistra e recarrega as
// abas abertas, para quem já tinha visitado o site antigo passar a ver o novo. O site novo não usa
// service worker; este arquivo pode ser removido alguns meses depois da troca.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.map((n) => caches.delete(n)));
    await self.registration.unregister();
    const abas = await self.clients.matchAll({ type: 'window' });
    for (const aba of abas) aba.navigate(aba.url).catch(() => {});
  })());
});
