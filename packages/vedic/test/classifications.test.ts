// Synthetic values only; these are mathematical boundary probes, not a real chart.
import { describe, expect, it } from 'vitest';
import {
  deriveVedicClassifications,
  instantaneousPanchanga,
  nakshatraOf,
  navamshaOf,
  navamshaRashiIndexByModality,
  navamshaRashiIndexByTriplicity,
  rashiOf,
  wholeSignBhavaOf,
} from '@ming/vedic';

describe('Vedic P3A classifications: canonical boundaries', () => {
  it('classifies rashi after the frozen six-decimal rounding and uses [start, end)', () => {
    expect(rashiOf(0)).toBe('Mesha');
    expect(rashiOf(29.999999)).toBe('Mesha');
    expect(rashiOf(30)).toBe('Vrishabha');
    // The post-rounding value is 30.000000; there is no separate epsilon knob.
    expect(rashiOf(29.9999996)).toBe('Vrishabha');
    expect(rashiOf(359.999999)).toBe('Meena');
    expect(rashiOf(359.9999996)).toBe('Mesha');
  });

  it('classifies every Nakshatra and Pada boundary left-closed/right-open', () => {
    expect(nakshatraOf(0)).toEqual({ index: 1, name: 'Ashwini', pada: 1 });
    expect(nakshatraOf(3.333333)).toEqual({ index: 1, name: 'Ashwini', pada: 1 });
    expect(nakshatraOf(3.333334)).toEqual({ index: 1, name: 'Ashwini', pada: 2 });
    expect(nakshatraOf(13.333333)).toEqual({ index: 1, name: 'Ashwini', pada: 4 });
    expect(nakshatraOf(13.333334)).toEqual({ index: 2, name: 'Bharani', pada: 1 });
    expect(nakshatraOf(359.999999)).toEqual({ index: 27, name: 'Revati', pada: 4 });
    expect(nakshatraOf(359.9999996)).toEqual({ index: 1, name: 'Ashwini', pada: 1 });
  });

  it('uses the frozen 60-position tithi/karana sequence and sidereal Yoga sum', () => {
    expect(instantaneousPanchanga(0, 0)).toEqual({
      tithi: { number: 1, paksha: 'shukla' },
      yoga: { number: 1 },
      karana: { slot: 0, name: 'Kimstughna' },
    });
    expect(instantaneousPanchanga(0, 5.999999).karana).toEqual({ slot: 0, name: 'Kimstughna' });
    expect(instantaneousPanchanga(0, 6).karana).toEqual({ slot: 1, name: 'Bava' });
    expect(instantaneousPanchanga(0, 11.999999).tithi).toEqual({
      number: 1,
      paksha: 'shukla',
    });
    expect(instantaneousPanchanga(0, 12).tithi).toEqual({ number: 2, paksha: 'shukla' });
    expect(instantaneousPanchanga(0, 179.999999).tithi).toEqual({
      number: 15,
      paksha: 'shukla',
    });
    expect(instantaneousPanchanga(0, 180).tithi).toEqual({ number: 16, paksha: 'krishna' });
    expect(instantaneousPanchanga(0, 342).karana).toEqual({ slot: 57, name: 'Shakuni' });
    expect(instantaneousPanchanga(0, 348).karana).toEqual({ slot: 58, name: 'Chatushpada' });
    expect(instantaneousPanchanga(0, 354).karana).toEqual({ slot: 59, name: 'Naga' });
    // Yoga uses λMoon + λSun. It is not an elongation and does not cancel ayanamsha.
    expect(instantaneousPanchanga(0, 13.333333).yoga).toEqual({ number: 1 });
    expect(instantaneousPanchanga(0, 13.333334).yoga).toEqual({ number: 2 });
  });
});

describe('Vedic P3A classifications: whole-sign bhava and D9', () => {
  it('derives one-based whole-sign bhavas from the Lagna rashi only', () => {
    expect(wholeSignBhavaOf(15, 15)).toBe(1);
    expect(wholeSignBhavaOf(44.999999, 15)).toBe(2);
    expect(wholeSignBhavaOf(345, 15)).toBe(12);
    // Degree within the Lagna rashi does not alter whole-sign house membership.
    expect(wholeSignBhavaOf(29.999999, 0.000001)).toBe(1);
  });

  it('keeps the modality and triplicity formulations of D9 equivalent at every division edge', () => {
    for (let rashi = 0; rashi < 12; rashi++) {
      for (let division = 0; division < 9; division++) {
        for (const offset of [0, 0.000001, 3.333332, 3.333333]) {
          const longitude = rashi * 30 + division * (30 / 9) + offset;
          expect(navamshaRashiIndexByModality(longitude), `${rashi}/${division}/${offset}`).toBe(
            navamshaRashiIndexByTriplicity(longitude),
          );
        }
      }
    }
    expect(navamshaOf(0)).toBe('Mesha');
    expect(navamshaOf(30)).toBe('Makara');
    expect(navamshaOf(60)).toBe('Tula');
    expect(navamshaOf(90)).toBe('Karka');
  });
});

describe('Vedic P3A classifications: complete overlay', () => {
  it('derives both node modes without selecting an unresolved Rahu default', () => {
    const derived = deriveVedicClassifications(
      {
        grahas: {
          Sun: 0,
          Moon: 12,
          Mercury: 30,
          Venus: 60,
          Mars: 90,
          Jupiter: 120,
          Saturn: 150,
        },
        meanRahuLongitudeDeg: 180,
        meanKetuLongitudeDeg: 0,
        trueRahuLongitudeDeg: 181,
        trueKetuLongitudeDeg: 1,
        lagnaLongitudeDeg: 15,
      },
      { birthUtcMs: Date.UTC(2000, 0, 1), vaara: 'Shanivara', includeVimshottari: true },
    );
    expect(derived.grahas).toHaveLength(7);
    expect(derived.grahas[0]).toMatchObject({ graha: 'Sun', rashi: 'Mesha', bhava: 1 });
    expect(derived.grahas[1]).toMatchObject({
      graha: 'Moon',
      rashi: 'Mesha',
      nakshatra: { index: 1, pada: 4 },
    });
    expect(derived.nodes.mean.rahu.rashi).toBe('Tula');
    expect(derived.nodes.true.rahu.rashi).toBe('Tula');
    expect(derived.lagna.bhava).toBe(1);
    expect(derived.panchanga).toEqual({
      tithi: { number: 2, paksha: 'shukla' },
      yoga: { number: 1 },
      karana: { slot: 2, name: 'Balava' },
      vaara: 'Shanivara',
    });
    expect(derived.vimshottari).toMatchObject({
      dashaYear: 'julian-365.25',
      birthNakshatraIndex: 1,
    });
  });
});
