import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ANSWER_QUALITY_DIMENSIONS,
  ANSWER_QUALITY_FAILURE_MODES,
  ANSWER_QUALITY_JUDGMENTS,
  ANSWER_QUALITY_MACHINE_CHECKS,
  verifyAnswerQualityFoundation,
  type AnswerQualityFoundationInputs,
} from './eval/verify-answer-quality-foundation.ts';

const root = join(__dirname, '..');
const readJson = (relative: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(root, relative), 'utf8')) as Record<string, unknown>;
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const RUBRIC_PATH = 'evals/fixtures/synthetic/iq0a-answer-quality-rubric.json';
const RUBRIC_SCHEMA_PATH = 'evals/contracts/answer-quality-rubric.schema.json';
const CASE_SCHEMA_PATH = 'evals/contracts/answer-quality-case.schema.json';
const HOLDOUT_SCHEMA_PATH = 'evals/contracts/sealed-holdout-manifest.schema.json';
const CASE_V2_SCHEMA_PATH = 'evals/contracts/answer-quality-case-v2.schema.json';
const VISIBLE_SCHEMA_PATH = 'evals/contracts/answer-quality-visible-artifact.schema.json';
const REVIEW_SCHEMA_PATH = 'evals/contracts/answer-quality-review.schema.json';

function foundationInputs(): AnswerQualityFoundationInputs {
  return {
    rubric: readJson(RUBRIC_PATH),
    rubricSchema: readJson(RUBRIC_SCHEMA_PATH),
    caseSchema: readJson(CASE_SCHEMA_PATH),
    holdoutManifestSchema: readJson(HOLDOUT_SCHEMA_PATH),
    caseV2Schema: readJson(CASE_V2_SCHEMA_PATH),
    visibleArtifactSchema: readJson(VISIBLE_SCHEMA_PATH),
    reviewSchema: readJson(REVIEW_SCHEMA_PATH),
  };
}

function verify(inputs: AnswerQualityFoundationInputs = foundationInputs()) {
  return verifyAnswerQualityFoundation(inputs);
}

function issuesWithCode(result: ReturnType<typeof verify>, code: string) {
  return result.issues.filter((issue) => issue.code === code);
}

