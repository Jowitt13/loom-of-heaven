import type { VedicVaara } from '@loom/contracts';
import { Body, Observer, SearchRiseSet } from 'astronomy-engine';
import moment from 'moment-timezone';

const VAARAS: readonly VedicVaara[] = [
  'Ravivara',
  'Somavara',
  'Mangalavara',
  'Budhavara',
  'Guruvara',
  'Shukravara',
  'Shanivara',
];

export interface SunriseSearchInput {
  utcMs: number;
  latitudeDeg: number;
  longitudeEastDeg: number;
}

/**
 * Search backward for the local sunrise that governs a birth instant. The P3B
 * golden pins astronomy-engine's documented apparent top-limb + 34′ refraction
 * calculation to the external Swiss default. v1 deliberately uses sea level:
 * BirthInput elevation is recorded but not applied until a separately-versioned
 * horizon policy exists.
 */
export function previousSunriseUtcMs(input: SunriseSearchInput): number | null {
  const observer = new Observer(input.latitudeDeg, input.longitudeEastDeg, 0);
  const event = SearchRiseSet(Body.Sun, observer, 1, new Date(input.utcMs), -3, 0);
  return event === null ? null : event.date.getTime();
}

/** Forward counterpart used by the offline Swiss mapping regression. */
export function nextSunriseUtcMs(input: SunriseSearchInput): number | null {
  const observer = new Observer(input.latitudeDeg, input.longitudeEastDeg, 0);
  const event = SearchRiseSet(Body.Sun, observer, 1, new Date(input.utcMs), 3, 0);
  return event === null ? null : event.date.getTime();
}

/** Return the traditional sunrise-to-sunrise weekday, or null when no nearby sunrise exists. */
export function vaaraAtInstant(
  input: SunriseSearchInput & { timezone: string },
): VedicVaara | null {
  const sunriseUtcMs = previousSunriseUtcMs(input);
  if (sunriseUtcMs === null) return null;
  return VAARAS[moment.tz(sunriseUtcMs, input.timezone).day()]!;
}
