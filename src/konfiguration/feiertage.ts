/**
 * Nationale Feiertage der Schweiz.
 *
 * Bewusst berechnet statt als Datenliste gepflegt: Die beweglichen Feiertage
 * hängen alle am Ostersonntag, und eine Liste veraltet jedes Jahr.
 *
 * Enthalten sind die acht Tage, die praktisch überall in der Schweiz frei sind.
 * **Nicht enthalten sind kantonale Feiertage** (Berchtoldstag, Fronleichnam,
 * Mariä Himmelfahrt, Allerheiligen, Sechseläuten, Jeûne genevois und weitere),
 * sie gelten je nach Kanton und Konfession unterschiedlich. Wer sie braucht,
 * trägt sie als eintägigen Ferienzeitraum in den Einstellungen ein.
 */

/** Datumsschlüssel «JJJJ-MM-TT» in lokaler Zeit. */
export function datumsSchluessel(zeit: Date): string {
  const monat = String(zeit.getMonth() + 1).padStart(2, '0');
  const tag = String(zeit.getDate()).padStart(2, '0');
  return `${zeit.getFullYear()}-${monat}-${tag}`;
}

/**
 * Ostersonntag eines Jahres nach dem gregorianischen Osteralgorithmus
 * (anonyme gregorianische Berechnung, auch als Meeus/Jones/Butcher bekannt).
 */
export function ostersonntag(jahr: number): Date {
  const a = jahr % 19;
  const b = Math.floor(jahr / 100);
  const c = jahr % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31); // 3 = März, 4 = April
  const tag = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(jahr, monat - 1, tag);
}

/** Ein Feiertag mit Name und Datum. */
export interface Feiertag {
  name: string;
  datum: Date;
}

/** Alle berücksichtigten nationalen Feiertage eines Jahres. */
export function feiertageImJahr(jahr: number): Feiertag[] {
  const ostern = ostersonntag(jahr);
  const relativZuOstern = (tage: number): Date =>
    new Date(ostern.getFullYear(), ostern.getMonth(), ostern.getDate() + tage);

  return [
    { name: 'Neujahr', datum: new Date(jahr, 0, 1) },
    { name: 'Karfreitag', datum: relativZuOstern(-2) },
    { name: 'Ostermontag', datum: relativZuOstern(1) },
    { name: 'Auffahrt', datum: relativZuOstern(39) },
    { name: 'Pfingstmontag', datum: relativZuOstern(50) },
    { name: 'Bundesfeier', datum: new Date(jahr, 7, 1) },
    { name: 'Weihnachten', datum: new Date(jahr, 11, 25) },
    { name: 'Stephanstag', datum: new Date(jahr, 11, 26) },
  ];
}

/**
 * Feiertag zu einem Datum, sonst `undefined`.
 *
 * Die Feiertage eines Jahres werden zwischengespeichert, die Simulation fragt
 * für jede der rund 150 Stunden nach.
 */
const zwischenspeicher = new Map<number, Map<string, string>>();

export function findeFeiertag(zeit: Date): string | undefined {
  const jahr = zeit.getFullYear();
  let tabelle = zwischenspeicher.get(jahr);

  if (!tabelle) {
    tabelle = new Map(
      feiertageImJahr(jahr).map((feiertag) => [datumsSchluessel(feiertag.datum), feiertag.name]),
    );
    zwischenspeicher.set(jahr, tabelle);
  }

  return tabelle.get(datumsSchluessel(zeit));
}
