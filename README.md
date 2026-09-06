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
- Zvukové cinknutí tyčky, branková siréna a konfety při gólu.
- Závěrečné vyhodnocení s počtem vstřelených branek, zlaté hvězdy (⭐), zobrazení obtížnosti a možnost okamžité odvety.

### 3. 👕 Úprava hráče (Jméno, číslo a barva dresu)
Tlačítkem **👕 Hráč** ve spodní liště (nebo na obrazovce po zápase) můžete kdykoliv otevřít šatnu:
- **Jméno:** Zadejte libovolné jméno hráčky (výchozí `JULINKA`).
- **Číslo dresu:** Vyberte šťastné číslo (1–99).
- **Barva dresu:** Výběr z 8 zářivých florbalových barev (neonová růžová, tyrkysová, jedovatě zelená, zářivá oranžová, královská fialová, ohnivá červená, zlatá žlutá, noční černá).
- Zvolený dres a číslo se okamžitě zobrazují na zádech hráčky při běhu po hřišti i na čelence ve vlasech a ukládají se do paměti prohlížeče (`localStorage`).

### 4. 🎯 Florbalové bodování & Hodnocení výkonu
Protože 5 gólů z 5 dá po tréninku každý, hra hodnotí kvalitu a techniku zakončení:
- **⭐ Vinkl (horní rohy):** +500 b
- **🚀 Pod břevno:** +350 b
- **⚡ K tyči po zemi:** +250 b
- **Běžný gól do sítě:** +150 b
- **🌀 ZORRO trik (Air flick):** +400 b bonus
- **⚡ Stahovačka (Toe-drag):** +250 b bonus
- **Rychlost zakončení:** Až +300 b za bleskový nájezd
- **🔥 Kombo série:** Každý gól v řadě zvyšuje násobič (1.0x $\to$ 2.0x Clean Sweep!)
- **🧤 Násobič brankáře:** Junior (1.0x), Profi (1.5x), Legenda (2.5x)
- **Hráčské tituly:** Podle celkového skóre získáte titul od *Florbalového talentu* 🥉 až po *Nesmrtelnou Legendu florbalu* 👑.

### 5. 🏆 Síň slávy (Tabulka TOP 3)
Po odehrání 5 nájezdů se zobrazí tabulka 3 nejlepších historických výkonů s medailemi 🥇🥈🥉, jmény, čísly, dresy a body. Pokud překonáte dosavadní rekord, hra váš nový zápis slavnostně zvýrazní!

---

## 🧤 3 Úrovně brankáře (Přepínatelné tlačítkem v liště)
Tlačítkem **🧤 Junior / Profi / Legenda** můžete kdykoliv zvolit obtížnost brankáře:
1. **🟢 Junior (Začátečník):**
   - Zelený dres `#10b981`, světle zelená maska.
   - Pomalé vykrývání úhlu (230 px/s), pomalejší skok (440 px/s), delší reakční doba (100 ms).
   - Menší dosah rukavic a betonů (46 px, výška do 60 px).
   - Velmi snadno skočí na stahovačku (zpoždění 280 ms). Skvělé pro začátek a procvičení střel!
2. **🟡 Profi (Ligový brankář):**
   - Zářivě oranžový dres `#ff6b00`, tyrkysová maska `#05d9e8`.
   - Vyvážený ligový brankář: rychlý přesun po kolenou (340 px/s), skok k tyči (660 px/s), reakční doba 35 ms.
   - Chytá rány do výšky 68 px a šířky 56 px, vyžaduje přesné míření do šibenice nebo stahovačku do protipohybu.
3. **🔴 Legenda (Zeď v brance):**
   - Fialový dres `#8b5cf6`, zlatá maska `#ffe600`.
   - Elitní gólman: bleskový přesun (440 px/s), extrémní skok (780 px/s), reakční doba 15 ms.
   - Velký dosah (62 px do šířky, 74 px do výšky), minimální reakční zpoždění na fintu (90 ms). Pro gól je nutná perfektní trajektorie přímo pod břevno nebo precizní Zorro trik!

---

## 🚀 Technologie & Výkon

- **2.5D Canvas Engine:** Bleskový start bez zpoždění, stabilní 60 FPS na každém telefonu.
- **Čistá velikost (Bundle):** Pouze ~8 kB gzipped bez zbytečných těžkých knihoven.
- **Web Audio API syntetizér:** 100% offline procedurální zvuky (klepnutí florbalky o děravý míček, náraz do sítě, mohutná halová siréna s low-pass rezonancí, vítězné zvonky, píšťalka, cinknutí tyčky, bouřlivý jásot diváků) – žádné stahování externích MP3.
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
