import type { WesternChartResult, WesternRuleFinding } from '@loom/contracts';

/**
 * Aspect meaning rules. Sun-Moon aspects and luminaries to major planets.
 * Source: Ptolemy, Tetrabiblos (public domain).
 */

const SRC = { text: 'Ptolemy, Tetrabiblos', chapter: 'Book I, aspects and their effects' };

const ASPECT_MEANINGS: Record<string, string> = {
  conjunction: '能量融合、主题叠加强化',
  opposition: '内在张力、需要整合对立面',
  square: '成长压力、需要突破但有阻力',
  trine: '能量和谐流动、天然优势',
  sextile: '有发展机会、需要主动把握',
};

export function aspectFindings(chart: WesternChartResult): WesternRuleFinding[] {
  const out: WesternRuleFinding[] = [];
  const luminaries = new Set(['Sun', 'Moon']);
  for (const asp of chart.aspects) {
    // Only include aspects involving at least one luminary
    if (!luminaries.has(asp.bodyA) && !luminaries.has(asp.bodyB)) continue;
    const meaning = ASPECT_MEANINGS[asp.type];
    if (!meaning) continue;
    out.push({
      ruleId: `aspect/${asp.bodyA.toLowerCase()}-${asp.type}-${asp.bodyB.toLowerCase()}`,
      topic: 'aspect',
      matched: true,
      claim: `${asp.bodyA}与${asp.bodyB}${asp.type}：${meaning}`,
      source: SRC,
      reason: `${asp.bodyA}和${asp.bodyB}形成${asp.type}相位（容许度${asp.orbDeg.toFixed(1)}°），两者主题产生互动`,
    });
  }
  return out;
}
