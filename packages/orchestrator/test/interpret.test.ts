import { describe, expect, it } from 'vitest';
import { canonicalJson, parseBirthInput } from '@ming/contracts';
import type { BirthInputRaw } from '@ming/contracts';
import { runInterpret } from '@ming/orchestrator';

const FIXED = Date.parse('2026-01-01T00:00:00Z');

const base: BirthInputRaw = {
  calendar: 'gregorian',
  localDate: '1990-03-10',
  localTime: '08:15:00',
  timeAccuracy: 'exact',
  timezone: 'Asia/Shanghai',
  location: { latitude: 30.5, longitude: 114.3, source: 'user', displayName: '东莞市塘厦镇' },
  ruleGender: 'male',
  settings: { systems: ['western', 'bazi', 'ziwei'] },
};

function interpret(overrides: Partial<BirthInputRaw> = {}) {
  return runInterpret(parseBirthInput({ ...base, ...overrides }), { now: FIXED }).interpretation;
}

describe('cross-system interpretation facts (handoff §8 layer 2)', () => {
  it('covers all reading topics for a full three-system chart', () => {
    const interp = interpret();
    const topics = new Set(interp.facts.map((f) => f.topic));
    for (const t of ['character', 'career', 'wealth', 'marriage', 'studies', 'health']) {
      expect(topics.has(t as never), t).toBe(true);
    }
  });

  it('every fact is grounded with at least one evidence ref + note', () => {
    const interp = interpret();
    expect(interp.facts.length).toBeGreaterThan(0);
    for (const f of interp.facts) {
      expect(f.evidence.length).toBeGreaterThanOrEqual(1);
      for (const e of f.evidence) {
        expect(e.ref.length).toBeGreaterThan(0);
        expect(e.note.length).toBeGreaterThan(0);
      }
    }
  });

  it('carries global disclaimers the host must honor', () => {
    const interp = interpret();
    expect(interp.disclaimers.length).toBeGreaterThanOrEqual(3);
    expect(interp.disclaimers.join(' ')).toContain('非科学预测');
  });

  it('offers standardized follow-up readings (事业/感情/财运/学业) at the end', () => {
    const interp = interpret();
    expect(interp.followupOffers.length).toBeGreaterThanOrEqual(4);
    const joined = interp.followupOffers.join(' ');
    for (const t of ['事业', '感情', '财运', '学业']) expect(joined).toContain(t);
  });

  it('emits sourced 吉凶 facts (刑冲合害/神煞/大运) with polarity + reason', () => {
    const interp = interpret();
    const fortune = interp.facts.filter((f) => f.polarity !== undefined);
    expect(fortune.length).toBeGreaterThan(0);
    for (const f of fortune) {
      expect(['吉', '凶', '中性']).toContain(f.polarity);
      expect((f.reason ?? '').length).toBeGreaterThan(0);
    }
  });

  it('the strength + useful-god facts carry a reason chain (先原因后结论)', () => {
    const interp = interpret();
    const dayMaster = interp.facts.find((f) => f.claim.includes('八字日主为'));
    expect((dayMaster?.reason ?? '').length).toBeGreaterThan(0);
    const useful = interp.facts.find((f) => f.claim.includes('喜用') || f.claim.includes('扶抑'));
    expect((useful?.reason ?? '').length).toBeGreaterThan(0);
  });

  it('four-pillar fact shows the day column as 日主 (never blank)', () => {
    const interp = interpret();
    const pillars = interp.facts.find((f) => f.claim.startsWith('四柱'));
    expect(pillars).toBeDefined();
    expect(pillars!.claim).toContain('日主');
  });

  it('is de-identified: no name / life-event / free-text location leaks into the facts', () => {
    const interp = interpret();
    expect(interp.subject).not.toHaveProperty('displayName');
    expect(interp.subject).not.toHaveProperty('name');
    const json = canonicalJson(interp);
    expect(json).not.toContain('东莞市塘厦镇');
  });

  it('marriage uses the gender rule (male → 正财 spouse star) and caveats it', () => {
    const interp = interpret();
    const m = interp.facts.find((f) => f.topic === 'marriage' && f.claim.includes('配偶星'));
    expect(m).toBeDefined();
    expect(m!.claim).toContain('正财');
    expect(m!.caveat).toBeDefined();
  });

  it('unspecified gender does not fabricate a spouse star (honest deferral)', () => {
    const interp = interpret({ ruleGender: 'unspecified' });
    const m = interp.facts.find((f) => f.topic === 'marriage' && f.claim.includes('配偶星'));
    expect(m!.claim).toContain('未提供规则性别');
  });

  it('health facts are caveated as not medical advice', () => {
    const interp = interpret();
    const health = interp.facts.filter((f) => f.topic === 'health');
    expect(health.some((f) => `${f.claim}${f.caveat ?? ''}`.includes('医疗'))).toBe(true);
  });

  it('surfaces Zi Wei palace facts via iztro bare names (官禄/夫妻, no 宫 suffix)', () => {
    // Regression: iztro labels palaces "官禄"/"夫妻" (bare) yet "命宫" (with 宫); the palace
    // lookup must tolerate the missing 宫 or these facts silently vanish.
    const interp = interpret();
    const claims = interp.facts.map((f) => f.claim).join(' ');
    expect(claims).toContain('紫微官禄宫');
    expect(claims).toContain('紫微夫妻宫主星');
  });

  it('emits the Western 7th-house ruler (七宫主星) + relationship aspects, folded into 配偶画像', () => {
    const interp = interpret();
    const claims = interp.facts.map((f) => f.claim);
    // 下降星座之古典主星及其状态.
    expect(claims.some((c) => c.includes('第七宫主星'))).toBe(true);
    // 关系相位（月/金/火/土与七宫主）事实出现.
    expect(claims.some((c) => c.includes('西方关系相位'))).toBe(true);
    // 配偶画像 并入七宫主.
    const portrait = claims.find((c) => c.includes('配偶画像'));
    expect(portrait).toBeDefined();
    expect(portrait!).toContain('七宫主');
  });

  it('is deterministic (byte-identical across runs)', () => {
    expect(canonicalJson(interpret())).toBe(canonicalJson(interpret()));
  });

  it('facts from all three rule systems carry -rule kind evidence (back-link guarantee)', () => {
    const interp = interpret();
    const ruleKinds = new Set(interp.facts.flatMap((f) => f.evidence.map((e) => e.kind)));
    // All three rule systems must appear in evidence
    expect(ruleKinds.has('bazi-rule')).toBe(true);
    expect(ruleKinds.has('western-rule')).toBe(true);
    expect(ruleKinds.has('ziwei-rule')).toBe(true);
    // Every fact with a -rule evidence must have a non-empty ref
    for (const f of interp.facts) {
      for (const e of f.evidence) {
        if (e.kind.endsWith('-rule')) {
          expect(e.ref.length, `empty ref in ${e.kind}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('includes the Zi Wei 流年 when a target date is given', () => {
    const interp = runInterpret(parseBirthInput(base), {
      now: FIXED,
      at: { solarDate: '2026-05-20', timeIndex: 7 },
    }).interpretation;
    expect(interp.facts.some((f) => f.topic === 'general' && f.claim.includes('丙午'))).toBe(true);
  });

  it('unknown time still yields bazi facts but no western ascendant claim', () => {
    const interp = interpret({ timeAccuracy: 'unknown', localTime: undefined });
    // BaZi facts still present (day pillar), but no MC/ascendant fact is fabricated.
    expect(interp.facts.some((f) => f.claim.includes('中天'))).toBe(false);
    expect(interp.facts.some((f) => f.claim.includes('日主'))).toBe(true);
  });
});
