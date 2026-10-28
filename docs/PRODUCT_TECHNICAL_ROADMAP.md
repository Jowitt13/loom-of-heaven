# Loom product technical roadmap

- Roadmap id: `loom-product-roadmap/v3.2`
- Status: **Accepted and owner-confirmed**
- Confirmed: 2026-10-29
- Supersedes: `loom-product-roadmap/v3.1`
- Authority: product direction, technical sequencing, and slice admission
- Related: [ADR 0018](./adr/0018-structural-answer-quality-route.md),
  [ADR 0017](./adr/0017-product-technical-roadmap-and-execution-governance.md),
  [Commander protocol](./COMMANDER_PROTOCOL.md), [ADR 0016](./adr/0016-interpretable-state-and-accuracy-lab.md),
  and [Narrative Output V1](./NARRATIVE_OUTPUT_V1.md)

This is the authoritative route for new product work. `docs/STATUS.md` records historical delivery;
it does not override this roadmap. A future task may not start merely because it is technically
interesting: it must name a roadmap phase, satisfy that phase's admission conditions, preserve all
global invariants, and use the commander protocol.

## 1. Product destination

Loom is a **lightweight, deterministic, source-governed, privacy-first four-system reasoning
engine for AI agents**. It turns reproducible chart calculations into claims that retain their
fact, rule, source profile, limitation, and invalidation path, then helps a host model express those
claims as natural, specific language.

Loom is not trying to become the metaphysics product with the largest technique count. Its durable
advantage is the complete path:

```text
resolved input
  -> deterministic chart facts
  -> admitted rules and bounded judgments
  -> verifier-approved answer claims
  -> natural topic answer
  -> optional audit explanation
```

The final product should feel simple to the user while remaining inspectable internally. A default
answer explains the relevant mechanism beside the practical conclusion. It does not expose raw
ids, warning panels, a technique card, a fixed disclaimer footer, or a standard follow-up menu.

**Owner-confirmed destination (2026-10-29):** an understandable four-system traditional-reading
Skill, not merely an expert chart auditor and not a generic reality-advice assistant decorated
with one cultural reference. The current narrow career permission is a delivery boundary, not
the final product destination. Depth comes from supported mechanisms, conditions, and limits,
not more terminology, longer prose, or stronger predictions. Calculation reliability, rule
fidelity, answer fidelity, and real-world predictive validity remain different claims.

给用户的目标：提供必要的出生资料和具体问题，就能得到看得懂、能追问、有明确传统规则依据的解读；
四体系各按真实能力贡献信息，不强行统一，不用现实建议冒充命盘推导。保留离线、小运行时和隐私默认。

## 2. Positioning and explicit trade-off

Loom competes on:

- byte-identical deterministic calculation within declared versions;
- independent numerical references and honest precision scopes;
- source and school admission rather than citation decoration;
- evidence-to-rule-to-claim traceability;
- natural delivery without automatic technical clutter;
- offline, compact, portable execution and privacy by default;
- fail-closed degradation when inputs, sources, rights, precision, or rules are unresolved.

Loom does **not** compete on the number of divination techniques, a large desktop workstation,
default case-history retention, or a multi-gigabyte polyglot runtime. Technique expansion is
admitted only after the interpretation-quality loop is proven for the existing four systems.

## 3. Global invariants

Every phase and slice preserves all of these invariants:

1. The model never computes or backfills chart values. Calculation remains deterministic and
   offline.
2. A user-visible claim requires an active fact-to-rule-to-claim path. Missing evidence produces
   `unresolved`, degradation, or omission rather than invented confidence.
3. Distinct systems or schools do not vote, average, or silently lend each other terminology.
4. Cross-system synthesis records `convergent`, `conflicting`, or `incomparable` signals with their
   original mechanisms intact.
5. Default narration remains continuous prose. Audit detail is available on explicit request, not
   appended automatically.
6. Raw queries, chat transcripts, questionnaire answers, exact birth records, and model reasoning
   are not persisted by default. Any memory is separately designed, explicit opt-in, inspectable,
   deletable, and retention-bounded.
7. Psychology self-report never becomes a fact inferred from a chart. Nonclinical personality and
   clinical screening remain structurally separate from chart reasoning and from one another.
