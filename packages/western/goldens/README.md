# Western independent golden fixtures (JPL Horizons)

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

## Not covered (still open)

- An independent golden **house table** (e.g. a Swiss Ephemeris reference chart) for the
  in-house angles/houses — tracked in `docs/STATUS.md` Open risks.
- The sidereal zodiac, true node and asteroids remain `precision: approximate` with their
  own continuity regression; they are intentionally outside this ≤1′ golden.
