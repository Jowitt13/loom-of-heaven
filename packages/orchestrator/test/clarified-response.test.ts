import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '@loom/contracts';
import { describe, expect, it } from 'vitest';
import {
  ApprovedAnswerClaim,
  type ApprovedAnswerClaim as ApprovedAnswerClaimValue,
} from '../../contracts/src/answer-claim.ts';
import {
  ClarificationPlanningInput,
  type ClarificationPlanningInput as ClarificationPlanningInputValue,
} from '../../contracts/src/clarification-plan.ts';
import type { ResponseClaimSensitivity } from '../../contracts/src/response-view.ts';
import { ResponseViewPlanningError } from '../../interpret/src/response-view.ts';
import {
  buildClarifiedResponseView,
  verifyClarifiedResponseView,
  type ClarifiedResponseSurfaceInput,
} from '../src/clarified-response.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (relativePath: string): string => readFileSync(join(root, relativePath), 'utf8');

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

function planningInput(
  overrides: Partial<ClarificationPlanningInputValue> = {},
): ClarificationPlanningInputValue {
  return ClarificationPlanningInput.parse({
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
  });
}

function surfaceInput(
  planningOverrides: Partial<ClarificationPlanningInputValue> = {},
  options: {
    claims?: ApprovedAnswerClaimValue[];
    sensitivities?: ResponseClaimSensitivity[][];
  } = {},
): ClarifiedResponseSurfaceInput {
  const approvedClaims = options.claims ?? [
    approvedClaim(1, { constraints: [{ kind: 'caveat', index: 0 }] }),
    approvedClaim(2, { constraints: [{ kind: 'warning', index: 1 }] }),
  ];
  const sensitivities = options.sensitivities ?? approvedClaims.map(() => []);
  return {
    planningInput: planningInput(planningOverrides),
    approvedClaims,
    claimEligibility: approvedClaims.map((claim, index) => ({
      claimId: claim.claimId,
      sensitivities: sensitivities[index] ?? [],
    })),
  };
}

