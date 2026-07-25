# WorkBuddy integration

WorkBuddy supports both `Skill + CLI` and `MCP + CLI`. This project uses **Skill + CLI**; no MCP
service is required (handoff §7.3). Official docs:
[Overview](https://www.workbuddy.cn/docs/workbuddy/Overview),
[Skills Market](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Skills-Market),
[Connector](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Connector).

## Deliverable

The installable unit is the directory `skills/calculate-birth-charts/`. After `pnpm run build`
it contains everything needed at runtime, including `scripts/dist/engine.mjs`. It depends on
neither the repo's `packages/` nor `node_modules`, and runs offline.

## Build & package

```powershell
pnpm install            # dev only; not needed by the published Skill
pnpm run build          # bundle engine + write sbom.cdx.json
pnpm run validate:skill # structure / offline / CSP / no-stray-files checks (expect 34/34)
pnpm run smoke          # copy to a clean temp dir and run offline (expect 10/10)
pnpm run forward:test   # clean-dir SKILL workflow, 7 realistic requests (expect 38/38)
pnpm run example        # regenerate the de-identified examples/ artifacts (needs build)
pnpm run package        # stage dist/calculate-birth-charts/ + .zip + .sha256 (needs build)
```

Then ship either the `skills/calculate-birth-charts/` folder or the archive
`dist/calculate-birth-charts.zip` produced by `pnpm run package`.

## Packaging & integrity

`pnpm run package` stages a clean copy of the published Skill (no scratch output) into
`dist/calculate-birth-charts/`, writes a SHA-256 manifest `dist/calculate-birth-charts.sha256`
(`sha256sum`-compatible), and builds `dist/calculate-birth-charts.zip` in-process (CRC32 + DEFLATE,
fixed timestamp for byte-reproducibility). The tool then re-parses the archive and fully
decompresses every entry to prove it round-trips — a green run means the archive is well-formed and
complete, with no external tool. `dist/` is gitignored; regenerate on demand.

## Install & enable

1. In WorkBuddy, open the Skills Market / local Skill import and upload the
   `calculate-birth-charts` folder (or its archive).
2. Enable the Skill. It declares least privilege: local file execution, no network, no telemetry.
3. Requires a Node runtime available to the host to run `node scripts/ming-chart.mjs`.

## Trigger examples

- "男，公历 1990-06-15 14:20（时间准确），出生地 示例城市，时区 Asia/Shanghai，纬度 30.00、经度 120.00，帮我看事业" (完整输入合同的排盘请求)
- "看看我的财运和感情，顺便给个吉凶" (reading request → interpret)
- "比较一下用真太阳时和民用时的差别" (compare profiles)

Negative (should NOT trigger): "生成一张销售数据星形图 / 雷达图" (a sales/analytics chart).

## What a run does

The model collects and restates inputs (time, place, coordinates, IANA zone, calendar,
ruleset), confirms DST/approximate/near-boundary risks, then runs `doctor → normalize →
calculate --systems all`, **displays all three systems in full** (Western / BaZi / Zi Wei),
checks exit code + `warnings` + `provenance`, and hands back `chart.json`. For a natural-language
reading (婚姻 / 财运 / 事业 / 学业 / 流年) it additionally runs `interpret` and narrates ONLY from
the resulting `interpretation.json` — leading with the 吉凶 verdict, citing evidence + reason,
honoring caveats and disclaimers, and closing with the standardized follow-up offers. It relays
every warning honestly and never fabricates results. (The `render` HTML/SVG report is temporarily
disabled — see ADR 0005.)

## Artifacts

`calculate` returns `chart.json` (the source of truth) and, for a reading, `interpret` returns
`interpretation.json` (de-identified topic facts with `polarity`/`reason` + `followupOffers`).
The HTML/SVG report is temporarily disabled: `render` returns a stable disabled notice, exits
with code 3, and writes no file (see ADR 0005). A committed, de-identified example of every
artifact lives in `examples/` (regenerate with `pnpm run example`).

## Status

Build, validate (34/34), offline smoke (10/10), clean-dir forward test (38/38), packaging
(self-verifying zip + SHA-256) and a de-identified end-to-end example all pass locally. **Live
WorkBuddy upload/enable/trigger acceptance is the remaining Phase 4 step** and needs a real device;
use the checklist below.

## Real-device acceptance checklist (Phase 4)

Run these on a real WorkBuddy install; the automated gates above already prove the offline,
zero-install, deterministic behavior in a clean directory.

1. Import `dist/calculate-birth-charts.zip` (or the folder) via the Skills Market / local import;
   confirm the install security scan shows no unexplained high-risk item (the Skill declares least
   privilege: local file execution, no network, no telemetry).
2. Enable the Skill. Confirm a Node runtime is available to run `node scripts/ming-chart.mjs`.
3. Trigger with a full-contract chart request, e.g. “男，公历 1990-06-15 14:20（时间准确），出生地 示例城市，时区 Asia/Shanghai，纬度 30.00、经度 120.00，帮我看事业”.
   The model should restate time/place/coordinates/IANA zone/calendar/ruleset and confirm before
   computing.
4. Confirm it runs `doctor → normalize → calculate --systems all`, **displays all three systems in
   full**, relays every warning plainly (unknown time suppresses the ascendant/houses; approximate
   sidereal/true-node/asteroid notes), and returns `chart.json`. For a reading request, confirm it
   runs `interpret` and narrates only from `interpretation.json` (leading with 吉凶, citing evidence
   - reason, honoring caveats/disclaimers, closing with the follow-up offers).
5. Negative trigger: “生成一张销售数据星形图 / 雷达图” must NOT activate the Skill.
6. Verify no implicit network request occurs during calculation (host network monitor stays idle).
7. Confirm the reply shows all three systems in full (Western planets/houses/aspects, BaZi four
   pillars with 日主 shown, Zi Wei palaces), the warnings, the provenance, and a closing follow-up
   offer. (No HTML/SVG report is produced in this version.)
