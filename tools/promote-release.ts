import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANDIDATE_DIR, CANDIDATE_RELEASE_TAG } from './lib/host-config.ts';

/**
 * EXPLICIT stable-manifest promotion. This is the ONLY tool allowed to overwrite the
 * committed root `install-manifest.json` / `SHA256SUMS.txt`. It is deliberately NOT part
 * of `verify:all` and must be run by hand ONLY AFTER a real GitHub Release for CANDIDATE_RELEASE_TAG
 * has been created, its assets uploaded, and the download hashes re-verified.
 *
 * It reads the gitignored candidate manifest (releases/<CANDIDATE_DIR>/install-manifest.json,
 * `status:"unpublished"` / per-asset `published:false`) and writes the ROOT manifest in the
 * PUBLISHED state: `status:"published"`, every release-asset `published:true`, and a published
 * statusNote. The candidate per-asset sha256 (already re-verified against the live download)
 * is carried over unchanged, so the root manifest points at exactly the uploaded assets. The
 * candidate SHA256SUMS.txt is copied verbatim. In the same reviewed change, update
 * PUBLISHED_RELEASE_VERSION / PUBLISHED_RELEASE_TAG in host-config.ts before re-running the
 * install verifier.
 *
 * Promoting WITHOUT `--confirm-published` refuses to run, so an unpublished candidate can
 * never be silently passed off as the live stable manifest.
 *
 * Usage: node tools/promote-release.ts --confirm-published
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const candidateDir = join(root, 'releases', CANDIDATE_DIR);

interface Platform {
  downloadType?: string;
  published?: boolean;
  [k: string]: unknown;
}
interface Manifest {
  status?: string;
  statusNote?: string;
  releaseTag?: string;
  platforms?: Platform[];
  [k: string]: unknown;
}

function main(): void {
  const confirmed = process.argv.includes('--confirm-published');
  const candManifest = join(candidateDir, 'install-manifest.json');
  const candSums = join(candidateDir, 'SHA256SUMS.txt');

  if (!existsSync(candManifest) || !existsSync(candSums)) {
    process.stderr.write(
      `Candidate build missing at ${candidateDir}. Run \`pnpm run package:hosts\` first.\n`,
    );
    process.exit(1);
  }
  if (!confirmed) {
    process.stderr.write(
      'Refusing to promote: pass --confirm-published ONLY after the real GitHub Release ' +
        `${CANDIDATE_RELEASE_TAG} is created, assets uploaded, and download hashes re-verified.\n` +
        'This step overwrites the live root install-manifest.json / SHA256SUMS.txt.\n',
    );
    process.exit(2);
  }

  const manifest = JSON.parse(readFileSync(candManifest, 'utf8')) as Manifest;
  if (manifest.releaseTag !== CANDIDATE_RELEASE_TAG) {
    process.stderr.write(
      `Candidate releaseTag ${String(manifest.releaseTag)} != ${CANDIDATE_RELEASE_TAG}; refuse to promote.\n`,
    );
    process.exit(1);
  }

  // Flip candidate -> published stable.
  manifest.status = 'published';
  manifest.statusNote =
    `GitHub Release ${CANDIDATE_RELEASE_TAG} 已发布。release-asset ZIP 必须从 downloadUrl 下载，` +
    '并核对 SHA-256 与本清单及 SHA256SUMS.txt 一致。';
  for (const p of manifest.platforms ?? []) {
    if (p.downloadType === 'release-asset') p.published = true;
  }

  writeFileSync(
    join(root, 'install-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  copyFileSync(candSums, join(root, 'SHA256SUMS.txt'));
  process.stdout.write(
    `Promoted candidate ${CANDIDATE_RELEASE_TAG} -> root install-manifest.json (status:published) + SHA256SUMS.txt.\n` +
      'Re-run verify:install / verify:all before committing.\n',
  );
}

main();
