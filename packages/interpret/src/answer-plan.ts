import {
  ANSWER_PLAN_CONTRACT_VERSION,
  PUBLIC_RESULT_CONTRACT_VERSION,
  AnswerPlan as AnswerPlanSchema,
  AnswerRequest as AnswerRequestSchema,
  PublicResult as PublicResultSchema,
} from '@ming/contracts';
import type {
  AnswerLens,
  AnswerPlan,
  ChartBundle,
  ChartSystem,
  EngineWarning,
  InterpretationFacts,
  InterpretationTopic,
  PublicFact,
  PublicResult,
  PublicWarning,
} from '@ming/contracts';

const SYSTEMS: ChartSystem[] = ['western', 'bazi', 'ziwei'];

const ANSWER_GUARDRAILS = [
  'traditional-culture-only',
  'evidence-only',
  'no-deterministic-fate',
  'no-medical-advice',
  'no-legal-advice',
  'no-investment-advice',
  'no-life-and-death-advice',
  'no-unsupported-comparison',
] as const;

/** Fixed public wording. Never pass provider warning.message/detail through this boundary. */
const PUBLIC_WARNING_COPY: Record<
  EngineWarning['code'],
  Pick<PublicWarning, 'impact' | 'nextStep'>
> = {
  TIME_ACCURACY_APPROXIMATE: {
    impact: '出生时间为约估，涉及时刻的结果可能变化。',
    nextStep: '如有条件，可补充更精确的出生时间后再次计算。',
  },
  TIME_UNKNOWN: {
    impact: '出生时间未知，依赖时刻的结果已受限或省略。',
    nextStep: '如能确认出生时间，可重新计算完整的时刻相关部分。',
  },
  DST_AMBIGUOUS_RESOLVED: {
    impact: '当地时间存在历史夏令时歧义，结果依赖已选择的处理方式。',
    nextStep: '如能确认当时采用的时间，可核对该选择。',
  },
  SOLAR_TIME_APPROXIMATE: {
    impact: '真太阳时使用了近似方法，边界附近的结果可能较敏感。',
    nextStep: '请把它视为传统文化分析中的不确定性说明。',
  },
  SYSTEM_NOT_YET_IMPLEMENTED: {
    impact: '有一个所需体系当前无法计算，结论范围已受限。',
    nextStep: '可查看已完成体系的依据，或等待该体系可用后重新计算。',
  },
  NEAR_BOUNDARY: {
    impact: '输入接近规则边界，部分结果对采用的边界规则敏感。',
    nextStep: '建议核对出生时间，并以不同规则的差异作为参考。',
  },
  HIGH_LATITUDE_HOUSE_RISK: {
    impact: '高纬度条件可能使部分宫位计算不稳定。',
    nextStep: '请谨慎解读宫位相关结论，并在需要时比较不同宫制。',
  },
  LUNAR_CONVERTED: {
    impact: '农历输入已按所选规则转换后计算。',
    nextStep: '如发现历法信息有误，请更正后重新计算。',
  },
  BAZI_GENDER_REQUIRED: {
    impact: '缺少规则所需信息，部分八字周期内容未计算。',
    nextStep: '补充所需规则信息后可重新计算该部分。',
  },
  ZIWEI_INPUT_REQUIRED: {
    impact: '缺少紫微所需信息，紫微部分未计算。',
    nextStep: '补充所需信息后可重新计算紫微部分。',
  },
  RULESET_VARIANT_DEFAULTED: {
    impact: '请求的规则变体不可用，已采用文档说明的默认规则。',
    nextStep: '请结合规则说明理解该差异，避免把它视为唯一答案。',
  },
};

/**
 * Facts are authored for the private technical interpretation path. This public
 * projection removes exact calendar dates and clock times wherever they appear
 * in free text, including a dynamic-chart target date supplied through --at.
 */
