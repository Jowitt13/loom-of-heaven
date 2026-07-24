import { describe, expect, it } from 'vitest';
import type { BaziChartResult, ChartBundle, ZiweiChartResult } from '@ming/contracts';
import { baziSynastryFindings, ziweiSynastryFindings } from '../src/index.ts';

/**
 * Deterministic unit tests for the new 合婚 signals (日干五合 / 大运流年共振 / 四化互涉),
 * built on hand-crafted minimal chart fixtures so the rules are exercised without iztro
 * or the full pipeline. Only the fields each rule reads are populated.
 */

// --- BaZi fixture: enough for assessStrength + the synastry reads. ----------------
function baziChart(cfg: {
  dayStem: string;
  dayElement: string;
  dayBranch: string; // 夫妻宫
  dayBranchElement: string;
  yearBranch: string;
  monthQiElement: string;
  monthQiGod: string;
}): BaziChartResult {
  const pillar = (branch: string, branchElement: string, qiGod: string) => ({
    stem: 'X',
    branch,
    stemElement: 'X',
    branchElement,
    stemYinYang: '阳',
    naYin: 'X',
    tenGod: null,
    hiddenStems: [{ stem: 'X', element: branchElement, tenGod: qiGod, primary: true }],
  });
  return {
    rulesetId: 'bazi-standard@0.1.0',
    provider: { id: 'tyme4ts', version: '1.5.2', license: 'MIT' },
    solarTimeApplied: 'civil',
    dayBoundaryApplied: 'zi-hour/late (tyme4ts default)',
    dayMaster: { stem: cfg.dayStem, element: cfg.dayElement, yinYang: '阳' },
    pillars: {
      year: pillar(cfg.yearBranch, '火', '七杀'),
      month: pillar('酉', cfg.monthQiElement, cfg.monthQiGod),
      day: pillar(cfg.dayBranch, cfg.dayBranchElement, 'X'),
      hour: pillar('午', '火', 'X'),
    },
    luckCycle: null,
  } as unknown as BaziChartResult;
}

// A 甲木 (weak, 官杀当令) chart used for 日干五合 / 共振.
const weakWood = (dayStem: string) =>
  baziChart({
    dayStem,
    dayElement: '木',
    dayBranch: '寅',
    dayBranchElement: '木',
    yearBranch: '午',
    monthQiElement: '金',
    monthQiGod: '七杀',
  });

function baziBundle(bazi: BaziChartResult, gender: 'male' | 'female'): ChartBundle {
  return { bazi, originalInput: { ruleGender: gender } } as unknown as ChartBundle;
}

// --- Zi Wei fixture: 命宫 + 夫妻宫 with branches and (mutagen-tagged) stars. --------
function ziweiChart(cfg: {
  soulBranch: string;
  spouseBranch: string;
  migrateBranch?: string;
  soulStars?: Array<{ name: string; mutagen?: string }>;
  spouseStars?: Array<{ name: string; mutagen?: string }>;
}): ZiweiChartResult {
  const palace = (
    name: string,
    branch: string,
    stars: Array<{ name: string; mutagen?: string }>,
  ) => ({
    index: 0,
    name,
    heavenlyStem: '甲',
    earthlyBranch: branch,
    isSoulPalace: name === '命宫',
    isBodyPalace: false,
    majorStars: stars.map((s) => ({ name: s.name, type: 'major', mutagen: s.mutagen })),
    minorStars: [],
    adjectiveStars: [],
    surroundPalaces: { opposite: '', wealth: '', career: '' },
    decadal: { startAge: 0, endAge: 9, heavenlyStem: '甲', earthlyBranch: branch },
  });
  const palaces = [
    palace('命宫', cfg.soulBranch, cfg.soulStars ?? []),
    palace('夫妻', cfg.spouseBranch, cfg.spouseStars ?? []), // iztro bare name (no 宫)
  ];
  if (cfg.migrateBranch) palaces.push(palace('迁移', cfg.migrateBranch, []));
  return { palaces } as unknown as ZiweiChartResult;
}

function ziweiBundle(ziwei: ZiweiChartResult): ChartBundle {
  return { ziwei } as unknown as ChartBundle;
}

