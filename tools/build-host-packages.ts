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
  CANDIDATE_DIR,
  CANDIDATE_ENGINE_VERSION,
  CANDIDATE_RELEASE_TAG,
  CANDIDATE_RELEASE_VERSION,
  HOSTS,
  REPO_URL,
  SKILL_NAME,
  SKILL_NAME_LITE,
  PUBLISHED_RELEASE_TAG,
  type HostConfig,
} from './lib/host-config.ts';

/**
 * Build every host release bundle (the CANDIDATE build) from the ONE canonical Skill
 * ("一个核心，多个发布包"). Output goes ONLY to releases/<CANDIDATE_DIR>/ (gitignored):
 * the per-host zips + a candidate install-manifest.json + SHA256SUMS.txt. This tool NEVER
 * writes the committed root install-manifest.json / SHA256SUMS.txt — those reflect only an
 * explicitly published Release and are updated only by the explicit promote-release.ts step.
 *
 * Currently all four hosts (codex/qoder/workbuddy/doubao) are `full`: each stages a clean
 * copy of the canonical `skills/xuan-ji-yu-heng` + INSTALL.md + BUILD_MANIFEST.json.
 * The `reading-lite` path (references/ + a generated no-engine SKILL.md that refuses to
 * compute) is RETAINED for any FUTURE script-less host; no current host uses it.
 *
 * DETERMINISM: packaged files are byte-reproducible ACROSS PLATFORMS. No wall-clock timestamp
 * / git HEAD is embedded (provenance uses the immutable CANDIDATE_RELEASE_TAG), the volatile
 * `sbom.cdx.json` is excluded, and every text entry is LF-normalized (normalizeZipEntryData)
 * so a Windows CRLF working tree yields the SAME zip bytes as a LF checkout.
 *
 * Requires `pnpm run build` first (engine.mjs must exist for full-capability hosts).
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const srcSkill = join(root, 'skills', 'xuan-ji-yu-heng');
const releasesDir = join(root, 'releases');

/** Files/dirs excluded from EVERY host package to keep zips byte-reproducible.
 * Operates on paths RELATIVE to the Skill root (posix-style), so parent directory
 * names (e.g. a workspace under a folder named '.tmp') never cause false exclusions.
 */
function isExcluded(relPath: string): boolean {
  if (/(?:^|\/)\.\.?(?:\/|$)/.test(relPath)) return true; // safety: . or ..
  if (/(?:^|\/)\.tmp(\/|$)/.test(relPath)) return true;
  // Both committed SBOMs (CycloneDX + SPDX) stay out of the host zips, matching the
  // long-standing sbom.cdx.json exclusion that keeps the zip contents deterministic.
  if (/(?:^|\/)sbom\.(cdx|spdx)\.json$/.test(relPath)) return true;
  return false;
}

