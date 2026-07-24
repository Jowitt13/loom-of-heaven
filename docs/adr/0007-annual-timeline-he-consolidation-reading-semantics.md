# ADR 0007: Per-year 流年 timeline, consolidated day-master 合, and reading-semantics discipline

- Status: Accepted
- Date: 2026-07-24

## Context

A third expert review (7.5/10) confirmed the direction but flagged remaining defects, split again
into deterministic engine issues and host-model over-reach:

1. **合 double-counting.** `stemCombinationFindings` emitted one finding per 日主五合, so a 戊 day
   master with two 癸 正财 produced two "戊癸合" facts — implying an impossible double 合化.
2. **No per-year timeline.** The engine only gave per-大运 吉凶 + 冲应期; the model therefore
   invented year themes (e.g. wrongly called 2029-2032 all "财星流年", missed 2029 酉伤官/辰酉合金).
3. **Semantic mis-maps and residual absolutism** the discipline layer had not stopped: 财=专业技能
   (should be 食伤), 财格=不在乎职位, 官杀藏→"不适合大厂/体制", 缺金→"创造力弱", 概率百分比,
   紫微单星定论, 水逆=思考慢, and 校对提醒 not distinguishing time-sensitive vs robust parts.

## Decision

**A. Consolidate the day-master 五合.** One day stem 五合s with exactly one stem type, so multiple
日主合财/官 are reported as a single finding that distinguishes 贴身 (adjacent to the day pillar:
月/时干) from 遥见 (年干) and states "不作双重合化论" (e.g. "正财两透：时干癸财贴身相合、年干癸财遥见
（戊癸合化火）；……但不作双重合化论"). `tenGodOf(dayStem, other)` in `fundamentals.ts` gives the
specific 十神 (正/偏) used by the timeline below.

**B. Per-year 流年 timeline (engine, deterministic).** `interpretBazi(bazi, { focusYear })` +
`fortune.ts annualTimelineFindings` emit one fact per year for `[focusYear, focusYear+11]`:
天干十神 + 地支本气十神 + the year branch's 合/冲/刑/害 vs the four 本命 branches and the 当运大运支,
with polarity and reason. `build.ts` anchors `focusYear` on the run's `--now` (`bundle.calculatedAt`)
or `--at`. Verified on the review chart: 2028戊申=申食神/冲日支寅/冲大运寅, 2029己酉=酉伤官/合月支辰
(化金), 2030庚戌=庚食神/冲月支辰. Every reason ends "非整年单一定性".

**C. Reading-semantics discipline** (`reading-style.md` + `SKILL.md`): a 十神象义 table (财=回报/
客户/资源/责任; 食伤=技能/作品/产品化/创造; 官杀=权责/管理; 印=学习/资质/平台; 比劫=同侪/竞争),
财格 semantics (须真实权责+合理回报, 非只靠成果), 官杀藏≠排斥组织 with the "大平台技术/项目/专业核心"
reframe, an explicit ban on "不适合大厂/体制" and "必须主动求变", probability→trend (no "X%"), a
紫微-no-single-star rule (三方四正/四化/对宫; 太阳"不"≠陷; 地劫需综合; 巨门化权双面), astrology
水逆≠思考慢 and detriment/失势≠fall/落陷, a fuller 4th-house-ruler reading (建筑/空间/居住/个人工作室/
事业与地域家庭根基), and a precise 校对提醒 (sensitive: 时柱/紫微宫/上升/MC; robust: 大运顺逆/排列).
Also reworded 缺X to "需后天训练、非无能力（创造潜力另见紫微/占星）".

## Consequences

- Timing is now grounded per-year rather than guessed; the model narrates the 2029→2033 progression
  from the engine's own 十神+合冲 facts.
- The day-master 合 is stated once, correctly, with 贴身/遥见 nuance.
- Discipline items C are host-model guardrails: they reduce over-reach but cannot fully guarantee it;
  the engine changes (consolidation, timeline, reworded 缺X) remove the seeds. Still 非科学预测.
- Determinism preserved; 170 tests / 15 files pass, incl. consolidation / tenGodOf / per-year timeline.
