# Privacy & Security (repository view)

Birth time, place and name are sensitive personal data. The runtime-facing statement is in
`skills/calculate-birth-charts/references/privacy.md`; this file records the engineering posture.

## Posture

- **Local-first, offline by default.** Calculation is in the bundled engine; no network call is
  made. The engine bundle is statically checked to contain no network APIs
  (`fetch`, `http/https/net/tls/dns`, `WebSocket`, `XMLHttpRequest`, `sendBeacon`) by
  `tools/validate-skill.ts`.
- **Minimal PII.** Name and life events are never accepted by the engine and never affect a
  calculation. Only what a calculation needs (date, time, zone, coordinates, calendar,
  optional rule gender) is collected.
- **Opt-in geocoding only.** Turning a place name into coordinates would need a network call
  and separate explicit consent; a user can always enter coordinates + IANA zone by hand.
- **No telemetry.** No analytics, no logging of request bodies, names, precise times or precise
  coordinates. Errors carry only stable codes, versions and coarse context.

## Artifacts & sharing

- `chart.json` / `chart-report.html` are written only where requested; temporary inputs are
  removed after a run, keeping only requested artifacts.
- The HTML report is fully self-contained (no CDN, no remote fonts, no scripts), sets a strict
  Content-Security-Policy, and HTML-escapes all user-supplied text (verified by a test that
  injects `<script>`). All paths resolve relative to the Skill or the current workspace — no
  hard-coded developer paths (validator-enforced).
- Prefer de-identified copies when sharing; never place raw PII in a publicly shareable URL.

## Incident-scan boundary

- `pnpm run verify:cloud` is the GitHub Actions-safe gate. It contains no incident token and never
  uploads or reconstructs one.
- `pnpm run verify:all` adds `scan:incident` only in a controlled local environment. The ignored
  token file is deliberately absent from CI; if it is unavailable, the scan exits non-zero rather
  than claiming a clean result. Before any release or visibility change, run the full gate and
  `pnpm run scan:incident:history` in that controlled environment.

## Deferred (Phase 6)

Dependency **license** scan and an SPDX-format SBOM. (The dependency **vulnerability** scan
`scan:deps` and the **secret** scan `scan:secrets` are already wired into `verify:cloud` and
`verify:all`.) And, if a
public API is ever added — input limits, rate limiting, CORS/CSP for that surface.
