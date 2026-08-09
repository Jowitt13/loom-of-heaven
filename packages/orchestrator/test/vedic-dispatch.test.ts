// Synthetic fixture — fictional data only; not a real person.
import { describe, expect, it } from 'vitest';
import { ChartBundle, parseBirthInput } from '@ming/contracts';
import { calculate, runAnswerPlan } from '@ming/orchestrator';

const FIXED = Date.parse('2026-01-01T00:00:00Z');

const raw = {
  calendar: 'gregorian',
  localDate: '1990-03-10',
  localTime: '08:15:00',
  timeAccuracy: 'exact',
  timezone: 'Asia/Shanghai',
  location: { latitude: 30.5, longitude: 114.3, source: 'user' },
};

describe('calculate: explicit vedic dispatch (P2 numerical substrate)', () => {
  it('returns a Vedic result with provenance and no pending-provider warning', () => {
    const input = parseBirthInput({ ...raw, settings: { systems: ['vedic'] } });
    const bundle = calculate(input, { now: FIXED });
    expect(bundle.vedic).toBeDefined();
    expect(bundle.vedic?.provider.id).toBe('caelus');
    expect(bundle.warnings.some((w) => w.code === 'SYSTEM_NOT_YET_IMPLEMENTED')).toBe(false);
    expect(bundle.provenance.providers.map((p) => p.id)).toEqual(['caelus']);
    expect(bundle.provenance.rulesets.map((r) => r.id)).toContain('vedic-parashara-lahiri');
    expect(ChartBundle.safeParse(bundle).success).toBe(true);
  });

  it('mixed request computes both real systems and records both providers', () => {
    const input = parseBirthInput({ ...raw, settings: { systems: ['western', 'vedic'] } });
    const bundle = calculate(input, { now: FIXED });
    expect(bundle.western).toBeDefined();
    expect(bundle.vedic).toBeDefined();
    expect(bundle.provenance.providers.map((p) => p.id)).toEqual(['astronomy-engine', 'caelus']);
  });

  it('default input behavior is unchanged: Vedic remains opt-in until P5', () => {
    const bundle = calculate(parseBirthInput(raw), { now: FIXED });
    expect(bundle.vedic).toBeUndefined();
    expect(bundle.warnings.some((w) => w.system === 'vedic')).toBe(false);
    expect(bundle.western).toBeDefined();
    expect(bundle.bazi).toBeDefined();
  });
});

describe('public v1 contracts stay three-system (P4 owns the v2 break)', () => {
  it('PublicResult.systems keeps exactly the three public systems', () => {
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
