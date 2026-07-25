import { zoneOffsetWestMin } from './tzdb.ts';

/**
 * A concrete instant that a given wall clock can map to in a zone.
 * `offsetWestMin` follows moment's west-positive convention; `offsetEastMin` is
 * the ISO convention (east positive) used in output strings.
 */
export interface InstantCandidate {
  utcMs: number;
  offsetWestMin: number;
  offsetEastMin: number;
}

/**
 * Resolve a wall-clock reading to every valid UTC instant in a zone.
 *
 * Local time -> UTC is a lookup+verify problem: for each plausible offset around
 * the reading we compute a candidate instant and keep it only if the zone maps
 * that instant back to the same offset. The outcome tells us the DST situation:
 *
 *   0 candidates -> the wall time does not exist (spring-forward gap)
 *   1 candidate  -> unambiguous
 *   2 candidates -> ambiguous (autumn fall-back); caller must pick earlier/later
 *
 * We never silently guess (handoff §4). Candidates are returned sorted ascending
 * by instant, so index 0 is the "earlier" wall occurrence and index 1 the "later".
 */
export function resolveWallClock(wallMs: number, zone: string): InstantCandidate[] {
  // Sample offsets a day before / at / after the reading to capture both sides
  // of any single DST transition within the surrounding day.
  const probes = [wallMs - 86_400_000, wallMs, wallMs + 86_400_000];
  const offsets = new Set<number>();
  for (const probe of probes) offsets.add(zoneOffsetWestMin(zone, probe));

  const candidates: InstantCandidate[] = [];
  const seenInstants = new Set<number>();
  for (const offsetWestMin of offsets) {
    const utcMs = wallMs + offsetWestMin * 60_000;
    // Round-trip check: does the zone actually use this offset at this instant?
    if (zoneOffsetWestMin(zone, utcMs) === offsetWestMin && !seenInstants.has(utcMs)) {
      seenInstants.add(utcMs);
      // Normalize -0 to 0 so the ISO offset and numeric comparisons stay clean.
      const offsetEastMin = offsetWestMin === 0 ? 0 : -offsetWestMin;
      candidates.push({ utcMs, offsetWestMin, offsetEastMin });
    }
  }

  candidates.sort((a, b) => a.utcMs - b.utcMs);
  return candidates;
}
