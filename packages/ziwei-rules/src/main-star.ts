import type { ZiweiChartResult, ZiweiRuleFinding } from '@ming/contracts';

/**
 * Main star core meaning rules. Each of the 14 main stars has one-line core象义.
 * Source: 紫微斗数全书 (public domain).
 */

const SRC = { text: '紫微斗数全书', chapter: '诸星论' };

const STAR_MEANINGS: Record<string, string> = {
  紫微: '领导力与尊贵，善于统筹全局',
  天机: '智慧灵活，善于策划和应变',
  太阳: '光明正大，主动付出不求回报',
  武曲: '刚毅果决，善于理财与执行',
  天同: '温和知足，追求生活品质',
  廉贞: '多才多艺，情感丰富但复杂',
  天府: '稳重保守，善于守成与管理',
  太阴: '细腻内敛，善于计划与收藏',
  贪狼: '多欲多才，社交能力强',
  巨门: '口才与分析力强，善于探究',
  天相: '温文尔雅，善于协调与辅助',
  天梁: '正直清高，善于庇护与教化',
  七杀: '魄力刚强，独立开创',
  破军: '变动性强，敢于破旧立新',
};

export function mainStarFindings(chart: ZiweiChartResult): ZiweiRuleFinding[] {
  const out: ZiweiRuleFinding[] = [];
  // Find soul palace (命宫) and extract its major stars
  const soulPalace = chart.palaces.find((p) => p.isSoulPalace);
  if (!soulPalace) return out;
  for (const star of soulPalace.majorStars) {
    const meaning = STAR_MEANINGS[star.name];
    if (!meaning) continue;
    out.push({
      ruleId: `main-star/${star.name}`,
      topic: 'main-star',
      matched: true,
      claim: `命宫主星${star.name}：${meaning}`,
      source: SRC,
      reason: `${star.name}坐守命宫，其星性为本人核心性格底色`,
    });
  }
  return out;
}