8. No generic accuracy percentage combines calculation, rules, state, narration, or traditional
   claims. Each verification layer reports its own bounded evidence.
9. Runtime remains compact and offline. A new service, network dependency, model SDK, persistent
   store, generic DAG runtime, or copyleft runtime dependency requires a separate architecture and
   license decision.
10. No task weakens tests, provenance, privacy, license, SBOM, host, install, or release gates to
    make a phase appear complete.

### 3.1 Answer presentation invariant

The default answer starts from the professional mechanism that matters and immediately gives its
concrete implication. It never prints a `讲人话` label, a fixed report template, or automatic
footer sections such as `敏感项校对`, `引擎警告`, `专业依据`, `声明`, or translated equivalents.
Structure and wording may vary naturally; the evidence, approved claim, material caveat, and
conclusion boundary may not. A caveat appears inline only when it materially changes the answer.
Technical evidence, provenance, and audit records appear only on explicit request.

### 3.2 Claim and synthesis invariant

`AnswerClaimCandidate` and `ApprovedAnswerClaim` are distinct internal states. A candidate cannot
be narrated until deterministic verification approves it. Mechanisms are referenced through
bounded `mechanismRefs`; conditions and caveats use bounded ids plus permitted parameters. V1 does
not expose a generic `confidence` field. If a bounded clarity indicator is later necessary, it is
named `ruleMatchClarity` and describes only rule-match clarity—not truth, probability, prediction,
or agreement between systems.

An answer claim belongs to exactly one chart system. Cross-system work uses a separate
`SynthesisRecord`; `cross-system` is not a chart-system value. A synthesis record preserves each
approved claim and can classify only `convergent`, `conflicting`, or `incomparable` relationships.

### 3.3 Evaluation-lab separation

The project maintains three non-interchangeable evidence programs:

1. **Reliability Lab** — deterministic calculation, rebuild, invalidation, linkage, mutation, host,
   package, and supply-chain behavior.
2. **Answer Faithfulness & Quality Lab** — structural safeguards for approved-claim fidelity,
   specificity, restraint, material-caveat retention, and natural presentation. Separately
   authorized human review, active sealed holdouts, and legacy comparisons are optional
   quality-evidence work; they do not become structural proof of answer quality.
3. **Predictive Validity Research** — separately authorized, de-identified, out-of-sample research
   into whether a traditional method carries predictive information beyond declared baselines.

The third program is research, not a normal product-release gate. Evidence from one lab never
upgrades the status of another, and no result is collapsed into one product “accuracy” number.

## 4. Authoritative phase order

The normal order is `G0 -> IQ-0 -> IQ-1 -> IQ-2 -> IQ-3 -> IQ-4 -> IQ-5 -> IQ-6 -> PLAT-1 -> DATA-1 -> EXP-1`.
Research-only or shadow-only work may run in parallel when it cannot change runtime output and does
not displace the active phase. A later phase may not be pulled forward because it is easier or more
visible.

**Current active phase.** IQ-4 correctness repair and natal-answer usability, alongside the retained
BaZi career vertical. The owner-confirmed v3.2 focus is the single work list in section 7. Proven
correctness defects and the existing-content natal-answer loop do not wait for career's source
blocker. This does not pass or waive career acceptance and does not activate IQ-5 synthesis.

### G0 — governance and security baseline

Complete the verified internal-state laboratory without bypassing repository security controls.

Required sequence:

1. classify the Mimosa commit-gate findings and separate introduced findings from legacy findings;
2. harden accepted legacy command boundaries in a dedicated, reviewable slice or record a precise
   repository policy decision—never use `--no-verify`;
3. preserve and complete P2-C's coverage matrix after the gate is legitimately clear;
4. keep P2-C development-only, synthetic-only, and outside runtime wiring.

Exit criteria: commit path passes without bypass; P2-C fixture, verifier, tests, counts, CI, and
runtime-isolation checks pass; no public capability claim changes.

### IQ-0 — structural answer-quality safeguards

