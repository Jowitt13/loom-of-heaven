import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Generate the de-identified end-to-end example (handoff Phase 4 deliverable).
 *
 * Runs the SAME published engine bundle the Skill ships (scripts/dist/engine.mjs)
 * from a fully fictional birth record (handoff §10: never real birth data) and
 * writes the artifacts a WorkBuddy run would hand back: `birth-input.json`,
 * `chart.json` and `interpretation.json` (the cross-system reading facts). HTML/SVG
 * reports are temporarily disabled. Output is deterministic (fixed --now), so the
 * committed example reproduces byte-for-byte.
 *
 * Requires `pnpm run build` first (it imports the bundled engine).
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const skillDir = join(root, 'skills', 'xuan-ji-yu-heng');
const enginePath = join(skillDir, 'scripts', 'dist', 'engine.mjs');
const outDir = join(root, 'examples');
const FIXED_NOW = Date.parse('2026-01-01T00:00:00Z');

interface Engine {
  parseBirthInput: (raw: unknown) => unknown;
  parseSynastryInput: (raw: unknown) => unknown;
  calculate: (input: unknown, options: { now: number }) => ChartBundleLite;
  runInterpret: (
    input: unknown,
    options: { now: number },
  ) => { interpretation: unknown; warnings: unknown };
  runSynastry: (
    input: unknown,
    options: { now: number },
  ) => { synastry: unknown; warnings: unknown };
  canonicalJsonPretty: (value: unknown) => string;
}
interface ChartBundleLite {
  requestId: string;
  provenance: { providers: Array<{ id: string }> };
}

async function main(): Promise<void> {
  if (!existsSync(enginePath)) {
    process.stderr.write('Engine bundle not found. Run `pnpm run build` first.\n');
    process.exit(1);
  }
  const engine = (await import(pathToFileURL(enginePath).href)) as Engine;

  const input = engine.parseBirthInput({
    calendar: 'gregorian',
    localDate: '1990-03-10',
    localTime: '08:15:00',
    timeAccuracy: 'exact',
    timezone: 'Asia/Shanghai',
    location: {
      displayName: 'Fictional example location (not a real person)',
      latitude: 30.59,
      longitude: 114.27,
      source: 'user',
    },
    ruleGender: 'male',
  });

  const bundle = engine.calculate(input, { now: FIXED_NOW });
  const envelope = { ok: true, bundle };
  const { interpretation, warnings } = engine.runInterpret(input, { now: FIXED_NOW });

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'birth-input.json'), `${engine.canonicalJsonPretty(input)}\n`, 'utf8');
  writeFileSync(join(outDir, 'chart.json'), `${engine.canonicalJsonPretty(envelope)}\n`, 'utf8');
  writeFileSync(
    join(outDir, 'interpretation.json'),
    `${engine.canonicalJsonPretty({ ok: true, interpretation, warnings })}\n`,
    'utf8',
  );

  // A de-identified two-person 合婚 example (both fictional).
  const femaleRaw = {
    calendar: 'gregorian',
    localDate: '1992-11-22',
    localTime: '16:40:00',
    timeAccuracy: 'exact',
    timezone: 'Asia/Shanghai',
    location: {
      displayName: 'Fictional example location (not a real person)',
      latitude: 31.23,
      longitude: 121.47,
      source: 'user',
    },
    ruleGender: 'female',
    settings: { systems: ['western', 'bazi', 'ziwei'] },
  };
  const maleRaw = {
    calendar: 'gregorian',
    localDate: '1990-03-10',
    localTime: '08:15:00',
    timeAccuracy: 'exact',
    timezone: 'Asia/Shanghai',
    location: {
      displayName: 'Fictional example location (not a real person)',
      latitude: 30.59,
      longitude: 114.27,
      source: 'user',
    },
    ruleGender: 'male',
    settings: { systems: ['western', 'bazi', 'ziwei'] },
  };
  const synInput = engine.parseSynastryInput({
    people: [
      { label: '甲', relation: 'spouse', input: maleRaw },
      { label: '乙', relation: 'spouse', input: femaleRaw },
    ],
  });
  const { synastry } = engine.runSynastry(synInput, { now: FIXED_NOW });
  writeFileSync(
    join(outDir, 'synastry.json'),
    `${engine.canonicalJsonPretty({ ok: true, synastry })}\n`,
    'utf8',
  );

  const providers = bundle.provenance.providers.map((p) => p.id).join(', ');
  process.stdout.write('De-identified example written to examples/\n');
  process.stdout.write('  birth-input.json, chart.json, interpretation.json, synastry.json\n');
  process.stdout.write(`  requestId ${bundle.requestId} · providers: ${providers}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`${String(err)}\n`);
  process.exit(1);
});
