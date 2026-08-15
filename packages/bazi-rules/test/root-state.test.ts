import { describe, expect, it } from 'vitest';
import type { BaziChartResult, BaziHiddenStem, BaziPillar } from '@loom/contracts';
import { collectDirectRootEvidence } from '../src/root-state.ts';

// ---------------------------------------------------------------------------
// Synthetic fixture builders. Every chart below is a synthetic technical
// fixture — not a real person's birth record. All stems, branches, hidden
// stems, na-yin and ten-god labels use canonical values, but the assembled
// charts correspond to no actual person, place, or life event.
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
const NAYIN: Record<string, string> = {
  甲子: '海中金',
  甲寅: '大溪水',
  甲午: '沙中金',
  乙卯: '大溪水',
  乙酉: '泉中水',
  丙子: '涧下水',
  丙寅: '炉中火',
  丙午: '天河水',
  丙申: '山下火',
  丁丑: '涧下水',
  己巳: '大林木',
  己未: '天上火',
  庚午: '路旁土',
  庚辰: '白蜡金',
  癸丑: '桑柘木',
  癸卯: '金箔金',
  癸亥: '大海水',
};

// synthetic technical fixture — not a real person's birth record
interface PillarSpec {
  stem: string;
  branch: string;
  hiddenStems: BaziHiddenStem[];
  tenGod: string | null;
}

// synthetic technical fixture — not a real person's birth record
function makePillar(spec: PillarSpec, isDay: boolean): BaziPillar {
  return {
    stem: spec.stem,
    branch: spec.branch,
    stemElement: STEM_ELEMENT[spec.stem]!,
    branchElement: BRANCH_ELEMENT[spec.branch]!,
    stemYinYang: STEM_YIN_YANG[spec.stem]!,
    naYin: NAYIN[`${spec.stem}${spec.branch}`]!,
    tenGod: isDay ? null : spec.tenGod,
    tenGodDisplay: isDay ? '日主(日元)' : spec.tenGod!,
    hiddenStems: spec.hiddenStems,
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
}): BaziChartResult {
  return {
    rulesetId: 'bazi-standard@0.1.0',
    provider: { id: 'tyme4ts', version: '1.5.2', license: 'MIT' },
    solarTimeApplied: 'civil',
    dayBoundaryApplied: 'zi-hour/late (tyme4ts default)',
    dayMaster: {
      stem: cfg.dayStem,
      element: cfg.dayElement,
      yinYang: STEM_YIN_YANG[cfg.dayStem]!,
    },
    pillars: {
      year: makePillar(cfg.year, false),
      month: makePillar(cfg.month, false),
      day: makePillar(cfg.day, true),
      hour: cfg.hour === null ? null : makePillar(cfg.hour, false),
    },
    luckCycle: null,
  };
}

