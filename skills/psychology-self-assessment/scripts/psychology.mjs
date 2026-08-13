#!/usr/bin/env node
/**
 * File-only CLI for the nonclinical psychology-self-assessment Skill.
 * Raw answers are accepted only from an explicit local JSON file and are
 * written only to an explicit local session file; diagnostics never echo them.
 */
import {
  cancelIpipNeo120Session,
  completeIpipNeo120Session,
  IPIP_NEO_120_INSTRUCTIONS_ZH_CN,
  IPIP_NEO_120_INSTRUMENT,
  IPIP_NEO_120_ITEMS,
  IPIP_NEO_120_RESPONSE_OPTIONS_ZH_CN,
  IPIP_NEO_120_SOURCE,
  PersonalityProfile,
  QuestionnaireSession,
  recordIpipNeo120Answers,
  resumeIpipNeo120Session,
  scoreIpipNeo120,
  startPersonalityAssessment,
} from './dist/psychology-engine.mjs';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NOTICE_VERSION = 'psychology-self-assessment-notice/v1';
const MAX_INPUT_BYTES = 256 * 1024;
const scriptDir = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(scriptDir, '..', 'BUILD_MANIFEST.json');
const sourceManifestPath = resolve(
  scriptDir,
  '..',
  'references',
  'ipip-neo-120-source-manifest.json',
);

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) args[key] = true;
      else {
        args[key] = next;
        i += 1;
      }
    } else args._.push(token);
  }
  return args;
}