describe('IQ-0A answer-quality foundation', () => {
  it('accepts the committed rubric and repeats byte-identically', () => {
    const result = verify();
    expect(result).toEqual({
      ok: true,
      dimensionCount: 8,
      failureModeCount: 10,
      contractCount: 6,
      issues: [],
    });
    expect(verify()).toEqual(result);
  });

  it('locks the eight evaluation dimensions to the frozen set and order', () => {
    expect(ANSWER_QUALITY_DIMENSIONS).toEqual([
      'support-and-traceability',
      'mechanism-to-implication',
      'topic-specificity',
      'condition-and-caveat-fidelity',
      'cross-system-integrity',
      'restraint-and-boundaries',
      'presentation-cleanliness',
      'usefulness-without-invention',
    ]);

    const reordered = copy(foundationInputs());
    (reordered.rubric as Record<string, unknown>).dimensions = [
      'mechanism-to-implication',
      'support-and-traceability',
      'topic-specificity',
      'condition-and-caveat-fidelity',
      'cross-system-integrity',
      'restraint-and-boundaries',
      'presentation-cleanliness',
      'usefulness-without-invention',
    ];
    expect(issuesWithCode(verify(reordered), 'RUBRIC_SET')).toHaveLength(1);

    const shortened = copy(foundationInputs());
    (shortened.rubric as Record<string, unknown>).dimensions = ANSWER_QUALITY_DIMENSIONS.slice(
      0,
      7,
    );
    expect(issuesWithCode(verify(shortened), 'RUBRIC_SET')).toHaveLength(1);

    const duplicated = copy(foundationInputs());
    (duplicated.rubric as Record<string, unknown>).dimensions = [
      ...ANSWER_QUALITY_DIMENSIONS.slice(0, 7),
      'support-and-traceability',
    ];
    expect(issuesWithCode(verify(duplicated), 'RUBRIC_SET')).toHaveLength(1);
  });

  it('locks the ten failure modes to the frozen set and order', () => {
    expect(ANSWER_QUALITY_FAILURE_MODES).toEqual([
      'vague-prose',
      'term-dump',
      'unsupported-fact',
      'mechanism-leap',
      'cross-system-consensus-fabrication',
      'repeated-conclusion',
      'default-footer-clutter',
      'missing-material-condition',
      'jargon-without-concrete-implication',
      'unsupported-life-verdict',
    ]);

    const reordered = copy(foundationInputs());
    (reordered.rubric as Record<string, unknown>).failureModes = [
      'term-dump',
      'vague-prose',
      'unsupported-fact',
      'mechanism-leap',
      'cross-system-consensus-fabrication',
      'repeated-conclusion',
      'default-footer-clutter',
      'missing-material-condition',
      'jargon-without-concrete-implication',
      'unsupported-life-verdict',
    ];
    expect(issuesWithCode(verify(reordered), 'FAILURE_SET')).toHaveLength(1);

    const shortened = copy(foundationInputs());
    (shortened.rubric as Record<string, unknown>).failureModes = ANSWER_QUALITY_FAILURE_MODES.slice(
      0,
      9,
    );
    expect(issuesWithCode(verify(shortened), 'FAILURE_SET')).toHaveLength(1);
  });

  it('keeps the four judgments independent with no aggregate score anywhere', () => {
    expect(ANSWER_QUALITY_JUDGMENTS).toEqual([
      'meets',
      'needs-review',
      'does-not-meet',
      'not-applicable',
    ]);

    const swapped = copy(foundationInputs());
    (swapped.rubric as Record<string, unknown>).judgments = [
      'meets',
      'does-not-meet',
      'needs-review',
      'not-applicable',
    ];
    expect(issuesWithCode(verify(swapped), 'JUDGMENT_SET')).toHaveLength(1);

    const scored = copy(foundationInputs());
    (scored.rubric as Record<string, unknown>).score = 0.87;
    expect(issuesWithCode(verify(scored), 'FORBIDDEN_METRIC')).toHaveLength(1);

    for (const schemaPath of [RUBRIC_SCHEMA_PATH, CASE_SCHEMA_PATH, HOLDOUT_SCHEMA_PATH]) {
      const schema = readJson(schemaPath);
      const keys = Object.keys((schema.properties as Record<string, unknown>) ?? {});
      expect(
        keys.filter((key) => /score|weight|percent|confidence|accuracyrate|rating/i.test(key)),
        schemaPath,
      ).toEqual([]);
    }
  });

  it('rejects a fixture that self-reports extra machine checks or a drifted policy', () => {
    const extraCheck = copy(foundationInputs());
    (extraCheck.rubric as Record<string, unknown>).machineCheckIds = [
      ...ANSWER_QUALITY_MACHINE_CHECKS,
      'semantic-quality-approved',
    ];
    expect(issuesWithCode(verify(extraCheck), 'MACHINE_HUMAN_BOUNDARY')).toHaveLength(1);

    const driftedCheck = copy(foundationInputs());
    (driftedCheck.rubric as Record<string, unknown>).machineCheckIds = [
      'contract-shape',
      'id-set-and-order',
      'privacy-field-exclusion',
      'public-split-boundary',
      'holdout-metadata-only',
      'forbidden-metric-exclusion',
      'semantic-quality-approved',
    ];
    expect(issuesWithCode(verify(driftedCheck), 'MACHINE_HUMAN_BOUNDARY')).toHaveLength(1);

    const driftedPolicy = copy(foundationInputs());
    (driftedPolicy.rubric as Record<string, unknown>).humanReviewPolicy = {
      minReviewers: { development: 0, adversarial: 0, 'sealed-holdout': 0 },
      independentJudgmentThenReconcile: false,
      stableIdentifierOnly: false,
      aggregateScoresForbidden: false,
      criticalDimensionNoOffset: false,
    };
    expect(issuesWithCode(verify(driftedPolicy), 'MACHINE_HUMAN_BOUNDARY')).toHaveLength(1);
  });

  it('pins the case schema to public synthetic career splits only', () => {
    const caseSchema = readJson(CASE_SCHEMA_PATH) as Record<string, unknown>;
    expect(caseSchema.$id).toBe('loom:eval/answer-quality-case/v1');
    expect(caseSchema.additionalProperties).toBe(false);
    const properties = caseSchema.properties as Record<string, unknown>;
    const split = properties.split as Record<string, unknown>;
    expect(split.enum).toEqual(['development', 'adversarial', 'regression']);
    expect((properties.fixtureKind as Record<string, unknown>).const).toBe('synthetic-technical');
    expect((properties.topic as Record<string, unknown>).const).toBe('career');
  });

  it('makes a sealed-holdout split inexpressible in the case contract', () => {
    const holdoutSplit = copy(foundationInputs());
    const splitProperties = (holdoutSplit.caseSchema as Record<string, unknown>)
      .properties as Record<string, unknown>;
    (splitProperties.split as Record<string, unknown>).enum = [
      'development',
      'adversarial',
      'regression',
      'sealed-holdout',
    ];
    expect(issuesWithCode(verify(holdoutSplit), 'HOLDOUT_BOUNDARY').length).toBeGreaterThanOrEqual(
      1,
    );

    const holdoutTopic = copy(foundationInputs());
    const topicProperties = (holdoutTopic.caseSchema as Record<string, unknown>)
      .properties as Record<string, unknown>;
    (topicProperties.topic as Record<string, unknown>).const = 'sealed-holdout';
    // Topic drift is caught by the frozen-shape guard, and the committed topic
    // stays career-only (covered positively in the previous test).
    expect(issuesWithCode(verify(holdoutTopic), 'FOUNDATION_SHAPE')).toHaveLength(1);
  });

  it('keeps the sealed-holdout manifest metadata-only with a fixed lifecycle', () => {
    const holdoutSchema = readJson(HOLDOUT_SCHEMA_PATH) as Record<string, unknown>;
    expect(holdoutSchema.$id).toBe('loom:eval/sealed-holdout-manifest/v1');
    expect(holdoutSchema.additionalProperties).toBe(false);
    const properties = holdoutSchema.properties as Record<string, unknown>;
    const actualKeys = Object.keys(properties);
    expect(actualKeys.length).toBe(12);
    for (const key of [
      'contractVersion',
      'setId',
      'version',
      'topic',
      'rubricId',
      'caseCount',
      'contentDigest',
      'accessLogDigest',
      'status',
      'retiredCaseCount',
      'custodianRole',
      'replacementRequired',
    ]) {
      expect(actualKeys, `missing property ${key}`).toContain(key);
    }
    expect((properties.status as Record<string, unknown>).enum).toEqual([
      'planned',
      'active',
      'rotated',
      'retired',
    ]);

    const driftedStatus = copy(foundationInputs());
    const driftProperties = (driftedStatus.holdoutManifestSchema as Record<string, unknown>)
      .properties as Record<string, unknown>;
    (driftProperties.status as Record<string, unknown>).enum = [
      'planned',
      'active',
      'rotated',
      'retired',
      'leaked',
    ];
    expect(issuesWithCode(verify(driftedStatus), 'HOLDOUT_BOUNDARY')).toHaveLength(1);

    const driftedDigest = copy(foundationInputs());
    const digestProperties = (driftedDigest.holdoutManifestSchema as Record<string, unknown>)
      .properties as Record<string, unknown>;
    (digestProperties.contentDigest as Record<string, unknown>).pattern = '.*';
    expect(issuesWithCode(verify(driftedDigest), 'HOLDOUT_BOUNDARY')).toHaveLength(1);
  });

  it('rejects privacy fields without echoing the rejected values', () => {
    const sentinel = 'G0-IQ0A-PRIVATE-SENTINEL';
    const withPrompt = copy(foundationInputs());
    (withPrompt.rubric as Record<string, unknown>).prompt = sentinel;
    const result = verify(withPrompt);
    expect(result.ok).toBe(false);
    expect(issuesWithCode(result, 'PRIVACY').length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(result.issues)).not.toContain(sentinel);

    const nested = copy(foundationInputs());
    (nested.rubric as Record<string, unknown>).originalInput = { localDate: '1991-02-03' };
    const nestedResult = verify(nested);
    expect(issuesWithCode(nestedResult, 'PRIVACY').length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(nestedResult.issues)).not.toContain('1991-02-03');
  });

  it('rejects schema properties that carry privacy or metric semantics', () => {
    const reviewerField = copy(foundationInputs());
    const reviewerProperties = (reviewerField.caseSchema as Record<string, unknown>)
      .properties as Record<string, unknown>;
    delete reviewerProperties.rubricId;
    reviewerProperties.reviewerNotes = { type: 'string' };
    const reviewerResult = verify(reviewerField);
    expect(issuesWithCode(reviewerResult, 'PRIVACY').length).toBeGreaterThanOrEqual(1);

    const metricField = copy(foundationInputs());
    const metricProperties = (metricField.holdoutManifestSchema as Record<string, unknown>)
      .properties as Record<string, unknown>;
    metricProperties.score = { type: 'number' };
    expect(issuesWithCode(verify(metricField), 'FORBIDDEN_METRIC')).toHaveLength(1);
  });

  it('rejects runtime path references inside the foundation artifacts', () => {
    const runtimeRef = copy(foundationInputs());
    (runtimeRef.rubric as Record<string, unknown>).mode = 'wired into skills/ runtime';
    expect(issuesWithCode(verify(runtimeRef), 'RUNTIME_BOUNDARY')).toHaveLength(1);
  });

  it('rejects shape, contract-version, and id drift on the rubric', () => {
    const wrongVersion = copy(foundationInputs());
    (wrongVersion.rubric as Record<string, unknown>).contractVersion = 'answer-quality-rubric/v2';
    expect(issuesWithCode(verify(wrongVersion), 'FOUNDATION_SHAPE')).toHaveLength(1);

    const wrongRubricId = copy(foundationInputs());
    (wrongRubricId.rubric as Record<string, unknown>).rubricId = 'rubric:answer-quality:wealth-v1';
    expect(issuesWithCode(verify(wrongRubricId), 'FOUNDATION_SHAPE')).toHaveLength(1);

    const extraKey = copy(foundationInputs());
    (extraKey.rubric as Record<string, unknown>).qualityScore = 0.9;
    expect(issuesWithCode(verify(extraKey), 'FOUNDATION_SHAPE')).toHaveLength(1);
  });

  it('documents that machine checks cannot prove answer semantic quality', () => {
    const doc = readFileSync(join(root, 'docs', 'ANSWER_QUALITY_EVALUATION.md'), 'utf8');
    expect(doc).toContain('deterministic-assisted');
    expect(doc).toContain('human-required');
    expect(doc.toLowerCase()).toContain('cannot prove');
    expect(doc).toContain('human review');
  });

  it('documents the sealed-holdout retire-and-replace lifecycle', () => {
    const doc = readFileSync(join(root, 'docs', 'ANSWER_QUALITY_EVALUATION.md'), 'utf8');
    expect(doc).toContain('retired');
    expect(doc).toContain('replacement');
    expect(doc).toContain('never counted again as unseen evidence');
  });

  it('keeps IQ-0A out of all runtime entry points and free of runtime capabilities', () => {
    const read = (relative: string): string => readFileSync(join(root, relative), 'utf8');
    const tool = read('tools/eval/verify-answer-quality-foundation.ts');
    for (const identifier of [
      'verify-answer-quality-foundation',
      'answer-quality-rubric',
      'answer-quality-case',
      'sealed-holdout-manifest',
    ]) {
      for (const relative of [
        'packages/bazi-rules/src/index.ts',
        'packages/interpret/src/build.ts',
        'packages/contracts/src/index.ts',
        'skills/xuan-ji-yu-heng/scripts/loom-chart.mjs',
        'package.json',
      ]) {
        expect(read(relative), `${relative} must not reference ${identifier}`).not.toContain(
          identifier,
        );
      }
    }
    for (const forbidden of ['fetch(', 'http://', 'https://', 'child_process', 'openai']) {
      expect(tool).not.toContain(forbidden);
    }
  });

  it('has created no cases, no holdout contents, and no legacy answers', () => {
    const syntheticDir = join(root, 'evals', 'fixtures', 'synthetic');
    const iq0aFiles = readdirSync(syntheticDir).filter((name) => name.startsWith('iq0a'));
    expect(iq0aFiles).toEqual(['iq0a-answer-quality-rubric.json']);
    for (const name of readdirSync(syntheticDir)) {
      expect(name.includes('case') || name.includes('holdout'), name).toBe(false);
    }
    const rubric = readJson(RUBRIC_PATH);
    expect(rubric.cases).toBeUndefined();
    expect(rubric.caseCount).toBeUndefined();
    expect(rubric.contentDigest).toBeUndefined();
  });
});

