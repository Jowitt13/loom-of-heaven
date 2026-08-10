// Synthetic fixture - fictional data only; not a real person.
import { describe, expect, it } from 'vitest';
import { interpretZiwei as interpretZiweiRules } from '@loom/ziwei-rules';
import { canonicalJson, parseBirthInput } from '@loom/contracts';
import { calculate } from '@loom/orchestrator';

const FIXED = Date.parse('2026-01-01T00:00:00Z');

const syntheticInput = parseBirthInput({
  calendar: 'gregorian',
  localDate: '1991-02-03',
  localTime: '04:05:06',
  timeAccuracy: 'exact',
  timezone: 'Asia/Shanghai',
  location: {
    latitude: 31.2304,
    longitude: 121.4737,
    source: 'user',
    displayName: 'Synthetic ziwei-rules test location sentinel',
  },
  ruleGender: 'female',
  settings: { systems: ['ziwei'] },
});

describe('ziwei-rules', () => {
  it('produces non-empty findings with ruleId and source for a full chart', () => {
    const bundle = calculate(syntheticInput, { now: FIXED });
    expect(bundle.ziwei).toBeDefined();
    const result = interpretZiweiRules(bundle.ziwei!);
    expect(result.rulesetId).toMatch(/^ziwei-rules@/);
    expect(result.findings.length).toBeGreaterThan(3);
    for (const f of result.findings) {
      expect(f.ruleId).toBeTruthy();
      expect(f.source.text).toBeTruthy();
      expect(f.source.chapter).toBeTruthy();
      expect(f.claim).toBeTruthy();
      expect(f.matched).toBe(true);
    }
  });

  it('includes main-star findings for the soul palace', () => {
    const bundle = calculate(syntheticInput, { now: FIXED });
    const result = interpretZiweiRules(bundle.ziwei!);
    const mainStar = result.findings.find((f) => f.topic === 'main-star');
    expect(mainStar).toBeDefined();
    expect(mainStar!.ruleId).toMatch(/^main-star\//);
  });

  it('includes palace-star findings for soul, career or wealth palaces', () => {
    const bundle = calculate(syntheticInput, { now: FIXED });
    const result = interpretZiweiRules(bundle.ziwei!);
    const palaceStarFindings = result.findings.filter((f) => f.topic === 'palace-star');
    // At minimum, the soul palace combo should always exist
    expect(palaceStarFindings.length).toBeGreaterThanOrEqual(1);
    const soulFinding = palaceStarFindings.find((f) => f.ruleId.startsWith('palace-star/soul'));
    expect(soulFinding).toBeDefined();
  });

  it('includes sihua findings when four-transformations are present', () => {
    const bundle = calculate(syntheticInput, { now: FIXED });
    const result = interpretZiweiRules(bundle.ziwei!);
    const sihua = result.findings.filter((f) => f.topic === 'sihua');
    // Every chart has 4 natal 四化
    expect(sihua.length).toBeGreaterThanOrEqual(4);
  });

  it('is deterministic for the same input', () => {
    const bundle = calculate(syntheticInput, { now: FIXED });
    const r1 = interpretZiweiRules(bundle.ziwei!);
    const r2 = interpretZiweiRules(bundle.ziwei!);
    expect(canonicalJson(r1)).toBe(canonicalJson(r2));
  });
});
