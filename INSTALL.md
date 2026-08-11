# Loom of Heaven 跨平台自动安装入口

这是 Loom of Heaven 的跨平台自动安装入口。请先识别当前宿主为 Codex、Qoder、Qoder CN、WorkBuddy 或豆包电脑版，再按对应流程安装。不要把 Lite 版误称为完整排盘版。

---

## 给用户：你只需要做一件事

把下面这一句复制发给你的 AI（Qoder / WorkBuddy / 豆包电脑版 / Codex 均可）：

> 帮我安装这个技能：https://raw.githubusercontent.com/Jowitt13/loom-of-heaven/main/INSTALL.md

然后你只需要：

1. 发这一句话；
2. 如果 AI 请求一次系统权限（例如允许运行本地脚本或允许导入技能），点“允许”；
3. 等 AI 如实回复结果：已安装，或“该平台安装包尚未发布”。

你**无需**懂终端命令、文件路径、解压 zip，也**无需** pnpm、Git 或源码构建。运行需要本机 Node.js ≥ 22（宿主通常已具备；若提示找不到 node 请先装）。

---

## 给宿主 AI：自动安装协议（请严格按顺序执行）

1. **识别当前宿主**：判断你运行在 Codex、Qoder / Qoder CN、WorkBuddy（桌面端 / OpenClaw）还是豆包电脑版。若无法确定，走下方“平台未知”规则。
2. **读取清单**：抓取 `https://raw.githubusercontent.com/Jowitt13/loom-of-heaven/main/install-manifest.json`。
3. **选择平台并先检查可用性**：在 `platforms[]` 中选 `host` 等于当前宿主的项；先读取 `published`、`capability`、`downloadType` 与 `installer`。在确认 `published` 为 `true` 前，**不得**读取、猜测或使用 `downloadUrl`、`sha256`。
4. **未发布时立即停止**：若所选平台 `published` 不是 `true`，明确告诉用户“该平台安装包尚未发布”，不要下载、不要校验、不要运行安装器、不要用本地旧包或缓存冒充最新版。Codex 的 `repo` 来源仅在仓库已公开且可访问时可继续；仓库未公开时同样停止并说明尚不可公开安装。
5. **仅对已发布平台校验来源与完整性**：
   - 下载地址必须以 `https://github.com/Jowitt13/loom-of-heaven` 或 `https://raw.githubusercontent.com/Jowitt13/loom-of-heaven` 开头，**不得**从任何第三方 URL 下载；
   - release 资产地址必须指向不可变版本 tag（形如 `/releases/download/<tag>/…`），**不得**使用 `latest/download`；
   - 下载后计算 SHA-256，必须与该平台的 `sha256`（并可对照 `SHA256SUMS.txt`）**完全一致**。
6. **按宿主原生方式安装**：严格遵循对应的安装器指令文件（见 `installer` 字段，即 `docs/installers/<host>.md`）。不要把复杂步骤、终端命令或路径抛给用户。
7. **最小权限**：仅在确有需要时，向用户申请**一次**最小权限（如允许运行本地 `node`、允许导入技能）；不要反复索权，也不要索取无关权限。
8. **刷新技能**：安装后刷新 / 重载宿主的 Skill 列表，确认技能可见。
9. **自检**：full 版跑 `engineSelfCheck`（`node scripts/loom-chart.mjs verify`，返回 `ok:true`，无需出生资料、不猜坐标）；如需演示可用 `userDemoPrompt`（已含完整时区/经纬度）。reading-lite 版确认可接收 facts 并生成解读。
10. **一句话反馈**：告诉用户四件事——是否安装成功；装的是**完整排盘版**还是 **reading-lite（解读辅助版）**；如何调用；如何卸载。

用户可见流程最多为：发一句安装请求 →（仅在已发布且确有需要时）至多确认一次权限 → AI 如实回复“已安装，可直接使用”或“安装包尚未发布”。

---

## 安装规则（硬约束，任何一条不满足都不能继续）

- **未发布 / 404**：当所选平台 `published` 不是 `true`，或已发布资产下载返回 404 时，必须明确告诉用户“安装包尚未发布”。根清单是唯一可用性来源；已发布资产也必须以清单中的不可变 tag 与 SHA-256 为准。**不得伪装安装成功，不得下载 404 占位。**
- **SHA-256 不一致**：立即**拒绝安装**，提示用户重新下载或核对来源，绝不安装未通过校验的文件。
- **平台未知**：如实说明“暂不支持在该宿主自动安装”，引导用户查看 `docs/INSTALL_BY_PLATFORM.md` 手动安装，**不强行安装**。
- **安装失败**：只给用户**一步修复动作**（一句话，例如“请先安装 Node.js ≥ 22 再重试”），不要倒出长篇教程。
- **只认本仓库来源**：所有下载地址必须来自 `github.com/Jowitt13/loom-of-heaven` 或其 `raw.githubusercontent.com` / GitHub Release，禁止任意第三方 URL。
- **能力级别以清单为准**：以 `platforms[].capability` 为准告知用户；**不得把 `reading-lite` 版本误称为完整排盘版**。当前四个宿主均为 `full`（完整排盘）。

---

## 平台分流一览

| 平台             | 能力级别 | 包 / 来源                   | 安装器指令                     |
| ---------------- | -------- | --------------------------- | ------------------------------ |
| Codex            | 完整排盘 | 仓库（已公开）              | `docs/installers/codex.md`     |
| Qoder / Qoder CN | 完整排盘 | GitHub Release `v0.4.0` ZIP | `docs/installers/qoder.md`     |
| WorkBuddy        | 完整排盘 | GitHub Release `v0.4.0` ZIP | `docs/installers/workbuddy.md` |
| 豆包电脑版       | 完整排盘 | GitHub Release `v0.4.0` ZIP | `docs/installers/doubao.md`    |