function expectSurfaceError(run: () => unknown, code: string): void {
  try {
    run();
    throw new Error('expected the clarified-response surface to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(ResponseViewPlanningError);
    expect((error as ResponseViewPlanningError).code).toBe(code);
  }
}

describe('IQ-3D clarified-response machine surface', () => {
  it('chains the frozen records into one ready surface view with every material caveat', () => {
    expect(buildClarifiedResponseView(surfaceInput())).toEqual({
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

  it('fails closed with no view while a material setting is unanswered', () => {
    const unanswered: Array<Partial<ClarificationPlanningInputValue>> = [
      { topic: null },
      { requestedDepth: null },
      { timeSensitiveClaims: true, birthTimeReliability: 'unresolved' },
    ];
    for (const overrides of unanswered) {
      expectSurfaceError(
        () => buildClarifiedResponseView(surfaceInput(overrides)),
        'CLARIFICATION_REQUIRED',
      );
    }
  });

  it('degrades only through the recorded omission pair and drops the affected claims', () => {
    const view = buildClarifiedResponseView(
      surfaceInput(
        { timeSensitiveClaims: true, birthTimeReliability: 'unavailable' },
        {
          claims: [
            approvedClaim(1, { constraints: [{ kind: 'caveat', index: 0 }] }),
            approvedClaim(2, { constraints: [{ kind: 'warning', index: 1 }] }),
          ],
          sensitivities: [['time-sensitive'], []],
        },
      ),
    );
    expect(view.clarificationStatus).toBe('degraded');
    expect(view.approvedClaimIds).toEqual(['approved-claim:fact-2']);
    expect(view.materialCaveatIds).toEqual([
      'clarification-note:birth-time-reliability-unavailable',
      'degradation:omit-time-sensitive-claims',
      'claim-constraint:approved-claim:fact-2:warning:1',
    ]);
    expect(view.allowedContentCategories).toContain('material-caveat');
  });

  it('passes requested depth through without changing claim eligibility', () => {
    const view = buildClarifiedResponseView(surfaceInput({ requestedDepth: 'brief' }));
    expect(view.requestedDepth).toBe('brief');
    expect(view.allowedContentCategories).not.toContain('practical-options');
    expect(view.approvedClaimIds).toEqual(['approved-claim:fact-1', 'approved-claim:fact-2']);
  });

  it('verifies a honestly rebuilt view and rejects one that conceals a material caveat', () => {
    const input = surfaceInput();
    const view = buildClarifiedResponseView(input);
    expect(verifyClarifiedResponseView(view, input)).toEqual({ ok: true, issues: [] });

    const concealed = { ...view, materialCaveatIds: view.materialCaveatIds.slice(1) };
    expect(verifyClarifiedResponseView(concealed, input)).toEqual({
      ok: false,
      issues: [{ code: 'VIEW_LINKAGE', path: '$.responseView' }],
    });

    const tampered = {
      ...view,
      approvedClaimIds: view.approvedClaimIds.slice(1),
      materialCaveatIds: view.materialCaveatIds.filter((id) => !id.includes('fact-1')),
    };
    expect(verifyClarifiedResponseView(tampered, input)).toEqual({
      ok: false,
      issues: [{ code: 'VIEW_LINKAGE', path: '$.responseView' }],
    });
  });

  it('classifies malformed views as shape failures before any linkage comparison', () => {
    expect(
      verifyClarifiedResponseView({ contractVersion: 'response-view/v1' }, surfaceInput()),
    ).toEqual({
      ok: false,
      issues: [{ code: 'VIEW_SHAPE', path: '$.responseView' }],
    });
  });

  it('reports a linkage failure when the bounded input cannot produce a view at all', () => {
    const view = buildClarifiedResponseView(surfaceInput());
    expect(verifyClarifiedResponseView(view, surfaceInput({ topic: null }))).toEqual({
      ok: false,
      issues: [{ code: 'VIEW_LINKAGE', path: '$.clarificationPlan' }],
    });
  });

  it('is deterministic across repeated builds', () => {
    expect(canonicalJson(buildClarifiedResponseView(surfaceInput()))).toBe(
      canonicalJson(buildClarifiedResponseView(surfaceInput())),
    );
  });

  it('keeps exactly one chart system per view and refuses mixed-system claim sets', () => {
    expectSurfaceError(
      () =>
        buildClarifiedResponseView(
          surfaceInput(
            {},
            {
              claims: [
                approvedClaim(1, { system: 'bazi' }),
                approvedClaim(2, { system: 'western' }),
              ],
            },
          ),
        ),
      'SYSTEM_SCOPE_MISMATCH',
    );
  });

  it('rejects surface input drift through strict bounded shapes', () => {
    expect(() =>
      buildClarifiedResponseView({ ...surfaceInput(), rawUserQuestion: '帮我看一下事业' }),
    ).toThrow();
    expect(() =>
      buildClarifiedResponseView({
        ...surfaceInput(),
        claimEligibility: [{ claimId: 'approved-claim:fact-1', sensitivities: [] }],
      }),
    ).toThrow();
  });

  it('keeps the surface module offline, transient, and persistence-free', () => {
    const module = read('packages/orchestrator/src/clarified-response.ts');
    for (const forbidden of [
      'fetch(',
      'child_process',
      'openai',
      'writeFile',
      'rawUserQuestion:',
      'confidence:',
      'score:',
    ]) {
      expect(module, forbidden).not.toContain(forbidden);
    }
  });

  it('wires exactly one package surface and keeps every runtime entry isolated', () => {
    expect(read('packages/orchestrator/src/index.ts')).toContain('./clarified-response.ts');
    for (const relative of [
      'packages/orchestrator/src/engine-entry.ts',
      'packages/orchestrator/src/interpret.ts',
      'packages/contracts/src/index.ts',
      'packages/interpret/src/index.ts',
      'packages/contracts/src/answer-plan.ts',
      'skills/xuan-ji-yu-heng/scripts/loom-chart.mjs',
      'package.json',
    ]) {
      expect(read(relative), relative).not.toContain('clarified-response');
    }
  });
});
