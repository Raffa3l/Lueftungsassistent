import type {
  Dringlichkeit,
  Einstellungen,
  Empfehlung,
  Fensterstatus,
  Hinweis,
  Hinweisart,
  SimulationsStunde,
} from '../typen.ts';
import {
  celsius,
  temperaturDifferenz,
  type Celsius,
  type Kelvin,
  type MeterProSekunde,
  type MillimeterProStunde,
} from '../einheiten.ts';
import { NACHT_BEGINN_STUNDE, NACHT_ENDE_STUNDE } from '../konfiguration/standardwerte.ts';
import { drohtKondensation, istSchwuel, relativeFeuchteProzent } from './feuchte.ts';
import { formatiereDifferenz, formatiereTemperatur } from './format.ts';

/** Eingangsgrössen für die Bewertung einer einzelnen Stunde. */
export interface BewertungsEingabe {
  aussentemperaturC: Celsius;
  raumtemperaturC: Celsius;
  /** Stunde des Tages (0–23) in lokaler Zeit. */
  stundeDesTages: number;
  einstellungen: Einstellungen;
  /**
   * Fensterstatus der Vorstunde. Erzeugt die Hysterese: ein offenes Fenster
   * bleibt offen, bis die Aussenluft die Raumtemperatur erreicht – geschlossen
   * wird erst wieder geöffnet, wenn es draussen um die Hysterese kühler ist.
   */
  vorherigerStatus: Fensterstatus;
  /** Ist der Raum in dieser Stunde genutzt? */
  raumBelegt?: boolean;
  /** Verlangt die Nutzung regelmässiges Stosslüften (Luftqualität)? */
  stosslueftungNoetig?: boolean;
  /**
   * Taupunkt der Aussenluft. Ohne Angabe entfallen die Feuchtehinweise – der
   * Lüftungsentscheid selbst bleibt davon unberührt.
   */
  taupunktAussenC?: Celsius;
  /** Windgeschwindigkeit draussen. Ohne Angabe entfällt der Querlüftungshinweis. */
  windgeschwindigkeitMProS?: MeterProSekunde;
  /** Höchste Böe. Ohne Angabe entfällt die Sturmwarnung. */
  windboeeMProS?: MeterProSekunde;
  /** Niederschlag der Stunde. Ohne Angabe entfällt die Regenwarnung. */
  niederschlagMmProH?: MillimeterProStunde;
  /** Neuschnee der Stunde in Zentimetern. */
  schneefallCm?: number;
  /** Wetterlage als WMO-Code; 95 bis 99 stehen für Gewitter. */
  wettercode?: number;
}

/** Ist die Stunde Teil des Nachtfensters (22:00–06:59)? */
export function istNachtstunde(stundeDesTages: number): boolean {
  return stundeDesTages >= NACHT_BEGINN_STUNDE || stundeDesTages < NACHT_ENDE_STUNDE;
}

/**
 * Kernregel des Assistenten – entscheidet für eine Stunde, ob die Fenster
 * offen oder geschlossen sein sollten.
 *
 * Reihenfolge der Regeln (die erste zutreffende gewinnt):
 *  1. Untergrenze erreicht  → schliessen (kein Auskühlen unter Wohlfühlniveau)
 *  2. Nacht und Nachtauskühlung abgeschaltet → schliessen
 *  3. Aussenluft kühler als Raumluft (mit Hysterese) → öffnen
 *  4. sonst → schliessen (draussen gleich warm oder wärmer)
 *
 * Der Entscheid selbst hängt allein an der Temperatur. Feuchte und Wind
 * erzeugen nur Zusatzhinweise und kehren die Empfehlung nie um – kühlere
 * Aussenluft kühlt auch dann, wenn sie feucht ist, und Stosslüften bleibt eine
 * kurze Ausnahme statt eines Dauerzustands.
 */
