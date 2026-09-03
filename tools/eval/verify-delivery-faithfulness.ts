import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ApprovedAnswerClaim,
  type ApprovedAnswerClaim as ApprovedAnswerClaimValue,
  NarrativeTrace,
  type NarrativeTrace as NarrativeTraceValue,
} from '../../packages/contracts/src/answer-claim.ts';
import { verifyNarrativeTrace } from '../../packages/interpret/src/answer-claim-chain.ts';

/**
 * IQ-2B verifies a transient delivery-artifact boundary in development only.
 *
 * It checks that a supplied visible delivery text can be reconstructed from
 * trace-bound paragraphs, approved claims and bounded span records. It does
 * not interpret arbitrary Chinese prose, rate answer quality, or provide a
 * runtime/narrator/CLI integration point.
 */

export type DeliveryFaithfulnessIssueCode =
  | 'ARTIFACT_SHAPE'
  | 'APPROVED_CLAIM'
  | 'PARAGRAPH_LINKAGE'
  | 'TRACE_LINKAGE'
  | 'ASSERTION_LINKAGE'
  | 'FACTUAL_ASSERTION_UNSUPPORTED'
  | 'FACTUAL_ASSERTION_CONTRADICTED'
  | 'PROFESSIONAL_TERM_UNSUPPORTED'
  | 'MATERIAL_CONDITION_OMITTED'
  | 'FORBIDDEN_FOOTER_LEAKAGE'
  | 'PRIVACY';

export interface DeliveryFaithfulnessIssue {
  code: DeliveryFaithfulnessIssueCode;
  path: string;
}

export interface DeliveryFaithfulnessResult {
  ok: boolean;
  paragraphIds: readonly string[];
  assertionIds: readonly string[];
  issues: readonly DeliveryFaithfulnessIssue[];
}

export interface DeliveryFaithfulnessInputs {
  artifact: unknown;
}

type JsonRecord = Record<string, unknown>;

