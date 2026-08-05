import { describe, expect, it } from 'vitest';
import {
  deklinationGrad,
  fassadenstrahlungWProM2,
  istSommerzeit,
  sonnenstand,
  zeitgleichungMinuten,
} from './sonnenstand.ts';
import { wattProM2 } from '../einheiten.ts';

/** Zürich: Referenzstandort für alle Sonnenstandstests. */
const ZUERICH = { breite: 47.37, laenge: 8.54 };

describe('istSommerzeit', () => {
  it('erkennt die Sommerzeit im Hochsommer', () => {
    expect(istSommerzeit(new Date(2026, 6, 15))).toBe(true);
  });

  it('erkennt die Winterzeit im Januar und Dezember', () => {
    expect(istSommerzeit(new Date(2026, 0, 15))).toBe(false);
    expect(istSommerzeit(new Date(2026, 11, 15))).toBe(false);
  });

  it('schaltet am letzten Sonntag im März um', () => {
    // 2026: letzter Sonntag im März ist der 29.
    expect(istSommerzeit(new Date(2026, 2, 28))).toBe(false);
    expect(istSommerzeit(new Date(2026, 2, 29))).toBe(true);
  });

  it('schaltet am letzten Sonntag im Oktober zurück', () => {
    // 2026: letzter Sonntag im Oktober ist der 25.
    expect(istSommerzeit(new Date(2026, 9, 24))).toBe(true);
    expect(istSommerzeit(new Date(2026, 9, 25))).toBe(false);
  });
});

describe('deklinationGrad', () => {
  it('trifft die Sonnenwenden', () => {
    // Rund +23.4° zur Sommersonnenwende, −23.4° zur Wintersonnenwende.
    expect(deklinationGrad(new Date(2026, 5, 21))).toBeCloseTo(23.4, 0);
    expect(deklinationGrad(new Date(2026, 11, 21))).toBeCloseTo(-23.4, 0);
  });

  it('liegt zu den Tagundnachtgleichen nahe null', () => {
    expect(Math.abs(deklinationGrad(new Date(2026, 2, 20)))).toBeLessThan(1.5);
    expect(Math.abs(deklinationGrad(new Date(2026, 8, 22)))).toBeLessThan(1.5);
  });
});

describe('zeitgleichungMinuten', () => {
  it('bleibt im bekannten Bereich von rund ±16 Minuten', () => {
    for (let monat = 0; monat < 12; monat++) {
      const wert = zeitgleichungMinuten(new Date(2026, monat, 15));
      expect(Math.abs(wert)).toBeLessThan(17);
    }
  });

  it('ist Anfang November am stärksten positiv', () => {
    // Die Sonnenuhr geht dann rund 16 Minuten vor.
    expect(zeitgleichungMinuten(new Date(2026, 10, 3))).toBeGreaterThan(14);
  });
});

