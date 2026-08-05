# Lüftungsassistent

[![Lizenz: MIT](https://img.shields.io/badge/Lizenz-MIT-blue.svg)](LICENSE)
[![GitHub Pages](https://img.shields.io/badge/Demo-GitHub%20Pages-orange.svg)](https://raffa3l.github.io/Lueftungsassistent/)


Wann Fenster auf, wann zu, damit es im Sommer drinnen kühl bleibt.

Die App vergleicht die Aussentemperaturprognose mit einer berechneten
Raumtemperatur und sagt für jede Stunde, ob die Fenster offen oder geschlossen
sein sollten, für Wohnungen, Schulzimmer und Büros. Ohne Sensor, ohne Anmeldung,
ohne Server.

## Schnellstart

```bash
npm install
npm run dev
```

## Was die App macht

- **Standortwahl** aus 14 Schweizer Orten (Zürich, Zug, Luzern, Bern, Basel,
  Lausanne, Genf, St. Gallen, Winterthur, Chur, Sion, Davos, Lugano, Locarno).
- **Gebäudetyp** bestimmt, wie träge der Raum auf die Aussentemperatur reagiert.
  Acht Bauarten vom Altbau mit dicken Mauern bis zum Dachgeschoss, darunter zwei
  eigene für Schul- und Bürobauten, die sich in der wirksamen Speichermasse
  deutlich vom Wohnbau derselben Jahre unterscheiden.
- **Raumtyp** bestimmt, wie viel Wärme die Nutzung selbst erzeugt: Wohnung,
  Schulzimmer oder Büro, mit den jeweiligen Belegungszeiten.
- **Fensterausrichtung und Sonnenschutz**, die beiden stärksten Einflüsse auf
  die sommerliche Überhitzung.
- **Ferienkalender** für Schulzimmer und Büro: nationale Feiertage rechnet die App
  selbst aus, Ferienzeiträume trägt man selbst ein.
- **Aktuelle Empfehlung** mit Begründung und dem voraussichtlichen nächsten Wechsel.
- **Warnungen vor Sturm- und Wasserschaden** bei offenem Fenster: Böen, Sturm,
  Gewitter, Regen und Schnee. Sie ändern die Empfehlung nicht, sondern machen
  darauf aufmerksam, worauf zu achten ist.
- **Temperaturverlauf** über 48 Stunden: Aussen gegen Innen, mit farblich
  hinterlegten Lüftungsfenstern, einem Warnstreifen für gefährdete Stunden und
  optionaler Vergleichslinie «ohne Lüften».
- **Stundentabelle** für die nächsten 24 Stunden, mit Tageswechsel und
  hervorgehobenen Stunden, in denen die Empfehlung umschlägt.
- **Erklärfelder** hinter den berechneten Werten und Schwellwerten: Ein
  Fragezeichen öffnet die Physik und die Annahme dahinter, bei Mauszeiger,
  Tastaturfokus und Tipp.
- **Einstellungen** (Wunschtemperatur, Schaltdifferenz, Untergrenze,
  Nachtauskühlung, Ferien) bleiben im Browser gespeichert.
- **Druckausgabe** auf weissem Grund und ohne Bedienelemente, mit aufgeklappten
  Einstellungen: für den Aushang im Lehrerzimmer oder die Beilage zum Rapport.
- **Zum Home-Bildschirm hinzufügen** über ein Web-App-Manifest, mit eigenem
  Symbol und ohne Adressleiste. Bewusst ohne Offline-Speicher, weil die App
  ohne frische Wetterdaten nichts Sinnvolles zeigen kann.

## Technischer Stack

| Baustein | Wahl | Warum |
|---|---|---|
| Build & Dev-Server | **Vite 7** | Schneller Start, ES-Module im Browser, Build nach `dist/` |
| Sprache | **TypeScript 5.9**, `strict` | Zusätzlich `noUncheckedIndexedAccess` und `exactOptionalPropertyTypes` |
| Einheiten | **Branded Types** | Eine Flächenlast lässt sich keiner Temperatur zuweisen |
| Oberfläche | **Vanilla TS + DOM-API** | Kein Framework nötig, die App hat eine Ansicht und wenig Zustand |
| Diagramm | **Handgeschriebenes SVG** | Eine Chart-Bibliothek wäre grösser als die ganze App |
| Gestaltung | **CSS mit Custom Properties** | Hell/Dunkel über Farbrollen, kein CSS-Framework |
| Tests | **Vitest 3** (Umgebung `node`) | Die Fachlogik ist DOM-frei und braucht keinen Browser |
| Speicher | **LocalStorage** | Nur Komforteinstellungen, validiert beim Laden |
| Daten | **Open-Meteo REST-API** | Kostenlos, ohne Schlüssel, CORS-fähig |
| Veröffentlichung | **GitHub Actions → Pages** | Statisches Hosting genügt |

**Null Laufzeitabhängigkeiten.** `package.json` enthält keine `dependencies`, nur
die drei Werkzeuge oben als `devDependencies`.

Build-Ziel ist ES2022, gebaut wird mit Node 22 oder neuer.

### Aufbau

```
src/
  typen.ts              Zentrale Typdefinitionen
  konfiguration/        Reine Daten: Standorte, Gebäudetypen, Raumtypen,
                        Feiertage, Standardwerte
  dienste/              Aussenwelt: Wetter-API, LocalStorage
  logik/                Fachlogik ohne DOM, Netz und Speicher, hier liegen die Tests
  ui/                   DOM-Aufbau, je Abschnitt ein Modul
  main.ts               Zustand und Ablaufsteuerung
```

Die Schichtregel ist der Grund für den Zuschnitt: `logik/` verwendet weder DOM
noch `fetch` noch `localStorage`. Deshalb laufen die Tests ohne
Browser-Attrappen: Simulation und Empfehlungslogik sind reine Funktionen über
Zahlen und Daten.

## Wie die Raumtemperatur berechnet wird

Es gibt keinen Sensor. Stattdessen rechnet ein vereinfachtes thermisches Modell
(Ein-Knoten-RC-Modell) den Verlauf:

```
dT/dt = (T_aussen − T_innen) / τ + q
```

- `τ` ist die thermische Zeitkonstante des Gebäudetyps, gross bei viel
  Speichermasse, klein bei Leichtbau. Bei offenem Fenster gilt ein kleineres `τ`,
  das zusätzlich vom Wind abhängt: Er treibt den Luftwechsel.
- `q` sind die Wärmeeinträge: Sonne durch die Fenster und die Nutzung des Raums
  (Personen, Geräte, Licht).

Die Lasten werden in Watt pro Quadratmeter gepflegt und über die Speicherkapazität
des Gebäudes in Kelvin pro Stunde umgerechnet. Erst dadurch greifen Bau und
Nutzung ineinander: Eine Schulklasse mit 35 W/m² treibt die Temperatur im
Leichtbau um knapp 0.9 Grad pro Stunde hoch, im schweren Altbau nur um 0.4.

Daraus ergeben sich Dämpfung und Verzögerung der Tageswelle von selbst: Ein
Altbau nimmt rund 13 % der Aussenschwankung auf und hinkt ihr etwa 5.5 Stunden
hinterher, ein Dachgeschoss fast 50 % bei gut 4 Stunden. Die Bauarten
unterscheiden sich also vor allem in der Dämpfung, die Verzögerung kann bei
einem solchen Modell sechs Stunden nie überschreiten.

Die Simulation läuft sieben Tage vor dem aktuellen Zeitpunkt an, damit der
Startwert kaum noch durchschlägt. Dieselben Vortage speisen den Vorschlag für
die Wunschtemperatur.

### Sonne, Ausrichtung und Sonnenschutz

Für ein Fenster zählt nicht die Strahlung auf den Boden, sondern der
Einfallswinkel auf die Fassade. Die App rechnet den Sonnenstand deshalb selbst:
Deklination, Zeitgleichung, Stundenwinkel, und projiziert die Direktstrahlung
auf die Fensterebene, dazu der halbe Himmel als Streulicht und die
Bodenreflexion. An klaren Sommertagen ergibt das:

| Fassade | Spitze | wann | |
|---|---:|---|---|
| Nord | 100–150 W/m² |, | nur Streulicht |
| Süd | 400–500 W/m² | mittags | die hohe Sonne streift nur |
| Ost | 600–700 W/m² | morgens | der Raum ist noch kühl |
| **West** | **600–700 W/m²** | **nachmittags** | **der kritische Fall** |

Gerechnet wird lokal und nicht über den API-Parameter für geneigte Flächen,
damit ein Wechsel der Ausrichtung keinen Netzabruf auslöst.

Der **Sonnenschutz** ist davon getrennt und der grössere Hebel: Zwischen
aussenliegenden Storen (g ≈ 0.12) und blankem Fenster (g ≈ 0.65) liegt Faktor
vier. Innenliegende Vorhänge bringen wenig, weil die Strahlung die Scheibe
bereits durchquert hat und im Raum zu Wärme wird.

Was nicht am Fenster hängt, trennt `solarAnteilOhneAusrichtung` ab: Ein
Dachgeschoss heizt sich auch mit Nordfenstern auf, weil die Sonne aufs Dach
brennt, dort helfen auch geschlossene Storen nur begrenzt.

### Einheiten im Typsystem

Im Modell treffen Zahlen mit sehr unterschiedlicher Bedeutung aufeinander:
Temperaturen, Differenzen, Flächenlasten, Änderungsraten.

`einheiten.ts` gibt jeder Grösse eine Marke, die nur im Typsystem existiert
(`Celsius`, `Kelvin`, `KelvinProStunde`, `WattProM2`, `WhProM2K`, `Stunden`,
`GrammProKg`, `MeterProSekunde`). Wer in der Konfiguration Speicherkapazität und
solaren Eintrag vertauscht, bekommt einen Compilerfehler statt eines um den
Faktor drei falschen Verlaufs.
Gerechnet wird über Helfer wie `rateAusLast` oder `temperaturPlus`, die nur
physikalisch gültige Verknüpfungen zulassen.

Zur Laufzeit kostet das nichts: Die Marken existieren im Bundle nicht.

## Ferien und freie Tage

Ein leeres Schulzimmer heizt sich nur halb so schnell auf wie ein volles. Die App
unterscheidet deshalb:

**Nationale Feiertage** rechnet sie selbst aus: Neujahr, Karfreitag, Ostermontag,
Auffahrt, Pfingstmontag, 1. August, Weihnachten und Stephanstag. Die vier
beweglichen hängen am Ostersonntag, der über den gregorianischen Osteralgorithmus
bestimmt wird; eine gepflegte Datumsliste würde jedes Jahr veralten.

**Kantonale Feiertage und Schulferien** liefert die App bewusst **nicht** mit.
Sie sind in der Schweiz kantonal geregelt, unterscheiden sich nach Konfession und
ändern jährlich, eine mitgelieferte Liste wäre für die meisten Nutzer schlicht
falsch. Stattdessen trägt man die eigenen Zeiträume in den Einstellungen ein; sie
bleiben wie alle Einstellungen im Browser gespeichert. Dasselbe Feld nimmt
Betriebsferien, Brückentage oder einen einzelnen kantonalen Feiertag auf.

Beides gilt nur für Schulzimmer und Büro. Eine Wohnung wird an Feiertagen eher
stärker genutzt, nicht weniger.

## Wann geöffnet und geschlossen wird

1. Ist der Raum bereits an der Untergrenze → geschlossen.
2. Kann niemand ein Fenster bedienen und ist die Nachtauskühlung abgeschaltet →
   geschlossen. Das betrifft die Nacht, bei Schulzimmer und Büro auch die
   Stunden ausserhalb der Nutzungszeit sowie das Wochenende.
3. Ist es draussen um die Schaltdifferenz kühler → öffnen. Ein bereits offenes
   Fenster bleibt offen, bis die Aussenluft die Raumtemperatur erreicht
   (Hysterese gegen stündliches Hin und Her).
4. Sonst → geschlossen.

Vor Regel 3 steht eine **Vorausschau**: Wer abends öffnet, entscheidet für die
ganze Nacht, denn nachjustieren kann niemand. Würde durchgehendes Lüften den
Raum unter die Untergrenze führen, rät die App gar nicht erst zum Öffnen und
nennt den Wert, auf den es hinausliefe. Sonst stünde irgendwann um vier Uhr
morgens ein «Fenster schliessen», das niemand befolgen kann.

Bleiben die Fenster zu und ist ein dicht belegter Raum in Betrieb, also
Schulzimmer oder Büro, kommt ein Hinweis auf die **Stosslüftung** dazu: Die
Luftqualität verlangt sie auch bei 35 Grad draussen, und in fünf Minuten kommt
kaum Wärme herein. Die Empfehlung wird dadurch nicht umgekehrt; Stosslüften ist
eine kurze Ausnahme, kein Dauerzustand.

### Warnungen bei offenem Fenster

Rät die App zum Öffnen, prüft sie zusätzlich, ob dabei Schaden droht: Böen ab
rund 43 km/h können einen Flügel zuschlagen lassen, ab 61 km/h gilt die
Warnstufe von MeteoSchweiz. Dazu kommen Gewitter, Regen ab einem halben
Millimeter je Stunde und Schneefall. Massgeblich ist die **Böe**, nicht der
mittlere Wind: In einer gemessenen Woche in Zürich standen 22 km/h Mittelwind
fast 86 km/h Böen gegenüber.

Diese Warnungen stehen vor allen anderen Hinweisen, ändern die Empfehlung aber
nicht. Regenluft kühlt gut und ist thermisch oft die beste Gelegenheit des
Tages; ob das Fenster trotzdem offen bleibt, entscheidet der Mensch davor.

### Feuchte, Wind und Kühlung

Der Entscheid selbst hängt allein an der Temperatur. Feuchte und Wind erzeugen
nur **Zusatzhinweise** und kehren die Empfehlung nie um, kühlere Aussenluft
kühlt auch dann, wenn sie feucht ist:

- **Tauwasser:** Trifft schwüle Aussenluft auf einen nachtausgekühlten Raum,
  schlägt sich Wasser an kühlen Wänden und Böden nieder. Dann heisst es kurz und
  kräftig lüften statt Fenster dauerhaft offen.
- **Schwüle:** Ab einem Aussentaupunkt von 16 Grad fühlt sich die Luft auch nach
  dem Lüften schwer an. Massgeblich ist die absolute Feuchte, nicht die relative:
  Nachtluft mit 16 Grad und 95 % enthält weniger Wasser als Raumluft mit 26 Grad
  und 60 %, sie trocknet den Raum also, statt ihn zu befeuchten.
- **Wind:** Er treibt den Luftwechsel am offenen Fenster und verkürzt damit die
  Zeitkonstante des Raums. Zwischen Flaute und steifer Brise liegt rund Faktor
  drei; bei geschlossenen Fenstern bleibt er ohne Wirkung.
- **Luftbewegung im Raum:** Müssen die Fenster zu bleiben, senkt ein Ventilator
  das Temperaturempfinden um zwei bis drei Grad. Der Hinweis erscheint erst ab
  26 Grad Raumtemperatur, weil darunter derselbe Luftzug als Zugluft empfunden
  wird; EN 16798-1 lässt erhöhte Luftgeschwindigkeiten ebenfalls erst oberhalb
  dieser Marke zu. Nach oben kippt der Nutzen bei trockener Extremhitze über
  35 Grad: Dann wärmt die bewegte Luft mehr, als die Verdunstung kühlt. Der
  Ventilator selbst gibt seine ganze Leistung als Wärme ab, rund 0.3 Grad je
  Arbeitstag in einem Zimmer von 20 Quadratmetern.

### Wunschtemperatur

Als behaglich empfundene Innentemperaturen steigen mit dem Wetter der Vortage.
Die App rechnet den Wert nach dem adaptiven Komfortmodell (EN 16798-1, Grundlage
auch von SIA 180) aus und **schlägt** ihn im Einstellungsformular vor,
übernehmen muss ihn die Nutzerin selbst. Nach einer Hitzewoche liegt er bei 26.5 Grad statt bei den voreingestellten 24.

## Datenquelle

[Open-Meteo](https://open-meteo.com/), kostenlos, ohne Registrierung, CORS-fähig,
für die Schweiz auf Basis des Modells ICON-CH von MeteoSchweiz.

## Tests

```bash
npm run test:run
```

Abgedeckt sind das thermische Modell samt Wind- und Sonnenkorrektur, der
Sonnenstand, die Lüftungslogik, die Feuchterechnungen, das adaptive
Komfortmodell, die Raumtypen mit Belegung und Ferienkalender, die
Feiertagsberechnung, die Persistenz und die Umwandlung der API-Antwort.

## Deployment

Statisches Hosting, kein Backend nötig:

```bash
npm run build   # erzeugt dist/
```

`dist/` auf GitHub Pages, Netlify oder Vercel veröffentlichen. Die Basis-URL ist
relativ gesetzt, ein Unterverzeichnis funktioniert also ohne Anpassung.

Für GitHub Pages liegt ein Workflow bereit: `.github/workflows/deploy.yml` testet,
baut und veröffentlicht bei jedem Push auf `main`. Einmalig einzurichten ist nur
Settings → Pages → Source: «GitHub Actions».

## Grenzen des Modells

Die Raumtemperatur ist berechnet, nicht gemessen. Ausrichtung und Sonnenschutz
gehen eigens ein; Stockwerk, Fenstergrösse und die Verschattung durch
Nachbarhäuser, Dachvorsprünge oder Bäume stecken nur pauschal im Gebäudetyp.
Eine Heizung kennt das Modell nicht, es ist für den Sommer gebaut.

Bei Räumen mit Fenstern nach mehreren Seiten zählt die grösste Fläche. Eine
Aufteilung wäre rechenbar, verlangt dem Nutzer aber eine Schätzung ab, die er
selten belastbar geben kann.

Die Belegung folgt festen Zeitfenstern. Halbe Klassen, Randstunden, Homeoffice-Tage
oder eine Sitzung im Nebenraum kennt das Modell nicht, es rechnet mit voller oder
gar keiner Belegung. Kantonale Feiertage und Schulferien wirken nur, soweit sie
eingetragen sind.

Die **Innenfeuchte** wird nicht gerechnet. Die Feuchtehinweise beurteilen die
Aussenluft; die Raumfeuchte wird nur dort, wo es nötig ist, aus dem Aussentaupunkt
und der Raumtemperatur geschätzt. Duschen, Kochen und Wäschetrocknen lassen sich
nicht vorhersagen und stecken deshalb als Merkposten im Raumtyp statt in der
stündlichen Empfehlung.

Der **Wind** stammt aus 10 Meter Messhöhe. Wie viel davon am Fenster ankommt,
hängt an Bebauung, Stockwerk und Ausrichtung, die Korrektur ist deshalb bewusst
gedämpft und nach oben begrenzt.
