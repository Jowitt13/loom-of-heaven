import { readdirSync, readFileSync, statSync, type Dirent } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Deterministic provenance-source gate (Round 12).
 *
 * Astronomy Engine follows the VSOP87 + NOVAS route (its upstream validates against JPL
 * Horizons); this repository has NO independent JPL Horizons golden fixture. So NO live
 * authored source, generated example, or the BUILT candidate engine may attribute the
 * ephemeris to "JPL DE441" / "DE441-grade" / "astronomy-engine/DE441".
 *
 * Scans authored source (packages, tools, skills SKILL/reference docs), generated examples,
 * and the built engine bundle. A line is allowed to mention DE441 ONLY if it is explicitly
 * tagged as a historical release note with the marker `HISTORICAL-RELEASE-NOTE` (so the
 * published v0.1.1 notes could be quoted verbatim without tripping the gate). This tool's
 * own file is skipped (it necessarily contains the forbidden pattern + self-tests).
 *
 * Runs AFTER `build` in verify:all so the freshly-built engine.mjs is covered. Includes
 * positive + negative self-tests proving the detector fires on the old wrong text and does
 * NOT fire on the corrected VSOP87+NOVAS text. Does NOT require any JPL data.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const SELF = join(here, 'validate-provenance.ts');
/** Gate/detector files that legitimately reference the forbidden term are exempt. */
const GATE_FILES = new Set([SELF, join(here, 'validate-current-docs.ts')]);

/** Forbidden ephemeris attribution: DE441, DE-441, DE441-grade, astronomy-engine/DE441. */
const DE441 = /DE-?441/i;
/** A line carrying this marker is an explicit historical record and is exempt. */
const HISTORICAL = /HISTORICAL-RELEASE-NOTE/;

const TEXT_EXT = new Set(['.ts', '.mjs', '.js', '.json', '.md']);
const SKIP_DIR = new Set(['node_modules', '.git', '.tmp', 'releases', 'coverage', '.vitest']);

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}
const checks: Check[] = [];
const add = (name: string, ok: boolean, detail?: string): void => {
  checks.push(detail === undefined ? { name, ok } : { name, ok, detail });
};

function walk(dir: string, out: string[]): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIR.has(e.name)) continue;
      walk(join(dir, e.name), out);
    } else if (e.isFile()) {
      const dot = e.name.lastIndexOf('.');
      if (dot >= 0 && TEXT_EXT.has(e.name.slice(dot))) out.push(join(dir, e.name));
    }
  }
}

/** Live authored + generated roots to scan, plus the built engine bundle explicitly. */
function scanTargets(): string[] {
  const files: string[] = [];
  for (const rel of ['packages', 'tools', 'skills', 'examples']) walk(join(root, rel), files);
  // The built engine bundle lives under skills/.../scripts/dist and is already covered by
  // the skills walk (it is a .mjs); keep an explicit assertion below that it exists + is clean.
  return files.filter((f) => !GATE_FILES.has(f));
}

function offendingLines(text: string): number[] {
  const bad: number[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (DE441.test(lines[i]!) && !HISTORICAL.test(lines[i]!)) bad.push(i + 1);
  }
  return bad;
}

function selfTest(): void {
  add(
    '[self-test] DE441 命中 astronomy-engine/DE441',
    DE441.test('var S = "astronomy-engine/DE441"'),
  );
  add('[self-test] DE441 命中 DE441-grade', DE441.test("'high' = DE441-grade"));
  add('[self-test] 干净 VSOP87+NOVAS 不误报', !DE441.test('astronomy-engine/VSOP87+NOVAS'));
  add(
    '[self-test] 历史标记行豁免',
    offendingLines('note: old v0.1.1 used astronomy-engine/DE441  // HISTORICAL-RELEASE-NOTE')
      .length === 0,
  );
}

function main(): void {
  selfTest();

  const engine = join(root, 'skills', 'calculate-birth-charts', 'scripts', 'dist', 'engine.mjs');
  let engineScanned = false;

  for (const file of scanTargets()) {
    let text: string;
    try {
      if (statSync(file).size > 12 * 1024 * 1024) continue;
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (file === engine) engineScanned = true;
    const bad = offendingLines(text);
    if (bad.length > 0) {
      add(
        `live source 无 DE441 归因: ${relative(root, file).replace(/\\/g, '/')}`,
        false,
        `line ${bad.join(',')}`,
      );
    }
  }

  add('已扫描构建后的 engine.mjs', engineScanned, engine);

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) {
    process.stdout.write(
      `[${c.ok ? 'PASS' : 'FAIL'}] ${c.name}${c.detail ? ` (${c.detail})` : ''}\n`,
    );
  }
  process.stdout.write(
    `\n${checks.length - failed.length}/${checks.length} provenance checks passed.\n`,
  );
  if (failed.length > 0) {
    process.stdout.write(
      'Astronomy Engine is VSOP87 + NOVAS. Use "astronomy-engine/VSOP87+NOVAS" (never DE441).\n' +
        'A genuine historical release-note line may keep DE441 only with a HISTORICAL-RELEASE-NOTE marker.\n',
    );
    process.exit(1);
  }
}

main();
