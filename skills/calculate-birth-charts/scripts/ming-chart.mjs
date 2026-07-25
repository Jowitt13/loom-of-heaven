#!/usr/bin/env node
/**
 * ming-chart — the single stable CLI entry for the calculate-birth-charts Skill.
 *
 * It does NO astrology math itself: it parses arguments, reads JSON input files,
 * calls the bundled deterministic engine (./dist/engine.mjs), and writes
 * versioned JSON to stdout (or a file). Diagnostics go to stderr; failures use
 * stable exit codes. Arguments are passed as an array / via files only — user
 * text is never concatenated into a shell command (handoff §7.1).
 *
 *   node scripts/ming-chart.mjs doctor [--json]
 *   node scripts/ming-chart.mjs normalize  --input-file in.json [--output-file out.json]
 *   node scripts/ming-chart.mjs calculate  --input-file in.json [--systems all|western,bazi,ziwei] [--output-file out.json] [--now <iso|ms>] [--request-id <id>]
 *   node scripts/ming-chart.mjs compare    --input-file in.json --profiles a,b [--output-file out.json]
 *   node scripts/ming-chart.mjs horoscope  --input-file in.json --at YYYY-MM-DD[THH:mm:ss] [--output-file out.json]
 *   node scripts/ming-chart.mjs interpret  --input-file in.json [--at YYYY-MM-DD[THH:mm:ss]] [--now <iso|ms>] [--output-file interpretation.json]
 *   node scripts/ming-chart.mjs synastry  --input-file people.json [--now <iso|ms>] [--output-file synastry.json]  (1-5 people; set analyzePair when >2)
 *   node scripts/ming-chart.mjs lint-reading --input-file draft-reading.md [--channel topic|full] [--simple] [--output-file reading-lint.json]
 *   node scripts/ming-chart.mjs render     [DISABLED] visualization reports are temporarily off; use calculate/interpret JSON (exit 3)
 *   node scripts/ming-chart.mjs verify     [--fixture fixtures/smoke.json]
 *   node scripts/ming-chart.mjs version    (reads the sibling BUILD_MANIFEST.json of THIS installed package)
 *   node scripts/ming-chart.mjs migrate    --source <extracted new pkg> [--host qoder|workbuddy | --target <dir>] [--dry-run]
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const PKG_NAME = 'calculate-birth-charts';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_FIXTURE = resolve(scriptDir, 'fixtures', 'smoke.json');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}

function readJsonFile(file) {
  const abs = resolve(process.cwd(), file);
  return JSON.parse(readFileSync(abs, 'utf8'));
}

function writeOutput(args, content, defaultToStdout = true) {
  if (typeof args['output-file'] === 'string') {
    const abs = resolve(process.cwd(), args['output-file']);
    writeFileSync(abs, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
    process.stderr.write(`wrote ${abs}\n`);
  } else if (defaultToStdout) {
    process.stdout.write(`${content}\n`);
  }
}

function parseNow(value) {
  if (value === undefined) return undefined;
  if (/^\d+$/.test(value)) return Number.parseInt(value, 10);
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new Error(`Invalid --now value: ${value}`);
  return ms;
}

function applySystems(raw, systemsArg) {
  if (typeof systemsArg !== 'string') return raw;
  const systems =
    systemsArg === 'all'
      ? ['western', 'bazi', 'ziwei']
      : systemsArg.split(',').map((s) => s.trim());
  return { ...raw, settings: { ...(raw.settings ?? {}), systems } };
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const args = parseArgs(argv.slice(1));

  // Install-management commands run WITHOUT the engine (pure fs/os, no network, no spawned processes):
  // `version` reports the REAL locally-installed package; `migrate` atomically replaces an old
  // (incl. legacy double-nested RC) install with an already-downloaded+verified new package.
  if (command === 'version') {
    runVersion();
    return;
  }
  if (command === 'migrate') {
    runMigrate(args);
    return;
  }

  let engine;
  try {
    engine = await import('./dist/engine.mjs');
  } catch (err) {
    process.stderr.write(
      'Engine bundle not found (scripts/dist/engine.mjs). In development run `pnpm run build` first.\n',
    );
    process.stderr.write(`${String(err)}\n`);
    process.exit(1);
    return;
  }

  const {
    doctor,
    runNormalize,
    runHoroscope,
    runInterpret,
    runSynastry,
    timeIndexFromHour,
    calculate,
    compareProfiles,
    verify,
    parseBirthInput,
    parseSynastryInput,
    lintReading,
    EngineError,
    toEngineError,
    canonicalJsonPretty,
  } = engine;

  try {
    switch (command) {
      case 'doctor': {
        const report = doctor({ node: process.version, platform: process.platform });
        writeOutput(args, canonicalJsonPretty(report));
        return;
      }
      case 'normalize': {
        const raw = readJsonFile(requireArg(args, 'input-file'));
        const input = parseInputOrThrow(parseBirthInput, EngineError, raw);
        const { normalized, warnings } = runNormalize(input);
        writeOutput(args, canonicalJsonPretty({ ok: true, normalized, warnings }));
        return;
      }
      case 'calculate': {
        const raw = applySystems(readJsonFile(requireArg(args, 'input-file')), args.systems);
        const input = parseInputOrThrow(parseBirthInput, EngineError, raw);
        const bundle = calculate(input, {
          now: parseNow(typeof args.now === 'string' ? args.now : undefined),
          requestId: typeof args['request-id'] === 'string' ? args['request-id'] : undefined,
        });
        writeOutput(args, canonicalJsonPretty({ ok: true, bundle }));
        return;
      }
      case 'compare': {
        const raw = readJsonFile(requireArg(args, 'input-file'));
        const input = parseInputOrThrow(parseBirthInput, EngineError, raw);
        const profiles = requireArg(args, 'profiles')
          .split(',')
          .map((s) => s.trim());
        const result = compareProfiles(input, profiles, {
          now: parseNow(typeof args.now === 'string' ? args.now : undefined),
        });
        writeOutput(args, canonicalJsonPretty(result));
        return;
      }
      case 'horoscope': {
        const raw = readJsonFile(requireArg(args, 'input-file'));
        const input = parseInputOrThrow(parseBirthInput, EngineError, raw);
        const parsedAt = parseAtValue(requireArg(args, 'at'));
        if (!parsedAt) {
          process.stderr.write(
            `Invalid --at value "${args.at}". Use YYYY-MM-DD or YYYY-MM-DDTHH:mm[:ss] (hour 0-23).\n`,
          );
          process.exit(2);
        }
        const { horoscope, warnings } = runHoroscope(input, {
          solarDate: parsedAt.solarDate,
          timeIndex: timeIndexFromHour(parsedAt.hour),
        });
        writeOutput(args, canonicalJsonPretty({ ok: true, horoscope, warnings }));
        return;
      }
      case 'interpret': {
        const raw = readJsonFile(requireArg(args, 'input-file'));
        const input = parseInputOrThrow(parseBirthInput, EngineError, raw);
        let at;
        if (typeof args.at === 'string') {
          const parsedAt = parseAtValue(args.at);
          if (!parsedAt) {
            process.stderr.write(
              `Invalid --at value "${args.at}". Use YYYY-MM-DD or YYYY-MM-DDTHH:mm[:ss] (hour 0-23).\n`,
            );
            process.exit(2);
          }
          at = { solarDate: parsedAt.solarDate, timeIndex: timeIndexFromHour(parsedAt.hour) };
        }
        const { interpretation, warnings } = runInterpret(input, {
          now: parseNow(typeof args.now === 'string' ? args.now : undefined),
          at,
        });
        writeOutput(args, canonicalJsonPretty({ ok: true, interpretation, warnings }));
        return;
      }
      case 'synastry': {
        const raw = readJsonFile(requireArg(args, 'input-file'));
        let parsed;
        try {
          parsed = parseSynastryInput(raw);
        } catch (err) {
          throw new EngineError('INPUT_VALIDATION_FAILED', 'Synastry input failed validation.', {
            issues: err && err.issues ? err.issues : String(err),
          });
        }
        const { synastry, warnings } = runSynastry(parsed, {
          now: parseNow(typeof args.now === 'string' ? args.now : undefined),
        });
        writeOutput(args, canonicalJsonPretty({ ok: true, synastry, warnings }));
        return;
      }
      case 'lint-reading': {
        // Output-layer term firewall for a produced Channel B report (ADR 0011).
        // Reads a markdown DRAFT (not JSON) and reports term/jargon violations.
        const draftPath = resolve(process.cwd(), requireArg(args, 'input-file'));
        const text = readFileSync(draftPath, 'utf8');
        const channel = args.channel === 'full' ? 'full' : 'topic';
        const result = lintReading(text, { channel, simple: args.simple === true });
        writeOutput(args, canonicalJsonPretty(result));
        if (!result.ok) process.exit(1);
        return;
      }
      case 'render': {
        // Visualization reports (HTML/SVG) are temporarily disabled: across host
        // models the rendered artifacts could not be produced reliably, so the Skill
        // now ships structured JSON only. The renderer stays dormant in the engine
        // (packages/orchestrator/src/render.ts + assets/report-template.html) for a
        // future re-introduction — see docs/adr/0005-fortune-sidereal-render-pause.md.
        const notice = {
          ok: false,
          disabled: true,
          command: 'render',
          message:
            'HTML/SVG 可视化报告功能已暂时关闭（visualization temporarily disabled）。请改用 `calculate` / `interpret` 的结构化 JSON 呈现命盘。',
          alternatives: ['calculate --systems all', 'interpret'],
          reference: 'docs/adr/0005-fortune-sidereal-render-pause.md',
        };
        process.stdout.write(`${canonicalJsonPretty(notice)}\n`);
        process.stderr.write(
          'render is disabled: use calculate/interpret JSON instead (exit 3).\n',
        );
        process.exit(3);
        return;
      }
      case 'verify': {
        const fixtureFile = typeof args.fixture === 'string' ? args.fixture : DEFAULT_FIXTURE;
        const fixture = JSON.parse(readFileSync(resolve(process.cwd(), fixtureFile), 'utf8'));
        const report = verify(fixture);
        writeOutput(args, canonicalJsonPretty(report));
        if (!report.ok) process.exit(1);
        return;
      }
      default: {
        process.stderr.write(
          'Usage: ming-chart <doctor|normalize|calculate|compare|horoscope|interpret|synastry|lint-reading|verify|version|migrate> [options]\n',
        );
        process.exit(2);
      }
    }
  } catch (err) {
    const engineError = toEngineError(err);
    process.stdout.write(`${canonicalJsonPretty(engineError.toEnvelope())}\n`);
    process.stderr.write(`error [${engineError.code}]: ${engineError.message}\n`);
    process.exit(engineError.exitCode);
  }
}

function requireArg(args, name) {
  const value = args[name];
  if (typeof value !== 'string') {
    throw new Error(`Missing required --${name} argument.`);
  }
  return value;
}

function parseInputOrThrow(parseBirthInput, EngineError, raw) {
  try {
    return parseBirthInput(raw);
  } catch (err) {
    throw new EngineError('INPUT_VALIDATION_FAILED', 'Birth input failed validation.', {
      issues: err && err.issues ? err.issues : String(err),
    });
  }
}

/** Parse an `--at` target (YYYY-MM-DD or YYYY-MM-DDTHH:mm[:ss]) → { solarDate, hour }. */
function parseAtValue(at) {
  const m = String(at).match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const hour = m[2] !== undefined ? Number.parseInt(m[2], 10) : 12;
  if (hour > 23) return null;
  return { solarDate: m[1], hour };
}