/** Generate a reading-lite SKILL.md that explicitly refuses to compute charts. */
function readingLiteSkillMd(): string {
  const fm = [
    '---',
    `name: ${SKILL_NAME_LITE}`,
    'description: >-',
    '  解读辅助版(reading-lite)——接收已由完整 Ming Engine 生成的命盘 facts(八字/紫微/占星),',
    '  按「说人话」规范生成事业、感情、财运、学业解读(7步结构 + 专业依据 + 时间线 + 风险提示)。',
    '  **此版本不包含排盘引擎,不能自行计算八字四柱、紫微星曜、占星行星位置。**',
    '  如需完整排盘,请使用 Codex / Qoder / WorkBuddy 上的完整版 xuan-ji-yu-heng。',
    '  触发词:解读命盘、帮我看事业、感情解读、财运分析、命理分析、八字解读。',
    '---',
  ];
  const body = [
    '',
    `# ${SKILL_NAME_LITE}`,
    '',
    '> **重要:此版本是解读辅助版(reading-lite),不包含排盘引擎。**',
    '> 它不能自行计算八字四柱、紫微星曜、占星行星位置、吉凶、喜用神、大运流年。',
    '> 如需完整排盘能力,请使用 Codex / Qoder / WorkBuddy 上的完整版 Ming Engine。',
    '',
    '## 此版本能做什么',
    '',
    '1. 引导用户收集完整的出生信息(日期、时间、地点、时区等)',
    '2. 接收已由完整 Ming Engine 生成的 `facts`(结构化命盘事实)',
    '3. 按 Ming Engine 的「说人话」输出规范生成事业、感情、财运等自然语言解读',
    '4. 提供专业依据、时间线、风险提示和现实建议',
    '',
    '## 此版本不能做什么',
    '',
    '- **不能自行排盘** — 不能计算八字四柱、紫微星曜、占星行星位置',
    '- **不能计算吉凶、喜用神、大运流年、神煞、刑冲合害** — 这些都需要完整引擎',
    '- **不能合婚 / 关系配对** — 需要完整引擎的 synastry 功能',
    '- 如果用户没有已生成的 facts,此版本无法提供任何排盘结果',
    '',
    '## 硬规则',
    '',
    '- **永远不要自行计算或猜测行星位置、宫位、相位、节气、干支、十神、起运、星曜、四化。**',
    '- **永远不要声称可以完成完整八字、紫微、占星计算。**',
    '- 如果用户要求排盘而没有提供 facts,引导用户去完整版 Ming Engine 先排盘。',
    '- 如果用户提供了 facts,严格按照 `references/reading-style.md` 的 7 步结构生成解读。',
    '- 解读中所有命理术语只放在第 6 部分「专业依据」。',
    '- 不给出确定性医疗、法律、投资、生死建议。',
    '',
    '## 工作流',
    '',
    '### 用户请求解读(有 facts)',
    '',
    '1. 确认用户要解读的主题(事业 / 感情 / 财运 / 学业 / 流年)',
    '2. 加载 `references/reading-style.md` + 对应主题的 examples 文件',
    '3. 按 7 步结构生成大白话解读:',
    '   - 第 1 步:30 秒看懂(核心结论块)',
    '   - 第 2 步:现实中会怎么表现',
    '   - 第 3 步:最可能出现的具体场景',
    '   - 第 4 步:时间线',
    '   - 第 5 步:可以怎么做',
    '   - 第 6 步:专业依据(术语只在此节)',
    '   - 第 7 步:信息可靠性与声明',
    '4. 第 1-5 步不得出现命理术语;术语只进第 6 步',
    '5. 结尾提供一句追问入口',
    '',
    '### 用户请求排盘(无 facts)',
    '',
    '1. 告知用户此版本不能排盘',
    '2. 引导用户去完整版 Ming Engine(Codex / Qoder / WorkBuddy)先排盘',
    '3. 帮助用户整理出生信息为 `birth-input.json` 格式(参考 `references/reading-lite-input.md`)',
    '4. 请用户拿到 facts 后再回来解读',
    '',
    '## 参考文件',
    '',
    '- `references/reading-style.md` — 解读输出规范(7 步结构、术语防火墙、空话检测)',
    '- `references/reading-lite-input.md` — 用户引导与 facts 输入格式',
    '- `references/examples-career.md` — 事业解读示例',
    '- `references/examples-love.md` — 感情解读示例',
    '- `references/examples-wealth.md` — 财运解读示例',
    '- `references/privacy.md` — 隐私说明',
    '- `references/sources-and-limitations.md` — 来源与限制',
    '',
    '## 免责声明',
    '',
    '仅供传统文化、娱乐与自我反思用途,非科学预测。不构成医疗、法律、投资或人生重大决策建议。',
    '完全离线,不上传出生信息。',
  ];
  return fm.join('\n') + '\n' + body.join('\n') + '\n';
}

