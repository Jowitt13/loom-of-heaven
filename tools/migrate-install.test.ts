import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, parse } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Round 13.1 + 13.2: exercise the REAL shipped `loom-chart.mjs migrate` + `version` CLI (spawned
 * as a subprocess, as a host Agent would run it). Round 13.2 adds the target-allowlist security
 * gate: migrate may only write to `<home>/.qoder/skills/xuan-ji-yu-heng` or
 * `<home>/.workbuddy/skills/xuan-ji-yu-heng` (even after resolving symlinks). Tests point
 * `HOME`/`USERPROFILE` at a temp dir so `os.homedir()` resolves there; a bad/arbitrary target,
 * bare skills dir, home/root/project dir, or symlink escape must be refused before any mutation.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const srcSkill = join(root, 'skills', 'xuan-ji-yu-heng');
const CLI = join(srcSkill, 'scripts', 'loom-chart.mjs');
const PKG = 'xuan-ji-yu-heng';

const CANDIDATE_MANIFEST = {
  name: PKG,
  engineVersion: '0.1.1',
  releaseVersion: '0.1.3',
  releaseTag: 'v0.1.3',
  host: 'qoder',
  capability: 'full',
};
const LEGACY_MANIFEST = { name: PKG, version: '0.1.0', releaseTag: 'v0.1.0-rc.1' };

// Directory symlinks/junctions may need privileges on Windows; probe once and skip if unsupported.
let CAN_SYMLINK = false;
try {
  const probe = mkdtempSync(join(tmpdir(), 'ming-symlink-probe-'));
  const tgt = join(probe, 't');
  mkdirSync(tgt);
  symlinkSync(tgt, join(probe, 'l'), process.platform === 'win32' ? 'junction' : 'dir');
  CAN_SYMLINK = true;
  rmSync(probe, { recursive: true, force: true });
} catch {
  CAN_SYMLINK = false;
}

interface VersionOut {
  ok: boolean;
  engineVersion: string | null;
  releaseVersion: string | null;
  releaseTag: string | null;
  version: string | null;
  legacy: boolean;
  doubleNested: boolean;
  reason?: string;
  contentIdentity: {
    scope: string;
    normalization: string;
    status: 'available' | 'unavailable';
    sha256: string | null;
    fileCount: number;
    unavailableFiles: string[];
  };
}
interface MigrateOut {
  ok: boolean;
  step?: string;
  error?: string;
  dryRun?: boolean;
  before: VersionOut | null;
  after?: VersionOut;
  source?: VersionOut;
  rolledBack?: boolean;
  rollbackError?: string;
  backupPath?: string;
  warnings?: Array<{ code: string; backupPath: string }>;
}

/** A real candidate package = canonical skill + a candidate BUILD_MANIFEST (single-layer). */
function makeCandidate(dir: string): string {
  const pkg = join(dir, PKG);
  cpSync(srcSkill, pkg, { recursive: true });
  writeFileSync(
    join(pkg, 'BUILD_MANIFEST.json'),
    `${JSON.stringify(CANDIDATE_MANIFEST, null, 2)}\n`,
  );
  return pkg;
}

/** A legacy v0.1.0-rc.1 install: <skills>/xuan-ji-yu-heng/xuan-ji-yu-heng/... */
function installLegacy(skillsDir: string): string {
  const target = join(skillsDir, PKG);
  const inner = join(target, PKG); // the tell-tale double nesting
  mkdirSync(join(inner, 'scripts'), { recursive: true });
  writeFileSync(join(inner, 'SKILL.md'), '---\nname: xuan-ji-yu-heng\n---\nlegacy rc\n');
  writeFileSync(join(inner, 'scripts', 'loom-chart.mjs'), '// legacy rc cli\n');
  writeFileSync(
    join(inner, 'BUILD_MANIFEST.json'),
    `${JSON.stringify(LEGACY_MANIFEST, null, 2)}\n`,
  );
  return target;
}

function installUnrelated(skillsDir: string): string {
  const other = join(skillsDir, 'some-other-skill');
  mkdirSync(other, { recursive: true });
  writeFileSync(join(other, 'SKILL.md'), '---\nname: some-other-skill\n---\nkeep me\n');
  return other;
}

