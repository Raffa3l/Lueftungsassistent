import { describe, expect, it } from 'vitest';
import {
  amplitudendaempfung,
  findeIndexFuerJetzt,
  naechsteRaumtemperatur,
  phasenverschiebungH,
  schaetzeStartRaumtemperatur,
  simuliere,
  waermeeintragKProH,
  waermelastWProM2,
} from './thermischesModell.ts';
import {
  erzeugeTagesgang,
  erzeugeWetterstunden,
  MONTAG,
  testEinstellungen,
  TEST_GEBAEUDE,
  TEST_RAUM,
} from './testhelfer.ts';
import { GEBAEUDETYPEN } from '../konfiguration/gebaeudetypen.ts';
import { findeRaumtyp } from '../konfiguration/raumtypen.ts';
import { celsius, kelvin, stunden, wattProM2, whProM2K } from '../einheiten.ts';

describe('waermelastWProM2', () => {
  // Testgebäude: 50 Wh/(m²K) Speicherkapazität, Testraum belegt von 08 bis 18 Uhr
  const gebaeude = { ...TEST_GEBAEUDE, solarerEintragMaxWProM2: wattProM2(40) };
  const raum = { ...TEST_RAUM, belegungslastWProM2: wattProM2(30), grundlastWProM2: wattProM2(5) };

  it('rechnet den solaren Eintrag proportional zur Globalstrahlung', () => {
    const [mittag] = erzeugeWetterstunden([25], 12, 400); // halbe Referenzstrahlung
    expect(waermelastWProM2(mittag!, gebaeude, raum)).toBeCloseTo(20 + 30, 5);
  });

  it('begrenzt den solaren Eintrag oberhalb der Referenzstrahlung', () => {
    const [mittag] = erzeugeWetterstunden([25], 12, 1200);
    expect(waermelastWProM2(mittag!, gebaeude, raum)).toBeCloseTo(40 + 30, 5);
  });

  it('verwendet ausserhalb der Belegung die Grundlast', () => {
    const [nacht] = erzeugeWetterstunden([18], 3, 0);
    expect(waermelastWProM2(nacht!, gebaeude, raum)).toBeCloseTo(5, 5);
  });
});

describe('waermeeintragKProH', () => {
  const gebaeude = { ...TEST_GEBAEUDE, solarerEintragMaxWProM2: wattProM2(40) };
  const raum = { ...TEST_RAUM, belegungslastWProM2: wattProM2(30), grundlastWProM2: wattProM2(5) };

  it('rechnet die Last über die Speicherkapazität in Kelvin pro Stunde um', () => {
    const [mittag] = erzeugeWetterstunden([25], 12, 400);
    // 50 W/m² bei 50 Wh/(m²K) ergeben genau 1 K/h
    expect(waermeeintragKProH(mittag!, gebaeude, raum)).toBeCloseTo(1, 5);
  });

  it('lässt dieselbe Last im schwereren Gebäude halb so schnell wirken', () => {
    const [mittag] = erzeugeWetterstunden([25], 12, 400);
    const schwer = { ...gebaeude, speicherkapazitaetWhProM2K: whProM2K(100) };

    expect(waermeeintragKProH(mittag!, schwer, raum)).toBeCloseTo(
      waermeeintragKProH(mittag!, gebaeude, raum) / 2,
      5,
    );
  });
});

