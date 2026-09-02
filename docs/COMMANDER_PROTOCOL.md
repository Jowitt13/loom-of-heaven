# Commander protocol

- Protocol id: `loom-commander-protocol/v3`
- Status: mandatory for all new research, architecture, implementation, integration, and release
  slices
- Governing roadmap: [Loom product technical roadmap](./PRODUCT_TECHNICAL_ROADMAP.md)
- Confirmed: 2026-09-03

This protocol keeps Codex, Hermes, GLM, Qoder, and other executors on the same route. It applies
whether one agent performs the work or a commander gives a copyable prompt to another executor.

## 1. Before a command is issued

The commander must:

1. inspect the real branch, HEAD, `origin/main`, working-tree state, active PR, and existing user
   changes;
2. read `AGENTS.md`, the product technical roadmap, this protocol, and every domain ADR or source
   matrix named by the selected phase;
3. identify the next unblocked roadmap exit criterion;
4. identify the responsible evidence program—Reliability Lab, Answer Faithfulness & Quality Lab,
   or Predictive Validity Research—and state what that evidence cannot prove;
5. separate research, architecture, implementation, runtime activation, and release unless the
   owner has explicitly authorized a combined boundary;
6. protect unrelated dirty work with an isolated worktree rather than stashing, restoring, or
   mixing changes;
7. reject any task that has no roadmap anchor or would skip an unmet prerequisite.

## 2. Required command fields

Every executor prompt must contain these exact headings:

```text
路线锚点
当前阶段与切片
验证实验室
用户价值
已核验基线
前置条件
本切片目标
精确文件白名单
精确禁止项
必须保持的不变量
输出与隐私边界
测试与验收命令
停止条件
GitHub 与发布边界
交付报告格式
```

The contents must be concrete. “Update relevant files”, “test as needed”, or “improve quality” is
not an acceptable scope.

## 3. Copyable executor prompt skeleton

```text
你是 Loom 当前切片的执行者。先只读核验，条件全部成立后才能写入。

路线锚点
- roadmap: loom-product-roadmap/v3
- phase: <G0|IQ-0|IQ-1|IQ-2|IQ-3|IQ-4|IQ-5|IQ-6|PLAT-1|DATA-1|EXP-1>
- exit criterion: <本切片推进的唯一退出条件>

当前阶段与切片
- slice id: <稳定编号>
- slice kind: <research|architecture|implementation|integration|release>
- why now: <为何它是下一项未阻塞工作>

验证实验室
- program: <Reliability Lab|Answer Faithfulness & Quality Lab|Predictive Validity Research>
- proves: <本切片能证明的有界事实>
- does not prove: <明确不能升级为何种准确率、质量或产品结论>

用户价值
- <完成后用户能获得什么，或解除什么真实风险>

已核验基线
- expected branch/head/origin-main: <精确值或发现步骤>
- dirty work policy: 保留用户改动；发现无关改动立即停止，不还原、不清理

前置条件
- <必须已合并的 PR、owner 决定、来源、许可证、安全或测试条件>

本切片目标
- <一个可独立审查的目标>

精确文件白名单
- <逐文件列出，新增/修改及职责>

精确禁止项
- <runtime、contracts、rulesets、lockfile、bundle、SBOM、Skill、release 等具体路径或行为>

必须保持的不变量
- 模型不计算命盘；离线、确定性、来源治理、隐私默认关闭持久化
- 不把不同体系投票或平均；不把测试通过率称为预测准确率
- 默认回答无固定技术尾巴；心理学与命理、非临床与临床保持隔离
- AnswerClaimCandidate 未经验证不得叙述；跨体系内容只进入独立 SynthesisRecord
- 不使用通用 confidence 表示真实性、概率或跨体系共识
- <本阶段的其他不变量>

输出与隐私边界
- 专业机制与具体结论相邻；不得显示“讲人话”标签或固定模板
- 不自动追加敏感项校对、引擎警告、专业依据、声明、免责声明或跟进菜单
- material caveat 只在影响当前结论时内联；技术审计仅应用户请求提供
- 不记录真实出生资料、原始问卷、对话、模型推理或 sealed holdout 正文

测试与验收命令
- <定点测试>
- pnpm run typecheck
- pnpm run test
- pnpm run check:doc-counts
- pnpm run format:check
- pnpm run verify:cloud
- git diff --check
- <禁止路径零漂移检查>

停止条件
- 超出白名单、基线前进、前置条件不成立、来源/权利不清、门禁需绕过、真实计数无法获得时立即停止
- 不得通过删测试、降门禁、--no-verify、伪造 fixture 或扩大权限继续

GitHub 与发布边界
- 本地验收全绿后：commit -> push -> Draft PR -> CI -> Ready -> squash merge
- 任一 CI、review、scope 或 mergeability 条件不成立则停止
- tag、GitHub Release、发布资产、manifest promotion 永远需要单独 owner 授权

交付报告格式
- 基线、精确 diff、测试真实输出、禁止路径、commit/PR/CI/merge SHA、资产状态、未授权动作声明、剩余 blocker
```

