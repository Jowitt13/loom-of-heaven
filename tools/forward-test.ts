import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Phase 3 forward test (handoff §11 completion bar).
 *
 * Simulates a brand-new session that only ever sees the published Skill: it copies
 * ONLY `skills/xuan-ji-yu-heng` into an OS temp dir outside the repo (no
 * `packages/`, no `node_modules`, no `npm install`), then walks the SKILL.md
 * workflow for several realistic requests — fully offline. Where the clean-dir
 * smoke proves doctor/calculate/verify + byte-identical determinism (render is
 * temporarily disabled), this
 * forward test additionally exercises `normalize` and `compare`, and the
 * unknown / approximate / lunar degradation paths a real session must relay
 * honestly. Every input is fictional (handoff §10: no real birth data in tests).
 *
 * Requests covered (≥ the "three real requests" the Phase 3 bar asks for):
 *   A. Full four-system chart, exact time, gender known   (happy path + Western/Vedic gates)
 *   B. Unknown birth time                                  (time-gated degradation)
 *   C. Lunar-calendar input                                (LUNAR_CONVERTED)
 *   D. Approximate birth time                              (TIME_ACCURACY_APPROXIMATE)
 *   E. School / true-solar-time comparison                 (compare subcommand)
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const srcSkill = join(root, 'skills', 'xuan-ji-yu-heng');
const FIXED_NOW = '2026-01-01T00:00:00Z';

interface Step {
  name: string;
  ok: boolean;
  detail?: string;
}
const steps: Step[] = [];
const record = (name: string, ok: boolean, detail?: string): void => {
  steps.push(detail === undefined ? { name, ok } : { name, ok, detail });
};

