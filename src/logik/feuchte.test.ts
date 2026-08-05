import { describe, expect, it } from 'vitest';
import {
  absoluteFeuchteGProKg,
  drohtKondensation,
  istSchwuel,
  relativeFeuchteProzent,
  saettigungsdampfdruckHPa,
  taupunktAusFeuchte,
} from './feuchte.ts';
import { celsius } from '../einheiten.ts';

describe('saettigungsdampfdruckHPa', () => {
  it('trifft die bekannten Stützstellen', () => {
    // Tabellenwerte über Wasser: 6.11 hPa bei 0 °C, 23.39 bei 20 °C, 42.47 bei 30 °C.
    // Die Magnus-Näherung weicht davon um wenige Zehntelprozent ab, für die
    // Lüftungsbewertung um Grössenordnungen genauer als die Wetterprognose.
    expect(saettigungsdampfdruckHPa(celsius(0))).toBeCloseTo(6.11, 1);
    expect(saettigungsdampfdruckHPa(celsius(20))).toBeCloseTo(23.39, 0);
    expect(saettigungsdampfdruckHPa(celsius(30))).toBeCloseTo(42.47, 0);
  });

  it('wächst mit der Temperatur', () => {
    expect(saettigungsdampfdruckHPa(celsius(25))).toBeGreaterThan(
      saettigungsdampfdruckHPa(celsius(24)),
    );
  });
});

describe('taupunktAusFeuchte', () => {
  it('liefert bei Sättigung die Lufttemperatur', () => {
    expect(taupunktAusFeuchte(celsius(18), 100)).toBeCloseTo(18, 1);
  });

  it('liegt unter der Lufttemperatur, je trockener desto tiefer', () => {
    const feucht = taupunktAusFeuchte(celsius(25), 80);
    const trocken = taupunktAusFeuchte(celsius(25), 40);

    expect(feucht).toBeLessThan(25);
    expect(trocken).toBeLessThan(feucht);
    // Nachschlagewerte: 25 °C bei 80 % ergeben rund 21.3 °C Taupunkt.
    expect(feucht).toBeCloseTo(21.3, 0);
  });

  it('bleibt auch bei 0 % Feuchte eine endliche Zahl', () => {
    // Ein fehlender Messwert darf keine Rechnung sprengen.
    expect(Number.isFinite(taupunktAusFeuchte(celsius(20), 0))).toBe(true);
  });
});

describe('absoluteFeuchteGProKg', () => {
  it('rechnet die Beispiele aus dem Modulkommentar nach', () => {
    // drinnen 26 °C / 60 % rF → Taupunkt 17.6 °C → 12.6 g/kg
    const drinnen = absoluteFeuchteGProKg(taupunktAusFeuchte(celsius(26), 60));
    // draussen 16 °C / 95 % rF → Taupunkt 15.2 °C → 10.8 g/kg
    const draussen = absoluteFeuchteGProKg(taupunktAusFeuchte(celsius(16), 95));

    expect(drinnen).toBeCloseTo(12.6, 0);
    expect(draussen).toBeCloseTo(10.8, 0);
  });

  it('zeigt, dass kühle «nasse» Nachtluft trockener ist als warme Raumluft', () => {
    // Der Kern der Feuchtelogik: 95 % draussen sind weniger Wasser als 60 % drinnen.
    const drinnen = absoluteFeuchteGProKg(taupunktAusFeuchte(celsius(26), 60));
    const draussen = absoluteFeuchteGProKg(taupunktAusFeuchte(celsius(16), 95));

    expect(draussen).toBeLessThan(drinnen);
  });
});

describe('relativeFeuchteProzent', () => {
  it('kehrt den Taupunkt zurück in die relative Feuchte um', () => {
    const taupunkt = taupunktAusFeuchte(celsius(25), 65);
    expect(relativeFeuchteProzent(celsius(25), taupunkt)).toBeCloseTo(65, 0);
  });

  it('sinkt, wenn dieselbe Luft erwärmt wird', () => {
    // Nachtluft von 16 °C bei 95 % rF wird im Raum auf 26 °C erwärmt.
    const taupunkt = taupunktAusFeuchte(celsius(16), 95);
    expect(relativeFeuchteProzent(celsius(26), taupunkt)).toBeCloseTo(51, 0);
  });

  it('überschreitet 100 % nicht', () => {
    expect(relativeFeuchteProzent(celsius(10), celsius(20))).toBe(100);
  });
});

describe('istSchwuel', () => {
  it('zieht die Grenze beim Taupunkt von 16 Grad', () => {
    expect(istSchwuel(celsius(15.9))).toBe(false);
    expect(istSchwuel(celsius(16))).toBe(true);
    expect(istSchwuel(celsius(20))).toBe(true);
  });
});

describe('drohtKondensation', () => {
  it('warnt, wenn schwüle Aussenluft auf einen ausgekühlten Raum trifft', () => {
    // Klassischer Kellerlüftungsfehler: draussen 24 °C / 80 % → Taupunkt 20.3 °C.
    const taupunkt = taupunktAusFeuchte(celsius(24), 80);
    expect(drohtKondensation(taupunkt, celsius(21))).toBe(true);
  });

  it('schweigt bei trockener Aussenluft', () => {
    expect(drohtKondensation(celsius(8), celsius(21))).toBe(false);
  });

  it('warnt schon knapp unterhalb der Raumtemperatur', () => {
    // Wände und Böden sind kühler als die Raumluft, daher der Sicherheitsabstand.
    expect(drohtKondensation(celsius(20.5), celsius(21))).toBe(true);
    expect(drohtKondensation(celsius(19.5), celsius(21))).toBe(false);
  });
});