/** True when the double-nested legacy install is still present and untouched. */
function legacyIntact(target: string): boolean {
  const bm = join(target, PKG, 'BUILD_MANIFEST.json');
  if (!existsSync(bm) || existsSync(join(target, 'SKILL.md'))) return false;
  return JSON.parse(readFileSync(bm, 'utf8')).releaseTag === 'v0.1.0-rc.1';
}

type Fault = 'backup' | 'replace' | 'rollback' | 'verify' | 'cleanup';

function migrate(
  homeDir: string,
  args: string[],
  fault?: Fault,
): { code: number; out: MigrateOut } {
  const preload = join(homeDir, 'fault.mjs');
  if (fault) {
    // Fault injection lives only in the test subprocess, not in the shipped CLI.
    writeFileSync(
      preload,
      `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      import { join } from 'node:path';
      const fault = ${JSON.stringify(fault)};
      const rename = fs.renameSync, remove = fs.rmSync, copy = fs.cpSync;
      fs.renameSync = (from, to) => {
        if ((fault === 'backup' && String(to).includes('.bak-')) ||
            (['replace', 'rollback'].includes(fault) && String(from).includes('.new-')) ||
            (fault === 'rollback' && String(from).includes('.bak-'))) {
          throw new Error('synthetic rename failure');
        }
        return rename(from, to);
      };
      fs.rmSync = (path, options) => {
        if (fault === 'cleanup' && String(path).includes('.bak-')) throw new Error('synthetic cleanup failure');
        return remove(path, options);
      };
      fs.cpSync = (from, to, options) => {
        copy(from, to, options);
        if (fault === 'verify') fs.writeFileSync(join(to, 'BUILD_MANIFEST.json'), '{}');
      };
      syncBuiltinESMExports();
    `,
    );
  }
  const res = spawnSync(
    process.execPath,
    [...(fault ? ['--import', pathToFileURL(preload).href] : []), CLI, 'migrate', ...args],
    {
      encoding: 'utf8',
      env: { ...process.env, HOME: homeDir, USERPROFILE: homeDir },
    },
  );
  let out = {} as MigrateOut;
  try {
    out = JSON.parse(res.stdout ?? '') as MigrateOut;
  } catch {
    /* leave empty; callers assert on code */
  }
  return { code: res.status ?? -1, out };
}

function version(pkgDir: string): { code: number; json: VersionOut } {
  const res = spawnSync(process.execPath, [join(pkgDir, 'scripts', 'loom-chart.mjs'), 'version'], {
    encoding: 'utf8',
  });
  let json = {} as VersionOut;
  try {
    json = JSON.parse(res.stdout ?? '') as VersionOut;
  } catch {
    /* leave empty */
  }
  return { code: res.status ?? -1, json };
}

const residueOf = (skills: string): string[] =>
  readdirSync(skills).filter((e) => e.includes('.bak-') || e.includes('.new-'));

let shared: { dir: string; candidate: string };
beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), 'ming-candidate-'));
  shared = { dir, candidate: makeCandidate(dir) };
});
afterAll(() => {
  if (shared) rmSync(shared.dir, { recursive: true, force: true });
});

