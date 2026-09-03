import {
  canonicalJson,
  type AnswerPlan,
  type ChartSystem,
  type PublicFact,
  type PublicResult,
} from '@loom/contracts';
import {
  APPROVED_ANSWER_CLAIM_CONTRACT_VERSION,
  ANSWER_CLAIM_CANDIDATE_CONTRACT_VERSION,
  AnswerClaimCandidate,
  type AnswerClaimCandidate as AnswerClaimCandidateValue,
  type AnswerClaimInvalidationCause,
  ApprovedAnswerClaim,
  type ApprovedAnswerClaim as ApprovedAnswerClaimValue,
  NarrativeTrace,
} from '../../contracts/src/answer-claim.ts';

/** IQ-1A is an internal-only, deterministic link checker; it never writes prose. */
export type AnswerClaimChainIssueCode =
  | 'CANDIDATE_SHAPE'
  | 'CANDIDATE_SET'
  | 'CANDIDATE_CONTENT'
  | 'CONTEXT_LINKAGE'
  | 'APPROVAL_BLOCKED'
  | 'TRACE_SHAPE'
  | 'TRACE_APPROVAL_REF'
  | 'TRACE_TOPIC'
  | 'TRACE_FACT_REFS'
  | 'TRACE_MECHANISM_REFS'
  | 'TRACE_CONSTRAINT_REFS'
  | 'TRACE_INVALIDATION';

export interface AnswerClaimChainIssue {
  code: AnswerClaimChainIssueCode;
  path: string;
}

export interface ClaimChainContext {
  publicResult: PublicResult;
  answerPlan: AnswerPlan;
}

export interface CandidateProjectionResult {
  candidates: readonly AnswerClaimCandidateValue[];
  issues: readonly AnswerClaimChainIssue[];
}

export interface CandidateVerificationResult {
  ok: boolean;
  issues: readonly AnswerClaimChainIssue[];
}

export interface ApprovalResult {
  approvedClaims: readonly ApprovedAnswerClaimValue[];
  issues: readonly AnswerClaimChainIssue[];
}

export interface NarrativeTraceVerificationResult {
  ok: boolean;
  issues: readonly AnswerClaimChainIssue[];
}

const CANDIDATE_INVALIDATION_CAUSES = [
  'input-chart',
  'settings',
  'engine-provider',
  'ruleset',
  'source-profile',
  'topic-lens',
] as const satisfies readonly AnswerClaimInvalidationCause[];

const TRACE_INVALIDATION_CAUSES = [
  ...CANDIDATE_INVALIDATION_CAUSES,
  'language-narrator',
] as const satisfies readonly AnswerClaimInvalidationCause[];

/**
 * PublicResult currently publishes one provenance list for the entire chart.
 * IQ-1A may project only a single-system candidate, so it takes the declared
 * namespace slice for that system and fails closed when that slice is absent.
 * This is source-profile routing, not a cross-system synthesis rule.
 */
const RULESET_NAMESPACE: Readonly<Record<ChartSystem, RegExp>> = {
  western: /^western(?:-|$)/,
  bazi: /^bazi(?:-|$)/,
  ziwei: /^(?:ziwei|iztro)(?:-|$)/,
  vedic: /^vedic(?:-|$)/,
};

function add(issues: AnswerClaimChainIssue[], code: AnswerClaimChainIssueCode, path: string): void {
  issues.push({ code, path });
}

function systemForEvidence(kind: PublicFact['evidence'][number]['kind']): ChartSystem | null {
  switch (kind) {
    case 'western':
    case 'western-rule':
      return 'western';
    case 'bazi':
    case 'bazi-rule':
      return 'bazi';
    case 'ziwei':
    case 'ziwei-horoscope':
    case 'ziwei-rule':
      return 'ziwei';
    case 'vedic':
    case 'vedic-rule':
      return 'vedic';
    case 'time':
      return null;
  }
}

function sourceSystem(fact: PublicFact): ChartSystem | null {
  const systems = new Set<ChartSystem>();
  for (const evidence of fact.evidence) {
    const system = systemForEvidence(evidence.kind);
    if (system !== null) systems.add(system);
  }
  return systems.size === 1 ? [...systems][0]! : null;
}

function expectedConstraintRefs(
  fact: PublicFact,
  answerPlan: AnswerPlan,
): AnswerClaimCandidateValue['constraintRefs'] | null {
  if (fact.caveat === undefined) return [];
  const index = answerPlan.requiredCaveats.indexOf(fact.caveat);
  return index === -1 ? null : [{ kind: 'caveat', index }];
}

