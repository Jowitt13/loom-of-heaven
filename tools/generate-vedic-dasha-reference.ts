import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPathInsideDirectory, validateAbsoluteFilePath } from './lib/safe-spawn.ts';

/**
 * ONE-TIME external reference generator for the P3B Vimshottari arithmetic gate.
 *
 * NDAstro is an independently implemented MIT/Skyfield/JPL reference. It is NOT
 * bundled, added to the Node dependency graph, or invoked by CI. The caller must
 * explicitly supply an already-audited Python environment, source artifacts, and
 * DE440T data directory. Raw reference output stays under ignored .tmp/; this
 * script writes a DRAFT only, never the tracked fixture.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const tmpRoot = join(root, '.tmp');
const finalDir = join(tmpRoot, 'vedic-dasha-reference-raw');

interface DashaSample {
  id: string;
  description: string;
  birthUtcIso: string;
  latDeg: number;
  lonEastDeg: number;
}

/** Synthetic technical inputs only, distributed across the supported window. */
const SAMPLES: readonly DashaSample[] = [
  {
    id: 'dasha-001',
    description: 'Synthetic early-window southern reference',
    birthUtcIso: '1901-01-03T00:00:00Z',
    latDeg: -54.2,
    lonEastDeg: -170.3,
  },
  {
    id: 'dasha-002',
    description: 'Synthetic Pacific reference',
    birthUtcIso: '1918-06-12T07:13:00Z',
    latDeg: -36.9,
    lonEastDeg: 174.8,
  },
  {
    id: 'dasha-003',
    description: 'Synthetic Australian reference',
    birthUtcIso: '1935-11-23T14:26:00Z',
    latDeg: -33.8,
    lonEastDeg: 151.3,
  },
  {
    id: 'dasha-004',
    description: 'Synthetic equatorial reference',
    birthUtcIso: '1952-04-06T21:39:00Z',
    latDeg: -1.3,
    lonEastDeg: 36.8,
  },
  {
    id: 'dasha-005',
    description: 'Synthetic Gulf reference',
    birthUtcIso: '1969-09-17T04:52:00Z',
    latDeg: 25.2,
    lonEastDeg: 55.3,
  },
  {
    id: 'dasha-006',
    description: 'Synthetic Japanese reference',
    birthUtcIso: '1986-02-28T11:05:00Z',
    latDeg: 35.7,
    lonEastDeg: 139.7,
  },
  {
    id: 'dasha-007',
    description: 'Synthetic European reference',
    birthUtcIso: '2003-07-09T18:18:00Z',
    latDeg: 59.9,
    lonEastDeg: 10.7,
  },
  {
    id: 'dasha-008',
    description: 'Synthetic British reference',
    birthUtcIso: '2020-12-20T01:31:00Z',
    latDeg: 51.5,
    lonEastDeg: -0.1,
  },
  {
    id: 'dasha-009',
    description: 'Synthetic eastern North American reference',
    birthUtcIso: '2037-05-01T08:44:00Z',
    latDeg: 40.7,
    lonEastDeg: -74.0,
  },
  {
    id: 'dasha-010',
    description: 'Synthetic Mexican reference',
    birthUtcIso: '2054-10-12T15:57:00Z',
    latDeg: 19.4,
    lonEastDeg: -99.1,
  },
  {
    id: 'dasha-011',
    description: 'Synthetic western North American reference',
    birthUtcIso: '2071-03-25T22:10:00Z',
    latDeg: 49.3,
    lonEastDeg: -123.1,
  },
  {
    id: 'dasha-012',
    description: 'Synthetic late-window northern reference',
    birthUtcIso: '2098-08-05T05:23:00Z',
    latDeg: 61.2,
    lonEastDeg: -149.9,
  },
];

