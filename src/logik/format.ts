import type { Celsius, Kelvin } from '../einheiten.ts';

/** Formatierungshelfer – Schweizer Konventionen (Dezimalpunkt, 24-Stunden-Zeit). */

const ZAHL_1_STELLE = new Intl.NumberFormat('de-CH', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const ZAHL_0_STELLEN = new Intl.NumberFormat('de-CH', { maximumFractionDigits: 0 });

/** «23.4 °C» */
export function formatiereTemperatur(wertC: Celsius, nachkommastellen: 0 | 1 = 1): string {
  const formatter = nachkommastellen === 0 ? ZAHL_0_STELLEN : ZAHL_1_STELLE;
  return `${formatter.format(wertC)} °C`;
}

/** Temperaturdifferenz als Betrag, z. B. «3.2 Grad». */
export function formatiereDifferenz(differenzK: Kelvin): string {
  return `${ZAHL_1_STELLE.format(Math.abs(differenzK))} Grad`;
}

/** «14:00» */
export function formatiereUhrzeit(zeit: Date): string {
  return `${String(zeit.getHours()).padStart(2, '0')}:00`;
}

/** «heute 14:00», «morgen 03:00» oder «Do, 03:00». */
export function formatiereZeitpunkt(zeit: Date, referenz: Date = new Date()): string {
  const tagesDifferenz = tagesIndex(zeit) - tagesIndex(referenz);
  if (tagesDifferenz === 0) return `heute ${formatiereUhrzeit(zeit)}`;
  if (tagesDifferenz === 1) return `morgen ${formatiereUhrzeit(zeit)}`;
  const wochentag = zeit.toLocaleDateString('de-CH', { weekday: 'short' });
  return `${wochentag}, ${formatiereUhrzeit(zeit)}`;
}

/** Tagesnummer in lokaler Zeit, für Kalendertagsvergleiche. */
function tagesIndex(zeit: Date): number {
  return Math.floor(
    (zeit.getTime() - zeit.getTimezoneOffset() * 60_000) / 86_400_000,
  );
}
