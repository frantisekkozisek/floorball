# Julinka: Florbalová Hvězda 🏑⭐

Mobilní webová florbalová hra navržená pro Julinku na telefon do webového prohlížeče.  
Hra nabízí 2.5D arkádový styl z pohledu zezadu, interaktivní **Florbalovou akademii (intro tutoriál)** pro výuku florbalových triků a ostrý **Nájezdový režim** proti brankáři.

---

## 🎮 Herní mechanika & Ovládání

### Kreslení trasy běhu & Cílení do branky (Varianta A)
Jediným intuitivním tahem prstu po displeji určíte celou akci bez nechtěného čmárání po hřišti:
1. **Čisté přímé míření na branku (bez běhu):**
   - Pokud se prstem dotknete nebo zamíříte přímo v horní části hřiště k brance, **žádná žlutá čára po zemi se nekreslí**!
   - Z pozice Julinky míří do sítě přímo čistý laserový zaměřovací paprsek k vybrané kapse. Po puštění prstu Julinka ihned zakončí.
2. **Kreslení náběhu / kličky po palubovce:**
   - Pokud chcete Julinku navést do strany (např. oběhnout brankáře či provést kličku), můžete prstem kreslit trasu po palubovce.
   - Žlutá stopa se kreslí **výhradně po hřišti a zastaví se před brankovištěm** (`AIMING_ZONE_Y = 320`). Do prostoru branky nikdy nezasahuje.
3. **Pohyb prstem v brance nemění trasu na zemi:**
   - Jakmile prst vjede do prostoru branky, trasa běhu po palubovce se zafixuje a nemění se.
   - Hráč může v klidu přejíždět mezi všemi 5 kapsami v síti, aniž by tím kroutil trasu na zemi.
4. **Virtuální mířidlo nad prstem (offset 55 px):**
   - Prst na mobilním displeji nezakrývá branku ani gólmana – zaměřovací kříž je promítán 55 px nad špičku prstu s jemnou čárkovanou spojnicí.
5. **5 velkých magnetických kapes v síti:**
   - **⭐ LEVÝ VINKL:** Zakončení do levého horního rohu sítě (vysoká trajektorie, +500 b).
   - **🚀 POD BŘEVNO:** Střední pumelice přímo pod horní břevno (+350 b).
   - **⭐ PRAVÝ VINKL:** Zakončení do pravého horního rohu sítě (+500 b).
   - **⚡ K LEVÉ TYČI:** Přízemní rána k levé tyči do protipohybu brankáře (+250 b).
   - **⚡ K PRAVÉ TYČI:** Přízemní rána k pravé tyči (+250 b).
6. **Magnetický zámek s hysterezí & akustickou odezvou:**
   - Jakmile se virtuální mířidlo přiblíží ke kapse na 54 px, cíl magneticky zacvakne se zvukovým klikem (`soundManager.playAimSnap()`).
   - Záchytná hystereze (76 px) udrží zámek i při zvednutí prstu z displeje.
7. **Akce po zvednutí prstu:** Julinka buď bleskově vystřelí z místa, nebo proběhne nakreslenou trasu po palubovce a před brankovištěm nekompromisně zavěsí do vybrané kapsy!

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

## 🎨 Vizuální grafika postaviček (2.5D Vector Styling)

Hra disponuje kompletním procedurálním grafickým enginem s vysokou mírou detailů:
1. **👧 Postava Julinky:**
   - **Vlající culík s fyzikou pohybu:** Culík energicky kmitá v rytmu běhu (`runTimer`) a při zatočení se realisticky vyklání do odstředivého směru vlivem náklonu těla (`playerFacingAngle`).
   - **Vrstvený účes & čelenka:** Propracované vlasy se světelným leskem na temeni a pružnou sportovní čelenkou ladící s barvou zvoleného dresu.
   - **Anatomický dres s 3D stínováním:** Projmutý sportovní střih, V-neck límeček, bílé boční prodyšné vsadky a čistě vysázené jméno s číslem s jemným prostorovým stínem.
   - **Profi florbalová výbava:** Kónický karbonový shaft, spirálově vinutá bílá florbalová omotávka s texturou, zářivě neonově růžová čepel s podélnými žebry/otvory a klenutou špičkou pro vedení míčku.
   - **Nohy a sálovky:** Kraťasy s reflexním proužkem, odhalená kůže, bílé ponožky s proužkem a florbalové sálovky s karamelovou neznačkující podrážkou (gum sole) a bílými tkaničkami.
   - **Dvojitý podlahový stín:** Vnitřní kontaktní stín pod nohama a měkký ambientní stín celého těla.

2. **🧤 Postava Brankáře:**
   - **Florbalová helma s cat-eye mřížkou:** Aerodynamická skořepina masky s leskem, chromová mřížka s kovovými odlesky a soustředěné oči brankáře hlídající míček.
   - **Unikátní polepy masky dle úrovně:**
     - 🟢 **Junior:** Dva bílé závodní pruhy.
     - 🟡 **Profi:** Tyrkysové blesky na bocích masky.
     - 🔴 **Legenda:** Zlatá královská koruna.
   - **Mohutná silueta & polstrovaná vesta:** Široká ramena s chrániči, 3D stínovaný dres, boční panely a velké číslo 1 s drop shadow.
   - **Florbalové rukavice s prsty:** Profesionální rukavice se silikonovými gripy na dlani, oranžovými sticky polštářky na prstech a páskem na zápěstí; při zákroku do strany se prsty dynamicky rozevírají pro maximální pokrytí.
   - **Brankářské kalhoty a 3D slidery:** Široké polstrované tepláky v kleku, žluté plastické slidery na kolenou s odleskem, které se naklánějí při skoku do strany, a špičky/paty bot vykukující vzadu.

---

## 🚀 Technologie & Výkon

- **2.5D Canvas Engine:** Bleskový start bez zpoždění, stabilní 60 FPS na každém telefonu.
- **Čistá velikost (Bundle):** Pouze ~17.8 kB gzipped bez zbytečných těžkých knihoven a rastrových obrázků.
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
