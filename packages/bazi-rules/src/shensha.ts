import type { BaziChartResult, BaziPillar, BaziRuleFinding } from '@loom/contracts';

/**
 * Symbolic stars (神煞) — the classic auspicious/inauspicious markers of
 * 《三命通会·论诸神煞》. Deterministic table lookup only; each hit says which pillar
 * carries it and its polarity (吉/凶/中性). Stem-anchored stars (天乙贵人/文昌/羊刃)
 * key off the day master; trine-anchored stars (桃花/驿马/华盖/劫煞/亡神) key off the
 * day branch's 三合 group. Not every school uses the same table — this is one sourced,
 * versioned convention, not "the only truth".
 */

// Stem-anchored: day stem → target branch(es).
const TIAN_YI: Record<string, string[]> = {
  甲: ['丑', '未'],
  戊: ['丑', '未'],
  庚: ['丑', '未'],
  乙: ['子', '申'],
  己: ['子', '申'],
  丙: ['亥', '酉'],
  丁: ['亥', '酉'],
  壬: ['卯', '巳'],
  癸: ['卯', '巳'],
  辛: ['寅', '午'],
};
const WEN_CHANG: Record<string, string> = {
  甲: '巳',
  乙: '午',
  丙: '申',
  丁: '酉',
  戊: '申',
  己: '酉',
  庚: '亥',
  辛: '子',
  壬: '寅',
  癸: '卯',
};
const YANG_REN: Record<string, string> = { 甲: '卯', 丙: '午', 戊: '午', 庚: '酉', 壬: '子' };

// Trine-anchored: day-branch group → { 桃花, 驿马, 华盖, 劫煞, 亡神 }.
const TRINE_GROUP: Array<{
  set: string[];
  peach: string;
  horse: string;
  canopy: string;
  rob: string;
  ghost: string;
}> = [
  { set: ['申', '子', '辰'], peach: '酉', horse: '寅', canopy: '辰', rob: '巳', ghost: '亥' },
  { set: ['寅', '午', '戌'], peach: '卯', horse: '申', canopy: '戌', rob: '亥', ghost: '巳' },
  { set: ['巳', '酉', '丑'], peach: '午', horse: '亥', canopy: '丑', rob: '寅', ghost: '申' },
  { set: ['亥', '卯', '未'], peach: '子', horse: '巳', canopy: '未', rob: '申', ghost: '寅' },
];

function pillars(bazi: BaziChartResult): Array<{ label: string; branch: string }> {
  const out = [
    { label: '年', branch: bazi.pillars.year.branch },
    { label: '月', branch: bazi.pillars.month.branch },
    { label: '日', branch: bazi.pillars.day.branch },
  ];
  const hour: BaziPillar | null = bazi.pillars.hour;
  if (hour) out.push({ label: '时', branch: hour.branch });
  return out;
}

function locate(bazi: BaziChartResult, target: string): string[] {
  return pillars(bazi)
    .filter((p) => p.branch === target)
    .map((p) => `${p.label}支`);
}

function star(
  ruleId: string,
  name: string,
  where: string[],
  polarity: '吉' | '凶' | '中性',
  meaning: string,
): BaziRuleFinding {
  const claim = `${name}：见于${where.join('、')}（${meaning}）`;
  return {
    ruleId,
    topic: 'shensha',
    matched: true,
    claim,
    polarity,
    source: { text: '三命通会', chapter: '论诸神煞' },
    reason: claim,
  };
}

export function shenshaFindings(bazi: BaziChartResult): BaziRuleFinding[] {
  const out: BaziRuleFinding[] = [];
  const dayStem = bazi.dayMaster.stem;
  const dayBranch = bazi.pillars.day.branch;

  for (const b of TIAN_YI[dayStem] ?? []) {
    const w = locate(bazi, b);
    if (w.length > 0) out.push(star('shensha/tianyi', '天乙贵人', w, '吉', '逢凶化吉、贵人相助'));
  }
  const wc = WEN_CHANG[dayStem];
  if (wc) {
    const w = locate(bazi, wc);
    if (w.length > 0) out.push(star('shensha/wenchang', '文昌', w, '吉', '聪慧、利文书学业'));
  }
  const yr = YANG_REN[dayStem];
  if (yr) {
    const w = locate(bazi, yr);
    if (w.length > 0)
      out.push(star('shensha/yangren', '羊刃', w, '凶', '刚烈、易冲动破耗，宜制化'));
  }

  const group = TRINE_GROUP.find((g) => g.set.includes(dayBranch));
  if (group) {
    const peach = locate(bazi, group.peach);
    if (peach.length > 0)
      out.push(star('shensha/taohua', '桃花(咸池)', peach, '中性', '人缘、情感、异性缘'));
    const horse = locate(bazi, group.horse);
    if (horse.length > 0) out.push(star('shensha/yima', '驿马', horse, '中性', '奔波、迁移、变动'));
    const canopy = locate(bazi, group.canopy);
    if (canopy.length > 0)
      out.push(star('shensha/huagai', '华盖', canopy, '中性', '孤高、玄学艺术'));
    const rob = locate(bazi, group.rob);
    if (rob.length > 0) out.push(star('shensha/jiesha', '劫煞', rob, '凶', '破耗、意外，宜谨慎'));
    const ghost = locate(bazi, group.ghost);
    if (ghost.length > 0) out.push(star('shensha/wangshen', '亡神', ghost, '凶', '暗耗、心神不宁'));
  }
  return out;
}
