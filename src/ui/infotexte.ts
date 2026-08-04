import type { Hinweisart } from '../typen.ts';

/**
 * Erklärtexte zur Physik und zu den Annahmen hinter den angezeigten Werten.
 *
 * Sie stehen hier gesammelt, weil sie Inhalt sind und keine Logik: Wer eine
 * Schwelle im Modell ändert, findet den zugehörigen Satz an einer Stelle statt
 * verstreut im DOM-Aufbau.
 *
 * Ton: erklären, nicht beschwichtigen. Wo die App schätzt, steht das auch so
 * da – eine berechnete Raumtemperatur als Messwert misszuverstehen ist der
 * häufigste Irrtum bei dieser Art von Anwendung.
 */

export const INFO = {
  raumtemperatur: {
    thema: 'berechnete Raumtemperatur',
    text:
      'Dieser Wert ist gerechnet, nicht gemessen. Ein vereinfachtes Modell verfolgt, ' +
      'wie die Raumluft der Aussentemperatur folgt – abhängig von Speichermasse, ' +
      'Sonneneintrag und Nutzung. Es startet sieben Tage vor jetzt mit einer ' +
      'Schätzung; bis zur Gegenwart ist davon fast nichts mehr übrig. Ausrichtung ' +
      'und Sonnenschutz gehen eigens ein; Stockwerk, Fenstergrösse und Verschattung ' +
      'durch Nachbarhäuser oder Bäume stecken nur pauschal im Gebäudetyp.',
  },

  aussentemperatur: {
    thema: 'Aussentemperatur',
    text:
      'Prognose von Open-Meteo auf Basis des Modells ICON-CH von MeteoSchweiz. ' +
      'Auch die vergangenen Stunden sind Modellwerte, keine Messungen einer ' +
      'Wetterstation. Je weiter voraus, desto unsicherer: Die kommende Nacht ist ' +
      'deutlich verlässlicher als der übernächste Tag.',
  },

  vergleichOhneLueften: {
    thema: 'Vergleich ohne Lüften',
    text:
      'Dieselbe Rechnung mit dauerhaft geschlossenen Fenstern. Der Abstand zur ' +
      'blauen Linie zeigt, was das empfohlene Lüften bringt – nicht, was ein ' +
      'realer Nachbarraum hätte.',
  },

  ausrichtung: {
    thema: 'Fensterausrichtung',
    text:
      'Entscheidend ist der Einfallswinkel auf die Fensterebene, nicht die Strahlung ' +
      'auf den Boden. Im Hochsommer steht die Sonne mittags hoch und streift eine ' +
      'Südfassade nur – kritisch ist der Westen: dort fällt die volle Sonne mit der ' +
      'wärmsten Aussenluft und einem bereits aufgeheizten Gebäude zusammen. Zählt die ' +
      'grösste Fensterfläche, wenn ein Raum nach mehreren Seiten geht.',
  },

  sonnenschutz: {
    thema: 'Sonnenschutz',
    text:
      'Der grösste Hebel überhaupt: Zwischen aussenliegenden Storen und blankem ' +
      'Fenster liegt Faktor vier im Wärmeeintrag. Innenliegende Vorhänge bringen ' +
      'wenig, weil die Strahlung die Scheibe schon durchquert hat und im Raum zu ' +
      'Wärme wird – sie helfen gegen Blendung, nicht gegen Hitze.',
  },

  gebaeudetyp: {
    thema: 'Wärmeträgheit des Gebäudes',
    text:
      'Die Wärmeträgheit ist die Zeitkonstante des Raums: Nach dieser Zeit hat er ' +
      'rund zwei Drittel eines Temperatursprungs draussen nachvollzogen. Daraus ' +
      'ergeben sich Dämpfung und Verzögerung rechnerisch – sie sind keine ' +
      'eigenen Einstellungen. Die Werte sind Erfahrungswerte für typische ' +
      'Schweizer Bauweisen, kein Gutachten für Ihr Haus.',
  },

  raumtyp: {
    thema: 'Wärmelast der Nutzung',
    text:
      'Personen, Geräte und Licht in Watt pro Quadratmeter Bodenfläche, nach den ' +
      'Auslegungswerten der SIA 2024. Ein sitzender Mensch gibt rund 70 Watt ab. ' +
      'Wie stark das die Temperatur treibt, hängt vom Gebäude ab: Dieselbe Klasse ' +
      'heizt einen Leichtbau gut doppelt so schnell auf wie einen schweren Altbau.',
  },

  zieltemperatur: {
    thema: 'Wunschtemperatur',
    text:
      'Ab dieser Raumtemperatur gilt der Raum als zu warm. Sie steuert die ' +
      'Dringlichkeit und den Hinweis auf Luftbewegung – nicht, wann geschlossen ' +
      'wird.',
  },

  // Steht beim Vorschlagsknopf, nicht beim Feld: Er erklärt, woher die Zahl
  // kommt, während das Infofeld oben erklärt, was die Einstellung bewirkt.
  komfortvorschlag: {
    thema: 'Vorschlag nach Wetterlage',
    text:
      'Was als behaglich gilt, ist keine feste Zahl: Sie steigt mit dem Wetter ' +
      'der letzten Tage, weil sich Kleidung, Erwartung und Körper an die Lage ' +
      'anpassen. Der Vorschlag folgt dem adaptiven Komfortmodell der EN 16798-1, ' +
      'auf dem auch SIA 180 aufbaut – gedeckelt bei 26.5 Grad, weil ein Raum ' +
      'auch nach einer Hitzewoche darüber nicht mehr als behaglich gilt.',
  },

  hysterese: {
    thema: 'Schaltdifferenz',
    text:
      'So viel kühler muss es draussen sein, damit die App zum Öffnen rät. Ein ' +
      'bereits offenes Fenster bleibt offen, bis die Aussenluft die Raumtemperatur ' +
      'erreicht. Diese Spanne verhindert stündliches Hin und Her, wenn beide ' +
      'Temperaturen nahe beieinanderliegen.',
  },

  untergrenze: {
    thema: 'Untergrenze',
    text:
      'Darunter rät die App nicht mehr zum Lüften. Das ist eine Komfortgrenze, ' +
      'keine physikalische: Rein rechnerisch bringt längeres Lüften immer einen ' +
      'kühleren Raum, solange es draussen kühler ist. Das Modell kennt keine ' +
      'Heizung – die Untergrenze hält die Temperatur nicht aktiv oben.',
  },

  nachtauskuehlung: {
    thema: 'Nachtauskühlung',
    text:
      'Nachts ist der Temperaturunterschied am grössten, und die ausgekühlte ' +
      'Bausubstanz trägt bis in den nächsten Tag. In schweren Bauten ist das der ' +
      'wirksamste Hebel überhaupt; im Dachgeschoss verpufft der Vorteil bis ' +
      'mittags, weil Speichermasse fehlt.',
  },
} as const;

