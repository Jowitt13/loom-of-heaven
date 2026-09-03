import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ApprovedAnswerClaim,
  type ApprovedAnswerClaim as ApprovedAnswerClaimValue,
} from '../../packages/contracts/src/answer-claim.ts';

/**
 * IQ-2A is a development-only verifier for fixed, synthetic lexical cases.
 *
 * It establishes that the adversarial fixture has a reproducible way to bind
 * visible assertions to approved claims and their declared boundaries. It is
 * deliberately not a general natural-language-understanding system: arbitrary
 * production prose, truth, naturalness, usefulness and prediction validity
 * remain outside this verifier's scope.
 */

export type AnswerFaithfulnessIssueCode =
  | 'FIXTURE_SHAPE'
  | 'CASE_SET'
  | 'APPROVED_CLAIM'
  | 'BOUNDARY_LINKAGE'
  | 'ASSERTION_LINKAGE'
  | 'FACTUAL_ASSERTION_UNSUPPORTED'
  | 'FACTUAL_ASSERTION_CONTRADICTED'
  | 'PROFESSIONAL_TERM_UNSUPPORTED'
  | 'MECHANISM_LEAP'
  | 'SCOPE_OVERREACH'
  | 'MATERIAL_CONDITION_OMITTED'
  | 'FORBIDDEN_FOOTER_LEAKAGE'
  | 'PRIVACY'
  | 'RESULT_EXPECTATION';

export interface AnswerFaithfulnessIssue {
  code: AnswerFaithfulnessIssueCode;
  path: string;
}

export type AssertionSupportStatus = 'supported' | 'unsupported' | 'contradicted';

export interface AssertionAssessment {
  caseId: string;
  assertionId: string;
  status: AssertionSupportStatus;
  findingCodes: readonly AnswerFaithfulnessIssueCode[];
}

export interface AnswerFaithfulnessResult {
  ok: boolean;
  caseCount: number;
  supportedAssertionCount: number;
  unsupportedAssertionCount: number;
  contradictedAssertionCount: number;
  assessments: readonly AssertionAssessment[];
  issues: readonly AnswerFaithfulnessIssue[];
}

export interface AnswerFaithfulnessInputs {
  fixture: unknown;
}

type JsonRecord = Record<string, unknown>;

type ScenarioId =
  | 'supported-fact'
  | 'wrong-chart-swap'
  | 'leading-user-contradiction'
  | 'invented-professional-term'
  | 'causal-jump-and-scope-overreach'
  | 'omitted-material-condition'
  | 'forbidden-footer-leakage';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE_PATH = 'evals/fixtures/synthetic/iq2a-answer-faithfulness-fixture.json';

const FIXTURE_KEYS = [
  'contractVersion',
  'fixtureId',
  'fixtureKind',
  'mode',
  'topic',
  'cases',
  'exclusionPolicy',
];
const CASE_KEYS = [
  'caseId',
  'split',
  'fixtureKind',
  'scenarioId',
  'visibleText',
  'approvedClaims',
  'claimBoundaries',
  'assertions',
];
const CLAIM_BOUNDARY_KEYS = ['claimId', 'allowedScope', 'materialConditionText'];
const ASSERTION_KEYS = [
  'assertionId',
  'kind',
  'text',
  'claimId',
  'assertedSystem',
  'mechanismRef',
  'assertedScope',
];
const FORBIDDEN_KEYS = new Set([
  'rawanswer',
  'rawtranscript',
  'rawuserprompt',
  'prompt',
  'originalinput',
  'birthinput',
  'personaldata',
  'modelreasoning',
  'chainofthought',
  'providerresponse',
  'tokenlog',
]);
const FORBIDDEN_FOOTER_MARKERS = ['敏感项校对', '引擎警告', '专业依据', '声明', '免责声明'];

