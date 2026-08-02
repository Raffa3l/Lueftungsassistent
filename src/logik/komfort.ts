import type { Wetterstunde } from '../typen.ts';
import { celsius, type Celsius } from '../einheiten.ts';
import { datumsSchluessel } from '../konfiguration/feiertage.ts';
import { GRENZWERTE } from '../konfiguration/standardwerte.ts';

/**
 * Adaptives Komfortmodell nach EN 16798-1 (vormals EN 15251), auf dem auch
 * SIA 180 für Gebäude ohne mechanische Kühlung aufbaut.
 *
 * Der Kern: Die als behaglich empfundene Innentemperatur ist keine Konstante.
 * Sie steigt mit dem gleitenden Mittel der Aussentemperatur der Vortage, weil
 * sich Kleidung, Erwartung und Körper an die Wetterlage anpassen. Nach einer
 * Hitzewoche empfinden dieselben Menschen 26 °C als angenehm, die im Mai noch
 * 23 °C bevorzugt hätten.
 *
 * Für den Lüftungsassistenten heisst das: Eine fest eingestellte
 * Wunschtemperatur von 24 °C ist im Hochsommer zu streng. Sie lässt Stunden als
 * dringlich erscheinen, in denen Lüften weder nötig noch überhaupt erreichbar
 * ist. Die App rechnet deshalb einen Vorschlag aus – übernehmen muss ihn der
 * Nutzer selbst.
 */

/**
 * Gewichte der sieben Vortage nach EN 16798-1, jüngster Tag zuerst.
 * Ihre Summe von 3.8 ist der Nenner der Normgleichung.
 */
const TAGESGEWICHTE: readonly number[] = [1, 0.8, 0.6, 0.5, 0.4, 0.3, 0.2];

/** Unter so vielen Vortagen ist das Mittel zu wackelig für einen Vorschlag. */
const MIN_VORTAGE = 3;

/** Ein Kalendertag zählt erst als vollständig, wenn er so viele Stunden hat. */
const MIN_STUNDEN_PRO_TAG = 20;

/** Gültigkeitsbereich des Modells nach EN 16798-1. */
const MITTEL_MIN_C = 10;
const MITTEL_MAX_C = 30;

/**
 * Obergrenze des Vorschlags.
 *
 * Die Gerade der EN 16798-1 läuft bis über 28 °C – sie beschreibt aber, was
 * Menschen bei anhaltender Hitze noch *tolerieren*, nicht was als Zielwert
 * taugt. SIA 180 deckelt die Kurve deshalb; oberhalb von rund 26.5 °C gilt ein
 * Raum auch nach einer Hitzewoche nicht mehr als behaglich. Ohne diesen Deckel
 * schlüge die App bei Extremwetter Werte vor, die das Kühlen praktisch
 * abschalten.
 */
const BEHAGLICH_MAX_C = 26.5;

/**
 * Exponentiell gleitendes Mittel der Aussentemperatur der Vortage (θ_rm).
 *
 * Gezählt werden ausschliesslich vollständige Kalendertage **vor** dem
 * Bezugstag – der laufende Tag ist noch nicht abgeschlossen und würde das
 * Mittel je nach Tageszeit verzerren.
 *
 * Liefert `undefined`, wenn zu wenige Vortage vorliegen.
 */
export function gleitendesAussenmittelC(
  wetter: readonly Wetterstunde[],
  bezugstag: Date,
): Celsius | undefined {
  const grenze = datumsSchluessel(bezugstag);
  const proTag = new Map<string, { summe: number; anzahl: number }>();

  for (const stunde of wetter) {
    const tag = datumsSchluessel(stunde.zeit);
    if (tag >= grenze) continue;

    const eintrag = proTag.get(tag) ?? { summe: 0, anzahl: 0 };
    eintrag.summe += stunde.aussentemperaturC;
    eintrag.anzahl += 1;
    proTag.set(tag, eintrag);
  }

  const tagesmittel = [...proTag.entries()]
    .filter(([, wert]) => wert.anzahl >= MIN_STUNDEN_PRO_TAG)
    // Absteigend nach Datum: der jüngste Vortag bekommt das höchste Gewicht.
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([, wert]) => wert.summe / wert.anzahl)
    .slice(0, TAGESGEWICHTE.length);

  if (tagesmittel.length < MIN_VORTAGE) return undefined;

  // Über die tatsächlich vorhandenen Tage normieren, damit auch vier Tage ein
  // brauchbares Mittel ergeben und nicht bloss einen zu tiefen Wert.
  let gewichtet = 0;
  let gewichtsumme = 0;
  tagesmittel.forEach((mittel, index) => {
    const gewicht = TAGESGEWICHTE[index] ?? 0;
    gewichtet += gewicht * mittel;
    gewichtsumme += gewicht;
  });

  return celsius(gewichtet / gewichtsumme);
}

/**
 * Behagliche Innentemperatur zum gleitenden Aussenmittel (Kategorie II,
 * Mitte des Behaglichkeitsbands): θ = 0.33 · θ_rm + 18.8, nach oben gedeckelt.
 *
 * Ausserhalb des Gültigkeitsbereichs von 10 bis 30 °C liefert die Funktion
 * `undefined`, statt die Gerade zu verlängern – im Winter gilt ein anderes
 * Modell.
 */
export function behaglichkeitstemperaturC(aussenmittelC: Celsius): Celsius | undefined {
  if (aussenmittelC < MITTEL_MIN_C || aussenmittelC > MITTEL_MAX_C) return undefined;
  return celsius(Math.min(BEHAGLICH_MAX_C, 0.33 * aussenmittelC + 18.8));
}

/**
 * Vorschlag für die Wunschtemperatur, gerundet auf die Schrittweite des
 * Eingabefelds und auf dessen Grenzen beschnitten.
 *
 * `undefined` heisst: Für einen belastbaren Vorschlag reicht die Datenlage
 * nicht – die Oberfläche zeigt dann gar keinen an.
 */
export function vorgeschlageneZieltemperaturC(
  wetter: readonly Wetterstunde[],
  bezugstag: Date,
): Celsius | undefined {
  const mittelC = gleitendesAussenmittelC(wetter, bezugstag);
  if (mittelC === undefined) return undefined;

  const behaglichC = behaglichkeitstemperaturC(mittelC);
  if (behaglichC === undefined) return undefined;

  const { min, max, schritt } = GRENZWERTE.zielTemperaturC;
  const gerundet = Math.round(behaglichC / schritt) * schritt;
  return celsius(Math.min(max, Math.max(min, gerundet)));
}
