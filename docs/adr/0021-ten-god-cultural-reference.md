# ADR 0021: Ten-god cultural reference in career answers

- Status: Accepted — narrow product policy; limited runtime and Skill alignment only
- Date: 2026-09-08
- Scope: whether frozen ten-god symbolism may appear as a brief cultural reference in the default career body
- Related: [ADR 0020](0020-dual-provenance-career-layer.md) (composition layers; unchanged),
  [BAZI_SOURCE_MATRIX](../BAZI_SOURCE_MATRIX.md) (ten-god rows), [Narrative Output V1](../NARRATIVE_OUTPUT_V1.md),
  IQ-4H acceptance packet (`evals/fixtures/synthetic/iq4-acceptance-packet.json`)

## Context

IQ-4 keeps `reviewed-answer-examples` at `BLOCKED_SOURCE_ADMISSION` because existing career text
claims depend on unadmitted rule content (pattern 格局, useful-god industry matching). Meanwhile the
ordinary `answer-plan --topic career` path still mixed a ten-god display with `bazi-rule/pattern` in
one claim (`fact-7`) and still projected `bazi-rule/industry/wu-xing` as a career fact. The Skill
taught hosts to display those blocked items. Users therefore either received a term-heavy answer the
source gate would not approve, or a pure refuse/JSON surface.

The owner asked for one narrow question only: can the **already frozen** ten-god material support
showing `七杀` (and one brief traditional gloss) as **cultural reference** in a default career answer
that ordinary users can read at a glance?

## Decision

**Yes — only the frozen ten-god name and one brief frozen-symbolism gloss, as cultural background.
Nothing else in this ADR is admitted.**

### What is allowed in the default career body

1. At most **one** traditional term from provider ten-god display (e.g. `七杀` / `正官`), never
   rewritten as a pattern name (`七杀格`, `阳刃格`, …).
2. Immediately adjacent, a **brief** cultural gloss taken from frozen `TEN_GOD_MEANINGS`
   (《渊海子平》 ten-god symbolism, `FROZEN_LEGACY`) — e.g. for 七杀 the themes 权威、魄力、压力、竞争 —
   stated as traditional-culture background, not as a job, industry, or outcome claim.
3. The existing structural caveat in substance: 官杀 only marks 事业/责任 structural tendency and is
   not a career prophecy.
4. When the user states work reality, **advice and practices come only from those statements**.
   Traditional background may sit beside them and must never be presented as their source
   (ADR 0020 T⊣R adjacency).
5. When only birth data is present: state the brief cultural reference and ask **one** key reality
   question. Never invent work history, role, or career direction.

### What remains excluded (unchanged)

- Pattern naming or formation/failure (`bazi-rule/pattern`, 格局成败).
- Useful-god preference (`bazi-rule/useful-god`, 喜用神).
- Five-element industry matching (`bazi-rule/industry/wu-xing`, 五行行业表).
- Any career fit, industry fit, personality verdict, or action directive derived from the chart.
- Multi-system synthesis in the default career body.
- IQ-4H `BLOCKED_SOURCE_ADMISSION` for reviewed-answer-examples — this ADR does **not** lift it.

### Source-boundary handling (required before runtime change)

A mixed claim that concatenates ten-god display with pattern text must be **split**. It is not
acceptable to substring `七杀` out of a pattern-bearing claim and treat that substring as admitted.
After the split:

- the ten-god claim cites only `bazi.pillars.*.tenGod` (+ frozen symbolism as reason);
- pattern remains a separate non-career technical record and never enters the default career body.

## Trade-offs

| Gain                                                                          | Risk                                                                          | Mitigation                                                                   |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| One readable traditional reference instead of term dumps or a refuse template | Readers may over-read 权威/压力 as job fit                                    | Adjacent non-prophecy caveat + Skill ban on career/industry fit + tests      |
| Aligns `answer-plan`, `bazi-career` vocabulary bounds, and Skill instructions | Career `selectedFacts` shrink; hosts lose free industry/pattern copy          | Intentional: those claims were never source-admitted for visible career text |
| Uses only `FROZEN_LEGACY` ten-god symbolism already in-tree                   | Symbolism is still traditional-culture, not validated occupational psychology | Scope line and AGENTS/产品边界 unchanged                                     |

If a target sentence needs more than the frozen gloss (e.g. expanding 七杀 into role fit), it is
**not** supported by this policy and must not be published under it.

## Consequences

- Default career delivery: continuous short prose; reality-first when the user spoke; one brief
  ten-god cultural reference; no fixed sections, footers, JSON, or industry tables.
- `interpret` / Channel A technical dumps may still show pattern, useful-god, and industry as
  internal/technical records on request — they are not default career body content.
- `bazi-career` remains claim-prose-free structured records (IQ-4F); this ADR does not put claim
  text into that entry.
- C-1/C-2/C-4 stay as previously scoped; no new cards, scores, or evaluation systems.

## Non-goals

No new classical search, no pattern/useful-god/industry admission, no career prediction, no IQ-4H
status change, no multi-system career synthesis, no C-4 expansion.
