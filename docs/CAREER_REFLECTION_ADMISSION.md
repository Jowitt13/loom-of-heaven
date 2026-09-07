# Career reflection admission policy (F layer, C-track)

- Policy id: `career-reflection-admission/v1`
- Roadmap anchor: `loom-product-roadmap/v3`, §5 C-track ([ADR 0020](adr/0020-dual-provenance-career-layer.md))
- Status: owner-selected tool category frozen; no items defined; nothing implemented

## What the owner selected

After the C-4A admission research (conclusion
`READY_FOR_OWNER_TOOL_SELECTION`, no external instrument adopted), the owner selected exactly
one admissible tool **category** for the future CareerReflectionLayer (F layer):

> **owner-authored, non-psychometric, scoreless career reflection / decision cards**

This is a category selection, not an implemented questionnaire. No card content, question
wording, action experiments, scoring, or user-facing flow exists yet, and none may be built
without the separate authorizations below.

## Frozen classification

Any admitted artifact in this category must carry, and can never drift from:

- `toolId: career-reflection-cards`, `toolVersion: v1`;
- classification: `owner-authored`, `non-psychometric`, `non-clinical`, `scoreless`;
- `contentState: no-items-defined`;
- zero external dependencies: no O*NET, Career Anchors, RIASEC, GROW, Holland, or any other
  external instrument, item, copyrighted text, translation, or norms reference;
- allowed uses limited to `reflection-question`, `decision-framework`, `action-experiment`;
- forbidden outputs: scores, norms, percentiles, matching, occupation recommendations,
  personality labels, diagnoses, clinical screening, predictions, and any BaZi- or
  astrology-derived recommendation;
- `unblocksIq4: false` and `runtimeReady: false` until separate slices change them.

"owner-authored" does not mean psychological items may be written freely: the category is
non-psychometric by definition, so content governance (C-4C) must keep every card a
reflection prompt or decision aid, never a measure of traits, and never a scoring
instrument.

## Consent lifecycle (contract only; nothing is implemented)

Scope is fixed to `career-reflection` with a versioned notice
(`career-reflection-notice/v1` or later). Default state is `not-started` with no data. The
concept state machine is `not-started → consented → active → deleted`, with explicit user
triggers (explicit consent; first use; user delete) and no other transitions. Skipping,
withdrawal, and deletion must always be available; collection is minimal; the lifecycle is
local-only. Forbidden fields include user identity, raw answers, scores, clinical data, host
chat, file paths, and session identifiers. Clinical artifacts can never become a consent
source, an input, an export, or a composition source.

## What this policy does not do

- It does not unblock IQ-4: the `BLOCKED_SOURCE_ADMISSION` state for
  reviewed-answer-examples is unchanged, and no F-layer artifact can lift it.
- It does not authorize C-4C (card content governance spec) or C-4D (local lifecycle
  implementation); each needs separate owner authorization.
- It did not adopt the C-4A external candidates (O*NET Interest Profiler and other
  standardized instruments were evaluated and not adopted, not copied, and not introduced).
- Career advice, once the R layer exists, originates only from user-stated reality facts
  (C-1/C-2 chain); the F layer produces reflection framing only.
