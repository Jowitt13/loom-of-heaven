import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildZip, collectFiles, verifyZip } from './lib/zip.ts';

/**
 * Package the published Skill into a distributable install bundle (handoff Phase 4:
 * "本地 Skill 安装包"). Stages a clean copy of `skills/calculate-birth-charts` (no
 * scratch output), writes a SHA-256 manifest for integrity, and produces a
 * dependency-free ZIP archive via the shared `lib/zip.ts` writer (which also
 * re-parses and fully decompresses the archive to prove it round-trips).
 *
 * Outputs (all under `dist/`, gitignored):
 *   dist/calculate-birth-charts/            staged publishable folder
 *   dist/calculate-birth-charts.zip         install archive
 *   dist/calculate-birth-charts.sha256      "<hex>  <path>" integrity manifest
 *
 * Requires `pnpm run build` first (the staged folder must contain dist/engine.mjs).
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const srcSkill = join(root, 'skills', 'calculate-birth-charts');
const distDir = join(root, 'dist');
const stageDir = join(distDir, 'calculate-birth-charts');
const PKG_NAME = 'calculate-birth-charts';

function main(): void {
  if (!existsSync(join(srcSkill, 'scripts', 'dist', 'engine.mjs'))) {
    process.stderr.write('Engine bundle missing in the Skill. Run `pnpm run build` first.\n');
    process.exit(1);
  }

  // Stage a clean copy of the published Skill (drop scratch output).
  rmSync(stageDir, { recursive: true, force: true });
  mkdirSync(distDir, { recursive: true });
  cpSync(srcSkill, stageDir, {
    recursive: true,
    filter: (src) => !/[\\/]\.tmp([\\/]|$)/.test(src),
  });

  const files = collectFiles(stageDir, distDir).map((f) => ({
    name: `${PKG_NAME}/${f.name}`,
    data: f.data,
  }));

  // SHA-256 integrity manifest (sha256sum-compatible "<hex>  <path>").
  const manifest = files
    .map((f) => `${createHash('sha256').update(f.data).digest('hex')}  ${f.name}`)
    .join('\n');
  const manifestPath = join(distDir, `${PKG_NAME}.sha256`);
  writeFileSync(manifestPath, `${manifest}\n`, 'utf8');

  // ZIP archive + in-process round-trip verification.
  const zip = buildZip(files);
  const zipPath = join(distDir, `${PKG_NAME}.zip`);
  writeFileSync(zipPath, zip);
  const ok = verifyZip(zip, files);

  const totalUncompressed = files.reduce((sum, f) => sum + f.data.length, 0);
  process.stdout.write(`Staged ${files.length} files into dist/${PKG_NAME}/\n`);
  process.stdout.write(`  manifest: dist/${PKG_NAME}.sha256 (${files.length} entries)\n`);
  process.stdout.write(
    `  archive:  dist/${PKG_NAME}.zip (${zip.length} bytes; ${totalUncompressed} bytes uncompressed)\n`,
  );
  process.stdout.write(`  zip self-verify (re-parse + full decompress): ${ok ? 'PASS' : 'FAIL'}\n`);
  if (!ok) process.exit(1);
}

try {
  main();
} catch (err: unknown) {
  process.stderr.write(`${String(err)}\n`);
  process.exit(1);
}
