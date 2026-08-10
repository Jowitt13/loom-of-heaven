import { SOLAR_TIME_METHOD, roundTo } from '@loom/contracts';
import type { SolarTimeInfo } from '@loom/contracts';
import { formatWallDateTime, utcDayOfYear } from './format.ts';

/**
 * Equation of time (minutes) via the NOAA General Monitoring Laboratory solar
 * calculator approximation. Accurate to a few tenths of a minute — adequate for
 * a first version and clearly documented as an approximation (handoff §9).
 *
 * Source: NOAA GML Solar Calculator ("Solar Calculation Details"),
 * https://gml.noaa.gov/grad/solcalc/soleqn.html (US Gov, public domain).
 */
export function equationOfTimeMinutes(utcMs: number): number {
  const date = new Date(utcMs);
  const dayOfYear = utcDayOfYear(utcMs);
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  // Fractional year (radians).
  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (hour - 12) / 24);
  return (
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma))
  );
}

/**
 * Compute mean and apparent solar time for a location at a given UTC instant.
 *
 * Mean solar time is purely longitude-driven (1 deg = 4 min, east positive),
 * independent of the civil zone — so we never hardcode 120 deg E / UTC+8 for the
 * whole world (handoff §4). Apparent solar time adds the equation of time.
 */
export function computeSolarTime(utcMs: number, longitudeDeg: number): SolarTimeInfo {
  const longitudeOffsetMinutes = longitudeDeg * 4;
  const eot = equationOfTimeMinutes(utcMs);

  const meanWallMs = utcMs + longitudeOffsetMinutes * 60_000;
  const apparentWallMs = meanWallMs + eot * 60_000;

  return {
    meanSolarTimeIso: formatWallDateTime(meanWallMs),
    apparentSolarTimeIso: formatWallDateTime(apparentWallMs),
    longitudeOffsetMinutes: roundTo(longitudeOffsetMinutes, 4),
    equationOfTimeMinutes: roundTo(eot, 4),
    method: SOLAR_TIME_METHOD,
  };
}
