import { rashiIndexOf } from './rashi.ts';

/** One-based whole-sign bhava for a point relative to the Lagna rashi. */
export function wholeSignBhavaOf(longitudeDeg: number, lagnaLongitudeDeg: number): number {
  return ((rashiIndexOf(longitudeDeg) - rashiIndexOf(lagnaLongitudeDeg) + 12) % 12) + 1;
}
