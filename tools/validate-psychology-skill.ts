import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Structural and boundary validator for the independently packaged P9 Skill.
 * This is deliberately separate from validate-skill.ts: it must not inherit
 * birth-chart requirements or accidentally expose chart capabilities.
 */
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const skillDir = join(root, 'skills', 'psychology-self-assessment');

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}
const checks: Check[] = [];
const add = (name: string, ok: boolean, detail?: string): void => {
  checks.push(detail === undefined ? { name, ok } : { name, ok, detail });
};

const required = [
  'SKILL.md',
  'agents/openai.yaml',
  'scripts/psychology.mjs',
  'scripts/dist/psychology-engine.mjs',
  'references/privacy.md',
  'references/ipip-neo-120.md',
  'references/ipip-neo-120-source-manifest.json',
  'references/host-validation.md',
  'BUILD_MANIFEST.json',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'sbom.cdx.json',
  'sbom.spdx.json',
];
for (const file of required) add(`file exists: ${file}`, existsSync(join(skillDir, file)));

const read = (relativePath: string): string => readFileSync(join(skillDir, relativePath), 'utf8');
const skillMd = existsSync(join(skillDir, 'SKILL.md')) ? read('SKILL.md') : '';
const cli = existsSync(join(skillDir, 'scripts', 'psychology.mjs'))
  ? read('scripts/psychology.mjs')
  : '';

const frontmatter = skillMd.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
add('SKILL.md has YAML frontmatter', frontmatter !== null);
if (frontmatter) {
  const keys = frontmatter[1]
    .split(/\r?\n/)
    .filter((line) => /^[A-Za-z0-9_]+:/.test(line))
    .map((line) => line.split(':')[0]);
  add(
    'frontmatter has only name + description',
    keys.every((key) => key === 'name' || key === 'description'),
    keys.join(', '),
  );
  add(
    'frontmatter declares psychology-self-assessment',
    /name:\s*psychology-self-assessment/.test(frontmatter[1]),
  );
  const body = skillMd.slice(frontmatter[0].length);
  add('SKILL.md body <= 500 lines', body.split(/\r?\n/).length <= 500);
}

const forbiddenClinical = /PHQ-9|GAD-7|ASRS|PC-PTSD|PCL-5|PID-5|C-SSRS|mental-health-screening/i;
const forbiddenChart =
  /loom-chart\.mjs|@loom\/(?:bazi|interpret|synastry|time-location|vedic|western|ziwei)/i;
for (const relativePath of ['SKILL.md', 'agents/openai.yaml', 'scripts/psychology.mjs']) {
  const path = join(skillDir, relativePath);
  if (!existsSync(path)) continue;
  const contents = readFileSync(path, 'utf8');
  add(`no clinical instrument in ${relativePath}`, !forbiddenClinical.test(contents));
  add(`no chart runtime integration in ${relativePath}`, !forbiddenChart.test(contents));
}

