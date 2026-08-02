import { describe, expect, it } from 'vitest';
import {
  behaglichkeitstemperaturC,
  gleitendesAussenmittelC,
  vorgeschlageneZieltemperaturC,
} from './komfort.ts';
import { erzeugeWetterstunden, SAMSTAG } from './testhelfer.ts';
import { celsius } from '../einheiten.ts';
import type { Wetterstunde } from '../typen.ts';

/**
 * Baut zusammenhängende Kalendertage mit je einer festen Tagestemperatur.
 * Der erste Eintrag ist der älteste Tag.
 */
function tage(tagesmittelC: readonly number[], startTag: number = SAMSTAG): Wetterstunde[] {
  return tagesmittelC.flatMap((temperatur, index) =>
    erzeugeWetterstunden(Array.from({ length: 24 }, () => temperatur), 0, 0, startTag + index),
  );
}

/** Bezugstag = der Tag direkt nach den erzeugten Vortagen. */
function bezugstag(anzahlVortage: number, startTag: number = SAMSTAG): Date {
  return new Date(2026, 7, startTag + anzahlVortage, 12);
}

describe('gleitendesAussenmittelC', () => {
  it('gewichtet den jüngsten Vortag am stärksten', () => {
    // Sieben Tage, der jüngste deutlich wärmer als die übrigen.
    const kuehlDannWarm = tage([15, 15, 15, 15, 15, 15, 30]);
    const warmDannKuehl = tage([30, 15, 15, 15, 15, 15, 15]);

    const mitWarmemVortag = gleitendesAussenmittelC(kuehlDannWarm, bezugstag(7))!;
    const mitKuehlemVortag = gleitendesAussenmittelC(warmDannKuehl, bezugstag(7))!;

    expect(mitWarmemVortag).toBeGreaterThan(mitKuehlemVortag);
  });

  it('liefert bei gleichbleibender Temperatur genau diese Temperatur', () => {
    expect(gleitendesAussenmittelC(tage([22, 22, 22, 22, 22]), bezugstag(5))).toBeCloseTo(22, 5);
  });

  it('lässt den laufenden Tag aussen vor', () => {
    // Sechs kühle Vortage, der Bezugstag selbst ist heiss – er darf nicht zählen.
    const wetter = [...tage([15, 15, 15, 15, 15, 15]), ...tage([35], SAMSTAG + 6)];

    expect(gleitendesAussenmittelC(wetter, bezugstag(6))).toBeCloseTo(15, 5);
  });

  it('liefert undefined, wenn zu wenige Vortage vorliegen', () => {
    expect(gleitendesAussenmittelC(tage([20, 20]), bezugstag(2))).toBeUndefined();
    expect(gleitendesAussenmittelC([], bezugstag(0))).toBeUndefined();
  });

  it('übergeht angebrochene Tage', () => {
    // Ein Tag mit nur zwölf Stunden zählt nicht als vollständig; danach bleiben
    // zwei Tage übrig – zu wenige für ein Mittel.
    const wetter = [
      ...erzeugeWetterstunden(Array.from({ length: 12 }, () => 25), 0, 0, SAMSTAG),
      ...tage([20, 20], SAMSTAG + 1),
    ];

    expect(gleitendesAussenmittelC(wetter, bezugstag(3))).toBeUndefined();
  });
});

describe('behaglichkeitstemperaturC', () => {
  it('folgt der Geraden aus EN 16798-1', () => {
    // 0.33 · 22 + 18.8 = 26.06
    expect(behaglichkeitstemperaturC(celsius(22))).toBeCloseTo(26.06, 2);
    // 0.33 · 15 + 18.8 = 23.75
    expect(behaglichkeitstemperaturC(celsius(15))).toBeCloseTo(23.75, 2);
  });

  it('steigt mit dem Aussenmittel – darin liegt der ganze Zweck', () => {
    const nachKuehlerWoche = behaglichkeitstemperaturC(celsius(14))!;
    const nachHitzewoche = behaglichkeitstemperaturC(celsius(24))!;

    expect(nachHitzewoche).toBeGreaterThan(nachKuehlerWoche);
  });

  it('deckelt den Wert bei anhaltender Extremhitze', () => {
    // Die Gerade allein ergäbe über 28 °C – das beschreibt, was Menschen
    // tolerieren, nicht was als Zielwert taugt (SIA 180).
    expect(behaglichkeitstemperaturC(celsius(29))).toBe(26.5);
    expect(behaglichkeitstemperaturC(celsius(24))).toBe(26.5);
    // Unterhalb des Deckels gilt weiterhin die Gerade.
    expect(behaglichkeitstemperaturC(celsius(20))).toBeCloseTo(25.4, 2);
  });

  it('verweigert die Auskunft ausserhalb des Gültigkeitsbereichs', () => {
    expect(behaglichkeitstemperaturC(celsius(9.9))).toBeUndefined();
    expect(behaglichkeitstemperaturC(celsius(30.1))).toBeUndefined();
  });
});

describe('vorgeschlageneZieltemperaturC', () => {
  it('rundet auf die Schrittweite des Eingabefelds', () => {
    // 0.33 · 22 + 18.8 = 26.06 → 26.0
    expect(vorgeschlageneZieltemperaturC(tage([22, 22, 22, 22, 22]), bezugstag(5))).toBe(26);
  });

  it('bleibt innerhalb der Grenzen des Eingabefelds', () => {
    const vorschlag = vorgeschlageneZieltemperaturC(tage([29, 29, 29, 29, 29]), bezugstag(5))!;

    expect(vorschlag).toBeGreaterThanOrEqual(18);
    expect(vorschlag).toBeLessThanOrEqual(30);
  });

  it('schlägt nach einer Hitzewoche mehr vor als nach einer kühlen', () => {
    const nachHitze = vorgeschlageneZieltemperaturC(tage([26, 26, 26, 26, 26]), bezugstag(5))!;
    const nachKuehle = vorgeschlageneZieltemperaturC(tage([13, 13, 13, 13, 13]), bezugstag(5))!;

    expect(nachHitze).toBeGreaterThan(nachKuehle);
  });

  it('liefert undefined, wenn die Datenlage nicht reicht', () => {
    expect(vorgeschlageneZieltemperaturC(tage([20]), bezugstag(1))).toBeUndefined();
  });

  it('liefert undefined im Winter, wo ein anderes Modell gilt', () => {
    expect(vorgeschlageneZieltemperaturC(tage([2, 2, 2, 2, 2]), bezugstag(5))).toBeUndefined();
  });
});
