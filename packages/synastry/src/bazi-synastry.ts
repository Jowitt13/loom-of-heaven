import type { ChartBundle, SynastryFinding } from '@ming/contracts';
import type { BaziChartResult } from '@ming/contracts';
import {
  annualResonance,
  assessStrength,
  crossBranchRelation,
  elementsByRelation,
  stemHeElement,
  yearGanzhi,
  type Element,
} from '@ming/bazi-rules';

/**
 * BaZi 合婚 signals between two charts (sourced to 《三命通会·论男女婚姻》 / 子平 practice):
 *   - 生肖 (年支) and 夫妻宫 (日支) branch relations 六合/三合(半合)/六冲/相刑/相害/相破;
 *   - 日干五合 (甲己/乙庚/丙辛/丁壬/戊癸) — two day masters 相合 lean 相吸相守;
 *   - 五行与喜用互补 (does one embody the other's useful-god element, bidirectional);
 *   - 配偶星契合 (one's day-master element IS the other's spouse-star element, gender-defined);
 *   - 大运/流年共振应期 — years where both lean 吉 (同吉) or both 冲夫妻宫 (同冲).
 * All are structural compatibility signals, not a "合/不合" verdict.
 */

function fav(bazi: BaziChartResult): Element[] {
  const s = assessStrength(bazi);
  const el = elementsByRelation(bazi.dayMaster.element as Element);
  if (s.verdict === 'strong') return [el.output, el.wealth, el.officer];
  if (s.verdict === 'weak') return [el.resource, el.same];
  return [el.output, el.resource];
}

function spouseElement(
  bazi: BaziChartResult,
  gender: 'male' | 'female' | 'unspecified' | undefined,
): Element | null {
  if (gender !== 'male' && gender !== 'female') return null;
  const el = elementsByRelation(bazi.dayMaster.element as Element);
  return gender === 'male' ? el.wealth : el.officer;
}

/** 大运/流年共振应期: 同吉年 (both favorable) and 同冲年 (both 冲夫妻宫), over a 12-year window. */
function resonanceFindings(
  ba: BaziChartResult,
  bb: BaziChartResult,
  focusYear: number,
): SynastryFinding[] {
  const sameJi: string[] = [];
  const sameChong: string[] = [];
  for (let y = focusYear; y <= focusYear + 11; y++) {
    const ra = annualResonance(ba, y);
    const rb = annualResonance(bb, y);
    const gz = yearGanzhi(y);
    if (ra.polarity === '吉' && rb.polarity === '吉') sameJi.push(`${y}(${gz.stem}${gz.branch})`);
    if (ra.chongSpousePalace && rb.chongSpousePalace)
      sameChong.push(`${y}(${gz.stem}${gz.branch})`);
  }
  const out: SynastryFinding[] = [];
  if (sameJi.length > 0) {
    out.push({
      system: 'bazi',
      code: 'bazi/resonance-ji',
      claim: `大运/流年共振·同吉之年(${focusYear}起十二年)：${sameJi.join('、')}`,
      polarity: '吉',
      reason:
        '这些流年对双方各自命局都偏喜用(生扶或泄耗得宜)，是两人状态同时较顺、宜共同推进(定情/成婚/合作)的参考窗口；应期是机会而非必然。',
      source: { text: '滴天髓', chapter: '喜忌' },
    });
  }
  if (sameChong.length > 0) {
    out.push({
      system: 'bazi',
      code: 'bazi/resonance-chong',
      claim: `大运/流年共振·同冲夫妻宫之年(${focusYear}起十二年)：${sameChong.join('、')}`,
      polarity: '凶',
      reason:
        '这些流年双方日支(夫妻宫)同时逢冲，主感情/居所/关系状态易共同动荡，宜提前沟通与经营；逢冲为变动之机(可成可变)，非注定不合。',
      source: { text: '三命通会', chapter: '论流年' },
    });
  }
  return out;
}

