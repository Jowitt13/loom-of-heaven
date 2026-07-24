# Product Spec — Ming Engine (`calculate-birth-charts`)

> Deterministic three-system birth-chart engine delivered as a self-contained WorkBuddy Skill.

## Goal

From a birth date, local time, IANA timezone, coordinates, calendar and versioned rule
profiles, deterministically compute Western natal charts, Four Pillars/BaZi and Zi Wei Dou Shu,
and emit canonical JSON as the current deliverable. (An offline HTML/SVG report is temporarily
paused — `render` returns a disabled notice + exit 3.) The LLM orchestrates and explains; it
never computes.

## Inputs

Calendar (gregorian/lunar), local date & time with accuracy (exact/approximate/unknown), IANA
timezone, WGS84 coordinates (+ optional elevation), lunar leap-month flag, rule gender (only
where a rule needs it), DST fold choice, and per-system versioned settings. Name and life
events are never inputs. Full schema: `skills/calculate-birth-charts/references/input-contract.md`.

## Outputs

A versioned `ChartBundle`: normalized time (UTC instant, offset, mean/apparent solar time, TZDB
version, DST resolution), per-system results (each with its own domain schema), warnings, and
provenance (engine/schema/provider/ruleset/tzdb versions). The current output is this structured
JSON; a self-contained HTML/SVG report (which only re-displays the bundle) is temporarily paused
(`render` disabled, exit 3).

## First-version boundaries

- Western: natal chart only.
- BaZi: four pillars, hidden stems, ten gods, na yin, luck-cycle start and major cycles — only
  objectively reproducible structure; no ungrounded 格局/喜用神 verdicts.
- Zi Wei: natal twelve palaces and major limits; dynamic (month/day/hour) charts later.
- Unified support window: **1901–2100**. A single provider may widen this only after
  independent verification and a capabilities update.

## Non-goals (first version)

No birth-time rectification, no accounts/payments/database/cloud API/standing web service, no
name-based personalization of the base chart, no claim of scientific predictive validity, and
no LLM backfilling of missing positions/terms/ganzhi/stars.

## Roadmap

- **Phase 0/1 (done):** design freeze, contracts, time & location engine, CLI (doctor,
  normalize, calculate, compare, render, verify), packaged Skill, boundary fixtures, docs.
- **Phase 2:** three provider adapters, `calculate all`, sourced golden fixtures.
- **Phase 3:** full SKILL workflow, zero-install packaged CLI, forward tests in fresh sessions.
- **Phase 4:** HTML/SVG report + WorkBuddy live acceptance.
- **Phase 5 (optional):** MCP/Web/API compatibility layers, or an interpretation Skill.
- **Phase 6:** release hardening — reproducible build, checksums, SBOM, audits, benchmarks.

## Disclaimer

For traditional-culture, entertainment and self-reflection use only. Not for medical, legal,
financial or other major decisions.
