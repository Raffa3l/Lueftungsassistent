import './style.css';

import type { Einstellungen, SimulationsStunde, Wetterstunde } from './typen.ts';
import { findeStation } from './konfiguration/stationen.ts';
import { findeGebaeudetyp } from './konfiguration/gebaeudetypen.ts';
import { findeFreienTag, findeRaumtyp } from './konfiguration/raumtypen.ts';
import { findeAusrichtung } from './konfiguration/ausrichtungen.ts';
import { findeSonnenschutz } from './konfiguration/sonnenschutz.ts';
import { STANDARD_EINSTELLUNGEN } from './konfiguration/standardwerte.ts';
import { ladeEinstellungen, setzeEinstellungenZurueck, speichereEinstellungen } from './dienste/speicher.ts';
import { jetztInStationszeit, ladeWetterdaten, WetterdatenFehler } from './dienste/wetterdienst.ts';
import { findeIndexFuerJetzt, simuliere } from './logik/thermischesModell.ts';
import { vorgeschlageneZieltemperaturC } from './logik/komfort.ts';
import { baueEinstellungsformular, type EinstellungenSteuerung } from './ui/einstellungen.ts';
import { rendereDashboard } from './ui/dashboard.ts';
import { baueLegende, baueVergleichsschalter, Temperaturdiagramm } from './ui/diagramm.ts';
import { rendereStundentabelle } from './ui/stundentabelle.ts';
import { el, leere } from './ui/dom.ts';

/**
 * Anwendungssteuerung.
 *
 * Ablauf: Einstellungen laden → Wetterdaten für den Standort holen →
 * Raumtemperatur simulieren → Oberfläche zeichnen. Jede Änderung an den
 * Einstellungen wird sofort gespeichert; nur ein Standortwechsel löst einen
 * neuen Netzabruf aus, alles andere wird lokal neu gerechnet.
 */

interface Anwendungszustand {
  einstellungen: Einstellungen;
  wetter: Wetterstunde[];
  zeigeVergleich: boolean;
  laedt: boolean;
}

const zustand: Anwendungszustand = {
  einstellungen: ladeEinstellungen(),
  wetter: [],
  zeigeVergleich: false,
  laedt: true,
};

// Feste Bausteine der Seite einsammeln.
const empfehlungInhalt = pflichtElement('empfehlung-inhalt');
const formular = pflichtElement('einstellungen-formular') as HTMLFormElement;
const einstellungenZusammenfassung = pflichtElement('einstellungen-zusammenfassung');
const diagrammBehaelter = pflichtElement('diagramm');
const legendeBehaelter = pflichtElement('diagramm-legende');
const diagrammSchalter = pflichtElement('diagramm-schalter');
const tabellenBehaelter = pflichtElement('stundentabelle');
const hauptbereich = document.querySelector('main');

const diagramm = new Temperaturdiagramm(diagrammBehaelter);
let laufenderAbruf: AbortController | undefined;

const einstellungenSteuerung: EinstellungenSteuerung = baueEinstellungsformular(
  formular,
  einstellungenZusammenfassung,
  zustand.einstellungen,
  {
    beiAenderung(aenderung) {
      const standortGewechselt =
        aenderung.stationId !== undefined && aenderung.stationId !== zustand.einstellungen.stationId;

      zustand.einstellungen = { ...zustand.einstellungen, ...aenderung };
      speichereEinstellungen(zustand.einstellungen);
      einstellungenSteuerung.aktualisiere(zustand.einstellungen);

      if (standortGewechselt) void ladeUndZeichne();
      else zeichne();
    },
    beiZuruecksetzen() {
      const vorherigeStation = zustand.einstellungen.stationId;
      zustand.einstellungen = setzeEinstellungenZurueck();
      einstellungenSteuerung.aktualisiere(zustand.einstellungen);

      if (vorherigeStation !== zustand.einstellungen.stationId) void ladeUndZeichne();
      else zeichne();
    },
  },
);

baueLegende(legendeBehaelter);
baueVergleichsschalter(diagrammSchalter, zustand.zeigeVergleich, (aktiv) => {
  zustand.zeigeVergleich = aktiv;
  zeichne();
});

void ladeUndZeichne();

// Beim Zurückkehren auf die Seite prüfen, ob die Daten noch aktuell sind.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !zustand.laedt) void ladeUndZeichne();
});

