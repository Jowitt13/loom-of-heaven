# ADR 0002: Bundled, version-pinned TZDB via moment-timezone

- Status: Accepted
- Date: 2026-07-21

## Context

Time is the highest-risk input (handoff §4). The engine must convert local civil time to a
single UTC instant using **historical** IANA rules, detect ambiguous (fall-back) and
non-existent (spring-forward) local times, and record the exact time-zone data version so a
result is reproducible on any machine and in a browser — not dependent on each host's system
ICU/tzdata.

## Options considered

- **Luxon / `@date-fns/tz` / Temporal polyfill** — ergonomic, but resolve zones through the
  runtime `Intl`/ICU database. The tz data version is the host's, varies between machines, and
  is not recordable. Rejected for the version-pinning requirement.
- **`@tubular/time`** — bundles tz data and handles ambiguity natively; viable but less
  battle-tested and heavier API surface than needed.
- **moment-timezone (MIT)** — ships its own packed IANA data with a recorded release id
  (`moment.tz.dataVersion`, currently `2026c`) and exposes historical offsets via
  `zone.utcOffset(instant)`. Mature and stable.

## Decision

Use **moment-timezone**. It is the single choke point (`packages/time-location/tzdb.ts`); the
rest of the engine never imports it directly. Local→UTC is solved by a lookup+verify
disambiguation (`disambiguate.ts`): sample offsets around the reading, keep only round-trip
consistent instants, and report 0 (non-existent), 1 (unambiguous) or 2 (ambiguous) candidates.
The data version is recorded in every result's `provenance.tzdb.version`.

## Consequences

- The engine bundle inlines the full tz data (~1.4 MiB total bundle) — acceptable for a Skill,
  and it makes the Skill fully offline and reproducible.
- moment is in maintenance mode, but its tz **data** is still updated and its behavior is
  stable — desirable for a determinism-focused engine. Only whole-minute offset precision is
  available for pre-standard-time (LMT) eras; documented as a limitation.
- Solar time is computed separately (longitude + NOAA equation of time) and never conflated
  with the civil zone.