/** Erklärung zur Physik hinter einem Zusatzhinweis. */
export const INFO_HINWEIS: Record<Hinweisart, { thema: string; text: string }> = {
  luftqualitaet: {
    thema: 'Stosslüftung',
    text:
      'Menschen geben Kohlendioxid und Feuchte ab; in dicht belegten Räumen steigt ' +
      'beides binnen einer Stunde ins Unangenehme. Kurzes, kräftiges Lüften ' +
      'tauscht die Luft, bevor sich die Bausubstanz nennenswert erwärmt – die ' +
      'Wärme steckt in den Wänden, nicht in der Luft.',
  },
  feuchte: {
    thema: 'Feuchte der Aussenluft',
    text:
      'Massgeblich ist die absolute Feuchte, nicht die relative. Nachtluft mit ' +
      '16 Grad und 95 Prozent enthält weniger Wasser als Raumluft mit 26 Grad und ' +
      '60 Prozent – sie trocknet den Raum also. Kritisch wird es umgekehrt: Trifft ' +
      'schwüle Luft auf kühle Wände, schlägt sich dort Wasser nieder.',
  },
  wind: {
    thema: 'Wind und Luftwechsel',
    text:
      'Wind treibt den Luftaustausch am offenen Fenster; zwischen Flaute und ' +
      'steifer Brise liegt rund das Dreifache. Zwei gegenüberliegende Fenster ' +
      'nutzen ihn weit besser als eines. Gemessen wird in 10 Metern Höhe – am ' +
      'Fenster kommt in bebautem Gebiet deutlich weniger an.',
  },
  kuehlung: {
    thema: 'Luftbewegung im Raum',
    text:
      'Bewegte Luft kühlt den Menschen, nicht den Raum: Sie beschleunigt die ' +
      'Verdunstung auf der Haut und senkt das Temperaturempfinden um zwei bis drei ' +
      'Grad. Erst wenn die Luft wärmer wird als die Haut und dabei trocken ist, ' +
      'kehrt sich der Nutzen um.',
  },
};
