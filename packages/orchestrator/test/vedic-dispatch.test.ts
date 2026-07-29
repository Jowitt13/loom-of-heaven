// Synthetic fixture — fictional data only; not a real person.
import { describe, expect, it } from 'vitest';
import { ChartBundle, parseBirthInput } from '@ming/contracts';
import { calculate, runAnswerPlan } from '@ming/orchestrator';

/**
 * Vedic P1 dispatch tests (ADR 0013): explicit systems:['vedic'] routes through
 * computeVedic and yields an honest pending warning — never a fabricated result,
 * provider or ruleset. The default three-system behavior and the v1 public
 * contracts are byte-for-byte unaffected.
 */
const FIXED = Date.parse('2026-01-01T00:00:00Z');

const raw = {
  calendar: 'gregorian',
  localDate: '1990-03-10',
  localTime: '08:15:00',
  timeAccuracy: 'exact',
  timezone: 'Asia/Shanghai',
  location: { latitude: 30.5, longitude: 114.3, source: 'user' },
};

describe('calculate: explicit vedic dispatch (P1 skeleton)', () => {
  it('returns no vedic result, one pending warning, and no vedic provenance', () => {
    const input = parseBirthInput({ ...raw, settings: { systems: ['vedic'] } });
    const bundle = calculate(input, { now: FIXED });
    expect(bundle.vedic).toBeUndefined();
    const pending = bundle.warnings.filter(
      (w) => w.code === 'SYSTEM_NOT_YET_IMPLEMENTED' && w.system === 'vedic',
    );
    expect(pending).toHaveLength(1);
    expect(bundle.provenance.providers.map((p) => p.id)).toEqual([]);
    expect(bundle.provenance.rulesets.map((r) => r.id)).not.toContain('vedic-parashara-lahiri');
    // The bundle (with the reserved slot absent) still validates against the schema.
    expect(ChartBundle.safeParse(bundle).success).toBe(true);
  });

  it('mixed request: real systems compute, vedic only warns', () => {
    const input = parseBirthInput({ ...raw, settings: { systems: ['western', 'vedic'] } });
    const bundle = calculate(input, { now: FIXED });
    expect(bundle.western).toBeDefined();
    expect(bundle.vedic).toBeUndefined();
    expect(
      bundle.warnings.some((w) => w.code === 'SYSTEM_NOT_YET_IMPLEMENTED' && w.system === 'vedic'),
    ).toBe(true);
    // Only the real Western provider appears in provenance.
    expect(bundle.provenance.providers.map((p) => p.id)).toEqual(['astronomy-engine']);
  });

  it('default input behavior is unchanged: no vedic slot, no vedic warnings', () => {
    const bundle = calculate(parseBirthInput(raw), { now: FIXED });
    expect(bundle.vedic).toBeUndefined();
    expect(bundle.warnings.some((w) => w.system === 'vedic')).toBe(false);
    expect(bundle.western).toBeDefined();
    expect(bundle.bazi).toBeDefined();
  });
});

describe('public v1 contracts stay three-system (P4 owns the v2 break)', () => {
  it('PublicResult.systems keeps exactly the three implemented systems', () => {
    const input = parseBirthInput({
      ...raw,
      ruleGender: 'female',
      settings: { systems: ['vedic'] },
    });
    const { publicResult, answerPlan } = runAnswerPlan(input, { now: FIXED, topic: 'career' });
    expect(publicResult.systems).toHaveLength(3);
    expect(publicResult.systems.map((s) => s.system)).toEqual(['western', 'bazi', 'ziwei']);
    expect(publicResult.contractVersion).toBe('public-result/v1');
    expect(answerPlan.contractVersion).toBe('answer-plan/v1');
  });
});
