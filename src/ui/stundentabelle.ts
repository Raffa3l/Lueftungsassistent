import type { SimulationsStunde } from '../typen.ts';
import { formatiereTemperatur, formatiereUhrzeit } from '../logik/format.ts';
import { el, leere } from './dom.ts';
import { symbolFuerHinweis, symbolFuerStatus } from './symbole.ts';

/**
 * Stundenweise Übersicht der nächsten 24 Stunden.
 *
 * Sie ist zugleich die textliche Entsprechung des Diagramms: Wer das Diagramm
 * nicht sehen oder Farben nicht unterscheiden kann, findet hier alle Werte.
 */

const ANZAHL_STUNDEN = 24;

export function rendereStundentabelle(
  behaelter: HTMLElement,
  stunden: readonly SimulationsStunde[],
  jetztIndex: number,
): void {
  leere(behaelter);

  const ausschnitt = stunden.slice(jetztIndex, jetztIndex + ANZAHL_STUNDEN);
  if (ausschnitt.length === 0) {
    behaelter.append(el('p', { class: 'platzhalter' }, ['Keine Daten verfügbar.']));
    return;
  }

  const zeilen = ausschnitt.map((stunde, index) =>
    el('tr', { 'data-jetzt': index === 0 ? 'true' : 'false' }, [
      el('th', { scope: 'row' }, [
        index === 0 ? `${formatiereUhrzeit(stunde.zeit)} (jetzt)` : formatiereUhrzeit(stunde.zeit),
      ]),
      el('td', { class: 'zahl' }, [formatiereTemperatur(stunde.aussentemperaturC)]),
      el('td', { class: 'zahl' }, [formatiereTemperatur(stunde.raumtemperaturC)]),
      el('td', {}, [statusMarke(stunde)]),
    ]),
  );

  behaelter.append(
    el('table', {}, [
      el('caption', {}, ['Empfehlung für die nächsten 24 Stunden']),
      el('thead', {}, [
        el('tr', {}, [
          el('th', { scope: 'col' }, ['Zeit']),
          el('th', { scope: 'col' }, ['Draussen']),
          el('th', { scope: 'col' }, ['Drinnen']),
          el('th', { scope: 'col' }, ['Fenster']),
        ]),
      ]),
      el('tbody', {}, zeilen),
    ]),
  );
}

function statusMarke(stunde: SimulationsStunde): HTMLElement {
  const offen = stunde.empfehlung.status === 'oeffnen';
  const marke = el(
    'span',
    { class: `status-marke status-marke--${offen ? 'oeffnen' : 'schliessen'}` },
    [symbolFuerStatus(stunde.empfehlung.status), offen ? 'öffnen' : 'schliessen'],
  );

  // In der schmalen Tabelle ist nur für den wichtigsten Hinweis Platz – die
  // Rangfolge hat ihn nach vorn sortiert. Die ausführlichen Texte aller
  // Hinweise stehen im Tooltip und in der Empfehlungskarte.
  const hinweise = stunde.empfehlung.zusatzhinweise;
  const wichtigster = hinweise[0];
  if (!wichtigster) return marke;

  return el('span', { class: 'status-gruppe' }, [
    marke,
    el('span', { class: 'status-zusatz', title: hinweise.map((h) => h.text).join(' ') }, [
      symbolFuerHinweis(wichtigster.art),
      wichtigster.kuerzel,
    ]),
  ]);
}
