# Architecture

## Repository layout

```text
packages/
  contracts/       # Zod schemas, canonical JSON, warnings/errors, provenance, versions
  time-location/   # TZDB wrapper, DST disambiguation, solar time, normalize (Phase 1)
  orchestrator/    # engine facade: doctor/normalize/calculate/compare/render/verify
  test-fixtures/   # sourced time & location boundary fixtures + loader
skills/
  xuan-ji-yu-heng/
    SKILL.md                    # orchestration only (name + description frontmatter)
    agents/openai.yaml          # UI metadata (name + description)
    scripts/loom-chart.mjs      # stable CLI (hand-authored, committed)
    scripts/dist/engine.mjs     # esbuild bundle (generated) — the only runtime code path
    scripts/fixtures/smoke.json # fictional post-install self-check sample
    references/*.md             # one-level input/output/ruleset/sources/privacy docs
    assets/report-template.html # self-contained report shell (CSP, no external refs)
    LICENSE, THIRD_PARTY_NOTICES.md, sbom.cdx.json
tools/
  build-skill.ts       # esbuild bundle + CycloneDX SBOM
  validate-skill.ts    # structure/frontmatter/portability/offline/CSP checks
  smoke-clean-dir.ts   # copy Skill to OS temp dir, run offline, prove reproducibility
docs/                  # this spec set + ADRs + STATUS
```

Production packages: `contracts`, `time-location`, `western`, `bazi`, `bazi-rules`,
`western-rules`, `ziwei`, `ziwei-rules`, `interpret`, `synastry`, `orchestrator`.
Test-only: `test-fixtures`.

## Interpretable state and evaluation direction

The current engine and user-facing commands remain deterministic and unchanged. A future internal
Interpretation State, deterministic rule-path verifier, and development-only Accuracy Lab are
architecture directions only: they do not add a state CLI, public contract, active rule, host-model
runtime dependency, or user-visible technical appendix. The governing boundary is
[ADR 0016](adr/0016-interpretable-state-and-accuracy-lab.md).

## Clarification and response-projection direction

IQ-3's [ADR 0019](adr/0019-clarification-and-response-projection-boundary.md) fixes an
architecture-only boundary for a future in-memory clarification plan and response view. It does not
alter `answer-plan/v2`, add a command or public schema, activate a narrator, or change default
delivery. A later implementation must keep material settings explicit, fail closed or degrade when
they are unanswered, and retain material caveats in the projected response. The IQ-3D integration
slice exposes one package-layer machine surface in `@loom/orchestrator` that chains the planner and
projection with fail-closed semantics and deterministic rebuild verification; it adds no command,
CLI verb, Skill, bundle, or default-output change.

## Dependency direction

```text
contracts  <-  time-location  <-  orchestrator  ->  engine-entry (esbuild)  ->  scripts/dist/engine.mjs
   ^                 ^                    ^                                            ^
   +----- test-fixtures (types) ---------+                              scripts/loom-chart.mjs (CLI)
```

- Contracts depend on nothing but Zod. No package depends on the orchestrator except the build
  entry. A future `interpret-birth-charts` may read results; no compute package may depend on it.
  These boundaries — no calculation package reverse-depends on `@loom/interpret`, and the offline
  compute core imports no network / AI-vendor-SDK / prompt module — are enforced by ESLint
  (`eslint.config.js`) via `pnpm run lint` in `verify:all` and CI.
- Third-party libraries are reached only through provider adapters. Public schemas
  never expose third-party types.

## Engine facade (one function per CLI verb)

`doctor` (capabilities + bundled TZDB version, process-free), `runNormalize`, `calculate`
(ChartBundle; unimplemented systems → warnings), `compareProfiles` (versioned rule presets),
`renderReport` (escaped, CSP, self-contained HTML/SVG), `verify` (determinism + schema self-check).

## Determinism & reproducibility

- **Canonical JSON**: recursive key sort, `undefined` dropped, fixed rounding of computed
  floats. Equal values → byte-identical output.
- **Deterministic requestId**: FNV-1a hash of canonical input + engine/schema versions.
- **Injectable clock**: `calculate(input, { now })` so `calculatedAt` is not volatile in tests.
- The clean-dir smoke asserts source CLI and isolated Skill produce identical canonical JSON.

## Build & packaging

`pnpm run build` esbuild-bundles `orchestrator/src/engine-entry.ts` (inlining zod + moment-timezone

- its packed TZDB) into `scripts/dist/engine.mjs`, and writes `sbom.cdx.json`. The published Skill
  depends on neither `packages/` nor `node_modules`, and performs no install or network at runtime.

Both SBOMs (`sbom.cdx.json` CycloneDX and `sbom.spdx.json` SPDX 2.3) are derived from the esbuild
metafile's `inputs` list via `tools/lib/bundle-closure.ts` — there is no hand-maintained package
list. If a new third-party package ends up in the bundle, both SBOMs pick it up; if a package
disappears, both SBOMs drop it. `pnpm run validate:sbom` re-runs esbuild independently in
`verify:cloud` and requires an exact match (name/version/purl/license) between the fresh closure
and both committed SBOMs, fail-closed on any drift.

## Time & location (the critical layer)

Local civil time is normalized exactly once: parse wall clock → resolve against historical IANA
rules → single UTC instant (or a typed ambiguous/non-existent error) → mean & apparent solar
time (longitude + NOAA equation of time). Solar time is a BaZi/Zi Wei-only option; the Western
path always uses the UTC instant + coordinates. See ADR 0002.
