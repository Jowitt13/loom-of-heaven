# Third-Party Notices

The `calculate-birth-charts` Skill bundles the deterministic engine into
`scripts/dist/engine.mjs`. That bundle inlines the following third-party packages.
All are permissive (MIT) and closed-source-friendly. Versions are recorded in
`sbom.cdx.json` (CycloneDX) and re-verified at build time.

## Bundled runtime dependencies

| Package                                                      | License | Purpose                                                                                                  |
| ------------------------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------- |
| [zod](https://github.com/colinhacks/zod)                     | MIT     | Runtime schema validation for the versioned JSON contracts.                                              |
| [moment-timezone](https://github.com/moment/moment-timezone) | MIT     | Bundled, version-pinned IANA time-zone database (`moment.tz.dataVersion`) and historical offset lookups. |
| [moment](https://github.com/moment/moment)                   | MIT     | Dependency of moment-timezone.                                                                           |
| [tyme4ts](https://github.com/6tail/tyme4ts)                  | MIT     | BaZi (Four Pillars / 八字) computation and lunar→Gregorian calendar conversion.                          |
| [iztro](https://github.com/SylarLong/iztro)                  | MIT     | Zi Wei Dou Shu (紫微斗数) natal chart and 运限 (horoscope) computation.                                  |
| [astronomy-engine](https://github.com/cosinekitty/astronomy) | MIT     | Western natal chart ephemeris (VSOP87 + NOVAS planet positions).                                         |

## Data sources referenced by the engine

- IANA Time Zone Database — bundled via moment-timezone (release id recorded in
  provenance, e.g. `2026c`). Public domain.
- NOAA GML Solar Calculator equation-of-time approximation (US Government, public
  domain) — used for apparent solar time. See `references/sources-and-limitations.md`.
- Public-domain BaZi classics cited by the interpretation rules (`packages/bazi-rules`):
  《子平真诠》(Qing, 沈孝瞻), 《滴天髓》(Ming, attrib. 刘基), 《渊海子平》(Ming, 杨淙).
  Each interpretation finding records the work + chapter it derives from; no modern
  copyrighted commentary is copied.

## Western provider decision

The Western natal chart is computed by `astronomy-engine` (MIT, bundled above), which passes the
ADR 0003 ≤1 arc-minute precision gate for all ten bodies. The earlier candidate `celestine`
(MIT) was evaluated and **rejected** at that gate (Mercury ~17′, Pluto ~37′) and is no longer part
of the project. No AGPL/GPL ephemeris (e.g. Swiss Ephemeris) is used.

## Dev-only tooling (not shipped in the Skill)

TypeScript (Apache-2.0), Vitest (MIT), esbuild (MIT), Prettier (MIT). These build and
test the engine but are not part of `scripts/dist/engine.mjs`.

> This file is not legal advice. Re-verify each upstream LICENSE and package metadata
> before any commercial release; see `docs/LICENSE_AUDIT.md`.
