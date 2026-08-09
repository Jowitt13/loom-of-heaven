# Rule sets & schools

School / tradition differences are never scattered booleans — each calculation selects a
**versioned `rulesetId`** and the result records it. The interface only offers rulesets that
are actually implemented and tested; "the library supports plugins" is not the same as "this
school is implemented" (handoff §5).

## `compare` profiles (available now)

`node scripts/ming-chart.mjs compare --input-file in.json --profiles a,b`

| profile          | effect                                                                 |
| ---------------- | ---------------------------------------------------------------------- |
| `default`        | Input settings unchanged.                                              |
| `apparent-solar` | BaZi `solarTimeMode = apparent`, Zi Wei `useApparentSolarTime = true`. |
| `mean-solar`     | BaZi `solarTimeMode = mean`.                                           |
| `whole-sign`     | Western `houseSystem = whole-sign`.                                    |

In this engine version, normalization (the UTC instant) is invariant to these rule settings,
so `compare` reports that normalized time is identical and notes that chart-level differences
arrive with the Phase 2 providers. This is an honest result, not a fabricated divergence.

## Western defaults (`western-tropical-placidus@0.1.0`)

Tropical zodiac, geocentric, Placidus houses, true node, and the five asteroids on by default.
Also selectable: whole-sign, equal, koch, porphyry; `sidereal` with a Lahiri / Fagan-Bradley
ayanamsha; `mean` node; `asteroids: false`. The ten planets hold the ≤1′ astronomy-engine (VSOP87+NOVAS) wrapper-consistency gate
(`precision: high`); the sidereal projection is exact given the ayanamsha, while the true node
and asteroids (Chiron/Ceres/Pallas/Juno/Vesta) are self-computed from public-domain orbital
elements and reported `precision: approximate`. At high latitude a quadrant house system that
cannot be computed must raise `HOUSE_SYSTEM_UNAVAILABLE` — never silently switch.

## BaZi disputed points (`bazi-standard@0.1.0`)

Versioned toggles: solar-term boundaries for year/month pillars; time base
(`civil | mean | apparent`); day boundary (`midnight | zi-hour`); early/late 子时
(`early | late`); luck-cycle direction and 起运 algorithm. 格局, 强弱 and 喜用神 are interpretation
rules (see below): they always carry an explicit source + version and a reason chain — never a
single "correct answer".

## Interpretation rules (`interpret`)

The cross-system reading facts come from sourced, versioned BaZi rules. Each finding carries a
`ruleId`, a public-domain `source` (《子平真诠》《滴天髓》《三命通会》《渊海子平》), a `reason`
chain, and — where applicable — a `polarity` (吉 / 凶 / 中性):

- **strength** (旺衰强弱) — 得令/得地/得势 + 透干(两透)/通根 reason chain.
- **pattern** (格局) — 月令本气取格；建禄仅当月支为日主临官(禄)位、阳刃仅当帝旺(刃)位；杂气月(辰戌丑未)
  按中/余气**透干取格**，无透则如实标“另取”。
- **useful-god** (喜用神) — 扶抑法的喜/忌 reason，并点出所缺之喜用五行(如缺金)及官杀“过旺转病”的双刃性。
- **ten-gods** — the ten-gods present among the stems.
- **relations** (刑冲合害/天干五合) — 地支六合/三合/三会/六冲/三刑/自刑/相害/相破 + 天干五合；日主与多个
  同类相合合并为一条（区分贴身/遥见、不作双重合化；**以合而不化为常、化神当令(月令本气=合化五行)方标化气之机**），with polarity.
- **shensha** (神煞) — 天乙贵人/文昌/桃花/驿马/华盖/羊刃/劫煞/亡神 …, with polarity.
- **fortune** (大运/流年) — 大运吉凶倾向 + 大运/流年地支对本命的冲合应期；并输出**逐年流年时间线**
  （以 `--now`/`--at` 年份为锚、约 12 年，每年天干十神+地支本气十神+与本命/大运的合冲→主题），
  with polarity + reason。流年整年非单一定性。

Probabilities and specific years are the host model's 命理 judgement on top; the engine only
supplies the sourced facts and the 大运/流年 timepoints. Always 非科学预测.

常见追问还由以下事实支撑（均带来源/免责）：**婚姻/正缘应期**（配偶星临岁/合夫妻宫为推进、逢冲/自刑/伏吟/相害为变动·反复、桃花为弱信号；**分级标注**、需性别）、
**适合行业**（喜用五行→行业大类）、**配偶画像**（配偶星五行+紫微夫妻宫+下降/金星/**七宫主星**，倾向参考）、
**西方第七宫主星**（下降星座之古典主星的星座/宫位/逆行/尊陷）与**关系相位**（月/金/火/土与七宫主的合/冲/拱/刑/六分）。

## 合婚 / 关系分析 (`synastry`)

多人（1-5）合婚对“指定的一对”做三系结构信号（每条带 `code`/`reason`/来源与 polarity）；>2 人需
`analyzePair` 指定，未指定则引擎报错、SKILL 主动询问。

- **八字**：生肖(年支)与夫妻宫(日支)的六合/三合(半合)/六冲/相刑/相害、日干五合(相吸)、五行与喜用互补（双向）、配偶星契合、大运/流年共振应期(同吉/同冲之年)。
- **紫微**：双方 命宫↔夫妻宫↔迁移宫 地支互涉（六合/三合契合、六冲/刑张力）、星曜呼应、四化互涉(一方生年四化禄/权/科/忌飞入对方命宫/夫妻宫)。
- **占星**：双方星体互相位（日/月/水/金/火 + 上升/下降）的合/六分/刑/拱/冲，带 orb。
- **总体**：吉/凶计数的粗略倾向。契合与否是相处经营的结果，非命定；不作“注定/必分”断言。

## Zi Wei (`iztro-default@0.1.0`)

A single clearly named ruleset first, then schools via configuration. Records the
star-placement ruleset id, four-transformations (四化) table version, brightness table
version, whether true solar time is applied, and the major/minor limit configuration.

## Solar time (important)

## Vedic / Jyotish (`vedic-parashara-lahiri@0.1.0`)

The Vedic provider uses Lahiri IAE-1985 (`SE_SIDM_LAHIRI` reference mode), whole-sign bhava,
27 nakshatras, D1/D9, instantaneous panchanga and `julian-365.25` Vimshottari. It returns both
mean and true Rahu/Ketu node pairs; there is **no product node default yet**, so `vedic.nodes`
is an explicit school selection only. Ketu is exactly opposite its corresponding Rahu.

The MIT `caelus@0.23.0` provider runs offline. `precision: "high"` is a narrow fixture claim:
the relevant fields passed the recorded Swiss-only external numeric reference at <=1 arc-minute.
Swiss Ephemeris is never bundled or loaded by runtime/CI. For unknown birth time,
`VEDIC_TIME_REQUIRED` suppresses Lagna, bhava, D9 Lagna, Vaara and Vimshottari.

Mean and apparent solar time are optional inputs to BaZi / Zi Wei only. They are **never**
substituted for the Western UTC instant + coordinates. Mean solar time is longitude-driven
(1° = 4 minutes); the fixed 120°E / UTC+8 simplification is never applied globally.