Foundation scope: build de-identified structural safeguards for representative user
questions, starting with career. The public development set remains deliberately bounded to 20–30
synthetic cases; it grows only after the rubric and failure taxonomy stabilize. Record the
structural boundaries around vague prose, term dumping, unsupported facts, mechanism leaps,
contradictory systems, repeated conclusions, default footer clutter, missing conditions, jargon
without a concrete implication, and unsupported life verdicts.

The repository contains the schema, rubric, development and adversarial candidate corpus, and a
planned sealed-set metadata manifest. Deterministic checks enforce only structure, privacy,
inventory, linkage, candidate status, and runtime isolation. They do not assess prose semantics,
naturalness, utility, traditional-method correctness, prediction accuracy, or real-world validity.

Exit criteria: bounded rubric, 20–30 synthetic development candidates, adversarial candidates,
deterministic structural checks, and explicit non-claim boundaries. Human review, activation of
controlled sealed-holdout storage, and a legacy baseline are **not prerequisites for IQ-1**. They
remain an optional, separately owner-authorized Quality-Evidence Track. No structural or heuristic
gate proves interpretation quality.

#### Optional Quality-Evidence Track

If separately authorized, this track may establish controlled off-repository sealed-holdout
storage, documented human review, and a legacy comparison baseline. An inspected holdout case must
be retired into the public regression corpus and replaced; it is never silently reused as unseen
evidence. This track can produce its own bounded evidence record, but its absence never blocks
IQ-1 and its presence does not establish metaphysical truth or a generic accuracy percentage.

### IQ-1 — AnswerClaim and NarrativeTrace

Turn accepted internal state into topic-scoped `AnswerClaimCandidate` records, verify them into
`ApprovedAnswerClaim` records, and project only topic-relevant evidence. Each record binds one
system, fact evidence, rule or source profile, bounded mechanism references, practical implication,
relevant condition, caveat, dependencies, and invalidation causes. `NarrativeTrace` is internal,
transient, and regenerable; it is not chain-of-thought, a hidden user memory, or default output.

Exit criteria: candidate/approved typed contracts, deterministic topic projection, privacy checks,
invalidation tests, bounded reference resolution, and no change to default prose until a separately
admitted runtime slice.

### IQ-2 — final-answer faithfulness verifier

Verify the text actually delivered to the user against approved answer claims. The verifier must
distinguish supported, unsupported, and contradicted factual assertions, then separately detect a
professional-mechanism leap or scope overreach. It reports bounded failure categories, not an
“accuracy score”.

Exit criteria: wrong-chart swaps, leading-user contradictions, invented professional terms,
unsupported causal jumps, omitted material conditions, and forbidden footer leakage are covered
by adversarial fixtures. A second model may review but cannot be the sole gate.

### IQ-3 — structured clarification and response projection

Add a hard clarification boundary for settings and user intent that materially change the answer.
The machine surface returns bounded required questions, confirmed settings, and clarification
notes. Add a `response_view`-style projection so the narrator receives only the sections relevant
to the current topic and requested depth.

Exit criteria: no hidden default changes; unanswered material settings fail closed or degrade;
projection cannot conceal a material caveat; full internal evidence remains auditable.

### IQ-4 — correctness repair and natal-answer usability

The v3.2 current milestone is to repair evidenced wrong results and deliver one understandable
natal-answer loop from already-admitted, implemented material. The first user task is: explain
the few chart features most relevant to the question, how their traditional mechanisms are
interpreted, and what conditions limit them. Do not preselect a theme or a system as admitted
merely because a field, a dictionary, or a source title exists.

Section 7 fixes the concrete queue and completion evidence. Work follows actual dependencies:
the affected input/calculation/state path must be trustworthy before its explanation is shown,
but unrelated repairs and existing-content work need not wait for every review item. Default
system selection, output permissions and source/school admission do not change by implication.

#### Retained single-system career vertical

Prove one complete user journey in one selected, source-admitted system before expanding to four-
system synthesis: clarify the question, calculate the chart, project only relevant evidence, form
approved claims, verify the proposed answer, and deliver flexible natural prose. Career is the
first slice because it exercises ability, environment, timing, trade-offs, and practical advice
without requiring medical or clinical inference.

