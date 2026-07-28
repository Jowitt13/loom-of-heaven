// Offline unit tests for tools/lib/bundle-closure.ts.
// Every test uses either an injected in-memory readPackageJson OR a tmpdir
// synthetic node_modules layout — never the real repo tree.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computeBundleClosure,
  cycloneDxLicenses,
  extractLicense,
  npmPurl,
  spdxKind,
} from './bundle-closure.ts';

/**
 * In-memory readPackageJson factory: returns a function that answers
 * package.json lookups for the given absolute-directory -> parsed JSON map.
 * Any dir not present in the map returns null (equivalent to "no package.json").
 */
function makeReader(map: Map<string, unknown>): (dir: string) => unknown {
  return (dir: string) => map.get(dir) ?? null;
}

/** Build a virtual root path so tests stay OS-independent. */
const ROOT = process.platform === 'win32' ? 'C:\\repo' : '/repo';
const nm = (p: string): string => join(ROOT, ...p.split('/'));

describe('bundle-closure: extractLicense', () => {
  it('accepts modern SPDX string', () => {
    expect(extractLicense({ license: 'MIT' })).toBe('MIT');
  });
  it('accepts legacy object license.type', () => {
    expect(extractLicense({ license: { type: 'Apache-2.0' } })).toBe('Apache-2.0');
  });
  it('builds OR expression from legacy licenses[] array', () => {
    expect(
      extractLicense({
        licenses: [{ type: 'MIT' }, { type: 'Apache-2.0' }],
      }),
    ).toBe('(MIT OR Apache-2.0)');
  });
  it('rejects UNLICENSED', () => {
    expect(() => extractLicense({ license: 'UNLICENSED' })).toThrow(/unresolvable license/);
  });
  it('rejects "SEE LICENSE IN <file>"', () => {
    expect(() => extractLicense({ license: 'SEE LICENSE IN COPYING' })).toThrow(
      /unresolvable license/,
    );
  });
  it('rejects missing license field entirely', () => {
    expect(() => extractLicense({})).toThrow(/unresolvable license/);
  });
});

