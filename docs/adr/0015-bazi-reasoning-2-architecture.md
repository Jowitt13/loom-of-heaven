# ADR 0015: BaZi Reasoning 2.0 architecture and staged rule deepening

- Status: Proposed — architecture, source gates, and adversarial cases only; no Reasoning 2.0
  calculation or interpretation code is implemented by this ADR
- Date: 2026-08-14
- Scope: `@loom/bazi`, `@loom/bazi-rules`, their interpretation consumers, and BaZi-specific
  contracts and tests
- Companion documents: [`docs/BAZI_SOURCE_MATRIX.md`](../BAZI_SOURCE_MATRIX.md) and
  [`docs/BAZI_ADVERSARIAL_CASES.md`](../BAZI_ADVERSARIAL_CASES.md)

## Context

Loom already has a deterministic BaZi provider, typed chart contracts, source-cited rule findings,
provenance, offline packaging, and controlled host narration. Its current weakness is the middle
reasoning layer between a correct chart and a useful interpretation.

The current `bazi-rules-ziping@0.1.0` implementation is intentionally compact:

- strength is reduced to `strong | balanced | weak` from month support, main-qi roots, and visible
  supporting stems;
- regular pattern selection covers month-command patterns, Jianlu, Yangren, and transparent
  miscellaneous-qi months, but it has no stateful follow/dominant/transformation classifier;
- useful-god direction is a single support/balance route;
- relation detection attaches an auspicious/inauspicious polarity before chart context is
  evaluated;
- luck-cycle and annual polarity consume that compressed strength verdict;
- rule findings are mostly strings and cannot represent competing candidates, blockers,
  contradictions, school divergence, or dependency provenance.

This ADR defines a staged replacement without changing the existing ruleset silently. It does not
assert that traditional BaZi is scientifically predictive. Confidence below means confidence in a
rule match under a named ruleset, never a real-world event probability.

## Decision 1: preserve the calculation, rule, and narration boundaries

The target flow is:

```text
BirthInput
  -> time/location normalization
  -> @loom/bazi calculation provider
  -> BaziChartResult (reproducible chart facts)
  -> derived structural facts
  -> strength assessment
  -> pattern-state candidates
  -> school rule views
  -> useful-god resolution
  -> relation-effect evaluation
  -> temporal overlays and timing signals
  -> InterpretationFacts
  -> host narration
```

The host model never calculates pillars, hidden stems, ten gods, roots, pattern state, useful-god
routes, transformation, or timing signals. If a rule stage returns `unresolved`, narration must
preserve that result instead of filling the gap.

## Decision 2: keep the first implementation inside the existing packages

Package ownership is frozen as follows:

| Concern                                             | Initial owner                   | Boundary                                                                         |
| --------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------- |
| Provider-derived chart facts                        | `@loom/bazi`                    | Only reproducible calendar/structural facts; no auspiciousness or school verdict |
| Derived structural facts and shared rule primitives | `@loom/bazi-rules`              | Pure functions over `BaziChartResult`; no provider calls or narration            |
| School-specific compilers                           | `@loom/bazi-rules/src/schools/` | Added only after the corresponding source profile is accepted                    |
| Cross-system topic facts                            | `@loom/interpret`               | Maps stable rule results to bounded evidence-backed topics                       |
| Public schemas                                      | `@loom/contracts`               | Added only after an internal type survives its phase acceptance suite            |

A new `@loom/bazi-schools` package is premature. It may be proposed later only when at least two
independently sourced school compilers exist and the existing package boundary creates a measured
dependency or release problem.

## Decision 3: freeze existing behavior and introduce opt-in version lines

- `bazi-standard@0.1.0` and `bazi-rules-ziping@0.1.0` keep their existing meaning.
- Provider facts that change canonical chart JSON require a new calculation ruleset, initially
  reserved as `bazi-standard@0.2.0`.
- Interpretation changes require a new rule line, initially reserved as
  `bazi-rules-ziping@0.2.0`.
- Neither new id becomes the product default in a development PR.
- A release PR may change defaults only after backward-compatibility, host, narrative, and package
  gates pass and the owner explicitly authorizes the behavior change.
- During development, old and new rules may run side by side in tests. User-facing output must not
  emit duplicate legacy and enhanced readings.

## Decision 4: use typed evidence and categorical states, not a universal score

Reasoning 2.0 must separate these epistemic layers:

```text
FACT              provider-returned chart value
DERIVED_STRUCTURE deterministic relation derived from chart facts
RULE_JUDGMENT     conclusion under a named rule and source profile
SCHOOL_JUDGMENT   conclusion specific to an interpretation school
TEMPORAL_SIGNAL   time-overlay activation derived from earlier stages
MODEL_NARRATIVE   user-facing wording; never domain truth
```

Every nontrivial rule result must be able to carry:

