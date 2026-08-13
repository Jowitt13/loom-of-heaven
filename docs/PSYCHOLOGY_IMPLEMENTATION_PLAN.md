# Psychology implementation plan and cross-agent handoff

This is the operational source of truth for implementing ADR 0014. It is written so a fresh Agent
on another computer can continue without conversation history. It defines order, allowed scope,
stop conditions, evidence requirements, tests, and reporting. It does **not** authorize code or a
public capability claim by itself.

## 1. Mandatory reading order

Before touching code, every Agent must read these files completely:

1. `AGENTS.md`
2. `docs/adr/0014-psychology-and-mental-health-architecture.md`
3. `docs/PSYCHOLOGY_SOURCE_MATRIX.md`
4. this file
5. `docs/NARRATIVE_OUTPUT_V1.md`
6. `docs/PRIVACY.md`
7. `docs/LICENSE_AUDIT.md`
8. `skills/xuan-ji-yu-heng/SKILL.md`
9. only the phase-specific contracts, scripts, and references named below

Do not use a conversation summary as a substitute for these files.

## 2. Start-of-work protocol

Run read-only checks first:

```text
git status --short --branch
git log --oneline -5
git remote -v
git ls-remote origin main
git diff --stat origin/main...HEAD
```

Then:

1. preserve every existing user change;
2. fetch only when authorized/necessary;
3. create one isolated `codex/psychology-*` branch from the verified current `origin/main`;
4. use `pnpm install --frozen-lockfile` before validation;
5. never start from a stale detached release or silently rebase user work;
6. record the baseline SHA in the phase report.

No phase authorizes push, PR creation, merge, tag, Release, asset publication, or manifest
promotion unless the owner explicitly authorizes that action.

## 3. Frozen product decisions

The following do not need to be rediscovered:

- Psychology-informed narration is default-on only after its release and remains disableable.
- It changes explanation, not evidence, and creates no psychological facts.
- Personality questionnaires are optional and independently scored.
- Mental-health screening is a separate Skill and package boundary.
- Clinical screening results never enter chart `PublicResult`, chart `AnswerPlan`, chart facts, or
  personality/chart cross-checking.
- Automated diagnosis is prohibited.
- Raw answers are private, local-first, separately stored, never logged, and never committed.
- No clinical screener ships before the safety kernel and qualified clinical review.
- V1 is adults-only.
- No universal personality percentile without a validated, versioned target-population norm set.
- User-facing output must not add fixed “心理学分析”“讲人话”“专业依据”“声明” footers or an
  automatic questionnaire menu.

Any proposed deviation requires an ADR amendment and owner decision before implementation.

## 4. Architecture target

### 4.1 Repository layout

```text
packages/
  psychology-contracts/
  personality-assessment/
  psychology-cross-check/
  mental-health-safety/
  mental-health-screening/
  psychology-orchestrator/

skills/
  xuan-ji-yu-heng/                 # existing; chart + narration + optional personality cross-check
  psychology-self-assessment/      # P9: independent nonclinical personality self-assessment only

tools/
  validate-psychology-sources.ts
  validate-psychology-boundaries.ts
  validate-psychology-safety.ts
```

Create only the directories needed by the current phase. Do not scaffold future code merely to
make the tree look complete.

### 4.2 Dependency graph

```text
@loom/psychology-contracts
        ↑             ↑
personality       mental-health-screening ← mental-health-safety
        ↑                         ↑
psychology-cross-check       psychology-orchestrator
        ↑
chart PublicResult (de-identified only)
```

Forbidden edges:

```text
mental-health-* -> bazi | ziwei | western | vedic | interpret | synastry
chart packages  -> mental-health-*
psychology-cross-check -> MentalHealthScreeningResult
```

A static test must enumerate and reject these imports.

## 5. Contract plan

### 5.1 Private session contract

`questionnaire-session/v1` contains raw item responses and is private by construction. It must:

- use stable item ids rather than full question text in output;
- reject unknown/duplicate item ids and out-of-domain responses;
- record exact instrument, language, item-set hash, scoring version, and consent notice version;
- never include name, email, birth data, free-text life events, or location;
- support `in-progress`, `completed`, and `cancelled` states;
- be accepted only through a size-limited, bounded parsing facade.

### 5.2 Personality profile contract

