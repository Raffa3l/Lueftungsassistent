import type { Einstellungen, Ferienzeitraum } from '../typen.ts';
import { celsius, kelvin, type Celsius } from '../einheiten.ts';
import { formatiereTemperatur } from '../logik/format.ts';
import { datumsSchluessel } from '../konfiguration/feiertage.ts';
import { erzeugeId } from '../dienste/speicher.ts';
import { jetztInStationszeit } from '../dienste/wetterdienst.ts';
import { GEBAEUDETYPEN, findeGebaeudetyp } from '../konfiguration/gebaeudetypen.ts';
import { RAUMTYPEN, findeRaumtyp } from '../konfiguration/raumtypen.ts';
import { STATIONEN, findeStation } from '../konfiguration/stationen.ts';
import { AUSRICHTUNGEN, findeAusrichtung } from '../konfiguration/ausrichtungen.ts';
import { SONNENSCHUTZ_ARTEN, findeSonnenschutz } from '../konfiguration/sonnenschutz.ts';
import { GRENZWERTE, MAX_FERIENZEITRAEUME } from '../konfiguration/standardwerte.ts';
import { amplitudendaempfung, phasenverschiebungH } from '../logik/thermischesModell.ts';
import { el, leere } from './dom.ts';
import { infofeld } from './infofeld.ts';
import { INFO } from './infotexte.ts';

/**
 * Einstellungsformular: Standort, Gebäudetyp und persönliche Schwellwerte.
 *
 * Das Formular wird einmal aufgebaut; danach werden nur noch Werte und die
 * abgeleitete Gebäudebeschreibung aktualisiert. So geht der Fokus beim Tippen
 * nicht verloren.
 *
 * Die Felder stehen in ausdrücklichen Zweiergruppen (`.feldpaar`) statt in
 * einem durchlaufenden Zweispaltenraster: Ein Raster füllt zeilenweise auf und
 * stellt dabei Felder nebeneinander, die sachlich nichts miteinander zu tun
 * haben. Ausrichtung und Sonnenschutz gehören zusammen, Raum- und Gebäudetyp
 * ebenso, und weil beide Paare ähnlich hohe Kennwertlisten tragen, entstehen
 * auch keine Lücken mehr.
 */

export interface EinstellungenSteuerung {
  /** Übernimmt geänderte Werte von aussen (z. B. nach dem Zurücksetzen). */
  aktualisiere(einstellungen: Einstellungen): void;
  /**
   * Zeigt den aus der Wetterlage abgeleiteten Vorschlag für die
   * Wunschtemperatur. `undefined` blendet ihn aus.
   */
  zeigeTemperaturvorschlag(vorschlagC: Celsius | undefined): void;
}

export interface EinstellungenRueckrufe {
  beiAenderung(aenderung: Partial<Einstellungen>): void;
  beiZuruecksetzen(): void;
}