export function bewerteStunde(eingabe: BewertungsEingabe): Empfehlung {
  const { aussentemperaturC, raumtemperaturC, stundeDesTages, einstellungen, vorherigerStatus } = eingabe;
  // positiv = draussen kühler
  const differenzK = temperaturDifferenz(raumtemperaturC, aussentemperaturC);
  const nacht = istNachtstunde(stundeDesTages);

  // Hinweise werden getrennt nach Fensterzustand gesammelt: Sie hängen nicht
  // davon ab, welche der Regeln unten am Ende greift.
  const hinweiseZu = hinweiseBeiGeschlossenenFenstern(eingabe);
  const hinweiseOffen = hinweiseBeiOffenenFenstern(eingabe);

  // 1. Weiteres Auskühlen wäre unangenehm.
  if (raumtemperaturC <= einstellungen.minRaumtemperaturC) {
    return geschlossen(
      `Innen sind es ${formatiereTemperatur(raumtemperaturC)} – das ist bereits an der eingestellten Untergrenze. Weiter auskühlen lohnt sich nicht.`,
      'normal',
      hinweiseZu,
    );
  }

  // 2. Nachtauskühlung wurde vom Nutzer abgeschaltet (z. B. Lärm, Insekten, Sicherheit).
  if (nacht && !einstellungen.nachtauskuehlung) {
    return geschlossen(
      'Die Nachtauskühlung ist in den Einstellungen deaktiviert – nachts bleiben die Fenster zu.',
      'normal',
      hinweiseZu,
    );
  }

  // 3. Hysterese: offen bleibt offen, bis der Vorteil aufgebraucht ist.
  const schwelleOeffnenK = vorherigerStatus === 'oeffnen' ? 0 : einstellungen.hystereseK;
  if (differenzK > schwelleOeffnenK) {
    return {
      status: 'oeffnen',
      dringlichkeit: dringlichkeitOeffnen(raumtemperaturC, differenzK, einstellungen, nacht),
      titel: 'Fenster öffnen',
      begruendung: begruendungOeffnen(raumtemperaturC, differenzK, einstellungen, nacht),
      zusatzhinweise: ordneHinweise(hinweiseOffen),
    };
  }

  // 4. Draussen ist es gleich warm oder wärmer – Wärme draussen halten.
  return geschlossen(
    begruendungSchliessen(differenzK),
    differenzK < -1 ? 'hoch' : 'normal',
    hinweiseZu,
  );
}

/** Baut eine «schliessen»-Empfehlung mit den zutreffenden Hinweisen. */
function geschlossen(
  begruendung: string,
  dringlichkeit: Dringlichkeit,
  hinweise: readonly Hinweis[],
): Empfehlung {
  return {
    status: 'schliessen',
    dringlichkeit,
    titel: 'Fenster schliessen',
    begruendung,
    zusatzhinweise: ordneHinweise(hinweise),
  };
}

/**
 * Rangfolge der Hinweisarten: Zuerst, was Schaden abwendet, dann was die
 * Gesundheit betrifft, danach die Bauphysik, zuletzt das Komfortliche.
 *
 * Die Reihenfolge ist eine fachliche Festlegung und gehört deshalb hierhin und
 * nicht in die Oberfläche – die entscheidet nur noch, wie viele Hinweise sie
 * davon zeigt. Weil sie nur die ersten beiden zeigt (`ui/dashboard.ts`), ist
 * der erste Platz nicht kosmetisch: Was hier nach hinten rutscht, verschwindet
 * dort ganz.
 *
 * Als `Record` über alle Hinweisarten geführt, nicht als Liste: So ist eine
 * fehlende Art ein Übersetzungsfehler. Als Liste rutschte eine vergessene Art
 * über `indexOf` mit −1 stillschweigend an den Anfang – richtig für den
 * Wetterschutz, aber aus dem falschen Grund und beim nächsten «Aufräumen»
 * wieder verloren.
 */
const HINWEIS_RANG: Record<Hinweisart, number> = {
  wetterschutz: 0,
  luftqualitaet: 1,
  feuchte: 2,
  kuehlung: 3,
  wind: 4,
};

function ordneHinweise(hinweise: readonly Hinweis[]): Hinweis[] {
  return [...hinweise].sort((a, b) => HINWEIS_RANG[a.art] - HINWEIS_RANG[b.art]);
}

/* ------------------------------------------------------------------ *
 * Hinweise bei geschlossenen Fenstern
 * ------------------------------------------------------------------ */

