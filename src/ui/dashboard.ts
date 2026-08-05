import type { SimulationsStunde, Wetterstation } from '../typen.ts';
import { findeNaechstenWechsel } from '../logik/lueftungslogik.ts';
import { celsius, temperaturDifferenz } from '../einheiten.ts';
import { formatiereTemperatur, formatiereZeitpunkt } from '../logik/format.ts';
import { el, leere } from './dom.ts';
import { symbolFuerHinweis, symbolFuerStatus, symbolSonne, symbolThermometer, symbolUhr } from './symbole.ts';
import { infofeld } from './infofeld.ts';
import { INFO, INFO_HINWEIS } from './infotexte.ts';

/**
 * Empfehlungskarte: die eine Aussage, wegen der die App aufgerufen wird –
 * «Fenster öffnen» oder «Fenster schliessen», mit Begründung und den drei
 * wichtigsten Zahlen.
 */

/**
 * Mehr als zwei Zusatzhinweise überdecken die eigentliche Empfehlung. Welche
 * beiden das sind, entscheidet die Rangfolge in `logik/lueftungslogik.ts`.
 */
const MAX_HINWEISE = 2;

export interface DashboardDaten {
  stunden: readonly SimulationsStunde[];
  jetztIndex: number;
  station: Wetterstation;
  /** Name des Feiertags oder Ferienzeitraums, falls heute frei ist. */
  freierTag?: string | undefined;
}

export function rendereDashboard(behaelter: HTMLElement, daten: DashboardDaten): void {
  const { stunden, jetztIndex, station } = daten;
  const jetzt = stunden[jetztIndex];
  leere(behaelter);
  behaelter.setAttribute('aria-busy', 'false');

  if (!jetzt) {
    behaelter.append(el('p', { class: 'platzhalter' }, ['Keine aktuellen Daten verfügbar.']));
    return;
  }

  const { empfehlung } = jetzt;
  const akzent = akzentfarbe(empfehlung.status, empfehlung.dringlichkeit);
  const karte = behaelter.closest('.karte') as HTMLElement | null;
  karte?.style.setProperty('--akzent', akzent.linie);
  karte?.style.setProperty('--akzent-flaeche', akzent.flaeche);

  behaelter.append(
    el('div', { class: 'empfehlung__kopf' }, [
      el('span', { class: 'empfehlung__symbol' }, [symbolFuerStatus(empfehlung.status)]),
      el('div', {}, [
        el('p', { class: 'empfehlung__titel' }, [empfehlung.titel]),
        el('p', { class: 'empfehlung__ort' }, [
          `${station.name} · ${formatiereZeitpunkt(jetzt.zeit, jetzt.zeit)}`,
          daten.freierTag ? ` · ${daten.freierTag}` : '',
        ]),
      ]),
    ]),
    el('p', { class: 'empfehlung__begruendung' }, [empfehlung.begruendung]),
  );

  for (const hinweis of empfehlung.zusatzhinweise.slice(0, MAX_HINWEISE)) {
    const erklaerung = INFO_HINWEIS[hinweis.art];
    // Eine Warnung vor Sturm- oder Wasserschaden bekommt mehr Gewicht als ein
    // Komforthinweis – gleich gesetzt ginge sie neben «schwül» unter.
    const warnung = hinweis.art === 'wetterschutz';
    behaelter.append(
      el('p', { class: `empfehlung__zusatz${warnung ? ' empfehlung__zusatz--warnung' : ''}` }, [
        symbolFuerHinweis(hinweis.art),
        el('span', {}, [hinweis.text, ' ', infofeld(erklaerung.thema, erklaerung.text)]),
      ]),
    );
  }

  const wechsel = findeNaechstenWechsel(stunden, jetztIndex);
  if (wechsel) {
    const text =
      wechsel.status === 'oeffnen'
        ? `Voraussichtlich ab ${formatiereZeitpunkt(wechsel.zeitpunkt, jetzt.zeit)} lohnt sich Lüften wieder.`
        : `Voraussichtlich ab ${formatiereZeitpunkt(wechsel.zeitpunkt, jetzt.zeit)} sollten die Fenster zu bleiben.`;
    behaelter.append(el('p', { class: 'empfehlung__wechsel' }, [text]));
  }

  behaelter.append(
    el('ul', { class: 'kennzahlen' }, [
      kennzahl(
        symbolSonne(),
        'Draussen',
        formatiereTemperatur(jetzt.aussentemperaturC),
        tagesspanne(stunden, jetztIndex),
        INFO.aussentemperatur,
      ),
      kennzahl(
        symbolThermometer(),
        'Drinnen (berechnet)',
        formatiereTemperatur(jetzt.raumtemperaturC),
        vergleichshinweis(jetzt),
        INFO.raumtemperatur,
      ),
      kennzahl(
        symbolUhr(),
        'Nächster Wechsel',
        wechsel ? `in ${wechsel.inStunden} h` : 'keiner absehbar',
        wechsel ? formatiereZeitpunkt(wechsel.zeitpunkt, jetzt.zeit) : 'in den nächsten Tagen',
      ),
    ]),
  );
}

function kennzahl(
  symbol: SVGElement,
  bezeichnung: string,
  wert: string,
  zusatz: string,
  erklaerung?: { thema: string; text: string },
): HTMLElement {
  return el('li', { class: 'kennzahl' }, [
    el('span', { class: 'kennzahl__bezeichnung' }, [
      symbol,
      bezeichnung,
      erklaerung ? infofeld(erklaerung.thema, erklaerung.text) : undefined,
    ]),
    el('span', { class: 'kennzahl__wert' }, [wert]),
    el('span', { class: 'kennzahl__zusatz' }, [zusatz]),
  ]);
}

/** Tiefst- und Höchstwert des laufenden Kalendertages. */
function tagesspanne(stunden: readonly SimulationsStunde[], jetztIndex: number): string {
  const heute = stunden[jetztIndex]?.zeit.getDate();
  const werte = stunden
    .filter((stunde) => stunde.zeit.getDate() === heute)
    .map((stunde) => stunde.aussentemperaturC);
  if (werte.length === 0) return '';

  return `heute ${formatiereTemperatur(celsius(Math.min(...werte)), 0)} bis ${formatiereTemperatur(celsius(Math.max(...werte)), 0)}`;
}

/** Wie viel das empfohlene Lüften gegenüber «nie lüften» bringt. */
function vergleichshinweis(jetzt: SimulationsStunde): string {
  const ersparnisK = temperaturDifferenz(jetzt.raumtemperaturC, jetzt.raumtemperaturOhneLueftungC);
  if (ersparnisK < 0.3) return 'Modellwert für den Gebäudetyp';
  return `${ersparnisK.toFixed(1)} Grad kühler als ohne Lüften`;
}

function akzentfarbe(
  status: SimulationsStunde['empfehlung']['status'],
  dringlichkeit: SimulationsStunde['empfehlung']['dringlichkeit'],
): { linie: string; flaeche: string } {
  if (status === 'oeffnen') {
    return { linie: 'var(--status-offen)', flaeche: 'var(--status-offen-flaeche)' };
  }
  return dringlichkeit === 'hoch'
    ? { linie: 'var(--status-dringend)', flaeche: 'var(--status-dringend-flaeche)' }
    : { linie: 'var(--status-zu)', flaeche: 'var(--status-zu-flaeche)' };
}
