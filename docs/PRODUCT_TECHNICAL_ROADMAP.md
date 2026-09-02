# Loom product technical roadmap

- Roadmap id: `loom-product-roadmap/v3`
- Status: **Accepted and owner-confirmed**
- Confirmed: 2026-09-03
- Supersedes: `loom-product-roadmap/v2`
- Authority: product direction, technical sequencing, and slice admission
- Related: [ADR 0018](./adr/0018-structural-answer-quality-route.md),
  [ADR 0017](./adr/0017-product-technical-roadmap-and-execution-governance.md),
  [Commander protocol](./COMMANDER_PROTOCOL.md), [ADR 0016](./adr/0016-interpretable-state-and-accuracy-lab.md),
  and [Narrative Output V1](./NARRATIVE_OUTPUT_V1.md)

This is the authoritative route for new product work. `docs/STATUS.md` records historical delivery;
it does not override this roadmap. A future task may not start merely because it is technically
interesting: it must name a roadmap phase, satisfy that phase's admission conditions, preserve all
global invariants, and use the commander protocol.

## 1. Product destination

Loom is a **lightweight, deterministic, source-governed, privacy-first four-system reasoning
engine for AI agents**. It turns reproducible chart calculations into claims that retain their
fact, rule, source profile, limitation, and invalidation path, then helps a host model express those
claims as natural, specific language.

Loom is not trying to become the metaphysics product with the largest technique count. Its durable
advantage is the complete path:

```text
resolved input
  -> deterministic chart facts
  -> admitted rules and bounded judgments
  -> verifier-approved answer claims
  -> natural topic answer
  -> optional audit explanation
```

The final product should feel simple to the user while remaining inspectable internally. A default
answer explains the relevant mechanism beside the practical conclusion. It does not expose raw
ids, warning panels, a technique card, a fixed disclaimer footer, or a standard follow-up menu.

## 2. Positioning and explicit trade-off

Loom competes on:

- byte-identical deterministic calculation within declared versions;
- independent numerical references and honest precision scopes;
- source and school admission rather than citation decoration;
- evidence-to-rule-to-claim traceability;
- natural delivery without automatic technical clutter;
- offline, compact, portable execution and privacy by default;
- fail-closed degradation when inputs, sources, rights, precision, or rules are unresolved.

Loom does **not** compete on the number of divination techniques, a large desktop workstation,
default case-history retention, or a multi-gigabyte polyglot runtime. Technique expansion is
admitted only after the interpretation-quality loop is proven for the existing four systems.

## 3. Global invariants

Every phase and slice preserves all of these invariants:

1. The model never computes or backfills chart values. Calculation remains deterministic and
   offline.
2. A user-visible claim requires an active fact-to-rule-to-claim path. Missing evidence produces
   `unresolved`, degradation, or omission rather than invented confidence.
3. Distinct systems or schools do not vote, average, or silently lend each other terminology.
4. Cross-system synthesis records `convergent`, `conflicting`, or `incomparable` signals with their
   original mechanisms intact.
5. Default narration remains continuous prose. Audit detail is available on explicit request, not
   appended automatically.
6. Raw queries, chat transcripts, questionnaire answers, exact birth records, and model reasoning
   are not persisted by default. Any memory is separately designed, explicit opt-in, inspectable,
   deletable, and retention-bounded.
7. Psychology self-report never becomes a fact inferred from a chart. Nonclinical personality and
   clinical screening remain structurally separate from chart reasoning and from one another.
8. No generic accuracy percentage combines calculation, rules, state, narration, or traditional
   claims. Each verification layer reports its own bounded evidence.
9. Runtime remains compact and offline. A new service, network dependency, model SDK, persistent
   store, generic DAG runtime, or copyleft runtime dependency requires a separate architecture and
   license decision.
10. No task weakens tests, provenance, privacy, license, SBOM, host, install, or release gates to
    make a phase appear complete.

### 3.1 Answer presentation invariant

The default answer starts from the professional mechanism that matters and immediately gives its
concrete implication. It never prints a `讲人话` label, a fixed report template, or automatic
footer sections such as `敏感项校对`, `引擎警告`, `专业依据`, `声明`, or translated equivalents.
Structure and wording may vary naturally; the evidence, approved claim, material caveat, and
conclusion boundary may not. A caveat appears inline only when it materially changes the answer.
Technical evidence, provenance, and audit records appear only on explicit request.

### 3.2 Claim and synthesis invariant

