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

## P2-C boundary

`verification-coverage-matrix/v1` is a development-only, synthetic-only coverage/gap traceability
matrix for the existing P0/P1/P2 eval verifiers. For eight fixed risk layers it records the real
verifier exports, positive test titles, and negative or mutation bindings that defend each risk,
deriving every coverage status from implementer-owned risk specs plus static bindings resolved in
the actual TypeScript sources. The fixture cannot self-report `covered`: it must match the fixed
specs item by item, in order, field by field, and a renamed export or test title fails closed with
`BINDING` until the matrix is updated alongside the code.

It re-runs the P2-B mutation gate against the committed baseline artifacts before accepting any
coverage claim, and binds the P2-B catalog by its real canonical digest. The matrix deliberately
records what is covered and what is not: six layers are `covered` and two are `partially-covered`
(`p0d-contract-no-dedicated-mutation`, `collector-algorithm-mutation-not-covered`). Gap rows carry
only implementer-owned stable gap ids from the verifier's gap registry — never free-text prose.

This matrix is not a metaphysical accuracy percentage, accuracy score, or prediction measurement;
it proves nothing about divination, interpretation quality, or real-world correctness. It activates
no BaZi rule or source profile and adds no runtime, Skill, CLI, cache, or persistence surface.

The coverage check is local-only and composes the committed synthetic artifact set:

```bash
node tools/eval/verify-verification-coverage.ts \
  --matrix evals/fixtures/synthetic/p2c-verification-coverage-matrix.json \
  --catalog evals/fixtures/synthetic/p2b-verification-mutation-matrix.json \
  --chart evals/fixtures/synthetic/p0e-bazi-shadow-chart.json \
  --state-manifest evals/fixtures/synthetic/p0e-shadow-state-integrity-manifest.json \
  --vector evals/fixtures/synthetic/p0d-conclusion-vector.json \
  --run-manifest evals/fixtures/synthetic/p0d-eval-run-manifest.json \
  --conclusion-matrix evals/fixtures/synthetic/p0f-conclusion-vector-invalidation-matrix.json \
  --lifecycle-matrix evals/fixtures/synthetic/p2a-shadow-state-lifecycle-matrix.json
```

Its counts are traceability counts (risk rows verified 8/8, declared synthetic faults caught
25/25), not accuracy figures. The CLI accepts only these committed synthetic fixture paths; any
other value is rejected.

## IQ-0A boundary

`answer-quality-rubric/v1` (with the `answer-quality-case/v1` and
`sealed-holdout-manifest/v1` contracts) belongs to the **Answer Faithfulness &
Quality Lab** — a different evidence program from the Reliability Lab sections
above (P0–P2). It freezes the IQ-0 measuring stick before any case exists: eight
ordered evaluation dimensions, ten ordered failure modes, four independent
judgments (`meets` / `needs-review` / `does-not-meet` / `not-applicable`, never
summed or averaged), the deterministic-assisted versus human-required boundary,
and the sealed-holdout metadata-only lifecycle with retire-and-replace. The
committed rubric is checked by `tools/eval/verify-answer-quality-foundation.ts`
against implementer-owned frozen specs — fixture self-reporting is impossible.

These contracts cannot prove that any answer is semantically correct, natural
or useful; deterministic checks cover structure and boundaries only, and
semantic quality judgment is reserved for documented human review. No sealed
holdout content, no case corpus, no legacy answers and no runtime surface are
part of IQ-0A. See [docs/ANSWER_QUALITY_EVALUATION.md](../docs/ANSWER_QUALITY_EVALUATION.md).

## Data and storage rules

- Fixtures must use a `synthetic:` fixture id. Do not put a real name, birth record, location,
  life event, prompt, model transcript, API key, raw answer, or reading draft in this directory.
- **Raw answer** means a raw model/provider response, an unredacted draft, a full session
  transcript, or any output carrying internal metadata (token logs, provider details,
  chain-of-thought). Raw answers are forbidden everywhere in the repository.
- **Sanitized visible answer**: the final, de-identified user-visible text of one answer,
  wrapped in `answer-quality-visible-artifact/v1`, may be stored under
  `evals/corpus/public/career/` once IQ-0B creates cases. No corpus instances exist yet.
  This allowance does NOT extend to prompts, model reasoning, token logs, provider metadata
  or raw transcripts.
- A structured review uses only a randomly assigned `reviewer:anon:<16-hex>` pseudonym;
  it must never contain a name, email, account id, birth data or a hash of personal data.
  A reconciliation record structurally cites two distinct review ids, while the future IQ-0B
  corpus verifier must resolve those references and verify their independence and linkage.
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