describe('naechsteRaumtemperatur', () => {
  it('nähert sich der Aussentemperatur exponentiell an', () => {
    const [stunde] = erzeugeWetterstunden([20], 3);
    // τ = 20 h, Start 30 °C: nach 1 h bleiben e^(-1/20) der Differenz übrig
    const erwartet = 20 + 10 * Math.exp(-1 / 20);
    expect(naechsteRaumtemperatur(celsius(30), stunde!, TEST_GEBAEUDE, TEST_RAUM, false)).toBeCloseTo(erwartet, 6);
  });

  it('kühlt bei offenem Fenster deutlich schneller aus als bei geschlossenem', () => {
    const [stunde] = erzeugeWetterstunden([18], 3);
    const offen = naechsteRaumtemperatur(celsius(28), stunde!, TEST_GEBAEUDE, TEST_RAUM, true);
    const geschlossen = naechsteRaumtemperatur(celsius(28), stunde!, TEST_GEBAEUDE, TEST_RAUM, false);

    expect(offen).toBeLessThan(geschlossen);
    expect(28 - offen).toBeGreaterThan(3 * (28 - geschlossen));
  });

  it('bleibt stabil, wenn Innen- und Aussentemperatur gleich sind und keine Lasten wirken', () => {
    const [stunde] = erzeugeWetterstunden([24], 3);
    expect(naechsteRaumtemperatur(celsius(24), stunde!, TEST_GEBAEUDE, TEST_RAUM, false)).toBeCloseTo(24, 10);
  });

  it('läuft bei Wärmeeinträgen auf die Beharrungstemperatur T_aussen + q·τ zu', () => {
    // 5 W/m² rund um die Uhr bei 50 Wh/(m²K) ergeben q = 0.1 K/h
    const raum = { ...TEST_RAUM, belegungslastWProM2: wattProM2(5), grundlastWProM2: wattProM2(5) };
    const [stunde] = erzeugeWetterstunden([20], 12);

    let temperatur = celsius(20);
    for (let i = 0; i < 500; i++) {
      temperatur = naechsteRaumtemperatur(temperatur, stunde!, TEST_GEBAEUDE, raum, false);
    }
    // q = 0.1 K/h, τ = 20 h  →  +2 K über der Aussentemperatur
    expect(temperatur).toBeCloseTo(22, 3);
  });

  it('überschwingt auch bei sehr kleiner Zeitkonstante nicht', () => {
    const flinkesGebaeude = { ...TEST_GEBAEUDE, zeitkonstanteOffenH: stunden(0.25) };
    const [stunde] = erzeugeWetterstunden([15], 3);
    const ergebnis = naechsteRaumtemperatur(celsius(28), stunde!, flinkesGebaeude, TEST_RAUM, true);

    expect(ergebnis).toBeGreaterThanOrEqual(15);
    expect(ergebnis).toBeLessThan(28);
  });
});

describe('amplitudendaempfung und phasenverschiebungH', () => {
  it('dämpft stärker und verzögert länger, je träger das Gebäude ist', () => {
    const traege = amplitudendaempfung(35);
    const leicht = amplitudendaempfung(7);

    expect(traege).toBeLessThan(leicht);
    expect(phasenverschiebungH(35)).toBeGreaterThan(phasenverschiebungH(7));
  });

  it('liefert für alle konfigurierten Gebäudetypen plausible Werte', () => {
    for (const typ of GEBAEUDETYPEN) {
      const daempfung = amplitudendaempfung(typ.zeitkonstanteGeschlossenH);
      const verzoegerung = phasenverschiebungH(typ.zeitkonstanteGeschlossenH);

      expect(daempfung).toBeGreaterThan(0);
      expect(daempfung).toBeLessThan(0.6);
      // Realistische Bandbreite für Schweizer Wohnbauten: rund 3 bis 6 Stunden
      expect(verzoegerung).toBeGreaterThan(2.5);
      expect(verzoegerung).toBeLessThan(6.5);
    }
  });

  it('geht für ein trägheitsloses Gebäude gegen keine Dämpfung', () => {
    expect(amplitudendaempfung(0)).toBeCloseTo(1, 10);
    expect(phasenverschiebungH(0)).toBeCloseTo(0, 10);
  });
});

describe('schaetzeStartRaumtemperatur', () => {
  it('liegt bei sommerlichem Wetter über dem Aussenmittel', () => {
    const wetter = erzeugeTagesgang(1, 22, 6);
    expect(schaetzeStartRaumtemperatur(wetter, TEST_GEBAEUDE)).toBeGreaterThan(22);
  });

  it('bleibt bei kühlem Wetter im plausiblen Bereich', () => {
    const wetter = erzeugeTagesgang(1, 8, 4);
    const start = schaetzeStartRaumtemperatur(wetter, TEST_GEBAEUDE);

    expect(start).toBeGreaterThanOrEqual(16);
    expect(start).toBeLessThan(TEST_GEBAEUDE.sommerBasistemperaturC);
  });

  it('reagiert bei einem trägen Gebäude weniger auf das Aussenwetter als bei einem leichten', () => {
    const wetter = erzeugeTagesgang(1, 30, 5);
    const traege = { ...TEST_GEBAEUDE, zeitkonstanteGeschlossenH: stunden(35) };
    const leicht = { ...TEST_GEBAEUDE, zeitkonstanteGeschlossenH: stunden(7) };

    expect(schaetzeStartRaumtemperatur(wetter, traege)).toBeLessThan(
      schaetzeStartRaumtemperatur(wetter, leicht),
    );
  });

  it('fällt ohne Wetterdaten auf die Basistemperatur zurück', () => {
    expect(schaetzeStartRaumtemperatur([], TEST_GEBAEUDE)).toBe(TEST_GEBAEUDE.sommerBasistemperaturC);
  });
});

