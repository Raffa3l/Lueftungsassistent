import type { Gebaeudetyp } from '../typen.ts';
import { celsius, stunden, wattProM2, whProM2K } from '../einheiten.ts';

/**
 * Bauliche Startkonfiguration typischer Schweizer Gebäude.
 *
 * Hier stehen ausschliesslich Eigenschaften der Bausubstanz: wie träge der Raum
 * ist, wie viel Sonne hereinkommt, wie viel Wärme die Masse aufnehmen kann. Was
 * an Wärme durch Personen und Geräte anfällt, steht beim Raumtyp.
 *
 * Der solare Eintrag gilt **ohne Sonnenschutz** und bezogen auf die
 * Einstrahlung in der Fensterebene. Der Behang wird separat gewählt
 * (`sonnenschutz.ts`), die Ausrichtung ebenfalls (`ausrichtungen.ts`). Die
 * Bausubstanz beschreibt nur, wie viel Fensterfläche und Glasqualität
 * überhaupt vorhanden sind.
 *
 * `solarAnteilOhneAusrichtung` trennt davon den Teil ab, der nicht am Fenster
 * hängt: Ein Dachgeschoss heizt sich auch mit Nordfenstern auf, weil die Sonne
 * aufs Dach brennt, deshalb dort 0.55 gegenüber 0.10 im Mittelgeschoss.
 *
 * Die Liste deckt alle drei Nutzungen ab. Die meisten Einträge (Altbau,
 * Sanierung, Neubau, Leichtbau, Dachgeschoss) gelten für Wohnungen, Schulzimmer
 * und Büros gleichermassen; nur die beiden Epochen-Einträge zu 1950–1980 sind
 * getrennt, weil sich Wohn- und Zweckbauten dieser Zeit gerade dort
 * unterscheiden, wo es fürs Modell zählt:
 *
 *   Ein Schulhaus oder Bürobau der Nachkriegszeit hat **mehr** Beton verbaut als
 *   ein Wohnbau derselben Jahre, aber durch die abgehängte Akustikdecke
 *   **weniger** wirksame Speichermasse: Die Betondecke ist thermisch
 *   abgekoppelt. Dazu kommt das Fensterband über die ganze Front. Beides wirkt
 *   in dieselbe Richtung: schneller warm, schneller wieder kühl.
 *
 * Die Werte sind Erfahrungswerte für ein vereinfachtes Ein-Knoten-Modell und
 * bewusst als reine Daten abgelegt, damit sie ohne Codeänderung erweitert oder
 * nachjustiert werden können. Als Orientierung dienen die daraus abgeleiteten
 * Kenngrössen Amplitudendämpfung und Phasenverschiebung (vgl. `thermischesModell.ts`):
 *
 *   Altbau Massivbau   ~0.13 Dämpfung, ~5.5 h Verzögerung
 *   Dachgeschoss       ~0.48 Dämpfung, ~4.1 h Verzögerung
 *
 * Die Verzögerung streut weniger, als man erwarten würde: Ein einpoliges
 * RC-Glied kann die Tageswelle höchstens um eine Viertelperiode verschieben,
 * also um 6 Stunden. Über alle Bauarten liegen deshalb nur 4.1 bis 5.5 Stunden
 * dazwischen. Unterscheiden tun sie sich vor allem in der Dämpfung.
 */
