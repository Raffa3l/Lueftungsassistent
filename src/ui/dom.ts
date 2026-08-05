/**
 * Kleine DOM-Helfer.
 *
 * Alle Inhalte werden über `textContent` bzw. `setAttribute` gesetzt, es wird
 * nirgends HTML aus Daten zusammengebaut.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

type Kind = Node | string | undefined | false;

/** Erzeugt ein HTML-Element mit Attributen und Kindern. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attribute: Record<string, string | number | boolean | undefined> = {},
  kinder: Kind[] = [],
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  setzeAttribute(element, attribute);
  haengeAn(element, kinder);
  return element;
}

/** Erzeugt ein SVG-Element (eigener Namensraum). */
export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attribute: Record<string, string | number | boolean | undefined> = {},
  kinder: Kind[] = [],
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  setzeAttribute(element, attribute);
  haengeAn(element, kinder);
  return element;
}

function setzeAttribute(
  element: Element,
  attribute: Record<string, string | number | boolean | undefined>,
): void {
  for (const [name, wert] of Object.entries(attribute)) {
    if (wert === undefined || wert === false) continue;
    element.setAttribute(name, wert === true ? '' : String(wert));
  }
}

function haengeAn(element: Element, kinder: Kind[]): void {
  for (const kind of kinder) {
    if (kind === undefined || kind === false) continue;
    element.append(kind);
  }
}

/** Entfernt alle Kindknoten. */
export function leere(element: Element): void {
  element.replaceChildren();
}
