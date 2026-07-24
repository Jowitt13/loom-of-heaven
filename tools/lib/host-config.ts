/**
 * Single source of truth for the multi-host publishing layer. The canonical Skill at
 * `skills/calculate-birth-charts` is the ONLY maintained copy; `build-host-packages.ts`
 * derives each host bundle from it plus the metadata declared here. No host has a
 * hand-maintained SKILL.md — that would drift.
 *
 * Version model: STABLE_* describes the live published release (v0.1.2, engine 0.1.1 — the
 * chart math is byte-identical to 0.1.0; only the Western provenance label was corrected) and
 * is what the committed root manifest reflects. CANDIDATE_* describes the NEXT unpublished build
 * produced by `package:hosts` (v0.1.3, same 0.1.1 engine). STABLE and CANDIDATE tags MUST
 * differ; `verify:install` fails hard if they collide.
 *
 * Candidate vs stable boundary: `package:hosts` only ever writes the CANDIDATE build under
 * `releases/<CANDIDATE_DIR>/` with `published:false`. It NEVER rewrites the committed root
 * `install-manifest.json` / `SHA256SUMS.txt`, which stay frozen at the live STABLE release
 * (STABLE_RELEASE_TAG). The root stable manifest is updated only by the explicit
 * `promote-release.ts` step, after a real Release is created + assets uploaded + re-verified.
 */

export type HostId = 'codex' | 'qoder' | 'workbuddy' | 'doubao';
export type Capability = 'full' | 'reading-lite';

export interface HostConfig {
  id: HostId;
  /** Human label (zh). */
  label: string;
  /** Import/packaging format the host actually consumes. */
  format: string;
  /** Whether the host can run a local Node.js script (the deterministic engine). */
  scriptExecution: boolean;
  /** Runtime the host machine needs to run the full engine. */
  runtime: string;
  /** 'full' = bundled deterministic engine; 'reading-lite' = prompt-only, needs external facts. */
  capability: Capability;
  /** Skill name inside the package (Qoder constraint: lowercase/digits/hyphen, <=64). */
  packageName: string;
  /** GitHub Release asset filename; undefined for repo-based hosts (codex ships via the repo). */
  releaseAsset?: string;
  /** Whether install asks the user for a one-time permission/import confirmation. */
  needsUserAuth: boolean;
  /** One-line conversational update hint. */
  updateHint: string;
  /** One-line conversational uninstall hint. */
  uninstallHint: string;
  /** Whether the exact import flow is confirmed by real-device testing. */
  realDeviceVerified: boolean;
  /**
   * Deterministic machine self-check command (full hosts only). Runs the engine's own
   * `verify` sub-command; needs NO birth data and does NOT guess coordinates.
   */
  engineSelfCheck?: string;
  /**
   * Optional user-facing demo prompt. If it uses a real case it MUST carry a complete
   * Gregorian date, time accuracy, IANA timezone, latitude and longitude (no silent
   * coordinate guessing — SKILL.md forbids it).
   */
  userDemoPrompt: string;
  /** Short note on what is certain vs needs real-device confirmation. */
  notes: string;
}

export const SKILL_NAME = 'calculate-birth-charts';
export const SKILL_NAME_LITE = 'calculate-birth-charts-doubao-lite';

export const REPO_URL = 'https://github.com/Jowitt13/ming-engine';

// --- STABLE: the live published release; the committed root manifest reflects this. ---
/** Engine semver shipped by the live STABLE release (v0.1.3 ships engine 0.1.1; math byte-identical to 0.1.0). */
export const STABLE_ENGINE_VERSION = '0.1.1';
/** The live/published release the committed root manifest reflects (updated only by promote-release). */
export const STABLE_RELEASE_TAG = 'v0.1.3';

