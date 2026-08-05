import { el } from './dom.ts';
import { symbolInfo } from './symbole.ts';

/**
 * Kleines Fragezeichen, das die Physik hinter einer Zahl erklärt.
 *
 * Die App zeigt viele berechnete Werte, deren Annahmen unsichtbar bleiben, die
 * Raumtemperatur ist geschätzt, die Wärmelasten sind Erfahrungswerte, die
 * Schwellen stammen aus Normen. Wer das nicht weiss, hält die Zahlen für
 * Messwerte.
 *
 * Warum nicht einfach `title`?
 * Ein `title`-Tooltip erscheint nur bei der Maus, verschwindet auf Mobilgeräten
 * ganz und wird von Screenreadern uneinheitlich vorgelesen. Diese Umsetzung
 * öffnet die Erklärung auf drei Wegen:
 *
 *   - Mauszeiger darüber (`:hover`)
 *   - Tastaturfokus (`:focus-visible`): Tab-Reihenfolge, sichtbarer Fokus
 *   - Tippen oder Klicken (`aria-expanded`), der einzige Weg auf dem Handy
 *
 * Escape schliesst wieder. Der Knopf trägt ein `aria-label` mit dem Thema,
 * damit die Vorlesereihenfolge verständlich bleibt.
 */

let zaehler = 0;

/**
 * @param thema Worum es geht, wird Teil der Beschriftung für Screenreader
 *              («Erklärung: Raumtemperatur»).
 * @param text  Die Erklärung selbst, ein bis drei Sätze.
 */
export function infofeld(thema: string, text: string): HTMLElement {
  const blasenId = `infofeld-${++zaehler}`;

  const knopf = el(
    'button',
    {
      type: 'button',
      class: 'infofeld__knopf',
      'aria-expanded': 'false',
      'aria-controls': blasenId,
      'aria-label': `Erklärung: ${thema}`,
    },
    [symbolInfo()],
  );

  const blase = el('span', { class: 'infofeld__blase', id: blasenId, role: 'tooltip' }, [text]);
  const wurzel = el('span', { class: 'infofeld' }, [knopf, blase]);

  /**
   * Hält die Blase im sichtbaren Bereich.
   *
   * Sie ist unter dem Symbol zentriert, am linken oder rechten Rand ragt sie
   * damit hinaus. Eine feste Ausrichtung per Media Query löst das nicht: Was
   * rechts hilft, schadet links. Deshalb wird beim Öffnen gemessen und nur so
   * weit verschoben, wie nötig.
   *
   * Massgeblich ist der Seitencontainer, nicht der Viewport: `.seite` klippt
   * waagrechten Überlauf (siehe `style.css`), damit sich die Seite durch eine
   * unsichtbare Blase nicht seitwärts schieben lässt. Wer sich am Viewport
   * ausrichtete, geriete auf breiten Bildschirmen in genau dieses Klippen.
   */
  const positioniere = (): void => {
    blase.style.transform = 'translateX(-50%)';

    const rand = 8;
    // clientWidth statt innerWidth: Letzteres zählt die Bildlaufleiste mit,
    // wodurch die Blase genau um deren Breite zu weit rechts landen würde.
    const sichtbareBreite = document.documentElement.clientWidth;
    const bereich = wurzel.closest('.seite')?.getBoundingClientRect();
    const links = Math.max(rand, (bereich?.left ?? 0) + rand);
    const rechts = Math.min(sichtbareBreite - rand, (bereich?.right ?? sichtbareBreite) - rand);

    const feld = blase.getBoundingClientRect();
    const versatz =
      feld.left < links ? links - feld.left : feld.right > rechts ? rechts - feld.right : 0;

    if (versatz !== 0) {
      blase.style.transform = `translateX(calc(-50% + ${Math.round(versatz)}px))`;
    }
  };

  const setzeOffen = (offen: boolean): void => {
    if (offen) positioniere();
    knopf.setAttribute('aria-expanded', String(offen));
  };

  // Auch bei Maus und Tastatur ausrichten, dort öffnet allein das CSS.
  knopf.addEventListener('mouseenter', positioniere);
  knopf.addEventListener('focus', positioniere);

  // Für Touch und Tastatur: Der Klick hält die Blase offen, bis erneut geklickt
  // oder Escape gedrückt wird. Hover und Fokus regelt allein das CSS.
  knopf.addEventListener('click', () => {
    setzeOffen(knopf.getAttribute('aria-expanded') !== 'true');
  });

  knopf.addEventListener('keydown', (ereignis) => {
    if (ereignis.key === 'Escape') setzeOffen(false);
  });

  // Ein Tipp irgendwo anders schliesst die offene Blase wieder.
  document.addEventListener('click', (ereignis) => {
    if (!wurzel.contains(ereignis.target as Node)) setzeOffen(false);
  });

  return wurzel;
}

/**
 * Hängt ein Infofeld an ein bestehendes Element an, für Beschriftungen, die
 * bereits stehen und nur ergänzt werden sollen.
 */
export function ergaenzeInfofeld(ziel: HTMLElement, thema: string, text: string): void {
  ziel.append(infofeld(thema, text));
}
