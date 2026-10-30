// Synthetic fixture — fictional data only; not a real person.
import { describe, expect, it } from 'vitest';
import { parseBirthInput } from '@loom/contracts';
import type { AnswerLens, InterpretationTopic, PublicFact, PublicResult } from '@loom/contracts';
import { buildAnswerPlan, buildInterpretationFacts } from '@loom/interpret';
import { calculate, runAnswerPlan, runInterpret } from '@loom/orchestrator';
import { industryFinding, interpretBazi } from '../../bazi-rules/src/index.ts';

const FIXED = Date.parse('2026-01-01T00:00:00Z');
const input = parseBirthInput({
  calendar: 'gregorian',
  localDate: '1990-03-10',
  localTime: '08:15:00',
  timeAccuracy: 'exact',
  timezone: 'Asia/Shanghai',
  location: { latitude: 30.5, longitude: 114.3, source: 'user' },
  ruleGender: 'male',
  settings: { systems: ['western', 'bazi', 'ziwei', 'vedic'] },
});

const WITHHELD_PREFIXES = [
  'bazi-rule/pattern',
  'bazi-rule/useful-god',
  'bazi-rule/industry',
  'bazi-rule/relations',
  'bazi-rule/shensha',
  'bazi-rule/marriage-timing',
  'bazi-rule/fortune',
] as const;

function hasWithheldMechanism(fact: PublicFact | { evidence: Array<{ ref: string }> }): boolean {
  return fact.evidence.some((evidence) =>
    WITHHELD_PREFIXES.some(
      (prefix) => evidence.ref === prefix || evidence.ref.startsWith(`${prefix}/`),
    ),
  );
}

function syntheticFact(
  id: string,
  evidence: PublicFact['evidence'],
  topic: InterpretationTopic = 'character',
): PublicFact {
  return { id, topic, claim: `合成准入探针 ${id}`, evidence };
}

