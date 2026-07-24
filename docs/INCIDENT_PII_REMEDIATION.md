# 隐私事故处置记录（示例数据中的 PII）

> 本记录**不包含任何被泄露的具体值**（日期 / 时间 / 地点 / 坐标一律不复述）。仅描述范围、动作与状态。

## 概述

在示例 / 演示输入中，误写入了一名真实个人的出生信息（出生日期、精确出生时间、出生地点与坐标）。该信息随源码与多个发布物进入了公开仓库 `Jowitt13/ming-engine`。本次为**隐私事故处置**，非普通 hotfix：不以“再发一个新版本”掩盖旧内容，而是先止血、再撤下、再清理源码与历史。

## 影响范围（值不复述）

- 公开 `main` 分支的多个文件（示例输入字段）。
- `v0.1.3` 的 Qoder / WorkBuddy / 豆包公开 ZIP 内 `calculate-birth-charts/INSTALL.md`。
- 受影响的源码 tag：`v0.1.0-rc.1`、`v0.1.0`、`v0.1.1`、`v0.1.2`、`v0.1.3`。

## 已采取动作

1. **止血 — 私有化**：仓库可见性改为 `private`（已复核 `visibility=PRIVATE`）。
2. **撤下公开分发物**：删除上述 5 个 GitHub Release 及其全部资产，并删除对应远端 tag（已复核 Release 列表为空、远端无 `v0.1.*` tag）。
3. **清理当前源码 / 构建源**：将泄露字段全部替换为**明确标注 `synthetic` / 虚构 / 非真实人物**的合成示例；同步修正受影响测试的期望值；重建候选包。
4. **新增永久隐私门禁** `scan:incident`（接入 `verify:all`）：禁用字段从 gitignored 本地 token 文件读取（明文不入库、不提交、不上传），扫描范围 = tracked 文本 + 候选/发布 ZIP 解压内容 + `releases/` 构建目录 +（`--history`）全部可达 Git blob；缺 token 文件即 **fail-closed**；输出仅路径 + 命中数，**绝不回显泄露值**。另加 `incident-guard` 测试，强制示例数据声明 synthetic/fictional。
5. **清理 Git 历史**：以 `git-filter-repo --replace-text` 将泄露字段在所有可达 refs / 历史 / 受影响提交中替换为 `***REDACTED-PII***`；重写后**全历史扫描 0 命中**；已 `--force` 推送清理后的 `main`（default 分支未受保护）。
6. **未改排盘算法 / facts / schema / 引擎数值**：`engine.mjs` 的 `sha256` 保持 `d7a89b08…` 不变；改动仅限示例字符串、文档、测试期望与门禁工具。

## 验证结果（均为零命中）

| 检查                                   | 结果                         |
| -------------------------------------- | ---------------------------- |
| 源码（tracked 文本）                   | 0 命中                       |
| 全 Git 历史（所有可达 blob）           | 0 命中                       |
| 候选 / 发布 ZIP + `releases/` 构建目录 | 0 命中                       |
| `pnpm run verify:all`                  | EXIT 0（含 `scan:incident`） |
| 引擎 `engine.mjs` sha256               | 未变（`d7a89b08…`）          |

## 残留风险（必须知悉）

- **无法保证**已被他人 clone / fork / 下载，或被搜索引擎、GitHub 页面缓存的副本自动消失。
- GitHub 在垃圾回收前，仍可能通过旧 commit SHA 访问到已被取消引用的历史对象；已删除的 Release 资产、CDN 缓存可能短期内仍可达。
- 官方仓库的 default 分支、公开 Release、tag 已先行彻底止血，但上述外部副本需通过 GitHub Support 申请与时间共同处理。

## 后续

- 仓库保持 `private`；**未经新的明确授权，不重新公开、不重新发布**。
- 向 GitHub Support 提交敏感数据移除申请（模板见下）。
- 视需要由负责人通知受影响个人（本记录不含其信息）。
- 本地存在一份重写前的历史备份（`.tmp/`，gitignored、从未上传）；验证与 Support 流程完成后可删除。

## GitHub Support 敏感数据移除申请（英文模板 — 提交前不要填入任何明文 PII）

> Subject: Sensitive data (PII) removal — private repo Jowitt13/ming-engine
>
> Repository: `Jowitt13/ming-engine` (now **private**).
>
> Personal data (an individual's birth date, exact birth time, birthplace and coordinates) was
> accidentally committed as example/demo input and had reached the public default branch, historical
> commits, source tags (`v0.1.0-rc.1` … `v0.1.3`), and the release ZIP assets of those tags.
>
> Remediation already performed by us:
>
> - Repository set to private.
> - Deleted the 5 affected Releases and their tags.
> - Rewrote Git history with git-filter-repo to redact the values from all reachable objects and
>   force-pushed the cleaned `main`; a full-history scan now reports zero occurrences.
>
> Requests to GitHub Support:
>
> 1. Purge cached/stale views of the now-unreachable commit objects (old commit SHAs) so the redacted
>    data is not retrievable via direct-SHA URLs before garbage collection.
> 2. Confirm removal of the deleted Release assets from CDN/storage caches.
> 3. Advise on removing any forks that may have copied the affected commits/assets.
>
> The specific leaked values are available privately on request; we are not including them here to
> avoid re-exposing the data.
