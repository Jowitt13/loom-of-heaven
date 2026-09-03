# IQ-0 — structural answer-quality safeguards

- Program: **Answer Faithfulness & Quality Lab** (not the Reliability Lab, not
  Predictive Validity Research)
- Status: **structural safeguards implemented; no quality-evidence result claimed**
- Roadmap anchor: `loom-product-roadmap/v3`, phase IQ-0
- Related: [ADR 0016](./adr/0016-interpretable-state-and-accuracy-lab.md),
  [NARRATIVE_OUTPUT_V1](./NARRATIVE_OUTPUT_V1.md),
  [ADR 0011](./adr/0011-writing-isolation-and-reading-lint.md),
  [evals/README.md](../evals/README.md)

## Current v3 route

IQ-0 now admits IQ-1 through structural safeguards only: the bounded rubric, synthetic
development and adversarial candidates, deterministic boundary checks, and explicit non-claim
language. A deterministic pass does not establish answer semantics, naturalness, usefulness,
generalization, traditional-method correctness, prediction accuracy, or real-world validity.

Documented human review, activation of controlled sealed-holdout storage, and a legacy comparison
baseline are an optional, separately owner-authorized **Quality-Evidence Track**. They are not IQ-1
prerequisites. The planned manifest and synthetic review-linkage fixture do not activate that track
and cannot be presented as evidence that a human review, real holdout, or legacy baseline exists.

## IQ-1A internal claim-chain foundation

IQ-1A introduces internal-only contracts for a deterministic path from an already-public,
topic-scoped fact to a candidate claim, then to an approved claim, and finally to a transient,
regenerable paragraph trace. Each candidate binds exactly one chart system, the selected fact,
its evidence references, the matching ruleset namespace slice, relevant plan constraints, and
typed invalidation causes. A candidate cannot be narrated; only an exact deterministic projection
can be approved, and a trace can cite approved claims only.

This foundation is deliberately disconnected from the CLI, Skill, orchestrator, default output,
and public runtime contracts. It does not produce a new answer, judge whether prose faithfully
expresses a claim, establish naturalness or usefulness, synthesize systems, or claim any
traditional-method, predictive, or real-world correctness. Those are separately admitted future
work, beginning with IQ-2 semantic faithfulness.

## Historical purpose of IQ-0A

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

## Data tiers when the optional Quality-Evidence Track is authorized

- **Public repository**: the rubric, these schemas, development/adversarial/
  regression cases (later slices), sanitized synthetic answer artifacts, and a
  sealed-set **metadata manifest** (counts, digests, lifecycle status,
  custodian role).
- **Off-repository (controlled storage, optional)**: sealed holdout inputs,
  expected answers, expected boundary annotations, reviewer material and the access log. These
  never enter git.

## Optional sealed holdout lifecycle

A sealed holdout case is evaluated at most once as unseen evidence. Once it has
been inspected to guide a fix, it is **retired**: it loses its unseen status,
is demoted into the public regression corpus, and **must be replaced** by a new
unseen case. Retired cases are `never counted again as unseen evidence`. The
metadata manifest records `status` (`planned` / `active` / `rotated` /
`retired`) and `replacementRequired` so the state is auditable without
exposing content. Holdout evaluation covers answer boundaries and faithfulness
only — never whether the traditional method is scientifically correct.

## IQ-0C1 planned sealed-holdout manifest

[`evals/fixtures/synthetic/iq0c-sealed-holdout-manifest.json`](../evals/fixtures/synthetic/iq0c-sealed-holdout-manifest.json)
is the first public manifest, but it is deliberately **pre-activation**: it
has status `planned`, zero cases, zero retired cases and no replacement claim.
Both digests are the SHA-256 value for an empty byte sequence. They are an
explicit sentinel for the absence of any sealed content or access-log entries,
not an active holdout and not evidence that a holdout has been reviewed.

The public manifest names only a non-personal custodian role. Before activation,
the owner must establish controlled storage outside Git for the actual holdout
inputs, expected boundaries, reviewer materials and access log. Activation is a
separate reviewable change to public metadata only: it records a new version,
nonzero count and the corresponding controlled-storage digests, but never the
content. Any inspected case is retired into the public regression corpus and
replaced before it can be represented as unseen again. The deterministic
IQ-0C1 checker verifies the planned boundary; it does not access controlled
storage, assess an answer, attest human review or create an active holdout.

## Optional human-review policy

- if this track is authorized, development cases: at least 1 human reviewer;
- adversarial and sealed-holdout cases: at least 2 independent reviewers,
  judging independently before reconciliation of differences;
- reviewers use only randomly assigned stable pseudonymous ids; they are never
  names, emails, account ids, birth data or hashes of personal data;
- no chat transcripts, chain-of-thought or free-form model reasoning is stored;
- judgments use only the four independent values; no averages, totals or rates.

## Optional legacy baseline protocol

A legacy baseline compares the current deterministic pipeline output against
previously accepted answers, collected under the same rubric by human review.
It will be captured in a dedicated, separately reviewed slice; this foundation
slice creates none of it.

## Scope of IQ-0A

This historical slice freezes the foundation and adds one committed rubric fixture plus
the deterministic foundation verifier. It creates **no** development,
adversarial or regression cases, **no** real sealed-set manifest, and **no**
legacy answers. Nothing here changes runtime output or claims any accuracy, quality percentage or
predictive validity.

## Contract versions (IQ-0A-R correction)

### `answer-quality-case/v1` — superseded-before-first-case

The v1 identity-only case contract was merged in IQ-0A but carries **no**
question, scenario, evidence, answer or evaluation-plan fields. It was
superseded before any v1 case instance was ever created; **no v1 case will
ever exist in this repository**. The v1 schema file is retained unchanged as
a historical record; its contract version is never reused.

