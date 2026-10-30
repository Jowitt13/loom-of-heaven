# Public result and answer-plan contract

`answer-plan` is the default command for an ordinary question. It calculates all four supported
systems internally, but does not expose the private technical calculation record.

This is a **v2 hard cut**: it emits `public-result/v2` and `answer-plan/v2`; v1 contracts are
neither emitted nor accepted. The Vedic evidence remains bounded by returned facts and warnings,
including `VEDIC_TIME_REQUIRED` whenever a missing birth time suppresses values.

```text
node scripts/loom-chart.mjs answer-plan \
  --input-file birth-input.json \
  --topic career \
  --lens advice \
  --output-file answer-plan.json
```

`--topic` is required to be one of:

```text
character | career | wealth | marriage | studies | health | general
```

`general` means an explicit complete overview and may include facts from every topic. A host must
use it only when the user has clearly asked for an overview; it is never a fallback for an unclear
or missing topic.

`--lens` is optional and defaults to `overview`:

```text
overview | strengths | risks | timing | advice | explain
```

For ordinary `career` answers, `selectedFacts` contains at most the one ADR 0021 ten-god
cultural reference. Its caveat and material warnings are derived from that same set; unrelated
systems' conditions do not become mandatory prose. All warnings remain in `publicResult.warnings`
for audit. The plan contains no user-stated work reality and therefore does not request practical
career advice. Reality-based paragraphs use the separate optional source binding below, never
a borrowed chart fact id or constraint exemption.

`career --lens timing` currently returns `not-supported`: natal cultural themes are not evidence
for promotion, job-change or other career timing. `--lens explain` keeps topic-scoped technical
framing, but admission still follows the same evidence-family and rule-status gates as every
other lens — unadmitted technical material (pattern / useful-god / industry and other producer
mechanisms outside the admitted set) stays in `calculate` / `interpret` technical output and is
NOT released into career prose by choosing `explain`.

The command never accepts a free-form user question. The host maps the question to a bounded
topic/lens, or asks a clarification question when it cannot do so reliably. Do not put a user's
question text into a command-line argument, output artifact, filename or log.

## Output

The successful envelope is:

```json
{
  "ok": true,
  "publicResult": {},
  "answerPlan": {},
  "answerBinding": {}
}
```

`answerBinding` (`answer-binding/v1`) is a transient consistency fingerprint for THIS plan run:
`requestDigest` covers the current subject/input revision, topic/lens, the resolved target time
(`--at` / `--now` as parsed once by this command), the executed settings and engine version, plus
career-reality content when `--career-reality-file` was supplied; `planDigest` covers the full
plan content. Copy it verbatim next to the saved plan when you intend to use bound delivery
below. Digests are hashes, not authentication and not birth-data anonymization; nothing is
persisted by the engine.

`publicResult` contains only:

- public contract and engine/schema versions;
- per-system availability;
- birth-time reliability (not the time itself);
- warning `code`, `severity`, `system` plus fixed, generic `impact` / `nextStep` copy;
- only the requested topic's derived interpretation facts with stable plan-local ids;
- rule-set provenance, disclaimers and follow-up topics.

It deliberately omits `originalInput`, `requestId`, `calculatedAt`, normalized local/UTC/solar
timestamps, timezone, calendar, coordinates, free-text location, raw warning messages/details and
raw evidence notes. Derived facts are still sensitive personal-profile material: a caller must ask
for consent before sending them to any remote model or service.

`answerPlan` contains the same requested-topic facts the host may use. It includes:

- `selectedFacts` and their `allowedFactIds`;
- `requiredCaveats` and `requiredWarningCodes`;
- a fixed content order and safety guardrails;
- `answerability`: `grounded`, `limited` or `not-supported`.

Topic and lens select TOGETHER. The `timing` lens keeps only admitted
target-period records (today: the Zi Wei yearly-flow record behind an explicit
`--at`); natal placements — pillars, day master, spouse stars, houses, signs,
birth-cycle remainders — are background and are never selected as period
evidence for any topic. A limitation note (e.g. the health disclaimer) is never
answer basis: it cannot make a request `limited` on its own.

When `answerability` is `not-supported`, say that the engine has no eligible fact for the request
and offer a bounded follow-up. Never fill the gap with an inferred chart position, rule or verdict.
`noEvidenceReason` is evidence-based, not guessed:

- `TIME_REQUIRED` — the same request has admitted material that is really waiting on the birth
  time (the one case where asking for the time genuinely unblocks THIS question);
- `INPUT_REQUIRED` — an explicitly requested dynamic path names a missing rule input
  (e.g. the gender the Zi Wei dynamic chart needs);
- `NO_TOPIC_FACTS` — no admitted path exists for this topic+lens; supplying a time, place or
  gender would NOT unlock it, so do not ask for them.

