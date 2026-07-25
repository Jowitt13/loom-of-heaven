# ADR 0006: BaZi 取格 correction, 应期 (timing) facts, and reading-rigor discipline

- Status: Accepted
- Date: 2026-07-23

## Context

Expert review of a real reading (male chart 癸未 丙辰 戊寅 癸亥) surfaced two classes of defect:

1. **A deterministic engine bug in 取格 (pattern).** `pattern.ts` labelled _every_ 比劫 本气 as
   "建禄/月劫". For 戊土生辰月 this is wrong: 戊禄在巳 (辰 is 冠带, not 禄), and 辰 is a 杂气 (墓库)
   month whose pattern should come from what 透干 (here 癸正财 透 twice). The wrong "建禄/比肩" label
   also _seeded_ the host model's larger errors ("建禄格 / 月令透比肩 / 天生自立").
2. **Host-model over-reach** the engine could not prevent: fated verdicts ("天生不能打工/必须创业"),
   invented 命理 mechanisms ("七杀在夫妻宫→为伴侣拼事业"), cross-system term bleed (紫微 天相 called an
   八字 印星), dignity mis-reads (Zi Wei "不" read as 陷; astrology detriment/失势 called 落陷/fall),
   self-contradiction (MC 天秤 重协作 yet "不适合社交"), and ungrounded timing ("2033 才透财"/"2043 必高峰"
   while the chart already has two 癸正财 透干).

## Decision

**A. Correct 取格 (透干取格).**

- 建禄格 only when the month branch IS the day master's 临官(禄) seat; 阳刃格 only at the 帝旺(刃)
  seat (new 禄/刃 tables in `fundamentals.ts`). 甲木生卯月 is now correctly 阳刃格 (卯 = 甲刃).
- 杂气月 (辰戌丑未) take the pattern from whichever 中/余气 is 透干; nothing transparent → honest
  "另取". 戊土生辰月 (癸正财透) is now 杂气正财格, 兼看 the other transparent gods.

**B. Grounded 应期 + supporting facts (so the model stops inventing timing).**

- `fortune.ts` now emits 大运/流年 vs 本命 冲合: a 大运 branch 冲/合 the 日/月支, and 流年 years that
  冲 the 日支 or 当运大运支 (e.g. 2028 戊申 冲日支寅, deterministically), each a 变动/转折 marker, not a
  verdict.
- New facts: 五行缺失 (命局无X), 天干五合 incl. 日主合财/官 (情财责任相牵 — replaces the flimsy
  "七杀在夫妻宫" causal chain), and a refined 喜用神 reason that names the _absent_ favorable element
  (缺金 → 变现出口不足) and flags 官杀 as a double-edge (喜用 yet 过旺转病).

**C. Reading-rigor discipline (host-model guardrails).**

- `references/reading-style.md` + `SKILL.md` add mandatory rules: no fated verdicts (multi-path +
  conditions + probability), use only the facts' `reason`/`evidence` (no invented mechanisms), keep
  each system's vocabulary inside that system, relay brightness/dignity verbatim (不/平 ≠ 陷;
  detriment/失势 ≠ fall/落陷), self-check for contradictions, read each palace by its own meaning
  (疾厄 = health/风险, not "事业资产"), and hedge timing (机会+风险, distinguish 已透 vs 再加强).

## Consequences

- The engine's structural facts now match careful 子平 practice for 杂气/建禄/阳刃, and no longer
  seed the "建禄" error. Verified on the review chart: 杂气正财格 / 命局无金 / 戊癸合正财 / 2028 冲日支寅.
- Timing is anchored to sourced 大运·流年 冲合 facts rather than model guesswork.
- Reading discipline reduces (but by nature cannot fully guarantee) the model's over-reach; the
  engine change removes the biggest seed. This stays a metaphysical, 非科学预测 product.
- Determinism preserved; 168 tests / 15 files pass, incl. new 取格/缺五行/戊癸合/流年应期 assertions.