describe('bundle-closure: computeBundleClosure', () => {
  const dirZod = nm('node_modules/zod');
  const dirScoped = nm('node_modules/@scope/pkg');
  const dirPnpmFoo = nm('node_modules/.pnpm/foo@1.2.3/node_modules/foo');
  const dirPnpmScoped = nm('node_modules/.pnpm/@scope+bar@2.0.0/node_modules/@scope/bar');
  const dirMoment = nm('node_modules/moment');

  const pkgMap = new Map<string, unknown>([
    [dirZod, { name: 'zod', version: '4.4.3', license: 'MIT' }],
    [dirScoped, { name: '@scope/pkg', version: '0.1.0', license: 'MIT' }],
    [dirPnpmFoo, { name: 'foo', version: '1.2.3', license: 'MIT' }],
    [dirPnpmScoped, { name: '@scope/bar', version: '2.0.0', license: 'MIT' }],
    [dirMoment, { name: 'moment', version: '2.30.1', license: 'MIT' }],
  ]);
  const readPackageJson = makeReader(pkgMap);

  function run(paths: string[]) {
    const inputs: Record<string, unknown> = {};
    for (const p of paths) inputs[p] = {};
    return computeBundleClosure({ inputs }, { root: ROOT, readPackageJson });
  }

  it('1. direct dependency at node_modules/<name>', () => {
    const r = run(['node_modules/zod/index.js']);
    expect(r.packages.map((p) => `${p.name}@${p.version}`)).toEqual(['zod@4.4.3']);
    expect(r.packages[0]!.purl).toBe('pkg:npm/zod@4.4.3');
    expect(r.packages[0]!.license).toBe('MIT');
  });

  it('2. transitive dependency alongside a direct one', () => {
    const r = run(['node_modules/moment/moment.js', 'node_modules/zod/index.js']);
    expect(r.packages.map((p) => p.name)).toEqual(['moment', 'zod']);
  });

  it('3. scoped package at node_modules/@scope/<name>', () => {
    const r = run(['node_modules/@scope/pkg/index.js']);
    expect(r.packages[0]!.name).toBe('@scope/pkg');
    // Canonical purl: the scope's `@` is percent-encoded per the purl spec.
    expect(r.packages[0]!.purl).toBe('pkg:npm/%40scope/pkg@0.1.0');
  });

  it('4. pnpm nested layout attributes to the real package, not the hash dir', () => {
    const r = run([
      'node_modules/.pnpm/foo@1.2.3/node_modules/foo/lib/a.js',
      'node_modules/.pnpm/foo@1.2.3/node_modules/foo/lib/b.js',
    ]);
    expect(r.packages.map((p) => `${p.name}@${p.version}`)).toEqual(['foo@1.2.3']);
    expect(r.packages[0]!.inputs).toHaveLength(2);
  });

  it('5. pnpm nested + scoped', () => {
    const r = run(['node_modules/.pnpm/@scope+bar@2.0.0/node_modules/@scope/bar/index.js']);
    expect(r.packages[0]!.name).toBe('@scope/bar');
    expect(r.packages[0]!.version).toBe('2.0.0');
  });

  it('6. repo-internal packages/<workspace> are ignored', () => {
    const r = run(['packages/orchestrator/src/engine-entry.ts', 'node_modules/zod/index.js']);
    expect(r.packages.map((p) => p.name)).toEqual(['zod']);
    expect(r.ignored.repoInternal).toContain('packages/orchestrator/src/engine-entry.ts');
  });

  it('7. Node built-in node:crypto is ignored', () => {
    const r = run(['node:crypto', 'node_modules/zod/index.js']);
    expect(r.ignored.nodeBuiltin).toEqual(['node:crypto']);
    expect(r.packages.map((p) => p.name)).toEqual(['zod']);
  });

  it('8. esbuild synthetic <define:...> input is ignored', () => {
    const r = run(['<define:process.env.NODE_ENV>', 'node_modules/zod/index.js']);
    expect(r.ignored.virtual).toEqual(['<define:process.env.NODE_ENV>']);
    expect(r.packages.map((p) => p.name)).toEqual(['zod']);
  });

  it('9. multiple inputs for the same package deduplicate and sort inputs', () => {
    const r = run(['node_modules/zod/z.js', 'node_modules/zod/a.js', 'node_modules/zod/m.js']);
    expect(r.packages).toHaveLength(1);
    expect(r.packages[0]!.inputs).toEqual([
      'node_modules/zod/a.js',
      'node_modules/zod/m.js',
      'node_modules/zod/z.js',
    ]);
  });

  it('10. same package name at two different roots with different versions -> throw', () => {
    // Simulate a second `foo` package.json at a different pnpm hash dir.
    const dirFooOther = nm('node_modules/.pnpm/foo@9.9.9/node_modules/foo');
    const map = new Map(pkgMap);
    map.set(dirFooOther, { name: 'foo', version: '9.9.9', license: 'MIT' });
    expect(() =>
      computeBundleClosure(
        {
          inputs: {
            'node_modules/.pnpm/foo@1.2.3/node_modules/foo/a.js': {},
            'node_modules/.pnpm/foo@9.9.9/node_modules/foo/b.js': {},
          },
        },
        { root: ROOT, readPackageJson: makeReader(map) },
      ),
    ).toThrow(/multiple versions/);
  });

  it('11. missing license field -> throw', () => {
    const dirBad = nm('node_modules/badpkg');
    const map = new Map<string, unknown>([[dirBad, { name: 'badpkg', version: '1.0.0' }]]);
    expect(() =>
      computeBundleClosure(
        { inputs: { 'node_modules/badpkg/index.js': {} } },
        { root: ROOT, readPackageJson: makeReader(map) },
      ),
    ).toThrow(/unresolvable license/);
  });

  it('12. license "UNLICENSED" -> throw', () => {
    const dirBad = nm('node_modules/unl');
    const map = new Map<string, unknown>([
      [dirBad, { name: 'unl', version: '1.0.0', license: 'UNLICENSED' }],
    ]);
    expect(() =>
      computeBundleClosure(
        { inputs: { 'node_modules/unl/index.js': {} } },
        { root: ROOT, readPackageJson: makeReader(map) },
      ),
    ).toThrow(/unresolvable license/);
  });

  it('13. legacy licenses[] array yields OR expression', () => {
    const dirDual = nm('node_modules/dual');
    const map = new Map<string, unknown>([
      [
        dirDual,
        {
          name: 'dual',
          version: '3.0.0',
          licenses: [{ type: 'MIT' }, { type: 'Apache-2.0' }],
        },
      ],
    ]);
    const r = computeBundleClosure(
      { inputs: { 'node_modules/dual/index.js': {} } },
      { root: ROOT, readPackageJson: makeReader(map) },
    );
    expect(r.packages[0]!.license).toBe('(MIT OR Apache-2.0)');
  });

  it('14. output is deterministic: same metafile -> byte-identical JSON', () => {
    const inputs = {
      'node_modules/zod/index.js': {},
      'node_modules/moment/moment.js': {},
      'node_modules/@scope/pkg/index.js': {},
    };
    const a = computeBundleClosure({ inputs }, { root: ROOT, readPackageJson });
    const b = computeBundleClosure({ inputs }, { root: ROOT, readPackageJson });
    expect(JSON.stringify(a.packages)).toBe(JSON.stringify(b.packages));
  });

  it('15. package.json living outside node_modules -> throw (never attribute)', () => {
    // Simulate a stray package.json in the repo root that a naive walker
    // would trip on. The classifier must land the input into thirdParty (path
    // contains node_modules) and refuse to attribute to a non-node_modules root.
    const dirStray = nm('foo');
    const map = new Map<string, unknown>([
      [dirStray, { name: 'foo', version: '0.0.0', license: 'MIT' }],
    ]);
    // Also provide a proper node_modules entry so the walk-up would otherwise
    // pass; here we pass an input whose *only* package.json is at the stray dir.
    expect(() =>
      computeBundleClosure(
        { inputs: { 'node_modules/no-such-pkg/index.js': {} } },
        { root: ROOT, readPackageJson: makeReader(map) },
      ),
    ).toThrow(/could not resolve package root/);
  });

  // --- Regression: classifyInput priority bug (P1-fix) --------------------
  // Pre-fix, classifyInput ran `repoInternal` before `thirdParty` and used a
  // substring `.includes('/packages/')`, so any third-party package with its
  // own `packages/` subdirectory got silently swept into `ignored.repoInternal`
  // and the bundle closure lost the package. These tests lock in the fix.

  it('16. classifyInput priority: node_modules/foo/packages/... resolves to foo (not repoInternal)', () => {
    // Exact repro from the P1-fix report.
    const dirSynth = nm('node_modules/synthetic-dep');
    const map = new Map<string, unknown>([
      [dirSynth, { name: 'synthetic-dep', version: '1.0.0', license: 'MIT' }],
    ]);
    const r = computeBundleClosure(
      { inputs: { 'node_modules/synthetic-dep/packages/runtime/index.js': {} } },
      { root: ROOT, readPackageJson: makeReader(map) },
    );
    expect(r.packages.map((p) => `${p.name}@${p.version}`)).toEqual(['synthetic-dep@1.0.0']);
    // Must NOT be swept into repoInternal even though the path contains 'packages/'.
    expect(r.ignored.repoInternal).toEqual([]);
  });

  it('17. classifyInput priority: scoped node_modules/@scope/pkg/packages/... resolves to @scope/pkg', () => {
    const dirScopedInner = nm('node_modules/@scope/inner');
    const map = new Map<string, unknown>([
      [dirScopedInner, { name: '@scope/inner', version: '3.4.5', license: 'MIT' }],
    ]);
    const r = computeBundleClosure(
      { inputs: { 'node_modules/@scope/inner/packages/runtime/index.js': {} } },
      { root: ROOT, readPackageJson: makeReader(map) },
    );
    expect(r.packages[0]!.name).toBe('@scope/inner');
    expect(r.packages[0]!.version).toBe('3.4.5');
    expect(r.ignored.repoInternal).toEqual([]);
  });

  it('18. classifyInput priority: pnpm-nested pkg with internal packages/ subdir resolves to the pkg', () => {
    const dirPnpmDeep = nm('node_modules/.pnpm/deep@1.2.3/node_modules/deep');
    const map = new Map<string, unknown>([
      [dirPnpmDeep, { name: 'deep', version: '1.2.3', license: 'MIT' }],
    ]);
    const r = computeBundleClosure(
      {
        inputs: {
          'node_modules/.pnpm/deep@1.2.3/node_modules/deep/packages/runtime/index.js': {},
        },
      },
      { root: ROOT, readPackageJson: makeReader(map) },
    );
    expect(r.packages.map((p) => `${p.name}@${p.version}`)).toEqual(['deep@1.2.3']);
    expect(r.ignored.repoInternal).toEqual([]);
  });

  it('19. repo-internal packages/<workspace> still routes to ignored.repoInternal (no regression)', () => {
    const r = run(['packages/orchestrator/src/x.ts']);
    expect(r.packages).toEqual([]);
    expect(r.ignored.repoInternal).toEqual(['packages/orchestrator/src/x.ts']);
  });

  it('20. unknown path (neither node_modules nor packages/) -> throw (fail-closed)', () => {
    expect(() =>
      computeBundleClosure(
        { inputs: { 'somewhere/random/file.js': {} } },
        { root: ROOT, readPackageJson },
      ),
    ).toThrow(/could not classify metafile input/);
  });

  it('21. Windows backslash path normalises so segment logic still runs', () => {
    // A metafile that carries `\\`-separated paths (unusual but possible on
    // Windows or in captured fixtures) must still be classified via segment
    // matching, not fold to repoInternal via `\packages\`.
    const map = new Map<string, unknown>([
      [nm('node_modules/backslashy'), { name: 'backslashy', version: '0.0.9', license: 'MIT' }],
    ]);
    const r = computeBundleClosure(
      {
        inputs: {
          [`node_modules\\backslashy\\packages\\runtime\\x.js`]: {},
        },
      },
      { root: ROOT, readPackageJson: makeReader(map) },
    );
    expect(r.packages.map((p) => `${p.name}@${p.version}`)).toEqual(['backslashy@0.0.9']);
    expect(r.ignored.repoInternal).toEqual([]);
  });
});

