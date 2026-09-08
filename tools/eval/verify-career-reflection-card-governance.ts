import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * C-4C card content governance verifier (pure functions; no fs, no network,
 * no CLI, no runtime imports). It fail-closes on: governance identity or
 * classification drift, archetype set/order drift, unknown archetypes or
 * prompt acts, injected score/match/label/recommendation/clinical/bazi/
 * prediction/text-payload fields, consent delegation drift, and any drift of
 * the underlying C-4B admission record toward items-defined, runtime-ready,
 * or IQ-4-unblocked states.
 */

const GOVERNANCE_ID = 'career-reflection-card-governance/v1';
const ADMISSION_ID = 'career-reflection-admission/v1';
const TOOL_ID = 'career-reflection-cards';
const TOOL_VERSION = 'v1';
const CONTENT_STATE = 'no-items-defined';

const ARCHETYPE_IDS = [
  'reality-inventory',
  'decision-criteria',
  'tradeoff-review',
  'evidence-check',
  'reversible-action-plan',
  'review-checkpoint',
] as const;

const CATEGORY_VOCABULARY = new Set([
  'current-role',
  'skills',
  'goals',
  'constraints',
  'preferences',
  'opportunities',
]);

const PROMPT_ACT_VOCABULARY: Readonly<Record<string, readonly string[]>> = {
  'reality-inventory': ['request-clarification', 'request-confirmation'],
  'decision-criteria': ['request-listing', 'request-prioritization'],
  'tradeoff-review': ['request-comparison', 'request-reflection'],
  'evidence-check': ['request-known-facts', 'request-unknowns', 'request-verification-plan'],
  'reversible-action-plan': ['request-user-proposed-action', 'request-reversibility-check'],
  'review-checkpoint': ['request-review-criteria', 'request-review-timing'],
};

const REQUIRED_FORBIDDEN_INFERENCE_KINDS = [
  'trait-inference',
  'career-fit-judgment',
  'occupation-recommendation',
  'industry-recommendation',
  'success-probability',
  'personality-assessment',
  'score-derivation',
  'match-percentage',
] as const;

const ARCHETYPE_KEYS = [
  'archetypeId',
  'allowedInputCategories',
  'allowedPromptActs',
  'forbiddenInferenceKinds',
] as const;

const FORBIDDEN_PAYLOAD_KEYS = [
  'questionText',
  'promptText',
  'visibleText',
  'markdown',
  'answer',
  'example',
  'item',
  'items',
  'option',
  'options',
  'statement',
  'rawFacts',
  'hostChat',
  'filePath',
  'sessionId',
  'identity',
  'email',
  'score',
  'norm',
  'percentile',
  'rank',
  'weight',
  'profile',
  'type',
  'trait',
  'personality',
  'match',
  'fit',
  'occupation',
  'industryRecommendation',
  'careerRecommendation',
  'diagnosis',
  'clinical',
  'symptom',
  'therapy',
  'bazi',
  'astrology',
  'chart',
  'ruleset',
  'pattern',
  'usefulGod',
  'traditionalClaim',
  'prediction',
  'guarantee',
  'successLikelihood',
  'runtimeReady',
  'deliveryReady',
  'iq4Unblocked',
] as const;

export interface GovernanceCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

type Record_ = Record<string, unknown>;

function isRecord(value: unknown): value is Record_ {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function containsForbiddenPayloadKey(value: unknown, seen: Set<object>): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => containsForbiddenPayloadKey(entry, seen));
  }
  if (!isRecord(value)) return false;
  if (seen.has(value)) return false;
  seen.add(value);
  for (const [key, entry] of Object.entries(value)) {
    if ((FORBIDDEN_PAYLOAD_KEYS as readonly string[]).includes(key)) return true;
    if (containsForbiddenPayloadKey(entry, seen)) return true;
  }
  return false;
}

