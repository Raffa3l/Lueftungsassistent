import type { Einstellungen } from '../typen.ts';
import { celsius, kelvin, wattProM2 } from '../einheiten.ts';

/** Voreinstellungen für den ersten Besuch (noch nichts im LocalStorage). */
export const STANDARD_EINSTELLUNGEN: Einstellungen = {
  stationId: 'zuerich',
  gebaeudetypId: 'nachkriegsbau',
  raumtypId: 'wohnung',
  zielTemperaturC: celsius(24),
  hystereseK: kelvin(2),
  minRaumtemperaturC: celsius(20),
  // Süd als Ausgangspunkt: die häufigste Hauptausrichtung von Wohnräumen und
  // zugleich der mittlere Fall zwischen dem kühlen Norden und dem harten Westen.
  ausrichtungId: 'sued',
  // Aussenliegende Storen sind im Schweizer Wohnungsbau der Regelfall.
  sonnenschutzId: 'aussen',
  nachtauskuehlung: true,
  ferien: [],
  feiertageBeachten: true,
};

/** Obergrenze für selbst eingetragene Ferienzeiträume (schützt den Speicher). */
export const MAX_FERIENZEITRAEUME = 40;

/** Zulässige Wertebereiche der numerischen Einstellungen (auch fürs UI). */
export const GRENZWERTE = {
  zielTemperaturC: { min: 18, max: 30, schritt: 0.5 },
  hystereseK: { min: 0.5, max: 5, schritt: 0.5 },
  minRaumtemperaturC: { min: 15, max: 25, schritt: 0.5 },
} as const;

/** Nachtfenster für die Nachtauskühlung: ab 22 Uhr bis vor 7 Uhr. */
export const NACHT_BEGINN_STUNDE = 22;
export const NACHT_ENDE_STUNDE = 7;

/**
 * Referenz-Globalstrahlung auf die Waagrechte: Bezugsgrösse für den Anteil des
 * solaren Eintrags, der nicht an der Fensterausrichtung hängt (Dachflächen).
 */
export const REFERENZ_GLOBALSTRAHLUNG_W_PRO_M2 = wattProM2(800);

/**
 * Referenz-Einstrahlung in der Fensterebene, bei der der solare Eintrag durchs
 * Fenster sein Maximum erreicht.
 *
 * Niedriger als die waagrechte Referenz, weil eine senkrechte Fläche im
 * Hochsommer nie die volle Globalstrahlung abbekommt: Die Sonne steht zu hoch.
 * Ost- und Westfassaden erreichen an klaren Tagen 600 bis 700 W/m², eine
 * Südfassade mittags rund 450.
 */
export const REFERENZ_FASSADENSTRAHLUNG_W_PRO_M2 = wattProM2(600);

/**
 * Zeitraum, über den vor «jetzt» eingeschwungen wird (Vorlauf der Simulation).
 *
 * Sieben Tage, weil das adaptive Komfortmodell so viele Vortage gewichtet
 * (`logik/komfort.ts`). Für die Simulation selbst würden drei genügen; der
 * längere Vorlauf schadet ihr nicht, sondern lässt sie besser einschwingen.
 */
export const VORLAUF_TAGE = 7;
