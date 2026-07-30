# ADR 0013: Vedic (Jyotish) system architecture & rule-convention freeze (P0)

- Status: Proposed — P0 architecture complete; semantic defaults awaiting owner confirmation
  (**no Vedic code exists yet — nothing below is implemented**). Engineering boundaries in
  §§1–4, 6–10, 12–16 are frozen; the node default (§5), the sunrise backend mapping (§9) and
  the Vimshottari year model (§11) are proposed/blocked pending the owner decisions listed under
  "Open questions".
- Date: 2026-07-29
- Scope: adds the fourth first-class system `vedic` as a plan. This ADR freezes definitions,
  boundaries and the PR roadmap **before** any contracts or calculation code changes. Companion
  source registry: [`docs/VEDIC_SOURCE_MATRIX.md`](../VEDIC_SOURCE_MATRIX.md).

## Context

Ming Engine computes Western natal, BaZi and Zi Wei charts deterministically (ADR 0001, 0003).
The next system is Indian sidereal astrology (Jyotish). Two hard constraints shape the design:

1. **Everything stays deterministic, offline and MIT-clean.** Swiss Ephemeris (AGPL/commercial)
   is banned from runtime, bundle, lockfile, SBOM and repo exactly as in ADR 0005; it may only be
   used as an _external_ golden generator with the two-phase isolated-capture workflow already
   proven for the Western house golden (`packages/western/goldens/README.md`).
2. **The existing Western sidereal path is NOT reusable for Jyotish.**
   `packages/western/src/zodiac.ts` implements Lahiri as a _linear_ approximation (fixed
   23.8523° at J2000 + 50.2909″/yr) that ADR 0005 explicitly scoped to "sign placement" and
   marked `precision: approximate`, excluded from the ≤1′ gate. Real Lahiri is defined by a
   reference epoch + full precession/nutation, is non-linear across decades, and Jyotish outcomes
   are boundary-sensitive at far finer granularity than a 30° sign: a Nakshatra pada is 3°20′,
   a Navamsha division is 3°20′, and the Vimshottari balance is a _fraction_ of a 13°20′ arc —
   arc-minute ayanamsha error moves real results. Likewise the current mean node (Meeus series)
   and true node (osculating finite-difference, `precision: approximate`) have never been held to
   an independent ≤1′ golden. The Vedic provider therefore gets its own precise ayanamsha and
   node pipeline, gated in P2.

## Decisions

### 1. System id and package boundary

- Public system id: **`vedic`** (joins `western` | `bazi` | `ziwei` in `ChartSystem`).
- Packages: **`packages/vedic`** (`@ming/vedic`, deterministic calculation provider) and
  **`packages/vedic-rules`** (`@ming/vedic-rules`, sourced interpretation rules; P4).
- Initial ruleset id: **`vedic-parashara-lahiri@0.1.0`** — Parashari framework, Lahiri
  ayanamsha, whole-sign bhava, Vimshottari. Every disputed convention below is carried by this
  versioned ruleset, not by scattered booleans (same policy as BaZi settings).
- Astronomy base: the already-bundled **astronomy-engine 2.1.19 (MIT)**. No new runtime
  dependency, no ephemeris data files.

### 2. Reference frame

- **Geocentric, apparent** ecliptic-of-date positions (same pipeline as the Western provider:
  `Ecliptic(GeoVector(body, date, true))` — includes light-time and aberration).
- Sidereal longitude = `norm360(tropical apparent longitude − ayanamsha(t))`.
- Rationale: the Indian Astronomical Ephemeris and drik ("observation-based") panchanga practice
  compute true/apparent positions of date, then subtract the ayanamsha. This matches the Lahiri
  definition being a **true** (nutation-included) ayanamsha (see §4).

### 3. Time scales

- Input: the existing normalization layer's **UTC instant** (IANA zone via moment-timezone,
  ambiguity/DST handling unchanged). Solar-time modes (mean/apparent) do **not** apply to Vedic
  planetary positions — same invariant as Western (`docs/RULESETS.md`).
