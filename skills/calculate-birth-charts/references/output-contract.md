# Output contract — `NormalizedBirthData`, `ChartBundle`, warnings & errors

## `normalize` output

```jsonc
{
  "ok": true,
  "normalized": {
    "schemaVersion": "0.1.0",
    "calendar": "gregorian",
    "timeAccuracy": "exact",
    "timeKnown": true,
    "localDate": "1990-03-10",
    "localTime": "08:15:00",
    "localCivilIso": "1990-03-10T08:15:00+08:00", // wall time + explicit offset
    "timezone": "Asia/Shanghai",
    "timezoneOffsetMinutes": 480, // east positive (ISO)
    "utcInstant": "1990-03-10T00:15:00Z",
    "utcInstantMs": 637028100000, // a number, never a Date
    "ambiguity": { "status": "unambiguous", "candidateCount": 1 },
    "location": { "latitude": 30.5, "longitude": 114.3, "source": "user" },
    "solar": {
      "meanSolarTimeIso": "1990-03-10T07:52:12", // longitude-driven wall clock (no zone)
      "apparentSolarTimeIso": "1990-03-10T07:42:12",
      "longitudeOffsetMinutes": 457.2, // longitude * 4
      "equationOfTimeMinutes": -10.0,
      "method": "noaa-eot@0.1.0",
    },
    "tzdb": { "source": "moment-timezone", "version": "2026c" },
  },
  "warnings": [/* EngineWarning[] */],
}
```

`ambiguity.status` is one of `unambiguous`, `ambiguous-resolved`, or
`not-applicable-unknown-time`. `solar` is `null` when the birth time is unknown.

## `calculate` output — `ChartBundle`

```jsonc
{
  "ok": true,
  "bundle": {
    "schemaVersion": "0.1.0",
    "engineVersion": "0.1.0",
    "requestId": "req_2d4063bfbba9ed69", // deterministic hash of canonical input + versions
    "calculatedAt": "2026-01-01T00:00:00.000Z",
    "originalInput": {/* the parsed BirthInput, defaults applied */},
    "normalizedTime": {
      "localCivil": "1990-03-10T08:15:00+08:00",
      "timezone": "Asia/Shanghai",
      "utcInstant": "1990-03-10T00:15:00Z",
      "meanSolarTime": "1990-03-10T07:52:12",
      "apparentSolarTime": "1990-03-10T07:42:12",
      "timezoneDataVersion": "2026c",
      "ambiguityResolution": "unambiguous",
    },
    "western": undefined, // present only once the Phase 2 provider ships
    "bazi": undefined,
    "ziwei": undefined,
    "warnings": [/* EngineWarning[] */],
    "provenance": {
      "engine": { "name": "ming-engine", "version": "0.1.0", "schemaVersion": "0.1.0" },
      "tzdb": { "source": "moment-timezone", "version": "2026c" },
      "providers": [], // only what actually ran is listed
      "rulesets": [],
    },
  },
}
```

The per-system domain shapes (planets/houses/aspects, four pillars, twelve palaces) each keep
their own schema; they are not flattened into one abstraction.

## New per-system fields (this version)

- **BaZi pillars** include `tenGodDisplay`, a never-blank label string: the day column reads
  `日主(日元)`, every other column its ten-god name. `tenGod` stays `null` on the day pillar for
  backward compatibility — display `tenGodDisplay`.
- **Western planets** carry `precision` (`high` for the ten astronomy-engine (VSOP87+NOVAS) main bodies; `approximate` for the
  true node and asteroids) and an optional `source`. `Chiron`/`Ceres`/`Pallas`/`Juno`/`Vesta`
  appear when `asteroids` is on. The chart result adds `ayanamsha` (model name or `null`) and
  `ayanamshaDegrees` when the sidereal zodiac is used.

## `interpret` output

