import type { BaziChartResult, BaziPillar } from '@ming/contracts';
import {
  elementsByRelation,
  tenGodCategory,
  type Element,
  type TenGodCategory,
} from './fundamentals.ts';

/**
 * Structural tallies read off a computed BaZi chart: ten-god distribution, which
 * ten-gods are transparent on the stems (透干 / 两透), and whether an element has a
 * root in the branches (通根). Pure counting over the chart's own facts — the raw
 * material every reason chain ("身强、印比偏重、正财两透且财星有根 …") is built from.
 */

/** Non-null pillars in year/month/day/hour order. */
export function presentPillars(bazi: BaziChartResult): BaziPillar[] {
  return [bazi.pillars.year, bazi.pillars.month, bazi.pillars.day, bazi.pillars.hour].filter(
    (p): p is BaziPillar => p !== null,
  );
}

/** Year/month/hour stems (the day stem is the day master itself, excluded). */
function nonDayStemPillars(bazi: BaziChartResult): BaziPillar[] {
  return [bazi.pillars.year, bazi.pillars.month, bazi.pillars.hour].filter(
    (p): p is BaziPillar => p !== null,
  );
}

/** Count of each ten-god category across the non-day stems + every branch's main qi. */
export function tenGodDistribution(bazi: BaziChartResult): Record<TenGodCategory, number> {
  const dist: Record<TenGodCategory, number> = { 比劫: 0, 印: 0, 食伤: 0, 财: 0, 官杀: 0 };
  for (const p of nonDayStemPillars(bazi)) {
    const cat = tenGodCategory(p.tenGod);
    if (cat) dist[cat] += 1;
  }
  for (const p of presentPillars(bazi)) {
    const qi = p.hiddenStems.find((h) => h.primary);
    const cat = tenGodCategory(qi?.tenGod);
    if (cat) dist[cat] += 1;
  }
  return dist;
}

/** How many of the year/month/hour stems carry each ten-god name (透干 count). */
export function transparentTenGods(bazi: BaziChartResult): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of nonDayStemPillars(bazi)) {
    if (p.tenGod) m.set(p.tenGod, (m.get(p.tenGod) ?? 0) + 1);
  }
  return m;
}

/** True when `element` appears among any branch's hidden stems (通根). */
export function hasRoot(bazi: BaziChartResult, element: Element): boolean {
  return presentPillars(bazi).some((p) => p.hiddenStems.some((h) => h.element === element));
}

/** Human phrase for the distribution, e.g. "印比偏重、财官偏轻". */
export function distributionPhrase(bazi: BaziChartResult): string {
  const d = tenGodDistribution(bazi);
  const resourcePeers = d.印 + d.比劫;
  const wealthOfficer = d.财 + d.官杀;
  const parts: string[] = [];
  if (resourcePeers >= 4) parts.push('印比偏重');
  else if (resourcePeers <= 1) parts.push('印比偏轻');
  if (wealthOfficer >= 4) parts.push('财官偏重');
  else if (wealthOfficer <= 1) parts.push('财官偏轻');
  if (d.食伤 >= 3) parts.push('食伤偏重');
  return parts.length > 0 ? parts.join('、') : '五行分布较均衡';
}

/** Names of ten-gods that appear on two or more stems (两透/三透). */
export function multiplyTransparent(
  bazi: BaziChartResult,
): Array<{ tenGod: string; count: number }> {
  const out: Array<{ tenGod: string; count: number }> = [];
  for (const [tenGod, count] of transparentTenGods(bazi)) {
    if (count >= 2) out.push({ tenGod, count });
  }
  return out;
}

/** Whether the wealth element (财) has a branch root, with the element name. */
export function wealthRoot(bazi: BaziChartResult): { element: Element; rooted: boolean } {
  const wealth = elementsByRelation(bazi.dayMaster.element as Element).wealth;
  return { element: wealth, rooted: hasRoot(bazi, wealth) };
}

const ALL_ELEMENTS: Element[] = ['木', '火', '土', '金', '水'];

/** Count every stem + hidden stem's element across the present pillars. */
export function elementTally(bazi: BaziChartResult): Record<Element, number> {
  const t: Record<Element, number> = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  for (const p of presentPillars(bazi)) {
    if (p.stemElement in t) t[p.stemElement as Element] += 1;
    for (const h of p.hiddenStems) if (h.element in t) t[h.element as Element] += 1;
  }
  return t;
}

/** Elements entirely absent from the chart (命局缺 X). */
export function missingElements(bazi: BaziChartResult): Element[] {
  const t = elementTally(bazi);
  return ALL_ELEMENTS.filter((e) => t[e] === 0);
}
