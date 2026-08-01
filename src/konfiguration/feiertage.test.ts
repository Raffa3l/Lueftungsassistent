import { describe, expect, it } from 'vitest';
import { datumsSchluessel, feiertageImJahr, findeFeiertag, ostersonntag } from './feiertage.ts';

describe('ostersonntag', () => {
  it('trifft bekannte Ostertermine', () => {
    // Nachschlagbare Referenzwerte
    expect(datumsSchluessel(ostersonntag(2024))).toBe('2024-03-31');
    expect(datumsSchluessel(ostersonntag(2025))).toBe('2025-04-20');
    expect(datumsSchluessel(ostersonntag(2026))).toBe('2026-04-05');
    expect(datumsSchluessel(ostersonntag(2027))).toBe('2027-03-28');
    expect(datumsSchluessel(ostersonntag(2028))).toBe('2028-04-16');
  });

  it('liefert über einen weiten Zeitraum immer einen Sonntag im März oder April', () => {
    for (let jahr = 2000; jahr <= 2100; jahr++) {
      const ostern = ostersonntag(jahr);

      expect(ostern.getDay()).toBe(0); // Sonntag
      expect([2, 3]).toContain(ostern.getMonth()); // März oder April
    }
  });
});

describe('feiertageImJahr', () => {
  it('liefert die acht berücksichtigten Feiertage', () => {
    const feiertage = feiertageImJahr(2026);

    expect(feiertage).toHaveLength(8);
    expect(feiertage.map((f) => f.name)).toContain('Bundesfeier');
  });

  it('leitet die beweglichen Feiertage korrekt von Ostern ab', () => {
    const feiertage = feiertageImJahr(2026); // Ostern: 5. April 2026
    const datum = (name: string) => datumsSchluessel(feiertage.find((f) => f.name === name)!.datum);

    expect(datum('Karfreitag')).toBe('2026-04-03');
    expect(datum('Ostermontag')).toBe('2026-04-06');
    expect(datum('Auffahrt')).toBe('2026-05-14');
    expect(datum('Pfingstmontag')).toBe('2026-05-25');
  });

  it('legt Auffahrt immer auf einen Donnerstag und Pfingstmontag auf einen Montag', () => {
    for (let jahr = 2024; jahr <= 2040; jahr++) {
      const feiertage = feiertageImJahr(jahr);
      const tag = (name: string) => feiertage.find((f) => f.name === name)!.datum.getDay();

      expect(tag('Auffahrt')).toBe(4);
      expect(tag('Pfingstmontag')).toBe(1);
      expect(tag('Karfreitag')).toBe(5);
    }
  });

  it('hält die festen Feiertage auf ihren Kalendertagen', () => {
    const feiertage = feiertageImJahr(2027);
    const datum = (name: string) => datumsSchluessel(feiertage.find((f) => f.name === name)!.datum);

    expect(datum('Neujahr')).toBe('2027-01-01');
    expect(datum('Bundesfeier')).toBe('2027-08-01');
    expect(datum('Weihnachten')).toBe('2027-12-25');
    expect(datum('Stephanstag')).toBe('2027-12-26');
  });
});

describe('findeFeiertag', () => {
  it('erkennt den 1. August', () => {
    expect(findeFeiertag(new Date(2026, 7, 1, 14))).toBe('Bundesfeier');
  });

  it('erkennt einen beweglichen Feiertag', () => {
    expect(findeFeiertag(new Date(2026, 4, 14, 9))).toBe('Auffahrt');
  });

  it('liefert für einen gewöhnlichen Tag undefined', () => {
    expect(findeFeiertag(new Date(2026, 7, 3, 10))).toBeUndefined();
  });

  it('liefert bei wiederholtem Aufruf dasselbe Ergebnis (Zwischenspeicher)', () => {
    const erst = findeFeiertag(new Date(2030, 0, 1));
    const zweit = findeFeiertag(new Date(2030, 0, 1));

    expect(erst).toBe('Neujahr');
    expect(zweit).toBe('Neujahr');
  });
});

describe('datumsSchluessel', () => {
  it('füllt Monat und Tag auf zwei Stellen auf', () => {
    expect(datumsSchluessel(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('ist unabhängig von der Uhrzeit', () => {
    expect(datumsSchluessel(new Date(2026, 7, 1, 23, 59))).toBe('2026-08-01');
    expect(datumsSchluessel(new Date(2026, 7, 1, 0, 0))).toBe('2026-08-01');
  });
});
