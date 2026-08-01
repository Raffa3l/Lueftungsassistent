import { describe, expect, it } from 'vitest';
import {
  bewerteStunde,
  fasseStatusbloeckeZusammen,
  findeNaechstenWechsel,
  istNachtstunde,
} from './lueftungslogik.ts';
import { testEinstellungen } from './testhelfer.ts';
import type { SimulationsStunde } from '../typen.ts';
import { celsius, kelvin, wattProM2 } from '../einheiten.ts';

describe('istNachtstunde', () => {
  it('erkennt das Nachtfenster von 22:00 bis 06:59', () => {
    expect(istNachtstunde(22)).toBe(true);
    expect(istNachtstunde(23)).toBe(true);
    expect(istNachtstunde(0)).toBe(true);
    expect(istNachtstunde(6)).toBe(true);
  });

  it('erkennt Tagesstunden', () => {
    expect(istNachtstunde(7)).toBe(false);
    expect(istNachtstunde(14)).toBe(false);
    expect(istNachtstunde(21)).toBe(false);
  });
});

describe('bewerteStunde – Grundregeln', () => {
  const einstellungen = testEinstellungen({ hystereseK: kelvin(2), minRaumtemperaturC: celsius(20), zielTemperaturC: celsius(24) });

  it('empfiehlt schliessen, wenn es draussen wärmer ist als drinnen', () => {
    const empfehlung = bewerteStunde({
      aussentemperaturC: celsius(31),
      raumtemperaturC: celsius(25),
      stundeDesTages: 14,
      einstellungen,
      vorherigerStatus: 'schliessen',
    });

    expect(empfehlung.status).toBe('schliessen');
    expect(empfehlung.dringlichkeit).toBe('hoch');
  });

  it('empfiehlt öffnen, wenn es draussen deutlich kühler ist', () => {
    const empfehlung = bewerteStunde({
      aussentemperaturC: celsius(19),
      raumtemperaturC: celsius(26),
      stundeDesTages: 20,
      einstellungen,
      vorherigerStatus: 'schliessen',
    });

    expect(empfehlung.status).toBe('oeffnen');
  });

  it('lüftet nicht bei zu kleinem Unterschied innerhalb der Hysterese', () => {
    // 1 Grad kühler, Hysterese verlangt 2 Grad
    const empfehlung = bewerteStunde({
      aussentemperaturC: celsius(25),
      raumtemperaturC: celsius(26),
      stundeDesTages: 14,
      einstellungen,
      vorherigerStatus: 'schliessen',
    });

    expect(empfehlung.status).toBe('schliessen');
  });

  it('schliesst nie unterhalb der eingestellten Untergrenze, auch wenn es draussen kühl ist', () => {
    const empfehlung = bewerteStunde({
      aussentemperaturC: celsius(12),
      raumtemperaturC: celsius(19.5),
      stundeDesTages: 3,
      einstellungen,
      vorherigerStatus: 'oeffnen',
    });

    expect(empfehlung.status).toBe('schliessen');
    expect(empfehlung.begruendung).toContain('Untergrenze');
  });
});

