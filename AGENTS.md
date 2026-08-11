# AGENTS.md — loom-of-heaven

Guidance for coding agents (OpenAI Codex, and any host that reads `AGENTS.md`) working in this
repository. The user-facing capability is the **`xuan-ji-yu-heng`** Skill under
[`skills/xuan-ji-yu-heng/`](skills/xuan-ji-yu-heng/).

## What this project is

A **deterministic** four-system birth-chart engine — Western natal astrology, Four Pillars / BaZi
(四柱八字), Zi Wei Dou Shu (紫微斗数), and Vedic/Jyotish — packaged as a portable, offline Skill.
All astronomy, calendar, ganzhi, star-placement and time math is done by a bundled deterministic
CLI. **The model never computes a chart itself.**

## Golden rules (do not break)

- **Vedic boundary.** `calculate --systems all` and an omitted `settings.systems` both request all
  four shipped systems. The Vedic chart returns both node modes, with `vedic.nodes: 'mean'` as the
  owner-confirmed product default and explicit `'true'` selection available. It suppresses
  time-of-day values with `VEDIC_TIME_REQUIRED` when the birth time is unknown. Its
  high-precision wording is limited to the recorded Swiss-only external numeric-reference fixture;
  Swiss never runs in the bundle or runtime.

- **Never** compute or guess planet positions, houses, aspects, solar terms, 干支, 十神, 起运,
  星曜 or 四化 yourself. If the CLI does not return a value, say so — never backfill.
- **Offline only.** No network calls, AI model-provider SDKs, or prompt modules in the calculation
  core (enforced by `pnpm run lint`).
- **No fabricated verdicts.** Interpretation is source-cited. Preserve every warning for audit;
  in a topic reading, state only the practical effect that materially changes the answer, in
  natural language — never a raw warning code or a warning panel.
- **De-identified.** Never write a real name, birth time, or location into logs, fixtures, or git.

## How to run the Skill (the only supported entry point)

The single stable CLI is `skills/xuan-ji-yu-heng/scripts/loom-chart.mjs`. Pass arguments as
an array and JSON via files — never build a shell string from user text.

```bash
cd skills/xuan-ji-yu-heng
node scripts/loom-chart.mjs doctor
node scripts/loom-chart.mjs normalize  --input-file birth-input.json --output-file normalized.json
node scripts/loom-chart.mjs calculate  --input-file birth-input.json --systems all --output-file chart.json
node scripts/loom-chart.mjs compare    --input-file birth-input.json --profiles default,apparent-solar --output-file comparison.json
node scripts/loom-chart.mjs horoscope  --input-file birth-input.json --at 2026-05-20T14:00 --output-file horoscope.json
node scripts/loom-chart.mjs interpret  --input-file birth-input.json --at 2026-05-20T14:00 --output-file interpretation.json
# render is disabled (temporary): returns a stable notice + exit 3 — use calculate/interpret JSON instead.
node scripts/loom-chart.mjs verify
```

Requires a Node runtime (>=22). The published Skill folder is self-contained: it ships
`scripts/dist/engine.mjs`, needs no `npm install`, and runs offline. Full workflow and input rules
live in [`skills/xuan-ji-yu-heng/SKILL.md`](skills/xuan-ji-yu-heng/SKILL.md) and
`skills/xuan-ji-yu-heng/references/`.

## Working on the engine (development)

This is a pnpm monorepo (`packages/*`) that builds the Skill's bundle.

```bash
pnpm install          # dev only
pnpm run verify:cloud # CI-safe gate (no private incident tokens)
pnpm run verify:all   # controlled local full gate; scan:incident fails closed without its token file
pnpm run build        # rebuild scripts/dist/engine.mjs + sbom.cdx.json (commit the result)
```

`verify:cloud` runs the reproducible, non-sensitive stages: `format:check → lint → typecheck → test
→ build → validate:provenance → validate:skill → validate:reading → validate:docs → smoke →
forward:test → package:hosts → verify:hosts → verify:install → check:doc-counts → scan:deps →
scan:licenses → validate:sbom → scan:secrets`. `verify:all` then adds `scan:incident`; its precise token file is ignored, must never
enter CI, and its absence is intentionally fail-closed. If you change the test count, update
`docs/STATUS.md` and `docs/VALIDATION.md` from a real run (never by hand).

Release acceptance criteria live in [`docs/RELEASE_CHECKLIST.md`](docs/RELEASE_CHECKLIST.md).

## Scope & disclaimer

For traditional-culture, entertainment and self-reflection use. Not scientifically validated
prediction. Never give deterministic medical, legal, financial, or life-and-death advice.

## Natural narrative delivery (V1)

The default topic answer is continuous, specific prose, not a seven-step report. A professional
term may appear when its rule mechanism and concrete implication are adjacent. Before writing a
paragraph, retain its fact evidence, reason, ruleset and relevant caveat internally; the default
body never prints source ids, rule paths, provenance, warning headings, a fixed disclaimer footer
or an automatic follow-up menu. Technical detail is shown only when the user asks for it. The
authoritative delivery contract is [`docs/NARRATIVE_OUTPUT_V1.md`](docs/NARRATIVE_OUTPUT_V1.md).
