// Synthetic fixtures only - fictional data; not a real person. fixtureKind: synthetic-technical.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NarrativeTrace,
  type ApprovedAnswerClaim,
  type NarrativeTrace as NarrativeTraceValue,
} from '../../contracts/src/answer-claim.ts';
import { ReadingDraft } from '../../contracts/src/validate-answer.ts';
import { parseBirthInput, type BirthInput } from '@loom/contracts';
import { describe, expect, it } from 'vitest';
import { ClarificationPlanningInput } from '../../contracts/src/clarification-plan.ts';
import {
  approveAnswerClaimCandidates,
  projectAnswerClaimCandidates,
} from '../../interpret/src/answer-claim-chain.ts';
import { ResponseViewPlanningError } from '../../interpret/src/response-view.ts';
import { verifyBaziCareerAnswer } from '../src/bazi-career-answer.ts';
import { runAnswerPlan } from '../src/interpret.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (relativePath: string): string => readFileSync(join(root, relativePath), 'utf8');

const FIXED = Date.parse('2026-01-01T00:00:00Z');

const syntheticInput = parseBirthInput({
  calendar: 'gregorian',
  localDate: '1991-02-03',
  localTime: '04:05:06',
  timeAccuracy: 'exact',
  timezone: 'Pacific/Port_Moresby',
  location: {
    latitude: 12.345678,
    longitude: 98.765432,
    source: 'user',
    displayName: 'Synthetic bazi answer location sentinel',
  },
  ruleGender: 'female',
  settings: { systems: ['bazi'] },
});

const unknownTimeInput: BirthInput = parseBirthInput({
  ...syntheticInput,
  localTime: undefined,
  timeAccuracy: 'unknown',
});

function planningInput(
  overrides: Partial<{
    birthTimeReliability: 'confirmed' | 'unavailable' | 'unresolved';
    requestedDepth: 'brief' | 'standard' | 'detailed' | null;
    rulesetVariantSensitiveClaims: boolean;
    rulesetVariant: 'confirmed' | 'unavailable' | 'unresolved';
  }> = {},
) {
  return ClarificationPlanningInput.parse({
    topic: 'career',
    requestedDepth: 'standard',
    systemScope: 'bazi',
    timeSensitiveClaims: true,
    birthTimeReliability: 'confirmed',
    timingRequest: false,
    targetPeriod: 'not-required',
    rulesetVariantSensitiveClaims: false,
    rulesetVariant: 'not-required',
    ...overrides,
  });
}

function journeyInput(birthInput: BirthInput, overrides: Parameters<typeof planningInput>[0] = {}) {
  return { birthInput, planningInput: planningInput(overrides) };
}

const OFFICER_PARAGRAPH =
  '这个盘的事业相关十神是七杀，传统上它常联到权威、压力、竞争一类主题，只作文化背景。' +
  '官杀说的是事业倾向的结构，不是职业预言。可以把手头的事按「规则清晰」和「需要自己定规则」' +
  '分成两列，各写三件具体的事，看看哪一列做完更有成就感，再决定下一段时间的投入。';

const WARNING_PARAGRAPH =
  '需要说明：当前时间按真太阳时近似处理，涉及时辰的结论可能有小幅变化；' +
  '如能提供更精确的出生时间，时柱相关的部分可以重新计算后再看。';

const CAVEAT_FACT_8 = '官杀仅示事业/责任倾向的结构，非职业预言。';

function journeyClaims(): ApprovedAnswerClaim[] {
  const { publicResult, answerPlan } = runAnswerPlan(syntheticInput, {
    now: FIXED,
    topic: 'career',
  });
  const context = { publicResult, answerPlan };
  const approval = approveAnswerClaimCandidates(
    context,
    projectAnswerClaimCandidates(context).candidates,
  );
  return approval.approvedClaims.filter((claim) => claim.system === 'bazi');
}

const TRACE_INVALIDATION_CAUSES = [
  'input-chart',
  'settings',
  'engine-provider',
  'ruleset',
  'source-profile',
  'topic-lens',
  'language-narrator',
] as const;