`followupOffers` mirror real capability only. The default is an EMPTY list: no
job/industry fit, no key-year or event promises, no automatic menu. The single
non-empty case is `TIME_REQUIRED`, which offers exactly the time-completion
step. Full-result warnings keep every audit record; `requiredWarningCodes`
carries only the limits that qualify the selected material.

## Host writing rules

For an ordinary answer, the host must:

1. Use only `answerPlan.selectedFacts` and cite their ids internally.
2. Explain conclusions in plain language before technical terminology.
3. State every material caveat and required warning naturally in the paragraph it affects; do not create a fixed disclaimer footer.
4. Honor all guardrails: traditional-culture framing; evidence-only reasoning; no deterministic
   fate, medical, legal, investment, life-and-death or unsupported-comparison claims.
5. Run BOTH deterministic gates before displaying anything, in this order:
   `answer-plan` → write a `reading-draft/v2` JSON → `validate-answer` → display the SAME text
   that was checked. Show the answer only when both gates pass, and re-run the gates after ANY
   rewrite. Preferred: bound delivery (below) — `validate-answer` with `--context-input-file`
   returns the checked text as `deliverableBody`; display that body verbatim instead of rewriting
   it. If you change one word, one heading or the order, the previous pass no longer applies:
   re-run and display the newly returned body.

For a user who explicitly asks for a full technical chart or raw JSON, use `calculate` and
`interpret` instead. Treat those files as private artifacts, not as defaults for ordinary chat.

## validate-answer (structure-and-wording gate)

```text
node scripts/loom-chart.mjs validate-answer --input-file validate-input.json [--output-file validation-result.json]
```

The input file is one JSON object: `{ "answerPlan": { … }, "readingDraft": { … } }`. The
`answerPlan` fields come from the `answer-plan` output (`allowedFactIds`, `requiredCaveats`,
`requiredWarningCodes`, `guardrails`, `answerability`, `request.topic`, `disclaimers`).

### reading-draft/v2 input

```json
{
  "contractVersion": "reading-draft/v2",
  "topic": "career",
  "sections": [
    {
      "id": "summary",
      "heading": "30秒看懂",
      "paragraphs": [{ "text": "…", "sourceFactIds": ["fact-1"] }]
    },
    {
      "id": "conditions",
      "heading": "这项判断受出生时间影响",
      "paragraphs": [
        {
          "text": "…",
          "sourceFactIds": [],
          "constraintRefs": [
            { "kind": "caveat", "index": 0 },
            { "kind": "warning", "index": 0 }
          ]
        }
      ]
    }
  ],
  "caveatsExpressed": ["… exact requiredCaveats text …"],
  "warningsDisclosed": ["… exact requiredWarningCodes entry …"]
}
```

- Every paragraph must cite `sourceFactIds` from `allowedFactIds`, use the independent
  `realitySource` binding below for career reality, or carry
  `constraintRefs` that ALL resolve to real plan entries (`kind` selects
  `disclaimers` / `requiredCaveats` / `requiredWarningCodes`; `index` is the array index).
  A section id such as `disclaimer` grants NO exemption by itself. Exception: when
  `answerability` is `not-supported`, the draft must be a SHORT, fact-free explanation —
  paragraphs cite no facts, and all headings + paragraph texts share one
  `MAX_NOT_SUPPORTED_TEXT_CHARS` budget. Any `sourceFactIds` value that IS provided is
  always checked against `allowedFactIds`, in every mode.
- **Plain-text contract:** `heading` and `text` fields are PLAIN TEXT. The validator
  bans a fixed set of ASCII structural characters that can form Markdown/HTML across
  hosts: `& < > [ ] ` + "`* _ ~ \\ | #". Any single occurrence triggers`CONTAINS_MARKUP` (error). Full-width equivalents (，。【】（）＞＆～ etc.) are
  allowed. Hosts must escape these fields before rendering as Markdown or HTML; the
  validator scans the plain text as-is without any decode step, so there is no
  divergence between scanned text and host-rendered text.
- `caveatsExpressed` / `warningsDisclosed` must stay consistent with the `constraintRefs`:
  a required caveat/warning that is declared but never referenced (or vice versa) is a
  `CONSTRAINT_ATTESTATION_MISMATCH` error.
- `answerPlan.disclaimers` remains internal, auditable safety metadata. It does not require a
  default visible section. A host may reference a disclaimer with
  `{ "kind": "disclaimer", "index": i }` when the user explicitly asks for technical detail
  or the current subject makes that boundary material.
- Legacy `reading-draft/v1` is REJECTED at runtime (`UNSUPPORTED_CONTRACT_VERSION`) — a
  breaking change targeted at the next release (v0.2.0). Runtime acceptance of
  caller-selected v1 would re-enable the removed section-id fact exemption, so migration
  is a documented path, not a runtime downgrade: add `constraintRefs` to every
  constraint-expressing paragraph, satisfy the consistency rules above, then set
  `contractVersion` to `reading-draft/v2`.

