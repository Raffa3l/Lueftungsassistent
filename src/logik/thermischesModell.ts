import type {
  Einstellungen,
  Fensterstatus,
  Gebaeudetyp,
  Raumtyp,
  SimulationsStunde,
  Wetterstunde,
} from '../typen.ts';
import {
  anstiegUeber,
  anteil,
  celsius,
  rateAusLast,
  skaliereKelvin,
  skaliereLast,
  stunden,
  summeLast,
  temperaturDifferenz,
  temperaturPlus,
  type Celsius,
  type KelvinProStunde,
  type MeterProSekunde,
  type Stunden,
  type WattProM2,
} from '../einheiten.ts';
import {
  NACHT_BEGINN_STUNDE,
  NACHT_ENDE_STUNDE,
  REFERENZ_FASSADENSTRAHLUNG_W_PRO_M2,
  REFERENZ_GLOBALSTRAHLUNG_W_PRO_M2,
} from '../konfiguration/standardwerte.ts';
import { istBelegt, type Kalender } from '../konfiguration/raumtypen.ts';
import { bewerteStunde } from './lueftungslogik.ts';
import { formatiereTemperatur } from './format.ts';
import { fassadenstrahlungWProM2, sonnenstand } from './sonnenstand.ts';

/**
 * Vereinfachtes thermisches Gebäudemodell (Ein-Knoten-RC-Modell).
 *
 * Grundgleichung:  dT/dt = (T_aussen − T_innen) / τ + q
 *
 *   τ  thermische Zeitkonstante in Stunden (Wärmeträgheit inkl. Speichermasse);
 *      hängt davon ab, ob die Fenster offen sind, und bei offenen Fenstern
 *      zusätzlich vom Wind, der den Luftwechsel treibt (siehe `windfaktor`)
 *   q  Wärmeeinträge in K/h: Sonne durch die Fenster und Nutzung (Personen,
 *      Geräte, Licht). Die Lasten werden in W/m² gepflegt und über die
 *      Speicherkapazität des Gebäudes in K/h umgerechnet.
 *
 * Pro Stunde wird die Gleichung analytisch gelöst statt numerisch genähert,
 * das ist exakt für konstante Randbedingungen und auch bei kleinem τ stabil:
 *
 *   T(t+Δt) = T_∞ + (T(t) − T_∞) · e^(−Δt/τ)   mit   T_∞ = T_aussen + q·τ
 *
 * Dämpfung und Phasenverschiebung der Tageswelle sind keine eigenen Parameter,
 * sondern ergeben sich aus τ (siehe `amplitudendaempfung` / `phasenverschiebungH`).
 */

/** Ergebnis eines Simulationslaufs. */
export interface Simulationsergebnis {
  stunden: SimulationsStunde[];
  startRaumtemperaturC: Celsius;
}

/**
 * Wo der Raum liegt und wie er verschattet ist, alles, was den solaren Eintrag
 * über die Bausubstanz hinaus bestimmt.
 *
 * Wird die Lage weggelassen, rechnet das Modell wie vor der Einführung der
 * Ausrichtung mit der waagrechten Globalstrahlung und ohne Behang. Neue
 * Aufrufer im Produktivcode müssen sie übergeben, sonst fehlt der stärkste
 * Hebel gegen die Überhitzung.
 */
export interface Solarlage {
  breitengrad: number;
  laengengrad: number;
  /** Azimut der Hauptfensterfläche: 0 = Nord, 90 = Ost, 180 = Süd, 270 = West. */
  fassadenazimutGrad: number;
  /** Anteil des Eintrags, der trotz Sonnenschutz hereinkommt (1 = kein Schutz). */
  sonnenschutzFaktor: number;
}

/**
 * Solarer Wärmeeintrag in Watt pro Quadratmeter Bodenfläche.
 *
 * Zwei Anteile, weil nicht alles am Fenster hängt:
 *   - über die Fassade: Einstrahlung in der Fensterebene, durch den
 *     Sonnenschutz abgemindert
 *   - unabhängig von der Ausrichtung: vor allem das Dach, gerechnet gegen die
 *     waagrechte Globalstrahlung und vom Behang unberührt
 */
