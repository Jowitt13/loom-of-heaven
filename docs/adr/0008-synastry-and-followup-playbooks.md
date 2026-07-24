# ADR 0008: Multi-person 合婚 (synastry) and follow-up-question playbooks

- Status: Accepted
- Date: 2026-07-25

## Context

Two product needs, beyond single-chart readings:

1. **High-frequency follow-up questions** — 什么时候结婚 / 正缘何时来 / 对象长什么样 / 适合什么行业 /
   最近适合投资吗 / 今年注意什么 …. Left to free narration these drift into fabrication or absolutism.
2. **Multi-person relationship analysis (合婚 / synastry)** — users upload 1-5 people and ask about a
   pair. ADR-era W5 explicitly scoped synastry _out_; that exclusion is now **superseded**.

## Decision

**A. Follow-up questions become engine facts + fixed playbooks.**

- `packages/bazi-rules`: `marriage-timing.ts` (婚姻/正缘应期 — 配偶星临岁 / 合冲夫妻宫(日支) / 桃花引动,
  gender-defined, a window not a "必婚之年") and `industry.ts` (喜用五行 → 行业大类, 参考非唯一).
- `packages/interpret/src/build.ts` `followupFacts`: 适合行业, 婚姻/正缘应期, 配偶画像 (配偶星五行 +
  夫妻宫 + 下降/金星, 倾向参考). Reworded 缺X (需后天训练、非无能力).
- `references/reading-style.md` "常见追问 playbook": one fixed template per question type, anchored on
  the engine facts + 逐年流年, with the discipline (投资=风险且非投资建议; 对象画像=倾向非精确; 趋势非概率).

**B. Multi-person synastry across three systems (deterministic, MIT, offline).**

- Contract `packages/contracts/src/synastry.ts`: SynastryInput (1-5 `people` with de-identified
  `label` + `relation` + BirthInput; `analyzePair` REQUIRED when >2), SynastryResult (de-identified
  subjects, the analyzed pair, sourced findings with polarity, disclaimers, followupOffers).
- New pure package `packages/synastry`: BaZi (生肖/日支夫妻宫/五行喜用互补/配偶星契合), Zi Wei
  (命宫↔夫妻宫 branch overlay + star resonance), Western (cross-aspects among Sun/Moon/Mercury/Venus/
  Mars + Asc/Dsc), plus an overall 吉/凶 tally.
- `packages/orchestrator/src/synastry.ts` `runSynastry`: charts each person, runs the rules over the
  chosen pair; errors clearly (INPUT_VALIDATION_FAILED) when >2 people lack `analyzePair` so the SKILL
  asks first. New CLI verb `synastry`.
- `SKILL.md` multi-person workflow: label people, **confirm relationships + which pair (ask if unsaid)**,
  run synastry, narrate by relationship type (夫妻/情侣/暧昧/前任) with the 合婚 template; never
  conclude 注定在一起/必分手.

## Consequences

- Common questions now answer from sourced facts + a fixed, disciplined template rather than guesswork.
- 合婚 is a first-class, three-system capability; each person's data stays offline and de-identified,
  and findings are structural compatibility signals, not fated verdicts.
- Relationship-type nuance and probability restraint live in reading discipline (host-model guardrails);
  the engine supplies the facts. Still 非科学预测.
- Determinism preserved; the suite grows with synastry / marriage-timing / industry regressions.
