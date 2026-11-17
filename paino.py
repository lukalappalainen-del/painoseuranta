# paino.py – painon ja kalorien seuranta sovellusikkunassa
#
# Käyttö:  python paino.py   (tai tuplaklikkaa painoseuranta.bat)
# Ikkunassa syötetään tämän aamun paino ja päivän kalorit. Tallenna-nappi
# kirjoittaa ne tiedostoon painot.csv ja päivittää kaavion samaan ikkunaan.
# "Lisää aiempi päivä" -napilla voi kirjata tiedot jollekin aiemmalle päivälle.

# --- 1. Tuonnit (import) ---------------------------------------------------
import csv                       # CSV-tiedostojen lukeminen ja kirjoittaminen
import os                        # tiedostopolut ja tiedoston olemassaolon tarkistus
from datetime import date, datetime, timedelta   # päivämäärät ja aikavälit

import customtkinter as ctk      # moderni käyttöliittymäkirjasto (tkinterin päällä)
import matplotlib.dates as mdates  # päivämääräakselin muotoilu
from matplotlib.figure import Figure  # kaaviokuva ilman omaa erillistä ikkunaa
# FigureCanvasTkAgg on "silta", jolla matplotlib-kaavio upotetaan tkinter-ikkunaan.
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg


# --- 2. Vakiot -----------------------------------------------------------
# Isoilla kirjaimilla kirjoitetut muuttujat ovat sopimuksen mukaan vakioita.

# CSV tallennetaan samaan kansioon kuin tämä skripti (__file__ = skriptin polku).
TIEDOSTO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "painot.csv")
SARAKKEET = ["paiva", "paino", "kalorit"]

# Tumman teeman värit kaaviolle, jotta se sopii customtkinterin tummaan ikkunaan.
TAUSTA = "#242424"       # sama harmaa kuin ikkunan tausta
TEKSTI = "#dce4ee"       # vaalea teksti
VIRHE = "#e05252"        # punainen virheviesteille


# --- 3. Tiedoston käsittely ------------------------------------------------
# Nämä funktiot eivät tiedä mitään käyttöliittymästä: ne vain lukevat ja
# kirjoittavat dataa. Tällainen erottelu tekee koodista helpompaa ymmärtää.

def lue_tiedot():
    """Lukee kaikki aiemmat mittaukset CSV-tiedostosta listaksi."""
    if not os.path.exists(TIEDOSTO):
        return []   # ensimmäinen käyttökerta: tiedostoa ei vielä ole

    # "with open" sulkee tiedoston automaattisesti. newline="" estää
    # ylimääräiset tyhjät rivit Windowsissa (csv-moduulin suositus).
    with open(TIEDOSTO, newline="", encoding="utf-8") as f:
        # DictReader antaa jokaisen rivin sanakirjana, esim.
        # {"paiva": "2026-11-17", "paino": "82.4", "kalorit": "2300"}
        return list(csv.DictReader(f))


def tallenna_tiedot(rivit):
    """Kirjoittaa kaikki rivit CSV-tiedostoon (vanha sisältö korvataan)."""
    with open(TIEDOSTO, "w", newline="", encoding="utf-8") as f:
        kirjoittaja = csv.DictWriter(f, fieldnames=SARAKKEET)
        kirjoittaja.writeheader()
        kirjoittaja.writerows(rivit)


def lisaa_paiva(rivit, paiva, paino, kalorit):
    """Lisää mittauksen annetulle päivälle. Jos päivälle on jo rivi, se korvataan."""
    teksti = paiva.isoformat()   # date-olio tekstiksi, esim. "2026-11-17"
    # Listakooste: pidetään kaikki rivit PAITSI saman päivän vanha rivi.
    rivit = [rivi for rivi in rivit if rivi["paiva"] != teksti]
    rivit.append({"paiva": teksti, "paino": paino, "kalorit": int(kalorit)})

    # Koska aiemman päivän rivi lisätään listan loppuun, järjestetään lista
    # päivämäärän mukaan. key=... kertoo, minkä perusteella järjestetään:
    # tässä jokaisen rivin "paiva"-arvon mukaan. Muoto VVVV-KK-PP järjestyy
    # oikein ihan tekstinäkin.
    rivit.sort(key=lambda rivi: rivi["paiva"])
    return rivit