```jsonc
{
  "ok": true,
  "interpretation": {
    "subject": {/* de-identified: no name, no free-text location, no life events */},
    "facts": [
      {
        "topic": "marriage", // character|career|wealth|marriage|studies|health|general
        "claim": "配偶星（正财）见于命局",
        "evidence": [{ "kind": "bazi", "ref": "...", "note": "..." }],
        "polarity": "吉", // optional: 吉 | 凶 | 中性 (only on 吉凶 facts)
        "reason": "身强、财星有根 → ...", // optional cause chain
        "caveat": "...",
      },
    ],
    "followupOffers": ["事业...", "感情...", "财运...", "学业...", "本年/流年..."],
    "disclaimers": ["...非科学预测...", "..."],
  },
  "warnings": [/* EngineWarning[] */],
}
```

## `render` is temporarily disabled

`render` no longer produces a report. It prints `{ "ok": false, "disabled": true, "command":
"render", ... }` and exits with code **3** (a command-specific disabled signal, not an
EngineError envelope). Use the `calculate` / `interpret` JSON instead. See
`docs/adr/0005-fortune-sidereal-render-pause.md`.

## `EngineWarning`

```jsonc
{
  "code": "SOLAR_TIME_APPROXIMATE",
  "severity": "info",
  "system": "time",
  "message": "...",
  "detail": {},
}
```

Codes: `TIME_ACCURACY_APPROXIMATE`, `TIME_UNKNOWN`, `DST_AMBIGUOUS_RESOLVED`,
`SOLAR_TIME_APPROXIMATE`, `SYSTEM_NOT_YET_IMPLEMENTED`, `NEAR_BOUNDARY`,
`HIGH_LATITUDE_HOUSE_RISK`, `VEDIC_SUNRISE_UNAVAILABLE`,
`VEDIC_DASHA_YEAR_UNSUPPORTED`, `VEDIC_TIME_REQUIRED`. `system` is one of
`time | western | bazi | ziwei | vedic | engine`.

## Vedic / Jyotish `ChartBundle.vedic`

When Vedic is requested, `bundle.vedic` records `rulesetId`, the MIT `caelus` provider, Lahiri
IAE-1985 (`SE_SIDM_LAHIRI` reference mode), seven grahas, and **both** `nodes.mean` and
`nodes.true`. Ketu is exactly opposite the corresponding Rahu. `lagnaLongitudeDeg`, `derived`
and time-of-day classifications are nullable: for `timeAccuracy: "unknown"`, the engine emits
`VEDIC_TIME_REQUIRED`, returns only `unknownTimeStable` values that remain stable all local day,
and never treats the noon normalization anchor as a natal time.

`precision: "high"` means only that covered fields satisfy the recorded Swiss-only external
numeric-reference fixture at <=1 arc-minute. It does not make a general accuracy claim and Swiss
Ephemeris is not a runtime, bundle or CI dependency. `vedic.nodes` is optional input: both node
modes remain in output until an owner confirms a product default.

## Error envelope and exit codes

On failure the CLI prints `{ "ok": false, "error": { "code", "message", "detail" } }` and
exits with a stable code:

| code                           | exit | meaning                                         |
| ------------------------------ | ---- | ----------------------------------------------- |
| `INTERNAL_ERROR`               | 1    | unexpected failure                              |
| `INPUT_VALIDATION_FAILED`      | 2    | input did not match the schema                  |
| `AMBIGUOUS_LOCAL_TIME`         | 3    | DST fall-back; needs `dstDisambiguation`        |
| `NONEXISTENT_LOCAL_TIME`       | 4    | DST spring-forward gap                          |
| `DATE_OUT_OF_RANGE`            | 5    | year outside 1901–2100                          |
| `MISSING_COORDINATES`          | 6    | required coordinates absent                     |
| `UNKNOWN_TIMEZONE`             | 7    | not a valid IANA zone                           |
| `HOUSE_SYSTEM_UNAVAILABLE`     | 8    | house system unusable at this latitude          |
| `PROVIDER_FAILED`              | 9    | a chart provider failed                         |
| `RULESET_UNSUPPORTED`          | 10   | unknown/unsupported ruleset                     |
| `LUNAR_CONVERSION_UNAVAILABLE` | 11   | lunar input needs the Phase 2 calendar provider |
