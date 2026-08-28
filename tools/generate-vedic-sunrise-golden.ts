import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAbsoluteFilePath } from './lib/safe-spawn.ts';

/**
 * ONE-TIME external reference generator for the P3B Vaara sunrise gate.
 *
 * `swetest` is supplied only through SWETEST_PATH. It is never downloaded,
 * bundled, added to dependencies, copied into this repository, or used by CI.
 * Every raw stream stays in the ignored .tmp tree. This tool deliberately writes
 * only a DRAFT fixture: a reviewer must validate the raw manifest before copying
 * the concise, numeric fixture into packages/vedic/goldens.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const tmpRoot = join(root, '.tmp');
const finalDir = join(tmpRoot, 'vedic-sunrise-golden-raw');

interface SunriseSample {
  id: string;
  description: string;
  startUtcMs: number;
  timezone: string;
  latDeg: number;
  lonEastDeg: number;
}

interface CaptureCall {
  id: string;
  argv: string[];
  argvSha256: string;
  stdoutFile: string;
  stdoutSha256: string;
  stderrFile: string;
  stderrSha256: string;
}

/** Synthetic technical sites and dates only: no row is a person's birth data. */
const SAMPLES: readonly SunriseSample[] = [
  {
    id: 'sunrise-001',
    description: 'Synthetic equatorial January reference',
    startUtcMs: Date.UTC(1901, 0, 3),
    timezone: 'Africa/Nairobi',
    latDeg: -1.3,
    lonEastDeg: 36.8,
  },
  {
    id: 'sunrise-002',
    description: 'Synthetic southern-summer reference',
    startUtcMs: Date.UTC(1914, 11, 19),
    timezone: 'Pacific/Auckland',
    latDeg: -36.9,
    lonEastDeg: 174.8,
  },
  {
    id: 'sunrise-003',
    description: 'Synthetic southern-winter reference',
    startUtcMs: Date.UTC(1927, 5, 21),
    timezone: 'Australia/Sydney',
    latDeg: -33.8,
    lonEastDeg: 151.3,
  },
  {
    id: 'sunrise-004',
    description: 'Synthetic northern-spring reference',
    startUtcMs: Date.UTC(1940, 2, 20),
    timezone: 'Asia/Tokyo',
    latDeg: 35.7,
    lonEastDeg: 139.7,
  },
  {
    id: 'sunrise-005',
    description: 'Synthetic northern-autumn reference',
    startUtcMs: Date.UTC(1953, 8, 23),
    timezone: 'Europe/London',
    latDeg: 51.5,
    lonEastDeg: -0.1,
  },
  {
    id: 'sunrise-006',
    description: 'Synthetic high-northern summer reference',
    startUtcMs: Date.UTC(1966, 6, 7),
    timezone: 'Europe/Oslo',
    latDeg: 59.9,
    lonEastDeg: 10.7,
  },
  {
    id: 'sunrise-007',
    description: 'Synthetic high-northern winter reference',
    startUtcMs: Date.UTC(1979, 0, 14),
    timezone: 'America/Anchorage',
    latDeg: 61.2,
    lonEastDeg: -149.9,
  },
  {
    id: 'sunrise-008',
    description: 'Synthetic North American spring reference',
    startUtcMs: Date.UTC(1992, 3, 9),
    timezone: 'America/New_York',
    latDeg: 40.7,
    lonEastDeg: -74.0,
  },
  {
    id: 'sunrise-009',
    description: 'Synthetic North American summer reference',
    startUtcMs: Date.UTC(2005, 7, 16),
    timezone: 'America/Vancouver',
    latDeg: 49.3,
    lonEastDeg: -123.1,
  },
  {
    id: 'sunrise-010',
    description: 'Synthetic Mexican autumn reference',
    startUtcMs: Date.UTC(2018, 9, 2),
    timezone: 'America/Mexico_City',
    latDeg: 19.4,
    lonEastDeg: -99.1,
  },
  {
    id: 'sunrise-011',
    description: 'Synthetic Gulf winter reference',
    startUtcMs: Date.UTC(2031, 1, 26),
    timezone: 'Asia/Dubai',
    latDeg: 25.2,
    lonEastDeg: 55.3,
  },
  {
    id: 'sunrise-012',
    description: 'Synthetic date-line autumn reference',
    startUtcMs: Date.UTC(2044, 10, 5),
    timezone: 'Etc/GMT+12',
    latDeg: -54.2,
    lonEastDeg: -170.3,
  },
  {
    id: 'sunrise-013',
    description: 'Synthetic equatorial late-century reference',
    startUtcMs: Date.UTC(2057, 4, 30),
    timezone: 'Africa/Nairobi',
    latDeg: -1.3,
    lonEastDeg: 36.8,
  },
  {
    id: 'sunrise-014',
    description: 'Synthetic Pacific summer reference',
    startUtcMs: Date.UTC(2070, 11, 12),
    timezone: 'Pacific/Auckland',
    latDeg: -36.9,
    lonEastDeg: 174.8,
  },
  {
    id: 'sunrise-015',
    description: 'Synthetic European spring reference',
    startUtcMs: Date.UTC(2083, 2, 28),
    timezone: 'Europe/Oslo',
    latDeg: 59.9,
    lonEastDeg: 10.7,
  },
  {
    id: 'sunrise-016',
    description: 'Synthetic North American autumn reference',
    startUtcMs: Date.UTC(2096, 8, 17),
    timezone: 'America/New_York',
    latDeg: 40.7,
    lonEastDeg: -74.0,
  },
];

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function dateArg(utcMs: number): string {
  const date = new Date(utcMs);
  return `-b${date.getUTCDate()}.${date.getUTCMonth() + 1}.${date.getUTCFullYear()}`;
}

