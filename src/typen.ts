/**
 * Zentrale Typdefinitionen des Lüftungsassistenten.
 *
 * Namenskonvention: Fachbegriffe sind auf Deutsch, Einheiten hängen als Suffix
 * am Feldnamen (C = Grad Celsius, K = Kelvin-Differenz, H = Stunden).
 *
 * Die Einheit steht zusätzlich im Typ (siehe `einheiten.ts`): Eine Temperatur
 * lässt sich einer Flächenlast nicht zuweisen, auch wenn beide Zahlen sind.
 */

import type {
  Celsius,
  Kelvin,
  MeterProSekunde,
  Stunden,
  WattProM2,
  WhProM2K,
} from './einheiten.ts';

/** Eine auswählbare Wetterstation bzw. ein Ort in der Schweiz. */
export interface Wetterstation {
  /** Stabile ID, wird in den LocalStorage-Einstellungen abgelegt. */
  id: string;
  name: string;
  kanton: string;
  breitengrad: number;
  laengengrad: number;
  hoeheMeter: number;
}

/**
 * Thermische Kennwerte eines Gebäudetyps.
 *
 * Das Modell ist ein Ein-Knoten-RC-Modell: Die Raumluft ist mit der Aussenluft
 * über eine Zeitkonstante gekoppelt (Wärmeträgheit inkl. Speichermasse).
 * Amplitudendämpfung und Phasenverschiebung ergeben sich daraus rechnerisch
 * und müssen nicht separat gepflegt werden (siehe `thermischesModell.ts`).
 */
export interface Gebaeudetyp {
  id: string;
  name: string;
  beschreibung: string;
  /**
   * Thermische Zeitkonstante bei geschlossenen Fenstern in Stunden.
   * Gross = träge (viel Speichermasse, gute Dämmung).
   */
  zeitkonstanteGeschlossenH: Stunden;
  /**
   * Thermische Zeitkonstante bei offenen Fenstern in Stunden.
   * Klein = der Raum folgt der Aussentemperatur schnell (hoher Luftwechsel).
   */
  zeitkonstanteOffenH: Stunden;
  /**
   * Maximaler solarer Wärmeeintrag in Watt pro Quadratmeter Bodenfläche bei
   * voller Einstrahlung auf die Fensterebene (Referenz:
   * `REFERENZ_FASSADENSTRAHLUNG_W_PRO_M2`) und **ohne Sonnenschutz**.
   *
   * Enthält Fensterflächenanteil und Glasqualität. Der Behang ist bewusst
   * herausgelöst und wird separat gewählt – so bleiben Bausubstanz und
   * Verschattung getrennt, wie schon Gebäude und Nutzung.
   */
  solarerEintragMaxWProM2: WattProM2;
  /**
   * Anteil des solaren Eintrags, der nicht an der Fensterausrichtung hängt –
   * vor allem das Dach.
   *
   * Ein Dachgeschoss heizt sich auch mit Nordfenstern auf, weil die Sonne aufs
   * Dach brennt; eine Wohnung im Mittelgeschoss nicht. Dieser Anteil wird
   * weiterhin gegen die waagrechte Globalstrahlung gerechnet, der Rest gegen
   * die Einstrahlung auf die Fassade.
   */
  solarAnteilOhneAusrichtung: number;
  /**
   * Wirksame Wärmespeicherfähigkeit in Wattstunden pro Quadratmeter und Kelvin.
   * Sie übersetzt eine Last in W/m² in einen Temperaturanstieg in K/h und ist
   * damit der Grund, warum dieselbe Klasse im Altbau langsamer aufheizt als im
   * Leichtbau.
   */
  speicherkapazitaetWhProM2K: WhProM2K;
  /** Typische Raumtemperatur im Hochsommer, dient als Startwert der Simulation. */
  sommerBasistemperaturC: Celsius;
}

