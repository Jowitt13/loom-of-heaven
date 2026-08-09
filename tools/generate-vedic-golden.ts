import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSwetestHouses } from './swetest-parse.ts';
import {
  parseSwetestGrahas,
  parseSwetestLongitudes,
  parseSwetestPoint,
  type VedicGrahaName,
} from './swetest-vedic-parse.ts';

/**
 * ONE-TIME external reference generator for the Vedic P2 golden.
 *
 * `swetest` is supplied only through SWETEST_PATH and is NEVER downloaded,
 * bundled, added to dependencies, called by CI, or copied into a release
 * artifact. All raw output stays under the ignored `.tmp/vedic-golden-raw/`
 * tree. The tracked fixture is deliberately NOT written by this script: a
 * human must review the raw manifest and draft before transcribing it.
 *
 * Capture protocol is fail-closed and mirrors tools/generate-house-golden.ts:
 * a fresh staging directory receives every raw stream; it is atomically
 * promoted only after all calls, parsers and boundary assertions succeed.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const tmpRoot = join(root, '.tmp');
const finalDir = join(tmpRoot, 'vedic-golden-raw');
const ONE_MINUTE_MS = 60_000;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;

interface Site {
  id: string;
  timezone: string;
  latDeg: number;
  lonEastDeg: number;
}

interface SampleCase {
  id: string;
  description: string;
  timezone: string;
  utcMs: number;
  latDeg: number;
  lonEastDeg: number;
  boundaryTags: string[];
}

interface SunMoon {
  sun: number;
  moon: number;
}

interface CaptureCall {
  id: string;
  kind: string;
  argv: string[];
  argvSha256: string;
  stdoutFile: string;
  stdoutSha256: string;
  stderrFile: string;
  stderrSha256: string;
}

/** Synthetic technical sites; no row represents a person's birth data. */
const SITES: readonly Site[] = [
  { id: 's01', timezone: 'Etc/GMT+12', latDeg: -54.2, lonEastDeg: -170.3 },
  { id: 's02', timezone: 'Pacific/Auckland', latDeg: -36.9, lonEastDeg: 174.8 },
  { id: 's03', timezone: 'Australia/Sydney', latDeg: -33.8, lonEastDeg: 151.3 },
  { id: 's04', timezone: 'Africa/Nairobi', latDeg: -1.3, lonEastDeg: 36.8 },
  { id: 's05', timezone: 'Asia/Dubai', latDeg: 25.2, lonEastDeg: 55.3 },
  { id: 's06', timezone: 'Asia/Tokyo', latDeg: 35.7, lonEastDeg: 139.7 },
  { id: 's07', timezone: 'Europe/Oslo', latDeg: 59.9, lonEastDeg: 10.7 },
  { id: 's08', timezone: 'Europe/London', latDeg: 51.5, lonEastDeg: -0.1 },
  { id: 's09', timezone: 'America/New_York', latDeg: 40.7, lonEastDeg: -74.0 },
  { id: 's10', timezone: 'America/Mexico_City', latDeg: 19.4, lonEastDeg: -99.1 },
  { id: 's11', timezone: 'America/Vancouver', latDeg: 49.3, lonEastDeg: -123.1 },
  { id: 's12', timezone: 'America/Anchorage', latDeg: 61.2, lonEastDeg: -149.9 },
];

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function norm360(value: number): number {
  const out = value % 360;
  return out < 0 ? out + 360 : out;
}

function toIso(utcMs: number): string {
  return new Date(utcMs).toISOString().replace(/\.000Z$/, 'Z');
}

function dateArg(utcMs: number): string {
  const date = new Date(utcMs);
  return `-b${pad2(date.getUTCDate())}.${pad2(date.getUTCMonth() + 1)}.${date.getUTCFullYear()}`;
}

function utcArg(utcMs: number): string {
  const date = new Date(utcMs);
  return `-utc${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}`;
}

function houseArg(site: Site): string {
  return `-house${site.lonEastDeg},${site.latDeg},W`;
}