// --- CANDIDATE: the next unpublished build produced by package:hosts. MUST differ from STABLE. ---
/** Engine semver of the candidate: same 0.1.1 engine as the live stable (no engine change pending). */
export const CANDIDATE_ENGINE_VERSION = '0.1.1';
/** Install-package release version of the candidate (next packaging release over the 0.1.1 engine). */
export const CANDIDATE_RELEASE_VERSION = '0.1.4';
/** Immutable tag the CANDIDATE build targets (never `latest/download`). */
export const CANDIDATE_RELEASE_TAG = `v${CANDIDATE_RELEASE_VERSION}`;
/** Sub-directory under `releases/` for the candidate build (gitignored). */
export const CANDIDATE_DIR = CANDIDATE_RELEASE_TAG;

/**
 * Invariant: the candidate release tag MUST differ from the live stable release tag, so a
 * candidate build can never be mistaken for (or overwrite) the published stable release.
 * Pure + parameterized so it is unit-testable with a negative (equal) case.
 */
export function assertDistinctReleaseTags(
  candidateTag: string = CANDIDATE_RELEASE_TAG,
  stableTag: string = STABLE_RELEASE_TAG,
): { ok: boolean; error?: string } {
  if (candidateTag === stableTag) {
    return {
      ok: false,
      error: `candidate tag "${candidateTag}" must differ from stable tag "${stableTag}"`,
    };
  }
  return { ok: true };
}

/** Deterministic machine self-check: engine `verify`, no coordinates, no birth data. */
export const ENGINE_SELF_CHECK = 'node scripts/ming-chart.mjs verify';
/**
 * User demo prompt with a COMPLETE deterministic location (Gregorian + exact time + IANA
 * tz + lat/lon) so the host never has to silently guess coordinates.
 */
export const USER_DEMO_PROMPT =
  '男，公历 1990-06-15 14:20（时间准确，示例·虚构人物，非真实个人信息），出生地 示例城市，时区 Asia/Shanghai，纬度 30.00、经度 120.00，帮我看事业。';

/**
 * The canonical Skill is already a standard SKILL.md + scripts/ + references/ layout
 * (OpenClaw- and Qoder-compatible). Every host that runs scripts ships the SAME file
 * set; only INSTALL.md + BUILD_MANIFEST.json differ. This is deliberate: one core,
 * zero per-host SKILL.md drift.
 */
