# Ming Engine 跨平台自动安装入口

这是 Ming Engine 的跨平台自动安装入口。请先识别当前宿主为 Codex、Qoder、Qoder CN、WorkBuddy 或豆包电脑版，再按对应流程安装。不要把 Lite 版误称为完整排盘版。

---

## 给用户：你只需要做一件事

把下面这一句复制发给你的 AI（Qoder / WorkBuddy / 豆包电脑版 / Codex 均可）：

> 帮我安装这个技能：https://raw.githubusercontent.com/Jowitt13/ming-engine/main/INSTALL.md

然后你只需要：

1. 发这一句话；
2. 如果 AI 请求一次系统权限（例如允许运行本地脚本或允许导入技能），点“允许”；
3. 等 AI 回复“已安装，可直接使用”。

你**无需**懂终端命令、文件路径、解压 zip，也**无需** pnpm、Git 或源码构建。运行需要本机 Node.js ≥ 22（宿主通常已具备；若提示找不到 node 请先装）。

---

## 给宿主 AI：自动安装协议（请严格按顺序执行）

1. **识别当前宿主**：判断你运行在 Codex、Qoder / Qoder CN、WorkBuddy（桌面端 / OpenClaw）还是豆包电脑版。若无法确定，走下方“平台未知”规则。
2. **读取清单**：抓取 `https://raw.githubusercontent.com/Jowitt13/ming-engine/main/install-manifest.json`。
3. **选择平台包**：在 `platforms[]` 中选 `host` 等于当前宿主的项；读取它的 `capability`、`downloadType`、`downloadUrl`、`sha256`、`installer`、`needsUserAuth`、`engineSelfCheck`、`userDemoPrompt`。
4. **校验来源与完整性**：
   - 下载地址必须以 `https://github.com/Jowitt13/ming-engine` 或 `https://raw.githubusercontent.com/Jowitt13/ming-engine` 开头，**不得**从任何第三方 URL 下载；
   - release 资产地址必须指向不可变版本 tag（形如 `/releases/download/v0.1.3/…`），**不得**使用 `latest/download`；
   - 下载后计算 SHA-256，必须与该平台的 `sha256`（并可对照 `SHA256SUMS.txt`）**完全一致**。
5. **按宿主原生方式安装**：严格遵循对应的安装器指令文件（见 `installer` 字段，即 `docs/installers/<host>.md`）。不要把复杂步骤、终端命令或路径抛给用户。
6. **最小权限**：仅在确有需要时，向用户申请**一次**最小权限（如允许运行本地 `node`、允许导入技能）；不要反复索权，也不要索取无关权限。
7. **刷新技能**：安装后刷新 / 重载宿主的 Skill 列表，确认技能可见。
8. **自检**：full 版跑 `engineSelfCheck`（`node scripts/ming-chart.mjs verify`，返回 `ok:true`，无需出生资料、不猜坐标）；如需演示可用 `userDemoPrompt`（已含完整时区/经纬度）。reading-lite 版确认可接收 facts 并生成解读。
9. **一句话反馈**：告诉用户四件事——是否安装成功；装的是**完整排盘版**还是 **reading-lite（解读辅助版）**；如何调用；如何卸载。

用户可见流程最多为：发一句安装请求 → 至多确认一次权限 → AI 回复“已安装，可直接使用”。

---

## 安装规则（硬约束，任何一条不满足都不能继续）

- **未发布 / 404**：当 `status` 为 `unpublished`、该平台 `published` 为 `false`，或下载返回 404 时，必须明确告诉用户“安装包尚未发布”，并给出替代方案（Codex 可直接用仓库；其余平台等待发布）。**不得伪装安装成功，不得下载 404 占位。**
- **SHA-256 不一致**：立即**拒绝安装**，提示用户重新下载或核对来源，绝不安装未通过校验的文件。
- **平台未知**：如实说明“暂不支持在该宿主自动安装”，引导用户查看 `docs/INSTALL_BY_PLATFORM.md` 手动安装，**不强行安装**。
- **安装失败**：只给用户**一步修复动作**（一句话，例如“请先安装 Node.js ≥ 22 再重试”），不要倒出长篇教程。
- **只认本仓库来源**：所有下载地址必须来自 `github.com/Jowitt13/ming-engine` 或其 `raw.githubusercontent.com` / GitHub Release，禁止任意第三方 URL。
- **能力级别以清单为准**：以 `platforms[].capability` 为准告知用户；**不得把 `reading-lite` 版本误称为完整排盘版**。当前四个宿主均为 `full`（完整排盘）。

---

## 平台分流一览

| 平台             | 能力级别 | 包 / 来源                   | 安装器指令                     |
| ---------------- | -------- | --------------------------- | ------------------------------ |
| Codex            | 完整排盘 | 仓库（AGENTS.md）           | `docs/installers/codex.md`     |
| Qoder / Qoder CN | 完整排盘 | `ming-engine-qoder.zip`     | `docs/installers/qoder.md`     |
| WorkBuddy        | 完整排盘 | `ming-engine-workbuddy.zip` | `docs/installers/workbuddy.md` |
| 豆包电脑版       | 完整排盘 | `ming-engine-doubao.zip`    | `docs/installers/doubao.md`    |

> 四个宿主均为完整版，使用同一份预构建引擎 `scripts/dist/engine.mjs`，排盘输出一致（真机已验证）。
> `reading-lite`（无引擎、需外部 facts）作为未来“不能运行脚本”宿主的降级模式保留（见 `docs/HOST_COMPATIBILITY.md`）。

---

## 检查版本 / 更新 / 卸载（同样一句话）

- 检查版本：**“检查 Ming Engine 版本”** — AI 运行 `node scripts/ming-chart.mjs version` 读取本地 `BUILD_MANIFEST.json`，回报真实**已装**版本（engineVersion / releaseVersion / releaseTag / 是否 legacy / 是否双层目录），不靠猜、不等于“线上最新”。
- 更新：**“帮我更新 Ming Engine”** — AI 先读线上 `install-manifest.json` 取目标版本，下载不可变 tag 资产并校验 SHA-256，解压后用 `node scripts/ming-chart.mjs migrate` 原子替换旧包（含清理 legacy RC 双层目录、失败自动回滚），再回报 before→after（旧 tag / 新 tag / 新 SHA-256 / 最终 BUILD_MANIFEST）。下载失败 / SHA 不一致 / Release 不存在即明确失败并停止，不因本地旧包或缓存说“已是最新”。
- 卸载：**“帮我卸载 Ming Engine”** — AI 会在技能管理中删除，或删除已放置的技能文件夹。

---

## 当前发布状态

`install-manifest.json` 的 `status` 为 `published`，指向 GitHub Release `v0.1.3`（跨平台可复现打包；引擎 0.1.1，排盘数学与 `v0.1.0` 一致）。三个 zip 已上传并经 SHA-256 校验，可从 `releases/download/v0.1.3/` 下载：

- **Codex**：直接克隆 / 下载仓库使用（不依赖 Release）；
- **Qoder / WorkBuddy / 豆包电脑版**：完整排盘包，**真机安装 + 触发 + 引擎执行已验证**。

> 发布使用不可变版本 tag（当前 `v0.1.3`）与独立 zip，不复用 `latest` 或先前的预发布 tag（如 `v0.1.0-rc.1`）。已发布的 `v0.1.0`/`v0.1.1`/`v0.1.2` 保持不变（不重打、不覆盖）。
