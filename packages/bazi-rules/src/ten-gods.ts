import type { BaziChartResult, BaziRuleFinding } from '@ming/contracts';

/**
 * Ten-god symbolic meanings (十神象义), summarized from 《渊海子平》. These are the
 * conventional meanings attached to each ten-god present in the chart — a deterministic
 * lookup keyed off the chart's own ten-god placements, not a fabricated reading.
 */
export const TEN_GOD_MEANINGS: Record<string, string> = {
  正官: '正官：贵气、地位、自律、责任，女命之夫星。',
  七杀: '七杀：权威、魄力、压力、竞争，需制化为权。',
  正财: '正财：正当财禄、勤俭、务实，男命之妻星。',
  偏财: '偏财：意外之财、经营、慷慨、父亲。',
  正印: '正印：学业、文书、庇护、母亲、贵人。',
  偏印: '偏印(枭神)：偏门学问、技艺、孤独、继母。',
  食神: '食神：福禄、才华、表达、子女、享乐。',
  伤官: '伤官：聪明、傲气、创造、叛逆、口舌。',
  比肩: '比肩：自我、独立、兄弟朋友、合作与竞争。',
  劫财: '劫财：争夺、破耗、果敢、行动力。',
};

export function tenGodsFinding(bazi: BaziChartResult): BaziRuleFinding {
  const stems = [bazi.pillars.year, bazi.pillars.month, bazi.pillars.day, bazi.pillars.hour].filter(
    (p): p is NonNullable<typeof p> => p !== null,
  );
  const unique = [...new Set(stems.map((p) => p.tenGod).filter((g): g is string => g !== null))];
  const detail = unique.map((g) => TEN_GOD_MEANINGS[g] ?? g).join(' ');
  return {
    ruleId: 'ten-gods/xiang-yi',
    topic: 'ten-gods',
    matched: true,
    claim: `命局所见十神：${unique.join('、') || '（仅日主，未透他干）'}`,
    source: { text: '渊海子平', chapter: '论十神' },
    detail,
  };
}
