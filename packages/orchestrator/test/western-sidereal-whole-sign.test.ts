// Synthetic fixture — fictional data only; not a real person.
import { describe, expect, it } from 'vitest';
import {
  ERROR_CODES,
  EngineError,
  WESTERN_RULESET_CURRENT,
  WESTERN_RULESET_RETIRED,
  canonicalJson,
  parseBirthInput,
} from '@loom/contracts';
import type { BirthInputRaw, WesternSettings } from '@loom/contracts';
import { calculate, runAnswerPlan, runInterpret } from '@loom/orchestrator';

const FIXED = Date.parse('2026-01-01T00:00:00Z');

const base: BirthInputRaw = {
  calendar: 'gregorian',
  localDate: '1991-02-03',
  localTime: '04:05:06',
  timeAccuracy: 'exact',
  timezone: 'Asia/Shanghai',
  location: { latitude: 31.23, longitude: 121.47, source: 'user' },
  settings: {
    systems: ['western'],
    western: { zodiac: 'sidereal', houseSystem: 'whole-sign', asteroids: false },
  },
};

function chart(western: Partial<WesternSettings> = {}) {
  return calculate(
    parseBirthInput({
      ...base,
      settings: {
        ...base.settings,
        western: { ...(base.settings!.western as object), ...western },
      },
    }),
    { now: FIXED },
  ).western!;
}

/** Independent whole-sign partition: cusp 1 starts house 1, each house is 30°. */
function expectedHouse(longitudeDeg: number, firstCuspDeg: number): number {
  return 1 + Math.floor(((((longitudeDeg - firstCuspDeg) % 360) + 360) % 360) / 30);
}