function installMd(
  h: HostConfig,
  engineVersion: string,
  releaseVersion: string,
  tag: string,
): string {
  const isLite = h.capability === 'reading-lite';
  const L: string[] = [];
  L.push(`# ${h.label} 安装说明(${h.packageName})`);
  L.push('');
  L.push(`- 发布版本:${releaseVersion}（引擎 ${engineVersion}） 发布 tag:\`${tag}\``);
  L.push(
    `- 能力级别:**${isLite ? '解读辅助版(reading-lite,需外部 facts,不能自行排盘)' : '完整排盘引擎'}**`,
  );
  L.push(`- 运行环境:${h.runtime}`);
  L.push(`- 导入格式:${h.format}`);
  L.push('');
  L.push(
    '> 本包完全离线运行,不会把你的出生信息上传到网络。运行需本机 Node.js ≥ 22（无需 pnpm/Git/源码构建）。',
  );
  L.push('');
  if (isLite) {
    L.push('> **警告:此版本不包含排盘引擎,不能自行计算八字/紫微/占星,需外部 facts。**');
    L.push('');
  }
  L.push('## 30 秒安装');
  L.push('');
  if (isLite) {
    L.push('1. 解压本 zip,得到 `' + h.packageName + '` 文件夹。');
    L.push('2. 在宿主导入该技能文件夹(或 zip)。');
    L.push('3. 首次使用请先阅读 `references/reading-lite-input.md` 了解如何提供 facts。');
  } else if (h.id === 'codex') {
    L.push(
      '1. 克隆仓库 `git clone https://github.com/Jowitt13/ming-engine.git`(或下载 ZIP 解压)。',
    );
    L.push('2. 宿主读取仓库根目录的 `AGENTS.md` 与 `skills/xuan-ji-yu-heng/`。');
    L.push('3. 直接对话触发。');
  } else if (h.id === 'qoder') {
    // Qoder Desktop / Qoder CN: the built-in Agent performs the FILE install itself.
    // NO command-line install path (the normal user never runs any CLI).
    L.push(
      '由 Qoder 内置 Agent 代为安装（普通用户只需发送安装链接，无需自己下载、解压或使用任何命令行工具）：',
    );
    L.push('');
    L.push(
      `1. Agent 从清单 downloadUrl 下载不可变 Release 资产 \`${h.releaseAsset ?? `${h.packageName}.zip`}\`。`,
    );
    L.push('2. 按清单 `sha256` 校验 SHA-256；不一致立即中止，不写入。');
    L.push(
      `3. 校验 zip 只有一层顶层目录 \`${h.packageName}/\`（防双层目录 / Zip Slip；异常即中止）。`,
    );
    L.push(
      `4. 解压到临时目录，再**仅替换**用户技能目录 \`~/.qoder/skills/${h.packageName}/\`；不触碰 \`~/.qoder/skills\` 下其它技能，**失败不覆盖旧版**。`,
    );
    L.push('5. 刷新技能；若 Qoder Desktop 无刷新能力，则提示用户重启 Qoder 或新开一个对话一次。');
    L.push('6. 运行安装自检（见下方 verify），返回 `ok:true` 即就绪。');
    L.push('');
    L.push(
      '> 完成后一句话反馈：已安装到 Qoder 的个人技能目录；重启 Qoder 或新开一个对话后，直接说出生信息即可使用；首次排盘如出现本地 Node 授权，请点允许。',
    );
    L.push(
      '> 仅在需要写入技能目录或首次运行 Node 时申请一次最小权限。若宿主不允许写入用户技能目录，才改用平台文档中的手动备用方案（同样不需任何命令行工具）。',
    );
    L.push(
      '> 完整排盘真实依赖本机 Node.js ≥ 22；若缺失，请安装 Node.js ≥ 22（nodejs.org），不要安装任何命令行工具，也不会静默降级为只解读版。',
    );
  } else if (h.id === 'workbuddy') {
    L.push('1. 打开 WorkBuddy 桌面端 → 个人中心 → 「Claw 设置」→「Skills 管理」。');
    L.push(
      '2. 点「+ 新建技能 / 导入」→ 选择本地上传 → 选中本 `' +
        (h.releaseAsset ?? `${h.packageName}.zip`) +
        '`。',
    );
    L.push('3. 填写名称/描述/触发关键词后确认导入。');
  } else {
    // Any other full host (doubao): import the folder/zip; the engine is INCLUDED.
    L.push('1. 解压本 zip,得到 `' + h.packageName + '` 文件夹。');
    L.push('2. 在豆包电脑版导入该技能文件夹(或 zip)。');
    L.push('3. 导入后按下方“安装自检”确认引擎就绪。');
  }
  L.push('');
  if (!isLite && h.engineSelfCheck) {
    L.push('## 安装自检(机器自动,无需出生信息)');
    L.push('');
    L.push(
      '在技能目录下运行:`' +
        h.engineSelfCheck +
        '` —— 返回 `ok:true` 即引擎就绪(核对 engine/schema 版本,不猜坐标、不需要你的出生资料)。',
    );
    L.push('');
  }
  if (!isLite) {
    L.push('## 检查已装版本（读本地清单,不靠猜）');
    L.push('');
    L.push(
      '说「检查 Ming Engine 版本」:Agent 运行 `node scripts/ming-chart.mjs version` 读取本包同级 `BUILD_MANIFEST.json`,输出真实本地版本(engineVersion / releaseVersion / releaseTag / 是否 legacy / 是否双层目录 / 读取路径)。这是“当前已装版本”,不等于“线上最新版本”。',
    );
    L.push('');
  }
  L.push('## 用户演示(可选)');
  L.push('');
  L.push(`> ${h.userDemoPrompt}`);
  L.push('');
  L.push(
    '> 演示已给出完整公历/时间/时区/经纬度;换成你自己的信息时也请提供 IANA 时区与经纬度,或明确同意使用城市中心坐标——引擎不会静默猜测坐标。',
  );
  L.push('');
  L.push('## 如何确认已加载');
  L.push('');
  if (isLite) {
    L.push(
      '导入后能在宿主看到「' +
        h.packageName +
        '」技能即安装成功;此版本不含排盘引擎,需提供完整引擎生成的 facts 才能解读。',
    );
  } else {
    L.push(
      '`verify` 返回 ok:true,或排一张盘能返回三盘(西方/八字/紫微)数据与解读,即安装成功;若提示找不到 `node`,请先安装 Node.js ≥ 22。',
    );
  }
  L.push('');
  if (!isLite && (h.id === 'qoder' || h.id === 'workbuddy')) {
    const targetDir =
      h.id === 'qoder'
        ? '~/.qoder/skills/xuan-ji-yu-heng'
        : '~/.workbuddy/skills/xuan-ji-yu-heng';
    L.push('## 更新（读线上 manifest,迁移替换旧包,清理旧 RC）');
    L.push('');
    L.push('说「帮我更新 Ming Engine」,Agent 按序执行(普通用户不敲命令):');
    L.push(
      '1. 抓取 `https://raw.githubusercontent.com/Jowitt13/ming-engine/main/install-manifest.json`——线上稳定清单是唯一目标版本来源。',
    );
    L.push(
      '2. 取本平台不可变 `downloadUrl`(非 latest)与 `sha256`,下载→校验 SHA-256→校验单层 `xuan-ji-yu-heng/`→解压临时目录;下载失败 / SHA 不一致 / Release 不存在即明确失败并停止,绝不因本地旧包或缓存说“已是最新”。',
    );
    L.push(
      `3. 迁移替换:运行 \`node <临时目录>/xuan-ji-yu-heng/scripts/ming-chart.mjs migrate --host ${h.id} --source <临时目录>/xuan-ji-yu-heng\`——原子替换 \`${targetDir}\`、清理 legacy RC 双层目录、只动该技能、失败自动回滚(不删整个 skills 目录、不碰其它技能)。`,
    );
    if (h.id === 'workbuddy') {
      L.push(
        '   若 WorkBuddy 必须经 Skills 管理界面:先只删旧 Ming Engine 再导入新版,不碰其它技能;升级后只保留一个可触发 `xuan-ji-yu-heng`。',
      );
    }
    L.push(
      '4. 运行 `node scripts/ming-chart.mjs version` 复核,并输出 before→after:旧 tag / 新 tag / 新 SHA-256 / 最终 BUILD_MANIFEST。',
    );
    L.push('');
  }
  L.push('## 更新 / 卸载');
  L.push('');
  L.push(`- 更新:${h.updateHint}`);
  L.push(`- 卸载:${h.uninstallHint}`);
  L.push('');
  L.push('## 已知限制与隐私');
  L.push('');
  L.push(`- ${h.notes}`);
  L.push('- 仅供传统文化、娱乐与自我反思,非科学预测;不构成医疗/法律/投资/人生重大决策建议。');
  L.push('- 完全离线,不上传出生信息。');
  L.push('');
  return L.join('\n');
}