function runNode(cwd: string, args: string[]): { code: number; stdout: string; stderr: string } {
  const res = spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
  return { code: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

interface Json {
  [key: string]: unknown;
}
function parseJson(stdout: string): Json | null {
  try {
    return JSON.parse(stdout) as Json;
  } catch {
    return null;
  }
}

// --- Fictional inputs (never real birth data). ---------------------------------
const LOCATION = {
  displayName: 'Fictional test location (not a real person)',
  latitude: 30.5,
  longitude: 114.3,
  source: 'user',
};

const exactMale = {
  calendar: 'gregorian',
  localDate: '1990-03-10',
  localTime: '08:15:00',
  timeAccuracy: 'exact',
  timezone: 'Asia/Shanghai',
  location: LOCATION,
  ruleGender: 'male',
  settings: { systems: ['western', 'bazi', 'ziwei'] },
};

const unknownTimeMale = {
  calendar: 'gregorian',
  localDate: '1990-03-10',
  timeAccuracy: 'unknown',
  timezone: 'Asia/Shanghai',
  location: LOCATION,
  ruleGender: 'male',
  settings: { systems: ['western', 'bazi', 'ziwei'] },
};

const lunarMale = {
  calendar: 'lunar',
  localDate: '1990-01-01',
  localTime: '08:15:00',
  timeAccuracy: 'exact',
  timezone: 'Asia/Shanghai',
  location: LOCATION,
  ruleGender: 'male',
  settings: { systems: ['western', 'bazi', 'ziwei'] },
};

const approximateMale = {
  calendar: 'gregorian',
  localDate: '1990-03-10',
  localTime: '08:15:00',
  timeAccuracy: 'approximate',
  timezone: 'Asia/Shanghai',
  location: LOCATION,
  ruleGender: 'male',
  settings: { systems: ['western', 'bazi', 'ziwei'] },
};

const tempBase = mkdtempSync(join(tmpdir(), 'ming-skill-forward-'));
const tempSkill = join(tempBase, 'xuan-ji-yu-heng');

function writeInput(name: string, input: unknown): string {
  const file = join(tempSkill, name);
  writeFileSync(file, `${JSON.stringify(input, null, 2)}\n`, 'utf8');
  // Absolute path: both the isolated copy and the source CLI read the same file,
  // so the byte-identical determinism check compares like-for-like input.
  return file;
}

function hasWarning(bundle: Json | null, code: string): boolean {
  const warnings = (bundle?.warnings ?? []) as Array<{ code: string }>;
  return warnings.some((w) => w.code === code);
}

try {
  // Copy only the published Skill, excluding scratch output.
  cpSync(srcSkill, tempSkill, {
    recursive: true,
    filter: (src) => !/[\\/]\.tmp([\\/]|$)/.test(src),
  });

  record(
    'skill copied to OS temp dir outside repo',
    existsSync(join(tempSkill, 'scripts', 'loom-chart.mjs')),
  );
  record('isolated copy has no node_modules', !existsSync(join(tempSkill, 'node_modules')));
  record('isolated copy has no packages/', !existsSync(join(tempBase, 'packages')));
  record(
    'engine bundle present in copy',
    existsSync(join(tempSkill, 'scripts', 'dist', 'engine.mjs')),
  );

  // --- Shared precondition: doctor + verify in the clean dir. ------------------
  const doctor = runNode(tempSkill, ['scripts/loom-chart.mjs', 'doctor']);
  const doctorJson = parseJson(doctor.stdout);
  const tzdbVersion = ((doctorJson?.tzdb as Json | undefined)?.version as string | undefined) ?? '';
  record('doctor runs in clean dir (exit 0)', doctor.code === 0);
  record('doctor reports a bundled TZDB version', tzdbVersion.length > 0, tzdbVersion);

  const verify = runNode(tempSkill, ['scripts/loom-chart.mjs', 'verify']);
  record('verify passes in clean dir', verify.code === 0);

  // --- Request A: full four-system chart, exact time, gender known. ------------
  const aInput = writeInput('a-input.json', exactMale);

  const aNormalize = runNode(tempSkill, [
    'scripts/loom-chart.mjs',
    'normalize',
    '--input-file',
    aInput,
  ]);
  const aNormJson = parseJson(aNormalize.stdout);
  record('A: normalize runs (exit 0)', aNormalize.code === 0);
  record(
    'A: normalize reports known time + UTC instant',
    aNormJson?.ok === true &&
      (aNormJson.normalized as Json)?.timeKnown === true &&
      typeof (aNormJson.normalized as Json)?.utcInstant === 'string',
  );

  const calcArgs = (input: string): string[] => [
    'scripts/loom-chart.mjs',
    'calculate',
    '--input-file',
    input,
    '--systems',
    'all',
    '--now',
    FIXED_NOW,
  ];
  const aCalcTemp = runNode(tempSkill, calcArgs(aInput));
  const aCalcSource = runNode(srcSkill, calcArgs(aInput));
  const aBundle = (parseJson(aCalcTemp.stdout)?.bundle as Json | undefined) ?? null;
  record('A: calculate runs in clean dir (exit 0)', aCalcTemp.code === 0);
  record(
    'A: canonical JSON identical: source CLI vs isolated Skill',
    aCalcTemp.stdout.length > 0 && aCalcTemp.stdout === aCalcSource.stdout,
  );
  const aBazi = aBundle?.bazi as Json | undefined;
  const aPillars = (aBazi?.pillars as Json | undefined) ?? {};
  record(
    'A: BaZi four pillars complete (hour pillar present, known time)',
    aBazi !== undefined && aPillars.hour !== null && aPillars.hour !== undefined,
  );
  record(
    'A: BaZi luck cycle computed (gender known)',
    aBazi?.luckCycle !== null && aBazi?.luckCycle !== undefined,
  );
  const aVedic = aBundle?.vedic as Json | undefined;
  record(
    'A: Zi Wei and Vedic charts computed (time + gender known; both node modes retained)',
    aBundle?.ziwei !== undefined &&
      aVedic !== undefined &&
      ((aVedic.nodes as Json | undefined)?.mean as Json | undefined) !== undefined &&
      ((aVedic.nodes as Json | undefined)?.true as Json | undefined) !== undefined,
  );
  const aWestern = aBundle?.western as Json | undefined;
  record(
    'A: Western natal chart computed (astronomy-engine; planets + houses present)',
    aWestern !== undefined &&
      ((aWestern.planets ?? []) as unknown[]).length > 0 &&
      ((aWestern.houses ?? []) as unknown[]).length === 12 &&
      aWestern.angles !== null,
  );
  const aProviders = ((aBundle?.provenance as Json)?.providers ?? []) as Array<{ id: string }>;
  record(
    'A: provenance lists tyme4ts + iztro + astronomy-engine + caelus providers',
    aProviders.some((p) => p.id === 'tyme4ts') &&
      aProviders.some((p) => p.id === 'iztro') &&
      aProviders.some((p) => p.id === 'astronomy-engine') &&
      aProviders.some((p) => p.id === 'caelus'),
  );

  // render is temporarily disabled: it emits a stable disabled notice (exit 3) and
  // writes no report file — hosts present the structured calculate/interpret JSON.
  runNode(tempSkill, [...calcArgs(aInput), '--output-file', 'a-chart.json']);
  const aRender = runNode(tempSkill, [
    'scripts/loom-chart.mjs',
    'render',
    '--input-file',
    'a-chart.json',
    '--output-file',
    'a-report.html',
  ]);
  const aReportPath = join(tempSkill, 'a-report.html');
  record(
    'A: render is disabled (exit 3, no HTML written, JSON notice)',
    aRender.code === 3 && !existsSync(aReportPath) && /"disabled":\s*true/.test(aRender.stdout),
  );

  // --- Request B: unknown birth time → honest degradation. ---------------------
  const bInput = writeInput('b-input.json', unknownTimeMale);
  const bCalc = runNode(tempSkill, calcArgs(bInput));
  const bBundle = (parseJson(bCalc.stdout)?.bundle as Json | undefined) ?? null;
  record('B: calculate (unknown time) runs (exit 0)', bCalc.code === 0);
  record('B: TIME_UNKNOWN warning surfaced', hasWarning(bBundle, 'TIME_UNKNOWN'));
  record(
    'B: Zi Wei omitted and Vedic time-of-day fields suppressed (not fabricated)',
    bBundle?.ziwei === undefined &&
      hasWarning(bBundle, 'ZIWEI_INPUT_REQUIRED') &&
      (bBundle?.vedic as Json | undefined)?.lagnaLongitudeDeg === null &&
      (bBundle?.vedic as Json | undefined)?.derived === null &&
      hasWarning(bBundle, 'VEDIC_TIME_REQUIRED'),
  );
  const bBazi = bBundle?.bazi as Json | undefined;
  const bPillars = (bBazi?.pillars as Json | undefined) ?? {};
  record(
    'B: BaZi hour pillar suppressed (null) but year/month/day remain',
    bBazi !== undefined &&
      bPillars.hour === null &&
      bPillars.year !== undefined &&
      bPillars.month !== undefined &&
      bPillars.day !== undefined,
  );
  record('B: BaZi luck cycle suppressed (null, unknown time)', bBazi?.luckCycle === null);
  const bWestern = bBundle?.western as Json | undefined;
  record(
    'B: Western planets computed, but no ascendant/houses fabricated for unknown time',
    bWestern !== undefined &&
      ((bWestern.planets ?? []) as unknown[]).length > 0 &&
      bWestern.angles === null &&
      ((bWestern.houses ?? []) as unknown[]).length === 0,
  );

  // --- Request C: lunar-calendar input → converted + warned. -------------------
  const cInput = writeInput('c-input.json', lunarMale);
  const cCalc = runNode(tempSkill, calcArgs(cInput));
  const cBundle = (parseJson(cCalc.stdout)?.bundle as Json | undefined) ?? null;
  record('C: calculate (lunar input) runs (exit 0)', cCalc.code === 0);
  record('C: LUNAR_CONVERTED warning surfaced', hasWarning(cBundle, 'LUNAR_CONVERTED'));
  const cLocalCivil = ((cBundle?.normalizedTime as Json)?.localCivil as string | undefined) ?? '';
  record(
    'C: lunar 1990-01-01 resolved to Gregorian 1990-01-27',
    cLocalCivil.startsWith('1990-01-27'),
    cLocalCivil,
  );
  record(
    'C: BaZi + Zi Wei + Vedic still computed after conversion',
    cBundle?.bazi !== undefined && cBundle?.ziwei !== undefined && cBundle?.vedic !== undefined,
  );

  // --- Request D: approximate birth time → flagged, still computed. ------------
  const dInput = writeInput('d-input.json', approximateMale);
  const dCalc = runNode(tempSkill, calcArgs(dInput));
  const dBundle = (parseJson(dCalc.stdout)?.bundle as Json | undefined) ?? null;
  record('D: calculate (approximate time) runs (exit 0)', dCalc.code === 0);
  record(
    'D: TIME_ACCURACY_APPROXIMATE warning surfaced',
    hasWarning(dBundle, 'TIME_ACCURACY_APPROXIMATE'),
  );
  record(
    'D: BaZi + Zi Wei + Vedic still computed for approximate time',
    dBundle?.bazi !== undefined && dBundle?.ziwei !== undefined && dBundle?.vedic !== undefined,
  );

  // --- Request E: school / true-solar-time comparison (compare subcommand). ----
  const eCompare = runNode(tempSkill, [
    'scripts/loom-chart.mjs',
    'compare',
    '--input-file',
    aInput,
    '--profiles',
    'default,apparent-solar',
    '--now',
    FIXED_NOW,
  ]);
  const eJson = parseJson(eCompare.stdout);
  const eProfiles = (eJson?.profiles ?? []) as unknown[];
  record('E: compare runs in clean dir (exit 0)', eCompare.code === 0);
  record(
    'E: compare returns both profiles with identical normalized time',
    eJson?.ok === true && eProfiles.length === 2 && eJson?.normalizedTimeIdentical === true,
  );

  // --- Request F: Zi Wei dynamic chart (运限盘) via the horoscope subcommand. ----
  const fHoro = runNode(tempSkill, [
    'scripts/loom-chart.mjs',
    'horoscope',
    '--input-file',
    aInput,
    '--at',
    '2026-05-20T14:00',
  ]);
  const fHoroJson = parseJson(fHoro.stdout);
  const fH = (fHoroJson?.horoscope as Json | undefined)?.horoscope as Json | undefined;
  record('F: horoscope runs in clean dir (exit 0)', fHoro.code === 0);
  record(
    'F: horoscope computes six limits with 流年=丙午 for 2026',
    fHoroJson?.ok === true &&
      fH !== undefined &&
      (fH.yearly as Json)?.heavenlyStem === '丙' &&
      (fH.yearly as Json)?.earthlyBranch === '午' &&
      ['decadal', 'age', 'yearly', 'monthly', 'daily', 'hourly'].every((k) => fH[k] !== undefined),
  );
  runNode(tempSkill, [
    'scripts/loom-chart.mjs',
    'horoscope',
    '--input-file',
    aInput,
    '--at',
    '2026-05-20T14:00',
    '--output-file',
    'f-horo.json',
  ]);
  const fRender = runNode(tempSkill, [
    'scripts/loom-chart.mjs',
    'render',
    '--input-file',
    'f-horo.json',
    '--output-file',
    'f-horo.html',
  ]);
  const fRenderPath = join(tempSkill, 'f-horo.html');
  record(
    'F: render is disabled for the horoscope too (exit 3, no HTML)',
    fRender.code === 3 && !existsSync(fRenderPath) && /"disabled":\s*true/.test(fRender.stdout),
  );

  // --- Request G: cross-system interpretation facts (the interpret subcommand). --
  const gInterp = runNode(tempSkill, [
    'scripts/loom-chart.mjs',
    'interpret',
    '--input-file',
    aInput,
    '--at',
    '2026-05-20T14:00',
  ]);
  const gJson = parseJson(gInterp.stdout);
  const gI = gJson?.interpretation as Json | undefined;
  const gFacts = (gI?.facts ?? []) as Array<{ topic: string; evidence: unknown[] }>;
  const gTopics = new Set(gFacts.map((f) => f.topic));
  record('G: interpret runs in clean dir (exit 0)', gInterp.code === 0);
  record(
    'G: interpretation covers reading topics with grounded evidence',
    gJson?.ok === true &&
      ['character', 'career', 'wealth', 'marriage', 'studies', 'health'].every((t) =>
        gTopics.has(t),
      ) &&
      gFacts.every((f) => Array.isArray(f.evidence) && f.evidence.length > 0),
  );
  record(
    'G: interpretation is de-identified and carries disclaimers',
    gI !== undefined &&
      ((gI.disclaimers ?? []) as unknown[]).length > 0 &&
      !gInterp.stdout.includes('Fictional test location'),
  );

  // --- Request H: multi-person 合婚 / synastry (two people). ---------------------
  const hPeople = {
    people: [
      {
        label: '甲',
        relation: 'spouse',
        input: {
          calendar: 'gregorian',
          localDate: '1990-06-15',
          localTime: '14:20:00',
          timeAccuracy: 'exact',
          timezone: 'Asia/Shanghai',
          location: LOCATION,
          ruleGender: 'male',
          settings: { systems: ['western', 'bazi', 'ziwei'] },
        },
      },
      {
        label: '乙',
        relation: 'spouse',
        input: {
          calendar: 'gregorian',
          localDate: '2001-08-18',
          localTime: '14:30:00',
          timeAccuracy: 'exact',
          timezone: 'Asia/Shanghai',
          location: LOCATION,
          ruleGender: 'female',
          settings: { systems: ['western', 'bazi', 'ziwei'] },
        },
      },
    ],
  };
  writeFileSync(join(tempSkill, 'people.json'), JSON.stringify(hPeople), 'utf8');
  const hSyn = runNode(tempSkill, [
    'scripts/loom-chart.mjs',
    'synastry',
    '--input-file',
    'people.json',
  ]);
  const hJson = parseJson(hSyn.stdout);
  const hSyn2 = (hJson?.synastry as Json | undefined) ?? undefined;
  const hFindings = (hSyn2?.findings ?? []) as Array<{ system: string }>;
  const hSystems = new Set(hFindings.map((f) => f.system));
  record('H: synastry runs in clean dir (exit 0)', hSyn.code === 0 && hJson?.ok === true);
  record(
    'H: synastry covers bazi/ziwei/western + overall',
    ['overall', 'bazi', 'ziwei', 'western'].every((s) => hSystems.has(s)),
  );
  record(
    'H: synastry is de-identified (no location leak) + carries disclaimers',
    hSyn2 !== undefined &&
      !hSyn.stdout.includes('Fictional test location') &&
      ((hSyn2.disclaimers ?? []) as unknown[]).length > 0,
  );

  // --- Request I: ordinary question uses only the public answer-plan contract. --
  const iAnswer = runNode(tempSkill, [
    'scripts/loom-chart.mjs',
    'answer-plan',
    '--input-file',
    aInput,
    '--topic',
    'career',
    '--lens',
    'advice',
    '--now',
    FIXED_NOW,
  ]);
  const iJson = parseJson(iAnswer.stdout);
  const iResult = iJson?.publicResult as Json | undefined;
  const iPlan = iJson?.answerPlan as Json | undefined;
  const iSelected = (iPlan?.selectedFacts ?? []) as Array<{ id: string; topic: string }>;
  const iAllowed = (iPlan?.allowedFactIds ?? []) as string[];
  const privateFields = [
    'originalInput',
    'requestId',
    'normalizedTime',
    'calculatedAt',
    'timezone',
    '"note"',
    'Fictional test location',
  ];
  record('I: answer-plan runs in clean dir (exit 0)', iAnswer.code === 0 && iJson?.ok === true);
  record(
    'I: answer-plan has no direct birth input or raw evidence fields',
    iResult !== undefined && privateFields.every((field) => !iAnswer.stdout.includes(field)),
  );
  record(
    'I: answer-plan scopes facts to career and makes every one citable',
    iSelected.length > 0 &&
      iSelected.every((fact) => fact.topic === 'career') &&
      JSON.stringify(iAllowed) === JSON.stringify(iSelected.map((fact) => fact.id)),
  );
} finally {
  rmSync(tempBase, { recursive: true, force: true });
}

const failed = steps.filter((s) => !s.ok);
for (const s of steps) {
  process.stdout.write(
    `[${s.ok ? 'PASS' : 'FAIL'}] ${s.name}${s.detail ? ` (${s.detail})` : ''}\n`,
  );
}
process.stdout.write(
  `\n${steps.length - failed.length}/${steps.length} forward-test steps passed.\n`,
);
if (failed.length > 0) process.exit(1);