const EXPECTED_CASES: ReadonlyArray<{
  caseId: string;
  split: 'development' | 'adversarial';
  scenarioId: ScenarioId;
  visibleText: string;
  findingCodes: readonly AnswerFaithfulnessIssueCode[];
}> = [
  {
    caseId: 'case:synthetic:career:iq2a-supported-fact',
    split: 'development',
    scenarioId: 'supported-fact',
    visibleText: '合成八字线索支持把工作拆成可复盘的小阶段，以便稳定推进节奏。',
    findingCodes: [],
  },
  {
    caseId: 'case:synthetic:career:iq2a-wrong-chart-swap',
    split: 'adversarial',
    scenarioId: 'wrong-chart-swap',
    visibleText: '合成西方线索支持把工作拆成可复盘的小阶段，以便稳定推进节奏。',
    findingCodes: ['FACTUAL_ASSERTION_CONTRADICTED'],
  },
  {
    caseId: 'case:synthetic:career:iq2a-leading-user-contradiction',
    split: 'adversarial',
    scenarioId: 'leading-user-contradiction',
    visibleText: '你已经证明自己只适合独立工作，因此不需要再收集协作反馈。',
    findingCodes: ['FACTUAL_ASSERTION_UNSUPPORTED'],
  },
  {
    caseId: 'case:synthetic:career:iq2a-invented-professional-term',
    split: 'adversarial',
    scenarioId: 'invented-professional-term',
    visibleText: '合成结构属于杀印相生，所以现在适合扩大职业判断。',
    findingCodes: ['PROFESSIONAL_TERM_UNSUPPORTED'],
  },
  {
    caseId: 'case:synthetic:career:iq2a-causal-jump-and-scope-overreach',
    split: 'adversarial',
    scenarioId: 'causal-jump-and-scope-overreach',
    visibleText: '因为任务边界较清晰，所以你天生适合做产品经理，其他行业都不适合。',
    findingCodes: ['MECHANISM_LEAP', 'SCOPE_OVERREACH'],
  },
  {
    caseId: 'case:synthetic:career:iq2a-omitted-material-condition',
    split: 'adversarial',
    scenarioId: 'omitted-material-condition',
    visibleText: '可以先把工作拆成小阶段，再观察推进节奏。',
    findingCodes: ['MATERIAL_CONDITION_OMITTED'],
  },
  {
    caseId: 'case:synthetic:career:iq2a-forbidden-footer-leakage',
    split: 'adversarial',
    scenarioId: 'forbidden-footer-leakage',
    visibleText: '合成八字线索支持先整理一份成果样本，再判断下一步。\n\n声明：以上仅供参考。',
    findingCodes: ['FORBIDDEN_FOOTER_LEAKAGE'],
  },
];

function record(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function exactKeys(value: JsonRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index])
  );
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function add(
  issues: AnswerFaithfulnessIssue[],
  code: AnswerFaithfulnessIssueCode,
  path: string,
): void {
  issues.push({ code, path });
}

