# Codex 安装器指令（完整排盘版）

> 供 `INSTALL.md` 的自动安装协议调用。宿主：Codex（及任何读取 `AGENTS.md` 的工具）。能力：完整排盘（`full`）。

## AI 执行步骤

1. Codex 直接使用仓库，**不依赖 GitHub Release 资产**。
   - 若用户本地已有仓库目录，直接在 Codex 中打开该项目；
   - 否则引导用户克隆或下载：`https://github.com/Jowitt13/ming-engine`。
2. Codex 自动读取仓库根目录的 `AGENTS.md` 与 `skills/calculate-birth-charts/`。
3. 引擎使用预构建的 `scripts/dist/engine.mjs`，无需安装依赖。
4. 自检：用下方一句话触发一次，返回三盘（西方 / 八字 / 紫微）即成功。

## 权限

- 需要本地 Node.js ≥ 22 运行 `node scripts/ming-chart.mjs`。首次运行若提示授权，允许即可。

## 自检指令

> 男，公历 1990-06-15 14:20（时间准确，示例·虚构人物，非真实个人信息），出生地 示例城市，时区 Asia/Shanghai，纬度 30.00、经度 120.00，帮我看事业。

## 一句话反馈模板

> 已安装完整排盘版（Codex）。直接对话即可排盘 / 解读；卸载删除仓库文件夹即可。

## 更新 / 卸载

- 更新：说“帮我更新 Ming Engine”，或重新拉取 / 下载仓库覆盖原文件夹。
- 卸载：说“帮我卸载 Ming Engine”，或删除克隆 / 解压出的仓库文件夹。

## 与其他平台差异

- Codex 走仓库（不依赖 Release）；Qoder / WorkBuddy 走 zip 完整版；豆包为 reading-lite（不能自行排盘）。