describe('loom-chart migrate: legacy RC -> candidate (allowed host targets)', () => {
  it('migrates the legacy install at ~/.qoder/skills/xuan-ji-yu-heng (--host qoder)', () => {
    const home = mkdtempSync(join(tmpdir(), 'ming-home-q-'));
    try {
      const skills = join(home, '.qoder', 'skills');
      mkdirSync(skills, { recursive: true });
      const target = installLegacy(skills);
      const other = installUnrelated(skills);

      const { code, out } = migrate(home, ['--host', 'qoder', '--source', shared.candidate]);
      expect(code, JSON.stringify(out)).toBe(0);
      expect(out.ok).toBe(true);
      expect(out.before?.releaseTag).toBe('v0.1.0-rc.1');
      expect(out.after?.releaseTag).toBe('v0.1.3');

      expect(existsSync(join(target, 'SKILL.md'))).toBe(true);
      expect(existsSync(join(target, PKG))).toBe(false);
      expect(JSON.parse(readFileSync(join(target, 'BUILD_MANIFEST.json'), 'utf8'))).toEqual(
        CANDIDATE_MANIFEST,
      );

      const v = version(target);
      expect(v.json.releaseVersion).toBe('0.1.3');
      expect(v.json.legacy).toBe(false);
      expect(v.json.doubleNested).toBe(false);

      expect(readFileSync(join(other, 'SKILL.md'), 'utf8')).toContain('keep me');
      expect(residueOf(skills)).toEqual([]);
      expect(readdirSync(skills).sort()).toEqual(['some-other-skill', PKG]);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('migrates the legacy install at ~/.workbuddy/skills/xuan-ji-yu-heng (--host workbuddy)', () => {
    const home = mkdtempSync(join(tmpdir(), 'ming-home-w-'));
    try {
      const skills = join(home, '.workbuddy', 'skills');
      mkdirSync(skills, { recursive: true });
      const target = installLegacy(skills);
      const other = installUnrelated(skills);

      const { code, out } = migrate(home, ['--host', 'workbuddy', '--source', shared.candidate]);
      expect(code, JSON.stringify(out)).toBe(0);
      expect(out.ok).toBe(true);
      expect(out.after?.releaseTag).toBe('v0.1.3');
      expect(existsSync(join(target, 'SKILL.md'))).toBe(true);
      expect(existsSync(join(target, PKG))).toBe(false);
      expect(readFileSync(join(other, 'SKILL.md'), 'utf8')).toContain('keep me');
      expect(residueOf(skills)).toEqual([]);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('dry-run reports before/source without modifying the target', () => {
    const home = mkdtempSync(join(tmpdir(), 'ming-home-dry-'));
    try {
      const skills = join(home, '.qoder', 'skills');
      mkdirSync(skills, { recursive: true });
      const target = installLegacy(skills);
      const { code, out } = migrate(home, [
        '--host',
        'qoder',
        '--source',
        shared.candidate,
        '--dry-run',
      ]);
      expect(code).toBe(0);
      expect(out.dryRun).toBe(true);
      expect(out.before?.releaseTag).toBe('v0.1.0-rc.1');
      expect(out.source?.releaseTag).toBe('v0.1.3');
      expect(legacyIntact(target)).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe('loom-chart migrate: filesystem failure recovery', () => {
  it.each(['backup', 'replace', 'verify', 'rollback', 'cleanup'] as const)(
    'preserves recoverable installation data on %s failure',
    (fault) => {
      const home = mkdtempSync(join(tmpdir(), 'ming-home-fault-'));
      try {
        const skills = join(home, '.qoder', 'skills');
        mkdirSync(skills, { recursive: true });
        const target = installLegacy(skills);
        const other = installUnrelated(skills);
        const { code, out } = migrate(
          home,
          ['--host', 'qoder', '--source', shared.candidate],
          fault,
        );
        expect(readFileSync(join(other, 'SKILL.md'), 'utf8')).toContain('keep me');
        expect(residueOf(skills).filter((name) => name.includes('.new-'))).toEqual([]);
        if (fault === 'cleanup') {
          expect(code).toBe(0);
          expect(out.ok).toBe(true);
          expect(out.after?.releaseTag).toBe(CANDIDATE_MANIFEST.releaseTag);
          expect(out.warnings).toHaveLength(1);
          expect(out.warnings![0]!.code).toBe('BACKUP_CLEANUP_FAILED');
          expect(legacyIntact(out.warnings![0]!.backupPath)).toBe(true);
          expect(version(target).json.releaseTag).toBe(CANDIDATE_MANIFEST.releaseTag);
        } else {
          expect(code).toBe(1);
          expect(out.ok).toBe(false);
          expect(out.step).toBe(fault === 'verify' ? 'verify-after' : 'replace');
          if (fault === 'rollback') {
            expect(out.rolledBack).toBe(false);
            expect(out.rollbackError).toContain('synthetic rename failure');
            expect(legacyIntact(out.backupPath!)).toBe(true);
            expect(existsSync(target)).toBe(false);
          } else {
            expect(legacyIntact(target)).toBe(true);
            expect(out.rolledBack).toBe(fault !== 'backup');
            expect(residueOf(skills)).toEqual([]);
          }
        }
      } finally {
        rmSync(home, { recursive: true, force: true });
      }
    },
  );
});

describe('loom-chart migrate: source validation still enforced', () => {
  it('fails and leaves the old install intact when the source lacks BUILD_MANIFEST', () => {
    const home = mkdtempSync(join(tmpdir(), 'ming-home-nomani-'));
    try {
      const skills = join(home, '.qoder', 'skills');
      mkdirSync(skills, { recursive: true });
      const target = installLegacy(skills);
      const other = installUnrelated(skills);
      const badSrc = join(home, 'badsrc', PKG);
      cpSync(srcSkill, badSrc, { recursive: true }); // canonical has no BUILD_MANIFEST

      const { code, out } = migrate(home, ['--host', 'qoder', '--source', badSrc]);
      expect(code).not.toBe(0);
      expect(out.step).toBe('validate-source');
      expect(legacyIntact(target)).toBe(true);
      expect(readFileSync(join(other, 'SKILL.md'), 'utf8')).toContain('keep me');
      expect(residueOf(skills)).toEqual([]);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('rejects a double-nested source and leaves the old install intact', () => {
    const home = mkdtempSync(join(tmpdir(), 'ming-home-nested-'));
    try {
      const skills = join(home, '.qoder', 'skills');
      mkdirSync(skills, { recursive: true });
      const target = installLegacy(skills);
      const badSrc = makeCandidate(join(home, 'badnest'));
      mkdirSync(join(badSrc, PKG), { recursive: true });
      writeFileSync(join(badSrc, PKG, 'SKILL.md'), '---\nname: xuan-ji-yu-heng\n---\nnested\n');

      const { code, out } = migrate(home, ['--host', 'qoder', '--source', badSrc]);
      expect(code).not.toBe(0);
      expect(out.step).toBe('validate-source');
      expect(legacyIntact(target)).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe('loom-chart migrate: target allowlist (security gate)', () => {
  const badTargets: Array<[string, (home: string) => string]> = [
    ['bare skills dir', (h) => join(h, '.qoder', 'skills')],
    ['home dir', (h) => h],
    ['filesystem root', (h) => parse(h).root],
    ['project root', () => root],
  ];

  for (const [label, badFn] of badTargets) {
    it(`rejects --target = ${label} before any write; legacy + unrelated intact`, () => {
      const home = mkdtempSync(join(tmpdir(), 'ming-home-bad-'));
      try {
        const skills = join(home, '.qoder', 'skills');
        mkdirSync(skills, { recursive: true });
        const target = installLegacy(skills);
        const other = installUnrelated(skills);

        const { code, out } = migrate(home, [
          '--target',
          badFn(home),
          '--source',
          shared.candidate,
        ]);
        expect(code).not.toBe(0);
        expect(out.step).toBe('validate-target');
        expect(legacyIntact(target)).toBe(true);
        expect(readFileSync(join(other, 'SKILL.md'), 'utf8')).toContain('keep me');
        expect(residueOf(skills)).toEqual([]);
      } finally {
        rmSync(home, { recursive: true, force: true });
      }
    });
  }

  (CAN_SYMLINK ? it : it.skip)(
    'rejects a symlink-escaping skills dir (--host qoder) without writing to the escape target',
    () => {
      const home = mkdtempSync(join(tmpdir(), 'ming-home-link-'));
      try {
        const qoderDir = join(home, '.qoder');
        mkdirSync(qoderDir, { recursive: true });
        const evil = join(home, 'evil');
        mkdirSync(evil, { recursive: true });
        // ~/.qoder/skills -> ~/evil : the derived target would escape the allowed location.
        symlinkSync(
          evil,
          join(qoderDir, 'skills'),
          process.platform === 'win32' ? 'junction' : 'dir',
        );

        const { code, out } = migrate(home, ['--host', 'qoder', '--source', shared.candidate]);
        expect(code).not.toBe(0);
        expect(out.step).toBe('validate-target');
        expect(existsSync(join(evil, PKG))).toBe(false); // nothing migrated into the escaped dir
      } finally {
        rmSync(home, { recursive: true, force: true });
      }
    },
  );
});

describe('loom-chart version: real installed-version report', () => {
  it.each(['SKILL.md', 'references/reading-style.md', 'scripts/dist/engine.mjs'])(
    'distinguishes same-version installs after a change to %s',
    (relativePath) => {
      const work = mkdtempSync(join(tmpdir(), 'ming-ver-content-'));
      try {
        const pkg = makeCandidate(work);
        const before = version(pkg).json;
        expect(before.contentIdentity.status).toBe('available');
        expect(before.contentIdentity.sha256).toMatch(/^[a-f0-9]{64}$/);
        writeFileSync(
          join(pkg, relativePath),
          `${readFileSync(join(pkg, relativePath), 'utf8')}\nchanged\n`,
        );
        const after = version(pkg).json;
        expect(after.releaseTag).toBe(before.releaseTag);
        expect(after.engineVersion).toBe(before.engineVersion);
        expect(after.contentIdentity.sha256).not.toBe(before.contentIdentity.sha256);
        expect(version(pkg).json.contentIdentity).toEqual(after.contentIdentity);
      } finally {
        rmSync(work, { recursive: true, force: true });
      }
    },
  );

  it('normalizes text line endings and excludes host metadata and user output', () => {
    const work = mkdtempSync(join(tmpdir(), 'ming-ver-normalized-'));
    try {
      const pkg = makeCandidate(work);
      const before = version(pkg).json.contentIdentity;
      const skill = join(pkg, 'SKILL.md');
      const text = readFileSync(skill, 'utf8').replace(/\r\n?/g, '\n');
      writeFileSync(skill, text.replace(/\n/g, '\r\n'));
      writeFileSync(join(pkg, 'INSTALL.md'), 'host-specific install instructions');
      writeFileSync(
        join(pkg, 'BUILD_MANIFEST.json'),
        JSON.stringify({ ...CANDIDATE_MANIFEST, host: 'doubao' }),
      );
      writeFileSync(
        join(pkg, 'user-private-output.json'),
        'synthetic private sentinel - not identity material',
      );
      expect(version(pkg).json.contentIdentity).toEqual(before);
      writeFileSync(skill, text.replace(/\n/g, '\r'));
      expect(version(pkg).json.contentIdentity).toEqual(before);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it('reports unavailable identity rather than claiming a complete build with missing engine', () => {
    const work = mkdtempSync(join(tmpdir(), 'ming-ver-incomplete-'));
    try {
      const pkg = makeCandidate(work);
      rmSync(join(pkg, 'scripts/dist/engine.mjs'));
      const result = version(pkg);
      expect(result.code).toBe(0);
      expect(result.json.releaseTag).toBe(CANDIDATE_MANIFEST.releaseTag);
      expect(result.json.contentIdentity.status).toBe('unavailable');
      expect(result.json.contentIdentity.sha256).toBeNull();
      expect(result.json.contentIdentity.unavailableFiles).toContain('scripts/dist/engine.mjs');
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  (CAN_SYMLINK ? it : it.skip)('does not follow a linked reference tree outside the Skill', () => {
    const work = mkdtempSync(join(tmpdir(), 'ming-ver-linked-'));
    try {
      const pkg = makeCandidate(work);
      const outside = join(work, 'outside');
      mkdirSync(outside);
      writeFileSync(join(outside, 'private.md'), 'synthetic private sentinel');
      symlinkSync(
        outside,
        join(pkg, 'references/linked'),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
      const result = version(pkg).json.contentIdentity;
      expect(result.status).toBe('unavailable');
      expect(result.sha256).toBeNull();
      expect(result.unavailableFiles).toContain('references/linked');
      expect(JSON.stringify(result)).not.toContain('private.md');
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it('detects legacy schema + double-nesting when run from a nested legacy layout', () => {
    const work = mkdtempSync(join(tmpdir(), 'ming-ver-legacy-'));
    try {
      const inner = join(work, PKG, PKG);
      cpSync(srcSkill, inner, { recursive: true });
      writeFileSync(
        join(inner, 'BUILD_MANIFEST.json'),
        `${JSON.stringify(LEGACY_MANIFEST, null, 2)}\n`,
      );

      const v = version(inner);
      expect(v.code).toBe(0);
      expect(v.json.ok).toBe(true);
      expect(v.json.legacy).toBe(true);
      expect(v.json.doubleNested).toBe(true);
      expect(v.json.releaseTag).toBe('v0.1.0-rc.1');
      expect(v.json.engineVersion).toBe(null);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it('reports not-a-packaged-install when no BUILD_MANIFEST is present', () => {
    const work = mkdtempSync(join(tmpdir(), 'ming-ver-none-'));
    try {
      const pkg = join(work, PKG);
      cpSync(srcSkill, pkg, { recursive: true });
      const v = version(pkg);
      expect(v.code).toBe(0);
      expect(v.json.ok).toBe(false);
      expect(v.json.reason).toMatch(/no BUILD_MANIFEST/);
      expect(v.json.contentIdentity.status).toBe('available');
      expect(v.json.contentIdentity.sha256).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});
