import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../../packages/contracts/src/ids.ts';
import {
  ANSWER_QUALITY_DIMENSIONS,
  ANSWER_QUALITY_FAILURE_MODES,
} from './verify-answer-quality-foundation.ts';

/**
 * IQ-0B1 public corpus verifier — development-only, offline, deterministic.
 *
 * It verifies the bounded synthetic career corpus and a separate synthetic
 * review-linkage fixture. It proves only fixture shape, digest linkage,
 * privacy boundaries, split coverage, candidate status, and review-reference
 * integrity. It cannot judge prose quality, traditional-method correctness,
 * or whether a human has actually reviewed a candidate answer.
 */

export type AnswerQualityCorpusCode =
  | 'CORPUS_SHAPE'
  | 'CASE_SHAPE'
  | 'COVERAGE'
  | 'ARTIFACT_LINKAGE'
  | 'DIGEST_LINKAGE'
  | 'REVIEW_LINKAGE'
  | 'PRIVACY'
  | 'CANDIDATE_BOUNDARY'
  | 'RUNTIME_BOUNDARY';

export interface AnswerQualityCorpusIssue {
  code: AnswerQualityCorpusCode;
  path: string;
}

export interface AnswerQualityCorpusResult {
  ok: boolean;
  developmentCaseCount: number;
  adversarialCaseCount: number;
  visibleArtifactCount: number;
  reviewRecordsVerified: number;
  issues: readonly AnswerQualityCorpusIssue[];
}

export interface AnswerQualityCorpusInputs {
  corpus: unknown;
  evidenceBundle: unknown;
  visibleArtifacts: ReadonlyMap<string, unknown>;
  reviewLinkageFixture: unknown;
}

type JsonRecord = Record<string, unknown>;