### validation-result/v2 output

`{ contractVersion: "validation-result/v2", ok, violations: […], violationsTruncated }`.
Each violation carries `code`, `severity` (`error`/`warning`), static `detail`/`remediation`
wording, and ONLY structured locators: `sectionIndex` (number — the caller's section id is
never echoed), `field` (`heading`/`paragraph`), `paragraphIndex`, `patternKey` (a value from
a fixed closed set: a stable rule id such as `medical.medication-change`, a limit constant
name, or a constraint kind), `itemIndex` (index into the relevant array). Malformed or
wrong-version raw input never crashes the public API: it yields a single
`MALFORMED_INPUT` / `UNSUPPORTED_CONTRACT_VERSION` violation with static wording. If
`violationsTruncated` is true, reporting stopped at the cap: treat the draft as
conclusively failed, fix the reported violations, and re-run — never display it.

### Exit codes and limits

- Exit `0`: validation ran and `ok` is true.
- Exit `1`: validation ran and the result is NOT ok (violations are in the JSON), or an
  internal engine error occurred.
- Exit `2`: the input was rejected before validation (`INPUT_VALIDATION_FAILED`: file too
  large, unreadable/unparseable JSON, or bounded-preflight/schema rejection). Other engine
  errors map to the stable `ERROR_EXIT_CODES` table in the engine contracts.
- The CLI stat-checks the input file BEFORE reading it and rejects files larger than
  `MAX_VALIDATE_ANSWER_INPUT_BYTES` (2 MiB); the parsed object then passes a bounded
  preflight (object key counts/lengths, own-field checks, guardrail/topic length caps,
  whitelist projection to Zod) before full schema validation, and all diagnostics are
  STATIC — caller keys, paths, values, error messages are never echoed. The same bounded
  entry runs inside the public `validateAnswer(input)` API (which wraps all property
  access in a try/catch so Proxy traps and getter exceptions are also caught safely).
- Scanning strips `\p{Default_Ignorable_Code_Point}` and case-folds the plain text — no
  entity/NCR decode step is needed since the input is plain text by contract.
- Runtime surface: the engine bundle exports `validateAnswer`,
  `parseValidateAnswerInputBounded`, `deliverAnswer`, `deriveAnswerRequestDigest`,
  `deriveAnswerPlanDigest`, `transcribeReadingDraft`, `AnswerBinding`, `CareerRealityContext`,
  `ANSWER_BINDING_CONTRACT_VERSION`, `ANSWER_DELIVERY_CONTRACT_VERSION`,
  `READING_DRAFT_CONTRACT_VERSION`, `VALIDATION_RESULT_CONTRACT_VERSION`,
  `READING_DRAFT_LEGACY_V1` and the documented `MAX_*` limit constants.
- Honest scope: this is a deterministic structure-and-wording gate. It cannot prove a
  paragraph's meaning follows from its cited facts, cannot prove a referenced caveat is
  truly expressed by the surrounding prose, and its pattern scan cannot recognize every
  semantic paraphrase. It complements — never replaces — `lint-reading` and the host
  writing rules.

### Optional user-stated career source (backward-compatible v2 input extension)

Old v2 drafts and `validation-result/v2` output are unchanged. For a career answer based on
reality the user explicitly stated, add `careerReality` alongside `answerPlan` and `readingDraft`:

```json
{
  "confirmedFacts": [
    {
      "factId": "career-fact:changes",
      "source": "user-stated",
      "confirmedByUser": true,
      "category": "constraints",
      "statement": "合成示例：项目需求经常变动，希望工作节奏稳定。"
    }
  ],
  "transient": true,
  "noPersistence": true
}
```

The example is the value of `careerReality`, not a new command or a questionnaire. Copy only
relevant, de-identified reality the user actively supplied; do not infer it from a chart, invent
confirmation, copy a whole conversation, or include health/clinical content. Categories are
`current-role`, `skills`, `goals`, `constraints`, `preferences`, `opportunities`. Up to 24 unique
facts, each with a nonblank statement of at most 500 characters; no names, birth details,
assessment records or extra fields. The host is responsible for truthful declarations and for
excluding sensitive out-of-scope content; shape validation cannot establish those semantics.

An R-only paragraph references those facts as follows:

```json
{
  "text": "需求反复时，可以先和需求方确认变更入口与排期规则。",
  "sourceFactIds": [],
  "realitySource": {
    "layer": "career-reality",
    "factIds": ["career-fact:changes"]
  }
}
```