function buildCoverageCases(): SampleCase[] {
  return Array.from({ length: 84 }, (_, index) => {
    const site = SITES[index % SITES.length]!;
    const year = 1900 + Math.round((200 * index) / 83);
    const month = (index * 5) % 12;
    const day = 1 + ((index * 11) % 28);
    const hour = (index * 7) % 24;
    const minute = (index * 13) % 60;
    return {
      id: `coverage-${String(index + 1).padStart(3, '0')}`,
      description: `Synthetic UTC/zone/hemisphere coverage case ${index + 1}`,
      timezone: site.timezone,
      utcMs: Date.UTC(year, month, day, hour, minute, 0),
      latDeg: site.latDeg,
      lonEastDeg: site.lonEastDeg,
      boundaryTags: [],
    };
  });
}

interface BoundarySpec {
  kind: 'rashi' | 'nakshatra' | 'pada-d9' | 'tithi';
  seedUtcMs: number;
  site: Site;
  tags: string[];
}

const BOUNDARY_SPECS: readonly BoundarySpec[] = [
  {
    kind: 'rashi',
    seedUtcMs: Date.UTC(1912, 1, 3, 4, 0, 0),
    site: SITES[0]!,
    tags: ['rashi'],
  },
  {
    kind: 'rashi',
    seedUtcMs: Date.UTC(2056, 8, 17, 9, 0, 0),
    site: SITES[7]!,
    tags: ['rashi'],
  },
  {
    kind: 'nakshatra',
    seedUtcMs: Date.UTC(1931, 5, 11, 12, 0, 0),
    site: SITES[2]!,
    tags: ['nakshatra', 'dasha-lord'],
  },
  {
    kind: 'nakshatra',
    seedUtcMs: Date.UTC(2088, 10, 23, 17, 0, 0),
    site: SITES[10]!,
    tags: ['nakshatra', 'dasha-lord'],
  },
  {
    kind: 'pada-d9',
    seedUtcMs: Date.UTC(1967, 3, 29, 2, 0, 0),
    site: SITES[4]!,
    tags: ['pada', 'D9'],
  },
  {
    kind: 'pada-d9',
    seedUtcMs: Date.UTC(2023, 6, 8, 18, 0, 0),
    site: SITES[5]!,
    tags: ['pada', 'D9'],
  },
  {
    kind: 'tithi',
    seedUtcMs: Date.UTC(1984, 8, 5, 6, 0, 0),
    site: SITES[8]!,
    tags: ['tithi'],
  },
  {
    kind: 'tithi',
    seedUtcMs: Date.UTC(2097, 1, 16, 21, 0, 0),
    site: SITES[11]!,
    tags: ['tithi'],
  },
];

function boundaryIndex(kind: BoundarySpec['kind'], position: SunMoon): number {
  switch (kind) {
    case 'rashi':
      return Math.floor(position.moon / 30);
    case 'nakshatra':
      return Math.floor(position.moon / (360 / 27));
    case 'pada-d9':
      return Math.floor(position.moon / (360 / 108));
    case 'tithi':
      return Math.floor(norm360(position.moon - position.sun) / 12);
  }
}

function ensureSwetestPath(): string {
  const path = process.env.SWETEST_PATH;
  if (!path) {
    process.stdout.write(
      '[FAIL] SWETEST_PATH is not set; provide a local swetest binary explicitly.\n',
    );
    process.exit(1);
  }
  if (!existsSync(path)) {
    process.stdout.write('[FAIL] SWETEST_PATH does not point to a readable local binary.\n');
    process.exit(1);
  }
  return path;
}

