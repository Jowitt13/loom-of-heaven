# ADR 0017: Product technical roadmap and execution governance

- Status: Accepted
- Date: 2026-08-28
- Amended: 2026-08-29 — roadmap v2 sequencing and evaluation boundaries
- Scope: product positioning, technical sequence, command admission, and roadmap change control
- Related: [Product technical roadmap](../PRODUCT_TECHNICAL_ROADMAP.md),
  [Commander protocol](../COMMANDER_PROTOCOL.md), [ADR 0016](./0016-interpretable-state-and-accuracy-lab.md),
  and [Narrative Output V1](../NARRATIVE_OUTPUT_V1.md)

## Context

Loom has a released deterministic four-system calculation product, natural-delivery rules, source
governance, a separate nonclinical psychology surface, and a large development-only interpretation
state laboratory. The project also has several attractive possible directions: deeper BaZi rules,
final-answer verification, topic projections, cross-system synthesis, reports, MCP, local memory,
psychology-informed narration, and broader technique coverage.

Without one authoritative sequence, an executor can mistake the newest research result or the
easiest visible feature for the product priority. That creates technically sound but strategically
disconnected slices, repeated source research, and a widening gap between strong calculation gates
and the quality of the final answer users receive.

A review of broader metaphysics workstations also clarifies the intended trade-off. Loom should
adopt useful interaction patterns—clarification, response projection, answer faithfulness,
conflict-aware synthesis, optional audit and reports—without turning tool count, default data
retention, mandatory technical footers, or a large multi-service runtime into product goals.

## Decision

`docs/PRODUCT_TECHNICAL_ROADMAP.md` is the authority for product destination, phase order, global
invariants, bounded parallel tracks, and roadmap change control. `docs/COMMANDER_PROTOCOL.md` is the
mandatory admission format for every implementation or research slice. `AGENTS.md` routes all
agents to both documents before they plan or edit.

The product direction is a compact, deterministic, source-governed, privacy-first four-system
reasoning engine. The immediate route is to finish governance and the P2-C laboratory, then improve
the final-answer quality loop before adding platform surfaces, memory, or technique breadth.

The fixed normal phase order remains:

```text
G0 -> IQ-0 -> IQ-1 -> IQ-2 -> IQ-3 -> IQ-4 -> IQ-5 -> IQ-6 -> PLAT-1 -> DATA-1 -> EXP-1
```

Roadmap v2 fixes the responsibilities inside that order:

- IQ-0 establishes a bounded public development corpus plus off-repository sealed-holdout
  governance;
- IQ-1 separates `AnswerClaimCandidate` from `ApprovedAnswerClaim`, uses bounded mechanism
  references, and keeps `NarrativeTrace` transient and regenerable;
- IQ-2 verifies final-answer faithfulness before a runtime vertical is admitted;
- IQ-3 implements structured clarification and response projection before the career vertical;
- IQ-4 proves career in one source-admitted system;
- IQ-5 introduces the separate `SynthesisRecord` and only then expands career across systems;
- IQ-6 proves repeated-run, host, and language stability before optional audit/report surfaces.

The project explicitly separates the Reliability Lab, the Answer Faithfulness & Quality Lab, and
Predictive Validity Research. Their evidence cannot be substituted or collapsed into one accuracy
number. Predictive validity remains separately authorized research and is not a normal release
gate.

The default answer presentation is also a governed invariant: the professional mechanism and its
concrete implication are adjacent; wording and structure remain flexible; material caveats are
inline; `讲人话` labels, automatic technical panels, fixed disclaimers, and standard follow-up
menus are forbidden. Technical audit is shown only on request.

During the G0/IQ critical path, the independent nonclinical psychology surface is maintenance-only.
Zi Wei source work may continue as research-only, but neither track can displace the active phase or
activate a runtime rule without its ordinary source and owner gates.

Shadow-only and research-only tracks may run in parallel only when they cannot alter runtime output
and do not displace the active product phase. Urgent calculation, privacy, security, supply-chain,
host, or release-integrity maintenance may interrupt the sequence but may not expand capability.

Every future command names its roadmap anchor, user value, prerequisites, exact scope, invariants,
acceptance evidence, stop conditions, and delivery authority. A task with no anchor is not admitted.

## Precedence

For product execution, instructions are interpreted in this order:

1. user and platform safety instructions;
2. `AGENTS.md` repository-wide invariants;
3. this accepted ADR and the product technical roadmap;
4. domain ADRs, source matrices, release and privacy policies;
5. the current slice prompt.

A lower-level prompt may narrow higher-level rules but cannot silently override them.

## Consequences

- Interpretation quality becomes the next product investment after G0, rather than technique
  count or a new UI shell.
- Clarification and response projection precede the single-system career vertical; cross-system
  synthesis follows only after that vertical is proven.
- Candidate claims cannot be narrated; approved single-system claims and cross-system synthesis
  remain separate internal records.
- Public development cases and sealed holdout evidence have separate storage and retirement rules.
- Final-answer faithfulness must validate claims and mechanism boundaries, not only chart tokens.
- Clarification, projection, synthesis, report, MCP, and memory work have explicit later phases.
- BaZi D1/D2 evidence stays shadow-only until source and rule admission is complete.
- Psychology and clinical work retain their independent architecture and release gates.
- Default answers remain natural and uncluttered; technical detail is on request.
- Route changes require an owner decision, ADR, roadmap version change, gate update, and green
  verification. “Continue” is not permission to skip a phase.

This ADR changes no current runtime, public contract, ruleset, output, version, package, release, or
manifest. It governs subsequent work.