> 四个宿主均为完整版，使用同一份预构建引擎 `scripts/dist/engine.mjs`，排盘输出一致（真机已验证）。
> `reading-lite`（无引擎、需外部 facts）作为未来“不能运行脚本”宿主的降级模式保留（见 `docs/HOST_COMPATIBILITY.md`）。

---

## 检查版本 / 更新 / 卸载（同样一句话）

- 检查版本：**“检查 Loom of Heaven 版本”** — AI 运行 `node scripts/loom-chart.mjs version` 读取本地 `BUILD_MANIFEST.json`，回报真实**已装**版本（engineVersion / releaseVersion / releaseTag / 是否 legacy / 是否双层目录），不靠猜、不等于“线上最新”。
- 更新：**“帮我更新 Loom of Heaven”** — AI 先读线上 `install-manifest.json` 取目标版本，下载不可变 tag 资产并校验 SHA-256，解压后用 `node scripts/loom-chart.mjs migrate` 原子替换旧包（含清理 legacy RC 双层目录、失败自动回滚），再回报 before→after（旧 tag / 新 tag / 新 SHA-256 / 最终 BUILD_MANIFEST）。下载失败 / SHA 不一致 / Release 不存在即明确失败并停止，不因本地旧包或缓存说“已是最新”。
- 卸载：**“帮我卸载 Loom of Heaven”** — AI 会在技能管理中删除，或删除已放置的技能文件夹。

---

## 当前分发状态

根清单当前为 `status: "published"`：安装包来自 GitHub Release `v0.4.0`，已提供 Qoder / WorkBuddy / 豆包电脑版的 ZIP、不可变下载地址与 SHA-256。安装器必须先检查所选平台的 `published`，再下载和校验；不能引用历史下载地址或要求用户手动寻找旧包。

- **Codex**：可直接克隆 / 下载公开仓库使用（不依赖 Release）。
- **Qoder / WorkBuddy / 豆包电脑版**：完整排盘包已按当前清单发布；更新时仍必须下载清单指定的不可变资产并校验 SHA-256。

> 后续发布必须使用新的不可变 tag 与独立 ZIP；创建 Release、上传资产并完成重下 SHA-256 校验后，才可更新清单。不得使用 `latest/download`，不得复用已撤下的历史发布地址。

## 从 v0.1.x 迁移到 v0.2.0

v0.2.0 的主要变化：

1. **西方宫制规则版本**：默认 rulesetId 从 `western-tropical-placidus@0.1.0` 升级为 `western-tropical-placidus@0.2.0`。Koch 宫制计算已修正（旧版有最大 36° 偏差）。显式传入旧 `@0.1.0` 将返回 `RULESET_UNSUPPORTED` 错误，不会静默映射也不会继续计算错误结果。迁移方法：删除输入中的 `rulesetId` 字段（使用默认值），或显式改为 `western-tropical-placidus@0.2.0`。
2. **validate-answer 契约**：仅接受 `reading-draft/v2`；v1 返回 `UNSUPPORTED_CONTRACT_VERSION`。迁移方法见 `references/answer-contract.md`。
3. **引擎版本**：engineVersion 从 0.1.1 升至 0.2.0（Koch 宫制修正 + Swiss Ephemeris 独立金标覆盖）。

已发布的 v0.1.x Release 保持不变，作为历史可复现边界。

## ZIP 解压安全配额

所有宿主 Agent 在解压安装包时必须执行以下配额检查（基于 inflate 前的 central directory 元数据）：

| 配额                         | 值         | 作用                     |
| ---------------------------- | ---------- | ------------------------ |
| MAX_ZIP_FILE_BYTES           | 2,000,000  | 压缩 ZIP 文件大小上限    |
| MAX_ZIP_ENTRIES              | 100        | 条目数上限               |
| MAX_SINGLE_FILE_BYTES        | 8,000,000  | 单文件解压大小上限       |
| MAX_TOTAL_UNCOMPRESSED_BYTES | 12,000,000 | 总解压大小上限           |
| MAX_COMPRESSION_RATIO        | 20         | 单条目最大压缩比         |
| ALLOWED_METHODS              | {0, 8}     | 仅允许 stored 和 deflate |

任一违规必须**立即拒绝整个 ZIP**，不得“过滤后继续”。若宿主 Agent 无法执行某项检查，必须停止安装并报告失败，不得降级或绕过。

此配额已在 `tools/lib/zip.ts` (`extractZipSafe`) 中实现并经过合成测试验证，保护的是仓库工具链的 ZIP 提取过程。桌面端 Agent 下载/解压的端到端执行边界作为后续设计项单独确认。

extractZipSafe 安全属性：

- 文件入口 `extractZipFileSafe`：先 stat 文件大小，超出 maxZipFileBytes 立即拒绝后才读取
- 文件入口 `readZipFileSafe` / `extractZipFileSafe`：先 lstat 确认普通文件且大小 <= maxZipFileBytes 后才读取
- inflate 前元数据预检（CD/local header 完整一致性、拒绝加密/data descriptor/multi-disk/ZIP64；本项目受支持的简化 ZIP 子集严格要求 CD 恰好结束于 EOCD，不允许任何间隙或重叠）
- inflate 使用 maxOutputLength 按声明值封顶，防止伪造小 uncompSize + 真实大流超额分配
- destDir 必须不存在（lstatSync 拒绝 symlink/junction/已有目录；父目录必须预存在）
- 原子 staging：mkdtempSync 创建同父目录 sibling → 单次目录级 rename，失败无残留
