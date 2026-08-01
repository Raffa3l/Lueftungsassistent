import type { Einstellungen, Gebaeudetyp, Raumtyp, Wetterstunde } from '../typen.ts';
import { celsius, stunden, wattProM2, whProM2K } from '../einheiten.ts';
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
 * Baut eine Stundenreihe aus Aussentemperaturen.
 * Startet am angegebenen Augusttag um `startStunde` Uhr.
 */
export function erzeugeWetterstunden(
  aussentemperaturen: readonly number[],
  startStunde = 0,
  globalstrahlung = 0,
  tag: number = SAMSTAG,
): Wetterstunde[] {
  return aussentemperaturen.map((temperatur, index) => ({
    zeit: new Date(2026, 7, tag, startStunde + index, 0, 0),
    aussentemperaturC: celsius(temperatur),
    globalstrahlungWProM2: wattProM2(globalstrahlung),
    relativeFeuchteProzent: 50,
  }));
}

/** Sinusförmiger Tagesgang: Maximum um 15:00, Minimum um 03:00. */
export function erzeugeTagesgang(
  tage: number,
  mittelwertC: number,
  amplitudeK: number,
  startTag: number = SAMSTAG,
): Wetterstunde[] {
  const temperaturen: number[] = [];
  for (let stunde = 0; stunde < tage * 24; stunde++) {
    const phase = ((stunde % 24) - 15) / 24;
    temperaturen.push(mittelwertC + amplitudeK * Math.cos(2 * Math.PI * phase));
  }
  return erzeugeWetterstunden(temperaturen, 0, 0, startTag);
}
