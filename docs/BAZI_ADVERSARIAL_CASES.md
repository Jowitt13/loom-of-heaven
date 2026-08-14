# BaZi Reasoning 2.0 adversarial case contract

> Status: Proposed test contract for ADR 0015. All cases are synthetic technical fixtures, not
> real people and not evidence that BaZi predicts life outcomes.
>
> Initial corpus: 30 cases. A code slice may implement only the case ids named in its commander
> task. Expected results may not be weakened merely to make an implementation pass.

## Purpose

Ordinary happy-path examples are insufficient for a stateful BaZi rules engine. This corpus is
designed to expose:

- loss of information between provider facts and rule judgments;
- accidental counting of one fact several times;
- special-pattern labels that ignore blockers;
- useful-god routes that overwrite one another;
- relation geometry treated as automatic good/bad effect;
- timing “convergence” manufactured from duplicate evidence;
- hidden dependence on an hour pillar or an unsupported provider convention;
- narration that turns a traditional rule match into certainty or probability.

The suite tests software consistency under accepted rulesets. It does not test scientific or
real-world predictive accuracy.

## Fixture classes

Use the smallest fixture that can prove the intended layer:

1. **Provider-boundary fixtures** start from a fully synthetic `BirthInput` and test normalization,
   provider behavior, warnings, and canonical output.
2. **Structural/rule fixtures** build a complete synthetic `BaziChartResult` with canonical stems,
   branches, hidden stems, and optional luck cycles. Placeholder `X` stems/branches are forbidden
   once a case participates in geometry or pattern-state tests.
3. **Overlay fixtures** contain a synthetic natal chart plus synthetic deterministic major-cycle,
   year, and optional month layers. They contain no biography or claimed event.

Every fixture must include a visible marker such as `fixtureKind: "synthetic-technical"` in its
source file or adjacent test description.

## Case schema

Each implemented case must record:

```ts
interface BaziAdversarialCase<TInput, THardFacts, TRuleExpectation> {
  id: `BZ-${string}`;
  fixtureKind: 'synthetic-technical';
  phase:
    'provider' | 'structural' | 'strength' | 'pattern' | 'useful-god' | 'relation' | 'temporal';
  rulesetIds: string[];
  sourceRowIds: string[];
  input: TInput;
  hardExpectedFacts: THardFacts;
  ruleExpectation: TRuleExpectation;
  explicitlyDisputed: string[];
  mustNotClaim: string[];
}
```

Hard facts and school judgments must never share one untyped expected string. A case may define
different judgments for different accepted school profiles while keeping the same hard facts.

## The first 30 cases

### Provider and input boundaries

| Id        | Synthetic construction                                                                                                                    | Hard expected facts                                                                                                                                              | Rule expectation                                                                                                 | Must not claim                                                                                                 |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `BZ-C001` | Two wall times immediately before/after 23:00 under the current late-zi/zi-hour profile; repeat with requested midnight/early-zi settings | Current provider records the applied convention; an unsupported requested variant emits the existing explicit warning and does not silently claim it was applied | Reasoning consumes only the actual returned pillars and `dayBoundaryApplied`                                     | Requested midnight/early-zi was implemented; both profiles are equivalent; one boundary is universally correct |
| `BZ-C002` | Synthetic longitude/time where apparent or mean solar time crosses an hour or civil-day boundary while civil time does not                | BaZi output changes only when its `solarTimeMode` changes; normalized UTC remains one instant; Western facts are unaffected by the BaZi solar-time choice        | Every downstream BaZi fact links to the selected/applied time profile                                            | Solar time globally replaces UTC; 120°E is a universal reference; the model may choose the preferred profile   |
| `BZ-C003` | `timeAccuracy: unknown`, no local time, no rule gender                                                                                    | Hour pillar and luck cycle are null; no hour branch, hour root, hour relation, or gender-dependent spouse-star evidence exists                                   | Enhanced stages either omit hour-dependent results or return `not-applicable`/`unresolved` with a bounded caveat | A guessed hour, hidden hour root, luck cycle, spouse star, or false high confidence                            |

### Root and strength evidence

