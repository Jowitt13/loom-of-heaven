# ADR 0003: Provider selection behind adapters (deferred to Phase 2)

- Status: Accepted (selection); Western integrated via astronomy-engine; celestine rejected
- Date: 2026-07-21
- Updated: 2026-07-28 (current-status annotation; historical evaluation preserved below)

## Context

Each system needs a computation source. The default route must be closed-source-friendly
(MIT/BSD/Apache) with no AGPL/GPL or unclear-provenance code unless the owner approves.

## Decision

Select the following, each to be placed behind a provider adapter so its types never leak into
public schemas. Versions/licenses were verified against the live npm registry during Phase 0.

| System               | Provider           | Version (verified) | License | Notes                                                                                                           |
| -------------------- | ------------------ | ------------------ | ------- | --------------------------------------------------------------------------------------------------------------- |
| Western              | `celestine`        | 0.2.1              | MIT     | New; must pass a JPL/Swiss precision regression (≤1 arc-minute for main bodies) before trust; kept replaceable. |
| Western verification | `astronomy-engine` | 2.1.19             | MIT     | Independent cross-check, not the domain layer.                                                                  |
| BaZi / calendar      | `tyme4ts`          | 1.5.2              | MIT     | Primary base; also unlocks lunar→gregorian conversion.                                                          |
| BaZi comparison      | `lunar-javascript` | —                  | MIT     | Mature cross-reference only (not independent verification).                                                     |
| Zi Wei               | `iztro`            | 2.5.8              | MIT     | Named default ruleset `iztro-default@<version>`; schools via config.                                            |

Explicitly **not** adopted for the default build without owner approval: Swiss Ephemeris
(AGPL/commercial), Kerykeion, Immanuel, PySwissEph.

## Consequences

- Phase 1 ships with no provider wired; requested systems return
  `SYSTEM_NOT_YET_IMPLEMENTED` and lunar input returns `LUNAR_CONVERSION_UNAVAILABLE`.
- "Another wrapper of the same core agrees" is not accepted as independent verification;
  BaZi/Zi Wei goldens need sourced references, and Western needs JPL/Swiss cross-checks.
- Re-verify each LICENSE and package metadata at integration time (see `docs/LICENSE_AUDIT.md`).

## Outcome — Western evaluation (2026-07-21) [HISTORICAL]

celestine 0.2.1 was run through the precision regression (geocentric ecliptic longitude vs
astronomy-engine (VSOP87 + NOVAS 上游；此为包装层一致性对照，非独立 JPL Horizons 金标对照), five dates 1955–2024). Sun–Neptune (8 bodies) agree to ≤1 arc-minute,
but Mercury deviates up to ~17′ and Pluto up to ~37′ — the gate is **not met**, so celestine is
not wired in and Western still returns `SYSTEM_NOT_YET_IMPLEMENTED`. The reproducible harness is
`packages/western/test/precision-regression.test.ts`; re-run it against any future celestine
release or replacement MIT provider before adoption.

## Current status (2026-07-28)

- **Western provider**: astronomy-engine 2.1.19 (MIT) is now the integrated domain provider
  (not merely the cross-check). `SYSTEM_NOT_YET_IMPLEMENTED` is no longer returned for
  Western calculations.
- **Precision verification**: Two independent golden fixtures validate absolute accuracy:
  1. JPL Horizons golden (10 main bodies × 3 synthetic technical epochs; worst 0.20′);
  2. Swiss Ephemeris house golden (5 systems × 5 synthetic cases; worst 0.69′).
     Both hold the ≤1′ gate.
- **celestine**: Remains rejected (ADR evaluation above unchanged).
- **BaZi / Zi Wei**: Integrated via tyme4ts + iztro respectively (as selected above).
