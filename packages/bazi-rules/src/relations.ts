import type { BaziChartResult, BaziRuleFinding } from '@loom/contracts';
import { tenGodCategory } from './fundamentals.ts';

/**
 * Branch relations (地支刑冲合害) among the four pillars — the raw "吉凶" geometry a
 * reading leans on (夫妻宫被冲、三合成局 …). Deterministic table lookup sourced to
 * 《三命通会·论刑冲破害》; polarity marks harmonious (合/会 → 吉) vs conflicting
 * (冲/刑/害/破 → 凶) so the host can weight them. Combinations with 大运/流年 are added
 * by the fortune rule; this module covers the natal four pillars.
 */

interface Pillared {
  label: string; // 年/月/日/时
  branch: string;
}

function branches(bazi: BaziChartResult): Pillared[] {
  const out: Pillared[] = [
    { label: '年', branch: bazi.pillars.year.branch },
    { label: '月', branch: bazi.pillars.month.branch },
    { label: '日', branch: bazi.pillars.day.branch },
  ];
  if (bazi.pillars.hour) out.push({ label: '时', branch: bazi.pillars.hour.branch });
  return out;
}

// Pairwise relation tables (unordered pairs).
const PAIR = (a: string, b: string): string => [a, b].sort().join('');
const LIU_HE = new Set(
  ['子丑', '寅亥', '卯戌', '辰酉', '巳申', '午未'].map((s) => PAIR(s[0]!, s[1]!)),
);
const LIU_CHONG = new Set(
  ['子午', '丑未', '寅申', '卯酉', '辰戌', '巳亥'].map((s) => PAIR(s[0]!, s[1]!)),
);
const LIU_HAI = new Set(
  ['子未', '丑午', '寅巳', '卯辰', '申亥', '酉戌'].map((s) => PAIR(s[0]!, s[1]!)),
);
const XIANG_PO = new Set(
  ['子酉', '午卯', '巳申', '寅亥', '辰丑', '戌未'].map((s) => PAIR(s[0]!, s[1]!)),
);

// Three-harmony bureaus (三合局) and their element; half-合 = center + one wing.
const SAN_HE: Array<{ set: string[]; center: string; element: string }> = [
  { set: ['申', '子', '辰'], center: '子', element: '水' },
  { set: ['寅', '午', '戌'], center: '午', element: '火' },
  { set: ['巳', '酉', '丑'], center: '酉', element: '金' },
  { set: ['亥', '卯', '未'], center: '卯', element: '木' },
];
// Directional trios (三会方).
const SAN_HUI: Array<{ set: string[]; element: string }> = [
  { set: ['寅', '卯', '辰'], element: '木' },
  { set: ['巳', '午', '未'], element: '火' },
  { set: ['申', '酉', '戌'], element: '金' },
  { set: ['亥', '子', '丑'], element: '水' },
];
// Three-punishment groups (三刑) + mutual (子卯) + self-punishments (自刑).
const SAN_XING: string[][] = [
  ['寅', '巳', '申'],
  ['丑', '戌', '未'],
];
const SELF_XING = new Set(['辰', '午', '酉', '亥']);

// 天干五合: 甲己合土、乙庚合金、丙辛合水、丁壬合木、戊癸合火.
const WU_HE: Record<string, string> = {
  甲己: '土',
  乙庚: '金',
  丙辛: '水',
  丁壬: '木',
  戊癸: '火',
};
/** 天干五合 element (甲己→土、乙庚→金 …) of two stems, or undefined. Also reused by 合婚 for 日干五合. */
export function stemHeElement(a: string, b: string): string | undefined {
  return WU_HE[a + b] ?? WU_HE[b + a];
}

/** Pairwise branch relation, reused by the natal rule and by 大运/流年 timing (fortune). */
export function branchPairRelation(
  a: string,
  b: string,
): { kind: '冲' | '合' | '害' | '破'; polarity: '吉' | '凶' | '中性'; note: string } | null {
  if (a === b) return null;
  const key = PAIR(a, b);
  if (LIU_CHONG.has(key)) return { kind: '冲', polarity: '凶', note: '六冲（动荡、变动）' };
  if (LIU_HE.has(key)) return { kind: '合', polarity: '吉', note: '六合（相吸相合）' };
  if (LIU_HAI.has(key)) return { kind: '害', polarity: '凶', note: '相害（暗损、龃齬）' };
  if (XIANG_PO.has(key)) return { kind: '破', polarity: '凶', note: '相破（破损、消耗）' };
  return null;
}