const ROOT = resolve(join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'));
const SYNTHETIC_DIR = 'evals/fixtures/synthetic';
const PUBLIC_CORPUS_DIR = 'evals/corpus/public/career';
const EVIDENCE_PATH = `${SYNTHETIC_DIR}/iq0b-career-evidence-bundle.json`;
const CORPUS_PATH = `${SYNTHETIC_DIR}/iq0b-public-career-corpus.json`;
const REVIEW_LINKAGE_PATH = `${SYNTHETIC_DIR}/iq0b-review-linkage-fixture.json`;
export const IQ0B_EXPECTED_CASE_IDS = [
  'case:synthetic:career:iq0b-dev-direction-structured-work',
  'case:synthetic:career:iq0b-dev-role-fit-iteration',
  'case:synthetic:career:iq0b-dev-environment-autonomy-boundary',
  'case:synthetic:career:iq0b-dev-change-transferable-skills',
  'case:synthetic:career:iq0b-dev-collaboration-role-clarity',
  'case:synthetic:career:iq0b-dev-timing-no-date-prediction',
  'case:synthetic:career:iq0b-dev-tradeoff-depth-breadth',
  'case:synthetic:career:iq0b-dev-insufficient-evidence-degrade',
  'case:synthetic:career:iq0b-dev-source-blocked-no-claim',
  'case:synthetic:career:iq0b-dev-leading-user-reframe',
  'case:synthetic:career:iq0b-dev-presentation-clean',
  'case:synthetic:career:iq0b-dev-material-condition',
  'case:synthetic:career:iq0b-dev-mechanism-adjacent',
  'case:synthetic:career:iq0b-dev-system-separation',
  'case:synthetic:career:iq0b-dev-conclusion-nonrepeat',
  'case:synthetic:career:iq0b-dev-scoped-advice',
  'case:synthetic:career:iq0b-dev-change-environment',
  'case:synthetic:career:iq0b-dev-collaboration-feedback',
  'case:synthetic:career:iq0b-dev-stability-risk',
  'case:synthetic:career:iq0b-dev-learning-to-role',
  'case:synthetic:career:iq0b-adv-vague-term-dump',
  'case:synthetic:career:iq0b-adv-unsupported-verdict',
  'case:synthetic:career:iq0b-adv-mechanism-leap',
  'case:synthetic:career:iq0b-adv-fabricated-consensus',
  'case:synthetic:career:iq0b-adv-footer-repetition',
  'case:synthetic:career:iq0b-adv-missing-condition',
] as const;
const DEVELOPMENT_CASE_IDS = new Set(IQ0B_EXPECTED_CASE_IDS.slice(0, 20));
const ADVERSARIAL_CASE_IDS = new Set(IQ0B_EXPECTED_CASE_IDS.slice(20));
const QUESTION_INTENTS = new Set([
  'career-direction',
  'role-fit',
  'work-environment',
  'career-change',
  'collaboration',
  'timing-scope',
  'strengths-and-tradeoffs',
  'insufficient-evidence',
]);
const CHALLENGE_IDS = new Set([
  'ordinary',
  'source-blocked',
  'conflicting-signals',
  'leading-user',
  'missing-condition',
  'insufficient-evidence',
  'presentation-stress',
]);
const TIME_RELIABILITY = new Set(['exact', 'approximate', 'unknown', 'not-relevant']);
const BOUNDARY_IDS = [
  'claim-support-resolves',
  'mechanism-adjacent-to-implication',
  'topic-scope-respected',
  'material-caveat-retained',
  'unrelated-warning-omitted',
  'cross-system-separation-preserved',
  'unsupported-life-fact-excluded',
  'deterministic-verdict-excluded',
  'default-footer-excluded',
  'audit-metadata-hidden',
  'insufficient-evidence-degrades',
  'automatic-followup-excluded',
] as const;
const CRITICAL_DIMENSIONS = [
  'support-and-traceability',
  'condition-and-caveat-fidelity',
  'cross-system-integrity',
  'restraint-and-boundaries',
] as const;
const CASE_KEYS = [
  'contractVersion',
  'caseId',
  'split',
  'fixtureKind',
  'topic',
  'rubricId',
  'question',
  'scenario',
  'evidenceArtifacts',
  'answerArtifact',
  'evaluationPlan',
  'exclusionPolicy',
];
const VISIBLE_KEYS = [
  'contractVersion',
  'artifactId',
  'caseId',
  'topic',
  'role',
  'visibleText',
  'producerClass',
  'pipelineRevision',
  'rulesetRefs',
  'sourceArtifactDigests',
  'sanitization',
  'exclusionPolicy',
];
const REVIEW_KEYS = [
  'contractVersion',
  'reviewId',
  'reviewKind',
  'caseId',
  'answerArtifactId',
  'reviewedArtifactDigest',
  'rubricId',
  'reviewerId',
  'reviewRound',
  'judgments',
  'failureModeIds',
  'boundaryFindingIds',
  'disposition',
  'sourceReviewIds',
  'exclusionPolicy',
];
const FORBIDDEN_KEYS = new Set([
  'rawanswer',
  'rawprompt',
  'prompt',
  'transcript',
  'messages',
  'chainofthought',
  'reasoning',
  'provider',
  'tokenlog',
  'birthinput',
  'birthdate',
  'birthtime',
  'location',
  'latitude',
  'longitude',
  'email',
  'accountid',
]);
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const CASE_ID = /^case:synthetic:career:iq0b-(?:dev|adv)-[a-z0-9][a-z0-9-]*$/;
const ARTIFACT_ID = /^artifact:synthetic:iq0b-(?:dev|adv)-[a-z0-9][a-z0-9-]*-candidate$/;
const REVIEW_ID = /^review:synthetic:iq0b-[a-z0-9][a-z0-9-]*$/;
const REVIEWER_ID = /^reviewer:anon:[a-f0-9]{16}$/;
const REPO_PATH =
  /^evals\/corpus\/public\/career\/iq0b-(?:dev|adv)-[a-z0-9][a-z0-9-]*-candidate\.json$/;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function exactKeys(value: JsonRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => key in value);
}

function sameStringList(value: unknown, expected: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((entry, index) => entry === expected[index])
  );
}

function uniqueStrings(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === 'string') &&
    new Set(value).size === value.length
  );
}