function toIso(utcMs: number): string {
  return new Date(utcMs).toISOString().replace(/\.000Z$/, 'Z');
}

export function parseRiseUtcMs(stdout: string, label: string): number {
  const match =
    /^\s*rise\s+(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2}(?:\.\d+)?)/m.exec(stdout);
  if (!match) throw new Error(`missing or malformed rise output (${label})`);
  const [, dayText, monthText, yearText, hourText, minuteText, secondText] = match;
  const second = Number(secondText);
  const utcMs = Date.UTC(
    Number(yearText),
    Number(monthText) - 1,
    Number(dayText),
    Number(hourText),
    Number(minuteText),
    Math.floor(second),
    Math.round((second % 1) * 1000),
  );
  if (!Number.isFinite(utcMs)) throw new Error(`invalid rise timestamp (${label})`);
  return utcMs;
}

/**
 * Structural gate over raw swetest capture output before parsing: every line
 * must be printable text and the document must contain a rise line. The gate
 * only rejects — a passing document is returned byte-for-byte unchanged, so
 * valid captures keep their exact golden semantics.
 */
export function validatedRiseStdout(stdout: string, label: string): string {
  const lines = stdout.split(/\r?\n/);
  for (const line of lines) {
    if (!/^[\x20-\x7e°]*$/.test(line)) {
      throw new Error(`swetest stdout for ${label} contains control or non-ASCII bytes`);
    }
  }
  if (!lines.some((line) => /^\s*rise\s+\d{1,2}\.\d{1,2}\.\d{4}\s/i.test(line))) {
    throw new Error(`swetest stdout for ${label} does not contain a rise line`);
  }
  return stdout;
}

function ensureSwetestPath(): string {
  try {
    return validateAbsoluteFilePath(process.env.SWETEST_PATH, 'SWETEST_PATH');
  } catch {
    throw new Error('SWETEST_PATH must point to a readable local swetest binary.');
  }
}

