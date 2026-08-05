/**
 * Sonnenschutz und seine Wirkung auf den solaren Wärmeeintrag.
 *
 * Der Gesamtenergiedurchlassgrad (g-Wert) von Glas plus Behang entscheidet,
 * wie viel der Fassadenstrahlung im Raum als Wärme ankommt:
 *
 *   Zweifachglas ohne Schutz     g ≈ 0.60–0.70
 *   innenliegend (Vorhang, Rollo) g ≈ 0.40–0.50
 *   aussenliegend (Storen, Rollladen) g ≈ 0.10–0.15
 *
 * Zwischen aussenliegendem Schutz und gar keinem liegt damit **Faktor vier**.
 * Das ist der grösste Einzelhebel gegen sommerliche Überhitzung – der Grund,
 * warum sich der Nachweis nach SIA 180 fast nur darum dreht.
 *
 * Warum innenliegender Schutz so wenig bringt: Die Strahlung hat die Scheibe
 * bereits durchquert und wird im Raum zu Wärme. Der Vorhang verhindert die
 * Blendung, nicht den Wärmeeintrag.
 *
 * Die Faktoren sind auf «kein Sonnenschutz» = 1.0 bezogen; der Gebäudetyp gibt
 * den Eintrag ohne Behang an (`solarerEintragMaxWProM2`). So bleiben
 * Bausubstanz und Verschattung getrennt – wie schon Gebäude und Nutzung.
 */

export type SonnenschutzId = 'keiner' | 'innen' | 'aussen';

export interface Sonnenschutz {
  id: SonnenschutzId;
  name: string;
  /** Kurzform für die Zusammenfassungszeile über den Einstellungen. */
  kurzname: string;
  /** Anteil des Eintrags, der trotz Behang hereinkommt. */
  faktor: number;
  beschreibung: string;
}

export const SONNENSCHUTZ_ARTEN: readonly Sonnenschutz[] = [
  {
    id: 'keiner',
    name: 'Kein Sonnenschutz',
    kurzname: 'ohne Sonnenschutz',
    faktor: 1,
    beschreibung: 'Blankes Fenster. Die Sonne heizt ungebremst ein.',
  },
  {
    id: 'innen',
    name: 'Innen (Vorhang, Rollo)',
    kurzname: 'Sonnenschutz innen',
    faktor: 0.7,
    beschreibung:
      'Hilft gegen Blendung, kaum gegen Wärme: Die Strahlung ist bereits durch die Scheibe.',
  },
  {
    id: 'aussen',
    name: 'Aussen (Storen, Rollladen, Markise)',
    kurzname: 'Sonnenschutz aussen',
    faktor: 0.25,
    beschreibung:
      'Die Wärme bleibt draussen – viermal weniger Eintrag als ohne Schutz und der stärkste Hebel überhaupt.',
  },
];

export function findeSonnenschutz(id: string): Sonnenschutz | undefined {
  return SONNENSCHUTZ_ARTEN.find((eintrag) => eintrag.id === id);
}