function canonicalSha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function add(
  issues: AnswerQualityCorpusIssue[],
  code: AnswerQualityCorpusCode,
  path: string,
): void {
  issues.push({ code, path });
}

function inspectForbidden(value: unknown, path: string, issues: AnswerQualityCorpusIssue[]): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectForbidden(entry, `${path}[${index}]`, issues));
    return;
  }
  const source = record(value);
  if (source === null) return;
  for (const [key, child] of Object.entries(source)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) add(issues, 'PRIVACY', `${path}.${key}`);
    inspectForbidden(child, `${path}.${key}`, issues);
  }
}

function underRoot(path: string): boolean {
  const normalizedRoot = `${ROOT}${sep}`;
  const resolvedPath = resolve(ROOT, path);
  return resolvedPath.startsWith(normalizedRoot) && !relative(ROOT, resolvedPath).startsWith('..');
}

function verifyEvidenceBundle(
  value: unknown,
  issues: AnswerQualityCorpusIssue[],
): { digest: string; caseIds: readonly string[] } | null {
  const bundle = record(value);
  const keys = [
    'fixtureId',
    'fixtureKind',
    'mode',
    'notRuntimeInput',
    'notChartCalculation',
    'notHumanReview',
    'sourceProfile',
    'cases',
    'exclusionPolicy',
  ];
  if (bundle === null || !exactKeys(bundle, keys)) {
    add(issues, 'CORPUS_SHAPE', '$.evidenceBundle');
    return null;
  }
  if (
    bundle.fixtureId !== 'synthetic:iq0b-career-evidence-bundle' ||
    bundle.fixtureKind !== 'synthetic-technical' ||
    bundle.mode !== 'answer-quality-structural-only' ||
    bundle.notRuntimeInput !== true ||
    bundle.notChartCalculation !== true ||
    bundle.notHumanReview !== true
  ) {
    add(issues, 'CANDIDATE_BOUNDARY', '$.evidenceBundle');
  }
  const profile = record(bundle.sourceProfile);
  if (
    profile === null ||
    !exactKeys(profile, ['id', 'version']) ||
    profile.id !== 'synthetic-evaluation-profile' ||
    profile.version !== 'iq0b-v1'
  ) {
    add(issues, 'CORPUS_SHAPE', '$.evidenceBundle.sourceProfile');
  }
  if (!Array.isArray(bundle.cases) || bundle.cases.length !== IQ0B_EXPECTED_CASE_IDS.length) {
    add(issues, 'COVERAGE', '$.evidenceBundle.cases');
    return null;
  }
  const ids: string[] = [];
  for (const [index, entry] of bundle.cases.entries()) {
    const item = record(entry);
    if (
      item === null ||
      !exactKeys(item, ['caseId', 'mechanismLabel', 'implicationBoundary', 'caveatLabel']) ||
      typeof item.caseId !== 'string' ||
      typeof item.mechanismLabel !== 'string' ||
      typeof item.implicationBoundary !== 'string' ||
      typeof item.caveatLabel !== 'string'
    ) {
      add(issues, 'CORPUS_SHAPE', `$.evidenceBundle.cases[${index}]`);
      continue;
    }
    ids.push(item.caseId);
  }
  if (!sameStringList(ids, IQ0B_EXPECTED_CASE_IDS)) {
    add(issues, 'COVERAGE', '$.evidenceBundle.cases');
  }
  return { digest: canonicalSha256(value), caseIds: ids };
}

