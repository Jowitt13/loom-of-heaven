# WorkBuddy 安装器指令（完整排盘版）

> 供 `INSTALL.md` 的自动安装协议调用。宿主：腾讯 WorkBuddy 桌面端（OpenClaw）。能力：完整排盘（`full`）。

## AI 执行步骤（优先使用 WorkBuddy 原生导入）

1. 先读取所选平台的 `published`。若它不是 `true`：明确回复“WorkBuddy 安装包尚未发布”，**立即停止**；不得读取、猜测或请求 `downloadUrl` / `sha256`，不得下载、导入或用旧包冒充最新版。
2. 只有 `published: true` 时，才从清单取当前 WorkBuddy ZIP 的 `downloadUrl` 与 `sha256`；下载并校验 SHA-256。
3. 优先调用 WorkBuddy 自身的“添加技能 / 导入技能”能力，直接导入该 zip（OpenClaw 技能格式：`SKILL.md` + `scripts/` 位于压缩包根目录）。
4. 若对话 Agent 无法直接调起导入界面：**不要输出十几步手动说明**，只给用户一个最小动作，例如：
   > 请点击此处确认导入 loom-of-heaven-workbuddy.zip
   > 用户确认后，继续自动完成剩余步骤（启用技能 + 自检）。
5. 启用技能，刷新 Skills 列表。
6. 自检：用下方一句话触发一次，返回三盘即成功。

## 权限（最小化）

- 仅申请导入、技能目录写入、执行引擎所必需的权限；**不要**索取桌面控制、键盘控制、通讯录、邮件、浏览器自动化等无关权限。
- 终端机器需有 Node.js ≥ 22（OpenClaw 运行 `scripts/` 脚本所需）。

## 自检指令

> 男，公历 1990-06-15 14:20（时间准确，示例·虚构人物，非真实个人信息），出生地 示例城市，时区 Asia/Shanghai，纬度 30.00、经度 120.00，帮我看事业。

## 一句话反馈模板

> 已安装完整排盘版（WorkBuddy）。直接说需求即可排盘 / 解读；卸载在「Skills 管理」中删除该技能。

## 检查版本

- 说“检查 Loom of Heaven 版本”：AI 运行 `node scripts/loom-chart.mjs version` 读取 `~/.workbuddy/skills/xuan-ji-yu-heng/BUILD_MANIFEST.json`，回报真实已装版本（engineVersion / releaseVersion / releaseTag / 是否 legacy / 是否双层目录），不靠猜、不等于“线上最新”。

## 更新 / 卸载

- 更新：先读线上 `install-manifest.json`。若 WorkBuddy `published` 不是 `true`，明确说明“当前没有可更新的公开安装包”并停止；不得使用本地旧包或缓存称作最新版。只有已发布时才下载不可变 tag 资产、校验 SHA-256、校验单层、解压临时目录；若可写技能目录则运行 `node <临时目录>/xuan-ji-yu-heng/scripts/loom-chart.mjs migrate --host workbuddy --source <临时目录>/xuan-ji-yu-heng` 原子替换 `~/.workbuddy/skills/xuan-ji-yu-heng`（清理 legacy RC 双层、失败自动回滚）；若必须经「Skills 管理」界面，则先只删旧 Loom of Heaven 再导入新版、不碰其它技能；升级后只保留一个可触发 `xuan-ji-yu-heng`。随后运行 `version` 复核并回报 before→after。下载失败 / SHA 不一致 / Release 不存在即明确失败并停止。
- 卸载：说“帮我卸载 Loom of Heaven”，或在「Skills 管理」中删除该技能。
