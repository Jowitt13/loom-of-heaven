import { z } from 'zod';
import { InterpretationTopic } from './interpretation.ts';
import { AnswerGuardrail } from './answer-plan.ts';

/**
 * validate-answer — fact-boundary and safety layer contracts (P0).
 *
 * This is deliberately separate from lint-reading (language quality).
 * It is a DETERMINISTIC STRUCTURE-AND-WORDING GATE over a host's ReadingDraft:
 * 1. Every paragraph outside the minimal fact-exempt sections must declare
 *    sourceFactIds that exist in allowedFactIds.
 * 2. The draft must not cross topic boundaries.
 * 3. High-risk expression patterns (medical, legal, investment, fate, life-death,
 *    manipulation) are blocked in ALL visible text: every heading and every
 *    paragraph of every section, with no section-id exemption.
 * 4. All required caveats and warnings must be claimed as expressed/disclosed.
 *
 * Honest scope: citation presence is a structural check — it CANNOT prove that a
 * paragraph's meaning actually follows from the cited facts, and the pattern scan
 * CANNOT recognize every semantic paraphrase. This gate is necessary, not sufficient.
 *
 * Contract versioning:
 * - `reading-draft/v2` is the ONLY runtime-accepted draft version. Legacy
 *   `reading-draft/v1` is REJECTED at runtime (an intentional breaking change for
 *   the next release, v0.2.0): accepting caller-selected v1 would let input data
 *   re-enable the removed section-id fact exemption. Migration is a documented
 *   path, not a runtime downgrade: add `constraintRefs` to constraint-expressing
 *   paragraphs and switch the version string (see references/answer-contract.md).
 * - `validation-result/v2` replaces v1: violations locate by `sectionIndex`
 *   (never the caller-provided section id), add `field`, `patternKey`, `itemIndex`,
 *   and the result adds `violationsTruncated`. v1 result consumers must migrate:
 *   read `sectionIndex` instead of the removed `sectionId`.
 */

export const READING_DRAFT_CONTRACT_VERSION = 'reading-draft/v2';
/** Legacy version string — rejected at runtime; kept only for docs/diagnostics. */
export const READING_DRAFT_LEGACY_V1 = 'reading-draft/v1';
export const VALIDATION_RESULT_CONTRACT_VERSION = 'validation-result/v2';

// --- Protective resource limits ---
// Rationale: the validator runs bounded regex scans over every heading and
// paragraph; these caps keep worst-case VALIDATION-STAGE cost linear and small,
// and reject absurd inputs before scanning. They do NOT bound what a caller
// spends reading or JSON-parsing a file before validation. The bare Zod schemas
// below EXPRESS the contract but are not themselves fail-fast against an
// arbitrarily large in-memory object; use `parseValidateAnswerInputBounded`
// (from @ming/interpret) for bounded parsing, and the CLI additionally enforces
// MAX_VALIDATE_ANSWER_INPUT_BYTES on the input file before reading it. A real
// reading is a handful of sections with a few short paragraphs each — the
// limits below are an order of magnitude above legitimate use.

/** Max input-file size in bytes for the CLI `validate-answer` command (stat before read). */
export const MAX_VALIDATE_ANSWER_INPUT_BYTES = 2_097_152;

/** Max own keys on any object level of the input (known schemas use < 10 keys). */
export const MAX_OBJECT_KEYS = 32;
/** Max characters per object key (schema key names are short ASCII identifiers). */
export const MAX_OBJECT_KEY_CHARS = 64;

/** Max characters in a single paragraph text (regex scan cost per paragraph stays bounded). */
export const MAX_PARAGRAPH_TEXT_CHARS = 5_000;
/** Max sections in one draft (a real reading uses ~5–10 sections). */
export const MAX_SECTIONS = 40;
/** Max paragraphs per section (a real section uses a handful). */
export const MAX_PARAGRAPHS_PER_SECTION = 50;
/** Max fact IDs cited by a single paragraph (plans expose far fewer facts than this). */
export const MAX_SOURCE_FACT_IDS_PER_PARAGRAPH = 50;
/** Max plan-constraint references on a single paragraph (a paragraph expresses a few). */
export const MAX_CONSTRAINT_REFS_PER_PARAGRAPH = 10;
/** Max fact IDs cited across the whole draft (bounds set-lookup and violation volume). */
export const MAX_TOTAL_SOURCE_FACT_IDS = 1_000;
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

