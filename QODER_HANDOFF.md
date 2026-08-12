# 璇玑玉衡（Loom of Heaven）Qoder 项目交接

> 当前发布版本：`v0.4.0`
> 用户可见 Skill：`xuan-ji-yu-heng`
> 仓库：<https://github.com/Jowitt13/loom-of-heaven>

## 1. 当前产品，不是早期建设计划

璇玑玉衡是一个可移植、完全离线、确定性的四体系命盘计算引擎，打包为可由 Qoder、Codex、WorkBuddy 和豆包电脑版调用的 Skill。

| 体系 | 当前能力 |
| --- | --- |
| 西方占星 | 本命盘、行星、宫位、相位、上升/中天、逆行、恒星黄道与受限精度的真交点/小行星 |
| 四柱八字 | 四柱、藏干、十神、纳音、起运/大运，以及有来源的旺衰、格局、喜用神、神煞、刑冲合害与吉凶事实 |
| 紫微斗数 | 十二宫、星曜、亮度、四化、三方四正与大限/小限/流年/流月/流日/流时运限盘 |
| 印度占星（有界） | Lahiri 恒星黄道、本命盘、两种交点模式、全宫制、Nakshatra/Pada、Panchanga、D1/D9 与引擎返回时可用的 Vimshottari |

**产品铁律：模型负责收集输入、调用工具与组织语言；所有天文、历法、干支、星曜、规则与解读事实都必须由随 Skill 发布的 CLI 计算。** 模型不得自行计算或补全缺失值。

## 2. 用户与安装入口

- 对 Qoder 用户：发送 `https://raw.githubusercontent.com/Jowitt13/loom-of-heaven/main/INSTALL.md`，由 Agent 识别宿主、读取发布清单、下载不可变 Release 资产并校验 SHA-256。
- Qoder 完整包已发布于 GitHub Release `v0.4.0`。下载地址与校验值以根目录的 `install-manifest.json` 和 `SHA256SUMS.txt` 为唯一准据；不得拼接、猜测或复用旧版本 URL。
- 运行已发布包需要 Node.js >= 22；开发本仓库需要 Node.js >= 24。发布包自包含，不应执行 `npm install`，也不应访问网络。
- 当前 `render` 命令**暂时关闭**：它返回稳定的 JSON 提示并以退出码 3 退出。交付结构化 `calculate` / `interpret` 结果，不得承诺 HTML/SVG 报告。

安装、升级、迁移与失败处理的权威流程见 [`INSTALL.md`](INSTALL.md) 和 [`docs/installers/qoder.md`](docs/installers/qoder.md)。

## 3. 运行时工作流

唯一稳定入口是 Skill 目录下的 `scripts/loom-chart.mjs`。参数使用数组和 JSON 文件传递，绝不把用户输入拼成 shell 命令。

```bash
cd skills/xuan-ji-yu-heng
node scripts/loom-chart.mjs doctor
node scripts/loom-chart.mjs normalize --input-file birth-input.json --output-file normalized.json
node scripts/loom-chart.mjs calculate --input-file birth-input.json --systems all --output-file chart.json
node scripts/loom-chart.mjs interpret --input-file birth-input.json --output-file interpretation.json
```

收集且确认计算所需的字段：历法、当地日期、当地时间（或明确未知）、时间精度、IANA 时区、经纬度；按规则需要时再收集性别规则、闰月、DST 歧义与系统设置。不要收集姓名或人生经历，也不要在日志、fixture 或 Git 中写入真实出生信息。

- 完整技术排盘：运行 `calculate --systems all` 和 `interpret`，如实保留所有 warnings。
- 单一主题解读：运行 `answer-plan`，只使用返回的 `selectedFacts` 和允许的事实 ID；成文前按 Skill 规定执行 `validate-answer` 与 `lint-reading`。
- 时间未知：必须照实降级，不能伪造上升、宫位、时柱、紫微时辰字段或印度占星的时间依赖字段。
- 印度占星默认交点模式为 `vedic.nodes: "mean"`；可显式选择 `"true"`。其高精度说法仅适用于记录在案的 Swiss-only 外部数值参照 fixture，Swiss Ephemeris 不在发布包或运行时执行。

完整输入、输出、叙述与安全契约以 [`skills/xuan-ji-yu-heng/SKILL.md`](skills/xuan-ji-yu-heng/SKILL.md) 和同目录 `references/` 为准。

## 4. 面向用户的表达边界

- 用于传统文化、娱乐和自我反思，不宣称科学验证的预测能力。
- 不输出确定性的医疗、法律、投资或生死建议；不将趋势描述为必然结果或统计概率。
- 对普通主题问题，默认交付自然、具体的连续文本，不暴露原始 fact ID、规则 ID、来源面板、警告代码、固定免责声明或自动追问菜单。
- 用户明确要求技术细节时，才提供对应的事实、规则和限制；仍不得编造 CLI 未返回的内容。

## 5. 开发、验证与发布

本仓库是 pnpm monorepo，发布物由 `tools/build-skill.ts` 构建到 Skill 中的 `scripts/dist/engine.mjs`。常用验证命令：

```bash
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
pnpm run verify:cloud
```

`verify:cloud` 是 GitHub Actions 的可复现、非敏感门禁，覆盖格式、导入边界、类型、测试、构建、Skill 与文档校验、干净目录离线 smoke/forward test、宿主安装包、依赖/许可证/SBOM/通用 secret 扫描。受控本地的 `verify:all` 会额外执行 fail-closed 的 `scan:incident`；缺少其私密 token 文件时失败是预期安全行为，不能绕过、上传或写入 CI。

代码、规则、发布包或可见性变更前，应先阅读：

- [`AGENTS.md`](AGENTS.md)：仓库总规则与当前边界
- [`README.md`](README.md)：公开能力与安装入口
- [`docs/VALIDATION.md`](docs/VALIDATION.md)：验证门禁与结果解释
- [`docs/RELEASE_CHECKLIST.md`](docs/RELEASE_CHECKLIST.md)：发布验收
- [`docs/PRIVACY.md`](docs/PRIVACY.md) 与 [`docs/LICENSE_AUDIT.md`](docs/LICENSE_AUDIT.md)：隐私、许可证和来源边界

## 6. 给接手 Qoder 的最短提示

> 先阅读 `AGENTS.md`、本文件、`README.md` 和当前 Git 状态。把 `xuan-ji-yu-heng` 视为已发布的四体系离线 Skill，而不是从零开始的早期原型。保留现有用户改动；所有计算只调用 `scripts/loom-chart.mjs`；不让模型手算或补全数据；不引入联网、遥测、未审计依赖或真实出生资料。任何改动后运行与改动范围匹配的验证；涉及发布、权限、外部服务或不可逆变更时先征得项目所有者确认。