describe('simuliere', () => {
  const einstellungen = testEinstellungen({
    hystereseK: kelvin(2),
    minRaumtemperaturC: celsius(20),
    zielTemperaturC: celsius(24),
    nachtauskuehlung: true,
  });

  it('liefert zu jeder Wetterstunde genau eine Simulationsstunde', () => {
    const wetter = erzeugeTagesgang(2, 24, 7);
    const { stunden } = simuliere(wetter, TEST_GEBAEUDE, TEST_RAUM, einstellungen);

    expect(stunden).toHaveLength(wetter.length);
    expect(stunden[0]?.zeit).toEqual(wetter[0]?.zeit);
  });

  it('dämpft die Aussenschwankung: der Innenverlauf schwankt weniger', () => {
    const wetter = erzeugeTagesgang(3, 24, 8);
    const { stunden } = simuliere(wetter, TEST_GEBAEUDE, TEST_RAUM, einstellungen, celsius(24));
    const letzterTag = stunden.slice(-24);

    const spanne = (werte: number[]) => Math.max(...werte) - Math.min(...werte);
    const aussenSpanne = spanne(letzterTag.map((s) => s.aussentemperaturC));
    const innenSpanne = spanne(letzterTag.map((s) => s.raumtemperaturC));

    expect(innenSpanne).toBeLessThan(aussenSpanne);
  });

  it('hält den Raum in der Hitzeperiode kühler als das Szenario ohne Lüften', () => {
    // Hochsommer: heisse Tage, aber kühle Nächte – der klassische Anwendungsfall
    const wetter = erzeugeTagesgang(3, 24, 8);
    const { stunden } = simuliere(wetter, TEST_GEBAEUDE, TEST_RAUM, einstellungen, celsius(26));
    const letzte = stunden.at(-1)!;

    expect(letzte.raumtemperaturC).toBeLessThan(letzte.raumtemperaturOhneLueftungC);
  });

  it('empfiehlt in der heissesten Nachmittagsstunde geschlossene Fenster', () => {
    const wetter = erzeugeTagesgang(3, 26, 8);
    const { stunden } = simuliere(wetter, TEST_GEBAEUDE, TEST_RAUM, einstellungen, celsius(25));
    const nachmittag = stunden.filter((s) => s.zeit.getHours() === 15).at(-1)!;

    expect(nachmittag.empfehlung.status).toBe('schliessen');
  });

  it('empfiehlt in der kühlsten Nachtstunde offene Fenster', () => {
    const wetter = erzeugeTagesgang(3, 26, 8);
    const { stunden } = simuliere(wetter, TEST_GEBAEUDE, TEST_RAUM, einstellungen, celsius(25));
    const nacht = stunden.filter((s) => s.zeit.getHours() === 3).at(-1)!;

    expect(nacht.empfehlung.status).toBe('oeffnen');
  });

  it('empfiehlt nie zu lüften, wenn der Raum bereits an der Untergrenze ist', () => {
    // Kühle Witterung: Das Modell kennt keine Heizung, der Raum sinkt trotzdem ab.
    // Zugesichert ist deshalb nur, dass die Lüftung das Auskühlen nicht antreibt.
    const wetter = erzeugeTagesgang(3, 12, 4);
    const { stunden } = simuliere(wetter, TEST_GEBAEUDE, TEST_RAUM, einstellungen, celsius(21));

    const zuKalt = stunden.filter((s) => s.raumtemperaturC <= einstellungen.minRaumtemperaturC);
    expect(zuKalt.length).toBeGreaterThan(0);
    for (const stunde of zuKalt) {
      expect(stunde.empfehlung.status).toBe('schliessen');
    }
  });

  it('bremst die Nachtauskühlung an der Untergrenze spürbar ab', () => {
    // Kühle Sommernacht bei 16 °C: ohne Untergrenze wird bis fast 16 °C ausgekühlt.
    const wetter = erzeugeWetterstunden(Array.from({ length: 12 }, () => 16), 20);
    const mitGrenze = simuliere(wetter, TEST_GEBAEUDE, TEST_RAUM, einstellungen, celsius(24));
    const ohneGrenze = simuliere(
      wetter,
      TEST_GEBAEUDE,
      TEST_RAUM,
      testEinstellungen({ ...einstellungen, minRaumtemperaturC: celsius(15) }),
      celsius(24),
    );

    expect(mitGrenze.stunden.at(-1)!.raumtemperaturC).toBeGreaterThan(
      ohneGrenze.stunden.at(-1)!.raumtemperaturC + 1,
    );
    // Gelüftet wurde trotzdem: der Raum ist kühler als zu Beginn.
    expect(mitGrenze.stunden.at(-1)!.raumtemperaturC).toBeLessThan(24);
  });

  it('verhält sich ohne Lüftungsempfehlung identisch zum Vergleichsszenario', () => {
    // Dauerhaft heiss: es wird nie gelüftet, beide Verläufe müssen gleich sein
    const wetter = erzeugeWetterstunden(Array.from({ length: 48 }, () => 32));
    const { stunden } = simuliere(wetter, TEST_GEBAEUDE, TEST_RAUM, einstellungen, celsius(26));

    for (const stunde of stunden) {
      expect(stunde.empfehlung.status).toBe('schliessen');
      expect(stunde.raumtemperaturC).toBeCloseTo(stunde.raumtemperaturOhneLueftungC, 8);
    }
  });

  it('verwendet den übergebenen Startwert für die erste Stunde', () => {
    const wetter = erzeugeTagesgang(1, 24, 6);
    const { stunden, startRaumtemperaturC } = simuliere(wetter, TEST_GEBAEUDE, TEST_RAUM, einstellungen, celsius(27.5));

    expect(startRaumtemperaturC).toBe(27.5);
    expect(stunden[0]?.raumtemperaturC).toBe(27.5);
  });

  it('kommt mit einer leeren Wetterreihe zurecht', () => {
    expect(simuliere([], TEST_GEBAEUDE, TEST_RAUM, einstellungen).stunden).toEqual([]);
  });
});