`personality-profile/v1` is de-identified aggregate self-report evidence. It contains:

- instrument/source metadata;
- completeness and quality flags;
- keyed domain/facet scores;
- optional norm reference only when a norm set passes its own gate;
- explicit `selfReportNotDiagnosis: true`;
- no raw answers, chart facts, clinical screen, or diagnosis fields.

### 5.3 Clinical screening contract

`mental-health-screening-result/v1` contains:

- exact instrument, language, recall period, item/scoring hash;
- completeness and deterministic score/category;
- `screeningNotDiagnosis: true` as a literal;
- structured safety state and static next-action ids;
- no chart, astrology, personality inference, medication, treatment plan, or diagnosis field.

### 5.4 Personality/chart cross-check

`psychology-cross-check/v1` accepts only:

- chart `PublicResult` or a smaller de-identified chart-fact projection;
- `PersonalityProfile`;
- explicit consent for the combined use.

It emits five separate collections:

```text
aligned
tension
personality-only
chart-only-hypothesis
insufficient
```

It never emits a consensus score. A tension keeps both sources visible; self-report and lived
experience receive reality priority.

### 5.5 Chart narration contract

The narration implementation phase must choose and record one honest version route:

- preferred: bump only the answer-plan contract if a new required policy field is added;
- keep `PublicResult` unchanged if it gains no psychology data;
- keep reading-draft structure unchanged unless the validator needs a new machine-checkable field;
- reject legacy versions at runtime if a hard cut is selected; do not silently dual-interpret.

The chosen exact versions are recorded in the implementation PR and migration docs. Do not bump
`ENGINE_VERSION` until release preparation.

## 6. User journeys

### 6.1 No questionnaire

```text
User asks ordinary chart question
  -> normal answer-plan
  -> chart fact and rule mechanism
  -> psychology-informed conditional wording
  -> concrete behavior/context and practical option
  -> validate-answer
  -> lint-reading
  -> visible answer
```

No score, attachment label, symptom statement, diagnosis, or “psychology says” claim is allowed.

### 6.2 Optional personality questionnaire

```text
User explicitly starts questionnaire
  -> show scope/privacy/host-boundary notice
  -> explicit personality consent
  -> exact IPIP-NEO-120 session
  -> pause/resume or cancel
  -> local deterministic score
  -> de-identified PersonalityProfile
  -> explain profile OR, with separate consent, cross-check with chart
```

The source IPIP page asks demographic/contact questions; the product must omit email and must not
collect sex/age unless a future approved norm requires them and the user separately consents.

### 6.3 Depression/anxiety screening

```text
User explicitly asks for screen
  -> adults-only and informed-consent check
  -> exact recall period
  -> local questionnaire
  -> safety-relevant answer preemption
  -> deterministic score only when safe/complete
  -> screening boundary + proportional next action
```

PHQ-9 item 9 is evaluated before ordinary report generation and independently of total score.

### 6.4 ADHD screening

Use only the authorized ASRS v1.1 six-question form in the first release. Preserve official item
wording, response options, attribution, and versioned scoring. Explain that childhood onset,
cross-setting impairment, other conditions, sleep, substances, and clinical history are outside
the screener and matter to professional assessment.

### 6.5 Trauma screening

The user must separately opt into trauma questions. Never require a free-text trauma narrative.
Allow stop, pause, skip, and delete. Mandarin PC-PTSD-5 remains blocked until its translation and
clinical-use route are approved. PCL-5 stays professional/research only.

### 6.6 Personality pathology / diagnosis request

The consumer output explains that self-report cannot establish a personality-disorder diagnosis.
Until APA permission and a professional workflow exist, do not administer or reproduce PID-5.
Offer a private export/handoff of already authorized screening information, not a diagnosis.

## 7. Privacy threat model

Every implementation review must consider:

| Threat                             | Required control                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| Raw answers in logs/errors         | Static diagnostics; never interpolate values, item text, paths, or caller keys                  |
| Raw answers passed as shell args   | JSON file input and argument arrays only                                                        |
| Answers sent to cloud Agent        | Up-front host-boundary disclosure and separate consent; local form preferred                    |
| Birth and clinical data joined     | Separate contracts, packages, directories, commands, and import firewall                        |
| Sensitive fixture committed        | Synthetic-only marker and incident/secret/PII scans                                             |
| Persistent file forgotten          | Ephemeral default; explicit save path; delete command; retention state visible                  |
| Remote resource drift              | Source manifest, SHA-256, retrieved date, no runtime network                                    |
| Stale emergency numbers            | Host resolves current localized resource; offline fallback stays generic and immediate          |
| Prompt injection through free text | No free-text questionnaire fields in V1; bounded enums/numbers only                             |
| Model invents diagnosis            | Deterministic result contract plus wording/negative tests; clinical result not generated by LLM |

