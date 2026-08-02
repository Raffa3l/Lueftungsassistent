import { describe, expect, it } from 'vitest';
import {
  amplitudendaempfung,
  findeIndexFuerJetzt,
  naechsteRaumtemperatur,
  phasenverschiebungH,
  schaetzeStartRaumtemperatur,
  simuliere,
  waermeeintragKProH,
  solarlastWProM2,
  waermelastWProM2,
  windfaktor,
  zeitkonstanteOffenH,
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
import { findeRaumtyp, RAUMTYPEN } from '../konfiguration/raumtypen.ts';
import { celsius, kelvin, meterProSekunde, stunden, wattProM2, whProM2K } from '../einheiten.ts';

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

describe('solarlastWProM2 – Ausrichtung und Sonnenschutz', () => {
  // Sonniges Gebäude ohne Dachanteil: der Eintrag hängt allein am Fenster.
  const gebaeude = {
    ...TEST_GEBAEUDE,
    solarerEintragMaxWProM2: wattProM2(80),
    solarAnteilOhneAusrichtung: 0,
  };
  const ZUERICH = { breitengrad: 47.37, laengengrad: 8.54 };

  /** Klarer Augustnachmittag um 17 Uhr – die Sonne steht im Westen. */
  const [nachmittag] = erzeugeWetterstunden([30], 17, 500, MONTAG, {
    direktstrahlungNormalWProM2: wattProM2(750),
    diffusstrahlungWProM2: wattProM2(120),
  });

  const lage = (azimut: number, schutz = 1) => ({
    ...ZUERICH,
    fassadenazimutGrad: azimut,
    sonnenschutzFaktor: schutz,
  });

  it('belastet ein Westfenster am Nachmittag stärker als ein Ostfenster', () => {
    const west = solarlastWProM2(nachmittag!, gebaeude, lage(270));
    const ost = solarlastWProM2(nachmittag!, gebaeude, lage(90));

    expect(west).toBeGreaterThan(ost);
  });

  it('lässt ein Nordfenster am kühlsten', () => {
    const nord = solarlastWProM2(nachmittag!, gebaeude, lage(0));
    const sued = solarlastWProM2(nachmittag!, gebaeude, lage(180));
    const west = solarlastWProM2(nachmittag!, gebaeude, lage(270));

    expect(nord).toBeLessThan(sued);
    expect(nord).toBeLessThan(west);
  });

  it('senkt aussenliegender Sonnenschutz den Eintrag um ein Vielfaches', () => {
    const ohne = solarlastWProM2(nachmittag!, gebaeude, lage(270, 1));
    const innen = solarlastWProM2(nachmittag!, gebaeude, lage(270, 0.7));
    const aussen = solarlastWProM2(nachmittag!, gebaeude, lage(270, 0.25));

    expect(innen).toBeLessThan(ohne);
    expect(aussen).toBeLessThan(innen);
    // Faktor vier zwischen «nichts» und «aussen» – der stärkste Hebel.
    expect(ohne / aussen).toBeCloseTo(4, 0);
  });

  it('lässt den Sonnenschutz den Dachanteil unberührt', () => {
    // Ein Dachgeschoss heizt sich auch mit geschlossenen Storen auf.
    const dach = { ...gebaeude, solarAnteilOhneAusrichtung: 1 };
    const ohne = solarlastWProM2(nachmittag!, dach, lage(270, 1));
    const aussen = solarlastWProM2(nachmittag!, dach, lage(270, 0.25));

    expect(aussen).toBeCloseTo(ohne, 5);
  });

  it('rechnet ohne Lageangabe wie vor der Umstellung', () => {
    // Rückfall auf die waagrechte Globalstrahlung: 500 von 800 W/m².
    expect(solarlastWProM2(nachmittag!, gebaeude)).toBeCloseTo(80 * (500 / 800), 5);
  });

  it('gibt nachts keinen solaren Eintrag', () => {
    const [nacht] = erzeugeWetterstunden([18], 2, 0, MONTAG);
    expect(solarlastWProM2(nacht!, gebaeude, lage(270))).toBeCloseTo(0, 5);
  });
});

describe('windfaktor und zeitkonstanteOffenH', () => {
  it('lässt die konfigurierten Zeitkonstanten beim Referenzwind unverändert', () => {
    expect(windfaktor(meterProSekunde(2))).toBeCloseTo(1, 10);
    expect(zeitkonstanteOffenH(TEST_GEBAEUDE, meterProSekunde(2))).toBeCloseTo(
      TEST_GEBAEUDE.zeitkonstanteOffenH,
      10,
    );
  });

  it('beschleunigt den Luftaustausch mit zunehmendem Wind', () => {
    expect(windfaktor(meterProSekunde(0))).toBeLessThan(1);
    expect(windfaktor(meterProSekunde(6))).toBeGreaterThan(1);
    // Monoton: mehr Wind darf nie weniger Luftwechsel bedeuten.
    expect(windfaktor(meterProSekunde(5))).toBeGreaterThan(windfaktor(meterProSekunde(3)));
  });

  it('verkürzt die Zeitkonstante bei Wind und verlängert sie bei Flaute', () => {
    const beiFlaute = zeitkonstanteOffenH(TEST_GEBAEUDE, meterProSekunde(0));
    const beiWind = zeitkonstanteOffenH(TEST_GEBAEUDE, meterProSekunde(8));

    expect(beiWind).toBeLessThan(TEST_GEBAEUDE.zeitkonstanteOffenH);
    expect(beiFlaute).toBeGreaterThan(TEST_GEBAEUDE.zeitkonstanteOffenH);
  });

  it('begrenzt den Faktor, weil am Fenster weniger ankommt als in 10 m Höhe', () => {
    // Eine Sturmböe darf keine Auskühlung versprechen, die kein Raum zeigt.
    expect(windfaktor(meterProSekunde(30))).toBe(windfaktor(meterProSekunde(15)));
    expect(windfaktor(meterProSekunde(30))).toBeLessThanOrEqual(1.7);
    expect(windfaktor(meterProSekunde(0))).toBeGreaterThanOrEqual(0.55);
  });

  it('kühlt einen Raum bei Wind schneller aus als bei Flaute', () => {
    const [flaute] = erzeugeWetterstunden([18], 3, 0, MONTAG, {
      windgeschwindigkeitMProS: meterProSekunde(0),
    });
    const [brise] = erzeugeWetterstunden([18], 3, 0, MONTAG, {
      windgeschwindigkeitMProS: meterProSekunde(8),
    });

    const beiFlaute = naechsteRaumtemperatur(celsius(28), flaute!, TEST_GEBAEUDE, TEST_RAUM, true);
    const beiBrise = naechsteRaumtemperatur(celsius(28), brise!, TEST_GEBAEUDE, TEST_RAUM, true);

    expect(beiBrise).toBeLessThan(beiFlaute);
  });

  it('lässt geschlossene Fenster vom Wind unberührt', () => {
    // Der Effekt auf die Fassade liegt unter der Genauigkeit des Modells.
    const [flaute] = erzeugeWetterstunden([18], 3, 0, MONTAG, {
      windgeschwindigkeitMProS: meterProSekunde(0),
    });
    const [sturm] = erzeugeWetterstunden([18], 3, 0, MONTAG, {
      windgeschwindigkeitMProS: meterProSekunde(20),
    });

    expect(naechsteRaumtemperatur(celsius(28), sturm!, TEST_GEBAEUDE, TEST_RAUM, false)).toBe(
      naechsteRaumtemperatur(celsius(28), flaute!, TEST_GEBAEUDE, TEST_RAUM, false),
    );
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
    expect(unterricht.empfehlung.zusatzhinweise[0]?.kuerzel).toBe('stosslüften');

    const nacht = stunden.find((s) => s.zeit.getHours() === 2)!;
    expect(nacht.empfehlung.zusatzhinweise).toEqual([]);
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
      expect(stunde.empfehlung.zusatzhinweise).toEqual([]);
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
      // Der Kühlungshinweis darf erscheinen – die Wohnung braucht bloss keine
      // Stosslüftung wegen der Luftqualität.
      expect(stunde.empfehlung.zusatzhinweise.map((h) => h.art)).not.toContain('luftqualitaet');
    }
  });
});

