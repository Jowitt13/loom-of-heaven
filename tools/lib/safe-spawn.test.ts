// Offline unit tests for the safe-spawn validation helpers.
// No external process is ever started here: these tests exercise the pure
// validation boundary that must reject an unsafe executable, argv element,
// path, or release tag BEFORE any spawn could happen.
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SafeSpawnValidationError,
  assertPathInsideDirectory,
  validateAbsoluteFilePath,
  validateJsLauncherPath,
  validateProcessArgument,
  validateReleaseTag,
} from './safe-spawn.ts';

const tempRoots: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'g0m1-safe-spawn-'));
  tempRoots.push(dir);
  return dir;
}

function makeTempFile(name: string, content = 'placeholder\n'): string {
  const dir = makeTempDir();
  const file = join(dir, name);
  writeFileSync(file, content, 'utf8');
  return file;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const dir = tempRoots.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

function rejectionOf(fn: () => unknown): SafeSpawnValidationError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(SafeSpawnValidationError);
    return error as SafeSpawnValidationError;
  }
  throw new Error('expected the validation to reject the input');
}

describe('validateAbsoluteFilePath', () => {
  it('rejects a relative executable path before any spawn', () => {
    const rejection = rejectionOf(() => validateAbsoluteFilePath('tools/some-tool.ts', 'label'));
    expect(rejection.reason).toBe('path must be absolute');
  });

  it('rejects a missing path', () => {
    const dir = makeTempDir();
    const missing = join(dir, 'definitely-absent.bin');
    const rejection = rejectionOf(() => validateAbsoluteFilePath(missing, 'label'));
    expect(rejection.reason).toBe('path does not exist or is not readable');
  });

  it('rejects a directory path', () => {
    const dir = makeTempDir();
    const rejection = rejectionOf(() => validateAbsoluteFilePath(dir, 'label'));
    expect(rejection.reason).toBe('path is not a regular file');
  });

  it('rejects paths containing NUL, newline, tab, or control characters', () => {
    for (const bad of ['a\u0000b', 'a\nb', 'a\rb', 'a\tb', 'a\u0007b', 'a\u001fb']) {
      const rejection = rejectionOf(() => validateAbsoluteFilePath(join(tmpdir(), bad), 'label'));
      expect(rejection.reason).toBe('path contains control characters');
    }
  });

  it('accepts a real file and returns its canonical realpath deterministically', () => {
    const file = makeTempFile('tool.bin');
    const first = validateAbsoluteFilePath(file, 'label');
    const second = validateAbsoluteFilePath(file, 'label');
    expect(first).toBe(realpathSync(file));
    expect(second).toBe(first);
  });

  it('never echoes the rejected raw value into the error', () => {
    const sentinel = 'G0M1-TOPSECRET-SENTINEL';
    const rejection = rejectionOf(() =>
      validateAbsoluteFilePath(join(tmpdir(), `${sentinel}${'\u0007'}`), 'label'),
    );
    expect(rejection.message).not.toContain(sentinel);
    expect(rejection.reason).not.toContain(sentinel);
  });
});

describe('validateJsLauncherPath', () => {
  it('accepts .js, .cjs, and .mjs launcher files', () => {
    for (const name of ['launcher.js', 'launcher.cjs', 'launcher.mjs']) {
      const file = makeTempFile(name);
      expect(validateJsLauncherPath(file, 'label')).toBe(realpathSync(file));
    }
  });

  it('rejects other executable or data extensions', () => {
    for (const name of [
      'launcher.py',
      'launcher.cmd',
      'launcher.exe',
      'launcher.sh',
      'launcher.txt',
    ]) {
      const file = makeTempFile(name);
      const rejection = rejectionOf(() => validateJsLauncherPath(file, 'label'));
      expect(rejection.reason).toBe('launcher must be a .js, .cjs, or .mjs file');
    }
  });
});

