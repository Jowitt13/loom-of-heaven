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
  REPO_URL,
  STABLE_ENGINE_VERSION,
  STABLE_RELEASE_TAG,
} from './lib/host-config.ts';

/**
 * Verify the install entry point AND the candidate/stable boundary (offline, deterministic).
 *
 * STABLE: the committed root `install-manifest.json` / `SHA256SUMS.txt` must stay FROZEN at
 * the live published release (STABLE_RELEASE_TAG), and must NOT have been clobbered by the
 * candidate build (its releaseTag must differ from the candidate RELEASE_TAG).
 *
 * CANDIDATE: `releases/<CANDIDATE_DIR>/install-manifest.json` must be `status:unpublished`,
 * every release-asset `published:false`, use the immutable candidate tag (never
 * latest/download), and its per-asset sha256 must match the built candidate zip + SHA256SUMS.
 *
 * Also checks INSTALL.md protocol + per-host installer docs + UTF-8 (no BOM). Exits non-zero
 * on any failure. Requires `pnpm run package:hosts` first (for the candidate).
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const candidateDir = join(root, 'releases', CANDIDATE_DIR);

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}
const checks: Check[] = [];
const add = (name: string, ok: boolean, detail?: string): void => {
  checks.push(detail === undefined ? { name, ok } : { name, ok, detail });
};
const read = (p: string): string | null => (existsSync(p) ? readFileSync(p, 'utf8') : null);
const parse = (s: string | null): Record<string, unknown> | null => {
  if (s === null) return null;
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return null;
  }
};

function isUtf8NoBom(path: string): boolean {
  if (!existsSync(path)) return false;
  const b = readFileSync(path);
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(b);
    return true;
  } catch {
    return false;
  }
}

function checkInstallMd(): void {
  const install = read(join(root, 'INSTALL.md'));
  add('INSTALL.md exists', install !== null);
  if (!install) return;
  const missing = ['跨平台', '自动安装入口', 'Codex', 'Qoder', 'WorkBuddy', '豆包', '误称'].filter(
    (n) => !install.includes(n),
  );
  add('INSTALL.md 首屏含四平台识别 + 不得误称 Lite', missing.length === 0, missing.join(','));
  add(
    'INSTALL.md 含一句话安装入口(raw URL)',
    /raw\.githubusercontent\.com\/Jowitt13\/ming-engine\/main\/INSTALL\.md/.test(install),
  );
  add('INSTALL.md 指示读取 install-manifest.json', install.includes('install-manifest.json'));
  add(
    'INSTALL.md 含 SHA-256 不一致→拒绝安装',
    /SHA-?256/.test(install) && install.includes('拒绝安装'),
  );
  add(
    'INSTALL.md 含平台未知→不强行安装',
    install.includes('平台未知') || install.includes('不强行安装'),
  );
  add('INSTALL.md 含失败→一步修复动作', install.includes('一步修复'));
  add(
    'INSTALL.md 含未发布/404→不硬装不伪造',
    install.includes('尚未发布') && (install.includes('404') || install.includes('unpublished')),
  );
  add(
    'INSTALL.md 含更新/卸载一句话触发',
    install.includes('帮我更新 Ming Engine') && install.includes('帮我卸载 Ming Engine'),
  );
  add(
    'INSTALL.md 声明只认本仓库来源',
    install.includes('github.com/Jowitt13/ming-engine') && install.includes('第三方'),
  );
  // Node runtime accuracy: must NOT claim the user needs no Node.
  add(
    'INSTALL.md 不声称“不需要 Node”',
    !/不需要.{0,6}(安装\s*)?Node/.test(install) && !/无需.{0,6}Node/.test(install),
  );
}

function checkStable(): void {
  const m = parse(read(join(root, 'install-manifest.json')));
  add('根 install-manifest.json 存在且合法 JSON', m !== null);
  if (!m) return;
  add('根清单 status=published(线上稳定)', m.status === 'published', String(m.status));
  add(`根清单 releaseTag=${STABLE_RELEASE_TAG}(线上稳定发布)`, m.releaseTag === STABLE_RELEASE_TAG);
  add(
    `根清单未被候选覆盖(releaseTag ≠ ${CANDIDATE_RELEASE_TAG})`,
    m.releaseTag !== CANDIDATE_RELEASE_TAG,
    String(m.releaseTag),
  );
  const stableEng = m.canonicalEngine as { version?: string } | undefined;
  add(
    `根清单 canonicalEngine.version=${STABLE_ENGINE_VERSION}(稳定引擎)`,
    stableEng?.version === STABLE_ENGINE_VERSION,
    String(stableEng?.version),
  );
  const stablePlatforms = Array.isArray(m.platforms)
    ? (m.platforms as Array<Record<string, unknown>>)
    : [];
  const unpublishedAsset = stablePlatforms.find(
    (p) => p.downloadType === 'release-asset' && p.published !== true,
  );
  add(
    '根清单为已发布态(release-asset 均 published=true,非候选被误提升)',
    unpublishedAsset === undefined,
    unpublishedAsset ? String(unpublishedAsset.host) : undefined,
  );
  const urls = Array.isArray(m.platforms)
    ? (m.platforms as Array<Record<string, unknown>>).map((p) => String(p.downloadUrl ?? ''))
    : [];
  add(
    '根清单无 latest/download',
    urls.every((u) => !u.includes('latest/download')),
  );
  add('根 SHA256SUMS.txt 存在', existsSync(join(root, 'SHA256SUMS.txt')));
}

function checkCandidate(): void {
  const m = parse(read(join(candidateDir, 'install-manifest.json')));
  add(`候选 ${CANDIDATE_DIR}/install-manifest.json 存在`, m !== null);
  if (!m) return;
  add(
    '候选 engineVersion 匹配 CANDIDATE_ENGINE_VERSION',
    m.engineVersion === CANDIDATE_ENGINE_VERSION,
    String(m.engineVersion),
  );
  add(
    '候选 releaseVersion 匹配 CANDIDATE_RELEASE_VERSION',
    m.releaseVersion === CANDIDATE_RELEASE_VERSION,
    String(m.releaseVersion),
  );
  add(
    '候选 releaseTag 匹配 CANDIDATE_RELEASE_TAG',
    m.releaseTag === CANDIDATE_RELEASE_TAG,
    String(m.releaseTag),
  );
  add('候选 status=unpublished', m.status === 'unpublished', String(m.status));

  const enginePath = join(
    root,
    'skills',
    'calculate-birth-charts',
    'scripts',
    'dist',
    'engine.mjs',
  );
  const eng = m.canonicalEngine as { engineSha256?: string } | undefined;
  if (existsSync(enginePath)) {
    const sha = createHash('sha256').update(readFileSync(enginePath)).digest('hex');
    add('候选 canonicalEngine.engineSha256 == engine.mjs', eng?.engineSha256 === sha);
  }

  const sums = new Map<string, string>();
  for (const line of (read(join(candidateDir, 'SHA256SUMS.txt')) ?? '').split(/\r?\n/)) {
    const mm = line.match(/^([0-9a-f]{64})\s+(.+)$/);
    if (mm) sums.set(mm[2]!.trim(), mm[1]!);
  }

  const platforms = Array.isArray(m.platforms)
    ? (m.platforms as Array<Record<string, unknown>>)
    : [];
  add('候选 platforms 覆盖全部宿主', platforms.length === HOSTS.length, `${platforms.length}`);
  for (const h of HOSTS) {
    const p = platforms.find((x) => x.host === h.id);
    add(`[${h.id}] 候选有该平台项`, p !== undefined);
    if (!p) continue;
    add(`[${h.id}] capability 一致`, p.capability === h.capability, String(p.capability));
    add(`[${h.id}] packageName 匹配`, p.packageName === h.packageName, String(p.packageName));
    add(`[${h.id}] installer 指向 docs/installers`, p.installer === `docs/installers/${h.id}.md`);
    const url = String(p.downloadUrl ?? '');
    add(
      `[${h.id}] downloadUrl 属本仓库`,
      url.startsWith(REPO_URL) ||
        url.startsWith('https://raw.githubusercontent.com/Jowitt13/ming-engine'),
      url,
    );
    if (h.releaseAsset) {
      add(`[${h.id}] 候选 published=false`, p.published === false, String(p.published));
      add(
        `[${h.id}] downloadUrl 用不可变候选 tag(非 latest)`,
        url.includes(`/releases/download/${CANDIDATE_RELEASE_TAG}/`) &&
          !url.includes('latest/download'),
        url,
      );
      const zipPath = join(candidateDir, h.id, h.releaseAsset);
      if (existsSync(zipPath)) {
        const zipSha = createHash('sha256').update(readFileSync(zipPath)).digest('hex');
        add(`[${h.id}] 候选 sha256 == 构建 zip`, p.sha256 === zipSha, String(p.sha256));
        add(`[${h.id}] 候选 SHA256SUMS 行匹配 zip`, sums.get(h.releaseAsset) === zipSha);
      } else {
        add(`[${h.id}] 候选 zip 存在(${h.releaseAsset})`, false);
      }
    } else {
      add(`[${h.id}] repo 平台 published=true`, p.published === true);
    }
  }
}

function checkInstallers(): void {
  for (const h of HOSTS) {
    const p = join(root, 'docs', 'installers', `${h.id}.md`);
    const text = read(p);
    add(`docs/installers/${h.id}.md exists`, text !== null);
    if (!text) continue;
    if (h.id === 'qoder') {
      add('qoder 安装器不要求用户敲终端命令', !/pnpm install|请打开终端|请在终端/.test(text));
      add('qoder 安装器为 AI 自动执行', text.includes('自动') && /Skills|技能/.test(text));
    }
    if (h.id === 'workbuddy') {
      add(
        'workbuddy 安装器优先原生导入',
        /导入|上传/.test(text) && text.includes('ming-engine-workbuddy.zip'),
      );
    }
    if (h.id === 'doubao') {
      add(
        'doubao 安装器为完整包原生导入',
        /导入|上传/.test(text) && text.includes('ming-engine-doubao.zip'),
      );
    }
  }
}

function checkVersionModel(): void {
  const distinct = assertDistinctReleaseTags();
  add('版本模型: candidate tag ≠ stable tag(同 tag 直接失败)', distinct.ok, distinct.error);
}

function main(): void {
  checkVersionModel();
  checkInstallMd();
  checkStable();
  checkCandidate();
  checkInstallers();

  // UTF-8 / no BOM for committed entry files (candidate is gitignored).
  const utf8Files = [
    join(root, 'INSTALL.md'),
    join(root, 'install-manifest.json'),
    join(root, 'SHA256SUMS.txt'),
    ...HOSTS.map((h) => join(root, 'docs', 'installers', `${h.id}.md`)),
  ];
  for (const f of utf8Files) {
    add(`UTF-8 no BOM: ${f.replace(root, '').replace(/\\/g, '/')}`, isUtf8NoBom(f));
  }

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) {
    process.stdout.write(
      `[${c.ok ? 'PASS' : 'FAIL'}] ${c.name}${c.detail ? ` (${c.detail})` : ''}\n`,
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
