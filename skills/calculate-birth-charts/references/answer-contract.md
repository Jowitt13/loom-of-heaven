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
5. Run `lint-reading` on the final topic report before displaying it.

For a user who explicitly asks for a full technical chart or raw JSON, use `calculate` and
`interpret` instead. Treat those files as private artifacts, not as defaults for ordinary chat.