export function solarlastWProM2(
  wetter: Wetterstunde,
  gebaeude: Gebaeudetyp,
  lage?: Solarlage,
): WattProM2 {
  const waagrecht = Math.min(
    1,
    Math.max(0, anteil(wetter.globalstrahlungWProM2, REFERENZ_GLOBALSTRAHLUNG_W_PRO_M2)),
  );

  // Ohne Lageangabe bleibt es beim waagrechten Bezug und ohne Behang.
  if (!lage) return skaliereLast(gebaeude.solarerEintragMaxWProM2, waagrecht);

  const stand = sonnenstand(wetter.zeit, lage.breitengrad, lage.laengengrad);
  const aufFassade = fassadenstrahlungWProM2(
    stand,
    {
      direktNormalWProM2: wetter.direktstrahlungNormalWProM2,
      diffusWProM2: wetter.diffusstrahlungWProM2,
      globalWProM2: wetter.globalstrahlungWProM2,
    },
    lage.fassadenazimutGrad,
  );

  const fassadenanteil = Math.min(
    1,
    Math.max(0, anteil(aufFassade, REFERENZ_FASSADENSTRAHLUNG_W_PRO_M2)),
  );

  const ohneAusrichtung = gebaeude.solarAnteilOhneAusrichtung;
  const ueberFenster =
    (1 - ohneAusrichtung) * fassadenanteil * lage.sonnenschutzFaktor;
  const ueberDach = ohneAusrichtung * waagrecht;

  return skaliereLast(gebaeude.solarerEintragMaxWProM2, ueberFenster + ueberDach);
}

/**
 * Wärmelast einer Stunde in Watt pro Quadratmeter Bodenfläche,
 * Sonne durch die Fenster plus Nutzung (Personen, Geräte, Licht).
 */
export function waermelastWProM2(
  wetter: Wetterstunde,
  gebaeude: Gebaeudetyp,
  raumtyp: Raumtyp,
  kalender?: Kalender,
  lage?: Solarlage,
): WattProM2 {
  const solar = solarlastWProM2(wetter, gebaeude, lage);

  const nutzung = istBelegt(wetter.zeit, raumtyp, kalender)
    ? raumtyp.belegungslastWProM2
    : raumtyp.grundlastWProM2;

  return summeLast(solar, nutzung);
}

/**
 * Wärmeeinträge einer Stunde in Kelvin pro Stunde.
 *
 * Die Speicherkapazität des Gebäudes übersetzt die Last: Dieselbe Schulklasse
 * treibt die Temperatur im Leichtbau dreimal so schnell hoch wie im Altbau.
 */
export function waermeeintragKProH(
  wetter: Wetterstunde,
  gebaeude: Gebaeudetyp,
  raumtyp: Raumtyp,
  kalender?: Kalender,
  lage?: Solarlage,
): KelvinProStunde {
  return rateAusLast(
    waermelastWProM2(wetter, gebaeude, raumtyp, kalender, lage),
    gebaeude.speicherkapazitaetWhProM2K,
  );
}

/**
 * Windgeschwindigkeit, bei der die konfigurierten Zeitkonstanten gelten,
 * ungefähr das Schweizer Mittel in 10 m Messhöhe.
 */
const REFERENZ_WIND_M_PRO_S = 2;

/**
 * Formparameter der Windkurve: Bei dieser Geschwindigkeit verdoppelt sich der
 * Luftwechsel gegenüber Windstille.
 */
const WIND_SKALA_M_PRO_S = 3;

/**
 * Grenzen des Windfaktors. Gemessen wird in 10 m Höhe, angeströmt wird das
 * Fenster, im bebauten Gebiet kommen dort typisch nur 30 bis 60 Prozent davon
 * an. Ohne Begrenzung würde eine Sturmböe eine Auskühlung versprechen, die kein
 * Raum je zeigt.
 */
const WINDFAKTOR_MIN = 0.55;
const WINDFAKTOR_MAX = 1.7;

