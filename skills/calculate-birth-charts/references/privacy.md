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

- `chart.json` and `interpretation.json` are written only where the user asks. Temporary input
  files created during a run should be removed afterwards; keep only requested artifacts.
- The `interpretation.json` is de-identified (no name, no life events, no free-text location);
  it is built only from the computed chart facts and stays fully offline. (The HTML/SVG report
  is temporarily disabled, so no rendered report file is produced.)
- When sharing a chart, prefer a de-identified copy; do not put raw PII into a publicly
  shareable URL.

## Errors

Report only stable error `code`s, versions and coarse context — never the raw personal input.
