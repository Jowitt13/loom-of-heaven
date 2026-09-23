# STATUS

> Updated: 2026-07-26 路 Phase W5 (鍚夊嚩 facts + sidereal/true-node/asteroids + 瑙ｈ椋庢牸锛孒TML/SVG 鎶ュ憡鏆傚仠) complete 锟?**expansion roadmap W1鈥揥5 done** 路 engine `0.1.0` / schema `0.1.0`

## Where the project lives

The public home is the sanitized repository `github.com/Jowitt13/loom-of-heaven` (after a PII
incident the public history was rewritten and republished; see
[INCIDENT_PII_REMEDIATION.md](./INCIDENT_PII_REMEDIATION.md)). The original handoff document is
kept at the repository root as `QODER_HANDOFF.md` for continuity. Pre-incident workspaces are
retired and must never be pushed from or copied from.

## Done

### Phase 0 锟?design freeze & risk verification

- pnpm monorepo scaffolded: `packages/{contracts,time-location,orchestrator,test-fixtures}`,
  `tools/`, `skills/xuan-ji-yu-heng/`, `docs/`.
- Dependency versions/licenses verified against the live npm registry (see `docs/LICENSE_AUDIT.md`).
- ADRs 0001锟?004 (skill-first, TZDB, providers, toolchain). Docs: PRODUCT_SPEC, ARCHITECTURE,
  RULESETS, VALIDATION, LICENSE_AUDIT, PRIVACY, WORKBUDDY.
- Versioned contracts (`BirthInput`, `NormalizedBirthData`, `ChartBundle`, warnings/errors/
  provenance) with canonical JSON + deterministic id.
- TZDB decision fixed via ADR: bundled, version-pinned moment-timezone (`dataVersion 2026c`).
- Packaged Skill skeleton: minimal `SKILL.md` (frontmatter = name + description only),
  `agents/openai.yaml`, single CLI, references, report template, LICENSE, notices, SBOM.
- `tools/validate-skill.ts` passes.

### Phase 1 锟?time, location & public contract

- `packages/time-location`: TZDB wrapper, DST disambiguation (ambiguous 锟?`AMBIGUOUS_LOCAL_TIME`,
  non-existent 锟?`NONEXISTENT_LOCAL_TIME`), UTC instant, mean/apparent solar time (NOAA EoT),
  full normalize + time-layer warnings + public projection.
- CLI verbs implemented: `doctor`, `normalize`, `calculate`, `compare`, `interpret`, `verify`.
  (`render` is temporarily disabled 锟?returns a stable notice + exit 3; see ADR 0005.)
- No JavaScript `Date` in public contracts; ISO strings + explicit instant. No hardcoded
  UTC+8/120掳E 锟?historical DST honored (e.g. Shanghai 1988 summer 锟?UTC+9).
- 36 sourced boundary fixtures (锟?0 required) + unit/property tests.
- SKILL.md, agents/openai.yaml, references, assets, LICENSE, THIRD_PARTY_NOTICES, SBOM.

### Phase 2 锟?BaZi, Zi Wei & lunar conversion

- `packages/bazi` (tyme4ts 1.5.2, MIT): Four Pillars, hidden stems, ten gods, na yin, zodiac,
  luck cycle (澶ц繍/璧疯繍). Lunar鈫扜regorian conversion with leap-month support.
- `packages/ziwei` (iztro 2.5.8, MIT): natal twelve palaces, stars with brightness and
  鍥涘寲, major limits (澶ч檺), 鍛戒富/韬富, five-elements class.
- Both providers hidden behind typed adapters; public contracts never expose third-party types.
- Provider provenance and ruleset references flow into every `ChartBundle` automatically.
- HTML report: BaZi four-pillar table with hidden stems, ten gods, na yin; Zi Wei twelve-palace
  table with star placements and decadal (澶ч檺) ranges. Only Western remains "pending" in the UI.
- Western provider evaluated and **rejected at the ADR 0003 gate**: celestine 0.2.1 agrees with
  the wrapper-consistency cross-check (astronomy-engine, VSOP87 + NOVAS) to 锟?锟?for Sun鈥揘eptune but deviates up
  to ~17锟?(Mercury) and ~37锟?(Pluto). Reproducible regression in
  `packages/western/test/precision-regression.test.ts` (2 `it.fails` encode the gate).