// Plan-side limits (the validator also reads these arrays; cap them the same way).

/** Max allowedFactIds in the plan envelope (real plans expose dozens of facts). */
export const MAX_ALLOWED_FACT_IDS = 500;
/** Max requiredCaveats in the plan envelope. */
export const MAX_REQUIRED_CAVEATS = 100;
/** Max requiredWarningCodes in the plan envelope. */
export const MAX_REQUIRED_WARNING_CODES = 100;
/** Max disclaimers in the plan envelope. */
export const MAX_PLAN_DISCLAIMERS = 100;
/** Max characters per plan disclaimer entry. */
export const MAX_DISCLAIMER_ENTRY_CHARS = 500;
/** Max guardrails in the plan envelope (the guardrail enum is tiny). */
export const MAX_PLAN_GUARDRAILS = 50;

// Output-side limit.

/**
 * Max violations reported in one result. Prevents a crafted draft (e.g. hundreds
 * of unknown fact IDs) from amplifying the validator's own output; when hit,
 * `violationsTruncated` is set and the result is already conclusively not-ok.
 */
export const MAX_VIOLATIONS = 200;

/**
 * When answerability is `not-supported`, the draft may only briefly explain the
 * limitation — this caps the total paragraph text allowed in that mode, so
 * substantive content cannot hide under any section id.
 */
export const MAX_NOT_SUPPORTED_TEXT_CHARS = 500;

/** Which AnswerPlan constraint array a paragraph reference points into. */
export const PlanConstraintKind = z.enum(['disclaimer', 'caveat', 'warning']);
export type PlanConstraintKind = z.infer<typeof PlanConstraintKind>;

/**
 * Structured reference from a draft paragraph to a REAL AnswerPlan constraint:
 * kind selects the plan array (disclaimer → answerPlan.disclaimers, caveat →
 * requiredCaveats, warning → requiredWarningCodes) and index locates the entry.
 * Only paragraphs whose references all resolve are fact-exempt in v2 — a free
 * section id never grants exemption.
 */
export const PlanConstraintRef = z.strictObject({
  kind: PlanConstraintKind,
  index: z.number().int().min(0),
});
export type PlanConstraintRef = z.infer<typeof PlanConstraintRef>;

/** A single paragraph within a reading section. */
export const ReadingParagraph = z.strictObject({
  text: z.string().min(1).max(MAX_PARAGRAPH_TEXT_CHARS),
  /** Fact IDs from the AnswerPlan that ground this paragraph. */
  sourceFactIds: z.array(z.string().max(MAX_FACT_ID_CHARS)).max(MAX_SOURCE_FACT_IDS_PER_PARAGRAPH),
  /**
   * Present when this paragraph expresses AnswerPlan constraints (disclaimers /
   * caveats / warnings) instead of new factual claims; such paragraphs are
   * fact-exempt only when every reference resolves to a real plan entry.
   */
  constraintRefs: z.array(PlanConstraintRef).max(MAX_CONSTRAINT_REFS_PER_PARAGRAPH).optional(),
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
    let totalText = 0;
    let totalFactIds = 0;
    for (const section of draft.sections) {
      totalText += section.heading.length;
      for (const para of section.paragraphs) {
        totalText += para.text.length;
        totalFactIds += para.sourceFactIds.length;
      }
    }
    if (totalText > MAX_TOTAL_TEXT_CHARS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sections'],
        message: `Total draft text exceeds MAX_TOTAL_TEXT_CHARS (${MAX_TOTAL_TEXT_CHARS}).`,
      });
    }
    if (totalFactIds > MAX_TOTAL_SOURCE_FACT_IDS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sections'],
        message: `Total sourceFactIds exceed MAX_TOTAL_SOURCE_FACT_IDS (${MAX_TOTAL_SOURCE_FACT_IDS}).`,
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

  // Constraint-reference violations (v2)
  'INVALID_CONSTRAINT_REF', // a constraintRef does not resolve to a real plan entry
  'CONSTRAINT_ATTESTATION_MISMATCH', // caveatsExpressed/warningsDisclosed disagree with constraintRefs

  // Contract-version violations
  'UNSUPPORTED_CONTRACT_VERSION', // readingDraft.contractVersion is not an accepted version

  // Input-shape violations (public entry rejects unparseable raw input)
  'MALFORMED_INPUT', // input failed the bounded parse / runtime schema validation

  // Guardrail violations
  // Reserved: not currently emitted. Mapping answerPlan.guardrails to checks without
  // changing the public AnswerPlan contract is a follow-up design item; we do not
  // fabricate a fake guardrail validation just to "use" this code.
  'GUARDRAIL_VIOLATED',

  // Resource-boundary violations
  'RESOURCE_LIMIT_EXCEEDED', // input exceeds a protective resource limit
]);
export type ViolationCode = z.infer<typeof ViolationCode>;