export interface HostZip {
  host: HostConfig;
  asset: string;
  files: FileEntry[];
  zip: Buffer;
  sha256: string;
  verified: boolean;
}

/**
 * Build every host ZIP from a source Skill directory into `stagingRoot`, applying the
 * per-host staging rules + deterministic LF text normalization, then a single-top-dir zip.
 * Parameterized on srcSkillDir/stagingRoot so BOTH main() and the packaging regression test
 * exercise the SAME path; returns each host's zip bytes + sha256 (LF vs CRLF text inputs must
 * produce byte-identical archives).
 */
export function buildHostZips(srcSkillDir: string, stagingRoot: string): HostZip[] {
  const out: HostZip[] = [];
  for (const h of HOSTS) {
    const isLite = h.capability === 'reading-lite';
    const asset = h.releaseAsset ?? `${h.packageName}.zip`;
    const hostDir = join(stagingRoot, h.id);
    const stageSkill = join(hostDir, h.packageName);
    mkdirSync(hostDir, { recursive: true });

    if (isLite) {
      // reading-lite (no current host): references/ only, NO scripts/agents/assets.
      const liteFilter = (src: string): boolean => {
        const rel = relative(srcSkillDir, src).split(sep).join('/');
        if (isExcluded(rel)) return false;
        if (/(?:^|\/)scripts(\/|$)/.test(rel)) return false;
        if (/(?:^|\/)agents(\/|$)/.test(rel)) return false;
        if (/(?:^|\/)assets(\/|$)/.test(rel)) return false;
        return true;
      };
      cpSync(srcSkillDir, stageSkill, { recursive: true, filter: liteFilter });
      writeFileSync(join(stageSkill, 'SKILL.md'), readingLiteSkillMd(), 'utf8');
    } else {
      // full: copy the entire canonical skill (exclude .tmp + volatile sbom).
      cpSync(srcSkillDir, stageSkill, {
        recursive: true,
        filter: (src) => !isExcluded(relative(srcSkillDir, src).split(sep).join('/')),
      });
    }

    writeFileSync(
      join(stageSkill, 'INSTALL.md'),
      installMd(h, CANDIDATE_ENGINE_VERSION, CANDIDATE_RELEASE_VERSION, CANDIDATE_RELEASE_TAG),
      'utf8',
    );
    const manifest = {
      name: h.packageName,
      engineVersion: CANDIDATE_ENGINE_VERSION,
      releaseVersion: CANDIDATE_RELEASE_VERSION,
      releaseTag: CANDIDATE_RELEASE_TAG,
      host: h.id,
      hostLabel: h.label,
      capability: h.capability,
      scriptExecution: h.scriptExecution,
      runtime: h.runtime,
      ...(isLite ? {} : { engine: 'scripts/dist/engine.mjs', cli: 'scripts/ming-chart.mjs' }),
      realDeviceVerified: h.realDeviceVerified,
    };
    writeFileSync(
      join(stageSkill, 'BUILD_MANIFEST.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );

    // collectFiles yields BARE relative names; prefix packageName ONCE (single top dir).
    // Deterministic LF normalization makes the archive byte-identical regardless of the
    // working-tree line endings (CRLF vs LF) — the v0.1.2 cross-platform reproducibility fix.
    const files = collectFiles(stageSkill, stageSkill).map((f) => ({
      name: `${h.packageName}/${f.name}`,
      data: normalizeZipEntryData(f.name, f.data),
    }));
    const zip = buildZip(files);
    out.push({
      host: h,
      asset,
      files,
      zip,
      sha256: createHash('sha256').update(zip).digest('hex'),
      verified: verifyZip(zip, files),
    });
  }
  return out;
}

function main(): void {
  // The engine bundle is required for full-capability hosts but NOT for reading-lite.
  const hasFullHost = HOSTS.some((h) => h.capability === 'full');
  const enginePath = join(srcSkill, 'scripts', 'dist', 'engine.mjs');
  if (hasFullHost && !existsSync(enginePath)) {
    process.stderr.write('Engine bundle missing. Run `pnpm run build` first.\n');
    process.exit(1);
  }
  // CANDIDATE build only: everything under releases/<CANDIDATE_DIR>/ (gitignored).
  // NEVER rewrite the committed root install-manifest.json / SHA256SUMS.txt (frozen at
  // the committed root manifest); promotion is a separate explicit step (promote-release.ts).
  const candidateDir = join(releasesDir, CANDIDATE_DIR);
  rmSync(candidateDir, { recursive: true, force: true });
  mkdirSync(candidateDir, { recursive: true });

  const built = buildHostZips(srcSkill, candidateDir);
  const zipShaByHost: Record<string, string> = {};
  for (const b of built) {
    const hostDir = join(candidateDir, b.host.id);
    const perFileSha = b.files
      .map((f) => `${createHash('sha256').update(f.data).digest('hex')}  ${f.name}`)
      .join('\n');
    writeFileSync(join(hostDir, `${b.asset}.sha256`), `${perFileSha}\n`, 'utf8');
    writeFileSync(join(hostDir, b.asset), b.zip);
    zipShaByHost[b.host.id] = b.sha256;
    const kib = (b.zip.length / 1024).toFixed(0);
    process.stdout.write(
      `[${b.host.id}] ${b.asset} — ${b.files.length} files, zip ${kib} KiB, capability=${b.host.capability}, self-verify ${b.verified ? 'PASS' : 'FAIL'}\n`,
    );
    if (!b.verified) process.exit(1);
  }

  // --- Candidate manifest (releases/<CANDIDATE_DIR>/, gitignored, published:false) -----
  // NEVER writes the committed root install-manifest.json / SHA256SUMS.txt.
  const engineSha256 = createHash('sha256').update(readFileSync(enginePath)).digest('hex');

  const platforms = HOSTS.map((h) => {
    const base = {
      host: h.id,
      label: h.label,
      packageName: h.packageName,
      capability: h.capability,
      scriptExecution: h.scriptExecution,
      needsUserAuth: h.needsUserAuth,
      runtime: h.runtime,
      installer: `docs/installers/${h.id}.md`,
      engineSelfCheck: h.engineSelfCheck ?? null,
      userDemoPrompt: h.userDemoPrompt,
      updateHint: h.updateHint,
      uninstallHint: h.uninstallHint,
      realDeviceVerified: h.realDeviceVerified,
    };
    if (!h.releaseAsset) {
      // codex ships via the repo itself, not a release asset.
      return { ...base, downloadType: 'repo', downloadUrl: REPO_URL, published: true };
    }
    return {
      ...base,
      releaseAsset: h.releaseAsset,
      downloadType: 'release-asset',
      downloadUrl: `${REPO_URL}/releases/download/${CANDIDATE_RELEASE_TAG}/${h.releaseAsset}`,
      sha256: zipShaByHost[h.id],
      published: false,
    };
  });

  const candidateManifest = {
    skill: SKILL_NAME,
    product: 'ming-engine',
    engineVersion: CANDIDATE_ENGINE_VERSION,
    releaseVersion: CANDIDATE_RELEASE_VERSION,
    releaseTag: CANDIDATE_RELEASE_TAG,
    repo: REPO_URL,
    status: 'unpublished',
    statusNote:
      `候选构建 ${CANDIDATE_RELEASE_TAG}（v${CANDIDATE_RELEASE_VERSION}）尚未发布。这是 gitignored 的候选清单,不是线上稳定清单;` +
      '真实 Release 创建 + 资产上传 + 重下校验后,才由 promote-release 步骤更新根目录稳定清单。' +
      '安装器遇 404/published:false 必须提示「安装包尚未发布」,不得伪装成功。',
    canonicalEngine: { version: CANDIDATE_ENGINE_VERSION, engineSha256 },
    entry: 'https://raw.githubusercontent.com/Jowitt13/ming-engine/main/INSTALL.md',
    platforms,
  };
  writeFileSync(
    join(candidateDir, 'install-manifest.json'),
    `${JSON.stringify(candidateManifest, null, 2)}\n`,
    'utf8',
  );

  const sumsLines = HOSTS.filter((h) => h.releaseAsset).map(
    (h) => `${zipShaByHost[h.id]}  ${h.releaseAsset}`,
  );
  writeFileSync(join(candidateDir, 'SHA256SUMS.txt'), `${sumsLines.join('\n')}\n`, 'utf8');

  process.stdout.write(
    `\nCandidate packages -> releases/${CANDIDATE_DIR}/{${HOSTS.map((h) => h.id).join(',')}}/  (published:false)\n` +
      `Candidate manifest  -> releases/${CANDIDATE_DIR}/install-manifest.json + SHA256SUMS.txt\n` +
      `Root manifest left UNTOUCHED (${PUBLISHED_RELEASE_TAG ?? 'no published Release'}; promote-release updates it).\n`,
  );
}

// Only run the CANDIDATE build when invoked as a script; importing (e.g. from the packaging
// regression test) exposes buildHostZips WITHOUT triggering a build.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (err: unknown) {
    process.stderr.write(`${String(err)}\n`);
    process.exit(1);
  }
}
