import { z } from 'zod';
import { InterpretationTopic } from './interpretation.ts';
import { AnswerGuardrail } from './answer-plan.ts';

/**
 * validate-answer — fact-boundary and safety layer contracts (P0).
 *
 * This is deliberately separate from lint-reading (language quality).
 * It validates that a host's structured ReadingDraft:
 * 1. Cites only allowedFactIds from the AnswerPlan.
 * 2. Does not cross topic boundaries.
 * 3. Does not contain high-risk expressions (medical, legal, investment, fate, life-death).
 * 4. Expresses all required caveats and warnings.
 * 5. Does not add unsourced conclusions.
 */

export const READING_DRAFT_CONTRACT_VERSION = 'reading-draft/v1';
export const VALIDATION_RESULT_CONTRACT_VERSION = 'validation-result/v1';

/** A single paragraph within a reading section. */
export const ReadingParagraph = z.strictObject({
  text: z.string().min(1),
  /** Fact IDs from the AnswerPlan that ground this paragraph. */
  sourceFactIds: z.array(z.string()),
});
export type ReadingParagraph = z.infer<typeof ReadingParagraph>;

/** A section in the structured reading draft. */
export const ReadingSection = z.strictObject({
  id: z.string().min(1),
  heading: z.string(),
  paragraphs: z.array(ReadingParagraph).min(1),
});
export type ReadingSection = z.infer<typeof ReadingSection>;

/**
 * Structured draft produced by a host/LLM before final rendering.
 * Every visible content paragraph must cite sourceFactIds.
 */
export const ReadingDraft = z.strictObject({
  contractVersion: z.literal(READING_DRAFT_CONTRACT_VERSION),
  topic: InterpretationTopic,
  sections: z.array(ReadingSection).min(1),
  /** Which requiredCaveats (from AnswerPlan) the host claims to have expressed. */
  caveatsExpressed: z.array(z.string()),
  /** Which requiredWarningCodes the host claims to have disclosed. */
  warningsDisclosed: z.array(z.string()),
});
export type ReadingDraft = z.infer<typeof ReadingDraft>;

// --- Validation result types ---

export const ViolationCode = z.enum([
  // Fact-boundary violations
  'MISSING_SOURCE_FACTS', // paragraph has empty sourceFactIds
  'UNKNOWN_FACT_ID', // sourceFactId not in allowedFactIds
  'CROSS_TOPIC', // draft topic differs from plan topic
  'UNSUPPORTED_TOPIC', // plan says not-supported but draft has content

  // Safety violations (high-risk expressions)
  'HIGH_RISK_MEDICAL', // medical diagnosis or treatment advice
  'HIGH_RISK_LEGAL', // legal conclusions or advice
  'HIGH_RISK_INVESTMENT', // investment buy/sell recommendations
  'HIGH_RISK_LIFE_DEATH', // life-and-death verdicts
  'HIGH_RISK_DETERMINISTIC_FATE', // deterministic fate / destiny claims
  'HIGH_RISK_RELATIONSHIP_MANIPULATION', // manipulative relationship advice

  // Caveat/warning violations
  'MISSING_REQUIRED_CAVEAT', // a requiredCaveat not expressed
  'MISSING_REQUIRED_WARNING', // a requiredWarningCode not disclosed
  'MISSING_DISCLAIMER', // answerPlan disclaimers not communicated

  // Guardrail violations
  'GUARDRAIL_VIOLATED', // a guardrail from the plan was violated
]);
export type ViolationCode = z.infer<typeof ViolationCode>;

export const ViolationSeverity = z.enum(['error', 'warning']);
export type ViolationSeverity = z.infer<typeof ViolationSeverity>;

export const AnswerViolation = z.strictObject({
  code: ViolationCode,
  severity: ViolationSeverity,
  /** Which section (by id) the violation was found in, if applicable. */
  sectionId: z.string().optional(),
  /** Which paragraph index within the section, if applicable. */
  paragraphIndex: z.number().int().min(0).optional(),
  /** Human-readable description of what went wrong. */
  detail: z.string().min(1),
  /** Actionable remediation guidance. */
  remediation: z.string().min(1),
});
export type AnswerViolation = z.infer<typeof AnswerViolation>;

export const AnswerValidationResult = z.strictObject({
  contractVersion: z.literal(VALIDATION_RESULT_CONTRACT_VERSION),
  ok: z.boolean(),
  violations: z.array(AnswerViolation),
});
export type AnswerValidationResult = z.infer<typeof AnswerValidationResult>;

/**
 * The input envelope for validate-answer: an AnswerPlan + a ReadingDraft.
 * The validator checks the draft against the plan's constraints.
 */
export const ValidateAnswerInput = z.strictObject({
  answerPlan: z.object({
    allowedFactIds: z.array(z.string()),
    requiredCaveats: z.array(z.string()),
    requiredWarningCodes: z.array(z.string()),
    guardrails: z.array(AnswerGuardrail),
    answerability: z.enum(['grounded', 'limited', 'not-supported']),
    request: z.object({
      topic: InterpretationTopic,
    }),
    disclaimers: z.array(z.string()),
  }),
  readingDraft: ReadingDraft,
});
export type ValidateAnswerInput = z.infer<typeof ValidateAnswerInput>;
