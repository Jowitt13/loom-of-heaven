import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BaziChartResult, BaziHiddenStem, BaziPillar } from '@loom/contracts';
import { tenGodOf } from '../src/fundamentals.ts';
import { collectPatternInputs } from '../src/pattern-inputs.ts';

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
      year: makePillar(cfg.year, cfg.dayStem, false),
      month: makePillar(cfg.month, cfg.dayStem, false),
      day: makePillar(cfg.day, cfg.dayStem, true),
      hour: cfg.hour === null ? null : makePillar(cfg.hour, cfg.dayStem, false),
    },
    luckCycle: null,
  };
}

describe('collectPatternInputs (D2-B shadow-only pattern-candidate evidence)', () => {
  it('BZ-P001: 月令本气命中常规命名候选，evidence-only，无成格/破格词', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '甲',
      dayElement: '木',
      year: { stem: '壬', branch: '子' },
      month: { stem: '丙', branch: '酉' }, // 酉藏辛金，甲日 → 正官
      day: { stem: '甲', branch: '午' },
      hour: { stem: '丁', branch: '未' },
    });

    const inputs = collectPatternInputs(chart);
    expect(inputs.monthCommand.primaryHiddenStem).toBe('辛');
    expect(inputs.monthCommand.primaryHiddenStemTenGod).toBe('正官');
    const cand = inputs.monthCommand.namingCandidate;
    expect(cand.candidateId).toBe('regular-month-command/正官');
    expect(cand.status).toBe('matched');
    expect(cand.finalization).toBe('evidence-only');
    expect(cand.evidence.length).toBeGreaterThanOrEqual(1);
    expect(cand.evidence[0]!.layer).toBe('fact');
    expect(cand.evidence[0]!.role).toBe('support');
    const serialized = JSON.stringify(inputs);
    for (const banned of ['formed', 'broken', 'selected', 'useful', '吉凶', '成格', '破格']) {
      expect(serialized, banned).not.toContain(banned);
    }
  });

  it('BZ-P002a: 精确临官座位命中为 evidence-only candidate', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '甲',
      dayElement: '木',
      year: { stem: '壬', branch: '子' },
      month: { stem: '丙', branch: '寅' }, // 甲临官(禄)在寅 → exact seat hit
      day: { stem: '甲', branch: '午' },
      hour: { stem: '丁', branch: '未' },
    });

    const inputs = collectPatternInputs(chart);
    expect(inputs.jianLu.candidateId).toBe('jian-lu');
    expect(inputs.jianLu.status).toBe('matched');
    expect(inputs.jianLu.finalization).toBe('evidence-only');
    expect(inputs.jianLu.evidence.some((e) => e.role === 'support')).toBe(true);
  });

  it('BZ-P002b: 比劫月但非临官座位 → not-applicable，不是建禄', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '甲',
      dayElement: '木',
      year: { stem: '壬', branch: '子' },
      month: { stem: '丙', branch: '卯' }, // 乙木劫财当令；甲禄在寅非卯
      day: { stem: '甲', branch: '午' },
      hour: { stem: '丁', branch: '未' },
    });

    const inputs = collectPatternInputs(chart);
    // 比劫当令事实存在……
    expect(inputs.monthCommand.primaryHiddenStemTenGod).toBe('劫财');
    // ……但不等于建禄。
    expect(inputs.jianLu.status).toBe('not-applicable');
    expect(inputs.jianLu.evidence.some((e) => e.note.includes('不自动等于建禄'))).toBe(true);
  });

  it('BZ-P003a: 阳干 legacy blade-seat 表项命中仅记录座位事实', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '丙',
      dayElement: '火',
      year: { stem: '壬', branch: '子' },
      month: { stem: '甲', branch: '午' }, // 丙帝旺(刃)在午 → exact seat hit
      day: { stem: '丙', branch: '辰' },
      hour: { stem: '丁', branch: '未' },
    });

    const inputs = collectPatternInputs(chart);
    expect(inputs.yangRen.candidateId).toBe('yang-ren');
    expect(inputs.yangRen.status).toBe('matched');
    expect(inputs.yangRen.finalization).toBe('evidence-only');
    // 只记录座位事实；不输出凶煞/用神结论。
    const serialized = JSON.stringify(inputs);
    expect(serialized).not.toContain('凶');
    expect(serialized).not.toContain('用神');
  });

  it('BZ-P003b: 阴干阳刃 → unresolved，保留日主与月支事实，不宣称普遍无', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '乙',
      dayElement: '木',
      year: { stem: '壬', branch: '子' },
      month: { stem: '丙', branch: '卯' },
      day: { stem: '乙', branch: '午' },
      hour: { stem: '丁', branch: '未' },
    });

    const inputs = collectPatternInputs(chart);
    expect(inputs.yangRen.status).toBe('unresolved');
    const refs = inputs.yangRen.evidence.map((e) => e.ref);
    expect(refs).toEqual(['bazi.dayMaster.stem', 'bazi.pillars.month.branch']);
    // 不得把“阴干无阳刃”写成普遍真理。
    expect(JSON.stringify(inputs.yangRen)).not.toContain('无阳刃');
    expect(JSON.stringify(inputs.yangRen)).not.toContain('fundamentals');
  });

  it('BZ-P004: 墓库月两个非本气藏干分别透干，全部保留且不择主', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '甲',
      dayElement: '木',
      year: { stem: '壬', branch: '子' },
      month: { stem: '乙', branch: '辰' }, // 辰藏戊(primary)/乙/癸；乙透于月干
      day: { stem: '甲', branch: '午' },
      hour: { stem: '癸', branch: '未' }, // 癸透于时干
    });

    const inputs = collectPatternInputs(chart);
    expect(inputs.miscQi.isTombMonth).toBe(true);
    // 两个 providerPrimary=false 的藏干都在可见干中出现。
    const transparent = inputs.miscQi.transparencyFacts.filter(
      (t) => !t.providerPrimary && t.visibleStemFactRef !== null,
    );
    expect(transparent).toHaveLength(2);
    expect(transparent[0]!.hiddenStem).toBe('乙');
    expect(transparent[0]!.hiddenStemIndex).toBe(1);
    expect(transparent[0]!.providerPrimary).toBe(false);
    expect(transparent[0]!.visibleStemFactRef).toBe('bazi.pillars.month.stem');
    expect(transparent[1]!.hiddenStem).toBe('癸');
    expect(transparent[1]!.hiddenStemIndex).toBe(2);
    expect(transparent[1]!.providerPrimary).toBe(false);
    expect(transparent[1]!.visibleStemFactRef).toBe('bazi.pillars.hour.stem');
    // 候选 matched 但 evidence-only，全部竞争项原样保留、不择主。
    expect(inputs.miscQi.candidate.status).toBe('matched');
    expect(inputs.miscQi.candidate.finalization).toBe('evidence-only');
    expect(inputs.miscQi.candidate.evidence).toHaveLength(2);
    const serialized = JSON.stringify(inputs);
    for (const banned of ['secondary', 'residual', '中气', '余气']) {
      expect(serialized, banned).not.toContain(banned);
    }
  });

  it('BZ-P005: 墓库月无任何透干匹配 → 透明集合为空，不猜格', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '甲',
      dayElement: '木',
      year: { stem: '庚', branch: '子' },
      month: { stem: '丙', branch: '辰' }, // 辰藏戊/乙/癸，均不可见
      day: { stem: '甲', branch: '午' },
      hour: { stem: '丁', branch: '未' },
    });

    const inputs = collectPatternInputs(chart);
    expect(inputs.miscQi.isTombMonth).toBe(true);
    const transparent = inputs.miscQi.transparencyFacts.filter(
      (t) => !t.providerPrimary && t.visibleStemFactRef !== null,
    );
    expect(transparent).toHaveLength(0);
    expect(inputs.miscQi.candidate.status).toBe('unresolved');
    expect(inputs.miscQi.candidate.evidence.some((e) => e.note.includes('不'))).toBe(true);
    // 不从月令本气猜格：命名候选对本气戊(偏财)仍是 evidence-only，未生成替代候选。
    expect(inputs.monthCommand.namingCandidate.finalization).toBe('evidence-only');
    // 序列化不得出现任何藏干层级命名。
    const serialized = JSON.stringify(inputs);
    for (const banned of ['secondary', 'residual', '中气', '余气']) {
      expect(serialized, banned).not.toContain(banned);
    }
  });

  it('BZ-P009: 干合只保留 D1-B tableRef/participants，无 transformation/化气', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '丙',
      dayElement: '火',
      year: { stem: '己', branch: '子' },
      month: { stem: '甲', branch: '酉' }, // 甲己五合（仅 year-month 一对）
      day: { stem: '丙', branch: '午' },
      hour: { stem: '乙', branch: '未' },
    });

    const inputs = collectPatternInputs(chart);
    expect(inputs.stemCombinations).toHaveLength(1);
    const fact = inputs.stemCombinations[0]!;
    expect(fact.kind).toBe('stem-five-combination');
    expect(fact.tableRef).toBe('stem-five-combination/甲己');
    expect(fact.participants.map((p) => `${p.pillar}:${p.value}`)).toEqual(['year:己', 'month:甲']);
    const serialized = JSON.stringify(inputs);
    for (const banned of ['transformation', 'transformed', '化气', 'accepted']) {
      expect(serialized, banned).not.toContain(banned);
    }
  });

  it('BZ-C003: hour 为 null 时无任何 hour 透明 evidence 或 hour factRef', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '甲',
      dayElement: '木',
      year: { stem: '壬', branch: '子' },
      month: { stem: '乙', branch: '辰' },
      day: { stem: '甲', branch: '午' },
      hour: null,
    });

    const inputs = collectPatternInputs(chart);
    expect(inputs.omittedPillars).toEqual(['hour']);
    expect(inputs.inspectedPillars).toEqual(['year', 'month', 'day']);
    for (const t of inputs.miscQi.transparencyFacts) {
      expect(t.visiblePillar).not.toBe('hour');
      if (t.visibleStemFactRef !== null) {
        expect(t.visibleStemFactRef).not.toContain('bazi.pillars.hour');
      }
    }
    expect(JSON.stringify(inputs)).not.toContain('bazi.pillars.hour');
  });

  it('确定性：相同输入多次调用 JSON 逐字节一致', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '甲',
      dayElement: '木',
      year: { stem: '壬', branch: '子' },
      month: { stem: '乙', branch: '辰' },
      day: { stem: '甲', branch: '午' },
      hour: { stem: '癸', branch: '未' },
    });
    const first = JSON.stringify(collectPatternInputs(chart));
    const second = JSON.stringify(collectPatternInputs(chart));
    const third = JSON.stringify(collectPatternInputs(chart));
    expect(first).toBe(second);
    expect(first).toBe(third);
  });

  it('provenance：chartSource 逐字复制；evidence.ref 均可追溯', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '甲',
      dayElement: '木',
      year: { stem: '壬', branch: '子' },
      month: { stem: '丙', branch: '酉' },
      day: { stem: '甲', branch: '午' },
      hour: { stem: '丁', branch: '未' },
    });
    const inputs = collectPatternInputs(chart);
    expect(inputs.chartSource).toEqual({
      rulesetId: 'bazi-standard@0.1.0',
      providerId: 'tyme4ts',
      providerVersion: '1.5.2',
    });
    const candidates = [
      inputs.monthCommand.namingCandidate,
      inputs.jianLu,
      inputs.yangRen,
      inputs.miscQi.candidate,
    ];
    // Every evidence ref must resolve to a chart fact path (whitelist):
    // bazi.dayMaster.stem | bazi.pillars.<y|m|d|h>.stem | ...branch |
    // bazi.pillars.month.hiddenStems | ...hiddenStems[<index>]
    const REF_WHITELIST =
      /^bazi\.(dayMaster\.stem|pillars\.(year|month|day|hour)\.(stem|branch)|pillars\.month\.hiddenStems(\[\d+\])?)$/;
    for (const cand of candidates) {
      expect(cand.finalization).toBe('evidence-only');
      for (const e of cand.evidence) {
        expect(e.ref.length).toBeGreaterThan(0);
        expect(e.ref, `non-chart ref: ${e.ref}`).toMatch(REF_WHITELIST);
        expect(['fact', 'derived-structure']).toContain(e.layer);
        expect(['support', 'blocker', 'contradiction', 'context']).toContain(e.role);
      }
    }
  });

  it('旧输出隔离：新模块未被 index.ts 或 interpret.ts 导入', () => {
    const srcDir = join(__dirname, '..', 'src');
    const indexSrc = readFileSync(join(srcDir, 'index.ts'), 'utf8');
    const interpretSrc = readFileSync(join(srcDir, 'interpret.ts'), 'utf8');
    expect(indexSrc).not.toContain('pattern-inputs');
    expect(interpretSrc).not.toContain('pattern-inputs');
    expect(indexSrc).not.toContain('collectPatternInputs');
    expect(interpretSrc).not.toContain('collectPatternInputs');
  });

  it('输出字段集合严格限定为白名单形状（字段不扩张）', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '甲',
      dayElement: '木',
      year: { stem: '壬', branch: '子' },
      month: { stem: '乙', branch: '辰' },
      day: { stem: '甲', branch: '午' },
      hour: { stem: '癸', branch: '未' },
    });
    const inputs = collectPatternInputs(chart);
    expect(Object.keys(inputs).sort()).toEqual(
      [
        'chartSource',
        'dayMaster',
        'inspectedPillars',
        'jianLu',
        'miscQi',
        'monthCommand',
        'omittedPillars',
        'stemCombinations',
        'yangRen',
      ].sort(),
    );
    expect(Object.keys(inputs.monthCommand).sort()).toEqual(
      [
        'monthBranch',
        'monthBranchFactRef',
        'namingCandidate',
        'primaryHiddenStem',
        'primaryHiddenStemFactRef',
        'primaryHiddenStemIndex',
        'primaryHiddenStemTenGod',
      ].sort(),
    );
    expect(Object.keys(inputs.miscQi).sort()).toEqual(
      ['candidate', 'isTombMonth', 'monthBranchFactRef', 'transparencyFacts'].sort(),
    );
    const candidates = [
      inputs.monthCommand.namingCandidate,
      inputs.jianLu,
      inputs.yangRen,
      inputs.miscQi.candidate,
    ];
    for (const cand of candidates) {
      expect(Object.keys(cand).sort()).toEqual(
        ['candidateId', 'evidence', 'finalization', 'status'].sort(),
      );
      expect(cand.finalization).toBe('evidence-only');
      for (const e of cand.evidence) {
        expect(Object.keys(e).sort()).toEqual(['layer', 'note', 'ref', 'role'].sort());
      }
    }
    for (const t of inputs.miscQi.transparencyFacts) {
      expect(Object.keys(t).sort()).toEqual(
        [
          'element',
          'hiddenStem',
          'hiddenStemFactRef',
          'hiddenStemIndex',
          'providerPrimary',
          'tenGod',
          'visiblePillar',
          'visibleStemFactRef',
        ].sort(),
      );
    }
  });

  it('禁止词扫描：无 score/weight/强弱/化气/吉凶/用神/从格 等语义', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '甲',
      dayElement: '木',
      year: { stem: '己', branch: '子' },
      month: { stem: '乙', branch: '辰' },
      day: { stem: '甲', branch: '午' },
      hour: { stem: '癸', branch: '未' },
    });
    const serialized = JSON.stringify(collectPatternInputs(chart));
    for (const banned of [
      'score',
      'weight',
      'threshold',
      'probability',
      '身强',
      '身弱',
      '旺衰',
      '成格',
      '破格',
      '用神',
      '喜神',
      '忌神',
      '从格',
      '从财',
      '从官',
      '专旺',
      '化气',
      '成化',
      'polarity',
      '命定',
      '预测',
      'bazi-rules-ziping@0.2.0',
    ]) {
      expect(serialized, banned).not.toContain(banned);
    }
  });
});
