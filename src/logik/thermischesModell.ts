import type {
  Einstellungen,
  Fensterstatus,
  Gebaeudetyp,
  Raumtyp,
  SimulationsStunde,
  Wetterstunde,
} from '../typen.ts';
import {
  anstiegUeber,
  anteil,
  celsius,
  rateAusLast,
  skaliereKelvin,
  skaliereLast,
  stunden,
  summeLast,
  temperaturDifferenz,
  temperaturPlus,
  type Celsius,
  type KelvinProStunde,
  type Stunden,
  type WattProM2,
} from '../einheiten.ts';
import { REFERENZ_GLOBALSTRAHLUNG_W_PRO_M2 } from '../konfiguration/standardwerte.ts';
import { istBelegt, type Kalender } from '../konfiguration/raumtypen.ts';
import { bewerteStunde } from './lueftungslogik.ts';

/**
 * Vereinfachtes thermisches Gebäudemodell (Ein-Knoten-RC-Modell).
 *
 * Grundgleichung:  dT/dt = (T_aussen − T_innen) / τ + q
 *
 *   τ  thermische Zeitkonstante in Stunden (Wärmeträgheit inkl. Speichermasse);
 *      hängt davon ab, ob die Fenster offen sind
 *   q  Wärmeeinträge in K/h – Sonne durch die Fenster und Nutzung (Personen,
 *      Geräte, Licht). Die Lasten werden in W/m² gepflegt und über die
 *      Speicherkapazität des Gebäudes in K/h umgerechnet.
 *
 * Pro Stunde wird die Gleichung analytisch gelöst statt numerisch genähert –
 * das ist exakt für konstante Randbedingungen und auch bei kleinem τ stabil:
 *
 *   T(t+Δt) = T_∞ + (T(t) − T_∞) · e^(−Δt/τ)   mit   T_∞ = T_aussen + q·τ
 *
 * Dämpfung und Phasenverschiebung der Tageswelle sind keine eigenen Parameter,
 * sondern ergeben sich aus τ (siehe `amplitudendaempfung` / `phasenverschiebungH`).
 */

/** Ergebnis eines Simulationslaufs. */
export interface Simulationsergebnis {
  stunden: SimulationsStunde[];
  startRaumtemperaturC: Celsius;
}

/**
 * Wärmelast einer Stunde in Watt pro Quadratmeter Bodenfläche –
 * Sonne durch die Fenster plus Nutzung (Personen, Geräte, Licht).
 */
export function waermelastWProM2(
  wetter: Wetterstunde,
  gebaeude: Gebaeudetyp,
  raumtyp: Raumtyp,
  kalender?: Kalender,
): WattProM2 {
  const strahlungsanteil = Math.min(
    1,
    Math.max(0, anteil(wetter.globalstrahlungWProM2, REFERENZ_GLOBALSTRAHLUNG_W_PRO_M2)),
  );
  const solar = skaliereLast(gebaeude.solarerEintragMaxWProM2, strahlungsanteil);

  const nutzung = istBelegt(wetter.zeit, raumtyp, kalender)
    ? raumtyp.belegungslastWProM2
    : raumtyp.grundlastWProM2;

  return summeLast(solar, nutzung);
}

/**
 * Wärmeeinträge einer Stunde in Kelvin pro Stunde.
 *
 * Die Speicherkapazität des Gebäudes übersetzt die Last: Dieselbe Schulklasse
 * treibt die Temperatur im Leichtbau dreimal so schnell hoch wie im Altbau.
 */
export function waermeeintragKProH(
  wetter: Wetterstunde,
  gebaeude: Gebaeudetyp,
  raumtyp: Raumtyp,
  kalender?: Kalender,
): KelvinProStunde {
  return rateAusLast(
    waermelastWProM2(wetter, gebaeude, raumtyp, kalender),
    gebaeude.speicherkapazitaetWhProM2K,
  );
}

/**
 * Rechnet die Raumtemperatur um einen Zeitschritt weiter.
 *
 * @param schrittH Schrittweite in Stunden (Standard: 1)
 */
export function naechsteRaumtemperatur(
  raumtemperaturC: Celsius,
  wetter: Wetterstunde,
  gebaeude: Gebaeudetyp,
  raumtyp: Raumtyp,
  fensterOffen: boolean,
  kalender?: Kalender,
  schrittH: Stunden = stunden(1),
): Celsius {
  const zeitkonstanteH = fensterOffen ? gebaeude.zeitkonstanteOffenH : gebaeude.zeitkonstanteGeschlossenH;

  // Beharrungstemperatur T_∞ = T_aussen + q·τ
  const beharrungstemperaturC = temperaturPlus(
    wetter.aussentemperaturC,
    anstiegUeber(waermeeintragKProH(wetter, gebaeude, raumtyp, kalender), zeitkonstanteH),
  );

  // T(t+Δt) = T_∞ + (T(t) − T_∞) · e^(−Δt/τ)
  const abstandK = temperaturDifferenz(raumtemperaturC, beharrungstemperaturC);
  return temperaturPlus(
    beharrungstemperaturC,
    skaliereKelvin(abstandK, Math.exp(-schrittH / zeitkonstanteH)),
  );
}

