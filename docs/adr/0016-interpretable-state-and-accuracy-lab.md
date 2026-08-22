# ADR 0016: Interpretable state and accuracy-lab boundaries

- Status: Accepted — architecture boundary only; no runtime behavior enabled
- Date: 2026-08-22
- Scope: internal interpretation-state design, rule governance, deterministic verification, and
  development-only evaluation boundaries
- Supersedes: nothing
- Related: [ADR 0015](./0015-bazi-reasoning-2-architecture.md),
  [BaZi source matrix](../BAZI_SOURCE_MATRIX.md),
  [BaZi source-admission boundary](../BAZI_SOURCE_ADMISSION.md), and
  [BaZi adversarial cases](../BAZI_ADVERSARIAL_CASES.md)

## Context

Loom already produces deterministic four-system chart facts, bounded interpretation facts, an
`answer-plan/v2`, and deterministic answer and reading-lint gates. Its remaining architectural
gap is between a reproducible chart and the constrained narration that presents it. A future
implementation needs to preserve which facts, rule candidates, source profiles, blockers, and
invalidations led to a conclusion without turning those internal records into either user-visible
boilerplate or a hidden model memory.

The existing BaZi Reasoning 2.0 work is deliberately shadow-only. `root-state.ts`,
`relation-geometry.ts`, `strength-inputs.ts`, and `pattern-inputs.ts` collect structural evidence
or candidates; they do not authorize a strength verdict, pattern verdict, useful-god conclusion,
relation effect, or any user-visible claim. The D2-C source-admission boundary remains blocked and
is not changed by this ADR.

## Decision 1: use an internal, regenerable Interpretation State

`InterpretationState` is an internal-first, transient, regenerable artifact for one resolved
input, engine/provider version, settings, rulesets, and source profiles. It is not a default
cross-session memory and it does not change an existing public contract, command, or output path.

The initial state must not contain:

- a real name, a free-text location, a life event, or an original birth-input record;
- exact time or place values that are unnecessary to the derived state;
- raw host-model reasoning, chain-of-thought, prompt text, provider keys, or a chat transcript.

Hashing is not anonymization. Birth information has a small enough candidate space that a hash
must not be described as a privacy safeguard. Any future state file, persistence, cross-device
transfer, encryption, access control, retention, or deletion behavior requires a separate ADR.

## Decision 2: preserve semantic layers and their limits

The future internal state may contain the following layers:

```text
fact                 provider-returned chart value
derived-structure    deterministic structure derived from facts
rule-judgment        result under a named rule and source profile
school-judgment      conclusion limited to one named tradition or subtradition
temporal-signal      an overlay derived from accepted earlier stages
answer-claim         a topic-scoped, verifier-approved statement for narration
```

Facts and derived structures are not overwritten by a narrative. A `rule-judgment`,
`school-judgment`, temporal signal, or answer claim must bind its rule, ruleset, source-profile
snapshot, evidence, and upstream dependencies. `matched`, `rejected`, `unresolved`, and
`not-applicable` remain distinct states. A rejected or invalidated node cannot be narrated as a
conclusion; `unresolved` is preferable to manufacturing a verdict.

No common state field normalizes every system into an inherent auspicious/inauspicious polarity.
Cross-system claims must retain their system-specific mechanism, conditions, and limits. A future
cross-system vocabulary requires its own ADR and adversarial cases.

## Decision 3: identity, integrity, and invalidation are separate concerns

Future state work reuses existing stable definitions such as `ChartSystem` and `RulesetRef`; it
does not duplicate a system enum or invent a parallel ruleset identity. It distinguishes:

- an opaque state id, which must not be derived directly from birth data;
- a local cache identity, which is not a privacy or tamper guarantee; and
- a SHA-256 integrity digest over canonical, permitted state content when integrity is claimed.

The current FNV request id remains a deterministic request identifier; it must not be relabelled
as a state-integrity or security guarantee.

Invalidation must use typed causes rather than an unstructured list of strings. At minimum, the
future model distinguishes input/chart, settings, engine/provider, ruleset, source profile,
topic/lens, and language/narrator changes. Topic, lens, language, or host-narrator changes may
invalidate projections and prose but must not recalculate unchanged chart facts or confirmed
structure. Input, relevant settings, provider, ruleset, or source-profile changes must invalidate
all dependent judgments and claims.