/** Zeitfenster, in dem ein Raum genutzt wird. */
export interface Belegungszeit {
  /** Erste belegte Stunde (einschliesslich). */
  vonStunde: number;
  /** Erste nicht mehr belegte Stunde (ausschliesslich). */
  bisStunde: number;
  /** Nur Montag bis Freitag – für Schule und Büro. */
  nurWerktags: boolean;
}

/**
 * Nutzung des Raums: Wer ist wann drin, und was bringt das an Wärme und
 * verbrauchter Luft mit sich?
 *
 * Bewusst getrennt vom Gebäudetyp: Die Bausubstanz bestimmt, wie träge ein Raum
 * reagiert – die Nutzung bestimmt, wie viel Wärme überhaupt anfällt. Ein
 * Schulzimmer im Altbau und eine Wohnung im Altbau teilen sich die Trägheit,
 * nicht aber die Lasten.
 */
export interface Raumtyp {
  id: string;
  name: string;
  beschreibung: string;
  /** Wärmelast während der Belegung in Watt pro Quadratmeter (Personen, Geräte, Licht). */
  belegungslastWProM2: WattProM2;
  /** Grundlast ausserhalb der Belegung in Watt pro Quadratmeter. */
  grundlastWProM2: WattProM2;
  belegung: Belegungszeit;
  /**
   * Ruht die Nutzung an Feiertagen und in den Ferien? Für Schulzimmer und Büro
   * ja, für eine Wohnung nicht – die wird an Feiertagen eher stärker genutzt.
   */
  beachtetFerien: boolean;
  /**
   * Verlangt die Luftqualität regelmässiges Stosslüften, auch wenn es
   * thermisch ungünstig ist? Bei dichter Belegung (Schulzimmer, Sitzungszimmer)
   * steigt der CO₂-Gehalt sonst weit über das Zumutbare.
   */
  stosslueftungNoetig: boolean;
  /**
   * Fällt in dieser Nutzung stossweise viel Feuchte an – Duschen, Kochen,
   * Wäschetrocknen?
   *
   * Diese Spitzen lassen sich nicht vorhersagen und gehen deshalb nicht in die
   * stündliche Empfehlung ein; sie erscheinen als Merkposten beim Raumtyp. Ein
   * Duschgang setzt rund ein halbes bis ein Kilogramm Wasser frei, ein Ständer
   * nasser Wäsche zwei bis drei.
   */
  feuchtelastStossweise: boolean;
}

/** Eine Stunde Wetterdaten aus der Open-Meteo-API. */
export interface Wetterstunde {
  zeit: Date;
  aussentemperaturC: Celsius;
  /** Globalstrahlung auf die Waagrechte in W/m² – Dachflächen und Bodenreflex. */
  globalstrahlungWProM2: WattProM2;
  /** Direktstrahlung senkrecht zur Sonnenrichtung (DNI), für die Fassadenprojektion. */
  direktstrahlungNormalWProM2: WattProM2;
  /** Diffuse Himmelsstrahlung auf die Waagrechte (DHI). */
  diffusstrahlungWProM2: WattProM2;
  relativeFeuchteProzent: number;
  /**
   * Taupunkt der Aussenluft. Er misst die absolute Feuchte in einer Grösse, die
   * sich direkt mit Raumtemperaturen vergleichen lässt: Liegt er über der
   * Temperatur einer Fläche, schlägt sich dort Wasser nieder.
   */
  taupunktC: Celsius;
  /**
   * Windgeschwindigkeit in 10 m Höhe. Sie bestimmt mit, wie schnell ein offenes
   * Fenster die Raumluft austauscht (siehe `thermischesModell.ts`).
   */
  windgeschwindigkeitMProS: MeterProSekunde;
}

/**
 * Ein selbst eingetragener schulfreier Zeitraum – Schulferien oder Betriebsferien.
 *
 * Die Schulferien sind in der Schweiz kantonal geregelt und ändern jedes Jahr;
 * sie werden deshalb nicht mitgeliefert, sondern vom Nutzer gepflegt.
 * Die nationalen Feiertage rechnet die App selbst aus (`konfiguration/feiertage.ts`).
 */
