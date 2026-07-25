# 0011 — Channel B writing isolation and the reading-lint term firewall

- Status: Accepted
- Date: 2026-07-22
- Supersedes/extends: 0010 (output-narration spec) — output layer only.

## Context

Round 7 moved 命理 terms into a "专业依据" section by instruction, but blind tests still leaked
terms (食伤生财 / 官禄宫天府 / 官杀藏而不透 / 甲戌大运 / 喜用五行) and consultant jargon into the
user-visible sections 1-5 (especially 30秒看懂). Prompt-only rules and more examples were not
enough: there was no deterministic check on the ACTUAL produced report, and the example libraries'
局部改写 still modelled term-laden ✅ lines. This is an output-layer problem only — the排盘 /
facts / reason / evidence / schema / 命理 judgements are frozen.

## Decision

- **A. Three-stage Channel B writing (SKILL.md).** (1) pick topic facts internally (terms allowed,
  never shown); (2) build an internal plain middle layer per fact
  (plainResult/behavior/scenario/upside/risk/action + sourceRefs) — no schema change, not written
  back to `interpretation.json`; (3) write — sections 1-5 + the follow-up use ONLY the plain layer;
  raw claim/reason, 干支, 十神, 星曜, 宫位 names go ONLY in section 6 "专业依据". No claim smuggled
  into core conclusions, no parenthetical term smuggling; 干支 combos move to section 6, years stay.

- **B. `reading-lint` term firewall (packages/interpret/src/reading-lint.ts).** A pure, dependency-
  free `lintReading(md, {channel, simple})` — bundled into `engine.mjs` and exposed as
  `ming-chart.mjs lint-reading --input-file draft.md --channel topic [--simple]`. It parses the
  7-step report, EXEMPTS 专业依据 + 信息可靠性与声明, and checks sections 1-5 + the follow-up
  (including parentheticals and the first-200-char strict zone). Tiered severity (user-confirmed):
  命理 terms + strong jargon are `error`; soft jargon is `warn` in sections 2-5 but `error` in the
  30秒看懂 / first-200-char zone (or with `--simple`). Output:
  `{ ok, violations:[{section, term, category, severity, line, replacementHint}] }`, exit non-zero
  on any `error`. `channel:'full'` (Channel A) passes everything. The checker points out problems;
  the host rewrites (no mechanical deletion).

- **C. lint workflow.** Draft → lint-reading → rewrite by violations (≤2 retries) → deliver only on
  `ok:true`; otherwise use a shorter/simpler plain version (`--simple`) — never deliver a failing draft.

- **D. Example libraries.** Every 局部改写 ✅ is split into `✅ 用户可见表达` (term-free) and
  `🔎 专业依据` (terms + ref); self-check lists gained three items. `tools/validate-reading-examples.ts`
  reuses the same `lintReading` (single source of truth) to prove the example 正文 is term-free.

## Consequences

- The static gate (`validate:reading` 53/53) and the shipped `lint-reading` prove the spec, example
  structure, and can lint a real draft; they do NOT guarantee a host model never emits a term — that
  limitation is retained (docs/VALIDATION.md). `--simple` mode escalates all jargon to hard errors.
- New unit tests (`packages/interpret/test/reading-lint.test.ts`) cover the real failing fragments,
  the section/severity tiers, and Channel A pass-through.
- No change to排盘 algorithms, calendar/time, 大运/流年/星曜/宫位/相位, facts (claim/reason/evidence/
  ref/ruleId), schema/ruleset/provenance, warnings, or合婚 computation.