/**
 * Schätzt die Raumtemperatur zu Beginn des Simulationszeitraums.
 *
 * Die Jahreszeit steckt implizit im Mittel der ersten 24 Aussentemperaturen;
 * der Gebäudetyp bestimmt, wie stark die Schätzung stattdessen an seiner
 * typischen Sommer-Basistemperatur hängt (träge Gebäude: stärker).
 * Der Vorlauf der Simulation gleicht Fehler dieser Schätzung ohnehin weitgehend aus.
 */
export function schaetzeStartRaumtemperatur(
  wetter: readonly Wetterstunde[],
  gebaeude: Gebaeudetyp,
): Celsius {
  const ersterTag = wetter.slice(0, 24);
  if (ersterTag.length === 0) return gebaeude.sommerBasistemperaturC;

  const mittleresAussenC =
    ersterTag.reduce((summe, stunde) => summe + stunde.aussentemperaturC, 0) / ersterTag.length;

  // Träge Gebäude (grosses τ) hängen stärker an ihrer Basistemperatur.
  const traegheitsgewicht = Math.min(0.8, gebaeude.zeitkonstanteGeschlossenH / 40);
  const geschaetztC =
    traegheitsgewicht * gebaeude.sommerBasistemperaturC +
    (1 - traegheitsgewicht) * (mittleresAussenC + 2);

  return celsius(Math.min(32, Math.max(16, geschaetztC)));
}

/**
 * Simuliert den Raumtemperaturverlauf über den gesamten Wetterzeitraum und
 * bewertet jede Stunde.
 *
 * Es werden zwei Verläufe gerechnet:
 *  - `raumtemperaturC`: Bewohnerinnen und Bewohner folgen der Empfehlung
 *  - `raumtemperaturOhneLueftungC`: Vergleichsszenario mit immer geschlossenen Fenstern
 */
export function simuliere(
  wetter: readonly Wetterstunde[],
  gebaeude: Gebaeudetyp,
  raumtyp: Raumtyp,
  einstellungen: Einstellungen,
  startRaumtemperaturC = schaetzeStartRaumtemperatur(wetter, gebaeude),
): Simulationsergebnis {
  const stunden: SimulationsStunde[] = [];
  let raumC = startRaumtemperaturC;
  let raumOhneLueftungC = startRaumtemperaturC;
  let vorherigerStatus: Fensterstatus = 'schliessen';
  const kalender: Kalender = {
    ferien: einstellungen.ferien,
    feiertageBeachten: einstellungen.feiertageBeachten,
  };

  for (const stunde of wetter) {
    const empfehlung = bewerteStunde({
      aussentemperaturC: stunde.aussentemperaturC,
      raumtemperaturC: raumC,
      stundeDesTages: stunde.zeit.getHours(),
      einstellungen,
      vorherigerStatus,
      raumBelegt: istBelegt(stunde.zeit, raumtyp, kalender),
      stosslueftungNoetig: raumtyp.stosslueftungNoetig,
    });

    stunden.push({
      ...stunde,
      raumtemperaturC: raumC,
      raumtemperaturOhneLueftungC: raumOhneLueftungC,
      empfehlung,
    });

    // Zustand auf die nächste Stunde fortschreiben.
    const fensterOffen = empfehlung.status === 'oeffnen';
    raumC = naechsteRaumtemperatur(raumC, stunde, gebaeude, raumtyp, fensterOffen, kalender);
    raumOhneLueftungC = naechsteRaumtemperatur(
      raumOhneLueftungC,
      stunde,
      gebaeude,
      raumtyp,
      false,
      kalender,
    );
    vorherigerStatus = empfehlung.status;
  }

  return { stunden, startRaumtemperaturC };
}

/**
 * Amplitudendämpfung der Tagesschwankung (0–1): Wie viel der Aussenschwankung
 * kommt drinnen an? Analytische Antwort des RC-Glieds auf eine Sinuswelle.
 */
export function amplitudendaempfung(zeitkonstanteH: number, periodeH = 24): number {
  const kreisfrequenz = (2 * Math.PI) / periodeH;
  return 1 / Math.sqrt(1 + (kreisfrequenz * zeitkonstanteH) ** 2);
}

/** Phasenverschiebung in Stunden: Wie viel später kommt das Maximum drinnen an? */
export function phasenverschiebungH(zeitkonstanteH: number, periodeH = 24): number {
  const kreisfrequenz = (2 * Math.PI) / periodeH;
  return Math.atan(kreisfrequenz * zeitkonstanteH) / kreisfrequenz;
}

/**
 * Index der Stunde, die «jetzt» enthält (letzter Eintrag mit zeit <= jetzt).
 * Fällt `jetzt` vor den Datenbereich, wird 0 geliefert.
 */
export function findeIndexFuerJetzt(stunden: readonly SimulationsStunde[], jetzt: Date): number {
  let index = 0;
  for (let i = 0; i < stunden.length; i++) {
    const stunde = stunden[i];
    if (stunde && stunde.zeit.getTime() <= jetzt.getTime()) index = i;
    else break;
  }
  return index;
}
