import { z } from 'zod';
import { ChartSystem, TimeAccuracy } from './birth-input.ts';
import { RulesetRef } from './provenance.ts';
import {
  InterpretationEvidence,
  InterpretationFact,
  InterpretationTopic,
} from './interpretation.ts';
import { EngineWarning } from './warnings.ts';

/**
 * Versioned, share-safe output contracts for ordinary user questions. These are
 * deliberately separate from ChartBundle: the latter is a private technical
 * record and can contain the original birth input and reproducibility metadata.
 */
export const PUBLIC_RESULT_CONTRACT_VERSION = 'public-result/v1';
export const ANSWER_PLAN_CONTRACT_VERSION = 'answer-plan/v1';

/**
 * A warning stripped of raw messages and arbitrary detail supplied by providers.
 * `impact` and `nextStep` come from a fixed, versioned public-copy table; they
 * never interpolate a user's supplied date, time, location or provider detail.
 */
export const PublicWarning = EngineWarning.pick({
  code: true,
  severity: true,
  system: true,
})
  .extend({
    impact: z.string().min(1),
    nextStep: z.string().min(1),
  })
  .strict();
export type PublicWarning = z.infer<typeof PublicWarning>;

/** Evidence reference safe to hand to a host model; raw evidence notes are private. */
export const PublicEvidence = InterpretationEvidence.pick({
  kind: true,
  ref: true,
}).strict();
export type PublicEvidence = z.infer<typeof PublicEvidence>;

/** A de-identified fact with a plan-local id for traceable answer citations. */
export const PublicFact = InterpretationFact.pick({
  topic: true,
  claim: true,
  confidence: true,
  caveat: true,
  polarity: true,
  reason: true,
})
  .extend({
    id: z.string().regex(/^fact-\d+$/, 'fact ids must use the fact-<number> form'),
    evidence: z.array(PublicEvidence).min(1),
  })
  .strict();
export type PublicFact = z.infer<typeof PublicFact>;

export const PublicSystemStatus = z.strictObject({
  system: ChartSystem,
  status: z.enum(['computed', 'unavailable']),
});
export type PublicSystemStatus = z.infer<typeof PublicSystemStatus>;

/**
 * Safe, topic-scoped default result for UI, web and host-model use. It intentionally omits
 * originalInput, requestId, calculatedAt, normalized timestamps, timezone,
 * calendar, coordinates, free-text locations and raw warning/evidence detail.
 */
export const PublicResult = z.strictObject({
  contractVersion: z.literal(PUBLIC_RESULT_CONTRACT_VERSION),
  engineVersion: z.string(),
  sourceSchemaVersion: z.string(),
  systems: z.array(PublicSystemStatus).length(3),
  inputReliability: z.strictObject({
    timeAccuracy: TimeAccuracy,
    birthTimeKnown: z.boolean(),
  }),
  warnings: z.array(PublicWarning),
  facts: z.array(PublicFact),
  rulesets: z.array(RulesetRef),
  disclaimers: z.array(z.string()),
  followupOffers: z.array(z.string()),
});
export type PublicResult = z.infer<typeof PublicResult>;

/** The bounded perspective a host may use when turning facts into an answer. */
export const AnswerLens = z.enum(['overview', 'strengths', 'risks', 'timing', 'advice', 'explain']);
export type AnswerLens = z.infer<typeof AnswerLens>;

export const Answerability = z.enum(['grounded', 'limited', 'not-supported']);
export type Answerability = z.infer<typeof Answerability>;

export const AnswerSection = z.enum([
  'summary',
  'plain-language-explanation',
  'uncertainty',
  'practical-options',
  'technical-evidence',
  'disclaimer',
]);
export type AnswerSection = z.infer<typeof AnswerSection>;

export const AnswerGuardrail = z.enum([
  'traditional-culture-only',
  'evidence-only',
  'no-deterministic-fate',
  'no-medical-advice',
  'no-legal-advice',
  'no-investment-advice',
  'no-life-and-death-advice',
  'no-unsupported-comparison',
]);
export type AnswerGuardrail = z.infer<typeof AnswerGuardrail>;

/** Deliberately bounded engine input; free-form user questions never enter this contract. */
export const AnswerRequest = z.strictObject({
  topic: InterpretationTopic,
  lens: AnswerLens.default('overview'),
});
export type AnswerRequest = z.infer<typeof AnswerRequest>;

/**
 * The only facts a host model may use for one answer. It contains no raw user
 * question; the host maps a question to a bounded topic before invoking it.
 */
export const AnswerPlan = z.strictObject({
  contractVersion: z.literal(ANSWER_PLAN_CONTRACT_VERSION),
  engineVersion: z.string(),
  sourceSchemaVersion: z.string(),
  request: AnswerRequest,
  answerability: Answerability,
  selectedFacts: z.array(PublicFact),
  allowedFactIds: z.array(z.string()),
  requiredCaveats: z.array(z.string()),
  requiredWarningCodes: z.array(PublicWarning.shape.code),
  guardrails: z.array(AnswerGuardrail).min(1),
  responseRequirements: z.strictObject({
    contentOrder: z.array(AnswerSection).min(1),
    citeSelectedFactIds: z.array(z.string()),
    onlyUseSelectedFacts: z.literal(true),
    explainInPlainLanguage: z.literal(true),
    discloseRequiredWarnings: z.literal(true),
  }),
  noEvidenceReason: z.enum(['NO_TOPIC_FACTS', 'TIME_REQUIRED', 'INPUT_REQUIRED']).optional(),
  disclaimers: z.array(z.string()),
  followupOffers: z.array(z.string()),
});
export type AnswerPlan = z.infer<typeof AnswerPlan>;