describe('bewerteStunde – Hysterese', () => {
  const einstellungen = testEinstellungen({ hystereseK: kelvin(2), minRaumtemperaturC: celsius(20) });

  it('hält ein offenes Fenster offen, solange es draussen überhaupt kühler ist', () => {
    const empfehlung = bewerteStunde({
      aussentemperaturC: celsius(25.5),
      raumtemperaturC: celsius(26),
      stundeDesTages: 14,
      einstellungen,
      vorherigerStatus: 'oeffnen',
    });

    expect(empfehlung.status).toBe('oeffnen');
  });

  it('schliesst das offene Fenster, sobald die Aussenluft die Raumtemperatur erreicht', () => {
    const empfehlung = bewerteStunde({
      aussentemperaturC: celsius(26),
      raumtemperaturC: celsius(26),
      stundeDesTages: 14,
      einstellungen,
      vorherigerStatus: 'oeffnen',
    });

    expect(empfehlung.status).toBe('schliessen');
  });

  it('öffnet aus dem geschlossenen Zustand erst ab der vollen Hysterese', () => {
    const knappDarunter = bewerteStunde({
      aussentemperaturC: celsius(24.1),
      raumtemperaturC: celsius(26),
      stundeDesTages: 14,
      einstellungen,
      vorherigerStatus: 'schliessen',
    });
    const knappDarueber = bewerteStunde({
      aussentemperaturC: celsius(23.9),
      raumtemperaturC: celsius(26),
      stundeDesTages: 14,
      einstellungen,
      vorherigerStatus: 'schliessen',
    });

    expect(knappDarunter.status).toBe('schliessen');
    expect(knappDarueber.status).toBe('oeffnen');
  });
});

describe('bewerteStunde – Nachtauskühlung', () => {
  it('empfiehlt nachts zu lüften und begründet es mit der Nachtauskühlung', () => {
    const empfehlung = bewerteStunde({
      aussentemperaturC: celsius(17),
      raumtemperaturC: celsius(26),
      stundeDesTages: 2,
      einstellungen: testEinstellungen({ nachtauskuehlung: true }),
      vorherigerStatus: 'schliessen',
    });

    expect(empfehlung.status).toBe('oeffnen');
    expect(empfehlung.dringlichkeit).toBe('hoch');
    expect(empfehlung.begruendung).toContain('Nachtauskühlung');
  });

  it('lässt die Fenster nachts zu, wenn die Nachtauskühlung abgeschaltet ist', () => {
    const empfehlung = bewerteStunde({
      aussentemperaturC: celsius(17),
      raumtemperaturC: celsius(26),
      stundeDesTages: 2,
      einstellungen: testEinstellungen({ nachtauskuehlung: false }),
      vorherigerStatus: 'schliessen',
    });

    expect(empfehlung.status).toBe('schliessen');
    expect(empfehlung.begruendung).toContain('deaktiviert');
  });

  it('lüftet tagsüber auch bei abgeschalteter Nachtauskühlung', () => {
    const empfehlung = bewerteStunde({
      aussentemperaturC: celsius(17),
      raumtemperaturC: celsius(26),
      stundeDesTages: 10,
      einstellungen: testEinstellungen({ nachtauskuehlung: false }),
      vorherigerStatus: 'schliessen',
    });

    expect(empfehlung.status).toBe('oeffnen');
  });
});

describe('bewerteStunde – Stosslüftung in belegten Räumen', () => {
  const einstellungen = testEinstellungen({ hystereseK: kelvin(2), minRaumtemperaturC: celsius(20) });
  const hitze = {
    aussentemperaturC: celsius(33),
    raumtemperaturC: celsius(27),
    stundeDesTages: 11,
    einstellungen,
    vorherigerStatus: 'schliessen' as const,
  };

  it('ergänzt den Hinweis, wenn ein belegter Raum die Fenster zu haben soll', () => {
    const empfehlung = bewerteStunde({ ...hitze, raumBelegt: true, stosslueftungNoetig: true });

    // Die Empfehlung wird nicht umgekehrt – der Hinweis kommt dazu.
    expect(empfehlung.status).toBe('schliessen');
    expect(empfehlung.zusatzhinweis).toContain('stosslüften');
  });

  it('gibt keinen Hinweis, wenn der Raum leer steht', () => {
    const empfehlung = bewerteStunde({ ...hitze, raumBelegt: false, stosslueftungNoetig: true });
    expect(empfehlung.zusatzhinweis).toBeUndefined();
  });

  it('gibt keinen Hinweis, wenn die Nutzung ihn nicht verlangt', () => {
    const empfehlung = bewerteStunde({ ...hitze, raumBelegt: true, stosslueftungNoetig: false });
    expect(empfehlung.zusatzhinweis).toBeUndefined();
  });

  it('gibt keinen Hinweis, wenn ohnehin gelüftet werden soll', () => {
    const empfehlung = bewerteStunde({
      ...hitze,
      aussentemperaturC: celsius(21),
      raumBelegt: true,
      stosslueftungNoetig: true,
    });

    expect(empfehlung.status).toBe('oeffnen');
    expect(empfehlung.zusatzhinweis).toBeUndefined();
  });

  it('hängt den Hinweis auch an die Untergrenzen- und die Nachtregel', () => {
    const anUntergrenze = bewerteStunde({
      ...hitze,
      raumtemperaturC: celsius(19),
      raumBelegt: true,
      stosslueftungNoetig: true,
    });
    const nachts = bewerteStunde({
      ...hitze,
      aussentemperaturC: celsius(18),
      stundeDesTages: 23,
      einstellungen: testEinstellungen({ nachtauskuehlung: false }),
      raumBelegt: true,
      stosslueftungNoetig: true,
    });

    expect(anUntergrenze.zusatzhinweis).toContain('stosslüften');
    expect(nachts.zusatzhinweis).toContain('stosslüften');
  });

  it('bleibt ohne Angaben zur Belegung unverändert', () => {
    expect(bewerteStunde(hitze).zusatzhinweis).toBeUndefined();
  });
});

