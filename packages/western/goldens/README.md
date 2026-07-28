# Western independent golden fixtures (JPL Horizons + Swiss Ephemeris)

This directory holds the **independent** ephemeris cross-check of the Western provider
against authoritative [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) geocentric
positions.

## Status

**Populated** (`jpl-horizons.json`, fetched 2026-07-26): apparent geocentric
ecliptic-of-date longitudes (Horizons quantity 31, `ObsEcLon`) for all ten natal bodies at
three technical epochs (1955/2000/2024 — synthetic instants, not anyone's birth data). The
fixture records the exact API query, frame provenance and capture date so anyone can
reproduce it. Measured worst deviation at capture time: 0.20 arc-minutes (Neptune); all ten
bodies pass the same ≤1 arc-minute gate as ADR 0003.

`packages/western/test/western-jpl-golden.test.ts` loads this fixture offline and asserts
`planetPlacement(body, ms)` matches every golden longitude within `toleranceArcmin` — so the
Western gate is no longer wrapper-consistency only (`precision-regression.test.ts` keeps
that layer, plus the Sun cardinal-point anchors).

Do **not** fabricate values here. When adding rows or epochs, copy them from a real,
reproducible JPL Horizons query and record the exact query in the fixture's `source` block.

## Swiss Ephemeris house golden — POPULATED

`swiss-ephemeris-houses.json` is the independent house-cusp golden (placidus / koch /
porphyry / equal / whole-sign) referenced against the Swiss Ephemeris `swetest`
command-line tool. **Populated** (swetest `Version: 2.10.03`, captured 2026-07-28,
input time scale UTC via `-utc`): 5 synthetic technical epochs × 5 systems × 12 cusps
plus ASC/MC/ARMC, transcribed deterministically from a reviewed local capture whose
per-file SHA-256 (stdout, stderr and argv of all 25 calls + version banner) is recorded
in the fixture's `source.rawSha256`. Measured worst deviation at population time:
placidus 0.286′, koch 0.688′, porphyry/equal/whole-sign 0.187′ — per-system
`toleranceArcmin` is the measured maximum plus headroom (0.5′ / 0.9′ / 0.35′), all under
the ≤1′ gate (rationale recorded in `toleranceRationale`; the residual is dominated by
mean-vs-true obliquity). `western-house-golden.test.ts` keeps its fail-closed capture
gate: a de-populated or half-filled fixture turns the suite red again.

Do **not** edit golden values by hand; regenerate via `tools/generate-house-golden.ts`
and re-review.

### Source & licensing boundary

- `swetest` is used **only** as a one-off external reference generator. Its numeric output
  (factual astronomical data for given inputs) is recorded here; the swetest program,
  sources, binaries and ephemeris data files never enter this repository, the lockfile,
  the SBOM, the release bundle or CI. Tests run fully offline from the tracked fixture.
- The reference commands use `-emos` (Moshier). This round's reference commands do not
  require bringing external ephemeris data files into the repository; no additional
  precision claim is made here — measured tolerances are recorded in the fixture only
  after a real capture.

### Capture workflow (two-phase)

1. On a machine with a local `swetest` install, run:

   PowerShell:

   ```
   $env:SWETEST_PATH = 'C:\path\to\swetest.exe'; node --experimental-strip-types tools/generate-house-golden.ts
   ```

   POSIX:

   ```
   SWETEST_PATH=/path/to/swetest node --experimental-strip-types tools/generate-house-golden.ts
   ```

   The script refuses to run without `SWETEST_PATH` (it never downloads anything) and
   invokes `swetest -b<DD.MM.YYYY> -utc<HH:MM:SS> -house<lonE>,<lat>,<LETTER> -emos -head`
   once per sample × system (letters: P=placidus, K=koch, O=porphyry, E=equal(Asc),
   W=whole-sign), for 5 synthetic technical epochs (see the sample matrix in the script;
   none of them is real birth data).

2. All output is first written to an untracked staging directory
   (`.tmp/house-golden-raw.staging-<utc>/`) and atomically renamed to
   `.tmp/house-golden-raw/` only after every invocation succeeds and parses; a
   pre-existing capture directory is renamed aside (never deleted, never merged), so
   stale raw files cannot mix into a fresh capture. Contents:
   `case-<id>-<system>.stdout.txt` / `.stderr.txt` per invocation,
   `version.stdout.txt` / `version.stderr.txt`, `manifest.json` (full argv per call,
   swetest version line, UTC capture time, separate SHA-256 for every stdout/stderr/argv,
   sample matrix) and `draft-fixture.json` (parsed draft). The script exits non-zero —
   producing no final directory — on any spawn error, signal, non-zero exit,
   error-looking stderr, parse failure, missing field, or a quadrant-system output
   mentioning "Porphyry" on either stream (swetest's silent high-latitude fallback,
   which this project **rejects**).
3. The capture is then reviewed (manifest ↔ raw SHA-256 cross-check, draft ↔ raw
   cross-check, order-of-magnitude sanity against engine output) before being transcribed
   into the tracked fixture with `status: "populated"`, real `source.version` /
   `captureDateUtc` / `rawSha256`, and per-system `toleranceArcmin` set to the smallest
   justified value ≤ 1 arc-minute (rationale recorded in `toleranceRationale`).

### High-latitude boundary

The high-latitude tests in `western-house-golden.test.ts` are fixture-independent engine
self-assertions. The contract for the quadrant systems (Placidus, Koch) is: whenever the
geometry is undefined they must throw `HOUSE_SYSTEM_UNAVAILABLE` — never silently fall
back (swetest falls back to Porphyry there; this project rejects that fallback). Koch's
guard is the MC degree's own semi-arc (undefined when the MC degree is circumpolar,
|tan φ · tan δ_MC| > 1); the suite asserts it on synthetic instants VERIFIED against the
implementation to hit that condition. Whether koch is defined at a given high-latitude
instant depends on λ_MC at that moment — no blanket "always fails" claim is made.

## Not covered (still open)

- The house golden covers normal latitudes only (five synthetic cases between 33.9°S and
  59.9°N); circumpolar instants are covered by contract tests (throw, no fallback), not
  by golden values.
- The sidereal zodiac, true node and asteroids remain `precision: approximate` with their
  own continuity regression; they are intentionally outside this ≤1′ golden.