Keep chart reference and reality-based practice in separate adjacent paragraphs. A reality
paragraph cannot also cite chart facts or `constraintRefs`; the chart paragraph must still
express its own caveats and material warnings. Missing/unconfirmed/duplicate sources, unknown
ids, other layers and non-career uses fail. An unused context does not exempt any paragraph.
Known chart terms in an R paragraph or its heading also fail as a narrow source-smuggling
backstop; this wording check cannot recognize every semantic paraphrase.
Unsupported chart inference remains unsupported; independently bound reality discussion is not
a substitute chart verdict. All paragraphs retain safety, plain-text and shared resource checks.

This adds no model, store, scoring, automatic advice or clinical capability. Validation proves
source-record linkage, not whether an advice sentence follows semantically or will be useful.
Keep metadata internal: the visible answer must not add an audit sentence explaining its source.
Use a temporary local input file and remove it after validation; do not put real statements in
the repository, logs or fixtures. The validator does not store or transmit them. A host chat's
own retention and remote-model policies remain separate from the local engine.

## Bound delivery (this plan, this request, this text)

The classic `validate-answer` input above stays available for the plain structural shape
`{ answerPlan, readingDraft }`. It is a STRUCTURAL gate and never was a context authenticator — it
cannot tell which subject or request a plan or draft belongs to, and it makes no bound-delivery
claim. The default Skill answer flow uses bound delivery:

```text
# 1. seal the finished draft to the plan run it was written for
node scripts/loom-chart.mjs validate-answer \
  --seal-draft \
  --input-file draft.json \
  --binding-file answer-plan.json \
  --output-file draft-origin.json
# → { "draftSource": …, "draftDigest": "sha256:…" }

# 2. submit { draftSource, draftDigest, answerPlan: <the FULL saved plan>, readingDraft }
#    together with the CURRENT request
node scripts/loom-chart.mjs validate-answer \
  --input-file delivery-input.json \
  --context-input-file birth-input.json \
  --topic character \
  --output-file delivery-result.json
```

`--context-input-file` (plus the same `--topic` / `--lens` / `--at` / `--now` options as
`answer-plan`) re-states the CURRENT request; the delivery input may also carry `careerReality`,
which participates in the request digest — same id with a revised statement invalidates. The
engine then runs, in order:

1. **draft-origin check** — the draft's OWN recorded source is compared independently against
   (a) the CURRENT request, (b) the SUBMITTED plan's actual content, and (c) the submitted draft's
   own content (`draftDigest`). A draft written for another subject cannot be re-used by pairing it
   with a fresh plan and binding: its recorded source is its own. A bare draft with no origin is
   refused (`DRAFT_ORIGIN_MISSING`) — supplying a binding only at submission time never counts as
   verified provenance;
2. the existing `validate-answer` structure/safety gate over the same draft;
3. deterministic verbatim transcription of the checked draft (exact heading/paragraph text and
   order; nothing reworded, summarized or appended);
4. the existing `lint-reading` language gate.

Success returns `answer-delivery/v1` with `deliverableBody` (exactly the checked text) and
`deliverableBodySha256`. Display that body verbatim; do not rewrite, reorder or add to it. Any
rewrite — a word, a heading, the order — needs a NEW seal and a new check, which yields a new body.
Any failure returns `ok: false` with a `failureReason` (`DRAFT_ORIGIN_MISSING`,
`BINDING_MISMATCH`, `VALIDATION_FAILED`, `LINT_FAILED`, `MALFORMED_INPUT`) and NO body — a failed
run never carries or authorizes reuse of a previous successful body.

**No silent downgrade.** An input that declares a binding or draft origin but omits
`--context-input-file` is rejected with `INPUT_VALIDATION_FAILED`; it is never quietly reduced to
the low-level structural check. Only input with no declared binding takes the structural path, and
that path — like before — still needs `lint-reading` on the produced text before display.

Trust and privacy boundaries:

- The expected context comes from the CURRENT request the host re-submits, not from anything the
  draft or plan asserts. Two stale artifacts that agree with each other are still rejected when
  they disagree with the current request.
- The draft's origin is sealed over its CONTENT: editing the draft after sealing invalidates it, so
  a checked body cannot be swapped for different text.
- Honest limit: a stateless validator cannot detect a host that deliberately re-labels a stale
  draft with the current request's digests, nor one that replays an entire stale context. This
  defends against accidental mismatch, not against a malicious host; it is not authentication.
- The digests are consistency fingerprints only — not identity, not signing, not birth-data
  anonymization. Birth data never enters `publicResult`; binding digests are opaque hashes.
- Nothing is persisted: no session registry, database or signing service exists. Do not commit
  delivery inputs or results containing real personal data.
- The current time and target time are parsed once per command; omit `--now` at both steps (or
  pass the same explicit value) so the digest cannot drift with the wall clock.