/**
 * Ab dieser Raumtemperatur nützt ein Ventilator nichts mehr – allerdings nur
 * bei trockener Luft (siehe `VENTILATOR_TROCKEN_PROZENT`).
 *
 * Oberhalb der Hauttemperatur von rund 34 °C führt bewegte Luft dem Körper
 * Wärme zu, statt sie abzuführen. Ob das den Gewinn durch die verstärkte
 * Schweissverdunstung überwiegt, hängt an der Feuchte: Bei trockener Hitze ist
 * die Verdunstung ohnehin ausgeschöpft und der Ventilator kippt ins Negative,
 * bei feuchter Hitze bleibt er bis deutlich höheren Temperaturen nützlich.
 */
const VENTILATOR_GRENZE_C = celsius(35);

/** Unterhalb dieser relativen Raumfeuchte gilt die Hitze als trocken. */
const VENTILATOR_TROCKEN_PROZENT = 40;

/**
 * Ab dieser Raumtemperatur wird Luftbewegung als angenehm empfunden – darunter
 * stört sie als Zugluft.
 *
 * EN 16798-1 setzt für den Sommer 0.2 m/s bei höchstens 26 °C an und lässt
 * höhere Geschwindigkeiten ausdrücklich erst **über 26 °C** zu, sofern die
 * Person den Luftstrom selbst beeinflussen kann – genau das trifft auf einen
 * Ventilator zu. Unterhalb davon steigt das Zugluftrisiko nach ISO 7730, je
 * kühler es ist.
 *
 * Bewusst nicht an die Wunschtemperatur gekoppelt: Die sagt, ab wann sich
 * Kühlen lohnt, nicht ab wann bewegte Luft guttut. Bei der Voreinstellung von
 * 24 °C käme der Hinweis sonst zwei Grad zu früh.
 */
const VENTILATOR_AB_C = celsius(26);

function hinweiseBeiGeschlossenenFenstern(eingabe: BewertungsEingabe): Hinweis[] {
  const hinweise: Hinweis[] = [];
  if (eingabe.raumBelegt !== true) return hinweise;

  // In dicht belegten Räumen verlangt die Luftqualität trotz Hitze kurzes
  // Stosslüften.
  if (eingabe.stosslueftungNoetig === true) hinweise.push(STOSSLUEFTUNG);

  // Wenn die Fenster zu bleiben müssen, ist Luftbewegung im Raum das einzige
  // verbleibende Mittel – und ein wirksames. Beide Bedingungen müssen erfüllt
  // sein: Es muss dem Nutzer zu warm sein *und* warm genug, dass bewegte Luft
  // erfrischt statt zu ziehen.
  if (
    eingabe.raumtemperaturC > eingabe.einstellungen.zielTemperaturC &&
    eingabe.raumtemperaturC >= VENTILATOR_AB_C
  ) {
    hinweise.push(kuehlungshinweis(eingabe));
  }

  return hinweise;
}

/**
 * Ventilator oder Trinken? Die Raumfeuchte wird aus dem Aussentaupunkt
 * geschätzt: Die absolute Feuchte bleibt beim Erwärmen erhalten, die
 * Raumtemperatur ist bekannt. Ohne Taupunktangabe bleibt es beim Regelfall.
 */
function kuehlungshinweis(eingabe: BewertungsEingabe): Hinweis {
  const taupunktC = eingabe.taupunktAussenC;
  if (taupunktC === undefined || eingabe.raumtemperaturC < VENTILATOR_GRENZE_C) {
    return VENTILATOR;
  }

  const raumfeuchteProzent = relativeFeuchteProzent(eingabe.raumtemperaturC, taupunktC);
  return raumfeuchteProzent < VENTILATOR_TROCKEN_PROZENT ? TROCKENE_HITZE : VENTILATOR;
}

const STOSSLUEFTUNG: Hinweis = {
  art: 'luftqualitaet',
  kuerzel: 'stosslüften',
  text:
    'Der Raum ist belegt: trotzdem stündlich rund fünf Minuten stosslüften. ' +
    'Das hält die Luft frisch und bringt in der kurzen Zeit kaum Wärme herein.',
};

