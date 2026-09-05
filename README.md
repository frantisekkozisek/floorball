# Julinka: Florbalová Hvězda 🏑⭐

Mobilní webová florbalová hra navržená pro Julinku na telefon do webového prohlížeče.  
Hra nabízí 2.5D arkádový styl z pohledu zezadu, interaktivní **Florbalovou akademii (intro tutoriál)** pro výuku florbalových triků a ostrý **Nájezdový režim** proti brankáři.

---

## 🎮 Herní mechanika & Ovládání

### Kreslení trasy běhu & Cílení do branky (Varianta 1)
Jediným plynulým tahem prstu po displeji určíte celou akci:
1. **Trasa běhu po hřišti:** Na palubovce se vykresluje svítící neonová trasa s animovanými šipkami, kudy Julinka poběží s míčkem.
2. **Zamíření do branky:** Tah prstu vyvedený do brankového rámu okamžitě aktivuje zaměřovací laser a interaktivní terč 🎯:
   - **Levý / pravý vinkl (⭐):** Zakončení do horních rohů sítě.
   - **Pod břevno (🚀):** Vysoká pumelice pod horní tyč.
   - **K tyči po zemi (⚡):** Rychlá přízemní střela do protipohybu.
3. **Akce po zvednutí prstu:** Julinka bleskově vyrazí po nakreslené trase, vede míček na hokejce, před brankovištěm napřáhne a odpálí míček přesně do vybraného cíle v brance!

---

## 🏆 Herní módy & Triky

### 1. Florbalová akademie (Intro tutoriál)
Julinka se krok za krokem s pomocí animovaného prstíku naučí provádět:
- **Základní střela:** Přímý rychlý švih prstem na branku.
- **Florbalová stahovačka (Toe-drag):** Rychlé stažení do strany k oklamání brankáře a bleskové zakončení k tyčce.
- **ZORRO trik (Air flick):** Plynulý obloukový švih zvedající míček vzduchem do horní šibenice!

### 2. Nájezdový zápas (Shootout)
- 5 samostatných nájezdů proti brankáři.
- AI brankáře reaguje na kličky a stahovačky (nechá se oklamat do protipohybu).
- Zvukové cinknutí tyčky, branková siréna a konfety při gólu.
- Závěrečné vyhodnocení, zlaté hvězdy (⭐) a možnost okamžité odvety.

---

## 🚀 Technologie & Výkon

- **2.5D Canvas Engine:** Bleskový start bez zpoždění, stabilní 60 FPS na každém telefonu.
- **Čistá velikost (Bundle):** Pouze ~8 kB gzipped bez zbytečných těžkých knihoven.
- **Web Audio API syntetizér:** 100% offline zvuky (klepnutí florbalky, siréna, píšťalka, tyčka, jásot publika) – žádné stahování externích MP3.
- **Dotyková podpora:** Zákaz nechtěného zoomování na iOS/Androidu (`touch-action: none`, `viewport-fit=cover`).

---

## 🛠️ Spuštění a vývoj

```bash
# Instalace závislostí
npm install

# Spuštění lokálního vývojového serveru
npm run dev

# Spuštění sady testů (Vitest)
npm test

# Produkční sestavení
npm run build
```

---

## 📱 Jak přidat hru na plochu telefonu (PWA)

1. Otevřete odkaz v mobilním prohlížeči (Safari na iPhone nebo Chrome na Androidu).
2. Zvolte **Sdílet** -> **Přidat na plochu** (Add to Home Screen).
3. Hra se uloží jako samostatná aplikace s ikonou florbalového míčku a funguje i bez připojení k internetu.
