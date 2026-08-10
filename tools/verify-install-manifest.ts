import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertDistinctReleaseTags,
  CANDIDATE_DIR,
  CANDIDATE_ENGINE_VERSION,
  CANDIDATE_RELEASE_TAG,
  CANDIDATE_RELEASE_VERSION,
  HOSTS,
  PUBLISHED_RELEASE_TAG,
  PUBLISHED_RELEASE_VERSION,
  REPO_URL,
  ROOT_ENGINE_VERSION,
} from './lib/host-config.ts';

/**
 * Verify the install entry point and the candidate/publication boundary offline.
 *
 * The committed root can be in one of two honest states:
 * - unpublished: no public host ZIP exists; release-asset hosts must not advertise a URL or hash;
 * - published: PUBLISHED_RELEASE_* names a real immutable Release and every asset is addressable.
 *
 * Candidate packages always live only under the ignored `releases/<CANDIDATE_DIR>/` directory with
 * `published:false`. This script never downloads a release or treats a locally built candidate as
 * published.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const candidateDir = join(root, 'releases', CANDIDATE_DIR);

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

type Json = Record<string, unknown>;

const checks: Check[] = [];
const add = (name: string, ok: boolean, detail?: string): void => {
  checks.push(detail === undefined ? { name, ok } : { name, ok, detail });
};
const read = (path: string): string | null =>
  existsSync(path) ? readFileSync(path, 'utf8') : null;
const parse = (text: string | null): Json | null => {
  if (text === null) return null;
  try {
    return JSON.parse(text) as Json;
  } catch {
    return null;
  }
};
const platformsOf = (manifest: Json): Json[] =>
  Array.isArray(manifest.platforms) ? (manifest.platforms as Json[]) : [];
const has = (value: Json, key: string): boolean => Object.hasOwn(value, key);

function isUtf8NoBom(path: string): boolean {
  if (!existsSync(path)) return false;
  const bytes = readFileSync(path);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return false;
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function checkInstallMd(): void {
  const install = read(join(root, 'INSTALL.md'));
  add('INSTALL.md exists', install !== null);
  if (!install) return;
  add(
    'INSTALL.md has the raw entry point',
    /raw\.githubusercontent\.com\/Jowitt13\/ming-engine\/main\/INSTALL\.md/.test(install),
  );
  add('INSTALL.md reads install-manifest.json', install.includes('install-manifest.json'));
  add(
    'INSTALL.md rejects SHA-256 mismatches',
    /SHA-?256/.test(install) && install.includes('拒绝安装'),
  );
  add('INSTALL.md does not force an unknown platform', install.includes('平台未知'));
  add('INSTALL.md gives a one-step failure repair', install.includes('一步修复动作'));
  add(
    'INSTALL.md stops for unpublished/404 assets',
    install.includes('尚未发布') && (install.includes('404') || install.includes('unpublished')),
  );
  add(
    'INSTALL.md has update and uninstall prompts',
    install.includes('帮我更新 Ming Engine') && install.includes('帮我卸载 Ming Engine'),
  );
  add(
    'INSTALL.md limits downloads to this repository',
    install.includes('github.com/Jowitt13/ming-engine') && install.includes('第三方'),
  );
  add(
    'INSTALL.md does not claim Node is unnecessary',
    !/不需要.{0,6}(安装\s*)?Node/.test(install) && !/无需.{0,6}Node/.test(install),
  );
}

function checkRootPlatformBasics(platforms: Json[]): void {
  add(
    'root manifest covers every host',
    platforms.length === HOSTS.length,
    String(platforms.length),
  );
  for (const host of HOSTS) {
    const platform = platforms.find((item) => item.host === host.id);
    add(`[${host.id}] root platform exists`, platform !== undefined);
    if (!platform) continue;
    add(`[${host.id}] capability matches host config`, platform.capability === host.capability);
    add(`[${host.id}] packageName matches host config`, platform.packageName === host.packageName);
    add(
      `[${host.id}] installer points to its host document`,
      platform.installer === `docs/installers/${host.id}.md`,
    );
  }
}

function checkRootUnpublished(manifest: Json, platforms: Json[]): void {
  add(
    'root manifest status=unpublished',
    manifest.status === 'unpublished',
    String(manifest.status),
  );
  add(
    'root manifest releaseVersion=null',
    manifest.releaseVersion === null,
    String(manifest.releaseVersion),
  );
  add('root manifest releaseTag=null', manifest.releaseTag === null, String(manifest.releaseTag));
  add(
    'root SHA256SUMS.txt is absent without public assets',
    !existsSync(join(root, 'SHA256SUMS.txt')),
  );

  for (const host of HOSTS) {
    const platform = platforms.find((item) => item.host === host.id);
    if (!platform) continue;
    if (!host.releaseAsset) {
      add(`[${host.id}] source entry remains available`, platform.published === true);
      add(`[${host.id}] source entry uses repository URL`, platform.downloadUrl === REPO_URL);
      continue;
    }

    add(`[${host.id}] no public asset is advertised`, platform.published === false);
    add(
      `[${host.id}] release asset name is retained for a future release`,
      platform.releaseAsset === host.releaseAsset,
    );
    add(`[${host.id}] no stale download URL is retained`, !has(platform, 'downloadUrl'));
    add(`[${host.id}] no stale SHA-256 is retained`, !has(platform, 'sha256'));
    add(
      `[${host.id}] no deleted release path is retained`,
      !JSON.stringify(platform).includes('/releases/download/'),
    );
  }
}

function checkRootPublished(manifest: Json, platforms: Json[]): void {
  add('published version model is complete', PUBLISHED_RELEASE_VERSION !== null);
  add('root manifest status=published', manifest.status === 'published', String(manifest.status));
  add(
    `root manifest releaseVersion=${PUBLISHED_RELEASE_VERSION}`,
    manifest.releaseVersion === PUBLISHED_RELEASE_VERSION,
    String(manifest.releaseVersion),
  );
  add(
    `root manifest releaseTag=${PUBLISHED_RELEASE_TAG}`,
    manifest.releaseTag === PUBLISHED_RELEASE_TAG,
    String(manifest.releaseTag),
  );
  add('root SHA256SUMS.txt exists for published assets', existsSync(join(root, 'SHA256SUMS.txt')));

  for (const host of HOSTS) {
    const platform = platforms.find((item) => item.host === host.id);
    if (!platform) continue;
    if (!host.releaseAsset) {
      add(`[${host.id}] source entry remains available`, platform.published === true);
      add(`[${host.id}] source entry uses repository URL`, platform.downloadUrl === REPO_URL);
      continue;
    }

    const url = String(platform.downloadUrl ?? '');
    add(`[${host.id}] public asset is marked published`, platform.published === true);
    add(
      `[${host.id}] release asset name matches host config`,
      platform.releaseAsset === host.releaseAsset,
    );
    add(
      `[${host.id}] asset URL uses immutable published tag`,
      url.includes(`/releases/download/${PUBLISHED_RELEASE_TAG}/`) &&
        !url.includes('latest/download'),
      url,
    );
    add(`[${host.id}] asset has a SHA-256`, /^[0-9a-f]{64}$/.test(String(platform.sha256 ?? '')));
  }
}

function checkRoot(): void {
  const manifest = parse(read(join(root, 'install-manifest.json')));
  add('root install-manifest.json exists and is valid JSON', manifest !== null);
  if (!manifest) return;

  const publishedConfigIsComplete =
    (PUBLISHED_RELEASE_TAG === null) === (PUBLISHED_RELEASE_VERSION === null);
  add('published release constants are both set or both null', publishedConfigIsComplete);
  const canonical = manifest.canonicalEngine as Json | undefined;
  add(
    `root canonicalEngine.version=${ROOT_ENGINE_VERSION}`,
    canonical?.version === ROOT_ENGINE_VERSION,
    String(canonical?.version),
  );

  const platforms = platformsOf(manifest);
  checkRootPlatformBasics(platforms);
  if (PUBLISHED_RELEASE_TAG === null) {
    checkRootUnpublished(manifest, platforms);
  } else {
    checkRootPublished(manifest, platforms);
  }

  const urls = platforms.map((platform) => String(platform.downloadUrl ?? ''));
  add(
    'root manifest does not use latest/download',
    urls.every((url) => !url.includes('latest/download')),
  );
}

function checkCandidate(): void {
  const manifest = parse(read(join(candidateDir, 'install-manifest.json')));
  add(`candidate ${CANDIDATE_DIR}/install-manifest.json exists`, manifest !== null);
  if (!manifest) return;
  add(
    'candidate engineVersion matches CANDIDATE_ENGINE_VERSION',
    manifest.engineVersion === CANDIDATE_ENGINE_VERSION,
    String(manifest.engineVersion),
  );
  add(
    'candidate releaseVersion matches CANDIDATE_RELEASE_VERSION',
    manifest.releaseVersion === CANDIDATE_RELEASE_VERSION,
    String(manifest.releaseVersion),
  );
  add(
    'candidate releaseTag matches CANDIDATE_RELEASE_TAG',
    manifest.releaseTag === CANDIDATE_RELEASE_TAG,
    String(manifest.releaseTag),
  );
  add('candidate status=unpublished', manifest.status === 'unpublished', String(manifest.status));

  const enginePath = join(root, 'skills', 'xuan-ji-yu-heng', 'scripts', 'dist', 'engine.mjs');
  const canonical = manifest.canonicalEngine as Json | undefined;
  if (existsSync(enginePath)) {
    const sha = createHash('sha256').update(readFileSync(enginePath)).digest('hex');
    add(
      'candidate canonicalEngine.engineSha256 equals engine.mjs',
      canonical?.engineSha256 === sha,
    );
  }

  const sums = new Map<string, string>();
  for (const line of (read(join(candidateDir, 'SHA256SUMS.txt')) ?? '').split(/\r?\n/)) {
    const match = line.match(/^([0-9a-f]{64})\s+(.+)$/);
    if (match) sums.set(match[2]!.trim(), match[1]!);
  }

  const platforms = platformsOf(manifest);
  add('candidate covers every host', platforms.length === HOSTS.length, String(platforms.length));
  for (const host of HOSTS) {
    const platform = platforms.find((item) => item.host === host.id);
    add(`[${host.id}] candidate platform exists`, platform !== undefined);
    if (!platform) continue;
    add(`[${host.id}] candidate capability matches`, platform.capability === host.capability);
    add(`[${host.id}] candidate packageName matches`, platform.packageName === host.packageName);
    add(
      `[${host.id}] candidate installer points to its host document`,
      platform.installer === `docs/installers/${host.id}.md`,
    );
    const url = String(platform.downloadUrl ?? '');
    add(`[${host.id}] candidate URL belongs to this repository`, url.startsWith(REPO_URL));
    if (!host.releaseAsset) {
      add(`[${host.id}] candidate source entry is available`, platform.published === true);
      continue;
    }

    add(`[${host.id}] candidate is not published`, platform.published === false);
    add(
      `[${host.id}] candidate URL uses immutable candidate tag`,
      url.includes(`/releases/download/${CANDIDATE_RELEASE_TAG}/`) &&
        !url.includes('latest/download'),
      url,
    );
    const zipPath = join(candidateDir, host.id, host.releaseAsset);
    if (!existsSync(zipPath)) {
      add(`[${host.id}] candidate ZIP exists (${host.releaseAsset})`, false);
      continue;
    }
    const zipSha = createHash('sha256').update(readFileSync(zipPath)).digest('hex');
    add(
      `[${host.id}] candidate sha256 equals built ZIP`,
      platform.sha256 === zipSha,
      String(platform.sha256),
    );
    add(
      `[${host.id}] candidate SHA256SUMS line equals ZIP`,
      sums.get(host.releaseAsset) === zipSha,
    );
  }
}

function checkInstallers(): void {
  for (const host of HOSTS) {
    const path = join(root, 'docs', 'installers', `${host.id}.md`);
    const text = read(path);
    add(`docs/installers/${host.id}.md exists`, text !== null);
    if (!text) continue;
    if (host.id === 'qoder') {
      add(
        'qoder installer does not require a user CLI',
        !/pnpm install|请打开终端|请在终端/.test(text),
      );
      add('qoder installer is agent-operated', text.includes('自动') && /Skills|技能/.test(text));
    }
    if (host.id === 'workbuddy') {
      add(
        'workbuddy installer supports native import',
        /导入|上传/.test(text) && text.includes('ming-engine-workbuddy.zip'),
      );
    }
    if (host.id === 'doubao') {
      add(
        'doubao installer supports native import',
        /导入|上传/.test(text) && text.includes('ming-engine-doubao.zip'),
      );
    }
  }
}

function checkVersionModel(): void {
  const distinct = assertDistinctReleaseTags();
  add('version model keeps candidate distinct from a published tag', distinct.ok, distinct.error);
}

function main(): void {
  checkVersionModel();
  checkInstallMd();
  checkRoot();
  checkCandidate();
  checkInstallers();

  const utf8Files = [
    join(root, 'INSTALL.md'),
    join(root, 'install-manifest.json'),
    ...HOSTS.map((host) => join(root, 'docs', 'installers', `${host.id}.md`)),
  ];
  const sums = join(root, 'SHA256SUMS.txt');
  if (existsSync(sums)) utf8Files.push(sums);
  for (const file of utf8Files) {
    add(`UTF-8 no BOM: ${file.replace(root, '').replace(/\\/g, '/')}`, isUtf8NoBom(file));
  }

  const failed = checks.filter((check) => !check.ok);
  for (const check of checks) {
    process.stdout.write(
      `[${check.ok ? 'PASS' : 'FAIL'}] ${check.name}${check.detail ? ` (${check.detail})` : ''}\n`,
    );
  }
  process.stdout.write(
    `\n${checks.length - failed.length}/${checks.length} install-entry checks passed.\n`,
  );
  if (failed.length > 0) process.exit(1);
}

try {
  main();
} catch (err: unknown) {
  process.stderr.write(`${String(err)}\n`);
  process.exit(1);
}
