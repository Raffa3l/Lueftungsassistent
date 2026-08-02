import { wattProM2, type WattProM2 } from '../einheiten.ts';

/**
 * Sonnenstand und Einstrahlung auf eine senkrechte Fassade.
 *
 * Warum überhaupt? Die Wetter-API liefert die Strahlung auf die **waagrechte**
 * Fläche. Für ein Fenster zählt aber der Einfallswinkel auf die Fassade – und
 * der hängt an der Himmelsrichtung:
 *
 *   Nord   nur Diffusstrahlung, rund 100–150 W/m²
 *   Süd    mittags 400–500 W/m² – die hoch stehende Sommersonne streift die
 *          Fassade nur, deshalb ist Süd im Sommer günstiger als sein Ruf
 *   Ost    morgens 600–700 W/m², wenn der Raum noch kühl ist
 *   West   nachmittags 600–700 W/m² – der kritische Fall, weil die Spitze mit
 *          der wärmsten Aussenluft und einem aufgeheizten Gebäude zusammenfällt
 *
 * Gerechnet wird selbst und nicht über den API-Parameter `global_tilted_
 * irradiance`, damit ein Wechsel der Ausrichtung keinen Netzabruf auslöst:
 * Nur ein Standortwechsel lädt Daten nach, alles andere wird lokal gerechnet.
 *
 * Genauigkeit: Die Näherungen für Deklination und Zeitgleichung liegen im
 * Bereich weniger Bogenminuten – bei stündlicher Auflösung und einer
 * Wetterprognose als Eingangsgrösse weit unterhalb der übrigen Unsicherheiten.
 */

const GRAD = Math.PI / 180;

/** Reflexionsgrad des Bodens vor dem Fenster (Wiese, Asphalt, Kies gemischt). */
const BODEN_ALBEDO = 0.2;

/**
 * Sichtfaktor einer senkrechten Fläche zum Himmel bzw. zum Boden: je die
 * Hälfte. Eine Fassade sieht genau eine Himmelshalbkugel und eine Bodenhälfte.
 */
const SICHTFAKTOR_SENKRECHT = 0.5;

/** Sonnenposition in Grad. */
export interface Sonnenstand {
  /** Höhe über dem Horizont; negativ bedeutet Nacht. */
  elevationGrad: number;
  /** Azimut geografisch: 0 = Nord, 90 = Ost, 180 = Süd, 270 = West. */
  azimutGrad: number;
}

/** Tag im Jahr, 1 bis 366. */
function tagImJahr(zeit: Date): number {
  const jahresbeginn = new Date(zeit.getFullYear(), 0, 0);
  return Math.floor((zeit.getTime() - jahresbeginn.getTime()) / 86_400_000);
}

/**
 * Gilt an diesem Tag die Sommerzeit (MESZ)?
 *
 * In der EU und der Schweiz: vom letzten Sonntag im März bis zum letzten
 * Sonntag im Oktober. Die Umstellung erfolgt um 02:00 bzw. 03:00 Uhr; auf
 * Stundenebene wird das hier vereinfacht am Kalendertag festgemacht.
 */
export function istSommerzeit(zeit: Date): boolean {
  const jahr = zeit.getFullYear();
  const letzterSonntag = (monat: number): Date => {
    // Tag 0 des Folgemonats ist der letzte Tag des Monats.
    const letzter = new Date(jahr, monat + 1, 0);
    return new Date(jahr, monat, letzter.getDate() - letzter.getDay());
  };

  const beginn = letzterSonntag(2); // März
  const ende = letzterSonntag(9); // Oktober
  return zeit >= beginn && zeit < ende;
}

/**
 * Zeitgleichung in Minuten – der Unterschied zwischen wahrer und mittlerer
 * Sonnenzeit, verursacht durch die elliptische Erdbahn und die Achsneigung.
 */
export function zeitgleichungMinuten(zeit: Date): number {
  const b = ((360 / 364) * (tagImJahr(zeit) - 81)) * GRAD;
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
}

/** Deklination der Sonne in Grad (Näherung nach Cooper). */
export function deklinationGrad(zeit: Date): number {
  return 23.44 * Math.sin(((360 / 365) * (tagImJahr(zeit) + 284)) * GRAD);
}

