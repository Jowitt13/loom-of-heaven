import type { ZiweiChartResult, ZiweiRuleFinding } from '@loom/contracts';

/**
 * 四化 (sihua) meaning rules. 化禄/化权/化科/化忌 general meanings.
 * Source: 紫微斗数全书 (public domain).
 */

const SRC = { text: '紫微斗数全书', chapter: '四化总论' };

const SIHUA_MEANINGS: Record<string, string> = {
  禄: '机会增加、资源流入、有利发展',
  权: '掌控力增强、竞争意愿、主动性高',
  科: '名声提升、贵人帮助、文雅有序',
  忌: '纠结困扰、需要面对、不可回避的功课',
};

export function sihuaFindings(chart: ZiweiChartResult): ZiweiRuleFinding[] {
  const out: ZiweiRuleFinding[] = [];
  for (const palace of chart.palaces) {
    const allStars = [...palace.majorStars, ...palace.minorStars];
    for (const star of allStars) {
      if (!star.mutagen) continue;
      const meaning = SIHUA_MEANINGS[star.mutagen];
      if (!meaning) continue;
      out.push({
        ruleId: `sihua/${star.name}-化${star.mutagen}-${palace.name}`,
        topic: 'sihua',
        matched: true,
        claim: `${star.name}化${star.mutagen}在${palace.name}：该宫位主题${meaning}`,
        source: SRC,
        reason: `${star.name}化${star.mutagen}落入${palace.name}，四化能量作用于该宫位所管领域`,
      });
    }
  }
  return out;
}
