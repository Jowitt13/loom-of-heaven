import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSingleTopDir, extractZipFileSafe } from './lib/zip.ts';
import { listZipEntries, readZipFileSafe } from './lib/zip.ts';

/** Runtime proof for an extracted P9 archive using synthetic data only. */
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const name = 'psychology-self-assessment';
const zipPath = join(root, 'dist', `${name}.zip`);

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}
const checks: Check[] = [];
const add = (name: string, ok: boolean, detail?: string): void => {
  checks.push(detail === undefined ? { name, ok } : { name, ok, detail });
};

function run(cwd: string, args: string[]): { code: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
  return { code: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function json(text: string): Record<string, unknown> {
  return JSON.parse(text) as Record<string, unknown>;
}

function main(): void {
  if (!existsSync(zipPath))
    throw new Error('psychology zip missing; run `pnpm run package:psychology-skill` first');
  const structure = assertSingleTopDir(listZipEntries(readZipFileSafe(zipPath)), name);
  add('archive has a single psychology-self-assessment root', structure.ok, structure.error);
  const temp = mkdtempSync(join(tmpdir(), 'loom-psychology-skill-'));
  try {
    const payload = join(temp, 'payload');
    extractZipFileSafe(zipPath, payload);
    const skill = join(payload, name);
    const consentPath = join(temp, 'synthetic-consent.json');
    const sessionPath = join(temp, 'synthetic-session.json');
    const answerPath = join(temp, 'synthetic-answers.json');
    const profilePath = join(temp, 'synthetic-profile.json');
    const exportPath = join(temp, 'synthetic-export.json');
    writeFileSync(
      consentPath,
      JSON.stringify({
        scope: 'personality',
        granted: true,
        noticeVersion: 'psychology-self-assessment-notice/v1',
      }),
      'utf8',
    );

    const doctor = run(skill, ['scripts/psychology.mjs', 'doctor']);
    const doctorJson = doctor.code === 0 ? json(doctor.stdout) : {};
    add(
      'doctor is offline, Node-22-compatible and nonclinical',
      doctor.code === 0 &&
        doctorJson.runtimeSupported === true &&
        doctorJson.clinicalInstrumentsAvailable === false,
    );

    const items = run(skill, [
      'scripts/psychology.mjs',
      'items',
      '--instrument',
      'ipip-neo-120-zh',
    ]);
    const itemsJson = items.code === 0 ? json(items.stdout) : {};
    add(
      'items emits exactly 120 source-bound Mandarin items',
      items.code === 0 &&
        itemsJson.itemCount === 120 &&
        Array.isArray(itemsJson.items) &&
        itemsJson.items.length === 120,
    );
    const itemRows = Array.isArray(itemsJson.items)
      ? (itemsJson.items as Array<{ id: string }>)
      : [];
    writeFileSync(
      answerPath,
      JSON.stringify(itemRows.map((item) => ({ itemId: item.id, response: 1 }))),
      'utf8',
    );

    const start = run(skill, [
      'scripts/psychology.mjs',
      'start',
      '--instrument',
      'ipip-neo-120-zh',
      '--consent-file',
      consentPath,
      '--output-file',
      sessionPath,
    ]);
    add(
      'start writes the private session only to a requested local file',
      start.code === 0 &&
        start.stdout === '' &&
        existsSync(sessionPath) &&
        !start.stderr.includes('synthetic-'),
    );

    const answer = run(skill, [
      'scripts/psychology.mjs',
      'answer',
      '--input-file',
      sessionPath,
      '--answers-file',
      answerPath,
      '--output-file',
      sessionPath,
    ]);
    add(
      'answer accepts synthetic bounded responses without echoing them',
      answer.code === 0 && answer.stdout === '' && !answer.stderr.includes('ipip-neo-120-001'),
    );

    const score = run(skill, [
      'scripts/psychology.mjs',
      'score',
      '--input-file',
      sessionPath,
      '--output-file',
      profilePath,
    ]);
    const profileJson = score.code === 0 ? json(readFileSync(profilePath, 'utf8')) : {};
    add(
      'score creates a de-identified nonclinical profile',
      score.code === 0 &&
        profileJson.ok === true &&
        !JSON.stringify(profileJson).includes('"answers"') &&
        !JSON.stringify(profileJson).includes('"response"'),
    );

    const exported = run(skill, [
      'scripts/psychology.mjs',
      'export',
      '--input-file',
      profilePath,
      '--output-file',
      exportPath,
    ]);
    add(
      'export accepts the score artifact and preserves no raw answers',
      exported.code === 0 &&
        existsSync(exportPath) &&
        !readFileSync(exportPath, 'utf8').includes('"answers"'),
    );

    const deleted = run(skill, ['scripts/psychology.mjs', 'delete', '--input-file', sessionPath]);
    add(
      'delete removes only the validated local session',
      deleted.code === 0 && !existsSync(sessionPath) && /"deleted":\s*true/.test(deleted.stdout),
    );

    const verify = run(skill, ['scripts/psychology.mjs', 'verify']);
    add(
      'built-in synthetic verify passes',
      verify.code === 0 && /"ok":\s*true/.test(verify.stdout),
    );
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
  const failed = checks.filter((check) => !check.ok);
  for (const check of checks) {
    process.stdout.write(
      `[${check.ok ? 'PASS' : 'FAIL'}] ${check.name}${check.detail ? ` (${check.detail})` : ''}\n`,
    );
  }
  process.stdout.write(
    `\n${checks.length - failed.length}/${checks.length} psychology package checks passed.\n`,
  );
  if (failed.length > 0) process.exit(1);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
}
