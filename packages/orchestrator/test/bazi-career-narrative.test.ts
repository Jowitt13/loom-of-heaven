// Synthetic fixtures only - fictional data; not a real person. fixtureKind: synthetic-technical.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NarrativeTrace,
  type NarrativeTrace as NarrativeTraceValue,
} from '../../contracts/src/answer-claim.ts';
import type { ApprovedAnswerClaim } from '../../contracts/src/answer-claim.ts';
import { parseBirthInput, type BirthInput } from '@loom/contracts';
import { describe, expect, it } from 'vitest';
import { ClarificationPlanningInput } from '../../contracts/src/clarification-plan.ts';
import {
  approveAnswerClaimCandidates,
  projectAnswerClaimCandidates,
} from '../../interpret/src/answer-claim-chain.ts';
import { ResponseViewPlanningError } from '../../interpret/src/response-view.ts';
import { projectBaziCareerJourney } from '../src/bazi-career-journey.ts';
import { verifyBaziCareerNarrative } from '../src/bazi-career-narrative.ts';
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
    displayName: 'Synthetic bazi narrative location sentinel',
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

const OFFICER_PARAGRAPH =
  '命盘里有「七杀」这一传统十神，传统上常联到权威、压力、竞争一类主题，只作文化背景。' +
  '官杀说的是事业倾向的结构，不是职业预言。';

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

describe('IQ-4C bazi career narrative trace linkage', () => {
  it(
    'verifies ready-journey examples whose traces cover every claim and caveat',
    { timeout: 30_000 },
    () => {
      const [officer] = journeyClaims();
      const traces = [traceFor(officer!, 1, OFFICER_PARAGRAPH)];
      expect(
        verifyBaziCareerNarrative(traces, journeyInput(syntheticInput), { now: FIXED }),
      ).toEqual({ ok: true, issues: [] });
    },
  );

  it('flags a paragraph set that leaves a delivered claim without a trace', () => {
    const result = verifyBaziCareerNarrative([], journeyInput(syntheticInput), { now: FIXED });
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      code: 'CLAIM_COVERAGE',
      path: '$.traces.approvedClaimIds',
    });
  });

  it('flags a trace that links a claim outside the journey view', () => {
    const result = verifyBaziCareerNarrative(
      [
        {
          contractVersion: 'narrative-trace/v1',
          traceId: 'narrative-trace:paragraph-9',
          paragraphId: 'paragraph-9',
          topic: 'career',
          approvedClaimIds: ['approved-claim:fact-999'],
          factRefs: ['fact-999'],
          mechanismRefs: ['bazi-rule/synthetic/999'],
          constraintRefs: [],
          invalidationCauses: TRACE_INVALIDATION_CAUSES,
          visibleText: OFFICER_PARAGRAPH,
          transient: true,
          regenerable: true,
        },
      ],
      journeyInput(syntheticInput),
      { now: FIXED },
    );
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({ code: 'TRACE_LINKAGE', path: '$.traces[0]' });
  });

  it('flags a trace whose mechanism refs were tampered after approval', () => {
    const [officer] = journeyClaims();
    const tampered = {
      ...traceFor(officer!, 1, OFFICER_PARAGRAPH),
      mechanismRefs: [...officer!.mechanismRefs, 'bazi-rule/synthetic/extra'],
    };
    const result = verifyBaziCareerNarrative([tampered], journeyInput(syntheticInput), {
      now: FIXED,
    });
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({ code: 'TRACE_LINKAGE', path: '$.traces[0]' });
  });

  it('flags visible text that leaks delivery-surface blocks', () => {
    const [officer] = journeyClaims();
    const result = verifyBaziCareerNarrative(
      [traceFor(officer!, 1, '专业依据\n官杀见于月柱。')],
      journeyInput(syntheticInput),
      { now: FIXED },
    );
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      code: 'DELIVERY_SURFACE',
      path: '$.traces[0].visibleText',
    });
  });

  it('cannot narrate a degraded unknown-time journey', { timeout: 30_000 }, () => {
    const run = () =>
      verifyBaziCareerNarrative(
        [],
        journeyInput(unknownTimeInput, { birthTimeReliability: 'unavailable' }),
        { now: FIXED },
      );
    expect(run).toThrow(ResponseViewPlanningError);
  });

  it(
    'cannot narrate when the rule profile is unavailable (cultural gloss is rule-backed)',
    { timeout: 30_000 },
    () => {
      const run = () =>
        verifyBaziCareerNarrative(
          [],
          journeyInput(syntheticInput, {
            rulesetVariantSensitiveClaims: true,
            rulesetVariant: 'unavailable',
          }),
          { now: FIXED },
        );
      expect(run).toThrow(ResponseViewPlanningError);
      expect(() =>
        projectBaziCareerJourney(journeyInput(syntheticInput), { now: FIXED }),
      ).not.toThrow();
    },
  );

  it('is deterministic for a fixed clock', () => {
    const [officer] = journeyClaims();
    const traces = [traceFor(officer!, 1, OFFICER_PARAGRAPH)];
    expect(verifyBaziCareerNarrative(traces, journeyInput(syntheticInput), { now: FIXED })).toEqual(
      verifyBaziCareerNarrative(traces, journeyInput(syntheticInput), { now: FIXED }),
    );
  });

  it('rejects surface input drift through strict bounded shapes', () => {
    expect(() =>
      verifyBaziCareerNarrative(
        [],
        { ...journeyInput(syntheticInput), rawUserQuestion: '帮我看事业' },
        {
          now: FIXED,
        },
      ),
    ).toThrow();
  });

  it('keeps the narrative module offline, transient, and persistence-free', () => {
    const module = read('packages/orchestrator/src/bazi-career-narrative.ts');
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
    expect(read('packages/orchestrator/src/index.ts')).toContain('./bazi-career-narrative.ts');
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
      expect(read(relative), relative).not.toContain('bazi-career-narrative');
    }
  });
});