`AnswerClaimCandidate` and `ApprovedAnswerClaim` are distinct internal states. A candidate cannot
be narrated until deterministic verification approves it. Mechanisms are referenced through
bounded `mechanismRefs`; conditions and caveats use bounded ids plus permitted parameters. V1 does
not expose a generic `confidence` field. If a bounded clarity indicator is later necessary, it is
named `ruleMatchClarity` and describes only rule-match clarity—not truth, probability, prediction,
or agreement between systems.

An answer claim belongs to exactly one chart system. Cross-system work uses a separate
`SynthesisRecord`; `cross-system` is not a chart-system value. A synthesis record preserves each
approved claim and can classify only `convergent`, `conflicting`, or `incomparable` relationships.

### 3.3 Evaluation-lab separation

The project maintains three non-interchangeable evidence programs:

1. **Reliability Lab** — deterministic calculation, rebuild, invalidation, linkage, mutation, host,
   package, and supply-chain behavior.
2. **Answer Faithfulness & Quality Lab** — structural safeguards for approved-claim fidelity,
   specificity, restraint, material-caveat retention, and natural presentation. Separately
   authorized human review, active sealed holdouts, and legacy comparisons are optional
   quality-evidence work; they do not become structural proof of answer quality.
3. **Predictive Validity Research** — separately authorized, de-identified, out-of-sample research
   into whether a traditional method carries predictive information beyond declared baselines.

The third program is research, not a normal product-release gate. Evidence from one lab never
upgrades the status of another, and no result is collapsed into one product “accuracy” number.

## 4. Authoritative phase order

The normal order is `G0 -> IQ-0 -> IQ-1 -> IQ-2 -> IQ-3 -> IQ-4 -> IQ-5 -> IQ-6 -> PLAT-1 -> DATA-1 -> EXP-1`.
Research-only or shadow-only work may run in parallel when it cannot change runtime output and does
not displace the active phase. A later phase may not be pulled forward because it is easier or more
visible.

### G0 — governance and security baseline

Complete the verified internal-state laboratory without bypassing repository security controls.

Required sequence:

1. classify the Mimosa commit-gate findings and separate introduced findings from legacy findings;
2. harden accepted legacy command boundaries in a dedicated, reviewable slice or record a precise
   repository policy decision—never use `--no-verify`;
3. preserve and complete P2-C's coverage matrix after the gate is legitimately clear;
4. keep P2-C development-only, synthetic-only, and outside runtime wiring.

Exit criteria: commit path passes without bypass; P2-C fixture, verifier, tests, counts, CI, and
runtime-isolation checks pass; no public capability claim changes.

### IQ-0 — structural answer-quality safeguards

**Current active phase.** Build de-identified structural safeguards for representative user
questions, starting with career. The public development set remains deliberately bounded to 20–30
synthetic cases; it grows only after the rubric and failure taxonomy stabilize. Record the
structural boundaries around vague prose, term dumping, unsupported facts, mechanism leaps,
contradictory systems, repeated conclusions, default footer clutter, missing conditions, jargon
without a concrete implication, and unsupported life verdicts.

The repository contains the schema, rubric, development and adversarial candidate corpus, and a
planned sealed-set metadata manifest. Deterministic checks enforce only structure, privacy,
inventory, linkage, candidate status, and runtime isolation. They do not assess prose semantics,
naturalness, utility, traditional-method correctness, prediction accuracy, or real-world validity.

Exit criteria: bounded rubric, 20–30 synthetic development candidates, adversarial candidates,
deterministic structural checks, and explicit non-claim boundaries. Human review, activation of
controlled sealed-holdout storage, and a legacy baseline are **not prerequisites for IQ-1**. They
remain an optional, separately owner-authorized Quality-Evidence Track. No structural or heuristic
gate proves interpretation quality.

#### Optional Quality-Evidence Track

If separately authorized, this track may establish controlled off-repository sealed-holdout
storage, documented human review, and a legacy comparison baseline. An inspected holdout case must
be retired into the public regression corpus and replaced; it is never silently reused as unseen
evidence. This track can produce its own bounded evidence record, but its absence never blocks
IQ-1 and its presence does not establish metaphysical truth or a generic accuracy percentage.

### IQ-1 — AnswerClaim and NarrativeTrace