export function baueEinstellungsformular(
  formular: HTMLFormElement,
  zusammenfassung: HTMLElement,
  start: Einstellungen,
  rueckrufe: EinstellungenRueckrufe,
): EinstellungenSteuerung {
  leere(formular);

  const standortAuswahl = el(
    'select',
    { id: 'feld-standort', name: 'standort' },
    STATIONEN.map((station) =>
      el('option', { value: station.id }, [`${station.name} (${station.kanton})`]),
    ),
  );

  const gebaeudeAuswahl = el(
    'select',
    { id: 'feld-gebaeude', name: 'gebaeude', 'aria-describedby': 'gebaeude-beschreibung' },
    GEBAEUDETYPEN.map((typ) => el('option', { value: typ.id }, [typ.name])),
  );

  const gebaeudeBeschreibung = el('p', {
    id: 'gebaeude-beschreibung',
    class: 'feld__beschreibung',
  });
  const gebaeudeKennwerte = el('ul', { class: 'kennwerte' });

  const raumAuswahl = el(
    'select',
    { id: 'feld-raum', name: 'raum', 'aria-describedby': 'raum-beschreibung' },
    RAUMTYPEN.map((typ) => el('option', { value: typ.id }, [typ.name])),
  );

  const raumBeschreibung = el('p', { id: 'raum-beschreibung', class: 'feld__beschreibung' });
  const raumKennwerte = el('ul', { class: 'kennwerte' });

  const ausrichtungAuswahl = el(
    'select',
    { id: 'feld-ausrichtung', name: 'ausrichtung', 'aria-describedby': 'ausrichtung-beschreibung' },
    AUSRICHTUNGEN.map((eintrag) => el('option', { value: eintrag.id }, [eintrag.name])),
  );
  const ausrichtungBeschreibung = el('p', {
    id: 'ausrichtung-beschreibung',
    class: 'feld__beschreibung',
  });

  const sonnenschutzAuswahl = el(
    'select',
    { id: 'feld-sonnenschutz', name: 'sonnenschutz', 'aria-describedby': 'sonnenschutz-beschreibung' },
    SONNENSCHUTZ_ARTEN.map((eintrag) => el('option', { value: eintrag.id }, [eintrag.name])),
  );
  const sonnenschutzBeschreibung = el('p', {
    id: 'sonnenschutz-beschreibung',
    class: 'feld__beschreibung',
  });

  const zielTemperatur = zahlenfeld({
    id: 'feld-ziel',
    beschriftung: 'Wunschtemperatur',
    einheit: '°C',
    hilfe: 'Ab dieser Raumtemperatur lohnt sich aktives Kühlen.',
    erklaerung: INFO.zieltemperatur,
    grenzen: GRENZWERTE.zielTemperaturC,
    beiWert: (wert) => rueckrufe.beiAenderung({ zielTemperaturC: celsius(wert) }),
  });

  // Vorschlag nach dem adaptiven Komfortmodell: ein Knopf neben der Eingabe,
  // die er ändern würde. Als Kasten darunter beanspruchte er vier Zeilen für
  // eine einzige Zahl und schob beim Erscheinen das halbe Formular nach unten.
  // Die Begründung steht im Infofeld daneben, ausgeschrieben wiederholte sie
  // nur, was das Infofeld beim Feldnamen ohnehin sagt.
  const vorschlagKnopf = el('button', { type: 'button', class: 'knopf--klein' });
  const vorschlagBereich = el('span', { class: 'feld__vorschlag', hidden: true }, [
    vorschlagKnopf,
    infofeld(INFO.komfortvorschlag.thema, INFO.komfortvorschlag.text),
  ]);
  zielTemperatur.eingabezeile.append(vorschlagBereich);

  let vorschlagC: Celsius | undefined;
  vorschlagKnopf.addEventListener('click', () => {
    if (vorschlagC === undefined) return;
    rueckrufe.beiAenderung({ zielTemperaturC: vorschlagC });
  });

  const hysterese = zahlenfeld({
    id: 'feld-hysterese',
    beschriftung: 'Schaltdifferenz',
    einheit: 'Grad',
    hilfe: 'So viel kühler muss es draussen sein, damit Lüften empfohlen wird.',
    erklaerung: INFO.hysterese,
    grenzen: GRENZWERTE.hystereseK,
    beiWert: (wert) => rueckrufe.beiAenderung({ hystereseK: kelvin(wert) }),
  });

  const minTemperatur = zahlenfeld({
    id: 'feld-min',
    beschriftung: 'Untergrenze',
    einheit: '°C',
    hilfe: 'Darunter wird nicht weiter ausgekühlt.',
    erklaerung: INFO.untergrenze,
    grenzen: GRENZWERTE.minRaumtemperaturC,
    beiWert: (wert) => rueckrufe.beiAenderung({ minRaumtemperaturC: celsius(wert) }),
  });

  const nachtSchalter = el('input', { type: 'checkbox', id: 'feld-nacht' });
  const feiertagSchalter = el('input', { type: 'checkbox', id: 'feld-feiertage' });
  const ferienListe = el('ul', { class: 'ferienliste' });
  const ferienHinzufuegen = el('button', { type: 'button', class: 'knopf--klein' }, [
    'Zeitraum hinzufügen',
  ]);
  const ferienBereich = el('fieldset', { class: 'feldgruppe' }, [
    el('legend', { class: 'feld__titel' }, ['Ferien und freie Tage']),
    el('div', { class: 'feldgruppe__inhalt' }, [
      el('p', { class: 'feld__beschreibung' }, [
        'An diesen Tagen steht der Raum leer und heizt sich weniger auf. Schulferien sind kantonal geregelt und werden hier selbst eingetragen.',
      ]),
      el('div', { class: 'schalter' }, [
        feiertagSchalter,
        el('label', { for: 'feld-feiertage' }, [
          'Nationale Feiertage berücksichtigen (Neujahr, Ostern, Auffahrt, Pfingsten, 1. August, Weihnachten)',
        ]),
      ]),
      ferienListe,
      el('div', { class: 'knopfreihe' }, [ferienHinzufuegen]),
    ]),
  ]);

  // Verwirft alle Eingaben und steht deshalb abgesetzt am Fuss des Formulars,
  // nicht neben «Zeitraum hinzufügen», wo es wie eine weitere Eingabe wirkte.
  const zuruecksetzen = el('button', { type: 'button', class: 'knopf--zurueckhaltend' }, [
    'Auf Standardwerte zurücksetzen',
  ]);

  formular.append(
    el('fieldset', { class: 'feldgruppe' }, [
      el('legend', { class: 'feld__titel' }, ['Standort und Raum']),
      el('div', { class: 'feldgruppe__inhalt' }, [
        // Der Standort steht allein in einem Paar: So bekommt er die Breite
        // einer Rasterspalte und fluchtet mit dem Raumtyp darunter, statt eine
        // dritte Feldbreite einzuführen.
        el('div', { class: 'feldpaar' }, [
          el('div', { class: 'feld' }, [
            el('label', { for: 'feld-standort' }, ['Standort']),
            standortAuswahl,
          ]),
        ]),
        el('div', { class: 'feldpaar' }, [
          el('div', { class: 'feld' }, [
            el('label', { for: 'feld-raum' }, ['Raumtyp']),
            raumAuswahl,
            raumBeschreibung,
            raumKennwerte,
          ]),
          el('div', { class: 'feld' }, [
            el('label', { for: 'feld-gebaeude' }, ['Gebäudetyp']),
            gebaeudeAuswahl,
            gebaeudeBeschreibung,
            gebaeudeKennwerte,
          ]),
        ]),
      ]),
    ]),
    el('fieldset', { class: 'feldgruppe' }, [
      el('legend', { class: 'feld__titel' }, ['Fenster und Sonne']),
      el('div', { class: 'feldgruppe__inhalt' }, [
        el('div', { class: 'feldpaar' }, [
          el('div', { class: 'feld' }, [
            el('span', { class: 'feld__kopf' }, [
              el('label', { for: 'feld-ausrichtung' }, ['Fenster zeigen nach']),
              infofeld(INFO.ausrichtung.thema, INFO.ausrichtung.text),
            ]),
            ausrichtungAuswahl,
            ausrichtungBeschreibung,
          ]),
          el('div', { class: 'feld' }, [
            el('span', { class: 'feld__kopf' }, [
              el('label', { for: 'feld-sonnenschutz' }, ['Sonnenschutz']),
              infofeld(INFO.sonnenschutz.thema, INFO.sonnenschutz.text),
            ]),
            sonnenschutzAuswahl,
            sonnenschutzBeschreibung,
          ]),
        ]),
      ]),
    ]),
    el('fieldset', { class: 'feldgruppe' }, [
      el('legend', { class: 'feld__titel' }, ['Schwellwerte']),
      el('div', { class: 'feldgruppe__inhalt' }, [
        el('div', { class: 'feldpaar' }, [zielTemperatur.wurzel, hysterese.wurzel]),
        el('div', { class: 'feldpaar' }, [
          minTemperatur.wurzel,
          el('div', { class: 'feld' }, [
            el('span', { class: 'feld__titel' }, [
              'Nachtauskühlung',
              infofeld(INFO.nachtauskuehlung.thema, INFO.nachtauskuehlung.text),
            ]),
            el('div', { class: 'schalter' }, [
              nachtSchalter,
              el('label', { for: 'feld-nacht' }, [
                'Auch nachts und ausserhalb der Nutzungszeit zum Lüften auffordern, wenn es draussen kühler ist',
              ]),
            ]),
          ]),
        ]),
      ]),
    ]),
    ferienBereich,
    el('div', { class: 'knopfreihe knopfreihe--abschluss' }, [zuruecksetzen]),
  );

  standortAuswahl.addEventListener('change', () => {
    rueckrufe.beiAenderung({ stationId: standortAuswahl.value });
  });

  gebaeudeAuswahl.addEventListener('change', () => {
    rueckrufe.beiAenderung({ gebaeudetypId: gebaeudeAuswahl.value });
  });

  raumAuswahl.addEventListener('change', () => {
    rueckrufe.beiAenderung({ raumtypId: raumAuswahl.value });
  });

  ausrichtungAuswahl.addEventListener('change', () => {
    rueckrufe.beiAenderung({ ausrichtungId: ausrichtungAuswahl.value });
  });

  sonnenschutzAuswahl.addEventListener('change', () => {
    rueckrufe.beiAenderung({ sonnenschutzId: sonnenschutzAuswahl.value });
  });

  nachtSchalter.addEventListener('change', () => {
    rueckrufe.beiAenderung({ nachtauskuehlung: nachtSchalter.checked });
  });

  feiertagSchalter.addEventListener('change', () => {
    rueckrufe.beiAenderung({ feiertageBeachten: feiertagSchalter.checked });
  });

  zuruecksetzen.addEventListener('click', () => rueckrufe.beiZuruecksetzen());

  // Aktueller Stand der Ferienliste, damit die Zeilen daraus ableiten können.
  let ferien: Ferienzeitraum[] = [];
  const setzeFerien = (neue: Ferienzeitraum[]): void => rueckrufe.beiAenderung({ ferien: neue });

  ferienHinzufuegen.addEventListener('click', () => {
    if (ferien.length >= MAX_FERIENZEITRAEUME) return;
    setzeFerien([...ferien, neuerZeitraum()]);
  });

  /**
   * Zeichnet die Liste nur neu, wenn sich ihre Zusammensetzung ändert.
   * Beim Tippen in einem Feld bleibt der Fokus dadurch erhalten.
   */
  let letzteZusammensetzung = ' ';
  const zeigeFerien = (neue: Ferienzeitraum[]): void => {
    ferien = neue;
    ferienHinzufuegen.toggleAttribute('disabled', neue.length >= MAX_FERIENZEITRAEUME);

    const zusammensetzung = neue.map((zeitraum) => zeitraum.id).join(',');
    if (zusammensetzung === letzteZusammensetzung) return;
    letzteZusammensetzung = zusammensetzung;

    leere(ferienListe);
    if (neue.length === 0) {
      ferienListe.append(
        el('li', { class: 'feld__beschreibung' }, ['Noch keine Zeiträume eingetragen.']),
      );
      return;
    }
    ferienListe.append(
      ...neue.map((zeitraum) =>
        ferienZeile(zeitraum, {
          beiAenderung: (geaendert) =>
            setzeFerien(ferien.map((eintrag) => (eintrag.id === geaendert.id ? geaendert : eintrag))),
          beiEntfernen: () =>
            setzeFerien(ferien.filter((eintrag) => eintrag.id !== zeitraum.id)),
        }),
      ),
    );
  };

  let letzteEinstellungen: Einstellungen | undefined;

  const aktualisiere = (einstellungen: Einstellungen): void => {
    letzteEinstellungen = einstellungen;
    standortAuswahl.value = einstellungen.stationId;
    gebaeudeAuswahl.value = einstellungen.gebaeudetypId;
    raumAuswahl.value = einstellungen.raumtypId;
    nachtSchalter.checked = einstellungen.nachtauskuehlung;
    feiertagSchalter.checked = einstellungen.feiertageBeachten;
    zeigeFerien(einstellungen.ferien);
    // Ferien wirken nur bei Nutzungen, die darauf Rücksicht nehmen.
    ferienBereich.hidden = findeRaumtyp(einstellungen.raumtypId)?.beachtetFerien !== true;
    zielTemperatur.setzeWert(einstellungen.zielTemperaturC);
    hysterese.setzeWert(einstellungen.hystereseK);
    minTemperatur.setzeWert(einstellungen.minRaumtemperaturC);
    ausrichtungAuswahl.value = einstellungen.ausrichtungId;
    sonnenschutzAuswahl.value = einstellungen.sonnenschutzId;
    ausrichtungBeschreibung.textContent =
      findeAusrichtung(einstellungen.ausrichtungId)?.hinweis ?? '';
    sonnenschutzBeschreibung.textContent =
      findeSonnenschutz(einstellungen.sonnenschutzId)?.beschreibung ?? '';
    zeigeGebaeudeInfo(einstellungen.gebaeudetypId, gebaeudeBeschreibung, gebaeudeKennwerte);
    zeigeRaumInfo(einstellungen, raumBeschreibung, raumKennwerte);
    zusammenfassung.textContent = fasseZusammen(einstellungen);
    // Erreicht die Wunschtemperatur den Vorschlag, blendet er sich aus.
    zeigeTemperaturvorschlag(vorschlagC);
  };

  /**
   * Der Vorschlag verschwindet, sobald er erreicht ist, sonst stünde dauerhaft
   * eine Aufforderung da, die nichts mehr bewirkt.
   */
  const zeigeTemperaturvorschlag = (neuC: Celsius | undefined): void => {
    vorschlagC = neuC;
    const zeigen = neuC !== undefined && neuC !== letzteEinstellungen?.zielTemperaturC;
    vorschlagBereich.hidden = !zeigen;
    if (!zeigen || neuC === undefined) return;

    // Der sichtbare Text ist Teil des aria-labels, so trifft ihn auch, wer den
    // Knopf per Sprache anspricht.
    vorschlagKnopf.textContent = `${formatiereTemperatur(neuC)} übernehmen`;
    vorschlagKnopf.setAttribute(
      'aria-label',
      `Wunschtemperatur auf ${formatiereTemperatur(neuC)} übernehmen`,
    );
  };

  aktualisiere(start);
  return { aktualisiere, zeigeTemperaturvorschlag };
}