function rulesetRefsForSystem(
  system: ChartSystem,
  publicResult: PublicResult,
): AnswerClaimCandidateValue['rulesetRefs'] {
  return publicResult.rulesets.filter((ruleset) => RULESET_NAMESPACE[system].test(ruleset.id));
}

function contextLinkageIssues(context: ClaimChainContext): AnswerClaimChainIssue[] {
  const issues: AnswerClaimChainIssue[] = [];
  const { answerPlan, publicResult } = context;

  if (
    answerPlan.engineVersion !== publicResult.engineVersion ||
    answerPlan.sourceSchemaVersion !== publicResult.sourceSchemaVersion
  ) {
    add(issues, 'CONTEXT_LINKAGE', '$.context.version');
  }

  const publicFactsById = new Map(publicResult.facts.map((fact) => [fact.id, fact]));
  const selectedFactIds = answerPlan.selectedFacts.map((fact) => fact.id);
  const allowedFactIds = answerPlan.allowedFactIds;
  const citedFactIds = answerPlan.responseRequirements.citeSelectedFactIds;

  if (
    new Set(selectedFactIds).size !== selectedFactIds.length ||
    !sameJson(selectedFactIds, allowedFactIds) ||
    !sameJson(selectedFactIds, citedFactIds)
  ) {
    add(issues, 'CONTEXT_LINKAGE', '$.answerPlan.selectedFacts');
  }

  for (const [index, fact] of answerPlan.selectedFacts.entries()) {
    if (fact.topic !== answerPlan.request.topic || !sameJson(publicFactsById.get(fact.id), fact)) {
      add(issues, 'CONTEXT_LINKAGE', `$.answerPlan.selectedFacts[${index}]`);
    }
  }

  return issues;
}

function expectedCandidate(
  fact: PublicFact,
  context: ClaimChainContext,
): AnswerClaimCandidateValue | null {
  const system = sourceSystem(fact);
  const constraintRefs = expectedConstraintRefs(fact, context.answerPlan);
  if (system === null || constraintRefs === null) return null;
  const rulesetRefs = rulesetRefsForSystem(system, context.publicResult);
  if (rulesetRefs.length === 0) return null;
  return AnswerClaimCandidate.parse({
    contractVersion: ANSWER_CLAIM_CANDIDATE_CONTRACT_VERSION,
    candidateId: `claim-candidate:${fact.id}`,
    system,
    topic: fact.topic,
    claim: fact.claim,
    factRefs: [fact.id],
    mechanismRefs: [...new Set(fact.evidence.map((evidence) => evidence.ref))],
    rulesetRefs,
    constraintRefs,
    invalidationCauses: CANDIDATE_INVALIDATION_CAUSES,
  });
}

/**
 * Projects the already de-identified, topic-scoped plan into one candidate per
 * selected fact. A fact with mixed-system or time-only provenance is left
 * unresolved rather than silently becoming a cross-system candidate.
 */
export function projectAnswerClaimCandidates(
  context: ClaimChainContext,
): CandidateProjectionResult {
  const issues = contextLinkageIssues(context);
  if (issues.length > 0) return { candidates: [], issues };
  const candidates: AnswerClaimCandidateValue[] = [];
  for (const [index, fact] of context.answerPlan.selectedFacts.entries()) {
    const candidate = expectedCandidate(fact, context);
    if (candidate === null) {
      add(issues, 'CANDIDATE_CONTENT', `$.answerPlan.selectedFacts[${index}]`);
      continue;
    }
    candidates.push(candidate);
  }
  return { candidates, issues };
}

/**
 * Validates candidates by deriving the only accepted projection from the plan
 * and comparing exact canonical records. Callers cannot self-attest a system,
 * mechanism, ruleset, constraint, or invalidation path.
 */
export function verifyAnswerClaimCandidates(
  context: ClaimChainContext,
  candidates: readonly unknown[],
): CandidateVerificationResult {
  const issues: AnswerClaimChainIssue[] = [];
  const expected = projectAnswerClaimCandidates(context);
  issues.push(...expected.issues);

  if (candidates.length !== expected.candidates.length) {
    add(issues, 'CANDIDATE_SET', '$.candidates');
  }

  for (const [index, raw] of candidates.entries()) {
    const parsed = AnswerClaimCandidate.safeParse(raw);
    if (!parsed.success) {
      add(issues, 'CANDIDATE_SHAPE', `$.candidates[${index}]`);
      continue;
    }
    const expectedCandidateAtIndex = expected.candidates[index];
    if (
      expectedCandidateAtIndex === undefined ||
      canonicalJson(parsed.data) !== canonicalJson(expectedCandidateAtIndex)
    ) {
      add(issues, 'CANDIDATE_CONTENT', `$.candidates[${index}]`);
    }
  }

  return { ok: issues.length === 0, issues };
}