Exit criteria: the selected system has representative exact/approximate/unknown-time cases,
source-blocked cases, contradiction cases, four-host acceptance, and reviewed answer examples. The
result must be specific without claiming fate or scientific prediction. Within this career
vertical, other systems cannot be used to repair missing evidence. ADR 0021 and
`BLOCKED_SOURCE_ADMISSION` for reviewed-answer-examples remain in force. Completing the natal
milestone does not complete this career criterion or admit IQ-5.

### IQ-5 — cross-system synthesis

Create a traceable synthesis layer over existing four-system claims. Preserve each system's
mechanism and classify relationships only as `convergent`, `conflicting`, or `incomparable`. Never
average systems into a confidence score and never let one system repair another system's missing
evidence. Only after the single-system career slice passes may career expand to a multi-system
journey.

Exit criteria: synthetic convergence, conflict, incomparability, missing-system, and source-blocked
cases; every synthesis statement resolves to original approved claims and caveats; the multi-system
career slice passes the same answer-quality and host gates as IQ-4.

### IQ-6 — stability, optional audit, and report delivery

Prove repeated-run, cross-host, and supported-language stability over the approved-claim boundary.
Expose de-identified technical explanation only when requested: calculation convention, source,
evidence path, relevant warnings, and version chain. After answer quality is stable, add optional
structured export and then DOCX/PDF reports as separate delivery surfaces.

Exit criteria: repeated-run, host, and language comparisons retain the same approved claim set and
material caveats; default answer remains clean; audit and report reproduce those claims; no raw
sensitive input or internal reasoning is leaked.

### PLAT-1 — optional MCP facade and client configuration

Keep the Skill and stable local CLI canonical. Add a thin optional MCP facade and client-config
generator only after IQ-0 through IQ-6 are stable. The facade must call the same bundle and public
contracts, add no calculation implementation, and preserve offline behavior.

Exit criteria: compact tool surface, exact CLI parity, host configuration tests, no network or
background service requirement, and no second product truth.

### DATA-1 — opt-in local session memory

Design memory only if users demonstrably need cross-session case continuity. It is off by default,
stores the minimum de-identified artifacts, and provides consent, inspection, export, retention,
deletion, and corruption recovery. Raw query and answer retention requires a separate explicit
choice.

Exit criteria: privacy threat model, storage ADR, deletion and retention tests, no telemetry, and
no change to users who do not opt in.

### EXP-1 — controlled capability expansion

Only after the interpretation-quality loop is proven may Loom add new techniques, predictive
methods, or workstation features. Each candidate must show user demand, admissible sources and
rights, deterministic feasibility, maintenance cost, runtime impact, and independent verification.

Exit criteria: separate owner admission per capability. Tool count is never a roadmap KPI.

## 5. Parallel bounded tracks

### BaZi Reasoning 2.0

D1/D2 structures remain shadow-only until source admission and rule-profile decisions are complete.
They may improve internal evidence and evaluation in parallel, but they cannot reach
`interpretBazi`, public contracts, CLI, Skill output, or a new ruleset merely because structural
tests pass. D2-C source and rights blockers remain real blockers.

### Psychology

The independently packaged nonclinical personality surface is in **maintenance mode** during G0
and IQ-0 through IQ-6: security, correctness, privacy, source, documentation, host, and release-
integrity fixes remain admitted, but new psychology capability does not displace the answer-quality
critical path. Its source-tree candidate and publication claims remain governed by the psychology
ADR, source matrix, immutable release evidence, and manifest state. Psychology-informed narration
may later improve wording, questions, uncertainty, and action framing, but it may not infer
questionnaire answers or diagnoses from a chart. Clinical screening phases remain paused until
rights, safety kernel, qualified human review, privacy, and host gates are independently met.

### Zi Wei source governance

Zi Wei source discovery, edition binding, and rule-matrix work may proceed as research-only when it
does not change runtime output or delay the active IQ phase. An attractive library, repository, or
technique is not an admitted rule. Runtime changes require the ordinary source, school, contract,
adversarial-case, and owner gates.

### Calculation and supply-chain maintenance

Critical calculation regressions, dependency vulnerabilities, license issues, secrets, host
breakage, and release integrity may interrupt the phase order. Maintenance does not authorize a
new capability or a product-direction change.