/**
 * Einzeiler über der eingeklappten Karte: worauf sich die Empfehlung stützt.
 *
 * Ohne ihn müsste man aufklappen, nur um zu sehen, für welchen Ort und welchen
 * Raum gerechnet wird, die Angaben, die eine Empfehlung überhaupt erst
 * einordnen.
 */
function fasseZusammen(einstellungen: Einstellungen): string {
  return [
    findeStation(einstellungen.stationId)?.name,
    findeRaumtyp(einstellungen.raumtypId)?.name,
    findeGebaeudetyp(einstellungen.gebaeudetypId)?.name,
    findeAusrichtung(einstellungen.ausrichtungId)?.name,
    findeSonnenschutz(einstellungen.sonnenschutzId)?.kurzname,
  ]
    .filter((teil): teil is string => teil !== undefined)
    .join(' · ');
}

/** Beschreibung und abgeleitete Kennwerte des gewählten Gebäudetyps anzeigen. */
function zeigeGebaeudeInfo(
  gebaeudetypId: string,
  beschreibung: HTMLElement,
  kennwerte: HTMLElement,
): void {
  const typ = findeGebaeudetyp(gebaeudetypId);
  leere(kennwerte);
  if (!typ) {
    beschreibung.textContent = '';
    return;
  }

  beschreibung.textContent = typ.beschreibung;

  const daempfungProzent = Math.round(amplitudendaempfung(typ.zeitkonstanteGeschlossenH) * 100);
  const verzoegerung = phasenverschiebungH(typ.zeitkonstanteGeschlossenH);

  kennwerte.append(
    chip([
      `Wärmeträgheit ${typ.zeitkonstanteGeschlossenH} h`,
      infofeld(INFO.gebaeudetyp.thema, INFO.gebaeudetyp.text),
    ]),
    chip([`${daempfungProzent} % der Aussenschwankung`]),
    chip([`${verzoegerung.toFixed(1)} h Verzögerung`]),
  );
}

