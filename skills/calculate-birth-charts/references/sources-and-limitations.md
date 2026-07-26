# Sources & limitations

## Authoritative sources

- **Time zones / DST**: [IANA Time Zone Database](https://www.iana.org/time-zones), bundled
  via moment-timezone; the release id (e.g. `2026c`) is recorded in every result's
  `provenance.tzdb.version`.
- **Apparent solar time**: [NOAA GML Solar Calculator](https://gml.noaa.gov/grad/solcalc/)
  equation-of-time approximation (US Government, public domain).
- **Chinese calendar / BaZi**: [GB/T 33661-2017 《农历的编算和颁行》](https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=E107EA4DE9725EDF819F33C60A44B296) defines the calendar and the 24 solar terms. BaZi computation via tyme4ts (MIT).
- **Zi Wei Dou Shu**: via iztro (MIT) with the `iztro-default` ruleset.
- **Western position cross-check**: [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) and Swiss
  Ephemeris documentation; positions via astronomy-engine (MIT, VSOP87 + NOVAS based; upstream
  claims ~±1′ accuracy and tests against JPL Horizons). See the Western limitation note below.

## What this version computes

- Local civil time → single UTC instant, with historical IANA DST.
- Explicit handling of ambiguous (fall-back) and non-existent (spring-forward) local times.
- Mean and apparent solar time from longitude + equation of time.
- Lunar → Gregorian conversion with leap-month support.
- **BaZi (四柱八字)**: four pillars, hidden stems (藏干), ten gods (十神), na yin (纳音),
  zodiac (生肖), luck cycle (大运/起运). Gender-gated and time-gated (no fabrication).
- **Zi Wei Dou Shu (紫微斗数)**: natal twelve palaces, stars with brightness and 四化,
  major limits (大限), 命主/身主, five-elements class (五行局). Gender- and time-gated.
- Versioned metadata, warnings and provenance on every result.

## Current limitations (stated honestly)

- **Western natal charts are computed** by astronomy-engine (MIT, VSOP87 + NOVAS based). Our
  `precision-regression` proves our wrapper stays consistent with astronomy-engine's own output,
  and an **independent JPL Horizons golden fixture** (10 bodies × 3 technical epochs, fetched from
  the NASA/JPL Horizons service with the query recorded; worst deviation 0.20′) cross-checks
  absolute accuracy in `packages/western/test/western-jpl-golden.test.ts` — both hold the ≤1′
  gate. The candidate celestine 0.2.1 was evaluated and REJECTED at the ADR 0003
  ≤1′ gate (up to ~17′ Mercury / ~37′ Pluto). The regression lives in
  `packages/western/test/precision-regression.test.ts`. The **sidereal zodiac (Lahiri ayanamsha)**,
  the **true lunar node** and the **asteroids** (Chiron/Ceres/Pallas/Juno/Vesta) are also computed
  — but the true node and asteroids are self-computed from public-domain orbital elements, marked
  `precision: approximate` (角分级近似) and **excluded** from the wrapper-consistency gate. Quadrant house systems fail at high latitude instead
  of being silently switched; houses/ascendant require a known birth time.
- BaZi and Zi Wei both need a known birth time. Zi Wei and the BaZi luck cycle (大运)
  also need `ruleGender`. When missing, those parts are omitted with a warning.
- **`interpret` 吉凶 is a sourced traditional-metaphysical judgement, 非科学预测.** It emits
  刑冲合害 / 神煞 / 格局 / 大运·流年 facts each with `polarity` (吉/凶/中性) and a `reason` chain;
  concrete probabilities and years are the host model's 命理 assessment layered on top, always
  caveated (see `references/reading-style.md`). The engine never computes odds.
- **The HTML/SVG report is temporarily disabled.** The `render` command returns a stable JSON
  notice and exits with code 3; present the structured `calculate` / `interpret` JSON instead.
  See `docs/adr/0005-fortune-sidereal-render-pause.md`.
- **合婚 (`synastry`) 为传统方法、非科学预测。** 多人(1-5)对指定的一对做八字(生肖/日支夫妻宫/五行喜用
  互补/配偶星)、紫微(命宫↔夫妻宫互涉)、占星(双方星体互相位)三系结构信号；占星互相位自算、沿用十大
  行星 ≤1′ 精度，紫微 cross-overlay 在 iztro 每人盘输出上自算。契合与否是相处经营的结果、非命定，
  不作“注定/必分”断言，见 `docs/adr/0008-synastry-and-followup-playbooks.md`。
- **婚姻解读精修为流派选择、非唯一。** 天干五合以“合而不化”为常，仅当化神当令(月令本气=合化五行)
  方标“化气之机”—此为化气格的最小充分近似，不做完整化气格判定；婚恋应期按 推进/变动/桃花 分级(含
  自刑/伏吟/相害)。西方**第七宫主星用古典主星表**(天蝎→火、水瓶→土、双鱼→木)，不用现代外行星主星；
  均为传统方法、非科学预测，见 `docs/adr/0009-marriage-reading-refinements.md`。
- **Equation of time is an approximation** (`noaa-eot@0.1.0`), accurate to ~tenths of a
  minute — adequate for solar-time display, not for high-precision astronomy.
- **Pre-standard-time (LMT) offsets** in the early part of the 1901+ range are represented at
  moment-timezone's whole-minute precision.
- **Supported year range is 1901–2100.** Wider ranges open only after independent
  verification and a capabilities update.

## Correctness claim

"Correct" means: given a specified rule set and dependency versions, the result is
reproducible and consistent with the cited sources. It does not mean the underlying
divination is scientifically validated prediction.
