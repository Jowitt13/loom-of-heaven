# Validation strategy

Goal: prove that for a given input and ruleset, results are stable, match the ruleset, and are
source-traceable — not that divination predicts anything (handoff §9).

## Gate (enforced now)

The enforced gate is `pnpm run verify:all`, which runs, in order:
`format:check → lint → typecheck → test → build → validate:skill → smoke → forward:test → check:doc-counts → scan:deps → scan:secrets → scan:incident`. CI runs exactly
this command and nothing else (`.github/workflows/verify.yml`), so it is the single enforcement entry
point and the rows below are 1:1 with what actually runs.

| Stage           | Command (in `verify:all`)   | What it proves                                                                    |
| --------------- | --------------------------- | --------------------------------------------------------------------------------- |
| Format          | `pnpm run format:check`     | Prettier `--check`; formatting consistent repo-wide, no writes.                   |
| Lint            | `pnpm run lint`             | ESLint import boundaries: offline compute core; no reverse dep on interpret.      |
| Typecheck       | `pnpm run typecheck`        | `tsc` strict over all packages, tools and tests (static gate beside lint).        |
| Unit/property   | `pnpm run test`             | Vitest across contracts, time-location, orchestrator (incl. integration).         |
| Build           | `pnpm run build`            | esbuild bundle + CycloneDX SBOM produced.                                         |
| Skill validate  | `pnpm run validate:skill`   | Structure, frontmatter, portability, offline (no-network), CSP/no-script.         |
| Clean-dir smoke | `pnpm run smoke`            | Offline run from an isolated copy + cross-env determinism.                        |
| Forward test    | `pnpm run forward:test`     | Clean-dir, zero-install, offline SKILL workflow for 5 realistic requests.         |
| Doc counts      | `pnpm run check:doc-counts` | Re-runs the suite; fails if a doc's `N tests / M files` drifts from the run.      |
| Dep vuln scan   | `pnpm run scan:deps`        | `pnpm audit --prod` over shipped deps; fails on an advisory (offline: skip+warn). |
| Secret scan     | `pnpm run scan:secrets`     | Dependency-free scan of tracked files; fails on a leaked credential.              |

`pnpm run format:check` (Prettier) runs first in `verify:all`, so CI fails on any unformatted
file; run `pnpm run format` to auto-fix before pushing.

## Deferred to Phase 6 (declared, not yet enforced)

These items appear in the QODER_HANDOFF §9.1 long-term minimum bar but have no runnable
enforcement yet; they are intentionally excluded from `verify:all` and CI until implemented
(also tracked in STATUS). No not-yet-ready scanner is wired into the gate.

- Broader ESLint ruleset (style / type-aware rules) — only the import-boundary gate
  (`eslint.config.js`, in `verify:all`) is enforced today; `typecheck` remains the other static gate.
- Dependency **license** scan — the dependency **vulnerability** scan (`scan:deps`, `pnpm audit --prod`)
  and the **secret** scan (`scan:secrets`) are now enforced in `verify:all`; a license-policy gate is
  still deferred.
- SPDX-format SBOM — a CycloneDX `sbom.cdx.json` is produced today by `build`.
- Dedicated / expanded HTML-injection suite beyond the template CSP, no-`<script>`, and
  no-network checks already run by `validate:skill`.

## Current results (2026-07-21)

These numbers come from one real `pnpm run verify:all` run — the single source of truth shared with
the identical table in [STATUS.md](./STATUS.md) ("Commands & results"). Do not hand-edit them to
resolve a disagreement; re-run the gate and copy the actual counts. `pnpm run check:doc-counts`
re-runs the suite and fails if either doc's `N tests / M files` count drifts from the real run.