describe('sidereal whole-sign houses', () => {
  it('anchors cusps to the sidereal Ascendant sign and uses them for placement', () => {
    const w = chart();
    expect(w.zodiac).toBe('sidereal');
    expect(w.houseSystem).toBe('whole-sign');
    expect(w.rulesetId).toBe('western-tropical-placidus@0.2.1');
    expect(w.angles!.ascendant.longitudeDeg).toBeCloseTo(246.288575, 3);
    expect(w.houses[0]!.cuspLongitudeDeg).toBe(240);
    for (let i = 0; i < 12; i++) {
      expect(w.houses[i]!.cuspLongitudeDeg).toBe((240 + i * 30) % 360);
    }
    const mercury = w.planets.find((planet) => planet.body === 'Mercury')!;
    const saturn = w.planets.find((planet) => planet.body === 'Saturn')!;
    expect(mercury.longitudeDeg).toBeCloseTo(271.620028, 3);
    expect(saturn.longitudeDeg).toBeCloseTo(275.813891, 3);
    expect(mercury.house).toBe(2);
    expect(saturn.house).toBe(2);
    // The true angles stay at their real longitudes; only the cusps are sign-anchored.
    expect(w.angles!.ascendant.longitudeDeg).not.toBe(w.houses[0]!.cuspLongitudeDeg);
    expect(w.angles!.mc.longitudeDeg).not.toBe(w.houses[9]!.cuspLongitudeDeg);
  });

  it('records the migrated ruleset in result and provenance', () => {
    const bundle = calculate(parseBirthInput(base), { now: FIXED });
    expect(bundle.western?.rulesetId).toBe(WESTERN_RULESET_CURRENT);
    expect(WESTERN_RULESET_CURRENT).toBe('western-tropical-placidus@0.2.1');
    expect(bundle.provenance.rulesets).toContainEqual({
      id: 'western-tropical-placidus',
      version: '0.2.1',
    });

    const explicit = chart({ rulesetId: 'western-tropical-placidus@0.2.1' });
    expect(explicit.rulesetId).toBe('western-tropical-placidus@0.2.1');
    expect(explicit.houses[0]!.cuspLongitudeDeg).toBe(240);
  });

  it('rejects both retired Western versions, including with unknown time', () => {
    for (const retired of WESTERN_RULESET_RETIRED) {
      for (const timeAccuracy of ['exact', 'unknown'] as const) {
        const input = parseBirthInput({
          ...base,
          timeAccuracy,
          localTime: timeAccuracy === 'unknown' ? undefined : base.localTime,
          settings: {
            ...base.settings,
            western: {
              ...(base.settings!.western as object),
              rulesetId: retired,
            },
          },
        });
        let thrown: unknown;
        try {
          calculate(input, { now: FIXED });
        } catch (e) {
          thrown = e;
        }
        expect(thrown).toBeInstanceOf(EngineError);
        const err = thrown as EngineError;
        expect(err.code).toBe(ERROR_CODES.RULESET_UNSUPPORTED);
        expect(err.message).toContain(retired);
        expect(err.message).toContain(WESTERN_RULESET_CURRENT);
      }
    }
  });

  it('assigns every plotted point with the same whole-sign ring', () => {
    const w = chart({ asteroids: true });
    expect(w.planets).toHaveLength(17);
    const firstCusp = w.houses[0]!.cuspLongitudeDeg;
    for (const planet of w.planets) {
      expect(planet.house, planet.body).toBe(expectedHouse(planet.longitudeDeg, firstCusp));
    }
  });

  it('keeps the same rule under both ayanamsha models', () => {
    for (const ayanamsha of ['lahiri', 'fagan-bradley'] as const) {
      const w = chart({ ayanamsha });
      const firstCusp = w.houses[0]!.cuspLongitudeDeg;
      expect(firstCusp % 30).toBeCloseTo(0, 9);
      expect(firstCusp).toBeCloseTo(Math.floor(w.angles!.ascendant.longitudeDeg / 30) * 30, 6);
      for (const planet of w.planets) {
        expect(planet.house, `${ayanamsha} ${planet.body}`).toBe(
          expectedHouse(planet.longitudeDeg, firstCusp),
        );
      }
    }
  });

  it('leaves tropical whole-sign and the other tropical house systems unchanged', () => {
    const whole = chart({ zodiac: 'tropical' });
    expect(whole.houses[0]!.cuspLongitudeDeg).toBe(
      Math.floor(whole.angles!.ascendant.longitudeDeg / 30) * 30,
    );
    expect(whole.planets.find((planet) => planet.body === 'Mercury')!.house).toBe(1);
    expect(whole.planets.find((planet) => planet.body === 'Saturn')!.house).toBe(1);
    for (const houseSystem of ['equal', 'placidus', 'koch', 'porphyry'] as const) {
      const w = chart({ zodiac: 'tropical', houseSystem });
      expect(w.houses[0]!.cuspLongitudeDeg).toBeCloseTo(w.angles!.ascendant.longitudeDeg, 4);
    }
  });

  it('keeps sidereal equal and quadrant placement equivalent to the tropical partition', () => {
    for (const houseSystem of ['equal', 'placidus', 'koch', 'porphyry'] as const) {
      const tropical = chart({ zodiac: 'tropical', houseSystem });
      const sidereal = chart({ zodiac: 'sidereal', houseSystem });
      for (const planet of tropical.planets) {
        expect(
          sidereal.planets.find((candidate) => candidate.body === planet.body)!.house,
          `${houseSystem} ${planet.body}`,
        ).toBe(planet.house);
      }
    }
  });

  it('does not fabricate angles or houses when the birth time is unknown', () => {
    const bundle = calculate(
      parseBirthInput({
        ...base,
        timeAccuracy: 'unknown',
        localTime: undefined,
      }),
      { now: FIXED },
    );
    const w = bundle.western!;
    expect(w.angles).toBeNull();
    expect(w.houses).toEqual([]);
    expect(w.planets.length).toBeGreaterThan(0);
    for (const planet of w.planets) expect(planet.house).toBeNull();
  });

  it('passes the corrected house to interpret and answer-plan', () => {
    const input = parseBirthInput(base);
    const interpretation = runInterpret(input, { now: FIXED }).interpretation;
    const claims = interpretation.facts
      .map((fact) => fact.claim)
      .filter((claim) => /在第\d+宫/.test(claim));
    expect(claims).toContain('Moon在第10宫：核心能量与事业、社会地位和公众形象相关');
    expect(claims.some((claim) => claim.startsWith('Moon在第1宫'))).toBe(false);

    const { publicResult } = runAnswerPlan(input, { topic: 'character', now: FIXED });
    const selected = publicResult.facts.map((fact) => fact.claim);
    expect(selected).toContain('Moon在第10宫：核心能量与事业、社会地位和公众形象相关');
    const serialized = JSON.stringify(publicResult);
    expect(serialized).not.toContain('Moon在第1宫');
    expect(serialized).not.toContain('Mercury在第1宫');
    expect(serialized).not.toContain('Saturn在第1宫');
  });

  it('is deterministic for the sidereal whole-sign configuration', () => {
    expect(canonicalJson(chart())).toBe(canonicalJson(chart()));
  });
});
