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
