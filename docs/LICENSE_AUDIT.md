# License Audit

- Verified: 2026-07-21 against the live npm registry (`npm view <pkg> version license`) and
  package metadata.
- Default route: **closed-source-friendly**. Only MIT/BSD/Apache/ISC permitted without explicit
  owner approval. No AGPL/GPL or unclear-provenance code in the default build.
- **Enforced in the gate**: `pnpm run scan:licenses` (in `verify:cloud`) checks the whole
  production dependency closure against this policy offline and cross-checks the committed SBOM
  license claims; it fails closed.
- **Bundle-closure gate**: `pnpm run validate:sbom` (also in `verify:cloud`) re-runs esbuild,
  derives the actual third-party runtime closure from the metafile, and requires both
  `sbom.cdx.json` and `sbom.spdx.json` to record exactly that closure with matching
  name/version/purl/license. The SBOM is derived from the metafile at build time — no
  hand-maintained package list can drift from bundle reality.
- This file is not legal advice; re-verify before any commercial release.

## Bundled into the published engine (`scripts/dist/engine.mjs`)

| Package          | Version | License | Code license | Data license                 | Notes                                                                           |
| ---------------- | ------- | ------- | ------------ | ---------------------------- | ------------------------------------------------------------------------------- |
| zod              | 4.4.3   | MIT     | MIT          | —                            | Zero dependencies.                                                              |
| moment-timezone  | 0.6.3   | MIT     | MIT          | IANA tz data (public domain) | Ships packed IANA data; version recorded via `moment.tz.dataVersion` (`2026c`). |
| moment           | 2.30.1  | MIT     | MIT          | —                            | Transitive dep of moment-timezone; maintenance mode but stable.                 |
| tyme4ts          | 1.5.2   | MIT     | MIT          | —                            | Four Pillars / BaZi (八字) + lunar→Gregorian calendar conversion.               |
| iztro            | 2.5.8   | MIT     | MIT          | —                            | Zi Wei Dou Shu (紫微斗数) natal chart computation.                              |
| astronomy-engine | 2.1.19  | MIT     | MIT          | —                            | Western natal chart ephemeris (VSOP87 + NOVAS based).                           |

## Dev-only (NOT shipped in the Skill)

| Package     | Version                               | License    |
| ----------- | ------------------------------------- | ---------- |
| typescript  | 5.9.3 (pinned; registry latest 7.0.2) | Apache-2.0 |
| vitest      | 4.1.10                                | MIT        |
| esbuild     | 0.28.1                                | MIT        |
| prettier    | 3.9.6                                 | MIT        |
| @types/node | 24.x                                  | MIT        |

## Western provider decision

| Package          | Version | License | Decision                                                                                                                  |
| ---------------- | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------- |
| astronomy-engine | 2.1.19  | MIT     | **Adopted as the Western ephemeris base** (bundled): passes the ADR 0003 ≤1′ gate for all ten bodies incl. Mercury/Pluto. |
| celestine        | 0.2.1   | MIT     | **Evaluated, rejected at ADR 0003 gate**: fails ≤1′ regression (Mercury ~17′, Pluto ~37′). Removed from the project.      |

## Explicitly excluded from the default build

| Package/route                     | License                | Reason                                                    |
| --------------------------------- | ---------------------- | --------------------------------------------------------- |
| Swiss Ephemeris                   | AGPL / commercial dual | Needs owner license decision before any (incl. SaaS) use. |
| Kerykeion / Immanuel / PySwissEph | AGPL-adjacent          | For AGPL or separately-licensed routes only.              |

## Data-source notes

- IANA Time Zone Database: public domain; release id recorded per result.
- NOAA GML Solar Calculator equation-of-time approximation: US Government work, public domain.
- **Sidereal / true-node / asteroid computation (ADR 0005): self-computed under MIT.** The Lahiri
  ayanamsha formula, the true-node finite-difference method, and the asteroid osculating orbital
  elements (Chiron/Ceres/Pallas/Juno/Vesta) are public-domain astronomical constants + a Kepler
  solver written in-house. **No** third-party ephemeris library or data file (e.g. Swiss Ephemeris)
  is added or bundled; the engine stays MIT and fully offline. These bodies are `precision:
approximate` and excluded from the ≤1′ wrapper-consistency gate.
- GB/T 33661-2017 (Phase 2, calendar/solar terms only): national standard; defines the calendar,
  not interpretation rules.

## Interpretation-rule sources (public-domain classics)

The `packages/bazi-rules` interpretation rules cite the following centuries-old works, all in the
public domain (their authors died hundreds of years ago; no modern copyrighted commentary is
copied). Each finding records the work + chapter it derives from (handoff §2.3).

| Work (经典)  | Era / author             | Used for                                   | Status        |
| ------------ | ------------------------ | ------------------------------------------ | ------------- |
| 《子平真诠》 | Qing dynasty, 沈孝瞻     | 月令/格局 framework, 得令得地得势 strength | Public domain |
| 《滴天髓》   | Ming (attrib. 刘基/京图) | 旺衰扶抑 useful-god principle              | Public domain |
| 《渊海子平》 | Ming, 杨淙               | 十神象义 (ten-god meanings)                | Public domain |
| 《三命通会》 | Ming, 万民英             | 神煞 / 刑冲合害 (relations & shensha)      | Public domain |

## Open items before commercialization

1. Confirm the license route (closed-source MIT/BSD/Apache vs AGPL vs paid Swiss). Default: closed.
2. Human legal/provenance review of any calendar/ephemeris data tables before shipping BaZi/Zi Wei.
3. Regenerate `sbom.cdx.json` and re-verify every LICENSE at each provider integration.
