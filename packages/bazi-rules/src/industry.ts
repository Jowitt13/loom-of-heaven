import type { BaziChartResult, BaziRuleFinding } from '@loom/contracts';
import { assessStrength } from './strength.ts';
import { elementsByRelation, type Element } from './fundamentals.ts';

/**
 * 适合行业方向 (industry orientation) from the 喜用神 five-element direction. A common
 * 五行配业 mapping (大类，参考非唯一): the useful-god elements point at industry families.
 * This is a tendency, not a job prescription — real choice also weighs 食伤(专业输出)、
 * 官杀(体制/管理) and personal interest, which the reading is told to add.
 */
const INDUSTRY: Record<Element, string> = {
  金: '金融/机械/IT硬件/五金/珠宝/汽车/法务',
  木: '文教/出版/木业/服装/医药/园林/设计',
  水: '贸易/物流/流动性/水产/旅游/传媒/互联网',
  火: '能源/电子/餐饮/传媒/照明/文创/教育培训',
  土: '地产/建筑/农业/仓储/陶瓷/中介/管理',
};

export function industryFinding(bazi: BaziChartResult): BaziRuleFinding {
  const s = assessStrength(bazi);
  const el = elementsByRelation(bazi.dayMaster.element as Element);
  const favored: Element[] =
    s.verdict === 'strong'
      ? [el.output, el.wealth, el.officer]
      : s.verdict === 'weak'
        ? [el.resource, el.same]
        : [el.output, el.resource];
  const uniq = [...new Set(favored)];
  const list = uniq.map((e) => `${e}(${INDUSTRY[e]})`).join('；');
  return {
    ruleId: 'industry/wu-xing',
    topic: 'useful-god',
    matched: s.verdict !== 'balanced',
    claim: `适合行业方向(按喜用五行)：${list}`,
    source: { text: '三命通会', chapter: '论五行' },
    reason:
      `以喜用神五行取行业大类：${uniq.join('、')}相关领域较相合；` +
      `还需结合食伤(专业输出/技能)、官杀(体制/管理)与现实兴趣，属参考方向而非唯一答案。`,
  };
}