## Decision 4: govern rules rather than treating citations as decoration

An active runtime rule requires an accepted source, a named source profile, explicit applicability,
support and blocker paths, and positive plus negative or blocking synthetic fixtures. Its source,
profile, rule id, ruleset, dependencies, allowed inferences, and forbidden inferences must be
inspectable by deterministic code.

[The BaZi source matrix](../BAZI_SOURCE_MATRIX.md),
[source-admission boundary](../BAZI_SOURCE_ADMISSION.md),
[adversarial cases](../BAZI_ADVERSARIAL_CASES.md), and ADR 0015 remain the governing review
records. This ADR does not create a second authority corpus, grant source admission, or resolve
any school dispute. Distinct traditions do not vote, silently borrow each other's terminology, or
merge their conclusions into a consensus.

In particular, D2-C3 remains paused: `VISUAL_TEXT_VERIFIED_BUT_SECOND_SOURCE_OR_RIGHTS_BLOCKED`
does not authorize an active rule. D1/D2 shadow evidence may become an internal state input in a
later, separately approved slice, but it cannot silently alter `bazi-standard@0.1.0` or
`bazi-rules-ziping@0.1.0` and cannot itself reach a user answer.

## Decision 5: use typed stages, not a generic DAG runtime

The first state implementation, if separately approved, uses immutable typed stage functions and
declared dependency tables. A generic DAG runtime is not introduced. A graph representation may
record dependencies for verification and invalidation, but it does not become a dynamic scheduler
until at least two accepted school compilers prove that static staging is insufficient.

No `@loom/bazi-schools` package is introduced by this direction. Calculation packages remain
independent of interpretation and narration packages.

## Decision 6: verify a derivation path, not metaphysical truth

A future deterministic verifier has three bounded responsibilities:

1. contract verification: version, schema, ids, capacities, state resolution, and permitted data;
2. rule-path verification: active rule/source/profile consistency, dependency closure, blockers,
   invalidations, and allowed or forbidden inferences; and
3. output verification: existing `validate-answer` and `lint-reading` checks over the final text.

The verifier cannot establish that traditional divination is scientifically predictive. A second
LLM may offer review hints but is never the sole release gate. Any answer claim without a complete,
active evidence-to-rule-to-claim path is a verifier error, not an invitation for the narrator to
improvise.

Default user-facing prose remains continuous and topic-specific. It must not automatically append
technical panels headed “敏感项校对”, “引擎警告”, “专业依据”, “声明” (or translated equivalents),
or a fixed disclaimer footer. De-identified technical audit detail is an explicit-request
capability only; this ADR does not change the current output contracts or reading gates.

## Decision 7: separate the Accuracy Lab from the portable runtime

Accuracy is reported as separate layers: chart correctness, rule match, governance, state
consistency, output-boundary compliance, and host-narration stability. The project does not reduce
these layers to a generic “divination accuracy percentage”.

Future host, cross-language, and repeated-run experiments use synthetic or de-identified fixtures
only. They record manifests and failure categories, but never save real birth records, user
histories, model credentials, unreviewed raw answers, or a model-provider SDK in the Skill bundle.
External-model harnesses and research reports are development-only, not daily CI gates and not
published Skill runtime dependencies.

Model training is deferred. It may be reconsidered only after deterministic calculation, source
governance, internal state, a verifier, and reproducible evaluation baselines are stable, and then
only for verified trajectories rather than copied classical corpora or hindsight claims.

## Consequences and rollout boundary

This ADR changes no runtime behavior. It does not add a state CLI, state file, public schema,
ruleset, source profile, active BaZi rule, host-model integration, network dependency, bundle,
release, or default. `ChartBundle`, `PublicResult v2`, `AnswerPlan v2`, existing rulesets, and
natural-delivery behavior remain unchanged.

The next possible slice is an internal-only state projection of already-shipped D1/D2 shadow
evidence, with deterministic fixtures and no narration wiring. It must first declare its exact
files, dependencies, synthetic cases, privacy checks, and compatibility tests. D2-C3 source
research may resume only under separate authorization and does not block this architecture-only
direction.
