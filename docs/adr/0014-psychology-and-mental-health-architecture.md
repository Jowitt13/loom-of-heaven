# ADR 0014: Psychology narration, personality assessment, and mental-health screening

- Status: Proposed — P9 nonclinical personality source bundle exists locally; no clinical screening capability is shipped
- Date: 2026-08-13
- Scope: define the product, safety, privacy, licensing, package, contract, and rollout boundaries
  that every future implementation agent must follow.
- Companion documents:
  [`docs/PSYCHOLOGY_SOURCE_MATRIX.md`](../PSYCHOLOGY_SOURCE_MATRIX.md) and
  [`docs/PSYCHOLOGY_IMPLEMENTATION_PLAN.md`](../PSYCHOLOGY_IMPLEMENTATION_PLAN.md).

## 1. Decision summary

Psychology is not one feature. The repository will treat it as three separately versioned
capabilities with different evidence and safety rules:

1. **Psychology-informed narration** improves how existing four-system facts are explained. It
   does not measure the user and must not create a psychological fact, score, diagnosis, or trait
   label.
2. **Optional personality self-assessment** adds independent self-report evidence. The first
   planned instrument is the public-domain Mandarin IPIP-NEO-120, subject to source binding,
   scoring goldens, translation review, and an honest norms policy.
3. **Mental-health screening** is a separate Skill and package boundary. It may calculate
   versioned screening scores and route the user toward appropriate next steps, but it never
   diagnoses, never reads a chart, and never appears inside an astrology answer.

The words “screening” and “diagnosis” are not interchangeable. Automated diagnosis is out of
scope. A future professional workflow may record a diagnosis that a qualified professional has
independently established, but the engine cannot be the diagnosing party.

## 2. Why the separation is mandatory

The four chart systems are traditional-cultural evidence. A personality questionnaire is
self-report evidence. A mental-health screener measures recent symptoms against a published
instrument. These sources answer different questions and have different validity, privacy, and
safety properties.

No source may silently validate another:

```text
Chart facts --------------------------> traditional-cultural interpretation
Generic psychology framework --------> wording and practical framing only
Personality questionnaire responses --> personality profile
Clinical screener responses ----------> screening result and safety routing
Observed life experience -------------> user-supplied reality check
```

The system must never infer a questionnaire answer from a chart, change a self-report score to
fit a chart, use a screening score to prove a chart, or use chart evidence to suggest that a user
has a mental disorder.

## 3. Product surfaces

### 3.1 Existing `xuan-ji-yu-heng` Skill

This Skill keeps all four-system calculation and interpretation. It may eventually add:

- a default-on, user-disableable `psychology-informed-narration` writing policy;
- an explicitly consented `personality-assisted` answer mode that accepts only a de-identified
  personality profile, never raw questionnaire answers or clinical screening results;
- a personality/chart cross-check that reports agreement, tension, personality-only evidence,
  chart-only hypotheses, and insufficient evidence without majority voting.

It must not expose PHQ-9, GAD-7, ASRS, PTSD, PID-5, crisis, or diagnosis commands.

### 3.2 `psychology-self-assessment` Skill (P9 implementation decision)

A separate self-contained Skill owns the source-bound Mandarin IPIP-NEO-120 self-assessment.
P9 implements it as an unpublished, file-only, offline bundle. It does **not** include a
mental-health screening instrument, diagnosis, chart/personality cross-check, or host release.
Its command surface is:

```text
psychology.mjs doctor
psychology.mjs instruments
psychology.mjs start     --instrument <id> --output-file <session.json>
psychology.mjs answer    --input-file <session.json> --answers-file <answers.json> --output-file <session.json>
psychology.mjs resume    --input-file <session.json> --output-file <session.json>
psychology.mjs cancel    --input-file <session.json> --output-file <cancelled.json>
psychology.mjs score     --input-file <responses.json> --output-file <result.json>
psychology.mjs export    --input-file <result.json> --output-file <export.json>
psychology.mjs delete    --input-file <artifact.json>
psychology.mjs verify
```