function fail(code, exitCode = 2) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: { code } }, null, 2)}\n`);
  process.exitCode = exitCode;
}

function requireFileArg(args, name) {
  const value = args[name];
  if (typeof value !== 'string' || value.length === 0) throw new Error('INPUT_INVALID');
  return resolve(process.cwd(), value);
}

function readJson(path) {
  let size;
  try {
    size = statSync(path).size;
  } catch {
    throw new Error('INPUT_INVALID');
  }
  if (size > MAX_INPUT_BYTES) throw new Error('INPUT_INVALID');
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error('INPUT_INVALID');
  }
}

function writePublic(args, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (typeof args['output-file'] === 'string') {
    writeFileSync(resolve(process.cwd(), args['output-file']), text, 'utf8');
    process.stderr.write('wrote public result\n');
  } else process.stdout.write(text);
}

function writePrivate(args, value) {
  if (typeof args['output-file'] !== 'string') throw new Error('OUTPUT_FILE_REQUIRED');
  writeFileSync(
    resolve(process.cwd(), args['output-file']),
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8',
  );
  process.stderr.write('wrote local private session\n');
}

function publicProfileFromArtifact(value) {
  const direct = PersonalityProfile.safeParse(value);
  if (direct.success) return direct.data;
  if (
    value !== null &&
    typeof value === 'object' &&
    value.ok === true &&
    Object.hasOwn(value, 'profile')
  ) {
    return PersonalityProfile.parse(value.profile);
  }
  throw new Error('INPUT_INVALID');
}

function completedSessionForScoring(value) {
  const session = QuestionnaireSession.parse(value);
  return session.status === 'completed' ? session : completeIpipNeo120Session(session);
}

function requireInstrument(args) {
  if (args.instrument !== 'ipip-neo-120-zh') throw new Error('INSTRUMENT_UNSUPPORTED');
}

function requireExactConsent(value) {
  if (
    value === null ||
    typeof value !== 'object' ||
    value.scope !== 'personality' ||
    value.granted !== true ||
    value.noticeVersion !== NOTICE_VERSION
  ) {
    throw new Error('CONSENT_REQUIRED');
  }
  return value;
}

function publicInstrument() {
  return {
    id: 'ipip-neo-120-zh',
    instrument: IPIP_NEO_120_INSTRUMENT,
    itemCount: IPIP_NEO_120_ITEMS.length,
    estimatedMinutes: '15-20',
    responseScale: IPIP_NEO_120_RESPONSE_OPTIONS_ZH_CN,
    nonclinical: true,
    selfReportNotDiagnosis: true,
    normsApplied: false,
    excludedCapabilities: ['clinical-screening', 'diagnosis', 'chart-personality-cross-check'],
  };
}

function itemsPayload() {
  return {
    ok: true,
    ...publicInstrument(),
    instructions: IPIP_NEO_120_INSTRUCTIONS_ZH_CN,
    items: IPIP_NEO_120_ITEMS.map(({ id, textZhCN }) => ({ id, textZhCN })),
    source: {
      url: IPIP_NEO_120_SOURCE.sources.mandarinItems.url,
      sha256: IPIP_NEO_120_SOURCE.sources.mandarinItems.sha256,
      attribution: 'Zhongyang Xu; cite Johnson (2014).',
    },
  };
}

function runDoctor() {
  const manifest = readJson(manifestPath);
  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
  return {
    ok: true,
    skill: manifest.skill,
    releaseVersion: manifest.releaseVersion,
    status: manifest.status,
    node: process.version,
    runtimeSupported: nodeMajor >= 22,
    offline: true,
    instruments: [publicInstrument()],
    clinicalInstrumentsAvailable: false,
  };
}

function runVerify() {
  const syntheticConsent = {
    scope: 'personality',
    granted: true,
    noticeVersion: NOTICE_VERSION,
  };
  const started = startPersonalityAssessment(syntheticConsent);
  const complete = completeIpipNeo120Session(
    recordIpipNeo120Answers(
      started,
      IPIP_NEO_120_ITEMS.map((item) => ({ itemId: item.id, response: 1 })),
    ),
  );
  const profile = scoreIpipNeo120(complete);
  const engineBytes = readFileSync(resolve(scriptDir, 'dist', 'psychology-engine.mjs'));
  const manifest = readJson(manifestPath);
  const expected = manifest.engine?.sha256;
  const actual = createHash('sha256').update(engineBytes).digest('hex');
  const checks = [
    { name: 'official Mandarin item count', ok: IPIP_NEO_120_ITEMS.length === 120 },
    {
      name: 'response options are source-bound',
      ok: IPIP_NEO_120_RESPONSE_OPTIONS_ZH_CN.length === 5,
    },
    {
      name: 'synthetic all-one scoring golden',
      ok:
        JSON.stringify(profile.domains) ===
        JSON.stringify([
          { id: 'domain-n', score: 52 },
          { id: 'domain-e', score: 48 },
          { id: 'domain-o', score: 72 },
          { id: 'domain-a', score: 92 },
          { id: 'domain-c', score: 76 },
        ]),
    },
    { name: 'profile omits raw answers', ok: !Object.hasOwn(profile, 'answers') },
    { name: 'bundle hash matches manifest', ok: expected === actual },
    { name: 'source manifest exists', ok: existsSync(sourceManifestPath) },
    { name: 'no clinical capability', ok: true },
  ];
  return { ok: checks.every((check) => check.ok), checks };
}

function deleteArtifact(path) {
  try {
    if (lstatSync(path).isSymbolicLink()) throw new Error('DELETE_REFUSED');
  } catch {
    throw new Error('DELETE_REFUSED');
  }
  const value = readJson(path);
  const session = QuestionnaireSession.safeParse(value);
  let profile = PersonalityProfile.safeParse(value);
  if (!profile.success) {
    try {
      profile = { success: true, data: publicProfileFromArtifact(value) };
    } catch {
      // Keep the public delete boundary fail-closed.
    }
  }
  if (!session.success && !profile.success) throw new Error('DELETE_REFUSED');
  rmSync(path, { force: false });
  return { ok: true, contractVersion: 'personality-session-delete/v1', deleted: true };
}

function assertOnly(args, names) {
  if (args._.length !== 0 || Object.keys(args).some((key) => key !== '_' && !names.has(key))) {
    throw new Error('COMMAND_INVALID');
  }
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  try {
    switch (command) {
      case 'doctor':
        assertOnly(args, new Set(['output-file']));
        writePublic(args, runDoctor());
        return;
      case 'version':
        assertOnly(args, new Set(['output-file']));
        writePublic(args, { ok: true, ...readJson(manifestPath) });
        return;
      case 'instruments':
        assertOnly(args, new Set(['output-file']));
        writePublic(args, { ok: true, instruments: [publicInstrument()] });
        return;
      case 'items':
        assertOnly(args, new Set(['instrument', 'output-file']));
        requireInstrument(args);
        writePublic(args, itemsPayload());
        return;
      case 'start': {
        assertOnly(args, new Set(['instrument', 'consent-file', 'output-file']));
        requireInstrument(args);
        const consent = requireExactConsent(readJson(requireFileArg(args, 'consent-file')));
        writePrivate(args, startPersonalityAssessment(consent));
        return;
      }
      case 'answer': {
        assertOnly(args, new Set(['input-file', 'answers-file', 'output-file']));
        const answers = readJson(requireFileArg(args, 'answers-file'));
        if (!Array.isArray(answers)) throw new Error('INPUT_INVALID');
        writePrivate(
          args,
          recordIpipNeo120Answers(readJson(requireFileArg(args, 'input-file')), answers),
        );
        return;
      }
      case 'resume':
        assertOnly(args, new Set(['input-file', 'output-file']));
        writePrivate(args, resumeIpipNeo120Session(readJson(requireFileArg(args, 'input-file'))));
        return;
      case 'cancel':
        assertOnly(args, new Set(['input-file', 'output-file']));
        writePrivate(args, cancelIpipNeo120Session(readJson(requireFileArg(args, 'input-file'))));
        return;
      case 'score': {
        assertOnly(args, new Set(['input-file', 'output-file']));
        const completed = completedSessionForScoring(readJson(requireFileArg(args, 'input-file')));
        writePublic(args, { ok: true, profile: scoreIpipNeo120(completed) });
        return;
      }
      case 'export': {
        assertOnly(args, new Set(['input-file', 'output-file']));
        const profile = publicProfileFromArtifact(readJson(requireFileArg(args, 'input-file')));
        writePublic(args, { ok: true, profile, exported: 'de-identified-profile-only' });
        return;
      }
      case 'delete': {
        assertOnly(args, new Set(['input-file', 'output-file']));
        const input = requireFileArg(args, 'input-file');
        if (
          typeof args['output-file'] === 'string' &&
          resolve(process.cwd(), args['output-file']) === input
        ) {
          throw new Error('DELETE_REFUSED');
        }
        writePublic(args, deleteArtifact(input));
        return;
      }
      case 'verify': {
        assertOnly(args, new Set(['output-file']));
        const report = runVerify();
        writePublic(args, report);
        if (!report.ok) process.exitCode = 1;
        return;
      }
      default:
        throw new Error('COMMAND_INVALID');
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : 'INTERNAL_ERROR', 1);
  }
}

main();
