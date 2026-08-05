import { describe, expect, it } from 'vitest';
import {
  bewerteStunde,
  fasseStatusbloeckeZusammen,
  findeNaechstenWechsel,
  istNachtstunde,
} from './lueftungslogik.ts';
import { testEinstellungen } from './testhelfer.ts';
import type { Empfehlung, Hinweisart, SimulationsStunde } from '../typen.ts';
import {
  celsius,
  kelvin,
  meterProSekunde,
  millimeterProStunde,
  wattProM2,
} from '../einheiten.ts';

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

describe('bewerteStunde: Grundregeln', () => {
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

describe('bewerteStunde: Hysterese', () => {
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

describe('bewerteStunde: Nachtauskühlung', () => {
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

  /*
   * Ausserhalb der Nutzungszeit ist niemand da, der ein Fenster öffnen könnte.
   * Ein Schulzimmer ist ab 16 Uhr leer, die Nacht beginnt aber erst um 22,
   * dazwischen riet die App zum Lüften ins Leere.
   */
  const abends = {
    aussentemperaturC: celsius(17),
    raumtemperaturC: celsius(26),
    stundeDesTages: 20,
    vorherigerStatus: 'schliessen' as const,
  };

  it('lässt zu, wenn der Raum leer steht und die Nachtauskühlung aus ist', () => {
    const empfehlung = bewerteStunde({
      ...abends,
      einstellungen: testEinstellungen({ nachtauskuehlung: false }),
      raumBelegt: false,
    });

    expect(empfehlung.status).toBe('schliessen');
    expect(empfehlung.begruendung).toContain('nicht genutzt');
  });

  it('lüftet im leeren Raum, sobald die Nachtauskühlung eingeschaltet ist', () => {
    // Für gekippte Fenster oder den Hauswart, der abends durchgeht.
    const empfehlung = bewerteStunde({
      ...abends,
      einstellungen: testEinstellungen({ nachtauskuehlung: true }),
      raumBelegt: false,
    });

    expect(empfehlung.status).toBe('oeffnen');
  });

  it('lüftet im belegten Raum unabhängig von der Nachtauskühlung', () => {
    const empfehlung = bewerteStunde({
      ...abends,
      einstellungen: testEinstellungen({ nachtauskuehlung: false }),
      raumBelegt: true,
    });

    expect(empfehlung.status).toBe('oeffnen');
  });

  it('ändert nichts, wenn die Belegung gar nicht angegeben ist', () => {
    // Aufrufer ohne Raumtyp, etwa Tests des thermischen Modells, sollen
    // dieselbe Empfehlung bekommen wie bisher.
    const empfehlung = bewerteStunde({
      ...abends,
      einstellungen: testEinstellungen({ nachtauskuehlung: false }),
    });

    expect(empfehlung.status).toBe('oeffnen');
  });

  it('begründet nachts weiterhin mit der Nachtauskühlung, nicht mit der Belegung', () => {
    const empfehlung = bewerteStunde({
      ...abends,
      stundeDesTages: 2,
      einstellungen: testEinstellungen({ nachtauskuehlung: false }),
      raumBelegt: false,
    });

    expect(empfehlung.begruendung).toContain('nachts');
  });
});

/** Die Arten der Zusatzhinweise: Tests prüfen gezielt eine davon, nicht den Text. */
function arten(empfehlung: Empfehlung): Hinweisart[] {
  return empfehlung.zusatzhinweise.map((hinweis) => hinweis.art);
}

describe('bewerteStunde: Stosslüftung in belegten Räumen', () => {
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

    // Die Empfehlung wird nicht umgekehrt, der Hinweis kommt dazu. Neben der
    // Luftqualität meldet sich die Kühlung, weil es über der Wunschtemperatur
    // liegt; die Rangfolge stellt die Luftqualität nach vorn.
    expect(empfehlung.status).toBe('schliessen');
    expect(arten(empfehlung)).toEqual(['luftqualitaet', 'kuehlung']);
    expect(empfehlung.zusatzhinweise[0]?.text).toContain('stosslüften');
  });

  it('gibt keinen Hinweis, wenn der Raum leer steht', () => {
    const empfehlung = bewerteStunde({ ...hitze, raumBelegt: false, stosslueftungNoetig: true });
    expect(empfehlung.zusatzhinweise).toEqual([]);
  });

  it('gibt keinen Stosslüftungshinweis, wenn die Nutzung ihn nicht verlangt', () => {
    const empfehlung = bewerteStunde({ ...hitze, raumBelegt: true, stosslueftungNoetig: false });
    expect(arten(empfehlung)).not.toContain('luftqualitaet');
  });

  it('gibt keinen Hinweis, wenn ohnehin gelüftet werden soll', () => {
    const empfehlung = bewerteStunde({
      ...hitze,
      aussentemperaturC: celsius(21),
      raumBelegt: true,
      stosslueftungNoetig: true,
    });

    expect(empfehlung.status).toBe('oeffnen');
    expect(empfehlung.zusatzhinweise).toEqual([]);
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

    expect(anUntergrenze.zusatzhinweise[0]?.art).toBe('luftqualitaet');
    expect(nachts.zusatzhinweise[0]?.art).toBe('luftqualitaet');
  });

  it('bleibt ohne Angaben zur Belegung unverändert', () => {
    expect(bewerteStunde(hitze).zusatzhinweise).toEqual([]);
  });
});

describe('bewerteStunde: Kühlungshinweis bei geschlossenen Fenstern', () => {
  const einstellungen = testEinstellungen({ zielTemperaturC: celsius(24) });
  const hitze = {
    aussentemperaturC: celsius(33),
    raumtemperaturC: celsius(28),
    stundeDesTages: 14,
    einstellungen,
    vorherigerStatus: 'schliessen' as const,
  };

  it('empfiehlt Luftbewegung, wenn ein belegter Raum über der Wunschtemperatur liegt', () => {
    const empfehlung = bewerteStunde({ ...hitze, raumBelegt: true });

    expect(empfehlung.status).toBe('schliessen');
    expect(arten(empfehlung)).toContain('kuehlung');
    expect(empfehlung.zusatzhinweise[0]?.text).toContain('Ventilator');
  });

  it('schweigt, solange die Wunschtemperatur eingehalten ist', () => {
    const empfehlung = bewerteStunde({
      ...hitze,
      raumtemperaturC: celsius(23),
      raumBelegt: true,
    });

    expect(arten(empfehlung)).not.toContain('kuehlung');
  });

  it('schweigt zwischen Wunschtemperatur und 26 Grad, dort zieht es nur', () => {
    // 25 Grad liegt über der Wunschtemperatur von 24, aber unter der Schwelle,
    // ab der EN 16798-1 erhöhte Luftgeschwindigkeiten überhaupt zulässt.
    const empfehlung = bewerteStunde({
      ...hitze,
      raumtemperaturC: celsius(25),
      raumBelegt: true,
    });

    expect(arten(empfehlung)).not.toContain('kuehlung');
  });

  it('meldet sich, sobald 26 Grad erreicht sind', () => {
    const empfehlung = bewerteStunde({
      ...hitze,
      raumtemperaturC: celsius(26),
      raumBelegt: true,
    });

    expect(arten(empfehlung)).toContain('kuehlung');
  });

  it('schweigt trotz 26 Grad, wenn die Wunschtemperatur höher gesetzt ist', () => {
    // Beide Bedingungen müssen erfüllt sein: warm genug für bewegte Luft *und*
    // wärmer, als es dem Nutzer lieb ist.
    const empfehlung = bewerteStunde({
      ...hitze,
      raumtemperaturC: celsius(26),
      einstellungen: testEinstellungen({ zielTemperaturC: celsius(27) }),
      raumBelegt: true,
    });

    expect(arten(empfehlung)).not.toContain('kuehlung');
  });

  it('schweigt im leeren Raum, der Hinweis richtet sich an Menschen', () => {
    expect(arten(bewerteStunde({ ...hitze, raumBelegt: false }))).not.toContain('kuehlung');
  });

  it('sagt dazu, dass der Ventilator im leeren Raum nur heizt', () => {
    // Er wandelt seine ganze Leistung in Wärme, das gehört zur ehrlichen
    // Darstellung, auch wenn es gegen die gefühlte Abkühlung wenig wiegt.
    const empfehlung = bewerteStunde({ ...hitze, raumBelegt: true });

    expect(empfehlung.zusatzhinweise[0]?.text).toContain('abstellen');
  });

  it('rät bei trockener Extremhitze zum Trinken statt zum Ventilator', () => {
    // 38 °C im Raum, dazu ein tiefer Aussentaupunkt: Die geschätzte
    // Raumfeuchte liegt weit unter 40 %, der Ventilator wärmt dann eher.
    const empfehlung = bewerteStunde({
      ...hitze,
      aussentemperaturC: celsius(40),
      raumtemperaturC: celsius(38),
      raumBelegt: true,
      taupunktAussenC: celsius(8),
    });

    expect(empfehlung.zusatzhinweise[0]?.text).toContain('Trinken');
  });

  it('bleibt bei feuchter Extremhitze beim Ventilator', () => {
    // Gleiche Temperatur, aber schwüle Luft: Hier ist die Verdunstung der
    // begrenzende Faktor, und der Ventilator hilft weiterhin.
    const empfehlung = bewerteStunde({
      ...hitze,
      aussentemperaturC: celsius(40),
      raumtemperaturC: celsius(38),
      raumBelegt: true,
      taupunktAussenC: celsius(24),
    });

    expect(empfehlung.zusatzhinweise[0]?.text).toContain('Ventilator');
  });
});

describe('bewerteStunde: Feuchte- und Windhinweise beim Öffnen', () => {
  const einstellungen = testEinstellungen({ hystereseK: kelvin(2) });
  const lueften = {
    aussentemperaturC: celsius(20),
    raumtemperaturC: celsius(26),
    stundeDesTages: 20,
    einstellungen,
    vorherigerStatus: 'schliessen' as const,
  };

  it('warnt vor Tauwasser, wenn schwüle Luft auf einen kühlen Raum trifft', () => {
    const empfehlung = bewerteStunde({
      ...lueften,
      raumtemperaturC: celsius(21),
      aussentemperaturC: celsius(18),
      taupunktAussenC: celsius(20.5),
    });

    // Der Entscheid bleibt «öffnen», der Hinweis schränkt nur ein.
    expect(empfehlung.status).toBe('oeffnen');
    expect(arten(empfehlung)).toContain('feuchte');
    expect(empfehlung.zusatzhinweise[0]?.text).toContain('kurz und kräftig');
  });

  it('nennt schwüle Luft beim Namen, ohne vom Lüften abzuraten', () => {
    const empfehlung = bewerteStunde({ ...lueften, taupunktAussenC: celsius(18) });

    expect(empfehlung.status).toBe('oeffnen');
    expect(empfehlung.zusatzhinweise[0]?.text).toContain('schwül');
  });

  it('gibt bei Tauwassergefahr nicht zusätzlich den Schwülehinweis', () => {
    const empfehlung = bewerteStunde({
      ...lueften,
      raumtemperaturC: celsius(21),
      aussentemperaturC: celsius(18),
      taupunktAussenC: celsius(20.5),
    });

    expect(arten(empfehlung).filter((art) => art === 'feuchte')).toHaveLength(1);
  });

  it('schweigt bei trockener Aussenluft', () => {
    const empfehlung = bewerteStunde({ ...lueften, taupunktAussenC: celsius(8) });
    expect(arten(empfehlung)).not.toContain('feuchte');
  });

  it('empfiehlt Querlüften, sobald spürbarer Wind weht', () => {
    const empfehlung = bewerteStunde({
      ...lueften,
      windgeschwindigkeitMProS: meterProSekunde(5),
    });

    expect(arten(empfehlung)).toContain('wind');
  });

  it('schweigt bei schwachem Wind', () => {
    const empfehlung = bewerteStunde({
      ...lueften,
      windgeschwindigkeitMProS: meterProSekunde(2),
    });

    expect(arten(empfehlung)).not.toContain('wind');
  });

  it('ordnet Feuchte vor Wind', () => {
    const empfehlung = bewerteStunde({
      ...lueften,
      taupunktAussenC: celsius(18),
      windgeschwindigkeitMProS: meterProSekunde(6),
    });

    expect(arten(empfehlung)).toEqual(['feuchte', 'wind']);
  });

  it('kommt ohne Feuchte- und Windangaben aus', () => {
    expect(bewerteStunde(lueften).zusatzhinweise).toEqual([]);
  });
});

/**
 * Warnungen vor Sturm- und Wasserschaden.
 *
 * Sie sollen aufmerksam machen, nicht bevormunden: Die Empfehlung bleibt in
 * jedem Fall unverändert: Regenluft kühlt gut, und ob das Fenster trotzdem
 * offen bleibt, entscheidet der Mensch davor.
 */
describe('bewerteStunde: Warnungen bei offenem Fenster', () => {
  const lueften = {
    aussentemperaturC: celsius(20),
    raumtemperaturC: celsius(27),
    stundeDesTages: 22,
    einstellungen: testEinstellungen(),
    vorherigerStatus: 'schliessen' as const,
  };

  it('warnt vor Böen, die einen Flügel zuschlagen lassen', () => {
    const empfehlung = bewerteStunde({ ...lueften, windboeeMProS: meterProSekunde(13) });

    expect(arten(empfehlung)).toContain('wetterschutz');
    expect(empfehlung.zusatzhinweise[0]?.kuerzel).toBe('Böen');
  });

  it('schweigt bei ruhigem Wind', () => {
    const empfehlung = bewerteStunde({ ...lueften, windboeeMProS: meterProSekunde(8) });
    expect(arten(empfehlung)).not.toContain('wetterschutz');
  });

  it('nennt Sturm beim Namen, sobald die Warnschwelle erreicht ist', () => {
    const empfehlung = bewerteStunde({ ...lueften, windboeeMProS: meterProSekunde(18) });
    expect(empfehlung.zusatzhinweise[0]?.kuerzel).toBe('Sturm');
  });

  it('warnt vor Regen, der das Fensterbrett nässt', () => {
    const empfehlung = bewerteStunde({ ...lueften, niederschlagMmProH: millimeterProStunde(2) });
    expect(empfehlung.zusatzhinweise[0]?.kuerzel).toBe('Regen');
  });

  it('schweigt bei blossem Sprühregen', () => {
    const empfehlung = bewerteStunde({ ...lueften, niederschlagMmProH: millimeterProStunde(0.2) });
    expect(arten(empfehlung)).not.toContain('wetterschutz');
  });

  it('warnt bei Schneefall', () => {
    const empfehlung = bewerteStunde({ ...lueften, schneefallCm: 0.4 });
    expect(empfehlung.zusatzhinweise[0]?.kuerzel).toBe('Schnee');
  });

  it('warnt vor Gewitter, auch wenn noch kein Regen fällt', () => {
    // Gewitter setzen binnen Minuten ein, die Vorwarnung ist der Sinn der Sache.
    const empfehlung = bewerteStunde({ ...lueften, wettercode: 95 });
    expect(empfehlung.zusatzhinweise[0]?.kuerzel).toBe('Gewitter');
  });

  it('gibt bei Gewitter nur eine Warnung, nicht drei', () => {
    const empfehlung = bewerteStunde({
      ...lueften,
      wettercode: 95,
      windboeeMProS: meterProSekunde(20),
      niederschlagMmProH: millimeterProStunde(8),
    });

    expect(arten(empfehlung).filter((art) => art === 'wetterschutz')).toHaveLength(1);
    expect(empfehlung.zusatzhinweise[0]?.kuerzel).toBe('Gewitter');
  });

  it('stellt die Warnung vor die Komforthinweise', () => {
    // Die Empfehlungskarte zeigt nur zwei Hinweise, die Warnung darf nicht
    // hinter «schwül» herausfallen.
    const empfehlung = bewerteStunde({
      ...lueften,
      taupunktAussenC: celsius(18),
      windboeeMProS: meterProSekunde(18),
    });

    expect(arten(empfehlung)[0]).toBe('wetterschutz');
  });

  it('rät bei Böen nicht gleichzeitig zum Querlüften', () => {
    // Beides zusammen wäre ein Widerspruch in benachbarten Zeilen.
    const empfehlung = bewerteStunde({
      ...lueften,
      windgeschwindigkeitMProS: meterProSekunde(6),
      windboeeMProS: meterProSekunde(15),
    });

    expect(arten(empfehlung)).toContain('wetterschutz');
    expect(arten(empfehlung)).not.toContain('wind');
  });

  it('lässt die Empfehlung unverändert, gewarnt wird, nicht entschieden', () => {
    const ruhig = bewerteStunde(lueften);
    const stuermisch = bewerteStunde({
      ...lueften,
      wettercode: 95,
      windboeeMProS: meterProSekunde(25),
      niederschlagMmProH: millimeterProStunde(13),
    });

    expect(ruhig.status).toBe('oeffnen');
    expect(stuermisch.status).toBe('oeffnen');
    expect(stuermisch.dringlichkeit).toBe(ruhig.dringlichkeit);
  });

  it('warnt nicht, solange die Fenster ohnehin geschlossen bleiben', () => {
    const empfehlung = bewerteStunde({
      ...lueften,
      aussentemperaturC: celsius(30),
      raumtemperaturC: celsius(24),
      windboeeMProS: meterProSekunde(25),
    });

    expect(empfehlung.status).toBe('schliessen');
    expect(arten(empfehlung)).not.toContain('wetterschutz');
  });
});

/** Baut eine minimale Simulationsreihe nur mit den für die Auswertung nötigen Feldern. */
function reiheAusStatus(status: readonly ('oeffnen' | 'schliessen')[]): SimulationsStunde[] {
  return status.map((s, index) => ({
    zeit: new Date(2026, 7, 1, index),
    aussentemperaturC: celsius(20),
    globalstrahlungWProM2: wattProM2(0),
    direktstrahlungNormalWProM2: wattProM2(0),
    diffusstrahlungWProM2: wattProM2(0),
    relativeFeuchteProzent: 50,
    taupunktC: celsius(5),
    windgeschwindigkeitMProS: meterProSekunde(2),
    windboeeMProS: meterProSekunde(3),
    niederschlagMmProH: millimeterProStunde(0),
    schneefallCm: 0,
    wettercode: 0,
    raumtemperaturC: celsius(24),
    raumtemperaturOhneLueftungC: celsius(24),
    empfehlung: {
      status: s,
      dringlichkeit: 'normal',
      titel: '',
      begruendung: '',
      zusatzhinweise: [],
    },
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