/** Kurzer Kennwert als abgesetztes Etikett. */
function chip(inhalt: (Node | string)[]): HTMLElement {
  return el('li', { class: 'kennwert' }, inhalt);
}

/** Erklärender Satz zu den Kennwerten, volle Breite statt Etikett. */
function kennwertSatz(text: string): HTMLElement {
  return el('li', { class: 'kennwert kennwert--satz' }, [text]);
}

/**
 * Beschreibung und Kennwerte des gewählten Raumtyps anzeigen.
 *
 * Der Temperaturanstieg durch die Belegung wird bewusst zusammen mit dem
 * Gebäudetyp gerechnet: Erst diese Kombination macht sichtbar, dass dieselbe
 * Klasse im Leichtbau viel schneller aufheizt als im Altbau.
 */
function zeigeRaumInfo(
  einstellungen: Einstellungen,
  beschreibung: HTMLElement,
  kennwerte: HTMLElement,
): void {
  const raum = findeRaumtyp(einstellungen.raumtypId);
  const gebaeude = findeGebaeudetyp(einstellungen.gebaeudetypId);
  leere(kennwerte);
  if (!raum) {
    beschreibung.textContent = '';
    return;
  }

  beschreibung.textContent = raum.beschreibung;

  const tage = raum.belegung.nurWerktags ? 'Mo–Fr' : 'täglich';
  const von = String(raum.belegung.vonStunde).padStart(2, '0');
  const bis = String(raum.belegung.bisStunde).padStart(2, '0');

  kennwerte.append(
    chip([`Belegt ${tage} ${von}–${bis} Uhr`]),
    chip([
      `Wärmelast ${raum.belegungslastWProM2} W/m²`,
      infofeld(INFO.raumtyp.thema, INFO.raumtyp.text),
    ]),
  );

  if (gebaeude) {
    const anstiegKProH = raum.belegungslastWProM2 / gebaeude.speicherkapazitaetWhProM2K;
    kennwerte.append(
      kennwertSatz(`Das erwärmt diesen Raum um rund ${anstiegKProH.toFixed(1)} Grad pro Stunde.`),
    );
  }

  if (raum.stosslueftungNoetig) {
    kennwerte.append(kennwertSatz('Braucht auch bei Hitze regelmässige Stosslüftung.'));
  }

  if (raum.feuchtelastStossweise) {
    kennwerte.append(
      kennwertSatz(
        'Nach Duschen, Kochen und Wäschetrocknen kurz kräftig lüften, unabhängig von der Temperatur.',
      ),
    );
  }
}

