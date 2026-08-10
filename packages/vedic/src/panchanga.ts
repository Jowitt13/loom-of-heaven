import type { VedicInstantaneousPanchanga } from '@loom/contracts';
import { canonicalLongitude, norm360 } from './math.ts';

const DEGREES_PER_YOGA = 360 / 27;
const MOVABLE_KARANAS = [
  'Bava',
  'Balava',
  'Kaulava',
  'Taitila',
  'Garaja',
  'Vanija',
  'Vishti',
] as const;

/**
 * Instantaneous panchanga from canonical sidereal Sun/Moon longitudes. Vaara is
 * added separately by classifications.ts because it depends on the verified
 * location-aware sunrise mapping in sunrise.ts.
 */
export function instantaneousPanchanga(
  sunLongitudeDeg: number,
  moonLongitudeDeg: number,
): VedicInstantaneousPanchanga {
  const sun = canonicalLongitude(sunLongitudeDeg);
  const moon = canonicalLongitude(moonLongitudeDeg);
  const elongation = norm360(moon - sun);
  const tithiNumber = Math.floor(elongation / 12) + 1;
  const karanaSlot = Math.floor(elongation / 6);
  const karanaName =
    karanaSlot === 0
      ? 'Kimstughna'
      : karanaSlot <= 56
        ? MOVABLE_KARANAS[(karanaSlot - 1) % MOVABLE_KARANAS.length]!
        : karanaSlot === 57
          ? 'Shakuni'
          : karanaSlot === 58
            ? 'Chatushpada'
            : 'Naga';
  return {
    tithi: { number: tithiNumber, paksha: tithiNumber <= 15 ? 'shukla' : 'krishna' },
    // This is deliberately the sidereal sum: ayanamsha does not cancel in Yoga.
    yoga: { number: Math.floor(norm360(moon + sun) / DEGREES_PER_YOGA) + 1 },
    karana: { slot: karanaSlot, name: karanaName },
  };
}
