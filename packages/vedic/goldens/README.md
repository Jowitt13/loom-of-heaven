# Vedic P2 independent Swiss golden

`swiss-vedic-mode1.json` is the tracked, offline reference fixture for the
future Vedic P2 provider. Every row is a **synthetic technical sample**, never
a person's birth data.

## Reference boundary

- Capture uses a local, external `swetest` binary with `-sid1 -utc -emos`.
- `-sid1` is Swiss `SE_SIDM_LAHIRI` (mode 1), the ADR 0013 Lahiri definition.
- The Swiss binary, source, ephemeris files and raw stdout/stderr never enter
  the repository, lockfile, SBOM, bundle, CI or release assets.
- The fixture records the binary SHA-256, version line and the SHA-256 of the
  untracked raw `manifest.json`; each manifest records exact argv plus separate
  stdout/stderr hashes for every call.

The tracked fixture contains only reviewed values and provenance hashes.

## Capture and review workflow

```powershell
$env:SWETEST_PATH = "$env:TEMP\ming-p2-swetest\swetest.exe"
node --experimental-strip-types tools/generate-vedic-golden.ts
```

The generator writes only `.tmp/vedic-golden-raw/`, atomically after all calls
parse. It fails on any spawn error, non-zero exit, error-looking stderr,
unexpected output, malformed number, incomplete raw hash, or boundary pair
that does not actually straddle its declared classification edge.

Review `manifest.json` and `draft-fixture.json` there before transcribing the
draft into this directory. The tracked fixture is accepted only with at least
100 cases, mode-1/UTC/Moshier provenance, grahas, both Rahu modes, exact Ketu
opposition and sidereal Lagna. The later provider-comparison suite is the hard
≤1′ acceptance gate; this fixture gate never makes an accuracy claim on its
own.

## Coverage

The initial capture has 84 multi-decade, hemisphere and IANA-zone coverage
samples plus 16 one-minute-before/after synthetic boundary probes. The probes
cover rashi, nakshatra/dasha-lord, pada/D9 and tithi boundaries. They make
classification regressions observable without treating a model-generated chart
as a reference.

## P3B sunrise mapping fixture

`swiss-vedic-sunrise.json` is a second, narrowly scoped offline fixture. It
contains 16 synthetic locations and instants captured with external swetest
2.10.03 using `-rise -emos`; no `-norefrac`, `-disccenter`, or `-discbottom`
override is present, so the reference is the tool's documented upper-limb,
standard-refraction behavior. The raw capture manifest remains under ignored
`.tmp/vedic-sunrise-golden-raw/`; the tracked fixture records only reviewed
timestamps and provenance hashes.

The P3B test compares astronomy-engine `SearchRiseSet` to each timestamp with
a 10-second limit. The reviewed maximum is 5.457 seconds. This validates the
selected v1 sunrise backend mapping; it is not a bundled Swiss dependency and
does not claim equivalence with every historical disc-center convention.

## P3B Vimshottari reference fixture

`ndastro-vimshottari-julian-36525.json` records 12 synthetic same-model
Vimshottari checks against NDAstro 0.28.1. The reference wheel and fixed source
tag were audited as MIT and source-bound byte-for-byte; it uses Skyfield/JPL,
not Swiss, and is external-only. Its raw output is retained only in ignored
`.tmp/vedic-dasha-reference-raw/` with hashes for the wheel, source archive,
DE440T file, runner, input and streams.

The tracked fixture contains selected Maha/Antar checkpoints and the 120-year
cycle endpoint. It uses `julian-365.25` on both sides. The observed maximum is
16.610 seconds and the 30-second test allowance is solely for the project's
six-decimal canonical Moon-longitude input bridge. It is a dasha-arithmetic
cross-check, not an independent P2 graha/node/Lagna precision claim.
