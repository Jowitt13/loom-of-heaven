# Input contract — `BirthInput`

The CLI accepts a single JSON object. Unknown top-level keys are rejected. JavaScript
`Date` is never used; wall time is date + time strings plus an IANA zone.

> 合成示例：以下人物、日期、时间与地点均为虚构测试数据，不对应真实个人。

```jsonc
{
  "calendar": "gregorian", // "gregorian" | "lunar" (lunar needs Phase 2 provider)
  "localDate": "1990-06-15", // YYYY-MM-DD (required)
  "localTime": "14:30:00", // HH:mm or HH:mm:ss (required unless timeAccuracy = "unknown")
  "timeAccuracy": "exact", // "exact" | "approximate" | "unknown"
  "timezone": "Asia/Shanghai", // IANA zone id (NOT "UTC+8"); validated against the bundled TZDB
  "location": {
    "displayName": "optional label",
    "latitude": 31.23, // -90..90 (WGS84)
    "longitude": 121.47, // -180..180 (east positive)
    "elevationMeters": 4, // optional
    "source": "user", // "user" | "geocoder" | "import"
  },
  "lunarLeapMonth": false, // optional; only meaningful for lunar input
  "ruleGender": "unspecified", // "male" | "female" | "unspecified" (only where a rule needs it)
  "dstDisambiguation": "earlier", // "earlier" | "later"; required only when the local time is ambiguous
  "settings": {
    "systems": ["western", "bazi", "ziwei", "vedic"],
    "western": {
      "rulesetId": "western-tropical-placidus@0.1.0",
      "zodiac": "tropical", // "tropical" | "sidereal"
      "ayanamsha": "lahiri", // "lahiri" | "fagan-bradley" (only applied when zodiac = "sidereal")
      "houseSystem": "placidus", // placidus | whole-sign | equal | koch | porphyry
      "nodes": "true", // "true" | "mean"
      "asteroids": true, // include Chiron/Ceres/Pallas/Juno/Vesta (approximate precision)
    },
    "bazi": {
      "rulesetId": "bazi-standard@0.1.0",
      "solarTimeMode": "civil", // "civil" | "mean" | "apparent" (never applied to Western)
      "dayBoundary": "zi-hour", // "midnight" | "zi-hour"
      "earlyLateZi": "late", // "early" | "late"
    },
    "ziwei": {
      "rulesetId": "iztro-default@0.1.0",
      "useApparentSolarTime": false,
    },
    "vedic": {
      "rulesetId": "vedic-parashara-lahiri@0.1.0",
      "nodes": "mean", // optional explicit school selection: "mean" | "true"; no product default
      "dashaYear": "julian-365.25",
    },
  },
}
```

## Field rules

- `localTime` is required unless `timeAccuracy` is `"unknown"`. When unknown, the date is
  anchored to 12:00 local and time-of-day results are suppressed.
- `timezone` must be a real IANA id (e.g. `Asia/Shanghai`, `America/New_York`). Fixed
  offsets like `UTC+8` are rejected — historical DST cannot be derived from them.
- If the local time is ambiguous under historical DST (an "autumn fall-back" hour that
  occurs twice), `dstDisambiguation` (`earlier` | `later`) is required; otherwise the CLI
  returns `AMBIGUOUS_LOCAL_TIME`.
- A local time that does not exist (a "spring-forward" gap) returns `NONEXISTENT_LOCAL_TIME`.
- Supported year range in this version is 1901–2100; outside it returns `DATE_OUT_OF_RANGE`.
- `settings` and every sub-object may be omitted; documented defaults are applied and echoed
  back in `originalInput`.
- `vedic.nodes` is deliberately optional. The Vedic chart always reports both `nodes.mean` and
  `nodes.true`; omit the setting unless the caller has explicitly selected a node school. The raw
  no-settings default remains Western/BaZi/Zi Wei for compatibility; use `--systems all` to ask
  for the complete four-system technical chart.

## Minimal example

> 合成示例：以下人物、日期、时间与地点均为虚构测试数据，不对应真实个人。

```json
{
  "calendar": "gregorian",
  "localDate": "1990-03-10",
  "localTime": "08:15:00",
  "timeAccuracy": "exact",
  "timezone": "Asia/Shanghai",
  "location": { "latitude": 30.5, "longitude": 114.3, "source": "user" }
}
```
