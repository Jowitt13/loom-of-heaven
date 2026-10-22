# Codex 安装器指令（完整排盘版）

> 供 `INSTALL.md` 的自动安装协议调用。宿主：Codex（及任何读取 `AGENTS.md` 的工具）。能力：完整排盘（`full`）。

## AI 执行步骤

1. Codex 直接使用仓库，**不依赖 GitHub Release 资产**。
   - 若用户本地已有仓库目录，直接在 Codex 中打开该项目；
   - 仓库当前已公开，可引导用户克隆或下载：`https://github.com/Jowitt13/loom-of-heaven`；若将来不可访问，明确说明当前没有公开安装路径并停止。
2. Codex 自动读取仓库根目录的 `AGENTS.md` 与 `skills/xuan-ji-yu-heng/`。
3. 引擎使用预构建的 `scripts/dist/engine.mjs`，无需安装依赖。
4. 在技能目录运行 `node scripts/loom-chart.mjs verify`，确认 exit 0 且 `ok:true`。下方事业演示可选，不要求展示完整命盘。

## 权限

- 需要本地 Node.js ≥ 22 运行 `node scripts/loom-chart.mjs`。首次运行若提示授权，允许即可。

## 自检指令

> 男，公历 1990-06-15 14:20（时间准确，示例·虚构人物，非真实个人信息），出生地 示例城市，时区 Asia/Shanghai，纬度 30.00、经度 120.00，帮我看事业。

## 一句话反馈模板

> 已安装完整排盘版（Codex）。直接对话即可排盘 / 解读；卸载删除仓库文件夹即可。

## 更新 / 卸载

- 检查内容：运行 `node scripts/loom-chart.mjs version`，读取实际文件的 `contentIdentity.sha256`。源码目录无 BUILD_MANIFEST 时如实报告“不是打包安装”，不猜发布版本。
- 更新：先保护本地改动、确认目标 ref 或 ZIP；不盲目 pull、重置或覆盖脏仓库。更新后复核实际内容指纹与 `verify`。范围见 [统一指南](../INSTALL_BY_PLATFORM.md)。
- 卸载：说“帮我卸载 Loom of Heaven”，或删除克隆 / 解压出的仓库文件夹。

## 与其他平台差异

- Codex 可使用仓库；Qoder / WorkBuddy / 豆包按根清单选择公开 ZIP，并校验该包 SHA-256。源码、candidate、已装内容和已发布 Release 不可混称为“最新版”。
