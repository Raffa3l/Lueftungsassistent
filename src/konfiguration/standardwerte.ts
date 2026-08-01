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

/** Referenz-Globalstrahlung, bei der der solare Eintrag sein Maximum erreicht. */
export const REFERENZ_GLOBALSTRAHLUNG_W_PRO_M2 = wattProM2(800);

/** Zeitraum, über den vor «jetzt» eingeschwungen wird (Vorlauf der Simulation). */
export const VORLAUF_TAGE = 3;