function traceFor(
  claim: ApprovedAnswerClaim,
  paragraphNumber: number,
  visibleText: string,
): NarrativeTraceValue {
  return NarrativeTrace.parse({
    contractVersion: 'narrative-trace/v1',
    traceId: `narrative-trace:paragraph-${paragraphNumber}`,
    paragraphId: `paragraph-${paragraphNumber}`,
    topic: 'career',
    approvedClaimIds: [claim.claimId],
    factRefs: claim.factRefs,
    mechanismRefs: claim.mechanismRefs,
    constraintRefs: claim.constraintRefs,
    invalidationCauses: TRACE_INVALIDATION_CAUSES,
    visibleText,
    transient: true,
    regenerable: true,
  });
}

function answerDraft(): ReturnType<typeof ReadingDraft.parse> {
  return ReadingDraft.parse({
    contractVersion: 'reading-draft/v2',
    topic: 'career',
    sections: [
      {
        id: 'career',
        heading: '',
        paragraphs: [
          {
            text: OFFICER_PARAGRAPH,
            sourceFactIds: ['fact-8'],
            constraintRefs: [{ kind: 'caveat', index: 0 }],
          },
          {
            text: WARNING_PARAGRAPH,
            sourceFactIds: [],
            // The plan records SOLAR_TIME_APPROXIMATE once per qualifying
            // system, so the disclosure references every recorded entry.
            constraintRefs: [
              { kind: 'warning', index: 0 },
              { kind: 'warning', index: 1 },
            ],
          },
        ],
      },
    ],
    caveatsExpressed: [CAVEAT_FACT_8],
    warningsDisclosed: ['SOLAR_TIME_APPROXIMATE'],
  });
}

function readyExamples(): {
  answer: ReturnType<typeof ReadingDraft.parse>;
  traces: NarrativeTraceValue[];
} {
  const [officer] = journeyClaims();
  return {
    answer: answerDraft(),
    traces: [traceFor(officer!, 1, OFFICER_PARAGRAPH)],
  };
}

