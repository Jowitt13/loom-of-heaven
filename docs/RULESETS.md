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

## Vedic (Jyotish) — `vedic-parashara-lahiri@0.1.0` (P2/P3B substrate; not user-facing)

P2 computes an opt-in numeric substrate: Lahiri Sun..Saturn, both Rahu modes with Ketu as exact
opposition, and Lagna when a birth time is known. P3A deterministically derives rashi (D1),
whole-sign bhava, 27-nakshatra/pada, D9, and instantaneous Tithi/Yoga/Karana from those canonical
longitudes, then P3B adds Vaara and Vimshottari under reviewed evidence gates; it suppresses the
entire overlay when the birth time is unknown. It is held to the
reviewed offline Swiss mode-1 fixture at ≤1′ and uses the MIT `caelus@0.23.0` embedded-data
provider. This is not a user-facing product system: the default `systems` array remains
three-system and no Skill or host surface may claim Vedic capability until the ADR 0013 P5 slice
ships. P3B's Vaara and Vimshottari are internal provider outputs only, not a product claim.
Owner-confirmed defaults (2026-07-31): the Vimshottari year model is
`dashaYear: 'julian-365.25'` (365.25 × 86400 SI seconds; savana-360/sidereal only as future new
rulesets) and the Vaara sunrise rule is `upper-limb-standard-refraction` (upper limb + standard
34′ refraction). Their P3B gates are satisfied by the 12-case NDAstro same-model dasha fixture
(maximum 16.610 seconds; 30-second input-bridge allowance) and the 16-case Swiss sunrise fixture
(maximum 5.457 seconds; 10-second gate). Still undecided: the Rahu node default (`nodes`). The frozen
engineering boundaries (Lahiri = IAE-1985 standard / Swiss `SE_SIDM_LAHIRI`, Ketu = Rahu+180°,
whole-sign bhava, 27-nakshatra scheme, instantaneous panchanga, D1/D9)
live in [ADR 0013](adr/0013-vedic-architecture.md) and the per-topic source registry
[`docs/VEDIC_SOURCE_MATRIX.md`](VEDIC_SOURCE_MATRIX.md). Target product version: v0.3.0.

## Vedic P5 exposure boundary

This is the **P5 user-facing system** boundary.

P5 exposes `vedic-parashara-lahiri@0.1.0` as a user-facing technical chart through
`calculate --systems all`, the Skill and host source metadata. The raw no-settings `systems`
default remains Western/BaZi/Zi Wei for compatibility. The chart returns **both node modes**;
there is no product default while the owner decision remains pending. Unknown time emits
`VEDIC_TIME_REQUIRED` and suppresses time-of-day values. The provider is offline MIT `caelus`;
the <=1 arc-minute statement is limited to the recorded Swiss-only external numeric-reference
fixture, never a general astrometric claim. The v0.3.0 Release assets are published; the stable
root manifest records their immutable URLs and SHA-256 hashes.

## Solar-time rule (invariant)

### P4 internal answer-contract update (2026-08-09)

`vedic-parashara-lahiri@0.1.0` now contributes only sourced, structural internal facts to the
four-system `PublicResult` / `AnswerPlan` v2 path. The owner selected a hard cut: no
`public-result/v1` or `answer-plan/v1` output or compatibility emission remains. This is not a
P5 product-surface change: default `systems`, the CLI, Skill and host packages still do not
advertise or select Vedic.

Mean/apparent solar time feed BaZi/Zi Wei only and never replace the Western UTC instant +
coordinates. Mean solar time is longitude-driven; the 120°E/UTC+8 shortcut is never global.
