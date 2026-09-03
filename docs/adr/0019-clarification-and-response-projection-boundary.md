# ADR 0019: Clarification and response-projection boundary

- Status: Accepted — architecture only; no runtime behavior enabled
- Date: 2026-09-04
- Scope: IQ-3 clarification materiality and response-view boundary
- Related: [Product technical roadmap](../PRODUCT_TECHNICAL_ROADMAP.md),
  [Commander protocol](../COMMANDER_PROTOCOL.md), [Narrative Output V1](../NARRATIVE_OUTPUT_V1.md),
  and [Clarification and response projection](../CLARIFICATION_AND_RESPONSE_PROJECTION.md)

## Context

`answer-plan/v2` already gives a host a bounded topic and lens, topic-scoped public facts, and
material caveats. It is an existing runtime surface, not an IQ-3 clarification decision. In
particular, its `lens` has a documented default and `runAnswerPlan` currently calculates all four
systems before projecting facts. Neither behavior records whether an answer-affecting choice was
explicitly confirmed, unavailable, or still needs clarification.

That gap is unsafe to solve by passing a raw user question into the engine or by silently letting a
host decide a time-sensitive setting, requested depth, rule variant, or system scope. It would also
be wrong to solve it with a fixed visible questionnaire or an automatic technical appendix.

## Decision

IQ-3 will use two future, transient records defined in the companion specification:

1. `clarification-plan/v1` determines whether a bounded request is `ready`,
   `requires-clarification`, or `degraded`. It returns only ordered question ids, bounded
   confirmed-setting states, note codes, and degradation codes.
2. `response-view/v1` is created only from a `ready` or `degraded` clarification result. It gives a
   narrator the selected single-system approved claims, topic, requested depth, and every material
   caveat that must remain visible. It is a projection record, not visible prose or a section
   template.

A setting that can change an eligible claim is material. It must be explicitly confirmed, be
declared unavailable with a named degradation, or prevent delivery. An unconfirmed default must
never produce `ready` or `degraded`. The fixed materiality registry is:

- `topic-intent` when no bounded topic has been selected;
- `response-depth` when the requested detail level is not bounded and explicit;
- `birth-time-reliability` when a time-sensitive claim would otherwise be eligible;
- `target-period` for a timing request without a bounded target period;
- `ruleset-variant` when a rule selection can change the candidate claim; and
- `system-scope` before selecting a system-specific claim path.

If the birth time or another setting is genuinely unavailable, the plan may be `degraded` only when
the affected claim class is removed and the matching caveat/degradation code remains in the
response view. It must not guess, default, or relabel the uncertainty as confidence.

An IQ-3 response view carries exactly one chart system's approved claims. It does not create a
cross-system claim, vote, average, or repair missing evidence. Cross-system records remain
reserved for IQ-5's `SynthesisRecord` boundary.

## Compatibility and activation boundary

This ADR leaves `answer-plan/v2`, `public-result/v2`, the existing CLI, the Skill, packages,
runtime output, rulesets, bundle, SBOM, and release artifacts unchanged. It introduces no command,
public schema, narrator, model call, persistence, cache, prompt store, or default output section.

The first implementation slice must add a deterministic materiality planner and synthetic cases
without integrating it into the existing answer path. A later, separately admitted integration
slice may choose a versioned machine surface only after it proves that an unanswered material
setting fails closed or degrades, and that response projection cannot conceal a material caveat.
It may not mutate `answer-plan/v2` merely to make this architecture appear shipped.

## Privacy and delivery rules

Neither record may contain raw user questions, transcripts, model reasoning, exact birth records,
names, free-text locations, provider details, hidden prompts, or retained visible answers. They are
in-memory, transient, and regenerable; they are not default memory or a cross-session profile.

The machine record may refer to stable ids and bounded enum values. A host maps a required question
id to wording only when clarification is actually needed. Default delivery stays continuous,
topic-specific prose: it has no mandatory headings, questionnaire, warning panel, `讲人话` label,
technical appendix, disclaimer footer, or follow-up menu. Audit detail remains explicit-request
only.

## Non-goals and evidence boundary

This architecture does not classify a free-form question, determine whether Chinese prose is
natural or useful, prove that a host asked a good question, establish traditional-method correctness,
prediction accuracy, or real-world validity. It supplies an Answer Faithfulness & Quality Lab
boundary, not a generic quality or accuracy score.

It also does not admit a career vertical, a source profile, a new BaZi rule, a cross-system
synthesis, a report, MCP, memory, or psychology integration.

## Consequences

- Future IQ-3 work has a closed vocabulary for questions, settings, degradations, and response-view
  content categories.
- A shorter requested answer may omit optional elaboration, but never a material caveat.
- An existing `answer-plan/v2` result is not proof that its choices were clarified.
- IQ-4 remains blocked on completing IQ-3's clarification and projection exit criterion; IQ-5 and
  later platform work remain out of scope.
