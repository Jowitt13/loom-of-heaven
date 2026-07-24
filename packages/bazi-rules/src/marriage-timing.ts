import type { BaziChartResult, BaziRuleFinding } from '@ming/contracts';
import { tenGodCategory, tenGodOf } from './fundamentals.ts';
import { branchPairRelation, crossBranchRelation } from './relations.ts';
import { BRANCH_MAIN_STEM, yearGanzhi } from './fortune.ts';

/**
 * 婚姻 / 正缘应期 (marriage-timing windows) — a deterministic candidate-year scan for the
 * "什么时候会结婚 / 正缘什么时候来" questions. Signals per 流年, all sourced from the chart:
 *   - 配偶星临 (男取财、女取官) on the year stem or branch main-qi;
 *   - 流年支 合 the 夫妻宫 (日支) — a 姻缘引动;
 *   - 桃花(咸池) 引动;
 *   - 流年支 冲 夫妻宫 — an emotional turning point (may be 成 OR 变, marked as such).
 * It is a window of opportunity, never a "必婚 at year X" verdict.
 */

/** 桃花(咸池) branch keyed off the day branch's 三合 group (申子辰→酉 …). */
const PEACH: Record<string, string> = {
  申: '酉',
  子: '酉',
  辰: '酉',
  寅: '卯',
  午: '卯',
  戌: '卯',
  巳: '午',
  酉: '午',
  丑: '午',
  亥: '子',
  卯: '子',
  未: '子',
};

/** 自刑支 (辰午酉亥)：同支相逢则自刑/伏吟。 */
const SELF_PUNISH = new Set(['辰', '午', '酉', '亥']);

export function marriageTimingFinding(
  bazi: BaziChartResult,
  gender: 'male' | 'female' | 'unspecified' | undefined,
  focusYear: number,
): BaziRuleFinding | null {
  // The spouse star is gender-defined (男财女官); without gender we cannot anchor it honestly.
  if (gender !== 'male' && gender !== 'female') return null;
  const day = bazi.dayMaster.stem;
  const dayBranch = bazi.pillars.day.branch;
  const spouseCat = gender === 'male' ? '财' : '官杀';
  const peach = PEACH[dayBranch];
  // 本命四支 — 用于 自刑/伏吟/相害 的应期判断.
  const natal: Array<{ label: string; branch: string }> = [
    { label: '年', branch: bazi.pillars.year.branch },
    { label: '月', branch: bazi.pillars.month.branch },
    { label: '日', branch: bazi.pillars.day.branch },
  ];
  if (bazi.pillars.hour) natal.push({ label: '时', branch: bazi.pillars.hour.branch });

  const hits: string[] = [];
  for (let y = focusYear; y <= focusYear + 11; y++) {
    const gz = yearGanzhi(y);
    const strong: string[] = []; // 推进类 (配偶星临/合夫妻宫)
    const turbulent: string[] = []; // 变动/反复类 (冲/自刑/伏吟/害)
    const weak: string[] = []; // 桃花等弱信号

    const stemGod = tenGodOf(day, gz.stem);
    const branchGod = tenGodOf(day, BRANCH_MAIN_STEM[gz.branch] ?? '');
    if (tenGodCategory(stemGod) === spouseCat || tenGodCategory(branchGod) === spouseCat) {
      strong.push('配偶星临');
    }
    const relDay = branchPairRelation(gz.branch, dayBranch);
    if (relDay?.kind === '合') strong.push('合夫妻宫(日支)');
    if (relDay?.kind === '冲') turbulent.push('冲夫妻宫');
    if (gz.branch === peach) weak.push('桃花动');
    // 自刑/伏吟/相害/相刑 vs 本命各支.
    for (const t of natal) {
      if (gz.branch === t.branch) {
        turbulent.push(
          SELF_PUNISH.has(gz.branch)
            ? `${gz.branch}${gz.branch}自刑/伏吟(${t.label}支)`
            : `伏吟${t.label}支`,
        );
        continue;
      }
      const rel = crossBranchRelation(gz.branch, t.branch);
      if (rel?.kind === '害') turbulent.push(`害${t.label}支`);
      else if (rel?.kind === '刑') turbulent.push(`刑${t.label}支`);
    }
    if (strong.length === 0 && turbulent.length === 0 && weak.length === 0) continue;

    const tags = [...strong, ...turbulent, ...weak];
    const verdict =
      strong.length > 0 && turbulent.length > 0
        ? '推进机会但易反复/需调整'
        : strong.length > 0
          ? '推进机会'
          : turbulent.length > 0
            ? '变动/反复'
            : '桃花/异性缘(非等于婚期)';
    hits.push(`${y}(${gz.stem}${gz.branch}) ${tags.join('、')}→${verdict}`);
  }
  if (hits.length === 0) return null;

  return {
    ruleId: 'marriage-timing',
    topic: 'fortune',
    matched: true,
    claim: `婚姻/正缘应期(参考，${focusYear}起十二年)：${hits.join('；')}`,
    polarity: '中性',
    source: { text: '三命通会', chapter: '论婚姻' },
    reason:
      `以配偶星(${gender === 'male' ? '男取财' : '女取官'})临岁、流年合夫妻宫(日支)为推进机会信号；` +
      `逢冲/自刑/伏吟/相害之年主变动、反复、需调整(非吉亦非必分)；桃花年为异性缘/机会的弱信号、不等于婚期；` +
      `应期是机会窗口而非"必婚之年"，能否成婚仍取决于双方意愿与现实条件。`,
  };
}
