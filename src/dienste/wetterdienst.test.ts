import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  jetztInStationszeit,
  ladeWetterdaten,
  wandleAntwortUm,
  WetterdatenFehler,
} from './wetterdienst.ts';
import { VORLAUF_TAGE } from '../konfiguration/standardwerte.ts';
import type { Wetterstation } from '../typen.ts';

/**
 * Der Abruf selbst wird gegen einen Attrappen-`fetch` geprüft: Welche Parameter
 * die App anfordert, entscheidet über die Zahlen, mit denen sie rechnet – und
 * war bis dahin nirgends festgehalten.
 */
describe('ladeWetterdaten', () => {
  const station: Wetterstation = {
    id: 'zuerich',
    name: 'Zürich',
    kanton: 'ZH',
    breitengrad: 47.3769,
    laengengrad: 8.5417,
    hoeheMeter: 408,
  };

  const antwort = {
    hourly: { time: ['2026-08-01T00:00'], temperature_2m: [18.2] },
  };

  afterEach(() => vi.unstubAllGlobals());

  /** Fängt die angeforderte URL ab und liefert eine gültige Antwort zurück. */
  async function abgerufeneUrl(): Promise<URL> {
    let angefordert: string | undefined;
    vi.stubGlobal('fetch', (ziel: URL | string) => {
      angefordert = String(ziel);
      return Promise.resolve(new Response(JSON.stringify(antwort), { status: 200 }));
    });

    await ladeWetterdaten(station);
    return new URL(angefordert!);
  }

  it('fordert das Modell von MeteoSchweiz an', async () => {
    // Ohne diesen Parameter liefert Open-Meteo «best match» – für die Schweiz
    // ist das ICON-D2 des DWD statt des feiner aufgelösten Schweizer Modells.
    expect((await abgerufeneUrl()).searchParams.get('models')).toBe('meteoswiss_icon_seamless');
  });

  it('fordert genug Vorlauf für das adaptive Komfortmodell an', async () => {
    const url = await abgerufeneUrl();
    expect(Number(url.searchParams.get('past_days'))).toBeGreaterThanOrEqual(VORLAUF_TAGE);
  });

  it('fordert Ort, Höhe und Zeitzone der Station an', async () => {
    const url = await abgerufeneUrl();

    expect(url.searchParams.get('latitude')).toBe('47.3769');
    expect(url.searchParams.get('longitude')).toBe('8.5417');
    // Die Höhe verbessert die Temperaturkorrektur – ohne sie rechnet Davos falsch.
    expect(url.searchParams.get('elevation')).toBe('408');
    expect(url.searchParams.get('timezone')).toBe('Europe/Zurich');
  });

  it('fordert alle Grössen an, die das Modell auswertet', async () => {
    const angefordert = (await abgerufeneUrl()).searchParams.get('hourly')?.split(',');

    expect(angefordert).toEqual(
      expect.arrayContaining([
        'temperature_2m',
        'relative_humidity_2m',
        'dew_point_2m',
        'shortwave_radiation',
        'direct_normal_irradiance',
        'diffuse_radiation',
        'wind_speed_10m',
      ]),
    );
  });

  it('fordert den Wind in Meter pro Sekunde an', async () => {
    // Voreinstellung wäre km/h – die Zahlen kämen dann 3.6-fach zu gross an.
    expect((await abgerufeneUrl()).searchParams.get('wind_speed_unit')).toBe('ms');
  });
});

describe('wandleAntwortUm', () => {
  const antwort = {
    hourly: {
      time: ['2026-08-01T00:00', '2026-08-01T01:00', '2026-08-01T02:00'],
      temperature_2m: [18.2, 17.6, 17.1],
      relative_humidity_2m: [78, 81, 83],
      dew_point_2m: [14.4, 14.3, 14.2],
      shortwave_radiation: [0, 0, 0],
      wind_speed_10m: [1.8, 2.4, 3.1],
    },
  };

  it('wandelt die spaltenweise Antwort in Stunden-Objekte um', () => {
    const stunden = wandleAntwortUm(antwort);

    expect(stunden).toHaveLength(3);
    expect(stunden[0]?.aussentemperaturC).toBe(18.2);
    expect(stunden[0]?.relativeFeuchteProzent).toBe(78);
    expect(stunden[0]?.taupunktC).toBe(14.4);
    expect(stunden[0]?.windgeschwindigkeitMProS).toBe(1.8);
  });

  it('rechnet den Taupunkt nach, wenn die API ihn nicht liefert', () => {
    const stunden = wandleAntwortUm({
      hourly: {
        time: ['2026-08-01T00:00'],
        temperature_2m: [25],
        relative_humidity_2m: [80],
      },
    });

    // 25 °C bei 80 % rF ergeben rund 21.3 °C Taupunkt.
    expect(stunden[0]?.taupunktC).toBeCloseTo(21.3, 0);
  });

  it('nimmt ohne Windangabe Windstille an', () => {
    const stunden = wandleAntwortUm({
      hourly: { time: ['2026-08-01T00:00'], temperature_2m: [25] },
    });

    // Konservativ: Das Modell kühlt dann langsamer aus als in Wirklichkeit.
    expect(stunden[0]?.windgeschwindigkeitMProS).toBe(0);
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
