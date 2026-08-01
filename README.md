# Lüftungsassistent

Wann Fenster auf, wann zu – damit es im Sommer drinnen kühl bleibt.

Die App vergleicht die Aussentemperaturprognose mit einer berechneten
Raumtemperatur und sagt für jede Stunde, ob die Fenster offen oder geschlossen
sein sollten – für Wohnungen, Schulzimmer und Büros. Ohne Sensor, ohne Anmeldung,
ohne Server.

## Schnellstart

```bash
npm install
npm run dev
```

## Was die App macht

- **Standortwahl** aus 14 Schweizer Orten (Zürich, Zug, Luzern, Bern, Basel,
  Lausanne, Genf, St. Gallen, Winterthur, Chur, Sion, Davos, Lugano, Locarno).
- **Gebäudetyp** bestimmt, wie träge der Raum auf die Aussentemperatur reagiert –
  vom Altbau mit dicken Mauern bis zum Dachgeschoss.
- **Raumtyp** bestimmt, wie viel Wärme die Nutzung selbst erzeugt: Wohnung,
  Schulzimmer oder Büro – mit den jeweiligen Belegungszeiten.
- **Ferienkalender** für Schulzimmer und Büro: nationale Feiertage rechnet die App
  selbst aus, Ferienzeiträume trägt man selbst ein.
- **Aktuelle Empfehlung** mit Begründung und dem voraussichtlichen nächsten Wechsel.
- **Temperaturverlauf** über 48 Stunden: Aussen gegen Innen, mit farblich
  hinterlegten Lüftungsfenstern und optionaler Vergleichslinie «ohne Lüften».
- **Stundentabelle** für die nächsten 24 Stunden.
- **Einstellungen** (Wunschtemperatur, Schaltdifferenz, Untergrenze,
  Nachtauskühlung, Ferien) bleiben im Browser gespeichert.

## Technischer Stack

| Baustein | Wahl | Warum |
|---|---|---|
| Build & Dev-Server | **Vite 7** | Schneller Start, ES-Module im Browser, Build nach `dist/` |
| Sprache | **TypeScript 5.9**, `strict` | Zusätzlich `noUncheckedIndexedAccess` und `exactOptionalPropertyTypes` |
| Einheiten | **Branded Types** | Eine Flächenlast lässt sich keiner Temperatur zuweisen |
| Oberfläche | **Vanilla TS + DOM-API** | Kein Framework nötig – die App hat eine Ansicht und wenig Zustand |
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
  logik/                Fachlogik ohne DOM, Netz und Speicher – hier liegen die Tests
  ui/                   DOM-Aufbau, je Abschnitt ein Modul
  main.ts               Zustand und Ablaufsteuerung