Turn accepted internal state into topic-scoped `AnswerClaimCandidate` records, verify them into
`ApprovedAnswerClaim` records, and project only topic-relevant evidence. Each record binds one
system, fact evidence, rule or source profile, bounded mechanism references, practical implication,
relevant condition, caveat, dependencies, and invalidation causes. `NarrativeTrace` is internal,
transient, and regenerable; it is not chain-of-thought, a hidden user memory, or default output.

Exit criteria: candidate/approved typed contracts, deterministic topic projection, privacy checks,
invalidation tests, bounded reference resolution, and no change to default prose until a separately
admitted runtime slice.

### IQ-2 — final-answer faithfulness verifier

Verify the text actually delivered to the user against approved answer claims. The verifier must
distinguish supported, unsupported, and contradicted factual assertions, then separately detect a
professional-mechanism leap or scope overreach. It reports bounded failure categories, not an
“accuracy score”.

Exit criteria: wrong-chart swaps, leading-user contradictions, invented professional terms,
unsupported causal jumps, omitted material conditions, and forbidden footer leakage are covered
by adversarial fixtures. A second model may review but cannot be the sole gate.

### IQ-3 — structured clarification and response projection

Add a hard clarification boundary for settings and user intent that materially change the answer.
The machine surface returns bounded required questions, confirmed settings, and clarification
notes. Add a `response_view`-style projection so the narrator receives only the sections relevant
to the current topic and requested depth.

Exit criteria: no hidden default changes; unanswered material settings fail closed or degrade;
projection cannot conceal a material caveat; full internal evidence remains auditable.

### IQ-4 — single-system career vertical

Prove one complete user journey in one selected, source-admitted system before expanding to four-
system synthesis: clarify the question, calculate the chart, project only relevant evidence, form
approved claims, verify the proposed answer, and deliver flexible natural prose. Career is the
first slice because it exercises ability, environment, timing, trade-offs, and practical advice
without requiring medical or clinical inference.

Exit criteria: the selected system has representative exact/approximate/unknown-time cases,
source-blocked cases, contradiction cases, four-host acceptance, and reviewed answer examples. The
result must be specific without claiming fate or scientific prediction. Other systems remain
unchanged and cannot be used to repair missing evidence.

### IQ-5 — cross-system synthesis

Create a traceable synthesis layer over existing four-system claims. Preserve each system's
mechanism and classify relationships only as `convergent`, `conflicting`, or `incomparable`. Never
average systems into a confidence score and never let one system repair another system's missing
evidence. Only after the single-system career slice passes may career expand to a multi-system
journey.

Exit criteria: synthetic convergence, conflict, incomparability, missing-system, and source-blocked
cases; every synthesis statement resolves to original approved claims and caveats; the multi-system
career slice passes the same answer-quality and host gates as IQ-4.

### IQ-6 — stability, optional audit, and report delivery

Prove repeated-run, cross-host, and supported-language stability over the approved-claim boundary.
Expose de-identified technical explanation only when requested: calculation convention, source,
evidence path, relevant warnings, and version chain. After answer quality is stable, add optional
structured export and then DOCX/PDF reports as separate delivery surfaces.

Exit criteria: repeated-run, host, and language comparisons retain the same approved claim set and
material caveats; default answer remains clean; audit and report reproduce those claims; no raw
sensitive input or internal reasoning is leaked.

### PLAT-1 — optional MCP facade and client configuration

Keep the Skill and stable local CLI canonical. Add a thin optional MCP facade and client-config
generator only after IQ-0 through IQ-6 are stable. The facade must call the same bundle and public
contracts, add no calculation implementation, and preserve offline behavior.

Exit criteria: compact tool surface, exact CLI parity, host configuration tests, no network or
background service requirement, and no second product truth.

### DATA-1 — opt-in local session memory

Design memory only if users demonstrably need cross-session case continuity. It is off by default,
stores the minimum de-identified artifacts, and provides consent, inspection, export, retention,
deletion, and corruption recovery. Raw query and answer retention requires a separate explicit
choice.

Exit criteria: privacy threat model, storage ADR, deletion and retention tests, no telemetry, and
no change to users who do not opt in.

### EXP-1 — controlled capability expansion

Only after the interpretation-quality loop is proven may Loom add new techniques, predictive
methods, or workstation features. Each candidate must show user demand, admissible sources and
rights, deterministic feasibility, maintenance cost, runtime impact, and independent verification.

Exit criteria: separate owner admission per capability. Tool count is never a roadmap KPI.

## 5. Parallel bounded tracks

### BaZi Reasoning 2.0

