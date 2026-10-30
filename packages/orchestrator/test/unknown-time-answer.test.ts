// Synthetic fixtures — fictional data only; not a real person.
import { describe, expect, it } from 'vitest';
import { canonicalJson, parseBirthInput } from '@loom/contracts';
import type { BirthInputRaw } from '@loom/contracts';
import * as interpretationFacade from '@loom/interpret';
import { buildInterpretationFacts } from '@loom/interpret';
import { calculate, runAnswerPlan, runInterpret } from '../src/index.ts';

const NOW = Date.parse('2026-01-01T00:00:00Z');
const SHANGHAI = {
  latitude: 31.23,
  longitude: 121.47,
  source: 'user' as const,
  displayName: 'Synthetic unknown-time location',
};

const base: BirthInputRaw = {
  calendar: 'gregorian',
  localDate: '1991-01-02',
  timeAccuracy: 'unknown',
  timezone: 'Asia/Shanghai',
  location: SHANGHAI,
  ruleGender: 'male',
  settings: { systems: ['western', 'bazi', 'ziwei', 'vedic'] },
};

function input(overrides: Partial<BirthInputRaw> = {}) {
  return parseBirthInput({ ...base, ...overrides });
}

function interpret(overrides: Partial<BirthInputRaw> = {}) {
  return runInterpret(input(overrides), { now: NOW });
}

function bundle(overrides: Partial<BirthInputRaw> = {}) {
  return calculate(input(overrides), { now: NOW });
}

/** Claims that present noon-placeholder chart values as confirmed conclusions. */
const PLACEHOLDER_CLAIM =
  /命局无木|五行缺失|五行分布|日主|四柱|扶抑|喜用|格局|大运|正缘|配偶星|适合行业|位于|在(?:Capricorn|Leo|Sagittarius|Taurus|Aries|Scorpio)/;

interface FactLike {
  claim: string;
  reason?: string;
  evidence: ReadonlyArray<{ kind: string; ref: string }>;
}

function assertNoPlaceholderDerivedFacts(facts: readonly FactLike[]): void {
  for (const fact of facts) {
    expect(fact.claim, fact.claim).not.toMatch(PLACEHOLDER_CLAIM);
    expect(fact.reason ?? '', `reason of ${fact.claim}`).not.toMatch(PLACEHOLDER_CLAIM);
    for (const evidence of fact.evidence) {
      const stable =
        evidence.kind === 'time' ||
        evidence.ref.includes('unknownTimeStable') ||
        evidence.ref.endsWith('day-stable');
      expect(stable, `${evidence.kind}:${evidence.ref}`).toBe(true);
    }
  }
}

