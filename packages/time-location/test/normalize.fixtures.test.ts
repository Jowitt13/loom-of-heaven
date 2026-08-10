import { describe, expect, it } from 'vitest';
import { EngineError, parseBirthInput } from '@loom/contracts';
import { collectTimeWarnings, normalizeBirthData } from '@loom/time-location';
import { fixtureCount, timeLocationFixtures } from '@loom/test-fixtures';

describe('time/location boundary fixtures', () => {
  it('ships at least 30 sourced boundary fixtures', () => {
    expect(fixtureCount()).toBeGreaterThanOrEqual(30);
  });

  for (const fx of timeLocationFixtures) {
    it(`${fx.id}: ${fx.description}`, () => {
      const input = parseBirthInput(fx.input);

      if (fx.expect.kind === 'error') {
        let thrown: unknown;
        try {
          normalizeBirthData(input);
        } catch (err) {
          thrown = err;
        }
        expect(thrown).toBeInstanceOf(EngineError);
        expect((thrown as EngineError).code).toBe(fx.expect.code);
        return;
      }

      const normalized = normalizeBirthData(input);
      const warnings = collectTimeWarnings(input, normalized);
      const e = fx.expect;

      if (e.utcInstant !== undefined) expect(normalized.utcInstant).toBe(e.utcInstant);
      if (e.offsetEastMinutes !== undefined) {
        expect(normalized.timezoneOffsetMinutes).toBe(e.offsetEastMinutes);
      }
      if (e.ambiguityStatus !== undefined)
        expect(normalized.ambiguity.status).toBe(e.ambiguityStatus);
      if (e.candidateCount !== undefined) {
        expect(normalized.ambiguity.candidateCount).toBe(e.candidateCount);
      }
      if (e.timeKnown !== undefined) expect(normalized.timeKnown).toBe(e.timeKnown);
      if (e.longitudeOffsetMinutes !== undefined) {
        expect(normalized.solar?.longitudeOffsetMinutes).toBe(e.longitudeOffsetMinutes);
      }
      if (e.warningsInclude) {
        const codes = warnings.map((w) => w.code);
        for (const code of e.warningsInclude) expect(codes).toContain(code);
      }
    });
  }
});
