import type { ZiweiChartResult, ZiweiRuleFinding } from '@ming/contracts';

/**
 * Brightness (亮度) modifier rules. 庙旺→充分发挥, 平→中性, 不/陷→受限.
 * Source: 骨髓赋 (public domain).
 */

const SRC = { text: '骨髓赋', chapter: '星辰庙旺论' };

const BRIGHTNESS_EFFECT: Record<string, string> = {
  庙: '能量充分发挥，优势明显',
  旺: '能量旺盛，表现突出',
  得: '能量较好，正常发挥',
  利: '能量尚可，略有助力',
  平: '能量中性，无明显增减',
  不: '能量受限，需后天努力弥补',
  陷: '能量发挥困难，该星特质不易展现',
};

export function brightnessFindings(chart: ZiweiChartResult): ZiweiRuleFinding[] {
  const out: ZiweiRuleFinding[] = [];
  const soulPalace = chart.palaces.find((p) => p.isSoulPalace);
  if (!soulPalace) return out;
  for (const star of soulPalace.majorStars) {
    if (!star.brightness) continue;
    const effect = BRIGHTNESS_EFFECT[star.brightness];
    if (!effect) continue;
    out.push({
      ruleId: `brightness/${star.name}-${star.brightness}`,
      topic: 'brightness',
      matched: true,
      claim: `命宫${star.name}亮度"${star.brightness}"：${effect}`,
      source: SRC,
      reason: `${star.name}在命宫亮度为"${star.brightness}"，影响该星特质的发挥程度`,
    });
  }
  return out;
}