- Current state: **2 of 3 systems computed** (BaZi + Zi Wei + lunar; Western gated by ADR 0003).

### Phase 3 锟?installable Skill & self-contained CLI

- Forward-test harness `tools/forward-test.ts`: copies ONLY the published Skill into an OS temp
  dir outside the repo (no `packages/`, no `node_modules`, zero `npm install`, fully offline) and
  walks the SKILL.md workflow for **5 realistic requests** (锟?the 3 the Phase 3 bar requires).
- All six subcommands proven in the clean dir 锟?`doctor`, `normalize`, `calculate`, `compare`,
  `render`, `verify`; `normalize` and `compare` are newly covered beyond the clean-dir smoke.
- Degradation paths proven honest (nothing fabricated):
  - unknown time 锟?`TIME_UNKNOWN`; Zi Wei omitted + `ZIWEI_INPUT_REQUIRED`; BaZi hour pillar and
    luck cycle `null` while year/month/day pillars remain;
  - approximate time 锟?`TIME_ACCURACY_APPROXIMATE`, charts still computed;
  - lunar input 锟?`LUNAR_CONVERTED` (lunar 1990-01-01 锟?Gregorian 1990-01-27), charts computed.
- Western is integrated via astronomy-engine and computes all supported systems; unsupported or invalid inputs return structured errors or warnings 鈥?results are never fabricated.
- Byte-identical canonical JSON between the source CLI and the isolated Skill reaffirmed.
- `pnpm run forward:test` wired into `verify:all` as an enforced gate (runs after `smoke`).

### Phase 4 锟?HTML/SVG report, install package & de-identified example

- Standalone SVG report: `render --format svg` (engine `renderSvgReport`) emits a self-contained
  SVG summary card 锟?no script, no external resource (only the XML namespace URI), every value
  escaped; it carries normalized time, BaZi four pillars + luck cycle, Zi Wei twelve palaces,
  warnings, provenance and the disclaimer. This is the handoff 搂7.2 fallback for hosts that cannot
  preview full HTML. Acceptance tests in `packages/orchestrator/test/render.test.ts`.
- Install package: `tools/package-skill.ts` (`pnpm run package`) stages a clean Skill copy into
  `dist/`, writes a SHA-256 manifest and a dependency-free ZIP (CRC32 + DEFLATE, fixed timestamp for
  byte-reproducibility), then re-parses and fully decompresses every entry to self-verify the
  archive round-trips. Also extractable by standard tools (verified with `Expand-Archive`).
- De-identified end-to-end example: `tools/gen-example.ts` (`pnpm run example`) runs the published
  bundle from a fictional birth record and writes
  `examples/{birth-input.json,chart.json,interpretation.json,synastry.json}` 鈥?deterministic and
  safe to commit. The HTML/SVG renderer remains paused and writes no example artifacts.
- Privacy remediation + guard: removed stray real-looking birth data (`scripts/birth-input.json`,
  `scripts/chart.json`, `.tmp/`) from the Skill source, and added a `validate:skill` check that
  `scripts/` holds only `loom-chart.mjs`, `fixtures/`, `dist/` (handoff 搂10); the enforced check
  count lives in the "Commands & results" table below.
- Remaining Phase 4 step: **live WorkBuddy upload/enable/trigger acceptance on a real device**
  (checklist in `docs/WORKBUDDY.md`); it cannot be exercised from the dev workspace.

### Phase W1 锟?Western astrology (astronomy-engine provider)

- Western natal chart implemented on **astronomy-engine 2.1.19 (MIT, VSOP87 + NOVAS)**: Sun鈥揚luto plus
  the mean lunar nodes, with houses (placidus/whole-sign/equal/koch/porphyry), ascendant/MC,
  aspects, retrogrades and essential dignities. A real `WesternChartResult` schema
  (`packages/contracts/src/western.ts`) replaces the placeholder; the provider hides
  astronomy-engine types behind the contract.
