// Isolated tests for tools/validate-current-docs.ts.
// Uses an in-memory reader (Map<path, content>) — never touches real repo files.
import { describe, expect, it } from 'vitest';
import { runChecks, type DocReader } from './validate-current-docs.ts';

/** A minimally-clean fixture of every doc runChecks() reads. Individual tests
 *  patch specific entries to reproduce a drift condition and assert that the
 *  matching guard fires. */
function baseFixture(): Map<string, string> {
  const files = new Map<string, string>();

  // Root manifest: published state so the D2 branch runs, but with values that
  // match the docs below so it doesn't dominate the failed set.
  files.set(
    'install-manifest.json',
    JSON.stringify({
      status: 'published',
      releaseTag: 'v0.1.6',
      releaseVersion: '0.1.6',
    }),
  );

  files.set(
    'README.md',
    [
      '# ming-engine',
      '运行需要 Node.js ≥ 22 和 开发 Node.js ≥ 24. astronomy-engine (VSOP87 + NOVAS).',
      '',
      '需要脚本执行 能力。',
      '',
      '主星体经独立 JPL Horizons 金标交叉校验。',
      '',
      'verify:cloud 依次运行 scan:deps → scan:licenses → validate:sbom → scan:secrets.',
      '',
      '指向 GitHub Release `v0.1.6`.',
    ].join('\n'),
  );

  files.set(
    'INSTALL.md',
    [
      '运行需要 Node.js ≥ 22.',
      'verify.',
      'ming-chart.mjs version',
      'install-manifest.json 更新协议。',
      'migrate --host qoder',
      '安装包来自 GitHub Release `v0.1.6`',
    ].join('\n'),
  );

  files.set(
    'docs/INSTALL_BY_PLATFORM.md',
    ['运行需要 Node.js ≥ 22.', '安装包来自 GitHub Release `v0.1.6`'].join('\n'),
  );

  files.set('docs/HOST_COMPATIBILITY.md', ['指向 GitHub Release `v0.1.6`.'].join('\n'));

  files.set(
    'docs/STATUS.md',
    [
      'validate:docs',
      'VSOP87 NOVAS',
      '| `pnpm run verify:install` | root publishes GitHub Release v0.1.6 with immutable URL |',
    ].join('\n'),
  );

  files.set(
    'docs/VALIDATION.md',
    [
      'validate:docs',
      'VSOP87 NOVAS',
      // The P0.5-rewritten paragraph: contains the marker sentence,
      // followed by clean prose (no U+FFFD).
      'heading/text fields are plain text — HTML/entity/Markdown structural characters are rejected.',
    ].join('\n'),
  );

  files.set(
    'docs/ARCHITECTURE.md',
    // No "not created yet".
    ['Production packages: contracts, orchestrator.'].join('\n'),
  );

  files.set('docs/adr/0003-provider-selection.md', 'VSOP87 NOVAS. Provider selection.');

  files.set('skills/xuan-ji-yu-heng/SKILL.md', ['Channel B', 'VSOP87', 'answer-plan'].join('\n'));

  files.set(
    'skills/xuan-ji-yu-heng/references/answer-contract.md',
    ['answer-plan', 'free-form user question', 'originalInput', 'consent'].join('\n'),
  );

  files.set(
    'skills/xuan-ji-yu-heng/references/sources-and-limitations.md',
    ['VSOP87 NOVAS', 'JPL Horizons'].join('\n'),
  );

  files.set('skills/xuan-ji-yu-heng/references/privacy.md', 'privacy notes');

  files.set(
    'AGENTS.md',
    'render disabled exit 3. verify:cloud runs scan:deps → scan:licenses → validate:sbom → scan:secrets.',
  );

  files.set('docs/PRODUCT_SPEC.md', 'JSON output only.');

  files.set(
    'package.json',
    JSON.stringify({ name: 'ming-engine', description: 'deterministic engine' }),
  );

  files.set('docs/installers/codex.md', 'codex installer');
  files.set(
    'docs/installers/qoder.md',
    [
      '~/.qoder/skills',
      '仅替换',
      '运行需要 Node.js ≥ 22',
      'ming-chart.mjs version',
      'install-manifest.json',
      'migrate',
    ].join('\n'),
  );
  files.set(
    'docs/installers/workbuddy.md',
    ['ming-chart.mjs version', 'install-manifest.json', 'migrate', '运行需要 Node.js ≥ 22'].join(
      '\n',
    ),
  );
  files.set('docs/installers/doubao.md', 'doubao installer');

  // Workflow with the accurate full chain including validate:provenance,
  // scan:licenses and validate:sbom.
  files.set(
    '.github/workflows/verify.yml',
    [
      '# format:check -> lint -> typecheck -> test -> build -> validate:provenance ->',
      '# validate:skill -> validate:reading -> validate:docs -> smoke -> forward:test ->',
      '# package:hosts -> verify:hosts -> verify:install -> check:doc-counts ->',
      '# scan:deps -> scan:licenses -> validate:sbom -> scan:secrets',
      'env:',
      "  DEPENDENCY_AUDIT_STRICT: '1'",
    ].join('\n'),
  );

  // scan-deps.ts: clean wording that does NOT promise CI has network. Real file
  // is much longer; the fixture only needs enough to be scanned by the guard.
  files.set(
    'tools/scan-deps.ts',
    [
      '// Under --strict / DEPENDENCY_AUDIT_STRICT=1 an unreachable advisory service is a hard failure.',
      '// The fail-closed guarantee comes from the strict flag alone; no assumption is made about network.',
    ].join('\n'),
  );

  return files;
}