```ts
interface BaziRuleEvidence {
  ref: string;
  layer: 'fact' | 'derived-structure' | 'rule-judgment' | 'school-judgment';
  role: 'support' | 'blocker' | 'contradiction' | 'context';
  note: string;
}

interface BaziRuleDecision<T> {
  value: T | null;
  status: 'matched' | 'rejected' | 'unresolved' | 'not-applicable';
  confidence?: 'low' | 'medium' | 'high';
  evidence: BaziRuleEvidence[];
  ruleId: string;
  sourceIds: string[];
}
```

Exact names remain implementation details until the contract phase. A numeric diagnostic may be
used in tests or explanations only when its weights and thresholds are versioned. It must not be
presented as metaphysical precision, predictive probability, or a universal strength truth.

## Decision 5: define a minimal root-state model before changing strength

The first structural slice answers two different questions:

1. Which roots exist?
2. Under the selected ruleset, what is the effective state of each root?

The minimum evidence model includes:

- pillar position: year, month, day, or hour;
- hidden-stem level: primary, secondary, or residual;
- day-master relationship;
- exposed/not exposed as a separate fact;
- relevant relation geometry affecting the branch;
- transformation assessment when applicable;
- effective state: `effective | weakened | neutralized | unresolved`;
- supporting and blocking evidence.

Root existence is a structural fact. Whether a clash, combination, void, storage state, or season
makes that root effective is a rule judgment and must not be folded into the provider silently.
Unknown birth time suppresses hour-root evidence rather than assuming an hour pillar.

## Decision 6: strength becomes a structured assessment

The enhanced strength stage must report dimensions rather than only a total:

```text
season support
root support
visible support
output drain
wealth drain
officer pressure
contradictions
```

The public-facing category may remain a small qualitative set. The decision must be reproducible
from the listed evidence and may return `unresolved` near a disputed boundary. It must not decide
special-pattern direction by itself.

## Decision 7: pattern state is a candidate classifier with explicit rejection

The internal state families are:

```text
normal
follow-candidate          (从格候选)
dominant-candidate        (专旺候选)
transformation-candidate  (化气候选)
```

English ids are deliberately neutral and stable; Chinese labels, subtypes, and acceptance rules
belong to a named school profile. Each candidate returns support, blockers, contradictions, and a
status. The engine must be able to say:

```text
follow-wealth rejected because an effective resisting root remains
transformation unresolved because the transformation conditions conflict
normal selected under ziping-pattern@1
```

No special-pattern label may be decorative. An accepted state must change downstream useful-god,
relation-effect, and temporal interpretation routes. Until the relevant rows in the source matrix
are accepted, the classifier may emit evidence-only candidates but may not finalize the state.

## Decision 8: useful-god meanings remain separate

The internal ontology must not collapse every historical use of “用神” into one field. It reserves
these channels:

```text
patternPivot
supportBalancePreference
climatePreference
medicinePreference
bridgePreference
specialPatternPreference
```

The first implementation tranche is limited to support/balance, pattern, and climate candidates.
Medicine/disease, bridge, and special-pattern preferences remain blocked until their source rows
are accepted independently.

Resolution may produce primary, secondary, conditional, avoid, and unresolved-conflict entries.
It is not required to manufacture one final preference. School count is never a vote weight.

## Decision 9: relation geometry and contextual effect are separate stages

`six-harmony`, `six-clash`, `harm`, `break`, `punishment`, `three-harmony`, `three-meeting`, and
stem combinations are geometry facts. Geometry carries no inherent `吉/凶` polarity.

A later effect stage evaluates, under a named ruleset:

- which structural factor is affected;
- whether the affected factor is currently preferred, avoided, or unresolved;
- whether a root is weakened or a blocker is removed;
- whether a combination binds, transforms, is broken, or remains unresolved;
- whether the result changes pattern state;
- whether the effect is favorable, adverse, mixed, neutral, or unresolved.

Existing consumers receive a compatibility mapping only under the frozen 0.1 ruleset. Enhanced
rules must not label every harmony favorable or every clash adverse.

## Decision 10: temporal reasoning consumes natal state and distinct signals

Temporal overlays are ordered data, not free-form prose:

```text
natal state + major cycle + year + optional month -> overlay state -> timing signals
```

One repeated mechanism does not become multiple evidence merely because it appears in several
sentences. Timing convergence requires signals from at least two distinct categories, such as:

- ten-god activation;
- palace/branch activation;
- accepted relation effect;
- major-cycle context;
- accepted pattern-state transition.

The output is `opportunity | change | instability | mixed | unresolved`, with low/medium/high
convergence. It never emits event probability or “必然发生”. Existing annual and marriage timing
functions remain frozen until they are deliberately rewired to the enhanced result.

## Decision 11: multi-school output is divergence, not consensus voting

All school compilers consume the same chart and structural facts. Each produces its own view with
source ids, assumptions, findings, and unresolved points. A divergence layer reports agreement,
conditional agreement, disagreement, and incomparable concepts.

No majority vote, weighted vote, or “three schools therefore true” mechanism is permitted.
Historically related schools are not statistically independent evidence.

## Decision 12: no generic runtime DAG in the first slice