Do not claim encryption until a concrete key-management design and cross-host implementation are
tested. “Local” and “encrypted” are separate promises.

## 8. Safety acceptance model

### 8.1 Required states

```text
routine
elevated
urgent-review
immediate-danger
```

State names are internal. User wording must be calm and direct. The engine may identify that an
answer requires urgent attention; it does not calculate a suicide probability.

### 8.2 Preemption

When a safety-relevant answer appears:

1. stop the ordinary results pipeline;
2. do not hide the response inside the total score;
3. return a bounded safety result with no echoed answer text;
4. ask only the clinically reviewed immediate-safety questions authorized for the release;
5. provide current localized resources when a trusted host capability exists;
6. otherwise advise immediate local emergency/professional and trusted-person support;
7. never return to chart analysis in the same response.

### 8.3 Human review gate

Before the first clinical release, a qualified psychologist or psychiatrist must review:

- Mandarin item wording/source;
- instructions and recall periods;
- scoring and cutoff language;
- false-positive/false-negative framing;
- safety preemption and crisis wording;
- next-action mapping;
- representative and adversarial output examples.

The reviewer's role and date are recorded without publishing private identity data. An AI review
does not satisfy this gate.

## 9. Scoring and psychometric rules

- Use deterministic code; the model never calculates or changes a score.
- Keep item content, reverse keys, scoring, ranges, and interpretation as separate versioned data.
- Never silently repair missing or invalid answers.
- Do not prorate unless the official source permits it for that instrument/version.
- Do not convert a raw score into a percentile without a selected `NormRef`.
- Treat quality flags as review information, not proof of dishonesty or invalidity.
- Preserve exact recall periods; changing “过去两周” to another period changes the instrument.
- Any translated or reformatted item set must retain semantic and response-option parity and pass
  human review.
- A cutoff is population- and purpose-sensitive. Store its source and intended use; do not call it
  a universal biological boundary.

## 10. PR sequence

Each item below is one independently reviewable PR. Do not combine clinical and chart changes in
one PR.

### P0 — documentation freeze (this work)

Allowed:

- ADR 0014;
- source matrix;
- this implementation/handoff plan;
- an `AGENTS.md` routing link;
- a documentation-presence/no-premature-claims gate;
- real test-count updates if the gate adds tests.

Forbidden: packages, contracts, Skill claims, item text, lockfile, SBOM, bundle, manifest, or
release assets.

### P1 — contracts and package skeletons

- Add `@loom/psychology-contracts` with strict Zod schemas and size limits.
- Add empty provider/orchestrator skeletons returning structured not-implemented results.
- Add import-firewall tests.
- No instrument text, score, public command, or capability claim.
- Decide contract versions without bumping the release engine version.

### P2 — psychology-informed narration

- Add a machine-readable narration policy that cannot create evidence.
- Update chart answer-plan/host instructions only as required by the version decision.
- Add positive examples and negative cases for diagnosis, attachment typing, unsupported motives,
  therapy language, template headings, and fixed footers.
- Extend `validate-answer`/`lint-reading` only with deterministic, bounded rules; document honest
  limitations of semantic enforcement.
- Default remains off until the release PR flips it after all host tests pass.

### P3 — IPIP-NEO-120 personality scorer

- Bind official English/Mandarin source, item/key hashes, translation and citation.
- Implement exact domain/facet scoring with no runtime dependency unless a dependency is
  independently justified and audited.
- Add session, pause/resume/cancel, score, export, and delete behavior.
- Return raw keyed scores/within-person profile only; no universal percentile.
- Add cross-implementation scoring comparison without copying community wording.
- No chart integration in this PR.