/** Read the sibling BUILD_MANIFEST.json of an install dir (current OR legacy double-nested). */
function readBuildManifest(dir) {
  for (const rel of ['BUILD_MANIFEST.json', join(PKG_NAME, 'BUILD_MANIFEST.json')]) {
    const p = join(dir, rel);
    if (existsSync(p)) {
      try {
        return { manifest: JSON.parse(readFileSync(p, 'utf8')), path: p };
      } catch {
        /* try next candidate */
      }
    }
  }
  return null;
}

/** True when `dir` is (or contains) a double-nested calculate-birth-charts/calculate-birth-charts. */
function isDoubleNested(dir) {
  const parts = dir.split(/[\\/]+/);
  for (let i = 1; i < parts.length; i++) {
    if (parts[i] === PKG_NAME && parts[i - 1] === PKG_NAME) return true;
  }
  return existsSync(join(dir, PKG_NAME, 'SKILL.md'));
}

/** Normalize a BUILD_MANIFEST: legacy {version,releaseTag} or current {engineVersion,...}. */
function describeManifest(m) {
  return {
    engineVersion: m.engineVersion ?? null,
    releaseVersion: m.releaseVersion ?? null,
    releaseTag: m.releaseTag ?? null,
    version: m.version ?? null,
    legacy: m.engineVersion === undefined && m.version !== undefined,
  };
}

