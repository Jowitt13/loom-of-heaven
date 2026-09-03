import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, PublicResult } from '@loom/contracts';
import { describe, expect, it } from 'vitest';
import { buildAnswerPlan } from '../src/answer-plan.ts';
import {
  approveAnswerClaimCandidates,
  projectAnswerClaimCandidates,
  verifyAnswerClaimCandidates,
  verifyNarrativeTrace,
  type ClaimChainContext,
} from '../src/answer-claim-chain.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function context(): ClaimChainContext {
  const fullPublicResult = PublicResult.parse({
    contractVersion: 'public-result/v2',
    engineVersion: 'synthetic-iq1a-engine',
    sourceSchemaVersion: 'synthetic-iq1a-schema',
    systems: [
      { system: 'western', status: 'computed' },
      { system: 'bazi', status: 'computed' },
      { system: 'ziwei', status: 'computed' },
      { system: 'vedic', status: 'computed' },
    ],
    inputReliability: { timeAccuracy: 'exact', birthTimeKnown: true },
    warnings: [],
    facts: [
      {
        id: 'fact-1',
        topic: 'career',
        claim: '合成八字结构提示：工作安排宜保留可复盘的迭代空间。',
        evidence: [
          { kind: 'bazi-rule', ref: 'bazi-rule/synthetic/iteration' },
          { kind: 'bazi', ref: 'bazi.synthetic.dayMaster' },
        ],
        caveat: '这是合成技术样本，不构成对真实职业结果的判断。',
      },
      {
        id: 'fact-2',
        topic: 'career',
        claim: '合成西方结构提示：职业选择需结合现实资源与反馈再调整。',
        evidence: [{ kind: 'western-rule', ref: 'western-rule/synthetic/angle' }],
      },
      {
        id: 'fact-3',
        topic: 'general',
        claim: '不在当前主题内的合成事实。',
        evidence: [{ kind: 'vedic-rule', ref: 'vedic-rule/synthetic/general' }],
      },
    ],
    rulesets: [
      { id: 'bazi-synthetic-evaluation', version: 'v1' },
      { id: 'western-synthetic-evaluation', version: 'v1' },
    ],
    disclaimers: [],
    followupOffers: [],
  });
  const answerPlan = buildAnswerPlan(fullPublicResult, { topic: 'career', lens: 'advice' });
  return {
    publicResult: { ...fullPublicResult, facts: answerPlan.selectedFacts },
    answerPlan,
  };
}

function projected() {
  const chainContext = context();
  const projection = projectAnswerClaimCandidates(chainContext);
  expect(projection.issues).toEqual([]);
  return { chainContext, candidates: projection.candidates };
}

function approved() {
  const { chainContext, candidates } = projected();
  const result = approveAnswerClaimCandidates(chainContext, candidates);
  expect(result.issues).toEqual([]);
  return { chainContext, candidates, approvedClaims: result.approvedClaims };
}

