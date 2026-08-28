import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';

/**
 * Structural, portability, security and offline validator for the published
 * Skill (handoff §3.2 tools/validate-skill, §12). Complements — does not replace —
 * any host-provided Skill validator. Exit code is non-zero on any failure.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const skillDir = join(root, 'skills', 'xuan-ji-yu-heng');

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}
const checks: Check[] = [];
const add = (name: string, ok: boolean, detail?: string): void => {
  checks.push(detail === undefined ? { name, ok } : { name, ok, detail });
};

const REQUIRED_FILES = [
  'SKILL.md',
  'agents/openai.yaml',
  'scripts/loom-chart.mjs',
  'scripts/dist/engine.mjs',
  'scripts/fixtures/smoke.json',
  'references/input-contract.md',
  'references/output-contract.md',
  'references/answer-contract.md',
  'references/rulesets.md',
  'references/sources-and-limitations.md',
  'references/privacy.md',
  'assets/report-template.html',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'sbom.cdx.json',
  'sbom.spdx.json',
];

for (const rel of REQUIRED_FILES) {
  add(`file exists: ${rel}`, existsSync(join(skillDir, rel)));
}

// --- SKILL.md frontmatter: only name + description; body <= 500 lines ---
const skillMdPath = join(skillDir, 'SKILL.md');
if (existsSync(skillMdPath)) {
  const md = readFileSync(skillMdPath, 'utf8');
  const fmMatch = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fmMatch) {
    add('SKILL.md has YAML frontmatter', false);
  } else {
    add('SKILL.md has YAML frontmatter', true);
    const fm = fmMatch[1]!;
    const topKeys = fm
      .split(/\r?\n/)
      .filter((l) => /^[A-Za-z0-9_]+:/.test(l))
      .map((l) => l.split(':')[0]!.trim());
    const allowed = new Set(['name', 'description']);
    const extra = topKeys.filter((k) => !allowed.has(k));
    add('frontmatter has only name + description', extra.length === 0, extra.join(', '));
    add('frontmatter declares name', /(^|\n)name:/.test(fm));
    const descMatch = fm.match(/(^|\n)description:\s*(.+)/);
    const desc = descMatch ? descMatch[2]! : '';
    add('description is substantial (>120 chars)', desc.length > 120, `${desc.length} chars`);
    add('description covers chart trigger context', /排盘|星盘|八字|紫微|natal|chart/i.test(desc));
    const body = md.slice(fmMatch[0].length);
    const bodyLines = body.split(/\r?\n/).length;
    add('SKILL.md body <= 500 lines', bodyLines <= 500, `${bodyLines} lines`);
  }
}

// --- Portability: no hardcoded dev-machine absolute paths ---
const PORTABILITY_GLOBS = ['SKILL.md', 'scripts/loom-chart.mjs', 'agents/openai.yaml'];
const ABS_PATH_RE = /(?:[A-Za-z]:\\Users\\|\/Users\/|\/home\/|C:\/Users\/)/;
for (const rel of PORTABILITY_GLOBS) {
  const p = join(skillDir, rel);
  if (existsSync(p)) {
    const content = readFileSync(p, 'utf8');
    add(`no hardcoded absolute dev path in ${rel}`, !ABS_PATH_RE.test(content));
  }
}

// --- CLI does not shell out ---
const cliPath = join(skillDir, 'scripts', 'loom-chart.mjs');
if (existsSync(cliPath)) {
  const cli = readFileSync(cliPath, 'utf8');
  add('CLI does not import child_process', !/child_process|node:child_process/.test(cli));
}

// --- Ordinary-question gate workflow is documented (validate-answer + lint-reading) ---
if (existsSync(skillMdPath)) {
  const skillMd = readFileSync(skillMdPath, 'utf8');
  add(
    'SKILL.md documents the validate-answer + lint-reading gate order',
    skillMd.includes('validate-answer') &&
      skillMd.includes('lint-reading') &&
      skillMd.includes('reading-draft/v2'),
  );
}
const answerContractPath = join(skillDir, 'references', 'answer-contract.md');
if (existsSync(answerContractPath)) {
  const answerContract = readFileSync(answerContractPath, 'utf8');
  add(
    'answer-contract.md documents reading-draft/v2 and validation-result/v2',
    answerContract.includes('reading-draft/v2') && answerContract.includes('validation-result/v2'),
  );
  add(
    'answer-contract.md documents structured locators and truncation handling',
    answerContract.includes('sectionIndex') &&
      answerContract.includes('violationsTruncated') &&
      answerContract.includes('constraintRefs'),
  );
}

// --- Engine bundle is offline: no network API usage ---
const enginePath = join(skillDir, 'scripts', 'dist', 'engine.mjs');
if (existsSync(enginePath)) {
  const engine = readFileSync(enginePath, 'utf8');
  const NETWORK_PATTERNS: Array<[string, RegExp]> = [
    ['fetch(', /\bfetch\s*\(/],
    ['XMLHttpRequest', /XMLHttpRequest/],
    ['WebSocket', /new\s+WebSocket|\bWebSocket\s*\(/],
    [
      'require of a node builtin network module',
      /require\(\s*['"](?:node:)?(?:https?|net|tls|dns|dgram|http2)['"]\s*\)/,
    ],
    ['import http/https/net/tls', /from\s*['"](?:node:)?(?:https?|net|tls|dns|dgram|http2)['"]/],
    ['sendBeacon', /sendBeacon/],
  ];
  const hits = NETWORK_PATTERNS.filter(([, re]) => re.test(engine)).map(([label]) => label);
  add('engine bundle contains no network API usage', hits.length === 0, hits.join(', '));

  const sizeKiB = statSync(enginePath).size / 1024;
  add('engine bundle is present and non-trivial', sizeKiB > 100, `${sizeKiB.toFixed(0)} KiB`);
}

// --- Report template: strict CSP, injection token, no external refs / scripts ---
const tplPath = join(skillDir, 'assets', 'report-template.html');
if (existsSync(tplPath)) {
  const tpl = readFileSync(tplPath, 'utf8');
  add('report template sets a CSP meta', /Content-Security-Policy/.test(tpl));
  add('report template has {{REPORT_BODY}} token', tpl.includes('{{REPORT_BODY}}'));
  add('report template has no external URL', !/https?:\/\//.test(tpl));
  add('report template has no <script>', !/<script/i.test(tpl));
}

// --- SBOM lists components ---
const sbomPath = join(skillDir, 'sbom.cdx.json');
if (existsSync(sbomPath)) {
  try {
    const sbom = JSON.parse(readFileSync(sbomPath, 'utf8')) as { components?: unknown[] };
    add('sbom lists components', Array.isArray(sbom.components) && sbom.components.length > 0);
  } catch (err) {
    add('sbom is valid JSON', false, String(err));
  }
}

// --- SPDX SBOM lists packages (second standard format, Phase 6) ---
const spdxPath = join(skillDir, 'sbom.spdx.json');
if (existsSync(spdxPath)) {
  try {
    const spdx = JSON.parse(readFileSync(spdxPath, 'utf8')) as {
      spdxVersion?: string;
      packages?: unknown[];
    };
    add(
      'spdx sbom is SPDX-2.x and lists packages',
      typeof spdx.spdxVersion === 'string' &&
        spdx.spdxVersion.startsWith('SPDX-2') &&
        Array.isArray(spdx.packages) &&
        spdx.packages.length > 1,
    );
  } catch (err) {
    add('spdx sbom is valid JSON', false, String(err));
  }
}

// --- No stray node_modules / packages leaked into the Skill dir ---
const skillEntries = readdirSync(skillDir);
add('skill dir has no node_modules', !skillEntries.includes('node_modules'));
add('skill dir has no packages/', !skillEntries.includes('packages'));

// --- scripts/ must hold ONLY the published CLI, fixtures and bundle. Stray
//     input/output files (e.g. a real birth-input.json / chart.json) would ship
//     personal birth data inside the Skill — forbidden by handoff §10. ---
const scriptsDir = join(skillDir, 'scripts');
if (existsSync(scriptsDir)) {
  const allowedScripts = new Set(['loom-chart.mjs', 'fixtures', 'dist']);
  const stray = readdirSync(scriptsDir).filter((e) => !allowedScripts.has(e));
  add(
    'scripts/ has no stray files (only loom-chart.mjs, fixtures/, dist/)',
    stray.length === 0,
    stray.join(', '),
  );
}

// --- Report ---
const failed = checks.filter((c) => !c.ok);
for (const c of checks) {
  const mark = c.ok ? 'PASS' : 'FAIL';
  const detail = c.detail ? ` (${c.detail})` : '';
  process.stdout.write(`[${mark}] ${c.name}${detail}\n`);
}
process.stdout.write(`\n${checks.length - failed.length}/${checks.length} checks passed.\n`);
process.stdout.write(`Skill dir: ${relative(root, skillDir)}\n`);
if (failed.length > 0) process.exit(1);