def muuta_luvuksi(teksti):
    """Muuttaa tekstin luvuksi. Palauttaa None, jos teksti ei ole luku."""
    try:
        # Sallitaan suomalainen pilkku (82,4) ja poistetaan välilyönnit reunoilta.
        return float(teksti.replace(",", ".").strip())
    except ValueError:
        return None   # None tarkoittaa Pythonissa "ei arvoa"


def muuta_paivamaaraksi(pv, kk, vuosi):
    """Tekee kolmesta tekstistä päivämäärän. Palauttaa None, jos se ei kelpaa."""
    try:
        # int() muuttaa tekstin kokonaisluvuksi. date() taas tarkistaa itse,
        # että päivämäärä on olemassa: esim. 31.2. aiheuttaa ValueErrorin.
        return date(int(vuosi), int(kk), int(pv))
    except ValueError:
        return None


# --- 4. Pääikkuna ----------------------------------------------------------
# Käyttöliittymä tehdään luokkana (class). Luokka kokoaa yhteen ikkunan
# osat (kentät, napit, kaavion) ja niitä käsittelevät funktiot (metodit).
# "Sovellus(ctk.CTk)" tarkoittaa, että Sovellus PERII customtkinterin
# CTk-ikkunan: se on tavallinen ikkuna, johon lisäämme omat osamme.
# "self" viittaa metodeissa tähän ikkunaan itseensä, joten esim.
# self.paino_kentta on ikkunan oma paino-kenttä.