/**
 * Grundeigenschaft der Lüftungsstrategie: Länger lüften ist nie schlechter.
 *
 * Analytisch folgt das direkt aus dem Modell. Öffnen lohnt, wenn
 *
 *   (T_aussen − T_innen) / τ_offen + q  <  (T_aussen − T_innen) / τ_zu + q
 *
 * also wenn (T_aussen − T_innen) · (1/τ_offen − 1/τ_zu) < 0. Weil τ_offen immer
 * kleiner ist als τ_zu, ist der zweite Faktor positiv – die Wärmelast q kürzt
 * sich vollständig heraus. Übrig bleibt genau die Bedingung T_aussen < T_innen,
 * auf der die Lüftungslogik beruht.
 *
 * Diese Tests sichern die Eigenschaft ab: Wer an der Lüftungslogik oder an den
 * Zeitkonstanten schraubt, darf sie nicht unbemerkt verlieren.
 */
describe('Lüftungsstrategie – länger lüften ist nie schlechter', () => {
  it('kühlt bei kühlerer Aussenluft in jeder Gebäude- und Raumkombination besser', () => {
    // Voller Mittag mit Sonne: die Lasten wirken so stark wie überhaupt möglich.
    const [mittag] = erzeugeWetterstunden([24], 12, 800, MONTAG);
    const startC = celsius(25); // nur 1 Grad wärmer als draussen

    for (const gebaeude of GEBAEUDETYPEN) {
      for (const raum of RAUMTYPEN) {
        const offen = naechsteRaumtemperatur(startC, mittag!, gebaeude, raum, true);
        const zu = naechsteRaumtemperatur(startC, mittag!, gebaeude, raum, false);

        // Beide dürfen steigen – entscheidend ist, dass offen langsamer steigt.
        expect(offen).toBeLessThan(zu);
      }
    }
  });

  it('gilt auch bei extremer Wärmelast, wenn der Raum dabei wärmer wird', () => {
    // Schulklasse im Dachgeschoss bei voller Sonne, draussen nur 1 Grad kühler.
    const dachgeschoss = GEBAEUDETYPEN.find((typ) => typ.id === 'dachwohnung')!;
    const schulzimmer = findeRaumtyp('schulzimmer')!;
    const [mittag] = erzeugeWetterstunden([24], 11, 800, MONTAG);

    const offen = naechsteRaumtemperatur(celsius(25), mittag!, dachgeschoss, schulzimmer, true);
    const zu = naechsteRaumtemperatur(celsius(25), mittag!, dachgeschoss, schulzimmer, false);

    // Der Raum heizt sich in beiden Fällen auf – Lüften bremst es nur.
    expect(offen).toBeGreaterThan(25);
    expect(offen).toBeLessThan(zu);
  });

  it('macht eine tiefere Untergrenze über mehrere Tage nie wärmer', () => {
    // Die Untergrenze ist der Punkt, an dem die App das Auskühlen abbricht.
    const wetter = erzeugeTagesgang(6, 24, 8, MONTAG);
    const schulzimmer = findeRaumtyp('schulzimmer')!;

    const spitze = (untergrenzeC: number): number => {
      const { stunden } = simuliere(
        wetter,
        TEST_GEBAEUDE,
        schulzimmer,
        testEinstellungen({ minRaumtemperaturC: celsius(untergrenzeC) }),
        celsius(26),
      );
      return Math.max(...stunden.slice(-24).map((stunde) => stunde.raumtemperaturC));
    };

    // Monoton: je früher geschlossen wird, desto wärmer der letzte Tag.
    const grenzen = [20, 22, 24, 26.5];
    const spitzen = grenzen.map(spitze);

    for (let i = 1; i < spitzen.length; i++) {
      expect(spitzen[i]!).toBeGreaterThanOrEqual(spitzen[i - 1]!);
    }
    // Der Unterschied ist keine Rundungsgrösse, sondern spürbar.
    expect(spitzen.at(-1)!).toBeGreaterThan(spitzen[0]! + 0.5);
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