type ParagraphRecord = {
  paragraphId: string;
  start: number;
  end: number;
  trace: NarrativeTraceValue;
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE_PATH = 'evals/fixtures/synthetic/iq2b-delivery-faithfulness-artifact.json';
const ARTIFACT_KEYS = [
  'contractVersion',
  'artifactId',
  'fixtureKind',
  'mode',
  'topic',
  'transient',
  'regenerable',
  'visibleText',
  'approvedClaims',
  'paragraphs',
  'assertionSpans',
  'conditionSpans',
  'exclusionPolicy',
];
const PARAGRAPH_KEYS = ['paragraphId', 'start', 'end', 'trace'];
const ASSERTION_KEYS = [
  'assertionId',
  'paragraphId',
  'start',
  'end',
  'claimId',
  'assertedSystem',
  'kind',
  'mechanismRef',
];
const CONDITION_KEYS = ['conditionId', 'paragraphId', 'start', 'end', 'claimId', 'kind', 'index'];
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

function record(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function exactKeys(value: JsonRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function add(
  issues: DeliveryFaithfulnessIssue[],
  code: DeliveryFaithfulnessIssueCode,
  path: string,
): void {
  issues.push({ code, path });
}

function inspectForbidden(value: unknown, path: string, issues: DeliveryFaithfulnessIssue[]): void {
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

function isIndex(value: unknown, maxExclusive: number): value is number {
  return Number.isInteger(value) && typeof value === 'number' && value >= 0 && value < maxExclusive;
}

function isSpan(
  start: number,
  end: number,
  visibleText: string,
  paragraph: ParagraphRecord | undefined,
): paragraph is ParagraphRecord {
  return (
    isIndex(start, visibleText.length) &&
    Number.isInteger(end) &&
    end > start &&
    end <= visibleText.length &&
    paragraph !== undefined &&
    start >= paragraph.start &&
    end <= paragraph.end &&
    visibleText.slice(start, end).trim().length > 0
  );
}

function constraintKey(claimId: string, kind: string, index: number): string {
  return `${claimId}:${kind}:${index}`;
}

/**
 * Validates a caller-supplied transient delivery artifact. The source tree
 * currently invokes it only with the committed synthetic fixture; a later
 * runtime adapter must receive separate admission before it can call this.
 */
export function verifyDeliveryFaithfulnessArtifact(
  inputs: DeliveryFaithfulnessInputs,
): DeliveryFaithfulnessResult {
  const issues: DeliveryFaithfulnessIssue[] = [];
  const paragraphIds: string[] = [];
  const assertionIds: string[] = [];
  inspectForbidden(inputs.artifact, '$.artifact', issues);

  const artifact = record(inputs.artifact);
  if (
    artifact === null ||
    !exactKeys(artifact, ARTIFACT_KEYS) ||
    artifact.contractVersion !== 'delivery-faithfulness-artifact/v1' ||
    typeof artifact.artifactId !== 'string' ||
    !/^synthetic:iq2b-delivery-artifact-[a-z0-9-]+$/.test(artifact.artifactId) ||
    artifact.fixtureKind !== 'synthetic-technical' ||
    artifact.mode !== 'transient-delivery-linkage-only' ||
    artifact.topic !== 'career' ||
    artifact.transient !== true ||
    artifact.regenerable !== true ||
    typeof artifact.visibleText !== 'string' ||
    artifact.visibleText.length === 0 ||
    !Array.isArray(artifact.exclusionPolicy) ||
    !artifact.exclusionPolicy.includes('no-persistence') ||
    !artifact.exclusionPolicy.includes('no-score-or-accuracy-claim')
  ) {
    add(issues, 'ARTIFACT_SHAPE', '$.artifact');
    return { ok: false, paragraphIds, assertionIds, issues };
  }

  const visibleText = artifact.visibleText;
  const claims = new Map<string, ApprovedAnswerClaimValue>();
  if (!Array.isArray(artifact.approvedClaims) || artifact.approvedClaims.length === 0) {
    add(issues, 'APPROVED_CLAIM', '$.artifact.approvedClaims');
  } else {
    for (const [index, value] of artifact.approvedClaims.entries()) {
      const parsed = ApprovedAnswerClaim.safeParse(value);
      if (
        !parsed.success ||
        claims.has(parsed.data.claimId) ||
        parsed.data.topic !== artifact.topic
      ) {
        add(issues, 'APPROVED_CLAIM', `$.artifact.approvedClaims[${index}]`);
        continue;
      }
      claims.set(parsed.data.claimId, parsed.data);
    }
  }

  const paragraphs = new Map<string, ParagraphRecord>();
  const traces = new Set<string>();
  let previousEnd = 0;
  if (!Array.isArray(artifact.paragraphs) || artifact.paragraphs.length === 0) {
    add(issues, 'PARAGRAPH_LINKAGE', '$.artifact.paragraphs');
  } else {
    for (const [index, value] of artifact.paragraphs.entries()) {
      const item = record(value);
      const path = `$.artifact.paragraphs[${index}]`;
      if (
        item === null ||
        !exactKeys(item, PARAGRAPH_KEYS) ||
        typeof item.paragraphId !== 'string' ||
        paragraphs.has(item.paragraphId) ||
        !isIndex(item.start, visibleText.length) ||
        typeof item.end !== 'number' ||
        !Number.isInteger(item.end) ||
        item.end <= item.start ||
        item.end > visibleText.length ||
        item.start < previousEnd ||
        !/^\s*$/.test(visibleText.slice(previousEnd, item.start))
      ) {
        add(issues, 'PARAGRAPH_LINKAGE', path);
        continue;
      }
      const parsedTrace = NarrativeTrace.safeParse(item.trace);
      if (
        !parsedTrace.success ||
        parsedTrace.data.paragraphId !== item.paragraphId ||
        traces.has(parsedTrace.data.traceId) ||
        parsedTrace.data.topic !== artifact.topic ||
        parsedTrace.data.visibleText !== visibleText.slice(item.start, item.end)
      ) {
        add(issues, 'PARAGRAPH_LINKAGE', `${path}.trace`);
        continue;
      }
      const traceVerification = verifyNarrativeTrace(parsedTrace.data, [...claims.values()]);
      if (!traceVerification.ok) {
        add(issues, 'TRACE_LINKAGE', `${path}.trace`);
        continue;
      }
      previousEnd = item.end;
      traces.add(parsedTrace.data.traceId);
      paragraphs.set(item.paragraphId, {
        paragraphId: item.paragraphId,
        start: item.start,
        end: item.end,
        trace: parsedTrace.data,
      });
      paragraphIds.push(item.paragraphId);
    }
    if (
      paragraphs.size !== artifact.paragraphs.length ||
      !/^\s*$/.test(visibleText.slice(previousEnd))
    ) {
      add(issues, 'PARAGRAPH_LINKAGE', '$.artifact.paragraphs');
    }
  }

  const representedClaims = new Set<string>();
  const occupiedAssertionSpans: Array<{ start: number; end: number }> = [];
  const seenAssertions = new Set<string>();
  if (!Array.isArray(artifact.assertionSpans) || artifact.assertionSpans.length === 0) {
    add(issues, 'ASSERTION_LINKAGE', '$.artifact.assertionSpans');
  } else {
    for (const [index, value] of artifact.assertionSpans.entries()) {
      const item = record(value);
      const path = `$.artifact.assertionSpans[${index}]`;
      const paragraph = item === null ? undefined : paragraphs.get(String(item.paragraphId));
      if (
        item === null ||
        !exactKeys(item, ASSERTION_KEYS) ||
        typeof item.assertionId !== 'string' ||
        seenAssertions.has(item.assertionId) ||
        typeof item.paragraphId !== 'string' ||
        typeof item.claimId !== 'string' ||
        !['western', 'bazi', 'ziwei', 'vedic'].includes(String(item.assertedSystem)) ||
        !['factual', 'professional-mechanism', 'mechanism-to-implication'].includes(
          String(item.kind),
        ) ||
        typeof item.start !== 'number' ||
        typeof item.end !== 'number' ||
        !isSpan(item.start, item.end, visibleText, paragraph)
      ) {
        add(issues, 'ASSERTION_LINKAGE', path);
        continue;
      }
      const assertionStart = item.start as number;
      const assertionEnd = item.end as number;
      const overlaps = occupiedAssertionSpans.some(
        (span) => assertionStart < span.end && assertionEnd > span.start,
      );
      if (overlaps) {
        add(issues, 'ASSERTION_LINKAGE', path);
        continue;
      }
      occupiedAssertionSpans.push({ start: assertionStart, end: assertionEnd });
      seenAssertions.add(item.assertionId);
      assertionIds.push(item.assertionId);
      const claim = claims.get(item.claimId);
      if (claim === undefined) {
        add(issues, 'FACTUAL_ASSERTION_UNSUPPORTED', path);
        continue;
      }
      if (item.assertedSystem !== claim.system) {
        add(issues, 'FACTUAL_ASSERTION_CONTRADICTED', path);
        continue;
      }
      if (!paragraph.trace.approvedClaimIds.includes(item.claimId)) {
        add(issues, 'ASSERTION_LINKAGE', path);
        continue;
      }
      if (item.kind === 'factual') {
        if (item.mechanismRef !== null) add(issues, 'ASSERTION_LINKAGE', path);
      } else if (
        typeof item.mechanismRef !== 'string' ||
        !claim.mechanismRefs.includes(item.mechanismRef) ||
        !paragraph.trace.mechanismRefs.includes(item.mechanismRef)
      ) {
        add(issues, 'PROFESSIONAL_TERM_UNSUPPORTED', path);
        continue;
      }
      representedClaims.add(item.claimId);
    }
  }

  for (const paragraph of paragraphs.values()) {
    for (const claimId of paragraph.trace.approvedClaimIds) {
      if (!representedClaims.has(claimId)) {
        add(issues, 'ASSERTION_LINKAGE', `$.artifact.paragraphs.${paragraph.paragraphId}.trace`);
      }
    }
  }
  for (const claimId of claims.keys()) {
    if (!representedClaims.has(claimId)) add(issues, 'APPROVED_CLAIM', '$.artifact.approvedClaims');
  }

  const seenConditions = new Set<string>();
  const representedConditions = new Set<string>();
  if (!Array.isArray(artifact.conditionSpans)) {
    add(issues, 'MATERIAL_CONDITION_OMITTED', '$.artifact.conditionSpans');
  } else {
    for (const [index, value] of artifact.conditionSpans.entries()) {
      const item = record(value);
      const path = `$.artifact.conditionSpans[${index}]`;
      const paragraph = item === null ? undefined : paragraphs.get(String(item.paragraphId));
      if (
        item === null ||
        !exactKeys(item, CONDITION_KEYS) ||
        typeof item.conditionId !== 'string' ||
        seenConditions.has(item.conditionId) ||
        typeof item.paragraphId !== 'string' ||
        typeof item.claimId !== 'string' ||
        !['disclaimer', 'caveat', 'warning'].includes(String(item.kind)) ||
        !Number.isInteger(item.index) ||
        typeof item.index !== 'number' ||
        typeof item.start !== 'number' ||
        typeof item.end !== 'number' ||
        !isSpan(item.start, item.end, visibleText, paragraph)
      ) {
        add(issues, 'MATERIAL_CONDITION_OMITTED', path);
        continue;
      }
      const conditionKind = item.kind as 'disclaimer' | 'caveat' | 'warning';
      const conditionIndex = item.index as number;
      const claim = claims.get(item.claimId);
      const key = constraintKey(item.claimId, conditionKind, conditionIndex);
      if (
        claim === undefined ||
        !paragraph.trace.approvedClaimIds.includes(item.claimId) ||
        !claim.constraintRefs.some(
          (ref) => ref.kind === conditionKind && ref.index === conditionIndex,
        ) ||
        !paragraph.trace.constraintRefs.some(
          (ref) => ref.kind === conditionKind && ref.index === conditionIndex,
        ) ||
        representedConditions.has(key)
      ) {
        add(issues, 'MATERIAL_CONDITION_OMITTED', path);
        continue;
      }
      seenConditions.add(item.conditionId);
      representedConditions.add(key);
    }
  }

  for (const paragraph of paragraphs.values()) {
    for (const claimId of paragraph.trace.approvedClaimIds) {
      const claim = claims.get(claimId);
      if (claim === undefined) continue;
      for (const ref of claim.constraintRefs) {
        const key = constraintKey(claimId, ref.kind, ref.index);
        if (!representedConditions.has(key)) {
          add(
            issues,
            'MATERIAL_CONDITION_OMITTED',
            `$.artifact.paragraphs.${paragraph.paragraphId}.trace`,
          );
        }
      }
    }
  }

  if (FORBIDDEN_FOOTER_MARKERS.some((marker) => visibleText.includes(marker))) {
    add(issues, 'FORBIDDEN_FOOTER_LEAKAGE', '$.artifact.visibleText');
  }

  return { ok: issues.length === 0, paragraphIds, assertionIds, issues };
}

export function readCommittedDeliveryFaithfulnessArtifact(): DeliveryFaithfulnessInputs {
  const path = resolve(ROOT, FIXTURE_PATH);
  if (!existsSync(path)) throw new Error('Committed IQ-2B delivery artifact is unavailable.');
  return { artifact: JSON.parse(readFileSync(path, 'utf8')) as unknown };
}

function main(): void {
  const result = verifyDeliveryFaithfulnessArtifact(readCommittedDeliveryFaithfulnessArtifact());
  for (const issue of result.issues) process.stdout.write(`[FAIL] ${issue.code} ${issue.path}\n`);
  if (!result.ok) process.exit(1);
  process.stdout.write('[PASS] IQ-2B synthetic transient delivery artifact linkage verified.\n');
}

const entry = process.argv[1];
if (entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url)) main();