const VENTILATOR: Hinweis = {
  art: 'kuehlung',
  kuerzel: 'Ventilator',
  text:
    'Luftbewegung hilft auch bei geschlossenen Fenstern: Ein Ventilator senkt das ' +
    'Temperaturempfinden um rund zwei bis drei Grad. Er kühlt den Menschen, nicht ' +
    'den Raum – im leeren Zimmer heizt er nur, also beim Hinausgehen abstellen.',
};

const TROCKENE_HITZE: Hinweis = {
  art: 'kuehlung',
  kuerzel: 'trinken',
  text:
    'Bei dieser trockenen Hitze kühlt ein Ventilator kaum noch – die bewegte Luft ' +
    'wärmt eher, als sie kühlt. Wichtiger sind jetzt regelmässiges Trinken und ' +
    'kühle Umschläge.',
};

/* ------------------------------------------------------------------ *
 * Hinweise bei offenen Fenstern
 * ------------------------------------------------------------------ */

/**
 * Ab dieser Windgeschwindigkeit lohnt der Hinweis aufs Querlüften. Gemessen
 * wird in 10 m Höhe; am Fenster kommt im bebauten Gebiet deutlich weniger an.
 */
const QUERLUEFTEN_AB_M_PRO_S = 4;

function hinweiseBeiOffenenFenstern(eingabe: BewertungsEingabe): Hinweis[] {
  const hinweise: Hinweis[] = [];
  const taupunktC = eingabe.taupunktAussenC;

  // Schutz vor Schaden steht vor Komfort: Die Empfehlungskarte zeigt nur die
  // ersten beiden Hinweise, und eine Sturmwarnung darf nicht hinter «schwül»
  // verschwinden.
  const schutz = wetterschutzhinweis(eingabe);
  if (schutz) hinweise.push(schutz);

  if (taupunktC !== undefined) {
    // Tauwasser ist das ernstere Problem und schliesst den Schwülehinweis aus –
    // beide zugleich wären dieselbe Aussage in zwei Sätzen.
    if (drohtKondensation(taupunktC, eingabe.raumtemperaturC)) hinweise.push(KONDENSATION);
    else if (istSchwuel(taupunktC)) hinweise.push(SCHWUELE);
  }

  // Bei Böen, die Flügel zuschlagen lassen, wäre die Aufforderung zum
  // Querlüften ein Widerspruch zur Warnung eine Zeile darüber.
  const boeig = (eingabe.windboeeMProS ?? 0) >= BOEEN_AB_M_PRO_S;
  if (!boeig && (eingabe.windgeschwindigkeitMProS ?? 0) >= QUERLUEFTEN_AB_M_PRO_S) {
    hinweise.push(QUERLUEFTEN);
  }

  return hinweise;
}

/* ------------------------------------------------------------------ *
 * Warnungen vor Sturm- und Wasserschaden
 *
 * Sie ändern die Empfehlung nicht. Regen kühlt die Luft ab und ist thermisch
 * oft die beste Lüftungsgelegenheit des Tages – ein Fenster auf Kipp ist dann
 * eine vernünftige Entscheidung, die der App nicht zusteht. Sie sagt, worauf
 * zu achten ist, und überlässt den Entscheid dem Menschen am Fenster.
 * ------------------------------------------------------------------ */

/**
 * Ab dieser Böe kann ein offener Flügel zuschlagen: rund 43 km/h, Windstärke 6
 * («starker Wind»). Lose Gegenstände auf dem Fensterbrett bewegen sich, Papier
 * fliegt vom Tisch.
 */
const BOEEN_AB_M_PRO_S = 12;

/**
 * Ab dieser Böe wird es zum Sturm: rund 61 km/h. Das entspricht der Schwelle,
 * ab der MeteoSchweiz eine Windwarnung der Stufe 2 herausgibt.
 */
const STURM_AB_M_PRO_S = 17;

/**
 * Ab dieser Niederschlagsmenge wird das Fensterbrett nass. Darunter liegt
 * Sprühregen, der bei geschlossenem Rollladen oder Vordach folgenlos bleibt.
 */
