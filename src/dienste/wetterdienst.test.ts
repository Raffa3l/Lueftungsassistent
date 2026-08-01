import { describe, expect, it } from 'vitest';
import { jetztInStationszeit, wandleAntwortUm, WetterdatenFehler } from './wetterdienst.ts';

describe('wandleAntwortUm', () => {
  const antwort = {
    hourly: {
      time: ['2026-08-01T00:00', '2026-08-01T01:00', '2026-08-01T02:00'],
      temperature_2m: [18.2, 17.6, 17.1],
      relative_humidity_2m: [78, 81, 83],
      shortwave_radiation: [0, 0, 0],
    },
  };

  it('wandelt die spaltenweise Antwort in Stunden-Objekte um', () => {
    const stunden = wandleAntwortUm(antwort);

    expect(stunden).toHaveLength(3);
    expect(stunden[0]?.aussentemperaturC).toBe(18.2);
    expect(stunden[0]?.relativeFeuchteProzent).toBe(78);
  });

  it('interpretiert die Zeitstempel als Wanduhrzeit der Station', () => {
    const stunden = wandleAntwortUm(antwort);
    // Unabhängig von der Zeitzone des Geräts muss 01:00 auch 01:00 bleiben.
    expect(stunden[1]?.zeit.getHours()).toBe(1);
    expect(stunden[1]?.zeit.getDate()).toBe(1);
  });

  it('überspringt Stunden ohne Temperaturwert', () => {
    const stunden = wandleAntwortUm({
      hourly: {
        time: ['2026-08-01T00:00', '2026-08-01T01:00'],
        temperature_2m: [18.2, null],
      },
    });

    expect(stunden).toHaveLength(1);
    expect(stunden[0]?.aussentemperaturC).toBe(18.2);
  });

  it('ergänzt fehlende Strahlungs- und Feuchtewerte mit 0', () => {
    const stunden = wandleAntwortUm({
      hourly: { time: ['2026-08-01T12:00'], temperature_2m: [28] },
    });

    expect(stunden[0]?.globalstrahlungWProM2).toBe(0);
    expect(stunden[0]?.relativeFeuchteProzent).toBe(0);
  });

  it('meldet einen Fehler, wenn keine Stundenwerte geliefert werden', () => {
    expect(() => wandleAntwortUm({})).toThrow(WetterdatenFehler);
    expect(() => wandleAntwortUm({ hourly: { time: [], temperature_2m: [] } })).toThrow(
      WetterdatenFehler,
    );
  });

  it('meldet einen Fehler, wenn alle Temperaturwerte fehlen', () => {
    expect(() =>
      wandleAntwortUm({ hourly: { time: ['2026-08-01T00:00'], temperature_2m: [null] } }),
    ).toThrow(/unvollständig/);
  });
});

describe('jetztInStationszeit', () => {
  it('liefert die Schweizer Wanduhrzeit unabhängig von der Gerätezeitzone', () => {
    // 1. August 2026, 12:00 UTC → 14:00 Schweizer Sommerzeit
    const jetzt = jetztInStationszeit(new Date('2026-08-01T12:00:00Z'));

    expect(jetzt.getHours()).toBe(14);
    expect(jetzt.getDate()).toBe(1);
  });

  it('berücksichtigt die Winterzeit', () => {
    // 1. Januar 2026, 12:00 UTC → 13:00 MEZ
    const jetzt = jetztInStationszeit(new Date('2026-01-01T12:00:00Z'));

    expect(jetzt.getHours()).toBe(13);
  });

  it('behandelt den Tageswechsel korrekt', () => {
    // 31. Juli 2026, 23:30 UTC → 1. August, 01:30 Schweizer Zeit
    const jetzt = jetztInStationszeit(new Date('2026-07-31T23:30:00Z'));

    expect(jetzt.getDate()).toBe(1);
    expect(jetzt.getMonth()).toBe(7);
    expect(jetzt.getHours()).toBe(1);
  });
});