const RUNNER = String.raw`
import datetime as dt
import json
import sys

from ndastro_engine.config import settings
from ndastro_engine.dasa import DasaContext, DasaQuery, get_dasa_birth_info, get_dasa_timeline

UTC = dt.timezone.utc

def iso(value):
    return value.astimezone(UTC).isoformat(timespec='milliseconds').replace('+00:00', 'Z')

def period(value):
    return {
        'lord': value.lord,
        'startUtc': iso(value.start_utc),
        'endUtc': iso(value.end_utc),
        'antar': [
            {'lord': child.lord, 'startUtc': iso(child.start_utc), 'endUtc': iso(child.end_utc)}
            for child in value.children
        ],
    }

if settings.dasa_year_length != 365.25:
    raise RuntimeError(f'expected julian-365.25, got {settings.dasa_year_length!r}')

records = []
for sample in json.load(sys.stdin):
    birth = dt.datetime.fromisoformat(sample['birthUtcIso'].replace('Z', '+00:00'))
    context = DasaContext(
        birth_datetime=birth,
        lat=sample['latDeg'],
        lon=sample['lonEastDeg'],
        ayanamsa_system='lahiri',
    )
    info = get_dasa_birth_info(context)
    timeline = get_dasa_timeline(context, DasaQuery(levels=2))
    if len(timeline) != 9 or any(len(item.children) != 9 for item in timeline):
        raise RuntimeError(f'unexpected vimshottari shape for {sample["id"]}')
    records.append({
        **sample,
        'siderealMoonLongitudeDeg': info.sidereal_moon_longitude,
        'nakshatra': info.janma_nakshatra.name,
        'startLord': info.start_lord,
        'nakshatraProgressFraction': info.nakshatra_progress_fraction,
        'mahadashas': [period(item) for item in timeline],
    })

print(json.dumps({'dashaYearDays': settings.dasa_year_length, 'cases': records}, separators=(',', ':')))
`;

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function requireFile(name: string, value: string | undefined): string {
  if (!value || !existsSync(value))
    throw new Error(`${name} must point to an existing local file.`);
  return value;
}

