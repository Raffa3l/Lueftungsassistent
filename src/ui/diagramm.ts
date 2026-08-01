import type { SimulationsStunde } from '../typen.ts';
import { fasseStatusbloeckeZusammen } from '../logik/lueftungslogik.ts';
import { celsius } from '../einheiten.ts';
import { formatiereTemperatur, formatiereUhrzeit } from '../logik/format.ts';
import { el, leere, svgEl } from './dom.ts';

/**
 * Tagesverlauf Innen gegen Aussen als Liniendiagramm.
 *
 * Gestaltungsentscheide:
 *  - Zwei Serien in Blau und Orange (auf Farbfehlsichtigkeit geprüft), zusätzlich
 *    direkt beschriftet und in der Legende erklärt – die Zuordnung hängt nie
 *    allein an der Farbe. Die Tabelle darunter ist die textliche Entsprechung.
 *  - Das Vergleichsszenario «ohne Lüften» ist bewusst keine dritte Buntfarbe,
 *    sondern eine gestrichelte graue Linie: es ist Kontext, keine Hauptaussage.
 *  - Grün hinterlegte Bereiche markieren die empfohlenen Lüftungsfenster.
 *  - Das Diagramm wird bei Grössenänderung neu gezeichnet, damit Beschriftungen
 *    auf dem Mobilgerät nicht mitskaliert und unleserlich werden.
 */

export interface DiagrammDaten {
  stunden: readonly SimulationsStunde[];
  jetztIndex: number;
  /** Vergleichslinie «Fenster immer geschlossen» einblenden. */
  zeigeVergleich: boolean;
}

const RAND = { oben: 18, rechts: 12, unten: 30, links: 38 };
const BESCHRIFTUNG_BREITE = 44; // Platz für die Direktbeschriftung am Linienende
const STUNDEN_RUECKBLICK = 6;
const STUNDEN_VORSCHAU = 42;

export class Temperaturdiagramm {
  private daten: DiagrammDaten | undefined;
  private readonly flaeche: HTMLElement;
  private readonly hinweisfeld: HTMLElement;

  constructor(private readonly behaelter: HTMLElement) {
    leere(behaelter);
    this.flaeche = el('div');
    this.hinweisfeld = el('div', { class: 'diagramm__hinweisfeld', 'data-sichtbar': 'false' });
    behaelter.append(this.flaeche, this.hinweisfeld);

    // Neu zeichnen, wenn sich die verfügbare Breite ändert (Drehen des Geräts).
    new ResizeObserver(() => this.zeichne()).observe(behaelter);
  }

  aktualisiere(daten: DiagrammDaten): void {
    this.daten = daten;
    this.zeichne();
  }

  private zeichne(): void {
    const daten = this.daten;
    const breite = this.behaelter.clientWidth;
    if (!daten || breite < 100) return;

    const ausschnitt = schneideAusschnitt(daten);
    if (ausschnitt.stunden.length < 2) return;

    const hoehe = Math.round(Math.min(320, Math.max(220, breite * 0.5)));
    const mitDirektbeschriftung = breite >= 480;
    const randRechts = RAND.rechts + (mitDirektbeschriftung ? BESCHRIFTUNG_BREITE : 0);
    const zeichenBreite = breite - RAND.links - randRechts;
    const zeichenHoehe = hoehe - RAND.oben - RAND.unten;

    const { stunden, jetztIndex } = ausschnitt;
    const bereich = temperaturbereich(stunden, daten.zeigeVergleich);

    const x = (index: number): number =>
      RAND.links + (index / (stunden.length - 1)) * zeichenBreite;
    const y = (temperatur: number): number =>
      RAND.oben +
      zeichenHoehe -
      ((temperatur - bereich.min) / (bereich.max - bereich.min)) * zeichenHoehe;

    const svg = svgEl('svg', {
      viewBox: `0 0 ${breite} ${hoehe}`,
      width: breite,
      height: hoehe,
      role: 'img',
      'aria-label': beschreibeDiagramm(stunden),
    });

    svg.append(
      ...lueftungsfenster(stunden, x, zeichenHoehe),
      ...rasterlinien(bereich, y, zeichenBreite),
      // Auf schmalen Geräten nur alle 12 Stunden beschriften, sonst überlappt es.
      ...zeitachse(stunden, x, hoehe, zeichenBreite / stunden.length < 7 ? 12 : 6),
      jetztMarkierung(x(jetztIndex), hoehe),
    );

    if (daten.zeigeVergleich) {
      svg.append(
        linie(stunden.map((s, i) => [x(i), y(s.raumtemperaturOhneLueftungC)]), {
          style: 'stroke: var(--serie-vergleich)',
          'stroke-width': 2,
          'stroke-dasharray': '5 4',
        }),
      );
    }

    svg.append(
      linie(stunden.map((s, i) => [x(i), y(s.aussentemperaturC)]), {
        style: 'stroke: var(--serie-aussen)',
        'stroke-width': 2,
      }),
      linie(stunden.map((s, i) => [x(i), y(s.raumtemperaturC)]), {
        style: 'stroke: var(--serie-innen)',
        'stroke-width': 2,
      }),
    );

    if (mitDirektbeschriftung) {
      const letzte = stunden[stunden.length - 1]!;
      svg.append(
        direktbeschriftung('Aussen', x(stunden.length - 1) + 8, y(letzte.aussentemperaturC), 'var(--serie-aussen)'),
        direktbeschriftung('Drinnen', x(stunden.length - 1) + 8, y(letzte.raumtemperaturC), 'var(--serie-innen)'),
      );
    }

    const fadenkreuz = svgEl('g', { opacity: '0' }, [
      svgEl('line', {
        y1: RAND.oben,
        y2: RAND.oben + zeichenHoehe,
        style: 'stroke: var(--schrift-gedaempft)',
        'stroke-width': 1,
      }),
      punkt('var(--serie-aussen)'),
      punkt('var(--serie-innen)'),
    ]);
    svg.append(fadenkreuz);

    leere(this.flaeche);
    this.flaeche.append(svg);
    this.verbindeZeiger(svg, ausschnitt, x, y, fadenkreuz, zeichenBreite);
  }

