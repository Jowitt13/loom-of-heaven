# Loom of Heaven 安装指南（按平台）

普通用户只需把这句发给当前宿主：

> 帮我安装这个技能：https://raw.githubusercontent.com/Jowitt13/loom-of-heaven/main/INSTALL.md

AI 按 [INSTALL.md](../INSTALL.md) 识别平台、读取根清单，只有所选平台 `published: true`
才下载不可变 tag 的包并校验 SHA-256。需要本机 Node.js ≥ 22，不需要 pnpm、构建源码或安装 MCP。
当前根清单对应安装包来自 GitHub Release `v0.4.0`；实际可用性与目标包始终以清单为准，
不猜“最新版”，不把本地 candidate 当作公开发布。

## 平台差异

| 平台             | 安装 / 更新方式                                                              | 详细协议                             |
| ---------------- | ---------------------------------------------------------------------------- | ------------------------------------ |
| Codex            | 在已选定的仓库 / 文件夹中使用；更新前保护本地改动，不盲目覆盖                | [Codex](installers/codex.md)         |
| Qoder / Qoder CN | Agent 校验包后仅替换个人技能目录；用 `migrate --host qoder` 保留失败恢复能力 | [Qoder](installers/qoder.md)         |
| WorkBuddy        | 原生导入，或协议允许的 `migrate --host workbuddy`；更新不先删旧包            | [WorkBuddy](installers/workbuddy.md) |
| 豆包电脑版       | 校验包后使用宿主导入；权限或登录不可用时如实停止，不拿其他宿主代跑           | [豆包](installers/doubao.md)         |

只保留一个可触发的同名技能；不删除整个 skills 目录、不碰其他技能。若无法自动完成，
只给一个必要的操作提示。详细步骤以表中的协议为准，不另维护一套复制教程。

## 安装后确认什么

1. 技能能在当前宿主加载，并能运行本地 Node 脚本。
2. 在实际技能目录运行 `node scripts/loom-chart.mjs verify`，确认真实 exit code 为 0 且 `ok:true`。
   这是无需出生资料的引擎自检，不要求展示三盘或四盘。
3. 运行 `node scripts/loom-chart.mjs version`。版本号表示标签，新增的
   `contentIdentity.sha256` 表示当前内容；只有与可信目标内容指纹相等，才说明这部分内容一致。
   老包没有该字段时明确说“内容身份未知”，不能仅凭同号声称更新成功。

内容指纹覆盖 Skill、CLI、引擎、smoke fixture 及 references 下的 Markdown，统一 LF 换行；
不覆盖宿主专属 INSTALL / BUILD_MANIFEST、其他元数据或用户文件，也不代替整个 ZIP 的 SHA-256。
源码目录没有 BUILD_MANIFEST 时，`version` 仍如实说明“不是打包安装”，不伪造发布版本；
指纹不可读或必要文件缺失时返回 unavailable，不猜一个完整身份。

普通事业演示只需按 Skill 执行 `answer-plan → reading-draft/v2 → validate-answer → lint-reading`，
给出当前问题的自然回答。完整命盘只在用户明确要求时展示；演示不是安装自检的前置条件。

## 更新和卸载

说“帮我更新 Loom of Heaven”或“帮我卸载 Loom of Heaven”。更新遵循对应平台协议，先校验新包、
保留旧包直到替换成功，再复核实际安装内容。原生 UI 不能安全保留 / 恢复旧版时停止说明，
不要先删旧包赌导入成功。卸载只针对本技能，并先确认目标。

源码修复、本地 candidate、已安装内容、已发布 Release 是四种状态。candidate 可以在同一候选
版本号下有不同字节，必须按精确 ZIP 校验；重新构建后不能沿用旧候选的验收记录。
本页不授权发布或 manifest promotion。

## 隐私与排错

- 找不到 node：先安装 Node.js ≥ 22，再让宿主重试。授权或技能加载失败时如实说明，不伪造成功。
- **引擎离线，宿主聊天不一定离线。** 本地计算不联网、不遥测；云端宿主可能上传消息、附件、工具
  输出并保留聊天记录。先确认宿主的数据设置和用户同意，不把“引擎离线”宣传成“聊天绝不上传”。
- 最小化出生资料及派生结果的发送，临时文件用后清理，不写入 Git 或项目日志。
- 详见 [隐私说明](../skills/xuan-ji-yu-heng/references/privacy.md)；仅供传统文化与自我反思，非科学预测。
