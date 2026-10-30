// Synthetic fixtures only — fictional data; no real birth data or user text.
// Capability & failure-recovery regressions (roadmap v3.2 / IQ-4 §7
// "问题能力与失败恢复"): timing material by real capability, honest empty
// reasons, and follow-up offers that promise only what the engine can do.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBirthInput } from '@loom/contracts';
import { deliverAnswer, sealReadingDraft } from '../src/answer-delivery.ts';
import { runAnswerPlan } from '../src/interpret.ts';

const FIXED = Date.parse('2026-01-01T00:00:00Z');
const rawA = JSON.parse(readFileSync('examples/birth-input.json', 'utf8')) as Record<
  string,
  unknown
>;
const A = parseBirthInput(rawA);
const rawUnknown = { ...rawA, localTime: undefined, timeAccuracy: 'unknown' };
const unknownInput = parseBirthInput(rawUnknown);
const AT_2036 = { solarDate: '2036-05-20', timeIndex: 7 } as const;

/** Reproduction of the pre-fix behaviour, kept as the regression anchor. */
describe('pre-fix reproduction (why capability selection was needed)', () => {
  it('the old selection fed natal background into timing lenses for every topic', () => {
    // Direct evidence that natal facts are NOT target-period material: on the
    // fixed input, the character topic contains pillars/day-master facts and
    // the marriage topic contains spouse-star/palace facts, while the only
    // admitted target-period record is the Zi Wei yearly flow (needs `--at`).
    const character = runAnswerPlan(A, { now: FIXED, topic: 'character', lens: 'overview' });
    expect(character.answerPlan.selectedFacts.length).toBeGreaterThan(0);
    expect(character.answerPlan.selectedFacts.some((fact) => fact.claim.startsWith('四柱'))).toBe(
      true,
    );
    const marriage = runAnswerPlan(A, { now: FIXED, topic: 'marriage', lens: 'overview' });
    expect(marriage.answerPlan.selectedFacts.some((fact) => fact.claim.includes('配偶星'))).toBe(
      true,
    );
  });
});

describe('timing lens selects only admitted target-period material', () => {
  it('character timing returns no natal pillars/day-master as period evidence', () => {
    const { answerPlan } = runAnswerPlan(A, { now: FIXED, topic: 'character', lens: 'timing' });
    expect(answerPlan.answerability).toBe('not-supported');
    expect(answerPlan.noEvidenceReason).toBe('NO_TOPIC_FACTS');
    expect(answerPlan.selectedFacts).toHaveLength(0);
    // No invalid ask: nothing in the offers requests data that would not help.
    expect(answerPlan.followupOffers).toEqual([]);
  });

  it('marriage timing does not use spouse stars or the 7th house as timing evidence', () => {
    const { answerPlan } = runAnswerPlan(A, { now: FIXED, topic: 'marriage', lens: 'timing' });
    expect(answerPlan.answerability).toBe('not-supported');
    expect(answerPlan.noEvidenceReason).toBe('NO_TOPIC_FACTS');
    expect(answerPlan.selectedFacts).toHaveLength(0);
  });

  it('general timing at an explicit target keeps only the yearly-flow record', () => {
    const { answerPlan } = runAnswerPlan(A, {
      now: FIXED,
      topic: 'general',
      lens: 'timing',
      at: AT_2036,
    });
    expect(answerPlan.answerability).toBe('limited');
    for (const fact of answerPlan.selectedFacts) {
      expect(
        fact.evidence.some((e) => e.kind === 'ziwei-horoscope' && e.ref === 'horoscope.yearly'),
        fact.claim,
      ).toBe(true);
    }
    // The requested target period is used, never silently moved to the run year.
    const claims = answerPlan.selectedFacts.map((fact) => fact.claim).join('\n');
    expect(claims).toContain('当前流年');
    expect(claims).not.toContain('2026');
  });

  it('an explicit target does not open unadmitted timing families', () => {
    const { answerPlan } = runAnswerPlan(A, {
      now: FIXED,
      topic: 'general',
      lens: 'timing',
      at: AT_2036,
    });
    for (const fact of answerPlan.selectedFacts) {
      for (const evidence of fact.evidence) {
        expect(evidence.ref).not.toContain('fortune/liunian');
        expect(evidence.ref).not.toContain('marriage-timing');
      }
    }
  });
});