**Implemented internal route (2026-08-13):** the P3 primitive is source-bound to the official
Mandarin items and official scoring keys, requires explicit local consent, and implements the
session lifecycle plus raw domain/facet sums. A fixed MIT reference package is audited only for
120/120 domain/facet/key parity; its code and wording are neither bundled nor executed, so the
record must not be described as an independent scoring implementation. There is no public
questionnaire command, Skill, host integration, profile narration, norm, or chart integration.

### P4 — personality/chart cross-check

- Add the narrow de-identified `PsychologyCrossCheck` contract and consent.
- Enforce five result groups; no consensus score or forced agreement.
- Add conflict examples where user self-report overrides a chart hypothesis.
- Prove a clinical result cannot enter the API at compile time and runtime.

### P5 — clinical safety kernel

- Implement safety states, preemption, static messages, resource-provider interface, and bounded
  crisis artifacts with synthetic fixtures only.
- Complete the clinical human review and threat-model review.
- Run scenario drills on every supported host.
- Ship no public clinical instrument yet.

### P6 — PHQ-9 and GAD-7

- Bind exact authorized Mandarin forms and scoring sources.
- Add deterministic scorers and threshold fixtures.
- Wire PHQ-9 safety item preemption before ordinary scoring output.
- Keep result separate from charts/personality.
- Add privacy, deletion, malformed-input, and host rendering tests.

### P7 — ASRS v1.1 six-question adult screener

- Bind official Mandarin PDF and copyright notice.
- Preserve exact six items/options.
- Version classic and 2024 scoring algorithms; expose only the clinically/owner-approved display
  policy.
- Do not add the 18-question list or ASRS-5 without separate permission.

### P8 — trauma screening

- Remain blocked until Mandarin translation and professional-use review pass.
- Start with PC-PTSD-5 and a separate trauma consent gate.
- Keep PCL-5 professional/research only.
- Add stop/pause/delete and non-narrative trauma handling tests.

### P9 — installation, upgrade discovery, hosts, and releases

- Package `psychology-self-assessment` independently with its own bundle, SBOMs, manifest,
  checksum, and host validation.
- Add persistent `doctor/version` capability reporting without an automatic answer footer.
- Defer one-time `migrate` discovery until a prior P9 release exists; a first source-only bundle
  must not fabricate a legacy-install migration path.
- Verify new install and upgrade on every real supported host.
- Update user docs only for capabilities that actually ship.
- Release the nonclinical and clinical surfaces independently when possible.

#### P9 implementation status (candidate-prepared, unpublished)

P9 now packages the source-bound Mandarin IPIP-NEO-120 as a separate nonclinical Skill with a
file-only CLI, explicit `personality` consent, local private-session handling, a de-identified
profile export, local deletion, deterministic SBOMs, archive checksum, and extracted-archive
synthetic verification. Its independent candidate builder now creates four host-shaped ZIPs plus
an unpublished candidate manifest and SHA-256 file under gitignored `releases/`; the verifier
executes the actual extracted candidates with synthetic answers only. Those artifacts are
release preparation, **not** a host release or real-device evidence. P9 neither packages nor
claims any clinical screener, chart/personality cross-check, automatic mapping, real-device host
validation, migration, tag, GitHub Release, or public download.
Those are separate, later authorization decisions.

### P10 — professional assessment (future, separately authorized)

- Obtain instrument/application/translation permissions.
- Define clinician identity, attestation, correction, retention, and audit requirements.
- Perform jurisdiction-specific legal and professional review.
- The engine may record a clinician-confirmed result; it still cannot diagnose autonomously.

## 11. Test matrix

Every scoring PR must include, as applicable:

| Class            | Required cases                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------- |
| Source integrity | item count, ids, source SHA, scoring SHA, attribution, language                          |
| Valid scoring    | minimum, maximum, official examples, all published category boundaries                   |
| Boundary scoring | cutoff−1, cutoff, cutoff+1 or nearest valid response pattern                             |
| Invalid input    | too large, malformed JSON, unknown/duplicate/missing item, invalid type/range            |
| Determinism      | repeated runs, canonical JSON, Node 22 runtime and Node 24 development                   |
| Privacy          | no raw values/item text in errors/logs/public result; no birth-data join                 |
| Safety           | item-specific preemption, urgent path, unavailable-resource fallback, no return to chart |
| Wording          | no diagnosis, medication instruction, probability claim, shame, or chart causation       |
| Lifecycle        | pause, resume, cancel, explicit save, export, delete, retake                             |
| Hosts            | Codex, Qoder, WorkBuddy, Doubao package and real-device smoke evidence                   |
| Supply chain     | license scan, dependency audit, CycloneDX/SPDX exact closure, secret/PII scan            |

