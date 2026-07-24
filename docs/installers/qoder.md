# Qoder / Qoder CN 安装器指令（完整排盘版）

> 供 `INSTALL.md` 的自动安装协议调用。宿主：Qoder / Qoder CN。能力：完整排盘（`full`）。

## AI 执行步骤（Qoder 内置 Agent 全程代为文件安装；普通用户只发一句安装链接，不敲任何命令、不需任何命令行工具）

1. 判断当前是 Qoder 还是 Qoder CN（二者安装方式一致）。
2. 从清单取 `ming-engine-qoder.zip` 的 `downloadUrl` 与 `sha256`；下载并校验 SHA-256（不一致立即中止，不写入）。
3. 校验 zip 只有一层顶层目录 `calculate-birth-charts/`（防双层目录 / Zip Slip；异常即中止）。
4. 解压到临时目录，再**仅替换**用户技能目录 `~/.qoder/skills/calculate-birth-charts/`：
   - 只替换该目标目录；**不删除也不触碰** `~/.qoder/skills` 下的其它技能；
   - 下载 / 校验 / 解压 / 写入任一步失败都**失败不覆盖旧版**（保留已装好的上一版本）；
   - 用户无需手动复制文件、无需找目录、无需理解任何安装命令。
5. 刷新 / 重载 Skills，确认 `calculate-birth-charts` 可见；若 Qoder Desktop 无刷新能力，则提示用户重启 Qoder 或新开一个对话一次。
6. 运行安装自检（`node scripts/ming-chart.mjs verify`，由 Agent 执行），返回 `ok:true` 即引擎就绪。
7. 一句话反馈成功。

> 完整排盘真实依赖本机 Node.js ≥ 22。若缺 Node：明确告知“完整排盘需要 Node.js ≥ 22”，给一个简短动作（到 nodejs.org 安装）；不要安装任何命令行工具、不做全局 npm 安装、也不静默降级为只解读版。
> 仅当宿主不允许 Agent 写入用户技能目录时，才展示手动备用方案（用户把单层 `calculate-birth-charts/` 文件夹放入 `~/.qoder/skills/` 并重启 Qoder）——该备用方案同样不需要任何命令行工具。

## 权限（至多一次）

- 首次运行排盘脚本时 Qoder 可能请求“允许运行本地 node”，这是唯一可能的授权点，引导用户点“允许”。
- 若 Qoder 缺少 Node、脚本执行或文件写入权限：只请求一次必要授权；未获授权时**不要伪造“已安装成功”**，如实说明并在授权后继续自动完成。

## 自检指令

> 男，公历 1990-06-15 14:20（时间准确，示例·虚构人物，非真实个人信息），出生地 示例城市，时区 Asia/Shanghai，纬度 30.00、经度 120.00，帮我看事业。

## 一句话反馈模板

> 已安装完整排盘版（Qoder）。输入 `/calculate-birth-charts` 或直接说需求即可；卸载说“帮我卸载 Ming Engine”。

## 检查版本

- 说“检查 Ming Engine 版本”：AI 运行 `node scripts/ming-chart.mjs version` 读取 `~/.qoder/skills/calculate-birth-charts/BUILD_MANIFEST.json`，回报真实已装版本（engineVersion / releaseVersion / releaseTag / 是否 legacy / 是否双层目录），不靠猜、不等于“线上最新”。

## 更新 / 卸载

- 更新：说“帮我更新 Ming Engine”。AI 读线上 `install-manifest.json` 取目标版本 → 下载不可变 tag 资产并校验 SHA-256 → 校验单层 → 解压临时目录 → 运行 `node <临时目录>/calculate-birth-charts/scripts/ming-chart.mjs migrate --host qoder --source <临时目录>/calculate-birth-charts` 仅替换 `~/.qoder/skills/calculate-birth-charts`（清理 legacy RC 双层、失败自动回滚，不碰其它技能）→ 运行 `version` 复核并回报 before→after。下载失败 / SHA 不一致 / Release 不存在即明确失败并停止，不因本地旧包说“已是最新”。全程 Agent 文件操作，无需任何命令行工具。
- 卸载：说“帮我卸载 Ming Engine”，或在技能管理中删除 `calculate-birth-charts`。