function sanitizePublicText(text: string): string {
  return text
    .replace(
      /\b\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g,
      '该目标日期',
    )
    .replace(/\b\d{4}年\d{1,2}月\d{1,2}日\b/g, '该目标日期')
    .replace(/\b(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\b/g, '该目标时刻');
}

/**
 * Convert private engine warnings into a stable, safe shape. Provider messages and
 * detail are intentionally discarded because they can echo dates, times or places.
 */
function toPublicWarnings(warnings: EngineWarning[]): PublicWarning[] {
  const seen = new Set<string>();
  const publicWarnings: PublicWarning[] = [];
  for (const warning of warnings) {
    const key = `${warning.code}:${warning.severity}:${warning.system}`;
    if (seen.has(key)) continue;
    seen.add(key);
    publicWarnings.push({
      code: warning.code,
      severity: warning.severity,
      system: warning.system,
      ...PUBLIC_WARNING_COPY[warning.code],
    });
  }
  return publicWarnings;
}

function toPublicFacts(interpretation: InterpretationFacts): PublicFact[] {
  return interpretation.facts.map((fact, index) => ({
    id: `fact-${index + 1}`,
    topic: fact.topic,
    claim: sanitizePublicText(fact.claim),
    evidence: fact.evidence.map((evidence) => ({
      kind: evidence.kind,
      ref: sanitizePublicText(evidence.ref),
    })),
    ...(fact.confidence === undefined ? {} : { confidence: fact.confidence }),
    ...(fact.caveat === undefined ? {} : { caveat: sanitizePublicText(fact.caveat) }),
    ...(fact.polarity === undefined ? {} : { polarity: fact.polarity }),
    ...(fact.reason === undefined ? {} : { reason: sanitizePublicText(fact.reason) }),
  }));
}

function systemStatuses(bundle: ChartBundle): PublicResult['systems'] {
  return SYSTEMS.map((system) => ({
    system,
    status: bundle[system] === undefined ? 'unavailable' : 'computed',
  }));
}

function dedupeStrings(values: Array<string | undefined>): string[] {
  return [
    ...new Set(values.filter((value): value is string => value !== undefined && value !== '')),
  ];
}

/**
 * Produce the default output for ordinary questions. This is a de-identified
 * answer context, not anonymous public data: the derived chart facts still need
 * user consent before a caller sends them to a remote model or service.
 */
export function buildPublicResult(
  bundle: ChartBundle,
  interpretation: InterpretationFacts,
  warnings: EngineWarning[] = bundle.warnings,
): PublicResult {
  return PublicResultSchema.parse({
    contractVersion: PUBLIC_RESULT_CONTRACT_VERSION,
    engineVersion: bundle.engineVersion,
    sourceSchemaVersion: bundle.schemaVersion,
    systems: systemStatuses(bundle),
    inputReliability: {
      timeAccuracy: bundle.originalInput.timeAccuracy,
      birthTimeKnown: bundle.originalInput.timeAccuracy !== 'unknown',
    },
    warnings: toPublicWarnings(warnings),
    facts: toPublicFacts(interpretation),
    rulesets: interpretation.rulesets,
    disclaimers: interpretation.disclaimers.map(sanitizePublicText),
    followupOffers: interpretation.followupOffers.map(sanitizePublicText),
  });
}

function selectFacts(facts: PublicFact[], topic: InterpretationTopic): PublicFact[] {
  if (topic === 'general') return facts;
  return facts.filter((fact) => fact.topic === topic);
}

const LIMITING_WARNING_CODES = new Set<PublicWarning['code']>([
  'TIME_ACCURACY_APPROXIMATE',
  'TIME_UNKNOWN',
  'DST_AMBIGUOUS_RESOLVED',
  'SOLAR_TIME_APPROXIMATE',
  'SYSTEM_NOT_YET_IMPLEMENTED',
  'NEAR_BOUNDARY',
  'HIGH_LATITUDE_HOUSE_RISK',
  'BAZI_GENDER_REQUIRED',
  'ZIWEI_INPUT_REQUIRED',
  'RULESET_VARIANT_DEFAULTED',
]);

function contentOrder(lens: AnswerLens): AnswerPlan['responseRequirements']['contentOrder'] {
  if (lens === 'explain') {
    return ['summary', 'technical-evidence', 'uncertainty', 'disclaimer'];
  }
  if (lens === 'timing') {
    return [
      'summary',
      'plain-language-explanation',
      'uncertainty',
      'practical-options',
      'technical-evidence',
      'disclaimer',
    ];
  }
  return [
    'summary',
    'plain-language-explanation',
    'practical-options',
    'uncertainty',
    'technical-evidence',
    'disclaimer',
  ];
}

/**
 * Select only the facts that may support one topic. This does not write prose;
 * a host model must cite only these ids and honor the included guardrails.
 */
export function buildAnswerPlan(
  publicResult: PublicResult,
  requestInput: { topic: InterpretationTopic; lens?: AnswerLens },
): AnswerPlan {
  const request = AnswerRequestSchema.parse(requestInput);
  const selectedFacts = selectFacts(publicResult.facts, request.topic);
  const hasUnavailableSystem = publicResult.systems.some(
    (system) => system.status === 'unavailable',
  );
  const hasLimitation =
    hasUnavailableSystem ||
    publicResult.inputReliability.timeAccuracy !== 'exact' ||
    publicResult.warnings.some(
      (warning) => warning.severity === 'warning' || LIMITING_WARNING_CODES.has(warning.code),
    );
  const answerability =
    selectedFacts.length === 0 ? 'not-supported' : hasLimitation ? 'limited' : 'grounded';
  const noEvidenceReason =
    selectedFacts.length === 0
      ? publicResult.inputReliability.birthTimeKnown
        ? 'NO_TOPIC_FACTS'
        : 'TIME_REQUIRED'
      : undefined;

  return AnswerPlanSchema.parse({
    contractVersion: ANSWER_PLAN_CONTRACT_VERSION,
    engineVersion: publicResult.engineVersion,
    sourceSchemaVersion: publicResult.sourceSchemaVersion,
    request,
    answerability,
    selectedFacts,
    allowedFactIds: selectedFacts.map((fact) => fact.id),
    requiredCaveats: dedupeStrings(selectedFacts.map((fact) => fact.caveat)),
    requiredWarningCodes: publicResult.warnings.map((warning) => warning.code),
    guardrails: ANSWER_GUARDRAILS,
    responseRequirements: {
      contentOrder: contentOrder(request.lens),
      citeSelectedFactIds: selectedFacts.map((fact) => fact.id),
      onlyUseSelectedFacts: true,
      explainInPlainLanguage: true,
      discloseRequiredWarnings: true,
    },
    ...(noEvidenceReason === undefined ? {} : { noEvidenceReason }),
    disclaimers: publicResult.disclaimers,
    followupOffers: publicResult.followupOffers,
  });
}