const REGEN_AB_MM_PRO_H = 0.5;

/**
 * WMO-Wettercodes für Gewitter: 95 leicht bis mässig, 97 schwer, 96 und 99 mit
 * Hagel. Open-Meteo liefert derzeit nur 95, 96 und 99 – 97 steht trotzdem hier,
 * damit das schwerste Gewitter nicht durchrutscht, falls das Modell es doch
 * einmal meldet.
 */
const GEWITTER_CODES = new Set([95, 96, 97, 99]);

/**
 * Der dringlichste Wetterschutzhinweis für diese Stunde, sonst `undefined`.
 *
 * Es wird bewusst nur einer ausgegeben: Bei einem Gewitter träfen Sturm- und
 * Regenwarnung zugleich zu, und drei Warnungen übereinander liest niemand mehr.
 * Die Reihenfolge entspricht dem Schadenspotenzial.
 */
function wetterschutzhinweis(eingabe: BewertungsEingabe): Hinweis | undefined {
  if (eingabe.wettercode !== undefined && GEWITTER_CODES.has(eingabe.wettercode)) {
    return GEWITTER;
  }
  if ((eingabe.windboeeMProS ?? 0) >= STURM_AB_M_PRO_S) return STURM;
  if ((eingabe.windboeeMProS ?? 0) >= BOEEN_AB_M_PRO_S) return BOEEN;
  if ((eingabe.schneefallCm ?? 0) > 0) return SCHNEE;
  if ((eingabe.niederschlagMmProH ?? 0) >= REGEN_AB_MM_PRO_H) return REGEN;
  return undefined;
}

const GEWITTER: Hinweis = {
  art: 'wetterschutz',
  kuerzel: 'Gewitter',
  text:
    'Gewitter angesagt: Sturmböen und Starkregen setzen oft binnen Minuten ein. ' +
    'Offene Fenster jetzt im Auge behalten – kühler wird es nach dem Durchzug ' +
    'ohnehin.',
};

const STURM: Hinweis = {
  art: 'wetterschutz',
  kuerzel: 'Sturm',
  text:
    'Sturmböen über 60 km/h: Offene Flügel schlagen zu und können Scheibe oder ' +
    'Beschlag beschädigen. Fenster schliessen oder sicher verriegeln.',
};

const BOEEN: Hinweis = {
  art: 'wetterschutz',
  kuerzel: 'Böen',
  text:
    'Kräftige Böen: Ein offener Flügel kann zuschlagen. Fenster feststellen und ' +
    'lose Gegenstände vom Fensterbrett nehmen.',
};

const REGEN: Hinweis = {
  art: 'wetterschutz',
  kuerzel: 'Regen',
  text:
    'Es regnet: Bei offenem Fenster wird das Fensterbrett nass, bei Wind auch ' +
    'der Boden davor. Regenluft ist zum Kühlen gut – ein gekipptes Fenster mit ' +
    'Blick darauf reicht meist.',
};

const SCHNEE: Hinweis = {
  art: 'wetterschutz',
  kuerzel: 'Schnee',
  text:
    'Es schneit: Durch ein offenes Fenster wehen Flocken herein, die drinnen ' +
    'schmelzen und Fensterbrett und Boden nässen.',
};

const KONDENSATION: Hinweis = {
  art: 'feuchte',
  kuerzel: 'kurz lüften',
  text:
    'Die Aussenluft ist feuchter, als der ausgekühlte Raum verträgt: An kühlen Wänden ' +
    'und Böden kann sich Wasser niederschlagen. Deshalb kurz und kräftig lüften, ' +
    'statt die Fenster dauerhaft offen zu lassen.',
};

const SCHWUELE: Hinweis = {
  art: 'feuchte',
  kuerzel: 'schwül',
  text:
    'Die Aussenluft ist schwül. Lüften senkt die Temperatur wie berechnet, die Luft ' +
    'fühlt sich danach aber weiterhin schwer an.',
};

const QUERLUEFTEN: Hinweis = {
  art: 'wind',
  kuerzel: 'querlüften',
  text:
    'Es weht spürbarer Wind – jetzt quer lüften: Zwei gegenüberliegende Fenster ' +
    'tauschen die Luft um ein Vielfaches schneller als ein einzelnes.',
};