function verifyCase(
  value: unknown,
  index: number,
  evidenceDigest: string,
  artifacts: ReadonlyMap<string, unknown>,
  issues: AnswerQualityCorpusIssue[],
): {
  caseId: string;
  split: string;
  challengeIds: readonly string[];
  failureModeIds: readonly string[];
} | null {
  const item = record(value);
  const path = `$.corpus.cases[${index}]`;
  if (item === null || !exactKeys(item, CASE_KEYS)) {
    add(issues, 'CASE_SHAPE', path);
    return null;
  }
  const caseId = item.caseId;
  if (
    typeof caseId !== 'string' ||
    !CASE_ID.test(caseId) ||
    caseId !== IQ0B_EXPECTED_CASE_IDS[index]
  ) {
    add(issues, 'COVERAGE', `${path}.caseId`);
    return null;
  }
  if (!DEVELOPMENT_CASE_IDS.has(caseId) && !ADVERSARIAL_CASE_IDS.has(caseId)) {
    add(issues, 'COVERAGE', `${path}.caseId`);
    return null;
  }
  const expectedSplit = DEVELOPMENT_CASE_IDS.has(caseId) ? 'development' : 'adversarial';
  if (
    item.contractVersion !== 'answer-quality-case/v2' ||
    item.split !== expectedSplit ||
    item.fixtureKind !== 'synthetic-technical' ||
    item.topic !== 'career' ||
    item.rubricId !== 'rubric:answer-quality:career-v1'
  ) {
    add(issues, 'CASE_SHAPE', path);
  }
  const question = record(item.question);
  if (
    question === null ||
    !exactKeys(question, ['intentId', 'syntheticText', 'syntheticOnly', 'rawUserPromptExcluded']) ||
    typeof question.intentId !== 'string' ||
    !QUESTION_INTENTS.has(question.intentId) ||
    typeof question.syntheticText !== 'string' ||
    question.syntheticText.length < 1 ||
    question.syntheticText.length > 300 ||
    question.syntheticOnly !== true ||
    question.rawUserPromptExcluded !== true
  ) {
    add(issues, 'CASE_SHAPE', `${path}.question`);
  }
  const scenario = record(item.scenario);
  const challengeIds = scenario?.challengeIds;
  if (
    scenario === null ||
    !exactKeys(scenario, ['timeReliability', 'systemScope', 'challengeIds']) ||
    typeof scenario.timeReliability !== 'string' ||
    !TIME_RELIABILITY.has(scenario.timeReliability) ||
    scenario.systemScope !== 'single-system' ||
    !uniqueStrings(challengeIds) ||
    challengeIds.length < 1 ||
    challengeIds.some((challenge) => !CHALLENGE_IDS.has(challenge))
  ) {
    add(issues, 'CASE_SHAPE', `${path}.scenario`);
  }
  const evidence = Array.isArray(item.evidenceArtifacts) ? item.evidenceArtifacts : [];
  const evidenceItem = record(evidence[0]);
  if (
    evidence.length !== 1 ||
    evidenceItem === null ||
    !exactKeys(evidenceItem, ['artifactId', 'artifactKind', 'repoPath', 'digest']) ||
    evidenceItem.artifactId !== 'artifact:synthetic:iq0b-career-evidence-bundle' ||
    evidenceItem.artifactKind !== 'synthetic-evidence-bundle' ||
    evidenceItem.repoPath !== EVIDENCE_PATH ||
    evidenceItem.digest !== evidenceDigest
  ) {
    add(issues, 'DIGEST_LINKAGE', `${path}.evidenceArtifacts`);
  }
  const answer = record(item.answerArtifact);
  if (
    answer === null ||
    !exactKeys(answer, ['artifactId', 'contractVersion', 'repoPath', 'digest']) ||
    typeof answer.artifactId !== 'string' ||
    !ARTIFACT_ID.test(answer.artifactId) ||
    answer.contractVersion !== 'answer-quality-visible-artifact/v1' ||
    typeof answer.repoPath !== 'string' ||
    !REPO_PATH.test(answer.repoPath) ||
    typeof answer.digest !== 'string' ||
    !SHA256.test(answer.digest)
  ) {
    add(issues, 'ARTIFACT_LINKAGE', `${path}.answerArtifact`);
  } else {
    const artifact = artifacts.get(answer.repoPath);
    if (artifact === undefined || canonicalSha256(artifact) !== answer.digest) {
      add(issues, 'DIGEST_LINKAGE', `${path}.answerArtifact.digest`);
    }
    verifyVisibleArtifact(
      artifact,
      answer,
      caseId,
      expectedSplit,
      evidenceDigest,
      `${path}.answerArtifact`,
      issues,
    );
  }
  const plan = record(item.evaluationPlan);
  const failureModeIds = plan?.targetFailureModeIds;
  if (
    plan === null ||
    !exactKeys(plan, [
      'dimensionIds',
      'criticalDimensionIds',
      'boundaryIds',
      'targetFailureModeIds',
      'humanReviewRequired',
    ]) ||
    !sameStringList(plan.dimensionIds, ANSWER_QUALITY_DIMENSIONS) ||
    !sameStringList(plan.criticalDimensionIds, CRITICAL_DIMENSIONS) ||
    !sameStringList(plan.boundaryIds, BOUNDARY_IDS) ||
    !uniqueStrings(failureModeIds) ||
    failureModeIds.length < 1 ||
    failureModeIds.some((mode) => !ANSWER_QUALITY_FAILURE_MODES.includes(mode as never)) ||
    plan.humanReviewRequired !== true
  ) {
    add(issues, 'CASE_SHAPE', `${path}.evaluationPlan`);
  }
  if (!uniqueStrings(item.exclusionPolicy) || !item.exclusionPolicy.includes('candidate-only')) {
    add(issues, 'CANDIDATE_BOUNDARY', `${path}.exclusionPolicy`);
  }
  return {
    caseId,
    split: expectedSplit,
    challengeIds: uniqueStrings(challengeIds) ? challengeIds : [],
    failureModeIds: uniqueStrings(failureModeIds) ? failureModeIds : [],
  };
}

