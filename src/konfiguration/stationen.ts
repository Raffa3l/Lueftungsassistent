import type { Wetterstation } from '../typen.ts';

/**
 * Auswählbare Standorte in der Schweiz.
 *
 * Die Koordinaten entsprechen den jeweiligen Stadtzentren bzw. den MeteoSchweiz-
 * Messstandorten. Open-Meteo interpoliert das Wettermodell auf diese Koordinaten,
 * eine Stationskennung wird nicht benötigt.
 *
 * Erweiterbar: einfach einen weiteren Eintrag ergänzen – die Standortauswahl
 * im UI wird automatisch daraus aufgebaut.
 */
export const STATIONEN: readonly Wetterstation[] = [
  { id: 'zuerich', name: 'Zürich', kanton: 'ZH', breitengrad: 47.3769, laengengrad: 8.5417, hoeheMeter: 408 },
  { id: 'zug', name: 'Zug', kanton: 'ZG', breitengrad: 47.1662, laengengrad: 8.5155, hoeheMeter: 425 },
  { id: 'luzern', name: 'Luzern', kanton: 'LU', breitengrad: 47.0502, laengengrad: 8.3093, hoeheMeter: 436 },
  { id: 'bern', name: 'Bern', kanton: 'BE', breitengrad: 46.948, laengengrad: 7.4474, hoeheMeter: 553 },
  { id: 'basel', name: 'Basel', kanton: 'BS', breitengrad: 47.5596, laengengrad: 7.5886, hoeheMeter: 260 },
  { id: 'lausanne', name: 'Lausanne', kanton: 'VD', breitengrad: 46.5197, laengengrad: 6.6323, hoeheMeter: 495 },
  { id: 'genf', name: 'Genf', kanton: 'GE', breitengrad: 46.2044, laengengrad: 6.1432, hoeheMeter: 375 },
  { id: 'st-gallen', name: 'St. Gallen', kanton: 'SG', breitengrad: 47.4245, laengengrad: 9.3767, hoeheMeter: 675 },
  { id: 'winterthur', name: 'Winterthur', kanton: 'ZH', breitengrad: 47.5001, laengengrad: 8.7501, hoeheMeter: 439 },
  { id: 'chur', name: 'Chur', kanton: 'GR', breitengrad: 46.8508, laengengrad: 9.5320, hoeheMeter: 593 },
  { id: 'sion', name: 'Sion', kanton: 'VS', breitengrad: 46.2331, laengengrad: 7.3606, hoeheMeter: 482 },
  { id: 'davos', name: 'Davos', kanton: 'GR', breitengrad: 46.8043, laengengrad: 9.8375, hoeheMeter: 1560 },
  { id: 'lugano', name: 'Lugano', kanton: 'TI', breitengrad: 46.0037, laengengrad: 8.9511, hoeheMeter: 273 },
  { id: 'locarno', name: 'Locarno', kanton: 'TI', breitengrad: 46.1670, laengengrad: 8.7943, hoeheMeter: 197 },
];

/** Liefert die Station zur ID, sonst `undefined`. */
export function findeStation(id: string): Wetterstation | undefined {
  return STATIONEN.find((station) => station.id === id);
}
