# Natural narrative output v1

## Purpose

The default final answer is a natural, specific interpretation, not a seven-step report or a
dump of internal engine metadata. Every material sentence remains traceable to a calculated fact
and a versioned interpretation rule, but those traces are hidden until the user asks for them.

This document is the implementation source of truth for the Skill instructions,
`lint-reading`, example libraries and future host renderers.

## Delivery boundary

| Surface          | Default visibility | Contents                                                                           |
| ---------------- | ------------------ | ---------------------------------------------------------------------------------- |
| `body`           | visible            | Natural paragraphs answering the user's question.                                  |
| technical detail | on request         | Chart facts, terms, mechanisms, source references and calculation settings.        |
| internal audit   | never visible      | Warning records, guardrails, fact ids, rulesets, provenance and validation output. |

The default `body` must not contain a fixed heading, a numbered template, raw warning data,
provenance, rule ids, a disclaimer footer or an automatic follow-up menu.

## Required internal reasoning chain

Every substantive paragraph follows this trace before it is written:

```text
ChartBundle fact / InterpretationFact.evidence
  → versioned ruleset mechanism / InterpretationFact.reason
  → concrete implication for the requested topic
  → relevant condition or limitation / caveat / warning
```

The host may vary word order and rhythm, but may not add a chart fact, rule, event prediction or
limitation absent from this trace.

## Source trace format

Maintain one record per visible paragraph. The record is an implementation/audit structure, not
user-visible prose.

```ts
type NarrativeTrace = {
  paragraphId: string;
  visibleText: string;
  factRefs: string[]; // InterpretationFact.evidence[].ref
  ruleRefs: string[]; // e.g. bazi-rule/... when supplied by the engine
  rulesets: Array<{ id: string; version: string }>;
  mechanism: string; // controlled summary of fact.reason
  limitations: string[]; // relevant caveat / warning effects
  allowedClaims: string[];
};
```

Source priority is fixed:

1. Computed `ChartBundle` values and `InterpretationFact.evidence`.
2. The result's versioned ruleset and `InterpretationFact.reason`.
3. Repository ADRs and source matrices that define a disputed convention.
4. Provider/provenance information for time, calculation method and precision.
5. Host writing instructions, which organize language only and never create evidence.

## Narrative rules

- Professional terms are allowed when their mechanism and practical implication are adjacent.
- Use concrete settings, choices, interactions or observable behavior instead of abstract advice.
- Use conditions when the engine does not know the user's current life circumstances.
- Do not force equal coverage of Western, BaZi, Zi Wei and Vedic/Jyotish. Combine systems only
  when they support the same theme; disclose a difference rather than manufacturing consensus.
- Do not promise an event, amount, diagnosis, legal outcome, investment outcome or relationship
  result.
- For relationship readings, discuss interaction patterns and conditions only. Never write
  “注定在一起”“必分手”“必然结婚” or an equivalent.

## Warning transformation

Warnings remain mandatory audit data. They are not mandatory user-visible text.

| Internal condition                            | Default delivery behavior                                                         |
| --------------------------------------------- | --------------------------------------------------------------------------------- |
| Time uncertainty affects the question         | State the affected scope naturally, e.g. ascendant/palace conclusions may change. |
| Time uncertainty does not affect the question | Do not mention it.                                                                |
| A requested result is unavailable             | Say that the current material does not support that inference.                    |
| A classification is near a boundary           | State that a small time adjustment may change that classification.                |
| School disagreement changes the conclusion    | State the disagreement and retain only shared support.                            |

Never print warning codes, severity labels, provider names or raw details in the default answer.

## Forbidden default-delivery artifacts

`敏感项校对`、`引擎警告`、`专业依据`、`声明`、`免责声明`、`evidenceRef`、`factId`、`rulesetId`、
`schemaVersion`、`provider`、`ref:`、`ruleId:` and an automatic “还想看……” menu are internal or
on-request material. They must not be rendered in `body`.

Traditional-culture and non-scientific-prediction boundaries belong in product entry material.
For a high-risk question, state only the smallest necessary boundary in the relevant paragraph;
do not append a universal footer.

## Deterministic validation

`lint-reading --channel topic` rejects delivery-surface leakage, fixed footers, automatic
follow-up menus, empty talk, strong consultant jargon, repetition and unsupported deterministic
claims. It does not establish semantic correctness. A test or review must additionally confirm:

- each core paragraph has a `NarrativeTrace`;
- every source reference resolves in the associated engine output or ruleset;
- any visible limitation corresponds to the current question;
- a technical-detail request can reveal traces without altering the original conclusion.

## Acceptance cases

1. A career topic contains terms such as 月令、官杀、MC or 官禄宫 only with an immediate mechanism
   and work-context implication; it has no evidence appendix or footer.
2. An unknown-birth-time case explains only the affected scope, not an “引擎警告” block.
3. A relationship reading gives no fate verdict and has no automatic long disclaimer.
4. A user who asks “why?” receives the corresponding fact, rule and limitation trace separately.
5. The same input may vary in phrasing, but its traced fact set, rules, limitations and allowed
   claims remain unchanged.
