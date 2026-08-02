import type { Ferienzeitraum, Raumtyp } from '../typen.ts';
import { wattProM2 } from '../einheiten.ts';
import { datumsSchluessel, findeFeiertag } from './feiertage.ts';

/**
 * Nutzungsarten und ihre Wärmelasten.
 *
 * Die Lasten sind Erfahrungswerte in Watt pro Quadratmeter Bodenfläche und
 * folgen den üblichen Auslegungsgrössen (SIA 2024). Zur Einordnung: Ein
 * sitzender Mensch gibt rund 70 W trockene Wärme ab.
 *
 *   Schulzimmer  24 Personen auf 60 m² → 0.4 P/m² × 70 W ≈ 28 W/m², dazu
 *                Beleuchtung und Geräte – zusammen rund 35 W/m².
 *   Büro         eine Person je 10 m² → 7 W/m², dazu Rechner, Bildschirme
 *                und Beleuchtung – zusammen rund 20 W/m².
 *   Wohnung      zeitweise belegt, wenig Technik – rund 8 W/m².
 *
 * Wie stark eine Last die Temperatur treibt, hängt vom Gebäudetyp ab: Die
 * Umrechnung in Kelvin pro Stunde erfolgt über dessen Speicherkapazität
 * (siehe `thermischesModell.ts`).
 */
export const RAUMTYPEN: readonly Raumtyp[] = [
  {
    id: 'wohnung',
    name: 'Wohnung',
    beschreibung:
      'Wohn- und Schlafräume. Geringe Lasten, dafür rund um die Uhr nutzbar – die Nachtauskühlung ist hier am wirksamsten.',
    belegungslastWProM2: wattProM2(8),
    grundlastWProM2: wattProM2(3),
    belegung: { vonStunde: 7, bisStunde: 23, nurWerktags: false },
    beachtetFerien: false,
    stosslueftungNoetig: false,
    feuchtelastStossweise: true,
  },
  {
    id: 'schulzimmer',
    name: 'Schulzimmer',
    beschreibung:
      'Dicht belegt: rund 24 Personen erzeugen tagsüber viel Wärme. Nachts und am Wochenende steht der Raum leer und kann auskühlen.',
    belegungslastWProM2: wattProM2(35),
    grundlastWProM2: wattProM2(2),
    belegung: { vonStunde: 8, bisStunde: 16, nurWerktags: true },
    beachtetFerien: true,
    stosslueftungNoetig: true,
    feuchtelastStossweise: false,
  },
  {
    id: 'buero',
    name: 'Büro',
    beschreibung:
      'Personen, Rechner und Bildschirme ergeben eine spürbare Dauerlast während der Arbeitszeit. Geräte im Bereitschaftsbetrieb wärmen auch nachts leicht mit.',
    belegungslastWProM2: wattProM2(20),
    grundlastWProM2: wattProM2(4),
    belegung: { vonStunde: 8, bisStunde: 18, nurWerktags: true },
    beachtetFerien: true,
    stosslueftungNoetig: true,
    feuchtelastStossweise: false,
  },
];

/** Liefert den Raumtyp zur ID, sonst `undefined`. */
export function findeRaumtyp(id: string): Raumtyp | undefined {
  return RAUMTYPEN.find((typ) => typ.id === id);
}

/** Was den Betrieb ausser dem Wochenende noch ruhen lässt. */
export interface Kalender {
  ferien: readonly Ferienzeitraum[];
  feiertageBeachten: boolean;
}

const LEERER_KALENDER: Kalender = { ferien: [], feiertageBeachten: false };

/**
 * Nennt den Grund, warum an diesem Tag nicht gearbeitet wird – Name des
 * Feiertags oder des Ferienzeitraums –, sonst `undefined`.
 *
 * Eigene Einträge gewinnen vor den Feiertagen: Wer einen Zeitraum selbst
 * benennt, will diesen Namen sehen.
 */
export function findeFreienTag(zeit: Date, kalender: Kalender): string | undefined {
  const schluessel = datumsSchluessel(zeit);

  const ferien = kalender.ferien.find(
    (zeitraum) => schluessel >= zeitraum.von && schluessel <= zeitraum.bis,
  );
  if (ferien) return ferien.name;

  return kalender.feiertageBeachten ? findeFeiertag(zeit) : undefined;
}

/**
 * Ist der Raum zu diesem Zeitpunkt belegt?
 *
 * Ohne Kalender zählen nur Belegungszeit und Wochentag; mit Kalender kommen
 * Feiertage und Ferien dazu – aber nur für Nutzungen, die darauf Rücksicht
 * nehmen (`beachtetFerien`).
 */
export function istBelegt(
  zeit: Date,
  raumtyp: Raumtyp,
  kalender: Kalender = LEERER_KALENDER,
): boolean {
  const { vonStunde, bisStunde, nurWerktags } = raumtyp.belegung;

  if (nurWerktags) {
    const wochentag = zeit.getDay(); // 0 = Sonntag, 6 = Samstag
    if (wochentag === 0 || wochentag === 6) return false;
  }

  if (raumtyp.beachtetFerien && findeFreienTag(zeit, kalender)) return false;

  const stunde = zeit.getHours();
  // Zeitfenster über Mitternacht hinaus zulassen (z. B. 22 bis 6 Uhr).
  return vonStunde <= bisStunde
    ? stunde >= vonStunde && stunde < bisStunde
    : stunde >= vonStunde || stunde < bisStunde;
}
