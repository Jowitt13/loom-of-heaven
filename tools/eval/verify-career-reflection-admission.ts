import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * C-4B career-reflection admission + consent-lifecycle verifier. The fixture
 * freezes the owner-selected tool category (owner-authored, non-psychometric,
 * non-clinical, scoreless reflection/decision cards) with
 * `contentState: no-items-defined`, zero external dependencies, and the
 * consent-lifecycle rules for a future local implementation. It fail-closes
 * on: classification drift, external instrument references, item/content
 * fields, score/norm/match capabilities, career recommendations, identity or
 * raw-answer fields, illegal lifecycle transitions, runtime-ready claims, and
 * any attempt to unblock IQ-4.
 *
 * It verifies structure and vocabulary only: no card content exists, no user
 * flow is implemented, and nothing here lifts IQ-4's
 * BLOCKED_SOURCE_ADMISSION.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const ADMISSION_PATH = join(
  root,
  'evals',
  'fixtures',
  'synthetic',
  'career-reflection-admission.json',
);

const ADMISSION_ID = 'career-reflection-admission/v1';
const TOOL_ID = 'career-reflection-cards';
const TOOL_VERSION = 'v1';
const CONTENT_STATE = 'no-items-defined';
const CONSENT_SCOPE = 'career-reflection';
const LIFECYCLE_VERSION = 'career-reflection-consent-lifecycle/v1';
const DEFAULT_STATE = 'not-started';
const LIFECYCLE_STATES = ['not-started', 'consented', 'active', 'deleted'] as const;
const ALLOWED_USE_CATEGORIES = [
  'reflection-question',
  'decision-framework',
  'action-experiment',
] as const;

const REQUIRED_FORBIDDEN_OUTPUTS = [
  'score',
  'norm',
  'percentile',
  'matching',
  'occupation-recommendation',
  'personality-label',
  'diagnosis',
  'clinical-screening',
  'prediction',
  'bazi-derived-recommendation',
  'astrology-derived-recommendation',
] as const;

const REQUIRED_FORBIDDEN_FIELDS = [
  'userId',
  'email',
  'rawAnswer',
  'score',
  'clinicalData',
  'hostChat',
  'filePath',
  'sessionId',
] as const;

const ALLOWED_TRANSITIONS: ReadonlyArray<{ from: string; to: string; trigger: string }> = [
  { from: 'not-started', to: 'consented', trigger: 'explicit-consent' },
  { from: 'consented', to: 'active', trigger: 'first-use' },
  { from: 'active', to: 'deleted', trigger: 'user-delete' },
  { from: 'consented', to: 'deleted', trigger: 'user-delete' },
];

const CLASSIFICATION_KEYS = [
  'ownerAuthored',
  'nonPsychometric',
  'nonClinical',
  'scoreless',
] as const;

export interface AdmissionCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

type Record_ = Record<string, unknown>;