| Id        | Synthetic construction                                                                                                                   | Hard expected facts                                                                   | Rule expectation                                                                                              | Must not claim                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `BZ-R001` | Day-master element appears as the primary hidden stem in exactly one non-month branch                                                    | One primary direct root at the recorded pillar; one evidence ref                      | Root existence is matched; effectiveness depends on later relation context                                    | “Three roots” from multiple labels; automatic strong verdict                                         |
| `BZ-R002` | Day-master element appears only as a secondary hidden stem                                                                               | One secondary direct-root candidate; no primary root                                  | Selected profile distinguishes it from a primary root and may state lower/conditional effectiveness           | No root exists; secondary equals primary without a profile                                           |
| `BZ-R003` | Day-master element appears only as a residual hidden stem                                                                                | One residual direct-root candidate                                                    | Decision remains weaker or unresolved according to the accepted profile                                       | Residual root is silently discarded or counted as full primary support                               |
| `BZ-R004` | One branch contains more than one supportive hidden stem/category relevant to the day master                                             | One branch position with multiple hidden-stem evidence entries                        | Root aggregation preserves stem-level evidence but does not inflate branch count                              | Each hidden stem is a separate physical branch/root; resource qi is silently relabeled direct root   |
| `BZ-R005` | The only direct root participates in an accepted six-clash geometry; no other root exists                                                | Root exists and a clash geometry points to its branch                                 | Effect stage returns weakened/adverse/unresolved according to profile, with both existence and clash evidence | Clash automatically erases the root; clash is automatically disastrous                               |
| `BZ-R006` | The only direct root participates in a harmony/combination but transformation conditions are absent                                      | Root and combination geometry both exist; transformation is rejected or unresolved    | Root may be bound/weakened/unresolved under profile, but remains traceable                                    | Combination automatically transforms or makes the root disappear; harmony is automatically favorable |
| `BZ-R007` | Two roots at different qi levels; only one is affected by a relation                                                                     | Two roots with separate positions and qi levels; relation targets only one            | Aggregate strength preserves one unaffected source and one affected decision                                  | All roots are damaged because one branch is clashed; both are equally effective                      |
| `BZ-R008` | Month command supports the day master, visible support exists, but there is no direct root and strong drain/pressure evidence is present | Season, visible support, absence of root, drain, and pressure are distinct dimensions | Structured strength exposes contradictions and may be balanced/weak/unresolved under profile                  | 得令 alone proves strong; a numeric diagnostic is universal truth                                    |

### Pattern and state candidates

| Id        | Synthetic construction                                                                                                          | Hard expected facts                                                                          | Rule expectation                                                                                | Must not claim                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `BZ-P001` | Month main qi maps to a regular 财官印食伤 pattern, but separate failure evidence is present                                    | Pattern-name candidate and failure evidence are both present                                 | Pattern lifecycle distinguishes “named” from `formed`, `broken`, or `unresolved`                | Naming the pattern proves it is formed or auspicious                                    |
| `BZ-P002` | Month branch is the selected day stem's exact 临官 seat                                                                         | Exact seat match and month main-qi relation                                                  | Jianlu candidate matches under the accepted seat table                                          | Every peer month is Jianlu; Jianlu decides final useful god alone                       |
| `BZ-P003` | Month branch is the selected day stem's exact Yangren seat; include a yin-stem variant as a separate row in the fixture         | Seat-table result is explicit                                                                | Judgment follows the named profile and records disputed yin-stem behavior                       | A hidden universal Yangren table; Yangren duplicated as an ominous shensha              |
| `BZ-P004` | One miscellaneous-qi month with two non-primary hidden stems visibly transparent                                                | All transparent candidates are retained with deterministic ordering                          | Selected profile chooses/conditions a main candidate while preserving the competing candidate   | Arbitrary legacy priority is classical truth; losing candidate disappears from evidence |
| `BZ-P005` | Miscellaneous-qi month with no eligible hidden stem transparent                                                                 | Storage branch and hidden stems are factual; transparency set is empty                       | Pattern result is unresolved/“另取” with explicit reason                                        | Guessing a pattern from the main qi or strongest-looking element                        |
| `BZ-P006` | Apparent follow-wealth structure but one accepted effective resisting root remains                                              | Wealth-side evidence and resisting root blocker both exist                                   | Follow-wealth candidate is rejected or unresolved under the selected profile                    | “Very weak” automatically means 从财; blocker is omitted                                |
| `BZ-P007` | Apparent follow-officer structure with no known direct root, but hour is unknown or a disputed residual/support factor remains  | Missing-hour/uncertain evidence is explicit                                                  | Candidate remains unresolved unless the selected profile proves the remaining factor irrelevant | Accepted 从官杀 with high confidence from incomplete input                              |
| `BZ-P008` | Dominant-element candidate with one effective alien factor that the profile defines as breaking the state                       | Dominant evidence and alien-factor blocker are separate                                      | Dominant candidate is rejected or unresolved                                                    | High element count alone proves 专旺; blocker is reclassified away                      |
| `BZ-P009` | Day stem has a five-combination partner, but season/transformation support is absent or the combination is broken               | Stem-combination geometry matches; transformation support does not                           | Transformation candidate is rejected; normal route remains available                            | “合” equals “化”; transformed element is inserted into chart facts                      |
| `BZ-P010` | Combination partner, selected seasonal support, and no obvious break are present; also include a competing root/resistance flag | Geometry and all selected positive conditions are listed; competing evidence remains visible | Accepted profile may return candidate/matched/unresolved according to its exact conditions      | Universal 化气 conclusion; removal of contrary evidence; cross-school agreement         |

