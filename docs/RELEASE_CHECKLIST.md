# 发布验收清单（Release checklist）

目的：把 v0.1.1–v0.1.5 历轮发布中反复出现的验收判据固化为受版本控制的清单。每一项都对应仓库
中已存在的命令（`package.json` scripts 或 `tools/` 下的脚本），本清单不引入任何新脚本或自动化；
发布、推送、建 Release 均需用户逐次明确授权（见 [AGENTS.md](../AGENTS.md)）。

术语：**候选包** = `pnpm run package:hosts` 写入 gitignored 的 `releases/<CANDIDATE_DIR>/`
（`CANDIDATE_DIR` / `CANDIDATE_RELEASE_TAG` 定义在 `tools/lib/host-config.ts`）；**根清单** =
已提交的根 `install-manifest.json` / `SHA256SUMS.txt`，只允许 `promote:release` 覆写。

## A. 发布前（创建 GitHub Release 之前，全部必须通过）

- [ ] **A1 工作树干净**：`git status --porcelain` 输出为空（无未提交改动、无未跟踪文件）。
      这是清单中唯一不对应仓库脚本的项，使用 git 自带命令，不是新发明的工具。
- [ ] **A2 完整本地门禁绿色**：`pnpm run verify:all` exit 0（= `verify:cloud` 17 阶段 +
      `scan:incident`；令牌文件缺失时 fail-closed 属设计行为，不得绕过）。发布或可见性变更前
      另跑一次 `pnpm run scan:incident:history`（见 [VALIDATION.md](./VALIDATION.md)）。
- [ ] **A3 候选包新鲜且自验通过**：依次 `pnpm run package:hosts` →
      `pnpm run verify:hosts`（解包真实 ZIP：单一顶层目录、无双层嵌套、engine 与 canonical
      字节一致）→ `pnpm run verify:install`（候选/发布边界诚实一致）。需要在 Node 22 运行底座
      上冒烟时用 `pnpm run verify:zip-runtime -- --host <codex|qoder|workbuddy|doubao>`。
- [ ] **A4 候选包与真机测试包一致**：真机实测的每个 ZIP 的 SHA-256 必须逐一等于
      `releases/<CANDIDATE_DIR>/SHA256SUMS.txt` 及同目录 `install-manifest.json` 中记录的值
      （Windows 用 `Get-FileHash -Algorithm SHA256`，macOS/Linux 用 `shasum -a 256`）。真机
      测试之后若重跑过 `package:hosts`，真机证据即作废，必须用新 ZIP 重测。
- [ ] **A5 多宿主真机证据齐全**：四个宿主（codex / qoder / workbuddy / doubao）各自从 A4
      核对过哈希的 ZIP 安装后，在宿主内真实跑通 `node scripts/ming-chart.mjs doctor` 与
      `node scripts/ming-chart.mjs verify`（Skill 自带命令），并留存去标识化证据——绝不含
      真实姓名、出生时间或地点（黄金规则）。

## B. 发布（逐次用户授权）

- [ ] **B1 创建不可变 Release**：用户明确授权后，为 `CANDIDATE_RELEASE_TAG` 创建 GitHub
      Release，上传候选目录内全部 ZIP 与 `SHA256SUMS.txt`（`gh release create`，与
      `tools/verify-published-release.ts` 使用同一 gh CLI）。tag 不可变，绝不使用
      `latest/download` 形式的链接。

## C. 发布后（提升根清单之前）

- [ ] **C1 重新下载 Release 资产逐个复验 SHA-256**：
      `pnpm run verify:published-release -- --tag vX.Y.Z`（需 gh 登录 + 网络）。exit 0 =
      完整性通过且全部 LF 可复现；exit 2 = 完整性通过但存在换行遗留（如实上报，不算 pass）；
      exit 1 = 完整性失败——立即停止，不得进入 C2。
- [ ] **C2 提升根清单**：仅在 C1 完整性通过后执行
      `pnpm run promote:release -- --confirm-published`（唯一允许覆写根
      `install-manifest.json` / `SHA256SUMS.txt` 的工具，且刻意不在 `verify:all` 内）。在同一
      受审改动中更新 `tools/lib/host-config.ts` 的 `PUBLISHED_RELEASE_VERSION` /
      `PUBLISHED_RELEASE_TAG`，然后重跑 `pnpm run verify:install` 与 `pnpm run verify:all`
      通过后再提交。

## 附注

- 若一轮发布改变了测试计数，`docs/STATUS.md` 与 `docs/VALIDATION.md` 中的
  `N tests / M files` 只能来自一次真实运行，绝不手工编辑；`pnpm run check:doc-counts`
  会校验漂移。
- 本清单只固化验收判据，不改变任何门禁或发布脚本的行为；命令语义以对应脚本源码为准。