The dependency order is explicit in typed pure functions:

```text
hidden-stem facts -> root state -> strength -> pattern state -> useful-god candidates
relation geometry -> transformation assessment -> relation effect
natal resolution + temporal layers -> timing signals
```

The first implementation uses an immutable stage context and direct imports. A generic graph
runtime may be proposed only if at least two school compilers need dynamic scheduling and tests
demonstrate that direct staging is insufficient. Calculation packages must never depend on
interpretation or orchestration packages.

## Public and internal contract policy

The initial enhanced types stay internal to `@loom/bazi-rules`. Public exposure requires all of:

1. stable semantics across the adversarial suite;
2. a source-matrix row with accepted status;
3. explicit schema and ruleset version decisions;
4. a bounded public representation that does not expose unstable diagnostics;
5. migration tests for old consumers.

Likely public candidates are final root evidence summaries, pattern-state decisions, useful-god
route summaries, school divergence, and timing-signal categories. Intermediate counters, ordering
heuristics, and experimental candidates remain internal.

## Rollout

### D0 — architecture and evidence freeze (this phase)

- add this ADR, the source matrix, and the first 30 adversarial case contracts;
- make no calculation, contract, ruleset, package, bundle, or user-facing capability change;
- record unresolved source and school questions as blockers.

### D1 — structural evidence, shadow-only

- add hidden-stem hierarchy and root-state internal types;
- add relation geometry without changing legacy polarity output;
- run enhanced structural facts in tests only;
- prove no change to `bazi-rules-ziping@0.1.0` canonical output.

### D2 — strength and pattern candidates, opt-in

- implement the structured strength assessment;
- implement normal and evidence-only special-pattern candidates;
- accept only source-cleared state transitions;
- create `bazi-rules-ziping@0.2.0` as an explicit opt-in ruleset.

### D3 — useful-god arbitration and relation effects

- implement support/balance, pattern, and accepted climate routes;
- preserve unresolved conflicts;
- add transformation and contextual relation-effect evaluation;
- keep medicine, bridge, and unsupported special routes disabled.

### D4 — temporal overlays

- rewire major-cycle, annual, marriage, and industry interpretations to enhanced natal resolution;
- add distinct-signal convergence and prevent duplicate evidence counting;
- retain non-probabilistic wording.

### D5 — school compilers and divergence

- add a school only after its exact source profile and operational rules are accepted;
- implement at least two independent profiles before considering a package split;
- expose divergence without voting.

### D6 — public contracts and release

- select stable summaries for public schemas;
- update bounded narration mappings and negative wording gates;
- run full host, package, provenance, determinism, and forward-install verification;
- change defaults only in a separately authorized release PR.

## Commander/executor protocol

The owner-selected implementation model is:

- **Codex acts as commander and reviewer.** It inspects current main, selects one rollout slice,
  writes the task specification, freezes the source rows and cases in scope, defines the file
  allowlist and acceptance commands, reviews the complete diff, and decides whether correction is
  required.
- **DeepSeek Hermes acts as bounded executor.** It implements only the assigned slice, may not
  widen theory or file scope, and reports changed files, assumptions, tests, failures, and remaining
  blockers. It may not push, open or merge a PR, create a tag/Release, or change published assets
  without a separate owner authorization.
- One executor task covers one dependency stage. Root-state, pattern-state, useful-god,
  relation-effect, and temporal rewiring are not combined in one implementation task.
- If Hermes cannot be invoked directly in the active environment, Codex provides a self-contained
  copyable prompt. The owner runs it in the Hermes host and returns the diff/report for Codex audit.
- A Hermes claim is not acceptance evidence. Codex re-runs the relevant tests and inspects every
  changed file before recommending commit, push, PR, merge, or release.

Every executor task must contain:

```text
baseline SHA
objective and non-goals
required source-matrix rows
adversarial case ids
allowed files
forbidden files and actions
contract/version boundary
required tests
handoff format
```

## Stop conditions

Stop the affected slice instead of improvising when:

- a rule lacks a reviewable classical or licensed source claim;
- a modern commentary is the only source and copying/translation rights are unclear;
- two schools use the same term with materially different semantics and no profile is selected;
- a fixture relies on a real person or private life-history data;
- a special-pattern decision has no explicit blocker/rejection path;
- a proposed numeric weight has no versioned operational justification;
- a change would silently alter a frozen ruleset;
- relation or timing output would claim deterministic real-world outcomes;
- implementation creates a dependency cycle or moves narration into the calculation core.

## Consequences

- BaZi depth grows vertically without weakening deterministic calculation or host boundaries.
- The enhanced line can return “unresolved” more often than the legacy line; this is intentional.
- Source work and adversarial fixtures become prerequisites, not documentation written after code.
- The project accepts a slower rollout in exchange for traceable school assumptions and stable
  backward compatibility.
- No code, public contract, default, package, bundle, tag, Release, or user-facing claim changes as
  a consequence of accepting this architecture alone.