export function verifyCareerReflectionCardGovernance(
  governance: unknown,
  admission: unknown,
): { ok: boolean; checks: GovernanceCheck[] } {
  const checks: GovernanceCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string): void => {
    checks.push(detail === undefined ? { name, ok } : { name, ok, detail });
  };

  add(
    'governance record declares synthetic-technical fixture kind',
    isRecord(governance) && governance.fixtureKind === 'synthetic-technical',
  );
  if (!isRecord(governance)) {
    add('governance record is a JSON object', false);
    return { ok: false, checks };
  }
  add(
    'governance id is career-reflection-card-governance/v1',
    governance.governanceId === GOVERNANCE_ID,
  );

  const binding = governance.admissionBinding;
  const bindingOk =
    isRecord(binding) &&
    binding.admissionId === ADMISSION_ID &&
    binding.toolId === TOOL_ID &&
    binding.toolVersion === TOOL_VERSION &&
    isRecord(binding.classification) &&
    binding.classification.ownerAuthored === true &&
    binding.classification.nonPsychometric === true &&
    binding.classification.nonClinical === true &&
    binding.classification.scoreless === true;
  add('admission binding matches the C-4B admitted category exactly', bindingOk);

  add('contentState stays no-items-defined', governance.contentState === CONTENT_STATE);
  add('governance keeps runtimeReady false', governance.runtimeReady === false);

  // Cross-consistency with the underlying C-4B admission record: the
  // governance record cannot exist if the admission drifted toward
  // items-defined, runtime-ready, or IQ-4-unblocked. The C-4B fixture nests
  // these under its `admission` section.
  const admissionSection = isRecord(admission) ? admission.admission : undefined;
  const admissionConsistent =
    isRecord(admission) &&
    admission.admissionId === ADMISSION_ID &&
    isRecord(admissionSection) &&
    admissionSection.contentState === CONTENT_STATE &&
    admissionSection.runtimeReady === false &&
    admissionSection.unblocksIq4 === false;
  add(
    'underlying C-4B admission has not drifted toward items, runtime, or IQ-4 unblock',
    admissionConsistent,
  );

  const archetypes: unknown = governance.archetypes;
  const archetypesOk =
    Array.isArray(archetypes) &&
    archetypes.length === ARCHETYPE_IDS.length &&
    archetypes.every((entry, index) => {
      if (!isRecord(entry)) return false;
      if (entry.archetypeId !== ARCHETYPE_IDS[index]) return false;
      const keys = Object.keys(entry);
      if (
        keys.length !== ARCHETYPE_KEYS.length ||
        keys.some((key) => !(ARCHETYPE_KEYS as readonly string[]).includes(key))
      ) {
        return false;
      }
      const categories = entry.allowedInputCategories;
      if (!Array.isArray(categories) || categories.length === 0) return false;
      if (!categories.every((category) => CATEGORY_VOCABULARY.has(category as string)))
        return false;
      if (new Set(categories).size !== categories.length) return false;
      const acts = entry.allowedPromptActs;
      const allowedActs = PROMPT_ACT_VOCABULARY[ARCHETYPE_IDS[index]] ?? [];
      if (!Array.isArray(acts) || acts.length === 0) return false;
      if (!acts.every((act) => allowedActs.includes(act as string))) return false;
      if (new Set(acts).size !== acts.length) return false;
      const inferences = entry.forbiddenInferenceKinds;
      if (!Array.isArray(inferences)) return false;
      if (!REQUIRED_FORBIDDEN_INFERENCE_KINDS.every((kind) => inferences.includes(kind)))
        return false;
      return new Set(inferences).size === inferences.length;
    });
  add('archetypes are exactly the six documented intent structures in fixed order', archetypesOk);

  // Structural payload rejection: the record's top-level shape is a fixed
  // key set, and archetype entries carry exactly the four governance keys —
  // any text/question/item/advice/inference/clinical/bazi key (at top level
  // or nested in an archetype) fails closed. Structural exact-key checks,
  // not a value-keyword blacklist.
  const expectedTopLevelKeys = [
    'governanceId',
    'fixtureKind',
    'syntheticNotice',
    'contractVersion',
    'admissionBinding',
    'contentState',
    'runtimeReady',
    'archetypes',
    'consent',
    'composition',
  ] as const;
  const topLevelKeys = Object.keys(governance);
  const topLevelShapeOk =
    topLevelKeys.length === expectedTopLevelKeys.length &&
    expectedTopLevelKeys.every((key) => topLevelKeys.includes(key));
  add('governance top-level shape matches the frozen key set', topLevelShapeOk);
  const payloadLeak = Array.isArray(archetypes)
    ? archetypes.some((entry) => containsForbiddenPayloadKey(entry, new Set()))
    : false;
  add('archetypes carry no text, item, advice, inference, or clinical payload keys', !payloadLeak);

  const consent = governance.consent;
  const consentOk =
    isRecord(consent) &&
    consent.governedBy === 'career-reflection-consent-lifecycle/v1' &&
    consent.scope === 'career-reflection' &&
    consent.implemented === false;
  add('consent remains delegated to the C-4B lifecycle and is not implemented here', consentOk);

  const composition = governance.composition;
  const compositionOk =
    isRecord(composition) &&
    composition.consumesC1Plans === false &&
    composition.integratedWithC2 === false;
  add('card governance is not integrated with C-1 plans or the C-2 composition', compositionOk);

  const emailHit = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(JSON.stringify(governance));
  add('governance record contains no email-shaped strings', !emailHit);

  return { ok: checks.every((check) => check.ok), checks };
}

export function loadGovernanceFixture(): unknown {
  const here = dirname(fileURLToPath(import.meta.url));
  return JSON.parse(
    readFileSync(
      join(
        here,
        '..',
        '..',
        'evals',
        'fixtures',
        'synthetic',
        'career-reflection-card-governance.json',
      ),
      'utf8',
    ),
  );
}

export function loadCareerReflectionAdmissionFixture(): unknown {
  const here = dirname(fileURLToPath(import.meta.url));
  return JSON.parse(
    readFileSync(
      join(here, '..', '..', 'evals', 'fixtures', 'synthetic', 'career-reflection-admission.json'),
      'utf8',
    ),
  );
}
