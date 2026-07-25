import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOSTS } from './lib/host-config.ts';

/**
 * Offline documentation-consistency gate. Asserts that the shipped docs match the CURRENT
 * reality (four full script-executing hosts; render disabled; providers exist; Astronomy
 * Engine is VSOP87/NOVAS-based, NOT "based on JPL DE441"; dev Node >= 24 vs run Node >= 22
 * are not conflated; SKILL.md does not unconditionally demand a full three-chart display in a
 * topic report; verify:all doc stages include validate:docs). Includes positive + negative
 * self-tests proving the detectors actually fire on the old wrong text. Generated artifacts
 * (examples/) and engine-produced provenance labels are intentionally out of scope.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const SKILL = 'skills/calculate-birth-charts';

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}
const checks: Check[] = [];
const add = (name: string, ok: boolean, detail?: string): void => {
  checks.push(detail === undefined ? { name, ok } : { name, ok, detail });
};
const read = (rel: string): string | null => {
  const p = join(root, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
};

// --- shared detectors (also exercised by the self-test) ---------------------
const DE441 = /(JPL\s*)?DE-?441/i;
const PROVIDERS_MISSING =
  /(尚未|还未|not yet)\s*(创建|实现|created)[^。\n]{0,12}provider|provider[^。\n]{0,12}(尚未|not yet)\s*(创建|created)/i;
const NO_NODE = /(不需要|无需)[^。\n；;]{0,16}Node/;
const HTML_SVG_OUT = /(输出|生成|返回)[^。\n]{0,10}(HTML|SVG)/i;
const DISPLAY_ALL =
  /display every system in full|无条件[^。\n]{0,8}(展示|显示)[^。\n]{0,8}(完整|三盘|三大)/i;
/** Round 13: forbidden command-line install references in Qoder user-facing docs. */
const QODER_CLI =
  /qodercli|Qoder\s*CLI|Skills\s*CLI|npx\s+skills|@qoder-ai|方式一[（(]命令行|\/skills\s*安装/i;
/** Round 13.1: local version-check + online-manifest migrate-update protocol markers. */
const VERSION_CMD = /ming-chart\.mjs version/;
const ONLINE_MANIFEST = /install-manifest\.json/;
const MIGRATE = /\bmigrate\b/;

interface DocRule {
  file: string;
  mustNot?: { re: RegExp; msg: string }[];
  must?: { re: RegExp; msg: string }[];
}

const RUN_NODE = /Node(\.js)?\s*[>≥]=?\s*22/;

const RULES: DocRule[] = [
  {
    file: 'README.md',
    mustNot: [
      { re: DE441, msg: 'DE441 错误声明' },
      { re: /三大\s*Agent/, msg: '“三大 Agent”过期表述' },
      { re: NO_NODE, msg: '“不需要 Node”错误声明' },
    ],
    must: [
      { re: /VSOP87|NOVAS/, msg: '缺 VSOP87/NOVAS 正确归因' },
      { re: RUN_NODE, msg: '缺 运行 Node ≥ 22' },
      { re: /Node(\.js)?\s*[>≥]=?\s*24/, msg: '缺 开发 Node ≥ 24' },
      { re: /脚本执行|执行脚本|运行脚本/, msg: '缺 需要脚本执行能力说明' },
    ],
  },
  {
    file: 'INSTALL.md',
    mustNot: [
      { re: NO_NODE, msg: '“不需要 Node”错误声明' },
      {
        re: QODER_CLI,
        msg: 'Qoder 安装出现 CLI/Skills CLI/方式一(命令行)/skills 安装',
      },
    ],
    must: [
      { re: RUN_NODE, msg: '缺 运行 Node ≥ 22' },
      { re: /verify/, msg: '缺 引擎自检 verify 说明' },
      { re: VERSION_CMD, msg: '缺 version 版本检查命令' },
      { re: ONLINE_MANIFEST, msg: '缺 读线上 install-manifest 更新协议' },
      { re: MIGRATE, msg: '缺 migrate 迁移替换' },
    ],
  },
  {
    file: 'docs/INSTALL_BY_PLATFORM.md',
    mustNot: [
      { re: NO_NODE, msg: '“不需要 Node”错误声明' },
      {
        re: /豆包[^。\n]{0,10}(仅解读|reading-lite|解读辅助)/,
        msg: '豆包仍标 reading-lite',
      },
      {
        re: QODER_CLI,
        msg: 'Qoder 平台文档出现 CLI/Skills CLI/方式一(命令行)/skills 安装',
      },
    ],
    must: [{ re: RUN_NODE, msg: '缺 运行 Node ≥ 22' }],
  },
  {
    file: 'docs/STATUS.md',
    mustNot: [{ re: DE441, msg: 'DE441 错误声明' }],
    must: [
      { re: /validate:docs/, msg: '缺 validate:docs 阶段' },
      { re: /VSOP87|NOVAS/, msg: '缺 VSOP87/NOVAS' },
    ],
  },
  {
    file: 'docs/VALIDATION.md',
    mustNot: [{ re: DE441, msg: 'DE441 错误声明' }],
    must: [
      { re: /validate:docs/, msg: '缺 validate:docs 阶段' },
      { re: /VSOP87|NOVAS/, msg: '缺 VSOP87/NOVAS' },
    ],
  },
  {
    file: `${SKILL}/SKILL.md`,
    mustNot: [
      { re: DE441, msg: 'DE441 错误声明' },
      { re: DISPLAY_ALL, msg: '无条件展示完整三盘（与 Channel B 冲突）' },
    ],
    must: [
      { re: /Channel B/, msg: '缺 Channel B 区分' },
      { re: /VSOP87|NOVAS/, msg: '缺 VSOP87/NOVAS' },
    ],
  },
  {
    file: 'docs/adr/0003-provider-selection.md',
    mustNot: [{ re: DE441, msg: 'DE441 错误声明' }],
    must: [{ re: /VSOP87|NOVAS/, msg: '缺 VSOP87/NOVAS' }],
  },
  {
    file: `${SKILL}/references/sources-and-limitations.md`,
    mustNot: [{ re: DE441, msg: 'DE441 错误声明' }],
    must: [
      { re: /VSOP87|NOVAS/, msg: '缺 VSOP87/NOVAS' },
      { re: /JPL Horizons/, msg: '缺 独立 golden 待补(JPL Horizons)说明' },
    ],
  },
  {
    file: 'AGENTS.md',
    must: [
      { re: /render/, msg: '缺 render 说明' },
      {
        re: /disabled|禁用|exit\s*3|退出码\s*3/,
        msg: 'render 未标 disabled/exit 3',
      },
    ],
  },
  {
    file: 'docs/ARCHITECTURE.md',
    mustNot: [{ re: PROVIDERS_MISSING, msg: '“providers 尚未创建”过期表述' }],
  },
  {
    file: 'docs/PRODUCT_SPEC.md',
    mustNot: [{ re: HTML_SVG_OUT, msg: '仍承诺输出 HTML/SVG' }],
    must: [{ re: /JSON/, msg: '缺 当前输出为结构化 JSON' }],
  },
  {
    file: `${SKILL}/references/privacy.md`,
    mustNot: [
      {
        re: /(deferred|延后|推迟)[^。\n]{0,12}(扫描|scan)|(扫描|scan)[^。\n]{0,12}(deferred|延后|推迟)/i,
        msg: '扫描仍标 deferred',
      },
    ],
  },
  {
    file: 'package.json',
    mustNot: [{ re: /WorkBuddy Skill/, msg: 'description 仍只描述为 WorkBuddy Skill' }],
  },
  {
    file: 'docs/HOST_COMPATIBILITY.md',
    mustNot: [
      {
        re: /默认[^。\n]{0,6}reading-lite|豆包版是[^。\n]{0,8}解读辅助/,
        msg: '豆包仍标当前 reading-lite',
      },
      { re: QODER_CLI, msg: 'Qoder 导入格式出现 CLI/Skills CLI' },
    ],
  },
  {
    file: 'docs/installers/qoder.md',
    mustNot: [
      {
        re: QODER_CLI,
        msg: 'Qoder 安装器出现 CLI/Skills CLI/方式一(命令行)/skills 安装',
      },
    ],
    must: [
      { re: /~\/\.qoder\/skills/, msg: '缺 Agent 写入 ~/.qoder/skills' },
      { re: /仅替换|只替换/, msg: '缺 仅替换目标目录' },
      { re: RUN_NODE, msg: '缺 运行 Node ≥ 22' },
      { re: VERSION_CMD, msg: '缺 version 版本检查命令' },
      { re: ONLINE_MANIFEST, msg: '缺 读线上 install-manifest 更新协议' },
      { re: MIGRATE, msg: '缺 migrate 迁移替换' },
    ],
  },
  {
    file: 'docs/installers/workbuddy.md',
    must: [
      { re: VERSION_CMD, msg: '缺 version 版本检查命令' },
      { re: ONLINE_MANIFEST, msg: '缺 读线上 install-manifest 更新协议' },
      { re: MIGRATE, msg: '缺 migrate 迁移替换' },
      { re: RUN_NODE, msg: '缺 运行 Node ≥ 22' },
    ],
  },
];

/** D2: a "current release" mention in a user doc (captures the version tag). */
const CURRENT_RELEASE_RE =
  /(?:安装包来自|指向)[^\n]{0,40}?GitHub Release\s*`?(v\d+\.\d+\.\d+)`?|最后更新[:：]\s*`?(v\d+\.\d+\.\d+)`?/g;
const PUBLICATION_ENTRY_DOCS = [
  'README.md',
  'INSTALL.md',
  'docs/INSTALL_BY_PLATFORM.md',
  'docs/HOST_COMPATIBILITY.md',
];
const DELETED_RELEASE_DOWNLOAD = /\/releases\/download\/v0\.1\.3\//;
/** D3: an incomplete "chart now" prompt that omits the full input contract. */
const BAD_CHART_PROMPT = /出生在[^，。\n]{1,8}的盘/;

function selfTest(): void {
  add('[self-test] DE441 检测命中', DE441.test('Astronomy Engine 基于 JPL DE441'));
  add(
    '[self-test] providers-missing 命中',
    PROVIDERS_MISSING.test('Western/BaZi providers 尚未创建'),
  );
  add('[self-test] 不需要-Node 命中', NO_NODE.test('也不需要安装 pnpm、Node 或 Git'));
  add('[self-test] HTML/SVG 输出命中', HTML_SVG_OUT.test('当前输出 HTML/SVG 报告'));
  add('[self-test] 干净归因不误报', !DE441.test('astronomy-engine 基于 VSOP87 与 NOVAS'));
  add('[self-test] 需要Node不误报', !NO_NODE.test('无需 pnpm、Git；运行需要 Node.js ≥ 22'));
  add('[self-test] 不完整排盘示例命中', BAD_CHART_PROMPT.test('帮我排一下 1990…出生在武汉的盘'));
  add(
    '[self-test] 完整合同示例不误报',
    !BAD_CHART_PROMPT.test('公历 1990-06-15 14:20，时区 Asia/Shanghai，纬度 30.00、经度 120.00'),
  );
  add('[self-test] Qoder-CLI 命中', QODER_CLI.test('方式一(命令行):用 Skills CLI 安装本 zip'));
  add(
    '[self-test] Qoder Agent 代装文案不误报',
    !QODER_CLI.test(
      '由 Qoder 内置 Agent 代为下载校验并仅替换写入 ~/.qoder/skills（无需命令行工具）',
    ),
  );
  add('[self-test] version 命令检测命中', VERSION_CMD.test('node scripts/ming-chart.mjs version'));
  add('[self-test] version 不误报 verify', !VERSION_CMD.test('node scripts/ming-chart.mjs verify'));
  add('[self-test] migrate 协议检测命中', MIGRATE.test('migrate --host qoder --source tmp'));
}

function main(): void {
  selfTest();

  // Capability consistency: docs must reflect what host-config declares.
  const allFull = HOSTS.every((h) => h.capability === 'full');
  add('host-config: 四宿主均为 full（本轮无 reading-lite 宿主）', allFull && HOSTS.length === 4);

  for (const rule of RULES) {
    const text = read(rule.file);
    add(`${rule.file} 存在`, text !== null);
    if (text === null) continue;
    for (const m of rule.mustNot ?? []) {
      add(`${rule.file}: 不含 ${m.msg}`, !m.re.test(text));
    }
    for (const m of rule.must ?? []) {
      add(`${rule.file}: 含 ${m.msg}`, m.re.test(text));
    }
  }

  // D2: user-facing publication claims must match the root manifest state. A withdrawn release is
  // not allowed to survive as an install link or be described as the current release.
  const rootManifest = read('install-manifest.json');
  let publication: { status?: unknown; releaseTag?: unknown; releaseVersion?: unknown } | undefined;
  try {
    publication = rootManifest
      ? (JSON.parse(rootManifest) as {
          status?: unknown;
          releaseTag?: unknown;
          releaseVersion?: unknown;
        })
      : undefined;
  } catch {
    publication = undefined;
  }
  add('root install-manifest.json publication state is readable', publication !== undefined);
  if (publication?.status === 'published' && typeof publication.releaseTag === 'string') {
    for (const f of PUBLICATION_ENTRY_DOCS) {
      const text = read(f);
      if (text === null) continue;
      const tags: string[] = [];
      for (const mm of text.matchAll(CURRENT_RELEASE_RE)) {
        const t = mm[1] ?? mm[2];
        if (t) tags.push(t);
      }
      const wrong = [...new Set(tags)].filter((t) => t !== publication.releaseTag);
      add(
        `${f}: current release label matches ${publication.releaseTag}`,
        wrong.length === 0,
        wrong.join(','),
      );
    }
  } else {
    add(
      'root manifest is an explicit no-public-ZIP state',
      publication?.status === 'unpublished' &&
        publication.releaseTag === null &&
        publication.releaseVersion === null,
    );
    for (const f of PUBLICATION_ENTRY_DOCS) {
      const text = read(f);
      if (text === null) continue;
      add(`${f}: states that host ZIPs are not published`, text.includes('尚未发布'));
      add(`${f}: has no deleted release download URL`, !DELETED_RELEASE_DOWNLOAD.test(text));
      add(
        `${f}: does not advertise v0.1.3 as current`,
        !/GitHub Release\s*`?v0\.1\.3`?/.test(text),
      );
    }
  }

  // D3: user docs must not ship an incomplete "chart now" prompt (missing tz/lat-lon).
  for (const f of [
    'INSTALL.md',
    'docs/INSTALL_BY_PLATFORM.md',
    'docs/WORKBUDDY.md',
    'docs/installers/codex.md',
    'docs/installers/qoder.md',
    'docs/installers/workbuddy.md',
    'docs/installers/doubao.md',
  ]) {
    const text = read(f);
    if (text === null) continue;
    add(`${f}: 无不完整排盘示例(出生在X的盘)`, !BAD_CHART_PROMPT.test(text));
  }

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) {
    process.stdout.write(
      `[${c.ok ? 'PASS' : 'FAIL'}] ${c.name}${c.detail ? ` (${c.detail})` : ''}\n`,
    );
  }
  process.stdout.write(
    `\n${checks.length - failed.length}/${checks.length} doc-consistency checks passed.\n`,
  );
  if (failed.length > 0) process.exit(1);
}

main();