/**
 * Neuer Zeitraum: ab heute für eine Woche, die häufigste Eingabe.
 *
 * «Heute» ist der Schweizer Kalendertag, nicht der des Geräts: Die Ferientage
 * werden später gegen Zeitstempel in Stationszeit geprüft. Auf einem Gerät in
 * einer östlicheren Zeitzone begänne der Zeitraum abends sonst einen Tag zu spät.
 */
function neuerZeitraum(): Ferienzeitraum {
  const heute = jetztInStationszeit();
  const inEinerWoche = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate() + 6);

  return {
    id: erzeugeId(),
    name: 'Ferien',
    von: datumsSchluessel(heute),
    bis: datumsSchluessel(inEinerWoche),
  };
}

interface FerienzeileRueckrufe {
  beiAenderung(zeitraum: Ferienzeitraum): void;
  beiEntfernen(): void;
}

/**
 * Eine Zeile der Ferienliste: Bezeichnung, Anfang, Ende, Entfernen.
 *
 * Liegt das Ende vor dem Anfang, wird es stillschweigend nachgeführt, das ist
 * verständlicher als eine Fehlermeldung und kann keinen ungültigen Zustand
 * erzeugen.
 */
function ferienZeile(zeitraum: Ferienzeitraum, rueckrufe: FerienzeileRueckrufe): HTMLElement {
  const name = el('input', {
    type: 'text',
    value: zeitraum.name,
    maxlength: 60,
    'aria-label': 'Bezeichnung des Zeitraums',
    placeholder: 'Bezeichnung',
  });
  const von = el('input', { type: 'date', value: zeitraum.von, 'aria-label': 'Erster freier Tag' });
  const bis = el('input', { type: 'date', value: zeitraum.bis, 'aria-label': 'Letzter freier Tag' });

  const melde = (): void => {
    if (!von.value || !bis.value) return;
    if (bis.value < von.value) bis.value = von.value;

    rueckrufe.beiAenderung({
      id: zeitraum.id,
      name: name.value.trim() || 'Ferien',
      von: von.value,
      bis: bis.value,
    });
  };

  name.addEventListener('input', melde);
  von.addEventListener('change', melde);
  bis.addEventListener('change', melde);

  const entfernen = el(
    'button',
    { type: 'button', class: 'knopf--klein', 'aria-label': `${zeitraum.name} entfernen` },
    ['Entfernen'],
  );
  entfernen.addEventListener('click', () => rueckrufe.beiEntfernen());

  return el('li', { class: 'ferienzeile' }, [
    name,
    el('span', { class: 'ferienzeile__zeitraum' }, [von, el('span', {}, ['bis']), bis]),
    entfernen,
  ]);
}