  /** Fadenkreuz und Hinweisfeld an den Zeiger koppeln (Maus wie Finger). */
  private verbindeZeiger(
    svg: SVGSVGElement,
    ausschnitt: Ausschnitt,
    x: (index: number) => number,
    y: (temperatur: number) => number,
    fadenkreuz: SVGGElement,
    zeichenBreite: number,
  ): void {
    const { stunden } = ausschnitt;

    const zeige = (klientX: number): void => {
      const kasten = svg.getBoundingClientRect();
      const relativ = klientX - kasten.left - RAND.links;
      const anteil = Math.min(1, Math.max(0, relativ / zeichenBreite));
      const index = Math.round(anteil * (stunden.length - 1));
      const stunde = stunden[index];
      if (!stunde) return;

      const px = x(index);
      fadenkreuz.setAttribute('opacity', '1');
      const [senkrechte, punktAussen, punktInnen] = fadenkreuz.children;
      senkrechte?.setAttribute('x1', String(px));
      senkrechte?.setAttribute('x2', String(px));
      setzePunkt(punktAussen, px, y(stunde.aussentemperaturC));
      setzePunkt(punktInnen, px, y(stunde.raumtemperaturC));

      this.zeigeHinweisfeld(stunde, px);
    };

    const verbergen = (): void => {
      fadenkreuz.setAttribute('opacity', '0');
      this.hinweisfeld.dataset['sichtbar'] = 'false';
    };

    svg.addEventListener('pointermove', (ereignis) => zeige(ereignis.clientX));
    svg.addEventListener('pointerdown', (ereignis) => zeige(ereignis.clientX));
    svg.addEventListener('pointerleave', verbergen);
    svg.addEventListener('pointercancel', verbergen);
  }

  private zeigeHinweisfeld(stunde: SimulationsStunde, px: number): void {
    leere(this.hinweisfeld);
    this.hinweisfeld.append(
      el('div', { class: 'hinweisfeld__zeit' }, [
        `${stunde.zeit.toLocaleDateString('de-CH', { weekday: 'short' })}, ${formatiereUhrzeit(stunde.zeit)}`,
      ]),
      hinweiszeile('Draussen', formatiereTemperatur(stunde.aussentemperaturC), 'var(--serie-aussen)'),
      hinweiszeile('Drinnen', formatiereTemperatur(stunde.raumtemperaturC), 'var(--serie-innen)'),
      el('div', { class: 'hinweisfeld__zeile' }, [
        stunde.empfehlung.status === 'oeffnen' ? 'Fenster offen' : 'Fenster zu',
      ]),
    );

    this.hinweisfeld.dataset['sichtbar'] = 'true';

    // Innerhalb des Diagramms halten, damit es am Rand nicht abgeschnitten wird.
    const eigeneBreite = this.hinweisfeld.offsetWidth;
    const maximum = this.behaelter.clientWidth - eigeneBreite - 4;
    const links = Math.min(Math.max(4, px - eigeneBreite / 2), Math.max(4, maximum));
    this.hinweisfeld.style.left = `${links}px`;
    this.hinweisfeld.style.top = '4px';
  }
}

