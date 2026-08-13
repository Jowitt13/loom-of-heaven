import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  buildZip,
  collectFiles,
  normalizeZipEntryData,
  verifyZip,
  type FileEntry,
} from './lib/zip.ts';
import {
  PSYCHOLOGY_CANDIDATE_DIR,
  PSYCHOLOGY_CANDIDATE_TAG,
  PSYCHOLOGY_ENGINE_SELF_CHECK,
  PSYCHOLOGY_HOSTS,
  PSYCHOLOGY_PRODUCT,
  PSYCHOLOGY_RELEASE_VERSION,
  PSYCHOLOGY_REPO_URL,
  PSYCHOLOGY_SKILL_NAME,
  assertPsychologyCandidateBoundary,
  type PsychologyHostConfig,
} from './lib/psychology-host-config.ts';

/**
 * Build candidate host packages for the P9 personality Skill independently from the
 * chart-Skill release machinery. Outputs are strictly local, below ignored
 * `releases/<PSYCHOLOGY_CANDIDATE_DIR>/`, and never modify the root install manifest,
 * a tag, a Release, or a public download URL.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const source = join(root, 'skills', PSYCHOLOGY_SKILL_NAME);
const releasesDir = join(root, 'releases');

function excluded(sourceDir: string, path: string): boolean {
  const rel = relative(sourceDir, path).split(sep).join('/');
  return /(?:^|\/)\.tmp(?:\/|$)/.test(rel);
}

function installMd(host: PsychologyHostConfig): string {
  const pathHint =
    host.id === 'qoder'
      ? `~/.qoder/skills/${PSYCHOLOGY_SKILL_NAME}/`
      : host.id === 'workbuddy'
        ? `~/.workbuddy/skills/${PSYCHOLOGY_SKILL_NAME}/`
        : `${PSYCHOLOGY_SKILL_NAME}/`;
  const hostStep =
    host.id === 'qoder'
      ? '让 Qoder 内置 Agent 下载并校验此 ZIP，再写入你的个人 Skills 目录；普通用户不需要使用命令行。'
      : host.id === 'workbuddy'
        ? '在 WorkBuddy 的 Skills 管理中导入此 ZIP。'
        : host.id === 'doubao'
          ? '在豆包电脑版导入此 ZIP 或解压后的同名文件夹。'
          : '把单层文件夹导入或放入你的 Codex Skill 目录，再打开一个新任务。';

  return [
    `# ${host.label}：${PSYCHOLOGY_SKILL_NAME} 候选安装包`,
    '',
    `- 候选版本：${PSYCHOLOGY_RELEASE_VERSION}`,
    `- 预留发布 tag：\`${PSYCHOLOGY_CANDIDATE_TAG}\`（尚未创建、尚未发布）`,
    `- 运行环境：${host.runtime}`,
    `- 导入格式：${host.format}`,
    '',
    '> 这是本地发布候选，不是 GitHub Release，也不代表该宿主已经通过真机验收。不要把它当成公开下载链接或已发布版本。',
    '',
    '## 安装候选包',
    '',
    `1. 校验 ZIP 的 SHA-256 是否与候选目录 \`SHA256SUMS.txt\` 相同；不一致即停止。`,
    `2. 确认 ZIP 只有一层 \`${PSYCHOLOGY_SKILL_NAME}/\` 顶层目录；不要导入双层嵌套目录。`,
    `3. ${hostStep}`,
    `4. 如果需要写入目录，只能替换 \`${pathHint}\`；失败时保留旧包，不触碰其他 Skill。`,
    '5. 刷新宿主或新开任务，然后运行下面的无个人数据自检。',
    '',
    '## 无个人数据自检',
    '',
    `在 Skill 根目录运行 \`node scripts/psychology.mjs doctor\` 和 \`${PSYCHOLOGY_ENGINE_SELF_CHECK}\`。两者都应返回 \`ok: true\`；doctor 还应报告 \`clinicalInstrumentsAvailable: false\`。`,
    '',
    '## 真机验收的隐私规则',
    '',
    '- 只用合成回答跑一次 `start → answer → score → export → delete`；不要在聊天、截图或验收记录中放真实答题、题目文本、文件路径、账号或对话内容。',
    '- 录入任何回答前，先说明：聊天中的内容仍可能由宿主处理；更私密的做法是由用户在本地 JSON 文件中准备答案。',
    '- 本包只提供非临床、自愿人格自评；没有诊断、心理疾病筛查、常模百分位、图表映射或合盘能力。',
    '',
    '## 升级边界',
    '',
    '这是首个 P9 候选包，因此没有可迁移的已发布旧版，也不提供 `migrate` 命令。只有实际 P9 Release 出现后，后续版本才可在独立变更中定义并验证升级路径。',
    '',
  ].join('\n');
}

export interface PsychologyHostZip {
  host: PsychologyHostConfig;
  asset: string;
  files: FileEntry[];
  zip: Buffer;
  sha256: string;
  verified: boolean;
}

/** Parameterized so regression tests exercise the exact production packaging path. */
export function buildPsychologyHostZips(
  sourceSkillDir: string,
  stagingRoot: string,
): PsychologyHostZip[] {
  const sourceManifest = JSON.parse(
    readFileSync(join(sourceSkillDir, 'BUILD_MANIFEST.json'), 'utf8'),
  ) as Record<string, unknown>;
  const sourceEngine = join(sourceSkillDir, 'scripts', 'dist', 'psychology-engine.mjs');
  // Hash the exact normalized bytes that enter the ZIP, not a platform-specific checkout.
  const engineSha256 = createHash('sha256')
    .update(normalizeZipEntryData('scripts/dist/psychology-engine.mjs', readFileSync(sourceEngine)))
    .digest('hex');
  const out: PsychologyHostZip[] = [];

  for (const host of PSYCHOLOGY_HOSTS) {
    const hostDir = join(stagingRoot, host.id);
    const stage = join(hostDir, host.packageName);
    mkdirSync(hostDir, { recursive: true });
    cpSync(sourceSkillDir, stage, {
      recursive: true,
      filter: (path) => !excluded(sourceSkillDir, path),
    });

    writeFileSync(join(stage, 'INSTALL.md'), installMd(host), 'utf8');
    writeFileSync(
      join(stage, 'BUILD_MANIFEST.json'),
      `${JSON.stringify(
        {
          skill: PSYCHOLOGY_SKILL_NAME,
          product: PSYCHOLOGY_PRODUCT,
          releaseVersion: PSYCHOLOGY_RELEASE_VERSION,
          releaseTag: PSYCHOLOGY_CANDIDATE_TAG,
          status: 'candidate',
          published: false,
          host: host.id,
          hostLabel: host.label,
          runtime: host.runtime,
          engine: {
            file: 'scripts/dist/psychology-engine.mjs',
            sha256: engineSha256,
          },
          capabilities: sourceManifest.capabilities,
          exclusions: sourceManifest.exclusions,
          sourceManifest: 'source BUILD_MANIFEST.json had status=unpublished',
          realDeviceVerified: false,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    const files = collectFiles(stage, stage).map((file) => ({
      name: `${host.packageName}/${file.name}`,
      data: normalizeZipEntryData(file.name, file.data),
    }));
    const zip = buildZip(files);
    out.push({
      host,
      asset: host.releaseAsset,
      files,
      zip,
      sha256: createHash('sha256').update(zip).digest('hex'),
      verified: verifyZip(zip, files),
    });
  }
  return out;
}

function main(): void {
  const boundary = assertPsychologyCandidateBoundary();
  if (!boundary.ok) throw new Error(boundary.error);
  if (!existsSync(join(source, 'scripts', 'dist', 'psychology-engine.mjs'))) {
    throw new Error('P9 engine bundle missing; run `pnpm run build:psychology-skill` first');
  }

  const candidateDir = join(releasesDir, PSYCHOLOGY_CANDIDATE_DIR);
  rmSync(candidateDir, { recursive: true, force: true });
  mkdirSync(candidateDir, { recursive: true });

  const built = buildPsychologyHostZips(source, candidateDir);
  const sums: string[] = [];
  for (const bundle of built) {
    const hostDir = join(candidateDir, bundle.host.id);
    writeFileSync(join(hostDir, bundle.asset), bundle.zip);
    writeFileSync(
      join(hostDir, `${bundle.asset}.sha256`),
      `${bundle.sha256}  ${bundle.asset}\n`,
      'utf8',
    );
    sums.push(`${bundle.sha256}  ${bundle.asset}`);
    process.stdout.write(
      `[${bundle.host.id}] ${bundle.asset}: ${bundle.files.length} files; self-verify=${bundle.verified ? 'PASS' : 'FAIL'}\n`,
    );
    if (!bundle.verified) process.exit(1);
  }

  const enginePath = join(source, 'scripts', 'dist', 'psychology-engine.mjs');
  const engineSha256 = createHash('sha256')
    .update(normalizeZipEntryData('scripts/dist/psychology-engine.mjs', readFileSync(enginePath)))
    .digest('hex');
  const manifest = {
    skill: PSYCHOLOGY_SKILL_NAME,
    product: PSYCHOLOGY_PRODUCT,
    releaseVersion: PSYCHOLOGY_RELEASE_VERSION,
    releaseTag: PSYCHOLOGY_CANDIDATE_TAG,
    status: 'unpublished',
    published: false,
    statusNote:
      'Local candidate only. No tag, GitHub Release, public download URL, root-manifest promotion, or host-verification claim exists.',
    canonicalEngine: {
      file: 'scripts/dist/psychology-engine.mjs',
      sha256: engineSha256,
    },
    platforms: PSYCHOLOGY_HOSTS.map((host) => ({
      host: host.id,
      label: host.label,
      packageName: host.packageName,
      runtime: host.runtime,
      releaseAsset: host.releaseAsset,
      downloadType: 'release-asset',
      downloadUrl: `${PSYCHOLOGY_REPO_URL}/releases/download/${PSYCHOLOGY_CANDIDATE_TAG}/${host.releaseAsset}`,
      sha256: built.find((bundle) => bundle.host.id === host.id)?.sha256,
      published: false,
      realDeviceVerified: false,
    })),
  };
  writeFileSync(
    join(candidateDir, 'install-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  writeFileSync(join(candidateDir, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`, 'utf8');
  process.stdout.write(
    `Candidate packages -> releases/${PSYCHOLOGY_CANDIDATE_DIR}/ (unpublished; root manifest untouched)\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${String(error)}\n`);
    process.exit(1);
  }
}
