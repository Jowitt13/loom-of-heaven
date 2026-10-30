import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildZip, collectFiles, verifyZip } from './lib/zip.ts';

/**
 * Package the published Skill into a distributable install bundle (handoff Phase 4:
 * "本地 Skill 安装包"). Stages a clean copy of `skills/xuan-ji-yu-heng` (no
 * scratch output), writes a SHA-256 manifest for integrity, and produces a
 * dependency-free ZIP archive via the shared `lib/zip.ts` writer (which also
 * re-parses and fully decompresses the archive to prove it round-trips).
 *
 * Outputs (all under `dist/`, gitignored):
 *   dist/xuan-ji-yu-heng/            staged publishable folder
 *   dist/xuan-ji-yu-heng.zip         install archive
 *   dist/xuan-ji-yu-heng.sha256      "<hex>  <path>" integrity manifest
 *
 * Requires `pnpm run build` first (the staged folder must contain dist/engine.mjs).
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const srcSkill = join(root, 'skills', 'xuan-ji-yu-heng');
const distDir = join(root, 'dist');
const PKG_NAME = 'xuan-ji-yu-heng';

/**
 * Stage and package one Skill source directory into `outDir`. Parameterized on
 * srcSkillDir/outDir/pkgName so the packaging regression test exercises the SAME
 * path as the script run. Local runtime data (`.mimosa`) and scratch output
 * (`.tmp`) are never staged into the bundle, at any depth. Returns the packaged
 * file count; exits non-zero on a missing engine bundle or failed zip verification.
 */
export function packageSkill(srcSkillDir: string, outDir: string, pkgName: string): number {
  if (!existsSync(join(srcSkillDir, 'scripts', 'dist', 'engine.mjs'))) {
    process.stderr.write('Engine bundle missing in the Skill. Run `pnpm run build` first.\n');
    process.exit(1);
  }

  // Stage a clean copy of the published Skill (drop scratch output and local
  // Mimosa runtime data at any depth).
  const stageDir = join(outDir, pkgName);
  rmSync(stageDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  cpSync(srcSkillDir, stageDir, {
    recursive: true,
    filter: (src) => !/[\\/]\.(?:tmp|mimosa)([\\/]|$)/.test(src),
  });

  const files = collectFiles(stageDir, outDir).map((f) => ({
    name: `${pkgName}/${f.name}`,
    data: f.data,
  }));

  // SHA-256 integrity manifest (sha256sum-compatible "<hex>  <path>").
  const manifest = files
    .map((f) => `${createHash('sha256').update(f.data).digest('hex')}  ${f.name}`)
    .join('\n');
  const manifestPath = join(outDir, `${pkgName}.sha256`);
  writeFileSync(manifestPath, `${manifest}\n`, 'utf8');

  // ZIP archive + in-process round-trip verification.
  const zip = buildZip(files);
  const zipPath = join(outDir, `${pkgName}.zip`);
  writeFileSync(zipPath, zip);
  const ok = verifyZip(zip, files);

  const totalUncompressed = files.reduce((sum, f) => sum + f.data.length, 0);
  process.stdout.write(`Staged ${files.length} files into ${pkgName}/\n`);
  process.stdout.write(`  manifest: ${pkgName}.sha256 (${files.length} entries)\n`);
  process.stdout.write(
    `  archive: ${pkgName}.zip (${zip.length} bytes; ${totalUncompressed} bytes uncompressed)\n`,
  );
  process.stdout.write(`  zip self-verify (re-parse + full decompress): ${ok ? 'PASS' : 'FAIL'}\n`);
  if (!ok) process.exit(1);
  return files.length;
}

// Only run the real packaging when invoked as a script; importing (e.g. from the
// packaging regression test) exposes packageSkill WITHOUT triggering a build.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    packageSkill(srcSkill, distDir, PKG_NAME);
  } catch (err: unknown) {
    process.stderr.write(`${String(err)}\n`);
    process.exit(1);
  }
}