The P9 Skill additionally provides `doctor`, `version`, and local synthetic `verify` evidence.
The separation, file-only JSON boundary, bounded parsing, offline scoring, explicit consent,
and no-shell-string rule are frozen. A future `migrate` command is deferred until there is an
actual prior P9 release to migrate; it must not be simulated during this first source-only build.

### 3.3 Professional assessment mode

This is a future product, not a V1 feature. It requires separate legal review, instrument
permissions, clinician workflow design, audit logs, and a qualified professional's review. The
consumer Skill may generate a clinician handoff summary, but it may not create a diagnostic
record.

## 4. Package and import boundary

The planned packages are:

```text
packages/psychology-contracts
packages/personality-assessment
packages/mental-health-screening
packages/mental-health-safety
packages/psychology-orchestrator
```

Clinical packages must not import chart or chart-interpretation packages. Chart packages must not
import clinical contracts. A narrow, optional cross-check package may accept `PublicResult` plus
`PersonalityProfile`; its type surface must make `MentalHealthScreeningResult` impossible to pass.

This is enforced by dependency tests and static import scans, not comments alone.

## 5. Capability modes and evidence semantics

### 5.1 `psychology-informed-narration`

- Default: planned to be on after the relevant release; user can disable it.
- Input: existing `AnswerPlan.selectedFacts` only.
- Effect: translate a sourced chart mechanism into conditional descriptions of needs, attention,
  stress response, communication, boundaries, choices, and observable behavior.
- Evidence: chart evidence remains the only individualized evidence.
- Forbidden: Big Five scores, attachment types, clinical labels, symptom claims, diagnoses, and
  statements that the user's psychology has been measured.

The visible sentence should place the professional mechanism next to its concrete implication.
It must not introduce fixed sections such as “心理学分析”, “讲人话”, “专业依据”, or a generic
disclaimer footer.

#### P3 implementation decision (2026-08-13)

P3 adds internal-only, deterministic Mandarin IPIP-NEO-120 session and scoring primitives in
`@loom/personality-assessment`. Its official item/key sources, hashes, citation, translation
alignment note, and a fixed MIT reference-only key-parity audit live beside the item set. The
primitive requires explicit `personality` consent; it permits only local pause/resume/cancel/delete
handling and outputs raw keyed domain/facet sums with `norms-not-applied` and
`selfReportNotDiagnosis: true`.

P3 does not add a Skill command, CLI command, host surface, profile narration, chart input,
chart/personality cross-check, percentile, high/middle/low label, runtime dependency, or a claim
that the reference package is an independent scorer. Those changes require their later versioned
phases and gates.

### 5.2 `personality-assisted`

- Default: off; explicit opt-in.
- Input: a versioned, de-identified `PersonalityProfile`, not raw responses.
- Effect: add independent personality evidence and optional chart/personality cross-checking.
- Conflict policy: report conflict; do not average it away. Current self-report and lived
  experience take priority over a traditional-cultural hypothesis.
- Norm policy: V1 must not present a population percentile, clinical threshold, or universal
  “high/middle/low” label unless a target-population norm set has been separately validated,
  versioned, licensed, and selected. Raw keyed scale scores and within-person patterns may be
  shown with an explicit interpretation method.

### 5.3 `mental-health-screening`

- Default: off; separate informed consent for every instrument family.
- Input: exact instrument responses for the specified recall period.
- Output: score, published range/category where permitted, completeness, material limitations,
  safety state, and the next appropriate action.
- Forbidden output fields: `diagnosis`, `confirmedDisorder`, treatment prescription, medication
  instruction, or causal attribution to a chart/personality result.
- Missing data: fail closed unless the official scoring manual explicitly permits prorating.

## 6. Planned instruments

The source matrix is authoritative. The intended order is:

1. Mandarin IPIP-NEO-120 for nonclinical personality self-report.
2. PHQ-9 for depressive symptom screening and GAD-7 for anxiety symptom screening.
3. ASRS v1.1 six-question adult screener, preserving official items, responses, attribution, and
   a versioned scoring algorithm.
4. PC-PTSD-5 only after an appropriate Mandarin translation and clinical-use review are bound.
5. PCL-5 only in a qualified-professional/research-oriented surface.
6. PID-5/PID-5-BF only after explicit APA permission for the intended application and
   translation. It remains a maladaptive-trait measure, never a standalone diagnosis.