D1/D2 structures remain shadow-only until source admission and rule-profile decisions are complete.
They may improve internal evidence and evaluation in parallel, but they cannot reach
`interpretBazi`, public contracts, CLI, Skill output, or a new ruleset merely because structural
tests pass. D2-C source and rights blockers remain real blockers.

### Psychology

The independently packaged nonclinical personality surface is in **maintenance mode** during G0
and IQ-0 through IQ-6: security, correctness, privacy, source, documentation, host, and release-
integrity fixes remain admitted, but new psychology capability does not displace the answer-quality
critical path. Its source-tree candidate and publication claims remain governed by the psychology
ADR, source matrix, immutable release evidence, and manifest state. Psychology-informed narration
may later improve wording, questions, uncertainty, and action framing, but it may not infer
questionnaire answers or diagnoses from a chart. Clinical screening phases remain paused until
rights, safety kernel, qualified human review, privacy, and host gates are independently met.

### Zi Wei source governance

Zi Wei source discovery, edition binding, and rule-matrix work may proceed as research-only when it
does not change runtime output or delay the active IQ phase. An attractive library, repository, or
technique is not an admitted rule. Runtime changes require the ordinary source, school, contract,
adversarial-case, and owner gates.

### Calculation and supply-chain maintenance

Critical calculation regressions, dependency vulnerabilities, license issues, secrets, host
breakage, and release integrity may interrupt the phase order. Maintenance does not authorize a
new capability or a product-direction change.

## 6. Patterns deliberately adopted and rejected

Patterns approved for Loom, implemented independently and only in their named phases:

- structured clarification for material settings;
- topic/depth response projection;
- final-answer fact and claim faithfulness verification;
- explicit convergence, conflict, and incomparability;
- on-request audit cards rather than mandatory footers;
- optional privacy-governed local memory;
- optional report export and an MCP facade after core quality is stable.

Patterns rejected as product direction:

- pursuing dozens of techniques before the quality loop is proven;
- mandatory technique cards, warning panels, citations, or disclaimers in every answer;
- default persistence of raw user queries, answers, or birth records;
- a multi-gigabyte or multi-service runtime without a separately accepted need;
- interpreting test pass counts as metaphysical or predictive accuracy;
- copying AGPL or otherwise incompatible implementation code into the MIT runtime.

## 7. Slice admission and completion

A slice is admitted only when its commander prompt contains every field required by
`docs/COMMANDER_PROTOCOL.md`. The slice must be the smallest independently reviewable step that
advances one roadmap exit criterion. Research, architecture, implementation, runtime activation,
and release are separate authorization boundaries unless the accepted prompt explicitly combines
them.

“Implemented” means code and focused tests exist. “Integrated” means the intended internal or
runtime path is wired. “Verified” means all named gates passed with real evidence. “Published”
means an owner-authorized immutable release and manifest promotion exist. These states are never
used interchangeably.

## 8. Roadmap change control

Changing the product destination, phase order, global invariants, default privacy, default output
surface, psychology separation, licensing direction, or runtime architecture requires all of:

1. an explicit owner decision;
2. a new or amended accepted ADR explaining the trade-off;
3. a roadmap version change and changelog entry;
4. matching updates to the commander protocol and static gate;
5. green repository verification before the new route directs implementation.

“Continue”, “next”, or executor convenience does not authorize route drift. It means: select the
next unblocked slice in this roadmap and prove its admission conditions.

## 9. Roadmap changelog

- `loom-product-roadmap/v3` — 2026-09-03: changes IQ-0 from a claimed final-answer quality
  baseline to structural answer-quality safeguards. Human review, activated sealed holdouts, and a
  legacy baseline become an optional, separately owner-authorized Quality-Evidence Track rather
  than IQ-1 prerequisites; structural evidence is explicitly prohibited from claiming semantic
  answer quality, generalization, or predictive validity.
- `loom-product-roadmap/v2` — 2026-08-29: separates Reliability, Answer Faithfulness & Quality,
  and Predictive Validity evidence; moves clarification/projection before the career vertical;
  proves career in one system before four-system synthesis; freezes candidate/approved claim and
  separate synthesis boundaries; adds sealed-holdout governance, the answer-presentation
  invariant, Zi Wei research-only routing, and psychology maintenance mode.
- `loom-product-roadmap/v1` — 2026-08-28: establishes verified-reasoning positioning, freezes the
  G0-to-EXP-1 phase order, adopts selected workflow lessons, and makes the commander protocol
  mandatory.
