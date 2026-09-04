import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '@loom/contracts';
import { describe, expect, it } from 'vitest';
import {
  ResponseView,
  ResponseViewPlanningInput,
  type ResponseViewPlanningInput as ResponseViewPlanningInputValue,
} from '../../contracts/src/response-view.ts';
import {
  ClarificationPlanningInput,
  type ClarificationPlanningInput as ClarificationPlanningInputValue,
} from '../../contracts/src/clarification-plan.ts';
import {
  ApprovedAnswerClaim,
  type ApprovedAnswerClaim as ApprovedAnswerClaimValue,
} from '../../contracts/src/answer-claim.ts';
import { planClarificationMateriality } from '../src/clarification-materiality.ts';
import {
  projectResponseView,
  ResponseViewPlanningError,
  verifyResponseView,
} from '../src/response-view.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function approvedClaim(
  factNumber: number,
  options: {
    system?: 'bazi' | 'western';
    topic?: 'career' | 'general';
    constraints?: Array<{ kind: 'caveat' | 'warning' | 'disclaimer'; index: number }>;
  } = {},
): ApprovedAnswerClaimValue {
  const system = options.system ?? 'bazi';
  const topic = options.topic ?? 'career';
  return ApprovedAnswerClaim.parse({
    contractVersion: 'approved-answer-claim/v1',
    claimId: `approved-claim:fact-${factNumber}`,
    candidateId: `claim-candidate:fact-${factNumber}`,
    approval: 'deterministic-path-verified',
    system,
    topic,
    claim: `合成 claim ${factNumber}`,
    factRefs: [`fact-${factNumber}`],
    mechanismRefs: [`${system}-rule/synthetic/${factNumber}`],
    rulesetRefs: [{ id: `${system}-synthetic-evaluation`, version: 'v1' }],
    constraintRefs: options.constraints ?? [],
    invalidationCauses: ['input-chart'],
  });
}

function clarification(overrides: Partial<ClarificationPlanningInputValue> = {}) {
  return planClarificationMateriality(
    ClarificationPlanningInput.parse({
      topic: 'career',
      requestedDepth: 'standard',
      systemScope: 'bazi',
      timeSensitiveClaims: false,
      birthTimeReliability: 'not-required',
      timingRequest: false,
      targetPeriod: 'not-required',
      rulesetVariantSensitiveClaims: false,
      rulesetVariant: 'not-required',
      ...overrides,
    }),
  );
}

function input(
  overrides: Partial<ResponseViewPlanningInputValue> = {},
): ResponseViewPlanningInputValue {
  const approvedClaims = [
    approvedClaim(1, { constraints: [{ kind: 'caveat', index: 0 }] }),
    approvedClaim(2, { constraints: [{ kind: 'warning', index: 1 }] }),
  ];
  return ResponseViewPlanningInput.parse({
    clarificationPlan: clarification(),
    approvedClaims,
    claimEligibility: approvedClaims.map((claim) => ({
      claimId: claim.claimId,
      sensitivities: [],
    })),
    ...overrides,
  });
}