/**
 * Wie stark der Wind den Luftwechsel bei offenem Fenster gegenüber dem
 * Referenzwind verändert.
 *
 * Der Volumenstrom setzt sich aus einem Auftriebsanteil (Temperaturdifferenz)
 * und einem Windanteil zusammen, der etwa linear mit der Geschwindigkeit
 * wächst. Zwischen Windstille und steifer Brise liegt damit rund Faktor drei,
 * der Grund, warum dieselbe Nacht einmal auskühlt und einmal nicht.
 */
export function windfaktor(windMProS: MeterProSekunde): number {
  const roh =
    (1 + windMProS / WIND_SKALA_M_PRO_S) / (1 + REFERENZ_WIND_M_PRO_S / WIND_SKALA_M_PRO_S);
  return Math.min(WINDFAKTOR_MAX, Math.max(WINDFAKTOR_MIN, roh));
}

/**
 * Zeitkonstante bei offenem Fenster unter Berücksichtigung des Windes.
 * Mehr Luftwechsel bedeutet eine kleinere Zeitkonstante, der Raum folgt der
 * Aussentemperatur schneller.
 */
export function zeitkonstanteOffenH(
  gebaeude: Gebaeudetyp,
  windMProS: MeterProSekunde,
): Stunden {
  return stunden(gebaeude.zeitkonstanteOffenH / windfaktor(windMProS));
}

/**
 * Rechnet die Raumtemperatur um einen Zeitschritt weiter.
 *
 * @param schrittH Schrittweite in Stunden (Standard: 1)
 */
export function naechsteRaumtemperatur(
  raumtemperaturC: Celsius,
  wetter: Wetterstunde,
  gebaeude: Gebaeudetyp,
  raumtyp: Raumtyp,
  fensterOffen: boolean,
  kalender?: Kalender,
  schrittH: Stunden = stunden(1),
  lage?: Solarlage,
): Celsius {
  const zeitkonstanteH = fensterOffen
    ? zeitkonstanteOffenH(gebaeude, wetter.windgeschwindigkeitMProS)
    : gebaeude.zeitkonstanteGeschlossenH;

  // Beharrungstemperatur T_∞ = T_aussen + q·τ
  const beharrungstemperaturC = temperaturPlus(
    wetter.aussentemperaturC,
    anstiegUeber(waermeeintragKProH(wetter, gebaeude, raumtyp, kalender, lage), zeitkonstanteH),
  );

  // T(t+Δt) = T_∞ + (T(t) − T_∞) · e^(−Δt/τ)
  const abstandK = temperaturDifferenz(raumtemperaturC, beharrungstemperaturC);
  return temperaturPlus(
    beharrungstemperaturC,
    skaliereKelvin(abstandK, Math.exp(-schrittH / zeitkonstanteH)),
  );
}

/**
 * Schätzt die Raumtemperatur zu Beginn des Simulationszeitraums.
 *
 * Die Jahreszeit steckt implizit im Mittel der ersten 24 Aussentemperaturen;
 * der Gebäudetyp bestimmt, wie stark die Schätzung stattdessen an seiner
 * typischen Sommer-Basistemperatur hängt (träge Gebäude: stärker).
 * Der Vorlauf der Simulation gleicht Fehler dieser Schätzung ohnehin weitgehend aus.
 */
export function schaetzeStartRaumtemperatur(
  wetter: readonly Wetterstunde[],
  gebaeude: Gebaeudetyp,
): Celsius {
  const ersterTag = wetter.slice(0, 24);
  if (ersterTag.length === 0) return gebaeude.sommerBasistemperaturC;

  const mittleresAussenC =
    ersterTag.reduce((summe, stunde) => summe + stunde.aussentemperaturC, 0) / ersterTag.length;

  // Träge Gebäude (grosses τ) hängen stärker an ihrer Basistemperatur.
  const traegheitsgewicht = Math.min(0.8, gebaeude.zeitkonstanteGeschlossenH / 40);
  const geschaetztC =
    traegheitsgewicht * gebaeude.sommerBasistemperaturC +
    (1 - traegheitsgewicht) * (mittleresAussenC + 2);

  return celsius(Math.min(32, Math.max(16, geschaetztC)));
}

