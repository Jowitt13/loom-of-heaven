# ADR 0005: Fortune facts, public-domain small bodies & sidereal, paused HTML/SVG report

- Status: Accepted
- Date: 2026-07-22

## Context

A capability iteration asked for three things that touch product policy and licensing:

1. **吉凶 (auspicious/inauspicious) readings.** The MVP deliberately produced _no_ good-/bad-luck
   verdicts. Users want 吉凶 for 事业/感情/财运/学业 and 流年, but the engine must stay deterministic,
   sourced and honest — it cannot become an oracle that invents predictions.
2. **Western completeness: sidereal zodiac, true lunar node, asteroids.** These were previously
   "not implemented" with warnings. `astronomy-engine` (our bundled VSOP87/NOVAS base) does not provide
   them. The obvious full-precision route, **Swiss Ephemeris**, is AGPL/commercial dual-licensed
   and would contaminate this already-public MIT repository (and needs data files + native code).
3. **HTML/SVG report.** Across host models the rendered report could not be produced reliably.

## Decision

1. **吉凶 is productized as sourced structured facts + host-model narration.** `packages/bazi-rules`
   emits findings with a `polarity` (吉/凶/中性) and a `reason` chain, from new rule modules:
   `relations.ts` (刑冲合害), `shensha.ts` (吉神凶煞), `fortune.ts` (大运/流年 生克吉凶), plus reason
   chains on `strength`/`useful-god`. `@loom/interpret` aggregates them and adds `followupOffers`.
   The engine supplies **sourced 吉凶 facts and 大运/流年 timepoints only**; concrete probabilities
   and specific years are the host model's 命理 judgement layered on top, always carrying the
   "传统文化 / 非科学预测" disclaimers. Default: on.
2. **Sidereal, true node and asteroids are self-computed under MIT — Swiss Ephemeris is rejected.**
   - Sidereal = `norm360(tropical − ayanamsha)` with a deterministic **Lahiri** ayanamsha formula.
   - **True node** from the Moon's of-date ecliptic position via finite-difference velocity
     (`h = r × v`, node line `ẑ × h`).
   - **Asteroids** (Chiron/Ceres/Pallas/Juno/Vesta) from public-domain osculating orbital elements
     - a Kepler solver → geocentric ecliptic longitude, precessed to of-date.
   - The ten planets keep the ADR 0003 **≤1′ wrapper-consistency gate** (`precision: high`). The true node and
     asteroids are marked **`precision: approximate`** (角分级近似) and are **excluded** from
     the ≤1′ gate; a separate regression asserts continuity / sign-plausibility only. The
     asteroid/true-node pipeline was cross-validated by running Mars through the same Kepler code
     and matching astronomy-engine to ~0.005°.
3. **The `render` command is paused, not deleted.** It now prints a stable
   `{ "ok": false, "disabled": true }` notice and exits with code 3; it never crashes and never
   writes a file. `packages/orchestrator/src/render.ts` and `assets/report-template.html` stay
   **dormant** in the repo (and keep passing `validate:skill`) for a future re-introduction. The
   HTML/SVG report promise is removed from SKILL.md, the description, README, openai.yaml and the
   plugin manifests. `gen-example` now emits `chart.json` + `interpretation.json` instead of a report.

## Consequences

- The repository stays **MIT and offline**; no AGPL, no ephemeris data files, no native build.
- 吉凶 is available but bounded: sourced facts + disclaimers, no fabricated odds from the engine.
- Approximate small-body / true-node precision is disclosed everywhere (SKILL, references, README)
  and cannot be mistaken for the ten-planet ≤1′ accuracy.
- Losing the report is acceptable for now because `calculate`/`interpret` JSON is the source of
  truth; the renderer can be revived without an API change.
- Small-body accuracy is not independently verifiable to a JPL golden offline; we therefore never claim
  more than `approximate` and keep the classic ten-body gate untouched.
