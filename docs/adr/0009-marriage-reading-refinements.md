# ADR 0009: Marriage-reading refinements (合而不化, 七宫主星, 应期分级, discipline)

- Status: Accepted
- Date: 2026-07-25

## Context

A single-person 婚姻 reading surfaced three fact-level "硬伤" plus several narration
over-reaches:

1. The engine printed 天干五合 as accomplished transformation ("戊癸合化火") regardless of
   whether the 化神 is 当令 — for 辰月 (火 not 当令) it should be 合而不化.
2. The engine surfaced only the descendant _sign_ for the Western marriage picture; the more
   telling **7th-house ruler** condition (e.g. Mercury retrograde) and relationship aspects
   (月合土 / 水刑海王) were absent.
3. `marriage-timing` scanned 配偶星临 / 合冲日支 / 桃花 but not 自刑·伏吟·相害, and it weighted a
   桃花-only year like a strong 配偶星临 year, so weak/turbulent years read as "吉".

Narration also mislabeled 天姚+红鸾 as "夹夫妻宫", inferred 性驱力 from 疾厄宫, read 夫妻宫 as the
person's own personality, used real-life events to "prove" the chart, and over-read 大限宫 / 金星.

## Decision

**A. Engine fact fixes.**

- `packages/bazi-rules/src/relations.ts` `stemCombinationFindings`: 天干五合 no longer asserts
  transformation. It says "合，化X之象；合而不化" by default, and only "化神X当令、有化气之机" when the
  月令本气 equals the 合化 element (a minimal 化气格 approximation). 贴身/遥见 and 不作双重合化 kept.
- `packages/bazi-rules/src/marriage-timing.ts`: per-year signal **tagging + grading** — 配偶星临 /
  合夫妻宫 → 推进机会; 冲夫妻宫 / 自刑·伏吟 (流年支属辰午酉亥且逢同支, 或与本命支伏吟) / 相害 / 相刑 →
  变动·反复·需调整; 桃花 → 异性缘弱信号 (非婚期). Finding polarity relaxed to 中性.
- `packages/interpret/src/build.ts` `marriageFacts`: **西方第七宫主星** (下降星座之古典主星 → its
  sign/house/retrograde/dignity) and **关系相位** (月/金/火/土 与 七宫主 的既有 aspects); 七宫主 also
  folded into 配偶画像.

**B. Reading discipline (`references/reading-style.md`).**

New rules 15-23: 五合合而不化 (不按财/官星数推伴侣数; 配偶星明显≠婚姻质量必好); 夹宫术语 (相邻两宫才叫夹);
疾厄宫只论健康 (亲密看 夫妻/福德/子女/桃花+金火冥); 夫妻宫主伴侣与关系 (身宫例外); 迁移宫为倾向、禁用现实
反证盘; 孤辰寡宿为辅星; 大限宫语义+虚岁; 金星=初期表达风格 (月土合七宫权重更高); 婚期年份纪律 (男财女官、
正官/纯桃花非核心婚期、逢冲自刑伏吟害标变动). 具体某段关系走 `synastry`.

## Consequences

- 婚姻应期读作分级窗口而非"吉年清单"; 五合不再冒充化气; 西方给出七宫主星+关系相位，月土合等承诺信号有据。
- 七宫主星采用**古典主星表** (天蝎→火、水瓶→土、双鱼→木)，恒可解析且确定; 现代外行星主星不入。
- These are 流派 selections and traditional methods, still 非科学预测.
- Determinism preserved; the suite grows with 化气/应期分级/七宫主/关系相位 regressions.