function isRecord(value: unknown): value is Record_ {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function verifyCareerReflectionAdmission(record: unknown): {
  ok: boolean;
  checks: AdmissionCheck[];
} {
  const checks: AdmissionCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string): void => {
    checks.push(detail === undefined ? { name, ok } : { name, ok, detail });
  };

  add(
    'fixture declares synthetic-technical fixture kind',
    isRecord(record) && record.fixtureKind === 'synthetic-technical',
  );
  if (!isRecord(record)) {
    add('record is a JSON object', false);
    return { ok: false, checks };
  }
  add('record id is career-reflection-admission/v1', record.admissionId === ADMISSION_ID);

  const admission = record.admission;
  if (!isRecord(admission)) {
    add('admission section present', false);
    return { ok: false, checks };
  }

  add('toolId is frozen', admission.toolId === TOOL_ID);
  add('toolVersion is frozen', admission.toolVersion === TOOL_VERSION);
  const classification = admission.classification;
  add(
    'classification is owner-authored / non-psychometric / non-clinical / scoreless',
    isRecord(classification) && CLASSIFICATION_KEYS.every((key) => classification[key] === true),
  );
  add('contentState is no-items-defined', admission.contentState === CONTENT_STATE);

  // No external instrument dependency may be recorded, and no external
  // instrument may be referenced anywhere in the record.
  add(
    'externalDependencies is empty',
    Array.isArray(admission.externalDependencies) && admission.externalDependencies.length === 0,
  );
  const serialized = JSON.stringify(record);
  const externalReference = /(O\*?NET|Career\s+Anchors|RIASEC|GROW|Holland|PHQ|GAD-?\d|ADHD)/i.test(
    serialized,
  );
  add('record references no external instrument or clinical scale', !externalReference);

  // No item/content payload may ride along with the admission.
  const contentKeys = ['items', 'questions', 'cards', 'prompts', 'text', 'content'].filter(
    (key) => admission[key] !== undefined || record[key] !== undefined,
  );
  add(
    'admission carries no item or content payload',
    contentKeys.length === 0,
    contentKeys.join(','),
  );

  const uses = admission.allowedUseCategories;
  add(
    'allowed uses are exactly the three reflection categories',
    Array.isArray(uses) &&
      uses.length === ALLOWED_USE_CATEGORIES.length &&
      ALLOWED_USE_CATEGORIES.every((category, index) => uses[index] === category),
  );

  const forbiddenOutputs = admission.forbiddenOutputs;
  add(
    'all forbidden outputs are recorded',
    Array.isArray(forbiddenOutputs) &&
      REQUIRED_FORBIDDEN_OUTPUTS.every((output) => (forbiddenOutputs as string[]).includes(output)),
  );

  add('admission does not unblock IQ-4', admission.unblocksIq4 === false);
  add('admission is not runtime-ready', admission.runtimeReady === false);

  // Consent lifecycle rules.
  const lifecycle = record.consentLifecycle;
  if (!isRecord(lifecycle)) {
    add('consent lifecycle section present', false);
  } else {
    add(
      'consent lifecycle contract version is frozen',
      lifecycle.contractVersion === LIFECYCLE_VERSION,
    );
    add('consent scope is fixed to career-reflection', lifecycle.consentScope === CONSENT_SCOPE);
    add(
      'notice is versioned',
      typeof lifecycle.noticeId === 'string' &&
        /^career-reflection-notice\/v[0-9]+$/.test(lifecycle.noticeId),
    );
    add(
      'default lifecycle state is not-started (no data by default)',
      lifecycle.defaultState === DEFAULT_STATE,
    );
    const states: unknown = lifecycle.states;
    add(
      'lifecycle states are exactly the four documented states in order',
      Array.isArray(states) &&
        states.length === LIFECYCLE_STATES.length &&
        LIFECYCLE_STATES.every((state, index) => states[index] === state),
    );
    const transitions: unknown = lifecycle.allowedTransitions;
    const transitionsOk =
      Array.isArray(transitions) &&
      transitions.length === ALLOWED_TRANSITIONS.length &&
      transitions.every((transition, index) => {
        const expected = ALLOWED_TRANSITIONS[index]!;
        return (
          isRecord(transition) &&
          transition.from === expected.from &&
          transition.to === expected.to &&
          transition.trigger === expected.trigger
        );
      });
    add('lifecycle transitions are exactly the documented explicit-trigger set', transitionsOk);
    const requirements = lifecycle.requirements;
    add(
      'lifecycle requires skip, withdrawal, minimal collection, local-only, and deletion',
      isRecord(requirements) &&
        ['skippable', 'withdrawable', 'minimalCollection', 'localOnly', 'deletable'].every(
          (key) => requirements[key] === true,
        ),
    );
    const forbiddenFields = lifecycle.forbiddenFields;
    add(
      'forbidden fields include identity, raw answers, scores, clinical data, and session data',
      Array.isArray(forbiddenFields) &&
        REQUIRED_FORBIDDEN_FIELDS.every((field) => (forbiddenFields as string[]).includes(field)),
    );
    add(
      'clinical artifacts are inadmissible as consent, input, export, or composition source',
      lifecycle.clinicalArtifactAdmissible === false,
    );
  }

  // Privacy: no email-shaped strings anywhere in the record.
  const emailHit = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(serialized);
  add('record contains no email-shaped strings', !emailHit);

  return { ok: checks.every((check) => check.ok), checks };
}

export function loadCareerReflectionAdmission(): unknown {
  return JSON.parse(readFileSync(ADMISSION_PATH, 'utf8'));
}

export function admissionFixtureDigest(): string {
  return `sha256:${createHash('sha256').update(canonicalFixtureJson()).digest('hex')}`;
}

function canonicalFixtureJson(): string {
  return JSON.stringify(loadCareerReflectionAdmission());
}
