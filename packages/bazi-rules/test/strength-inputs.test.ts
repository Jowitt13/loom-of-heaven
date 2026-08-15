import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BaziChartResult, BaziHiddenStem, BaziPillar } from '@loom/contracts';
import { tenGodOf } from '../src/fundamentals.ts';
import { collectStrengthInputs } from '../src/strength-inputs.ts';

// ---------------------------------------------------------------------------
// Synthetic fixture builders. Every chart below is a synthetic technical
// fixture — not a real person's birth record. Stems, branches, hidden stems,
// na-yin and ten-god labels use canonical values; the assembled charts
// correspond to no actual person, place, or life event.
// ---------------------------------------------------------------------------

// synthetic technical fixture — not a real person's birth record
const STEM_ELEMENT: Record<string, string> = {
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

// synthetic technical fixture — not a real person's birth record
const STEM_YIN_YANG: Record<string, string> = {
  甲: '阳',
  乙: '阴',
  丙: '阳',
  丁: '阴',
  戊: '阳',
  己: '阴',
  庚: '阳',
  辛: '阴',
  壬: '阳',
  癸: '阴',
};

// synthetic technical fixture — not a real person's birth record
const BRANCH_ELEMENT: Record<string, string> = {
  子: '水',
  丑: '土',
  寅: '木',
  卯: '木',
  辰: '土',
  巳: '火',
  午: '火',
  未: '土',
  申: '金',
  酉: '金',
  戌: '土',
  亥: '水',
};

// synthetic technical fixture — not a real person's birth record
const BRANCH_HIDDEN: Record<string, Array<{ stem: string; element: string; primary: boolean }>> = {
  子: [{ stem: '癸', element: '水', primary: true }],
  丑: [
    { stem: '己', element: '土', primary: true },
    { stem: '癸', element: '水', primary: false },
    { stem: '辛', element: '金', primary: false },
  ],
  寅: [
    { stem: '甲', element: '木', primary: true },
    { stem: '丙', element: '火', primary: false },
    { stem: '戊', element: '土', primary: false },
  ],
  卯: [{ stem: '乙', element: '木', primary: true }],
  辰: [
    { stem: '戊', element: '土', primary: true },
    { stem: '乙', element: '木', primary: false },
    { stem: '癸', element: '水', primary: false },
  ],
  巳: [
    { stem: '丙', element: '火', primary: true },
    { stem: '戊', element: '土', primary: false },
    { stem: '庚', element: '金', primary: false },
  ],
  午: [
    { stem: '丁', element: '火', primary: true },
    { stem: '己', element: '土', primary: false },
  ],
  未: [
    { stem: '己', element: '土', primary: true },
    { stem: '丁', element: '火', primary: false },
    { stem: '乙', element: '木', primary: false },
  ],
  申: [
    { stem: '庚', element: '金', primary: true },
    { stem: '壬', element: '水', primary: false },
    { stem: '戊', element: '土', primary: false },
  ],
  酉: [{ stem: '辛', element: '金', primary: true }],
  戌: [
    { stem: '戊', element: '土', primary: true },
    { stem: '辛', element: '金', primary: false },
    { stem: '丁', element: '火', primary: false },
  ],
  亥: [
    { stem: '壬', element: '水', primary: true },
    { stem: '甲', element: '木', primary: false },
  ],
};

// synthetic technical fixture — not a real person's birth record
const NAYIN: Record<string, string> = {
  甲子: '海中金',
  乙丑: '海中金',
  丙寅: '炉中火',
  丁卯: '炉中火',
  戊辰: '大林木',
  己巳: '大林木',
  庚午: '路旁土',
  辛未: '路旁土',
  壬申: '剑锋金',
  癸酉: '剑锋金',
  甲戌: '山头火',
  乙亥: '山头火',
  丙子: '涧下水',
  丁丑: '涧下水',
  戊寅: '城头土',
  己卯: '城头土',
  庚辰: '白蜡金',
  辛巳: '白蜡金',
  壬午: '杨柳木',
  癸未: '杨柳木',
  甲申: '泉中水',
  乙酉: '泉中水',
  丙戌: '屋上土',
  丁亥: '屋上土',
  戊子: '霹雳火',
  己丑: '霹雳火',
  庚寅: '松柏木',
  辛卯: '松柏木',
  壬辰: '长流水',
  癸巳: '长流水',
  甲午: '沙中金',
  乙未: '沙中金',
  丙申: '山下火',
  丁酉: '山下火',
  戊戌: '平地木',
  己亥: '平地木',
  庚子: '壁上土',
  辛丑: '壁上土',
  壬寅: '金箔金',
  癸卯: '金箔金',
  甲辰: '覆灯火',
  乙巳: '覆灯火',
  丙午: '天河水',
  丁未: '天河水',
  戊申: '大驿土',
  己酉: '大驿土',
  庚戌: '钗钏金',
  辛亥: '钗钏金',
  壬子: '桑柘木',
  癸丑: '桑柘木',
  甲寅: '大溪水',
  乙卯: '大溪水',
  丙辰: '沙中土',
  丁巳: '沙中土',
  戊午: '天上火',
  己未: '天上火',
  庚申: '石榴木',
  辛酉: '石榴木',
  壬戌: '大海水',
  癸亥: '大海水',
};

// synthetic technical fixture — not a real person's birth record
interface PillarSpec {
  stem: string;
  branch: string;
  /** Optional override for hidden stems (defaults to the canonical branch table). */
  hiddenStems?: BaziHiddenStem[];
}

// synthetic technical fixture — not a real person's birth record
function makePillar(spec: PillarSpec, dayStem: string, isDay: boolean): BaziPillar {
  const stemGod = isDay ? null : (tenGodOf(dayStem, spec.stem) ?? null);
  const hiddenStems: BaziHiddenStem[] =
    spec.hiddenStems ??
    BRANCH_HIDDEN[spec.branch]!.map((h) => ({
      stem: h.stem,
      element: h.element,
      tenGod: tenGodOf(dayStem, h.stem)!,
      primary: h.primary,
    }));
  return {
    stem: spec.stem,
    branch: spec.branch,
    stemElement: STEM_ELEMENT[spec.stem]!,
    branchElement: BRANCH_ELEMENT[spec.branch]!,
    stemYinYang: STEM_YIN_YANG[spec.stem]!,
    naYin: NAYIN[`${spec.stem}${spec.branch}`]!,
    tenGod: stemGod,
    tenGodDisplay: isDay ? '日主(日元)' : (stemGod ?? ''),
    hiddenStems,
  };
}

// synthetic technical fixture — not a real person's birth record
function makeChart(cfg: {
  dayStem: string;
  dayElement: string;
  year: PillarSpec;
  month: PillarSpec;
  day: PillarSpec;
  hour: PillarSpec | null;
  rulesetId?: string;
  providerId?: string;
  providerVersion?: string;
}): BaziChartResult {
  return {
    rulesetId: cfg.rulesetId ?? 'bazi-standard@0.1.0',
    provider: {
      id: cfg.providerId ?? 'tyme4ts',
      version: cfg.providerVersion ?? '1.5.2',
      license: 'MIT',
    },
    solarTimeApplied: 'civil',
    dayBoundaryApplied: 'zi-hour/late (tyme4ts default)',
    dayMaster: {
      stem: cfg.dayStem,
      element: cfg.dayElement,
      yinYang: STEM_YIN_YANG[cfg.dayStem]!,
    },
    pillars: {
      year: makePillar(cfg.year, cfg.dayStem, false),
      month: makePillar(cfg.month, cfg.dayStem, false),
      day: makePillar(cfg.day, cfg.dayStem, true),
      hour: cfg.hour === null ? null : makePillar(cfg.hour, cfg.dayStem, false),
    },
    luckCycle: null,
  };
}

describe('collectStrengthInputs (D2-A shadow-only structured strength inputs)', () => {
  it('BZ-R008a: 月令生我 + 可见支持 + 无根 + 食伤泄 + 财耗分别存在，不合成强弱 verdict', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '甲',
      dayElement: '木',
      year: { stem: '癸', branch: '丑' }, // 正印 → support
      month: { stem: '丙', branch: '子' }, // 子藏癸水生木 → generates-me; 丙食神 → outputDrain
      day: { stem: '甲', branch: '巳' }, // no wood hidden stem
      hour: { stem: '戊', branch: '午' }, // 偏财 → wealthDrain
    });

    const inputs = collectStrengthInputs(chart);

    // Month command: 月令生我 is a relation fact, not a strength verdict.
    expect(inputs.monthCommand.monthBranch).toBe('子');
    expect(inputs.monthCommand.primaryHiddenStem).toBe('癸');
    expect(inputs.monthCommand.primaryHiddenStemElement).toBe('水');
    expect(inputs.monthCommand.dayMasterRelation).toBe('generates-me');
    expect(inputs.monthCommand.monthBranchFactRef).toBe('bazi.pillars.month.branch');
    expect(inputs.monthCommand.primaryHiddenStemFactRef).toBe('bazi.pillars.month.hiddenStems[0]');

    // No direct root anywhere.
    expect(inputs.directRoots.hasDirectRoot).toBe(false);
    expect(inputs.directRoots.candidates).toHaveLength(0);

    // Separate visible-stem buckets, in scan order.
    expect(inputs.visibleStems.support.map((s) => `${s.pillar}:${s.stem}`)).toEqual(['year:癸']);
    expect(inputs.visibleStems.outputDrain.map((s) => `${s.pillar}:${s.stem}`)).toEqual([
      'month:丙',
    ]);
    expect(inputs.visibleStems.wealthDrain.map((s) => `${s.pillar}:${s.stem}`)).toEqual([
      'hour:戊',
    ]);
    expect(inputs.visibleStems.officerPressure).toHaveLength(0);

    // 月令支持 ≠ 自动身强: no verdict vocabulary exists in the output.
    const serialized = JSON.stringify(inputs);
    expect(serialized).not.toContain('strong');
    expect(serialized).not.toContain('weak');
    expect(serialized).not.toContain('balanced');
    expect(serialized).not.toContain('身强');
    expect(serialized).not.toContain('身弱');
    expect(serialized).not.toContain('得令');
    expect(serialized).not.toContain('verdict');
  });

  it('BZ-R008b: 月令生我 + 可见支持 + 官杀压力分别存在，无根，不合成强弱 verdict', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '甲',
      dayElement: '木',
      year: { stem: '癸', branch: '丑' }, // 正印 → support
      month: { stem: '庚', branch: '子' }, // 庚七杀 → officerPressure; 子藏癸 → generates-me
      day: { stem: '甲', branch: '巳' },
      hour: { stem: '丙', branch: '午' }, // 丙食神 → outputDrain
    });

    const inputs = collectStrengthInputs(chart);
    expect(inputs.monthCommand.dayMasterRelation).toBe('generates-me');
    expect(inputs.directRoots.hasDirectRoot).toBe(false);
    expect(inputs.visibleStems.support.map((s) => `${s.pillar}:${s.stem}`)).toEqual(['year:癸']);
    expect(inputs.visibleStems.officerPressure.map((s) => `${s.pillar}:${s.stem}`)).toEqual([
      'month:庚',
    ]);
    expect(inputs.visibleStems.outputDrain.map((s) => `${s.pillar}:${s.stem}`)).toEqual([
      'hour:丙',
    ]);
    expect(inputs.visibleStems.wealthDrain).toHaveLength(0);

    const serialized = JSON.stringify(inputs);
    expect(serialized).not.toContain('verdict');
    expect(serialized).not.toContain('身强');
    expect(serialized).not.toContain('身弱');
  });

  it('BZ-C003: hour 为 null 时无任何 hour 依赖证据', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '甲',
      dayElement: '木',
      year: { stem: '癸', branch: '丑' },
      month: { stem: '丙', branch: '子' },
      day: { stem: '甲', branch: '巳' },
      hour: null,
    });

    const inputs = collectStrengthInputs(chart);
    expect(inputs.omittedPillars).toEqual(['hour']);
    expect(inputs.inspectedPillars).toEqual(['year', 'month', 'day']);
    // No hour visible stem.
    for (const bucket of [
      inputs.visibleStems.support,
      inputs.visibleStems.outputDrain,
      inputs.visibleStems.wealthDrain,
      inputs.visibleStems.officerPressure,
    ]) {
      expect(bucket.some((s) => s.pillar === 'hour')).toBe(false);
    }
    // No hour root.
    expect(inputs.directRoots.omittedPillars).toEqual(['hour']);
    expect(inputs.directRoots.candidates.some((c) => c.pillar === 'hour')).toBe(false);
    // No hour factRef anywhere in the canonical JSON.
    const serialized = JSON.stringify(inputs);
    expect(serialized).not.toContain('bazi.pillars.hour');
  });

  it('五种月令关系矩阵：same/generates-me/i-generate/i-control/controls-me 稳定且无评分', () => {
    // synthetic technical fixtures — not a real person's birth record
    const cases: Array<{ monthBranch: string; monthQi: string; relation: string }> = [
      { monthBranch: '寅', monthQi: '甲', relation: 'same' }, // 甲木 vs 甲木
      { monthBranch: '子', monthQi: '癸', relation: 'generates-me' }, // 癸水 → 甲木
      { monthBranch: '巳', monthQi: '丙', relation: 'i-generate' }, // 甲木 → 丙火
      { monthBranch: '辰', monthQi: '戊', relation: 'i-control' }, // 甲木 克 戊土
      { monthBranch: '酉', monthQi: '辛', relation: 'controls-me' }, // 辛金 克 甲木
    ];
    for (const c of cases) {
      const chart = makeChart({
        dayStem: '甲',
        dayElement: '木',
        year: { stem: '壬', branch: '丑' },
        month: { stem: '丙', branch: c.monthBranch },
        day: { stem: '甲', branch: '午' },
        hour: { stem: '丁', branch: '未' },
      });
      const inputs = collectStrengthInputs(chart);
      expect(inputs.monthCommand.dayMasterRelation, `month ${c.monthBranch}`).toBe(c.relation);
      expect(inputs.monthCommand.primaryHiddenStem, `month ${c.monthBranch}`).toBe(c.monthQi);
      expect(inputs.monthCommand.primaryHiddenStemElement).toBe(
        BRANCH_HIDDEN[c.monthBranch]![0]!.element,
      );
      // Stable, no scoring, no strength verdict.
      expect(JSON.stringify(inputs)).not.toContain('verdict');
      expect(JSON.stringify(inputs)).not.toContain('score');
    }
  });

  it('十神集合分类：outputDrain/wealthDrain/officerPressure 准确且保持 year→month→hour 顺序', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '甲',
      dayElement: '木',
      year: { stem: '庚', branch: '丑' }, // 七杀 → officerPressure
      month: { stem: '丙', branch: '子' }, // 食神 → outputDrain
      day: { stem: '甲', branch: '巳' },
      hour: { stem: '戊', branch: '午' }, // 偏财 → wealthDrain
    });
    const inputs = collectStrengthInputs(chart);
    expect(inputs.visibleStems.officerPressure.map((s) => s.stem)).toEqual(['庚']);
    expect(inputs.visibleStems.outputDrain.map((s) => s.stem)).toEqual(['丙']);
    expect(inputs.visibleStems.wealthDrain.map((s) => s.stem)).toEqual(['戊']);
    expect(inputs.visibleStems.support).toHaveLength(0);
    // Scan order preserved: year → month → hour across buckets.
    expect(inputs.visibleStems.officerPressure[0]!.pillar).toBe('year');
    expect(inputs.visibleStems.outputDrain[0]!.pillar).toBe('month');
    expect(inputs.visibleStems.wealthDrain[0]!.pillar).toBe('hour');
    expect(inputs.visibleStems.officerPressure[0]!.factRef).toBe('bazi.pillars.year.stem');
    // No stem appears in more than one bucket (set equality across buckets;
    // per-bucket scan order is asserted above).
    const total = [
      ...inputs.visibleStems.support,
      ...inputs.visibleStems.outputDrain,
      ...inputs.visibleStems.wealthDrain,
      ...inputs.visibleStems.officerPressure,
    ];
    expect(total.map((s) => s.stem).sort()).toEqual(['丙', '庚', '戊']);
  });

  it('十神集合分类：support 集合（比肩/劫财/正印/偏印）准确且保持扫描顺序', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '甲',
      dayElement: '木',
      year: { stem: '癸', branch: '丑' }, // 正印
      month: { stem: '乙', branch: '子' }, // 劫财
      day: { stem: '甲', branch: '巳' },
      hour: { stem: '壬', branch: '午' }, // 偏印
    });
    const inputs = collectStrengthInputs(chart);
    expect(inputs.visibleStems.support.map((s) => `${s.pillar}:${s.stem}`)).toEqual([
      'year:癸',
      'month:乙',
      'hour:壬',
    ]);
    expect(inputs.visibleStems.outputDrain).toHaveLength(0);
    expect(inputs.visibleStems.wealthDrain).toHaveLength(0);
    expect(inputs.visibleStems.officerPressure).toHaveLength(0);
  });

  it('providerPrimary 原样保留：true/false 均可见，且无任何层级/效果/裁决字段', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '甲',
      dayElement: '木',
      year: { stem: '壬', branch: '亥' }, // 亥藏甲 providerPrimary=false → root candidate
      month: { stem: '丙', branch: '寅' }, // 寅藏甲 providerPrimary=true → root candidate
      day: { stem: '甲', branch: '酉' },
      hour: { stem: '丁', branch: '丑' },
    });
    const inputs = collectStrengthInputs(chart);
    expect(inputs.directRoots.candidates).toHaveLength(2);
    expect(inputs.directRoots.candidates[0]!.pillar).toBe('year');
    expect(inputs.directRoots.candidates[0]!.providerPrimary).toBe(false);
    expect(inputs.directRoots.candidates[1]!.pillar).toBe('month');
    expect(inputs.directRoots.candidates[1]!.providerPrimary).toBe(true);

    const serialized = JSON.stringify(inputs);
    for (const banned of [
      'secondary',
      'residual',
      'level',
      'qiLevel',
      'effective',
      'weakened',
      'neutralized',
      'strength',
      'verdict',
      'score',
      'weight',
      'polarity',
      'auspicious',
      'usefulGod',
      'pattern',
      'formed',
      'broken',
      'transformation',
    ]) {
      expect(serialized, `banned word: ${banned}`).not.toContain(banned);
    }
  });

  it('确定性：相同输入多次调用 JSON 逐字节一致', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '甲',
      dayElement: '木',
      year: { stem: '癸', branch: '丑' },
      month: { stem: '丙', branch: '子' },
      day: { stem: '甲', branch: '巳' },
      hour: { stem: '戊', branch: '午' },
    });
    const first = JSON.stringify(collectStrengthInputs(chart));
    const second = JSON.stringify(collectStrengthInputs(chart));
    const third = JSON.stringify(collectStrengthInputs(chart));
    expect(first).toBe(second);
    expect(first).toBe(third);
  });

  it('provenance：chartSource 逐字复制输入 chart 的 ruleset/provider/version', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '甲',
      dayElement: '木',
      year: { stem: '癸', branch: '丑' },
      month: { stem: '丙', branch: '子' },
      day: { stem: '甲', branch: '巳' },
      hour: { stem: '戊', branch: '午' },
      rulesetId: 'custom-ruleset-for-provenance-test',
      providerId: 'custom-provider-id',
      providerVersion: '9.8.7',
    });
    const inputs = collectStrengthInputs(chart);
    expect(inputs.chartSource).toEqual({
      rulesetId: 'custom-ruleset-for-provenance-test',
      providerId: 'custom-provider-id',
      providerVersion: '9.8.7',
    });
  });

  it('旧输出隔离：新模块未被 index.ts 或 interpret.ts 导入', () => {
    const srcDir = join(__dirname, '..', 'src');
    const indexSrc = readFileSync(join(srcDir, 'index.ts'), 'utf8');
    const interpretSrc = readFileSync(join(srcDir, 'interpret.ts'), 'utf8');
    expect(indexSrc).not.toContain('strength-inputs');
    expect(interpretSrc).not.toContain('strength-inputs');
    expect(indexSrc).not.toContain('collectStrengthInputs');
    expect(interpretSrc).not.toContain('collectStrengthInputs');
  });

  it('输出字段集合严格限定为白名单形状（字段不扩张）', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '甲',
      dayElement: '木',
      year: { stem: '癸', branch: '丑' },
      month: { stem: '丙', branch: '子' },
      day: { stem: '甲', branch: '巳' },
      hour: { stem: '戊', branch: '午' },
    });
    const inputs = collectStrengthInputs(chart);
    expect(Object.keys(inputs).sort()).toEqual(
      [
        'chartSource',
        'dayMaster',
        'directRoots',
        'inspectedPillars',
        'monthCommand',
        'omittedPillars',
        'visibleStems',
      ].sort(),
    );
    expect(Object.keys(inputs.chartSource).sort()).toEqual(
      ['providerId', 'providerVersion', 'rulesetId'].sort(),
    );
    expect(Object.keys(inputs.dayMaster).sort()).toEqual(['element', 'factRef', 'stem'].sort());
    expect(Object.keys(inputs.monthCommand).sort()).toEqual(
      [
        'dayMasterRelation',
        'monthBranch',
        'monthBranchFactRef',
        'primaryHiddenStem',
        'primaryHiddenStemElement',
        'primaryHiddenStemFactRef',
        'primaryHiddenStemIndex',
      ].sort(),
    );
    expect(Object.keys(inputs.visibleStems).sort()).toEqual(
      ['officerPressure', 'outputDrain', 'support', 'wealthDrain'].sort(),
    );
    for (const bucket of Object.values(inputs.visibleStems)) {
      for (const fact of bucket) {
        expect(Object.keys(fact).sort()).toEqual(
          ['element', 'factRef', 'pillar', 'stem', 'tenGod'].sort(),
        );
      }
    }
  });

  it('月令无 primary 标记藏干时字段诚实为 null，不发明本气', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '甲',
      dayElement: '木',
      year: { stem: '壬', branch: '丑' },
      month: {
        stem: '丙',
        branch: '子',
        hiddenStems: [
          { stem: '癸', element: '水', tenGod: '正印', primary: false },
          { stem: '丁', element: '火', tenGod: '伤官', primary: false },
        ],
      },
      day: { stem: '甲', branch: '午' },
      hour: { stem: '丁', branch: '未' },
    });
    const inputs = collectStrengthInputs(chart);
    expect(inputs.monthCommand.primaryHiddenStem).toBeNull();
    expect(inputs.monthCommand.primaryHiddenStemElement).toBeNull();
    expect(inputs.monthCommand.primaryHiddenStemIndex).toBeNull();
    expect(inputs.monthCommand.dayMasterRelation).toBeNull();
    expect(inputs.monthCommand.primaryHiddenStemFactRef).toBe('bazi.pillars.month.hiddenStems');
  });
});
