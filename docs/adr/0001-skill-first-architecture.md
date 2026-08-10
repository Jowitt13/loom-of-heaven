# ADR 0001: Skill-first architecture with a bundled deterministic engine

- Status: Accepted
- Date: 2026-07-21

## Context

The product must ship as a Skill installable into Tencent WorkBuddy and compatible with the
`SKILL.md + scripts` ecosystem. Chart math (astronomy, calendar, ganzhi, star placement) must
be deterministic, versioned and testable — never produced by an LLM.

## Decision

- Ship exactly one user-visible Skill, `xuan-ji-yu-heng`, supporting
  `western | bazi | ziwei | all` internally. Interpretation, if ever built, becomes a separate
  `interpret-birth-charts` Skill that only reads result JSON.
- `SKILL.md` is orchestration only (trigger, input confirmation, CLI calls, error handling,
  artifact hand-off). All computation is in a single stable CLI `scripts/loom-chart.mjs` that
  calls a bundled engine `scripts/dist/engine.mjs`.
- The engine is a pnpm monorepo of small packages (`contracts`, `time-location`, `orchestrator`,
  `test-fixtures`) bundled with esbuild into one self-contained ESM file.
- Third-party chart libraries are always hidden behind provider adapters; public schemas never
  leak third-party types.

## Consequences

- The published Skill is self-contained: no dependency on the repo's `packages/`, no
  `npm install` at first run, no network. Proven by a clean-directory offline smoke test.
- The LLM cannot alter or backfill calculations; unimplemented systems return explicit
  warnings rather than fabricated results.
- Web/API/MCP entry points, if added later, must reuse the same engine and produce identical
  canonical JSON for the same input + versions.