export function baziSynastryFindings(
  a: ChartBundle,
  b: ChartBundle,
  focusYear: number,
): SynastryFinding[] {
  const ba = a.bazi;
  const bb = b.bazi;
  if (!ba || !bb) return [];
  const out: SynastryFinding[] = [];
  const src = { text: '三命通会', chapter: '论男女婚姻' } as const;

  // 生肖 (年支) 关系 — 含三合(半合)/相刑.
  const zodiacRel = crossBranchRelation(ba.pillars.year.branch, bb.pillars.year.branch);
  if (zodiacRel) {
    const good = zodiacRel.polarity === '吉';
    out.push({
      system: 'bazi',
      code: 'bazi/zodiac',
      claim: `生肖(年支)${ba.pillars.year.branch}与${bb.pillars.year.branch}相${zodiacRel.kind}（${zodiacRel.note}）`,
      polarity: zodiacRel.polarity,
      reason: `年支为根、主生肖缘分：相${zodiacRel.kind}${good ? '主相吸、易亲近' : '主磨合、需包容'}。`,
      source: src,
    });
  }

  // 夫妻宫 (日支) 关系 — 婚配核心，含三合(半合)/相刑.
  const spouseRel = crossBranchRelation(ba.pillars.day.branch, bb.pillars.day.branch);
  if (spouseRel) {
    const good = spouseRel.polarity === '吉';
    out.push({
      system: 'bazi',
      code: 'bazi/spouse-palace',
      claim: `双方日支(夫妻宫)${ba.pillars.day.branch}与${bb.pillars.day.branch}相${spouseRel.kind}（${spouseRel.note}）`,
      polarity: spouseRel.polarity,
      reason: `日支为夫妻宫：相${spouseRel.kind}者夫妻相处${good ? '和顺、默契较好' : '易有摩擦、需经营沟通'}。`,
      source: src,
    });
  }

  // 日干五合 (甲己/乙庚/丙辛/丁壬/戊癸) — 两日主相合，主相吸相守.
  const dayHe = stemHeElement(ba.dayMaster.stem, bb.dayMaster.stem);
  if (dayHe) {
    out.push({
      system: 'bazi',
      code: 'bazi/day-stem-he',
      claim: `日干五合：${ba.dayMaster.stem}与${bb.dayMaster.stem}相合（合化${dayHe}）`,
      polarity: '吉',
      reason:
        '两人日主(代表本人)天干五合，主彼此相吸、易生亲近与相守之意；为吸引力信号，长久与否仍看相处经营。',
      source: { text: '三命通会', chapter: '论天干五合' },
    });
  }

  // 五行与喜用互补 (bidirectional).
  const favA = fav(ba);
  const favB = fav(bb);
  const bServesA = favA.includes(bb.dayMaster.element as Element);
  const aServesB = favB.includes(ba.dayMaster.element as Element);
  if (bServesA || aServesB) {
    const notes: string[] = [];
    if (bServesA) notes.push(`乙方日主${bb.dayMaster.element}正是甲方喜用`);
    if (aServesB) notes.push(`甲方日主${ba.dayMaster.element}正是乙方喜用`);
    out.push({
      system: 'bazi',
      code: 'bazi/element-complement',
      claim: `五行喜用互补：${notes.join('；')}`,
      polarity: '吉',
      reason: '一方日主之五行恰为另一方喜用，主相互补益、在一起时状态更顺（双向互补更佳）。',
      source: { text: '滴天髓', chapter: '喜忌' },
    });
  } else {
    out.push({
      system: 'bazi',
      code: 'bazi/element-neutral',
      claim: '五行喜用互补不明显（双方日主未直接补对方喜用）',
      polarity: '中性',
      reason: '并非不合，只是不靠五行天然互补，相处更依赖沟通、价值观与现实条件。',
      source: { text: '滴天髓', chapter: '喜忌' },
    });
  }

  // 配偶星契合 (gender-defined).
  const spouseElA = spouseElement(ba, a.originalInput.ruleGender);
  const spouseElB = spouseElement(bb, b.originalInput.ruleGender);
  const bIsAsSpouse = spouseElA !== null && bb.dayMaster.element === spouseElA;
  const aIsBsSpouse = spouseElB !== null && ba.dayMaster.element === spouseElB;
  if (bIsAsSpouse || aIsBsSpouse) {
    const notes: string[] = [];
    if (bIsAsSpouse) notes.push(`乙方日主(${bb.dayMaster.element})即甲方配偶星`);
    if (aIsBsSpouse) notes.push(`甲方日主(${ba.dayMaster.element})即乙方配偶星`);
    out.push({
      system: 'bazi',
      code: 'bazi/spouse-star',
      claim: `配偶星契合：${notes.join('；')}`,
      polarity: '吉',
      reason: '一方日主正是另一方命理上的配偶星(男财女官)，主对方在其眼中"对味"、易生情感联系。',
      source: { text: '三命通会', chapter: '论男女婚姻' },
    });
  }

  // 大运/流年共振应期.
  out.push(...resonanceFindings(ba, bb, focusYear));

  return out;
}