```

Die Schichtregel ist der Grund für den Zuschnitt: `logik/` verwendet weder DOM
noch `fetch` noch `localStorage`. Deshalb laufen die Tests ohne Browser-Attrappen –
Simulation und Empfehlungslogik sind reine Funktionen über Zahlen und Daten.

## Wie die Raumtemperatur berechnet wird

Es gibt keinen Sensor. Stattdessen rechnet ein vereinfachtes thermisches Modell
(Ein-Knoten-RC-Modell) den Verlauf:

```
dT/dt = (T_aussen − T_innen) / τ + q
```

- `τ` ist die thermische Zeitkonstante des Gebäudetyps – gross bei viel
  Speichermasse, klein bei Leichtbau. Bei offenem Fenster gilt ein kleineres `τ`.
- `q` sind die Wärmeeinträge: Sonne durch die Fenster (aus der Globalstrahlung der
  Prognose) und die Nutzung des Raums (Personen, Geräte, Licht).

Die Lasten werden in Watt pro Quadratmeter gepflegt und über die Speicherkapazität
des Gebäudes in Kelvin pro Stunde umgerechnet. Erst dadurch greifen Bau und
Nutzung ineinander: Eine Schulklasse mit 35 W/m² treibt die Temperatur im
Leichtbau um knapp 0.9 Grad pro Stunde hoch, im schweren Altbau nur um 0.4.

### Einheiten im Typsystem

Im Modell treffen Zahlen mit sehr unterschiedlicher Bedeutung aufeinander –
Temperaturen, Differenzen, Flächenlasten, Änderungsraten. Alle sind `number`,
und genau das war beim Umbau auf Raumtypen die riskanteste Stelle.

`einheiten.ts` gibt jeder Grösse eine Marke, die nur im Typsystem existiert
(`Celsius`, `Kelvin`, `KelvinProStunde`, `WattProM2`, `WhProM2K`, `Stunden`).
Wer in der Konfiguration Speicherkapazität und solaren Eintrag vertauscht,
bekommt einen Compilerfehler statt eines um den Faktor drei falschen Verlaufs.
Gerechnet wird über Helfer wie `rateAusLast` oder `temperaturPlus`, die nur
physikalisch gültige Verknüpfungen zulassen.

Zur Laufzeit kostet das nichts: Die Marken existieren im Bundle nicht.

Daraus ergeben sich Dämpfung und Verzögerung der Tageswelle von selbst: Ein
Altbau nimmt rund 13 % der Aussenschwankung auf und hinkt ihr etwa 6 Stunden
hinterher, ein Dachgeschoss fast 50 % bei gut 3 Stunden.

Die Simulation läuft drei Tage vor dem aktuellen Zeitpunkt an, damit der
Startwert kaum noch durchschlägt.

## Ferien und freie Tage

Ein leeres Schulzimmer heizt sich nur halb so schnell auf wie ein volles. Die App
unterscheidet deshalb:

**Nationale Feiertage** rechnet sie selbst aus – Neujahr, Karfreitag, Ostermontag,
Auffahrt, Pfingstmontag, 1. August, Weihnachten und Stephanstag. Die vier
beweglichen hängen am Ostersonntag, der über den gregorianischen Osteralgorithmus
bestimmt wird; eine gepflegte Datumsliste würde jedes Jahr veralten.

**Kantonale Feiertage und Schulferien** liefert die App bewusst **nicht** mit.
Sie sind in der Schweiz kantonal geregelt, unterscheiden sich nach Konfession und
ändern jährlich – eine mitgelieferte Liste wäre für die meisten Nutzer schlicht
falsch. Stattdessen trägt man die eigenen Zeiträume in den Einstellungen ein; sie
bleiben wie alle Einstellungen im Browser gespeichert. Dasselbe Feld nimmt
Betriebsferien, Brückentage oder einen einzelnen kantonalen Feiertag auf.

Beides gilt nur für Schulzimmer und Büro. Eine Wohnung wird an Feiertagen eher
stärker genutzt, nicht weniger.

## Wann geöffnet und geschlossen wird

1. Ist der Raum bereits an der Untergrenze → geschlossen.
2. Ist Nacht und die Nachtauskühlung abgeschaltet → geschlossen.
3. Ist es draussen um die Schaltdifferenz kühler → öffnen. Ein bereits offenes
   Fenster bleibt offen, bis die Aussenluft die Raumtemperatur erreicht
   (Hysterese – verhindert stündliches Hin und Her).
4. Sonst → geschlossen.

Bleiben die Fenster zu und ist ein dicht belegter Raum in Betrieb – Schulzimmer
oder Büro –, kommt ein Hinweis auf die **Stosslüftung** dazu: Die Luftqualität
verlangt sie auch bei 35 Grad draussen, und in fünf Minuten kommt kaum Wärme
herein. Die Empfehlung wird dadurch nicht umgekehrt; Stosslüften ist eine kurze
Ausnahme, kein Dauerzustand.

## Datenquelle

[Open-Meteo](https://open-meteo.com/) – kostenlos, ohne Registrierung, CORS-fähig,
für die Schweiz auf Basis des Modells ICON-CH von MeteoSchweiz.

## Tests

```bash
npm run test:run
```

Abgedeckt sind das thermische Modell, die Lüftungslogik, die Raumtypen mit
Belegung und Ferienkalender, die Feiertagsberechnung, die Persistenz und die
Umwandlung der API-Antwort.

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

Die Raumtemperatur ist berechnet, nicht gemessen. Sonnenschutz, Stockwerk,
Fensterfläche und Ausrichtung wirken zusätzlich und sind im Modell nur pauschal
enthalten. Eine Heizung kennt das Modell nicht – es ist für den Sommer gebaut.

Die Belegung folgt festen Zeitfenstern. Halbe Klassen, Randstunden, Homeoffice-Tage
oder eine Sitzung im Nebenraum kennt das Modell nicht – es rechnet mit voller oder
gar keiner Belegung. Kantonale Feiertage und Schulferien wirken nur, soweit sie
eingetragen sind.
