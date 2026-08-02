import type { Einstellungen, Ferienzeitraum } from '../typen.ts';
import { celsius, kelvin } from '../einheiten.ts';
import {
  GRENZWERTE,
  MAX_FERIENZEITRAEUME,
  STANDARD_EINSTELLUNGEN,
} from '../konfiguration/standardwerte.ts';
import { findeStation } from '../konfiguration/stationen.ts';
import { findeGebaeudetyp } from '../konfiguration/gebaeudetypen.ts';
import { findeRaumtyp } from '../konfiguration/raumtypen.ts';
import { findeAusrichtung } from '../konfiguration/ausrichtungen.ts';
import { findeSonnenschutz } from '../konfiguration/sonnenschutz.ts';

/**
 * Persistenz der Nutzereinstellungen im LocalStorage.
 *
 * Konvention: Im LocalStorage liegen ausschliesslich unkritische
 * Komforteinstellungen. Keine Zugangsdaten, keine personenbezogenen Daten,
 * keine Tokens – der Speicher ist für jedes Skript der Seite lesbar.
 *
 * Der Schlüssel ist versioniert. Ändert sich das Format unverträglich, wird
 * ein neuer Schlüssel (…v2) eingeführt statt alte Daten zu migrieren.
 */
const SPEICHER_SCHLUESSEL = 'lueftungsassistent.einstellungen.v1';

/**
 * Lädt die Einstellungen. Fehlende, unbekannte oder unplausible Werte werden
 * einzeln durch den Standardwert ersetzt – die App startet also immer.
 */
export function ladeEinstellungen(): Einstellungen {
  const roh = leseRohdaten();
  if (!roh) return standardKopie();

  return {
    stationId: gueltigeStationId(roh['stationId']),
    gebaeudetypId: gueltigeGebaeudetypId(roh['gebaeudetypId']),
    raumtypId: gueltigeRaumtypId(roh['raumtypId']),
    // Aus dem LocalStorage kommen blanke Zahlen – hier bekommen sie ihre Einheit.
    zielTemperaturC: celsius(
      gueltigeZahl(
        roh['zielTemperaturC'],
        GRENZWERTE.zielTemperaturC,
        STANDARD_EINSTELLUNGEN.zielTemperaturC,
      ),
    ),
    hystereseK: kelvin(
      gueltigeZahl(roh['hystereseK'], GRENZWERTE.hystereseK, STANDARD_EINSTELLUNGEN.hystereseK),
    ),
    minRaumtemperaturC: celsius(
      gueltigeZahl(
        roh['minRaumtemperaturC'],
        GRENZWERTE.minRaumtemperaturC,
        STANDARD_EINSTELLUNGEN.minRaumtemperaturC,
      ),
    ),
    ausrichtungId: gueltigeAusrichtungId(roh['ausrichtungId']),
    sonnenschutzId: gueltigeSonnenschutzId(roh['sonnenschutzId']),
    nachtauskuehlung:
      typeof roh['nachtauskuehlung'] === 'boolean'
        ? roh['nachtauskuehlung']
        : STANDARD_EINSTELLUNGEN.nachtauskuehlung,
    feiertageBeachten:
      typeof roh['feiertageBeachten'] === 'boolean'
        ? roh['feiertageBeachten']
        : STANDARD_EINSTELLUNGEN.feiertageBeachten,
    ferien: gueltigeFerien(roh['ferien']),
  };
}

/**
 * Prüft die Ferienliste Eintrag für Eintrag. Unbrauchbare Einträge werden
 * verworfen statt die ganze Liste – ein Tippfehler in einem Zeitraum soll nicht
 * alle anderen kosten.
 */
