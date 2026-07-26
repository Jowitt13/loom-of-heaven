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
 * phrase in those docs disagrees with the actual run. It also re-runs the two
 * fast offline validators (`validate-skill.ts`, `validate-reading-examples.ts`)
 * and fails if a quoted `N/N` stage count near "Skill validate"/"validate:skill"
 * or "Reading-example"/"validate:reading" drifts from the real run. The smoke
 * (10/10) and forward:test (41/41) counts are deliberately NOT guarded here —
 * re-running those stages would double the gate's cost. Exit code is non-zero
 * on drift so it can gate `verify:all` / CI.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// Docs whose quoted counts must equal a real run. Add a path here to guard it.
const GUARDED_DOCS = ['docs/VALIDATION.md', 'docs/STATUS.md'];
// Matches "88 tests / 8 files" (case-insensitive, flexible spacing).
const COUNT_RE = /(\d+)\s*tests?\s*\/\s*(\d+)\s*files?/gi;
// Matches an "N/N" stage count within a short window after its stage keyword, so
// table rows without a count (e.g. the gate-stage table) are not misread.
const SKILL_COUNT_RE = /(?:Skill validate|validate:skill)[^0-9]{0,40}(\d+)\s*\/\s*(\d+)/g;
const READING_COUNT_RE = /(?:Reading-example|validate:reading)[^0-9]{0,40}(\d+)\s*\/\s*(\d+)/g;

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

// --- 2. Re-run the two fast offline validators; their passing summaries are the
//        single source of truth for the quoted stage counts. ---
function runValidator(script: string, summaryRe: RegExp, label: string): number {
  const res = spawnSync(process.execPath, [join(root, 'tools', script)], {
    cwd: root,
    encoding: 'utf8',
  });
  const m = (res.stdout ?? '').match(summaryRe);
  if (res.status !== 0 || !m) {
    process.stderr.write(
      `[FAIL] ${label} run for the doc-count check did not pass (exit ${res.status ?? -1}).\n`,
    );
    process.exit(1);
  }
  return Number(m[1]);
}
const actualSkill = runValidator(
  'validate-skill.ts',
  /(\d+)\/(\d+) checks passed/,
  'validate:skill',
);
const actualReading = runValidator(
  'validate-reading-examples.ts',
  /(\d+)\/(\d+) reading-example checks passed/,
  'validate:reading',
);
process.stdout.write(
  `Real validator runs: validate:skill ${actualSkill}/${actualSkill}, ` +
    `validate:reading ${actualReading}/${actualReading}.\n`,
);

// --- 3. Every guarded claim in the guarded docs must match the real runs. ---
for (const rel of GUARDED_DOCS) {
  const p = join(root, rel);
  if (!existsSync(p)) {
    add(`doc present: ${rel}`, false);
    continue;
  }
  const text = readFileSync(p, 'utf8');
  const matches = [...text.matchAll(COUNT_RE)];
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
  for (const [label, re, actual] of [
    ['validate:skill', SKILL_COUNT_RE, actualSkill],
    ['validate:reading', READING_COUNT_RE, actualReading],
  ] as const) {
    const stage = [...text.matchAll(re)];
    add(`${rel} states a ${label} count`, stage.length > 0);
    for (const m of stage) {
      const ok = Number(m[1]) === actual && Number(m[2]) === actual;
      add(
        `${rel}: ${label} "${m[1]}/${m[2]}" matches the real run`,
        ok,
        ok ? undefined : `expected ${actual}/${actual}`,
      );
    }
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
    'Docs drifted from the real runs. Update the counts in docs/VALIDATION.md and\n' +
      'docs/STATUS.md so both match the runs reported above.\n',
  );
  process.exit(1);
}
