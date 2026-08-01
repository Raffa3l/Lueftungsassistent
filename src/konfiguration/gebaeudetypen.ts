import type { Gebaeudetyp } from '../typen.ts';
import { celsius, stunden, wattProM2, whProM2K } from '../einheiten.ts';

/**
 * Bauliche Startkonfiguration typischer Schweizer Gebäude.
 *
 * Hier stehen ausschliesslich Eigenschaften der Bausubstanz – wie träge der Raum
 * ist, wie viel Sonne hereinkommt, wie viel Wärme die Masse aufnehmen kann. Was
 * an Wärme durch Personen und Geräte anfällt, steht beim Raumtyp.
 *
 * Die Werte sind Erfahrungswerte für ein vereinfachtes Ein-Knoten-Modell und
 * bewusst als reine Daten abgelegt, damit sie ohne Codeänderung erweitert oder
 * nachjustiert werden können. Als Orientierung dienen die daraus abgeleiteten
 * Kenngrössen Amplitudendämpfung und Phasenverschiebung (vgl. `thermischesModell.ts`):
 *
 *   Altbau Massivbau   ~0.13 Dämpfung, ~5.9 h Verzögerung
 *   Dachgeschoss       ~0.48 Dämpfung, ~3.4 h Verzögerung
 */
export const GEBAEUDETYPEN: readonly Gebaeudetyp[] = [
  {
    id: 'altbau-massiv',
    name: 'Altbau, Massivbau (vor 1950)',
    beschreibung: 'Dicke Mauern, viel Speichermasse, kaum gedämmt. Heizt sich langsam auf, bleibt lange kühl.',
    zeitkonstanteGeschlossenH: stunden(30),
    zeitkonstanteOffenH: stunden(10),
    solarerEintragMaxWProM2: wattProM2(30),
    speicherkapazitaetWhProM2K: whProM2K(90),
    sommerBasistemperaturC: celsius(23),
  },
  {
    id: 'nachkriegsbau',
    name: 'Wohnbau 1950–1980, unsaniert',
    beschreibung: 'Backstein oder Beton, wenig Dämmung, mittlere Speichermasse. Der Klassiker im Schweizer Mittelland.',
    zeitkonstanteGeschlossenH: stunden(20),
    zeitkonstanteOffenH: stunden(7),
    solarerEintragMaxWProM2: wattProM2(35),
    speicherkapazitaetWhProM2K: whProM2K(70),
    sommerBasistemperaturC: celsius(24),
  },
  {
    id: 'saniert-massiv',
    name: 'Saniertes Massivgebäude',
    beschreibung: 'Massivbau mit nachträglicher Aussendämmung. Sehr träge – kühle Nächte wirken über Tage nach.',
    zeitkonstanteGeschlossenH: stunden(35),
    zeitkonstanteOffenH: stunden(9),
    solarerEintragMaxWProM2: wattProM2(40),
    speicherkapazitaetWhProM2K: whProM2K(100),
    sommerBasistemperaturC: celsius(24),
  },
  {
    id: 'neubau-minergie',
    name: 'Neubau / Minergie',
    beschreibung: 'Sehr gut gedämmt, dichte Hülle, grosse Fensterflächen. Ohne Sonnenschutz droht Überhitzung.',
    zeitkonstanteGeschlossenH: stunden(24),
    zeitkonstanteOffenH: stunden(6),
    solarerEintragMaxWProM2: wattProM2(42),
    speicherkapazitaetWhProM2K: whProM2K(75),
    sommerBasistemperaturC: celsius(24.5),
  },
  {
    id: 'holzbau-leichtbau',
    name: 'Holz- oder Leichtbau',
    beschreibung: 'Wenig Speichermasse: reagiert schnell auf Aussentemperatur – Lüften wirkt sofort, Hitze aber auch.',
    zeitkonstanteGeschlossenH: stunden(12),
    zeitkonstanteOffenH: stunden(4),
    solarerEintragMaxWProM2: wattProM2(32),
    speicherkapazitaetWhProM2K: whProM2K(40),
    sommerBasistemperaturC: celsius(25),
  },
  {
    id: 'dachwohnung',
    name: 'Dachgeschoss / Estrichausbau',
    beschreibung: 'Geringe Speichermasse, grosse Dachfläche in der Sonne. Der kritischste Fall im Hochsommer.',
    zeitkonstanteGeschlossenH: stunden(7),
    zeitkonstanteOffenH: stunden(2.5),
    solarerEintragMaxWProM2: wattProM2(48),
    speicherkapazitaetWhProM2K: whProM2K(30),
    sommerBasistemperaturC: celsius(26),
  },
];

/** Liefert den Gebäudetyp zur ID, sonst `undefined`. */
export function findeGebaeudetyp(id: string): Gebaeudetyp | undefined {
  return GEBAEUDETYPEN.find((typ) => typ.id === id);
}