/**
 * Simuliert den Raumtemperaturverlauf über den gesamten Wetterzeitraum und
 * bewertet jede Stunde.
 *
 * Es werden zwei Verläufe gerechnet:
 *  - `raumtemperaturC`: Bewohnerinnen und Bewohner folgen der Empfehlung
 *  - `raumtemperaturOhneLueftungC`: Vergleichsszenario mit immer geschlossenen Fenstern
 */
export function simuliere(
  wetter: readonly Wetterstunde[],
  gebaeude: Gebaeudetyp,
  raumtyp: Raumtyp,
  einstellungen: Einstellungen,
  startRaumtemperaturC = schaetzeStartRaumtemperatur(wetter, gebaeude),
  lage?: Solarlage,
): Simulationsergebnis {
  const stunden: SimulationsStunde[] = [];
  let raumC = startRaumtemperaturC;
  let raumOhneLueftungC = startRaumtemperaturC;
  let vorherigerStatus: Fensterstatus = 'schliessen';
  const kalender: Kalender = {
    ferien: einstellungen.ferien,
    feiertageBeachten: einstellungen.feiertageBeachten,
  };

  for (const [index, stunde] of wetter.entries()) {
    let empfehlung = bewerteStunde({
      aussentemperaturC: stunde.aussentemperaturC,
      raumtemperaturC: raumC,
      stundeDesTages: stunde.zeit.getHours(),
      einstellungen,
      vorherigerStatus,
      raumBelegt: istBelegt(stunde.zeit, raumtyp, kalender),
      stosslueftungNoetig: raumtyp.stosslueftungNoetig,
      taupunktAussenC: stunde.taupunktC,
      windgeschwindigkeitMProS: stunde.windgeschwindigkeitMProS,
      windboeeMProS: stunde.windboeeMProS,
      niederschlagMmProH: stunde.niederschlagMmProH,
      schneefallCm: stunde.schneefallCm,
      wettercode: stunde.wettercode,
    });

    // Vorausschau: Wer jetzt öffnet und danach nicht mehr eingreifen kann, hat
    // die Entscheidung für die ganze Phase getroffen. Führt sie unter die
    // Untergrenze, wird gar nicht erst geöffnet, ein Wechsel um vier Uhr
    // morgens wäre keine Handlungsanweisung, sondern nur eine Zahl.
    if (empfehlung.status === 'oeffnen') {
      const tiefste = tiefsteTemperaturOhneEingriff(
        { wetter, index, raumtemperaturC: raumC },
        gebaeude,
        raumtyp,
        kalender,
        lage,
      );
      if (tiefste !== undefined && tiefste < einstellungen.minRaumtemperaturC) {
        empfehlung = {
          status: 'schliessen',
          dringlichkeit: 'normal',
          titel: 'Fenster schliessen',
          begruendung:
            `Durchgehend offen würde der Raum bis auf ${formatiereTemperatur(tiefste)} ` +
            'auskühlen, unter Ihre Untergrenze, und nachts kann niemand nachjustieren. ' +
            'Wer kippen statt öffnen kann, lüftet trotzdem.',
          zusatzhinweise: empfehlung.zusatzhinweise,
        };
      }
    }

    stunden.push({
      ...stunde,
      raumtemperaturC: raumC,
      raumtemperaturOhneLueftungC: raumOhneLueftungC,
      empfehlung,
    });

    // Zustand auf die nächste Stunde fortschreiben.
    const fensterOffen = empfehlung.status === 'oeffnen';
    raumC = naechsteRaumtemperatur(
      raumC,
      stunde,
      gebaeude,
      raumtyp,
      fensterOffen,
      kalender,
      undefined,
      lage,
    );
    raumOhneLueftungC = naechsteRaumtemperatur(
      raumOhneLueftungC,
      stunde,
      gebaeude,
      raumtyp,
      false,
      kalender,
      undefined,
      lage,
    );
    vorherigerStatus = empfehlung.status;
  }

  return { stunden, startRaumtemperaturC };
}

