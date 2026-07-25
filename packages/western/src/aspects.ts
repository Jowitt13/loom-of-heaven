import type { WesternAspect, WesternAspectType } from '@ming/contracts';
import { deltaLon } from './ephemeris.ts';

/**
 * Major-aspect detection with a versioned orb table (carried by the active ruleset).
 * Applying/separating is decided by whether the orb shrinks over a one-day linear
 * extrapolation of each point's apparent speed. Deterministic geometry only.
 */

/** Orb allowance per aspect type (degrees), the ruleset's `western-tropical-*@0.1.0` table. */
export const ASPECT_DEFINITIONS: ReadonlyArray<{
  type: WesternAspectType;
  angleDeg: number;
  orbDeg: number;
}> = [
  { type: 'conjunction', angleDeg: 0, orbDeg: 8 },
  { type: 'sextile', angleDeg: 60, orbDeg: 4 },
  { type: 'square', angleDeg: 90, orbDeg: 7 },
  { type: 'trine', angleDeg: 120, orbDeg: 8 },
  { type: 'opposition', angleDeg: 180, orbDeg: 8 },
];

export interface AspectPoint {
  body: string;
  longitudeDeg: number;
  speedDegPerDay: number;
}

function separationDeg(a: AspectPoint, b: AspectPoint, dayOffset = 0): number {
  const lonA = a.longitudeDeg + a.speedDegPerDay * dayOffset;
  const lonB = b.longitudeDeg + b.speedDegPerDay * dayOffset;
  return Math.abs(deltaLon(lonA, lonB)); // 0..180
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Detect all major aspects among the given points (planet pairs, no self-aspects). */
export function computeAspects(points: AspectPoint[]): WesternAspect[] {
  const aspects: WesternAspect[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i]!;
      const b = points[j]!;
      const separation = separationDeg(a, b);
      for (const def of ASPECT_DEFINITIONS) {
        const orb = Math.abs(separation - def.angleDeg);
        if (orb <= def.orbDeg) {
          const orbLater = Math.abs(separationDeg(a, b, 1) - def.angleDeg);
          aspects.push({
            bodyA: a.body,
            bodyB: b.body,
            type: def.type,
            orbDeg: round2(orb),
            applying: orbLater < orb,
          });
          break; // a pair takes at most the single nearest aspect
        }
      }
    }
  }
  return aspects;
}