### Dual-source career layer (C-track)

Per the owner's 2026-09-07 decision and [ADR 0020](adr/0020-dual-provenance-career-layer.md),
career guidance is composed from separately provenanced sources: a TraditionalStructureLayer
(admitted structural facts and traditional-culture background only; today exactly one narrow
ADR 0021 ten-god cultural reference — pattern/useful-god/industry remain unadmitted), a
CareerRealityLayer (only reality the user actively states — roles, skills,
goals, constraints, preferences — and the only source of career advice), and an optional future
CareerReflectionLayer (non-diagnostic, admitted per instrument by separate owner
authorization). Clinical assessment remains a fully separate capability and is never an input
to the career layer.

Governance: composition units carry a single layer tag with resolvable provenance; the
composition grammar forbids deriving career advice from traditional structure, forbids
mixed-source paragraphs, and forbids any clinical edge. C-1 (reality clarification contract) is
implemented as an internal-only, transient, deterministic contract: it accepts only
user-confirmed reality facts and emits fixed clarifying questions or a bounded
ready-for-composition marker — it produces no advice and unlocks nothing by itself. C-2
(composition/provenance contract) is implemented as an internal-only, text-free,
structure-bound composition skeleton: it consumes only ready-for-composition plans, binds
units exclusively to user-confirmed fact ids, and emits no prose or advice — it completes the
composition/provenance skeleton only and unlocks nothing by itself. C-3 (wiring the
traditional layer into career composition) remains paused until separate owner authorization and
admitted visible traditional text claims exist. For the future F layer, the owner selected the
category "owner-authored, non-psychometric, scoreless career reflection / decision cards"
(C-4A research; no external instrument adopted) and C-4B froze its admission record and
consent-lifecycle rules (`docs/CAREER_REFLECTION_ADMISSION.md`, content state
`no-items-defined`); C-4C froze the card content governance record
(`career-reflection-card-governance/v1` — six intent-level archetypes, no card content);
C-4D implemented the local consent lifecycle as an internal-only module (fixed single
consent file, atomic writes, path/traversal safety, not-started/consented/active/deleted
state machine) — still no cards, items, user flows, or runtime surfaces. C-5 needs separate owner
authorization. This track does not alter the phase order, does not change the IQ-4 exit, and
does not lift IQ-4's `BLOCKED_SOURCE_ADMISSION` for reviewed-answer-examples. Promotion to a
user-facing capability requires a future roadmap version change under §8.

## 6. Patterns deliberately adopted and rejected

Patterns approved for Loom, implemented independently and only in their named phases:

- structured clarification for material settings;
- topic/depth response projection;
- final-answer fact and claim faithfulness verification;
- explicit convergence, conflict, and incomparability;
- on-request audit cards rather than mandatory footers;
- optional privacy-governed local memory;
- optional report export and an MCP facade after core quality is stable.

Patterns rejected as product direction:

- pursuing dozens of techniques before the quality loop is proven;
- mandatory technique cards, warning panels, citations, or disclaimers in every answer;
- default persistence of raw user queries, answers, or birth records;
- a multi-gigabyte or multi-service runtime without a separately accepted need;
- interpreting test pass counts as metaphysical or predictive accuracy;
- copying AGPL or otherwise incompatible implementation code into the MIT runtime.

## 7. Slice admission and completion

A slice is admitted only when its commander prompt contains every field required by
`docs/COMMANDER_PROTOCOL.md`. The slice must be the smallest independently reviewable step that
advances one roadmap exit criterion. Research, architecture, implementation, runtime activation,
and release are separate authorization boundaries unless the accepted prompt explicitly combines
them.

“Implemented” means code and focused tests exist. “Integrated” means the intended internal or
runtime path is wired. “Verified” means all named gates passed with real evidence. “Published”
means an owner-authorized immutable release and manifest promotion exist. These states are never
used interchangeably.

### Current optimization direction — owner-confirmed 2026-10-29

**单一工作依据。** Owner 已确认“修复已证实的错误 + 做好本命问答”的方向。外部独立审查及其
WP-00 through WP-14 是问题证据与建议，不是第二份执行路线，也不整体立项。下列事项目前均为
待实施；路线固化不代表代码修复、规则准入、宿主更新或发布已经完成。

