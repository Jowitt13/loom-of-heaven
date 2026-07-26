import { z } from 'zod';
import { InterpretationTopic } from './interpretation.ts';
import { AnswerGuardrail } from './answer-plan.ts';

/**
 * validate-answer — fact-boundary and safety layer contracts (P0).
 *
 * This is deliberately separate from lint-reading (language quality).
 * It is a DETERMINISTIC STRUCTURE-AND-WORDING GATE over a host's ReadingDraft:
 * 1. Every non-exempt paragraph must declare sourceFactIds that exist in allowedFactIds.
 * 2. The draft must not cross topic boundaries.
 * 3. High-risk expression patterns (medical, legal, investment, fate, life-death,
 *    manipulation) are blocked in ALL sections, including exempt ones.
 * 4. All required caveats and warnings must be claimed as expressed/disclosed.
 *
 * Honest scope: citation presence is a structural check — it CANNOT prove that a
 * paragraph's meaning actually follows from the cited facts, and the pattern scan
 * CANNOT recognize every semantic paraphrase. This gate is necessary, not sufficient.
 */

export const READING_DRAFT_CONTRACT_VERSION = 'reading-draft/v1';
export const VALIDATION_RESULT_CONTRACT_VERSION = 'validation-result/v1';

// --- Protective resource limits (anti-resource-exhaustion) ---
// Rationale: the validator runs bounded regex scans over every paragraph; these caps
// keep worst-case scan cost linear and small, and reject absurd drafts up front.
// A real reading is a handful of sections with a few short paragraphs each — the
// limits below are an order of magnitude above legitimate use.

/** Max characters in a single paragraph text (regex scan cost per paragraph stays bounded). */
export const MAX_PARAGRAPH_TEXT_CHARS = 5_000;
/** Max sections in one draft (a real reading uses ~5–10 sections). */
export const MAX_SECTIONS = 40;
/** Max paragraphs per section (a real section uses a handful). */
export const MAX_PARAGRAPHS_PER_SECTION = 50;
/** Max fact IDs cited by a single paragraph (plans expose far fewer facts than this). */
export const MAX_SOURCE_FACT_IDS_PER_PARAGRAPH = 50;
/** Max characters in a single fact ID (engine fact IDs are short slugs). */
export const MAX_FACT_ID_CHARS = 200;
/** Max entries in caveatsExpressed (plans require only a few caveats). */
export const MAX_CAVEATS_EXPRESSED = 100;
/** Max characters per caveatsExpressed entry (a caveat is a sentence, not an essay). */
export const MAX_CAVEAT_ENTRY_CHARS = 500;
/** Max entries in warningsDisclosed (warning codes are a small closed set). */
export const MAX_WARNINGS_DISCLOSED = 100;
/** Max characters per warningsDisclosed entry (warning codes are short identifiers). */
export const MAX_WARNING_ENTRY_CHARS = 100;
/** Max characters in a section id (section ids are short slugs). */
export const MAX_SECTION_ID_CHARS = 100;
/** Max characters in a section heading (headings are one line). */
export const MAX_HEADING_CHARS = 200;
/** Max total characters across all paragraph texts + headings (whole-draft budget). */
export const MAX_TOTAL_TEXT_CHARS = 200_000;

/** A single paragraph within a reading section. */
export const ReadingParagraph = z.strictObject({
  text: z.string().min(1).max(MAX_PARAGRAPH_TEXT_CHARS),
  /** Fact IDs from the AnswerPlan that ground this paragraph. */
  sourceFactIds: z.array(z.string().max(MAX_FACT_ID_CHARS)).max(MAX_SOURCE_FACT_IDS_PER_PARAGRAPH),
});
export type ReadingParagraph = z.infer<typeof ReadingParagraph>;

/** A section in the structured reading draft. */
export const ReadingSection = z.strictObject({
  id: z.string().min(1).max(MAX_SECTION_ID_CHARS),
  heading: z.string().max(MAX_HEADING_CHARS),
  paragraphs: z.array(ReadingParagraph).min(1).max(MAX_PARAGRAPHS_PER_SECTION),
});
export type ReadingSection = z.infer<typeof ReadingSection>;

/**
 * Structured draft produced by a host/LLM before final rendering.
 * Every visible content paragraph must cite sourceFactIds.
 */
export const ReadingDraft = z
  .strictObject({
    contractVersion: z.literal(READING_DRAFT_CONTRACT_VERSION),
    topic: InterpretationTopic,
    sections: z.array(ReadingSection).min(1).max(MAX_SECTIONS),
    /** Which requiredCaveats (from AnswerPlan) the host claims to have expressed. */
    caveatsExpressed: z.array(z.string().max(MAX_CAVEAT_ENTRY_CHARS)).max(MAX_CAVEATS_EXPRESSED),
    /** Which requiredWarningCodes the host claims to have disclosed. */
    warningsDisclosed: z.array(z.string().max(MAX_WARNING_ENTRY_CHARS)).max(MAX_WARNINGS_DISCLOSED),
  })
  .superRefine((draft, ctx) => {
    let total = 0;
    for (const section of draft.sections) {
      total += section.heading.length;
      for (const para of section.paragraphs) total += para.text.length;
    }
    if (total > MAX_TOTAL_TEXT_CHARS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sections'],
        message: `Total draft text exceeds MAX_TOTAL_TEXT_CHARS (${MAX_TOTAL_TEXT_CHARS}).`,
      });
    }
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
  // Reserved: not currently emitted. Mapping answerPlan.guardrails to checks without
  // changing the public AnswerPlan contract is a follow-up design item; we do not
  // fabricate a fake guardrail validation just to "use" this code.
  'GUARDRAIL_VIOLATED',

  // Resource-boundary violations
  'RESOURCE_LIMIT_EXCEEDED', // draft exceeds a protective resource limit
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
  /**
   * Structured category/pattern key (e.g. "medical/2" for a high-risk pattern hit,
   * or a resource-limit constant name like "MAX_TOTAL_TEXT_CHARS").
   * This — never raw draft text — is how a hit is identified.
   */
  patternKey: z.string().optional(),
  /**
   * Index of the offending item in the relevant array, keyed by `code`:
   * UNKNOWN_FACT_ID → paragraph.sourceFactIds; MISSING_REQUIRED_CAVEAT →
   * answerPlan.requiredCaveats; MISSING_REQUIRED_WARNING → answerPlan.requiredWarningCodes.
   */
  itemIndex: z.number().int().min(0).optional(),
  /**
   * Human-readable description of what went wrong. Static wording only — MUST NOT
   * embed draft text, caveat text, warning codes, or any other input fragments.
   */
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