/** Baut eine minimale Simulationsreihe nur mit den für die Auswertung nötigen Feldern. */
function reiheAusStatus(status: readonly ('oeffnen' | 'schliessen')[]): SimulationsStunde[] {
  return status.map((s, index) => ({
    zeit: new Date(2026, 7, 1, index),
    aussentemperaturC: celsius(20),
    globalstrahlungWProM2: wattProM2(0),
    relativeFeuchteProzent: 50,
    raumtemperaturC: celsius(24),
    raumtemperaturOhneLueftungC: celsius(24),
    empfehlung: { status: s, dringlichkeit: 'normal', titel: '', begruendung: '' },
  }));
}

describe('findeNaechstenWechsel', () => {
  it('findet den nächsten Statuswechsel mit Zeitpunkt und Abstand', () => {
    const reihe = reiheAusStatus(['schliessen', 'schliessen', 'schliessen', 'oeffnen']);
    const wechsel = findeNaechstenWechsel(reihe, 0);

    expect(wechsel?.status).toBe('oeffnen');
    expect(wechsel?.inStunden).toBe(3);
    expect(wechsel?.zeitpunkt.getHours()).toBe(3);
  });

  it('liefert undefined, wenn der Status konstant bleibt', () => {
    const reihe = reiheAusStatus(['oeffnen', 'oeffnen', 'oeffnen']);
    expect(findeNaechstenWechsel(reihe, 0)).toBeUndefined();
  });

  it('liefert undefined bei ungültigem Startindex', () => {
    expect(findeNaechstenWechsel(reiheAusStatus(['oeffnen']), 5)).toBeUndefined();
  });
});

describe('fasseStatusbloeckeZusammen', () => {
  it('fasst gleiche aufeinanderfolgende Stunden zu Blöcken zusammen', () => {
    const reihe = reiheAusStatus(['oeffnen', 'oeffnen', 'schliessen', 'schliessen', 'oeffnen']);
    const bloecke = fasseStatusbloeckeZusammen(reihe);

    expect(bloecke).toHaveLength(3);
    expect(bloecke[0]).toMatchObject({ status: 'oeffnen', vonIndex: 0, bisIndex: 2 });
    expect(bloecke[1]).toMatchObject({ status: 'schliessen', vonIndex: 2, bisIndex: 4 });
    expect(bloecke[2]).toMatchObject({ status: 'oeffnen', vonIndex: 4, bisIndex: 5 });
  });

  it('liefert für eine leere Reihe keine Blöcke', () => {
    expect(fasseStatusbloeckeZusammen([])).toEqual([]);
  });
});
