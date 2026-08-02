/**
 * Himmelsrichtungen der Hauptfensterfläche.
 *
 * Der Azimut ist geografisch gezählt: 0 = Nord, 90 = Ost, 180 = Süd,
 * 270 = West – dieselbe Konvention wie beim Sonnenazimut in
 * `logik/sonnenstand.ts`.
 *
 * Hat ein Raum Fenster nach mehreren Seiten, zählt die grösste Fläche. Eine
 * Aufteilung auf mehrere Ausrichtungen wäre rechnerisch möglich, verlangt dem
 * Nutzer aber eine Schätzung ab, die er selten belastbar geben kann.
 */

export interface Ausrichtung {
  id: string;
  name: string;
  azimutGrad: number;
  /** Kurze Einordnung für die Oberfläche. */
  hinweis: string;
}

export const AUSRICHTUNGEN: readonly Ausrichtung[] = [
  {
    id: 'nord',
    name: 'Nord',
    azimutGrad: 0,
    hinweis: 'Nur Streulicht – die kühlste Lage im Sommer.',
  },
  {
    id: 'nordost',
    name: 'Nordost',
    azimutGrad: 45,
    hinweis: 'Wenig Sonne, und wenn, dann früh am Morgen.',
  },
  {
    id: 'ost',
    name: 'Ost',
    azimutGrad: 90,
    hinweis: 'Kräftige Morgensonne, die der Raum über den Tag mitträgt.',
  },
  {
    id: 'suedost',
    name: 'Südost',
    azimutGrad: 135,
    hinweis: 'Sonne von früh bis mittags, danach im Schatten.',
  },
  {
    id: 'sued',
    name: 'Süd',
    azimutGrad: 180,
    hinweis: 'Mittagssonne, die im Sommer hoch steht und die Fassade nur streift.',
  },
  {
    id: 'suedwest',
    name: 'Südwest',
    azimutGrad: 225,
    hinweis: 'Lange Besonnung bis in den Abend – zunehmend kritisch.',
  },
  {
    id: 'west',
    name: 'West',
    azimutGrad: 270,
    hinweis: 'Die kritischste Lage: volle Sonne, wenn es draussen am wärmsten ist.',
  },
  {
    id: 'nordwest',
    name: 'Nordwest',
    azimutGrad: 315,
    hinweis: 'Abendsonne, aber flacher und kürzer als im Westen.',
  },
];

export function findeAusrichtung(id: string): Ausrichtung | undefined {
  return AUSRICHTUNGEN.find((eintrag) => eintrag.id === id);
}