- TT/ΔT: handled internally by astronomy-engine's built-in ΔT model; we do not implement our own
  ΔT. The P2 golden comparison against Swiss (which has its own ΔT model) absorbs any small ΔT
  discrepancy into the measured tolerance; if it ever pushes a body over the ≤1′ gate, that is a
  finding, not something to hide.
- Sunrise (needed only for Vaara, §9) uses the observer's coordinates from `BirthInput.location`.

### 4. Lahiri: the precise definition

"Lahiri" is **not** one thing. The Swiss Ephemeris documentation (§2.8.5, "The Spica/Citra
tradition and the Lahiri ayanamsha") distinguishes at least three named variants:

| Variant                         | Swiss sidereal mode        | Reference value                                                           |
| ------------------------------- | -------------------------- | ------------------------------------------------------------------------- |
| Lahiri (IAE 1985 ff., standard) | `SE_SIDM_LAHIRI` (mode 1)  | ayanamsha = 23°15′00″.658 at 1956-03-21 00:00 TDT; Spica(2000) 179°58′58″ |
| Lahiri ICRC (pre-1985 IAE/IENA) | `SE_SIDM_LAHIRI_ICRC` (46) | ayanamsha = 23°15′00″.0 at 1956-03-21 00:00 TDT                           |
| True Chitra Paksha              | `SE_SIDM_TRUE_CITRA` (27)  | Spica held at exactly 180° ecliptic longitude at all times                |

**Decision: adopt the standard Lahiri, i.e. the ayanamsha of the Indian Astronomical Ephemeris
(1985 and later) and Rashtriya Panchang — Swiss `SE_SIDM_LAHIRI`, swetest `-sid1`.** Key
properties frozen here:

- Reference: ayanamsha 23°15′00″.658 at 21 March 1956, 00:00 TDT.
- It is a **true** ayanamsha: it includes nutation and is measured against the true equinox of
  date (Swiss doc §2.8.5; concluded from IAE published values).
- It is **not** the same as True Chitra Paksha (Spica drifts a few arc-seconds from exact 180°
  under standard Lahiri) and **not** the ICRC 0″.658-smaller variant. These names must never be
  treated as synonyms in code, docs or goldens.
- All future Vedic goldens are captured with `swetest -sid1` (plus `-nonut`-free defaults so
  nutation is included), and the fixture must record the sidereal mode id, exactly like the
  house golden records the house-system letter.
- Our own implementation (P2) computes ayanamsha from the frozen reference epoch + the precession
  model already inside astronomy-engine, then validates against the Swiss golden at ≤1′ over the
  whole support window (1900–2100). The implementation formula is chosen in P2; this ADR freezes
  the _target definition_ and the _gate_, not the polynomial.

### 5. Rahu: mean vs true

**Proposed default: mean node (owner confirmation pending, Open question 1).** Classical
dasha/panchanga practice and the traditional ephemerides assume the mean (uniformly regressing)
node; KP sources also traditionally use the mean node.
The true (osculating) node oscillates ±~1.7° around the mean, which can move Rahu's nakshatra
and pada — a genuine school split, so:

- `settings.vedic.nodes: 'mean' | 'true'`, proposed default `'mean'`, recorded in provenance.
- The P2 golden covers **both** modes against Swiss (`swetest -p` true node `t` / mean node `m`).
- The existing Western node implementations are not reused as-is: the Vedic mean node must pass
  its own ≤1′ Swiss golden (the Meeus series is expected to pass; if it does, it is promoted to
  shared code — verified, not assumed).

### 6. Ketu

**Ketu = Rahu + 180° exactly (mod 360), in both mean and true modes.** Never computed
independently; the golden asserts the opposition property on every sample.

### 7. Bhava (houses)

- **v1: Whole-sign bhava only** (Parashari default): bhava 1 = the entire rashi containing the
  Lagna degree, bhava n = the n-th rashi from it.
- **Bhava Chalit / Sripati / equal-from-Lagna-degree are out of scope for v1.** Requesting them
  yields a structured warning (`VEDIC_BHAVA_SYSTEM_UNSUPPORTED`, final code name fixed in P4) —
  never a silent fallback (same policy as `HOUSE_SYSTEM_UNAVAILABLE` in Western).
- Lagna = sidereal ascendant = `norm360(tropical ascendant − ayanamsha)`, with the tropical
  ascendant from the existing Western angles code path (already Swiss-golden-verified for
  ASC/MC in v0.2.0).

### 8. Nakshatra and Pada

- 27 nakshatras of 13°20′ (= 800′) each, starting at sidereal 0° Aries (Ashvini) — the 27-fold
  equal division used by Vimshottari; the 28-nakshatra scheme (with Abhijit) is out of scope v1.
- `nakshatraIndex = floor(siderealLongitude / (360/27))`, 0-based internally, 1..27 public.
- Pada: each nakshatra divides into 4 padas of 3°20′; `pada = floor(offsetInNakshatra / (10/3°)) + 1`.
- All intervals are **left-closed, right-open** (`[start, end)`); an exact boundary longitude
  belongs to the next segment. See §12 for the epsilon policy.

### 9. Panchanga

All five members are computed **as instantaneous values at the birth instant** (this is a natal
engine, not an almanac); only Vaara additionally needs the sunrise day-boundary.

- **Tithi**: `tithi = floor(norm360(λ_moon − λ_sun) / 12°) + 1` (1..30; 1..15 Shukla,
  16..30 Krishna). The elongation is ayanamsha-invariant (the offset cancels in the difference).
- **Nakshatra** (of the Moon): as §8, on the Moon's sidereal longitude.
- **Yoga**: `yoga = floor(norm360(λ_sid_moon + λ_sid_sun) / 13°20′) + 1` (1..27, Vishkambha…
  Vaidhriti). NOTE: the **sum does not cancel the ayanamsha** — Yoga must use sidereal
  longitudes and shifts by 2× ayanamsha versus a tropical computation. This is a classic
  implementation bug class; the golden covers it explicitly.
- **Karana**: half-tithis, 60 per lunar month: `k = floor(norm360(λ_moon − λ_sun) / 6°)` (0..59).
  `k = 0` is the fixed Kimstughna; `k = 1..56` cycle through the seven movable karanas
  (Bava, Balava, Kaulava, Taitila, Garaja, Vanija, Vishti) eight times; `k = 57, 58, 59` are the
  fixed Shakuni, Chatushpada, Naga.
- **Vaara** (weekday): runs **from local sunrise to the next local sunrise**, not midnight —
  a birth before sunrise belongs to the previous weekday. Sunrise definition is itself disputed
  (documented, e.g., in Drik Panchang's settings: "Edges" = top edge at horizon vs "Middle
  Limb" = disc center). **Rule target (proposed): upper-limb sunrise.** Evidence for the
  installed backend, astronomy-engine 2.1.19 (`astronomy.js`, `SearchRiseSet` doc block +
  `BodyRadiusAu`): rise is "the moment that the top of the Sun first appears to peek above the
  horizon", the body's apparent angular radius is applied, and a fixed **34′** atmospheric
  refraction correction is used — i.e. upper-limb semantics with 34′ refraction. The exact
  numeric mapping to the classical "Sun center at −50′" convention (34′ + fixed 16′
  semi-diameter vs astronomy-engine's true apparent radius) is **not yet verified and is a P2/P3
  implementation blocker**: it must be pinned by sunrise spot-check goldens before any Vaara
  output ships. Disc-center-without-refraction is a recorded alternative for a future ruleset,
  not a v1 option. Elevation is ignored for sunrise in v1 (sea-level horizon), recorded as a
  caveat.

### 10. D1 and D9

- **D1 (Rashi)**: `rashi = floor(λ_sid / 30°)` (0-based Mesha..Meena internally; public names).
- **D9 (Navamsha)**: divide each rashi into 9 parts of 3°20′; `n = floor(offsetInRashi / 3°20′)`.
  Mapping (Parashari standard): navamsha signs count **from the rashi itself for movable
  (chara) signs, from the 9th from it for fixed (sthira) signs, from the 5th from it for dual
  (dvisvabhava) signs**; equivalently, trine-start counting from Aries/Leo/Sagittarius groups.
  Both formulations are implemented-checked against each other in tests.
- Boundaries left-closed right-open, same epsilon policy (§12). D9 Lagna is computed from the
  Lagna degree and inherits the timeAccuracy gating (§13).
- All other vargas (D2..D60, incl. D10) are **out of scope v1** (§14).

### 11. Vimshottari dasha

- **Lord sequence and years** (BPHS, Vimshottari chapter): Ketu 7, Venus 20, Sun 6, Moon 10,
  Mars 7, Rahu 18, Jupiter 16, Saturn 19, Mercury 17 — total **120 years**.
- Nakshatra→lord: Ashvini→Ketu, Bharani→Venus, Krittika→Sun, … repeating the 9-lord cycle three
  times across the 27 nakshatras (nakshatraIndex mod 9 indexes the sequence above).
- **Start**: the Maha dasha at birth is the lord of the **Moon's** nakshatra.
- **Balance at birth**: `balance = (1 − elapsedFractionOfNakshatra) × lordYears`, where
  `elapsedFraction = offsetInNakshatra / 13°20′` from the Moon's sidereal longitude at the birth
  instant. Pure longitude ratio — no day-rounding.
- **Year length model**: **disputed among schools (365.25-day "solar" year vs 360-day savana
  year vs sidereal year)** — the models drift apart materially over a life span (a 120-year
  cycle is ~630 days shorter under savana-360 than under julian-365.25; a sidereal year is
  ~365.2564 days, another ~46 days over 120 years). **Candidate: `julian-365.25`** (dasha year =
  365.25 × 86400 SI seconds), the software-mainstream convention — but this is **NOT frozen in
  P0**. The P3 dasha implementation is **BLOCKED** on (a) an explicit owner decision and (b) a
  same-model cross-check against a second independent implementation (jyotishganit candidate)
  configured to the identical year model. P1 may reserve a versioned enum
  (`dashaYear: 'julian-365.25' | 'savana-360' | 'sidereal'`) in settings, but **no value may be
  wired as the product default** until the owner decision lands; the chosen model is then
  recorded in the ruleset/provenance so alternates can ship later as new ruleset versions
  without ambiguity.
- **Antar dashas**: within a Maha of lord L, sub-periods follow the same 9-lord sequence
  starting from L itself; `antarLength = mahaLength × antarLordYears / 120`.
- **Endpoints**: every period is a half-open instant interval `[start, end)`; `end` of one
  period is byte-identical (same ISO instant) to `start` of the next — no gaps, no overlaps,
  asserted by tests. v1 emits Maha + Antar only (no Pratyantar).

### 12. Numeric conventions

- Angles normalized to `[0, 360)` via the existing `norm360`.
- All segment classifications (rashi, nakshatra, pada, navamsha, tithi, yoga, karana) are
  **left-closed right-open** on the _rounded_ canonical value: classify **after** rounding the
  longitude with the shared `roundTo` policy (`@ming/contracts` `ids.ts`, which already adds
  `Number.EPSILON` to avoid platform 0.5-flapping). Longitudes are canonicalized at **6 decimal
  places** (≈ 0.0036″ — far below both the ≤1′ gate and any boundary the classifications use),
  matching the Western provider's rounding. This makes classification deterministic across
  platforms: no separate "boundary epsilon" knob exists, and none may be introduced silently.
- Derived indices are integers; derived instants (dasha endpoints) are ISO-8601 UTC strings.

### 13. timeAccuracy degradation

Same honesty policy as Zi Wei's `ZIWEI_INPUT_REQUIRED`: never emit a value that the input cannot
support; suppress + warn instead.

| timeAccuracy  | Behavior                                                                                                                                                                                                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exact`       | Full output.                                                                                                                                                                                                                                                                        |
| `approximate` | Full output, but Lagna/bhava/D9-of-Lagna/Vaara facts carry a mandatory caveat; dasha additionally caveated when the Moon changes nakshatra within ±2h of the stated time.                                                                                                           |
| `unknown`     | **Suppress** Lagna, bhava placements, D9 Lagna, Vaara. Moon-dependent outputs (Moon nakshatra/pada, Tithi, Yoga, Karana, Vimshottari) are emitted **only if stable across the entire civil day** at that location; otherwise suppressed with a `VEDIC_TIME_REQUIRED`-class warning. |

Exact warning codes and copy are fixed in P4 alongside the AnswerPlan public-warning table.

### 14. Not supported in v1 (structured, not silent)

D10 and all other vargas beyond D1/D9, Shadbala, Ashtakavarga, the Yoga catalog (Raja/Dhana
etc.), synastry/kuta matching, gochara/transits, muhurta, Bhava Chalit, Pratyantar+ dasha
levels, 28-nakshatra scheme. Each is (a) absent from output, (b) documented as not implemented,
and (c) where a request can express it (settings/CLI), answered with a structured warning —
never approximated. They are candidates for post-v0.3.0 iterations, in that rough priority
order, each requiring its own sourced convention freeze first.

### 15. Ruleset / provider / provenance / precision plan

- `ProviderRef`: `{ id: 'astronomy-engine', version: '2.1.19', license: 'MIT' }` (same instance
  as Western).
- `RulesetRef`: `vedic-parashara-lahiri@0.1.0`, carrying: ayanamsha id (`lahiri-iae-1985`,
  Swiss mode 1 equivalent), nodes default, bhava system, dasha year model, sunrise model,
  panchanga formulas version.
- Precision labels: the nine grahas + Lagna target `precision: 'high'` **only after** the P2
  Swiss golden holds ≤1′; until then nothing ships. Derived integer classifications
  (rashi/nakshatra/pada/tithi/yoga/karana/vargas) carry no separate precision number but inherit
  boundary-distance caveats: any classification within 1′ of a segment boundary gets an explicit
  `near-boundary` caveat in facts (P4).
- Every fact cites evidence refs (`vedic.grahas.moon.nakshatra`, `vedic-rule/...`) exactly like
  the existing three systems.

### 16. v0.3.0 public-contract breaking changes & migration

Additive-but-breaking surface (implemented in P1, shipped in v0.3.0):

| Contract point                                                    | Change                                                                                     | Compat                                                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `ChartSystem` (`birth-input.ts`)                                  | + `'vedic'`                                                                                | Old inputs parse unchanged (default `systems` stays 3-system until v0.3.0 decides).  |
| `CalculationSettings`                                             | + `vedic: VedicSettings` with defaults                                                     | strictObject gains an optional-with-default key — old JSON inputs remain valid.      |
| `EngineSystem` (`warnings.ts`)                                    | + `'vedic'`                                                                                | Additive.                                                                            |
| `ChartBundle`                                                     | + `vedic?: VedicChartResult`                                                               | Additive.                                                                            |
| `EvidenceKind`                                                    | + `'vedic'`, `'vedic-rule'`                                                                | Additive.                                                                            |
| `PublicResult.systems` (`answer-plan.ts`)                         | `.length(3)` → `.length(4)`                                                                | **Breaking** for consumers pinned to 3 entries.                                      |
| `PUBLIC_RESULT_CONTRACT_VERSION` / `ANSWER_PLAN_CONTRACT_VERSION` | bump `public-result/v1`→`v2`, `answer-plan/v1`→`v2`                                        | Honest versioned break; validate-answer v2 gate updated in the same PR (P4).         |
| `interpret.ts` / `interpret/src/answer-plan.ts` SYSTEMS           | hardcoded 3-system lists → 4                                                               | Internal.                                                                            |
| `ming-chart.mjs --systems all`                                    | expands to 4                                                                               | CLI output gains a `vedic` block; `--systems western,bazi,ziwei` keeps old behavior. |
| `ENGINE_VERSION`                                                  | → `0.3.0` at release-prep (P6)                                                             | Deterministic request ids change, as with every engine bump.                         |
| `SCHEMA_VERSION`                                                  | evaluate in P1: stays `0.1.0` if all input changes are default-compatible, else minor bump | Decision recorded in P1 PR.                                                          |

Whether v0.3.0 flips the **default** `systems` array to include `vedic` is an open product
decision (§Open questions); the engine capability does not depend on it.

## Rollout: six independent PRs

- **P1 — contracts + provider skeleton**: `VedicSettings`, `VedicChartResult` schema, enum
  extensions above, `packages/vedic` returning `SYSTEM_NOT_YET_IMPLEMENTED`-style honest
  pending warnings; no numbers computed. Contract version bumps prepared. May reserve the
  versioned `dashaYear` enum, but wires **no product default** for it (§11).
- **P2 — precise ayanamsha, nine grahas, nodes, Lagna + Swiss golden**: Lahiri (§4)
  implementation; Sun..Saturn sidereal positions; mean+true Rahu, Ketu opposition; sidereal
  Lagna. Golden: ≥50 synthetic cases (multi-decade 1900–2100, N/S latitudes, multiple
  timezones, cases straddling rashi/nakshatra/pada/tithi/D9/dasha-lord boundaries), captured via
  the isolated two-phase `swetest -sid1` workflow (staging dir → SHA-256 manifest → reviewed
  transcription; binaries/ephemeris files never enter the repo), gate ≤1′ for grahas, nodes and
  Lagna; Rahu/Ketu opposition asserted; cross-checked against at least one independent MIT
  implementation where one is available — discrepancies are **recorded per-source in the fixture,
  never majority-voted away**. The field-scoped evidence policy below is binding. All inputs marked
  synthetic. **Blocker carried into P2/P3**: pin the sunrise backend parameter mapping (§9) with
  sunrise spot-check goldens before any Vaara output.

### P2 verification evidence boundary (amended 2026-07-30)

This amendment supersedes the generic all-fields independent-MIT wording in the P2 bullet above.
It does **not** lower any numerical acceptance threshold.

1. **Swiss remains the hard acceptance oracle for every P2 numeric field.** The implementation
   must match reviewed, isolated `swetest -sid1 -utc -emos` fixtures within ≤1′ for every graha,
   both Rahu modes and Lagna; Ketu remains an exact opposition invariant. A passing result may be
   described only as “matches the recorded Swiss fixtures within ≤1′”, never as a general claim of
   physical or absolute astrometric accuracy.
2. **MIT cross-checks are field-scoped supplementary evidence, not a substitute oracle.** A
   passing independent MIT implementation is recorded for the individual fields it demonstrably
   covers. Its absence or failure for another field never relaxes the Swiss gate; that field is
   explicitly marked **Swiss-only external numeric reference** in the fixture and public
   provenance notes. No majority vote is allowed.
3. **NDAstro 0.28.1 audit record.** Its MIT wheel and tag `v0.28.1` sources were byte-for-byte
   bound; its Skyfield/JPL route contains no Swiss runtime dependency. Against 11 synthetic cases
   (110 comparisons) using ordinary `lahiri` only — never its mode-43-compatible
   `true_lahiri` / `lahiri_traditional` paths — it passed Sun..Saturn (worst 0.710′) and mean
   Rahu (worst 0.046′). It failed true Rahu (worst 7.633′) and Lagna (worst 10.286′), so it is
   **REJECTED_FOR_MODE1_REFERENCE** as a full P2 oracle. It is retained only as supplementary
   pre-screen evidence for the fields that passed; it is never embedded, copied or made a runtime
   dependency.
4. **Compensating Swiss-only safeguards.** P2 now requires at least **100 synthetic cases**,
   including the stated multi-decade, hemisphere, IANA-zone and classification-boundary coverage.
   Each capture must retain the exact argv, `swetest` version, raw stdout/stderr SHA-256 manifest
   and reviewed transcription trail outside the repository. True-node tests additionally assert
   Ketu opposition, continuity and no boundary jump; Lagna tests assert the explicit tropical-to-
   sidereal transform and the existing high-latitude contract. These are implementation checks,
   not a claim of a second independent ephemeris.

Until a future independent source passes a field, user-facing and release documentation must say
“Swiss-only external numeric reference” for that field and must not claim two-source validation.

- **P3 — classifications**: Rashi/Bhava/Nakshatra/Pada/Panchanga/D1/D9/Vimshottari per §§7–12,
  including boundary-case unit tests on both sides of every segment edge. **Blocked until** the
  Vimshottari year-model owner decision + same-model dual-implementation cross-check (§11) and
  the sunrise mapping verification (§9) are done.
- **P4 — facts & answer layer**: `vedic-rules` sourced findings, InterpretationFacts wiring,
  AnswerPlan/PublicResult v2, validate-answer update, warning codes + public-copy table,
  timeAccuracy gating (§13).
- **P5 — CLI, Skill, hosts, docs**: `ming-chart.mjs` systems expansion, SKILL.md/references,
  four host packages, doc-count/doc-claim gates updated from real runs.
- **P6 — v0.3.0 release-prep**: engine version, RELEASE_CHECKLIST walk, SBOM regeneration,
  manifests. No release/tag/promote without explicit owner authorization.

## License boundary (restated, binding)

| Project         | License                | Allowed use                                                                                                 |
| --------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| Swiss Ephemeris | AGPL / commercial dual | External golden generator only, isolated capture; never in runtime/ZIP/deps/SBOM/repo/CI.                   |
| PyJHora         | AGPL (+ Swiss, Python) | Feature-checklist research only; no code copying/porting; any automated use needs a fresh license decision. |
| node-jhora      | Custom proprietary     | **Fully excluded.** No use, no derivation.                                                                  |
| jyotishganit    | MIT (Python/Skyfield)  | Independent cross-check candidate for goldens; not a runtime dependency in this phase.                      |
| VedAstro        | MIT (C#/.NET/API)      | Public-contract reference and independent result comparison; never embedded in the Node Skill.              |

## Open questions (owner decisions pending)

1. **Proposed** default `nodes: 'mean'` (vs `'true'`) for `vedic-parashara-lahiri@0.1.0` —
   awaiting confirmation.
2. **BLOCKED / owner decision**: Vimshottari year model. Candidate: `julian-365.25`; the P3
   dasha implementation is blocked on this decision plus a same-model dual-implementation
   cross-check (§11). No default may be wired before then.
3. **Proposed** sunrise rule target "upper-limb" for Vaara — awaiting confirmation; the
   backend parameter mapping additionally requires P2 verification evidence (§9).
4. Should v0.3.0 flip the default `systems` array to all four, or keep 3 and make `vedic`
   opt-in initially?
5. Public-contract v2 rollout: hard cut in v0.3.0 (recommended) vs dual-emit v1+v2.

## Consequences

- No calculation code, contract, bundle, CLI, lockfile, SBOM or golden changes in P0 — only this
  ADR, the source matrix, a RULESETS.md roadmap entry and a doc-presence gate test.
- The **engineering boundaries** (system id, package split, frame/time-scale choices, Lahiri
  variant identification, Ketu opposition, whole-sign scope, interval/rounding conventions,
  contract-break plan, license boundary, golden methodology) are frozen: implementation PRs may
  not silently deviate — a deviation requires editing this ADR first. The **semantic defaults**
  flagged as proposed/blocked (node default, sunrise mapping, dasha year model) must not be
  treated as decided until the owner confirms.
- The engine keeps its golden rules: the model never computes charts; missing values are
  reported, never backfilled; Vedic capability must not be claimed anywhere user-facing until P5
  ships (guarded by `tools/vedic-docs.test.ts`). No precision (≤1′ or otherwise) may be claimed
  for any Vedic quantity before the P2 golden actually holds it.
