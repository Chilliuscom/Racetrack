# Beachside Racetrack

Reaalajas võistlusraja haldussüsteem, mis võimaldab töötajatel seadistada võistlusi, juhtida võistlusrežiime, salvestada ringiaegu ja kuvada reaalajas infot pealtvaatajatele ning sõitjatele.

Ehitatud **Node.js**, **Express** ja **Socket.IO** baasil.

Projekt on loodud programmeerimiskooli [kood.tech](https://kood.tech) nooremarendaja programmi raames.

**Projekti juht:** Andres Agan

**Arendajad:** Lee Paju, Rene Koort, Janek Valtin

**Live demo:** [https://racetrack-production-93ad.up.railway.app](https://racetrack-production-93ad.up.railway.app)

---

## Paigaldamine

### Eeldused

- Node.js (v16 või uuem)
- npm

### 1. Paigaldamine

```bash
npm install
```

### 2. Keskkonnamuutujate seadistamine

Loo projekti juurkausta `.env` fail (või kasuta olemasolevat) kolme pääsuvõtmega:

```
RECEPTIONIST_KEY=8ded6076
OBSERVER_KEY=662e0f6c
SAFETY_KEY=a2d393bc
```

Võid kasutada suvalisi väärtusi. Need võtmed kaitsevad töötajate liideseid — iga töötaja sisestab oma pääsuvõtme liidese avamiseks.

Server **ei käivitu**, kui mõni võti on puudu.

### 3. Serveri käivitamine

**Tootmisrežiim** — 10-minutiline võistlustaimer:

```bash
npm start
```

**Arendusrežiim** — 1-minutiline võistlustaimer:

```bash
npm run dev
```

Server käivitub aadressil `http://localhost:3000`. Pordi muutmiseks sea keskkonnamuutuja `PORT`.

---

## Liideste ülevaade

Süsteemil on **7 liidest**, igaüks oma URL-iga:

### Töötajate liidesed (vajavad pääsuvõtit)

| Liides | URL | Võtme muutuja | Kasutaja |
|---|---|---|---|
| Registratuur | `/front-desk` | `RECEPTIONIST_KEY` | Registraator |
| Võistluse juhtimine | `/race-control` | `SAFETY_KEY` | Ohutusametnik |
| Ringivaatleja | `/lap-line-tracker` | `OBSERVER_KEY` | Ringivaatleja |

### Avalikud ekraanid (sisselogimist ei nõua)

| Liides | URL | Kasutaja |
|---|---|---|
| Edetabel | `/leader-board` | Pealtvaatajad |
| Järgmine võistlus | `/next-race` | Võistlussõitjad |
| Võistluse taimer | `/race-countdown` | Võistlussõitjad |
| Võistluse lipp | `/race-flags` | Lipuekraanid raja ümber |

Kõigil avalikel ekraanidel on paremas alanurgas **Täisekraan** nupp, mis on mõeldud kasutamiseks suurtel ekraanidel (40–75 tollist).

---

## Kasutusjuhend

### Samm 1: Loo võistlussessioonid (Registraator)

Registraator kasutab **Registratuuri** liidest (`/front-desk`) võistluste ettevalmistamiseks.

1. Ava brauseris `http://localhost:3000/front-desk`.
2. Sisesta registratuuri pääsuvõti (muutuja `RECEPTIONIST_KEY` väärtus `.env` failist).
3. Kliki **+ Uus sessioon** uue võistlussessiooni loomiseks.
4. Iga sessiooni jaoks trüki sõitja nimi tekstiväljale ja kliki **Lisa sõitja** (või vajuta Enter).
   - Igale sõitjale määratakse automaatselt auto number (1–8).
   - Maksimaalselt 8 sõitjat sessiooni kohta.
   - Sõitja nimi peab olema sessiooni piires unikaalne.
5. Nime muutmiseks kliki **Muuda**, trüki uus nimi ja vajuta Enter.
6. Sõitja eemaldamiseks kliki **Eemalda** tema nime kõrval.
7. Kogu sessiooni kustutamiseks kliki sessiooni kaardil **Kustuta**.
8. Saad luua mitu sessiooni ette — neid võisteldakse järjekorras.

**Mida sõitjad näevad:** Niipea kui sõitjad on lisatud, ilmuvad nad **Järgmine võistlus** ekraanile (`/next-race`) koos auto numbritega. Sõitjad saavad kontrollida, millist autot nad juhivad.

---

### Samm 2: Alusta võistlust (Ohutusametnik)

Ohutusametnik kasutab **Võistluse juhtimise** liidest (`/race-control`) võistluste haldamiseks.

1. Ava brauseris `http://localhost:3000/race-control`.
2. Sisesta ohutusametniku pääsuvõti (muutuja `SAFETY_KEY` väärtus).
3. Kuvatakse järgmine sessioon koos kõigi registreeritud sõitjate ja auto numbritega.
4. Briifi sõitjaid, seejärel kliki **Alusta võistlust**.

**Mis juhtub võistluse alustamisel:**
- Võistlusrežiim läheb **Ohutu** peale (roheline lipp).
- Pöördloenduse taimer käivitub (10 min tootmises, 1 min arendusrežiimis).
- **Edetabel** lülitub käimasolevale võistlusele.
- **Järgmine võistlus** ekraan näitab järgmist sessiooni.
- **Võistluse lipp** ekraanid muutuvad roheliseks.
- **Võistluse taimer** alustab pöördloendust.

---

### Samm 3: Juhi võistlusrežiime (Ohutusametnik)

Aktiivse võistluse ajal näeb ohutusametnik nelja režiiminuppu:

| Nupp | Lipu värv | Tähendus |
|---|---|---|
| **Ohutu** | Roheline | Normaalsed võistlustingimused |
| **Oht** | Kollane | Sõida aeglaselt — oht rajal |
| **Punane** | Punane | Peata kohe sõitmine |
| **Finiš** | Ruuduline (must/valge) | Suundu boksi |

- Vajuta suvalist režiiminuppu, et koheselt muuta võistlusrežiimi.
- Kõik **Võistluse lipp** ekraanid raja ümber uuenevad koheselt.
- **Edetabel** näitab kehtivat lipustaatust.
- Praegu aktiivne režiim on esile tõstetud valge kontuuriga.

**Oluline:** Kui režiim on seatud **Finiš** peale, ei saa seda enam tagasi muuta. See on ühepoolne toiming.

---

### Samm 4: Salvesta ringiaegu (Ringivaatleja)

Ringivaatleja kasutab **Ringivaatleja** liidest (`/lap-line-tracker`), mis on optimeeritud tahvelarvuti kasutamiseks.

1. Ava tahvelarvutis `http://localhost:3000/lap-line-tracker`.
2. Sisesta vaatleja pääsuvõti (muutuja `OBSERVER_KEY` väärtus).
3. Ilmuvad suured nummerdatud nupud — üks iga võistlusauto kohta.
4. Iga kord, kui auto ületab ringjoone, vajuta tema nuppu.

**Kuidas ringiajad toimivad:**
- **Esimene vajutus** auto kohta registreerib esimese ülesõidu (alustab 1. ringi).
- Iga **järgnev vajutus** registreerib järgmise ülesõidu. Aeg kahe järjestikuse ülesõidu vahel on ringiaeg.
- Süsteem jälgib automaatselt iga auto **parimat ringi**.
- **Edetabel** uueneb reaalajas ringide salvestamisel.

**Märkused:**
- Nupud töötavad nii horisontaal- kui vertikaalasendis.
- Nupud on teadlikult väga suured, et vähendada möödalöömisi.
- Ringiaegu saab salvestada ka **Finiš** režiimis (autod võivad veel viimast ringi lõpetada).
- Nupud muutuvad kättesaamatuks pärast sessiooni lõpetamist ohutusametniku poolt.

---

### Samm 5: Lõpeta võistlus

Võistlus saab lõppeda kahel viisil:

**Automaatne lõpp:** Kui pöördloenduse taimer jõuab nullini, muutub režiim automaatselt **Finiš** peale (ruuduline lipp). Sõitjad näevad ruudulist lippu ja naasevad boksi.

**Käsitsi lõpp:** Ohutusametnik saab vajutada **Finiš** nuppu igal ajal, et võistlus enneaegselt lõpetada.

---

### Samm 6: Lõpeta sessioon (Ohutusametnik)

Pärast režiimi seadmist **Finiš** peale ja kõigi autode naasmist boksi:

1. Ohutusametnik klikib **Lõpeta sessioon** võistluse juhtimise liideses.
2. See teeb järgmist:
   - Võistlusrežiim muutub **Punane** (punane lipp) — näitab, et rada ei ole sõitmiseks ohutu.
   - Lõppenud sessiooni tulemused jäävad **Edetabelisse** kuni järgmise võistluse alguseni.
   - **Järgmine võistlus** ekraan näitab järgmise sessiooni sõitjaid koos teatega **"Palun suunduge boksi"**.
   - **Võistluse juhtimise** liides näitab järgmist sessiooni, valmis ohutusametnikule sõitjate briifimiseks ja uue võistluse alustamiseks.

---

### Samm 7: Korda

Tsükkel kordub iga võistlussessiooni jaoks:

1. Registraator lisab sessioone ja sõitjaid.
2. Ohutusametnik alustab võistlust.
3. Vaatleja salvestab ringiaegu.
4. Taimer aegub või ohutusametnik lõpetab võistluse.
5. Ohutusametnik lõpetab sessiooni.
6. Järgmine sessioon on järjekorras.

---

## Avalike ekraanide juhend

Need ekraanid on mõeldud suurtele ekraanidele (telerid, monitorid), mis on paigutatud võistlusraja ümbrusesse.

### Edetabel (`/leader-board`)

- Näitab kõiki sõitjaid käimasolevas võistluses, järjestatud parima ringiaja järgi (kiireim üleval).
- Kuvab: koht, auto number, sõitja nimi, ringide arv, parim ringiaeg.
- Näitab pöördloenduse taimerit ja kehtivat lipustaatust.
- Pärast võistluse lõppu jäävad tulemused nähtavale kuni järgmise võistluse alguseni — nii saavad sõitjad oma aegu kontrollida.

### Järgmine võistlus (`/next-race`)

- Näitab järgmise sessiooni sõitjate nimekirja ja auto numbreid.
- Pärast sessiooni lõppu kuvab teate **"Palun suunduge boksi"**, et kutsuda järgmise grupi sõitjaid valmistuma.
- Kui sessioone järjekorras pole, kuvatakse "Tulevasi võistlusi pole".

### Võistluse taimer (`/race-countdown`)

- Kuvab suurt pöördloenduse taimerit (MM:SS formaadis) aktiivse võistluse ajal.
- Näitab `--:--`, kui võistlust ei toimu.

### Võistluse lipp (`/race-flags`)

- Täisekraani värviline kuva, mis esindab kehtivat võistlusrežiimi:
  - **Roheline** — Ohutu
  - **Kollane** — Oht
  - **Punane** — Punane/Ohtlik
  - **Ruuduline muster** (must/valge) — Finiš
- Mõeldud asendama füüsilisi lipukandjaid raja ümber.
- Muutub koheselt, kui ohutusametnik vahetab võistlusrežiimi.

---

## Tehnilised märkused

- Kogu suhtlus kasutab **Socket.IO** — REST API päringuid ei tehta. Iga muudatus edastatakse reaalajas.
- Andmed hoitakse **ainult mälus**. Serveri taaskäivitamine kustutab kõik andmed.
- Maksimaalselt **8 sõitjat** võistlussessiooni kohta.
- Igal töötaja liidesel on oma pääsuvõti rollipõhiseks turvalisuseks.
- Valed pääsuvõtme katsed saavad vastuse 500ms viitega.