describe('sonnenstand', () => {
  it('erreicht den Höchststand am 2. August kurz nach 13:30 Wanduhrzeit', () => {
    // Zürich liegt westlich des Zonenmeridians, deshalb liegt der wahre Mittag
    // deutlich nach 12:00 Sommerzeit.
    const stunden = [12, 13, 14, 15].map((h) => ({
      h,
      elevation: sonnenstand(new Date(2026, 7, 2, h), ZUERICH.breite, ZUERICH.laenge)
        .elevationGrad,
    }));
    const hoechster = stunden.reduce((a, b) => (b.elevation > a.elevation ? b : a));

    expect([13, 14]).toContain(hoechster.h);
  });

  it('erreicht zur Sommersonnenwende in Zürich rund 66 Grad Höhe', () => {
    // 90° − 47.37° + 23.44° = 66.1°
    const mittags = sonnenstand(new Date(2026, 5, 21, 13, 30), ZUERICH.breite, ZUERICH.laenge);
    expect(mittags.elevationGrad).toBeCloseTo(66, 0);
  });

  it('steht mittags im Süden, morgens im Osten, abends im Westen', () => {
    const tag = (h: number) =>
      sonnenstand(new Date(2026, 7, 2, h), ZUERICH.breite, ZUERICH.laenge).azimutGrad;

    expect(tag(13)).toBeGreaterThan(150);
    expect(tag(13)).toBeLessThan(210);
    expect(tag(7)).toBeGreaterThan(60);
    expect(tag(7)).toBeLessThan(120);
    expect(tag(19)).toBeGreaterThan(250);
    expect(tag(19)).toBeLessThan(300);
  });

  it('steht nachts unter dem Horizont', () => {
    expect(
      sonnenstand(new Date(2026, 7, 2, 1), ZUERICH.breite, ZUERICH.laenge).elevationGrad,
    ).toBeLessThan(0);
  });

  it('steht im Winter deutlich tiefer als im Sommer', () => {
    const sommer = sonnenstand(new Date(2026, 5, 21, 13), ZUERICH.breite, ZUERICH.laenge);
    const winter = sonnenstand(new Date(2026, 11, 21, 12), ZUERICH.breite, ZUERICH.laenge);

    expect(winter.elevationGrad).toBeLessThan(sommer.elevationGrad - 40);
  });
});

describe('fassadenstrahlungWProM2', () => {
  const klar = {
    direktNormalWProM2: wattProM2(800),
    diffusWProM2: wattProM2(100),
    globalWProM2: wattProM2(700),
  };

  it('gibt einer Fassade nur Streulicht, wenn die Sonne dahinter steht', () => {
    // Sonne im Süden, Fassade nach Norden.
    const nord = fassadenstrahlungWProM2({ elevationGrad: 60, azimutGrad: 180 }, klar, 0);
    // Nur Diffus- und Reflexanteil: 100·0.5 + 700·0.2·0.5 = 120
    expect(nord).toBeCloseTo(120, 0);
  });

  it('trifft eine Westfassade am Nachmittag fast senkrecht', () => {
    // Sonne tief im Westen: kleiner Höhenwinkel, Azimut deckungsgleich.
    const west = fassadenstrahlungWProM2({ elevationGrad: 20, azimutGrad: 270 }, klar, 270);
    // 800·cos(20°) = 752, dazu 120 diffus und reflektiert.
    expect(west).toBeCloseTo(752 + 120, -1);
  });

  it('erwischt eine Südfassade mittags nur streifend', () => {
    // Hoch stehende Sommersonne: cos(66°) ≈ 0.41
    const sued = fassadenstrahlungWProM2({ elevationGrad: 66, azimutGrad: 180 }, klar, 180);
    const west = fassadenstrahlungWProM2({ elevationGrad: 20, azimutGrad: 270 }, klar, 270);

    expect(sued).toBeLessThan(west);
    expect(sued).toBeCloseTo(800 * Math.cos((66 * Math.PI) / 180) + 120, -1);
  });

  it('liefert nachts nur den Streulichtanteil', () => {
    const nachts = fassadenstrahlungWProM2(
      { elevationGrad: -5, azimutGrad: 300 },
      { direktNormalWProM2: wattProM2(0), diffusWProM2: wattProM2(20), globalWProM2: wattProM2(10) },
      270,
    );
    expect(nachts).toBeCloseTo(20 * 0.5 + 10 * 0.2 * 0.5, 5);
  });

  it('ordnet die Himmelsrichtungen über den Tag richtig ein', () => {
    // Morgens gewinnt Ost, abends West, bei gleicher Sonnenhöhe.
    const morgens = { elevationGrad: 25, azimutGrad: 90 };
    const abends = { elevationGrad: 25, azimutGrad: 270 };

    expect(fassadenstrahlungWProM2(morgens, klar, 90)).toBeGreaterThan(
      fassadenstrahlungWProM2(morgens, klar, 270),
    );
    expect(fassadenstrahlungWProM2(abends, klar, 270)).toBeGreaterThan(
      fassadenstrahlungWProM2(abends, klar, 90),
    );
  });
});