function expectPlanningError(run: () => unknown, code: string): void {
  try {
    run();
    throw new Error('expected response-view planning to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(ResponseViewPlanningError);
    expect((error as ResponseViewPlanningError).code).toBe(code);
  }
}

describe('IQ-3C internal response-view projection', () => {
  it('projects only one explicit system, its approved claims, and every claim-bound material caveat', () => {
    expect(projectResponseView(input())).toEqual({
      contractVersion: 'response-view/v1',
      clarificationStatus: 'ready',
      topic: 'career',
      requestedDepth: 'standard',
      system: 'bazi',
      approvedClaimIds: ['approved-claim:fact-1', 'approved-claim:fact-2'],
      materialCaveatIds: [
        'claim-constraint:approved-claim:fact-1:caveat:0',
        'claim-constraint:approved-claim:fact-2:warning:1',
      ],
      allowedContentCategories: [
        'conclusion',
        'mechanism-and-implication',
        'material-caveat',
        'practical-options',
      ],
      auditAvailability: 'explicit-request-only',
      transient: true,
      regenerable: true,
    });
  });

  it('creates no response view while any material setting remains unresolved', () => {
    expectPlanningError(
      () => projectResponseView(input({ clarificationPlan: clarification({ systemScope: null }) })),
      'CLARIFICATION_REQUIRED',
    );
  });

  it('fails closed when an approved claim has a topic or system outside the explicit scope', () => {
    expectPlanningError(
      () =>
        projectResponseView(
          input({
            approvedClaims: [approvedClaim(1, { topic: 'general' })],
            claimEligibility: [{ claimId: 'approved-claim:fact-1', sensitivities: [] }],
          }),
        ),
      'TOPIC_SCOPE_MISMATCH',
    );
    expectPlanningError(
      () =>
        projectResponseView(
          input({
            approvedClaims: [approvedClaim(1, { system: 'western' })],
            claimEligibility: [{ claimId: 'approved-claim:fact-1', sensitivities: [] }],
          }),
        ),
      'SYSTEM_SCOPE_MISMATCH',
    );
  });

  it('does not create a cross-system view even when each individual claim is approved', () => {
    expectPlanningError(
      () =>
        projectResponseView(
          input({
            approvedClaims: [approvedClaim(1), approvedClaim(2, { system: 'western' })],
            claimEligibility: [
              { claimId: 'approved-claim:fact-1', sensitivities: [] },
              { claimId: 'approved-claim:fact-2', sensitivities: [] },
            ],
          }),
        ),
      'SYSTEM_SCOPE_MISMATCH',
    );
  });

  it('lets brief depth omit practical options but never a material caveat', () => {
    const view = projectResponseView(
      input({ clarificationPlan: clarification({ requestedDepth: 'brief' }) }),
    );
    expect(view.allowedContentCategories).toEqual([
      'conclusion',
      'mechanism-and-implication',
      'material-caveat',
    ]);
    expect(view.materialCaveatIds).toHaveLength(2);
  });

  it('records time degradation, removes only time-sensitive claims, and retains the matching note and degradation ids', () => {
    const view = projectResponseView(
      input({
        clarificationPlan: clarification({
          timeSensitiveClaims: true,
          birthTimeReliability: 'unavailable',
        }),
        claimEligibility: [
          { claimId: 'approved-claim:fact-1', sensitivities: ['time-sensitive'] },
          { claimId: 'approved-claim:fact-2', sensitivities: [] },
        ],
      }),
    );
    expect(view.clarificationStatus).toBe('degraded');
    expect(view.approvedClaimIds).toEqual(['approved-claim:fact-2']);
    expect(view.materialCaveatIds).toEqual([
      'clarification-note:birth-time-reliability-unavailable',
      'degradation:omit-time-sensitive-claims',
      'claim-constraint:approved-claim:fact-2:warning:1',
    ]);
  });

  it('removes every matching degraded claim class and fails closed if no approved claim remains', () => {
    expectPlanningError(
      () =>
        projectResponseView(
          input({
            clarificationPlan: clarification({
              timingRequest: true,
              targetPeriod: 'unavailable',
              rulesetVariantSensitiveClaims: true,
              rulesetVariant: 'unavailable',
            }),
            claimEligibility: [
              { claimId: 'approved-claim:fact-1', sensitivities: ['timing'] },
              { claimId: 'approved-claim:fact-2', sensitivities: ['ruleset-variant-sensitive'] },
            ],
          }),
        ),
      'NO_ELIGIBLE_APPROVED_CLAIMS',
    );
  });

  it('rejects extra raw fields and incomplete or reordered eligibility coverage before projection', () => {
    const base = input();
    expect(
      ResponseViewPlanningInput.safeParse({ ...base, rawUserQuestion: 'private sentinel' }).success,
    ).toBe(false);
    expect(
      ResponseViewPlanningInput.safeParse({
        ...base,
        claimEligibility: [...base.claimEligibility].reverse(),
      }).success,
    ).toBe(false);
  });

  it('detects a response view that hides a retained material caveat or changes its declared scope', () => {
    const source = input();
    const view = projectResponseView(source);
    expect(
      verifyResponseView({ ...view, materialCaveatIds: view.materialCaveatIds.slice(1) }, source),
    ).toEqual({ ok: false, issues: [{ code: 'VIEW_LINKAGE', path: '$.responseView' }] });
    expect(verifyResponseView({ ...view, system: 'western' }, source)).toEqual({
      ok: false,
      issues: [{ code: 'VIEW_LINKAGE', path: '$.responseView' }],
    });
  });

  it('is byte-identical for the same bounded internal input', () => {
    const bounded = input();
    expect(canonicalJson(projectResponseView(bounded))).toBe(
      canonicalJson(projectResponseView(bounded)),
    );
  });

  it('keeps the projection internal, transient, offline, and outside runtime entry points', () => {
    const read = (relative: string): string => readFileSync(join(root, relative), 'utf8');
    const module = read('packages/interpret/src/response-view.ts');
    for (const forbidden of [
      'fetch(',
      'child_process',
      'openai',
      'rawUserQuestion:',
      'confidence:',
      'score:',
      'SynthesisRecord',
    ]) {
      expect(module, forbidden).not.toContain(forbidden);
    }
    for (const relative of [
      'packages/interpret/src/index.ts',
      'packages/orchestrator/src/interpret.ts',
      'packages/contracts/src/index.ts',
      'skills/xuan-ji-yu-heng/scripts/loom-chart.mjs',
      'package.json',
    ]) {
      expect(read(relative), relative).not.toContain('response-view');
    }
  });

  it('rejects a malformed response view before any linkage comparison', () => {
    expect(verifyResponseView({ contractVersion: 'response-view/v1' }, input())).toEqual({
      ok: false,
      issues: [{ code: 'VIEW_SHAPE', path: '$.responseView' }],
    });
    expect(ResponseView.safeParse({ contractVersion: 'response-view/v1' }).success).toBe(false);
  });
});
