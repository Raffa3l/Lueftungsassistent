import type { Fensterstatus, Hinweisart } from '../typen.ts';
import { svgEl } from './dom.ts';

/**
 * Symbole als Inline-SVG.
 *
 * Jedes Symbol ist rein dekorativ (`aria-hidden`): Die Bedeutung steht immer
 * zusätzlich als Text daneben, damit sie nie allein an der Farbe hängt.
 */

function symbol(pfade: string[], strichbreite = 1.6): SVGSVGElement {
  return svgEl(
    'svg',
    {
      viewBox: '0 0 24 24',
      // Grundgrösse als Attribut, damit ein Symbol ohne CSS nicht den
      // ganzen Container ausfüllt; die Gestaltung darf sie überschreiben.
      width: 16,
      height: 16,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': strichbreite,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    pfade.map((d) => svgEl('path', { d })),
  );
}

/** Geschlossenes Fenster: Rahmen mit Kreuz und Griff. */
export function symbolFensterZu(): SVGSVGElement {
  return symbol(['M4 3h16v18H4z', 'M12 3v18', 'M4 12h16', 'M20 12h2']);
}

/** Offenes Fenster: aufgeschwenkter Flügel. */
export function symbolFensterOffen(): SVGSVGElement {
  return symbol(['M4 3h8v18H4z', 'M12 6l8-3v18l-8-3', 'M8 12h.01']);
}

/** Sonne – steht für die Aussentemperatur. */
export function symbolSonne(): SVGSVGElement {
  return symbol([
    'M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14z',
    'M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  ]);
}

/** Thermometer – steht für die Raumtemperatur. */
export function symbolThermometer(): SVGSVGElement {
  return symbol(['M14 14.8V4a2 2 0 1 0-4 0v10.8a4 4 0 1 0 4 0z', 'M12 8v7']);
}

/** Uhr – steht für den nächsten Wechsel. */
export function symbolUhr(): SVGSVGElement {
  return symbol(['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7v5l3 2']);
}

/** Luftströmung – steht für die Stosslüftung wegen der Luftqualität. */
export function symbolLuft(): SVGSVGElement {
  return symbol([
    'M3 8h9a3 3 0 1 0-3-3',
    'M3 12h13a3 3 0 1 1-3 3',
    'M3 16h6a2.5 2.5 0 1 1-2.5 2.5',
  ]);
}

/** Mond – steht für die Nachtauskühlung. */
export function symbolMond(): SVGSVGElement {
  return symbol(['M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z']);
}

/** Tropfen – steht für Luftfeuchtigkeit und Kondensationsgefahr. */
export function symbolTropfen(): SVGSVGElement {
  return symbol(['M12 3.5c3.5 4 6 7.1 6 10a6 6 0 0 1-12 0c0-2.9 2.5-6 6-10z']);
}

/** Böen – stehen für den Wind draussen, im Unterschied zur Raumluft. */
export function symbolWind(): SVGSVGElement {
  return symbol(['M2 9h13a3 3 0 1 0-3-3', 'M2 15h9a2.5 2.5 0 1 1-2.5 2.5']);
}

/** Rotor – steht für Luftbewegung im Raum (Ventilator). */
export function symbolVentilator(): SVGSVGElement {
  return symbol([
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
    'M12 12V6',
    'M12 12l5.2 3',
    'M12 12l-5.2 3',
    'M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
  ]);
}

/** Fragezeichen im Kreis – öffnet die Erklärung zur Physik dahinter. */
/** Warndreieck – steht für drohenden Sturm- oder Wasserschaden. */
export function symbolWarnung(): SVGSVGElement {
  return symbol(['M12 3.5 22 20.5H2z', 'M12 10v4.5', 'M12 17.5h.01']);
}

export function symbolInfo(): SVGSVGElement {
  return symbol([
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
    'M9.8 9.3a2.3 2.3 0 1 1 2.7 2.6v1.6',
    'M12.5 16.8h.01',
  ]);
}

/** Passendes Fenstersymbol zum Status. */
export function symbolFuerStatus(status: Fensterstatus): SVGSVGElement {
  return status === 'oeffnen' ? symbolFensterOffen() : symbolFensterZu();
}

/** Passendes Symbol zur Art eines Zusatzhinweises. */
export function symbolFuerHinweis(art: Hinweisart): SVGSVGElement {
  switch (art) {
    case 'wetterschutz':
      return symbolWarnung();
    case 'luftqualitaet':
      return symbolLuft();
    case 'feuchte':
      return symbolTropfen();
    case 'wind':
      return symbolWind();
    case 'kuehlung':
      return symbolVentilator();
  }
}