### `answer-quality-case/v2` — active case carrier

The v2 contract is the sole active carrier for public answer-quality cases.
It adds the structured question (intentId + bounded synthetic text), scenario
bounds, evidence-artifact references (digest-anchored, repo-path restricted to
`evals/fixtures/synthetic/`), a sanitized visible-answer artifact reference
(digest-anchored, repo-path restricted to `evals/corpus/public/career/`), and
the frozen evaluation plan (all 8 dimensions, 4 critical dimensions, 12
boundary findings, target failure modes, and a marker that human review would be required before
any Quality-Evidence Track result could be claimed).

### Sanitized visible answer vs raw transcript

A **sanitized visible answer** is the final, de-identified user-visible prose
of one answer, wrapped in `answer-quality-visible-artifact/v1`. It carries
five sanitization attestations (synthetic input only, no raw transcript, no
raw prompt, no model reasoning, no personal data) and a bounded
`visibleText` field.

A **raw answer / raw transcript** is the raw model or provider response, an
unredacted draft, a full session transcript, or any output carrying internal
metadata (token logs, provider details, chain-of-thought). Raw answers are
forbidden everywhere in the repository and can never enter the corpus.

### Structured human review

Review records use `answer-quality-review/v1`. Each record pins one reviewer
(a randomly assigned stable pseudonymous id only), one answer artifact (by digest), and exactly
eight ordered dimension judgments using the four independent values. An
**independent review** cites no other reviews; a **reconciliation review**
cites at least two distinct review ids and produces the final disposition.
The schema proves only that those ids are distinct and structurally valid; it
does not prove that they name independent reviews. No free-form reviewer prose,
reasoning, totals, weights, percentages or confidence values are expressible.

The IQ-0B corpus verifier must resolve each reconciliation reference and prove
that the referenced review exists, is an independent review, has the same
`caseId`, `answerArtifactId`, `reviewedArtifactDigest` and `rubricId`, names a
different pseudonymous reviewer, does not cite itself, and does not form a
review-reference cycle. IQ-0A-R defines this requirement but creates no review
instances and therefore cannot yet verify it.

## Scope of IQ-0A-R

This corrective historical slice adds the v2 case carrier, the visible-answer artifact
contract, and the review record contract. It creates **no** case instances,
**no** visible-answer artifacts, **no** review records, and **no** corpus
directory.

## IQ-0B1 public synthetic career corpus

IQ-0B1 contributes a bounded public corpus under `evals/corpus/public/career/`:

- 20 development candidates and 6 adversarial candidates, all tied to one
  synthetic evidence bundle by canonical SHA-256 digest;
- one sanitized visible-answer artifact per case, with no raw prompt,
  transcript, model reasoning, provider metadata or personal data;
- all eight frozen dimensions, twelve boundary findings and ten failure modes
  represented across the corpus; and
- one separate **synthetic review-linkage fixture** that proves references
  between two independent-shaped records and one reconciliation-shaped record
  can be checked structurally.

Every artifact has role `candidate`, not accepted reference or production
output. The adversarial candidates deliberately show bounded failure patterns;
they are test inputs and must never be reused as default answer text. The
development candidates exclude default audit headings and footer clutter. The
linkage fixture uses pseudonymous synthetic ids and carries an explicit
no-human-review attestation. It does **not** assert that a person performed,
approved or reconciled any review.

`node tools/eval/verify-answer-quality-corpus.ts` verifies only deterministic
structure: exact case inventory and split, digest linkage, sanitization,
candidate status, coverage of the frozen labels and structural review links.
It does not rate prose, establish traditional-method correctness, establish
prediction accuracy, or replace the human-review policy above.

The optional Quality-Evidence Track may later add documented human review of candidate cases,
activation of controlled sealed-holdout storage, and a separately reviewed legacy baseline. IQ-0C1
adds only the planned metadata boundary; no active holdout or review result is created or claimed.
The corpus remains disconnected from runtime, the Skill, the CLI and public contracts.

## IQ-2A bounded final-answer faithfulness fixtures

IQ-2A begins the roadmap's final-answer faithfulness work with seven fixed,
synthetic career cases. Each case contains sanitized visible text, internal
`approved-answer-claim/v1` snapshots, declared scope and material-condition
boundaries, and a small assertion ledger. The offline verifier uses those
bounded records to distinguish three factual-assertion states:

- `supported`: the assertion names the same single-system approved claim;
- `unsupported`: the assertion has no approved-claim binding; and
- `contradicted`: the assertion names a different chart system from its bound
  approved claim.

It separately reports an unsupported professional mechanism, a
mechanism-to-implication leap, scope overreach, omitted material condition and
forbidden default-footer leakage. The adversarial inventory therefore covers
the IQ-2 exit examples: wrong-chart swap, leading-user contradiction, invented
professional term, unsupported causal jump, omitted material condition and
forbidden footer.

The fixture is locked against implementer-owned case ids, order, sanitized
visible text and expected bounded findings. A case cannot self-declare a pass,
and all result categories are named diagnostics rather than a score, rate or
accuracy claim. Run it locally with:

```bash
node tools/eval/verify-answer-faithfulness.ts
```

This is deliberately a **bounded lexical and linkage verifier**, not general
Chinese-language semantic understanding. It does not establish that arbitrary
free-form prose is faithful, natural, useful or professionally sound; it does
not establish traditional-method correctness, prediction accuracy or
real-world validity. It creates no narrator/runtime/CLI/Skill surface and does
not authorize candidates as production output. A later, separately admitted
runtime slice must supply a transient delivery artifact before this verifier
can inspect text actually shown to a user.