describe('IQ-4D bazi career answer verification', () => {
  it(
    'verifies a complete synthetic answer bound to journey, view, traces, claims, and caveats',
    { timeout: 30_000 },
    () => {
      const { answer, traces } = readyExamples();
      const result = verifyBaziCareerAnswer(answer, traces, journeyInput(syntheticInput), {
        now: FIXED,
      });
      expect(result.ok).toBe(true);
      expect(result.issues).toEqual([]);
      expect(result.violations).toEqual([]);
    },
  );

  it('rejects an answer grounded in a cross-system fact outside the single-system view', () => {
    const { traces } = readyExamples();
    const crossSystem = answerDraft();
    crossSystem.sections[0]!.paragraphs[0] = {
      text: OFFICER_PARAGRAPH,
      sourceFactIds: ['fact-9'],
    };
    const result = verifyBaziCareerAnswer(crossSystem, traces, journeyInput(syntheticInput), {
      now: FIXED,
    });
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({ code: 'ANSWER_TEXT_BOUNDARY', path: '$.readingDraft' });
    expect(result.violations.some((violation) => violation.code === 'UNKNOWN_FACT_ID')).toBe(true);
  });

  it('rejects an answer that drops a material caveat of a delivered claim', () => {
    const { traces } = readyExamples();
    const incomplete = answerDraft();
    incomplete.sections[0]!.paragraphs[0] = {
      text: OFFICER_PARAGRAPH,
      sourceFactIds: ['fact-8'],
    };
    incomplete.caveatsExpressed = [];
    const result = verifyBaziCareerAnswer(incomplete, traces, journeyInput(syntheticInput), {
      now: FIXED,
    });
    expect(result.ok).toBe(false);
    expect(
      result.violations.some((violation) => violation.code === 'MISSING_REQUIRED_CAVEAT'),
    ).toBe(true);
  });

  it('rejects a declared caveat that no paragraph actually expresses', () => {
    const { traces } = readyExamples();
    const unbacked = answerDraft();
    unbacked.sections[0]!.paragraphs[0] = {
      text: OFFICER_PARAGRAPH,
      sourceFactIds: ['fact-8'],
    };
    unbacked.caveatsExpressed = [CAVEAT_FACT_8];
    const result = verifyBaziCareerAnswer(unbacked, traces, journeyInput(syntheticInput), {
      now: FIXED,
    });
    expect(result.ok).toBe(false);
    expect(
      result.violations.some((violation) => violation.code === 'CONSTRAINT_ATTESTATION_MISMATCH'),
    ).toBe(true);
  });

  it('rejects a paragraph whose conclusion is not backed by any trace', () => {
    const { answer } = readyExamples();
    answer.sections[0]!.paragraphs[0] = {
      text: `${OFFICER_PARAGRAPH}另加一句没核过的话。`,
      sourceFactIds: ['fact-8'],
      constraintRefs: [{ kind: 'caveat', index: 0 }],
    };
    const result = verifyBaziCareerAnswer(answer, [], journeyInput(syntheticInput), {
      now: FIXED,
    });
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      code: 'UNSUPPORTED_PARAGRAPH',
      path: '$.readingDraft.sections[0].paragraphs[0]',
    });
  });

  it('rejects an answer whose visible text diverges from its trace', () => {
    const [officer] = journeyClaims();
    const { answer } = readyExamples();
    const diverged = {
      ...traceFor(officer!, 1, OFFICER_PARAGRAPH),
      visibleText: `${OFFICER_PARAGRAPH}另加一句没核过的话。`,
    };
    const result = verifyBaziCareerAnswer(answer, [diverged], journeyInput(syntheticInput), {
      now: FIXED,
    });
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      code: 'UNSUPPORTED_PARAGRAPH',
      path: '$.readingDraft.sections[0].paragraphs[0]',
    });
  });

  it('rejects visible text that leaks delivery-surface blocks', () => {
    const [officer] = journeyClaims();
    const leak = {
      ...traceFor(officer!, 1, '专业依据\n官杀见于月柱。'),
    };
    const draft = answerDraft();
    draft.sections[0]!.paragraphs[0] = {
      text: '专业依据\n官杀见于月柱。',
      sourceFactIds: ['fact-8'],
      constraintRefs: [{ kind: 'caveat', index: 0 }],
    };
    const result = verifyBaziCareerAnswer(draft, [leak], journeyInput(syntheticInput), {
      now: FIXED,
    });
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      code: 'DELIVERY_SURFACE',
      path: '$.traces[0].visibleText',
    });
  });

  it(
    'fails closed on degraded unknown-time journeys and keeps the chart claim under an unavailable rule profile',
    { timeout: 30_000 },
    () => {
      const { answer, traces } = readyExamples();
      expect(() =>
        verifyBaziCareerAnswer(
          answer,
          traces,
          journeyInput(unknownTimeInput, { birthTimeReliability: 'unavailable' }),
          { now: FIXED },
        ),
      ).toThrow(ResponseViewPlanningError);
      // ADR 0021: the ten-god chart claim is not rule-profile sensitive, so an
      // unavailable rule profile no longer refuses the whole answer path.
      const degraded = verifyBaziCareerAnswer(
        answer,
        traces,
        journeyInput(syntheticInput, {
          rulesetVariantSensitiveClaims: true,
          rulesetVariant: 'unavailable',
        }),
        { now: FIXED },
      );
      expect(degraded.ok).toBe(true);
      expect(() =>
        verifyBaziCareerAnswer(
          answer,
          traces,
          journeyInput(syntheticInput, { requestedDepth: null }),
          { now: FIXED },
        ),
      ).toThrow();
    },
  );

  it('is deterministic for a fixed clock', () => {
    const { answer, traces } = readyExamples();
    expect(
      verifyBaziCareerAnswer(answer, traces, journeyInput(syntheticInput), { now: FIXED }),
    ).toEqual(verifyBaziCareerAnswer(answer, traces, journeyInput(syntheticInput), { now: FIXED }));
  });

  it('keeps the answer module offline, transient, and persistence-free', () => {
    const module = read('packages/orchestrator/src/bazi-career-answer.ts');
    for (const forbidden of [
      'fetch(',
      'child_process',
      'openai',
      'writeFile',
      'rawUserQuestion:',
      'confidence:',
      'score:',
      'answer-plan/v2',
    ]) {
      expect(module, forbidden).not.toContain(forbidden);
    }
  });

  it('wires exactly one package surface and keeps every runtime entry isolated', () => {
    expect(read('packages/orchestrator/src/index.ts')).toContain('./bazi-career-answer.ts');
    for (const relative of [
      'packages/orchestrator/src/engine-entry.ts',
      'packages/orchestrator/src/interpret.ts',
      'packages/contracts/src/index.ts',
      'packages/interpret/src/index.ts',
      'packages/contracts/src/answer-plan.ts',
      'skills/xuan-ji-yu-heng/scripts/loom-chart.mjs',
      'skills/xuan-ji-yu-heng/SKILL.md',
      'package.json',
    ]) {
      expect(read(relative), relative).not.toContain('bazi-career-answer');
    }
  });
});
