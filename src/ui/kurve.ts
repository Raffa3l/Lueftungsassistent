/**
 * Weiche Kurve durch Messpunkte, monotone kubische Interpolation.
 *
 * Warum überhaupt glätten?
 * Die Wetterdaten sind Stundenwerte. Verbindet man sie mit Geraden, bekommt die
 * Kurve an jeder vollen Stunde einen Knick, die Aussentemperatur sieht dann aus,
 * als spränge sie. Sie tut es nicht: Luft hat Trägheit, der Verlauf zwischen zwei
 * Stützstellen ist weich. Die Ecken sind ein Artefakt der Abtastung, nicht der
 * Wetterlage.
 *
 * Warum ausgerechnet monoton (nach Fritsch–Carlson)?
 * Die naheliegende Glättung, Catmull-Rom oder ein gewöhnlicher kubischer Spline,
 * schwingt an scharfen Knicken über: Nach einem steilen Abfall taucht die Kurve
 * unter den tiefsten Messwert und zeichnet eine Temperatur, die nirgends steht.
 * In einer App, die Temperaturschwellen anzeigt, wäre das schlimmer als die Ecke.
 * Das Verfahren nach Fritsch–Carlson begrenzt die Steigungen so, dass die Kurve
 * zwischen je zwei Stützpunkten deren Werte nie verlässt und an einem lokalen
 * Hoch- oder Tiefpunkt waagrecht durchläuft.
 *
 * Die Stützpunkte selbst bleiben unberührt: Die Kurve verläuft exakt durch jeden
 * Stundenwert, geglättet wird allein die Strecke dazwischen. Tabelle und
 * Hinweisfeld zeigen unverändert die Modellwerte.
 */

export type Punkt = readonly [number, number];

/**
 * Baut aus Stützpunkten einen SVG-Pfad mit kubischen Bézier-Segmenten.
 *
 * Erwartet nach x aufsteigend sortierte Punkte, im Diagramm ist x die Zeit,
 * also von sich aus geordnet.
 */
export function glatterPfad(punkte: readonly Punkt[]): string {
  const erster = punkte[0];
  if (!erster) return '';

  const anfang = `M ${runde(erster[0])},${runde(erster[1])}`;
  if (punkte.length === 1) return anfang;

  const steigungen = monotoneSteigungen(punkte);
  const segmente: string[] = [];

  for (let i = 0; i < punkte.length - 1; i++) {
    const [x0, y0] = punkte[i]!;
    const [x1, y1] = punkte[i + 1]!;
    // Ein Drittel der Segmentbreite ist der Abstand, bei dem die Bézier-Kurve
    // genau die vorgegebene Steigung annimmt (Hermite-Form).
    const drittel = (x1 - x0) / 3;

    const c1x = x0 + drittel;
    const c1y = y0 + steigungen[i]! * drittel;
    const c2x = x1 - drittel;
    const c2y = y1 - steigungen[i + 1]! * drittel;

    segmente.push(
      `C ${runde(c1x)},${runde(c1y)} ${runde(c2x)},${runde(c2y)} ${runde(x1)},${runde(y1)}`,
    );
  }

  return `${anfang} ${segmente.join(' ')}`;
}

/**
 * Steigung an jedem Stützpunkt, begrenzt nach Fritsch–Carlson (1980).
 *
 * Ausgangspunkt ist das Mittel der beiden angrenzenden Sekanten. Zwei Regeln
 * halten die Kurve danach im Zaum:
 *
 *   - Kehrt die Richtung um (ein Hoch- oder Tiefpunkt), wird die Steigung 0.
 *     Die Kurve läuft waagrecht durch den Scheitel, statt darüber hinauszuschiessen.
 *   - Sonst wird die Steigung auf das Dreifache der flacheren Nachbarsekante
 *     gedeckelt. Das ist die Bedingung, unter der ein kubisches Hermite-Segment
 *     nachweislich monoton bleibt.
 */
function monotoneSteigungen(punkte: readonly Punkt[]): number[] {
  const anzahl = punkte.length;
  const sekanten: number[] = [];

  for (let i = 0; i < anzahl - 1; i++) {
    const [x0, y0] = punkte[i]!;
    const [x1, y1] = punkte[i + 1]!;
    const breite = x1 - x0;
    // Zwei Punkte auf derselben x-Position ergäben eine Division durch null.
    sekanten.push(breite === 0 ? 0 : (y1 - y0) / breite);
  }

  const steigungen: number[] = new Array(anzahl);
  steigungen[0] = sekanten[0] ?? 0;
  steigungen[anzahl - 1] = sekanten[anzahl - 2] ?? 0;

  for (let i = 1; i < anzahl - 1; i++) {
    const links = sekanten[i - 1]!;
    const rechts = sekanten[i]!;
    // Richtungswechsel oder Plateau: waagrecht durch den Scheitel.
    steigungen[i] = links * rechts <= 0 ? 0 : (links + rechts) / 2;
  }

  for (let i = 0; i < anzahl - 1; i++) {
    const sekante = sekanten[i]!;

    if (sekante === 0) {
      // Waagrechtes Stück: Beide Enden müssen flach sein, sonst entstünde
      // zwischen zwei gleichen Werten eine Delle.
      steigungen[i] = 0;
      steigungen[i + 1] = 0;
      continue;
    }

    steigungen[i] = deckle(steigungen[i]!, sekante);
    steigungen[i + 1] = deckle(steigungen[i + 1]!, sekante);
  }

  return steigungen;
}

/** Begrenzt eine Steigung auf das Dreifache der Sekante, richtungstreu. */
function deckle(steigung: number, sekante: number): number {
  const grenze = 3 * sekante;
  return sekante > 0
    ? Math.min(Math.max(steigung, 0), grenze)
    : Math.max(Math.min(steigung, 0), grenze);
}

/** Eine Nachkommastelle genügt für Bildschirmkoordinaten und hält den Pfad kurz. */
function runde(wert: number): string {
  return wert.toFixed(1);
}