function emitJson(obj) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}

/** Resolve symlinks on the longest EXISTING prefix of `p`, re-appending the missing tail. */
function realResolve(p) {
  let cur = resolve(p);
  const tail = [];
  while (!existsSync(cur)) {
    const parent = dirname(cur);
    if (parent === cur) break;
    tail.unshift(basename(cur));
    cur = parent;
  }
  let base;
  try {
    base = existsSync(cur) ? realpathSync(cur) : cur;
  } catch {
    base = cur;
  }
  return tail.length ? join(base, ...tail) : base;
}

/** Case-fold path equality (Windows paths are case-insensitive). */
function samePath(a, b) {
  const na = resolve(a);
  const nb = resolve(b);
  return process.platform === 'win32' ? na.toLowerCase() === nb.toLowerCase() : na === nb;
}

/**
 * Security allowlist for `migrate`: the FINAL target (after resolving symlinks) MUST be exactly the
 * host's Ming Engine skill dir under the real home — `<home>/.qoder/skills/calculate-birth-charts`
 * or `<home>/.workbuddy/skills/calculate-birth-charts`. This rejects a bare skills dir, the home
 * dir, the filesystem root, a project dir, any broad dir without calculate-birth-charts, and any
 * symlink that escapes the allowed location. When `host` is given it restricts to that host only.
 */
