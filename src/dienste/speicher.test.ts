import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ladeEinstellungen, setzeEinstellungenZurueck, speichereEinstellungen } from './speicher.ts';
import { MAX_FERIENZEITRAEUME, STANDARD_EINSTELLUNGEN } from '../konfiguration/standardwerte.ts';
import { celsius, kelvin } from "../einheiten.ts";

const SCHLUESSEL = 'lueftungsassistent.einstellungen.v1';

/** Minimaler LocalStorage-Ersatz für die Node-Testumgebung. */
function erzeugeSpeicherAttrappe() {
  const inhalt = new Map<string, string>();
  return {
    getItem: (schluessel: string) => inhalt.get(schluessel) ?? null,
    setItem: (schluessel: string, wert: string) => void inhalt.set(schluessel, wert),
    removeItem: (schluessel: string) => void inhalt.delete(schluessel),
    clear: () => inhalt.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', erzeugeSpeicherAttrappe());
});

describe('ladeEinstellungen', () => {
  it('liefert die Standardwerte, wenn nichts gespeichert ist', () => {
    expect(ladeEinstellungen()).toEqual(STANDARD_EINSTELLUNGEN);
  });

  it('liest zuvor gespeicherte Einstellungen vollständig zurück', () => {
    const eigene = {
      stationId: 'davos',
      gebaeudetypId: 'dachwohnung',
      raumtypId: 'schulzimmer',
      zielTemperaturC: celsius(22.5),
      hystereseK: kelvin(1.5),
      minRaumtemperaturC: celsius(19),
      ausrichtungId: 'west',
      sonnenschutzId: 'keiner',
      nachtauskuehlung: false,
      feiertageBeachten: false,
      ferien: [{ id: 'f1', name: 'Sommerferien', von: '2026-07-06', bis: '2026-08-16' }],
    };
    speichereEinstellungen(eigene);

    expect(ladeEinstellungen()).toEqual(eigene);
  });

  it('ersetzt eine unbekannte Station durch den Standard', () => {
    localStorage.setItem(SCHLUESSEL, JSON.stringify({ stationId: 'wien' }));
    expect(ladeEinstellungen().stationId).toBe(STANDARD_EINSTELLUNGEN.stationId);
  });

  it('ersetzt einen unbekannten Gebäudetyp durch den Standard', () => {
    localStorage.setItem(SCHLUESSEL, JSON.stringify({ gebaeudetypId: 'iglu' }));
    expect(ladeEinstellungen().gebaeudetypId).toBe(STANDARD_EINSTELLUNGEN.gebaeudetypId);
  });

  it('ersetzt einen unbekannten Raumtyp durch den Standard', () => {
    localStorage.setItem(SCHLUESSEL, JSON.stringify({ raumtypId: 'turnhalle' }));
    expect(ladeEinstellungen().raumtypId).toBe(STANDARD_EINSTELLUNGEN.raumtypId);
  });

  it('ergänzt den Raumtyp bei Einstellungen aus einer früheren Version', () => {
    // Vor den Raumtypen gespeicherter Stand – darf die App nicht aus dem Tritt bringen
    localStorage.setItem(
      SCHLUESSEL,
      JSON.stringify({ stationId: 'bern', gebaeudetypId: 'altbau-massiv', zielTemperaturC: 25 }),
    );
    const einstellungen = ladeEinstellungen();

    expect(einstellungen.stationId).toBe('bern');
    expect(einstellungen.zielTemperaturC).toBe(25);
    expect(einstellungen.raumtypId).toBe(STANDARD_EINSTELLUNGEN.raumtypId);
  });

  it('verwirft Zahlen ausserhalb des zulässigen Bereichs', () => {
    localStorage.setItem(
      SCHLUESSEL,
      JSON.stringify({ zielTemperaturC: 99, hystereseK: -3, minRaumtemperaturC: 0 }),
    );
    const einstellungen = ladeEinstellungen();

    expect(einstellungen.zielTemperaturC).toBe(STANDARD_EINSTELLUNGEN.zielTemperaturC);
    expect(einstellungen.hystereseK).toBe(STANDARD_EINSTELLUNGEN.hystereseK);
    expect(einstellungen.minRaumtemperaturC).toBe(STANDARD_EINSTELLUNGEN.minRaumtemperaturC);
  });

  it('verwirft Werte vom falschen Typ', () => {
    localStorage.setItem(
      SCHLUESSEL,
      JSON.stringify({ zielTemperaturC: '24', nachtauskuehlung: 'ja' }),
    );
    const einstellungen = ladeEinstellungen();

    expect(einstellungen.zielTemperaturC).toBe(STANDARD_EINSTELLUNGEN.zielTemperaturC);
    expect(einstellungen.nachtauskuehlung).toBe(STANDARD_EINSTELLUNGEN.nachtauskuehlung);
  });

  it('übersteht einen beschädigten Eintrag', () => {
    localStorage.setItem(SCHLUESSEL, '{kein gültiges JSON');
    expect(ladeEinstellungen()).toEqual(STANDARD_EINSTELLUNGEN);
  });

  it('behält gültige Teilwerte, auch wenn andere ungültig sind', () => {
    localStorage.setItem(
      SCHLUESSEL,
      JSON.stringify({ stationId: 'lugano', zielTemperaturC: 999 }),
    );
    const einstellungen = ladeEinstellungen();

    expect(einstellungen.stationId).toBe('lugano');
    expect(einstellungen.zielTemperaturC).toBe(STANDARD_EINSTELLUNGEN.zielTemperaturC);
  });
});