interface ZahlenfeldOptionen {
  id: string;
  beschriftung: string;
  einheit: string;
  hilfe: string;
  /** Physik und Annahmen hinter dem Wert, als Infofeld neben der Beschriftung. */
  erklaerung?: { thema: string; text: string };
  grenzen: { readonly min: number; readonly max: number; readonly schritt: number };
  beiWert(wert: number): void;
}

interface Zahlenfeld {
  wurzel: HTMLElement;
  /** Zeile mit Eingabe und Schrittknöpfen, nimmt Beigaben wie den Vorschlag auf. */
  eingabezeile: HTMLElement;
  setzeWert(wert: number): void;
}

/**
 * Zahlenfeld mit Bereichsprüfung: Ungültige Zwischenstände (leeres Feld,
 * Wert ausserhalb der Grenzen) werden nicht übernommen, sondern beim Verlassen
 * des Feldes auf den zuletzt gültigen Wert zurückgesetzt.
 *
 * Die Knöpfe «−» und «+» ergänzen die Tastatureingabe. Auf dem Mobilgerät sind
 * sie der schnellere Weg: Für einen Wert, der sich um halbe Grad ändert, muss
 * dafür keine Zifferntastatur aufgehen. Die eigenen Pfeilchen der
 * Zahleneingabe sind mit knapp 10 px zu klein für einen Finger.
 */
