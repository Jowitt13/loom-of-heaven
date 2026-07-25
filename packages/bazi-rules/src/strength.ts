import type { BaziChartResult, BaziPillar, BaziRuleFinding } from '@ming/contracts';
import { elementRelation, type Element } from './fundamentals.ts';
import { distributionPhrase, multiplyTransparent, wealthRoot } from './distribution.ts';

/**
 * Day-master strength (旺衰强弱) assessment. The qualitative framework is 得令 / 得地 /
 * 得势 — whether the day master is supported by the season (月令), rooted in the branches
 * (通根), and helped by other stems (帮扶) — from 《子平真诠·论用神》. The numeric score
 * is this ruleset's deterministic operationalization of that framework; it is a scale,
 * not an absolute truth.
 */

export interface StrengthAssessment {
  /** True when the month branch's main qi shares or generates the day-master element. */
  deLing: boolean;
  /** Root count (得地): year/day/hour branches whose main qi matches the day master. */
  roots: number;
  /** Supporting-stem count (得势): 比肩/劫财/正印/偏印 among year/month/hour stems. */
  support: number;
  score: number;
  verdict: 'strong' | 'balanced' | 'weak';
  detail: string;
}

const SUPPORT_GODS = new Set(['比肩', '劫财', '正印', '偏印']);

function primaryQi(pillar: BaziPillar): { stem: string; element: string } {
  const qi = pillar.hiddenStems.find((h) => h.primary);
  return qi ?? { stem: pillar.branch, element: pillar.branchElement };
}

export function assessStrength(bazi: BaziChartResult): StrengthAssessment {
  const dayElement = bazi.dayMaster.element as Element;
  const monthQi = primaryQi(bazi.pillars.month);

  // 得令: does the season (月令本气) support the day master? 禄刃(比劫)当令 is the
  // strongest seasonal support; 印(生我)当令 is the next.
  const seasonRel = elementRelation(dayElement, monthQi.element as Element);
  const seasonIsBlade = seasonRel === 'same'; // 比劫当令 (禄/刃)
  const seasonStrong = seasonIsBlade || seasonRel === 'generates-me'; // 得令

  // 得地: roots — year/month/day/hour branches whose main qi matches the day master
  // (the 月令 itself counts as a root; hour is null when the time is unknown).
  const branchPillars = [
    bazi.pillars.year,
    bazi.pillars.month,
    bazi.pillars.day,
    bazi.pillars.hour,
  ].filter((p): p is BaziPillar => p !== null);
  const roots = branchPillars.filter((p) => primaryQi(p).element === dayElement).length;

  // 得势: stems among year/month/hour whose ten-god supports the day master.
  const support = [bazi.pillars.year, bazi.pillars.month, bazi.pillars.hour]
    .filter((p): p is BaziPillar => p !== null)
    .filter((p) => p.tenGod !== null && SUPPORT_GODS.has(p.tenGod)).length;

  // Verdict (per the 子平真诠 framework): 禄刃当令 → strong; 印当令 with root/help →
  // strong; losing the season but rooted/helped → balanced; otherwise weak.
  let verdict: 'strong' | 'balanced' | 'weak';
  if (seasonIsBlade) {
    verdict = 'strong';
  } else if (seasonStrong) {
    verdict = roots >= 1 || support >= 1 ? 'strong' : 'balanced';
  } else if (roots >= 2 || (roots >= 1 && support >= 1)) {
    verdict = 'balanced';
  } else {
    verdict = 'weak';
  }

  const score = (seasonIsBlade ? 3 : seasonStrong ? 2 : 0) + roots + support;
  const detail = `得令${seasonStrong ? (seasonIsBlade ? '✓禄刃' : '✓印') : '✗'}(月支${bazi.pillars.month.branch}本气${monthQi.stem}${monthQi.element})·得地${roots}根·得势${support}干·参考分${score}`;
  return { deLing: seasonStrong, roots, support, score, verdict, detail };
}

export function strengthFinding(bazi: BaziChartResult): BaziRuleFinding {
  const a = assessStrength(bazi);
  const verdictText =
    a.verdict === 'strong'
      ? '日主偏强（得令得地得势偏多，克泄耗之物可为用）'
      : a.verdict === 'weak'
        ? '日主偏弱（帮扶偏少，生扶之物可为用）'
        : '日主中和（强弱较为平衡，须结合格局细论）';

  // Reason chain: distribution + transparency (透干) + rootedness (通根).
  const dist = distributionPhrase(bazi);
  const transes = multiplyTransparent(bazi)
    .map((t) => `${t.tenGod}${t.count === 2 ? '两透' : `${t.count}透`}`)
    .join('、');
  const wr = wealthRoot(bazi);
  const reasonParts = [
    a.verdict === 'strong' ? '身强' : a.verdict === 'weak' ? '身弱' : '身中和',
    dist,
  ];
  if (transes) reasonParts.push(transes);
  reasonParts.push(`财星(${wr.element})${wr.rooted ? '有根' : '无根'}`);
  const reason = reasonParts.join('、');

  return {
    ruleId: 'strength/de-ling-de-di-de-shi',
    topic: 'strength',
    matched: true,
    claim: `${bazi.dayMaster.stem}${bazi.dayMaster.element}日主：${verdictText}`,
    source: { text: '子平真诠', chapter: '论用神' },
    detail: a.detail,
    reason,
  };
}