describe('ladeEinstellungen – Ferienzeiträume', () => {
  const gueltig = { id: 'f1', name: 'Sommerferien', von: '2026-07-06', bis: '2026-08-16' };

  function ladeMitFerien(ferien: unknown) {
    localStorage.setItem(SCHLUESSEL, JSON.stringify({ ferien }));
    return ladeEinstellungen().ferien;
  }

  it('übernimmt einen gültigen Zeitraum unverändert', () => {
    expect(ladeMitFerien([gueltig])).toEqual([gueltig]);
  });

  it('liefert eine leere Liste, wenn die Ferien kein Array sind', () => {
    expect(ladeMitFerien('Sommerferien')).toEqual([]);
    expect(ladeMitFerien(null)).toEqual([]);
  });

  it('verwirft nur den fehlerhaften Eintrag, nicht die ganze Liste', () => {
    const ferien = ladeMitFerien([gueltig, { name: 'kaputt', von: 'gestern', bis: 'morgen' }]);

    expect(ferien).toHaveLength(1);
    expect(ferien[0]?.name).toBe('Sommerferien');
  });

  it('verwirft Zeiträume, die rückwärts laufen', () => {
    expect(ladeMitFerien([{ ...gueltig, von: '2026-08-16', bis: '2026-07-06' }])).toEqual([]);
  });

  it('verwirft Datumsangaben, die es nicht gibt', () => {
    expect(ladeMitFerien([{ ...gueltig, von: '2026-02-31', bis: '2026-03-05' }])).toEqual([]);
    expect(ladeMitFerien([{ ...gueltig, von: '2026-13-01', bis: '2026-13-05' }])).toEqual([]);
  });

  it('akzeptiert den 29. Februar in einem Schaltjahr', () => {
    const schaltjahr = { ...gueltig, von: '2028-02-29', bis: '2028-03-01' };
    expect(ladeMitFerien([schaltjahr])).toHaveLength(1);
  });

  it('ergänzt eine fehlende ID und einen fehlenden Namen', () => {
    const ferien = ladeMitFerien([{ von: '2026-07-06', bis: '2026-08-16' }]);

    expect(ferien[0]?.id).toBeTruthy();
    expect(ferien[0]?.name).toBe('Ferien');
  });

  it('kürzt überlange Bezeichnungen', () => {
    const ferien = ladeMitFerien([{ ...gueltig, name: 'x'.repeat(200) }]);
    expect(ferien[0]?.name.length).toBe(60);
  });

  it('begrenzt die Anzahl der Zeiträume', () => {
    const viele = Array.from({ length: 100 }, (_, index) => ({ ...gueltig, id: `f${index}` }));
    expect(ladeMitFerien(viele).length).toBeLessThanOrEqual(MAX_FERIENZEITRAEUME);
  });
});

describe('setzeEinstellungenZurueck – Unabhängigkeit', () => {
  it('teilt die Ferienliste nicht mit den Standardwerten', () => {
    const zurueckgesetzt = setzeEinstellungenZurueck();
    zurueckgesetzt.ferien.push({ id: 'x', name: 'Test', von: '2026-01-01', bis: '2026-01-02' });

    // Die Konstante darf davon nichts mitbekommen
    expect(STANDARD_EINSTELLUNGEN.ferien).toHaveLength(0);
    expect(ladeEinstellungen().ferien).toHaveLength(0);
  });
});

describe('speichereEinstellungen', () => {
  it('wirft keinen Fehler, wenn der Speicher nicht verfügbar ist', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('Speicher gesperrt');
      },
      setItem: () => {
        throw new Error('Speicher gesperrt');
      },
      removeItem: () => {
        throw new Error('Speicher gesperrt');
      },
    } as unknown as Storage);

    expect(() => speichereEinstellungen(STANDARD_EINSTELLUNGEN)).not.toThrow();
    expect(ladeEinstellungen()).toEqual(STANDARD_EINSTELLUNGEN);
  });
});

describe('setzeEinstellungenZurueck', () => {
  it('entfernt den gespeicherten Eintrag und liefert die Standardwerte', () => {
    speichereEinstellungen({ ...STANDARD_EINSTELLUNGEN, stationId: 'bern' });

    expect(setzeEinstellungenZurueck()).toEqual(STANDARD_EINSTELLUNGEN);
    expect(localStorage.getItem(SCHLUESSEL)).toBeNull();
  });
});
