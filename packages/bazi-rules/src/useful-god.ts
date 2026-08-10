import type { BaziChartResult, BaziRuleFinding } from '@loom/contracts';
import { assessStrength } from './strength.ts';
import { elementsByRelation, type Element } from './fundamentals.ts';
import { distributionPhrase, missingElements, wealthRoot } from './distribution.ts';

/**
 * Useful-god direction (喜用神) via the 扶抑 (support-the-weak / restrain-the-strong)
 * principle of 《滴天髓》: a strong day master favors output/wealth/officer (泄耗克) and
 * a weak one favors resource/peers (生扶). When the day master is balanced, strength
 * alone cannot name the useful god — the finding is honestly left unmatched and deferred
 * to pattern/climate (调候) analysis rather than forced. The `reason` states the WHY a
 * reading should lead with (e.g. "身强、印比偏重、正财两透且财星有根 → 喜水木、需金疏土生财").
 */
export function usefulGodFinding(bazi: BaziChartResult): BaziRuleFinding {
  const s = assessStrength(bazi);
  const el = elementsByRelation(bazi.dayMaster.element as Element);
  const dist = distributionPhrase(bazi);
  const wr = wealthRoot(bazi);
  const missing = missingElements(bazi);
  const lacks = (e: string): boolean => (missing as string[]).includes(e);

  let claim: string;
  let reason: string;
  if (s.verdict === 'strong') {
    // Strong → drain/consume/control: favor 食伤(output) / 财(wealth) / 官杀(officer).
    claim = `扶抑：日主偏强，宜泄宜耗宜克——喜「${el.output}(食伤)、${el.wealth}(财)、${el.officer}(官杀)」为用`;
    reason =
      `身强、${dist}，${bazi.dayMaster.element}旺需要出口：` +
      `以${el.output}泄秀、${el.wealth}耗身、${el.officer}制身为宜` +
      (wr.rooted
        ? `；财星(${el.wealth})有根，行财官更能落地`
        : `；惜财星(${el.wealth})无根，财运须待岁运引助`) +
      (lacks(el.output)
        ? `；命局缺${el.output}(食伤)——非无创造力，然持续输出、商业包装、定价与标准化需后天训练，尤需岁运补${el.output}`
        : '') +
      `；然${el.officer}(官杀)虽为喜用，逢${el.officer}旺之运则由用转病、压力随增，非多多益善。`;
  } else if (s.verdict === 'weak') {
    // Weak → generate/support: favor 印(resource) / 比劫(peers).
    claim = `扶抑：日主偏弱，宜生宜帮——喜「${el.resource}(印)、${el.same}(比劫)」为用`;
    reason =
      `身弱、${dist}，${bazi.dayMaster.element}不足需要生扶：` +
      `以${el.resource}生身、${el.same}帮身为宜；忌${el.officer}(官杀)、${el.wealth}(财)进一步耗克` +
      (lacks(el.resource)
        ? `；命局缺${el.resource}(印)，生身之源不足，尤需岁运补${el.resource}。`
        : '。');
  } else {
    claim = '扶抑：日主中和，喜用须随格局与调候另定（本规则不妄断）';
    reason = `身中和、${dist}；强弱两平时喜忌需结合格局成败与调候（寒暖燥湿）细定，本规则不强断。`;
  }

  return {
    ruleId: 'useful-god/fu-yi',
    topic: 'useful-god',
    matched: s.verdict !== 'balanced',
    claim,
    source: { text: '滴天髓', chapter: '旺衰' },
    detail: `强弱判定见 strength 规则（参考分${s.score}）。"强则抑之、弱则扶之"为大法；用字仍需结合格局与调候进一步细论。`,
    reason,
  };
}
