# ADR 0010: Output narration spec — dual-channel display, 7-step realistic reading, example libraries

- Status: Accepted
- Date: 2026-07-22

## Context

The engine's facts were sound, but the final natural-language output over-served the raw
three-system chart and leaned on jargon: every request front-loaded a full 排盘, the fixed
order was 结论→趋势→年份→原因→校对→免责, and conclusions were often stated in metaphysical
terms (能量激活 / 议题浮现 / 财官得地 / 夫妻宫被加强) that ordinary users cannot act on. Two
follow-on conflicts remained: a topic report still risked being forced to display the full 八字
fact set (step 5 was unconditional), and the "core-conclusion" rule contradicted itself (each
line "one sentence" yet must carry result+behavior+scenario+pros/cons+advice). This is a
presentation problem only — calculation, rules, schema and fact generation are unchanged.

## Decision (narration/presentation layer only; no algorithm/rule/schema/fact change)

**A. Dual-channel display (`SKILL.md`).** Calculation stays mandatory (`calculate --systems all` +
`interpret` always run; `warnings` never omitted). Display is split into two explicit channels:

- **Channel A — 排盘 / 原始数据 / 完整命盘 / 技术报告:** full three-system charts + the full BaZi
  interpretation (旺衰/格局/喜用神/神煞/刑冲合害/大运流年) + all warnings/provenance.
- **Channel B — a single topic (事业/感情/财运/学业/流年):** the body shows only the facts relevant to
  the topic, with 命理 terms confined to a "专业依据" section; the rest stays in `chart.json` /
  `interpretation.json` / an optional appendix. There is **no** requirement to front-load the three raw
  charts or the full 八字 fact set in a topic report. Warnings and key uncertainties are still relayed.

Per-topic loading: 事业 → `reading-style.md` + `examples-career.md`; 感情 → `+ examples-love.md`;
财运 → `+ examples-wealth.md`; 学业/流年 → `reading-style.md` only.

**B. 7-step order + slimmed core conclusion (`references/reading-style.md`).** Order:

1. 30秒看懂(核心结论块) 2) 现实中会怎么表现 3) 最可能出现的具体场景 4) 时间线 5) 可以怎么做
2. 专业依据 7) 信息可靠性与声明(校对 + warnings + 免责, once). The core-conclusion block is 3-5 lines
   (【核心结论】/【最大优势】/【最大风险】/【关键时间】/【现实建议】), **each one result / one sentence**;
   the five realistic elements (result + behavior + scenario + both-sides + action) must be covered **across
   the whole topic report**, not repeated per core-conclusion line. First 200 字 answer the user's key
   question, no term-first. Language 80% plain / 20% jargon (jargon only in 专业依据); a translation table
   maps 官杀/食伤/财星/劫财/冲/水逆… to plain outcomes; **no probabilities/percentages for 结婚/成功/发财**.
   Lengths: 追问 500-1000 / 专项 1200-2200 / 综合 2500-4000 中文字符; ≤3 句/段; each fact once; advice not
   repeated three times; 免责+校对 once; follow-up one line. 严谨性铁律 1-23, 反绝对化, 系统隔离, timeline
   (both favorable+risk per year), and the 合婚 template are retained; 合婚 keeps its structure and inherits
   the new language/realistic/disclaimer-once rules.

**C. Topic example libraries.** `references/examples-career.md`, `examples-love.md`, `examples-wealth.md`
— each with a full ❌→✅ end-to-end case (7 steps), ≥3 局部改写, and a self-check list; they cover the
known error traps per topic (e.g. 官杀不透→不适合体制、桃花年→必结婚、财=技能、冲→必分手/破产) and show the
corrected multi-path, plain, anti-absolutist version.

**D. Offline static validator.** `tools/validate-reading-examples.ts` (no network, no LLM) is wired into
`verify:all` as `validate:reading`. It checks the three files exist, SKILL.md references them, each has the
required sections, each ✅ case has the 7 steps, the ✅ content has no absolutist words (allowed in ❌),
contains a scene word, its timeline shows both 有利+风险, carries the 免责 once, and has a facts↔ref link;
it also asserts SKILL.md's dual-channel wording (no unconditional full-chart requirement) and self-tests its
own detector.

**E. Unified copy (`packages/interpret/src/build.ts`).** `DISCLAIMERS` condensed and de-probabilitised
(吉凶倾向/趋势/年份窗口 … 非统计学、非科学预测; no 概率/百分比); `FOLLOWUP_OFFERS` rewritten to plain
user-facing entries (事业/感情/财运/学业/流年 each with a short plain gloss). No schema or fact change.

## Consequences

- Topic reports no longer front-load the raw charts; readings lead with plain, actionable conclusions;
  jargon is quarantined to 专业依据; timelines show both upside and risk per year.
- A static gate now proves the spec + example structure (it does **not** prove a host model will follow the
  style 100% of the time — that limitation is stated in `docs/VALIDATION.md`).
- Determinism, rigor and anti-absolutism preserved; only presentation changed. `interpret` disclaimers/
  follow-up copy changed → engine.mjs rebuilt + examples regenerated; unit-test count unchanged (193/17),
  a new `validate:reading` gate added.
