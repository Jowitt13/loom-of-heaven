import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSwetestHouses } from './swetest-parse.ts';

/**
 * ONE-TIME external reference generator for the Western house golden.
 *
 * Runs a locally-installed Swiss Ephemeris `swetest` binary (path supplied
 * EXPLICITLY via the SWETEST_PATH environment variable — this script never
 * downloads anything, never adds a dependency, and is not part of the verify
 * chain or the published Skill) and captures raw house-cusp output for the
 * synthetic sample matrix below.
 *
 * Output protocol (everything under the UNTRACKED `.tmp/` tree):
 *   1. All files are first written to a fresh staging directory
 *      `.tmp/house-golden-raw.staging-<utc>/`.
 *   2. Only after ALL invocations succeed, ALL output parses, and both
 *      manifest.json and draft-fixture.json are written, the staging
 *      directory is atomically renamed to `.tmp/house-golden-raw/`. An
 *      existing `.tmp/house-golden-raw/` is first renamed aside to
 *      `.tmp/house-golden-raw.replaced-<utc>/` — never deleted, and stale
 *      raw files can never mix into a fresh capture.
 *   3. On ANY failure the script exits 1, the staging directory stays where
 *      it is, and the final directory is never created or touched.
 *
 * Per-invocation artifacts inside the directory:
 *   - case-<id>-<system>.stdout.txt / case-<id>-<system>.stderr.txt
 *   - version.stdout.txt / version.stderr.txt   (banner run)
 *   - manifest.json   full argv per call, version line, capture UTC instant,
 *                     separate SHA-256 for each stdout/stderr/argv, matrix
 *   - draft-fixture.json  parsed draft (cusps 1-12, Asc, MC, ARMC) for HUMAN
 *                     REVIEW before being copied into the tracked fixture
 *
 * The tracked fixture `packages/western/goldens/swiss-ephemeris-houses.json`
 * is NEVER written by this script — populating it is a deliberate, reviewed
 * step (see packages/western/goldens/README.md).
 *
 * Fail-closed: a spawn error, a signal, a non-zero exit, an error-looking
 * stderr, a Porphyry-fallback hint for a quadrant system, any parse failure
 * or any missing field aborts with exit 1. Failure messages are structural
 * only — raw external output is written to the untracked staging files, not
 * echoed into logs.
 *
 * All sample instants/coordinates are SYNTHETIC technical epochs — not any
 * real person's birth data. Sample instants are UTC and are passed to swetest
 * via `-utc` (NOT `-ut`, which means UT1).
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const tmpRoot = join(root, '.tmp');
const finalDir = join(tmpRoot, 'house-golden-raw');

/** Swiss Ephemeris house-system letters for the five systems this engine implements. */
const HOUSE_LETTER: Record<string, string> = {
  placidus: 'P',
  koch: 'K',
  porphyry: 'O',
  equal: 'E',
  'whole-sign': 'W',
};

interface SampleCase {
  id: string;
  description: string;
  utc: { y: number; mo: number; d: number; h: number; mi: number; s: number };
  latDeg: number;
  lonEastDeg: number;
}

/** Synthetic technical sample matrix (NOT real birth data). */
const CASES: SampleCase[] = [
  {
    id: 's1',
    description: 'Northern mid-latitude, east longitude (synthetic)',
    utc: { y: 1990, mo: 3, d: 10, h: 0, mi: 15, s: 0 },
    latDeg: 30.5,
    lonEastDeg: 114.3,
  },
  {
    id: 's2',
    description: 'Northern mid-latitude, west longitude (synthetic)',
    utc: { y: 2000, mo: 7, d: 4, h: 16, mi: 0, s: 0 },
    latDeg: 40.7,
    lonEastDeg: -74.0,
  },
  {
    id: 's3',
    description: 'Southern mid-latitude, east longitude, December solstice (synthetic)',
    utc: { y: 2010, mo: 12, d: 21, h: 3, mi: 30, s: 0 },
    latDeg: -33.9,
    lonEastDeg: 151.2,
  },
  {
    id: 's4',
    description: 'Near-equator low latitude, earlier era (synthetic)',
    utc: { y: 1975, mo: 1, d: 30, h: 12, mi: 0, s: 0 },
    latDeg: 1.35,
    lonEastDeg: 103.8,
  },
  {
    id: 's5',
    description: 'Higher (but well-defined) northern latitude, summer (synthetic)',
    utc: { y: 2024, mo: 6, d: 15, h: 18, mi: 45, s: 0 },
    latDeg: 59.9,
    lonEastDeg: 10.75,
  },
];