#### 1. Correctness and evidence identity — repair first

| 顺序                | 具体内容与最小边界                                                                                                                                                       | 完成标准                                                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1（第一项实施范围） | 真实公历日期校验 + 规则版本真实性。拒绝不存在的日期和虚构/退休规则版本，只接受实际实现的有限规则集合；不建设插件或通用注册框架。农历按自身规则单独验证，不套用公历修补。 | 非闰年2月29日、非法月日明确拒绝且不自动进位；合法日期保持正确；四体系合法版本通过、虚构版本拒绝，结果/计算/解释溯源记录实际执行版本，包含八字解释规则。错误不回显敏感输入；源码与 bundle 同步。 |
| 2                   | 八字节气比较与起运的时标。分离真实瞬间与日/时柱的规则钟面，不把所有柱统一改成北京时间，不借修复更换流派或历法库。                                                        | 独立交节参考前后，同一 UTC 在多时区表达时年/月符合选定交节约定；日/时仍按各自规则钟面，起运间隔有独立对照；覆盖太阳时模式与 DST。                                                               |
| 3                   | Western 恒星黄道整宫。按恒星上升所在星座建立宫头，再按同一宫头归宫，不只修显示。                                                                                         | 宫头为星座起点，水星/土星反例正确；覆盖12星座和0/360边界，热带整宫、等宫、象限制无意外回归；不外推为 Vedic 同样有错。                                                                           |
| 4                   | 请求目标时间与未知/缺失状态。目标年份独立传递；午锚不当确定出生时刻，未提供字段不当零值或“不存在”。                                                                      | 明确 `at=2036` 时，不因紫微可用性改成2026；未知时不输出可被合法补全反驳的全称否定或单点确定结论，同时保留确有依据的可用内容。                                                                   |

每个失败案例直接成为对应修复的合成回归，不先建设独立基线工程。上述顺序不要求把所有
事项合进一个 PR；八字时标与 Western 宫位等独立算法分别核验。不能靠免责声明、删反例、
放宽期望或清空全部正常结果通过。无法获得独立参考时，精确保留未证范围，不自行生成金标准。

#### 2. Existing answer-path repairs — bounded parallel work

| 内容                   | 边界与完成标准                                                                                                                                                                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 材料准入与状态传播     | `general` 不是技术内容通行证；主题与输出权限分开。未定 finding 不能变为肯定结论，但正确的否定/未定陈述不能因 `matched=false` 被一律删除。相关条件、四化与 material caveat 一起进入主题投影；错误来源不能靠换书名或 caveat 洗成获准规则。              |
| 本次计划与最终文本绑定 | 修对象/输入修订/目标时间/规则与草稿意外错配；不能只凭 `fact-1` 存在。优先复用瞬态编排与现有契约，不建默认存储、签名服务或第三套验证器。摘要只用于一致性，不是认证或出生资料匿名化。展示文字与已检查草稿同文；确定性渲染是原样转写，不是固定答案模板。 |
| 问题能力与失败恢复     | 本命背景不冒充 timing 证据；区分缺输入、未实现、来源未准入、局部不可用和内部失败。补时间无用时不诱导继续补隐私资料。局部失败与字段级候选如需改变公开契约，先明确最小迁移决定；不得暗换宫制或降低必要披露。                                            |

只按真实依赖排序：相关基础必须先修，独立的年份传递、general 过滤等不等待完整未知时间
引擎或全部审查事项。保留现有结构与措辞检查，但不声称其证明语义蕴含；蓝杯式反例是已知
边界，不能用更多正则或模型评委宣称已全面解决。

#### 3. Readable natal-answer loop — the next user milestone

首个用户任务：“根据我的出生资料，讲清楚命盘里最值得理解的几个特点，以及这些解释有什么条件。”

- 先选已有来源准入、已经实现、能支持具体解释的一小组材料，不预先放行某一整个主题或体系。
  若只有结构值、没有获准含义，诚实报告缺口，不让模型补推断；新规则另作最小准入决定。
