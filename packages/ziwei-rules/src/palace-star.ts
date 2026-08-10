import type { ZiweiChartResult, ZiweiRuleFinding } from '@loom/contracts';

/**
 * Palace-star combination rules. Major star in career/wealth palace → domain meaning.
 * Source: 太微赋 (public domain).
 */

const SRC = { text: '太微赋', chapter: '十二宫论' };

/** Find a palace by name (tolerant: strips trailing 宫). */
function findPalace(chart: ZiweiChartResult, name: string) {
  const strip = (s: string) => s.replace(/宫$/, '');
  return chart.palaces.find((p) => strip(p.name) === strip(name));
}

function majorStarNames(palace: { majorStars: { name: string }[] }): string {
  return palace.majorStars.map((s) => s.name).join('、') || '无正曜';
}

const CAREER_STAR_HINTS: Record<string, string> = {
  紫微: '适合管理、统筹全局的工作',
  武曲: '适合金融、执行力强的岗位',
  太阳: '适合公开面对大众的职业',
  天机: '适合策划、技术、灵活变通的工作',
  天府: '适合稳定守成、行政管理',
  廉贞: '适合需要多面能力和人际的工作',
  天相: '适合辅助协调、文职行政',
  七杀: '适合独立开创、高压环境',
  破军: '适合变革创新、不安于现状的领域',
  贪狼: '适合社交、销售、艺术娱乐',
  巨门: '适合口才、研究、分析类工作',
  太阴: '适合幕后策划、财务、文艺',
  天梁: '适合教育、公职、服务保障',
  天同: '适合服务、休闲、低压环境',
};

const WEALTH_STAR_HINTS: Record<string, string> = {
  武曲: '理财能力强，善于积累',
  太阴: '善于精打细算、细水长流',
  天府: '财务保守稳健，不喜冒险',
  贪狼: '理财大胆灵活，可能多渠道',
  紫微: '花钱有格局，不拘小节',
  破军: '财来财去波动大，需有积蓄意识',
  七杀: '赚钱能力强但花销也大',
  廉贞: '财务来源多元复杂',
};

export function palaceStarFindings(chart: ZiweiChartResult): ZiweiRuleFinding[] {
  const out: ZiweiRuleFinding[] = [];

  // 命宫 → character (already covered by main-star, but we add the combo claim)
  const soul = chart.palaces.find((p) => p.isSoulPalace);
  if (soul && soul.majorStars.length > 0) {
    out.push({
      ruleId: `palace-star/soul-${majorStarNames(soul)}`,
      topic: 'palace-star',
      matched: true,
      claim: `命宫主星组合：${majorStarNames(soul)}——决定本人核心性格底色`,
      source: SRC,
      reason: `命宫主星为${majorStarNames(soul)}，三方四正星曜共同影响性格全貌`,
    });
  }

  // 官禄宫 → career direction
  const career = findPalace(chart, '官禄宫');
  if (career && career.majorStars.length > 0) {
    const hint = career.majorStars
      .map((s) => CAREER_STAR_HINTS[s.name])
      .filter(Boolean)
      .join('；');
    out.push({
      ruleId: `palace-star/career-${majorStarNames(career)}`,
      topic: 'palace-star',
      matched: true,
      claim: `官禄宫主星${majorStarNames(career)}：${hint || '事业方向需结合三方四正综合判断'}`,
      source: SRC,
      reason: `官禄宫主星决定事业方向与适合的工作环境`,
    });
  }

  // 财帛宫 → wealth style
  const wealth = findPalace(chart, '财帛宫');
  if (wealth && wealth.majorStars.length > 0) {
    const hint = wealth.majorStars
      .map((s) => WEALTH_STAR_HINTS[s.name])
      .filter(Boolean)
      .join('；');
    out.push({
      ruleId: `palace-star/wealth-${majorStarNames(wealth)}`,
      topic: 'palace-star',
      matched: true,
      claim: `财帛宫主星${majorStarNames(wealth)}：${hint || '理财风格需结合三方四正综合判断'}`,
      source: SRC,
      reason: `财帛宫主星决定理财风格与进财方式`,
    });
  }

  return out;
}
