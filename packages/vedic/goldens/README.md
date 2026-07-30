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