No instrument is adopted merely because an open-source repository implements it. Item copyright,
translation rights, scoring rights, validation evidence, population fit, and software license
are reviewed independently.

## 7. Consent and user entry

Questionnaires are never forced and are never inferred from user behavior. Supported user intents
will include:

- “开始心理问卷” / “继续上次的问卷” / “跳过问卷”;
- “做抑郁和焦虑筛查”;
- “检查一下注意力问题”;
- “评估创伤反应”;
- “查看、导出、删除或重做我的结果”.

Upgrade discovery must not pollute every answer. A release that adds the capability may:

- show a one-time, factual note in the existing `migrate` result;
- expose installed capability state through `doctor` or `version`;
- register natural-language triggers in the new Skill metadata.

No automatic questionnaire menu is appended to chart readings. Starting, pausing, resuming,
deleting, or retaking remains the user's decision.

## 8. Privacy and data lifecycle

Questionnaire answers and mental-health responses are highly sensitive data.

- Local and offline scoring is the default.
- Raw responses are stored separately from birth/chart artifacts and never written into
  `chart.json`, `interpretation.json`, `PublicResult`, or chart `AnswerPlan`.
- Raw responses are not logs, telemetry, fixtures, analytics, filenames, shell arguments, crash
  detail, or model prompts.
- The default session is ephemeral. Persistence requires explicit consent and a user-selected
  path; export and deletion are first-class operations.
- A cloud-hosted Agent cannot honestly promise local-only handling of responses entered in chat.
  It must disclose the host boundary before collecting answers. A future offline local form is
  the preferred private route.
- A remote model receives, at most, a de-identified aggregate profile or screening summary after
  separate informed consent. Clinical raw answers remain local by default.
- V1 is adults-only. Minor/guardian flows require separately validated instruments and policy.

## 9. Safety kernel before clinical screeners

No public clinical screener may ship before `mental-health-safety` exists and passes review.

The safety kernel must:

- distinguish routine, elevated, urgent-review, and immediate-danger states without claiming a
  diagnosis;
- interrupt ordinary scoring when an answer requires immediate safety review;
- handle PHQ-9 item 9 independently of the total score;
- never wait until a decorative footer to disclose an urgent next step;
- provide location-aware current resources through a host capability when available;
- fall back to contacting local emergency services, a nearby trusted person, or an appropriate
  professional when current localized resources cannot be verified;
- avoid storing a safety disclosure unless the user explicitly saves it;
- be reviewed by a qualified mental-health professional before release.

The C-SSRS is a candidate structured follow-up, not an adopted dependency. Its copyright and
electronic-use permissions must be resolved before any items or algorithm are embedded.

## 10. Clinical output contract

Clinical screening does not use `NARRATIVE_OUTPUT_V1.md` or the chart `AnswerPlan`. Its output
must be direct, calm, and unambiguous:

1. the exact instrument and recall period;
2. the computed score/category using a versioned algorithm;
3. what the result supports and does not support;
4. the next action proportional to the result;
5. an immediate safety action inline when applicable.

A visible screening boundary is necessary medical information, not a generic footer. Example
shape:

> 你在过去两周报告的症状进入该量表的中等范围。这不等同于抑郁症诊断，但说明这些症状已经值得进一步评估，尤其要结合持续时间、现实功能影响、身体状况和专业访谈判断。

## 11. Planned contracts

Names are provisional; semantics are frozen.