function gueltigeFerien(wert: unknown): Ferienzeitraum[] {
  if (!Array.isArray(wert)) return [];

  const geprueft: Ferienzeitraum[] = [];
  for (const eintrag of wert.slice(0, MAX_FERIENZEITRAEUME)) {
    if (typeof eintrag !== 'object' || eintrag === null) continue;
    const kandidat = eintrag as Record<string, unknown>;

    const von = kandidat['von'];
    const bis = kandidat['bis'];
    if (!istIsoDatum(von) || !istIsoDatum(bis) || von > bis) continue;

    geprueft.push({
      id: typeof kandidat['id'] === 'string' && kandidat['id'] ? kandidat['id'] : erzeugeId(),
      name: typeof kandidat['name'] === 'string' ? kandidat['name'].slice(0, 60) : 'Ferien',
      von,
      bis,
    });
  }
  return geprueft;
}

/** «JJJJ-MM-TT» und ein tatsächlich existierender Kalendertag. */
function istIsoDatum(wert: unknown): wert is string {
  if (typeof wert !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(wert)) return false;

  const [jahr, monat, tag] = wert.split('-').map(Number) as [number, number, number];
  const datum = new Date(jahr, monat - 1, tag);
  // Fängt Werte wie «2026-02-31» ab, die JavaScript sonst still weiterrollt.
  return (
    datum.getFullYear() === jahr && datum.getMonth() === monat - 1 && datum.getDate() === tag
  );
}

/** Kurze, im Browser eindeutige ID für einen Listeneintrag. */
export function erzeugeId(): string {
  return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Speichert die Einstellungen; scheitert still, wenn kein Speicher verfügbar ist. */
export function speichereEinstellungen(einstellungen: Einstellungen): void {
  try {
    localStorage.setItem(SPEICHER_SCHLUESSEL, JSON.stringify(einstellungen));
  } catch {
    // Privater Modus oder voller Speicher: Die App funktioniert weiter,
    // nur ohne Erinnerung an die Auswahl.
  }
}

/** Setzt alle Einstellungen auf die Standardwerte zurück. */
export function setzeEinstellungenZurueck(): Einstellungen {
  try {
    localStorage.removeItem(SPEICHER_SCHLUESSEL);
  } catch {
    // siehe oben
  }
  return standardKopie();
}

/**
 * Eigenständige Kopie der Standardwerte.
 * Eine flache Kopie würde das Ferien-Array mit der Konstanten teilen.
 */
function standardKopie(): Einstellungen {
  return { ...STANDARD_EINSTELLUNGEN, ferien: [] };
}

function leseRohdaten(): Record<string, unknown> | undefined {
  let text: string | null;
  try {
    text = localStorage.getItem(SPEICHER_SCHLUESSEL);
  } catch {
    return undefined;
  }
  if (!text) return undefined;

  try {
    const geparst: unknown = JSON.parse(text);
    if (typeof geparst !== 'object' || geparst === null) return undefined;
    return geparst as Record<string, unknown>;
  } catch {
    return undefined; // beschädigter Eintrag – wird beim nächsten Speichern überschrieben
  }
}

function gueltigeStationId(wert: unknown): string {
  return typeof wert === 'string' && findeStation(wert)
    ? wert
    : STANDARD_EINSTELLUNGEN.stationId;
}

function gueltigeGebaeudetypId(wert: unknown): string {
  return typeof wert === 'string' && findeGebaeudetyp(wert)
    ? wert
    : STANDARD_EINSTELLUNGEN.gebaeudetypId;
}

function gueltigeRaumtypId(wert: unknown): string {
  return typeof wert === 'string' && findeRaumtyp(wert) ? wert : STANDARD_EINSTELLUNGEN.raumtypId;
}

function gueltigeAusrichtungId(wert: unknown): string {
  return typeof wert === 'string' && findeAusrichtung(wert)
    ? wert
    : STANDARD_EINSTELLUNGEN.ausrichtungId;
}

function gueltigeSonnenschutzId(wert: unknown): string {
  return typeof wert === 'string' && findeSonnenschutz(wert)
    ? wert
    : STANDARD_EINSTELLUNGEN.sonnenschutzId;
}

function gueltigeZahl(
  wert: unknown,
  grenzen: { readonly min: number; readonly max: number },
  standard: number,
): number {
  if (typeof wert !== 'number' || !Number.isFinite(wert)) return standard;
  if (wert < grenzen.min || wert > grenzen.max) return standard;
  return wert;
}
