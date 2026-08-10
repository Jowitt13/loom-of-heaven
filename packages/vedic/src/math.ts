import { roundTo } from '@loom/contracts';

/** Normalize an angle to [0, 360). */
export function norm360(value: number): number {
  const out = value % 360;
  return out < 0 ? out + 360 : out;
}

/**
 * ADR 0013 §12 boundary policy: classify only after the shared six-decimal
 * canonical rounding, with no independent epsilon tuning knob.
 */
export function canonicalLongitude(value: number): number {
  return norm360(roundTo(value, 6));
}
