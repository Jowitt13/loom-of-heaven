import { existsSync } from 'node:fs';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

/**
 * C-4D internal-only local consent lifecycle for the career-reflection
 * scope. It materializes the C-4B frozen state machine
 * (not-started -> consented -> active -> deleted) into exactly one fixed
 * local file inside a caller-provided state directory. Nothing else is ever
 * read or written.
 *
 * `active` means only that the local consent state is currently valid: it
 * never means cards can run, content exists, advice can be delivered, or
 * that anything is runtime-ready (the C-4B admission stays
 * `no-items-defined` / `runtimeReady: false` regardless of this state).
 *
 * Zero network, zero child processes, zero telemetry, no default
 * persistence: nothing is written unless the caller explicitly provides a
 * state directory and requests a transition. Internal by design: not
 * exported from the package index, not wired into CLI, Skill, engine entry,
 * or bundle.
 */

export const CAREER_REFLECTION_CONSENT_VERSION = 'career-reflection-consent/v1';
export const CAREER_REFLECTION_SCOPE = 'career-reflection';
export const CAREER_REFLECTION_NOTICE_VERSION = 'career-reflection-notice/v1';
/** Fixed file name. Dynamic file names are rejected by construction. */
export const CONSENT_FILE_NAME = 'consent.json';

const LIFECYCLE_STATES = ['not-started', 'consented', 'active', 'deleted'] as const;

export type CareerReflectionLifecycleState = (typeof LIFECYCLE_STATES)[number];

export type CareerReflectionConsentErrorCode =
  'INPUT_CONTRACT' | 'INVALID_STATE_DIRECTORY' | 'INVALID_TRANSITION' | 'STATE_RECORD_INVALID';

export class CareerReflectionConsentError extends Error {
  constructor(readonly code: CareerReflectionConsentErrorCode) {
    super(code);
    this.name = 'CareerReflectionConsentError';
  }
}

const FORBIDDEN_STATE_KEYS = [
  'userId',
  'user',
  'email',
  'name',
  'host',
  'chat',
  'statement',
  'answer',
  'answers',
  'item',
  'items',
  'question',
  'questions',
  'prompt',
  'prompts',
  'score',
  'scores',
  'norm',
  'norms',
  'match',
  'matching',
  'trait',
  'traits',
  'diagnosis',
  'clinical',
  'phq',
  'gad',
  'adhd',
  'bazi',
  'astrology',
  'chart',
  'ruleset',
  'recommendation',
  'advice',
  'prediction',
  'path',
  'filePath',
  'directory',
  'session',
  'sessionPayload',
  'exportPayload',
] as const;

export interface CareerReflectionConsentRecord {
  contractVersion: typeof CAREER_REFLECTION_CONSENT_VERSION;
  scope: typeof CAREER_REFLECTION_SCOPE;
  noticeVersion: typeof CAREER_REFLECTION_NOTICE_VERSION;
  state: CareerReflectionLifecycleState;
  /** UTC instant of the last recorded transition, e.g. 2026-09-08T01:02:03Z. */
  updatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

function isValidTimestamp(value: unknown): value is string {
  return typeof value === 'string' && UTC_TIMESTAMP_PATTERN.test(value);
}

function containsForbiddenKey(value: unknown, seen: Set<object>): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => containsForbiddenKey(entry, seen));
  }
  if (!isRecord(value)) return false;
  if (seen.has(value)) return false;
  seen.add(value);
  for (const [key, entry] of Object.entries(value)) {
    if ((FORBIDDEN_STATE_KEYS as readonly string[]).includes(key)) return true;
    if (containsForbiddenKey(entry, seen)) return true;
  }
  return false;
}

/**
 * Validates a caller-supplied consent record. Only the frozen fields are
 * allowed; identity, content, scoring, clinical, mingli, and storage-handle
 * fields fail closed. Timestamps must be exact UTC instants.
 */
function parseConsentRecord(raw: unknown): CareerReflectionConsentRecord {
  if (!isRecord(raw)) {
    throw new CareerReflectionConsentError('STATE_RECORD_INVALID');
  }
  if (containsForbiddenKey(raw, new Set())) {
    throw new CareerReflectionConsentError('STATE_RECORD_INVALID');
  }
  const keys = Object.keys(raw);
  const expectedKeys = ['contractVersion', 'scope', 'noticeVersion', 'state', 'updatedAt'];
  if (keys.length !== expectedKeys.length || !expectedKeys.every((key) => keys.includes(key))) {
    throw new CareerReflectionConsentError('STATE_RECORD_INVALID');
  }
  if (
    raw.contractVersion !== CAREER_REFLECTION_CONSENT_VERSION ||
    raw.scope !== CAREER_REFLECTION_SCOPE ||
    raw.noticeVersion !== CAREER_REFLECTION_NOTICE_VERSION
  ) {
    throw new CareerReflectionConsentError('STATE_RECORD_INVALID');
  }
  if (
    typeof raw.state !== 'string' ||
    !(LIFECYCLE_STATES as readonly string[]).includes(raw.state) ||
    raw.state === 'not-started' ||
    !isValidTimestamp(raw.updatedAt)
  ) {
    throw new CareerReflectionConsentError('STATE_RECORD_INVALID');
  }
  return {
    contractVersion: CAREER_REFLECTION_CONSENT_VERSION,
    scope: CAREER_REFLECTION_SCOPE,
    noticeVersion: CAREER_REFLECTION_NOTICE_VERSION,
    state: raw.state as CareerReflectionLifecycleState,
    updatedAt: raw.updatedAt,
  };
}

