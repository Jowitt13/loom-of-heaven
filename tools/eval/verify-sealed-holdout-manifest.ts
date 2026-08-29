import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * IQ-0C1 sealed-holdout governance verifier — development-only, offline and
 * metadata-only. It verifies the pre-activation public manifest; it never
 * reads, creates, or evaluates sealed content, reviewer materials or logs.
 */

export type SealedHoldoutManifestCode =
  | 'MANIFEST_SHAPE'
  | 'PLANNED_STATE'
  | 'DIGEST_BOUNDARY'
  | 'PRIVACY'
  | 'LIFECYCLE_BOUNDARY'
  | 'RUNTIME_BOUNDARY';

export interface SealedHoldoutManifestIssue {
  code: SealedHoldoutManifestCode;
  path: string;
}

export interface SealedHoldoutManifestResult {
  ok: boolean;
  status: 'planned' | null;
  caseCount: number | null;
  issues: readonly SealedHoldoutManifestIssue[];
}

export interface SealedHoldoutManifestInputs {
  manifest: unknown;
  schema: unknown;
}

type JsonRecord = Record<string, unknown>;

const EMPTY_SHA256 = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const MANIFEST_KEYS = [
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
] as const;
const PLANNED_MANIFEST = {
  contractVersion: 'sealed-holdout-manifest/v1',
  setId: 'sealed-set:career-iq0-holdout',
  version: 'iq0c-planned-v1',
  topic: 'career',
  rubricId: 'rubric:answer-quality:career-v1',
  caseCount: 0,
  contentDigest: EMPTY_SHA256,
  accessLogDigest: EMPTY_SHA256,
  status: 'planned',
  retiredCaseCount: 0,
  custodianRole: 'owner-controlled-custodian',
  replacementRequired: false,
} as const;
const FORBIDDEN_FIELD_NAMES = new Set([
  'holdoutinput',
  'holdoutanswer',
  'expectedanswer',
  'expectedboundary',
  'boundaryannotation',
  'reviewermaterial',
  'reviewernote',
  'accesslogcontent',
  'rawprompt',
  'rawanswer',
  'transcript',
  'modelreasoning',
  'birthinput',
  'birthdate',
  'birthtime',
  'location',
  'email',
  'accountid',
]);
const RUNTIME_PATH_FRAGMENTS = ['packages/', 'skills/', 'scripts/dist', 'loom-chart'];
const DOT_ONLY_SEGMENT = /^\.+$/;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function exactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === expected.length && expected.every((key) => key in value);
}

function add(
  issues: SealedHoldoutManifestIssue[],
  code: SealedHoldoutManifestCode,
  path: string,
): void {
  issues.push({ code, path });
}

function collectKeysAndStrings(value: unknown, keys: string[], strings: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectKeysAndStrings(entry, keys, strings));
    return;
  }
  const source = record(value);
  if (source === null) return;
  for (const [key, child] of Object.entries(source)) {
    keys.push(key);
    if (typeof child === 'string') strings.push(child);
    collectKeysAndStrings(child, keys, strings);
  }
}

function findRepoRoot(startDirectory: string): string {
  let current = startDirectory;
  while (!existsSync(resolve(current, 'package.json'))) {
    const parent = dirname(current);
    if (parent === current) throw new Error('Repository root not found.');
    current = parent;
  }
  return current;
}

const REPO_ROOT = findRepoRoot(dirname(fileURLToPath(import.meta.url)));

function readRepoJson(relativePath: string): unknown {
  const segments = relativePath.split('/');
  if (
    segments.some((segment) => segment.length === 0 || DOT_ONLY_SEGMENT.test(segment)) ||
    segments.some((segment) => segment.toLowerCase() === 'node_modules')
  ) {
    throw new Error('Invalid committed artifact path.');
  }
  const rootPrefix = REPO_ROOT.endsWith(sep) ? REPO_ROOT : `${REPO_ROOT}${sep}`;
  const absolute = resolve(REPO_ROOT, relativePath);
  if (!absolute.startsWith(rootPrefix) || !existsSync(absolute)) {
    throw new Error('Committed artifact unavailable.');
  }
  return JSON.parse(readFileSync(absolute, 'utf8')) as unknown;
}

/**
 * Verify only the declared pre-activation state. A pass proves that public
 * metadata has not drifted into content or an activation claim. It does not
 * prove that an active holdout, controlled storage or human review exists.
 */