function zahlenfeld(optionen: ZahlenfeldOptionen): Zahlenfeld {
  const { grenzen } = optionen;
  const hilfeId = `${optionen.id}-hilfe`;
  let letzterWert = grenzen.min;

  const eingabe = el('input', {
    type: 'number',
    id: optionen.id,
    inputmode: 'decimal',
    min: grenzen.min,
    max: grenzen.max,
    step: grenzen.schritt,
    'aria-describedby': hilfeId,
  });

  const uebernehmen = (): void => {
    const wert = Number(eingabe.value);
    const gueltig = eingabe.value !== '' && Number.isFinite(wert) && wert >= grenzen.min && wert <= grenzen.max;
    eingabe.setAttribute('aria-invalid', gueltig ? 'false' : 'true');
    if (!gueltig) return;
    letzterWert = wert;
    aktualisiereKnoepfe();
    optionen.beiWert(wert);
  };

  eingabe.addEventListener('input', uebernehmen);
  eingabe.addEventListener('blur', () => {
    eingabe.value = String(letzterWert);
    eingabe.setAttribute('aria-invalid', 'false');
  });

  const weniger = el(
    'button',
    {
      type: 'button',
      class: 'stepper__knopf',
      'aria-label': `${optionen.beschriftung} verringern`,
      tabindex: -1,
    },
    ['−'],
  );
  const mehr = el(
    'button',
    {
      type: 'button',
      class: 'stepper__knopf',
      'aria-label': `${optionen.beschriftung} erhöhen`,
      tabindex: -1,
    },
    ['+'],
  );

  // Die Knöpfe stehen bewusst ausserhalb der Tabulatorreihenfolge: Das Feld
  // selbst nimmt Pfeiltasten schon entgegen, ein dritter Halt je Wert würde
  // die Tastaturbedienung nur verlängern. Für Zeigegeräte bleiben sie nutzbar.
  const verschiebe = (richtung: 1 | -1): void => {
    const roh = letzterWert + richtung * grenzen.schritt;
    const wert = begrenze(runde(roh, grenzen.schritt), grenzen.min, grenzen.max);
    if (wert === letzterWert) return;
    letzterWert = wert;
    eingabe.value = String(wert);
    eingabe.setAttribute('aria-invalid', 'false');
    aktualisiereKnoepfe();
    optionen.beiWert(wert);
  };

  weniger.addEventListener('click', () => verschiebe(-1));
  mehr.addEventListener('click', () => verschiebe(1));

  const aktualisiereKnoepfe = (): void => {
    weniger.toggleAttribute('disabled', letzterWert <= grenzen.min);
    mehr.toggleAttribute('disabled', letzterWert >= grenzen.max);
  };

  const beschriftung = el('label', { for: optionen.id }, [
    `${optionen.beschriftung} (${optionen.einheit})`,
  ]);

  const eingabezeile = el('div', { class: 'eingabezeile' }, [
    el('div', { class: 'stepper' }, [weniger, eingabe, mehr]),
  ]);

  const wurzel = el('div', { class: 'feld' }, [
    optionen.erklaerung
      ? el('span', { class: 'feld__kopf' }, [
          beschriftung,
          infofeld(optionen.erklaerung.thema, optionen.erklaerung.text),
        ])
      : beschriftung,
    eingabezeile,
    el('p', { class: 'feld__beschreibung', id: hilfeId }, [optionen.hilfe]),
  ]);

  return {
    wurzel,
    eingabezeile,
    setzeWert(wert: number) {
      letzterWert = wert;
      eingabe.value = String(wert);
      aktualisiereKnoepfe();
    },
  };
}

/** Auf das Raster der Schrittweite runden, gegen 24.400000000000002. */
function runde(wert: number, schritt: number): number {
  const stellen = (String(schritt).split('.')[1] ?? '').length;
  return Number((Math.round(wert / schritt) * schritt).toFixed(stellen));
}

function begrenze(wert: number, min: number, max: number): number {
  return Math.min(Math.max(wert, min), max);
}
