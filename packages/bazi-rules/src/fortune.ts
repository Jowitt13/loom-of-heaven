import type { BaziChartResult, BaziRuleFinding } from '@ming/contracts';
import { assessStrength } from './strength.ts';
import { elementRelation, tenGodOf, tenGodCategory, type Element } from './fundamentals.ts';
import { branchPairRelation } from './relations.ts';

/**
 * Luck-cycle fortune (大运吉凶) leaning. Combines the 扶抑 useful-god direction with each
 * decade cycle's dominant element: a cycle that supplies a favorable element leans 吉, an
 * unfavorable one leans 凶, otherwise 中性. Deterministic and reason-bearing; it is a
 * structural leaning (per 《滴天髓》 喜忌), not a fated verdict, and every claim states why.
 * Annual (流年) leanings are produced the same way by the interpret layer when a year is given.
 */

const STEM_ELEMENT: Record<string, Element> = {
  甲: '木',
  乙: '木',
  丙: '火',
  丁: '火',
  戊: '土',
  己: '土',
  庚: '金',
  辛: '金',
  壬: '水',
  癸: '水',
};
const BRANCH_ELEMENT: Record<string, Element> = {
  寅: '木',
  卯: '木',
  巳: '火',
  午: '火',
  申: '金',
  酉: '金',
  亥: '水',
  子: '水',
  辰: '土',
  戌: '土',
  丑: '土',
  未: '土',
};

type Category = '比劫' | '印' | '食伤' | '财' | '官杀';
function categoryOf(day: Element, other: Element): Category {
  switch (elementRelation(day, other)) {
    case 'same':
      return '比劫';
    case 'generates-me':
      return '印';
    case 'i-generate':
      return '食伤';
    case 'i-control':
      return '财';
    case 'controls-me':
      return '官杀';
  }
}

/** Polarity of a category given the day-master strength verdict. */
export function polarityForCategory(
  verdict: 'strong' | 'balanced' | 'weak',
  cat: Category,
): '吉' | '凶' | '中性' {
  if (verdict === 'balanced') return '中性';
  const supportive = cat === '印' || cat === '比劫'; // 生扶
  if (verdict === 'weak') return supportive ? '吉' : '凶';
  // strong → drain/consume/control good; support bad
  return supportive ? '凶' : '吉';
}

/** Per-major-cycle 吉凶 leanings against the day-master's 喜忌. */
export function luckCycleFortuneFindings(bazi: BaziChartResult): BaziRuleFinding[] {
  const cycle = bazi.luckCycle;
  if (!cycle) return [];
  const day = bazi.dayMaster.element as Element;
  const s = assessStrength(bazi);
  const favor =
    s.verdict === 'strong'
      ? '喜食伤/财/官杀（泄耗克）'
      : s.verdict === 'weak'
        ? '喜印/比劫（生扶）'
        : '强弱中和，喜忌两可';

  return cycle.majorCycles.map((m) => {
    const stemEl = STEM_ELEMENT[m.stem] ?? day;
    const branchEl = BRANCH_ELEMENT[m.branch] ?? day;
    const stemCat = categoryOf(day, stemEl);
    const branchCat = categoryOf(day, branchEl);
    const stemPol = polarityForCategory(s.verdict, stemCat);
    const branchPol = polarityForCategory(s.verdict, branchCat);
    // Overall: 吉 if both good, 凶 if both bad, else 中性 (mixed).
    const polarity: '吉' | '凶' | '中性' = stemPol === branchPol ? stemPol : '中性';
    const range = `${m.startYear}年起(${m.startAge}-${m.endAge}岁)`;
    const reason = `${m.stem}${m.branch}大运：天干${m.stem}(${stemEl}/${stemCat})、地支${m.branch}(${branchEl}/${branchCat})；本命${favor}，故此运偏${polarity}。`;
    return {
      ruleId: `fortune/dayun/${m.index}`,
      topic: 'fortune',
      matched: true,
      claim: `${range} 行${m.stem}${m.branch}运，偏${polarity}`,
      polarity,
      source: { text: '滴天髓', chapter: '喜忌' },
      reason,
    };
  });
}

const BRANCHES_ORDER = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const STEMS_ORDER = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];

/** Gan-zhi of a solar year (1984 = 甲子). Deterministic 流年 stem/branch. */
export function yearGanzhi(year: number): { stem: string; branch: string } {
  const s = (((year - 4) % 10) + 10) % 10;
  const b = (((year - 4) % 12) + 12) % 12;
  return { stem: STEMS_ORDER[s]!, branch: BRANCHES_ORDER[b]! };
}

