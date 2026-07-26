# Public result and answer-plan contract

`answer-plan` is the default command for an ordinary question. It calculates all three supported
systems internally, but does not expose the private technical calculation record.

```text
node scripts/ming-chart.mjs answer-plan \
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

The command never accepts a free-form user question. The host maps the question to a bounded
topic/lens, or asks a clarification question when it cannot do so reliably. Do not put a user's
question text into a command-line argument, output artifact, filename or log.

## Output

The successful envelope is:

```json
{
  "ok": true,
  "publicResult": {},
  "answerPlan": {}
}
```

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

When `answerability` is `not-supported`, say that the engine has no eligible fact for the request
and offer a bounded follow-up. Never fill the gap with an inferred chart position, rule or verdict.

## Host writing rules

For an ordinary answer, the host must:

1. Use only `answerPlan.selectedFacts` and cite their ids internally.
2. Explain conclusions in plain language before technical terminology.
3. State every required caveat and use the corresponding fixed public warning `impact` / `nextStep`.
4. Honor all guardrails: traditional-culture framing; evidence-only reasoning; no deterministic
   fate, medical, legal, investment, life-and-death or unsupported-comparison claims.
5. Run BOTH deterministic gates before displaying anything, in this order:
   `answer-plan` → write a `reading-draft/v2` JSON → `validate-answer` → render the SAME visible
   text as Markdown → `lint-reading`. Show the answer only when both gates pass, and re-run both
   gates after ANY rewrite.

For a user who explicitly asks for a full technical chart or raw JSON, use `calculate` and
`interpret` instead. Treat those files as private artifacts, not as defaults for ordinary chat.

## validate-answer (structure-and-wording gate)

```text
node scripts/ming-chart.mjs validate-answer --input-file validate-input.json [--output-file validation-result.json]
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
      "id": "disclaimer",
      "heading": "信息可靠性与声明",
      "paragraphs": [
        {
          "text": "…",
          "sourceFactIds": [],
          "constraintRefs": [
            { "kind": "disclaimer", "index": 0 },
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

- Every paragraph must either cite `sourceFactIds` from `allowedFactIds`, or carry
  `constraintRefs` that ALL resolve to real plan entries (`kind` selects
  `disclaimers` / `requiredCaveats` / `requiredWarningCodes`; `index` is the array index).
  A section id such as `disclaimer` grants NO exemption by itself in v2.
- `caveatsExpressed` / `warningsDisclosed` must stay consistent with the `constraintRefs`:
  a required caveat/warning that is declared but never referenced (or vice versa) is a
  `CONSTRAINT_ATTESTATION_MISMATCH` error.
- Legacy `reading-draft/v1` is conditionally accepted under the v2 safety limits; oversized
  legacy v1 input is intentionally rejected. v1 keeps its old section-id fact exemption
  (`disclaimer`/`uncertainty` only) and set-based caveat checks. To migrate to v2, add
  `constraintRefs` to constraint-expressing paragraphs and switch the version string.

### validation-result/v2 output

`{ contractVersion: "validation-result/v2", ok, violations: […], violationsTruncated }`.
Each violation carries `code`, `severity` (`error`/`warning`), static `detail`/`remediation`
wording, and ONLY structured locators: `sectionIndex` (number — the caller's section id is
never echoed), `field` (`heading`/`paragraph`), `paragraphIndex`, `patternKey` (stable rule id
such as `medical.medication-change`, or a limit constant name), `itemIndex` (index into the
relevant array). If `violationsTruncated` is true, reporting stopped at the cap: treat the
draft as conclusively failed, fix the reported violations, and re-run — never display it.

### Exit codes and limits

- Exit `0`: validation ran and `ok` is true. Exit `1`: the result is not ok (violations are in
  the JSON), or the input was rejected (`INPUT_VALIDATION_FAILED`), or an engine error occurred.
- The CLI stat-checks the input file BEFORE reading it and rejects files larger than
  `MAX_VALIDATE_ANSWER_INPUT_BYTES` (2 MiB); the parsed object then passes a bounded preflight
  before full schema validation. Drafts are capped (sections, paragraphs, text lengths, fact-id
  counts, whole-draft budgets — see the exported `MAX_*` constants in the engine contracts).
- Honest scope: this is a deterministic structure-and-wording gate. It cannot prove a
  paragraph's meaning follows from its cited facts, cannot prove a referenced caveat is truly
  expressed by the surrounding prose, and its pattern scan cannot recognize every semantic
  paraphrase. It complements — never replaces — `lint-reading` and the host writing rules.
