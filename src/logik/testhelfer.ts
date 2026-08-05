import type { Einstellungen, Gebaeudetyp, Raumtyp, Wetterstunde } from '../typen.ts';
import {
  celsius,
  meterProSekunde,
  millimeterProStunde,
  stunden,
  wattProM2,
  whProM2K,
} from '../einheiten.ts';
import { STANDARD_EINSTELLUNGEN } from '../konfiguration/standardwerte.ts';

/** Gemeinsame Bausteine für die Unit-Tests. */

/**
 * Gut überschaubarer Testgebäudetyp mit runden Kennwerten.
 * Die Speicherkapazität von 50 Wh/(m²K) macht die Umrechnung leicht nachvollziehbar:
 * 50 W/m² Last ergeben genau 1 K/h.
 */
export const TEST_GEBAEUDE: Gebaeudetyp = {
  id: 'test',
  name: 'Testgebäude',
  beschreibung: 'Nur für Tests',
  zeitkonstanteGeschlossenH: stunden(20),
  zeitkonstanteOffenH: stunden(5),
  solarerEintragMaxWProM2: wattProM2(0),
  solarAnteilOhneAusrichtung: 0,
  speicherkapazitaetWhProM2K: whProM2K(50),
  sommerBasistemperaturC: celsius(24),
};

/**
 * Lastfreier Testraum: isoliert das rein thermische Verhalten,
 * damit Modelltests nicht von Nutzungsannahmen überlagert werden.
 */
export const TEST_RAUM: Raumtyp = {
  id: 'test',
  name: 'Testraum',
  beschreibung: 'Nur für Tests, ohne Lasten',
  belegungslastWProM2: wattProM2(0),
  grundlastWProM2: wattProM2(0),
  belegung: { vonStunde: 8, bisStunde: 18, nurWerktags: false },
  beachtetFerien: false,
  stosslueftungNoetig: false,
  feuchtelastStossweise: false,
};

export function testEinstellungen(ueberschreibungen: Partial<Einstellungen> = {}): Einstellungen {
  return { ...STANDARD_EINSTELLUNGEN, ...ueberschreibungen };
}

/**
 * Kalendertage im August 2026 mit bekanntem Wochentag.
 *
 * Der Wochentag ist seit den Raumtypen verhaltensrelevant: Schulzimmer und Büro
 * sind nur Montag bis Freitag belegt. Tests müssen ihn deshalb bewusst wählen.
 */
export const SAMSTAG = 1; // 1. August 2026
export const MONTAG = 3; // 3. August 2026

/**
 * Unauffällige Standardluft für Modelltests.
 *
 * Der Taupunkt von 5 °C liegt unter jeder Schwüle- und Kondensationsschwelle.
 * Der Wind entspricht dem Referenzwind des Modells, bei dem die konfigurierten
 * Zeitkonstanten unverändert gelten, so prüfen Modelltests das thermische
 * Verhalten und nicht nebenbei die Windkorrektur. Tests zu Feuchte und Wind
 * setzen die Werte ausdrücklich.
 */
const TROCKEN_TAUPUNKT_C = 5;
const REFERENZ_WIND_M_PRO_S = 2;

/**
 * Ruhiges Wetter als Ausgangslage: keine Böen über der Warnschwelle, kein
 * Niederschlag, kein Gewitter. Tests zu den Warnhinweisen setzen die Werte
 * ausdrücklich, so bleibt sichtbar, welcher Wert die Warnung auslöst.
 */
const RUHIGE_BOEE_M_PRO_S = 3;
const WMO_KLAR = 0;

/**
 * Baut eine Stundenreihe aus Aussentemperaturen.
 * Startet am angegebenen Augusttag um `startStunde` Uhr.
 */
export function erzeugeWetterstunden(
  aussentemperaturen: readonly number[],
  startStunde = 0,
  globalstrahlung = 0,
  tag: number = SAMSTAG,
  zusatz: Partial<Wetterstunde> = {},
): Wetterstunde[] {
  return aussentemperaturen.map((temperatur, index) => ({
    zeit: new Date(2026, 7, tag, startStunde + index, 0, 0),
    aussentemperaturC: celsius(temperatur),
    globalstrahlungWProM2: wattProM2(globalstrahlung),
    direktstrahlungNormalWProM2: wattProM2(0),
    diffusstrahlungWProM2: wattProM2(0),
    relativeFeuchteProzent: 50,
    taupunktC: celsius(TROCKEN_TAUPUNKT_C),
    windgeschwindigkeitMProS: meterProSekunde(REFERENZ_WIND_M_PRO_S),
    windboeeMProS: meterProSekunde(RUHIGE_BOEE_M_PRO_S),
    niederschlagMmProH: millimeterProStunde(0),
    schneefallCm: 0,
    wettercode: WMO_KLAR,
    ...zusatz,
  }));
}

/** Sinusförmiger Tagesgang: Maximum um 15:00, Minimum um 03:00. */
export function erzeugeTagesgang(
  tage: number,
  mittelwertC: number,
  amplitudeK: number,
  startTag: number = SAMSTAG,
  zusatz: Partial<Wetterstunde> = {},
): Wetterstunde[] {
  const temperaturen: number[] = [];
  for (let stunde = 0; stunde < tage * 24; stunde++) {
    const phase = ((stunde % 24) - 15) / 24;
    temperaturen.push(mittelwertC + amplitudeK * Math.cos(2 * Math.PI * phase));
  }
  return erzeugeWetterstunden(temperaturen, 0, 0, startTag, zusatz);
}