- 自然输入，只确认影响本问题的资料；未知或约估时间明确受影响部分，不反复索取无法补充的时间。
  地点联网查询仍需明确同意；规则含义类问题不强迫收集出生资料。
- 正文直接回答问题，术语与机制、具体含义相邻，material 限制就地表达，技术依据按需展开。
  不用术语数量、字数、四体系齐全或固定段落模板定义深度；不靠现实咨询装饰命盘内容。
- 四体系是能力范围，不是四段等长答案或四份独立证明。默认体系选择保持现状；显式单体系
  投影、四体系汇合/冲突/不可比实现及新动态/关系能力，均不因本目标自动准入。
- 先用一个真实宿主和固定内容身份运行合成案例，检查准确时间、未知/边界输入、同对象追问
  与切换对象的最终回答。相关主张和必要限制可追溯，实际展示与检查文本一致，无法回答时
  下一步真实可行。再按需求扩宿主与内容；不要求重建整套四宿主包才能修一个文案或代码问题。
- 实际回答是否易懂、切题与忠实单独说明；测试全绿、用户“觉得准”、技术宿主验收不等于
  现实预测有效。人工/模型评审可提供有界证据，不新增强制评分、封闭集或模型评委项目。

#### Deferred work and preserved boundaries

- 后续维护而非当前统一前置：历史秒级时区至少诚实类型化拒绝（不得静默取整）；相位入相、
  近边界与误差来源说明、规则变体回退、紫微相关条件投影、合盘去计数/人物方向/关系类型、
  安装并发与旧双根入口、doctor/usage/隐私责任文档。按真实影响与证据做独立小修，不扩能力。
- 需进一步证据或最小设计决定：紫微闰月/晚子、Dasha实际误差、极区收敛范围、未知时间完整
  稳定/候选/不可用契约及近似区间、海外农历口径、局部失败返回形态。未验证不标成算法已错，
  未设计不全局封死其他修复；分钟采样也不自动等于连续区间稳定性的数学证明。
- 暂不做：第五种术法、综合分数/匹配排名/四体系投票、出生时间反推、C-4卡片或问卷用户流、
  临床接入、默认档案/记忆、账号/数据库/常驻服务、模型SDK、大UI、通用DAG/知识图谱。
  性能先测完整链路，不能从局部计时直接引入缓存、服务或裁剪默认计算。
- ADR 0021、C-track 隔离、D1/D2 shadow、来源/流派/权利阻断、隐私默认均不改变。格局成立、
  喜用仲裁、五行行业匹配不是首个本命样板的默认选题；career
  `BLOCKED_SOURCE_ADMISSION` 不因本命闭环、技术安装或本路线固化而解除。

#### Execution and stop conditions

每项仍只记录 goal, scope, validation, result，指出本节具体事项、用户行为和完成标准。
一项 coherent repair 一个可审查改动，复用现有测试与 commander protocol 的分级验证；
普通 bug 不新增 ADR、阶段编号、前置治理工程、重复计数或验收包格式。

方向批准不等于 blanket implementation, incompatible-contract, installation, merge, or release
approval。后续指令只在其授权交付范围内执行；新输出权限/来源规则/公开不兼容契约/隐私或
架构变化按第8节最小决定处理。阻断只约束依赖它的工作，不扩大成一串准备项目。
保留旧 worktree、真实宿主证据和用户数据；未修事项明确写未修，不重放旧证据冒充新结果。
完成本清单后停止，后续工作由实际使用问题或 owner 新请求驱动，不自动进入 IQ-5、平台或扩展。

#### Previous optimization queue — completed history

