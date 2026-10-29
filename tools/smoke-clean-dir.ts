import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Clean-directory offline smoke (handoff Phase 3 / §9). Copies ONLY the published
 * Skill into an OS temp dir outside the repo (no packages/, no node_modules), then
 * runs the CLI there. Also proves cross-environment reproducibility: identical
 * input + versions must yield byte-identical canonical JSON in the source tree and
 * in the isolated copy.
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

const tempBase = mkdtempSync(join(tmpdir(), 'ming-skill-smoke-'));
const tempSkill = join(tempBase, 'xuan-ji-yu-heng');

try {
  // Copy only the Skill, excluding scratch output.
  cpSync(srcSkill, tempSkill, {
    recursive: true,
    filter: (src) => !src.includes(`${join(srcSkill, '.tmp')}`) && !/[\\/]\.tmp([\\/]|$)/.test(src),
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

  const doctor = runNode(tempSkill, ['scripts/loom-chart.mjs', 'doctor']);
  record('doctor runs in clean dir (exit 0)', doctor.code === 0);
  let tzdbVersion = '';
  try {
    tzdbVersion = (JSON.parse(doctor.stdout) as { tzdb: { version: string } }).tzdb.version;
  } catch {
    /* reported by the exit-code check */
  }
  record('doctor reports a bundled TZDB version', tzdbVersion.length > 0, tzdbVersion);

  const calcArgs = [
    'scripts/loom-chart.mjs',
    'calculate',
    '--input-file',
    'scripts/fixtures/smoke.json',
    '--systems',
    'all',
    '--now',
    FIXED_NOW,
  ];
  const calcTemp = runNode(tempSkill, calcArgs);
  const calcSource = runNode(srcSkill, calcArgs);
  record('calculate runs in clean dir (exit 0)', calcTemp.code === 0);
  record(
    'canonical JSON identical: source CLI vs isolated Skill',
    calcTemp.stdout.length > 0 && calcTemp.stdout === calcSource.stdout,
  );

  const answerArgs = [
    'scripts/loom-chart.mjs',
    'answer-plan',
    '--input-file',
    'scripts/fixtures/smoke.json',
    '--topic',
    'career',
    '--lens',
    'advice',
    '--now',
    FIXED_NOW,
  ];
  const answerTemp = runNode(tempSkill, answerArgs);
  const answerSource = runNode(srcSkill, answerArgs);
  record('answer-plan runs in clean dir (exit 0)', answerTemp.code === 0);
  record(
    'answer-plan JSON identical: source CLI vs isolated Skill',
    answerTemp.stdout.length > 0 && answerTemp.stdout === answerSource.stdout,
  );
  let publicAnswer: Record<string, unknown> = {};
  try {
    publicAnswer = JSON.parse(answerTemp.stdout) as Record<string, unknown>;
  } catch {
    /* covered by the exit-code check */
  }
  const answerJson = JSON.stringify(publicAnswer);
  const privateKeys = [
    'originalInput',
    'requestId',
    'normalizedTime',
    'calculatedAt',
    'timezone',
    'localCivil',
    'utcInstant',
    'meanSolarTime',
    'apparentSolarTime',
    '"note"',
  ];
  record(
    'answer-plan omits private input and raw evidence fields',
    publicAnswer.ok === true && privateKeys.every((key) => !answerJson.includes(key)),
  );
  const scopedPublicResult = publicAnswer.publicResult as Record<string, unknown> | undefined;
  const scopedAnswerPlan = publicAnswer.answerPlan as Record<string, unknown> | undefined;
  const exposedFactIds = Array.isArray(scopedPublicResult?.facts)
    ? scopedPublicResult.facts.map((fact) => (fact as Record<string, unknown>).id)
    : [];
  const allowedFactIds = Array.isArray(scopedAnswerPlan?.allowedFactIds)
    ? scopedAnswerPlan.allowedFactIds
    : [];
  record(
    'answer-plan exposes only the selected topic facts',
    JSON.stringify(exposedFactIds) === JSON.stringify(allowedFactIds),
  );
  const rejectedQuestion = 'Synthetic free-form question sentinel';
  const rejected = runNode(tempSkill, [
    'scripts/loom-chart.mjs',
    'answer-plan',
    '--input-file',
    'scripts/fixtures/smoke.json',
    '--question',
    rejectedQuestion,
  ]);
  record(
    'answer-plan rejects free-form question text without echoing it',
    rejected.code !== 0 &&
      /"code":\s*"INPUT_VALIDATION_FAILED"/.test(rejected.stdout) &&
      !rejected.stdout.includes(rejectedQuestion) &&
      !rejected.stderr.includes(rejectedQuestion),
  );
  const missingTopicValue = runNode(tempSkill, [
    'scripts/loom-chart.mjs',
    'answer-plan',
    '--input-file',
    'scripts/fixtures/smoke.json',
    '--topic',
  ]);
  record(
    'answer-plan rejects a missing bounded-option value instead of widening scope',
    missingTopicValue.code !== 0 &&
      /"code":\s*"INPUT_VALIDATION_FAILED"/.test(missingTopicValue.stdout),
  );
  const missingTopic = runNode(tempSkill, [
    'scripts/loom-chart.mjs',
    'answer-plan',
    '--input-file',
    'scripts/fixtures/smoke.json',
  ]);
  record(
    'answer-plan requires an explicit bounded topic instead of widening scope',
    missingTopic.code !== 0 && /"code":\s*"INPUT_VALIDATION_FAILED"/.test(missingTopic.stdout),
  );

  // IQ-4F: the explicit single-system bazi-career runtime entry.
  const baziCareerArgs = [
    'scripts/loom-chart.mjs',
    'bazi-career',
    '--input-file',
    'scripts/fixtures/smoke.json',
    '--system',
    'bazi',
    '--depth',
    'standard',
    '--now',
    FIXED_NOW,
  ];
  const baziCareerTemp = runNode(tempSkill, baziCareerArgs);
  record('bazi-career runs in clean dir (exit 0)', baziCareerTemp.code === 0);
  let baziCareerSystem = '';
  try {
    baziCareerSystem =
      (JSON.parse(baziCareerTemp.stdout) as { responseView?: { system?: string } }).responseView
        ?.system ?? '';
  } catch {
    // keep empty; the record below reports it
  }
  record(
    'bazi-career emits the response-view record for system bazi only',
    baziCareerSystem === 'bazi',
  );
  record(
    'bazi-career output identical: source CLI vs isolated Skill',
    baziCareerTemp.stdout.length > 0 &&
      baziCareerTemp.stdout === runNode(srcSkill, baziCareerArgs).stdout,
  );
  const baziCareerWestern = runNode(tempSkill, [
    'scripts/loom-chart.mjs',
    'bazi-career',
    '--input-file',
    'scripts/fixtures/smoke.json',
    '--system',
    'western',
    '--depth',
    'standard',
    '--now',
    FIXED_NOW,
  ]);
  record(
    'bazi-career rejects a non-bazi system selection (fail closed)',
    baziCareerWestern.code !== 0 &&
      /"code":\s*"RULESET_UNSUPPORTED"/.test(baziCareerWestern.stdout),
  );
  const baziCareerMissingSystem = runNode(tempSkill, [
    'scripts/loom-chart.mjs',
    'bazi-career',
    '--input-file',
    'scripts/fixtures/smoke.json',
    '--depth',
    'standard',
    '--now',
    FIXED_NOW,
  ]);
  record(
    'bazi-career requires an explicit system selection',
    baziCareerMissingSystem.code === 2 &&
      /"code":\s*"INPUT_VALIDATION_FAILED"/.test(baziCareerMissingSystem.stdout),
  );
  const smokeFixture = JSON.parse(
    readFileSync(join(srcSkill, 'scripts', 'fixtures', 'smoke.json'), 'utf8'),
  ) as Record<string, unknown>;
  const unknownFixture = join(tempSkill, 'scripts', 'fixtures', 'smoke-unknown-time.json');
  writeFileSync(
    unknownFixture,
    JSON.stringify({ ...smokeFixture, localTime: undefined, timeAccuracy: 'unknown' }),
  );
  const baziCareerUnknown = runNode(tempSkill, [
    'scripts/loom-chart.mjs',
    'bazi-career',
    '--input-file',
    'scripts/fixtures/smoke-unknown-time.json',
    '--system',
    'bazi',
    '--depth',
    'standard',
    '--now',
    FIXED_NOW,
  ]);
  record(
    'bazi-career fails closed with CLARIFICATION_REQUIRED on unknown birth time',
    baziCareerUnknown.code === 12 &&
      /"code":\s*"CLARIFICATION_REQUIRED"/.test(baziCareerUnknown.stdout),
  );

  const targetDate = '2026-05-20';
  const dynamicAnswer = runNode(tempSkill, [
    ...answerArgs,
    '--topic',
    'general',
    '--at',
    targetDate,
  ]);
  record(
    'answer-plan removes the exact dynamic target date from the public output',
    dynamicAnswer.code === 0 && !dynamicAnswer.stdout.includes(targetDate),
  );

  // Input-date and ruleset-version integrity through the real CLI entry.
  const integrityBase = {
    calendar: 'gregorian',
    localDate: '2000-02-29',
    localTime: '08:30',
    timeAccuracy: 'exact',
    timezone: 'Asia/Shanghai',
    location: { latitude: 31.23, longitude: 121.47, source: 'user' },
    ruleGender: 'male',
    settings: { systems: ['western', 'bazi', 'ziwei', 'vedic'] },
  };
  const writeIntegrity = (name: string, value: unknown): string => {
    writeFileSync(join(tempSkill, name), JSON.stringify(value));
    return name;
  };
  const invalidDate = '2023-02-29';
  const invalidDateFile = writeIntegrity('integrity-invalid-date.json', {
    ...integrityBase,
    localDate: invalidDate,
  });
  const fakeRulesetFile = writeIntegrity('integrity-fake-ruleset.json', {
    ...integrityBase,
    localDate: '1990-06-15',
    settings: { systems: ['bazi'], bazi: { rulesetId: 'review-nonexistent@9.9.9' } },
  });
  const validLeapFile = writeIntegrity('integrity-valid-leap.json', integrityBase);
  const lunarFile = writeIntegrity('integrity-lunar.json', {
    ...integrityBase,
    calendar: 'lunar',
    localDate: '2023-02-30',
    lunarLeapMonth: false,
  });
  const synastryPersonB = {
    label: 'B',
    relation: 'friend',
    input: { ...integrityBase, localDate: '1990-06-15' },
  };
  const synastryValidFile = writeIntegrity('integrity-synastry-valid.json', {
    people: [{ label: 'A', relation: 'friend', input: integrityBase }, synastryPersonB],
  });
  const synastryInvalidFile = writeIntegrity('integrity-synastry-invalid.json', {
    people: [
      { label: 'A', relation: 'friend', input: integrityBase },
      {
        ...synastryPersonB,
        input: { ...integrityBase, localDate: invalidDate },
      },
    ],
  });

  const invalidDateCommands: ReadonlyArray<readonly [string, string, ...string[]]> = [
    ['normalize', invalidDateFile],
    ['calculate', invalidDateFile],
    ['interpret', invalidDateFile],
    ['answer-plan', invalidDateFile, '--topic', 'general'],
    ['synastry', synastryInvalidFile],
  ];
  for (const [command, file, ...extra] of invalidDateCommands) {
    const result = runNode(tempSkill, [
      'scripts/loom-chart.mjs',
      command,
      '--input-file',
      file,
      ...extra,
    ]);
    record(
      `${command} rejects a nonexistent Gregorian date (exit 2, no echo)`,
      result.code === 2 &&
        /"code":\s*"INPUT_VALIDATION_FAILED"/.test(result.stdout) &&
        !result.stdout.includes(invalidDate) &&
        !result.stderr.includes(invalidDate) &&
        !/\bat\s+\w+.*\.ts:\d+/.test(result.stderr),
    );
  }

  const validCalculate = runNode(tempSkill, [
    'scripts/loom-chart.mjs',
    'calculate',
    '--input-file',
    validLeapFile,
    '--now',
    FIXED_NOW,
  ]);
  const validBundle = (
    JSON.parse(validCalculate.stdout) as {
      bundle?: {
        normalizedTime?: { localCivil?: string; utcInstant?: string };
        western?: { rulesetId?: string };
        bazi?: { rulesetId?: string };
        ziwei?: { rulesetId?: string };
        vedic?: { rulesetId?: string };
        provenance?: { rulesets?: Array<{ id?: string; version?: string }> };
      };
    }
  ).bundle;
  const normalizedTime = validBundle?.normalizedTime;
  record(
    'calculate accepts 2000-02-29 with consistent local and UTC time',
    validCalculate.code === 0 &&
      normalizedTime?.localCivil === '2000-02-29T08:30:00+08:00' &&
      normalizedTime.utcInstant === '2000-02-29T00:30:00Z',
  );
  record(
    'calculate records only the implemented rulesets',
    validCalculate.code === 0 &&
      validBundle?.western?.rulesetId === 'western-tropical-placidus@0.2.1' &&
      validBundle.bazi?.rulesetId === 'bazi-standard@0.1.1' &&
      validBundle.ziwei?.rulesetId === 'iztro-default@0.1.0' &&
      validBundle.vedic?.rulesetId === 'vedic-parashara-lahiri@0.1.0' &&
      validBundle.provenance?.rulesets?.some(
        (ruleset) => ruleset.id === 'western-tropical-placidus' && ruleset.version === '0.2.1',
      ) === true &&
      !validCalculate.stdout.includes('review-nonexistent'),
  );

  const explicitCurrentFile = writeIntegrity('integrity-western-current.json', {
    ...integrityBase,
    settings: {
      systems: ['western'],
      western: {
        zodiac: 'sidereal',
        houseSystem: 'whole-sign',
        rulesetId: 'western-tropical-placidus@0.2.1',
      },
    },
  });
  const explicitCurrent = runNode(tempSkill, [
    'scripts/loom-chart.mjs',
    'calculate',
    '--input-file',
    explicitCurrentFile,
    '--now',
    FIXED_NOW,
  ]);
  const explicitCurrentWestern = (
    JSON.parse(explicitCurrent.stdout) as {
      bundle?: {
        western?: { rulesetId?: string };
        provenance?: { rulesets?: Array<{ id?: string; version?: string }> };
      };
    }
  ).bundle;
  record(
    'explicit western 0.2.1 is accepted and recorded as current',
    explicitCurrent.code === 0 &&
      explicitCurrentWestern?.western?.rulesetId === 'western-tropical-placidus@0.2.1' &&
      explicitCurrentWestern.provenance?.rulesets?.some(
        (ruleset) => ruleset.id === 'western-tropical-placidus' && ruleset.version === '0.2.1',
      ) === true,
  );

  for (const retired of ['0.2.0', '0.1.0']) {
    for (const timeAccuracy of ['exact', 'unknown'] as const) {
      const retiredFile = writeIntegrity(
        `integrity-western-retired-${retired}-${timeAccuracy}.json`,
        {
          ...integrityBase,
          localDate: '1990-06-15',
          localTime: timeAccuracy === 'unknown' ? undefined : '08:30',
          timeAccuracy,
          settings: {
            systems: ['western'],
            western: {
              zodiac: 'sidereal',
              houseSystem: 'whole-sign',
              rulesetId: `western-tropical-placidus@${retired}`,
            },
          },
        },
      );
      const result = runNode(tempSkill, [
        'scripts/loom-chart.mjs',
        'calculate',
        '--input-file',
        retiredFile,
      ]);
      record(
        `calculate rejects retired western ${retired} (${timeAccuracy}, exit 10)`,
        result.code === 10 &&
          /"code":\s*"RULESET_UNSUPPORTED"/.test(result.stdout) &&
          result.stdout.includes(`western-tropical-placidus@${retired}`) &&
          result.stdout.includes('western-tropical-placidus@0.2.1'),
      );
    }
  }

  const validLeapNormalize = runNode(tempSkill, [
    'scripts/loom-chart.mjs',
    'normalize',
    '--input-file',
    validLeapFile,
  ]);
  const leapNormalized = (
    JSON.parse(validLeapNormalize.stdout) as {
      normalized?: { localDate?: string; localCivilIso?: string; utcInstant?: string };
    }
  ).normalized;
  record(
    'normalize preserves 2000-02-29 local date, civil time, and UTC',
    validLeapNormalize.code === 0 &&
      leapNormalized?.localDate === '2000-02-29' &&
      leapNormalized.localCivilIso === '2000-02-29T08:30:00+08:00' &&
      leapNormalized.utcInstant === '2000-02-29T00:30:00Z',
  );

  const fakeRuleset = runNode(tempSkill, [
    'scripts/loom-chart.mjs',
    'calculate',
    '--input-file',
    fakeRulesetFile,
  ]);
  record(
    'calculate rejects a fabricated ruleset (exit 10)',
    fakeRuleset.code === 10 &&
      /"code":\s*"RULESET_UNSUPPORTED"/.test(fakeRuleset.stdout) &&
      !/"ok":\s*true/.test(fakeRuleset.stdout),
  );

  const lunarNormalize = runNode(tempSkill, [
    'scripts/loom-chart.mjs',
    'normalize',
    '--input-file',
    lunarFile,
  ]);
  const lunarPayload = JSON.parse(lunarNormalize.stdout) as {
    normalized?: { localDate?: string };
    warnings?: Array<{ code?: string }>;
  };
  record(
    'normalize still converts lunar 2023-02-30 to 2023-03-21',
    lunarNormalize.code === 0 &&
      lunarPayload.normalized?.localDate === '2023-03-21' &&
      lunarPayload.warnings?.some((warning) => warning.code === 'LUNAR_CONVERTED') === true,
  );

  const validInterpret = runNode(tempSkill, [
    'scripts/loom-chart.mjs',
    'interpret',
    '--input-file',
    validLeapFile,
    '--now',
    FIXED_NOW,
  ]);
  const interpretationRulesets = (
    JSON.parse(validInterpret.stdout) as {
      interpretation?: { rulesets?: Array<{ id?: string; version?: string }> };
    }
  ).interpretation?.rulesets;
  record(
    'interpret records bazi-rules-ziping only when bazi interpretation ran',
    validInterpret.code === 0 &&
      interpretationRulesets?.some(
        (ruleset) => ruleset.id === 'bazi-rules-ziping' && ruleset.version === '0.1.0',
      ) === true &&
      interpretationRulesets?.some(
        (ruleset) => ruleset.id === 'bazi-standard' && ruleset.version === '0.1.1',
      ) === true,
  );

  const synastryValid = runNode(tempSkill, [
    'scripts/loom-chart.mjs',
    'synastry',
    '--input-file',
    synastryValidFile,
    '--now',
    FIXED_NOW,
  ]);
  record(
    'synastry still accepts a valid pair',
    synastryValid.code === 0 && /"ok":\s*true/.test(synastryValid.stdout),
  );

  const siderealWholeSignFile = writeIntegrity('integrity-sidereal-whole-sign.json', {
    calendar: 'gregorian',
    localDate: '1991-02-03',
    localTime: '04:05:06',
    timeAccuracy: 'exact',
    timezone: 'Asia/Shanghai',
    location: { latitude: 31.23, longitude: 121.47, source: 'user' },
    settings: {
      systems: ['western'],
      western: { zodiac: 'sidereal', houseSystem: 'whole-sign', asteroids: false },
    },
  });
  const siderealCalc = runNode(tempSkill, [
    'scripts/loom-chart.mjs',
    'calculate',
    '--input-file',
    siderealWholeSignFile,
    '--now',
    FIXED_NOW,
  ]);
  const siderealWestern = (
    JSON.parse(siderealCalc.stdout) as {
      bundle?: {
        western?: {
          houses?: Array<{ cuspLongitudeDeg?: number }>;
          planets?: Array<{ body?: string; longitudeDeg?: number; house?: number | null }>;
          angles?: { ascendant?: { longitudeDeg?: number } };
        };
      };
    }
  ).bundle?.western;
  const siderealFirstCusp = siderealWestern?.houses?.[0]?.cuspLongitudeDeg;
  const siderealBody = (body: string) =>
    siderealWestern?.planets?.find((planet) => planet.body === body);
  const siderealPartitionOk =
    siderealFirstCusp !== undefined &&
    siderealWestern?.planets?.every(
      (planet) =>
        typeof planet.house === 'number' &&
        typeof planet.longitudeDeg === 'number' &&
        planet.house ===
          1 + Math.floor(((((planet.longitudeDeg - siderealFirstCusp) % 360) + 360) % 360) / 30),
    ) === true;
  record(
    'sidereal whole-sign cusps start at the sidereal Asc sign and regroup every point',
    siderealCalc.code === 0 &&
      siderealFirstCusp === 240 &&
      siderealBody('Mercury')?.house === 2 &&
      siderealBody('Saturn')?.house === 2 &&
      siderealWestern?.angles?.ascendant?.longitudeDeg === 246.288575 &&
      siderealPartitionOk,
  );

  // render is temporarily disabled (visualization reports off): it must emit a
  // stable disabled notice (exit 3), never crash, and never write a report file.
  runNode(tempSkill, [...calcArgs, '--output-file', 'chart.json']);
  const render = runNode(tempSkill, [
    'scripts/loom-chart.mjs',
    'render',
    '--input-file',
    'chart.json',
    '--output-file',
    'report.html',
  ]);
  const reportPath = join(tempSkill, 'report.html');
  const renderDisabled =
    render.code === 3 && !existsSync(reportPath) && /"disabled":\s*true/.test(render.stdout);
  record('render is disabled (exit 3, no report written)', renderDisabled);

  const verify = runNode(tempSkill, ['scripts/loom-chart.mjs', 'verify']);
  record('verify passes in clean dir', verify.code === 0);
} finally {
  rmSync(tempBase, { recursive: true, force: true });
}

const failed = steps.filter((s) => !s.ok);
for (const s of steps) {
  process.stdout.write(
    `[${s.ok ? 'PASS' : 'FAIL'}] ${s.name}${s.detail ? ` (${s.detail})` : ''}\n`,
  );
}
process.stdout.write(`\n${steps.length - failed.length}/${steps.length} smoke steps passed.\n`);
if (failed.length > 0) process.exit(1);
