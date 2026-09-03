# Clarification and response projection

- Architecture record: `clarification-response-projection/v1`
- Roadmap anchor: `loom-product-roadmap/v3`, IQ-3
- Status: architecture boundary only — no active machine surface

This document fixes the information shape that a later IQ-3 implementation must use. It is not a
new command, prompt format, or default response template.

## Bounded request and clarification plan

The engine must never receive a raw question. A host first maps intent to the bounded request below;
when that mapping is not possible, it must request `topic-intent` rather than guess.

```ts
type ClarificationQuestionId =
  | 'topic-intent'
  | 'response-depth'
  | 'birth-time-reliability'
  | 'target-period'
  | 'ruleset-variant'
  | 'system-scope';

type ClarificationStatus = 'ready' | 'requires-clarification' | 'degraded';
type ConfirmationState = 'confirmed' | 'unavailable' | 'not-required';

type ClarificationPlan = {
  contractVersion: 'clarification-plan/v1';
  status: ClarificationStatus;
  requiredQuestionIds: ClarificationQuestionId[];
  confirmedSettings: Array<{
    settingId: ClarificationQuestionId;
    state: ConfirmationState;
    valueId?: string;
  }>;
  clarificationNoteCodes: string[];
  degradationCodes: string[];
  transient: true;
  regenerable: true;
};
```

`valueId` is a bounded implementation-defined enum, never an arbitrary user string. A conforming
implementation rejects extra keys and cannot serialize raw question text, a transcript, a name,
birth date or clock time, coordinates, a free-text location, model reasoning, provider metadata, a
prompt, a score, or a confidence value.

`ready` has no unanswered material setting. `requires-clarification` has at least one ordered
question id and creates no response view. `degraded` has no unanswered material setting, but keeps
the exact degradation code and material caveat for every claim class it omits. An unavailable value
is never silently substituted with a default.

## Materiality registry

| Trigger                                                             | Required question or allowed degradation | Failure-safe result                                               |
| ------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------- |
| No bounded topic                                                    | `topic-intent`                           | no delivery                                                       |
| No explicit bounded depth                                           | `response-depth`                         | no delivery                                                       |
| Eligible claim depends on birth time, but reliability is unresolved | `birth-time-reliability`                 | no delivery; if confirmed unavailable, omit time-sensitive claims |
| Timing lens without a bounded target period                         | `target-period`                          | no timing delivery                                                |
| Rule variant can change the selected claim                          | `ruleset-variant`                        | no affected claim                                                 |
| System-specific path is not selected                                | `system-scope`                           | no claim delivery                                                 |

The registry concerns answer-affecting choices, not cosmetic language. It does not make a host
repeat a question whose bounded answer is already confirmed. A documented engine convention may be
reported as a clarification note, but cannot masquerade as a user confirmation when it changes an
eligible claim.

## Response view

```ts
type ResponseDepth = 'brief' | 'standard' | 'detailed';

type ResponseView = {
  contractVersion: 'response-view/v1';
  clarificationStatus: 'ready' | 'degraded';
  topic: string;
  requestedDepth: ResponseDepth;
  system: string;
  approvedClaimIds: string[];
  materialCaveatIds: string[];
  allowedContentCategories: Array<
    'conclusion' | 'mechanism-and-implication' | 'material-caveat' | 'practical-options'
  >;
  auditAvailability: 'explicit-request-only';
  transient: true;
  regenerable: true;
};
```

The later implementation resolves `topic`, `system`, claim ids, caveat ids, and content categories
against closed contracts; the illustrative `string` positions above do not authorize free text.
The view is admitted only after all its approved claim ids resolve to one system and every material
caveat is included. Requested depth can change optional elaboration, never claim eligibility or
material-caveat retention.

`allowedContentCategories` is not a list of visible headings. It preserves flexible natural prose:
the professional mechanism is adjacent to the concrete implication, caveats appear inline only when
they matter, and technical evidence remains outside default delivery. There is no automatic
`敏感项校对`, `引擎警告`, `专业依据`, `声明`, disclaimer, citation block, or follow-up menu.

## Boundaries for later slices

IQ-3B may implement deterministic contracts, the materiality registry, synthetic tests, and an
internal planner. IQ-3C may propose one integration surface after separate admission. Neither slice
may alter the legacy `answer-plan/v2` semantics, activate cross-system synthesis, pass raw user
questions to the engine, persist a delivery artifact, or use model self-approval.

This record cannot prove that a host's language is semantically faithful, natural, useful,
traditionally correct, predictive, accurate, or of real-world validity. It is not human review and
never establishes prediction accuracy or produces an aggregate accuracy or quality score.