export function verifySealedHoldoutManifest(
  inputs: SealedHoldoutManifestInputs,
): SealedHoldoutManifestResult {
  const issues: SealedHoldoutManifestIssue[] = [];
  const manifest = record(inputs.manifest);
  const schema = record(inputs.schema);
  let status: 'planned' | null = null;
  let caseCount: number | null = null;

  if (manifest === null) {
    add(issues, 'MANIFEST_SHAPE', '$.manifest');
  } else {
    const keys: string[] = [];
    const strings: string[] = [];
    collectKeysAndStrings(manifest, keys, strings);
    keys.forEach((key, index) => {
      if (FORBIDDEN_FIELD_NAMES.has(key.toLowerCase()))
        add(issues, 'PRIVACY', `$.manifest.keys[${index}]`);
    });
    if (
      strings.some((value) => RUNTIME_PATH_FRAGMENTS.some((fragment) => value.includes(fragment)))
    ) {
      add(issues, 'RUNTIME_BOUNDARY', '$.manifest');
    }

    if (!exactKeys(manifest, MANIFEST_KEYS)) {
      add(issues, 'MANIFEST_SHAPE', '$.manifest');
    }

    for (const key of MANIFEST_KEYS) {
      if (manifest[key] !== PLANNED_MANIFEST[key]) {
        const code =
          key === 'contentDigest' || key === 'accessLogDigest'
            ? 'DIGEST_BOUNDARY'
            : key === 'status' ||
                key === 'caseCount' ||
                key === 'retiredCaseCount' ||
                key === 'replacementRequired'
              ? 'PLANNED_STATE'
              : 'MANIFEST_SHAPE';
        add(issues, code, `$.manifest.${key}`);
      }
    }
    if (manifest.status === 'planned') status = 'planned';
    if (typeof manifest.caseCount === 'number') caseCount = manifest.caseCount;
  }

  if (schema === null || schema.$id !== 'loom:eval/sealed-holdout-manifest/v1') {
    add(issues, 'MANIFEST_SHAPE', '$.schema.$id');
  } else {
    const properties = record(schema.properties);
    if (
      properties === null ||
      !exactKeys(properties, MANIFEST_KEYS) ||
      schema.additionalProperties !== false
    ) {
      add(issues, 'MANIFEST_SHAPE', '$.schema.properties');
    }
    const statusSchema = properties === null ? null : record(properties.status);
    if (
      statusSchema === null ||
      JSON.stringify(statusSchema.enum) !==
        JSON.stringify(['planned', 'active', 'rotated', 'retired'])
    ) {
      add(issues, 'LIFECYCLE_BOUNDARY', '$.schema.properties.status.enum');
    }
    for (const field of ['contentDigest', 'accessLogDigest'] as const) {
      const digestSchema = properties === null ? null : record(properties[field]);
      if (digestSchema === null || digestSchema.pattern !== '^sha256:[a-f0-9]{64}$') {
        add(issues, 'DIGEST_BOUNDARY', `$.schema.properties.${field}.pattern`);
      }
    }
  }

  return { ok: issues.length === 0, status, caseCount, issues };
}

const COMMITTED_MANIFEST = 'evals/fixtures/synthetic/iq0c-sealed-holdout-manifest.json';
const COMMITTED_SCHEMA = 'evals/contracts/sealed-holdout-manifest.schema.json';

export function readCommittedSealedHoldoutManifest(): SealedHoldoutManifestInputs {
  return {
    manifest: readRepoJson(COMMITTED_MANIFEST),
    schema: readRepoJson(COMMITTED_SCHEMA),
  };
}

function main(): void {
  if (process.argv.length > 2) {
    process.stderr.write('Usage: node tools/eval/verify-sealed-holdout-manifest.ts\n');
    process.exit(2);
  }
  let result: SealedHoldoutManifestResult;
  try {
    result = verifySealedHoldoutManifest(readCommittedSealedHoldoutManifest());
  } catch {
    process.stderr.write('[FAIL] could not read the committed sealed-holdout manifest.\n');
    process.exit(1);
  }
  for (const issue of result.issues) process.stdout.write(`[FAIL] ${issue.code} ${issue.path}\n`);
  if (!result.ok) process.exit(1);
  process.stdout.write(
    `[PASS] IQ-0C1 sealed holdout manifest: ${result.status} / ${result.caseCount} cases / metadata-only\n`,
  );
}

const entry = process.argv[1];
if (entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url)) main();
