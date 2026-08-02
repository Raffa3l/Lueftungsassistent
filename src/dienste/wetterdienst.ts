import type { Wetterstation, Wetterstunde } from '../typen.ts';
import { celsius, meterProSekunde, wattProM2 } from '../einheiten.ts';
import { VORLAUF_TAGE } from '../konfiguration/standardwerte.ts';
import { taupunktAusFeuchte } from '../logik/feuchte.ts';

/**
 * Anbindung an die Open-Meteo-Wetter-API.
 *
 * Warum Open-Meteo und nicht MeteoSchweiz?
 * MeteoSchweiz stellt seine Messdaten über opendata.swiss und IDAWEB bereit.
 * IDAWEB verlangt eine Registrierung und liefert Dateien statt einer Web-API;
 * die offenen CSV-Feeds auf opendata.swiss enthalten Messwerte, aber keine
 * stündliche Prognose – und ohne Prognose kann der Assistent nicht sagen,
 * wann die Fenster zu schliessen sind. Open-Meteo ist kostenlos, benötigt
 * keinen Schlüssel, liefert CORS-Header und rechnet für die Schweiz mit dem
 * hochaufgelösten ICON-CH-Modell von MeteoSchweiz.
 *
 * Zeitzonen-Konvention (wichtig):
 * Die API liefert mit `timezone=Europe/Zurich` lokale Zeitstempel ohne Offset
 * («2026-08-01T14:00»). Diese werden bewusst als lokale Gerätezeit geparst.
 * Dadurch entspricht `zeit.getHours()` immer der Schweizer Wanduhrzeit – auch
 * wenn das Gerät in einer anderen Zeitzone steht. Der aktuelle Zeitpunkt muss
 * deshalb über `jetztInStationszeit()` bestimmt werden, nicht über `new Date()`.
 */

const API_BASIS_URL = 'https://api.open-meteo.com/v1/forecast';
const ZEITZONE = 'Europe/Zurich';
const PROGNOSE_TAGE = 3;

/** Fehler beim Laden der Wetterdaten – Meldung ist für die Anzeige geeignet. */
export class WetterdatenFehler extends Error {
  constructor(meldung: string, public readonly ursache?: unknown) {
    super(meldung);
    this.name = 'WetterdatenFehler';
  }
}

/** Struktur der von uns angeforderten Open-Meteo-Antwort. */
interface OpenMeteoAntwort {
  hourly?: {
    time?: string[];
    temperature_2m?: (number | null)[];
    relative_humidity_2m?: (number | null)[];
    dew_point_2m?: (number | null)[];
    shortwave_radiation?: (number | null)[];
    direct_normal_irradiance?: (number | null)[];
    diffuse_radiation?: (number | null)[];
    wind_speed_10m?: (number | null)[];
  };
  error?: boolean;
  reason?: string;
}

/**
 * Lädt Vergangenheit (Vorlauf für die Simulation) und Prognose für eine Station.
 */
export async function ladeWetterdaten(
  station: Wetterstation,
  signal?: AbortSignal,
): Promise<Wetterstunde[]> {
  const url = new URL(API_BASIS_URL);
  url.searchParams.set('latitude', String(station.breitengrad));
  url.searchParams.set('longitude', String(station.laengengrad));
  // Höhenangabe verbessert die Temperaturkorrektur (relevant z. B. für Davos).
  url.searchParams.set('elevation', String(station.hoeheMeter));
  url.searchParams.set(
    'hourly',
    'temperature_2m,relative_humidity_2m,dew_point_2m,shortwave_radiation,' +
      'direct_normal_irradiance,diffuse_radiation,wind_speed_10m',
  );
  // Open-Meteo liefert den Wind sonst in km/h.
  url.searchParams.set('wind_speed_unit', 'ms');
  url.searchParams.set('timezone', ZEITZONE);
  url.searchParams.set('past_days', String(VORLAUF_TAGE));
  url.searchParams.set('forecast_days', String(PROGNOSE_TAGE));

  let antwort: Response;
  try {
    antwort = await fetch(url, signal ? { signal } : {});
  } catch (fehler) {
    if (fehler instanceof DOMException && fehler.name === 'AbortError') throw fehler;
    throw new WetterdatenFehler(
      'Keine Verbindung zum Wetterdienst. Bitte Internetverbindung prüfen.',
      fehler,
    );
  }

  if (!antwort.ok) {
    throw new WetterdatenFehler(
      `Der Wetterdienst antwortet nicht wie erwartet (HTTP ${antwort.status}).`,
    );
  }

  const daten = (await antwort.json()) as OpenMeteoAntwort;
  if (daten.error) {
    throw new WetterdatenFehler(daten.reason ?? 'Der Wetterdienst meldet einen Fehler.');
  }

  return wandleAntwortUm(daten);
}