function verifyVisibleArtifact(
  value: unknown,
  answerRef: JsonRecord,
  caseId: string,
  split: string,
  evidenceDigest: string,
  path: string,
  issues: AnswerQualityCorpusIssue[],
): void {
  const artifact = record(value);
  if (artifact === null || !exactKeys(artifact, VISIBLE_KEYS)) {
    add(issues, 'ARTIFACT_LINKAGE', path);
    return;
  }
  if (
    artifact.contractVersion !== 'answer-quality-visible-artifact/v1' ||
    artifact.artifactId !== answerRef.artifactId ||
    artifact.caseId !== caseId ||
    artifact.topic !== 'career' ||
    artifact.role !== 'candidate' ||
    artifact.producerClass !== 'human-authored-synthetic' ||
    typeof artifact.pipelineRevision !== 'string' ||
    !/^[a-f0-9]{40}$/.test(artifact.pipelineRevision) ||
    typeof artifact.visibleText !== 'string' ||
    artifact.visibleText.length < 1 ||
    artifact.visibleText.length > 12000
  ) {
    add(issues, 'ARTIFACT_LINKAGE', path);
  }
  const rulesetRefs = artifact.rulesetRefs;
  if (
    !Array.isArray(rulesetRefs) ||
    rulesetRefs.length !== 1 ||
    JSON.stringify(rulesetRefs[0]) !==
      JSON.stringify({ id: 'synthetic-evaluation-profile', version: 'iq0b-v1' })
  ) {
    add(issues, 'ARTIFACT_LINKAGE', `${path}.rulesetRefs`);
  }
  if (!sameStringList(artifact.sourceArtifactDigests, [evidenceDigest])) {
    add(issues, 'DIGEST_LINKAGE', `${path}.sourceArtifactDigests`);
  }
  const sanitization = record(artifact.sanitization);
  if (
    sanitization === null ||
    !exactKeys(sanitization, [
      'syntheticInputOnly',
      'rawTranscriptExcluded',
      'rawPromptExcluded',
      'modelReasoningExcluded',
      'personalDataExcluded',
    ]) ||
    Object.values(sanitization).some((entry) => entry !== true)
  ) {
    add(issues, 'PRIVACY', `${path}.sanitization`);
  }
  const requiredCandidateBoundary =
    split === 'development'
      ? 'candidate-not-accepted-reference'
      : 'adversarial-candidate-not-production-output';
  if (
    !uniqueStrings(artifact.exclusionPolicy) ||
    !artifact.exclusionPolicy.includes(requiredCandidateBoundary)
  ) {
    add(issues, 'CANDIDATE_BOUNDARY', `${path}.exclusionPolicy`);
  }
  const visibleText = artifact.visibleText;
  if (split === 'development' && typeof visibleText === 'string') {
    if (
      ['敏感项校对', '引擎警告', '专业依据', '声明'].some((heading) =>
        visibleText.includes(heading),
      )
    ) {
      add(issues, 'CANDIDATE_BOUNDARY', `${path}.visibleText`);
    }
  }
}