- **ADR 0003 gate now PASSES for all ten bodies** including Mercury and Pluto 锟?the 2 `it.fails`
  are retired and replaced by 7 passing regression tests plus 4 independent equinox/solstice
  golden anchors. celestine (which failed ~17锟?~37锟? is removed; astronomy-engine moved to a
  bundled runtime dependency (SBOM now 6 components).
- Angles validated against independent oracles: the MC's right ascension equals RAMC, and the
  computed Ascendant sits on the eastern horizon per astronomy-engine's `Horizon`. Quadrant
  house systems FAIL at high latitude (`HOUSE_SYSTEM_UNAVAILABLE`) instead of silently switching.
- Honest degradation preserved: unknown birth time still places planets by date but fabricates no
  ascendant/houses; sidereal zodiac and the true node emit explicit warnings; `compare` with the
  `whole-sign` profile now yields genuinely different houses.
- HTML + SVG reports render the Western chart; forward-test covers both the computed path and the
  unknown-time no-houses path.

### Phase W2 锟?Zi Wei dynamic charts (杩愰檺锟?

- Zi Wei dynamic charts via iztro's `horoscope()`: **澶ч檺/灏忛檺/娴佸勾/娴佹湀/娴佹棩/娴佹椂** for any target
  solar date, each with its re-placed twelve palaces, 杩愰檺鍥涘寲 and (娴佸勾) 灏嗗墠/宀佸墠鍗佷簩锟?
- New `horoscope` CLI subcommand (`--at YYYY-MM-DD[THH:mm[:ss]]`); `render` renders a horoscope
  output into HTML/SVG as well. The natal chart now records each palace's 涓夋柟鍥涙 (瀵瑰/璐㈠笡/瀹樼).
- Contracts: `ZiweiHoroscope` + `ZiweiHoroscopeResult`; `computeZiweiHoroscope` reuses the same
  natal astrolabe (needs a known time + gender rule, else ZIWEI_INPUT_REQUIRED, never fabricated).
- Verified against known anchors: 2026 = 涓欏崍 娴佸勾, 灏忛檺铏氬瞾 regression, monthly-branch regression,
  杩愰檺鍥涘寲 contents, and 鍛藉 涓夋柟鍥涙 (杩佺Щ/璐㈠笡/瀹樼). Byte-identical determinism; horoscope
  rendered to self-contained HTML in the clean-dir forward test.

### Phase W3 锟?sourced BaZi interpretation rules (鏃鸿“/鏍煎眬/鍠滅敤锟?鍗佺)

- New `packages/bazi-rules`: deterministic, offline interpretation over a computed
  `BaziChartResult`. Every finding carries a public-domain classic citation (work + chapter) and a
  `matched` flag 锟?**no unsourced "single answer"**; where a rule cannot decide (寤虹/鏈堝姭, a
  balanced day master) it says so instead of guessing.
- Rules: 鏃鸿“ strength (寰椾护/寰楀湴/寰楀娍, 銆婂瓙骞崇湡璇狅拷?, 鏍煎眬 pattern from 鏈堜护鏈皵 ten-god
  (銆婂瓙骞崇湡璇狅拷?, 鍠滅敤锟?direction via 鎵舵姂 (銆婃淮澶╅珦锟?, 鍗佺璞′箟 (銆婃笂娴峰瓙骞筹拷?. Versioned ruleset
  `bazi-rules-ziping@0.1.0` (provider `bazi-rules`, MIT).
- Kept OUT of the calculation bundle: interpretation is a separate layer (handoff 搂8) that reads
  chart facts and never recomputes. The classics are recorded as public-domain in LICENSE_AUDIT.
- Verified on synthetic + real charts: 鐢叉湪鍗湀 锟?鍋忓己 with 寤虹/鏈堝姭 honestly flagged; 姝ｅ畼锟? matched; 韬急 锟?鍠滃嵃姣斿姭; the chart's ten-gods listed. Deterministic.

### Phase W4 锟?cross-system interpretation facts + host-LLM output

- New `packages/interpret` + an `interpret` CLI subcommand: aggregates the three charts (and an
  optional Zi Wei 娴佸勾) plus the sourced BaZi rules into topic-organized `InterpretationFacts`
  (鎬ф牸/浜嬩笟/璐㈣繍/濠氬Щ/瀛︿笟/鍋ュ悍鎻愮ず). Every fact carries machine-checkable `evidence` (ref + note)
  and an honest `caveat` 锟?no prose, no prediction, no invented values.
- The host LLM narrates ONLY from `interpretation.json` (guardrails in SKILL.md): cite evidence,
  surface caveats, honor disclaimers, never deterministic medical/legal/financial/life-and-death
  advice. De-identified 锟?no name/life events, and free-text location never leaks into the facts.
- Honest degradation preserved: unknown time 锟?no ascendant/MC claim; unspecified gender 锟?no
  spouse-star fabrication. Deterministic byte-identical output.

### Phase W5 锟?鍚夊嚩 facts, sidereal/true-node/asteroids, render paused (ADR 0005)

- **鏃ユ煴鍗佺鏄剧ず fixed:** `BaziPillar.tenGodDisplay` (day column = 鏃ヤ富(鏃ュ厓), never blank);
  `tenGod` stays `null` on the day pillar for backward compatibility.
- **鍚夊嚩 productized (sourced facts + host narration):** new `bazi-rules` modules `relations.ts`
  (鍒戝啿鍚堝), `shensha.ts` (绁炵厼), `fortune.ts` (澶ц繍/娴佸勾 鐢熷厠鍚夊嚩); `strength`/`useful-god`
  gained reason chains. `BaziRuleFinding`/`InterpretationFact` carry `polarity` (锟?锟?涓拷? +
  `reason`; `interpret` adds `followupOffers` (浜嬩笟/鎰熸儏/璐㈣繍/瀛︿笟/娴佸勾).
- **Western completeness (MIT, self-computed):** sidereal zodiac (Lahiri ayanamsha), true lunar
  node, and asteroids (Chiron/Ceres/Pallas/Juno/Vesta). The ten planets keep the 锟?锟?gate two ways 锟?wrapper-consistency (vs astronomy-engine) plus an independent JPL Horizons golden (`packages/western/goldens/jpl-horizons.json`, worst 0.20锟?
  (`precision: high`); the true node + asteroids are `precision: approximate` and excluded from it.
- **Cross-model consistency:** SKILL.md mandates `calculate --systems all` (full COMPUTATION; how much
  is DISPLAYED follows the output channel 锟?Channel A full three charts, Channel B topic-only) + a closing
  follow-up offer; `references/reading-style.md` fixes the narration order.
- **HTML/SVG report paused:** `render` returns a disabled notice (exit 3); renderer + template stay
  dormant. Tools (`smoke`/`forward-test`/`gen-example`) updated accordingly.
- **鍙栨牸淇 + 搴旀湡 + 瑙ｈ涓ヨ皑 (ADR 0006):** 寤虹浠呯锟?闃冲垉浠呭垉浣嶏紱鏉傛皵鏈堥€忓共鍙栨牸锛堟垔鍦熻景鏈堚啋鏉傛皵
  姝ｈ储鏍硷紝闈炲缓绂勶級锛涙柊澧炰簲琛岀己澶便€佸ぉ骞蹭簲锟?鏃ヤ富鍚堣储)銆佸ぇ锟?娴佸勾鍐插悎搴旀湡(锟?2028 鐢冲啿锟?锟? reading-style/SKILL 澧炲弽缁濆鍖栦笌鏈/绯荤粺闅旂/涓€鑷存€ч搧寰嬶拷?- **閫愬勾娴佸勾 + 璇箟绮句慨 (ADR 0007):** 寮曟搸鎸夊綋鍓嶅勾閿氬畾閫愬勾浜у嚭娴佸勾涓婚(澶╁共/鍦版敮鍗佺+鍚堝啿)锛涙棩锟? 澶氶噸鍚堝悎骞朵负涓€锟?璐磋韩/閬ヨ銆佷笉鍙屽悎锟?锛涚己 X 鏀硅堪涓衡€滈渶鍚庡ぉ璁粌銆侀潪鏃犺兘鍔涒€濓紱姒傜巼璇濇湳鏀逛负瓒嬪娍锟? reading-style/SKILL 澧炲崄绁炶薄锟?璐㈡牸/瀹樻潃钘忊墵鎺掓枼缁勭粐/绱井蹇屽崟锟?姘撮€嗏墵锟?鏍″鏁忔劅椤癸拷?- **甯歌杩介棶 + 澶氫汉鍚堝 (ADR 0008):** 鏂板濠氬Щ/姝ｇ紭搴旀湡銆侀€傚悎琛屼笟銆侀厤鍋剁敾鍍忎簨锟?+ 杩介棶 playbook锛涙柊锟? `@loom/synastry` 鍖呬笌 `synastry` 鍛戒护锟?-5 浜恒€佸叓锟?绱井/鍗犳槦涓夌郴锟?2 浜洪渶 analyzePair锛夛紱SKILL
  澶氫汉宸ヤ綔娴侊紙鍏堢‘璁ゅ叧绯讳笌鍒嗘瀽鍝袱浜猴級锛涘弽缁濆鍖栤€斺€斾笉浣溾€滄敞锟?蹇呭垎鈥濄€俉5 鈥渟ynastry 涓嶅仛鈥濆亣璁句綔搴燂拷?

## Commands & results (2026-07-26)

The counts below are the output of one real `pnpm run test` run 锟?the single source of truth
shared with [VALIDATION.md](./VALIDATION.md) ("Current results"). `pnpm run check:doc-counts` fails
if either doc's `N tests / M files` count drifts from an actual run, so update both from the run,
never by hand.

| Command                        | Result                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm run typecheck`           | clean (tsc strict over packages, tools, tests)                                                                                                                                                                                                                                                                                                                                                               |
| `pnpm run test`                | 1217 tests / 89 files 锟?all passing (all systems + JPL Horizons 鐙珛 golden + interpret + 鍚夊嚩 + 鍚堝 + reading-lint/绌鸿瘽/閲嶅/瓒婄晫 + validate-answer v2 缁撴瀯涓庢帾杈為棬绂侊紙绾︽潫寮曠敤浜嬪疄璞佸厤+鍏ㄥ彲瑙佹枃鏈畨鍏ㄦ壂锟?璧勬簮涓婇檺+鏈夌晫瑙ｆ瀽鍏ュ彛锛岄潪璇箟姝ｇ‘鎬ц瘉鏄庯級 + western-rules/ziwei-rules 璇箟瑙勫垯 + 鐗堟湰杩佺Щ/鍥炴粴/鐩爣鐧藉悕锟?+ PII 闅愮鎶ゆ爮 green) |
| `pnpm run build`               | `engine.mjs` 锟?3.1 MB + `sbom.cdx.json` + `sbom.spdx.json` (11 runtime deps)                                                                                                                                                                                                                                                                                                                                |
| `pnpm run validate:skill`      | 40 / 40 (incl. scripts/ no-stray-files guard + CycloneDX/SPDX SBOM checks + validate-answer/lint-reading gate-workflow doc checks)                                                                                                                                                                                                                                                                           |
| `pnpm run validate:reading`    | 36 / 36 (topic example libraries + output-spec structure + natural-delivery boundary; offline, no LLM)                                                                                                                                                                                                                                                                                                       |
| `pnpm run validate:docs`       | passes (docs consistency: 4 full hosts, render disabled, no wrong-ephemeris attribution, dev Node 24 / run Node 22; self-tests)                                                                                                                                                                                                                                                                              |
| `pnpm run validate:provenance` | passes (no wrong-ephemeris attribution in live source / examples / built engine; VSOP87+NOVAS; self-tests)                                                                                                                                                                                                                                                                                                   |
| `pnpm run verify:hosts`        | real candidate ZIPs: single top dir, no double-nest, doctor/verify/calculate byte-identical to canonical                                                                                                                                                                                                                                                                                                     |
| `pnpm run verify:install`      | root publishes GitHub Release v0.4.0 with immutable URL/SHA-256; next candidate build remains unpublished/reproducible                                                                                                                                                                                                                                                                                       |
| `pnpm run smoke`               | 10 / 10 (offline; source CLI vs isolated Skill byte-identical)                                                                                                                                                                                                                                                                                                                                               |
| `pnpm run forward:test`        | 41 / 41 (offline; 8 realistic requests incl. horoscope + interpret + synastry)                                                                                                                                                                                                                                                                                                                               |
| `pnpm run example`             | regenerates `examples/` (de-identified artifacts; needs build)                                                                                                                                                                                                                                                                                                                                               |
| `pnpm run package`             | `dist/` stage + self-verified `.zip` + `.sha256` (21 files; needs build)                                                                                                                                                                                                                                                                                                                                     |
| `pnpm run check:doc-counts`    | passes 锟?both docs match the real run                                                                                                                                                                                                                                                                                                                                                                       |
| `pnpm run scan:licenses`       | offline license-policy gate (LICENSE_AUDIT allowlist) + SBOM license cross-check; fail-closed                                                                                                                                                                                                                                                                                                                |
| `pnpm run format:check`        | clean                                                                                                                                                                                                                                                                                                                                                                                                        |
| `pnpm run verify:cloud`        | CI-safe, non-sensitive gate; must pass in GitHub Actions                                                                                                                                                                                                                                                                                                                                                     |
| `pnpm run verify:all`          | controlled local gate; `scan:incident` fails closed when its private token file is unavailable                                                                                                                                                                                                                                                                                                               |

Vertical slice proven: `birth-input.json 锟?normalize 锟?ChartBundle 锟?structured JSON` (render paused),
runnable from a clean copy outside the repo, offline, deterministic.

## Deferred / not yet implemented

- Richer Western minor aspects and extra dignity readings 锟?later slices (the sidereal zodiac, true
  lunar node and asteroids are already computed as `precision: approximate`).
- Richer interpretation (璋冿拷? more 鏍煎眬 branches, Western dignities/aspects readings) 锟?future
  ruleset versions; the current layer is the deterministic substrate for the host LLM.
- Dependency **vulnerability** scan (`scan:deps`), **license** scan (`scan:licenses`) and **secret**
  scan (`scan:secrets`) are wired into `verify:cloud` (and therefore `verify:all`); `build` emits both a
  CycloneDX and an SPDX 2.3 SBOM. A broader lint ruleset is still deferred (the ESLint
  import-boundary gate is already enforced).
- Live WorkBuddy upload/enable/trigger acceptance 锟?the remaining Phase 4 step (real device;
  checklist in `docs/WORKBUDDY.md`).

## Open risks

- Western angles/houses are derived in-house (not astronomy-engine); they are validated against
  the MC=RAMC and eastern-horizon oracles and an independent Swiss Ephemeris house golden
  (swetest 2.10.03, 5 synthetic cases x 5 systems, 12 cusps + angles each, worst measured
  deviation 0.69 arc-minutes; see packages/western/goldens/README.md). The golden covers
  normal latitudes; circumpolar instants are contract-tested (HOUSE_SYSTEM_UNAVAILABLE).
- LMT-era (early 1901+) offsets are whole-minute precision (moment-timezone limitation).
- Equation of time is an approximation (~tenths of a minute); fine for display, not high-precision.
- TypeScript pinned to 5.9 while registry `latest` is 7.0; revisit after TS 7 soaks.

## Owner decisions pending (do not block Phase 2)

1. License route (default: closed-source-friendly MIT/BSD/Apache).
2. Interpretation product route (default: calculate first, interpret later).

## Next step (expansion roadmap complete 锟?Phase 4 acceptance / Phase 5锟?)

The approved expansion roadmap is now **complete**: Western natal charts (astronomy-engine, VSOP87 + NOVAS),
Zi Wei dynamic charts (杩愰檺锟?, a sourced BaZi interpretation-rules package, and the cross-system
interpretation-facts layer that a host LLM turns into natural-language readings (濠氬Щ/璐㈣繍/浜嬩笟/
瀛︿笟) are all implemented, tested and gated green. Remaining work: (1) the live WorkBuddy
upload/enable/trigger acceptance on a real device (checklist in `docs/WORKBUDDY.md`, the only
Phase 4 item that cannot run from the dev workspace); (2) optional Phase 5 (MCP/Web/API layer or a
separate `interpret-birth-charts` Skill); (3) remaining Phase 6 hardening (a broader lint ruleset;
the dependency vulnerability scan, license scan, secret scan, ESLint import-boundary gate and
dual CycloneDX/SPDX SBOMs are already in place).