add('CLI does not spawn a subprocess', !/child_process|node:child_process/.test(cli));
add(
  'CLI does not use a network API',
  !/\bfetch\s*\(|XMLHttpRequest|WebSocket|node:(?:https?|net|tls|dns)|from ['"](?:https?|net|tls|dns)['"]/.test(
    cli,
  ),
);
add('CLI requires explicit local output for private sessions', /OUTPUT_FILE_REQUIRED/.test(cli));
add('CLI refuses private session stdout', /wrote local private session/.test(cli));
add('CLI supports explicit local deletion', /DELETE_REFUSED/.test(cli));

const publicFiles = [
  'SKILL.md',
  'agents/openai.yaml',
  'references/privacy.md',
  'references/ipip-neo-120.md',
];
const absolutePath = /(?:[A-Za-z]:\\Users\\|\/Users\/|\/home\/|C:\/Users\/)/;
for (const relativePath of publicFiles) {
  const path = join(skillDir, relativePath);
  if (existsSync(path))
    add(
      `no hardcoded development path in ${relativePath}`,
      !absolutePath.test(readFileSync(path, 'utf8')),
    );
}

try {
  const manifest = JSON.parse(read('BUILD_MANIFEST.json')) as Record<string, unknown>;
  add('manifest names this independent Skill', manifest.skill === 'psychology-self-assessment');
  add('manifest is not a published-release claim', manifest.status === 'unpublished');
  add('manifest pins Node 22 runtime floor', manifest.runtime === 'node >=22');
  add(
    'manifest declares no clinical capability',
    Array.isArray(manifest.exclusions) && manifest.exclusions.includes('all-clinical-screening'),
  );
} catch (error) {
  add('BUILD_MANIFEST.json is valid JSON', false, String(error));
}

try {
  const hostValidation = read('references/host-validation.md');
  add(
    'host-validation keeps candidate packages distinct from host verification',
    hostValidation.includes('not evidence that a host is already verified') &&
      hostValidation.includes('does **not** prove that Codex, Qoder, WorkBuddy, or Doubao'),
  );
  add(
    'host-validation forbids a premature P9 release claim',
    hostValidation.includes('never creates') &&
      hostValidation.includes('GitHub Release') &&
      hostValidation.includes('owner-authorized action'),
  );
} catch (error) {
  add('host-validation.md is readable', false, String(error));
}

try {
  const source = JSON.parse(read('references/ipip-neo-120-source-manifest.json')) as Record<
    string,
    unknown
  >;
  const sources = source.sources as Record<string, unknown> | undefined;
  add('source manifest declares Mandarin item source', typeof sources?.mandarinItems === 'object');
  add(
    'source manifest declares no demographic/contact collection',
    JSON.stringify(source.excludedFields) === JSON.stringify(['gender', 'age', 'email']),
  );
  add(
    'source manifest freezes nonclinical product boundary',
    JSON.stringify(source.productBoundary).includes('nonclinical-self-report-only'),
  );
} catch (error) {
  add('source manifest is valid JSON', false, String(error));
}

try {
  const sbom = JSON.parse(read('sbom.cdx.json')) as {
    metadata?: { component?: { name?: string } };
  };
  add(
    'CycloneDX application name is isolated',
    sbom.metadata?.component?.name === 'psychology-self-assessment',
  );
} catch (error) {
  add('CycloneDX SBOM is valid JSON', false, String(error));
}

try {
  const spdx = JSON.parse(read('sbom.spdx.json')) as { name?: string; spdxVersion?: string };
  add(
    'SPDX SBOM is valid and isolated',
    spdx.spdxVersion === 'SPDX-2.3' && spdx.name === 'psychology-self-assessment-0.1.0',
  );
} catch (error) {
  add('SPDX SBOM is valid JSON', false, String(error));
}

if (existsSync(join(skillDir, 'scripts'))) {
  const entries = readdirSync(join(skillDir, 'scripts'));
  const stray = entries.filter((entry) => !new Set(['psychology.mjs', 'dist']).has(entry));
  add('scripts has no shipped answer/session fixture', stray.length === 0, stray.join(', '));
}
if (existsSync(join(skillDir, 'scripts', 'dist', 'psychology-engine.mjs'))) {
  add(
    'engine bundle is non-trivial',
    statSync(join(skillDir, 'scripts', 'dist', 'psychology-engine.mjs')).size > 10_000,
  );
}

const failed = checks.filter((check) => !check.ok);
for (const check of checks) {
  process.stdout.write(
    `[${check.ok ? 'PASS' : 'FAIL'}] ${check.name}${check.detail ? ` (${check.detail})` : ''}\n`,
  );
}
process.stdout.write(
  `\n${checks.length - failed.length}/${checks.length} psychology Skill checks passed.\n`,
);
process.stdout.write(`Skill dir: ${relative(root, skillDir)}\n`);
if (failed.length > 0) process.exit(1);