### Useful-god and climate arbitration

| Id        | Synthetic construction                                                                                                     | Hard expected facts                                            | Rule expectation                                                                      | Must not claim                                                                          |
| --------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `BZ-U001` | Structured strength has balanced or contradictory dimensions and no accepted special state                                 | All dimensions and contradictions are present                  | Support/balance route is unresolved; arbiter may return no primary preference         | The engine must always output one useful god; “balanced” is secretly forced strong/weak |
| `BZ-U002` | Support/balance route and accepted pattern-pivot route nominate opposing elements                                          | Each route has independent source ids and evidence             | Resolution records a route conflict and applicable conditions; no vote                | One route overwrites the other; arbitrary weighted winner; school count as evidence     |
| `BZ-U003` | Extreme synthetic cold/heat condition where an accepted climate profile nominates a preference opposite to support/balance | Seasonal/climate inputs and both route candidates are explicit | Profile-specific precedence is reported with conflict/caveat                          | “调候永远第一”; climate result as scientific physiology or health advice                |
| `BZ-U004` | Climate route nominates an element that is absent, unrooted, blocked, or unusable under the same profile                   | Need, presence, availability, and usability are separate facts | Candidate is conditional/unavailable; arbiter does not equate need with effective use | “缺什么补什么”; lifestyle/color prescriptions as guaranteed remedy                      |

### Relation geometry and contextual effect

| Id        | Synthetic construction                                                                                                         | Hard expected facts                                             | Rule expectation                                                                           | Must not claim                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `BZ-G001` | One exact six-harmony pair involving a factor whose preference is unresolved                                                   | Harmony geometry and participants only                          | Effect is neutral/unresolved until upstream context exists                                 | 六合 automatically 吉; automatic transformation into the table element                               |
| `BZ-G002` | A clash targets the only factor accepted as helpful under the selected profile                                                 | Clash geometry, target factor, and preference refs are explicit | Effect may be adverse/weakened under profile; root existence remains visible               | Clash universally bad; target fact deleted from history                                              |
| `BZ-G003` | A clash targets an accepted blocker/harmful factor while also disturbing another neutral structure                             | Both target paths are represented                               | Effect is favorable or mixed according to selected profile, with both consequences         | 冲 automatically 凶; only the convenient consequence is shown                                        |
| `BZ-G004` | Two branches form an incomplete three-harmony; a third synthetic variant completes it but another factor breaks transformation | Pair/triple membership and break geometry are exact             | Half-combination, complete bureau, and transformation assessment remain distinct decisions | Two branches equal a transformed bureau; complete geometry guarantees transformation or favorability |

### Temporal convergence