describe('IQ-0A-R case carrier and review contract correction', () => {
  const caseV2Schema = () => readJson('evals/contracts/answer-quality-case-v2.schema.json');
  const visibleSchema = () =>
    readJson('evals/contracts/answer-quality-visible-artifact.schema.json');
  const reviewSchema = () => readJson('evals/contracts/answer-quality-review.schema.json');

  it('v1 case schema remains identity-only and unchanged', () => {
    const v1 = readJson('evals/contracts/answer-quality-case.schema.json') as Record<
      string,
      unknown
    >;
    expect(v1.$id).toBe('loom:eval/answer-quality-case/v1');
    const props = Object.keys(v1.properties as Record<string, unknown>);
    expect(props).toHaveLength(7);
    expect(props).not.toContain('question');
    expect(props).not.toContain('scenario');
    expect(props).not.toContain('evidenceArtifacts');
    expect(props).not.toContain('answerArtifact');
    expect(props).not.toContain('evaluationPlan');
  });

  it('v1 case schema rejects content fields with VERSION_BOUNDARY', () => {
    const v1 = copy(foundationInputs());
    const v1Props = (v1.caseSchema as Record<string, unknown>).properties as Record<
      string,
      unknown
    >;
    v1Props.question = { type: 'object' };
    expect(issuesWithCode(verify(v1), 'VERSION_BOUNDARY')).toContainEqual({
      code: 'VERSION_BOUNDARY',
      path: '$.caseSchema.properties.question',
    });
  });

  it('v2 case carrier is the active contract with correct version and identity', () => {
    const v2 = caseV2Schema();
    expect(v2.$id).toBe('loom:eval/answer-quality-case/v2');
    expect(v2.additionalProperties).toBe(false);
    expect(v2.required).toEqual([
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
    ]);
    expect((v2.properties as Record<string, unknown>).contractVersion).toEqual({
      const: 'answer-quality-case/v2',
    });
  });

  it('v2 question requires synthetic-only intent with bounded text', () => {
    const v2 = caseV2Schema();
    const question = (v2.properties as Record<string, unknown>).question as Record<string, unknown>;
    const qProps = question.properties as Record<string, unknown>;
    expect((qProps.intentId as Record<string, unknown>).enum).toEqual([
      'career-direction',
      'role-fit',
      'work-environment',
      'career-change',
      'collaboration',
      'timing-scope',
      'strengths-and-tradeoffs',
      'insufficient-evidence',
    ]);
    expect((qProps.syntheticText as Record<string, unknown>).maxLength).toBe(300);
    expect((qProps.syntheticOnly as Record<string, unknown>).const).toBe(true);
    expect((qProps.rawUserPromptExcluded as Record<string, unknown>).const).toBe(true);
  });

  it('v2 scenario uses frozen time-reliability, system-scope and challenge registries', () => {
    const v2 = caseV2Schema();
    const scenario = (v2.properties as Record<string, unknown>).scenario as Record<string, unknown>;
    const sProps = scenario.properties as Record<string, unknown>;
    expect((sProps.timeReliability as Record<string, unknown>).enum).toEqual([
      'exact',
      'approximate',
      'unknown',
      'not-relevant',
    ]);
    expect((sProps.systemScope as Record<string, unknown>).enum).toEqual([
      'single-system',
      'multi-system',
    ]);
    const challengeIds = sProps.challengeIds as Record<string, unknown>;
    expect(challengeIds.uniqueItems).toBe(true);
    expect((challengeIds.items as Record<string, unknown>).enum).toEqual([
      'ordinary',
      'source-blocked',
      'conflicting-signals',
      'leading-user',
      'missing-condition',
      'insufficient-evidence',
      'presentation-stress',
    ]);
  });

  it('v2 evidence artifacts require digests and anchored repo paths', () => {
    const v2 = caseV2Schema();
    const ea = (v2.properties as Record<string, unknown>).evidenceArtifacts as Record<
      string,
      unknown
    >;
    expect(ea.minItems).toBe(1);
    expect(ea.uniqueItems).toBe(true);
    const items = ea.items as Record<string, unknown>;
    expect((items.properties as Record<string, unknown>).digest).toEqual({
      type: 'string',
      pattern: '^sha256:[a-f0-9]{64}$',
    });
    const repoPath = (items.properties as Record<string, unknown>).repoPath as Record<
      string,
      unknown
    >;
    const repoPatternStr = String(repoPath.pattern);
    expect(repoPatternStr).toBe('^evals/fixtures/synthetic/[a-z0-9][a-z0-9._-]*\\.json$');
  });

  it('v2 answer artifact references the visible-artifact contract and corpus path', () => {
    const v2 = caseV2Schema();
    const aa = (v2.properties as Record<string, unknown>).answerArtifact as Record<string, unknown>;
    const aaProps = aa.properties as Record<string, unknown>;
    expect((aaProps.contractVersion as Record<string, unknown>).const).toBe(
      'answer-quality-visible-artifact/v1',
    );
    const corpusPatternStr = String((aaProps.repoPath as Record<string, unknown>).pattern);
    expect(corpusPatternStr).toBe('^evals/corpus/public/career/[a-z0-9][a-z0-9._-]*\\.json$');
  });

  it('v2 evaluationPlan pins dimensions, critical dimensions, boundary ids and failure modes', () => {
    const v2 = caseV2Schema();
    const ep = (v2.properties as Record<string, unknown>).evaluationPlan as Record<string, unknown>;
    const epProps = ep.properties as Record<string, unknown>;
    expect((epProps.dimensionIds as Record<string, unknown>).enum).toEqual([
      ANSWER_QUALITY_DIMENSIONS,
    ]);
    expect((epProps.criticalDimensionIds as Record<string, unknown>).enum).toEqual([
      [
        'support-and-traceability',
        'condition-and-caveat-fidelity',
        'cross-system-integrity',
        'restraint-and-boundaries',
      ],
    ]);
    expect((epProps.humanReviewRequired as Record<string, unknown>).const).toBe(true);
  });

  it('visible artifact requires sanitization attestations and bounded visible text', () => {
    const va = visibleSchema();
    expect(va.$id).toBe('loom:eval/answer-quality-visible-artifact/v1');
    expect(va.additionalProperties).toBe(false);
    const props = va.properties as Record<string, unknown>;
    expect((props.visibleText as Record<string, unknown>).maxLength).toBe(12000);
    const sanitization = props.sanitization as Record<string, unknown>;
    const sProps = sanitization.properties as Record<string, unknown>;
    for (const key of [
      'syntheticInputOnly',
      'rawTranscriptExcluded',
      'rawPromptExcluded',
      'modelReasoningExcluded',
      'personalDataExcluded',
    ]) {
      expect((sProps[key] as Record<string, unknown>).const).toBe(true);
    }
    const producerClass = props.producerClass as Record<string, unknown>;
    expect(producerClass.enum).toEqual([
      'current-pipeline',
      'human-authored-synthetic',
      'host-assisted-sanitized',
    ]);
    const role = props.role as Record<string, unknown>;
    expect(role.enum).toEqual(['legacy-baseline', 'candidate', 'accepted-reference', 'regression']);
    const pipelineRevision = props.pipelineRevision as Record<string, unknown>;
    expect(pipelineRevision.pattern).toBe('^[a-f0-9]{40}$');
    expect((props.rulesetRefs as Record<string, unknown>).uniqueItems).toBe(true);
    expect((props.sourceArtifactDigests as Record<string, unknown>).uniqueItems).toBe(true);
  });

  it('review record pins exactly 8 judgments in rubric order', () => {
    const rv = reviewSchema();
    const judgments = (rv.properties as Record<string, unknown>).judgments as Record<
      string,
      unknown
    >;
    expect(judgments.minItems).toBe(8);
    expect(judgments.maxItems).toBe(8);
    expect(judgments.items).toBe(false);
    const prefixItems = judgments.prefixItems as Array<Record<string, unknown>>;
    expect(prefixItems).toHaveLength(8);
    prefixItems.forEach((entry, i) => {
      const props = entry.properties as Record<string, unknown>;
      expect((props.dimensionId as Record<string, unknown>).const).toBe(
        ANSWER_QUALITY_DIMENSIONS[i],
      );
    });
  });

  it('review record allows only random non-personal reviewer pseudonyms', () => {
    const rv = reviewSchema();
    const reviewerId = (rv.properties as Record<string, unknown>).reviewerId as Record<
      string,
      unknown
    >;
    const pattern = new RegExp(String(reviewerId.pattern));
    expect(pattern.test('reviewer:anon:0123456789abcdef')).toBe(true);
    expect(pattern.test('reviewer:john-smith')).toBe(false);
    expect(pattern.test('alice@example.com')).toBe(false);
    expect(pattern.test('reviewer:anon:johnsmith')).toBe(false);
    expect(pattern.test('reviewer:anon:1234')).toBe(false);
  });

  it('review sourceReviewIds is unique, empty for independent and bounded for reconciliation', () => {
    const rv = reviewSchema();
    const allOf = rv.allOf as Array<Record<string, unknown>>;
    expect(allOf).toHaveLength(2);
    const independentBranch = allOf[0] as Record<string, unknown>;
    const independentThen = independentBranch.then as Record<string, unknown>;
    const independentProps = independentThen.properties as Record<string, unknown>;
    expect((independentProps.sourceReviewIds as Record<string, unknown>).maxItems).toBe(0);
    const reconciliationBranch = allOf[1] as Record<string, unknown>;
    const reconciliationThen = reconciliationBranch.then as Record<string, unknown>;
    const reconciliationProps = reconciliationThen.properties as Record<string, unknown>;
    expect((reconciliationProps.sourceReviewIds as Record<string, unknown>).minItems).toBe(2);
    const reviewProperties = rv.properties as Record<string, unknown>;
    expect((reviewProperties.sourceReviewIds as Record<string, unknown>).uniqueItems).toBe(true);
  });

  it('fails closed when anonymous identity, unique review references, or JSON artifact paths drift', () => {
    const badReviewer = copy(foundationInputs());
    const badReviewerProperties = (badReviewer.reviewSchema as Record<string, unknown>)
      .properties as Record<string, unknown>;
    (badReviewerProperties.reviewerId as Record<string, unknown>).pattern = '^reviewer:.*$';
    expect(issuesWithCode(verify(badReviewer), 'REVIEW_RECORD_BOUNDARY')).toHaveLength(1);

    const duplicateReviews = copy(foundationInputs());
    const duplicateReviewProperties = (duplicateReviews.reviewSchema as Record<string, unknown>)
      .properties as Record<string, unknown>;
    (duplicateReviewProperties.sourceReviewIds as Record<string, unknown>).uniqueItems = false;
    expect(issuesWithCode(verify(duplicateReviews), 'REVIEW_RECORD_BOUNDARY')).toHaveLength(1);

    const badEvidencePath = copy(foundationInputs());
    const evidenceProperties = (
      (badEvidencePath.caseV2Schema as Record<string, unknown>).properties as Record<
        string,
        unknown
      >
    ).evidenceArtifacts as Record<string, unknown>;
    const evidenceItemProperties = (evidenceProperties.items as Record<string, unknown>)
      .properties as Record<string, unknown>;
    (evidenceItemProperties.repoPath as Record<string, unknown>).pattern =
      '^evals/fixtures/synthetic/[a-z0-9][a-z0-9._-]*$';
    expect(issuesWithCode(verify(badEvidencePath), 'CASE_CARRIER')).toHaveLength(1);
  });

  it('review record has no prose, score, weight or confidence fields', () => {
    const rv = reviewSchema();
    const keys = Object.keys(rv.properties as Record<string, unknown>);
    for (const key of keys) {
      expect(/score|weight|percent|confidence|rating/i.test(key), key).toBe(false);
    }
    expect(rv.additionalProperties).toBe(false);
  });

  it('documents the sanitized-visible-answer vs raw-transcript distinction', () => {
    const doc = readFileSync(join(root, 'docs', 'ANSWER_QUALITY_EVALUATION.md'), 'utf8');
    expect(doc).toContain('sanitized');
    expect(doc).toContain('raw');
    expect(doc).toContain('answer-quality-visible-artifact/v1');
    expect(doc).toContain('superseded-before-first-case');
  });

  it('documents that evals/README.md distinguishes sanitized visible answers from raw answers', () => {
    const readme = readFileSync(join(root, 'evals', 'README.md'), 'utf8');
    expect(readme).toContain('answer-quality-visible-artifact/v1');
    expect(readme).toContain('Sanitized visible answer');
    expect(readme).toContain('No corpus instances exist');
    expect(readme).toContain('reviewer:anon:<16-hex>');
  });

  it('documents that corpus verification, not the schema, proves cross-record review independence', () => {
    const doc = readFileSync(join(root, 'docs', 'ANSWER_QUALITY_EVALUATION.md'), 'utf8');
    expect(doc).toContain('does not prove that they name independent reviews');
    expect(doc).toContain('IQ-0B corpus verifier');
    expect(doc).toContain('review-reference cycle');
  });

  it('confirms no corpus instances exist', () => {
    expect(
      readdirSync(join(root, 'evals', 'fixtures', 'synthetic')).some(
        (n) => n.includes('case-') || n.includes('visible'),
      ),
    ).toBe(false);
  });
});
