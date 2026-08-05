import { describe, expect, it } from 'vitest';
import { glatterPfad, type Punkt } from './kurve.ts';

/**
 * Die Kurve darf weich sein, aber nichts behaupten, was nicht in den Daten
 * steht. Geprüft wird deshalb nicht das Aussehen, sondern die Zusicherung:
 * Zwischen zwei Stundenwerten bleibt die Kurve in deren Wertebereich.
 */

/** Wertet den erzeugten Pfad an vielen Zwischenstellen aus. */
function kurvenpunkte(punkte: readonly Punkt[], proSegment = 40): [number, number][] {
  const pfad = glatterPfad(punkte);
  const segmente = pfad.split('C').slice(1);
  const abgetastet: [number, number][] = [];
  let start = punkte[0]!;

  for (const [index, segment] of segmente.entries()) {
    const zahlen = segment.trim().split(/[\s,]+/).map(Number);
    const [c1x, c1y, c2x, c2y, ex, ey] = zahlen as [number, number, number, number, number, number];

    for (let schritt = 0; schritt <= proSegment; schritt++) {
      const t = schritt / proSegment;
      abgetastet.push([
        bezier(start[0], c1x, c2x, ex, t),
        bezier(start[1], c1y, c2y, ey, t),
      ]);
    }
    start = [ex, ey];
    void index;
  }

  return abgetastet;
}

/** Kubische Bézier-Auswertung an der Stelle t. */
function bezier(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const g = 1 - t;
  return g * g * g * p0 + 3 * g * g * t * p1 + 3 * g * t * t * p2 + t * t * t * p3;
}

describe('glatterPfad', () => {
  it('beginnt am ersten Stützpunkt', () => {
    expect(glatterPfad([[0, 10], [10, 20]])).toMatch(/^M 0\.0,10\.0/);
  });

  it('trifft jeden Stützpunkt exakt', () => {
    const punkte: Punkt[] = [[0, 30], [10, 25], [20, 28], [30, 20]];
    const pfad = glatterPfad(punkte);

    // Jedes Bézier-Segment endet auf dem nächsten Stützpunkt.
    for (const [px, py] of punkte.slice(1)) {
      expect(pfad).toContain(`${px.toFixed(1)},${py.toFixed(1)}`);
    }
  });

  it('bleibt zwischen zwei Stützpunkten in deren Wertebereich', () => {
    // Ein steiler Abfall gefolgt von einer Gegenbewegung, hier schwingt eine
    // gewöhnliche Spline unter den tiefsten Messwert.
    const punkte: Punkt[] = [[0, 100], [10, 100], [20, 20], [30, 25], [40, 24]];

    for (const [, y] of kurvenpunkte(punkte)) {
      expect(y).toBeGreaterThanOrEqual(20 - 0.01);
      expect(y).toBeLessThanOrEqual(100 + 0.01);
    }
  });

  it('überschwingt an einem lokalen Tiefpunkt nicht', () => {
    // Bewusst unsymmetrisch: Bei gleich steilen Flanken mittelt sich die
    // Steigung von selbst zu null, der Test liefe dann ins Leere. Hier fällt
    // die Kurve steil und steigt flach, ohne Begrenzung zöge das Mittel sie
    // über den Scheitel hinaus unter den Stützwert 20.
    const punkte: Punkt[] = [[0, 60], [10, 20], [20, 25], [30, 40]];
    const tiefster = Math.min(...kurvenpunkte(punkte).map(([, y]) => y));

    expect(tiefster).toBeGreaterThanOrEqual(20 - 0.01);
  });

  it('überschwingt an einem lokalen Hochpunkt nicht', () => {
    const punkte: Punkt[] = [[0, 20], [10, 60], [20, 55], [30, 30]];
    const hoechster = Math.max(...kurvenpunkte(punkte).map(([, y]) => y));

    expect(hoechster).toBeLessThanOrEqual(60 + 0.01);
  });

  it('bleibt monoton, wenn auf ein flaches ein steiles Stück folgt', () => {
    // Der Fall, für den die Deckelung auf das Dreifache der Sekante da ist:
    // Ohne sie zöge die steile Flanke die Steigung im flachen Stück so weit
    // mit, dass die Kurve dort erst ansteigt.
    const punkte: Punkt[] = [[0, 100], [10, 99], [20, 10]];
    const werte = kurvenpunkte(punkte).map(([, y]) => y);

    for (let i = 1; i < werte.length; i++) {
      expect(werte[i]!).toBeLessThanOrEqual(werte[i - 1]! + 0.01);
    }
  });

  it('bleibt auf einer Geraden gerade', () => {
    const punkte: Punkt[] = [[0, 0], [10, 10], [20, 20], [30, 30]];

    for (const [x, y] of kurvenpunkte(punkte)) {
      expect(y).toBeCloseTo(x, 6);
    }
  });

  it('hält ein waagrechtes Stück waagrecht', () => {
    // Zwischen zwei gleichen Werten darf keine Delle entstehen.
    const punkte: Punkt[] = [[0, 10], [10, 25], [20, 25], [30, 10]];
    const mittleres = kurvenpunkte(punkte).filter(([x]) => x > 10 && x < 20);

    for (const [, y] of mittleres) {
      expect(y).toBeCloseTo(25, 6);
    }
  });

  it('folgt einem monotonen Verlauf ohne Richtungswechsel', () => {
    const punkte: Punkt[] = [[0, 30], [10, 25], [20, 24], [30, 18], [40, 17]];
    const werte = kurvenpunkte(punkte).map(([, y]) => y);

    for (let i = 1; i < werte.length; i++) {
      expect(werte[i]!).toBeLessThanOrEqual(werte[i - 1]! + 0.01);
    }
  });

  it('kommt mit einer leeren Reihe und einem einzelnen Punkt zurecht', () => {
    expect(glatterPfad([])).toBe('');
    expect(glatterPfad([[5, 7]])).toBe('M 5.0,7.0');
  });

  it('erzeugt für jede Stunde genau ein Segment', () => {
    const punkte: Punkt[] = Array.from({ length: 24 }, (_, i) => [i * 10, 20 + i] as Punkt);
    const segmente = glatterPfad(punkte).match(/C /g) ?? [];

    expect(segmente).toHaveLength(23);
  });
});