function checkMigrateTarget(target, host) {
  let realHome;
  try {
    realHome = realpathSync(homedir());
  } catch {
    realHome = homedir();
  }
  const allowed = {
    qoder: join(realHome, '.qoder', 'skills', PKG_NAME),
    workbuddy: join(realHome, '.workbuddy', 'skills', PKG_NAME),
  };
  const hosts = host === 'qoder' || host === 'workbuddy' ? [host] : ['qoder', 'workbuddy'];
  const realTarget = realResolve(target);
  for (const h of hosts) {
    if (samePath(realTarget, allowed[h])) return { ok: true };
  }
  return {
    ok: false,
    realTarget,
    error:
      'refusing to migrate: target must resolve to ' +
      hosts.map((h) => allowed[h]).join(' or ') +
      ' — a bare skills dir, home, filesystem root, project dir, other broad dir, ' +
      'or a symlink escaping that location is rejected',
  };
}

/** `version`: report the REAL locally-installed package from its BUILD_MANIFEST (never guessed). */
function runVersion() {
  const pkgDir = resolve(scriptDir, '..');
  const doubleNested = isDoubleNested(pkgDir);
  const found = readBuildManifest(pkgDir);
  if (!found) {
    emitJson({
      ok: false,
      reason: 'no BUILD_MANIFEST (not a packaged install)',
      doubleNested,
      checkedDir: pkgDir,
    });
    return;
  }
  emitJson({
    ok: true,
    ...describeManifest(found.manifest),
    doubleNested,
    manifestPath: found.path,
  });
}

