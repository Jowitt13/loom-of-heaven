import { realpathSync, statSync } from 'node:fs';
import { extname, isAbsolute, sep } from 'node:path';

/**
 * Narrow development-tool helper that validates everything which could reach
 * a child-process spawn boundary: executable paths, JS launchers, argv
 * elements, controlled directories, and release tags.
 *
 * Invariants (do not widen this module into a generic execution framework):
 *   - an executable must be an absolute, existing, regular file (realpath'd);
 *   - a JS launcher must additionally be a .js/.cjs/.mjs file;
 *   - argv elements and paths must be free of control characters;
 *   - a runner path must stay canonically inside its controlled directory;
 *   - a release tag must match the repository's supported format in full;
 *   - failures are structured: label + reason, never echoing raw values.
 * This module performs validation only; it never spawns a process itself.
 */

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const JS_LAUNCHER_EXTENSIONS = new Set(['.js', '.cjs', '.mjs']);
/** The only release tag shape this repository publishes (strict full-string match). */
const RELEASE_TAG = /^v\d+\.\d+\.\d+$/;

export class SafeSpawnValidationError extends Error {
  readonly label: string;
  readonly reason: string;

  constructor(label: string, reason: string) {
    super(`safe-spawn rejected ${label}: ${reason}`);
    this.name = 'SafeSpawnValidationError';
    this.label = label;
    this.reason = reason;
  }
}

function rejectControlChars(value: string, label: string, kind: string): void {
  if (CONTROL_CHARS.test(value)) {
    throw new SafeSpawnValidationError(label, `${kind} contains control characters`);
  }
}

/** Non-empty, control-character-free argv element or path fragment. */
export function validateProcessArgument(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new SafeSpawnValidationError(label, 'value must be a non-empty string');
  }
  rejectControlChars(value, label, 'value');
  return value;
}

/**
 * Absolute path that exists, is a regular file, and canonicalizes cleanly.
 * Returns the realpath so callers never execute through symlinks or aliased
 * spellings. Relative, missing, directory, and control-character inputs are
 * rejected before any process could be started.
 */
export function validateAbsoluteFilePath(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new SafeSpawnValidationError(label, 'path must be a non-empty string');
  }
  rejectControlChars(value, label, 'path');
  if (!isAbsolute(value)) {
    throw new SafeSpawnValidationError(label, 'path must be absolute');
  }
  let real: string;
  try {
    real = realpathSync(value);
  } catch {
    throw new SafeSpawnValidationError(label, 'path does not exist or is not readable');
  }
  let isFile = false;
  try {
    isFile = statSync(real).isFile();
  } catch {
    isFile = false;
  }
  if (!isFile) {
    throw new SafeSpawnValidationError(label, 'path is not a regular file');
  }
  return real;
}

/** Validated absolute file restricted to the allowed JS launcher extensions. */
export function validateJsLauncherPath(value: unknown, label: string): string {
  const real = validateAbsoluteFilePath(value, label);
  const extension = extname(real).toLowerCase();
  if (!JS_LAUNCHER_EXTENSIONS.has(extension)) {
    throw new SafeSpawnValidationError(label, 'launcher must be a .js, .cjs, or .mjs file');
  }
  return real;
}

/** Canonical containment: an existing child path that must stay inside parentDir. */
export function assertPathInsideDirectory(child: string, parentDir: string, label: string): string {
  const realParent = realpathSync(parentDir);
  const realChild = realpathSync(child);
  const prefix = realParent.endsWith(sep) ? realParent : `${realParent}${sep}`;
  if (!realChild.startsWith(prefix)) {
    throw new SafeSpawnValidationError(label, 'path escapes the controlled directory');
  }
  return realChild;
}

/**
 * Strict full-string match of the repository's supported release tag format.
 * Rejects empty values, leading options, whitespace, newlines, tabs, NUL,
 * path separators, and incomplete versions — before the value can reach an
 * argv or a filesystem path.
 */
export function validateReleaseTag(value: unknown): string {
  if (typeof value !== 'string') {
    throw new SafeSpawnValidationError('release tag', 'tag must be a string');
  }
  rejectControlChars(value, 'release tag', 'tag');
  if (value.length === 0 || value !== value.trim()) {
    throw new SafeSpawnValidationError('release tag', 'tag must not be empty or padded');
  }
  if (!RELEASE_TAG.test(value)) {
    throw new SafeSpawnValidationError(
      'release tag',
      'tag does not match v<MAJOR>.<MINOR>.<PATCH>',
    );
  }
  return value;
}