## 4. Execution rules

- One slice, one branch, one reviewable PR. Do not hide unrelated cleanup in the slice.
- Start with the smallest relevant test, then broaden verification in proportion to risk.
- A failing gate is evidence, not permission to bypass it. Classify whether the finding is newly
  introduced, pre-existing, environmental, or a false positive; resolve it in an authorized slice.
- Fixture expectations follow accepted semantics. Do not change expected output merely to match an
  implementation.
- Update documentation counts only from a real full run.
- Preserve raw warnings and provenance internally, but do not expose default warning or evidence
  panels to users.
- IQ work preserves `AnswerClaimCandidate -> ApprovedAnswerClaim -> NarrativeTrace`; a candidate
  cannot be narrated, and cross-system content is represented only by a separate `SynthesisRecord`.
- If an owner separately activates a sealed holdout, it stays outside the public repository. Once
  inspected to guide a fix, it is retired into regression material and replaced; it is never
  counted again as unseen evidence.
- Human review, an active sealed holdout, and a legacy baseline are optional Quality-Evidence Track
  work under roadmap v3. Their absence does not block IQ-1, and structural safeguards must never
  be reported as human-validated answer quality, generalization, or predictive validity.
- Default prose follows the answer-presentation invariant: professional mechanism adjacent to the
  concrete conclusion, flexible structure, material caveats inline, and no automatic footer.
- Use the exact state vocabulary: `planned`, `in-progress`, `blocked`, `implemented`, `integrated`,
  `verified`, and `published`. Do not report a later state without its evidence.
- GitHub flow defaults to commit, push, Draft PR, green CI, Ready, and squash merge when the
  approved slice explicitly includes delivery. Tags, Releases, assets, and manifest promotion are
  never implicit.

## 5. Handling “continue”

When the owner says “继续”, “下一步”, or equivalent, the commander does not invent a new direction.
It must:

1. read the current roadmap state and the previous slice report;
2. select the earliest unfulfilled, unblocked required exit criterion; optional Quality-Evidence
   Track work does not block IQ-1;
3. report the selected anchor and why later work is not yet admitted;
4. identify the evidence program and state what its result cannot prove;
5. issue one bounded executor prompt using this protocol.

If the earliest item is blocked, the commander may advance only a documented parallel bounded
track or a blocker-removal slice. It may not silently jump to technique expansion, UI, memory, or
release work.

## 6. Changing the route

An executor cannot change the roadmap. A proposed change is first reported as a decision brief
containing the current route, new evidence, options, trade-offs, migrations, and affected gates.
Only an explicit owner decision may authorize the ADR, roadmap version, changelog, protocol, and
static-gate updates required by the roadmap change-control section.

## 7. Required final report

Every completed slice reports:

1. roadmap anchor, phase, slice id, and achieved exit criterion;
2. verified baseline and final git state;
3. exact changed files and why;
4. decisions, assumptions, and non-goals;
5. focused and full test commands with real counts;
6. privacy, source, license, runtime-isolation, and forbidden-path evidence as applicable;
7. commit, push, PR, CI, Ready, merge, tag, Release, and manifest state;
8. remaining blocker and the exact next admitted slice.

The report must not upgrade Reliability Lab evidence into answer-quality or predictive-validity
claims, or upgrade Answer Faithfulness & Quality evidence into scientific prediction claims.