interface Ausschnitt {
  stunden: SimulationsStunde[];
  jetztIndex: number;
}

/** Beschränkt die Darstellung auf ein gut lesbares Zeitfenster um «jetzt». */
function schneideAusschnitt(daten: DiagrammDaten): Ausschnitt {
  const von = Math.max(0, daten.jetztIndex - STUNDEN_RUECKBLICK);
  const bis = Math.min(daten.stunden.length, daten.jetztIndex + STUNDEN_VORSCHAU + 1);
  return {
    stunden: daten.stunden.slice(von, bis),
    jetztIndex: daten.jetztIndex - von,
  };
}

function temperaturbereich(
  stunden: readonly SimulationsStunde[],
  mitVergleich: boolean,
): { min: number; max: number } {
  const werte = stunden.flatMap((stunde) => [
    stunde.aussentemperaturC,
    stunde.raumtemperaturC,
    ...(mitVergleich ? [stunde.raumtemperaturOhneLueftungC] : []),
  ]);

  const min = Math.floor(Math.min(...werte) - 1);
  const max = Math.ceil(Math.max(...werte) + 1);
  // Mindestspanne, damit eine flache Kurve nicht als Zickzack erscheint.
  return max - min < 6 ? { min: min - 1, max: min + 5 } : { min, max };
}

/** Grün hinterlegte Zeitfenster, in denen Lüften empfohlen wird. */
function lueftungsfenster(
  stunden: readonly SimulationsStunde[],
  x: (index: number) => number,
  zeichenHoehe: number,
): SVGElement[] {
  return fasseStatusbloeckeZusammen(stunden)
    .filter((block) => block.status === 'oeffnen')
    .map((block) => {
      const von = x(Math.max(0, block.vonIndex - 0.5));
      const bis = x(Math.min(stunden.length - 1, block.bisIndex - 0.5));
      return svgEl('rect', {
        x: von,
        y: RAND.oben,
        width: Math.max(1, bis - von),
        height: zeichenHoehe,
        style: 'fill: var(--status-offen-flaeche)',
      });
    });
}

function rasterlinien(
  bereich: { min: number; max: number },
  y: (temperatur: number) => number,
  zeichenBreite: number,
): SVGElement[] {
  const spanne = bereich.max - bereich.min;
  const schritt = spanne <= 12 ? 2 : spanne <= 25 ? 5 : 10;
  const elemente: SVGElement[] = [];

  const start = Math.ceil(bereich.min / schritt) * schritt;
  for (let wert = start; wert <= bereich.max; wert += schritt) {
    const py = y(wert);
    elemente.push(
      svgEl('line', {
        x1: RAND.links,
        x2: RAND.links + zeichenBreite,
        y1: py,
        y2: py,
        style: 'stroke: var(--linie-raster)',
        'stroke-width': 1,
      }),
      svgEl(
        'text',
        {
          x: RAND.links - 8,
          y: py + 4,
          'text-anchor': 'end',
          style: 'fill: var(--schrift-gedaempft); font-size: 11px',
        },
        [String(wert)],
      ),
    );
  }

  return elemente;
}

function zeitachse(
  stunden: readonly SimulationsStunde[],
  x: (index: number) => number,
  hoehe: number,
  schrittStunden: number,
): SVGElement[] {
  const elemente: SVGElement[] = [];

  stunden.forEach((stunde, index) => {
    const stundeDesTages = stunde.zeit.getHours();
    if (stundeDesTages % schrittStunden !== 0) return;

    const px = x(index);
    const mitternacht = stundeDesTages === 0;
    if (mitternacht) {
      elemente.push(
        svgEl('line', {
          x1: px,
          x2: px,
          y1: RAND.oben,
          y2: hoehe - RAND.unten,
          style: 'stroke: var(--linie-achse)',
          'stroke-width': 1,
        }),
      );
    }

    elemente.push(
      svgEl(
        'text',
        {
          x: px,
          y: hoehe - RAND.unten + 16,
          'text-anchor': 'middle',
          style: 'fill: var(--schrift-gedaempft); font-size: 11px',
        },
        [
          mitternacht
            ? stunde.zeit.toLocaleDateString('de-CH', { weekday: 'short' })
            : formatiereUhrzeit(stunde.zeit),
        ],
      ),
    );
  });

  return elemente;
}

