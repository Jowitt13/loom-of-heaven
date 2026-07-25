import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANDIDATE_DIR, hostById } from './lib/host-config.ts';
import { extractZip } from './lib/zip.ts';

/**
 * Runtime smoke of a REAL extracted candidate ZIP: doctor / verify / calculate / interpret
 * from the extracted `scripts/`. Designed to run on the RUNTIME Node floor (Node 22) in CI,
 * NOT the monorepo build (which needs Node 24). No dev deps, no build — just the shipped
 * engine bundle. Exits non-zero on any failure.
 *
 * Requires `pnpm run package:hosts` first. Defaults to the qoder candidate zip; override
 * with `--host <id>`.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const candidateDir = join(root, 'releases', CANDIDATE_DIR);
const FIXED_NOW = '2026-01-01T00:00:00Z';

function run(cwd: string, args: string[]): { code: number; stdout: string; stderr: string } {
  const res = spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
  return { code: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function main(): void {
  const hostArgIdx = process.argv.indexOf('--host');
  const hostId = hostArgIdx >= 0 ? process.argv[hostArgIdx + 1]! : 'qoder';
  const h = hostById(hostId as never);
  const asset = h.releaseAsset ?? `${h.packageName}.zip`;
  const zipPath = join(candidateDir, h.id, asset);
  if (!existsSync(zipPath)) {
    process.stderr.write(`missing ${zipPath}; run \`pnpm run package:hosts\` first.\n`);
    process.exit(1);
  }

  const tmp = mkdtempSync(join(tmpdir(), 'ming-zip-runtime-'));
  const results: { name: string; ok: boolean; detail?: string }[] = [];
  try {
    extractZip(readFileSync(zipPath), tmp);
    const pkgRoot = join(tmp, h.packageName);
    const fixture = 'scripts/fixtures/smoke.json';

    const doctor = run(pkgRoot, ['scripts/ming-chart.mjs', 'doctor']);
    results.push({ name: 'doctor exit 0', ok: doctor.code === 0, detail: `exit ${doctor.code}` });

    const verify = run(pkgRoot, ['scripts/ming-chart.mjs', 'verify']);
    results.push({
      name: 'verify ok:true',
      ok: verify.code === 0 && /"ok":\s*true/.test(verify.stdout),
      detail: `exit ${verify.code}`,
    });

    const calc = run(pkgRoot, [
      'scripts/ming-chart.mjs',
      'calculate',
      '--input-file',
      fixture,
      '--systems',
      'all',
      '--now',
      FIXED_NOW,
    ]);
    results.push({
      name: 'calculate ok:true',
      ok: calc.code === 0 && /"ok":\s*true/.test(calc.stdout),
      detail: `exit ${calc.code}`,
    });

    const interp = run(pkgRoot, [
      'scripts/ming-chart.mjs',
      'interpret',
      '--input-file',
      fixture,
      '--at',
      '2026-05-20',
    ]);
    results.push({
      name: 'interpret ok:true',
      ok: interp.code === 0 && /"ok":\s*true/.test(interp.stdout),
      detail: `exit ${interp.code}`,
    });

    const answerPlan = run(pkgRoot, [
      'scripts/ming-chart.mjs',
      'answer-plan',
      '--input-file',
      fixture,
      '--topic',
      'career',
      '--lens',
      'advice',
      '--now',
      FIXED_NOW,
    ]);
    const privateFields = [
      'originalInput',
      'requestId',
      'normalizedTime',
      'calculatedAt',
      'timezone',
      '"note"',
    ];
    results.push({
      name: 'answer-plan ok:true and share-safe shape',
      ok:
        answerPlan.code === 0 &&
        /"ok":\s*true/.test(answerPlan.stdout) &&
        privateFields.every((field) => !answerPlan.stdout.includes(field)),
      detail: `exit ${answerPlan.code}`,
    });

    const targetDate = '2026-05-20';
    const dynamicAnswerPlan = run(pkgRoot, [
      'scripts/ming-chart.mjs',
      'answer-plan',
      '--input-file',
      fixture,
      '--topic',
      'general',
      '--at',
      targetDate,
      '--now',
      FIXED_NOW,
    ]);
    results.push({
      name: 'answer-plan omits exact dynamic target dates',
      ok: dynamicAnswerPlan.code === 0 && !dynamicAnswerPlan.stdout.includes(targetDate),
      detail: `exit ${dynamicAnswerPlan.code}`,
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  const failed = results.filter((r) => !r.ok);
  process.stdout.write(`Node ${process.version} — extracted ${h.packageName} (${asset})\n`);
  for (const r of results) {
    process.stdout.write(
      `[${r.ok ? 'PASS' : 'FAIL'}] ${r.name}${r.detail ? ` (${r.detail})` : ''}\n`,
    );
  }
  process.stdout.write(
    `\n${results.length - failed.length}/${results.length} zip-runtime checks passed.\n`,
  );
  if (failed.length > 0) process.exit(1);
}

main();
