// app.js – Painoseurannan logiikka.
//
// Rakenne on sama kuin paino.py:ssä:
//   1. tietojen käsittely (lueTiedot, tallennaTiedot, lisaaPaiva)
//   2. apufunktiot (lukujen ja päivämäärien muunnokset)
//   3. näkymän piirtäminen (yhteenveto, kaaviot, lista)
//   4. tapahtumat (lomake, CSV-vienti ja -tuonti)
//
// Data tallennetaan selaimen localStorageen. Se säilyy laitteella,
// mutta ei siirry muille laitteille – siksi CSV-vienti varmuuskopioksi.

"use strict";   // tiukempi tila: JavaScript huomauttaa useammista virheistä

// --- 1. Tietojen käsittely -------------------------------------------------

const AVAIN = "painoseuranta";   // localStorage-avain

/** Lukee merkinnät. Palauttaa taulukon {paiva, paino, kalorit}. */
function lueTiedot() {
  try {
    // localStorage tallentaa vain tekstiä, joten data on JSON-muodossa.
    return JSON.parse(localStorage.getItem(AVAIN)) || [];
  } catch {
    return [];
  }
}

/** Tallentaa kaikki merkinnät (vanha sisältö korvataan). */
function tallennaTiedot(rivit) {
  localStorage.setItem(AVAIN, JSON.stringify(rivit));
}

/** Lisää merkinnän päivälle. Saman päivän vanha merkintä korvataan. */
function lisaaPaiva(rivit, paiva, paino, kalorit) {
  // filter = Pythonin listakooste: pidetään kaikki paitsi saman päivän rivi.
  const uudet = rivit.filter((r) => r.paiva !== paiva);
  uudet.push({ paiva, paino, kalorit: Math.round(kalorit) });
  // VVVV-KK-PP-muotoiset tekstit järjestyvät oikein suoraan aakkosjärjestyksessä.
  uudet.sort((a, b) => a.paiva.localeCompare(b.paiva));
  return uudet;
}

// --- 2. Apufunktiot --------------------------------------------------------

/** Teksti luvuksi. Hyväksyy pilkun. Palauttaa null, jos teksti ei ole luku. */
function muutaLuvuksi(teksti) {
  const t = String(teksti).trim().replace(",", ".");
  if (t === "") return null;
  const luku = Number(t);   // Number("82abc") on NaN, toisin kuin parseFloat
  return Number.isFinite(luku) ? luku : null;
}

