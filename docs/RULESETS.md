# Rule sets & schools (repository view)

Every calculation selects a **versioned `rulesetId`** recorded in the result. The UI only offers
rulesets that are implemented and tested. "The library supports plugins" ≠ "the school is
implemented" (handoff §5). The runtime-facing summary lives in
`skills/calculate-birth-charts/references/rulesets.md`; this file adds the versioning policy and
roadmap.

## Versioning policy

- Ruleset ids are `name@semver`, e.g. `western-tropical-placidus@0.1.0`, `bazi-standard@0.1.0`,
  `iztro-default@0.1.0`.
- Any change that can alter output bumps the ruleset version; the previous id keeps its meaning.
- The four-transformations table, star-brightness table and solar-term source each carry their
  own recorded version once the providers land.

## `compare` profiles (implemented now)

`default`, `apparent-solar`, `mean-solar`, `whole-sign`. In Phase 1 these do not change the UTC
instant, so `compare` reports normalized time identical and notes that chart-level differences
arrive with the providers. Implemented in `packages/orchestrator/src/compare.ts`.

## Western — `western-tropical-placidus@0.1.0` (default)

Tropical, geocentric, Placidus, true node. Configurable: house system (whole-sign/equal/koch/
porphyry), sidereal + ayanamsha, mean node, aspect set + orb (Phase 2). High-latitude
quadrant-house failure must raise `HOUSE_SYSTEM_UNAVAILABLE`, never a silent switch.

## BaZi — `bazi-standard@0.1.0`

Versioned disputed points: solar-term boundaries for year/month pillars; time base
(civil/mean/apparent); day boundary (midnight/zi-hour); early/late 子时; luck-cycle direction and
起运 algorithm. MVP computes only reproducible calendar/structure; 格局/强弱/喜用神 are
interpretation rules that must carry an explicit source + version.

## Zi Wei — `iztro-default@0.1.0`

One named ruleset first; schools via configuration. Records star-placement ruleset, 四化 table
version, brightness table version, whether true solar time applies, and limit configuration.

## Vedic (Jyotish) — `vedic-parashara-lahiri@0.1.0` (PLANNED, not implemented)

Roadmap only — **no Vedic calculation exists in the engine today** and no user-facing surface may
claim otherwise until the ADR 0013 P5 slice ships. P1 status: the contracts reserve the `vedic`
system id (`VedicSettings`/`VedicChartResult`, opt-in only — the default `systems` array stays
three-system) and `@ming/vedic` / `@ming/vedic-rules` exist as skeletons whose provider always
returns `SYSTEM_NOT_YET_IMPLEMENTED`; the engine skeleton still computes no Vedic data at all.
Owner-confirmed defaults (2026-07-31): the Vimshottari year model is
`dashaYear: 'julian-365.25'` (365.25 × 86400 SI seconds; savana-360/sidereal only as future new
rulesets) and the Vaara sunrise rule is `upper-limb-standard-refraction` (upper limb + standard
34′ refraction). Still undecided: the Rahu node default (`nodes`). Delivery gates remain:
Vimshottari cannot ship before its same-model (`julian-365.25`) dual-implementation cross-check
passes, and Vaara cannot ship before the sunrise backend-mapping goldens pass. The frozen
engineering boundaries (Lahiri = IAE-1985 standard / Swiss `SE_SIDM_LAHIRI`, Ketu = Rahu+180°,
whole-sign bhava, 27-nakshatra scheme, instantaneous panchanga, D1/D9)
live in [ADR 0013](adr/0013-vedic-architecture.md) and the per-topic source registry
[`docs/VEDIC_SOURCE_MATRIX.md`](VEDIC_SOURCE_MATRIX.md). Target product version: v0.3.0.

## Solar-time rule (invariant)

Mean/apparent solar time feed BaZi/Zi Wei only and never replace the Western UTC instant +
coordinates. Mean solar time is longitude-driven; the 120°E/UTC+8 shortcut is never global.
