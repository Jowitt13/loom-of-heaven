# ADR 0021: Ten-god cultural reference in career answers

- Status: Accepted — narrow product policy; limited runtime and Skill alignment only.
  **Amended 2026-11-01: the single-reference career ceiling this ADR froze is retired for
  ordinary topic narration by roadmap v3.4** (see the amendment section); everything the
  amendment does not restate keeps its original force.
- Date: 2026-09-08
- Amended: 2026-11-01 — roadmap v3.4 four-system topic interpretation
- Scope: whether frozen ten-god symbolism may appear as a brief cultural reference in the default career body
- Related: [ADR 0020](0020-dual-provenance-career-layer.md) (composition layers; amended 2026-11-01),
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
   rewritten as a pattern name (`七杀格`, `阳刃格`, …). When 正官 and 七杀 co-occur, **omit** the
   cultural reference rather than pick an arbitrary winner.
2. Immediately adjacent, a **brief** cultural gloss — only these frozen short themes, never the
   full `TEN_GOD_MEANINGS` strings:
   - `七杀` → 权威、压力、竞争 (exclude 需制化为权 and any fate/remedy clause)
   - `正官` → 责任、自律、地位 (subset of the frozen 贵气/地位/自律/责任 words; exclude 女命之夫星 and any spouse/wealth clause)
     Stated as traditional-culture background (《渊海子平》 ten-god symbolism, `FROZEN_LEGACY`),
     not as a job, industry, or outcome claim.
3. The gloss must carry resolvable rule evidence (`bazi-rule/ten-gods/xiang-yi`) beside the
   provider `bazi.pillars.*.tenGod` fact. It is not enough to hide the gloss in a provider-fact
   `reason`. Because the gloss is rule-backed, an unavailable rule profile **degrades** this
   reference instead of delivering a provider-only cultural reading.
4. The existing structural caveat in substance: 官杀 only marks 事业/责任 structural tendency and is
   not a career prophecy.
5. When the user states work reality, **advice and practices come only from those statements**.
   Traditional background may sit beside them and must never be presented as their source
   (ADR 0020 T⊣R adjacency). Birth-only answers contain **no** action advice.
6. When only birth data is present: state the brief cultural reference and ask **one** key reality
   question. Never invent work history, role, or career direction.

### What remains excluded (unchanged)

- Pattern naming or formation/failure (`bazi-rule/pattern`, 格局成败).
- Useful-god preference (`bazi-rule/useful-god`, 喜用神).
- Five-element industry matching (`bazi-rule/industry/wu-xing`, 五行行业表).
- Any career fit, industry fit, personality verdict, or action directive derived from the chart.
- Multi-system synthesis in the default career body.
- IQ-4H `BLOCKED_SOURCE_ADMISSION` for reviewed-answer-examples — this ADR does **not** lift it.
  One narrow cultural reference is not a complete career answer and is not a passed
  reviewed-answer-example.

### Source-boundary handling (required before runtime change)

A mixed claim that concatenates ten-god display with pattern text must be **split**. It is not
acceptable to substring `七杀` out of a pattern-bearing claim and treat that substring as admitted.
After the split:

- the ten-god claim cites `bazi.pillars.*.tenGod` **and** `bazi-rule/ten-gods/xiang-yi`, with only
  the ADR short gloss (not full `TEN_GOD_MEANINGS`);
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

## Amendment — 2026-11-01 (roadmap v3.4 four-system topic interpretation)

The owner-confirmed four-system topic-interpretation direction
([`../FOUR_SYSTEM_INTERPRETATION_DIRECTION.md`](../FOUR_SYSTEM_INTERPRETATION_DIRECTION.md);
roadmap v3.4 §7 item 4) replaces the narrow ceiling this ADR froze for the **default career
body**:

1. **Retired:** the "at most one ten-god cultural reference" ceiling and the rule that a career
   question with no transparent 正官/七杀 (or with both co-occurring) yields no chart material at
   all. Career topic answers now draw on genuinely relevant admitted material from the actual
   four-system results — work style, drive, professional expression, collaboration, resources,
   and responsibility — including the frozen ten-god references of this ADR when present.
2. **Retained from this ADR:** the frozen short glosses (七杀 → 权威、压力、竞争;
   正官 → 责任、自律、地位) as admitted `bazi-rule/ten-gods/xiang-yi` material; the
   non-prophecy caveat; the split that keeps pattern text out of ten-god claims; co-occurrence
   no longer omits the reference — the fact layer may cite both, and the host states each
   officer ten-god with its own gloss without picking a winner or implying a verdict.
3. **Still excluded (unchanged):** pattern naming/formation (`bazi-rule/pattern`), useful-god
   (`bazi-rule/useful-god`), and five-element industry matching (`bazi-rule/industry/wu-xing`)
   remain unadmitted for default bodies, as do chart-derived career-fit verdicts. Occupational
   fields may be explored as traditional-symbolism directions from real chart material, never
   packaged as a real-world career-fit assessment.
4. **Still true:** career practices/action advice cite only user-stated reality (ADR 0020 R
   layer); birth-only career answers carry chart analysis with its conditions, no invented work
   history, and at most one key reality question when reality would materially change the
   answer. IQ-4H `BLOCKED_SOURCE_ADMISSION` for reviewed-answer-examples is unchanged.

The 2026-09-08 text above remains as the historical record of the original decision; where the
two differ, this amendment governs runtime and Skill text.

## Non-goals

No new classical search, no pattern/useful-god/industry admission, no career prediction, no IQ-4H
status change, no multi-system career synthesis, no C-4 expansion.
