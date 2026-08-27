# Accuracy Lab (development-only)

`evals/` is a reproducible development workspace for measuring engine/state and host-narration
stability. It is **not** part of either published Skill, not a user-data store, and not a daily
external-model CI dependency.

## P0-D boundary

The first two contracts are deliberately narrow:

- `conclusion-vector/v1` records only bounded, structured claim identifiers and their permitted
  conditions; it never stores visible prose or a free-form answer.
- `eval-run-manifest/v1` records a deterministic, local-only synthetic run and the artifact
  digests needed to reproduce it. `hostModel` is fixed to `none` in this P0 contract.

These contracts measure reproducibility and contract compliance. They do not measure whether a
traditional claim predicts real-world outcomes, and they do not activate any BaZi rule, source
profile, state CLI, public contract, or narration path.

## P0-E boundary

`shadow-state-integrity-manifest/v1` rebuilds one synthetic P0-B BaZi shadow state and records
its canonical SHA-256 digest. It also fixes the invalidation table: chart-affecting changes make
the four derived-structure nodes stale, while topic/lens and language/narrator changes leave that
already-confirmed structure reusable for a later projection. It neither persists a state nor
turns a digest into a privacy or security claim.

## P0-F boundary

`conclusion-vector-invalidation-matrix/v1` binds P0-D's structured conclusion vector to P0-E's
verified synthetic state digest. A chart-affecting invalidation makes both records stale;
topic/lens keeps the state but requires a new topic-scoped vector; language/narrator leaves both
structured records reusable. It records no narrative prose and does not represent a narrator,
host model, or user-visible output.

## P2-A boundary

`shadow-state-lifecycle-matrix/v1` is a development-only regression matrix that joins the
already-internal P1-A invalidation plan, P1-B structural comparison, and P1-C reuse decision.
It reprojects only the committed synthetic P0-E chart for eleven fixed transitions: no change;
each declared change cause; topic/lens and language/narrator projection refreshes; an observed
collector difference; an observed resolution difference; and a declared-plus-observed change.
The matrix records expected booleans, node ids, and field paths only — never a state value,
birth input, prose, model request, persistence key, cache entry, or runtime decision.

## P2-B boundary

`verification-mutation-matrix/v1` is a development-only fault-detection regression gate for the
existing P0-B, P0-E, P0-F, and P2-A verifiers. It applies twenty-five fixed, implementation-owned
synthetic mutations — not fixture-supplied paths or values — and requires the relevant verifier to
reject each one with the committed diagnostic code/path sequence. Baseline artifact digests are
checked before injection, so a changed fixture cannot silently redefine the experiment.

This gate shows that declared structural, linkage, invalidation, lifecycle, and privacy-field
faults are detected. It is not a metaphysical accuracy percentage, a fuzzing interface, a runtime
self-healing mechanism, or permission to activate a BaZi rule or source profile. Mutated values
and raw artifacts are never written to the catalog or emitted in diagnostics.

## Data and storage rules

- Fixtures must use a `synthetic:` fixture id. Do not put a real name, birth record, location,
  life event, prompt, model transcript, API key, raw answer, or reading draft in this directory.
- A SHA-256 digest is an integrity/reproducibility reference only. It is not anonymization and
  must not be presented as a privacy safeguard.
- External-host experiments, if separately authorized later, belong in development tooling and
  must keep credentials, real inputs, and raw transcripts outside Git and outside Skill bundles.
- Generated reports are not committed by default; any publishable aggregate requires separate
  human privacy review.

## Local contract check

Run the deterministic checker against the committed synthetic pair:

```bash
node tools/eval/verify-eval-manifest.ts \
  --manifest evals/fixtures/synthetic/p0d-eval-run-manifest.json \
  --vector evals/fixtures/synthetic/p0d-conclusion-vector.json
```

It checks contract versions, exact field shapes, fixture linkage, canonical artifact digest,
P0-D's local-only scope, and prohibited private/model fields. It never calls a model, network,
database, or Skill runtime.

The P0-E integrity check is likewise local-only and synthetic:

```bash
node tools/eval/verify-shadow-state-integrity.ts \
  --manifest evals/fixtures/synthetic/p0e-shadow-state-integrity-manifest.json \
  --chart evals/fixtures/synthetic/p0e-bazi-shadow-chart.json
```

The P0-F cross-contract check is also local-only and synthetic:

```bash
node tools/eval/verify-conclusion-vector-invalidation.ts \
  --matrix evals/fixtures/synthetic/p0f-conclusion-vector-invalidation-matrix.json \
  --state-manifest evals/fixtures/synthetic/p0e-shadow-state-integrity-manifest.json \
  --chart evals/fixtures/synthetic/p0e-bazi-shadow-chart.json \
  --vector evals/fixtures/synthetic/p0d-conclusion-vector.json \
  --run-manifest evals/fixtures/synthetic/p0d-eval-run-manifest.json
```

The P2-A lifecycle check is likewise local-only and synthetic:

```bash
node tools/eval/verify-shadow-state-lifecycle.ts \
  --matrix evals/fixtures/synthetic/p2a-shadow-state-lifecycle-matrix.json \
  --state-manifest evals/fixtures/synthetic/p0e-shadow-state-integrity-manifest.json \
  --chart evals/fixtures/synthetic/p0e-bazi-shadow-chart.json
```

It verifies the P0-E integrity linkage before executing the fixed P1-A/P1-B/P1-C transition
matrix. It is a regression harness, not a cache, scheduler, state store, CLI command, or
user-facing feature.

The P2-B mutation gate composes all of those existing checks without entering a runtime path:

```bash
node tools/eval/verify-verification-mutations.ts \
  --catalog evals/fixtures/synthetic/p2b-verification-mutation-matrix.json \
  --chart evals/fixtures/synthetic/p0e-bazi-shadow-chart.json \
  --state-manifest evals/fixtures/synthetic/p0e-shadow-state-integrity-manifest.json \
  --vector evals/fixtures/synthetic/p0d-conclusion-vector.json \
  --run-manifest evals/fixtures/synthetic/p0d-eval-run-manifest.json \
  --conclusion-matrix evals/fixtures/synthetic/p0f-conclusion-vector-invalidation-matrix.json \
  --lifecycle-matrix evals/fixtures/synthetic/p2a-shadow-state-lifecycle-matrix.json
```

Its pass count is the number of declared synthetic faults caught, not a claim about prediction,
interpretation quality, or real-world correctness.