function main(): void {
  let python: string;
  try {
    python = validateAbsoluteFilePath(process.env.NDASTRO_PYTHON, 'NDASTRO_PYTHON');
  } catch {
    throw new Error('NDASTRO_PYTHON must point to an existing local file.');
  }
  const ndaHome = process.env.NDASTRO_HOME;
  if (!ndaHome)
    throw new Error('NDASTRO_HOME must point to the controlled temporary home directory.');
  const wheel = requireFile('NDASTRO_WHEEL', process.env.NDASTRO_WHEEL);
  const sourceArchive = requireFile('NDASTRO_TAG_ARCHIVE', process.env.NDASTRO_TAG_ARCHIVE);
  const data = join(ndaHome, 'AppData', 'Local', 'ndastro', 'de440t.bsp');
  if (!existsSync(data)) throw new Error(`DE440T is missing from the NDAstro data path: ${data}`);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const stagingDir = join(tmpRoot, `vedic-dasha-reference-raw.staging-${stamp}`);
  mkdirSync(stagingDir, { recursive: true });
  const inputPath = join(stagingDir, 'input.json');
  const runnerPath = join(stagingDir, 'ndastro-runner.py');
  writeFileSync(inputPath, `${JSON.stringify(SAMPLES, null, 2)}\n`, 'utf8');
  writeFileSync(runnerPath, RUNNER, 'utf8');
  // The runner must stay canonically inside the controlled staging directory.
  assertPathInsideDirectory(inputPath, stagingDir, 'ndastro input document');
  assertPathInsideDirectory(runnerPath, stagingDir, 'ndastro runner');

  const result = spawnSync(python, [runnerPath], {
    encoding: 'utf8',
    input: readFileSync(inputPath, 'utf8'),
    timeout: 300_000,
    env: {
      ...process.env,
      HOME: ndaHome,
      USERPROFILE: ndaHome,
      NDASTRO_DASA_YEAR_LENGTH: '365.25',
      PYTHONIOENCODING: 'utf-8',
    },
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  writeFileSync(join(stagingDir, 'reference.stdout.json'), stdout, 'utf8');
  writeFileSync(join(stagingDir, 'reference.stderr.txt'), stderr, 'utf8');
  if (result.error || result.signal !== null || result.status !== 0) {
    throw new Error(
      'NDAstro process failed structurally; raw output remains in staging for inspection.',
    );
  }
  let parsed: {
    dashaYearDays: number;
    cases: Array<
      DashaSample & {
        siderealMoonLongitudeDeg: number;
        nakshatra: number;
        startLord: string;
        nakshatraProgressFraction: number;
        mahadashas: Array<{
          lord: string;
          startUtc: string;
          endUtc: string;
          antar: Array<{ lord: string; startUtc: string; endUtc: string }>;
        }>;
      }
    >;
  };
  try {
    parsed = JSON.parse(stdout) as typeof parsed;
  } catch {
    throw new Error('NDAstro stdout was not one parseable JSON document.');
  }
  if (parsed.dashaYearDays !== 365.25 || parsed.cases.length !== SAMPLES.length) {
    throw new Error('NDAstro output did not use the required julian-365.25 configuration.');
  }
  for (const sample of parsed.cases) {
    if (
      sample.mahadashas.length !== 9 ||
      sample.mahadashas.some((period) => period.antar.length !== 9)
    ) {
      throw new Error(`NDAstro output had an incomplete Maha/Antar tree (${sample.id}).`);
    }
  }

  const manifest = {
    generatedAtUtc: new Date().toISOString(),
    provider: 'ndastro-engine',
    configuredDashaYearDays: 365.25,
    wheelSha256: sha256(readFileSync(wheel)),
    sourceArchiveSha256: sha256(readFileSync(sourceArchive)),
    de440tSha256: sha256(readFileSync(data)),
    sourceBinding:
      'reviewer must verify all ndastro_engine Python modules match wheel to fixed v0.28.1 source tag',
    runnerSha256: sha256(RUNNER),
    inputSha256: sha256(readFileSync(inputPath)),
    stdoutSha256: sha256(stdout),
    stderrSha256: sha256(stderr),
    samples: SAMPLES,
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(join(stagingDir, 'manifest.json'), manifestText, 'utf8');
  // The raw JSON retains every Maha/Antar period. The reviewed fixture stays
  // intentionally compact: the first Maha, first/middle/last Antar checkpoints,
  // and the terminal cycle endpoint prove balance, year length and proportional
  // division without turning an offline regression fixture into a raw-output copy.
  // Unit tests separately assert all nine ordered Maha/Antar continuity invariants.
  const compactCases = parsed.cases.map(({ mahadashas, ...sample }) => ({
    ...sample,
    firstMaha: {
      lord: mahadashas[0]!.lord,
      startUtc: mahadashas[0]!.startUtc,
      endUtc: mahadashas[0]!.endUtc,
    },
    antarCheckpoints: [mahadashas[0]!.antar[0], mahadashas[0]!.antar[4], mahadashas[0]!.antar[8]],
    cycleEndUtc: mahadashas.at(-1)!.endUtc,
  }));
  const draft = {
    schemaVersion: 'vedic-vimshottari-reference/v1',
    status: 'DRAFT_REVIEW_REQUIRED',
    source: {
      provider: manifest.provider,
      version: '0.28.1',
      license: 'MIT',
      dashaYear: 'julian-365.25',
      dashaYearDays: manifest.configuredDashaYearDays,
      wheelSha256: manifest.wheelSha256,
      sourceArchiveSha256: manifest.sourceArchiveSha256,
      de440tSha256: manifest.de440tSha256,
      rawManifestSha256: sha256(manifestText),
      sourceBinding: manifest.sourceBinding,
    },
    // NDAstro retains its full-precision sidereal Moon while the engine freezes
    // classification after six-decimal canonicalization. 30 seconds covers the
    // measured 16.610-second worst endpoint shift from that input bridge only.
    endpointToleranceMs: 30_000,
    cases: compactCases,
  };
  writeFileSync(
    join(stagingDir, 'draft-fixture.json'),
    `${JSON.stringify(draft, null, 2)}\n`,
    'utf8',
  );

  if (existsSync(finalDir))
    renameSync(finalDir, join(tmpRoot, `vedic-dasha-reference-raw.replaced-${stamp}`));
  renameSync(stagingDir, finalDir);
  process.stdout.write(
    `[OK] captured ${parsed.cases.length} synthetic NDAstro dasha rows into .tmp/vedic-dasha-reference-raw/\n` +
      '     Review manifest.json and draft-fixture.json before transcribing the tracked fixture.\n',
  );
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
