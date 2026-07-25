# Western independent golden fixtures (JPL Horizons) — TODO

This directory is the designated home for an **independent** ephemeris cross-check of the
Western provider against authoritative [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/)
geocentric positions.

## Status

**Not yet populated.** The current `precision-regression.test.ts` proves only
_wrapper-consistency_: that our thin wrapper reproduces `astronomy-engine`'s own output to
≤1 arc-minute (plus Sun cardinal-point anchors that are true by definition). It does **not**
independently verify absolute accuracy against JPL. `astronomy-engine` itself follows the
VSOP87 + NOVAS route and its upstream validates against JPL Horizons.

Do **not** fabricate values here. Add rows only when copied from a real, reproducible JPL
Horizons query (record the exact query so anyone can reproduce it).

## Fixture format (`jpl-horizons.sample.json`)

```jsonc
{
  "source": "JPL Horizons",
  "generatedFrom": "https://ssd.jpl.nasa.gov/horizons/ (record the exact API/app query)",
  "frame": "geocentric apparent, ecliptic-of-date, true equinox",
  "rows": [
    {
      "body": "Sun", // NATAL_BODIES member
      "queryEpochUTC": "2000-01-01T12:00:00Z",
      "jdTT": 0, // Terrestrial Time Julian Date used in the query
      "observer": "geocenter (500@399)",
      "eclipticLongitudeDeg": null, // TODO: fill from a real Horizons response
      "note": "TODO: paste the Horizons query + response reference",
    },
  ],
}
```

## When populated

Add a `western-jpl-golden.test.ts` that loads this fixture and asserts
`planetPlacement(body, ms)` matches `eclipticLongitudeDeg` within the documented tolerance,
turning the Western gate from wrapper-consistency into an independent accuracy check.