describe('honest empty reasons (no fake input requests)', () => {
  it('career timing never asks for birth time: no admitted path exists either way', () => {
    const exact = runAnswerPlan(A, { now: FIXED, topic: 'career', lens: 'timing' });
    expect(exact.answerPlan.noEvidenceReason).toBe('NO_TOPIC_FACTS');
    expect(exact.answerPlan.followupOffers).toEqual([]);
    const unknown = runAnswerPlan(unknownInput, { now: FIXED, topic: 'career', lens: 'timing' });
    expect(unknown.answerPlan.noEvidenceReason).toBe('NO_TOPIC_FACTS');
    expect(unknown.answerPlan.followupOffers).toEqual([]);
  });

  it('asks for birth time only when the timing path is really waiting on it', () => {
    const { answerPlan } = runAnswerPlan(unknownInput, {
      now: FIXED,
      topic: 'general',
      lens: 'timing',
      at: AT_2036,
    });
    expect(answerPlan.answerability).toBe('not-supported');
    expect(answerPlan.noEvidenceReason).toBe('TIME_REQUIRED');
    expect(answerPlan.followupOffers).toEqual(['如有条件，可补充出生时间后重新计算依赖时刻的部分']);
    // TIME_UNKNOWN stays disclosed as the always-material limitation.
    expect(answerPlan.requiredWarningCodes).toContain('TIME_UNKNOWN');
  });

  it('names the missing rule input when only that blocks the dynamic path', () => {
    const noGender = parseBirthInput({ ...rawA, ruleGender: undefined });
    const { answerPlan } = runAnswerPlan(noGender, {
      now: FIXED,
      topic: 'general',
      lens: 'timing',
      at: AT_2036,
    });
    expect(answerPlan.noEvidenceReason).toBe('INPUT_REQUIRED');
    expect(answerPlan.followupOffers).toEqual([]);
    // The unavailability stays honestly scoped in the audit warnings.
    expect(
      runAnswerPlan(noGender, {
        now: FIXED,
        topic: 'general',
        lens: 'timing',
        at: AT_2036,
      }).publicResult.warnings.map((warning) => warning.code),
    ).toContain('ZIWEI_INPUT_REQUIRED');
  });

  it('a limitation disclaimer alone never makes a request limited/grounded', () => {
    const { answerPlan, publicResult } = runAnswerPlan(unknownInput, {
      now: FIXED,
      topic: 'general',
      lens: 'timing',
      at: AT_2036,
    });
    expect(answerPlan.selectedFacts).toHaveLength(0);
    expect(answerPlan.answerability).toBe('not-supported');
    // The disclaimer note is not delivered as answer basis either.
    expect(publicResult.facts.some((fact) => fact.claim.includes('健康提示'))).toBe(false);
  });
});

