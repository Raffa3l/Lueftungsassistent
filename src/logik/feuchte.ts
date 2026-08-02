import {
  celsius,
  grammProKg,
  kelvin,
  temperaturDifferenz,
  type Celsius,
  type GrammProKg,
} from '../einheiten.ts';

/**
 * Feuchterechnungen für die Lüftungsbewertung.
 *
 * Warum überhaupt? Weil die relative Feuchte für Lüftungsentscheide untauglich
 * ist. Beim Lüften gleicht sich die **absolute** Feuchte an; die relative
 * stellt sich danach über die neue Lufttemperatur ein. Ein Beispiel aus einer
 * Sommernacht:
 *
 *   drinnen  26 °C, 60 % rF → 12.6 g/kg
 *   draussen 16 °C, 95 % rF → 10.8 g/kg
 *
 * Die scheinbar «nasse» Nachtluft trocknet den Raum also, und nach dem
 * Erwärmen auf 26 °C liegt sie bei rund 51 % rF. Solange es draussen kühler
 * ist, ist die Aussenluft in bewohnten Räumen praktisch immer auch die
 * trockenere – Kühlen und Entfeuchten stehen sich nicht im Weg.
 *
 * Der umgekehrte Fall ist der kritische: schwüle Tagluft trifft auf einen
 * nachtausgekühlten Raum. Dann schlägt sich Wasser an kühlen Wänden und Böden
 * nieder – der klassische Fehler der sommerlichen Kellerlüftung.
 *
 * Grundlage ist die Magnus-Formel über Wasser mit den WMO-Koeffizienten. Der
 * Luftdruck wird als konstant angenommen; für die Höhenlage der Schweizer
 * Standorte wäre die Korrektur kleiner als die Unsicherheit der Prognose.
 */

/** Bezugsdruck für die Umrechnung in g/kg. */
const LUFTDRUCK_HPA = 1013.25;

/** Magnus-Koeffizienten über Wasser (WMO). */
const MAGNUS_A = 17.62;
const MAGNUS_B = 243.12;

/** Verhältnis der Molmassen von Wasserdampf und trockener Luft, mal 1000. */
const MOLMASSENVERHAELTNIS = 622;

/**
 * Ab diesem Taupunkt empfinden die meisten Menschen die Luft als schwül
 * (Schwelle des Deutschen Wetterdienstes). Ab 18 °C gilt sie als drückend.
 */
export const SCHWUELE_TAUPUNKT_C = celsius(16);

/**
 * Sicherheitsabstand zur Raumtemperatur bei der Kondensationsprüfung.
 *
 * Boden, Aussenwände und Kellerdecken sind nach einer Nachtauskühlung kühler
 * als die Raumluft – dort fällt Wasser aus, bevor es die Raumluft überhaupt
 * merkt. Das Ein-Knoten-Modell kennt diese Oberflächen nicht, deshalb der
 * pauschale Abschlag.
 */
const KONDENSATION_ABSTAND_K = kelvin(1);

/** Sättigungsdampfdruck über Wasser in hPa. */
export function saettigungsdampfdruckHPa(temperaturC: Celsius): number {
  return 6.112 * Math.exp((MAGNUS_A * temperaturC) / (MAGNUS_B + temperaturC));
}

/**
 * Taupunkt aus Temperatur und relativer Feuchte – die Umkehrung der
 * Magnus-Formel. Nur als Rückfallweg gedacht: Die Wetter-API liefert den
 * Taupunkt direkt und genauer.
 */
export function taupunktAusFeuchte(
  temperaturC: Celsius,
  relativeFeuchteProzent: number,
): Celsius {
  // Bei 0 % wäre der Logarithmus nicht definiert; 1 % ist trockener als jede
  // reale Aussenluft und damit ein unschädlicher unterer Anschlag.
  const feuchte = Math.min(100, Math.max(1, relativeFeuchteProzent));
  const gamma =
    Math.log(feuchte / 100) + (MAGNUS_A * temperaturC) / (MAGNUS_B + temperaturC);
  return celsius((MAGNUS_B * gamma) / (MAGNUS_A - gamma));
}

/**
 * Absolute Feuchte in Gramm Wasser je Kilogramm trockener Luft.
 * Das ist die Grösse, die sich beim Lüften angleicht.
 */
export function absoluteFeuchteGProKg(taupunktC: Celsius): GrammProKg {
  const dampfdruckHPa = saettigungsdampfdruckHPa(taupunktC);
  return grammProKg(
    (MOLMASSENVERHAELTNIS * dampfdruckHPa) / (LUFTDRUCK_HPA - dampfdruckHPa),
  );
}

/**
 * Relative Feuchte, die eine Luft mit diesem Taupunkt bei der angegebenen
 * Temperatur hätte.
 *
 * Damit lässt sich abschätzen, wie feucht die Raumluft ist, ohne sie zu messen:
 * Ohne Feuchtequellen entspricht ihre absolute Feuchte der draussen, und die
 * Raumtemperatur ist bekannt. Die Schätzung ist eine Untergrenze – Personen,
 * Duschen und Kochen kommen hinzu.
 */
export function relativeFeuchteProzent(temperaturC: Celsius, taupunktC: Celsius): number {
  const anteil = saettigungsdampfdruckHPa(taupunktC) / saettigungsdampfdruckHPa(temperaturC);
  return Math.min(100, Math.max(0, anteil * 100));
}

/** Empfindet der Mensch diese Luft als schwül? */
export function istSchwuel(taupunktC: Celsius): boolean {
  return taupunktC >= SCHWUELE_TAUPUNKT_C;
}

/**
 * Droht Tauwasser, wenn diese Aussenluft in den Raum strömt?
 *
 * Wahr, sobald der Aussentaupunkt bis auf den Sicherheitsabstand an die
 * Raumtemperatur heranreicht – dann liegen die kühlsten Oberflächen im Raum
 * bereits darunter.
 */
export function drohtKondensation(taupunktAussenC: Celsius, raumtemperaturC: Celsius): boolean {
  return temperaturDifferenz(taupunktAussenC, raumtemperaturC) > -KONDENSATION_ABSTAND_K;
}