/** Wandelt die spaltenweise Open-Meteo-Antwort in Stunden-Objekte um. */
export function wandleAntwortUm(daten: OpenMeteoAntwort): Wetterstunde[] {
  const zeiten = daten.hourly?.time;
  const temperaturen = daten.hourly?.temperature_2m;
  if (!zeiten?.length || !temperaturen?.length) {
    throw new WetterdatenFehler('Der Wetterdienst hat keine Stundenwerte geliefert.');
  }

  const feuchten = daten.hourly?.relative_humidity_2m ?? [];
  const taupunkte = daten.hourly?.dew_point_2m ?? [];
  const strahlungen = daten.hourly?.shortwave_radiation ?? [];
  const direkte = daten.hourly?.direct_normal_irradiance ?? [];
  const diffuse = daten.hourly?.diffuse_radiation ?? [];
  const winde = daten.hourly?.wind_speed_10m ?? [];

  const stunden: Wetterstunde[] = [];
  for (let i = 0; i < zeiten.length; i++) {
    const zeitText = zeiten[i];
    const temperatur = temperaturen[i];
    // Lücken im Modelloutput überspringen, statt mit 0 zu rechnen.
    if (zeitText === undefined || temperatur === null || temperatur === undefined) continue;

    const relativeFeuchteProzent = feuchten[i] ?? 0;
    // Fehlt der Taupunkt, aus Temperatur und relativer Feuchte nachrechnen.
    // Fehlen beide, ergibt das eine sehr trockene Luft – dann entfallen die
    // Feuchtehinweise, statt vor etwas zu warnen, das niemand geprüft hat.
    const taupunkt =
      taupunkte[i] ?? taupunktAusFeuchte(celsius(temperatur), relativeFeuchteProzent);

    // Die API liefert blanke Zahlen – hier bekommen sie ihre Einheit.
    stunden.push({
      zeit: new Date(zeitText),
      aussentemperaturC: celsius(temperatur),
      globalstrahlungWProM2: wattProM2(strahlungen[i] ?? 0),
      // Fehlen die Anteile, bleibt die Fassadenrechnung wirkungslos und der
      // Eintrag stammt allein aus dem ausrichtungsunabhängigen Teil.
      direktstrahlungNormalWProM2: wattProM2(direkte[i] ?? 0),
      diffusstrahlungWProM2: wattProM2(diffuse[i] ?? 0),
      relativeFeuchteProzent,
      taupunktC: celsius(taupunkt),
      // Ohne Windangabe konservativ mit Windstille rechnen: Das Modell kühlt
      // dann langsamer aus, verspricht also eher zu wenig als zu viel.
      windgeschwindigkeitMProS: meterProSekunde(winde[i] ?? 0),
    });
  }

  if (stunden.length === 0) {
    throw new WetterdatenFehler('Die Wetterdaten sind unvollständig.');
  }
  return stunden;
}

/**
 * Aktuelle Schweizer Wanduhrzeit als Date, dargestellt in Gerätezeit –
 * passend zur Zeitkonvention der API-Zeitstempel (siehe Modulkommentar).
 */
export function jetztInStationszeit(referenz: Date = new Date()): Date {
  // 'sv-SE' formatiert als «2026-08-01 14:23:45» und ist damit direkt parsebar.
  const wanduhrzeit = new Intl.DateTimeFormat('sv-SE', {
    timeZone: ZEITZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(referenz);

  return new Date(wanduhrzeit.replace(' ', 'T'));
}