function main(): void {
  const swetestPath = ensureSwetestPath();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const stagingDir = join(tmpRoot, `vedic-golden-raw.staging-${stamp}`);
  mkdirSync(stagingDir, { recursive: true });
  const calls: CaptureCall[] = [];
  let callNumber = 0;

  const capture = (kind: string, argv: string[]): { stdout: string; stderr: string } => {
    const result = spawnSync(swetestPath, argv, { encoding: 'utf8', timeout: 60_000 });
    const id = String(++callNumber).padStart(4, '0');
    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';
    const stdoutFile = `${id}-${kind}.stdout.txt`;
    const stderrFile = `${id}-${kind}.stderr.txt`;
    writeFileSync(join(stagingDir, stdoutFile), stdout, 'utf8');
    writeFileSync(join(stagingDir, stderrFile), stderr, 'utf8');

    if (result.error || result.signal !== null || result.status !== 0) {
      process.stdout.write(`[FAIL] swetest execution failed structurally for ${kind}.\n`);
      process.exit(1);
    }
    if (/error|warning|invalid|cannot/i.test(stderr)) {
      process.stdout.write(`[FAIL] swetest wrote an error-looking stderr for ${kind}.\n`);
      process.exit(1);
    }
    calls.push({
      id,
      kind,
      argv,
      argvSha256: sha256(JSON.stringify(argv)),
      stdoutFile,
      stdoutSha256: sha256(stdout),
      stderrFile,
      stderrSha256: sha256(stderr),
    });
    return { stdout, stderr };
  };

  const versionRun = capture('version', ['-h']);
  const versionLine = `${versionRun.stdout}\n${versionRun.stderr}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^Version:\s*\S/.test(line));
  if (!versionLine) {
    process.stdout.write('[FAIL] swetest help had no auditable Version: line.\n');
    process.exit(1);
  }

  const sunMoonCache = new Map<number, SunMoon>();
  const sunMoonAt = (utcMs: number, label: string): SunMoon => {
    const cached = sunMoonCache.get(utcMs);
    if (cached) return cached;
    const { stdout } = capture(`search-${label}`, [
      dateArg(utcMs),
      utcArg(utcMs),
      '-p01',
      '-sid1',
      '-emos',
      '-head',
      '-fPl',
    ]);
    const positions = parseSwetestLongitudes(stdout, ['Sun', 'Moon'], label);
    const value = { sun: positions.Sun, moon: positions.Moon };
    sunMoonCache.set(utcMs, value);
    return value;
  };

  const findNextBoundary = (spec: BoundarySpec, ordinal: number): number => {
    const startIndex = boundaryIndex(spec.kind, sunMoonAt(spec.seedUtcMs, `seed-${ordinal}`));
    let low = spec.seedUtcMs;
    let high = low;
    const maxSteps = 120;
    for (let step = 1; step <= maxSteps; step++) {
      high = spec.seedUtcMs + step * ONE_HOUR_MS;
      if (boundaryIndex(spec.kind, sunMoonAt(high, `scan-${ordinal}-${step}`)) !== startIndex) {
        break;
      }
      low = high;
      if (step === maxSteps) {
        process.stdout.write(`[FAIL] no ${spec.kind} boundary found within 120h.\n`);
        process.exit(1);
      }
    }
    while (high - low > 1_000) {
      const midpoint = Math.floor((low + high) / 2_000) * 1_000;
      if (boundaryIndex(spec.kind, sunMoonAt(midpoint, `bisect-${ordinal}`)) === startIndex) {
        low = midpoint;
      } else {
        high = midpoint;
      }
    }
    return high;
  };

  const boundaryCases = BOUNDARY_SPECS.flatMap((spec, ordinal): SampleCase[] => {
    const boundaryUtcMs = findNextBoundary(spec, ordinal + 1);
    const before = boundaryUtcMs - ONE_MINUTE_MS;
    const after = boundaryUtcMs + ONE_MINUTE_MS;
    const beforeIndex = boundaryIndex(spec.kind, sunMoonAt(before, `verify-before-${ordinal + 1}`));
    const afterIndex = boundaryIndex(spec.kind, sunMoonAt(after, `verify-after-${ordinal + 1}`));
    if (beforeIndex === afterIndex) {
      process.stdout.write(`[FAIL] ${spec.kind} boundary pair did not straddle a boundary.\n`);
      process.exit(1);
    }
    const base = `boundary-${spec.kind}-${String(ordinal + 1).padStart(2, '0')}`;
    return [
      {
        id: `${base}-before`,
        description: `Synthetic ${spec.kind} boundary probe, one minute before transition`,
        timezone: spec.site.timezone,
        utcMs: before,
        latDeg: spec.site.latDeg,
        lonEastDeg: spec.site.lonEastDeg,
        boundaryTags: spec.tags,
      },
      {
        id: `${base}-after`,
        description: `Synthetic ${spec.kind} boundary probe, one minute after transition`,
        timezone: spec.site.timezone,
        utcMs: after,
        latDeg: spec.site.latDeg,
        lonEastDeg: spec.site.lonEastDeg,
        boundaryTags: spec.tags,
      },
    ];
  });

  const cases = [...buildCoverageCases(), ...boundaryCases];
  if (cases.length !== 100) {
    throw new Error(`internal sample-matrix error: expected 100 cases, got ${cases.length}`);
  }

  const draftCases = cases.map((sample) => {
    const site: Site = {
      id: sample.id,
      timezone: sample.timezone,
      latDeg: sample.latDeg,
      lonEastDeg: sample.lonEastDeg,
    };
    const grahas = parseSwetestGrahas(
      capture(`case-${sample.id}-grahas`, [
        dateArg(sample.utcMs),
        utcArg(sample.utcMs),
        '-p0123456',
        '-sid1',
        '-emos',
        '-head',
        '-fPl',
      ]).stdout,
      sample.id,
    );
    const meanRahu = parseSwetestPoint(
      capture(`case-${sample.id}-mean-rahu`, [
        dateArg(sample.utcMs),
        utcArg(sample.utcMs),
        '-pm',
        '-sid1',
        '-emos',
        '-head',
        '-fPl',
      ]).stdout,
      'mean Node',
      sample.id,
    );
    const trueRahu = parseSwetestPoint(
      capture(`case-${sample.id}-true-rahu`, [
        dateArg(sample.utcMs),
        utcArg(sample.utcMs),
        '-pt',
        '-sid1',
        '-emos',
        '-head',
        '-fPl',
      ]).stdout,
      'true Node',
      sample.id,
    );
    const houses = parseSwetestHouses(
      capture(`case-${sample.id}-whole-sign-house`, [
        dateArg(sample.utcMs),
        utcArg(sample.utcMs),
        houseArg(site),
        '-sid1',
        '-emos',
        '-head',
      ]).stdout,
      sample.id,
    );
    return {
      id: sample.id,
      description: sample.description,
      utcIso: toIso(sample.utcMs),
      timezone: sample.timezone,
      latDeg: sample.latDeg,
      lonEastDeg: sample.lonEastDeg,
      boundaryTags: sample.boundaryTags,
      grahas: grahas as Record<VedicGrahaName, number>,
      meanRahu,
      trueRahu,
      meanKetu: norm360(meanRahu + 180),
      trueKetu: norm360(trueRahu + 180),
      lagna: houses.ascendant,
    };
  });

  const manifest = {
    generatedAtUtc: new Date().toISOString(),
    referenceInputTimeScale: 'UTC',
    coordinateSemantics: 'east-positive longitude; synthetic technical coordinates only',
    siderealMode: 'Swiss SE_SIDM_LAHIRI (mode 1) via -sid1',
    ephemerisMode: '-emos (Moshier; no ephemeris data files stored in this repository)',
    swetestPathNote: 'local path supplied via SWETEST_PATH; binary is never committed or bundled',
    swetestBinarySha256: sha256(readFileSync(swetestPath)),
    versionLine,
    calls,
    cases: cases.map(({ utcMs, ...sample }) => ({ ...sample, utcIso: toIso(utcMs) })),
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(join(stagingDir, 'manifest.json'), manifestText, 'utf8');

  const draft = {
    schemaVersion: 'vedic-swiss-golden/v1',
    status: 'DRAFT_REVIEW_REQUIRED',
    source: {
      version: versionLine,
      captureDateUtc: manifest.generatedAtUtc,
      swetestBinarySha256: manifest.swetestBinarySha256,
      rawManifestSha256: sha256(manifestText),
      referenceInputTimeScale: manifest.referenceInputTimeScale,
      siderealMode: manifest.siderealMode,
      ephemerisMode: manifest.ephemerisMode,
    },
    toleranceArcmin: 1,
    cases: draftCases,
  };
  writeFileSync(
    join(stagingDir, 'draft-fixture.json'),
    `${JSON.stringify(draft, null, 2)}\n`,
    'utf8',
  );

  if (existsSync(finalDir)) {
    renameSync(finalDir, join(tmpRoot, `vedic-golden-raw.replaced-${stamp}`));
  }
  renameSync(stagingDir, finalDir);
  process.stdout.write(
    `[OK] captured ${draftCases.length} synthetic Vedic cases and ${calls.length} swetest calls into .tmp/vedic-golden-raw/\n` +
      '     Review manifest.json and draft-fixture.json before transcribing a tracked fixture.\n',
  );
}

main();