/**
 * Only a candidate that closes against the deterministic plan can become an
 * approved claim. This function has no narrator, host, persistence, or runtime
 * entry-point wiring.
 */
export function approveAnswerClaimCandidates(
  context: ClaimChainContext,
  candidates: readonly unknown[],
): ApprovalResult {
  const verification = verifyAnswerClaimCandidates(context, candidates);
  if (!verification.ok) {
    return {
      approvedClaims: [],
      issues: [...verification.issues, { code: 'APPROVAL_BLOCKED', path: '$.candidates' }],
    };
  }

  const approvedClaims = candidates.map((rawCandidate) => {
    const candidate = AnswerClaimCandidate.parse(rawCandidate);
    return ApprovedAnswerClaim.parse({
      contractVersion: APPROVED_ANSWER_CLAIM_CONTRACT_VERSION,
      claimId: candidate.candidateId.replace('claim-candidate:', 'approved-claim:'),
      candidateId: candidate.candidateId,
      approval: 'deterministic-path-verified',
      system: candidate.system,
      topic: candidate.topic,
      claim: candidate.claim,
      factRefs: candidate.factRefs,
      mechanismRefs: candidate.mechanismRefs,
      rulesetRefs: candidate.rulesetRefs,
      constraintRefs: candidate.constraintRefs,
      invalidationCauses: candidate.invalidationCauses,
    });
  });
  return { approvedClaims, issues: [] };
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

/**
 * Verifies linkage for one transient paragraph trace. It deliberately does not
 * judge whether visibleText is semantically faithful; that is IQ-2's job.
 */
export function verifyNarrativeTrace(
  trace: unknown,
  approvedClaims: readonly unknown[],
): NarrativeTraceVerificationResult {
  const issues: AnswerClaimChainIssue[] = [];
  const parsedTrace = NarrativeTrace.safeParse(trace);
  if (!parsedTrace.success) {
    add(issues, 'TRACE_SHAPE', '$.trace');
    return { ok: false, issues };
  }

  const approvedById = new Map<string, ApprovedAnswerClaimValue>();
  for (const [index, raw] of approvedClaims.entries()) {
    const parsed = ApprovedAnswerClaim.safeParse(raw);
    if (!parsed.success || approvedById.has(parsed.data.claimId)) {
      add(issues, 'TRACE_APPROVAL_REF', `$.approvedClaims[${index}]`);
      continue;
    }
    approvedById.set(parsed.data.claimId, parsed.data);
  }

  const linkedClaims: ApprovedAnswerClaimValue[] = [];
  for (const [index, claimId] of parsedTrace.data.approvedClaimIds.entries()) {
    const claim = approvedById.get(claimId);
    if (claim === undefined) {
      add(issues, 'TRACE_APPROVAL_REF', `$.trace.approvedClaimIds[${index}]`);
      continue;
    }
    linkedClaims.push(claim);
    if (claim.topic !== parsedTrace.data.topic) add(issues, 'TRACE_TOPIC', '$.trace.topic');
  }

  const expectedFactRefs = [...new Set(linkedClaims.flatMap((claim) => claim.factRefs))];
  const expectedMechanismRefs = [...new Set(linkedClaims.flatMap((claim) => claim.mechanismRefs))];
  const expectedConstraintRefs = [
    ...new Map(
      linkedClaims
        .flatMap((claim) => claim.constraintRefs)
        .map((ref) => [`${ref.kind}:${ref.index}`, ref]),
    ).values(),
  ];

  if (!sameJson(parsedTrace.data.factRefs, expectedFactRefs)) {
    add(issues, 'TRACE_FACT_REFS', '$.trace.factRefs');
  }
  if (!sameJson(parsedTrace.data.mechanismRefs, expectedMechanismRefs)) {
    add(issues, 'TRACE_MECHANISM_REFS', '$.trace.mechanismRefs');
  }
  if (!sameJson(parsedTrace.data.constraintRefs, expectedConstraintRefs)) {
    add(issues, 'TRACE_CONSTRAINT_REFS', '$.trace.constraintRefs');
  }
  if (!sameJson(parsedTrace.data.invalidationCauses, TRACE_INVALIDATION_CAUSES)) {
    add(issues, 'TRACE_INVALIDATION', '$.trace.invalidationCauses');
  }

  return { ok: issues.length === 0, issues };
}