describe('unknown-time default answer material', () => {
  it('preserves both existing stable producer contracts and their caveats', () => {
    const known = bundle({ timeAccuracy: 'exact', localTime: '06:00:00' }).vedic!;
    const unknown = bundle();
    const moon = known.derived!.grahas.find((placement) => placement.graha === 'Moon')!;
    const panchanga = known.derived!.panchanga;
    // Synthetic producer-contract fixture only: this does not claim these
    // classifications really stay constant on the fixture's civil day.
    unknown.vedic!.unknownTimeStable = {
      moonNakshatra: moon.nakshatra,
      panchanga: {
        tithi: panchanga.tithi,
        yoga: panchanga.yoga,
        karana: panchanga.karana,
      },
    };
    const facts = buildInterpretationFacts(unknown).facts;
    for (const ruleRef of [
      'vedic-rule/nakshatra/moon-day-stable',
      'vedic-rule/panchanga/day-stable',
    ]) {
      const stable = facts.find((fact) => fact.evidence.some((entry) => entry.ref === ruleRef));
      expect(stable, ruleRef).toBeDefined();
      expect(stable!.caveat).toContain('Birth time is unknown');
      expect(stable!.evidence.some((entry) => entry.kind === 'vedic')).toBe(true);
    }
  });

  it('does not let a legacy extra option disable the public reliability boundary', () => {
    const legacyOptions = {
      now: NOW,
      targetYear: 2036,
      withholdUnstableUnknownTimeFacts: false,
      topic: 'general' as const,
    };
    assertNoPlaceholderDerivedFacts(runInterpret(input(), legacyOptions).interpretation.facts);
    assertNoPlaceholderDerivedFacts(runAnswerPlan(input(), legacyOptions).publicResult.facts);
    assertNoPlaceholderDerivedFacts(buildInterpretationFacts(bundle(), legacyOptions).facts);
    expect(interpretationFacade).not.toHaveProperty('buildBaziCareerDegradationFacts');
  });

  it('withholds the five-element absence and its positive inferences', { timeout: 30_000 }, () => {
    const { interpretation, warnings } = interpret();
    assertNoPlaceholderDerivedFacts(interpretation.facts);
    expect(warnings.map((w) => w.code)).toContain('TIME_UNKNOWN');
    // The same date with a legal completion is five-element complete.
    const completed = interpret({ timeAccuracy: 'exact', localTime: '06:00:00' });
    const counts = completed.interpretation.facts.find((f) => f.claim.includes('五行分布'));
    expect(counts!.claim).toContain('木×1');
    // calculate still emits the technical placeholder chart unchanged.
    expect(bundle().bazi!.pillars.day.stem + bundle().bazi!.pillars.day.branch).toBe('壬申');
  });

  it(
    'never presents the placeholder day master as a fact when 晚子 could differ',
    { timeout: 30_000 },
    () => {
      // Legal completion at 23:30 advances the day pillar (壬申 -> 癸酉).
      const lateZi = bundle({ timeAccuracy: 'exact', localTime: '23:30:00' }).bazi!;
      expect(lateZi.pillars.day.stem + lateZi.pillars.day.branch).toBe('癸酉');
      const unknown = interpret();
      expect(unknown.interpretation.facts.some((f) => f.claim.includes('日主'))).toBe(false);
      expect(unknown.interpretation.facts.some((f) => f.claim.includes('壬申'))).toBe(false);
      const completed = interpret({ timeAccuracy: 'exact', localTime: '23:30:00' });
      expect(completed.interpretation.facts.some((f) => f.claim.includes('日主为癸水'))).toBe(true);
    },
  );

  it('does not confirm the noon year/month on a solar-term date', { timeout: 30_000 }, () => {
    // 2024-02-04: 立春 16:27 HKT sits after the internal noon anchor.
    const termDay = bundle({ localDate: '2024-02-04' }).bazi!;
    expect(termDay.pillars.year.stem + termDay.pillars.year.branch).toBe('癸卯');
    const afterTerm = bundle({
      localDate: '2024-02-04',
      timeAccuracy: 'exact',
      localTime: '17:00:00',
    }).bazi!;
    expect(afterTerm.pillars.year.stem + afterTerm.pillars.year.branch).toBe('甲辰');
    const unknown = interpret({ localDate: '2024-02-04' });
    expect(unknown.interpretation.facts.some((f) => /四柱|年柱|月柱/.test(f.claim))).toBe(false);
    expect(unknown.interpretation.facts.some((f) => /甲辰|丙寅|癸卯|乙丑/.test(f.claim))).toBe(
      false,
    );
  });

  it('does not leak through other topics or lenses', { timeout: 30_000 }, () => {
    for (const topic of ['general', 'character', 'career', 'marriage'] as const) {
      for (const lens of [
        'overview',
        'strengths',
        'risks',
        'timing',
        'advice',
        'explain',
      ] as const) {
        const { publicResult, answerPlan } = runAnswerPlan(input(), {
          now: NOW,
          topic,
          lens,
        });
        assertNoPlaceholderDerivedFacts(publicResult.facts);
        expect(publicResult.facts).toEqual(answerPlan.selectedFacts);
        expect(publicResult.warnings.map((w) => w.code)).toContain('TIME_UNKNOWN');
        expect(publicResult.inputReliability.birthTimeKnown).toBe(false);
      }
    }
    // A topic with no surviving fact is explicitly not answerable.
    const career = runAnswerPlan(input(), { now: NOW, topic: 'career' });
    expect(career.answerPlan.answerability).toBe('not-supported');
    expect(career.answerPlan.noEvidenceReason).toBe('TIME_REQUIRED');
  });

  it(
    'keeps limitations, disclaimers and the technical placeholder in place',
    { timeout: 30_000 },
    () => {
      const { interpretation } = interpret();
      expect(interpretation.disclaimers.length).toBeGreaterThanOrEqual(3);
      expect(interpretation.facts.length).toBeGreaterThan(0);
      // The only surviving chart-free fact is the limitation note itself.
      expect(interpretation.facts.some((f) => f.claim.includes('健康提示'))).toBe(true);
      expect(bundle().bazi!.pillars.hour).toBeNull();
      expect(bundle().bazi!.luckCycle).toBeNull();
    },
  );

  it('keeps accurate and approximate readings untouched', { timeout: 30_000 }, () => {
    const exact = interpret({ timeAccuracy: 'exact', localTime: '04:00:00' }).interpretation;
    expect(exact.facts.some((f) => f.claim.includes('日主'))).toBe(true);
    expect(exact.facts.some((f) => f.claim.includes('五行分布'))).toBe(true);
    const approximate = interpret({
      timeAccuracy: 'approximate',
      localTime: '12:00:00',
    }).interpretation;
    expect(approximate.facts.some((f) => f.claim.includes('日主'))).toBe(true);
    expect(approximate.facts.some((f) => f.claim.includes('五行分布'))).toBe(true);
  });

  it(
    'is deterministic and isolated from other subjects computed in between',
    { timeout: 30_000 },
    () => {
      const original = canonicalJson(interpret().interpretation);
      interpret({ timeAccuracy: 'exact', localTime: '04:00:00' });
      interpret({ localDate: '2024-02-04' });
      expect(canonicalJson(interpret().interpretation)).toBe(original);
      const answerPlan = runAnswerPlan(input(), { now: NOW, topic: 'general' });
      const again = runAnswerPlan(input(), { now: NOW, topic: 'general' });
      expect(canonicalJson(answerPlan.publicResult)).toBe(canonicalJson(again.publicResult));
    },
  );
});