function verifyReviewLinkage(
  value: unknown,
  artifacts: ReadonlyMap<string, unknown>,
  issues: AnswerQualityCorpusIssue[],
): number {
  const fixture = record(value);
  if (
    fixture === null ||
    !exactKeys(fixture, [
      'fixtureId',
      'fixtureKind',
      'mode',
      'sourceArtifactPath',
      'reviewRecords',
      'exclusionPolicy',
    ]) ||
    fixture.fixtureId !== 'synthetic:iq0b-review-linkage-fixture' ||
    fixture.fixtureKind !== 'synthetic-technical' ||
    fixture.mode !== 'structural-linkage-only-not-human-review' ||
    fixture.sourceArtifactPath !==
      'evals/corpus/public/career/iq0b-adv-vague-term-dump-candidate.json'
  ) {
    add(issues, 'REVIEW_LINKAGE', '$.reviewLinkageFixture');
    return 0;
  }
  const records = Array.isArray(fixture.reviewRecords) ? fixture.reviewRecords : [];
  if (records.length !== 3) {
    add(issues, 'REVIEW_LINKAGE', '$.reviewLinkageFixture.reviewRecords');
    return 0;
  }
  const sourceArtifact = artifacts.get(fixture.sourceArtifactPath);
  const source = record(sourceArtifact);
  const expectedDigest = sourceArtifact === undefined ? '' : canonicalSha256(sourceArtifact);
  const expectedCaseId = source?.caseId;
  const expectedArtifactId = source?.artifactId;
  const byId = new Map<string, JsonRecord>();
  const reviewers = new Set<string>();
  for (const [index, value] of records.entries()) {
    const review = record(value);
    const path = `$.reviewLinkageFixture.reviewRecords[${index}]`;
    if (
      review === null ||
      !exactKeys(review, REVIEW_KEYS) ||
      review.contractVersion !== 'answer-quality-review/v1' ||
      typeof review.reviewId !== 'string' ||
      !REVIEW_ID.test(review.reviewId) ||
      byId.has(review.reviewId) ||
      (review.reviewKind !== 'independent' && review.reviewKind !== 'reconciliation') ||
      review.caseId !== expectedCaseId ||
      review.answerArtifactId !== expectedArtifactId ||
      review.reviewedArtifactDigest !== expectedDigest ||
      review.rubricId !== 'rubric:answer-quality:career-v1' ||
      typeof review.reviewerId !== 'string' ||
      !REVIEWER_ID.test(review.reviewerId) ||
      reviewers.has(String(review.reviewerId)) ||
      !Number.isInteger(review.reviewRound) ||
      (review.reviewRound as number) < 1 ||
      !Array.isArray(review.judgments) ||
      review.judgments.length !== ANSWER_QUALITY_DIMENSIONS.length ||
      !uniqueStrings(review.failureModeIds) ||
      !uniqueStrings(review.boundaryFindingIds) ||
      !uniqueStrings(review.sourceReviewIds) ||
      !uniqueStrings(review.exclusionPolicy)
    ) {
      add(issues, 'REVIEW_LINKAGE', path);
      continue;
    }
    const dimensions = review.judgments.map((entry) => record(entry)?.dimensionId);
    if (!sameStringList(dimensions, ANSWER_QUALITY_DIMENSIONS)) {
      add(issues, 'REVIEW_LINKAGE', `${path}.judgments`);
    }
    if (
      review.failureModeIds.some(
        (mode) => typeof mode !== 'string' || !ANSWER_QUALITY_FAILURE_MODES.includes(mode as never),
      ) ||
      review.boundaryFindingIds.some(
        (boundary) => typeof boundary !== 'string' || !BOUNDARY_IDS.includes(boundary as never),
      ) ||
      !review.exclusionPolicy.includes('no-human-review-attestation')
    ) {
      add(issues, 'REVIEW_LINKAGE', path);
    }
    byId.set(review.reviewId, review);
    reviewers.add(review.reviewerId);
  }
  for (const [reviewId, review] of byId) {
    const sources = review.sourceReviewIds as string[];
    if (review.reviewKind === 'independent' && sources.length !== 0) {
      add(issues, 'REVIEW_LINKAGE', `$.reviewLinkageFixture.${reviewId}.sourceReviewIds`);
    }
    if (review.reviewKind === 'reconciliation') {
      if (sources.length < 2 || sources.includes(reviewId)) {
        add(issues, 'REVIEW_LINKAGE', `$.reviewLinkageFixture.${reviewId}.sourceReviewIds`);
        continue;
      }
      for (const sourceId of sources) {
        const sourceReview = byId.get(sourceId);
        if (
          sourceReview === undefined ||
          sourceReview.reviewKind !== 'independent' ||
          sourceReview.caseId !== review.caseId ||
          sourceReview.answerArtifactId !== review.answerArtifactId ||
          sourceReview.reviewedArtifactDigest !== review.reviewedArtifactDigest ||
          sourceReview.rubricId !== review.rubricId ||
          sourceReview.reviewerId === review.reviewerId ||
          (sourceReview.sourceReviewIds as string[]).length !== 0
        ) {
          add(issues, 'REVIEW_LINKAGE', `$.reviewLinkageFixture.${reviewId}.sourceReviewIds`);
        }
      }
    }
  }
  return byId.size;
}

