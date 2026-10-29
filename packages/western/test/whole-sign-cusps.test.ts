import { describe, expect, it } from 'vitest';
import { norm360 } from '../src/ephemeris.ts';
import { houseOfLongitude, wholeSignCusps } from '../src/houses.ts';

describe('whole-sign cusp definition', () => {
  it.each([
    [0, 0],
    [29.999999, 0],
    [30, 30],
    [59.999999, 30],
    [240, 240],
    [246.288575, 240],
    [330, 330],
    [359.999999, 330],
  ])('Ascendant %s starts house 1 at %s', (ascendant, signStart) => {
    const cusps = wholeSignCusps(ascendant);
    expect(cusps).toHaveLength(12);
    for (let i = 0; i < 12; i++) {
      expect(cusps[i]).toBe(norm360(signStart + i * 30));
    }
  });

  it('covers all twelve Ascendant signs with consecutive 30-degree cusps and placement', () => {
    for (let sign = 0; sign < 12; sign++) {
      const cusps = wholeSignCusps(sign * 30 + 17.25);
      expect(cusps[0]).toBe(sign * 30);
      for (let i = 0; i < 12; i++) {
        expect(cusps[i]).toBe(norm360(sign * 30 + i * 30));
        const next = cusps[(i + 1) % 12]!;
        expect(norm360(next - cusps[i]!)).toBe(30);
        expect(houseOfLongitude(cusps, cusps[i]!)).toBe(i + 1);
        expect(houseOfLongitude(cusps, norm360(cusps[i]! + 29.999999))).toBe(i + 1);
      }
    }
  });

  it('uses [cusp, next cusp) intervals, including exact cusp equality', () => {
    const cusps = wholeSignCusps(240); // house 1 starts at 240; house 12 starts at 210.
    expect(houseOfLongitude(cusps, 240)).toBe(1);
    expect(houseOfLongitude(cusps, 269.999999999)).toBe(1);
    expect(houseOfLongitude(cusps, 270)).toBe(2);
    expect(houseOfLongitude(cusps, 239.999999999)).toBe(12);
    expect(houseOfLongitude(cusps, 0)).toBe(5);
    expect(houseOfLongitude(cusps, 359.999999999)).toBe(4);
  });

  it('wraps the twelfth house back across 0/360', () => {
    const cusps = wholeSignCusps(330); // house 1 starts at 330; house 12 starts at 300.
    expect(houseOfLongitude(cusps, 330)).toBe(1);
    expect(houseOfLongitude(cusps, 359.999999999)).toBe(1);
    expect(houseOfLongitude(cusps, 0)).toBe(2);
    expect(houseOfLongitude(cusps, 329.999999999)).toBe(12);
    expect(houseOfLongitude(cusps, 300)).toBe(12);
    expect(houseOfLongitude(cusps, 299.999999999)).toBe(11);
  });
});