/**
 * Wie tief fällt der Raum, wenn ab jetzt niemand mehr eingreift?
 *
 * Gerechnet wird mit durchgehend offenen Fenstern bis zu der Stunde, in der
 * wieder jemand da wäre, also bis zum Ende der Nacht oder bis zum Beginn der
 * Nutzungszeit, je nachdem, was zuerst kommt. Ist gleich in der Ausgangsstunde
 * jemand anwesend, gibt die Funktion `undefined` zurück: Dann kann rechtzeitig
 * geschlossen werden, und die gewöhnliche Regel an der Untergrenze genügt.
 *
 * Die Probe hängt nicht an der Simulation selbst, sie rechnet auf einer Kopie
 * des Zustands und lässt den laufenden Durchgang unberührt.
 */
function tiefsteTemperaturOhneEingriff(
  start: { wetter: readonly Wetterstunde[]; index: number; raumtemperaturC: Celsius },
  gebaeude: Gebaeudetyp,
  raumtyp: Raumtyp,
  kalender: Kalender,
  lage?: Solarlage,
): Celsius | undefined {
  const { wetter, index } = start;
  const erste = wetter[index];
  if (!erste || kannEingreifen(erste.zeit, raumtyp, kalender)) return undefined;

  let raumC = start.raumtemperaturC;
  let tiefste = raumC;

  for (let i = index; i < wetter.length; i++) {
    const stunde = wetter[i]!;
    // Sobald wieder jemand da ist, endet die Phase ohne Eingriffsmöglichkeit.
    if (i > index && kannEingreifen(stunde.zeit, raumtyp, kalender)) break;

    raumC = naechsteRaumtemperatur(raumC, stunde, gebaeude, raumtyp, true, kalender, undefined, lage);
    tiefste = celsius(Math.min(tiefste, raumC));
  }

  return tiefste;
}

/**
 * Ist zu dieser Stunde jemand da, der ein Fenster bedienen könnte?
 *
 * Nachts nicht, auch nicht in der Wohnung, wo zwar jemand liegt, aber schläft.
 * Tagsüber entscheidet die Belegung des Raumtyps.
 */
function kannEingreifen(zeit: Date, raumtyp: Raumtyp, kalender: Kalender): boolean {
  const stunde = zeit.getHours();
  const nacht = stunde >= NACHT_BEGINN_STUNDE || stunde < NACHT_ENDE_STUNDE;
  return !nacht && istBelegt(zeit, raumtyp, kalender);
}

/**
 * Amplitudendämpfung der Tagesschwankung (0–1): Wie viel der Aussenschwankung
 * kommt drinnen an? Analytische Antwort des RC-Glieds auf eine Sinuswelle.
 */
export function amplitudendaempfung(zeitkonstanteH: number, periodeH = 24): number {
  const kreisfrequenz = (2 * Math.PI) / periodeH;
  return 1 / Math.sqrt(1 + (kreisfrequenz * zeitkonstanteH) ** 2);
}

/** Phasenverschiebung in Stunden: Wie viel später kommt das Maximum drinnen an? */
export function phasenverschiebungH(zeitkonstanteH: number, periodeH = 24): number {
  const kreisfrequenz = (2 * Math.PI) / periodeH;
  return Math.atan(kreisfrequenz * zeitkonstanteH) / kreisfrequenz;
}

/**
 * Index der Stunde, die «jetzt» enthält (letzter Eintrag mit zeit <= jetzt).
 * Fällt `jetzt` vor den Datenbereich, wird 0 geliefert.
 */
export function findeIndexFuerJetzt(stunden: readonly SimulationsStunde[], jetzt: Date): number {
  let index = 0;
  for (let i = 0; i < stunden.length; i++) {
    const stunde = stunden[i];
    if (stunde && stunde.zeit.getTime() <= jetzt.getTime()) index = i;
    else break;
  }
  return index;
}