function inspectForbidden(value: unknown, path: string, issues: AnswerFaithfulnessIssue[]): void {
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

function claimBoundaryMap(
  raw: unknown,
  claims: ReadonlyMap<string, ApprovedAnswerClaimValue>,
  path: string,
  issues: AnswerFaithfulnessIssue[],
): ReadonlyMap<string, { allowedScope: string; materialConditionText: string | null }> {
  const boundaries = new Map<
    string,
    { allowedScope: string; materialConditionText: string | null }
  >();
  if (!Array.isArray(raw) || raw.length !== claims.size) {
    add(issues, 'BOUNDARY_LINKAGE', path);
    return boundaries;
  }
  for (const [index, value] of raw.entries()) {
    const item = record(value);
    const itemPath = `${path}[${index}]`;
    if (
      item === null ||
      !exactKeys(item, CLAIM_BOUNDARY_KEYS) ||
      typeof item.claimId !== 'string' ||
      typeof item.allowedScope !== 'string' ||
      item.allowedScope.length === 0 ||
      (typeof item.materialConditionText !== 'string' && item.materialConditionText !== null) ||
      boundaries.has(item.claimId) ||
      !claims.has(item.claimId)
    ) {
      add(issues, 'BOUNDARY_LINKAGE', itemPath);
      continue;
    }
    const claim = claims.get(item.claimId)!;
    const requiresCondition = claim.constraintRefs.length > 0;
    if (requiresCondition !== (item.materialConditionText !== null)) {
      add(issues, 'BOUNDARY_LINKAGE', itemPath);
    }
    boundaries.set(item.claimId, {
      allowedScope: item.allowedScope,
      materialConditionText: item.materialConditionText,
    });
  }
  if (boundaries.size !== claims.size) add(issues, 'BOUNDARY_LINKAGE', path);
  return boundaries;
}

function issueCodesFor(
  assertion: JsonRecord,
  claims: ReadonlyMap<string, ApprovedAnswerClaimValue>,
  boundaries: ReadonlyMap<string, { allowedScope: string; materialConditionText: string | null }>,
): { status: AssertionSupportStatus; findingCodes: AnswerFaithfulnessIssueCode[] } {
  const claimId = assertion.claimId;
  if (typeof claimId !== 'string') {
    return { status: 'unsupported', findingCodes: ['FACTUAL_ASSERTION_UNSUPPORTED'] };
  }
  const claim = claims.get(claimId);
  const boundary = boundaries.get(claimId);
  if (claim === undefined || boundary === undefined) {
    return { status: 'unsupported', findingCodes: ['ASSERTION_LINKAGE'] };
  }
  if (assertion.assertedSystem !== claim.system) {
    return { status: 'contradicted', findingCodes: ['FACTUAL_ASSERTION_CONTRADICTED'] };
  }
  if (assertion.kind === 'professional-mechanism') {
    if (
      typeof assertion.mechanismRef !== 'string' ||
      !claim.mechanismRefs.includes(assertion.mechanismRef)
    ) {
      return { status: 'unsupported', findingCodes: ['PROFESSIONAL_TERM_UNSUPPORTED'] };
    }
    return { status: 'supported', findingCodes: [] };
  }
  if (assertion.kind === 'mechanism-to-implication') {
    if (
      typeof assertion.mechanismRef !== 'string' ||
      !claim.mechanismRefs.includes(assertion.mechanismRef)
    ) {
      return { status: 'unsupported', findingCodes: ['PROFESSIONAL_TERM_UNSUPPORTED'] };
    }
    if (assertion.assertedScope !== boundary.allowedScope) {
      return { status: 'supported', findingCodes: ['MECHANISM_LEAP', 'SCOPE_OVERREACH'] };
    }
  }
  return { status: 'supported', findingCodes: [] };
}

function expectedForCase(index: number): (typeof EXPECTED_CASES)[number] | undefined {
  return EXPECTED_CASES[index];
}

/**
 * Verify the fixed IQ-2A synthetic cases. The result categories are bounded
 * assertion-linkage diagnostics, never a semantic-quality or accuracy score.
 */
export function verifyAnswerFaithfulness(
  inputs: AnswerFaithfulnessInputs,
): AnswerFaithfulnessResult {
  const issues: AnswerFaithfulnessIssue[] = [];
  const assessments: AssertionAssessment[] = [];
  inspectForbidden(inputs.fixture, '$.fixture', issues);
  const fixture = record(inputs.fixture);
  if (
    fixture === null ||
    !exactKeys(fixture, FIXTURE_KEYS) ||
    fixture.contractVersion !== 'answer-faithfulness-fixture/v1' ||
    fixture.fixtureId !== 'synthetic:iq2a-final-answer-faithfulness' ||
    fixture.fixtureKind !== 'synthetic-technical' ||
    fixture.mode !== 'bounded-lexical-claim-faithfulness-only' ||
    fixture.topic !== 'career' ||
    !Array.isArray(fixture.exclusionPolicy) ||
    !fixture.exclusionPolicy.includes('no-score-or-accuracy-claim')
  ) {
    add(issues, 'FIXTURE_SHAPE', '$.fixture');
    return {
      ok: false,
      caseCount: 0,
      supportedAssertionCount: 0,
      unsupportedAssertionCount: 0,
      contradictedAssertionCount: 0,
      assessments,
      issues,
    };
  }

  const cases = fixture.cases;
  if (!Array.isArray(cases) || cases.length !== EXPECTED_CASES.length) {
    add(issues, 'CASE_SET', '$.fixture.cases');
  } else {
    for (const [index, rawCase] of cases.entries()) {
      const item = record(rawCase);
      const path = `$.fixture.cases[${index}]`;
      const expected = expectedForCase(index);
      if (
        item === null ||
        expected === undefined ||
        !exactKeys(item, CASE_KEYS) ||
        item.caseId !== expected.caseId ||
        item.split !== expected.split ||
        item.fixtureKind !== 'synthetic-technical' ||
        item.scenarioId !== expected.scenarioId ||
        typeof item.visibleText !== 'string' ||
        item.visibleText !== expected.visibleText
      ) {
        add(issues, 'CASE_SET', path);
        continue;
      }
      const caseId = item.caseId as string;
      const visibleText = item.visibleText as string;

      const claims = new Map<string, ApprovedAnswerClaimValue>();
      if (!Array.isArray(item.approvedClaims) || item.approvedClaims.length < 1) {
        add(issues, 'APPROVED_CLAIM', `${path}.approvedClaims`);
      } else {
        for (const [claimIndex, rawClaim] of item.approvedClaims.entries()) {
          const parsed = ApprovedAnswerClaim.safeParse(rawClaim);
          if (!parsed.success || claims.has(parsed.data.claimId)) {
            add(issues, 'APPROVED_CLAIM', `${path}.approvedClaims[${claimIndex}]`);
            continue;
          }
          claims.set(parsed.data.claimId, parsed.data);
        }
      }

      const boundaries = claimBoundaryMap(
        item.claimBoundaries,
        claims,
        `${path}.claimBoundaries`,
        issues,
      );
      const caseFindings: AnswerFaithfulnessIssueCode[] = [];
      if (!Array.isArray(item.assertions) || item.assertions.length < 1) {
        add(issues, 'ASSERTION_LINKAGE', `${path}.assertions`);
      } else {
        const assertionIds = new Set<string>();
        for (const [assertionIndex, rawAssertion] of item.assertions.entries()) {
          const assertion = record(rawAssertion);
          const assertionPath = `${path}.assertions[${assertionIndex}]`;
          if (
            assertion === null ||
            !exactKeys(assertion, ASSERTION_KEYS) ||
            typeof assertion.assertionId !== 'string' ||
            assertionIds.has(assertion.assertionId) ||
            !['factual', 'professional-mechanism', 'mechanism-to-implication'].includes(
              String(assertion.kind),
            ) ||
            typeof assertion.text !== 'string' ||
            assertion.text.length === 0 ||
            !visibleText.includes(assertion.text) ||
            (assertion.claimId !== null && typeof assertion.claimId !== 'string') ||
            (assertion.assertedSystem !== null &&
              !['western', 'bazi', 'ziwei', 'vedic'].includes(String(assertion.assertedSystem))) ||
            (assertion.mechanismRef !== null && typeof assertion.mechanismRef !== 'string') ||
            (assertion.assertedScope !== null && typeof assertion.assertedScope !== 'string')
          ) {
            add(issues, 'ASSERTION_LINKAGE', assertionPath);
            continue;
          }
          assertionIds.add(assertion.assertionId);
          const outcome = issueCodesFor(assertion, claims, boundaries);
          outcome.findingCodes.forEach((code) => {
            add(issues, code, assertionPath);
            caseFindings.push(code);
          });
          assessments.push({
            caseId,
            assertionId: assertion.assertionId,
            status: outcome.status,
            findingCodes: outcome.findingCodes,
          });
        }
      }

      for (const [claimId, boundary] of boundaries) {
        if (
          boundary.materialConditionText !== null &&
          !visibleText.includes(boundary.materialConditionText)
        ) {
          add(issues, 'MATERIAL_CONDITION_OMITTED', `${path}.claimBoundaries.${claimId}`);
          caseFindings.push('MATERIAL_CONDITION_OMITTED');
        }
      }
      if (FORBIDDEN_FOOTER_MARKERS.some((marker) => visibleText.includes(marker))) {
        add(issues, 'FORBIDDEN_FOOTER_LEAKAGE', `${path}.visibleText`);
        caseFindings.push('FORBIDDEN_FOOTER_LEAKAGE');
      }
      if (!sameStrings(caseFindings, expected.findingCodes)) {
        add(issues, 'RESULT_EXPECTATION', `${path}.scenarioId`);
      }
    }
  }

  const supportedAssertionCount = assessments.filter((item) => item.status === 'supported').length;
  const unsupportedAssertionCount = assessments.filter(
    (item) => item.status === 'unsupported',
  ).length;
  const contradictedAssertionCount = assessments.filter(
    (item) => item.status === 'contradicted',
  ).length;
  return {
    ok: !issues.some(
      (issue) =>
        ![
          'FACTUAL_ASSERTION_UNSUPPORTED',
          'FACTUAL_ASSERTION_CONTRADICTED',
          'PROFESSIONAL_TERM_UNSUPPORTED',
          'MECHANISM_LEAP',
          'SCOPE_OVERREACH',
          'MATERIAL_CONDITION_OMITTED',
          'FORBIDDEN_FOOTER_LEAKAGE',
        ].includes(issue.code),
    ),
    caseCount: Array.isArray(cases) ? cases.length : 0,
    supportedAssertionCount,
    unsupportedAssertionCount,
    contradictedAssertionCount,
    assessments,
    issues,
  };
}

export function readCommittedAnswerFaithfulnessFixture(): AnswerFaithfulnessInputs {
  const path = resolve(ROOT, FIXTURE_PATH);
  if (!existsSync(path)) throw new Error('Committed IQ-2A faithfulness fixture is unavailable.');
  return { fixture: JSON.parse(readFileSync(path, 'utf8')) as unknown };
}

function main(): void {
  const result = verifyAnswerFaithfulness(readCommittedAnswerFaithfulnessFixture());
  for (const issue of result.issues) process.stdout.write(`[CHECK] ${issue.code} ${issue.path}\n`);
  if (!result.ok) process.exit(1);
  process.stdout.write(
    `[PASS] IQ-2A bounded synthetic faithfulness: ${result.caseCount} cases / ${result.supportedAssertionCount} supported / ${result.unsupportedAssertionCount} unsupported / ${result.contradictedAssertionCount} contradicted assertions\n`,
  );
}

const entry = process.argv[1];
if (entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url)) main();