/**
 * Extended cross-chart branch relation for 合婚: the pair table (六合/冲/害/破) plus
 * 半三合 (合而有情 → 吉) and 相刑 (刑伤/龃齬 → 凶). Used between two people's branches.
 */
export function crossBranchRelation(
  a: string,
  b: string,
): {
  kind: '冲' | '合' | '半合' | '刑' | '害' | '破';
  polarity: '吉' | '凶' | '中性';
  note: string;
} | null {
  const base = branchPairRelation(a, b);
  if (base) return base;
  if (a === b) return null;
  for (const he of SAN_HE) {
    if (he.set.includes(a) && he.set.includes(b)) {
      return { kind: '半合', polarity: '吉', note: `半合${he.element}局（合而有情）` };
    }
  }
  for (const xing of SAN_XING) {
    if (xing.includes(a) && xing.includes(b)) {
      return { kind: '刑', polarity: '凶', note: '相刑（刑伤、龃齬）' };
    }
  }
  if ((a === '子' && b === '卯') || (a === '卯' && b === '子')) {
    return { kind: '刑', polarity: '凶', note: '子卯相刑（无礼之刑）' };
  }
  return null;
}

function finding(
  ruleId: string,
  claim: string,
  polarity: '吉' | '凶' | '中性',
  chapter: string,
): BaziRuleFinding {
  return {
    ruleId,
    topic: 'relations',
    matched: true,
    claim,
    polarity,
    source: { text: '三命通会', chapter },
    reason: claim,
  };
}

export function relationFindings(bazi: BaziChartResult): BaziRuleFinding[] {
  const bs = branches(bazi);
  const out: BaziRuleFinding[] = [];

  // Pairwise (合/冲/害/破).
  for (let i = 0; i < bs.length; i++) {
    for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i]!;
      const b = bs[j]!;
      const key = PAIR(a.branch, b.branch);
      const tag = `${a.label}支${a.branch}与${b.label}支${b.branch}`;
      if (LIU_HE.has(key))
        out.push(finding('relations/liu-he', `${tag}六合（相吸相合）`, '吉', '论六合'));
      if (LIU_CHONG.has(key))
        out.push(finding('relations/liu-chong', `${tag}六冲（动荡、变动）`, '凶', '论六冲'));
      if (LIU_HAI.has(key))
        out.push(finding('relations/liu-hai', `${tag}相害（暗损、龃龉）`, '凶', '论六害'));
      if (XIANG_PO.has(key))
        out.push(finding('relations/xiang-po', `${tag}相破（破损、消耗）`, '凶', '论相破'));
      if ((a.branch === '子' && b.branch === '卯') || (a.branch === '卯' && b.branch === '子'))
        out.push(finding('relations/zi-mao-xing', `${tag}子卯相刑（无礼之刑）`, '凶', '论三刑'));
    }
  }

  // Group (三合全/半, 三会, 三刑, 自刑).
  const present = new Set(bs.map((b) => b.branch));
  for (const he of SAN_HE) {
    const hit = he.set.filter((x) => present.has(x));
    if (hit.length === 3)
      out.push(
        finding(
          'relations/san-he',
          `${he.set.join('')}三合${he.element}局（成局有力）`,
          '吉',
          '论三合',
        ),
      );
    else if (hit.length === 2 && hit.includes(he.center))
      out.push(
        finding(
          'relations/san-he-half',
          `${hit.join('')}半合${he.element}（合而不全）`,
          '吉',
          '论三合',
        ),
      );
  }
  for (const hui of SAN_HUI) {
    if (hui.set.every((x) => present.has(x)))
      out.push(
        finding(
          'relations/san-hui',
          `${hui.set.join('')}三会${hui.element}方（气势最旺）`,
          '吉',
          '论三会',
        ),
      );
  }
  for (const xing of SAN_XING) {
    if (xing.every((x) => present.has(x)))
      out.push(finding('relations/san-xing', `${xing.join('')}三刑（刑伤、是非）`, '凶', '论三刑'));
  }
  for (const b of bs) {
    if (SELF_XING.has(b.branch) && bs.filter((x) => x.branch === b.branch).length >= 2) {
      out.push(
        finding('relations/zi-xing', `${b.branch}${b.branch}自刑（自我消耗）`, '凶', '论三刑'),
      );
      break;
    }
  }
  return out;
}

