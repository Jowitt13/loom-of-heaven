import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANDIDATE_DIR, hostById } from './lib/host-config.ts';
import { extractZipFileSafe } from './lib/zip.ts';

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
    extractZipFileSafe(zipPath, join(tmp, 'payload'));
    const pkgRoot = join(tmp, 'payload', h.packageName);
    const fixture = 'scripts/fixtures/smoke.json';

    const doctor = run(pkgRoot, ['scripts/loom-chart.mjs', 'doctor']);
    results.push({ name: 'doctor exit 0', ok: doctor.code === 0, detail: `exit ${doctor.code}` });

    const verify = run(pkgRoot, ['scripts/loom-chart.mjs', 'verify']);
    results.push({
      name: 'verify ok:true',
      ok: verify.code === 0 && /"ok":\s*true/.test(verify.stdout),
      detail: `exit ${verify.code}`,
    });

    const calc = run(pkgRoot, [
      'scripts/loom-chart.mjs',
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
      'scripts/loom-chart.mjs',
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
      'scripts/loom-chart.mjs',
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
      'scripts/loom-chart.mjs',
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

    const integrityBase = {
      calendar: 'gregorian',
      localDate: '2000-02-29',
      localTime: '08:30',
      timeAccuracy: 'exact',
      timezone: 'Asia/Shanghai',
      location: { latitude: 31.23, longitude: 121.47, source: 'user' },
      ruleGender: 'male',
      settings: { systems: ['western', 'bazi', 'ziwei', 'vedic'] },
    };
    const writeInput = (name: string, value: unknown): string => {
      writeFileSync(join(pkgRoot, name), JSON.stringify(value));
      return name;
    };
    const invalidDate = '2023-02-29';
    const badDateFile = writeInput('integrity-bad-date.json', {
      ...integrityBase,
      localDate: invalidDate,
    });
    const leapFile = writeInput('integrity-leap.json', integrityBase);
    const fakeRulesetFile = writeInput('integrity-fake-ruleset.json', {
      ...integrityBase,
      localDate: '1990-06-15',
      settings: { systems: ['bazi'], bazi: { rulesetId: 'review-nonexistent@9.9.9' } },
    });
    const lunarFile = writeInput('integrity-lunar.json', {
      ...integrityBase,
      calendar: 'lunar',
      localDate: '2023-02-30',
      lunarLeapMonth: false,
    });

    const badDate = run(pkgRoot, [
      'scripts/loom-chart.mjs',
      'normalize',
      '--input-file',
      badDateFile,
    ]);
    results.push({
      name: 'nonexistent Gregorian date rejected (exit 2, no echo)',
      ok:
        badDate.code === 2 &&
        /"code":\s*"INPUT_VALIDATION_FAILED"/.test(badDate.stdout) &&
        !badDate.stdout.includes(invalidDate) &&
        !badDate.stderr.includes(invalidDate),
      detail: `exit ${badDate.code}`,
    });

    const fakeRuleset = run(pkgRoot, [
      'scripts/loom-chart.mjs',
      'calculate',
      '--input-file',
      fakeRulesetFile,
    ]);
    results.push({
      name: 'fabricated ruleset rejected (exit 10)',
      ok: fakeRuleset.code === 10 && /"code":\s*"RULESET_UNSUPPORTED"/.test(fakeRuleset.stdout),
      detail: `exit ${fakeRuleset.code}`,
    });

    const leap = run(pkgRoot, [
      'scripts/loom-chart.mjs',
      'calculate',
      '--input-file',
      leapFile,
      '--now',
      FIXED_NOW,
    ]);
    const leapBundle = (
      JSON.parse(leap.stdout) as {
        bundle?: {
          normalizedTime?: { localCivil?: string; utcInstant?: string };
          bazi?: { rulesetId?: string };
        };
      }
    ).bundle;
    results.push({
      name: '2000-02-29 accepted with consistent local/UTC time',
      ok:
        leap.code === 0 &&
        leapBundle?.normalizedTime?.localCivil === '2000-02-29T08:30:00+08:00' &&
        leapBundle.normalizedTime.utcInstant === '2000-02-29T00:30:00Z' &&
        leapBundle.bazi?.rulesetId === 'bazi-standard@0.1.1',
      detail: `exit ${leap.code}`,
    });

    const integrityInterp = run(pkgRoot, [
      'scripts/loom-chart.mjs',
      'interpret',
      '--input-file',
      leapFile,
      '--now',
      FIXED_NOW,
    ]);
    const interpRulesets = (
      JSON.parse(integrityInterp.stdout) as {
        interpretation?: { rulesets?: Array<{ id?: string; version?: string }> };
      }
    ).interpretation?.rulesets;
    results.push({
      name: 'bazi interpretation ruleset recorded when executed',
      ok:
        integrityInterp.code === 0 &&
        interpRulesets?.some(
          (ruleset) => ruleset.id === 'bazi-rules-ziping' && ruleset.version === '0.1.0',
        ) === true,
      detail: `exit ${integrityInterp.code}`,
    });

    const lunar = run(pkgRoot, ['scripts/loom-chart.mjs', 'normalize', '--input-file', lunarFile]);
    const lunarPayload = JSON.parse(lunar.stdout) as {
      normalized?: { localDate?: string };
      warnings?: Array<{ code?: string }>;
    };
    results.push({
      name: 'lunar 2023-02-30 still converts to 2023-03-21',
      ok:
        lunar.code === 0 &&
        lunarPayload.normalized?.localDate === '2023-03-21' &&
        lunarPayload.warnings?.some((warning) => warning.code === 'LUNAR_CONVERTED') === true,
      detail: `exit ${lunar.code}`,
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