/**
 * Validates a caller-supplied state directory. It must be an absolute path
 * without control characters and without traversal segments; the canonical
 * containment of the one fixed consent file inside the resolved directory
 * is verified before every operation.
 */
function resolveStateDirectory(stateDirectory: unknown): string {
  if (typeof stateDirectory !== 'string' || stateDirectory.length === 0) {
    throw new CareerReflectionConsentError('INVALID_STATE_DIRECTORY');
  }
  // Control characters (including newlines used in argument-injection tricks)
  // make a directory invalid before any filesystem call.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(stateDirectory)) {
    throw new CareerReflectionConsentError('INVALID_STATE_DIRECTORY');
  }
  if (!isAbsolute(stateDirectory)) {
    throw new CareerReflectionConsentError('INVALID_STATE_DIRECTORY');
  }
  // Path-traversal segments fail closed instead of silently escaping.
  const segments = stateDirectory.split(/[\\/]/);
  if (segments.includes('..')) {
    throw new CareerReflectionConsentError('INVALID_STATE_DIRECTORY');
  }
  const resolved = resolve(stateDirectory);
  const file = consentFilePath(resolved);
  if (!resolve(file).startsWith(resolved + sepOf(resolved))) {
    throw new CareerReflectionConsentError('INVALID_STATE_DIRECTORY');
  }
  return resolved;
}

function sepOf(pathValue: string): string {
  return pathValue.includes('\\') ? '\\' : '/';
}

function consentFilePath(resolvedDirectory: string): string {
  return join(resolvedDirectory, CONSENT_FILE_NAME);
}

/**
 * Reads the local consent record. A missing file is the honest
 * `not-started` state: no file is created by reading. A present but invalid
 * file fails closed.
 */
export function readCareerReflectionConsent(stateDirectory: unknown):
  | {
      state: 'not-started';
    }
  | CareerReflectionConsentRecord {
  const directory = resolveStateDirectory(stateDirectory);
  const file = consentFilePath(directory);
  if (!existsSync(file)) {
    return { state: 'not-started' };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new CareerReflectionConsentError('STATE_RECORD_INVALID');
  }
  return parseConsentRecord(raw);
}

/**
 * Grants consent: the only way to move from `not-started` to `consented`.
 * Writes exactly the frozen fields with the caller-supplied UTC instant via
 * an atomic same-directory temp-file rename; a failed write never leaves an
 * accepted half-written record behind.
 */
export function grantCareerReflectionConsent(
  stateDirectory: unknown,
  options: { grantedAt: string },
): CareerReflectionConsentRecord {
  if (!isValidTimestamp(options.grantedAt)) {
    throw new CareerReflectionConsentError('INPUT_CONTRACT');
  }
  const directory = resolveStateDirectory(stateDirectory);
  const current = readCareerReflectionConsent(directory);
  if (current.state !== 'not-started') {
    throw new CareerReflectionConsentError('INVALID_TRANSITION');
  }
  return writeState(directory, 'consented', options.grantedAt);
}

/**
 * Activates: the only way to move from `consented` to `active`. `active`
 * marks the local consent state as currently valid — nothing else.
 */
export function activateCareerReflectionConsent(
  stateDirectory: unknown,
  options: { activatedAt: string },
): CareerReflectionConsentRecord {
  if (!isValidTimestamp(options.activatedAt)) {
    throw new CareerReflectionConsentError('INPUT_CONTRACT');
  }
  const directory = resolveStateDirectory(stateDirectory);
  const current = readCareerReflectionConsent(directory);
  if (current.state !== 'consented') {
    throw new CareerReflectionConsentError('INVALID_TRANSITION');
  }
  return writeState(directory, 'active', options.activatedAt);
}

/**
 * Deletes (withdraws) the local consent record from any existing state.
 * Only the one fixed consent file is removed — never the directory, never
 * unrelated files. Deletion is final: no export and no recovery.
 */
export function deleteCareerReflectionConsent(
  stateDirectory: unknown,
  options: { deletedAt: string },
): { state: 'deleted'; deletedAt: string } {
  if (!isValidTimestamp(options.deletedAt)) {
    throw new CareerReflectionConsentError('INPUT_CONTRACT');
  }
  const directory = resolveStateDirectory(stateDirectory);
  const current = readCareerReflectionConsent(directory);
  if (current.state === 'not-started') {
    throw new CareerReflectionConsentError('INVALID_TRANSITION');
  }
  rmSync(consentFilePath(directory));
  return { state: 'deleted', deletedAt: options.deletedAt };
}

function writeState(
  directory: string,
  state: CareerReflectionLifecycleState,
  timestamp: string,
): CareerReflectionConsentRecord {
  const record: CareerReflectionConsentRecord = {
    contractVersion: CAREER_REFLECTION_CONSENT_VERSION,
    scope: CAREER_REFLECTION_SCOPE,
    noticeVersion: CAREER_REFLECTION_NOTICE_VERSION,
    state,
    updatedAt: timestamp,
  };
  mkdirSync(directory, { recursive: true });
  // Windows forbids colons in file names, so the UTC timestamp must never
  // enter the temp file name; the fixed temp name is safe because the
  // single-contract directory has no concurrent writers by contract.
  const tempFile = join(directory, `${CONSENT_FILE_NAME}.tmp`);
  try {
    writeFileSync(tempFile, JSON.stringify(record), 'utf8');
    renameSync(tempFile, target(directory));
  } catch {
    if (existsSync(tempFile)) {
      rmSync(tempFile);
    }
    throw new CareerReflectionConsentError('INPUT_CONTRACT');
  }
  return record;
}

function target(directory: string): string {
  return join(directory, CONSENT_FILE_NAME);
}