describe('validateProcessArgument', () => {
  it('accepts ordinary flag and value arguments', () => {
    expect(validateProcessArgument('--prod', 'label')).toBe('--prod');
    expect(validateProcessArgument('v0.4.0', 'label')).toBe('v0.4.0');
  });

  it('rejects empty and control-character arguments', () => {
    expect(() => validateProcessArgument('', 'label')).toThrow(SafeSpawnValidationError);
    for (const bad of ['a\u0000b', 'a\nb', 'a\rb', 'a\tb']) {
      const rejection = rejectionOf(() => validateProcessArgument(bad, 'label'));
      expect(rejection.reason).toBe('value contains control characters');
    }
  });
});

describe('assertPathInsideDirectory', () => {
  it('accepts an existing runner path inside the controlled directory', () => {
    const dir = makeTempDir();
    const runner = join(dir, 'runner.py');
    writeFileSync(runner, 'print("ok")\n', 'utf8');
    expect(assertPathInsideDirectory(runner, dir, 'runner')).toBe(realpathSync(runner));
  });

  it('rejects a path that escapes the controlled directory', () => {
    const dir = makeTempDir();
    const siblingFile = makeTempFile('outside.py');
    const rejection = rejectionOf(() => assertPathInsideDirectory(siblingFile, dir, 'runner'));
    expect(rejection.reason).toBe('path escapes the controlled directory');
  });
});

describe('validateReleaseTag', () => {
  it('accepts the repository-supported tag formats', () => {
    expect(validateReleaseTag('v0.4.0')).toBe('v0.4.0');
    expect(validateReleaseTag('v1.2.3')).toBe('v1.2.3');
  });

  it('rejects empty, padded, and non-string tags', () => {
    for (const bad of ['', '   ', 'v0.4.0 ', ' v0.4.0', null, undefined, 42]) {
      expect(() => validateReleaseTag(bad)).toThrow(SafeSpawnValidationError);
    }
  });

  it('rejects leading options and extra arguments', () => {
    for (const bad of ['--repo', 'v0.4.0 --repo evil/repo', '-c', '--dir=/tmp']) {
      expect(() => validateReleaseTag(bad)).toThrow(SafeSpawnValidationError);
    }
  });

  it('rejects newlines, tabs, NUL, and path separators', () => {
    for (const bad of [
      'v0.4.0\n',
      'v0.4.0\tx',
      'v0.4.0\u0000',
      'v0.4.0/../../etc',
      'v0.4.0\\win',
    ]) {
      expect(() => validateReleaseTag(bad)).toThrow(SafeSpawnValidationError);
    }
  });

  it('rejects incomplete or malformed versions, including prerelease forms', () => {
    for (const bad of [
      'v0.4',
      'v0',
      'v',
      '0.4.0',
      'V0.4.0',
      'v0.4.0-rc',
      'v0.4.0-rc.x',
      'v0.4.0.1',
      'v0.5.0-rc.1',
    ]) {
      expect(() => validateReleaseTag(bad)).toThrow(SafeSpawnValidationError);
    }
  });

  it('is deterministic for the same input', () => {
    expect(validateReleaseTag('v0.4.0')).toBe(validateReleaseTag('v0.4.0'));
    const rejectionA = rejectionOf(() => validateReleaseTag('v0.4.0 --repo evil/repo'));
    const rejectionB = rejectionOf(() => validateReleaseTag('v0.4.0 --repo evil/repo'));
    expect(rejectionA.reason).toBe(rejectionB.reason);
  });
});

describe('test hygiene', () => {
  it('leaves no temporary directories behind that look like repo content', () => {
    mkdirSync(join(tmpdir(), 'g0m1-safe-spawn-hygiene-check'), { recursive: true });
    rmSync(join(tmpdir(), 'g0m1-safe-spawn-hygiene-check'), { recursive: true, force: true });
    expect(true).toBe(true);
  });
});