describe('normal lenses and audit content stay intact', () => {
  it('overview keeps admitted natal material for the same topics', () => {
    const character = runAnswerPlan(A, { now: FIXED, topic: 'character' });
    expect(character.answerPlan.answerability).not.toBe('not-supported');
    expect(character.answerPlan.selectedFacts.length).toBeGreaterThan(5);
    const marriage = runAnswerPlan(A, { now: FIXED, topic: 'marriage' });
    expect(marriage.answerPlan.selectedFacts.some((fact) => fact.claim.includes('配偶星'))).toBe(
      true,
    );
    const career = runAnswerPlan(A, { now: FIXED, topic: 'career', lens: 'advice' });
    expect(career.answerPlan.selectedFacts).toHaveLength(1);
  });

  it('explain keeps its technical content order', () => {
    const { answerPlan } = runAnswerPlan(A, { now: FIXED, topic: 'character', lens: 'explain' });
    expect(answerPlan.responseRequirements.contentOrder).toEqual([
      'summary',
      'technical-evidence',
      'uncertainty',
    ]);
    expect(answerPlan.selectedFacts.length).toBeGreaterThan(0);
  });

  it('unknown-time career still reports TIME_REQUIRED via the evidence probe (#113)', () => {
    const { answerPlan } = runAnswerPlan(unknownInput, { now: FIXED, topic: 'career' });
    expect(answerPlan.answerability).toBe('not-supported');
    expect(answerPlan.noEvidenceReason).toBe('TIME_REQUIRED');
  });

  it('follow-up offers never promise out-of-capability readings', () => {
    for (const topic of [
      'character',
      'marriage',
      'wealth',
      'studies',
      'health',
      'general',
    ] as const) {
      const { answerPlan, publicResult } = runAnswerPlan(A, { now: FIXED, topic });
      const offers = answerPlan.followupOffers.join('|');
      expect(offers, topic).not.toContain('适合什么工作');
      expect(offers, topic).not.toContain('关键年份');
      expect(offers, topic).not.toContain('什么时候');
      expect(offers, topic).not.toContain('流年');
      // The scoped public result carries the same honest offers.
      expect(publicResult.followupOffers).toEqual(answerPlan.followupOffers);
    }
  });
});

describe('bound delivery keeps working on the new plans (#114)', () => {
  it('a timing plan with the yearly record seals and delivers; stale plans are rejected', () => {
    const run = runAnswerPlan(A, {
      now: FIXED,
      topic: 'general',
      lens: 'timing',
      at: AT_2036,
    });
    const fact = run.answerPlan.selectedFacts[0]!;
    interface DraftParagraph {
      text: string;
      sourceFactIds: string[];
      constraintRefs?: Array<{ kind: 'caveat' | 'warning'; index: number }>;
    }
    const paragraphs: DraftParagraph[] = [
      {
        text: '该目标日期所在流年的传统结构记录显示一种整体节奏倾向，仅作传统文化参考。',
        sourceFactIds: [fact.id],
      },
    ];
    if (run.answerPlan.requiredCaveats.length > 0) {
      paragraphs[0]!.constraintRefs = run.answerPlan.requiredCaveats.map((_, index) => ({
        kind: 'caveat' as const,
        index,
      }));
    }
    if (run.answerPlan.requiredWarningCodes.length > 0) {
      paragraphs.push({
        text: '相关时间与体系的适用范围限制已在此说明。',
        sourceFactIds: [],
        constraintRefs: run.answerPlan.requiredWarningCodes.map((_, index) => ({
          kind: 'warning' as const,
          index,
        })),
      });
    }
    const draft = {
      contractVersion: 'reading-draft/v2',
      topic: 'general',
      sections: [{ id: 'body', heading: '目标年的整体节奏', paragraphs }],
      caveatsExpressed: run.answerPlan.requiredCaveats,
      warningsDisclosed: run.answerPlan.requiredWarningCodes,
    };
    const delivery = deliverAnswer({
      currentRequest: {
        birthInput: rawA,
        topic: 'general',
        lens: 'timing',
        now: FIXED,
        at: AT_2036,
      },
      ...sealReadingDraft(run.answerBinding, draft),
      answerPlan: run.answerPlan,
      readingDraft: draft,
    });
    expect(delivery.ok, JSON.stringify(delivery.validation?.violations ?? [])).toBe(true);
    expect(delivery.deliverableBody).toContain('目标年的整体节奏');
    // An older overview plan cannot ride the current timing request.
    const stale = runAnswerPlan(A, { now: FIXED, topic: 'general' });
    const cross = deliverAnswer({
      currentRequest: {
        birthInput: rawA,
        topic: 'general',
        lens: 'timing',
        now: FIXED,
        at: AT_2036,
      },
      ...sealReadingDraft(stale.answerBinding, draft),
      answerPlan: stale.answerPlan,
      readingDraft: draft,
    });
    expect(cross.ok).toBe(false);
    expect(cross.failureReason).toBe('BINDING_MISMATCH');
  });
});