/** Main-qi (本气) stem of each branch — for the 流年 地支十神. */
export const BRANCH_MAIN_STEM: Record<string, string> = {
  子: '癸',
  丑: '己',
  寅: '甲',
  卯: '乙',
  辰: '戊',
  巳: '丙',
  午: '丁',
  未: '己',
  申: '庚',
  酉: '辛',
  戌: '戊',
  亥: '壬',
};
/** 6-合 (六合) resulting element, for annotating a 流年合. */
const LIU_HE_ELEMENT: Record<string, string> = {
  子丑: '土',
  寅亥: '木',
  卯戌: '火',
  辰酉: '金',
  巳申: '水',
  午未: '土',
};
function liuHeElement(a: string, b: string): string | undefined {
  return LIU_HE_ELEMENT[a + b] ?? LIU_HE_ELEMENT[b + a];
}

/** 流年 十神类别 → life-theme tag, for the 逐年主题标注 (婚/财/事业/学业/健康 …). */
const YEAR_THEME: Record<string, string> = {
  财: '财运/投资',
  官杀: '事业/责任',
  印: '学业/文书/贵人',
  食伤: '表达/才艺/子女',
  比劫: '人际/竞合/理财谨慎',
};

/**
 * Per-year 流年 timeline for `[focusYear, focusYear+11]`. Each year gets one sourced fact:
 * 天干十神 + 地支本气十神 + the year branch's 合/冲/刑/害 vs the four 本命 branches and the
 * 当运大运支. polarity is the 喜忌 leaning of the year's 天干/地支 categories; every reason ends with
 * "非整年单一定性" so the host does not over-read a whole element-year as uniformly good/bad.
 */
export function annualTimelineFindings(
  bazi: BaziChartResult,
  focusYear: number,
): BaziRuleFinding[] {
  const day = bazi.dayMaster.stem;
  const dayEl = bazi.dayMaster.element as Element;
  const s = assessStrength(bazi);
  const natal: Array<{ label: string; branch: string }> = [
    { label: '年', branch: bazi.pillars.year.branch },
    { label: '月', branch: bazi.pillars.month.branch },
    { label: '日', branch: bazi.pillars.day.branch },
  ];
  if (bazi.pillars.hour) natal.push({ label: '时', branch: bazi.pillars.hour.branch });
  const cycles = bazi.luckCycle?.majorCycles ?? [];

  const out: BaziRuleFinding[] = [];
  for (let y = focusYear; y <= focusYear + 11; y++) {
    const gz = yearGanzhi(y);
    const stemGod = tenGodOf(day, gz.stem) ?? '—';
    const branchGod = tenGodOf(day, BRANCH_MAIN_STEM[gz.branch] ?? '') ?? '—';
    const cyc = cycles.find(
      (m) => y >= m.startYear && y <= m.startYear + Math.max(0, m.endAge - m.startAge),
    );

    const events: string[] = [];
    for (const t of natal) {
      const rel = branchPairRelation(gz.branch, t.branch);
      if (!rel) continue;
      const he = rel.kind === '合' ? liuHeElement(gz.branch, t.branch) : undefined;
      events.push(`${rel.kind}${t.label}支${t.branch}${he ? `(化${he})` : ''}`);
    }
    if (cyc) {
      const rel = branchPairRelation(gz.branch, cyc.branch);
      if (rel) events.push(`${rel.kind}大运${cyc.branch}`);
    }
    const eventsText = events.length ? `；地支${events.join('、')}` : '';
    const hasChong = events.some((e) => e.startsWith('冲'));

    const stemCat = categoryOf(dayEl, STEM_ELEMENT[gz.stem] ?? dayEl);
    const branchCat = categoryOf(dayEl, BRANCH_ELEMENT[gz.branch] ?? dayEl);
    const stemPol = polarityForCategory(s.verdict, stemCat);
    const branchPol = polarityForCategory(s.verdict, branchCat);
    const polarity: '吉' | '凶' | '中性' = stemPol === branchPol ? stemPol : '中性';

    // 主题标注 (婚/财/事业/学业/健康 …) 由当年十神 + 合/冲夫妻宫(日支) 导出.
    const themes = new Set<string>();
    for (const g of [stemGod, branchGod]) {
      const t = YEAR_THEME[tenGodCategory(g) ?? ''];
      if (t) themes.add(t);
    }
    const dayRel = branchPairRelation(gz.branch, bazi.pillars.day.branch);
    if (dayRel?.kind === '合' || dayRel?.kind === '冲') themes.add('感情/婚');
    if (hasChong && polarity === '凶') themes.add('健康/防耗');
    const themeText = themes.size ? `；主题：${[...themes].join('、')}` : '';

    const claim = `${y}(${gz.stem}${gz.branch})：天干${gz.stem}${stemGod}、地支${gz.branch}${branchGod}${eventsText}${themeText}`;
    out.push({
      ruleId: `fortune/liunian/${y}`,
      topic: 'fortune',
      matched: true,
      claim,
      polarity,
      source: { text: '三命通会', chapter: '论流年' },
      reason: `${claim}。${hasChong ? '逢冲主变动/转折；' : ''}吉凶须结合当年天干十神、合冲与官杀强弱综合，非整年单一定性。`,
    });
  }
  return out;
}