describe('collectDirectRootEvidence (D1-A shadow-only structural evidence)', () => {
  it('BZ-R001: providerPrimary=true 的直接根候选被记录', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '甲',
      dayElement: '木',
      year: {
        stem: '庚',
        branch: '午',
        tenGod: '七杀',
        hiddenStems: [
          { stem: '丁', element: '火', tenGod: '伤官', primary: true },
          { stem: '己', element: '土', tenGod: '正财', primary: false },
        ],
      },
      month: {
        stem: '丙',
        branch: '寅',
        tenGod: '食神',
        hiddenStems: [
          { stem: '甲', element: '木', tenGod: '比肩', primary: true },
          { stem: '丙', element: '火', tenGod: '食神', primary: false },
          { stem: '戊', element: '土', tenGod: '偏财', primary: false },
        ],
      },
      day: {
        stem: '甲',
        branch: '酉',
        tenGod: null,
        hiddenStems: [{ stem: '辛', element: '金', tenGod: '正官', primary: true }],
      },
      hour: {
        stem: '丁',
        branch: '丑',
        tenGod: '伤官',
        hiddenStems: [
          { stem: '己', element: '土', tenGod: '正财', primary: true },
          { stem: '癸', element: '水', tenGod: '正印', primary: false },
          { stem: '辛', element: '金', tenGod: '正官', primary: false },
        ],
      },
    });

    const ev = collectDirectRootEvidence(chart);
    expect(ev.dayMasterElement).toBe('木');
    expect(ev.hasDirectRoot).toBe(true);
    expect(ev.candidates).toHaveLength(1);
    const c = ev.candidates[0]!;
    expect(c.pillar).toBe('month');
    expect(c.branch).toBe('寅');
    expect(c.hiddenStem).toBe('甲');
    expect(c.element).toBe('木');
    expect(c.tenGod).toBe('比肩');
    expect(c.hiddenStemIndex).toBe(0);
    expect(c.providerPrimary).toBe(true);
    expect(c.factRef).toBe('bazi.pillars.month.hiddenStems[0]');
    expect(ev.inspectedPillars).toEqual(['year', 'month', 'day', 'hour']);
    expect(ev.omittedPillars).toEqual([]);
    expect(ev.chartSource).toEqual({
      rulesetId: 'bazi-standard@0.1.0',
      providerId: 'tyme4ts',
      providerVersion: '1.5.2',
    });
  });

  it('BZ-R002: providerPrimary=false 的候选被记录，且不出现 secondary 等新层级字段', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '甲',
      dayElement: '木',
      year: {
        stem: '己',
        branch: '巳',
        tenGod: '正财',
        hiddenStems: [
          { stem: '丙', element: '火', tenGod: '食神', primary: true },
          { stem: '戊', element: '土', tenGod: '偏财', primary: false },
          { stem: '庚', element: '金', tenGod: '七杀', primary: false },
        ],
      },
      month: {
        stem: '丙',
        branch: '子',
        tenGod: '食神',
        hiddenStems: [{ stem: '癸', element: '水', tenGod: '正印', primary: true }],
      },
      day: {
        stem: '甲',
        branch: '酉',
        tenGod: null,
        hiddenStems: [{ stem: '辛', element: '金', tenGod: '正官', primary: true }],
      },
      hour: {
        stem: '癸',
        branch: '亥',
        tenGod: '正印',
        hiddenStems: [
          { stem: '壬', element: '水', tenGod: '偏印', primary: true },
          { stem: '甲', element: '木', tenGod: '比肩', primary: false },
        ],
      },
    });

    const ev = collectDirectRootEvidence(chart);
    expect(ev.candidates).toHaveLength(1);
    const c = ev.candidates[0]!;
    expect(c.pillar).toBe('hour');
    expect(c.hiddenStem).toBe('甲');
    expect(c.hiddenStemIndex).toBe(1);
    expect(c.providerPrimary).toBe(false);
    const serialized = JSON.stringify(ev);
    expect(serialized).not.toContain('secondary');
    expect(serialized).not.toContain('residual');
    expect(serialized).not.toContain('level');
  });

  it('BZ-R003: 非本气候选保留原始 hiddenStemIndex，不生成层级标签', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '乙',
      dayElement: '木',
      year: {
        stem: '甲',
        branch: '子',
        tenGod: '劫财',
        hiddenStems: [{ stem: '癸', element: '水', tenGod: '偏印', primary: true }],
      },
      month: {
        stem: '丙',
        branch: '午',
        tenGod: '伤官',
        hiddenStems: [
          { stem: '丁', element: '火', tenGod: '食神', primary: true },
          { stem: '己', element: '土', tenGod: '偏财', primary: false },
        ],
      },
      day: {
        stem: '乙',
        branch: '酉',
        tenGod: null,
        hiddenStems: [{ stem: '辛', element: '金', tenGod: '七杀', primary: true }],
      },
      hour: {
        stem: '己',
        branch: '未',
        tenGod: '偏财',
        hiddenStems: [
          { stem: '己', element: '土', tenGod: '偏财', primary: true },
          { stem: '丁', element: '火', tenGod: '食神', primary: false },
          { stem: '乙', element: '木', tenGod: '比肩', primary: false },
        ],
      },
    });

    const ev = collectDirectRootEvidence(chart);
    expect(ev.candidates).toHaveLength(1);
    const c = ev.candidates[0]!;
    expect(c.pillar).toBe('hour');
    expect(c.hiddenStem).toBe('乙');
    // Provider array position preserved verbatim; no tier label synthesized.
    expect(c.hiddenStemIndex).toBe(2);
    expect(c.providerPrimary).toBe(false);
    expect(c.factRef).toBe('bazi.pillars.hour.hiddenStems[2]');
    const serialized = JSON.stringify(ev);
    expect(serialized).not.toContain('secondary');
    expect(serialized).not.toContain('residual');
    expect(serialized).not.toContain('level');
  });

  it('BZ-R004: 同柱含资源类藏干时只记同元素直接根，不膨胀为多根', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '丙',
      dayElement: '火',
      year: {
        stem: '癸',
        branch: '丑',
        tenGod: '正官',
        hiddenStems: [
          { stem: '己', element: '土', tenGod: '伤官', primary: true },
          { stem: '癸', element: '水', tenGod: '正官', primary: false },
          { stem: '辛', element: '金', tenGod: '正财', primary: false },
        ],
      },
      month: {
        stem: '丙',
        branch: '寅',
        tenGod: '比肩',
        hiddenStems: [
          // Resource (印) stem in the same branch — must NOT become a root.
          { stem: '甲', element: '木', tenGod: '偏印', primary: true },
          { stem: '丙', element: '火', tenGod: '比肩', primary: false },
          { stem: '戊', element: '土', tenGod: '食神', primary: false },
        ],
      },
      day: {
        stem: '丙',
        branch: '子',
        tenGod: null,
        hiddenStems: [{ stem: '癸', element: '水', tenGod: '正官', primary: true }],
      },
      hour: {
        stem: '丁',
        branch: '丑',
        tenGod: '劫财',
        hiddenStems: [
          { stem: '己', element: '土', tenGod: '伤官', primary: true },
          { stem: '癸', element: '水', tenGod: '正官', primary: false },
          { stem: '辛', element: '金', tenGod: '正财', primary: false },
        ],
      },
    });

    const ev = collectDirectRootEvidence(chart);
    // Only the same-element stem (丙火) counts; the resource stem (甲木) in the
    // same branch must not inflate the candidate set.
    expect(ev.candidates).toHaveLength(1);
    expect(ev.candidates[0]!.pillar).toBe('month');
    expect(ev.candidates[0]!.hiddenStem).toBe('丙');
    expect(ev.candidates[0]!.hiddenStemIndex).toBe(1);
    expect(ev.candidates[0]!.providerPrimary).toBe(false);
    expect(ev.candidates.every((c) => c.element === '火')).toBe(true);
    expect(ev.candidates.find((c) => c.hiddenStem === '甲')).toBeUndefined();
    expect(ev.hasDirectRoot).toBe(true);
  });

  it('BZ-R007: 两个不同柱的直接根分别保留且顺序稳定，不涉及关系影响', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '甲',
      dayElement: '木',
      year: {
        stem: '庚',
        branch: '午',
        tenGod: '七杀',
        hiddenStems: [
          { stem: '丁', element: '火', tenGod: '伤官', primary: true },
          { stem: '己', element: '土', tenGod: '正财', primary: false },
        ],
      },
      month: {
        stem: '乙',
        branch: '卯',
        tenGod: '劫财',
        hiddenStems: [{ stem: '乙', element: '木', tenGod: '劫财', primary: true }],
      },
      day: {
        stem: '甲',
        branch: '寅',
        tenGod: null,
        hiddenStems: [
          { stem: '甲', element: '木', tenGod: '比肩', primary: true },
          { stem: '丙', element: '火', tenGod: '食神', primary: false },
          { stem: '戊', element: '土', tenGod: '偏财', primary: false },
        ],
      },
      hour: {
        stem: '丙',
        branch: '申',
        tenGod: '食神',
        hiddenStems: [
          { stem: '庚', element: '金', tenGod: '七杀', primary: true },
          { stem: '壬', element: '水', tenGod: '偏印', primary: false },
          { stem: '戊', element: '土', tenGod: '偏财', primary: false },
        ],
      },
    });

    const ev = collectDirectRootEvidence(chart);
    expect(ev.candidates).toHaveLength(2);
    // Fixed scan order year → month → day → hour; no relation/effect fields.
    expect(ev.candidates[0]!.pillar).toBe('month');
    expect(ev.candidates[0]!.factRef).toBe('bazi.pillars.month.hiddenStems[0]');
    expect(ev.candidates[1]!.pillar).toBe('day');
    expect(ev.candidates[1]!.factRef).toBe('bazi.pillars.day.hiddenStems[0]');
    expect(ev.inspectedPillars).toEqual(['year', 'month', 'day', 'hour']);
    expect(ev.omittedPillars).toEqual([]);
  });

  it('BZ-C003: hour 为 null 时 omittedPillars 仅含 hour，且没有 hour 候选', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '甲',
      dayElement: '木',
      year: {
        stem: '庚',
        branch: '午',
        tenGod: '七杀',
        hiddenStems: [
          { stem: '丁', element: '火', tenGod: '伤官', primary: true },
          { stem: '己', element: '土', tenGod: '正财', primary: false },
        ],
      },
      month: {
        stem: '乙',
        branch: '卯',
        tenGod: '劫财',
        hiddenStems: [{ stem: '乙', element: '木', tenGod: '劫财', primary: true }],
      },
      day: {
        stem: '甲',
        branch: '寅',
        tenGod: null,
        hiddenStems: [
          { stem: '甲', element: '木', tenGod: '比肩', primary: true },
          { stem: '丙', element: '火', tenGod: '食神', primary: false },
          { stem: '戊', element: '土', tenGod: '偏财', primary: false },
        ],
      },
      hour: null,
    });

    const ev = collectDirectRootEvidence(chart);
    expect(ev.omittedPillars).toEqual(['hour']);
    expect(ev.inspectedPillars).toEqual(['year', 'month', 'day']);
    expect(ev.candidates.every((c) => c.pillar !== 'hour')).toBe(true);
    expect(ev.candidates).toHaveLength(2); // month + day only
    expect(ev.hasDirectRoot).toBe(true);
  });

  it('无直接根：hasDirectRoot 为 false 且候选为空', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '庚',
      dayElement: '金',
      year: {
        stem: '甲',
        branch: '午',
        tenGod: '偏财',
        hiddenStems: [
          { stem: '丁', element: '火', tenGod: '正官', primary: true },
          { stem: '己', element: '土', tenGod: '正印', primary: false },
        ],
      },
      month: {
        stem: '己',
        branch: '未',
        tenGod: '正印',
        hiddenStems: [
          { stem: '己', element: '土', tenGod: '正印', primary: true },
          { stem: '丁', element: '火', tenGod: '正官', primary: false },
          { stem: '乙', element: '木', tenGod: '正财', primary: false },
        ],
      },
      day: {
        stem: '庚',
        branch: '辰',
        tenGod: null,
        hiddenStems: [
          { stem: '戊', element: '土', tenGod: '偏印', primary: true },
          { stem: '乙', element: '木', tenGod: '正财', primary: false },
          { stem: '癸', element: '水', tenGod: '伤官', primary: false },
        ],
      },
      hour: {
        stem: '癸',
        branch: '卯',
        tenGod: '伤官',
        hiddenStems: [{ stem: '乙', element: '木', tenGod: '正财', primary: true }],
      },
    });

    const ev = collectDirectRootEvidence(chart);
    expect(ev.hasDirectRoot).toBe(false);
    expect(ev.candidates).toHaveLength(0);
    expect(ev.inspectedPillars).toEqual(['year', 'month', 'day', 'hour']);
    expect(ev.omittedPillars).toEqual([]);
  });

  it('确定性：相同输入多次调用 JSON 逐字节一致', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '甲',
      dayElement: '木',
      year: {
        stem: '庚',
        branch: '午',
        tenGod: '七杀',
        hiddenStems: [
          { stem: '丁', element: '火', tenGod: '伤官', primary: true },
          { stem: '己', element: '土', tenGod: '正财', primary: false },
        ],
      },
      month: {
        stem: '乙',
        branch: '卯',
        tenGod: '劫财',
        hiddenStems: [{ stem: '乙', element: '木', tenGod: '劫财', primary: true }],
      },
      day: {
        stem: '甲',
        branch: '寅',
        tenGod: null,
        hiddenStems: [
          { stem: '甲', element: '木', tenGod: '比肩', primary: true },
          { stem: '丙', element: '火', tenGod: '食神', primary: false },
          { stem: '戊', element: '土', tenGod: '偏财', primary: false },
        ],
      },
      hour: {
        stem: '丙',
        branch: '申',
        tenGod: '食神',
        hiddenStems: [
          { stem: '庚', element: '金', tenGod: '七杀', primary: true },
          { stem: '壬', element: '水', tenGod: '偏印', primary: false },
          { stem: '戊', element: '土', tenGod: '偏财', primary: false },
        ],
      },
    });

    const first = JSON.stringify(collectDirectRootEvidence(chart));
    const second = JSON.stringify(collectDirectRootEvidence(chart));
    const third = JSON.stringify(collectDirectRootEvidence(chart));
    expect(first).toBe(second);
    expect(first).toBe(third);
  });

  it('字段禁令：序列化结果不含 secondary/residual/level/weight/score/strength/effective/polarity/auspicious', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '甲',
      dayElement: '木',
      year: {
        stem: '庚',
        branch: '午',
        tenGod: '七杀',
        hiddenStems: [
          { stem: '丁', element: '火', tenGod: '伤官', primary: true },
          { stem: '己', element: '土', tenGod: '正财', primary: false },
        ],
      },
      month: {
        stem: '乙',
        branch: '卯',
        tenGod: '劫财',
        hiddenStems: [{ stem: '乙', element: '木', tenGod: '劫财', primary: true }],
      },
      day: {
        stem: '甲',
        branch: '寅',
        tenGod: null,
        hiddenStems: [
          { stem: '甲', element: '木', tenGod: '比肩', primary: true },
          { stem: '丙', element: '火', tenGod: '食神', primary: false },
          { stem: '戊', element: '土', tenGod: '偏财', primary: false },
        ],
      },
      hour: null,
    });

    const serialized = JSON.stringify(collectDirectRootEvidence(chart));
    for (const banned of [
      'secondary',
      'residual',
      'level',
      'weight',
      'score',
      'strength',
      'effective',
      'polarity',
      'auspicious',
    ]) {
      expect(serialized).not.toContain(banned);
    }
  });

  it('输出字段集合严格限定为白名单形状（字段不扩张）', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '甲',
      dayElement: '木',
      year: {
        stem: '庚',
        branch: '午',
        tenGod: '七杀',
        hiddenStems: [
          { stem: '丁', element: '火', tenGod: '伤官', primary: true },
          { stem: '己', element: '土', tenGod: '正财', primary: false },
        ],
      },
      month: {
        stem: '乙',
        branch: '卯',
        tenGod: '劫财',
        hiddenStems: [{ stem: '乙', element: '木', tenGod: '劫财', primary: true }],
      },
      day: {
        stem: '甲',
        branch: '寅',
        tenGod: null,
        hiddenStems: [
          { stem: '甲', element: '木', tenGod: '比肩', primary: true },
          { stem: '丙', element: '火', tenGod: '食神', primary: false },
          { stem: '戊', element: '土', tenGod: '偏财', primary: false },
        ],
      },
      hour: {
        stem: '丙',
        branch: '申',
        tenGod: '食神',
        hiddenStems: [
          { stem: '庚', element: '金', tenGod: '七杀', primary: true },
          { stem: '壬', element: '水', tenGod: '偏印', primary: false },
          { stem: '戊', element: '土', tenGod: '偏财', primary: false },
        ],
      },
    });

    const ev = collectDirectRootEvidence(chart);
    expect(Object.keys(ev).sort()).toEqual(
      [
        'candidates',
        'chartSource',
        'dayMasterElement',
        'hasDirectRoot',
        'inspectedPillars',
        'omittedPillars',
      ].sort(),
    );
    expect(Object.keys(ev.chartSource).sort()).toEqual(
      ['providerId', 'providerVersion', 'rulesetId'].sort(),
    );
    for (const c of ev.candidates) {
      expect(Object.keys(c).sort()).toEqual(
        [
          'branch',
          'element',
          'factRef',
          'hiddenStem',
          'hiddenStemIndex',
          'pillar',
          'providerPrimary',
          'tenGod',
        ].sort(),
      );
    }
  });
});
