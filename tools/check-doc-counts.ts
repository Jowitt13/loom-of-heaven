import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Documentation count-drift guard.
 *
 * One real Vitest run is the single source of truth for the test-case and
 * test-file counts quoted in docs/VALIDATION.md and docs/STATUS.md. This runs
 * the suite once (JSON reporter), then fails if any `<N> tests / <M> files`
 * phrase in those docs disagrees with the actual run. Exit code is non-zero on
 * drift so it can gate `verify:all` / CI.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// Docs whose quoted counts must equal a real run. Add a path here to guard it.
const GUARDED_DOCS = ['docs/VALIDATION.md', 'docs/STATUS.md'];
// Matches "88 tests / 8 files" (case-insensitive, flexible spacing).
const COUNT_RE = /(\d+)\s*tests?\s*\/\s*(\d+)\s*files?/gi;

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}
const checks: Check[] = [];
const add = (name: string, ok: boolean, detail?: string): void => {
  checks.push(detail === undefined ? { name, ok } : { name, ok, detail });
};

// --- 1. Run the suite once; its JSON report is the single source of truth. ---
const vitestCli = join(root, 'node_modules', 'vitest', 'vitest.mjs');
if (!existsSync(vitestCli)) {
  process.stderr.write(`[FAIL] cannot find Vitest CLI at ${relative(root, vitestCli)}\n`);
  process.exit(1);
}

const tmpDir = join(root, '.tmp');
mkdirSync(tmpDir, { recursive: true });
const outFile = join(tmpDir, 'vitest-doc-counts.json');
rmSync(outFile, { force: true });

const run = spawnSync(
  process.execPath,
  [vitestCli, 'run', '--reporter=json', `--outputFile=${outFile}`],
  { cwd: root, encoding: 'utf8' },
);
if (run.status !== 0 || !existsSync(outFile)) {
  process.stderr.write(
    `[FAIL] test run for the doc-count check did not complete (exit ${run.status ?? -1}).\n` +
      `${run.stderr ?? ''}\n`,
  );
  process.exit(1);
}

interface VitestJson {
  numTotalTests: number;
  testResults: unknown[];
}
const report = JSON.parse(readFileSync(outFile, 'utf8')) as VitestJson;
const actualTests = report.numTotalTests;
const actualFiles = Array.isArray(report.testResults) ? report.testResults.length : Number.NaN;
process.stdout.write(`Real test run: ${actualTests} tests / ${actualFiles} files.\n`);

// --- 2. Every "<N> tests / <M> files" claim in the guarded docs must match. ---
for (const rel of GUARDED_DOCS) {
  const p = join(root, rel);
  if (!existsSync(p)) {
    add(`doc present: ${rel}`, false);
    continue;
  }
  const matches = [...readFileSync(p, 'utf8').matchAll(COUNT_RE)];
  add(`${rel} states a "<N> tests / <M> files" count`, matches.length > 0);
  for (const m of matches) {
    const tests = Number(m[1]);
    const files = Number(m[2]);
    const ok = tests === actualTests && files === actualFiles;
    add(
      `${rel}: "${m[0]}" matches the real run`,
      ok,
      ok ? undefined : `expected ${actualTests} tests / ${actualFiles} files`,
    );
  }
}

// --- Report ---
const failed = checks.filter((c) => !c.ok);
for (const c of checks) {
  const detail = c.detail ? ` (${c.detail})` : '';
  process.stdout.write(`[${c.ok ? 'PASS' : 'FAIL'}] ${c.name}${detail}\n`);
}
process.stdout.write(
  `\n${checks.length - failed.length}/${checks.length} doc-count checks passed.\n`,
);
if (failed.length > 0) {
  process.stdout.write(
    'Docs drifted from the real test run. Update the counts in docs/VALIDATION.md and\n' +
      'docs/STATUS.md so both match the run reported above.\n',
  );
  process.exit(1);
}