/** Verify the bounded IQ-0B1 corpus without a model, network, or runtime path. */
export function verifyAnswerQualityCorpus(
  inputs: AnswerQualityCorpusInputs,
): AnswerQualityCorpusResult {
  const issues: AnswerQualityCorpusIssue[] = [];
  inspectForbidden(inputs.corpus, '$.corpus', issues);
  inspectForbidden(inputs.evidenceBundle, '$.evidenceBundle', issues);
  for (const [path, artifact] of inputs.visibleArtifacts)
    inspectForbidden(artifact, `$.artifacts.${path}`, issues);
  inspectForbidden(inputs.reviewLinkageFixture, '$.reviewLinkageFixture', issues);

  const evidence = verifyEvidenceBundle(inputs.evidenceBundle, issues);
  const corpus = record(inputs.corpus);
  let developmentCaseCount = 0;
  let adversarialCaseCount = 0;
  let visibleArtifactCount = 0;
  let reviewRecordsVerified = 0;
  if (
    corpus === null ||
    !exactKeys(corpus, [
      'contractVersion',
      'fixtureId',
      'fixtureKind',
      'mode',
      'topic',
      'corpusVersion',
      'evidenceBundlePath',
      'evidenceBundleDigest',
      'cases',
      'exclusionPolicy',
    ])
  ) {
    add(issues, 'CORPUS_SHAPE', '$.corpus');
  } else {
    if (
      corpus.contractVersion !== 'answer-quality-public-corpus/v1' ||
      corpus.fixtureId !== 'synthetic:iq0b-public-career-corpus' ||
      corpus.fixtureKind !== 'synthetic-technical' ||
      corpus.mode !== 'candidate-only-pending-human-review' ||
      corpus.topic !== 'career' ||
      corpus.corpusVersion !== 'iq0b-v1' ||
      corpus.evidenceBundlePath !== EVIDENCE_PATH ||
      corpus.evidenceBundleDigest !== evidence?.digest ||
      !uniqueStrings(corpus.exclusionPolicy) ||
      !corpus.exclusionPolicy.includes('no-human-review-attestation')
    ) {
      add(issues, 'CANDIDATE_BOUNDARY', '$.corpus');
    }
    const cases = Array.isArray(corpus.cases) ? corpus.cases : [];
    if (cases.length !== IQ0B_EXPECTED_CASE_IDS.length) add(issues, 'COVERAGE', '$.corpus.cases');
    const allChallenges = new Set<string>();
    const allFailureModes = new Set<string>();
    for (const [index, item] of cases.entries()) {
      const verified =
        evidence === null
          ? null
          : verifyCase(item, index, evidence.digest, inputs.visibleArtifacts, issues);
      if (verified === null) continue;
      if (verified.split === 'development') developmentCaseCount += 1;
      if (verified.split === 'adversarial') adversarialCaseCount += 1;
      verified.challengeIds.forEach((id) => allChallenges.add(id));
      verified.failureModeIds.forEach((id) => allFailureModes.add(id));
      visibleArtifactCount += 1;
    }
    if (developmentCaseCount !== 20 || adversarialCaseCount !== 6) {
      add(issues, 'COVERAGE', '$.corpus.cases.split');
    }
    if (!sameStringList([...allChallenges].sort(), [...CHALLENGE_IDS].sort())) {
      add(issues, 'COVERAGE', '$.corpus.cases.scenario.challengeIds');
    }
    if (!sameStringList([...allFailureModes].sort(), [...ANSWER_QUALITY_FAILURE_MODES].sort())) {
      add(issues, 'COVERAGE', '$.corpus.cases.evaluationPlan.targetFailureModeIds');
    }
  }
  if (inputs.visibleArtifacts.size !== IQ0B_EXPECTED_CASE_IDS.length) {
    add(issues, 'ARTIFACT_LINKAGE', '$.artifacts');
  }
  reviewRecordsVerified = verifyReviewLinkage(
    inputs.reviewLinkageFixture,
    inputs.visibleArtifacts,
    issues,
  );
  return {
    ok: issues.length === 0,
    developmentCaseCount,
    adversarialCaseCount,
    visibleArtifactCount,
    reviewRecordsVerified,
    issues,
  };
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

export function readCommittedAnswerQualityCorpus(): AnswerQualityCorpusInputs {
  const corpusPath = resolve(ROOT, CORPUS_PATH);
  const evidencePath = resolve(ROOT, EVIDENCE_PATH);
  const reviewPath = resolve(ROOT, REVIEW_LINKAGE_PATH);
  const artifactDirectory = resolve(ROOT, PUBLIC_CORPUS_DIR);
  if (
    ![corpusPath, evidencePath, reviewPath, artifactDirectory].every(
      (path) => underRoot(path) && existsSync(path),
    )
  ) {
    throw new Error('Committed IQ-0B corpus artifacts are unavailable.');
  }
  const visibleArtifacts = new Map<string, unknown>();
  for (const name of readdirSync(artifactDirectory).sort()) {
    if (!/^iq0b-(?:dev|adv)-[a-z0-9][a-z0-9-]*-candidate\.json$/.test(name)) continue;
    const relativePath = `${PUBLIC_CORPUS_DIR}/${name}`;
    visibleArtifacts.set(relativePath, readJson(resolve(ROOT, relativePath)));
  }
  return {
    corpus: readJson(corpusPath),
    evidenceBundle: readJson(evidencePath),
    visibleArtifacts,
    reviewLinkageFixture: readJson(reviewPath),
  };
}

function main(): void {
  const result = verifyAnswerQualityCorpus(readCommittedAnswerQualityCorpus());
  for (const issue of result.issues) process.stdout.write(`[FAIL] ${issue.code} ${issue.path}\n`);
  if (!result.ok) process.exit(1);
  process.stdout.write(
    `[PASS] IQ-0B public synthetic career corpus: ${result.developmentCaseCount} development / ${result.adversarialCaseCount} adversarial / ${result.visibleArtifactCount} candidate artifacts / ${result.reviewRecordsVerified} synthetic linkage records\n`,
  );
}

const entry = process.argv[1];
if (entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url)) main();