/**
 * Compact per-year 流年 signal for cross-chart 共振 (合婚): the year's 喜忌 leaning plus
 * whether the year branch 冲 the 夫妻宫(日支). Two people sharing 吉 years (同吉) or both
 * being 冲动 in the same year (同冲) is a resonance/应期 signal. Same 扶抑 basis as
 * `annualTimelineFindings`; a shared window, never a fated verdict.
 */
export function annualResonance(
  bazi: BaziChartResult,
  year: number,
): { polarity: '吉' | '凶' | '中性'; chongSpousePalace: boolean } {
  const dayEl = bazi.dayMaster.element as Element;
  const s = assessStrength(bazi);
  const gz = yearGanzhi(year);
  const stemCat = categoryOf(dayEl, STEM_ELEMENT[gz.stem] ?? dayEl);
  const branchCat = categoryOf(dayEl, BRANCH_ELEMENT[gz.branch] ?? dayEl);
  const stemPol = polarityForCategory(s.verdict, stemCat);
  const branchPol = polarityForCategory(s.verdict, branchCat);
  const polarity: '吉' | '凶' | '中性' = stemPol === branchPol ? stemPol : '中性';
  const chongSpousePalace = branchPairRelation(gz.branch, bazi.pillars.day.branch)?.kind === '冲';
  return { polarity, chongSpousePalace };
}

/**
 * 大运/流年 对本命地支的冲合 (timing / 应期). Two kinds of grounded turning points:
 *   (a) a 大运 branch 冲/合 the 日支 or 月支 (pivotal self/career palaces);
 *   (b) 流年 years that 冲 the 日支 or the 当运大运支 — e.g. 2028 戊申 申冲寅 — summarised per 大运.
 * 冲 is a change/turning marker, not a verdict; the reason says so.
 */
export function luckClashFindings(bazi: BaziChartResult): BaziRuleFinding[] {
  const cycle = bazi.luckCycle;
  if (!cycle) return [];
  const out: BaziRuleFinding[] = [];
  const dayBranch = bazi.pillars.day.branch;
  const monthBranch = bazi.pillars.month.branch;

  // (a) 大运支 冲/合 日支/月支.
  for (const m of cycle.majorCycles) {
    for (const t of [
      { label: '日支', branch: dayBranch },
      { label: '月支', branch: monthBranch },
    ]) {
      const rel = branchPairRelation(m.branch, t.branch);
      if (rel && (rel.kind === '冲' || rel.kind === '合')) {
        out.push({
          ruleId: `fortune/dayun-clash/${m.index}/${t.label}`,
          topic: 'fortune',
          matched: true,
          claim: `${m.startYear}年起(${m.startAge}-${m.endAge}岁) ${m.stem}${m.branch}大运${rel.kind}${t.label}${t.branch}`,
          polarity: rel.polarity,
          source: { text: '三命通会', chapter: '论大运' },
          reason: `大运地支${m.branch}与本命${t.label}${t.branch}相${rel.kind}（${rel.note}）：${rel.kind === '冲' ? '主位置/环境/方向易变动' : '主相对稳定或有牵合'}，为变动/转折之机，非吉凶定论。`,
        });
      }
    }
  }

  // (b) 流年 冲日支 或 冲当运大运支, summarised per 大运.
  for (const m of cycle.majorCycles) {
    const years: string[] = [];
    const span = Math.max(0, m.endAge - m.startAge);
    for (let y = m.startYear; y <= m.startYear + span; y++) {
      const gz = yearGanzhi(y);
      const hitsDay = branchPairRelation(gz.branch, dayBranch)?.kind === '冲';
      const hitsYun = branchPairRelation(gz.branch, m.branch)?.kind === '冲';
      if (hitsDay || hitsYun) {
        const tgt = [hitsDay ? `冲日支${dayBranch}` : '', hitsYun ? `冲大运${m.branch}` : '']
          .filter(Boolean)
          .join('、');
        years.push(`${y}(${gz.stem}${gz.branch})${tgt}`);
      }
    }
    if (years.length > 0) {
      out.push({
        ruleId: `fortune/liunian-chong/${m.index}`,
        topic: 'fortune',
        matched: true,
        claim: `${m.stem}${m.branch}大运内变动应期：${years.join('；')}`,
        polarity: '凶',
        source: { text: '三命通会', chapter: '论流年' },
        reason:
          '流年地支冲本命日支或冲大运支，多主环境/职位/居所/方向之变动（变动非必凶，宜主动求变、防波动）。',
      });
    }
  }
  return out;
}
