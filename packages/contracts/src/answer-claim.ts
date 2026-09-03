import { z } from 'zod';
import { ChartSystem } from './birth-input.ts';
import { InterpretationTopic } from './interpretation.ts';
import { PlanConstraintRef } from './validate-answer.ts';

/** Internal-only contract versions for IQ-1's deterministic claim chain. */
export const ANSWER_CLAIM_CANDIDATE_CONTRACT_VERSION = 'answer-claim-candidate/v1';
export const APPROVED_ANSWER_CLAIM_CONTRACT_VERSION = 'approved-answer-claim/v1';
export const NARRATIVE_TRACE_CONTRACT_VERSION = 'narrative-trace/v1';

/**
 * Typed causes, rather than free-form strings, that can invalidate an internal
 * claim or trace. They describe dependency freshness only, never truth,
 * probability, agreement, or a generic confidence level.
 */
export const AnswerClaimInvalidationCause = z.enum([
  'input-chart',
  'settings',
  'engine-provider',
  'ruleset',
  'source-profile',
  'topic-lens',
  'language-narrator',
]);
export type AnswerClaimInvalidationCause = z.infer<typeof AnswerClaimInvalidationCause>;

const ClaimRulesetRef = z.strictObject({
  id: z.string().min(1).max(160),
  version: z.string().min(1).max(80),
});

const FactRef = z.string().regex(/^fact-\d+$/, 'fact refs must use the fact-<number> form');
const CandidateId = z
  .string()
  .regex(/^claim-candidate:fact-\d+$/, 'candidate ids must derive from one fact id');
const ApprovedClaimId = z
  .string()
  .regex(/^approved-claim:fact-\d+$/, 'approved claim ids must derive from one fact id');
const TraceId = z
  .string()
  .regex(/^narrative-trace:paragraph-\d+$/, 'trace ids must derive from one paragraph id');
const ParagraphId = z
  .string()
  .regex(/^paragraph-\d+$/, 'paragraph ids must use paragraph-<number>');

function uniqueStrings(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function uniqueConstraintRefs(values: readonly { kind: string; index: number }[]): boolean {
  return new Set(values.map((value) => `${value.kind}:${value.index}`)).size === values.length;
}

const ClaimConstraintRefs = z
  .array(PlanConstraintRef)
  .max(20)
  .refine(uniqueConstraintRefs, 'constraint refs must be unique');

const ClaimMechanismRefs = z
  .array(z.string().min(1).max(300))
  .min(1)
  .max(20)
  .refine(uniqueStrings, 'mechanism refs must be unique');

const ClaimRulesetRefs = z
  .array(ClaimRulesetRef)
  .min(1)
  .max(12)
  .refine(
    (values) => uniqueStrings(values.map((value) => `${value.id}@${value.version}`)),
    'ruleset refs must be unique',
  );

const ClaimInvalidationCauses = z
  .array(AnswerClaimInvalidationCause)
  .min(1)
  .max(7)
  .refine(uniqueStrings, 'invalidation causes must be unique');

/**
 * A topic-scoped proposal derived from one already-public, de-identified fact.
 * Its existence never authorizes narration. The candidate is intentionally
 * strict: it cannot carry a prompt, birth input, host reasoning, score, or
 * cross-system synthesis field.
 */
export const AnswerClaimCandidate = z.strictObject({
  contractVersion: z.literal(ANSWER_CLAIM_CANDIDATE_CONTRACT_VERSION),
  candidateId: CandidateId,
  system: ChartSystem,
  topic: InterpretationTopic,
  claim: z.string().min(1).max(2_000),
  factRefs: z.array(FactRef).length(1),
  mechanismRefs: ClaimMechanismRefs,
  rulesetRefs: ClaimRulesetRefs,
  constraintRefs: ClaimConstraintRefs,
  invalidationCauses: ClaimInvalidationCauses,
});
export type AnswerClaimCandidate = z.infer<typeof AnswerClaimCandidate>;

/**
 * The result of deterministic path verification. It repeats the bound inputs
 * so a later trace can be verified without consulting a host's hidden state.
 * It is still internal and transient, not default answer content.
 */
export const ApprovedAnswerClaim = z.strictObject({
  contractVersion: z.literal(APPROVED_ANSWER_CLAIM_CONTRACT_VERSION),
  claimId: ApprovedClaimId,
  candidateId: CandidateId,
  approval: z.literal('deterministic-path-verified'),
  system: ChartSystem,
  topic: InterpretationTopic,
  claim: z.string().min(1).max(2_000),
  factRefs: z.array(FactRef).length(1),
  mechanismRefs: ClaimMechanismRefs,
  rulesetRefs: ClaimRulesetRefs,
  constraintRefs: ClaimConstraintRefs,
  invalidationCauses: ClaimInvalidationCauses,
});
export type ApprovedAnswerClaim = z.infer<typeof ApprovedAnswerClaim>;

/**
 * One internal, regenerable audit record for a visible paragraph. A trace can
 * refer only to approved claims: candidate ids are deliberately unrepresentable
 * here. IQ-1 validates linkage and boundaries; IQ-2 will separately assess
 * whether visible wording is faithful to those approved claims.
 */
export const NarrativeTrace = z.strictObject({
  contractVersion: z.literal(NARRATIVE_TRACE_CONTRACT_VERSION),
  traceId: TraceId,
  paragraphId: ParagraphId,
  topic: InterpretationTopic,
  approvedClaimIds: z
    .array(ApprovedClaimId)
    .min(1)
    .max(20)
    .refine(uniqueStrings, 'approved claim ids must be unique'),
  factRefs: z.array(FactRef).min(1).max(20).refine(uniqueStrings, 'fact refs must be unique'),
  mechanismRefs: ClaimMechanismRefs,
  constraintRefs: ClaimConstraintRefs,
  invalidationCauses: ClaimInvalidationCauses,
  visibleText: z.string().min(1).max(12_000),
  transient: z.literal(true),
  regenerable: z.literal(true),
});
export type NarrativeTrace = z.infer<typeof NarrativeTrace>;
