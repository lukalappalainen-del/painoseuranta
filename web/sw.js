// sw.js – service worker: tallentaa sovelluksen tiedostot välimuistiin,
// jotta sovellus aukeaa myös ilman verkkoyhteyttä.
//
// Strategia "stale-while-revalidate": tiedosto annetaan heti välimuistista,
// ja samalla haetaan taustalla uusi versio seuraavaa avauskertaa varten.
// Näin julkaistut päivitykset tulevat käyttöön itsestään (viimeistään
// toisella avauskerralla), eikä versionumeroa tarvitse muistaa vaihtaa.

const VALIMUISTI = "painoseuranta-v1";
const TIEDOSTOT = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.webmanifest",
  "./vendor/chart.umd.min.js",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

// Asennus: haetaan kaikki tiedostot välimuistiin.
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VALIMUISTI).then((c) => c.addAll(TIEDOSTOT)));
  self.skipWaiting();
});

// Aktivointi: poistetaan vanhojen versioiden välimuistit.
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((nimet) => Promise.all(nimet.filter((n) => n !== VALIMUISTI).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Pyynnöt: välimuisti ensin, verkko päivittää taustalla.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;

  e.respondWith(
    caches.open(VALIMUISTI).then(async (valimuisti) => {
      // ignoreSearch: "./?jotain" löytää silti "./"-version
      const tallessa = await valimuisti.match(e.request, { ignoreSearch: true });
      const verkosta = fetch(e.request)
        .then((vastaus) => {
          if (vastaus.ok) valimuisti.put(e.request, vastaus.clone());
          return vastaus;
        })
        .catch(() => tallessa);   // offline: tyydytään välimuistiin
      if (tallessa) {
        e.waitUntil(verkosta);    // pidetään service worker hereillä päivityksen ajan
        return tallessa;
      }
      return verkosta;
    })
  );
});
