import { z } from 'zod';

/** P1 bounds: contracts must remain safe before an instrument-specific schema exists. */
export const MAX_QUESTIONNAIRE_ANSWERS = 256;
export const MAX_CONTRACT_STRING_LENGTH = 512;
export const MAX_URL_LENGTH = 2048;

const StableId = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const InstrumentId = z.string().regex(/^[a-z][a-z0-9-]*@[a-z0-9][a-z0-9.-]{0,63}$/);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/i);
const BoundedText = z.string().min(1).max(MAX_CONTRACT_STRING_LENGTH);

/** Capability names are internal P1 routing ids, not a public command surface. */
export const PsychologyCapability = z.enum([
  'psychology-informed-narration',
  'personality-self-assessment',
  'mental-health-screening',
]);
export type PsychologyCapability = z.infer<typeof PsychologyCapability>;

/** Immutable identity and provenance required before an instrument may be scored. */
export const InstrumentRef = z.strictObject({
  id: InstrumentId,
  version: BoundedText,
  language: z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/),
  itemSetSha256: Sha256,
  scoringVersion: BoundedText,
  sourceUrl: z.string().url().max(MAX_URL_LENGTH),
  licenseRef: BoundedText,
});
export type InstrumentRef = z.infer<typeof InstrumentRef>;

/** Consent is scoped and versioned; it contains no host identity or raw answers. */
export const ConsentReceipt = z.strictObject({
  scope: z.enum(['personality', 'mental-health-screening', 'remote-summary']),
  granted: z.literal(true),
  noticeVersion: BoundedText,
});
export type ConsentReceipt = z.infer<typeof ConsentReceipt>;

const QuestionnaireAnswer = z.strictObject({
  itemId: StableId,
  response: z.number().int().min(0).max(7),
});
export type QuestionnaireAnswer = z.infer<typeof QuestionnaireAnswer>;

/**
 * Private session record. It deliberately references item ids only: item text, free text,
 * birth data, names, locations and contact fields have no representable slot.
 */
export const QuestionnaireSession = z
  .strictObject({
    contractVersion: z.literal('questionnaire-session/v1'),
    instrument: InstrumentRef,
    consent: ConsentReceipt,
    status: z.enum(['in-progress', 'completed', 'cancelled']),
    answers: z.array(QuestionnaireAnswer).max(MAX_QUESTIONNAIRE_ANSWERS),
  })
  .superRefine((session, ctx) => {
    const seen = new Set<string>();
    for (const [index, answer] of session.answers.entries()) {
      if (seen.has(answer.itemId)) {
        ctx.addIssue({
          code: 'custom',
          message: 'duplicate questionnaire item id',
          path: ['answers', index, 'itemId'],
        });
      }
      seen.add(answer.itemId);
    }
  });
export type QuestionnaireSession = z.infer<typeof QuestionnaireSession>;

const AggregateScore = z.strictObject({
  id: StableId,
  score: z.number().finite().min(-10_000).max(10_000),
});

/** De-identified aggregate self-report evidence eligible for a future explicit opt-in. */
export const PersonalityProfile = z.strictObject({
  contractVersion: z.literal('personality-profile/v1'),
  instrument: InstrumentRef,
  completeness: z.number().min(0).max(1),
  domains: z.array(AggregateScore).max(16),
  facets: z.array(AggregateScore).max(64),
  qualityFlags: z.array(StableId).max(16),
  selfReportNotDiagnosis: z.literal(true),
  normRef: BoundedText.optional(),
});
export type PersonalityProfile = z.infer<typeof PersonalityProfile>;

/** Future clinical output is isolated from charts and self-report profile contracts. */
export const MentalHealthScreeningResult = z.strictObject({
  contractVersion: z.literal('mental-health-screening-result/v1'),
  instrument: InstrumentRef,
  recallPeriod: BoundedText,
  complete: z.boolean(),
  score: z.number().int().min(0).max(10_000).optional(),
  category: BoundedText.optional(),
  screeningNotDiagnosis: z.literal(true),
  safetyState: z.enum(['routine', 'elevated', 'urgent-review', 'immediate-danger']),
  nextActionIds: z.array(StableId).min(1).max(8),
});
export type MentalHealthScreeningResult = z.infer<typeof MentalHealthScreeningResult>;

/** P1 provider/orchestrator response: intentionally no score, item, questionnaire or chart data. */
export const PsychologyNotImplementedResult = z.strictObject({
  contractVersion: z.literal('psychology-capability/v1'),
  capability: PsychologyCapability,
  status: z.literal('not-implemented'),
  reason: z.literal('P1_SKELETON_ONLY'),
});
export type PsychologyNotImplementedResult = z.infer<typeof PsychologyNotImplementedResult>;

export function psychologyNotImplemented(
  capability: PsychologyCapability,
): PsychologyNotImplementedResult {
  return PsychologyNotImplementedResult.parse({
    contractVersion: 'psychology-capability/v1',
    capability,
    status: 'not-implemented',
    reason: 'P1_SKELETON_ONLY',
  });
}
