import { z } from 'zod';

/**
 * C-1 internal-only CareerRealityLayer clarification contract. It accepts
 * only user-confirmed reality facts, identifies missing core categories, and
 * emits fixed, non-inferred clarifying questions or a bounded
 * ready-for-composition marker. It never produces advice, personality or
 * psychological conclusions, predictions, traditional (BaZi) content, or a
 * user-visible complete answer; it never echoes the user's statement text.
 * Internal by design: deliberately not exported from the package index, not
 * wired into the CLI, Skill, engine entry, or bundle, and transient-only
 * (nothing here persists anything).
 */

export const CAREER_REALITY_CLARIFICATION_INPUT_VERSION = 'career-reality-clarification-input/v1';
export const CAREER_REALITY_CLARIFICATION_PLAN_VERSION = 'career-reality-clarification-plan/v1';

export type CareerRealityCategory =
  'current-role' | 'skills' | 'goals' | 'constraints' | 'preferences' | 'opportunities';

const CATEGORY_VALUES: readonly CareerRealityCategory[] = [
  'current-role',
  'skills',
  'goals',
  'constraints',
  'preferences',
  'opportunities',
];

/** Core categories that must be present before composition may start. */
const REQUIRED_CATEGORIES: readonly CareerRealityCategory[] = [
  'current-role',
  'skills',
  'goals',
  'constraints',
];

/** Fixed, non-inferred questions. One per missing core category, always identical. */
const CLARIFICATION_QUESTION_BY_CATEGORY: Record<CareerRealityCategory, string> = {
  'current-role': '你目前的角色或工作状态是什么？',
  skills: '你目前掌握哪些技能或专业经验？',
  goals: '你近期在职业上想达成的目标是什么？',
  constraints: '你现实中的约束条件有哪些（时间、地点、家庭、财务等）？',
  preferences: '你在工作中有哪些偏好或在意的事？',
  opportunities: '你目前看到了哪些现实机会或选项？',
};

const ALLOWED_REQUEST_SCOPES: readonly string[] = ['career-reflection', 'career-decision-support'];

export type CareerRealityClarificationErrorCode = 'OUT_OF_SCOPE_REQUEST' | 'INPUT_CONTRACT';

export class CareerRealityClarificationError extends Error {
  constructor(readonly code: CareerRealityClarificationErrorCode) {
    super(code);
    this.name = 'CareerRealityClarificationError';
  }
}

const CareerRealityFact = z
  .strictObject({
    factId: z.string().regex(/^career-fact:[a-z0-9][a-z0-9._-]*$/),
    source: z.literal('user-stated'),
    confirmedByUser: z.literal(true),
    category: z.enum(CATEGORY_VALUES as [CareerRealityCategory, ...CareerRealityCategory[]]),
    statement: z.string().min(1).max(500),
  })
  .strict();

const CareerRealityClarificationInput = z
  .strictObject({
    contractVersion: z.literal(CAREER_REALITY_CLARIFICATION_INPUT_VERSION),
    requestScope: z.string().min(1).max(64),
    confirmedFacts: z
      .array(CareerRealityFact)
      .max(24)
      .refine((facts) => new Set(facts.map((fact) => fact.factId)).size === facts.length, {
        message: 'fact ids must be unique',
      }),
    transient: z.literal(true),
    noPersistence: z.literal(true),
  })
  .strict();

export type CareerRealityClarificationInput = z.infer<typeof CareerRealityClarificationInput>;

export interface CareerRealityClarificationPlan {
  contractVersion: typeof CAREER_REALITY_CLARIFICATION_PLAN_VERSION;
  status: 'clarification-required' | 'ready-for-composition';
  requestScope: string;
  acceptedFactIds: string[];
  acceptedCategories: CareerRealityCategory[];
  missingCategories: CareerRealityCategory[];
  clarificationQuestions: string[];
  boundaryCodes: string[];
  transient: true;
  noPersistence: true;
}

/**
 * Evaluates the reality-clarification state for one bounded request. The
 * statement text is validated for shape and then dropped: the plan contains
 * only fact ids, categories, fixed questions, and status — never the user's
 * wording, never advice, never any inference from the statements.
 */
export function planCareerRealityClarification(rawInput: unknown): CareerRealityClarificationPlan {
  const parsed = CareerRealityClarificationInput.safeParse(rawInput);
  if (!parsed.success) {
    throw new CareerRealityClarificationError('INPUT_CONTRACT');
  }
  const input = parsed.data;
  if (!ALLOWED_REQUEST_SCOPES.includes(input.requestScope)) {
    throw new CareerRealityClarificationError('OUT_OF_SCOPE_REQUEST');
  }

  const acceptedCategories: CareerRealityCategory[] = [];
  for (const fact of input.confirmedFacts) {
    if (!acceptedCategories.includes(fact.category)) acceptedCategories.push(fact.category);
  }
  const missingCategories = REQUIRED_CATEGORIES.filter(
    (category) => !acceptedCategories.includes(category),
  );
  const status =
    missingCategories.length === 0 ? 'ready-for-composition' : 'clarification-required';

  return {
    contractVersion: CAREER_REALITY_CLARIFICATION_PLAN_VERSION,
    status,
    requestScope: input.requestScope,
    acceptedFactIds: input.confirmedFacts.map((fact) => fact.factId),
    acceptedCategories,
    missingCategories,
    clarificationQuestions: missingCategories.map(
      (category) => CLARIFICATION_QUESTION_BY_CATEGORY[category],
    ),
    boundaryCodes: [],
    transient: true,
    noPersistence: true,
  };
}
