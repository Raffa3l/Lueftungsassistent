import { describe, expect, it } from 'vitest';
import { findeFreienTag, findeRaumtyp, istBelegt, RAUMTYPEN, type Kalender } from './raumtypen.ts';

/** 3. August 2026 ist ein Montag, der 1. August ein Samstag. */
const MONTAG = new Date(2026, 7, 3, 10);
const SAMSTAG = new Date(2026, 7, 1, 10);

describe('RAUMTYPEN', () => {
  it('enthält die drei Nutzungsarten mit eindeutigen IDs', () => {
    const ids = RAUMTYPEN.map((typ) => typ.id);

    expect(ids).toContain('wohnung');
    expect(ids).toContain('schulzimmer');
    expect(ids).toContain('buero');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('hält für alle Typen plausible Lastwerte vor', () => {
    for (const typ of RAUMTYPEN) {
      // Auslegungswerte nach SIA 2024 liegen zwischen etwa 5 und 45 W/m²
      expect(typ.belegungslastWProM2).toBeGreaterThanOrEqual(5);
      expect(typ.belegungslastWProM2).toBeLessThanOrEqual(45);
      expect(typ.grundlastWProM2).toBeLessThan(typ.belegungslastWProM2);
      expect(typ.belegung.vonStunde).toBeGreaterThanOrEqual(0);
      expect(typ.belegung.bisStunde).toBeLessThanOrEqual(24);
    }
  });

  it('ordnet die Lasten richtig: Schulzimmer über Büro über Wohnung', () => {
    const last = (id: string) => findeRaumtyp(id)!.belegungslastWProM2;

    expect(last('schulzimmer')).toBeGreaterThan(last('buero'));
    expect(last('buero')).toBeGreaterThan(last('wohnung'));
  });

  it('verlangt nur in dicht belegten Räumen zusätzliche Stosslüftung', () => {
    expect(findeRaumtyp('schulzimmer')!.stosslueftungNoetig).toBe(true);
    expect(findeRaumtyp('buero')!.stosslueftungNoetig).toBe(true);
    expect(findeRaumtyp('wohnung')!.stosslueftungNoetig).toBe(false);
  });

  it('kennt die stossweise Feuchtelast nur in der Wohnung', () => {
    // Duschen, Kochen und Wäschetrocknen gibt es weder im Schulzimmer noch im Büro.
    expect(findeRaumtyp('wohnung')!.feuchtelastStossweise).toBe(true);
    expect(findeRaumtyp('schulzimmer')!.feuchtelastStossweise).toBe(false);
    expect(findeRaumtyp('buero')!.feuchtelastStossweise).toBe(false);
  });
});

describe('findeRaumtyp', () => {
  it('findet einen bekannten Raumtyp', () => {
    expect(findeRaumtyp('buero')?.name).toBe('Büro');
  });

  it('liefert undefined für eine unbekannte ID', () => {
    expect(findeRaumtyp('turnhalle')).toBeUndefined();
  });
});

describe('istBelegt', () => {
  const schulzimmer = findeRaumtyp('schulzimmer')!;
  const wohnung = findeRaumtyp('wohnung')!;

  it('erkennt die Unterrichtszeit am Montag', () => {
    expect(istBelegt(new Date(2026, 7, 3, 10), schulzimmer)).toBe(true);
  });

  it('schliesst die Randstunden korrekt ein und aus', () => {
    // Belegt von 08 bis 16 Uhr: 08 gehört dazu, 16 nicht mehr
    expect(istBelegt(new Date(2026, 7, 3, 8), schulzimmer)).toBe(true);
    expect(istBelegt(new Date(2026, 7, 3, 15), schulzimmer)).toBe(true);
    expect(istBelegt(new Date(2026, 7, 3, 16), schulzimmer)).toBe(false);
    expect(istBelegt(new Date(2026, 7, 3, 7), schulzimmer)).toBe(false);
  });

  it('lässt das Schulzimmer am Wochenende leer', () => {
    expect(istBelegt(SAMSTAG, schulzimmer)).toBe(false);
    expect(istBelegt(new Date(2026, 7, 2, 10), schulzimmer)).toBe(false); // Sonntag
  });

  it('belegt die Wohnung auch am Wochenende', () => {
    expect(istBelegt(SAMSTAG, wohnung)).toBe(true);
    expect(istBelegt(MONTAG, wohnung)).toBe(true);
  });

  it('lässt die Wohnung nachts als unbelegt gelten', () => {
    expect(istBelegt(new Date(2026, 7, 3, 3), wohnung)).toBe(false);
  });

  it('ignoriert den Kalender, solange keiner übergeben wird', () => {
    // Der 1. August ist Bundesfeier, ohne Kalender darf das nichts ändern
    expect(istBelegt(new Date(2026, 7, 3, 10), schulzimmer)).toBe(true);
  });

  it('kommt mit einem Zeitfenster über Mitternacht zurecht', () => {
    const nachtbetrieb = { ...wohnung, belegung: { vonStunde: 22, bisStunde: 6, nurWerktags: false } };

    expect(istBelegt(new Date(2026, 7, 3, 23), nachtbetrieb)).toBe(true);
    expect(istBelegt(new Date(2026, 7, 3, 2), nachtbetrieb)).toBe(true);
    expect(istBelegt(new Date(2026, 7, 3, 12), nachtbetrieb)).toBe(false);
  });
});

describe('findeFreienTag', () => {
  const sommerferien = { id: 'f1', name: 'Sommerferien', von: '2026-07-06', bis: '2026-08-14' };
  const kalender: Kalender = { ferien: [sommerferien], feiertageBeachten: true };

  it('nennt den Ferienzeitraum an einem Tag darin', () => {
    expect(findeFreienTag(new Date(2026, 6, 20, 10), kalender)).toBe('Sommerferien');
  });

  it('schliesst Anfangs- und Endtag ein', () => {
    expect(findeFreienTag(new Date(2026, 6, 6, 10), kalender)).toBe('Sommerferien');
    expect(findeFreienTag(new Date(2026, 7, 14, 10), kalender)).toBe('Sommerferien');
  });

  it('liefert für den Tag danach nichts mehr', () => {
    expect(findeFreienTag(new Date(2026, 7, 15, 10), kalender)).toBeUndefined();
  });

  it('nennt den Feiertag, wenn kein Ferienzeitraum greift', () => {
    expect(findeFreienTag(new Date(2026, 4, 14, 10), kalender)).toBe('Auffahrt');
  });

  it('lässt den eigenen Namen vor dem Feiertag gewinnen', () => {
    const eigener = { id: 'f2', name: 'Betriebsferien', von: '2026-08-01', bis: '2026-08-09' };
    const name = findeFreienTag(new Date(2026, 7, 1, 10), {
      ferien: [eigener],
      feiertageBeachten: true,
    });

    expect(name).toBe('Betriebsferien');
  });

  it('übergeht Feiertage, wenn sie abgeschaltet sind', () => {
    const ohne: Kalender = { ferien: [], feiertageBeachten: false };
    expect(findeFreienTag(new Date(2026, 7, 1, 10), ohne)).toBeUndefined();
  });
});

describe('istBelegt mit Kalender', () => {
  const schulzimmer = findeRaumtyp('schulzimmer')!;
  const wohnung = findeRaumtyp('wohnung')!;
  const ferien: Kalender = {
    ferien: [{ id: 'f1', name: 'Sommerferien', von: '2026-08-03', bis: '2026-08-14' }],
    feiertageBeachten: true,
  };

  it('lässt das Schulzimmer in den Ferien leer, auch während der Unterrichtszeit', () => {
    // Montag, 3. August 2026, 10 Uhr, ohne Ferien wäre der Raum belegt
    const zeitpunkt = new Date(2026, 7, 3, 10);

    expect(istBelegt(zeitpunkt, schulzimmer)).toBe(true);
    expect(istBelegt(zeitpunkt, schulzimmer, ferien)).toBe(false);
  });

  it('lässt das Schulzimmer an einem Feiertag leer', () => {
    // Auffahrt 2026 fällt auf Donnerstag, den 14. Mai
    expect(istBelegt(new Date(2026, 4, 14, 10), schulzimmer, ferien)).toBe(false);
  });

  it('belegt das Schulzimmer am Tag nach den Ferien wieder', () => {
    // Montag, 17. August 2026
    expect(istBelegt(new Date(2026, 7, 17, 10), schulzimmer, ferien)).toBe(true);
  });

  it('lässt die Wohnung vom Kalender unberührt', () => {
    expect(istBelegt(new Date(2026, 7, 3, 10), wohnung, ferien)).toBe(true);
    expect(istBelegt(new Date(2026, 4, 14, 10), wohnung, ferien)).toBe(true);
  });
});