export const HOSTS: HostConfig[] = [
  {
    id: 'codex',
    needsUserAuth: false,
    updateHint: '说「帮我更新 Ming Engine」，或重新拉取/下载仓库覆盖原文件夹。',
    uninstallHint: '说「帮我卸载 Ming Engine」，或删除克隆/解压出的仓库文件夹。',
    label: 'Codex（及任何读取 AGENTS.md 的宿主）',
    format: 'GitHub 仓库 / 文件夹（agents/openai.yaml UI 元数据 + AGENTS.md）',
    scriptExecution: true,
    runtime: 'Node.js ≥ 22',
    capability: 'full',
    packageName: SKILL_NAME,
    realDeviceVerified: true,
    engineSelfCheck: ENGINE_SELF_CHECK,
    userDemoPrompt: USER_DEMO_PROMPT,
    notes: '现有发布方式，保持不变（无回归）。',
  },
  {
    id: 'qoder',
    releaseAsset: 'ming-engine-qoder.zip',
    needsUserAuth: true,
    updateHint:
      '说「帮我更新 Ming Engine」：Agent 读线上稳定 manifest→下载校验→migrate 原子替换 ~/.qoder/skills 旧包（清理 legacy RC 双层）→回报 before→after。',
    uninstallHint: '说「帮我卸载 Ming Engine」，或在技能管理中删除 calculate-birth-charts。',
    label: 'Qoder / Qoder CN',
    format:
      '标准 SKILL.md（YAML frontmatter）+ 辅助文件；由 Qoder 内置 Agent 代为下载校验并写入用户技能目录 ~/.qoder/skills/（普通用户无需命令行工具、无需自行下载或解压）',
    scriptExecution: true,
    runtime: 'Node.js ≥ 22',
    capability: 'full',
    packageName: SKILL_NAME,
    realDeviceVerified: true,
    engineSelfCheck: ENGINE_SELF_CHECK,
    userDemoPrompt: USER_DEMO_PROMPT,
    notes:
      'Qoder 原生支持 SKILL.md 与脚本执行；name 符合小写/连字符/≤64 约束。真机确认：装到 ~/.qoder/skills/calculate-birth-charts，/calculate-birth-charts 可触发，引擎执行、三盘正常（engine.mjs 与 canonical byte-identical）；首次运行脚本授权一次。',
  },
  {
    id: 'workbuddy',
    releaseAsset: 'ming-engine-workbuddy.zip',
    needsUserAuth: true,
    updateHint:
      '说「帮我更新 Ming Engine」：读线上 manifest→下载校验→migrate 迁移替换旧包（或经 Skills 管理先删旧再导入）→回报 before→after。',
    uninstallHint: '说「帮我卸载 Ming Engine」，或在「Skills 管理」中删除该技能。',
    label: '腾讯 WorkBuddy（桌面端 / OpenClaw）',
    format:
      'OpenClaw 技能 zip（SKILL.md + scripts/ 位于压缩包根目录），在「Claw 设置 → Skills 管理」本地上传',
    scriptExecution: true,
    runtime: 'Node.js ≥ 22（OpenClaw 运行脚本所需）',
    capability: 'full',
    packageName: SKILL_NAME,
    realDeviceVerified: true,
    engineSelfCheck: ENGINE_SELF_CHECK,
    userDemoPrompt: USER_DEMO_PROMPT,
    notes:
      'OpenClaw 调用技能时会启动独立进程运行 scripts/ 下脚本（Node/Python/Bash），故可跑完整引擎；终端机器需有 Node。真机确认：上传 zip 导入到 ~/.workbuddy/skills/calculate-birth-charts/，三盘 + 63 条解读事实正常，engine.mjs 与 canonical byte-identical；zip 内不含 .git/tests/node_modules/源码。更新用 migrate 原子替换 ~/.workbuddy/skills/calculate-birth-charts（清理 legacy RC 双层、失败回滚），或经 Skills 管理先删旧 Ming Engine 再导入新版、不碰其它技能；升级后只保留一个可触发 calculate-birth-charts。',
  },
  // Doubao is full (real-device confirmed it imports the Skill AND runs the Node engine).
  // reading-lite is retained as the designated pattern for any FUTURE script-less host
  // (see readingLiteSkillMd + SKILL_NAME_LITE); no current host uses it.
  {
    id: 'doubao',
    releaseAsset: 'ming-engine-doubao.zip',
    needsUserAuth: true,
    updateHint: '说「帮我更新 Ming Engine」，宿主会重新导入最新版覆盖。',
    uninstallHint: '说「帮我卸载 Ming Engine」，或在豆包技能管理中删除该技能。',
    label: '豆包电脑版',
    format: '可导入技能文件夹/zip（SKILL.md + scripts/ + references/）',
    scriptExecution: true,
    runtime: 'Node.js ≥ 22',
    capability: 'full',
    packageName: SKILL_NAME,
    realDeviceVerified: true,
    engineSelfCheck: ENGINE_SELF_CHECK,
    userDemoPrompt: USER_DEMO_PROMPT,
    notes:
      '真机确认：豆包电脑版可导入技能并执行 Node 脚本，装完整包（含预构建 engine.mjs），装到 ~/.agents/skills/calculate-birth-charts/；三盘 + 跨系统解读正常，facts 与 canonical byte-identical（同一 engine.mjs）。',
  },
];

export function hostById(id: HostId): HostConfig {
  const h = HOSTS.find((x) => x.id === id);
  if (!h) throw new Error(`Unknown host: ${id}`);
  return h;
}
