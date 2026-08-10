# Privacy & security

Birth time, place and name are sensitive personal data. This Skill is built to touch as
little of it as possible (handoff §10).

## Data handling

- **Local & offline by default.** All calculation happens in the bundled CLI. No network
  request is made during calculation; the engine bundle contains no network APIs (the Skill
  validator asserts this).
- **No name or life events.** They are never required and never sent to the engine. They do
  not affect any calculation.
- **Geocoding is opt-in.** Turning a place name into coordinates would need a network call
  and therefore separate, explicit consent. The user can always type latitude/longitude and
  an IANA timezone by hand and skip geocoding entirely.
- **No telemetry.** Nothing is logged to analytics. Do not write full request bodies, names,
  precise times or precise coordinates to any log.

## Artifacts & sharing

- For an ordinary question, write only `answer-plan.json`. It omits direct birth input,
  deterministic request ids, normalized timestamps, timezone, calendar, coordinates, free-text
  locations, raw warning details and raw evidence notes.
- `chart.json` and `interpretation.json` are private technical artifacts. Generate them only when
  the user explicitly asks for a full technical chart or raw JSON. Temporary input files and
  unrequested private artifacts should be removed afterwards.
- `answer-plan.json` is de-identified, but its derived facts remain sensitive personal-profile
  material. Do not send it to a remote model or service without the user's informed consent.
- The `interpretation.json` is de-identified (no name, no life events, no free-text location),
  but carries private reproducibility metadata and raw evidence notes. It stays local by default.
  (The HTML/SVG report is temporarily disabled, so no rendered report file is produced.)
- When sharing any chart-related result, prefer the smallest de-identified answer-plan output; do
  not put raw PII into a publicly shareable URL.

## Errors

Report only stable error `code`s, versions and coarse context — never the raw personal input.