Synthetic fixtures must declare they are synthetic. Never use a real person's questionnaire or
clinical response in git, examples, screenshots, CI, or release artifacts.

## 12. Verification commands

Run the smallest relevant tests during development, then before handoff:

```text
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run validate:docs
pnpm run check:doc-counts
pnpm run verify:cloud
git diff --check
git status --short
```

`verify:all` remains a controlled local gate because `scan:incident` intentionally fails closed
without its private token file. Never weaken it or inject the private token into CI.

For a new published Skill, add independent clean-directory, ZIP runtime, installation-manifest,
host-package, SBOM, license, secret, and release-download verification equivalent to the existing
`xuan-ji-yu-heng` gates.

## 13. Stop conditions

Stop and report `BLOCKED` instead of improvising when any of these is true:

- source item text or scoring cannot be bound to an official/primary source;
- content, translation, electronic-use, or commercial rights are unclear;
- a Mandarin form is generated ad hoc or lacks the required clinical review;
- a clinical reviewer has not approved the safety path;
- a requested package introduces an unapproved license or hidden network/runtime dependency;
- a score differs from source examples or independent fixtures;
- the implementation would expose raw responses to chart output, logs, CI, or remote services;
- a user-facing claim would precede the corresponding release gate;
- current localized crisis resources cannot be verified and the design depends on a hardcoded
  number;
- a phase requires owner decisions beyond the frozen choices above.

Do not submit a partial clinical feature that can be accidentally discovered or invoked.

## 14. Required phase report

Every Agent reports exactly:

1. verified baseline SHA, branch, origin/main, and dirty-state findings;
2. phase and explicit non-goals;
3. exact changed-file list and why each file changed;
4. source URLs, versions, capture dates, SHA-256 values, licenses, and translation rights used;
5. contract/version decisions;
6. privacy and import-firewall evidence;
7. clinical reviewer status and unresolved human gates;
8. every test command with real counts/results;
9. generated artifact/SBOM/lockfile changes or byte-identical confirmation;
10. commit SHA and remote/PR/CI state, if authorized;
11. explicit statement that no unauthorized merge/tag/Release/promotion occurred;
12. remaining blockers and the exact action required to clear each one.

## 15. Portable kickoff prompt

Use the following prompt with any future Agent. Replace only `<PHASE>` and the repository path if
needed:

```text
Work on psychology roadmap phase <PHASE> in this repository.

Before acting, read AGENTS.md, docs/adr/0014-psychology-and-mental-health-architecture.md,
docs/PSYCHOLOGY_SOURCE_MATRIX.md, and docs/PSYCHOLOGY_IMPLEMENTATION_PLAN.md completely. Treat
them as authoritative. Verify the real git state and origin/main before creating an isolated
codex/psychology-* branch. Preserve all existing user changes.

Implement only the named phase and its stated tests. Do not implement future phases. Do not infer
questionnaire answers from charts; do not mix mental-health screening with chart/personality
cross-checking; do not claim diagnosis; do not copy instrument text until content and translation
rights are cleared. Clinical work must stop if the safety kernel or qualified human review gate is
missing. Runtime scoring must be deterministic, offline, bounded, source-bound, and free of raw
answer leakage.

Run the phase-specific tests and the full required verification chain. Report real commands,
counts, source hashes, licenses, privacy/firewall evidence, changed files, artifact drift, commit
SHA, and remaining blockers. Do not push, create a PR, merge, tag, publish a Release, or promote a
manifest without separate owner authorization.
```

## 16. Definition of roadmap completion

The roadmap is not complete because files compile or an Agent can produce plausible prose. It is
complete only when:

- each shipped instrument is source-, translation-, license-, scoring-, and version-bound;
- all deterministic, privacy, safety, host, supply-chain, and release gates pass;
- a qualified professional has reviewed every clinical surface;
- users can decline, pause, delete, and use non-questionnaire narration without coercion;
- clinical results remain structurally isolated from all chart reasoning;
- capability claims match the actually published artifacts;
- the owner explicitly authorizes each release and manifest promotion.