describe('simuliere – Raumtypen', () => {
  const einstellungen = testEinstellungen({ hystereseK: kelvin(2), minRaumtemperaturC: celsius(20), zielTemperaturC: celsius(24) });
  const schulzimmer = findeRaumtyp('schulzimmer')!;
  const buero = findeRaumtyp('buero')!;
  const wohnung = findeRaumtyp('wohnung')!;

  /** Höchste Raumtemperatur des letzten simulierten Tages. */
  function tagesspitze(raumtyp: typeof wohnung, tage = 4) {
    const wetter = erzeugeTagesgang(tage, 24, 8, MONTAG);
    const { stunden } = simuliere(wetter, TEST_GEBAEUDE, raumtyp, einstellungen, celsius(24));
    return Math.max(...stunden.slice(-24).map((s) => s.raumtemperaturC));
  }

  it('heizt ein Schulzimmer stärker auf als ein Büro und dieses stärker als eine Wohnung', () => {
    expect(tagesspitze(schulzimmer)).toBeGreaterThan(tagesspitze(buero));
    expect(tagesspitze(buero)).toBeGreaterThan(tagesspitze(wohnung));
  });

  it('lässt dieselbe Nutzung im schwereren Gebäude weniger stark aufheizen', () => {
    const wetter = erzeugeTagesgang(4, 24, 8, MONTAG);
    const schwer = { ...TEST_GEBAEUDE, speicherkapazitaetWhProM2K: whProM2K(100) };

    const leichteSpitze = Math.max(
      ...simuliere(wetter, TEST_GEBAEUDE, schulzimmer, einstellungen, celsius(24))
        .stunden.slice(-24)
        .map((s) => s.raumtemperaturC),
    );
    const schwereSpitze = Math.max(
      ...simuliere(wetter, schwer, schulzimmer, einstellungen, celsius(24))
        .stunden.slice(-24)
        .map((s) => s.raumtemperaturC),
    );

    expect(schwereSpitze).toBeLessThan(leichteSpitze);
  });

  it('kühlt ein Schulzimmer am Wochenende ab, weil niemand darin ist', () => {
    // Simulation ab Freitag über das Wochenende hinweg
    const FREITAG = 7; // 7. August 2026
    const wetter = erzeugeTagesgang(4, 24, 8, FREITAG);
    const { stunden } = simuliere(wetter, TEST_GEBAEUDE, schulzimmer, einstellungen, celsius(27));

    const freitagMittag = stunden.find((s) => s.zeit.getDay() === 5 && s.zeit.getHours() === 14)!;
    const sonntagMittag = stunden.find((s) => s.zeit.getDay() === 0 && s.zeit.getHours() === 14)!;

    expect(sonntagMittag.raumtemperaturC).toBeLessThan(freitagMittag.raumtemperaturC);
  });

  it('weist belegte Schulzimmer bei geschlossenen Fenstern auf die Stosslüftung hin', () => {
    // Dauerhitze: die Fenster bleiben zu, die Luftqualität verlangt trotzdem Lüften
    const wetter = erzeugeWetterstunden(Array.from({ length: 48 }, () => 33), 0, 0, MONTAG);
    const { stunden } = simuliere(wetter, TEST_GEBAEUDE, schulzimmer, einstellungen, celsius(26));

    const unterricht = stunden.find((s) => s.zeit.getHours() === 10)!;
    expect(unterricht.empfehlung.status).toBe('schliessen');
    expect(unterricht.empfehlung.zusatzhinweis).toContain('stosslüften');

    const nacht = stunden.find((s) => s.zeit.getHours() === 2)!;
    expect(nacht.empfehlung.zusatzhinweis).toBeUndefined();
  });

  it('hält ein Schulzimmer in den Ferien kühler als im Betrieb', () => {
    // Simulationswoche ab Montag; die Ferien decken sie vollständig ab.
    const wetter = erzeugeTagesgang(4, 24, 8, MONTAG);
    const inFerien = testEinstellungen({
      ...einstellungen,
      ferien: [{ id: 'f1', name: 'Sommerferien', von: '2026-08-03', bis: '2026-08-14' }],
    });

    const betrieb = simuliere(wetter, TEST_GEBAEUDE, schulzimmer, einstellungen, celsius(24));
    const ferien = simuliere(wetter, TEST_GEBAEUDE, schulzimmer, inFerien, celsius(24));

    const spitze = (ergebnis: typeof betrieb) =>
      Math.max(...ergebnis.stunden.slice(-24).map((s) => s.raumtemperaturC));

    expect(spitze(ferien)).toBeLessThan(spitze(betrieb) - 1);
  });

  it('gibt in den Ferien keinen Stosslüftungshinweis mehr', () => {
    const wetter = erzeugeWetterstunden(Array.from({ length: 24 }, () => 33), 0, 0, MONTAG);
    const inFerien = testEinstellungen({
      ...einstellungen,
      ferien: [{ id: 'f1', name: 'Sommerferien', von: '2026-08-03', bis: '2026-08-14' }],
    });
    const { stunden } = simuliere(wetter, TEST_GEBAEUDE, schulzimmer, inFerien, celsius(26));

    for (const stunde of stunden) {
      expect(stunde.empfehlung.zusatzhinweis).toBeUndefined();
    }
  });

  it('lässt die Bundesfeier das Büro leer stehen', () => {
    // Der 1. August 2026 ist ein Samstag – deshalb der 1. August 2027, ein Sonntag …
    // beide sind ohnehin frei. Geprüft wird darum Neujahr 2027, ein Freitag.
    const neujahr = erzeugeWetterstunden(Array.from({ length: 12 }, () => 5), 8, 0, 1).map(
      (stunde) => ({ ...stunde, zeit: new Date(2027, 0, 1, stunde.zeit.getHours()) }),
    );
    const mitFeiertagen = testEinstellungen({ ...einstellungen, feiertageBeachten: true });
    const ohneFeiertage = testEinstellungen({ ...einstellungen, feiertageBeachten: false });

    const frei = simuliere(neujahr, TEST_GEBAEUDE, buero, mitFeiertagen, celsius(22));
    const arbeit = simuliere(neujahr, TEST_GEBAEUDE, buero, ohneFeiertage, celsius(22));

    expect(frei.stunden.at(-1)!.raumtemperaturC).toBeLessThan(
      arbeit.stunden.at(-1)!.raumtemperaturC,
    );
  });

  it('gibt in der Wohnung keinen Stosslüftungshinweis', () => {
    const wetter = erzeugeWetterstunden(Array.from({ length: 24 }, () => 33), 0, 0, MONTAG);
    const { stunden } = simuliere(wetter, TEST_GEBAEUDE, wohnung, einstellungen, celsius(26));

    for (const stunde of stunden) {
      expect(stunde.empfehlung.zusatzhinweis).toBeUndefined();
    }
  });
});

describe('findeIndexFuerJetzt', () => {
  const wetter = erzeugeTagesgang(1, 24, 6);
  const { stunden } = simuliere(wetter, TEST_GEBAEUDE, TEST_RAUM, testEinstellungen());

  it('findet die laufende Stunde', () => {
    const index = findeIndexFuerJetzt(stunden, new Date(2026, 7, 1, 14, 45));
    expect(stunden[index]?.zeit.getHours()).toBe(14);
  });

  it('liefert 0 für Zeitpunkte vor dem Datenbereich', () => {
    expect(findeIndexFuerJetzt(stunden, new Date(2026, 6, 30, 5))).toBe(0);
  });

  it('liefert den letzten Eintrag für Zeitpunkte nach dem Datenbereich', () => {
    expect(findeIndexFuerJetzt(stunden, new Date(2026, 7, 5))).toBe(stunden.length - 1);
  });
});
