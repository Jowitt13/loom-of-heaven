import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
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