/** Wetterdaten für den gewählten Standort holen und danach neu zeichnen. */
async function ladeUndZeichne(): Promise<void> {
  const station = findeStation(zustand.einstellungen.stationId) ?? findeStation(STANDARD_EINSTELLUNGEN.stationId)!;

  laufenderAbruf?.abort();
  const abruf = new AbortController();
  laufenderAbruf = abruf;
  zustand.laedt = true;
  entferneMeldung();

  try {
    zustand.wetter = await ladeWetterdaten(station, abruf.signal);
    zustand.laedt = false;
    zeichne();
  } catch (fehler) {
    if (fehler instanceof DOMException && fehler.name === 'AbortError') return;
    zustand.laedt = false;
    zeigeFehler(fehler);
  }
}

/** Simulation rechnen und alle Ansichten aktualisieren. */
function zeichne(): void {
  const station = findeStation(zustand.einstellungen.stationId);
  const gebaeude = findeGebaeudetyp(zustand.einstellungen.gebaeudetypId);
  const raum = findeRaumtyp(zustand.einstellungen.raumtypId);
  if (!station || !gebaeude || !raum || zustand.wetter.length === 0) return;

  // Ausrichtung und Sonnenschutz gehen als «Solarlage» ins Modell. Beides ändert
  // sich ohne Netzabruf – der Sonnenstand wird lokal gerechnet.
  const ausrichtung =
    findeAusrichtung(zustand.einstellungen.ausrichtungId) ??
    findeAusrichtung(STANDARD_EINSTELLUNGEN.ausrichtungId)!;
  const sonnenschutz =
    findeSonnenschutz(zustand.einstellungen.sonnenschutzId) ??
    findeSonnenschutz(STANDARD_EINSTELLUNGEN.sonnenschutzId)!;

  const { stunden } = simuliere(
    zustand.wetter,
    gebaeude,
    raum,
    zustand.einstellungen,
    undefined,
    {
      breitengrad: station.breitengrad,
      laengengrad: station.laengengrad,
      fassadenazimutGrad: ausrichtung.azimutGrad,
      sonnenschutzFaktor: sonnenschutz.faktor,
    },
  );
  const jetztIndex = findeIndexFuerJetzt(stunden, jetztInStationszeit());

  const jetztZeit = stunden[jetztIndex]?.zeit;
  const freierTag =
    raum.beachtetFerien && jetztZeit
      ? findeFreienTag(jetztZeit, {
          ferien: zustand.einstellungen.ferien,
          feiertageBeachten: zustand.einstellungen.feiertageBeachten,
        })
      : undefined;

  rendereDashboard(empfehlungInhalt, { stunden, jetztIndex, station, freierTag });
  diagramm.aktualisiere({ stunden, jetztIndex, zeigeVergleich: zustand.zeigeVergleich });
  rendereStundentabelle(tabellenBehaelter, stunden, jetztIndex);
  aktualisiereSeitentitel(stunden, jetztIndex, station.name);

  // Der Vorschlag hängt am Wetter der Vortage, nicht an den Einstellungen –
  // er wird deshalb aus den Rohdaten gerechnet, nicht aus der Simulation.
  einstellungenSteuerung.zeigeTemperaturvorschlag(
    jetztZeit ? vorgeschlageneZieltemperaturC(zustand.wetter, jetztZeit) : undefined,
  );
}

/** Der Seitentitel zeigt die Empfehlung – sichtbar schon im Browser-Tab. */
function aktualisiereSeitentitel(
  stunden: readonly SimulationsStunde[],
  jetztIndex: number,
  ort: string,
): void {
  const jetzt = stunden[jetztIndex];
  if (!jetzt) return;
  document.title = `${jetzt.empfehlung.titel} – ${ort} · Lüftungsassistent`;
}

function zeigeFehler(fehler: unknown): void {
  const text =
    fehler instanceof WetterdatenFehler
      ? fehler.message
      : 'Die Wetterdaten konnten nicht geladen werden.';

  empfehlungInhalt.setAttribute('aria-busy', 'false');
  if (zustand.wetter.length === 0) {
    leere(empfehlungInhalt);
    empfehlungInhalt.append(el('p', { class: 'platzhalter' }, [text]));
  }

  entferneMeldung();
  const wiederholen = el('button', { type: 'button' }, ['Erneut versuchen']);
  wiederholen.addEventListener('click', () => void ladeUndZeichne());

  hauptbereich?.prepend(
    el('div', { class: 'meldung', id: 'fehlermeldung', role: 'alert' }, [
      el('h2', {}, ['Wetterdaten nicht verfügbar']),
      el('p', {}, [text]),
      wiederholen,
    ]),
  );
}

function entferneMeldung(): void {
  document.getElementById('fehlermeldung')?.remove();
}

function pflichtElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Element «${id}» fehlt im HTML-Gerüst.`);
  return element;
}