describe('default-answer material admission', () => {
  it('general projects admitted facts only, not the technical interpretation dump', () => {
    const { publicResult, answerPlan } = runAnswerPlan(input, {
      now: FIXED,
      topic: 'general',
    });
    const technical = runInterpret(input, { now: FIXED }).interpretation;

    expect(publicResult.facts.length).toBeGreaterThan(0);
    expect(publicResult.facts.length).toBeLessThan(technical.facts.length);
    for (const fact of publicResult.facts) expect(hasWithheldMechanism(fact)).toBe(false);
    for (const fact of answerPlan.selectedFacts) expect(hasWithheldMechanism(fact)).toBe(false);
    expect(answerPlan.selectedFacts.map((fact) => fact.id)).toEqual(
      publicResult.facts.map((fact) => fact.id),
    );

    // An explicit target controls technical chronology, never source admission.
    const publicRefs = publicResult.facts.flatMap((fact) =>
      fact.evidence.map((evidence) => evidence.ref),
    );
    expect(publicRefs.some((ref) => ref.startsWith('bazi-rule/fortune/'))).toBe(false);

    // Technical audit still retains the withheld rule families.
    const technicalRefs = technical.facts.flatMap((fact) =>
      fact.evidence.map((evidence) => evidence.ref),
    );
    for (const ref of [
      'bazi-rule/pattern',
      'bazi-rule/useful-god',
      'bazi-rule/industry/wu-xing',
      'bazi-rule/relations/liu-he',
    ]) {
      expect(
        technicalRefs.some((candidate) => candidate === ref || candidate.startsWith(`${ref}/`)),
      ).toBe(true);
    }
  });

  it('does not use an explicit target as permission for withheld timing material', () => {
    const withoutAt = runAnswerPlan(input, { now: FIXED, topic: 'general' }).publicResult;
    expect(
      withoutAt.facts.some((fact) =>
        fact.evidence.some((evidence) => evidence.ref.startsWith('bazi-rule/fortune/')),
      ),
    ).toBe(false);

    const withAt = runAnswerPlan(input, {
      now: FIXED,
      topic: 'general',
      at: { solarDate: '2036-05-20', timeIndex: 7 },
    }).publicResult;
    expect(
      withAt.facts.some((fact) =>
        fact.evidence.some((evidence) => evidence.ref.startsWith('bazi-rule/fortune/')),
      ),
    ).toBe(false);
    const technical = runInterpret(input, {
      now: FIXED,
      at: { solarDate: '2036-05-20', timeIndex: 7 },
    }).interpretation;
    const years = technical.facts
      .map((fact) => /^(\d{4})\(/.exec(fact.claim)?.[1])
      .filter((year): year is string => year !== undefined);
    expect(years[0]).toBe('2036');
    expect(years).not.toContain('2026');
  });

  it('keeps withheld material out for every topic and lens', () => {
    const { publicResult } = runAnswerPlan(input, { now: FIXED, topic: 'general' });
    const topics: InterpretationTopic[] = [
      'character',
      'career',
      'wealth',
      'marriage',
      'studies',
      'health',
      'general',
    ];
    const lenses: AnswerLens[] = ['overview', 'strengths', 'risks', 'timing', 'advice', 'explain'];
    for (const topic of topics) {
      for (const lens of lenses) {
        const plan = buildAnswerPlan(publicResult, { topic, lens });
        for (const fact of plan.selectedFacts) {
          expect(hasWithheldMechanism(fact), `${topic}/${lens}: ${fact.claim}`).toBe(false);
        }
        expect(plan.allowedFactIds).toEqual(plan.selectedFacts.map((fact) => fact.id));
        expect(plan.responseRequirements.citeSelectedFactIds).toEqual(plan.allowedFactIds);
      }
    }
  });

  it('retains admitted positive material and its material caveats', () => {
    const { answerPlan } = runAnswerPlan(input, { now: FIXED, topic: 'general' });
    const claims = answerPlan.selectedFacts.map((fact) => fact.claim).join('\n');
    expect(claims).toContain('四柱');
    expect(claims).toContain('西方占星太阳');
    expect(claims).toContain('紫微命宫');
    expect(
      answerPlan.selectedFacts.some((fact) =>
        fact.evidence.some((evidence) => evidence.kind === 'western-rule'),
      ),
    ).toBe(true);
    expect(
      answerPlan.selectedFacts.some((fact) =>
        fact.evidence.some((evidence) => evidence.kind === 'ziwei-rule'),
      ),
    ).toBe(true);

    const caveats = answerPlan.requiredCaveats.join('\n');
    expect(caveats).toContain('缺某五行不等于凶');
    expect(caveats).toContain('专业医师');
    expect(caveats).toContain('配偶星之有无');
    expect(answerPlan.requiredCaveats).toEqual([
      ...new Set(
        answerPlan.selectedFacts
          .map((fact) => fact.caveat)
          .filter((caveat): caveat is string => caveat !== undefined),
      ),
    ]);
  });

  it('does not let a known topic launder a withheld or unknown mechanism', () => {
    const { publicResult } = runAnswerPlan(input, { now: FIXED, topic: 'general' });
    const probes: PublicFact[] = [
      syntheticFact('fact-901', [
        { kind: 'bazi-rule', ref: 'bazi-rule/pattern' },
        { kind: 'bazi', ref: 'bazi.dayMaster' },
      ]),
      syntheticFact('fact-902', [{ kind: 'bazi-rule', ref: 'bazi-rule/unknown-family' }]),
      syntheticFact('fact-903', [{ kind: 'western-rule', ref: 'western-rule/unknown' }]),
      syntheticFact('fact-904', [{ kind: 'bazi', ref: 'bazi.unknown.path' }]),
      syntheticFact('fact-905', [
        { kind: 'bazi-rule', ref: 'bazi-rule/strength' },
        { kind: 'bazi-rule', ref: 'bazi-rule/pattern' },
      ]),
      syntheticFact('fact-907', [
        { kind: 'bazi-rule', ref: 'bazi-rule/ten-gods/xiang-yi' },
        { kind: 'bazi', ref: 'bazi.pillars.year.tenGod' },
      ]),
      syntheticFact('fact-908', [
        { kind: 'western', ref: 'western.planets[NotARealPlanet].unimplemented' },
      ]),
      syntheticFact('fact-909', [
        { kind: 'bazi-rule', ref: 'bazi-rule/ten-gods/xiang-yi/unadmitted-child' },
      ]),
      syntheticFact('fact-910', [
        { kind: 'bazi-rule', ref: 'western-rule/planet-sign/sun-pisces' },
      ]),
      syntheticFact('fact-911', []),
      syntheticFact('fact-912', [
        { kind: 'bazi-rule', ref: 'bazi-rule/strength/unadmitted-child' },
      ]),
      syntheticFact('fact-913', [{ kind: 'vedic-rule', ref: 'vedic-rule/bhava/whole-sign-13' }]),
      syntheticFact('fact-914', [
        { kind: 'western-rule', ref: 'western-rule/planet-sign/sun-unknown' },
      ]),
      syntheticFact('fact-915', [{ kind: 'time', ref: 'time.invented' }]),
    ];
    const admittedProbe = syntheticFact('fact-906', [
      { kind: 'western-rule', ref: 'western-rule/planet-sign/sun-pisces' },
    ]);
    const plan = buildAnswerPlan(
      {
        ...publicResult,
        facts: [...publicResult.facts, ...probes, admittedProbe],
      } satisfies PublicResult,
      { topic: 'character' },
    );
    const selectedIds = plan.selectedFacts.map((fact) => fact.id);
    for (const probe of probes) expect(selectedIds).not.toContain(probe.id);
    expect(selectedIds).toContain(admittedProbe.id);
  });

  it('keeps career and its explain lens inside the admitted boundary', () => {
    const career = runAnswerPlan(input, { now: FIXED, topic: 'career' }).answerPlan;
    expect(career.selectedFacts.length).toBeGreaterThan(0);
    expect(career.selectedFacts.every((fact) => fact.topic === 'career')).toBe(true);
    expect(
      career.selectedFacts.some((fact) =>
        fact.evidence.some((evidence) => evidence.ref === 'bazi-rule/ten-gods/xiang-yi'),
      ),
    ).toBe(true);
    for (const fact of career.selectedFacts) expect(hasWithheldMechanism(fact)).toBe(false);

    const explain = runAnswerPlan(input, {
      now: FIXED,
      topic: 'career',
      lens: 'explain',
    }).answerPlan;
    expect(explain.selectedFacts).toEqual(career.selectedFacts);
    for (const fact of explain.selectedFacts) {
      expect(fact.topic).toBe('career');
      expect(hasWithheldMechanism(fact)).toBe(false);
    }
    const general = runAnswerPlan(input, { now: FIXED, topic: 'general' }).answerPlan;
    expect(general.selectedFacts.filter((fact) => fact.topic === 'career')).toEqual(
      career.selectedFacts,
    );
  });

  it('consumes an unmatched industry finding without changing the frozen rule', () => {
    // Synthetic mechanism fixture, not an astronomical/chart correctness claim.
    const bundle = calculate(input, { now: FIXED });
    const bazi = bundle.bazi!;
    bazi.dayMaster = { stem: '甲', element: '木', yinYang: '阳' };
    for (const pillar of Object.values(bazi.pillars)) {
      if (!pillar) continue;
      pillar.tenGod = null;
      pillar.hiddenStems = [{ stem: '丁', element: '火', tenGod: '伤官', primary: true }];
    }
    bazi.pillars.month.hiddenStems = [{ stem: '壬', element: '水', tenGod: '偏印', primary: true }];
    const finding = industryFinding(bazi);
    expect(finding.matched).toBe(false);
    // The existing versioned producer remains byte-for-byte unchanged; its
    // unmatched proposal is deliberately not a delivered affirmative finding.
    expect(finding.claim).toContain('适合行业方向(按喜用五行)');
    const useful = interpretBazi(bazi).findings.find((f) => f.topic === 'useful-god')!;
    expect(useful.matched).toBe(false);
    expect(useful.claim).toContain('不妄断');
    const technical = buildInterpretationFacts(bundle);
    const industry = technical.facts.find((fact) =>
      fact.evidence.some((e) => e.ref === 'bazi-rule/industry/wu-xing'),
    )!;
    expect(industry.claim).toBe('行业规则未命中，未提供行业结论。');
    expect(industry.reason).toContain('matched=false');
    expect(JSON.stringify(industry)).not.toMatch(/金融|地产|能源|文教|贸易/);
  });
});