describe('BaZi synastry: 日干五合 / 大运流年共振', () => {
  it('detects 日干五合 (甲×己 合化土) as an attraction signal', () => {
    const a = baziBundle(weakWood('甲'), 'male');
    const b = baziBundle(weakWood('己'), 'female');
    const findings = baziSynastryFindings(a, b, 2024);
    const he = findings.find((f) => f.code === 'bazi/day-stem-he');
    expect(he).toBeDefined();
    expect(he!.polarity).toBe('吉');
    expect(he!.claim).toContain('合化土');
  });

  it('same-stem pair has NO 日干五合 (五合 needs two different stems)', () => {
    const a = baziBundle(weakWood('甲'), 'male');
    const b = baziBundle(weakWood('甲'), 'female');
    const findings = baziSynastryFindings(a, b, 2024);
    expect(findings.some((f) => f.code === 'bazi/day-stem-he')).toBe(false);
  });

  it('produces 大运/流年共振 years for two resonant charts (同吉 and/or 同冲)', () => {
    // Identical weak-wood charts → every year's leaning matches → shared 吉/冲 years.
    const a = baziBundle(weakWood('甲'), 'male');
    const b = baziBundle(weakWood('甲'), 'female');
    const findings = baziSynastryFindings(a, b, 2020);
    const codes = findings.map((f) => f.code);
    expect(codes.some((c) => c.startsWith('bazi/resonance'))).toBe(true);
    // 日支寅 → 2028 戊申 冲夫妻宫 for both → 同冲 year present.
    const chong = findings.find((f) => f.code === 'bazi/resonance-chong');
    expect(chong).toBeDefined();
    expect(chong!.claim).toContain('2028');
    expect(chong!.polarity).toBe('凶');
  });
});

describe('Zi Wei synastry: 四化互涉 (生年四化飞入对方命/夫妻宫)', () => {
  it('化禄 into the other 命宫 leans 吉; 化忌 into 夫妻宫 leans 凶', () => {
    const a = ziweiBundle(
      ziweiChart({
        soulBranch: '子',
        spouseBranch: '午',
        soulStars: [
          { name: '武曲', mutagen: '禄' }, // A 生年 武曲化禄
          { name: '廉贞', mutagen: '忌' }, // A 生年 廉贞化忌
        ],
      }),
    );
    const b = ziweiBundle(
      ziweiChart({
        soulBranch: '丑', // 子丑六合 with A 命宫
        spouseBranch: '未',
        soulStars: [{ name: '武曲' }], // 武曲 sits in B 命宫
        spouseStars: [{ name: '廉贞' }], // 廉贞 sits in B 夫妻宫
      }),
    );
    const findings = ziweiSynastryFindings(a, b);
    const lu = findings.find((f) => f.code === 'ziwei/mutagen/禄/命宫');
    expect(lu).toBeDefined();
    expect(lu!.polarity).toBe('吉');
    expect(lu!.claim).toContain('武曲化禄');
    const ji = findings.find((f) => f.code === 'ziwei/mutagen/忌/夫妻宫');
    expect(ji).toBeDefined();
    expect(ji!.polarity).toBe('凶');
    // 命宫地支 子丑六合 overlay is also present.
    expect(findings.some((f) => f.code === 'ziwei/双方命宫')).toBe(true);
  });

  it('no 四化互涉 when the mutagen star does not land in the other key palaces', () => {
    const a = ziweiBundle(
      ziweiChart({
        soulBranch: '子',
        spouseBranch: '午',
        soulStars: [{ name: '武曲', mutagen: '禄' }],
      }),
    );
    const b = ziweiBundle(
      ziweiChart({ soulBranch: '寅', spouseBranch: '申', soulStars: [{ name: '天机' }] }),
    );
    const findings = ziweiSynastryFindings(a, b);
    expect(findings.some((f) => f.code.startsWith('ziwei/mutagen/'))).toBe(false);
  });

  it('迁移宫 cross-overlay uses iztro bare 迁移 name and classifies the branch relation (B4)', () => {
    const a = ziweiBundle(
      ziweiChart({ soulBranch: '子', spouseBranch: '午', migrateBranch: '辰' }),
    );
    const b = ziweiBundle(
      ziweiChart({ soulBranch: '寅', spouseBranch: '申', migrateBranch: '酉' }),
    );
    const findings = ziweiSynastryFindings(a, b);
    // 双方迁移宫 辰酉六合 → overlay present (proves 迁移 lookup + B4 迁移宫互看).
    const mig = findings.find((f) => f.code === 'ziwei/双方迁移宫');
    expect(mig).toBeDefined();
    expect(mig!.claim).toContain('辰');
    expect(mig!.claim).toContain('酉');
  });
});