/** `migrate`: atomically replace the target install with an already-extracted new package. */
function runMigrate(args) {
  const source = typeof args.source === 'string' ? resolve(process.cwd(), args.source) : null;
  if (!source) {
    emitJson({
      ok: false,
      step: 'args',
      error: 'migrate requires --source <extracted new package dir>',
    });
    process.exit(2);
  }
  let target;
  if (typeof args.target === 'string') target = resolve(process.cwd(), args.target);
  else if (args.host === 'qoder') target = join(homedir(), '.qoder', 'skills', PKG_NAME);
  else if (args.host === 'workbuddy') target = join(homedir(), '.workbuddy', 'skills', PKG_NAME);
  else {
    emitJson({
      ok: false,
      step: 'args',
      error: 'migrate requires --host qoder|workbuddy or --target <dir>',
    });
    process.exit(2);
  }

  // Security gate: the resolved target MUST be exactly the host's calculate-birth-charts skill dir
  // under home (no arbitrary --target, no bare skills dir, no symlink escape). Checked BEFORE any
  // source read or filesystem mutation, so a rejected target never touches the old install.
  const targetCheck = checkMigrateTarget(target, args.host);
  if (!targetCheck.ok) {
    emitJson({
      ok: false,
      step: 'validate-target',
      error: targetCheck.error,
      target,
      realTarget: targetCheck.realTarget,
    });
    process.exit(1);
  }

  // 1. source must be a clean single-layer package.
  const srcClean =
    existsSync(join(source, 'SKILL.md')) &&
    existsSync(join(source, 'scripts', 'ming-chart.mjs')) &&
    existsSync(join(source, 'BUILD_MANIFEST.json'));
  if (!srcClean || existsSync(join(source, PKG_NAME, 'SKILL.md'))) {
    emitJson({
      ok: false,
      step: 'validate-source',
      error: 'source is not a clean single-layer calculate-birth-charts',
      source,
    });
    process.exit(1);
  }
  let srcManifest;
  try {
    srcManifest = JSON.parse(readFileSync(join(source, 'BUILD_MANIFEST.json'), 'utf8'));
  } catch (err) {
    emitJson({
      ok: false,
      step: 'validate-source',
      error: `source BUILD_MANIFEST unreadable: ${String(err)}`,
    });
    process.exit(1);
  }
  if (srcManifest.name !== PKG_NAME || !srcManifest.releaseTag || !srcManifest.releaseVersion) {
    emitJson({
      ok: false,
      step: 'validate-source',
      error: 'source BUILD_MANIFEST missing name/releaseTag/releaseVersion',
    });
    process.exit(1);
  }

  // 2. record the currently-loaded (old) version, if any.
  const beforeFound = readBuildManifest(target);
  const before = beforeFound
    ? {
        ...describeManifest(beforeFound.manifest),
        doubleNested: isDoubleNested(target),
        manifestPath: beforeFound.path,
      }
    : null;

  if (args['dry-run'] === true) {
    emitJson({ ok: true, dryRun: true, target, before, source: describeManifest(srcManifest) });
    return;
  }

  const ts = Date.now();
  const backup = `${target}.bak-${ts}`;
  const staged = `${target}.new-${ts}`;

  // 3. stage a clean copy (fail BEFORE touching the target).
  try {
    rmSync(staged, { recursive: true, force: true });
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, staged, { recursive: true });
  } catch (err) {
    rmSync(staged, { recursive: true, force: true });
    emitJson({ ok: false, step: 'stage', error: String(err), target });
    process.exit(1);
  }
  if (existsSync(join(staged, PKG_NAME, 'SKILL.md'))) {
    rmSync(staged, { recursive: true, force: true });
    emitJson({ ok: false, step: 'stage', error: 'staged copy unexpectedly double-nested', target });
    process.exit(1);
  }

  // 4-6. back up the old target, then atomically swap in the new package; roll back on any error.
  //      Only ever touches `target` (+ its own .bak/.new siblings) — never the parent skills dir.
  let backedUp = false;
  try {
    if (existsSync(target)) {
      renameSync(target, backup);
      backedUp = true;
    }
    renameSync(staged, target);
  } catch (err) {
    rmSync(target, { recursive: true, force: true });
    rmSync(staged, { recursive: true, force: true });
    if (backedUp) renameSync(backup, target);
    emitJson({
      ok: false,
      step: 'replace',
      error: String(err),
      rolledBack: backedUp,
      before,
      target,
    });
    process.exit(1);
  }

  // 7. verify the final loaded dir; roll back if the new package is wrong or still nested.
  const afterFound = readBuildManifest(target);
  const afterNested = existsSync(join(target, PKG_NAME, 'SKILL.md'));
  const afterOk =
    afterFound !== null &&
    !afterNested &&
    afterFound.manifest.releaseTag === srcManifest.releaseTag;
  if (!afterOk) {
    rmSync(target, { recursive: true, force: true });
    if (backedUp) renameSync(backup, target);
    emitJson({
      ok: false,
      step: 'verify-after',
      error: 'post-replace verification failed; rolled back',
      rolledBack: backedUp,
      before,
      target,
    });
    process.exit(1);
  }

  // 8. success — drop the backup (removes any legacy double-nested residue it held).
  if (backedUp) rmSync(backup, { recursive: true, force: true });
  emitJson({
    ok: true,
    target,
    before,
    after: {
      ...describeManifest(afterFound.manifest),
      doubleNested: false,
      manifestPath: afterFound.path,
    },
  });
}

await main();