describe('bundle-closure: npmPurl (canonical purl)', () => {
  it('unscoped package keeps the plain form', () => {
    expect(npmPurl('zod', '4.4.3')).toBe('pkg:npm/zod@4.4.3');
  });
  it('scoped package percent-encodes the scope @', () => {
    expect(npmPurl('@scope/pkg', '1.0.0')).toBe('pkg:npm/%40scope/pkg@1.0.0');
  });
  it('deeply-named scope works (@a-b.c/x)', () => {
    expect(npmPurl('@a-b.c/x', '0.0.1')).toBe('pkg:npm/%40a-b.c/x@0.0.1');
  });
  it('malformed scoped name (no slash) -> throw', () => {
    expect(() => npmPurl('@scopeonly', '1.0.0')).toThrow(/invalid scoped npm package name/);
  });
  it('malformed scoped name (trailing slash) -> throw', () => {
    expect(() => npmPurl('@scope/', '1.0.0')).toThrow(/invalid scoped npm package name/);
  });
});

describe('bundle-closure: spdxKind / cycloneDxLicenses', () => {
  it('single SPDX id -> id', () => {
    expect(spdxKind('MIT')).toBe('id');
    expect(spdxKind('Apache-2.0')).toBe('id');
    expect(spdxKind('GPL-2.0+')).toBe('id');
  });
  it('parenthesised OR expression -> expression', () => {
    expect(spdxKind('(MIT OR Apache-2.0)')).toBe('expression');
  });
  it('bare OR expression WITHOUT parens -> expression (regression: was mis-typed as id)', () => {
    expect(spdxKind('MIT OR Apache-2.0')).toBe('expression');
  });
  it('AND / WITH operators -> expression', () => {
    expect(spdxKind('MIT AND BSD-3-Clause')).toBe('expression');
    expect(spdxKind('GPL-2.0 WITH Classpath-exception-2.0')).toBe('expression');
  });
  it('arbitrary prose -> throw (never silently treated as SPDX id)', () => {
    expect(() => spdxKind('see license file')).toThrow(/SPDX parse error/);
    expect(() => spdxKind('Custom License v2!')).toThrow(/SPDX parse error/);
  });
  it('dangling operator -> throw', () => {
    expect(() => spdxKind('MIT OR')).toThrow(/SPDX parse error/);
  });
  it('empty -> throw', () => {
    expect(() => spdxKind('   ')).toThrow(/empty SPDX license/);
  });
  // --- P1-fix-3 regression: recursive-descent parser catches malformed expressions ---
  it('consecutive operators (MIT OR OR Apache-2.0) -> throw', () => {
    expect(() => spdxKind('MIT OR OR Apache-2.0')).toThrow(/SPDX parse error/);
  });
  it('trailing operator + consecutive ids (MIT Apache-2.0 OR) -> throw', () => {
    expect(() => spdxKind('MIT Apache-2.0 OR')).toThrow(/SPDX parse error/);
  });
  it('unmatched parens ((MIT OR Apache-2.0) -> throw', () => {
    expect(() => spdxKind('((MIT OR Apache-2.0)')).toThrow(/SPDX parse error/);
  });
  it('leading operator (OR MIT) -> throw', () => {
    expect(() => spdxKind('OR MIT')).toThrow(/SPDX parse error/);
  });
  it('empty parens () -> throw', () => {
    expect(() => spdxKind('()')).toThrow(/SPDX parse error/);
  });
  it('dangling WITH (MIT WITH) -> throw', () => {
    expect(() => spdxKind('MIT WITH')).toThrow(/SPDX parse error/);
  });
  it('nested parens (A OR (B AND C)) -> expression (valid)', () => {
    expect(spdxKind('(A OR (B AND C))')).toBe('expression');
  });
  it('cycloneDxLicenses: id form -> license.id entry', () => {
    expect(cycloneDxLicenses('MIT')).toEqual([{ license: { id: 'MIT' } }]);
  });
  it('cycloneDxLicenses: unparenthesised expression -> expression entry', () => {
    expect(cycloneDxLicenses('MIT OR Apache-2.0')).toEqual([{ expression: 'MIT OR Apache-2.0' }]);
  });
  it('cycloneDxLicenses: parenthesised expression -> expression entry', () => {
    expect(cycloneDxLicenses('(MIT OR Apache-2.0)')).toEqual([
      { expression: '(MIT OR Apache-2.0)' },
    ]);
  });
});

describe('bundle-closure: real disk smoke via tmpdir', () => {
  it('resolves against a real node_modules layout without touching the repo tree', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bc-'));
    try {
      const pkgDir = join(dir, 'node_modules', 'realfoo');
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(
        join(pkgDir, 'package.json'),
        JSON.stringify({ name: 'realfoo', version: '0.0.1', license: 'MIT' }),
      );
      writeFileSync(join(pkgDir, 'index.js'), '// stub');
      const rel = ['node_modules', 'realfoo', 'index.js'].join('/');
      const inputs: Record<string, unknown> = { [rel]: {} };
      const r = computeBundleClosure({ inputs }, { root: dir });
      expect(r.packages.map((p) => p.name + '@' + p.version)).toEqual(['realfoo@0.0.1']);
      expect(r.packages[0]!.inputs[0]!.split(sep).join('/')).toBe(rel);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
