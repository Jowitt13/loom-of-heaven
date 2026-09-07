import { z } from 'zod';

/**
 * C-2 internal-only CareerRealityLayer composition contract. It consumes a
 * ready-for-composition plan from the C-1 clarification contract and binds
 * composition units exclusively to the fact ids that plan accepted. The
 * record is a text-free skeleton: no prose, no advice, no action plans, no
 * questionnaire content, no traditional (BaZi) content, no clinical or
 * psychological content, no claim text of any kind. `structure-bound` means
 * only that the structural bindings are valid — never that any advice is
 * valid, that any career match exists, or that any user outcome follows.
 * Internal by design: deliberately not exported from the package index, not
 * wired into the CLI, Skill, engine entry, or bundle, and transient-only.
 */

export const CAREER_COMPOSITION_CONTRACT_VERSION = 'career-composition/v1';

export type CareerCompositionErrorCode = 'CONTRACT_INVALID' | 'UNBOUND_FACT_REFERENCE';

export class CareerCompositionError extends Error {
  constructor(readonly code: CareerCompositionErrorCode) {
    super(code);
    this.name = 'CareerCompositionError';
  }
}

const FACT_ID_PATTERN = /^career-fact:[a-z0-9][a-z0-9._-]*$/;

const CAREER_REALITY_CATEGORY_VALUES = [
  'current-role',
  'skills',
  'goals',
  'constraints',
  'preferences',
  'opportunities',
] as const;

/**
 * Mirror of the C-1 clarification plan shape, restricted to the only state
 * this contract accepts: ready-for-composition, nothing missing, no open
 * boundary codes. Kept local so the C-1 module surface stays unchanged.
 */
const ReadyClarificationPlan = z
  .strictObject({
    contractVersion: z.literal('career-reality-clarification-plan/v1'),
    status: z.literal('ready-for-composition'),
    requestScope: z.string().min(1).max(64),
    acceptedFactIds: z.array(z.string().regex(FACT_ID_PATTERN)).min(1).max(24),
    acceptedCategories: z
      .array(z.enum(CAREER_REALITY_CATEGORY_VALUES as unknown as [string, ...string[]]))
      .min(4)
      .max(6),
    missingCategories: z.array(z.string()).max(0),
    clarificationQuestions: z.array(z.string()).max(0),
    boundaryCodes: z.array(z.string()).max(0),
    transient: z.literal(true),
    noPersistence: z.literal(true),
  })
  .strict();

const CompositionUnitInput = z
  .strictObject({
    unitId: z.string().regex(/^composition-unit:[a-z0-9][a-z0-9._-]*$/),
    // v1 admits exactly one layer. traditional-structure, career-reflection,
    // and clinical-assessment units are rejected outright.
    layer: z.literal('career-reality'),
    contentIntent: z.enum(['reflection-question', 'decision-framework', 'action-experiment']),
    factIds: z
      .array(z.string().regex(FACT_ID_PATTERN))
      .min(1)
      .max(12)
      .refine((ids) => new Set(ids).size === ids.length, { message: 'fact ids must be unique' }),
    // Explicit boundary marker every unit must carry: the unit rests only on
    // user-stated reality and constitutes neither prediction nor diagnosis.
    boundaryRef: z.literal('user-stated-only'),
  })
  .strict();

const CareerCompositionInput = z
  .strictObject({
    clarificationPlan: ReadyClarificationPlan,
    units: z
      .array(CompositionUnitInput)
      .min(1)
      .max(20)
      .refine((units) => new Set(units.map((unit) => unit.unitId)).size === units.length, {
        message: 'unit ids must be unique',
      }),
  })
  .strict();

export type CareerCompositionInput = z.infer<typeof CareerCompositionInput>;

const CareerCompositionRecord = z
  .strictObject({
    contractVersion: z.literal(CAREER_COMPOSITION_CONTRACT_VERSION),
    sourcePlan: z.strictObject({
      contractVersion: z.literal('career-reality-clarification-plan/v1'),
      requestScope: z.string(),
      acceptedFactIds: z.array(z.string()),
    }),
    units: z
      .array(
        z.strictObject({
          unitId: z.string(),
          layer: z.literal('career-reality'),
          contentIntent: z.enum(['reflection-question', 'decision-framework', 'action-experiment']),
          factIds: z.array(z.string()).min(1),
          boundaryRef: z.literal('user-stated-only'),
        }),
      )
      .min(1),
    status: z.literal('structure-bound'),
    transient: z.literal(true),
    noPersistence: z.literal(true),
  })
  .strict();

export type CareerCompositionRecord = z.infer<typeof CareerCompositionRecord>;

/**
 * Builds the text-free composition skeleton from one ready clarification
 * plan. Every unit fact id must resolve to the plan's accepted fact ids —
 * those ids are the only admissible reality provenance. The result is
 * deterministic: identical input yields a byte-identical canonical record.
 */
export function composeCareerUnits(rawInput: unknown): CareerCompositionRecord {
  const parsed = CareerCompositionInput.safeParse(rawInput);
  if (!parsed.success) {
    throw new CareerCompositionError('CONTRACT_INVALID');
  }
  const { clarificationPlan, units } = parsed.data;

  const admissibleFactIds = new Set(clarificationPlan.acceptedFactIds);
  for (const unit of units) {
    for (const factId of unit.factIds) {
      if (!admissibleFactIds.has(factId)) {
        throw new CareerCompositionError('UNBOUND_FACT_REFERENCE');
      }
    }
  }

  const record = {
    contractVersion: CAREER_COMPOSITION_CONTRACT_VERSION,
    sourcePlan: {
      contractVersion: clarificationPlan.contractVersion,
      requestScope: clarificationPlan.requestScope,
      acceptedFactIds: [...clarificationPlan.acceptedFactIds],
    },
    units: units.map((unit) => ({
      unitId: unit.unitId,
      layer: unit.layer,
      contentIntent: unit.contentIntent,
      factIds: [...new Set(unit.factIds)].sort(),
      boundaryRef: unit.boundaryRef,
    })),
    status: 'structure-bound',
    transient: true,
    noPersistence: true,
  } as CareerCompositionRecord;

  return CareerCompositionRecord.parse(record);
}
