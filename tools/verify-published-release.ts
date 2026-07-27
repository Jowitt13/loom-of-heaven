import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLISHED_RELEASE_TAG, SKILL_NAME } from './lib/host-config.ts';
import {
  assertSingleTopDir,
  extractZip,
  isTextEntry,
  listZipEntries,
  normalizeZipEntryData,
  readZipFileSafe,
} from './lib/zip.ts';

/**
 * Post-release READ-ONLY verifier for a PUBLISHED GitHub Release (NOT part of the offline
 * verify:all). Downloads the assets for a tag and checks, honestly:
 *   INTEGRITY   — each zip's SHA-256 matches the release SHA256SUMS.txt; every zip has a
 *                 single top-level `calculate-birth-charts/` dir with no double-nesting; the
 *                 engine.mjs is identical across all zips (and, when the tag is the current
 *                 published release, matches the committed root install-manifest.json engineSha256).
 *   REPRODUCIBLE — every shipped text file already equals its LF-normalized form. If a file
 *                 (e.g. LICENSE) still carries CRLF, that is reported as a KNOWN LINE-ENDING
 *                 LEGACY and the run does NOT claim reproducibility (v0.1.1 predates the LF fix).
 *
 * Exit codes: 0 = integrity OK + fully LF-reproducible; 2 = integrity OK but line-ending
 * legacy present (honest, not a pass); 1 = integrity failure or download error.
 *
 * Usage: node tools/verify-published-release.ts --tag v0.1.1
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

function fail(msg: string): never {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
}

function main(): void {
  const tagIdx = process.argv.indexOf('--tag');
  const tag = tagIdx >= 0 ? process.argv[tagIdx + 1] : undefined;
  if (!tag) fail('Usage: node tools/verify-published-release.ts --tag <vX.Y.Z>');

  const tmp = mkdtempSync(join(tmpdir(), `ming-published-${tag}-`));
  try {
    const dl = spawnSync('gh', ['release', 'download', tag, '--dir', tmp], { encoding: 'utf8' });
    if (dl.status !== 0) {
      fail(`gh release download ${tag} failed (need gh auth + network):\n${dl.stderr ?? ''}`);
    }

    const sumsPath = join(tmp, 'SHA256SUMS.txt');
    if (!existsSync(sumsPath)) fail(`Release ${tag} has no SHA256SUMS.txt asset.`);
    const sums = new Map<string, string>();
    for (const line of readFileSync(sumsPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([0-9a-f]{64})\s+(.+)$/);
      if (m) sums.set(m[2]!.trim(), m[1]!);
    }

    const zips = readdirSync(tmp).filter((f) => f.endsWith('.zip'));
    if (zips.length === 0) fail(`Release ${tag} has no .zip assets.`);

    const integrity: { name: string; ok: boolean; detail?: string }[] = [];
    const legacyFiles: string[] = [];
    const engineHashes = new Set<string>();
    const enginePathInZip = `${SKILL_NAME}/scripts/dist/engine.mjs`;

    for (const zipName of zips.sort()) {
      const buf = readZipFileSafe(join(tmp, zipName));
      const sha = createHash('sha256').update(buf).digest('hex');
      integrity.push({
        name: `${zipName} SHA-256 == SHA256SUMS.txt`,
        ok: sums.get(zipName) === sha,
        detail: sums.has(zipName) ? undefined : 'missing in SHA256SUMS.txt',
      });

      const entries = listZipEntries(buf);
      const struct = assertSingleTopDir(entries, SKILL_NAME);
      integrity.push({
        name: `${zipName} single top dir, no double-nest`,
        ok: struct.ok,
        detail: struct.error,
      });

      const outDir = join(tmp, `x-${zipName}`);
      extractZip(buf, outDir);
      // Engine hash for this zip.
      const enginePath = join(outDir, ...enginePathInZip.split('/'));
      if (existsSync(enginePath)) {
        engineHashes.add(createHash('sha256').update(readFileSync(enginePath)).digest('hex'));
      } else {
        integrity.push({ name: `${zipName} ships ${enginePathInZip}`, ok: false });
      }
      // Reproducibility: any shipped text file that is not already LF-normalized is legacy.
      collectLegacy(outDir, outDir, legacyFiles, zipName);
    }

    integrity.push({
      name: '所有 zip 的 engine.mjs 相同',
      ok: engineHashes.size === 1,
      detail: `${engineHashes.size} distinct`,
    });

    // When verifying the currently published tag, cross-check its engine hash against the root manifest.
    if (PUBLISHED_RELEASE_TAG !== null && tag === PUBLISHED_RELEASE_TAG) {
      const rootManifest = join(root, 'install-manifest.json');
      if (existsSync(rootManifest)) {
        const m = JSON.parse(readFileSync(rootManifest, 'utf8')) as {
          canonicalEngine?: { engineSha256?: string };
        };
        const declared = m.canonicalEngine?.engineSha256;
        const only = [...engineHashes][0];
        integrity.push({
          name: '根清单 canonicalEngine.engineSha256 == 发布 engine',
          ok: declared !== undefined && declared === only,
          detail: declared,
        });
      }
    }

    const integrityFailed = integrity.filter((c) => !c.ok);
    process.stdout.write(
      `Published release ${tag} — downloaded ${zips.length} zip(s)\n\n[INTEGRITY]\n`,
    );
    for (const c of integrity) {
      process.stdout.write(
        `[${c.ok ? 'PASS' : 'FAIL'}] ${c.name}${c.detail ? ` (${c.detail})` : ''}\n`,
      );
    }

    process.stdout.write('\n[REPRODUCIBILITY: shipped text files already LF-normalized]\n');
    if (legacyFiles.length === 0) {
      process.stdout.write(
        '[PASS] every shipped text file is byte-identical to its LF-normalized form.\n',
      );
    } else {
      process.stdout.write(
        `[LEGACY] ${legacyFiles.length} shipped text file(s) still carry CR/CRLF (NOT byte-reproducible under LF normalization):\n`,
      );
      for (const f of legacyFiles.sort()) process.stdout.write(`   - ${f}\n`);
    }

    if (integrityFailed.length > 0) {
      process.stdout.write(`\nRESULT: INTEGRITY FAILED (${integrityFailed.length}).\n`);
      process.exit(1);
    }
    if (legacyFiles.length > 0) {
      process.stdout.write(
        `\nRESULT: integrity OK, but ${tag} has a KNOWN line-ending legacy (not byte-reproducible). ` +
          'Reported honestly; NOT counted as a pass. Fixed for releases built with LF normalization.\n',
      );
      process.exit(2);
    }
    process.stdout.write(`\nRESULT: ${tag} integrity OK and fully LF-reproducible.\n`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** Record extracted text files whose raw bytes differ from their LF-normalized form. */
function collectLegacy(baseDir: string, dir: string, out: string[], zipName: string): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) {
      collectLegacy(baseDir, abs, out, zipName);
    } else if (e.isFile() && isTextEntry(e.name)) {
      const data = readFileSync(abs);
      if (!normalizeZipEntryData(e.name, data).equals(data)) {
        out.push(`${zipName}:${relative(baseDir, abs).replace(/\\/g, '/')}`);
      }
    }
  }
}

main();
