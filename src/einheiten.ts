/**
 * Physikalische Einheiten als Typen («Branded Types»).
 *
 * Das Problem: Im thermischen Modell treffen Zahlen mit sehr unterschiedlicher
 * Bedeutung aufeinander – Temperaturen, Temperaturdifferenzen, Flächenlasten,
 * Änderungsraten. Alle sind `number`, und der Compiler sieht keinen Unterschied.
 * Beim Umbau auf Raumtypen war genau das die riskanteste Stelle.
 *
 * Die Lösung: Jede Grösse bekommt eine Marke, die nur im Typsystem existiert.
 * Zur Laufzeit bleibt es eine gewöhnliche Zahl – die Konstruktoren unten geben
 * ihr Argument unverändert zurück.
 *
 * Wichtig zu wissen, was das leistet und was nicht:
 *
 *   ✓ `const t: Celsius = last` schlägt fehl
 *   ✓ `waermeeintragKProH(...)` kann keine Flächenlast zurückgeben
 *   ✓ eine Funktion, die `WattProM2` erwartet, nimmt keine `Stunden` entgegen
 *   ✗ `celsiusWert + wattWert` bleibt erlaubt – TypeScript rechnet mit
 *     Zahlen-Untertypen weiter und liefert ein blankes `number`
 *
 * Der Schutz greift also an den Grenzen: Sobald das Ergebnis irgendwo landet,
 * das eine Einheit verlangt – Rückgabewert, Feld, Parameter –, fällt der Fehler
 * auf. Für die Rechnungen dazwischen gibt es die Helfer am Ende dieser Datei;
 * wer sie verwendet, kann die Einheiten gar nicht erst verwechseln.
 */

declare const einheit: unique symbol;

/** Trägt die Einheit im Typ, ohne zur Laufzeit zu existieren. */
interface Markiert<Name extends string> {
  readonly [einheit]: Name;
}

/** Temperatur in Grad Celsius. */
export type Celsius = number & Markiert<'°C'>;

/** Temperaturdifferenz in Kelvin – bewusst getrennt von der Temperatur selbst. */
export type Kelvin = number & Markiert<'K'>;

/** Temperaturänderung pro Stunde. */
export type KelvinProStunde = number & Markiert<'K/h'>;

/** Flächenbezogene Leistung: Wärmelast oder Einstrahlung. */
export type WattProM2 = number & Markiert<'W/m²'>;

/** Flächenbezogene Wärmespeicherfähigkeit. */
export type WhProM2K = number & Markiert<'Wh/(m²K)'>;

/** Zeitdauer in Stunden (nicht zu verwechseln mit einer Uhrzeit). */
export type Stunden = number & Markiert<'h'>;

/**
 * Absolute Luftfeuchte: Gramm Wasser je Kilogramm trockener Luft.
 * Sie bleibt beim Erwärmen und Abkühlen erhalten – anders als die relative
 * Feuchte, die deshalb für Lüftungsentscheide untauglich ist.
 */
export type GrammProKg = number & Markiert<'g/kg'>;

/** Windgeschwindigkeit. */
export type MeterProSekunde = number & Markiert<'m/s'>;

/* ------------------------------------------------------------------ *
 * Konstruktoren – zur Laufzeit ohne Wirkung, im Typsystem der Übergang
 * von einer blanken Zahl zu einer Grösse mit Einheit.
 * ------------------------------------------------------------------ */

export const celsius = (wert: number): Celsius => wert as Celsius;
export const kelvin = (wert: number): Kelvin => wert as Kelvin;
export const kelvinProStunde = (wert: number): KelvinProStunde => wert as KelvinProStunde;
export const wattProM2 = (wert: number): WattProM2 => wert as WattProM2;
export const whProM2K = (wert: number): WhProM2K => wert as WhProM2K;
export const stunden = (wert: number): Stunden => wert as Stunden;
export const grammProKg = (wert: number): GrammProKg => wert as GrammProKg;
export const meterProSekunde = (wert: number): MeterProSekunde => wert as MeterProSekunde;

/* ------------------------------------------------------------------ *
 * Rechnen mit Einheiten
 *
 * Jede Funktion bildet eine physikalisch gültige Verknüpfung ab. Was hier
 * keine Entsprechung hat, ist als Rechnung auch nicht sinnvoll.
 * ------------------------------------------------------------------ */

/** Temperatur plus Änderung ergibt wieder eine Temperatur. */
export function temperaturPlus(basis: Celsius, aenderung: Kelvin): Celsius {
  return celsius(basis + aenderung);
}

/** Zwei Temperaturen ergeben eine Differenz – positiv, wenn `a` wärmer ist. */
export function temperaturDifferenz(a: Celsius, b: Celsius): Kelvin {
  return kelvin(a - b);
}

/** Differenz mal dimensionslosem Faktor (z. B. Abklingfaktor). */
export function skaliereKelvin(differenz: Kelvin, faktor: number): Kelvin {
  return kelvin(differenz * faktor);
}

/** Änderungsrate über eine Dauer ergibt eine Temperaturdifferenz. */
export function anstiegUeber(rate: KelvinProStunde, dauer: Stunden): Kelvin {
  return kelvin(rate * dauer);
}

/**
 * Die zentrale Umrechnung des Modells: Eine Flächenlast wird erst durch die
 * Speicherkapazität des Gebäudes zu einer Temperaturänderung.
 */
export function rateAusLast(last: WattProM2, kapazitaet: WhProM2K): KelvinProStunde {
  return kelvinProStunde(last / kapazitaet);
}

/** Zwei Lasten addieren. */
export function summeLast(a: WattProM2, b: WattProM2): WattProM2 {
  return wattProM2(a + b);
}

/** Last mal dimensionslosem Faktor. */
export function skaliereLast(last: WattProM2, faktor: number): WattProM2 {
  return wattProM2(last * faktor);
}

/** Verhältnis zweier gleichartiger Lasten – dimensionslos, daher blankes `number`. */
export function anteil(wert: WattProM2, referenz: WattProM2): number {
  return wert / referenz;
}
