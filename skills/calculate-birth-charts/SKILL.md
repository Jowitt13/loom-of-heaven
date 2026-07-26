---
name: calculate-birth-charts
description: Deterministically calculate Western natal charts, Four Pillars/BaZi (四柱八字), and Zi Wei Dou Shu (紫微斗数) from a birth date, local time, IANA timezone, coordinates, calendar and versioned rule profiles, then on request narrate a sourced reading with 吉凶/喜用神/大运流年 facts. Use when a user asks to 排盘、算命盘、看星盘、本命盘、占星、四柱八字、紫微斗数、真太阳时、恒星黄道、真交点、小行星、吉凶/运势/事业/感情/财运/学业解读、合婚/关系配对/正缘/结婚时机/适合行业/投资时机(1-5人)、比较流派/宫制差异，或导出结构化命盘 JSON (calculate a natal chart, BaZi, or Zi Wei chart, sidereal zodiac, synastry/relationship compatibility for up to 5 people, compare schools, export chart JSON). Do NOT use for sales/analytics "star charts"（销售星盘图、数据可视化星形图）, radar/scatter plots, or ungrounded predictive life advice.
---

# calculate-birth-charts

This Skill is the entry point and orchestrator. It does **not** compute charts with the
language model. All astronomy, calendar, ganzhi, star-placement, rule and interpretation math
is done by the bundled deterministic CLI at `scripts/ming-chart.mjs`. Your job is to gather and
confirm inputs, call the CLI, **compute every requested system in full** (how much you DISPLAY
follows the output channel — Channel A shows the full three charts; Channel B shows only the
asked topic's facts), relay its warnings honestly, and
narrate only from its output.

## Hard rules

- Never compute or guess planet positions, houses, aspects, solar terms, 干支, 十神, 起运,
  星曜, 四化, 吉凶 or 喜用神 yourself. If the CLI does not return a value, say so — do not backfill.
- Never silently assume birth place, timezone, DST fold, leap month, gender rule or school.
  Ask, or pass the user's explicit values.
- Runs fully offline. Do not fetch geocoding or any URL without separate, explicit consent;
  the user can always supply latitude/longitude and an IANA timezone by hand.
- Pass arguments via the flags below (arrays/files only). Never build a shell string from
  user text.
- 旺衰强弱 / 格局 / 喜用神 / 神煞 / 刑冲合害 / 吉凶 come from the **`interpret`** command, not from
  `calculate` / `chart.json`. Always run `interpret` and display them; **never** claim this engine
  version "does not output" them, and never hand-compute a substitute.
- **No fated verdicts.** When narrating, never write 天生/注定/必须/只能/不能-style life destiny.
  Explicitly forbidden: “天生不能打工 / 必须创业 / 不适合大厂或体制 / 必须主动求变”. Give **multiple viable
  paths + conditions + a qualitative trend (NOT a probability %)**; use only the facts' own
  `reason`/`evidence` (no invented 命理 mechanisms). 十神象义不可错位（财=回报/客户/资源/责任，技能
  与产品化看食伤；财格需真实权责与合理回报，非只靠成果；官杀藏≠排斥组织）。Keep each system's terms
  inside that system (紫微星 ≠ 八字十神); relay brightness/dignity verbatim (Zi Wei “不/平” ≠ “陷”;
  astrology 失势/detriment ≠ 落陷/fall; 水逆 ≠ 思考慢); avoid single-star verdicts; self-check for
  contradictions. See `references/reading-style.md`.

## Inputs to collect (only what calculation needs)

Required: calendar (`gregorian` | `lunar`), local date `YYYY-MM-DD`, local time `HH:mm[:ss]`
(or mark time unknown), time accuracy (`exact` | `approximate` | `unknown`), IANA timezone
(e.g. `Asia/Shanghai`), latitude, longitude. Optional: elevation, `lunarLeapMonth`,
`ruleGender` (only where a rule needs it), `dstDisambiguation` (`earlier` | `later`),
per-system rule settings (Western `zodiac: tropical|sidereal`, `ayanamsha`, `asteroids`). Do
**not** ask for name or life events. See `references/input-contract.md`.

## Workflow — identical for EVERY host model (do not shortcut)

To keep results consistent across models, the **calculation** workflow is mandatory: skipping
`calculate`/`interpret`, a system's computation, or any `warnings` is a **failed run**. The
**display** of the full three-system chart is now conditional — see step 4 (topic-first).

1. Confirm inputs and restate the local time, place, latitude/longitude, IANA timezone,
   calendar/leap month, rule gender and ruleset. Explicitly flag when the time is approximate,
   near a day/hour/solar-term boundary, or when historical DST makes the local time ambiguous.
2. Build `birth-input.json` (see `references/input-contract.md`).
3. Run `doctor`, then `normalize`. For a **full technical chart**, run BOTH `calculate --systems all`
   and `interpret`. For an **ordinary question**, run `answer-plan --topic <bounded-topic>` instead:
   it always computes all three systems internally, then returns only a de-identified `publicResult`
   and a topic-scoped `answerPlan`. Do not create or attach raw chart artifacts for an ordinary
   question. `calculate` returns the private three-system chart; `interpret` runs the sourced BaZi
   rules (旺衰强弱 / 格局 / 喜用神 / 神煞 / 刑冲合害 / 大运·流年吉凶) and cross-system facts.
4. **Choose one output channel — never front-load the three raw charts into a topic report:**
   - **Channel A — 排盘 / 原始数据 / 完整命盘 / 技术报告:** full three-system charts (step 5) + the full BaZi interpretation (step 6) + all warnings/provenance.
   - **Channel B — a single topic (事业/感情/财运/学业/流年):** use only `answerPlan.selectedFacts` and its
     `allowedFactIds`; do not read or attach `chart.json` / `interpretation.json`. The body shows
     **only the facts relevant to that topic**, with terms under a “专业依据” section. There is no
     requirement to display all three raw charts or the full 八字 fact set in a topic report.
   - Per-topic loading: 事业 → `references/reading-style.md` + `references/examples-career.md`; 感情 → `+ references/examples-love.md`; 财运 → `+ references/examples-wealth.md`; 学业/流年 → `reading-style.md`（不加载无关案例文件）。
   - **Channel B 是强制三阶段写作——第 1-5 部分与追问是无命理术语区：**
     1. 选事实（内部）：只使用 `answerPlan.selectedFacts`，并保留 `id` / `reason` / `evidence.ref` / `caveat`；**不直接给用户**。
     2. 通俗中间层（内部写作计划）：把每条事实转成 plainResult / behavior / scenario / upside / risk / action + sourceRefs（对应 `id` 与 evidence.ref）；**不改 schema、不写回输出文件**。
     3. 成文：第 1-5 部分与结尾追问**只用**通俗中间层；原始 claim/reason、干支、十神、星曜、宫位名**只允许进第 6 部分“专业依据”**。禁止把 claim 轻改后塞进核心结论；禁止括号夹带（不写“技能容易变现（食伤生财）”，写“技能和作品更容易形成收入”，依据放第 6 部分）。“甲戌大运/戊申流年”等干支移入第 6 部分，正文只留年份数字。
   - **术语防火墙 + 真实检查（lint-reading）:** 成文后，删去第 6 部分“专业依据”再检查剩余正文；只要仍出现命理术语（见 `reading-style.md` 开头清单）或顾问黑话，就必须重写。用随 Skill 发布的确定性检查器验证草稿：
     `node scripts/ming-chart.mjs lint-reading --input-file draft.md --channel topic [--simple]`
     它输出 `{ ok, violations:[{section,term,category,severity,line,replacementHint}] }`。工作流：①先把报告写入临时草稿 → ②跑 lint-reading → ③按 violations 重写（最多 2 次）→ ④通过（ok:true）才展示 → ⑤仍不过则改用更短更通俗的版本（可加 `--simple`），**绝不把未通过草稿发给用户**。检查器只指出问题，由你重写（不要机械删词，以免病句）。
   - **空话检测（category 空话）:** 第 1-5 部分不得“没有术语、却说了等于没说”。凡抽象判断（如“逐步提升竞争力/把握机会/稳中求进/需要边界/加强沟通/发挥优势/安全感”），必须在**同一句**用具体动作或可观察表现讲清楚（可用冒号、括号、“也就是”“比如”立即解释）；数字和生活名词只是辅助、不能单独算具体，下一句不相关的具体内容也救不了上一句的抽象（“未来3年稳中求进”“在工作中提高竞争力”必判错，“把收入、支出、储蓄和合作资金分开记录”通过）。检查器会标出这类句子。
   - **不得换词重复（category 重复，warning）:** 同一个判断不能在 30秒看懂、第2、第3、第5 部分换词重复多次；每一节都要提供新信息，高度相似的连续年份要合并。
   - **事实边界（category 越界，error）:** ① facts 只支持“责任/职位机会”时不得扩写成“升职、加薪”，只有输入 facts 明确含收入/薪资变化才可写加薪；不能把“机会增加”写成“结果一定发生”。② facts 无群体比较数据时禁用“比同龄人/比大多数人/比别人更强”；性格倾向不得扩写成“肯定能做好/一定做得出来”，须区分“愿意做/可能擅长”与“实际能否完成”。③ 引擎不知用户现实经历，第3部分场景必须用“例如/可能出现/如果以后/常见表现可能是”等条件表达，不得认定用户已上班/创业/合伙/结婚/异地/买房/负债。④ 事业正文给“参考方向”时最多 3 类、每类最多 3 个普通人熟悉的岗位例子，并注明“只是参考、非唯一”；完整五行行业映射只放第 6 部分。
   - **不得靠删内容逃避检查:** 报告仍须保持 7 步结构与信息密度——不得压缩成几句空洞短句、不得删掉风险/时间线/现实建议、不得只写“仅供参考”、不得把具体结论都移到“专业依据”、不得用另一批同义抽象词替换黑话。
5. **Channel A — full raw charts** from `chart.json`, verbatim (never omit, round away, or re-derive):
   - **西方占星 (Western):** ascendant + MC (when time known), then every planet with `sign`,
     `signDeg`, `house`, `retrograde` and `precision`; the lunar node (mean or true) and — when
     `asteroids` is on — Chiron/Ceres/Pallas/Juno/Vesta; the major aspects. If `ayanamsha` is
     set, state the sidereal ayanamsha degrees and that positions are sidereal.
   - **四柱八字 (BaZi, raw chart):** the four pillars (年/月/日/时) each with 干支, `tenGodDisplay`
     (the day column reads **日主(日元)** and is never blank), hidden stems and 纳音; then the 大运
     (with 起运).
   - **紫微斗数 (Zi Wei):** all 12 palaces with 主星/辅星/杂曜, 四化, and 命主/身主 / 五行局.
6. **Sourced BaZi interpretation from `interpretation.json`** — 旺衰强弱, 格局, 喜用神 (+`reason`),
   神煞, 刑冲合害, and the 大运·流年 吉凶倾向 (each fact's `polarity`+`reason`+`source`). These ARE
   engine-produced (via `interpret`); **never** say this version “does not output” them or hand-compute a
   substitute. **Channel A shows the full set; Channel B uses only `answerPlan.selectedFacts`**
   (their terms go under “专业依据”). Only if the answer plan has no eligible fact may you say it is absent.
7. Relay every `warnings` entry for Channel A. For Channel B, relay every code in
   `answerPlan.requiredWarningCodes` using the matching public warning `impact` / `nextStep` — never
   copy a private warning message or detail. Never present an omitted or approximate result as if it
   were exact.
8. For a deeper/topic reading (吉凶/运势/事业/感情/财运/学业/流年), narrate only from the
   `answerPlan` following the **7-step order** in `references/reading-style.md`; cite each
   selected fact id internally, honor `guardrails`, and keep 排盘校对与免责整篇只出现一次。
9. **Close with a single one-line follow-up entry** (not a long menu), e.g. “还想看：事业 / 感情 / 财运 / 学业 / 流年？”.

## Multi-person 合婚 / relationship analysis (`synastry`)

When the user uploads **1-5 people** and asks about a relationship (合婚/配对/两人合不合/与谁更合):

1. Collect each person's birth input and give each a de-identified `label` (甲/乙/男方/…, never a real name).
2. **Confirm the relationships and which two people to analyze.** If the user did not say who-is-who or
   which pair, **ask first** — do not guess. Relationship tags: `couple|spouse|dating|ambiguous|ex|family|friend|partner`.
3. Build `people.json` (`{ people:[{label, relation, input}...], analyzePair:[labelA,labelB] }`) —
   `analyzePair` is REQUIRED when more than two people are given (else the engine errors, asking for it).
4. Optionally run `calculate --systems all` per person and show each chart; then run `synastry`.
5. Narrate the pair from `synastry.findings` per `references/reading-style.md` (合婚模板): lead with
   契合度+关键张力, cite 八字/紫微/占星 findings, take the angle for the relationship type (夫妻/情侣/暧昧/前任),
   give 相处建议, and honor `disclaimers`. **Never** conclude “注定在一起/必分手”.
6. Close with the synastry `followupOffers` (磨合点/推进年份/合作契合度/与其他人对比).

## Commands

Arguments are passed as an array; input and output go through JSON files.

```text
node scripts/ming-chart.mjs doctor
node scripts/ming-chart.mjs normalize --input-file birth-input.json --output-file normalized.json
node scripts/ming-chart.mjs calculate --input-file birth-input.json --systems all --output-file chart.json
node scripts/ming-chart.mjs compare   --input-file birth-input.json --profiles default,apparent-solar --output-file comparison.json
node scripts/ming-chart.mjs horoscope --input-file birth-input.json --at 2026-05-20T14:00 --output-file horoscope.json
node scripts/ming-chart.mjs interpret --input-file birth-input.json --at 2026-05-20T14:00 --output-file interpretation.json
node scripts/ming-chart.mjs answer-plan --input-file birth-input.json --topic career --lens advice --output-file answer-plan.json
node scripts/ming-chart.mjs synastry --input-file people.json --output-file synastry.json
node scripts/ming-chart.mjs verify
node scripts/ming-chart.mjs version
node scripts/ming-chart.mjs migrate --host qoder|workbuddy --source <extracted-new-package-dir>
```

- `--systems` accepts `all` or a comma list of `western,bazi,ziwei`. Always run `all`.
- `calculate` accepts `--now <iso|ms>` and `--request-id <id>` for reproducible output.
- `version` reads the sibling `BUILD_MANIFEST.json` and reports the REAL installed version
  (engineVersion / releaseVersion / releaseTag / legacy / doubleNested) — never guessed, and not
  the same thing as the latest online version.
- `migrate` atomically replaces an existing (incl. legacy double-nested) install under the host
  skills dir with an already-downloaded+verified new package; it backs up first and rolls back on failure.
- `compare` profiles are versioned rule presets; run `doctor` and read
  `references/rulesets.md` for the available ids.
- `horoscope` computes the Zi Wei dynamic chart (运限盘: 大限/小限/流年/流月/流日/流时) for a
  target solar date; `--at` is `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm[:ss]` (the hour sets the 流时).
- `interpret` produces `interpretation.json`: topic-organized, evidence-grounded facts (with
  `polarity` 吉/凶/中性 and `reason` chains) plus `disclaimers` and `followupOffers`. `--at`
  additionally folds in the current Zi Wei 流年.
- `answer-plan` is the ordinary-question entry point. It accepts only a bounded `--topic`
  (`character|career|wealth|marriage|studies|health|general`) and `--lens`
  (`overview|strengths|risks|timing|advice|explain`), never free-form question text. It computes
  all three systems internally and returns `publicResult` plus `answerPlan`; see
  `references/answer-contract.md`. Use `general` only for an explicitly requested complete
  overview, never as the fallback for an unclear question.
- **`render` is temporarily disabled.** HTML/SVG reports could not be produced reliably across
  host models, so the command now prints a stable JSON notice and exits with code 3. Present the
  structured `calculate` / `interpret` JSON instead. (The renderer stays dormant for a future
  re-introduction — see `docs/adr/0005-fortune-sidereal-render-pause.md`.)
- On success the CLI prints `{ "ok": true, ... }`; on failure it prints
  `{ "ok": false, "error": { "code": ... } }` and exits non-zero.

## Natural-language interpretation (the `answer-plan` step)

When the user wants an ordinary reading, run `answer-plan` and narrate ONLY from its
`answerPlan.selectedFacts`. The plan is the de-identified, evidence-grounded substrate — never
raw birth data and never your own invention. It contains no free-form question text; map the
question to a bounded topic/lens first, or ask a clarification question. Follow the fixed **7-step order** in
`references/reading-style.md`:

1. **30秒看懂:** 先给核心结论块（【核心结论】/【最大优势】/【最大风险】/【关键时间】/【现实建议】）。
2. **现实中会怎么表现:** 把命理结构翻成日常可观察的行为/处境，大白话。
3. **最可能出现的具体场景:** 1-3 个工作/感情/家庭/金钱场景，无真实经历用“例如/可能表现为”。
4. **时间线:** 用户可见时间表（时间/现实主题/可能发生什么/怎么应对），**每年同时写有利与风险两路**，锚定引擎大运/流年 fact；不给百分比或“高概率/机会窗口”伪量化。
5. **可以怎么做:** 针对优势与风险给可执行建议，反绝对化。
6. **专业依据:** 干支/十神/宫位/星曜/合冲/相位 等术语**只在此节**，引 fact 的 `reason`/`evidence`（`ref`/`ruleId`/出处）。
7. **信息可靠性与声明:** 出生时间/地点校对 + 全部 `warnings`/不确定性 + 免责，**整篇只一次**。

正文用大白话、术语只进第 6 步；趋势与年份是命理判断、非统计概率，绝不输出 X%。

第 1-5 部分按“向一个 15 岁学生解释”写：一句尽量只说一件事；少连续三个名词；少用斜杠/加号/括号；多用“找工作、做项目、跟客户谈、升职、加薪、自己接活、存钱、吵架、搬家”等具体动作；不要用换了包装的行业黑话（专业壁垒/平台核心/定价权/决定权/方法论/赋能/闭环…）。若一句话无法用“具体是谁、在什么场景、做了什么”解释，就说明太抽象，必须重写。成文后用 `lint-reading` 自检（见上面工作流）。

Guardrails:

- Narrate **only** from `answerPlan.selectedFacts`; if a topic has no fact, say so — do not backfill
  positions, stems, stars, houses, or verdicts.
- 吉凶/运势 verdicts are permitted as traditional-metaphysical judgements, but honor every item
  in `disclaimers`: this is traditional-culture / entertainment / self-reflection material, **非科学预测**.
- **Never** give deterministic medical, legal, financial, investment, or life-and-death advice.
  Health facts are general five-element notes, not a diagnosis.
- Where schools disagree or the time is approximate/unknown, state the uncertainty plainly.
- End with a one-line follow-up entry from `followupOffers` (不罗列长菜单)；排盘校对与免责整篇只一次。

## Handling the current engine version

This engine version computes **normalized time & location**, **Western natal charts (西方占星)**,
**BaZi (四柱八字)**, **Zi Wei Dou Shu (紫微斗数)**, and a sourced **cross-system interpretation**.
Notes:

- Western ten planets (astronomy-engine, VSOP87 + NOVAS, `precision: high`) cover Sun–Pluto with houses
  (placidus/whole-sign/equal/koch/porphyry), ascendant/MC, aspects and retrogrades, and hold the
  ≤1′ gate two ways: wrapper-consistency vs astronomy-engine's own output, plus an independent
  JPL Horizons golden cross-check (source-cited fixture; worst deviation 0.20′).
- The **sidereal zodiac (Lahiri ayanamsha)**, the **true lunar node**, and the **asteroids**
  (Chiron/Ceres/Pallas/Juno/Vesta) are now computed. The true node and asteroids are
  self-computed from public-domain elements and are marked `precision: approximate` (角分级近似);
  they are **excluded** from the ≤1′ gate. Relay their approximate nature.
- BaZi returns 旺衰、格局、喜用神、大运、神煞 and 刑冲合害 with 原因链, and the interpretation adds
  吉/凶/中性 polarity + reasons for a reading.
- A known birth time is required for the ascendant, houses and the BaZi hour pillar; Zi Wei and
  the BaZi luck cycle (大运) also need `ruleGender`. When the time is unknown, Western still places
  planets by date but does NOT fabricate an ascendant or houses.
- Lunar input is supported: it is converted to a Gregorian date first (with a `LUNAR_CONVERTED`
  warning). Set `lunarLeapMonth` for a leap month.

Relay every warning plainly; never present an unimplemented or omitted result as if it were
calculated.

## Result handling

- For an ordinary question, `answer-plan.json` is the only default artifact. It omits direct birth
  input, deterministic request ids, normalized timestamps, timezone, raw warning details and raw
  evidence notes. It is a de-identified answer context, **not anonymous public data**: obtain the
  user's consent before any caller sends derived facts to a remote model or service.
- Generate or attach `chart.json` / `interpretation.json` only when the user explicitly asks for
  a full technical chart or raw JSON. Keep those private artifacts and temporary input files out
  of ordinary-topic workspaces; remove them after the task unless the user asks to retain them.
- If the birth time is unknown, do not claim an ascendant, houses, hour pillar or Zi Wei hour.
- For full technical output, surface all raw `warnings` and `provenance` versions. For an ordinary
  answer, surface only the generic impact of `answerPlan.requiredWarningCodes`.

## Scope and disclaimer

For traditional-culture, entertainment and self-reflection use. 吉凶/运势/趋势/年份 are 命理
condition assessments, **非科学预测**. Do not use for medical, legal, financial or other major
decisions. See `references/sources-and-limitations.md` and `references/privacy.md`.