/**
 * Sonnenstand für einen Zeitpunkt in Schweizer Wanduhrzeit.
 *
 * `zeit` trägt die lokale Wanduhrzeit der Station (siehe Zeitkonvention in
 * `dienste/wetterdienst.ts`); der Zonenversatz wird hier wieder herausgerechnet.
 */
export function sonnenstand(
  zeit: Date,
  breitengrad: number,
  laengengrad: number,
): Sonnenstand {
  const zonenversatzH = istSommerzeit(zeit) ? 2 : 1;
  const wanduhrH = zeit.getHours() + zeit.getMinutes() / 60;

  // Wahre Ortszeit: Wanduhrzeit → Weltzeit → Ortsmeridian → wahre Sonnenzeit.
  const weltzeitH = wanduhrH - zonenversatzH;
  const wahreOrtszeitH = weltzeitH + laengengrad / 15 + zeitgleichungMinuten(zeit) / 60;

  const stundenwinkel = 15 * (wahreOrtszeitH - 12) * GRAD;
  const deklination = deklinationGrad(zeit) * GRAD;
  const breite = breitengrad * GRAD;

  const sinElevation =
    Math.sin(breite) * Math.sin(deklination) +
    Math.cos(breite) * Math.cos(deklination) * Math.cos(stundenwinkel);
  const elevation = Math.asin(Math.max(-1, Math.min(1, sinElevation)));

  // Azimut von Nord im Uhrzeigersinn.
  const zaehler = Math.sin(stundenwinkel);
  const nenner =
    Math.cos(stundenwinkel) * Math.sin(breite) - Math.tan(deklination) * Math.cos(breite);
  let azimut = Math.atan2(zaehler, nenner) / GRAD + 180;
  if (azimut < 0) azimut += 360;
  if (azimut >= 360) azimut -= 360;

  return { elevationGrad: elevation / GRAD, azimutGrad: azimut };
}

/** Strahlungsanteile, wie sie die Wetter-API liefert. */
export interface Strahlung {
  /** Direktstrahlung senkrecht zur Sonnenrichtung (DNI). */
  direktNormalWProM2: WattProM2;
  /** Diffuse Himmelsstrahlung auf die Waagrechte (DHI). */
  diffusWProM2: WattProM2;
  /** Globalstrahlung auf die Waagrechte (GHI) – für die Bodenreflexion. */
  globalWProM2: WattProM2;
}

/**
 * Einstrahlung auf eine senkrechte Fassade mit dem angegebenen Azimut
 * (0 = Nord, 90 = Ost, 180 = Süd, 270 = West).
 *
 * Drei Anteile:
 *   direkt   DNI · cos(Einfallswinkel), nur wenn die Sonne die Fassade trifft
 *   diffus   halbe Himmelsstrahlung – die Fassade sieht eine Halbkugel
 *   Reflex   halbe Globalstrahlung mal Bodenalbedo
 */
export function fassadenstrahlungWProM2(
  stand: Sonnenstand,
  strahlung: Strahlung,
  fassadenazimutGrad: number,
): WattProM2 {
  const diffus = strahlung.diffusWProM2 * SICHTFAKTOR_SENKRECHT;
  const reflex = strahlung.globalWProM2 * BODEN_ALBEDO * SICHTFAKTOR_SENKRECHT;

  // Unter dem Horizont gibt es keine Direktstrahlung mehr.
  if (stand.elevationGrad <= 0) return wattProM2(diffus + reflex);

  // Einfallswinkel auf eine senkrechte Fläche: cos θ = cos(h) · cos(ΔAzimut).
  const differenz = (stand.azimutGrad - fassadenazimutGrad) * GRAD;
  const cosEinfall = Math.cos(stand.elevationGrad * GRAD) * Math.cos(differenz);

  // Negativ heisst: Die Sonne steht hinter der Fassade.
  const direkt = cosEinfall > 0 ? strahlung.direktNormalWProM2 * cosEinfall : 0;

  return wattProM2(direkt + diffus + reflex);
}