```ts
type PsychologyNarrationMode = 'off' | 'informed-narration' | 'personality-assisted';

type InstrumentRef = {
  id: string;
  version: string;
  language: string;
  itemSetSha256: string;
  scoringVersion: string;
  sourceUrl: string;
  licenseRef: string;
};

type ConsentReceipt = {
  scope: 'personality' | 'mental-health-screening' | 'remote-summary';
  granted: true;
  noticeVersion: string;
};

type QuestionnaireSession = {
  contractVersion: string;
  instrument: InstrumentRef;
  status: 'in-progress' | 'completed' | 'cancelled';
  answers: Array<{ itemId: string; response: number }>;
};

type PersonalityProfile = {
  contractVersion: string;
  instrument: InstrumentRef;
  completeness: number;
  domains: Array<{ id: string; score: number }>;
  facets: Array<{ id: string; score: number }>;
  qualityFlags: string[];
  normRef?: string;
};

type MentalHealthScreeningResult = {
  contractVersion: string;
  instrument: InstrumentRef;
  recallPeriod: string;
  complete: boolean;
  score?: number;
  category?: string;
  screeningNotDiagnosis: true;
  safetyState: 'routine' | 'elevated' | 'urgent-review' | 'immediate-danger';
  nextActions: string[];
};

type PsychologyCrossCheck = {
  contractVersion: string;
  alignments: unknown[];
  tensions: unknown[];
  personalityOnly: unknown[];
  chartOnly: unknown[];
  insufficient: unknown[];
};
```

`QuestionnaireSession` is private. `PersonalityProfile` may cross the chart boundary only after
consent and de-identification. `MentalHealthScreeningResult` is structurally prohibited from that
cross-check.

## 12. Source binding and reproducibility

Every adopted instrument must have a repository record containing:

- exact name, version, language, recall period, and scoring algorithm;
- primary source and validation paper;
- item/scoring source capture date and SHA-256;
- code license, content license, translation rights, and required attribution separately;
- population, sample, known bias, cutoff limitations, and permitted claims;
- immutable synthetic scoring fixtures at every boundary;
- a documented update process that never silently changes items or scoring.

The repository must never copy a copyrighted item set before its intended distribution route is
cleared.

## 13. Deterministic validation gates

Before any instrument is exposed, tests must cover:

- exact item count, stable item ids, response domains, reverse-scoring keys, and source hash;
- zero/minimum, maximum, threshold-minus-one, threshold, threshold-plus-one, invalid, missing,
  duplicate, and out-of-range responses;
- scoring determinism across Node 22/24 and all supported hosts;
- no raw-answer leakage to errors, logs, public summaries, chart artifacts, or generated bundles;
- static package-import firewalls;
- no diagnosis wording and no chart-to-clinical causation wording;
- PHQ-9 item 9 safety preemption regardless of total;
- pause/resume/delete/export behavior;
- source/license/SBOM closure and offline runtime;
- clinician-reviewed Chinese wording and safety scenarios for clinical releases.

Quality flags such as straight-lining or implausibly fast completion may request review but cannot
alone diagnose, invalidate, or shame the respondent.

## 14. Release and claim boundary

Planning documents may discuss the roadmap. User-facing Skill descriptions, README capability
lists, manifests, host packages, and release notes must not claim an instrument until its release
phase is complete.

Each clinical instrument needs all of the following before shipping:

1. source and content-license approval;
2. verified Mandarin wording or an explicitly English-only scope;
3. deterministic scorer and independent scoring fixtures;
4. qualified clinical review of wording, cutoffs, failure behavior, and safety flow;
5. privacy threat model and deletion tests;
6. host acceptance on all supported surfaces;
7. owner authorization for the release and public capability claim.

## 15. Not supported by the first release

- automatic diagnosis of any mental disorder or personality disorder;
- medication, treatment, or emergency-care decisions made by the engine;
- screening minors;
- inferring symptoms from charts, writing style, or passive behavior;
- silently combining personality, clinical, and chart scores;
- universal population percentiles from weak or mismatched norms;
- remote raw-answer storage, telemetry, or background monitoring;
- exposure therapy, trauma narration, or therapist replacement;
- a generic AI chatbot presented as a clinician.

## 16. Consequences

- Psychology-informed narration can improve the existing answer experience without pretending to
  measure the user.
- An optional personality profile can supply independent evidence and be compared honestly with
  chart hypotheses.
- Clinical screening remains discoverable but isolated, consented, versioned, and safety-first.
- Some desired capabilities will remain blocked until translation rights, clinical review, or
  professional-mode permissions exist. An Agent must report that block rather than improvise.
- Nothing in this ADR authorizes implementation, publication, diagnosis claims, a tag, a Release,
  or a manifest promotion.