/** Reader factory from a Map. */
function readerOf(files: Map<string, string>): DocReader {
  return (rel: string): string | null => (files.has(rel) ? (files.get(rel) as string) : null);
}

describe('validate-current-docs: injected reader', () => {
  it('1. all-clean fixture -> zero failures', () => {
    const { failed } = runChecks(readerOf(baseFixture()));
    // The base fixture must be clean; any regression here is worth investigating.
    if (failed.length > 0) {
      // Print for diagnostics; still assert.
      // eslint-disable-next-line no-console
      console.error(
        'unexpected FAILs in clean fixture:\n' +
          failed.map((f) => `  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`).join('\n'),
      );
    }
    expect(failed.length).toBe(0);
  });

  it('2. workflow missing DEPENDENCY_AUDIT_STRICT -> matching FAIL', () => {
    const files = baseFixture();
    files.set(
      '.github/workflows/verify.yml',
      ['# format:check -> ... -> validate:provenance -> ... -> scan:licenses -> scan:secrets'].join(
        '\n',
      ),
    );
    const { failed } = runChecks(readerOf(files));
    expect(failed.map((f) => f.name)).toContain(
      'workflow: DEPENDENCY_AUDIT_STRICT env set in verify job',
    );
  });

  it('3. workflow contains "NOT wired in" -> matching FAIL', () => {
    const files = baseFixture();
    files.set(
      '.github/workflows/verify.yml',
      [
        '# format:check -> ... -> validate:provenance -> ... -> scan:licenses -> scan:secrets',
        '# license scan and SBOM are NOT wired in yet',
        "env:\n  DEPENDENCY_AUDIT_STRICT: '1'",
      ].join('\n'),
    );
    const { failed } = runChecks(readerOf(files));
    expect(failed.map((f) => f.name)).toContain(
      'workflow: no stale "NOT wired in" license/SBOM claim',
    );
  });

  it('4. VALIDATION.md contains "numeric character references decoded" -> matching FAIL', () => {
    const files = baseFixture();
    const cur = files.get('docs/VALIDATION.md') as string;
    files.set('docs/VALIDATION.md', cur + '\nnumeric character references decoded incl. one layer');
    const { failed } = runChecks(readerOf(files));
    expect(failed.map((f) => f.name)).toContain(
      'VALIDATION.md: no stale "numeric character references decoded"',
    );
  });

  it('5. VALIDATION.md contains "two-layer reference decoding" -> matching FAIL', () => {
    const files = baseFixture();
    const cur = files.get('docs/VALIDATION.md') as string;
    files.set('docs/VALIDATION.md', cur + '\ntwo-layer reference decoding is applied');
    const { failed } = runChecks(readerOf(files));
    expect(failed.map((f) => f.name)).toContain(
      'VALIDATION.md: no stale "two-layer reference decoding"',
    );
  });

  it('6. ARCHITECTURE.md contains "not created yet" -> matching FAIL', () => {
    const files = baseFixture();
    files.set('docs/ARCHITECTURE.md', 'Production packages are not created yet — Phase 2.');
    const { failed } = runChecks(readerOf(files));
    expect(failed.map((f) => f.name)).toContain('ARCHITECTURE.md: no stale "not created yet"');
  });

  it('7. README.md missing scan:licenses in chain -> matching FAIL', () => {
    const files = baseFixture();
    const cur = files.get('README.md') as string;
    files.set(
      'README.md',
      cur.replace(
        'scan:deps → scan:licenses → validate:sbom → scan:secrets',
        'scan:deps → scan:secrets',
      ),
    );
    const { failed } = runChecks(readerOf(files));
    expect(failed.map((f) => f.name)).toContain(
      'README.md: verify:cloud chain includes scan:licenses',
    );
  });

  it('8. AGENTS.md missing scan:licenses in chain -> matching FAIL (new guard)', () => {
    const files = baseFixture();
    files.set('AGENTS.md', 'render disabled exit 3. verify:cloud runs scan:deps → scan:secrets.');
    const { failed } = runChecks(readerOf(files));
    expect(failed.map((f) => f.name)).toContain(
      'AGENTS.md: verify:cloud chain includes scan:licenses',
    );
  });

  it('9. workflow header chain missing validate:provenance -> matching FAIL (new guard)', () => {
    const files = baseFixture();
    files.set(
      '.github/workflows/verify.yml',
      [
        '# format:check -> ... -> validate:skill -> ... -> scan:deps -> scan:licenses -> scan:secrets',
        "env:\n  DEPENDENCY_AUDIT_STRICT: '1'",
      ].join('\n'),
    );
    const { failed } = runChecks(readerOf(files));
    expect(failed.map((f) => f.name)).toContain(
      'workflow: header comment chain lists validate:provenance',
    );
  });

  it('10. workflow header chain missing scan:licenses -> matching FAIL (new guard)', () => {
    const files = baseFixture();
    files.set(
      '.github/workflows/verify.yml',
      [
        '# format:check -> ... -> validate:provenance -> ... -> scan:deps -> scan:secrets',
        "env:\n  DEPENDENCY_AUDIT_STRICT: '1'",
      ].join('\n'),
    );
    const { failed } = runChecks(readerOf(files));
    expect(failed.map((f) => f.name)).toContain(
      'workflow: header comment chain lists scan:licenses',
    );
  });

  it('11. VALIDATION.md P0.5 paragraph contains U+FFFD -> matching FAIL (new guard)', () => {
    const files = baseFixture();
    files.set(
      'docs/VALIDATION.md',
      [
        'validate:docs',
        'VSOP87 NOVAS',
        // U+FFFD injected right after the marker sentence — this is exactly
        // the class of drift the guard is designed to catch.
        'heading/text fields are plain text \uFFFD HTML/entity/Markdown structural characters are rejected.',
      ].join('\n'),
    );
    const { failed } = runChecks(readerOf(files));
    expect(failed.map((f) => f.name)).toContain(
      'VALIDATION.md: P0.5 plain-text 段无 U+FFFD 替换字符',
    );
  });

  it('12. clean P0.5 paragraph -> no U+FFFD FAIL', () => {
    // A cousin to test 11: prove the same guard does NOT fire on clean text,
    // i.e. it is not a blanket "no U+FFFD anywhere" check that would collide
    // with pre-existing 乱码 elsewhere in the real file.
    const files = baseFixture();
    files.set(
      'docs/VALIDATION.md',
      [
        'validate:docs',
        'VSOP87 NOVAS',
        // Pre-existing 乱码 far from the marker, to prove the guard is scoped:
        'Legacy paragraph mentioning \uFFFD outside the P0.5 window ' + 'x'.repeat(500),
        'heading/text fields are plain text — HTML/entity/Markdown structural characters are rejected.',
      ].join('\n'),
    );
    const { failed } = runChecks(readerOf(files));
    expect(failed.map((f) => f.name)).not.toContain(
      'VALIDATION.md: P0.5 plain-text 段无 U+FFFD 替换字符',
    );
  });

  it('13. README contains static "**N tests / M files**" -> matching FAIL (new guard)', () => {
    const files = baseFixture();
    const cur = files.get('README.md') as string;
    files.set('README.md', cur + '\n最近一次本地验证为 **471 tests / 29 files**。');
    const { failed } = runChecks(readerOf(files));
    expect(failed.map((f) => f.name)).toContain(
      'README.md: no stale static "N tests / M files" claim',
    );
  });

  it('13b. README plain-text "N tests / M files" (no bold) -> matching FAIL', () => {
    // Regression: the earlier regex required `**` bold markers, so a plain-text
    // sentence like this one would silently slip past the guard even though it
    // is exactly the drift-y phrasing README must not carry.
    const files = baseFixture();
    const cur = files.get('README.md') as string;
    files.set('README.md', cur + '\n最近一次本地验证为 471 tests / 29 files。');
    const { failed } = runChecks(readerOf(files));
    expect(failed.map((f) => f.name)).toContain(
      'README.md: no stale static "N tests / M files" claim',
    );
  });

  it('16. workflow header missing validate:sbom -> matching FAIL (new guard)', () => {
    const files = baseFixture();
    files.set(
      '.github/workflows/verify.yml',
      [
        '# format:check -> ... -> validate:provenance -> ... -> scan:licenses -> scan:secrets',
        "env:\n  DEPENDENCY_AUDIT_STRICT: '1'",
      ].join('\n'),
    );
    const { failed } = runChecks(readerOf(files));
    expect(failed.map((f) => f.name)).toContain(
      'workflow: header comment chain lists validate:sbom',
    );
  });

  it('17. README verify:cloud chain missing validate:sbom -> matching FAIL (new guard)', () => {
    const files = baseFixture();
    const cur = files.get('README.md') as string;
    files.set(
      'README.md',
      cur.replace(
        'scan:deps → scan:licenses → validate:sbom → scan:secrets',
        'scan:deps → scan:licenses → scan:secrets',
      ),
    );
    const { failed } = runChecks(readerOf(files));
    expect(failed.map((f) => f.name)).toContain(
      'README.md: verify:cloud chain includes validate:sbom',
    );
  });

  it('18. AGENTS.md verify:cloud chain missing validate:sbom -> matching FAIL (new guard)', () => {
    const files = baseFixture();
    files.set(
      'AGENTS.md',
      'render disabled exit 3. verify:cloud runs scan:deps → scan:licenses → scan:secrets.',
    );
    const { failed } = runChecks(readerOf(files));
    expect(failed.map((f) => f.name)).toContain(
      'AGENTS.md: verify:cloud chain includes validate:sbom',
    );
  });

  it('14. README contains "tests-N passing" shield badge -> matching FAIL (new guard)', () => {
    const files = baseFixture();
    const cur = files.get('README.md') as string;
    files.set(
      'README.md',
      cur + '\n<img src="https://img.shields.io/badge/tests-467%20passing-success.svg" />',
    );
    const { failed } = runChecks(readerOf(files));
    expect(failed.map((f) => f.name)).toContain(
      'README.md: no static "tests-N passing" shield badge',
    );
  });

  it('15. scan-deps.ts promises "CI always has network" -> matching FAIL (new guard)', () => {
    const files = baseFixture();
    files.set(
      'tools/scan-deps.ts',
      [
        '// CI always has network (the workflow pnpm install runs first),',
        '// so CI still enforces even when the advisory service is reachable.',
      ].join('\n'),
    );
    const { failed } = runChecks(readerOf(files));
    expect(failed.map((f) => f.name)).toContain(
      'scan-deps.ts: no promise of "CI always has network" / "advisory service is reachable"',
    );
  });

  it('13. README says JPL golden 待补 -> matching FAIL (stale claim)', () => {
    const files = baseFixture();
    files.set(
      'README.md',
      files
        .get('README.md')!
        .replace('主星体经独立 JPL Horizons 金标交叉校验。', '本仓库独立 JPL Horizons 金标待补。'),
    );
    const { failed } = runChecks(readerOf(files));
    expect(failed.map((f) => f.name)).toContain('README.md: 不含 JPL golden 已存在，不得声称待补');
  });

  it('14. README says SYSTEM_NOT_YET_IMPLEMENTED -> matching FAIL (outdated)', () => {
    const files = baseFixture();
    files.set(
      'README.md',
      files.get('README.md')! + '\nWestern returns SYSTEM_NOT_YET_IMPLEMENTED.',
    );
    const { failed } = runChecks(readerOf(files));
    expect(failed.map((f) => f.name)).toContain(
      'README.md: 不含 不得声称 Western 返回 SYSTEM_NOT_YET_IMPLEMENTED（已集成）',
    );
  });

  it('15. README missing JPL golden existence statement -> matching FAIL', () => {
    const files = baseFixture();
    files.set(
      'README.md',
      files
        .get('README.md')!
        .replace('主星体经独立 JPL Horizons 金标交叉校验。', '主星体精度回归。'),
    );
    const { failed } = runChecks(readerOf(files));
    expect(failed.map((f) => f.name)).toContain('README.md: 含 缺 JPL Horizons 金标已完成声明');
  });

  it('16. STATUS.md says SYSTEM_NOT_YET_IMPLEMENTED -> matching FAIL (stale)', () => {
    const files = baseFixture();
    files.set(
      'docs/STATUS.md',
      files.get('docs/STATUS.md')! + '\nWestern still emits SYSTEM_NOT_YET_IMPLEMENTED.',
    );
    const { failed } = runChecks(readerOf(files));
    expect(failed.map((f) => f.name)).toContain(
      'docs/STATUS.md: 不含 不得在当前状态段声称 Western 仍返回 SYSTEM_NOT_YET_IMPLEMENTED',
    );
  });

  it('16b. ADR 0003 [HISTORICAL] containing SYSTEM_NOT_YET_IMPLEMENTED does NOT trip the guard', () => {
    const files = baseFixture();
    // ADR fixture already contains the string in its historical evaluation
    files.set(
      'docs/adr/0003-provider-selection.md',
      'VSOP87 NOVAS. Western still returns SYSTEM_NOT_YET_IMPLEMENTED. [HISTORICAL]',
    );
    const { failed } = runChecks(readerOf(files));
    // The ADR rule has no mustNot for SYSTEM_NOT_YET_IMPLEMENTED, so it must pass
    expect(failed.map((f) => f.name)).not.toContain(
      'docs/adr/0003-provider-selection.md: 不含 不得在当前状态段声称 Western 仍返回 SYSTEM_NOT_YET_IMPLEMENTED',
    );
  });
});