2026-10-23 的五项队列（安全更新、短答对齐、误导内容、重复工作、内容身份）已进入 main：
[PR #101](https://github.com/Jowitt13/loom-of-heaven/pull/101)、
[PR #102](https://github.com/Jowitt13/loom-of-heaven/pull/102)、
[PR #100](https://github.com/Jowitt13/loom-of-heaven/pull/100)、
[PR #103](https://github.com/Jowitt13/loom-of-heaven/pull/103)、
[PR #104](https://github.com/Jowitt13/loom-of-heaven/pull/104)。
[PR #105](https://github.com/Jowitt13/loom-of-heaven/pull/105) 的 v0.4.1 发布记录与 manifest
promotion 已在基线 `49157172c1673a07e6ca402f4c6c8d3818a4b650`。旧 Draft/pending 叙述不是当前状态。
这些是已完成交付历史，不重新执行；其技术证据不升级为回答语义证明或 IQ-4 career exit。

## 8. Roadmap change control

Changing the product destination, phase order, global invariants, default privacy, default output
surface, psychology separation, licensing direction, or runtime architecture requires all of:

1. an explicit owner decision;
2. a new or amended accepted ADR explaining the trade-off;
3. a roadmap version change and changelog entry;
4. matching updates to the commander protocol and static gate;
5. green repository verification before the new route directs implementation.

“Continue”, “next”, or executor convenience does not authorize route drift. It means: select the
next unblocked slice in this roadmap and prove its admission conditions.

## 9. Roadmap changelog

- `loom-product-roadmap/v3.2` — 2026-10-29: **version change** for the owner-confirmed
  optimization direction (amended ADR 0017). Preserve the four-system traditional-reading
  destination; broaden the current IQ-4 focus to proven correctness repair and one readable,
  already-admitted natal-answer loop alongside the retained career vertical. Replace the completed
  five-item queue with one bounded section 7 work list. First scope: real Gregorian-date validation
  plus ruleset-version authenticity. Career source admission, default systems, runtime contracts,
  privacy, IQ-5 synthesis, installation and release authority are unchanged. Freeze is not
  implementation or evidence of fixed defects; protocol, AGENTS and the existing static gate align.
- `loom-product-roadmap/v3.1` — 2026-09-09: **version change** (not a v3 amendment) for the
  default career output surface ([ADR 0021](adr/0021-ten-god-cultural-reference.md)). One frozen
  ten-god cultural reference with a short gloss is admitted; pattern/useful-god/industry and
  chart-derived career advice stay excluded. Warning materiality is per selected fact: unrelated
  SOLAR_TIME_APPROXIMATE tips leave the default body; TIME_UNKNOWN and NEAR_BOUNDARY stay always
  material. Career practices cite only user-stated reality; birth-only answers invent no work
  history and carry no action advice. IQ-4 `BLOCKED_SOURCE_ADMISSION` for reviewed-answer-examples
  is unchanged. Commander protocol and static gates updated in the same change.
- `loom-product-roadmap/v3` — 2026-09-07 amendment: adds the dual-source career layer C-track
  ([ADR 0020](adr/0020-dual-provenance-career-layer.md)) as a parallel bounded track. The phase
  order, product destination, and IQ-4's `BLOCKED_SOURCE_ADMISSION` for
  reviewed-answer-examples are unchanged; promotion to a user-facing capability requires a
  future roadmap version change (§8).
- `loom-product-roadmap/v3` — 2026-09-03: changes IQ-0 from a claimed final-answer quality
  baseline to structural answer-quality safeguards. Human review, activated sealed holdouts, and a
  legacy baseline become an optional, separately owner-authorized Quality-Evidence Track rather
  than IQ-1 prerequisites; structural evidence is explicitly prohibited from claiming semantic
  answer quality, generalization, or predictive validity.
- `loom-product-roadmap/v2` — 2026-08-29: separates Reliability, Answer Faithfulness & Quality,
  and Predictive Validity evidence; moves clarification/projection before the career vertical;
  proves career in one system before four-system synthesis; freezes candidate/approved claim and
  separate synthesis boundaries; adds sealed-holdout governance, the answer-presentation
  invariant, Zi Wei research-only routing, and psychology maintenance mode.
- `loom-product-roadmap/v1` — 2026-08-28: establishes verified-reasoning positioning, freezes the
  G0-to-EXP-1 phase order, adopts selected workflow lessons, and makes the commander protocol
  mandatory.

### Development workflow maintenance — 2026-10-22

Owner-authorized simplification: ordinary tasks use goal, scope, validation and result rather
than the long commander template. Documentation checks are lightweight; core changes use
`pnpm run check`; shared/psychology/unknown changes and main use `verify:cloud`. Tests run once,
and CI reports current totals without a documentation-count gate. This changes execution cost,
not product direction, source admission, privacy, output contracts or release acceptance.