| Id        | Synthetic construction                                                                                                                                                                 | Hard expected facts                                                                         | Rule expectation                                                                                                                             | Must not claim                                                                                                                |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `BZ-T001` | One synthetic year contains a ten-god activation and an accepted palace/relation activation; duplicate the same relation in two paths; compare a year with only the duplicate relation | Signal ids, categories, provenance, active major cycle, and duplicate ancestry are explicit | Two distinct categories may reach medium/high convergence under policy; duplicated descendants count once and cannot raise convergence alone | Percentage probability, guaranteed marriage/event, repeated wording as independent evidence, hindsight biography as a fixture |

## Cross-case invariants

Every implemented case must assert all applicable invariants:

1. Identical input, ruleset, and versions produce byte-identical canonical JSON.
2. Evidence refs resolve to an existing input fact or earlier-stage decision.
3. A blocker or contradiction is never dropped merely because a candidate matches.
4. `rejected`, `unresolved`, and `not-applicable` are distinct states.
5. Unknown time never creates hour-dependent evidence.
6. Geometry never contains inherent auspiciousness in the enhanced line.
7. Transformation never follows from combination geometry alone.
8. School-specific output names the school/ruleset and does not overwrite shared facts.
9. Confidence describes rule-match clarity, not real-world probability.
10. User-facing adapters do not print internal weights, raw rule paths, or an automatic technical
    appendix unless the user asks for technical detail.
11. No case contains a real name, location, birth record, life event, or questionnaire response.
12. Frozen `bazi-rules-ziping@0.1.0` snapshots remain unchanged unless an explicit migration test
    demonstrates an authorized compatibility change.

## Phase admission

| Rollout slice                      | Required cases before implementation can be accepted                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| D1 structural evidence             | `BZ-C001`–`BZ-C003`, `BZ-R001`–`BZ-R007`, geometry hard facts from `BZ-G001`–`BZ-G004` |
| D2 strength and pattern candidates | `BZ-R001`–`BZ-R008`, `BZ-P001`–`BZ-P010`                                               |
| D3 useful-god and relation effects | `BZ-U001`–`BZ-U004`, `BZ-G001`–`BZ-G004`, relevant upstream cases                      |
| D4 temporal overlays               | `BZ-T001` plus all upstream cases used by its signals                                  |
| D5 school divergence               | At least one pair of judgments for every disputed pattern/useful-god case in scope     |

Passing a later slice requires the upstream cases it consumes. A task may add more cases, but it
may not silently change these case meanings.

## Differential testing boundary

Differential testing compares reproducible facts only:

```text
Four Pillars
solar-term boundaries
hidden-stem membership/order under a named profile
ten-god mapping
luck-cycle direction/start under the same convention
void and twelve-growth lookup only after their profiles are frozen
```

It does not compare “correct useful god”, “accurate marriage year”, personality, wealth, health, or
life outcomes. External outputs are investigation leads, not goldens. Every disagreement becomes a
reviewed synthetic fixture with provider versions and conventions recorded.

## Hermes handoff rule

For each executor task, Codex supplies:

- the exact case ids in scope;
- the accepted source-matrix rows and source ids;
- an allowed-file list;
- the frozen legacy snapshots that must remain unchanged;
- commands that exercise the cases and repository gates.

DeepSeek Hermes must report each case as `implemented`, `already satisfied`, or `blocked`, with the
specific file and test evidence. It must not edit expected outcomes to match its implementation,
invent a classical source, introduce a hidden numeric score, or continue into the next dependency
stage. Codex independently reviews the diff and reruns the named tests before acceptance.

## Deferred case backlog

The first 30 cases are not the complete domain suite. Later source-cleared additions should cover:

- full 10-stem hidden-stem/root matrix;
- 官杀混杂, 食神制杀, 杀印相生, 伤官佩印, 伤官见官 exceptions;
- 枭神夺食, 比劫夺财, 财多身弱, 印多为病, 刃旺无制;
- 争合, 妒合, 贪合忘生, 贪合忘克;
- 岁运并临, 伏吟, 反吟, 天克地冲;
- month-level temporal overlays;
- solar-term, DST, historical timezone, lunar-leap-month, and day-boundary differential sweeps.

Each deferred family still needs source admission; listing it here is not authorization to ship it.