/**
 * 天干五合. The day-master case is **consolidated into one finding**: one day stem cannot
 * separately 合化 with two same-type stems, so multiple 日主合财/官 are reported together with a
 * 贴身 (adjacent to the day pillar: 月/时干) vs 遥见 (年干) distinction and an explicit "不作双重合化论".
 */
export function stemCombinationFindings(bazi: BaziChartResult): BaziRuleFinding[] {
  const day = bazi.dayMaster.stem;
  // 化气之机：化神(合化五行)须当令(月令本气) — 否则以合而不化论（化气格《子平真诠》）.
  const monthQi = bazi.pillars.month.hiddenStems.find((h) => h.primary);
  const monthEl = monthQi ? monthQi.element : bazi.pillars.month.branchElement;
  const huaNote = (he: string): string =>
    monthEl === he
      ? `化${he}之象：化神${he}当令、有化气之机（仍需日主从化、无破方为真化）`
      : `化${he}之象，然合而不化`;
  const others: Array<{ label: string; stem: string; tenGod: string | null; adjacent: boolean }> = [
    {
      label: '年',
      stem: bazi.pillars.year.stem,
      tenGod: bazi.pillars.year.tenGod,
      adjacent: false,
    },
    {
      label: '月',
      stem: bazi.pillars.month.stem,
      tenGod: bazi.pillars.month.tenGod,
      adjacent: true,
    },
  ];
  if (bazi.pillars.hour)
    others.push({
      label: '时',
      stem: bazi.pillars.hour.stem,
      tenGod: bazi.pillars.hour.tenGod,
      adjacent: true,
    });

  const out: BaziRuleFinding[] = [];

  // (1) 日主五合 — consolidated (a day stem 五合s with exactly one stem type, e.g. 戊只合癸).
  const dayCombos = others.filter((o) => stemHeElement(day, o.stem) !== undefined);
  if (dayCombos.length > 0) {
    const otherStem = dayCombos[0]!.stem;
    const el = stemHeElement(day, otherStem)!;
    const tenGod = dayCombos[0]!.tenGod ?? '他干';
    const cat = tenGodCategory(dayCombos[0]!.tenGod) ?? tenGod;
    let claim: string;
    if (dayCombos.length === 1) {
      const c = dayCombos[0]!;
      claim = `日主${day}与${c.label}干${otherStem}(${tenGod})相合（${day}${otherStem}${huaNote(el)}，${c.adjacent ? '贴身' : '遥见'}）——日主合${tenGod}，主${cat}与日主关系紧密`;
    } else {
      const near = dayCombos.filter((c) => c.adjacent).map((c) => `${c.label}干`);
      const far = dayCombos.filter((c) => !c.adjacent).map((c) => `${c.label}干`);
      const parts: string[] = [];
      if (near.length) parts.push(`${near.join('、')}${otherStem}${cat}贴身相合`);
      if (far.length) parts.push(`${far.join('、')}${otherStem}${cat}遥见`);
      const cnt = dayCombos.length === 2 ? '两' : String(dayCombos.length);
      claim = `${tenGod}${cnt}透：${parts.join('、')}（${day}${otherStem}${huaNote(el)}）；${cat}与日主联系紧密，但不作双重合化论`;
    }
    out.push({
      ruleId: 'relations/tian-gan-he-day',
      topic: 'relations',
      matched: true,
      claim,
      polarity: '中性',
      source: { text: '三命通会', chapter: '论天干五合' },
      reason: claim,
    });
  }

  // (2) 非日主五合 among 年/月/时 (rare) — per pair.
  for (let i = 0; i < others.length; i++) {
    for (let j = i + 1; j < others.length; j++) {
      const a = others[i]!;
      const b = others[j]!;
      const el = stemHeElement(a.stem, b.stem);
      if (el === undefined) continue;
      const claim = `${a.label}干${a.stem}与${b.label}干${b.stem}相合（${huaNote(el)}）`;
      out.push({
        ruleId: 'relations/tian-gan-he',
        topic: 'relations',
        matched: true,
        claim,
        polarity: '中性',
        source: { text: '三命通会', chapter: '论天干五合' },
        reason: claim,
      });
    }
  }

  return out;
}
