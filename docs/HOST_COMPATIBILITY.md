# 宿主兼容性审计

> 当前分发状态：安装包来自 GitHub Release `v0.1.5`；Qoder、WorkBuddy 与豆包电脑版已有公开 ZIP。可下载性以 `install-manifest.json` 的 `published` 字段及 SHA-256 为准。
>
> 本文档记录 Ming Engine（`calculate-birth-charts`）在四个目标宿主平台上的能力与验证状态。

---

## 验证级别说明

| 级别 | 名称                     | 含义                                                                                                     | 验证方式                                           |
| ---- | ------------------------ | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| L1   | 静态包验证通过           | 发布包结构正确、SKILL.md 元数据合法、无泄漏文件、引用齐全、路径安全、打包引擎与 canonical byte-identical | `pnpm run verify:hosts` / `verify:install` 全 PASS |
| L2   | 宿主真机安装通过         | 在目标宿主成功导入 / 安装，管理界面可见                                                                  | 真机操作确认                                       |
| L3   | 宿主真机完整引擎运行通过 | 真实触发、脚本执行成功、三盘（西方 / 八字 / 紫微）输出正常                                               | 真机操作 + 输出确认                                |

> 当前 Codex / Qoder / WorkBuddy / 豆包 **均已达到 L3**（真机安装 + 触发 + 引擎执行确认）。

---

## 能力矩阵总览

| 能力维度                | Codex          | Qoder / Qoder CN                             | 腾讯 WorkBuddy              | 豆包电脑版                  |
| ----------------------- | -------------- | -------------------------------------------- | --------------------------- | --------------------------- |
| 支持本地 Skill          | 是             | 是                                           | 是                          | 是                          |
| 导入格式                | 仓库 / 文件夹  | Agent 代装（下载→校验→写入 ~/.qoder/skills） | zip 上传（技能管理）        | 文件夹 / zip                |
| 可执行脚本              | 是（Node.js）  | 是（Node.js）                                | 是（OpenClaw 独立进程）     | 是（真机确认）              |
| Node.js 运行环境        | ≥ 22           | ≥ 22                                         | ≥ 22                        | ≥ 22                        |
| 能力级别                | full           | full                                         | full                        | full                        |
| 真机验证                | L3             | L3                                           | L3                          | L3                          |
| 当前分发来源            | 仓库（已公开） | GitHub Release `v0.1.5` ZIP                  | GitHub Release `v0.1.5` ZIP | GitHub Release `v0.1.5` ZIP |
| Windows 中文 / 空格路径 | 是             | 是                                           | 是                          | 是                          |

---

## 对话式一键安装入口（raw-on-main）

用户对宿主 AI 说一句：

> 帮我安装这个技能：https://raw.githubusercontent.com/Jowitt13/ming-engine/main/INSTALL.md

宿主 AI 按 `INSTALL.md` 协议识别平台、读 `install-manifest.json`，先判断所选平台的 `published`。只有已发布平台才会按**不可变版本 tag**下载并校验 SHA-256；未发布时必须停止并如实说明。

| 宿主      | 当前安装来源                | 能力级别 | 来源类型      |
| --------- | --------------------------- | -------- | ------------- |
| Codex     | 仓库（已公开）              | full     | repo          |
| Qoder     | GitHub Release `v0.1.5` ZIP | full     | release-asset |
| WorkBuddy | GitHub Release `v0.1.5` ZIP | full     | release-asset |
| 豆包      | GitHub Release `v0.1.5` ZIP | full     | release-asset |

- 根清单当前为 `status: "published"`：安装包来自 GitHub Release `v0.1.5`，包含不可变下载地址与 SHA-256。安装器必须先检查所选平台的 `published`；为 `false` 时不读取 URL/hash、不下载、不安装。
- 静态门禁 `pnpm run verify:install`（L1）；真机安装/触发为 L2/L3。
- 版本检查：宿主 Agent 运行 `node scripts/ming-chart.mjs version` 读本地 `BUILD_MANIFEST.json` 回报真实已装版本（区分 legacy / 双层目录），不靠猜、不等于线上最新。
- 更新迁移：只有线上清单将所选平台标记为已发布时，Agent 才可下载不可变 tag 资产、校验 SHA-256 并用 `migrate` 原子替换旧包。当前更新源是 v0.1.5，不能把本地旧包或缓存称作最新版。
- 候选边界：下一候选构建只供本地验证，且始终 `published:false`；它不是公开安装源。未来发布须创建新的不可变 tag、上传 ZIP、重下验收后再更新根清单。

---

## 各宿主详细审计

### 1. Codex（及任何读取 AGENTS.md 的宿主）

- 能力：**full**。真机 **L3**。仓库已公开，宿主可克隆 / 下载仓库并读取 `AGENTS.md` 与 `skills/calculate-birth-charts/`，引擎用预构建 `scripts/dist/engine.mjs`。

### 2. Qoder / Qoder CN

- 能力：**full**。真机 **L3**：装到 `~/.qoder/skills/calculate-birth-charts`，`/calculate-birth-charts` 可触发，三盘正常，`engine.mjs` 与 canonical byte-identical；首次运行脚本授权一次。

### 3. 腾讯 WorkBuddy（桌面端 / OpenClaw）

- 能力：**full**。真机 **L3**：上传 zip 导入到 `~/.workbuddy/skills/calculate-birth-charts/`，三盘 + 63 条解读事实正常，离线无 shell；仅申请导入 / 写入 / 执行权限。

### 4. 豆包电脑版

- 能力：**full**（**真机已确认可导入技能并执行本地 Node 脚本**）。真机 **L3**：装到 `~/.agents/skills/calculate-birth-charts/`，三盘 + 跨系统解读正常。
- 说明：早期豆包脚本执行能力未确认，曾以 `reading-lite` 方式发布；真机验证脚本执行通过后升级为 `full`。facts 与 canonical byte-identical（同一 `engine.mjs`）。

---

## 能力一致性说明

四个宿主均使用**同一份** `engine.mjs`，排盘输出 **byte-identical**（`verify:hosts` 静态已证 + 真机 L3 确认）。

---

## reading-lite（保留的降级模式）

`reading-lite` 是为**未来不能运行本地脚本**的宿主保留的降级模式：不含引擎，只按 `references/reading-style.md` 规范对**外部已生成的 facts** 做解读，**不自行排盘、不伪称完整版**。其构建机制（`readingLiteSkillMd` / `SKILL_NAME_LITE`）在 `tools/lib/host-config.ts`、`tools/build-host-packages.ts` 中保留，但当前四个宿主均为 `full`，无宿主使用该模式。

---

## 如何更新各宿主能力状态

获得新的真机结果后：

1. 更新本文档对应宿主的验证级别与能力矩阵；
2. 更新 `tools/lib/host-config.ts` 中对应 `HostConfig` 的 `realDeviceVerified` / `capability` / `scriptExecution` / `releaseAsset`；
3. 重跑 `pnpm run package:hosts && pnpm run verify:hosts && pnpm run verify:install`；
4. 同步更新 `docs/INSTALL_BY_PLATFORM.md` 与 `install-manifest.json`（由 `package:hosts` 生成）。

> 若把某宿主标记为 `full`，必须有真机证据：可导入 + 能执行 Node 脚本 + facts 与 canonical byte-identical + 沙箱授权充分。不得仅改配置就宣称完整版兼容。
