import type {
  Dringlichkeit,
  Einstellungen,
  Empfehlung,
  Fensterstatus,
  SimulationsStunde,
} from '../typen.ts';
import { temperaturDifferenz, type Celsius, type Kelvin } from '../einheiten.ts';
import { NACHT_BEGINN_STUNDE, NACHT_ENDE_STUNDE } from '../konfiguration/standardwerte.ts';
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
 * Bleiben die Fenster zu und ist der Raum belegt und auf Stosslüftung
 * angewiesen, wird die Empfehlung um einen entsprechenden Hinweis ergänzt.
 * Sie wird dadurch nicht umgekehrt: Stosslüften ist eine kurze Ausnahme,
 * kein Dauerzustand.
 */
export function bewerteStunde(eingabe: BewertungsEingabe): Empfehlung {
  const { aussentemperaturC, raumtemperaturC, stundeDesTages, einstellungen, vorherigerStatus } = eingabe;
  // positiv = draussen kühler
  const differenzK = temperaturDifferenz(raumtemperaturC, aussentemperaturC);
  const nacht = istNachtstunde(stundeDesTages);

  // Gilt für alle «schliessen»-Empfehlungen: In dicht belegten Räumen verlangt
  // die Luftqualität trotzdem kurzes Stosslüften.
  const stosslueften = eingabe.raumBelegt === true && eingabe.stosslueftungNoetig === true;

  // 1. Weiteres Auskühlen wäre unangenehm.
  if (raumtemperaturC <= einstellungen.minRaumtemperaturC) {
    return geschlossen(
      `Innen sind es ${formatiereTemperatur(raumtemperaturC)} – das ist bereits an der eingestellten Untergrenze. Weiter auskühlen lohnt sich nicht.`,
      'normal',
      stosslueften,
    );
  }

  // 2. Nachtauskühlung wurde vom Nutzer abgeschaltet (z. B. Lärm, Insekten, Sicherheit).
  if (nacht && !einstellungen.nachtauskuehlung) {
    return geschlossen(
      'Die Nachtauskühlung ist in den Einstellungen deaktiviert – nachts bleiben die Fenster zu.',
      'normal',
      stosslueften,
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
    };
  }

  // 4. Draussen ist es gleich warm oder wärmer – Wärme draussen halten.
  return geschlossen(
    begruendungSchliessen(differenzK),
    differenzK < -1 ? 'hoch' : 'normal',
    stosslueften,
  );
}

/** Baut eine «schliessen»-Empfehlung, bei Bedarf mit Stosslüftungshinweis. */
function geschlossen(
  begruendung: string,
  dringlichkeit: Dringlichkeit,
  stosslueften: boolean,
): Empfehlung {
  return {
    status: 'schliessen',
    dringlichkeit,
    titel: 'Fenster schliessen',
    begruendung,
    ...(stosslueften ? { zusatzhinweis: STOSSLUEFTUNG_HINWEIS } : {}),
  };
}

const STOSSLUEFTUNG_HINWEIS =
  'Der Raum ist belegt: trotzdem stündlich rund fünf Minuten stosslüften. ' +
  'Das hält die Luft frisch und bringt in der kurzen Zeit kaum Wärme herein.';

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