class Sovellus(ctk.CTk):

    def __init__(self):
        """__init__ ajetaan kerran, kun ikkuna luodaan. Tässä rakennetaan näkymä."""
        super().__init__()   # luodaan ensin itse CTk-ikkuna
        self.title("Painoseuranta")
        self.geometry("1000x700")   # ikkunan koko pikseleinä (leveys x korkeus)

        # --- Syöttöosa ylhäällä ---
        # CTkFrame on "laatikko", johon voi ryhmitellä muita osia.
        syotto = ctk.CTkFrame(self)
        # pack() asettaa osan ikkunaan. fill="x" = venyy koko leveydelle,
        # padx/pady = reunojen väli pikseleinä.
        syotto.pack(fill="x", padx=16, pady=16)

        # grid() asettelee osat ruudukkoon riveittäin ja sarakkeittain.
        ctk.CTkLabel(syotto, text="Paino (kg)").grid(row=0, column=0, padx=(16, 8), pady=16)
        self.paino_kentta = ctk.CTkEntry(syotto, width=120, placeholder_text="esim. 82,4")
        self.paino_kentta.grid(row=0, column=1, padx=8)

        ctk.CTkLabel(syotto, text="Kalorit (kcal)").grid(row=0, column=2, padx=(24, 8))
        self.kalori_kentta = ctk.CTkEntry(syotto, width=120, placeholder_text="esim. 2300")
        self.kalori_kentta.grid(row=0, column=3, padx=8)

        # command=self.tallenna: kun nappia painetaan, kutsutaan tallenna-metodia.
        # Huom: ei sulkeita! Annamme funktion itsensä, emme kutsu sitä vielä.
        ctk.CTkButton(syotto, text="Tallenna", command=self.tallenna).grid(
            row=0, column=4, padx=(24, 8))

        # Toinen nappi avaa erillisen ikkunan aiemman päivän kirjaamiseen.
        # fg_color="transparent" + border_width tekee siitä "ääriviivanapin",
        # jolloin pääasiallinen Tallenna-nappi erottuu selvemmin.
        ctk.CTkButton(syotto, text="Lisää aiempi päivä", command=self.avaa_lisays,
                      fg_color="transparent", border_width=2).grid(
            row=0, column=5, padx=(8, 16))

        # Tilarivi, jossa näytetään viestit ("Tallennettu", virheet).
        self.tila = ctk.CTkLabel(syotto, text="")
        self.tila.grid(row=1, column=0, columnspan=6, padx=16, pady=(0, 12), sticky="w")

        # Enter-näppäin tallentaa myös. bind() kytkee tapahtuman funktioon;
        # lambda e: ... on lyhyt nimetön funktio, joka ottaa vastaan
        # tapahtuman (e) mutta ei tarvitse sitä.
        self.bind("<Return>", lambda e: self.tallenna())

        # --- Kaavio alhaalla ---
        self.kuva = Figure(figsize=(8, 5), facecolor=TAUSTA)
        # add_subplot(2, 1, 1) = 2 riviä, 1 sarake, tämä on 1. kuvaaja.
        self.ax1 = self.kuva.add_subplot(2, 1, 1)
        self.ax2 = self.kuva.add_subplot(2, 1, 2, sharex=self.ax1)

        self.kangas = FigureCanvasTkAgg(self.kuva, master=self)
        # expand=True + fill="both": kaavio täyttää kaiken jäljelle jäävän tilan.
        self.kangas.get_tk_widget().pack(fill="both", expand=True, padx=16, pady=(0, 16))

        # Lopuksi ladataan vanhat tiedot ja piirretään kaavio.
        rivit = lue_tiedot()
        self.tayta_tanaan(rivit)
        self.piirra_kaavio(rivit)

    def tayta_tanaan(self, rivit):
        """Jos tälle päivälle on jo tallennettu arvot, näytetään ne kentissä."""
        tanaan = date.today().isoformat()
        for rivi in rivit:
            if rivi["paiva"] == tanaan:
                self.paino_kentta.insert(0, rivi["paino"])
                self.kalori_kentta.insert(0, rivi["kalorit"])
                self.nayta_viesti("Tämän päivän arvot on jo tallennettu – voit muokata niitä.")

    def nayta_viesti(self, teksti, virhe=False):
        """Näyttää viestin tilarivillä. Virheet punaisella."""
        # virhe=False on oletusarvo: jos kutsuja ei anna sitä, se on False.
        vari = VIRHE if virhe else TEKSTI
        self.tila.configure(text=teksti, text_color=vari)

    def tallenna(self):
        """Ajetaan, kun Tallenna-nappia tai Enteriä painetaan: tallentaa tämän päivän."""
        # .get() hakee kentän tekstin.
        paino = muuta_luvuksi(self.paino_kentta.get())
        kalorit = muuta_luvuksi(self.kalori_kentta.get())

        # Tarkistetaan syötteet. "is None" = muunnos epäonnistui.
        if paino is None or kalorit is None:
            self.nayta_viesti("Anna sekä paino että kalorit lukuina.", virhe=True)
            return   # lopetetaan metodi tähän, mitään ei tallenneta

        self.tallenna_paiva(date.today(), paino, kalorit)

    def tallenna_paiva(self, paiva, paino, kalorit):
        """Tallentaa annetun päivän tiedot ja päivittää kaavion.

        Tätä käyttävät sekä Tallenna-nappi (tämä päivä) että
        lisäysikkuna (aiempi päivä), joten koodia ei tarvitse kirjoittaa kahdesti.
        """
        rivit = lue_tiedot()
        # any() palauttaa True, jos yksikin listan alkioista on tosi:
        # onko tälle päivälle jo tallennettu jotain?
        oli_jo = any(rivi["paiva"] == paiva.isoformat() for rivi in rivit)

        rivit = lisaa_paiva(rivit, paiva, paino, kalorit)
        tallenna_tiedot(rivit)
        self.piirra_kaavio(rivit)

        # strftime muuttaa päivämäärän tekstiksi haluttuun muotoon.
        pvm = paiva.strftime("%d.%m.%Y")
        toiminto = "Päivitetty" if oli_jo else "Tallennettu"
        viesti = f"{toiminto} {pvm}: {paino} kg ja {kalorit:.0f} kcal."
        if len(rivit) > 1:
            # rivit[0] = vanhin mittaus, rivit[-1] = uusin (lista on järjestetty).
            muutos = float(rivit[-1]["paino"]) - float(rivit[0]["paino"])
            # :+.1f näyttää etumerkin ja yhden desimaalin.
            viesti += f"  Muutos alusta: {muutos:+.1f} kg"
        self.nayta_viesti(viesti)

    def avaa_lisays(self):
        """Avaa ikkunan, jossa voi kirjata tiedot aiemmalle päivälle."""
        LisaysIkkuna(self)   # self = pääikkuna, jotta lisäysikkuna voi kutsua sitä

    def muotoile_akseli(self, ax, otsikko, yksikko):
        """Yhteiset värit ja tekstit kummallekin kuvaajalle."""
        ax.set_facecolor(TAUSTA)
        ax.set_title(otsikko, color=TEKSTI)
        ax.set_ylabel(yksikko, color=TEKSTI)
        ax.tick_params(colors=TEKSTI)            # akselin numeroiden väri
        for reuna in ax.spines.values():         # kuvaajan reunaviivat
            reuna.set_color("#808080")
        ax.grid(True, alpha=0.3)

    def piirra_kaavio(self, rivit):
        """Tyhjentää ja piirtää kaavion uudelleen annetuista riveistä."""
        # clear() pyyhkii vanhan kuvan, jotta uusi ei piirry sen päälle.
        self.ax1.clear()
        self.ax2.clear()
        self.muotoile_akseli(self.ax1, "Painon kehitys", "Paino (kg)")
        self.muotoile_akseli(self.ax2, "Kalorit päivässä", "kcal")

        if not rivit:   # tyhjä lista on "epätosi" -> ei vielä mittauksia
            self.ax1.text(0.5, 0.5, "Ei vielä mittauksia", ha="center",
                          va="center", color=TEKSTI, transform=self.ax1.transAxes)
            self.kangas.draw()
            return

        # Muutetaan tekstit oikeiksi tyypeiksi (päivämäärät ja luvut).
        paivat = [datetime.strptime(rivi["paiva"], "%Y-%m-%d") for rivi in rivit]
        painot = [float(rivi["paino"]) for rivi in rivit]
        kalorit = [float(rivi["kalorit"]) for rivi in rivit]

        # Paino viivana, jokainen mittaus pisteenä.
        self.ax1.plot(paivat, painot, marker="o", color="#3b8ed0")

        # Kalorit pylväinä ja keskiarvo katkoviivana.
        self.ax2.bar(paivat, kalorit, color="#e8913a", width=0.8)
        keskiarvo = sum(kalorit) / len(kalorit)
        self.ax2.axhline(keskiarvo, color="#808080", linestyle="--",
                         label=f"Keskiarvo {keskiarvo:.0f} kcal")
        self.ax2.legend(facecolor=TAUSTA, labelcolor=TEKSTI)

        # Aika-akselille vain päivämäärät, korkeintaan noin 10 merkintää.
        vali = max(1, (max(paivat) - min(paivat)).days // 10)
        self.ax2.xaxis.set_major_locator(mdates.DayLocator(interval=vali))
        self.ax2.xaxis.set_major_formatter(mdates.DateFormatter("%d.%m.%Y"))
        # Päivän verran tilaa reunoille, ettei yksittäinen pylväs täytä kaikkea.
        yksi_paiva = timedelta(days=1)
        self.ax2.set_xlim(min(paivat) - yksi_paiva, max(paivat) + yksi_paiva)

        self.kuva.autofmt_xdate()    # kallistaa päivämäärät
        self.kuva.tight_layout()     # asettelee kuvaajat siististi
        self.kangas.draw()           # päivittää kaavion näkyviin ikkunaan


# --- 5. Aiemman päivän lisäysikkuna ---------------------------------------
# CTkToplevel on pääikkunan "lapsi-ikkuna" (esim. dialogi). Se perii
# samalla tavalla kuin Sovellus perii CTk:n.

class LisaysIkkuna(ctk.CTkToplevel):

    def __init__(self, sovellus):
        super().__init__(sovellus)
        self.sovellus = sovellus   # muistetaan pääikkuna, jotta voimme tallentaa sen kautta
        self.title("Lisää aiempi päivä")
        self.resizable(False, False)   # kokoa ei voi muuttaa

        # --- Päivämäärä: kolme pientä kenttää rinnakkain ---
        ctk.CTkLabel(self, text="Päivämäärä").grid(row=0, column=0, padx=(16, 8), pady=(16, 8), sticky="w")
        self.pv_kentta = ctk.CTkEntry(self, width=50, placeholder_text="pp")
        self.kk_kentta = ctk.CTkEntry(self, width=50, placeholder_text="kk")
        self.vuosi_kentta = ctk.CTkEntry(self, width=70, placeholder_text="vvvv")
        self.pv_kentta.grid(row=0, column=1, padx=4, pady=(16, 8))
        self.kk_kentta.grid(row=0, column=2, padx=4, pady=(16, 8))
        self.vuosi_kentta.grid(row=0, column=3, padx=(4, 16), pady=(16, 8))

        # Täytetään valmiiksi eilinen päivä, koska se on todennäköisin.
        eilen = date.today() - timedelta(days=1)
        self.pv_kentta.insert(0, str(eilen.day))     # str() muuttaa luvun tekstiksi
        self.kk_kentta.insert(0, str(eilen.month))
        self.vuosi_kentta.insert(0, str(eilen.year))

        # --- Paino ja kalorit ---
        # columnspan=3: kenttä levittyy kolmen sarakkeen leveydelle.
        ctk.CTkLabel(self, text="Paino (kg)").grid(row=1, column=0, padx=(16, 8), pady=8, sticky="w")
        self.paino_kentta = ctk.CTkEntry(self, placeholder_text="esim. 82,4")
        self.paino_kentta.grid(row=1, column=1, columnspan=3, padx=(4, 16), sticky="ew")

        ctk.CTkLabel(self, text="Kalorit (kcal)").grid(row=2, column=0, padx=(16, 8), pady=8, sticky="w")
        self.kalori_kentta = ctk.CTkEntry(self, placeholder_text="esim. 2300")
        self.kalori_kentta.grid(row=2, column=1, columnspan=3, padx=(4, 16), sticky="ew")

        # Virheviesti tämän ikkunan sisällä.
        self.tila = ctk.CTkLabel(self, text="", text_color=VIRHE)
        self.tila.grid(row=3, column=0, columnspan=4, padx=16)

        ctk.CTkButton(self, text="Tallenna", command=self.tallenna).grid(
            row=4, column=0, columnspan=4, padx=16, pady=(4, 16), sticky="ew")
        self.bind("<Return>", lambda e: self.tallenna())

        # Pieni viive (100 ms) ennen kuin ikkuna nostetaan päällimmäiseksi:
        # Windowsissa uusi ikkuna jää muuten joskus pääikkunan taakse.
        # grab_set() estää pääikkunan käytön, kunnes tämä ikkuna suljetaan.
        self.after(100, self.nosta_esiin)

    def nosta_esiin(self):
        self.lift()
        self.grab_set()
        self.paino_kentta.focus()   # kursori valmiiksi paino-kenttään

    def tallenna(self):
        """Tarkistaa syötteet, tallentaa pääikkunan kautta ja sulkee ikkunan."""
        paiva = muuta_paivamaaraksi(self.pv_kentta.get(), self.kk_kentta.get(),
                                    self.vuosi_kentta.get())
        paino = muuta_luvuksi(self.paino_kentta.get())
        kalorit = muuta_luvuksi(self.kalori_kentta.get())

        # Tarkistukset yksi kerrallaan; ensimmäinen virhe näytetään.
        if paiva is None:
            self.tila.configure(text="Päivämäärä ei kelpaa.")
        elif paiva > date.today():   # päivämääriä voi verrata kuten lukuja
            self.tila.configure(text="Päivämäärä ei voi olla tulevaisuudessa.")
        elif paino is None or kalorit is None:
            self.tila.configure(text="Anna sekä paino että kalorit lukuina.")
        else:
            # Kaikki kunnossa: pääikkuna tallentaa ja päivittää kaavion.
            self.sovellus.tallenna_paiva(paiva, paino, kalorit)
            self.destroy()   # suljetaan lisäysikkuna


# --- 6. Ohjelman käynnistys ----------------------------------------------
# __name__ on "__main__" vain, kun tiedosto ajetaan suoraan.
if __name__ == "__main__":
    ctk.set_appearance_mode("dark")     # aina tumma teema
    sovellus = Sovellus()               # luodaan ikkuna
    sovellus.mainloop()                 # näytetään ikkuna ja odotetaan klikkauksia
