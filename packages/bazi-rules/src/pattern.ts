import type { BaziChartResult, BaziRuleFinding } from '@loom/contracts';
import { bladeBranchOf, isTombBranch, luBranchOf } from './fundamentals.ts';
import { transparentTenGods } from './distribution.ts';

/**
 * Pattern (格局) determination. The primary method of 《子平真诠·论用神》 is 月令本气取格:
 * the ten-god of the 月令本气 names the pattern. Two special cases are handled precisely
 * rather than lumped together (the old rule wrongly called every 比劫 本气 "建禄/月劫"):
 *   - 建禄格 only when the month branch IS the day master's 临官(禄) seat; 阳刃格 only when it
 *     is the 帝旺(刃) seat — never merely because the 本气 shares the day-master element.
 *   - 杂气月 (辰戌丑未, 墓库): the pattern is taken from whichever 中/余气 is 透干 (透干取格,
 *     per 《子平真诠·论墓库》 and common 子平 practice), not from the 比劫 本气. When nothing is
 *     transparent it is honestly left "另取".
 */

const PATTERN_BY_GOD: Record<string, string> = {
  正官: '正官格',
  七杀: '七杀格',
  正财: '正财格',
  偏财: '偏财格',
  正印: '正印格',
  偏印: '偏印格(枭印格)',
  食神: '食神格',
  伤官: '伤官格',
};

// Priority for choosing the main pattern among several transparent 杂气 stems.
const GOD_PRIORITY = ['正财', '偏财', '正官', '七杀', '正印', '偏印', '食神', '伤官'];

function chartStems(bazi: BaziChartResult): string[] {
  return [
    bazi.pillars.year.stem,
    bazi.pillars.month.stem,
    bazi.pillars.day.stem,
    bazi.pillars.hour?.stem,
  ].filter((s): s is string => typeof s === 'string');
}

/** Transparent 财官印食伤 gods across year/month/hour stems (for the 兼看 note). */
function otherTransparentGods(bazi: BaziChartResult, exclude: string): string[] {
  const out: string[] = [];
  for (const [god] of transparentTenGods(bazi)) {
    if (god !== exclude && PATTERN_BY_GOD[god] !== undefined) out.push(god);
  }
  return out;
}

export function patternFinding(bazi: BaziChartResult): BaziRuleFinding {
  const month = bazi.pillars.month;
  const monthQi = month.hiddenStems.find((h) => h.primary)!;
  const god = monthQi.tenGod;

  // 1) 本气为财官印食伤 → 直接以本气取格.
  const direct = PATTERN_BY_GOD[god];
  if (direct !== undefined) {
    return {
      ruleId: 'pattern/yue-ling-ben-qi',
      topic: 'pattern',
      matched: true,
      claim: `格局：${direct}（月令${month.branch}本气${monthQi.stem}为${god}）`,
      source: { text: '子平真诠', chapter: '论用神' },
      detail: `月支${month.branch}藏干以${monthQi.stem}为本气，其对日主之十神为${god}，故定${direct}。`,
    };
  }

  // 2) 本气为比肩/劫财 —— 精确区分 建禄 / 阳刃 / 杂气 / 另取.
  const dayStem = bazi.dayMaster.stem;
  const branch = month.branch;

  if (god === '比肩' && luBranchOf(dayStem) === branch) {
    return {
      ruleId: 'pattern/jian-lu',
      topic: 'pattern',
      matched: true,
      claim: `格局：建禄格（月支${branch}为${dayStem}日主临官(禄)之地，比肩当令）`,
      source: { text: '子平真诠', chapter: '论建禄月劫' },
      detail:
        '建禄者，月支正当日主临官(禄)之位；用神于官杀、财、食伤中取透出有力者，不以月令本身为格。',
    };
  }
  if (god === '劫财' && bladeBranchOf(dayStem) === branch) {
    return {
      ruleId: 'pattern/yang-ren',
      topic: 'pattern',
      matched: true,
      claim: `格局：阳刃格（月支${branch}为${dayStem}日主帝旺(刃)之地，劫财当令）`,
      source: { text: '子平真诠', chapter: '论阳刃' },
      detail: '阳刃者，月支正当日主帝旺(刃)之位；喜官杀制刃，忌刃旺无制。',
    };
  }

  // 3) 杂气月 (辰戌丑未): 看中/余气透干取格.
  if (isTombBranch(branch)) {
    const stems = chartStems(bazi);
    const revealed = month.hiddenStems
      .filter((h) => !h.primary && stems.includes(h.stem) && PATTERN_BY_GOD[h.tenGod] !== undefined)
      .sort((a, b) => GOD_PRIORITY.indexOf(a.tenGod) - GOD_PRIORITY.indexOf(b.tenGod));
    if (revealed.length > 0) {
      const main = revealed[0]!;
      const also = [
        ...revealed.slice(1).map((h) => h.tenGod),
        ...otherTransparentGods(bazi, main.tenGod),
      ];
      const alsoText =
        also.length > 0 ? `；兼看${[...new Set(also)].join('、')}` : '（并参地支所藏官杀）';
      return {
        ruleId: 'pattern/za-qi-tou-gan',
        topic: 'pattern',
        matched: true,
        claim: `格局：杂气${PATTERN_BY_GOD[main.tenGod]}（${branch}为墓库，本气${monthQi.stem}${god}，${main.stem}${main.tenGod}透干，以透出者论格${alsoText}）`,
        source: { text: '子平真诠', chapter: '论墓库' },
        detail: `辰戌丑未为杂气墓库，本气${monthQi.stem}虽为${god}，然墓库以透干者为用：${main.stem}${main.tenGod}透，故以杂气${PATTERN_BY_GOD[main.tenGod]}论${alsoText}。`,
      };
    }
    return {
      ruleId: 'pattern/za-qi-wu-tou',
      topic: 'pattern',
      matched: false,
      claim: `月令${branch}为杂气(墓库)，本气${monthQi.stem}${god}且中/余气未透干，不以月令定格，格局另取`,
      source: { text: '子平真诠', chapter: '论墓库' },
      detail: '杂气无透，格局须于四柱透干有力者别取，本规则集如实标注"另取"，不妄断。',
    };
  }

  // 4) 本气比劫但月支非禄/刃/墓库 (罕见) → 另取.
  return {
    ruleId: 'pattern/bi-jie-other',
    topic: 'pattern',
    matched: false,
    claim: `月令${branch}本气为${god}（比劫当令，非建禄/阳刃之地），不以月令定格，格局另取`,
    source: { text: '子平真诠', chapter: '论建禄月劫' },
    detail: '本气为比劫而月支非临官/帝旺之位，格局别取（于官杀、财、食伤中取透出有力者）。',
  };
}