export interface Ferienzeitraum {
  /** Stabile ID für die Bearbeitung in der Liste. */
  id: string;
  name: string;
  /** Erster freier Tag als ISO-Datum «JJJJ-MM-TT» (einschliesslich). */
  von: string;
  /** Letzter freier Tag als ISO-Datum «JJJJ-MM-TT» (einschliesslich). */
  bis: string;
}

/** Vom Nutzer wählbare Einstellungen (persistiert im LocalStorage). */
export interface Einstellungen {
  stationId: string;
  gebaeudetypId: string;
  raumtypId: string;
  /** Wunsch-Raumtemperatur; darüber wird aktiv gekühlt. */
  zielTemperaturC: Celsius;
  /** Schaltdifferenz in Kelvin, verhindert häufiges Hin- und Herschalten. */
  hystereseK: Kelvin;
  /** Untergrenze: darunter wird nicht weiter ausgekühlt. */
  minRaumtemperaturC: Celsius;
  /** Himmelsrichtung der Hauptfensterfläche (siehe `konfiguration/ausrichtungen.ts`). */
  ausrichtungId: string;
  /** Art des Sonnenschutzes (siehe `konfiguration/sonnenschutz.ts`). */
  sonnenschutzId: string;
  /** Nachtauskühlung (22–07 Uhr) als Strategie zulassen. */
  nachtauskuehlung: boolean;
  /** Selbst gepflegte schulfreie Zeiträume. */
  ferien: Ferienzeitraum[];
  /** Nationale Feiertage als arbeitsfrei behandeln. */
  feiertageBeachten: boolean;
}

/** Empfohlener Fensterzustand. */
export type Fensterstatus = 'oeffnen' | 'schliessen';

/** Dringlichkeit steuert die farbliche Hervorhebung im Dashboard. */
export type Dringlichkeit = 'hoch' | 'normal';

/**
 * Wovon ein Zusatzhinweis handelt.
 *
 * Die Art bestimmt das Symbol in der Oberfläche und die Rangfolge, in der
 * mehrere Hinweise erscheinen (siehe `logik/lueftungslogik.ts`).
 */
export type Hinweisart = 'luftqualitaet' | 'feuchte' | 'wind' | 'kuehlung';

/**
 * Ein ergänzender Hinweis zur Empfehlung.
 *
 * Hinweise schränken die Empfehlung ein oder erklären sie, kehren sie aber nie
 * um: «Fenster schliessen» bleibt «Fenster schliessen», auch wenn die
 * Luftqualität kurzes Stosslüften verlangt.
 */
export interface Hinweis {
  art: Hinweisart;
  /** Ein Wort für die Stundentabelle, z. B. «stosslüften». */
  kuerzel: string;
  /** Ausformulierter Hinweis für die Empfehlungskarte. */
  text: string;
}

/** Ergebnis der Lüftungsbewertung für eine einzelne Stunde. */
export interface Empfehlung {
  status: Fensterstatus;
  dringlichkeit: Dringlichkeit;
  /** Kurztitel für das Dashboard, z. B. «Fenster schliessen». */
  titel: string;
  /** Begründung in einem Satz. */
  begruendung: string;
  /**
   * Ergänzende Hinweise in fester Rangfolge, leer wenn keiner zutrifft.
   * Die Oberfläche zeigt nicht zwingend alle – die Reihenfolge entscheidet.
   */
  zusatzhinweise: Hinweis[];
}

/** Eine simulierte Stunde: Wetter + Raumtemperatur + Empfehlung. */
export interface SimulationsStunde extends Wetterstunde {
  raumtemperaturC: Celsius;
  /** Raumtemperatur im Vergleichsszenario «Fenster bleiben immer zu». */
  raumtemperaturOhneLueftungC: Celsius;
  empfehlung: Empfehlung;
}