function sha256(buf: string | Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** swetest date argument: -bDD.MM.YYYY  (gregorian) */
function dateArg(c: SampleCase): string {
  return `-b${pad2(c.utc.d)}.${pad2(c.utc.mo)}.${c.utc.y}`;
}
/**
 * swetest UTC argument: -utcHH:MM:SS — input time scale is UTC (matches the
 * samples' utcIso field), NOT -ut which means UT1.
 */
function utcArg(c: SampleCase): string {
  return `-utc${pad2(c.utc.h)}:${pad2(c.utc.mi)}:${pad2(c.utc.s)}`;
}
/** swetest house argument: -house<lonE>,<lat>,<letter>  (east-positive longitude) */
function houseArg(c: SampleCase, letter: string): string {
  return `-house${c.lonEastDeg},${c.latDeg},${letter}`;
}

interface RunResult {
  stdout: string;
  stderr: string;
}

/**
 * Run swetest once, fail-closed. Any spawn error, signal (incl. timeout) or
 * non-zero exit aborts immediately — a non-empty stdout is NOT a pass.
 * Failure messages stay structural; raw output is never echoed into logs.
 */
function runSwetestOrExit(swetestPath: string, argv: string[], label: string): RunResult {
  const res = spawnSync(swetestPath, argv, { encoding: 'utf8', timeout: 60_000 });
  if (res.error) {
    process.stdout.write(`[FAIL] swetest could not be spawned for ${label} (spawn error).\n`);
    process.exit(1);
  }
  if (res.signal !== null) {
    process.stdout.write(
      `[FAIL] swetest was terminated by a signal for ${label} (possible timeout).\n`,
    );
    process.exit(1);
  }
  if (res.status !== 0) {
    process.stdout.write(`[FAIL] swetest exited with status ${res.status} for ${label}.\n`);
    process.exit(1);
  }
  return { stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function main(): void {
  const swetestPath = process.env.SWETEST_PATH;
  if (!swetestPath) {
    process.stdout.write(
      '[FAIL] SWETEST_PATH is not set.\n' +
        '\n' +
        'This one-time generator requires a locally installed Swiss Ephemeris\n' +
        '`swetest` binary supplied EXPLICITLY via the environment:\n' +
        '\n' +
        '  PowerShell:\n' +
        "    $env:SWETEST_PATH = 'C:\\path\\to\\swetest.exe'; node --experimental-strip-types tools/generate-house-golden.ts\n" +
        '  POSIX:\n' +
        '    SWETEST_PATH=/path/to/swetest node --experimental-strip-types tools/generate-house-golden.ts\n' +
        '\n' +
        'The script never downloads anything and adds no dependency. See\n' +
        'packages/western/goldens/README.md for the full capture workflow.\n',
    );
    process.exit(1);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const stagingDir = join(tmpRoot, `house-golden-raw.staging-${stamp}`);
  mkdirSync(stagingDir, { recursive: true });

  // Capture the tool banner for provenance (swetest -h prints version+usage).
  const versionArgv = ['-h'];
  const versionRun = runSwetestOrExit(swetestPath, versionArgv, 'version banner');
  writeFileSync(join(stagingDir, 'version.stdout.txt'), versionRun.stdout, 'utf8');
  writeFileSync(join(stagingDir, 'version.stderr.txt'), versionRun.stderr, 'utf8');
  // Only an explicit `Version:` line is an auditable tool identifier — never
  // fall back to descriptive lines that merely mention swetest.
  const versionLine =
    `${versionRun.stdout}\n${versionRun.stderr}`
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => /^Version:\s*\S/.test(l)) ?? null;
  if (!versionLine) {
    process.stdout.write('[FAIL] could not find a `Version:` line in the swetest help output.\n');
    process.exit(1);
  }

  const manifest: {
    generatedAtUtc: string;
    swetestPathNote: string;
    versionLine: string;
    version: {
      argv: string[];
      argvSha256: string;
      stdoutFile: string;
      stdoutSha256: string;
      stderrFile: string;
      stderrSha256: string;
    };
    calls: {
      caseId: string;
      system: string;
      argv: string[];
      argvSha256: string;
      stdoutFile: string;
      stdoutSha256: string;
      stderrFile: string;
      stderrSha256: string;
    }[];
    cases: SampleCase[];
    referenceInputTimeScale: string;
    coordinateSemantics: string;
  } = {
    generatedAtUtc: new Date().toISOString(),
    swetestPathNote:
      'local path supplied via SWETEST_PATH env; binary is NOT part of this repository',
    versionLine,
    version: {
      argv: versionArgv,
      argvSha256: sha256(JSON.stringify(versionArgv)),
      stdoutFile: 'version.stdout.txt',
      stdoutSha256: sha256(versionRun.stdout),
      stderrFile: 'version.stderr.txt',
      stderrSha256: sha256(versionRun.stderr),
    },
    calls: [],
    cases: CASES,
    referenceInputTimeScale: 'UTC',
    coordinateSemantics:
      'tropical ecliptic of date, geocentric; input longitude east-positive; -emos Moshier (reference command requires no ephemeris data files in the repository)',
  };

  const draft: {
    note: string;
    cases: {
      id: string;
      description: string;
      utcIso: string;
      latDeg: number;
      lonEastDeg: number;
      systems: Record<
        string,
        { cusps: number[]; ascendant: number; mc: number; armc: number | null }
      >;
    }[];
  } = {
    note: 'DRAFT parsed from raw swetest output — requires human review before entering the tracked fixture. All samples are synthetic technical epochs.',
    cases: [],
  };

  for (const c of CASES) {
    const utcIso = `${c.utc.y}-${pad2(c.utc.mo)}-${pad2(c.utc.d)}T${pad2(c.utc.h)}:${pad2(c.utc.mi)}:${pad2(c.utc.s)}Z`;
    const systems: Record<
      string,
      { cusps: number[]; ascendant: number; mc: number; armc: number | null }
    > = {};
    for (const [system, letter] of Object.entries(HOUSE_LETTER)) {
      const label = `${c.id}/${system}`;
      const argv = [dateArg(c), utcArg(c), houseArg(c, letter), '-emos', '-head'];
      const { stdout, stderr } = runSwetestOrExit(swetestPath, argv, label);

      // Raw streams go to the untracked staging dir FIRST so a failing call
      // still leaves its evidence on disk for local inspection.
      const stdoutFile = `case-${c.id}-${system}.stdout.txt`;
      const stderrFile = `case-${c.id}-${system}.stderr.txt`;
      writeFileSync(join(stagingDir, stdoutFile), stdout, 'utf8');
      writeFileSync(join(stagingDir, stderrFile), stderr, 'utf8');

      // Fail-closed: for quadrant systems, refuse output that mentions a
      // silent Porphyry fallback (swetest does this at circumpolar
      // latitudes) — on EITHER stream.
      if (
        (system === 'placidus' || system === 'koch') &&
        /porphyry/i.test(`${stdout}\n${stderr}`)
      ) {
        process.stdout.write(
          `[FAIL] swetest silently fell back to Porphyry for ${label}; ` +
            'this sample cannot be used for a quadrant-system golden.\n',
        );
        process.exit(1);
      }
      // Any error-looking stderr aborts, whatever the exit code said.
      if (/error|warning|invalid|cannot/i.test(stderr)) {
        process.stdout.write(
          `[FAIL] swetest wrote an error-looking message on stderr for ${label} ` +
            `(see ${stderrFile} in the staging directory).\n`,
        );
        process.exit(1);
      }

      manifest.calls.push({
        caseId: c.id,
        system,
        argv,
        argvSha256: sha256(JSON.stringify(argv)),
        stdoutFile,
        stdoutSha256: sha256(stdout),
        stderrFile,
        stderrSha256: sha256(stderr),
      });
      systems[system] = parseSwetestHouses(stdout, label);
    }
    draft.cases.push({
      id: c.id,
      description: c.description,
      utcIso,
      latDeg: c.latDeg,
      lonEastDeg: c.lonEastDeg,
      systems,
    });
  }

  writeFileSync(
    join(stagingDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  writeFileSync(
    join(stagingDir, 'draft-fixture.json'),
    `${JSON.stringify(draft, null, 2)}\n`,
    'utf8',
  );

  // Atomic publish: only a COMPLETE capture ever becomes .tmp/house-golden-raw/.
  // A pre-existing directory is renamed aside (never deleted, never merged).
  if (existsSync(finalDir)) {
    renameSync(finalDir, join(tmpRoot, `house-golden-raw.replaced-${stamp}`));
  }
  renameSync(stagingDir, finalDir);

  process.stdout.write(
    `[OK] captured ${manifest.calls.length} swetest invocations into .tmp/house-golden-raw/\n` +
      '     Review draft-fixture.json + manifest.json, then hand them to the\n' +
      '     populate step (see packages/western/goldens/README.md).\n',
  );
}

main();
