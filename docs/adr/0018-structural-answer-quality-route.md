# ADR 0018: Structural answer-quality route

- Status: Accepted
- Date: 2026-09-03
- Scope: IQ-0 exit criteria, Quality-Evidence Track admission, and evidence-claim boundaries
- Supersedes: the IQ-0 exit-criterion portion of roadmap v2
- Related: [Product technical roadmap](../PRODUCT_TECHNICAL_ROADMAP.md),
  [Commander protocol](../COMMANDER_PROTOCOL.md), [ADR 0017](./0017-product-technical-roadmap-and-execution-governance.md),
  and [Answer-quality evaluation](../ANSWER_QUALITY_EVALUATION.md)

## Context

Roadmap v2 made documented human review, activation of controlled sealed-holdout storage, and a
legacy baseline required IQ-0 exit criteria. The repository now has a bounded synthetic corpus,
adversarial candidates, deterministic structural checks, and a planned-only holdout manifest, but
none of those artifacts is evidence that people reviewed answer semantics or that a real holdout
or baseline exists.

The owner has decided not to create those real evidence assets as a prerequisite for IQ-1. Treating
their absence as satisfied, or treating deterministic corpus checks as a substitute, would make the
roadmap appear complete by changing words rather than evidence.

## Decision

Roadmap v3 redefines IQ-0 as **structural answer-quality safeguards**. Its required exit consists
of the bounded rubric, 20–30 synthetic development candidates, adversarial candidates,
deterministic structural checks, and explicit non-claim boundaries. Passing that exit admits IQ-1;
it does not validate answer semantics, naturalness, usefulness, generalization, traditional-method
correctness, prediction accuracy, or real-world validity.

Documented human review, activation of an off-repository sealed holdout, and a legacy comparison
baseline move to an optional, separately owner-authorized **Quality-Evidence Track**. If that track
is opened, it keeps the established privacy, storage, retirement-and-replacement, and no-aggregate-
score rules. It does not become active merely because public metadata or a planned manifest exists.

The existing planned sealed-holdout manifest and synthetic review-linkage artifacts remain in the
repository. They are governance and structural-boundary records only. No active holdout, human
review, legacy answer, or quality-evidence result is created by this decision.

## Alternatives considered

1. Keep all three real-evidence prerequisites. Rejected by the owner: they are not planned product
   gates for the current route.
2. Remove the corpus and structural checks as well. Rejected: those checks remain useful privacy,
   traceability, and boundary safeguards for IQ-1.
3. Retain the v2 requirements but mark planned metadata as completed evidence. Rejected: that would
   misrepresent what the repository can prove.

## Consequences

- IQ-1 may begin after the v3 structural IQ-0 exit is met.
- Future prompts must state that the Quality-Evidence Track is optional and that its absence does
  not block IQ-1.
- No report may call the structural corpus, deterministic checks, or planned manifest a
  human-validated answer-quality baseline, a generalization result, or a prediction result.
- A later decision may authorize a bounded Quality-Evidence Track slice without changing runtime
  behavior. Its findings remain separate from Reliability Lab and Predictive Validity Research.
- This ADR changes no runtime, public contract, ruleset, Skill, CLI, bundle, package version,
  release, or persisted user data.