- Typecheck: clean. Tests: **260 tests / 22 files — all passing**. The Western provider
  (astronomy-engine, VSOP87 + NOVAS) passes the ADR-0003 wrapper-consistency ≤1′ gate (vs
  astronomy-engine's own output; an independent JPL Horizons golden is TODO); the sidereal zodiac (Lahiri), true node
  and asteroids have a dedicated **approximate** regression (continuity / sign-plausibility, not the
  ≤1′ gate); angles/houses are validated against the MC=RAMC and eastern-horizon oracles, the Zi Wei
  dynamic chart (运限盘) is regression-anchored, the sourced BaZi interpretation rules (incl.
  刑冲合害/神煞/大运吉凶 `polarity`) are covered, and the cross-system interpretation-facts layer is
  checked for topic coverage, grounded evidence, `followupOffers`, de-identification and honest
  caveats. Skill validate: **34/34** (incl. the scripts/ no-stray-files guard). Reading-example
  static validate: **53/53** (topic example libraries + output-spec structure + the Channel B
  无术语区 term firewall; offline, no LLM — it proves the spec/sample structure, **not** that a host
  model follows the style 100% of the time). Docs-consistency `validate:docs` passes (four full hosts /
  render disabled / no wrong-ephemeris attribution / dev Node ≥ 24 vs run Node ≥ 22, with positive+negative
  self-tests). Host packages are verified by extracting the REAL candidate zips (single top-level dir, no
  double-nesting, doctor/verify/calculate byte-identical to canonical). The same firewall ships as `ming-chart.mjs lint-reading`
  (ADR 0011), which can lint a REAL produced report (`--channel topic [--simple]`) and exit non-zero on
  命理/黑话 terms in sections 1-5 — still a static text gate, not a guarantee of host-model wording. Round 9 (ADR 0012) added an 空话 (vagueness) check: abstract judgements in sections 1-5 must carry a concrete
  action/scene/observable/result nearby, and three REAL reports (male, 1990-06-15 14:20, 示例城市; 事业/感情/
  财运, saved unpolished to `docs/round9-acceptance/`) lint to 0 error (test #8 reads them). The detector is a
  nearby-concreteness heuristic, not a meaning judge. Clean-dir offline
  smoke: **10/10**. Clean-dir forward test: **41/41** — 8 realistic requests (incl. a horoscope, an
  interpret and a multi-person 合婚 synastry) across the CLI, and that `render` is disabled (exit 3,
  no report file). Format:
  clean. `pnpm run verify:all`: green end to end.

## Boundary fixtures (36; ≥30 required for Phase 1)

`packages/test-fixtures` — each fixture records why its expectation is trustworthy (documented
IANA transition dates, standard offsets, or plain wall↔UTC arithmetic), never an engine snapshot.

Covered: standard offsets incl. 30/45-min zones (Kolkata, Kathmandu, Eucla, Yangon); date line
(Kiritimati +14, Samoa 2011-12-30 skip); DST fall-back ambiguity + earlier/later resolution
(NY, London, Berlin, Sydney); spring-forward gaps; China historical DST (1988 summer UTC+9 vs
winter UTC+8); different longitudes → different mean solar time; near day/zi-hour boundaries;
unknown & approximate time; out-of-range years; unknown timezone; lunar-not-yet.

Property tests: wall↔UTC round-trip invariant; equation-of-time bounds; apparent = mean + EoT;
canonical-JSON order independence; deterministic hashing; calculate determinism.

## Golden-sample requirements (Phase 2+)

- Each fixture: source URL/citation, collection date, ruleset, expected result, tolerance, and
  why it is trustworthy.
- Western: at least one set cross-checked against JPL/Swiss; main-body positions within ≤1
  arc-minute; discrete classifications (sign/house changes) must match exactly.
- BaZi/Zi Wei: sourced references, NOT another wrapper of the same core library.
- Snapshots guard against regressions only; they never become ground truth.
- Minimum targets: time/location 30 (met: 36), Western 20, BaZi 40, Zi Wei 20.

## Must-test boundaries (tracked to Phase 2)

Solar-term crossings ±120 s; 23:00/00:00 and zi-hour day-change rules; leap month & lunar
conversion; multiple luck-cycle-start algorithms; high-latitude house-system failure; planet
sign/house/aspect/retrograde-station edges; Chinese-vs-English triggers and non-chart "star
chart" negative triggers; HTML injection/CSP; offline run; no-source-workspace install.
