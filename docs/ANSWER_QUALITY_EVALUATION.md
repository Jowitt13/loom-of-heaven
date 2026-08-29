# IQ-0A — answer-quality evaluation foundation

- Program: **Answer Faithfulness & Quality Lab** (not the Reliability Lab, not
  Predictive Validity Research)
- Status: **foundation implemented; IQ-0 overall in-progress**
- Roadmap anchor: `loom-product-roadmap/v2`, phase IQ-0, slice IQ-0A
- Related: [ADR 0016](./adr/0016-interpretable-state-and-accuracy-lab.md),
  [NARRATIVE_OUTPUT_V1](./NARRATIVE_OUTPUT_V1.md),
  [ADR 0011](./adr/0011-writing-isolation-and-reading-lint.md),
  [evals/README.md](../evals/README.md)

## Purpose

Before any answer-quality case is written, this slice freezes the measuring
stick: the evaluation dimensions, the failure taxonomy, the independent
judgment values, the deterministic-versus-human boundary, and the sealed-holdout
lifecycle. Cases must never define the standard retroactively.

## The eight evaluation dimensions (frozen order)

1. `support-and-traceability` — every core judgment traces back to an allowed
   fact, rule or documented boundary.
2. `mechanism-to-implication` — a professional mechanism is stated adjacent to
   its concrete real-world implication, never as a bare term.
3. `topic-specificity` — the answer actually addresses the career question and
   lands on work scenarios, trade-offs or behavioral conditions.
4. `condition-and-caveat-fidelity` — conditions that would change the conclusion
   are retained; unrelated warnings are not stuffed into the body.
5. `cross-system-integrity` — systems do not vote, average, fabricate consensus,
   or borrow another system to patch missing evidence.
6. `restraint-and-boundaries` — tendencies are not written as destiny,
   guarantees, diagnoses or accomplished facts.
7. `presentation-cleanliness` — no fixed report template, background labels,
   source appendix, disclaimer footer, automatic follow-up menu or duplicated
   conclusions.
8. `usefulness-without-invention` — conclusions are concrete and usable without
   inventing facts to buy specificity.

## The ten failure modes (frozen order)

`vague-prose`, `term-dump`, `unsupported-fact`, `mechanism-leap`,
`cross-system-consensus-fabrication`, `repeated-conclusion`,
`default-footer-clutter`, `missing-material-condition`,
`jargon-without-concrete-implication`, `unsupported-life-verdict`.

## Independent judgments (no aggregation)

Each dimension of each case receives exactly one of: `meets`, `needs-review`,
`does-not-meet`, `not-applicable`. Judgments are never summed, weighted,
averaged or converted into a pass rate. A `does-not-meet` on a critical
dimension cannot be offset by other dimensions. There is no overall score, no
confidence value and no accuracy percentage anywhere in this program.

## Deterministic-assisted vs human-required

Boundary classes are frozen: `deterministic-assisted` and `human-required`.

The deterministic layer (this slice's verifier, plus the existing
`lint-reading` and `validate-answer` gates) proves **structure and boundaries
only**: contract shape, id/set/order locking, privacy-field exclusion, public
split boundary, holdout metadata-only boundary, forbidden-metric exclusion and
runtime isolation. It **cannot prove** that an answer's semantics are good.

The following are **human-required** judgments and can never be produced by a
machine gate in this program:

- whether a professional mechanism accurately maps to the stated concrete
  implication;
- whether the answer truly addresses the user's question;
- whether a retained condition materially changes the conclusion;
- whether cross-system agreement is fabricated;
- whether advice is concrete without inventing facts;
- whether the overall expression is natural, flexible and non-templated.

A deterministic pass is therefore never a statement of answer quality.

## Data tiers

- **Public repository**: the rubric, these schemas, development/adversarial/
  regression cases (later slices), sanitized synthetic answer artifacts, and a
  sealed-set **metadata manifest** (counts, digests, lifecycle status,
  custodian role).
- **Off-repository (controlled storage)**: sealed holdout inputs, expected
  answers, expected boundary annotations, reviewer material and the access log.
  These never enter git.

## Sealed holdout lifecycle

A sealed holdout case is evaluated at most once as unseen evidence. Once it has
been inspected to guide a fix, it is **retired**: it loses its unseen status,
is demoted into the public regression corpus, and **must be replaced** by a new
unseen case. Retired cases are `never counted again as unseen evidence`. The
metadata manifest records `status` (`planned` / `active` / `rotated` /
`retired`) and `replacementRequired` so the state is auditable without
exposing content. Holdout evaluation covers answer boundaries and faithfulness
only — never whether the traditional method is scientifically correct.

## Human-review policy

- development cases: at least 1 human reviewer;
- adversarial and sealed-holdout cases: at least 2 independent reviewers,
  judging independently before reconciliation of differences;
- reviewers are identified by stable ids only; no names, chat transcripts,
  chain-of-thought or free-form model reasoning is stored;
- judgments use only the four independent values; no averages, totals or rates.

## Legacy baseline (future protocol)

A legacy baseline compares the current deterministic pipeline output against
previously accepted answers, collected under the same rubric by human review.
It will be captured in a dedicated, separately reviewed slice; this foundation
slice creates none of it.

## Scope of IQ-0A

This slice freezes the foundation and adds one committed rubric fixture plus
the deterministic foundation verifier. It creates **no** development,
adversarial or regression cases, **no** real sealed-set manifest, and **no**
legacy answers. IQ-0 remains in-progress. Nothing here changes runtime output
or claims any accuracy, quality percentage or predictive validity.