function dringlichkeitOeffnen(
  raumtemperaturC: Celsius,
  differenzK: Kelvin,
  einstellungen: Einstellungen,
  nacht: boolean,
): 'hoch' | 'normal' {
  // Dringend, wenn es drinnen zu warm ist und die kühle Luft draussen bereitsteht.
  const zuWarm = raumtemperaturC > einstellungen.zielTemperaturC;
  return zuWarm && (differenzK >= 3 || nacht) ? 'hoch' : 'normal';
}

function begruendungOeffnen(
  raumtemperaturC: Celsius,
  differenzK: Kelvin,
  einstellungen: Einstellungen,
  nacht: boolean,
): string {
  const unterschied = formatiereDifferenz(differenzK);
  if (nacht) {
    return `Nachtauskühlung: Draussen ist es ${unterschied} kühler. Jetzt lüften kühlt die Bausubstanz für morgen aus.`;
  }
  if (raumtemperaturC > einstellungen.zielTemperaturC) {
    return `Draussen ist es ${unterschied} kühler als drinnen – Lüften senkt die Raumtemperatur spürbar.`;
  }
  return `Draussen ist es ${unterschied} kühler – eine gute Gelegenheit, Kühle auf Vorrat einzulagern.`;
}

function begruendungSchliessen(differenzK: Kelvin): string {
  if (differenzK < -1) {
    return `Draussen ist es ${formatiereDifferenz(differenzK)} wärmer als drinnen – geschlossene Fenster halten die Hitze jetzt draussen.`;
  }
  if (differenzK < 0) {
    return 'Draussen ist es bereits leicht wärmer als drinnen – Lüften würde Wärme hereinbringen.';
  }
  return 'Der Temperaturunterschied ist zu klein: Lüften bringt kaum Abkühlung, aber Feuchte und Staub.';
}

/** Ergebnis der Suche nach dem nächsten Statuswechsel. */
export interface NaechsterWechsel {
  /** Der Status, der ab `zeitpunkt` gilt. */
  status: Fensterstatus;
  zeitpunkt: Date;
  /** Stunden bis zum Wechsel, gerundet. */
  inStunden: number;
}

/**
 * Sucht ab `startIndex` die erste Stunde, in der die Empfehlung kippt.
 * Liefert `undefined`, wenn sich im verfügbaren Zeitraum nichts ändert.
 */
export function findeNaechstenWechsel(
  stunden: readonly SimulationsStunde[],
  startIndex: number,
): NaechsterWechsel | undefined {
  const start = stunden[startIndex];
  if (!start) return undefined;

  for (let i = startIndex + 1; i < stunden.length; i++) {
    const stunde = stunden[i];
    if (!stunde) break;
    if (stunde.empfehlung.status !== start.empfehlung.status) {
      return {
        status: stunde.empfehlung.status,
        zeitpunkt: stunde.zeit,
        inStunden: i - startIndex,
      };
    }
  }
  return undefined;
}

/**
 * Fasst zusammenhängende Stunden mit gleichem Fensterstatus zu Blöcken zusammen –
 * Grundlage für die Zeitleiste und die schraffierten Bereiche im Diagramm.
 */
export interface Statusblock {
  status: Fensterstatus;
  vonIndex: number;
  /** Exklusiv. */
  bisIndex: number;
  von: Date;
  bis: Date;
}

export function fasseStatusbloeckeZusammen(stunden: readonly SimulationsStunde[]): Statusblock[] {
  const bloecke: Statusblock[] = [];
  for (let i = 0; i < stunden.length; i++) {
    const stunde = stunden[i];
    if (!stunde) continue;
    const letzter = bloecke[bloecke.length - 1];
    if (letzter && letzter.status === stunde.empfehlung.status) {
      letzter.bisIndex = i + 1;
      letzter.bis = stunde.zeit;
    } else {
      bloecke.push({
        status: stunde.empfehlung.status,
        vonIndex: i,
        bisIndex: i + 1,
        von: stunde.zeit,
        bis: stunde.zeit,
      });
    }
  }
  return bloecke;
}