describe('IQ-1A internal answer claim chain', () => {
  it('projects one deterministic, single-system candidate per selected fact', () => {
    const { chainContext, candidates } = projected();
    expect(candidates).toHaveLength(2);
    expect(candidates.map((candidate) => candidate.candidateId)).toEqual([
      'claim-candidate:fact-1',
      'claim-candidate:fact-2',
    ]);
    expect(candidates.map((candidate) => candidate.system)).toEqual(['bazi', 'western']);
    expect(candidates.map((candidate) => candidate.rulesetRefs)).toEqual([
      [{ id: 'bazi-synthetic-evaluation', version: 'v1' }],
      [{ id: 'western-synthetic-evaluation', version: 'v1' }],
    ]);
    expect(candidates.every((candidate) => candidate.topic === 'career')).toBe(true);
    expect(candidates[0]!.constraintRefs).toEqual([{ kind: 'caveat', index: 0 }]);
    expect(candidates[1]!.constraintRefs).toEqual([]);
    expect(verifyAnswerClaimCandidates(chainContext, candidates)).toEqual({ ok: true, issues: [] });
  });

  it('is byte-identical for identical de-identified plan context', () => {
    const first = projectAnswerClaimCandidates(context());
    const second = projectAnswerClaimCandidates(context());
    expect(canonicalJson(first)).toBe(canonicalJson(second));
  });

  it('rejects self-attested system, mechanism, fact, and privacy-field drift without echoing values', () => {
    const { chainContext, candidates } = projected();
    const systemDrift = copy(candidates);
    systemDrift[0]!.system = 'western';
    expect(verifyAnswerClaimCandidates(chainContext, systemDrift).issues).toContainEqual({
      code: 'CANDIDATE_CONTENT',
      path: '$.candidates[0]',
    });

    const mechanismDrift = copy(candidates);
    mechanismDrift[0]!.mechanismRefs = ['bazi-rule/synthetic/invented'];
    expect(verifyAnswerClaimCandidates(chainContext, mechanismDrift).issues).toContainEqual({
      code: 'CANDIDATE_CONTENT',
      path: '$.candidates[0]',
    });

    const factDrift = copy(candidates);
    factDrift[0]!.factRefs = ['fact-999'];
    expect(verifyAnswerClaimCandidates(chainContext, factDrift).issues).toContainEqual({
      code: 'CANDIDATE_CONTENT',
      path: '$.candidates[0]',
    });

    const privateSentinel = 'IQ1A-PRIVATE-SENTINEL';
    const privacyDrift = copy(candidates) as unknown as Array<Record<string, unknown>>;
    privacyDrift[0]!.rawUserPrompt = privateSentinel;
    const result = verifyAnswerClaimCandidates(chainContext, privacyDrift);
    expect(result.issues).toContainEqual({ code: 'CANDIDATE_SHAPE', path: '$.candidates[0]' });
    expect(canonicalJson(result)).not.toContain(privateSentinel);
  });

  it('fails closed when the plan is not linked to its public result or source profile', () => {
    const mismatchedFacts = context();
    mismatchedFacts.publicResult = {
      ...mismatchedFacts.publicResult,
      facts: [mismatchedFacts.publicResult.facts[1]!],
    };
    expect(projectAnswerClaimCandidates(mismatchedFacts).issues).toContainEqual({
      code: 'CONTEXT_LINKAGE',
      path: '$.answerPlan.selectedFacts[0]',
    });

    const missingBaziProfile = context();
    missingBaziProfile.publicResult = {
      ...missingBaziProfile.publicResult,
      rulesets: [{ id: 'western-synthetic-evaluation', version: 'v1' }],
    };
    expect(projectAnswerClaimCandidates(missingBaziProfile)).toEqual({
      candidates: [
        expect.objectContaining({
          candidateId: 'claim-candidate:fact-2',
          system: 'western',
        }),
      ],
      issues: [
        {
          code: 'CANDIDATE_CONTENT',
          path: '$.answerPlan.selectedFacts[0]',
        },
      ],
    });
  });

  it('makes approval impossible until every candidate closes against the plan', () => {
    const { chainContext, candidates } = projected();
    const result = approveAnswerClaimCandidates(chainContext, candidates);
    expect(result.approvedClaims.map((claim) => claim.claimId)).toEqual([
      'approved-claim:fact-1',
      'approved-claim:fact-2',
    ]);
    expect(
      result.approvedClaims.every((claim) => claim.approval === 'deterministic-path-verified'),
    ).toBe(true);

    const invalid = copy(candidates);
    invalid[0]!.claim = '未经事实支持的替换结论。';
    const blocked = approveAnswerClaimCandidates(chainContext, invalid);
    expect(blocked.approvedClaims).toEqual([]);
    expect(blocked.issues.at(-1)).toEqual({ code: 'APPROVAL_BLOCKED', path: '$.candidates' });
  });

  it('accepts an internal trace only when it resolves approved claims and complete boundaries', () => {
    const { approvedClaims } = approved();
    const trace = {
      contractVersion: 'narrative-trace/v1',
      traceId: 'narrative-trace:paragraph-1',
      paragraphId: 'paragraph-1',
      topic: 'career',
      approvedClaimIds: approvedClaims.map((claim) => claim.claimId),
      factRefs: approvedClaims.flatMap((claim) => claim.factRefs),
      mechanismRefs: approvedClaims.flatMap((claim) => claim.mechanismRefs),
      constraintRefs: approvedClaims.flatMap((claim) => claim.constraintRefs),
      invalidationCauses: [
        'input-chart',
        'settings',
        'engine-provider',
        'ruleset',
        'source-profile',
        'topic-lens',
        'language-narrator',
      ],
      visibleText: '合成样本中，两项已批准结论都应结合现实条件使用。',
      transient: true,
      regenerable: true,
    };
    expect(verifyNarrativeTrace(trace, approvedClaims)).toEqual({ ok: true, issues: [] });
  });

  it('rejects candidate narration, missing caveat linkage, and incomplete invalidation', () => {
    const { approvedClaims } = approved();
    const trace = {
      contractVersion: 'narrative-trace/v1',
      traceId: 'narrative-trace:paragraph-1',
      paragraphId: 'paragraph-1',
      topic: 'career',
      approvedClaimIds: approvedClaims.map((claim) => claim.claimId),
      factRefs: approvedClaims.flatMap((claim) => claim.factRefs),
      mechanismRefs: approvedClaims.flatMap((claim) => claim.mechanismRefs),
      constraintRefs: approvedClaims.flatMap((claim) => claim.constraintRefs),
      invalidationCauses: [
        'input-chart',
        'settings',
        'engine-provider',
        'ruleset',
        'source-profile',
        'topic-lens',
        'language-narrator',
      ],
      visibleText: '合成样本。',
      transient: true,
      regenerable: true,
    };

    const candidateNarration = copy(trace);
    candidateNarration.approvedClaimIds = ['claim-candidate:fact-1'];
    expect(verifyNarrativeTrace(candidateNarration, approvedClaims).issues).toContainEqual({
      code: 'TRACE_SHAPE',
      path: '$.trace',
    });

    const missingConstraint = copy(trace);
    missingConstraint.constraintRefs = [];
    expect(verifyNarrativeTrace(missingConstraint, approvedClaims).issues).toContainEqual({
      code: 'TRACE_CONSTRAINT_REFS',
      path: '$.trace.constraintRefs',
    });

    const staleTrace = copy(trace);
    staleTrace.invalidationCauses.pop();
    expect(verifyNarrativeTrace(staleTrace, approvedClaims).issues).toContainEqual({
      code: 'TRACE_INVALIDATION',
      path: '$.trace.invalidationCauses',
    });
  });

  it('keeps the claim chain internal and does not wire a runtime surface', () => {
    const read = (relative: string): string => readFileSync(join(root, relative), 'utf8');
    const module = read('packages/interpret/src/answer-claim-chain.ts');
    expect(module).not.toContain('fetch(');
    expect(module).not.toContain('child_process');
    expect(module).not.toContain('openai');
    for (const relative of [
      'packages/interpret/src/index.ts',
      'packages/orchestrator/src/interpret.ts',
      'skills/xuan-ji-yu-heng/scripts/loom-chart.mjs',
      'package.json',
    ]) {
      expect(read(relative), relative).not.toContain('answer-claim-chain');
    }
    expect(read('packages/contracts/src/index.ts')).not.toContain('answer-claim');
  });

  it('keeps unsupported score, confidence, synthesis, and raw-input fields out of the contracts', () => {
    const source = readFileSync(join(root, 'packages/contracts/src/answer-claim.ts'), 'utf8');
    for (const forbidden of [
      'confidence:',
      'score:',
      'weight:',
      'probability:',
      'synthesis:',
      'rawUserPrompt:',
      'originalInput:',
      'chainOfThought:',
    ]) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });
});
