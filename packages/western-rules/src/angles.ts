import type { WesternChartResult, WesternRuleFinding } from '@ming/contracts';

/**
 * Angle meaning rules. Ascendant sign = persona, MC sign = career direction.
 * Source: Ptolemy, Tetrabiblos (public domain).
 */

const SRC = { text: 'Ptolemy, Tetrabiblos', chapter: 'Book III, angles and their nature' };

const ASC_MEANINGS: Record<string, string> = {
  Aries: '外在形象主动果敢',
  Taurus: '给人沉稳务实的印象',
  Gemini: '外在灵活多面善沟通',
  Cancer: '外在温和有保护色彩',
  Leo: '外在自信有感染力',
  Virgo: '外在谨慎精细',
  Libra: '外在优雅重社交',
  Scorpio: '外在深沉有穿透力',
  Sagittarius: '外在开朗有远见',
  Capricorn: '外在稳重有责任感',
  Aquarius: '外在独特不走寻常路',
  Pisces: '外在柔和有艺术气质',
};

const MC_MEANINGS: Record<string, string> = {
  Aries: '事业方向偏向开拓和领导',
  Taurus: '事业方向偏向稳定积累与金融',
  Gemini: '事业方向偏向沟通和信息',
  Cancer: '事业方向偏向照顾和服务',
  Leo: '事业方向偏向创意和表演',
  Virgo: '事业方向偏向分析和改善',
  Libra: '事业方向偏向协调和美学',
  Scorpio: '事业方向偏向调研和转化',
  Sagittarius: '事业方向偏向教育和拓展',
  Capricorn: '事业方向偏向管理和建构',
  Aquarius: '事业方向偏向创新和技术',
  Pisces: '事业方向偏向艺术和疗愈',
};

export function angleFindings(chart: WesternChartResult): WesternRuleFinding[] {
  const out: WesternRuleFinding[] = [];
  if (!chart.angles) return out;
  const ascSign = chart.angles.ascendant.sign;
  const ascMeaning = ASC_MEANINGS[ascSign];
  if (ascMeaning) {
    out.push({
      ruleId: `angle/asc-${ascSign.toLowerCase()}`,
      topic: 'angle',
      matched: true,
      claim: `上升${ascSign}：${ascMeaning}`,
      source: SRC,
      reason: `上升点落入${ascSign}，决定外在表现与他人第一印象`,
    });
  }
  const mcSign = chart.angles.mc.sign;
  const mcMeaning = MC_MEANINGS[mcSign];
  if (mcMeaning) {
    out.push({
      ruleId: `angle/mc-${mcSign.toLowerCase()}`,
      topic: 'angle',
      matched: true,
      claim: `MC在${mcSign}：${mcMeaning}`,
      source: SRC,
      reason: `天顶(MC)落入${mcSign}，显示社会角色与事业方向的基调`,
    });
  }
  return out;
}