function main(): void {
  const swetestPath = ensureSwetestPath();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const stagingDir = join(tmpRoot, `vedic-sunrise-golden-raw.staging-${stamp}`);
  mkdirSync(stagingDir, { recursive: true });
  const calls: CaptureCall[] = [];

  const capture = (id: string, argv: string[]): string => {
    const result = spawnSync(swetestPath, argv, { encoding: 'utf8', timeout: 60_000 });
    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';
    const stdoutFile = `${id}.stdout.txt`;
    const stderrFile = `${id}.stderr.txt`;
    writeFileSync(join(stagingDir, stdoutFile), stdout, 'utf8');
    writeFileSync(join(stagingDir, stderrFile), stderr, 'utf8');
    if (result.error || result.signal !== null || result.status !== 0) {
      throw new Error(`swetest failed structurally (${id})`);
    }
    if (/error|warning|invalid|cannot/i.test(stderr)) {
      throw new Error(`swetest emitted error-looking stderr (${id})`);
    }
    calls.push({
      id,
      argv,
      argvSha256: sha256(JSON.stringify(argv)),
      stdoutFile,
      stdoutSha256: sha256(stdout),
      stderrFile,
      stderrSha256: sha256(stderr),
    });
    return stdout;
  };

  const versionStdout = capture('0000-version', ['-h']);
  const versionLine = versionStdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^Version:\s*\S/.test(line));
  if (!versionLine) throw new Error('swetest help did not contain a Version line.');

  const cases = SAMPLES.map((sample, index) => {
    const id = String(index + 1).padStart(4, '0');
    const argv = [
      dateArg(sample.startUtcMs),
      // swetest prints the event pair containing the start day first. At far-east
      // longitudes that pair can have a set but no subsequent UTC-date rise, so
      // request one additional daily row and strictly parse the first real rise.
      '-n2',
      '-rise',
      '-p0',
      `-geopos${sample.lonEastDeg},${sample.latDeg},0`,
      '-emos',
      '-head',
    ];
    // The omission of -norefrac/-disccenter is part of the frozen reference:
    // Swiss default apparent upper limb, matched against astronomy-engine SearchRiseSet.
    const capturedStdout = validatedRiseStdout(capture(`${id}-${sample.id}`, argv), sample.id);
    const sunriseUtcMs = parseRiseUtcMs(capturedStdout, sample.id);
    return { ...sample, startUtcIso: toIso(sample.startUtcMs), sunriseUtcIso: toIso(sunriseUtcMs) };
  });

  const manifest = {
    generatedAtUtc: new Date().toISOString(),
    referenceInputTimeScale: 'UTC',
    coordinateSemantics:
      'east-positive longitude; sea-level horizon; synthetic technical coordinates only',
    eventDefinition:
      'Swiss swetest -rise default: apparent upper-limb rise with standard refraction; -norefrac and -disccenter intentionally omitted',
    ephemerisMode: '-emos (Moshier; no ephemeris data files stored in this repository)',
    swetestPathNote: 'local path supplied via SWETEST_PATH; binary is never committed or bundled',
    swetestBinarySha256: sha256(readFileSync(swetestPath)),
    versionLine,
    calls,
    cases,
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(join(stagingDir, 'manifest.json'), manifestText, 'utf8');
  const draft = {
    schemaVersion: 'vedic-sunrise-golden/v1',
    status: 'DRAFT_REVIEW_REQUIRED',
    source: {
      version: versionLine,
      captureDateUtc: manifest.generatedAtUtc,
      swetestBinarySha256: manifest.swetestBinarySha256,
      rawManifestSha256: sha256(manifestText),
      referenceInputTimeScale: manifest.referenceInputTimeScale,
      eventDefinition: manifest.eventDefinition,
      ephemerisMode: manifest.ephemerisMode,
    },
    toleranceSeconds: 60,
    cases,
  };
  writeFileSync(
    join(stagingDir, 'draft-fixture.json'),
    `${JSON.stringify(draft, null, 2)}\n`,
    'utf8',
  );

  if (existsSync(finalDir))
    renameSync(finalDir, join(tmpRoot, `vedic-sunrise-golden-raw.replaced-${stamp}`));
  renameSync(stagingDir, finalDir);
  process.stdout.write(
    `[OK] captured ${cases.length} synthetic sunrise rows into .tmp/vedic-sunrise-golden-raw/\n` +
      '     Review manifest.json and draft-fixture.json before transcribing the tracked fixture.\n',
  );
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