function jetztMarkierung(px: number, hoehe: number): SVGElement {
  return svgEl('g', {}, [
    svgEl('line', {
      x1: px,
      x2: px,
      y1: RAND.oben - 6,
      y2: hoehe - RAND.unten,
      style: 'stroke: var(--schrift-sekundaer)',
      'stroke-width': 1,
      'stroke-dasharray': '3 3',
    }),
    svgEl(
      'text',
      {
        x: px,
        y: RAND.oben - 8,
        'text-anchor': 'middle',
        style: 'fill: var(--schrift-sekundaer); font-size: 11px; font-weight: 600',
      },
      ['jetzt'],
    ),
  ]);
}

function linie(
  punkte: readonly [number, number][],
  attribute: Record<string, string | number>,
): SVGElement {
  return svgEl('polyline', {
    points: punkte.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' '),
    fill: 'none',
    'stroke-linejoin': 'round',
    'stroke-linecap': 'round',
    ...attribute,
  });
}

function direktbeschriftung(text: string, px: number, py: number, farbe: string): SVGElement {
  return svgEl(
    'text',
    {
      x: px,
      y: py + 4,
      style: `fill: ${farbe}; font-size: 11px; font-weight: 600`,
    },
    [text],
  );
}

function punkt(farbe: string): SVGElement {
  return svgEl('circle', {
    r: 4.5,
    style: `fill: ${farbe}`,
    stroke: 'var(--flaeche-karte)',
    'stroke-width': 2,
  });
}

function setzePunkt(element: Element | undefined, px: number, py: number): void {
  element?.setAttribute('cx', String(px));
  element?.setAttribute('cy', String(py));
}

function hinweiszeile(bezeichnung: string, wert: string, farbe: string): HTMLElement {
  return el('div', { class: 'hinweisfeld__zeile' }, [
    el('span', { class: 'marke', style: `--marke-farbe: ${farbe}; background: ${farbe}` }),
    bezeichnung,
    el('span', { class: 'hinweisfeld__wert' }, [wert]),
  ]);
}

/** Textliche Kurzfassung des Diagramms für Screenreader. */
function beschreibeDiagramm(stunden: readonly SimulationsStunde[]): string {
  const aussen = stunden.map((s) => s.aussentemperaturC);
  const innen = stunden.map((s) => s.raumtemperaturC);
  return (
    `Temperaturverlauf über ${stunden.length} Stunden. ` +
    `Draussen zwischen ${formatiereTemperatur(celsius(Math.min(...aussen)), 0)} und ${formatiereTemperatur(celsius(Math.max(...aussen)), 0)}, ` +
    `drinnen zwischen ${formatiereTemperatur(celsius(Math.min(...innen)), 0)} und ${formatiereTemperatur(celsius(Math.max(...innen)), 0)}. ` +
    'Die Einzelwerte stehen in der Tabelle «Stunde für Stunde».'
  );
}

/** Legende zum Diagramm, inklusive Schalter für die Vergleichslinie. */
export function baueLegende(
  behaelter: HTMLElement,
  zeigeVergleich: boolean,
  beiUmschalten: (aktiv: boolean) => void,
): void {
  leere(behaelter);

  const schalter = el('input', { type: 'checkbox', id: 'vergleich-schalter' });
  schalter.checked = zeigeVergleich;
  schalter.addEventListener('change', () => beiUmschalten(schalter.checked));

  behaelter.append(
    legendeneintrag('Aussentemperatur', 'var(--serie-aussen)'),
    legendeneintrag('Raumtemperatur (berechnet)', 'var(--serie-innen)'),
    el('span', { class: 'legende__eintrag' }, [
      el('span', { class: 'marke marke--flaeche' }),
      'Lüften empfohlen',
    ]),
    el('span', { class: 'legende__eintrag' }, [
      schalter,
      el('label', { for: 'vergleich-schalter' }, ['Vergleich: ohne Lüften']),
    ]),
  );
}

function legendeneintrag(text: string, farbe: string): HTMLElement {
  return el('span', { class: 'legende__eintrag' }, [
    el('span', { class: 'marke', style: `background: ${farbe}` }),
    text,
  ]);
}
