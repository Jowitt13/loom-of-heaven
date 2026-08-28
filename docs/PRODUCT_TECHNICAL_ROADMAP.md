# Loom product technical roadmap

- Roadmap id: `loom-product-roadmap/v1`
- Status: **Accepted and owner-confirmed**
- Confirmed: 2026-08-28
- Authority: product direction, technical sequencing, and slice admission
- Related: [ADR 0017](./adr/0017-product-technical-roadmap-and-execution-governance.md),
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

## 4. Authoritative phase order

The normal order is `G0 -> IQ-0 -> IQ-1 -> IQ-2 -> IQ-3 -> IQ-4 -> IQ-5 -> IQ-6 -> PLAT-1 -> DATA-1 -> EXP-1`.
Research-only or shadow-only work may run in parallel when it cannot change runtime output and does
not displace the active phase. A later phase may not be pulled forward because it is easier or more
visible.

### G0 — governance and security baseline

**Current active phase.** Finish the verified internal-state laboratory without bypassing repository
security controls.

Required sequence:

1. classify the Mimosa commit-gate findings and separate introduced findings from legacy findings;
2. harden accepted legacy command boundaries in a dedicated, reviewable slice or record a precise
   repository policy decision—never use `--no-verify`;
3. preserve and complete P2-C's coverage matrix after the gate is legitimately clear;
4. keep P2-C development-only, synthetic-only, and outside runtime wiring.

Exit criteria: commit path passes without bypass; P2-C fixture, verifier, tests, counts, CI, and
runtime-isolation checks pass; no public capability claim changes.

### IQ-0 — final-answer quality baseline

Build a de-identified, versioned evaluation corpus for representative user questions, starting
with career. Record useful answers and failure modes: vague prose, term dumping, unsupported facts,
mechanism leaps, contradictory systems, repeated conclusions, default footer clutter, and missing
conditions.

Exit criteria: bounded rubric, adversarial cases, deterministic structural checks, and a documented
human-review layer. No claim that a heuristic text gate proves interpretation quality.

### IQ-1 — AnswerClaim and NarrativeTrace

Turn accepted internal state into topic-scoped `answer-claim` records. Each claim binds system,
fact evidence, rule or source profile, mechanism, practical implication, relevant condition,
caveat, dependencies, and invalidation causes. `NarrativeTrace` is internal and regenerable; it is
not chain-of-thought and is not printed by default.

Exit criteria: typed contracts, deterministic projection, privacy checks, invalidation tests, and
no change to default prose until a separately admitted runtime slice.

### IQ-2 — final-answer faithfulness verifier

Verify the text actually delivered to the user against approved answer claims. The verifier must
distinguish supported, unsupported, and contradicted factual assertions, then separately detect a
professional-mechanism leap or scope overreach. It reports bounded failure categories, not an
“accuracy score”.

Exit criteria: wrong-chart swaps, leading-user contradictions, invented professional terms,
unsupported causal jumps, omitted material conditions, and forbidden footer leakage are covered
by adversarial fixtures. A second model may review but cannot be the sole gate.

### IQ-3 — career vertical slice

Prove one complete user journey before expanding horizontally: clarify the question, calculate the
selected systems, project only relevant evidence, form verified claims, synthesize agreements and
disagreements, and deliver flexible natural prose. Career is the first slice because it exercises
ability, environment, timing, trade-offs, and practical advice without requiring medical or
clinical inference.

Exit criteria: representative exact/approximate/unknown-time cases, single- and multi-system cases,
conflict cases, source-blocked cases, four-host acceptance, and reviewed answer examples. The
result must be specific without claiming fate or scientific prediction.

### IQ-4 — structured clarification and response projection

Add a hard clarification boundary for settings and user intent that materially change the answer.
The machine surface returns bounded required questions, confirmed settings, and clarification
notes. Add a `response_view`-style projection so the narrator receives only the sections relevant
to the current topic and requested depth.

Exit criteria: no hidden default changes; unanswered material settings fail closed or degrade;
projection cannot conceal a material caveat; full internal evidence remains auditable.

### IQ-5 — cross-system synthesis

Create a traceable synthesis layer over existing four-system claims. Preserve each system's
mechanism and classify relationships only as `convergent`, `conflicting`, or `incomparable`. Never
average systems into a confidence score and never let one system repair another system's missing
evidence.

Exit criteria: synthetic convergence, conflict, incomparability, missing-system, and source-blocked
cases; every synthesis statement resolves to original claims and caveats.

### IQ-6 — optional audit and report delivery

Expose de-identified technical explanation only when requested: calculation convention, source,
evidence path, relevant warnings, and version chain. After answer quality is stable, add optional
structured export and then DOCX/PDF reports as separate delivery surfaces.

Exit criteria: default answer remains clean; audit and report reproduce the same approved claims;
no raw sensitive input or internal reasoning is leaked.

### PLAT-1 — optional MCP facade and client configuration

Keep the Skill and stable local CLI canonical. Add a thin optional MCP facade and client-config
generator only after IQ-0 through IQ-4 are stable. The facade must call the same bundle and public
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

The published nonclinical personality Skill is an independent product surface. Psychology-informed
narration may later improve wording, questions, uncertainty, and action framing, but it may not
infer questionnaire answers or diagnoses from a chart. Clinical screening phases remain paused
until rights, safety kernel, qualified human review, privacy, and host gates are independently met.

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

- `loom-product-roadmap/v1` — 2026-08-28: establishes verified-reasoning positioning, freezes the
  G0-to-EXP-1 phase order, adopts selected workflow lessons, and makes the commander protocol
  mandatory.
