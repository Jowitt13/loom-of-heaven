import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PSYCHOLOGY_CANDIDATE_DIR,
  PSYCHOLOGY_CANDIDATE_TAG,
  PSYCHOLOGY_HOSTS,
  PSYCHOLOGY_RELEASE_VERSION,
  PSYCHOLOGY_SKILL_NAME,
  assertPsychologyCandidateBoundary,
} from './lib/psychology-host-config.ts';
import {
  assertSingleTopDir,
  buildZip,
  extractZipFileSafe,
  listZipEntries,
  readZipFileSafe,
} from './lib/zip.ts';

/**
 * Verify actual P9 candidate ZIPs rather than their source tree. This is a local packaging
 * gate, not a claim that any host has completed real-device installation.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const candidateDir = join(root, 'releases', PSYCHOLOGY_CANDIDATE_DIR);

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
  // Kept as a separate function so command output never reaches the gate's own stdout.
  const child = spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
  return {
    code: child.status ?? -1,
    stdout: child.stdout ?? '',
    stderr: child.stderr ?? '',
  };
}

function parse(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function assertSyntheticLifecycle(skill: string, temp: string, host: string): void {
  const consent = join(temp, 'consent.json');
  const session = join(temp, 'session.json');
  const answers = join(temp, 'answers.json');
  const profile = join(temp, 'profile.json');
  const exported = join(temp, 'export.json');
  writeFileSync(
    consent,
    JSON.stringify({
      scope: 'personality',
      granted: true,
      noticeVersion: 'psychology-self-assessment-notice/v1',
    }),
    'utf8',
  );
  const items = run(skill, ['scripts/psychology.mjs', 'items', '--instrument', 'ipip-neo-120-zh']);
  const itemsJson = parse(items.stdout);
  const itemRows = Array.isArray(itemsJson?.items)
    ? (itemsJson?.items as Array<{ id?: string }>)
    : [];
  add(`[${host}] items has the 120 public item identifiers`, itemRows.length === 120);
  writeFileSync(
    answers,
    JSON.stringify(itemRows.map((item) => ({ itemId: item.id, response: 1 }))),
    'utf8',
  );

  const start = run(skill, [
    'scripts/psychology.mjs',
    'start',
    '--instrument',
    'ipip-neo-120-zh',
    '--consent-file',
    consent,
    '--output-file',
    session,
  ]);
  add(
    `[${host}] start keeps the private session off stdout`,
    start.code === 0 && start.stdout === '',
  );
  const answer = run(skill, [
    'scripts/psychology.mjs',
    'answer',
    '--input-file',
    session,
    '--answers-file',
    answers,
    '--output-file',
    session,
  ]);
  add(
    `[${host}] answer accepts synthetic responses without echoing them`,
    answer.code === 0 && answer.stdout === '' && !answer.stderr.includes('ipip-neo-120-001'),
  );
  const score = run(skill, [
    'scripts/psychology.mjs',
    'score',
    '--input-file',
    session,
    '--output-file',
    profile,
  ]);
  const profileJson = existsSync(profile) ? readFileSync(profile, 'utf8') : '';
  add(
    `[${host}] score produces a de-identified nonclinical profile`,
    score.code === 0 && !profileJson.includes('"answers"') && !profileJson.includes('"response"'),
  );
  const exportedResult = run(skill, [
    'scripts/psychology.mjs',
    'export',
    '--input-file',
    profile,
    '--output-file',
    exported,
  ]);
  add(
    `[${host}] export preserves no raw answers`,
    exportedResult.code === 0 &&
      existsSync(exported) &&
      !readFileSync(exported, 'utf8').includes('"answers"'),
  );
  const deleted = run(skill, ['scripts/psychology.mjs', 'delete', '--input-file', session]);
  add(`[${host}] delete removes the synthetic session`, deleted.code === 0 && !existsSync(session));
}

function selfTest(): void {
  const good = [`${PSYCHOLOGY_SKILL_NAME}/SKILL.md`];
  const bad = [`${PSYCHOLOGY_SKILL_NAME}/${PSYCHOLOGY_SKILL_NAME}/SKILL.md`];
  add(
    '[self-test] single top directory is accepted',
    assertSingleTopDir(good, PSYCHOLOGY_SKILL_NAME).ok,
  );
  add('[self-test] double nesting is rejected', !assertSingleTopDir(bad, PSYCHOLOGY_SKILL_NAME).ok);
  const nestedZip = buildZip([{ name: bad[0]!, data: Buffer.from('x') }]);
  add(
    '[self-test] nested ZIP structure is rejected',
    !assertSingleTopDir(listZipEntries(nestedZip), PSYCHOLOGY_SKILL_NAME).ok,
  );
}

function checkCandidateManifest(): void {
  const boundary = assertPsychologyCandidateBoundary();
  add('P9 candidate tag boundary is valid', boundary.ok, boundary.error);
  const path = join(candidateDir, 'install-manifest.json');
  const manifest = existsSync(path) ? parse(readFileSync(path, 'utf8')) : null;
  add('P9 candidate install manifest exists and parses', manifest !== null);
  if (!manifest) return;
  add(
    'P9 candidate manifest remains unpublished',
    manifest.status === 'unpublished' && manifest.published === false,
  );
  add(
    'P9 candidate manifest has the reserved independent tag',
    manifest.releaseTag === PSYCHOLOGY_CANDIDATE_TAG,
  );
  add(
    'P9 candidate manifest has the independent version',
    manifest.releaseVersion === PSYCHOLOGY_RELEASE_VERSION,
  );
  const platforms = Array.isArray(manifest.platforms)
    ? (manifest.platforms as Array<Record<string, unknown>>)
    : [];
  add(
    'P9 candidate manifest covers all supported hosts',
    platforms.length === PSYCHOLOGY_HOSTS.length,
  );

  const sumMap = new Map<string, string>();
  const sumsPath = join(candidateDir, 'SHA256SUMS.txt');
  for (const line of (existsSync(sumsPath) ? readFileSync(sumsPath, 'utf8') : '').split(/\r?\n/)) {
    const match = line.match(/^([0-9a-f]{64})\s{2}(.+)$/);
    if (match) sumMap.set(match[2]!, match[1]!);
  }
  for (const host of PSYCHOLOGY_HOSTS) {
    const platform = platforms.find((item) => item.host === host.id);
    add(`[${host.id}] candidate manifest platform exists`, platform !== undefined);
    if (!platform) continue;
    add(
      `[${host.id}] no premature published or real-device claim`,
      platform.published === false && platform.realDeviceVerified === false,
    );
    const zipPath = join(candidateDir, host.id, host.releaseAsset);
    const sha = existsSync(zipPath)
      ? createHash('sha256').update(readFileSync(zipPath)).digest('hex')
      : '';
    add(`[${host.id}] candidate ZIP matches manifest SHA-256`, platform.sha256 === sha);
    add(`[${host.id}] candidate ZIP matches SHA256SUMS`, sumMap.get(host.releaseAsset) === sha);
  }
}

function main(): void {
  if (!existsSync(candidateDir)) {
    throw new Error(
      'P9 candidate directory missing; run `pnpm run package:psychology-hosts` first',
    );
  }
  selfTest();
  checkCandidateManifest();

  for (const host of PSYCHOLOGY_HOSTS) {
    const zipPath = join(candidateDir, host.id, host.releaseAsset);
    add(`[${host.id}] candidate ZIP exists`, existsSync(zipPath));
    if (!existsSync(zipPath)) continue;
    const entries = listZipEntries(readZipFileSafe(zipPath));
    const structure = assertSingleTopDir(entries, host.packageName);
    add(`[${host.id}] ZIP is single-root and non-nested`, structure.ok, structure.error);
    for (const required of [
      'SKILL.md',
      'INSTALL.md',
      'BUILD_MANIFEST.json',
      'LICENSE',
      'sbom.cdx.json',
      'sbom.spdx.json',
      'scripts/psychology.mjs',
      'scripts/dist/psychology-engine.mjs',
    ]) {
      add(
        `[${host.id}] ZIP contains ${required}`,
        entries.includes(`${host.packageName}/${required}`),
      );
    }
    const leaked = entries.find((entry) =>
      /(^|\/)(node_modules|packages|\.git|tests?)(\/|$)/.test(
        entry.slice(host.packageName.length + 1),
      ),
    );
    add(`[${host.id}] ZIP has no source/test dependency tree`, leaked === undefined, leaked);

    const temp = mkdtempSync(join(tmpdir(), `loom-p9-${host.id}-`));
    try {
      const payload = join(temp, 'payload');
      extractZipFileSafe(zipPath, payload);
      const skill = join(payload, host.packageName);
      const manifestPath = join(skill, 'BUILD_MANIFEST.json');
      const manifest = existsSync(manifestPath) ? parse(readFileSync(manifestPath, 'utf8')) : null;
      add(`[${host.id}] extracted candidate manifest exists`, manifest !== null);
      add(
        `[${host.id}] extracted candidate is explicitly unpublished`,
        manifest?.status === 'candidate' &&
          manifest?.published === false &&
          manifest?.realDeviceVerified === false,
      );
      const doctor = run(skill, ['scripts/psychology.mjs', 'doctor']);
      const doctorJson = parse(doctor.stdout);
      add(
        `[${host.id}] extracted doctor is supported and nonclinical`,
        doctor.code === 0 &&
          doctorJson?.runtimeSupported === true &&
          doctorJson?.clinicalInstrumentsAvailable === false,
      );
      const version = run(skill, ['scripts/psychology.mjs', 'version']);
      const versionJson = parse(version.stdout);
      add(
        `[${host.id}] extracted version reports this independent candidate`,
        version.code === 0 &&
          versionJson?.releaseVersion === PSYCHOLOGY_RELEASE_VERSION &&
          versionJson?.releaseTag === PSYCHOLOGY_CANDIDATE_TAG &&
          versionJson?.published === false,
      );
      const verify = run(skill, ['scripts/psychology.mjs', 'verify']);
      add(
        `[${host.id}] extracted built-in verify passes`,
        verify.code === 0 && /"ok"\s*:\s*true/.test(verify.stdout),
      );
      assertSyntheticLifecycle(skill, temp, host.id);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  }

  const failed = checks.filter((check) => !check.ok);
  for (const check of checks) {
    process.stdout.write(
      `[${check.ok ? 'PASS' : 'FAIL'}] ${check.name}${check.detail ? ` (${check.detail})` : ''}\n`,
    );
  }
  process.stdout.write(
    `\n${checks.length - failed.length}/${checks.length} P9 host-package checks passed.\n`,
  );
  if (failed.length > 0) process.exit(1);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
}