export const GEBAEUDETYPEN: readonly Gebaeudetyp[] = [
  {
    id: 'altbau-massiv',
    name: 'Altbau, Massivbau (vor 1950)',
    beschreibung:
      'Dicke Mauern, viel Speichermasse, kaum gedämmt. Heizt sich langsam auf, bleibt lange kühl. Auch das Schulhaus aus der Gründerzeit gehört hierher.',
    zeitkonstanteGeschlossenH: stunden(30),
    zeitkonstanteOffenH: stunden(10),
    solarerEintragMaxWProM2: wattProM2(60),
    solarAnteilOhneAusrichtung: 0.1,
    speicherkapazitaetWhProM2K: whProM2K(90),
    sommerBasistemperaturC: celsius(23),
  },
  {
    id: 'nachkriegsbau',
    name: 'Wohnbau 1950–1980, unsaniert',
    beschreibung: 'Backstein oder Beton, wenig Dämmung, mittlere Speichermasse. Der Klassiker im Schweizer Mittelland.',
    zeitkonstanteGeschlossenH: stunden(20),
    zeitkonstanteOffenH: stunden(7),
    solarerEintragMaxWProM2: wattProM2(70),
    solarAnteilOhneAusrichtung: 0.1,
    speicherkapazitaetWhProM2K: whProM2K(70),
    sommerBasistemperaturC: celsius(24),
  },
  {
    id: 'zweckbau-nachkriegs',
    name: 'Schul- oder Bürobau 1950–1980',
    beschreibung:
      'Betonskelett mit Fensterband, meist abgehängte Akustikdecke. Viel Glas, wenig wirksame Speichermasse, heizt sich schneller auf als ein Wohnbau derselben Jahre.',
    zeitkonstanteGeschlossenH: stunden(14),
    zeitkonstanteOffenH: stunden(5),
    solarerEintragMaxWProM2: wattProM2(95),
    solarAnteilOhneAusrichtung: 0.1,
    speicherkapazitaetWhProM2K: whProM2K(50),
    sommerBasistemperaturC: celsius(25),
  },
  {
    id: 'buero-glasfassade',
    name: 'Bürobau mit Glasfassade (1960–1990)',
    beschreibung:
      'Grossflächige Verglasung, Teppich und abgehängte Decke. Nach dem Dachgeschoss der kritischste Fall: Hier entscheidet der aussenliegende Sonnenschutz alles.',
    zeitkonstanteGeschlossenH: stunden(10),
    zeitkonstanteOffenH: stunden(3.5),
    solarerEintragMaxWProM2: wattProM2(110),
    solarAnteilOhneAusrichtung: 0.1,
    speicherkapazitaetWhProM2K: whProM2K(35),
    sommerBasistemperaturC: celsius(26),
  },
  {
    id: 'saniert-massiv',
    name: 'Saniertes Massivgebäude',
    beschreibung:
      'Massivbau mit nachträglicher Aussendämmung, ob Wohnhaus, Schulhaus oder Verwaltungsbau. Sehr träge, kühle Nächte wirken über Tage nach.',
    zeitkonstanteGeschlossenH: stunden(35),
    zeitkonstanteOffenH: stunden(9),
    solarerEintragMaxWProM2: wattProM2(80),
    solarAnteilOhneAusrichtung: 0.1,
    speicherkapazitaetWhProM2K: whProM2K(100),
    sommerBasistemperaturC: celsius(24),
  },
  {
    id: 'neubau-minergie',
    name: 'Neubau / Minergie',
    beschreibung:
      'Sehr gut gedämmt, dichte Hülle, grosse Fensterflächen, für alle Nutzungen. Ohne Sonnenschutz droht Überhitzung.',
    zeitkonstanteGeschlossenH: stunden(24),
    zeitkonstanteOffenH: stunden(6),
    solarerEintragMaxWProM2: wattProM2(85),
    solarAnteilOhneAusrichtung: 0.15,
    speicherkapazitaetWhProM2K: whProM2K(75),
    sommerBasistemperaturC: celsius(24.5),
  },
  {
    id: 'holzbau-leichtbau',
    name: 'Holz- oder Leichtbau',
    beschreibung: 'Wenig Speichermasse: reagiert schnell auf Aussentemperatur, Lüften wirkt sofort, Hitze aber auch.',
    zeitkonstanteGeschlossenH: stunden(12),
    zeitkonstanteOffenH: stunden(4),
    solarerEintragMaxWProM2: wattProM2(65),
    solarAnteilOhneAusrichtung: 0.2,
    speicherkapazitaetWhProM2K: whProM2K(40),
    sommerBasistemperaturC: celsius(25),
  },
  {
    id: 'dachwohnung',
    name: 'Dachgeschoss / Raum unter dem Dach',
    beschreibung: 'Geringe Speichermasse, grosse Dachfläche in der Sonne. Der kritischste Fall im Hochsommer.',
    zeitkonstanteGeschlossenH: stunden(7),
    zeitkonstanteOffenH: stunden(2.5),
    solarerEintragMaxWProM2: wattProM2(95),
    solarAnteilOhneAusrichtung: 0.55,
    speicherkapazitaetWhProM2K: whProM2K(30),
    sommerBasistemperaturC: celsius(26),
  },
];

/** Liefert den Gebäudetyp zur ID, sonst `undefined`. */
export function findeGebaeudetyp(id: string): Gebaeudetyp | undefined {
  return GEBAEUDETYPEN.find((typ) => typ.id === id);
}