export const ViolationSeverity = z.enum(['error', 'warning']);
export type ViolationSeverity = z.infer<typeof ViolationSeverity>;

/** Which text field of the located section the violation was found in. */
export const ViolationField = z.enum(['heading', 'paragraph']);
export type ViolationField = z.infer<typeof ViolationField>;

export const AnswerViolation = z.strictObject({
  code: ViolationCode,
  severity: ViolationSeverity,
  /**
   * Zero-based index of the section in readingDraft.sections, if applicable.
   * Deliberately an index — the caller-provided section id is never echoed
   * (ids are unbounded caller text and may repeat).
   */
  sectionIndex: z.number().int().min(0).optional(),
  /** Which text field of that section was hit, if applicable. */
  field: ViolationField.optional(),
  /** Which paragraph index within the section, if applicable. */
  paragraphIndex: z.number().int().min(0).optional(),
  /**
   * Stable rule/limit identifier (e.g. "medical.medication-change" for a
   * high-risk rule hit, or a resource-limit constant name like
   * "MAX_TOTAL_TEXT_CHARS"). Never raw input text, never a bare array index.
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
   * embed draft text, section ids, caveat text, warning codes, or any other input.
   */
  detail: z.string().min(1),
  /** Actionable remediation guidance. */
  remediation: z.string().min(1),
});
export type AnswerViolation = z.infer<typeof AnswerViolation>;

export const AnswerValidationResult = z.strictObject({
  contractVersion: z.literal(VALIDATION_RESULT_CONTRACT_VERSION),
  ok: z.boolean(),
  violations: z.array(AnswerViolation).max(MAX_VIOLATIONS),
  /** True when reporting stopped at MAX_VIOLATIONS (result is conclusively not-ok). */
  violationsTruncated: z.boolean(),
});
export type AnswerValidationResult = z.infer<typeof AnswerValidationResult>;

/**
 * The input envelope for validate-answer: an AnswerPlan + a ReadingDraft.
 * The validator checks the draft against the plan's constraints. The plan-side
 * arrays carry the same protective caps as the draft (the validator iterates them).
 */
export const ValidateAnswerInput = z.strictObject({
  answerPlan: z.object({
    allowedFactIds: z.array(z.string().max(MAX_FACT_ID_CHARS)).max(MAX_ALLOWED_FACT_IDS),
    requiredCaveats: z.array(z.string().max(MAX_CAVEAT_ENTRY_CHARS)).max(MAX_REQUIRED_CAVEATS),
    requiredWarningCodes: z
      .array(z.string().max(MAX_WARNING_ENTRY_CHARS))
      .max(MAX_REQUIRED_WARNING_CODES),
    guardrails: z.array(AnswerGuardrail).max(MAX_PLAN_GUARDRAILS),
    answerability: z.enum(['grounded', 'limited', 'not-supported']),
    request: z.object({
      topic: InterpretationTopic,
    }),
    disclaimers: z.array(z.string().max(MAX_DISCLAIMER_ENTRY_CHARS)).max(MAX_PLAN_DISCLAIMERS),
  }),
  readingDraft: ReadingDraft,
});
export type ValidateAnswerInput = z.infer<typeof ValidateAnswerInput>;
