import type { WesternChartResult, WesternRuleFinding } from '@loom/contracts';

/**
 * Planet-sign meaning rules. For Sun, Moon, Mercury, Venus, Mars: a core one-line
 * semantic claim per sign placement. Source: Ptolemy Tetrabiblos (public domain).
 */

const SRC = { text: 'Ptolemy, Tetrabiblos', chapter: 'Book I–III, planetary natures' };

/** Core sign meanings mapped by body. Only the 5 personal planets are covered in the skeleton. */
const PLANET_SIGN_MEANINGS: Record<string, Record<string, string>> = {
  Sun: {
    Aries: '行动力强、开拓意愿明显',
    Taurus: '重视稳定与实质成果',
    Gemini: '思维活跃、适应力强',
    Cancer: '情感驱动、重视归属',
    Leo: '表达欲强、追求被看见',
    Virgo: '注重细节与实用',
    Libra: '追求平衡与合作',
    Scorpio: '深度探索、意志集中',
    Sagittarius: '追求意义与更大视野',
    Capricorn: '目标导向、注重结构',
    Aquarius: '独立思考、关注集体',
    Pisces: '直觉敏锐、富同理心',
  },
  Moon: {
    Aries: '情绪反应快、需要独立空间',
    Taurus: '情绪稳定、需要安全感',
    Gemini: '情绪多变、需要交流刺激',
    Cancer: '情感丰富、需要家庭归属',
    Leo: '需要被欣赏、情感表达外放',
    Virgo: '情绪内敛、需要秩序感',
    Libra: '需要和谐环境、回避冲突',
    Scorpio: '情感深沉、需要深度连接',
    Sagittarius: '情绪乐观、需要自由空间',
    Capricorn: '情绪克制、需要成就感',
    Aquarius: '情感独立、需要理念认同',
    Pisces: '情绪易感、需要精神寄托',
  },
  Mercury: {
    Aries: '思考直接果断',
    Taurus: '思考务实缓慢',
    Gemini: '思维灵活善变',
    Cancer: '思考带情感色彩',
    Leo: '表达有感染力',
    Virgo: '分析精细有条理',
    Libra: '善于权衡多方',
    Scorpio: '思维深入穿透',
    Sagittarius: '思路开阔跳跃',
    Capricorn: '思考有结构有目标',
    Aquarius: '思维创新非主流',
    Pisces: '思考直觉化跳跃',
  },
  Venus: {
    Aries: '感情主动冲动',
    Taurus: '感情稳定忠诚',
    Gemini: '社交灵活多元',
    Cancer: '情感付出有保护性',
    Leo: '喜欢热烈浪漫',
    Virgo: '在关系中注重实际',
    Libra: '天然追求和谐美感',
    Scorpio: '感情深沉排他',
    Sagittarius: '感情需要自由空间',
    Capricorn: '感情务实有责任心',
    Aquarius: '情感独立不拘传统',
    Pisces: '感情浪漫理想化',
  },
  Mars: {
    Aries: '行动力强直接',
    Taurus: '做事持久有耐力',
    Gemini: '精力分散灵活',
    Cancer: '被动式发力、受情感驱动',
    Leo: '有表现欲、大方投入',
    Virgo: '精力用于细节完善',
    Libra: '行动前需要权衡',
    Scorpio: '意志力集中持久',
    Sagittarius: '精力充沛目标远大',
    Capricorn: '行动有计划有纪律',
    Aquarius: '做事不按常规',
    Pisces: '行动力受直觉和情绪影响',
  },
};

export function planetSignFindings(chart: WesternChartResult): WesternRuleFinding[] {
  const out: WesternRuleFinding[] = [];
  for (const planet of chart.planets) {
    const meanings = PLANET_SIGN_MEANINGS[planet.body];
    if (!meanings) continue;
    const claim = meanings[planet.sign];
    if (!claim) continue;
    out.push({
      ruleId: `planet-sign/${planet.body.toLowerCase()}-${planet.sign.toLowerCase()}`,
      topic: 'planet-sign',
      matched: true,
      claim: `${planet.body}在${planet.sign}：${claim}`,
      source: SRC,
      reason: `${planet.body}落入${planet.sign}，该星体的能量以此星座的方式表达`,
    });
  }
  return out;
}
