import type { VedicDashaAntarPeriod, VedicDashaLord, VedicVimshottari } from '@loom/contracts';
import { canonicalLongitude } from './math.ts';

/** Owner-confirmed P3B model: 365.25 SI days, never calendar-year arithmetic. */
export const VIMSHOTTARI_YEAR_DAYS = 365.25;
export const VIMSHOTTARI_YEAR_MS = VIMSHOTTARI_YEAR_DAYS * 86_400_000;
const NAKSHATRA_DEGREES = 360 / 27;
const CYCLE_YEARS = 120;

export const VIMSHOTTARI_LORDS: readonly VedicDashaLord[] = [
  'Ketu',
  'Venus',
  'Sun',
  'Moon',
  'Mars',
  'Rahu',
  'Jupiter',
  'Saturn',
  'Mercury',
];

export const VIMSHOTTARI_YEARS: Readonly<Record<VedicDashaLord, number>> = {
  Ketu: 7,
  Venus: 20,
  Sun: 6,
  Moon: 10,
  Mars: 7,
  Rahu: 18,
  Jupiter: 16,
  Saturn: 19,
  Mercury: 17,
};

function toIso(utcMs: number): string {
  return new Date(utcMs).toISOString().replace(/\.000Z$/, 'Z');
}

function rotateFrom(lord: VedicDashaLord): readonly VedicDashaLord[] {
  const index = VIMSHOTTARI_LORDS.indexOf(lord);
  if (index < 0) throw new Error(`unknown Vimshottari lord: ${lord}`);
  return [...VIMSHOTTARI_LORDS.slice(index), ...VIMSHOTTARI_LORDS.slice(0, index)];
}

function interval(lord: VedicDashaLord, startUtcMs: number, endUtcMs: number) {
  return { lord, startUtc: toIso(startUtcMs), endUtc: toIso(endUtcMs) };
}

function buildAntars(
  mahaLord: VedicDashaLord,
  startUtcMs: number,
  parentEndUtcMs: number,
): VedicDashaAntarPeriod[] {
  const mahaYears = VIMSHOTTARI_YEARS[mahaLord];
  const lords = rotateFrom(mahaLord);
  const antars: VedicDashaAntarPeriod[] = [];
  let cursor = startUtcMs;
  for (let index = 0; index < lords.length; index++) {
    const lord = lords[index]!;
    // The final endpoint is inherited, never independently rounded: exact, gap-free [start,end).
    const childEndUtcMs =
      index === lords.length - 1
        ? parentEndUtcMs
        : cursor + (VIMSHOTTARI_YEAR_MS * mahaYears * VIMSHOTTARI_YEARS[lord]) / CYCLE_YEARS;
    antars.push(interval(lord, cursor, childEndUtcMs));
    cursor = childEndUtcMs;
  }
  return antars;
}

/**
 * Deterministic Maha + Antar Vimshottari timeline for an already-verified sidereal Moon.
 *
 * The input longitude is canonicalized before the frozen left-closed/right-open
 * nakshatra classification. This module deliberately does not calculate a Moon
 * position itself: P2's Swiss-gated numerical provider owns that separate concern.
 */
export function vimshottariFromMoon(
  birthUtcMs: number,
  siderealMoonLongitudeDeg: number,
): VedicVimshottari {
  if (!Number.isFinite(birthUtcMs)) throw new Error('birthUtcMs must be finite');
  const moon = canonicalLongitude(siderealMoonLongitudeDeg);
  const nakshatraIndex = Math.floor(moon / NAKSHATRA_DEGREES);
  const offset = moon - nakshatraIndex * NAKSHATRA_DEGREES;
  const progressFraction = offset / NAKSHATRA_DEGREES;
  const startLord = VIMSHOTTARI_LORDS[nakshatraIndex % VIMSHOTTARI_LORDS.length]!;
  const firstMahaYears = VIMSHOTTARI_YEARS[startLord];
  const lords = rotateFrom(startLord);
  const mahadashas: VedicVimshottari['mahadashas'] = [];

  let startUtcMs = birthUtcMs - progressFraction * firstMahaYears * VIMSHOTTARI_YEAR_MS;
  for (const lord of lords) {
    const endUtcMs = startUtcMs + VIMSHOTTARI_YEARS[lord] * VIMSHOTTARI_YEAR_MS;
    mahadashas.push({
      ...interval(lord, startUtcMs, endUtcMs),
      antar: buildAntars(lord, startUtcMs, endUtcMs),
    });
    startUtcMs = endUtcMs;
  }

  return {
    dashaYear: 'julian-365.25',
    birthMoonLongitudeDeg: moon,
    birthNakshatraIndex: nakshatraIndex + 1,
    nakshatraProgressFraction: progressFraction,
    mahadashas,
  };
}