/** Date-olio tekstiksi VVVV-KK-PP paikallisen ajan mukaan. */
function isoPaiva(d) {
  const kk = String(d.getMonth() + 1).padStart(2, "0");   // kuukaudet alkavat nollasta!
  const pv = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${kk}-${pv}`;
}

/** Teksti VVVV-KK-PP Date-olioksi (paikallista aikaa). Null, jos päivää ei ole. */
function paivaksi(teksti) {
  const osat = /^(\d{4})-(\d{2})-(\d{2})$/.exec(teksti);
  if (!osat) return null;
  const [v, kk, pv] = [Number(osat[1]), Number(osat[2]), Number(osat[3])];
  const d = new Date(v, kk - 1, pv);
  // Date "korjaa" esim. 31.2. -> 3.3., joten tarkistetaan, että osat pysyivät samoina.
  return d.getFullYear() === v && d.getMonth() === kk - 1 && d.getDate() === pv ? d : null;
}

const tanaanIso = () => isoPaiva(new Date());

// Suomalaiset muotoilut: 82,4 ja 17.11.2026
const kgMuoto = new Intl.NumberFormat("fi-FI", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const kokonaisMuoto = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 0 });
const pvmPitka = (iso) => paivaksi(iso).toLocaleDateString("fi-FI", { weekday: "short", day: "numeric", month: "numeric", year: "numeric" });
const pvmLyhyt = (iso) => { const d = paivaksi(iso); return `${d.getDate()}.${d.getMonth() + 1}.`; };

/**
 * Tekee kaavioita varten jatkuvan päivälistan ensimmäisestä viimeiseen
 * merkintään. Puuttuville päiville arvo on null, jolloin aikavälit näkyvät
 * kaaviossa oikein ilman erillistä aika-akselikirjastoa.
 */
function paivittainen(rivit) {
  const haku = new Map(rivit.map((r) => [r.paiva, r]));   // päivä -> merkintä
  const paivat = [];
  const d = paivaksi(rivit[0].paiva);
  const loppu = rivit[rivit.length - 1].paiva;
  while (isoPaiva(d) <= loppu) {
    paivat.push(isoPaiva(d));
    d.setDate(d.getDate() + 1);   // seuraava päivä (hoitaa kuun ja vuoden vaihteet)
  }
  return paivat.map((p) => haku.get(p) || { paiva: p, paino: null, kalorit: null });
}

/**
 * 7 päivän liukuva keskiarvo: jokaiselle päivälle sen ja kuuden edellisen
 * kalenteripäivän painomittausten keskiarvo. Null, jos jaksolla ei ole mittauksia.
 */
function liukuvaKeskiarvo(paivat, ikkuna = 7) {
  return paivat.map((_, i) => {
    const jakso = paivat.slice(Math.max(0, i - ikkuna + 1), i + 1)
      .map((p) => p.paino)
      .filter((p) => p !== null);
    return jakso.length ? jakso.reduce((a, b) => a + b, 0) / jakso.length : null;
  });
}

// --- 3. Näkymä -------------------------------------------------------------

// document.getElementById hakee HTML:stä elementin id:n perusteella.
const $ = (id) => document.getElementById(id);
const lomake = $("lomake");
const paivaKentta = $("paiva");
const painoKentta = $("paino");
const kaloriKentta = $("kalorit");

let naytaKaikki = false;          // näytetäänkö koko merkintälista
let kaaviot = null;               // Chart.js-oliot luodaan ensimmäisellä piirrolla

function naytaViesti(elementti, teksti, tyyppi = "") {
  elementti.textContent = teksti;
  elementti.className = `tila ${tyyppi}`;
}

/** Piirtää kaiken uudelleen nykyisistä tiedoista. */
function paivitaNakyma() {
  const rivit = lueTiedot();
  paivitaYhteenveto(rivit);
  paivitaKaaviot(rivit);
  paivitaLista(rivit);
}

function paivitaYhteenveto(rivit) {
  const viimeisin = $("yv-viimeisin");
  const keskiarvo = $("yv-keskiarvo");
  const muutos = $("yv-muutos");
  if (!rivit.length) {
    viimeisin.textContent = keskiarvo.textContent = muutos.textContent = "–";
    muutos.className = "arvo";
    return;
  }
  const viimeinen = rivit[rivit.length - 1];
  viimeisin.textContent = `${kgMuoto.format(viimeinen.paino)} kg`;

  const ka = liukuvaKeskiarvo(paivittainen(rivit)).at(-1);   // at(-1) = viimeinen alkio
  keskiarvo.textContent = `${kgMuoto.format(ka)} kg`;

  const ero = viimeinen.paino - rivit[0].paino;
  const etumerkki = ero > 0 ? "+" : ero < 0 ? "−" : "±";
  muutos.textContent = `${etumerkki}${kgMuoto.format(Math.abs(ero))} kg`;
  muutos.className = `arvo ${ero < 0 ? "laski" : ero > 0 ? "nousi" : ""}`;
}

/** Luo kaaviot kerran; myöhemmin vain vaihdetaan data ja kutsutaan update(). */
function luoKaaviot() {
  Chart.defaults.color = "#9a9a9a";
  Chart.defaults.borderColor = "#2c2c2c";
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;

  const yhteiset = {
    responsive: true,
    maintainAspectRatio: false,          // korkeus tulee CSS:stä (.kaavio)
    animation: { duration: 300 },
    interaction: { mode: "index", intersect: false },   // kosketus näyttää päivän arvot
    plugins: {
      legend: { labels: { boxWidth: 12, boxHeight: 12, usePointStyle: true } },
      tooltip: {
        filter: (kohta) => kohta.raw !== null,   // ei tyhjiä rivejä tooltipiin
        callbacks: { title: (kohdat) => pvmPitka(kohdat[0].label) },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        // Akselille lyhyt muoto 17.11., korkeintaan 6 merkintää.
        ticks: { maxTicksLimit: 6, maxRotation: 0, callback(arvo) { return pvmLyhyt(this.getLabelForValue(arvo)); } },
      },
    },
  };

  const paino = new Chart($("painokaavio"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Paino",
          data: [],
          borderColor: "#4a9fe8",
          backgroundColor: "#4a9fe8",
          borderWidth: 2,
          pointRadius: 3,
          spanGaps: true,             // viiva jatkuu päivien yli, joilta puuttuu mittaus
          tension: 0.2,
        },
        {
          label: "7 pv keskiarvo",
          data: [],
          borderColor: "#e8e8e8",
          backgroundColor: "#e8e8e8",
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
          spanGaps: true,
          tension: 0.3,
        },
      ],
    },
    options: {
      ...yhteiset,   // "spread": kopioidaan yhteiset asetukset tähän
      plugins: {
        ...yhteiset.plugins,
        tooltip: { ...yhteiset.plugins.tooltip, callbacks: { ...yhteiset.plugins.tooltip.callbacks, label: (k) => ` ${k.dataset.label}: ${kgMuoto.format(k.raw)} kg` } },
      },
      scales: { ...yhteiset.scales, y: { ticks: { callback: (v) => `${kgMuoto.format(v)}` } } },
    },
  });

  const kalorit = new Chart($("kalorikaavio"), {
    type: "bar",
    data: {
      labels: [],
      datasets: [
        { label: "Kalorit", data: [], backgroundColor: "#e8913a", borderRadius: 4, maxBarThickness: 28 },
        // Keskiarvo vaakasuorana katkoviivana (line-tyyppi pylväskaavion päällä).
        { type: "line", label: "Keskiarvo", data: [], borderColor: "#9a9a9a", borderWidth: 1.5, borderDash: [6, 4], pointRadius: 0 },
      ],
    },
    options: {
      ...yhteiset,
      plugins: {
        ...yhteiset.plugins,
        tooltip: { ...yhteiset.plugins.tooltip, callbacks: { ...yhteiset.plugins.tooltip.callbacks, label: (k) => ` ${k.dataset.label}: ${kokonaisMuoto.format(k.raw)} kcal` } },
      },
      scales: { ...yhteiset.scales, y: { beginAtZero: true, ticks: { callback: (v) => kokonaisMuoto.format(v) } } },
    },
  });

  return { paino, kalorit };
}

function paivitaKaaviot(rivit) {
  // Tyhjänä näytetään teksti kaavion sijaan.
  document.querySelectorAll(".kaavio").forEach((k) => { k.hidden = !rivit.length; });
  document.querySelectorAll(".tyhja").forEach((t) => { t.hidden = rivit.length > 0; });
  if (!rivit.length || typeof Chart === "undefined") return;

  kaaviot ??= luoKaaviot();   // ??= : luodaan vain, jos ei vielä ole
  const paivat = paivittainen(rivit);
  const labels = paivat.map((p) => p.paiva);

  kaaviot.paino.data.labels = labels;
  kaaviot.paino.data.datasets[0].data = paivat.map((p) => p.paino);
  kaaviot.paino.data.datasets[1].data = liukuvaKeskiarvo(paivat);
  kaaviot.paino.update();

  const kalorit = rivit.map((r) => r.kalorit);
  const ka = kalorit.reduce((a, b) => a + b, 0) / kalorit.length;
  kaaviot.kalorit.data.labels = labels;
  kaaviot.kalorit.data.datasets[0].data = paivat.map((p) => p.kalorit);
  kaaviot.kalorit.data.datasets[1].data = labels.map(() => ka);
  kaaviot.kalorit.data.datasets[1].label = `Keskiarvo ${kokonaisMuoto.format(ka)} kcal`;
  kaaviot.kalorit.update();
}

function paivitaLista(rivit) {
  const lista = $("lista");
  const nappi = $("nayta-kaikki");
  const NAKYVIA = 14;
  const uusinEnsin = [...rivit].reverse();
  const naytettavat = naytaKaikki ? uusinEnsin : uusinEnsin.slice(0, NAKYVIA);

  lista.replaceChildren();   // tyhjennetään vanha lista
  for (const r of naytettavat) {
    const li = document.createElement("li");

    const merkinta = document.createElement("button");
    merkinta.type = "button";
    merkinta.className = "merkinta";
    // textContent (ei innerHTML) -> tiedoston sisältö ei voi tulkkiutua HTML:ksi.
    for (const [luokka, teksti] of [
      ["pvm", pvmPitka(r.paiva)],
      ["kg", `${kgMuoto.format(r.paino)} kg`],
      ["kcal", `${kokonaisMuoto.format(r.kalorit)} kcal`],
    ]) {
      const span = document.createElement("span");
      span.className = luokka;
      span.textContent = teksti;
      merkinta.append(span);
    }
    merkinta.addEventListener("click", () => muokkaa(r));

    const poista = document.createElement("button");
    poista.type = "button";
    poista.className = "poista";
    poista.textContent = "×";
    poista.setAttribute("aria-label", `Poista ${pvmPitka(r.paiva)}`);
    poista.addEventListener("click", () => poistaMerkinta(r.paiva));

    li.append(merkinta, poista);
    lista.append(li);
  }

  nappi.hidden = rivit.length <= NAKYVIA;
  nappi.textContent = naytaKaikki ? "Näytä vähemmän" : `Näytä kaikki (${rivit.length})`;
}

// --- 4. Tapahtumat ---------------------------------------------------------

let automaattisestiTaytetty = false;   // täytettiinkö kentät valitun päivän tiedoilla

/** Kun päivä vaihtuu: jos sille on jo tiedot, näytetään ne kentissä. */
function taytaPaivanTiedot() {
  const rivi = lueTiedot().find((r) => r.paiva === paivaKentta.value);
  if (rivi) {
    painoKentta.value = kgMuoto.format(rivi.paino);
    kaloriKentta.value = rivi.kalorit;
    automaattisestiTaytetty = true;
    naytaViesti($("tila"), "Tälle päivälle on jo tiedot – tallennus korvaa ne.");
  } else {
    if (automaattisestiTaytetty) {   // ei jätetä toisen päivän arvoja kenttiin
      painoKentta.value = kaloriKentta.value = "";
      automaattisestiTaytetty = false;
    }
    naytaViesti($("tila"), "");
  }
}

function muokkaa(rivi) {
  paivaKentta.value = rivi.paiva;
  taytaPaivanTiedot();
  $("lomake-kortti").scrollIntoView({ behavior: "smooth", block: "start" });
}

function poistaMerkinta(paiva) {
  if (!confirm(`Poistetaanko merkintä ${pvmPitka(paiva)}?`)) return;
  tallennaTiedot(lueTiedot().filter((r) => r.paiva !== paiva));
  paivitaNakyma();
  if (paivaKentta.value === paiva) taytaPaivanTiedot();
}

lomake.addEventListener("submit", (tapahtuma) => {
  tapahtuma.preventDefault();   // estetään selaimen oletus (sivun uudelleenlataus)
  const tila = $("tila");
  const paiva = paivaKentta.value;
  const paino = muutaLuvuksi(painoKentta.value);
  const kalorit = muutaLuvuksi(kaloriKentta.value);

  // Tarkistukset kuten paino.py:n lisäysikkunassa.
  if (!paivaksi(paiva)) return naytaViesti(tila, "Valitse päivämäärä.", "virhe");
  if (paiva > tanaanIso()) return naytaViesti(tila, "Päivämäärä ei voi olla tulevaisuudessa.", "virhe");
  if (paino === null || kalorit === null) return naytaViesti(tila, "Anna sekä paino että kalorit lukuina.", "virhe");
  if (paino <= 0 || kalorit < 0) return naytaViesti(tila, "Tarkista luvut.", "virhe");

  const rivit = lueTiedot();
  const oliJo = rivit.some((r) => r.paiva === paiva);   // Pythonin any()
  tallennaTiedot(lisaaPaiva(rivit, paiva, paino, kalorit));
  paivitaNakyma();

  const toiminto = oliJo ? "Päivitetty" : "Tallennettu";
  naytaViesti(tila, `${toiminto} ${pvmPitka(paiva)}: ${kgMuoto.format(paino)} kg ja ${kokonaisMuoto.format(kalorit)} kcal.`, "ok");
  automaattisestiTaytetty = true;   // kentissä on nyt tämän päivän tallennetut arvot
  painoKentta.blur();
  kaloriKentta.blur();               // sulkee iPhonen näppäimistön
});

paivaKentta.addEventListener("change", taytaPaivanTiedot);

$("nayta-kaikki").addEventListener("click", () => {
  naytaKaikki = !naytaKaikki;
  paivitaLista(lueTiedot());
});

// --- CSV-vienti --------------------------------------------------------------

/** Sama muoto kuin paino.py:n painot.csv: paiva,paino,kalorit, piste desimaalina. */
function teeCsv(rivit) {
  const rivitTekstina = rivit.map((r) => `${r.paiva},${r.paino},${r.kalorit}`);
  return ["paiva,paino,kalorit", ...rivitTekstina].join("\n") + "\n";
}

$("vie").addEventListener("click", async () => {
  const tila = $("tila-varmuus");
  const rivit = lueTiedot();
  if (!rivit.length) return naytaViesti(tila, "Ei vietävää.", "virhe");

  const nimi = `painot-${tanaanIso()}.csv`;
  const tiedosto = new File([teeCsv(rivit)], nimi, { type: "text/csv" });

  // Kotinäytöltä avattuna iPhone ei lataa tiedostoja tavalliseen tapaan,
  // joten käytetään jakovalikkoa ("Tallenna tiedostoihin").
  const kotinaytolla = navigator.standalone || matchMedia("(display-mode: standalone)").matches;
  if (kotinaytolla && navigator.canShare?.({ files: [tiedosto] })) {
    try {
      await navigator.share({ files: [tiedosto], title: nimi });
      naytaViesti(tila, `Viety ${rivit.length} merkintää.`, "ok");
    } catch (virhe) {
      if (virhe.name !== "AbortError") naytaViesti(tila, "Vienti epäonnistui.", "virhe");
    }
    return;
  }

  // Muuten tavallinen lataus: tehdään väliaikainen linkki ja "klikataan" sitä.
  const url = URL.createObjectURL(tiedosto);
  const a = document.createElement("a");
  a.href = url;
  a.download = nimi;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  naytaViesti(tila, `Viety ${rivit.length} merkintää tiedostoon ${nimi}.`, "ok");
});

// --- CSV-tuonti --------------------------------------------------------------

/** Jakaa CSV-rivin soluihin. Lainausmerkeissä oleva erotin ("82,4") ei jaa. */
function jaaRivi(rivi, erotin) {
  const solut = [];
  let solu = "";
  let lainauksessa = false;
  for (const merkki of rivi) {
    if (merkki === '"') lainauksessa = !lainauksessa;
    else if (merkki === erotin && !lainauksessa) { solut.push(solu); solu = ""; }
    else solu += merkki;
  }
  solut.push(solu);
  return solut.map((s) => s.trim());
}

/**
 * Lukee CSV-tekstin. Palauttaa { rivit, virheelliset } tai heittää virheen,
 * jos otsikkorivi puuttuu. Hyväksyy BOM:n, CRLF-rivinvaihdot, desimaalipilkun
 * ja puolipiste-erottimen (Excelin suomalainen CSV).
 */
function lueCsv(teksti) {
  const rivit = teksti.replace(/^﻿/, "").split(/\r?\n/).filter((r) => r.trim() !== "");
  if (!rivit.length) throw new Error("Tiedosto on tyhjä.");

  const erotin = rivit[0].includes(";") ? ";" : ",";
  const otsikot = jaaRivi(rivit[0], erotin).map((o) => o.toLowerCase());
  const [iPaiva, iPaino, iKalorit] = ["paiva", "paino", "kalorit"].map((s) => otsikot.indexOf(s));
  if ([iPaiva, iPaino, iKalorit].includes(-1)) {
    throw new Error("Otsikkorivi paiva,paino,kalorit puuttuu.");
  }

  const tulos = [];
  let virheelliset = 0;
  for (const rivi of rivit.slice(1)) {
    const solut = jaaRivi(rivi, erotin);
    const paiva = solut[iPaiva];
    const paino = muutaLuvuksi(solut[iPaino] ?? "");
    const kalorit = muutaLuvuksi(solut[iKalorit] ?? "");
    if (paivaksi(paiva) && paino > 0 && kalorit !== null && kalorit >= 0) {
      tulos.push({ paiva, paino, kalorit });
    } else {
      virheelliset++;
    }
  }
  return { rivit: tulos, virheelliset };
}

$("tuo").addEventListener("change", async (tapahtuma) => {
  const tila = $("tila-varmuus");
  const tiedosto = tapahtuma.target.files[0];
  tapahtuma.target.value = "";   // sama tiedosto voidaan valita uudelleen
  if (!tiedosto) return;

  try {
    const { rivit: tuodut, virheelliset } = lueCsv(await tiedosto.text());
    let rivit = lueTiedot();
    const vanhat = new Set(rivit.map((r) => r.paiva));
    let korvattu = 0;
    for (const r of tuodut) {
      if (vanhat.has(r.paiva)) korvattu++;
      rivit = lisaaPaiva(rivit, r.paiva, r.paino, r.kalorit);
    }
    tallennaTiedot(rivit);
    paivitaNakyma();
    taytaPaivanTiedot();

    let viesti = `Tuotu ${tuodut.length} merkintää`;
    if (korvattu) viesti += `, joista ${korvattu} korvasi aiemman`;
    if (virheelliset) viesti += `. ${virheelliset} virheellistä riviä ohitettiin`;
    naytaViesti(tila, `${viesti}.`, tuodut.length ? "ok" : "virhe");
  } catch (virhe) {
    naytaViesti(tila, `Tuonti epäonnistui: ${virhe.message}`, "virhe");
  }
});

// --- Käynnistys --------------------------------------------------------------

let nakymanPaiva = "";   // minkä päivän mukaan näkymä on viimeksi alustettu

/** Asettaa päivämäärän tähän päivään. */
function alustaPaiva() {
  nakymanPaiva = tanaanIso();
  $("tanaan").textContent = new Date().toLocaleDateString("fi-FI", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  paivaKentta.value = paivaKentta.max = nakymanPaiva;
  taytaPaivanTiedot();
}

alustaPaiva();
paivitaNakyma();

// iPhone pitää kotinäytön sovelluksen muistissa taustalla. Kun sovellus avataan
// seuraavana aamuna, vaihdetaan päivämäärä automaattisesti uuteen päivään.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && tanaanIso() !== nakymanPaiva) {
    alustaPaiva();
  }
});

// Service worker tekee sovelluksesta offline-käyttöisen (ks. sw.js).
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
