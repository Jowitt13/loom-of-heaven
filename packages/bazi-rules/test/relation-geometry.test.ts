import { describe, expect, it } from 'vitest';
import type { BaziChartResult, BaziHiddenStem, BaziPillar } from '@loom/contracts';
import { tenGodOf } from '../src/fundamentals.ts';
import { collectRelationGeometry } from '../src/relation-geometry.ts';
import { collectDirectRootEvidence } from '../src/root-state.ts';

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
}

// synthetic technical fixture — not a real person's birth record
function makePillar(spec: PillarSpec, dayStem: string, isDay: boolean): BaziPillar {
  const stemGod = isDay ? null : (tenGodOf(dayStem, spec.stem) ?? null);
  const hiddenStems: BaziHiddenStem[] = BRANCH_HIDDEN[spec.branch]!.map((h) => ({
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

describe('collectRelationGeometry (D1-B shadow-only structural evidence)', () => {
  it('BZ-R005: 直接根与冲的事实同时保留，不评价根是否被削弱', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '甲',
      dayElement: '木',
      year: { stem: '甲', branch: '子' },
      month: { stem: '丙', branch: '寅' }, // 甲木 direct root (hidden 甲, primary)
      day: { stem: '甲', branch: '酉' },
      hour: { stem: '庚', branch: '申' }, // 寅申 clash targets the root branch
    });

    const roots = collectDirectRootEvidence(chart);
    expect(roots.hasDirectRoot).toBe(true);
    expect(roots.candidates).toHaveLength(1);
    expect(roots.candidates[0]!.pillar).toBe('month');
    expect(roots.candidates[0]!.branch).toBe('寅');

    const geo = collectRelationGeometry(chart);
    const clash = geo.facts.find(
      (f) => f.kind === 'branch-clash' && f.tableRef === 'branch-clash/寅申',
    );
    expect(clash, 'branch-clash/寅申').toBeDefined();
    expect(clash!.participants.map((p) => `${p.pillar}:${p.value}`)).toEqual([
      'month:寅',
      'hour:申',
    ]);

    // Both facts coexist; nothing in either output evaluates root damage.
    expect(geo.facts.every((f) => 'polarity' in f)).toBe(false);
  });

  it('BZ-R006: 直接根与合/破结构事实都保留，不输出化气或根消失结论', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '丙',
      dayElement: '火',
      year: { stem: '癸', branch: '亥' }, // 寅亥 harmony+break partner; not a fire root
      month: { stem: '丙', branch: '寅' }, // 丙火 direct root (hidden 丙, index 1)
      day: { stem: '丙', branch: '辰' },
      hour: { stem: '乙', branch: '酉' },
    });

    const roots = collectDirectRootEvidence(chart);
    expect(roots.candidates).toHaveLength(1);
    expect(roots.candidates[0]!.pillar).toBe('month');

    const geo = collectRelationGeometry(chart);
    expect(
      geo.facts.some(
        (f) => f.kind === 'branch-six-harmony' && f.tableRef === 'branch-six-harmony/寅亥',
      ),
      'branch-six-harmony/寅亥',
    ).toBe(true);
    expect(
      geo.facts.some((f) => f.kind === 'branch-break' && f.tableRef === 'branch-break/寅亥'),
      'branch-break/寅亥',
    ).toBe(true);

    const serialized = JSON.stringify(geo);
    expect(serialized).not.toContain('transformation');
    expect(serialized).not.toContain('化气');
    expect(serialized).not.toContain('成化');
  });

  it('BZ-R007: 两个不同柱的根，只有被关系命中的柱被指向', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '甲',
      dayElement: '木',
      year: { stem: '乙', branch: '酉' }, // 卯酉 clash: year branch 酉
      month: { stem: '丙', branch: '卯' }, // root 1 (hidden 乙), targeted by the clash
      day: { stem: '甲', branch: '寅' }, // root 2 (hidden 甲), not targeted
      hour: { stem: '丁', branch: '丑' },
    });

    const roots = collectDirectRootEvidence(chart);
    expect(roots.candidates).toHaveLength(2);
    expect(roots.candidates.map((c) => `${c.pillar}:${c.branch}`)).toEqual(['month:卯', 'day:寅']);

    const geo = collectRelationGeometry(chart);
    const clash = geo.facts.find(
      (f) => f.kind === 'branch-clash' && f.tableRef === 'branch-clash/卯酉',
    );
    expect(clash, 'branch-clash/卯酉').toBeDefined();
    expect(clash!.participants.map((p) => p.pillar)).toEqual(['year', 'month']);
    // No geometry fact points at the untouched day-branch root.
    const dayPointed = geo.facts.some((f) =>
      f.participants.some((p) => p.pillar === 'day' && p.value === '寅'),
    );
    expect(dayPointed).toBe(false);
    // The untouched root remains fully present.
    expect(roots.candidates[1]!.pillar).toBe('day');
  });

  it('BZ-G001: 六合只输出参与者与表项，不输出吉凶/效果', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '乙',
      dayElement: '木',
      year: { stem: '壬', branch: '子' },
      month: { stem: '己', branch: '丑' }, // 子丑 six-harmony
      day: { stem: '乙', branch: '卯' },
      hour: { stem: '丙', branch: '未' },
    });

    const geo = collectRelationGeometry(chart);
    const fact = geo.facts.find(
      (f) => f.kind === 'branch-six-harmony' && f.tableRef === 'branch-six-harmony/子丑',
    );
    expect(fact, 'branch-six-harmony/子丑').toBeDefined();
    expect(fact!.participants).toEqual([
      { pillar: 'year', value: '子', factRef: 'bazi.pillars.year.branch' },
      { pillar: 'month', value: '丑', factRef: 'bazi.pillars.month.branch' },
    ]);
    expect(Object.keys(fact!).sort()).toEqual(['kind', 'participants', 'tableRef']);
  });

  it('BZ-G002: 冲的目标路径完整；两翼无中神不伪造 partial 三合', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '丁',
      dayElement: '火',
      year: { stem: '甲', branch: '午' },
      month: { stem: '丙', branch: '子' }, // 子午 clash
      day: { stem: '丁', branch: '丑' }, // 巳丑: two wings without center 酉
      hour: { stem: '乙', branch: '巳' },
    });

    const geo = collectRelationGeometry(chart);
    const clash = geo.facts.find(
      (f) => f.kind === 'branch-clash' && f.tableRef === 'branch-clash/子午',
    );
    expect(clash, 'branch-clash/子午').toBeDefined();
    expect(clash!.participants).toEqual([
      { pillar: 'year', value: '午', factRef: 'bazi.pillars.year.branch' },
      { pillar: 'month', value: '子', factRef: 'bazi.pillars.month.branch' },
    ]);
    // 巳+丑 present but center 酉 absent → no partial may be fabricated.
    expect(geo.facts.some((f) => f.kind === 'branch-three-harmony-partial')).toBe(false);
  });

  it('BZ-G003: 多条结构路径并存且重叠表项全部保留，无优先级吞并', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '乙',
      dayElement: '木',
      year: { stem: '己', branch: '巳' }, // 巳申 = harmony AND break; 寅巳申 three-punishment
      month: { stem: '甲', branch: '申' }, // 甲己 stem five-combination
      day: { stem: '乙', branch: '亥' }, // 寅亥 = harmony AND break
      hour: { stem: '丙', branch: '寅' },
    });

    const geo = collectRelationGeometry(chart);
    const refs = geo.facts.map((f) => f.tableRef);
    expect(refs).toContain('branch-six-harmony/巳申');
    expect(refs).toContain('branch-break/巳申');
    expect(refs).toContain('branch-six-harmony/寅亥');
    expect(refs).toContain('branch-break/寅亥');
    expect(refs).toContain('branch-punishment-three/寅巳申');
    expect(refs).toContain('stem-five-combination/甲己');
    // All overlapping hits kept: two facts per overlapping pair.
    expect(
      refs.filter((r) => r === 'branch-six-harmony/巳申' || r === 'branch-break/巳申'),
    ).toHaveLength(2);
    expect(
      refs.filter((r) => r === 'branch-six-harmony/寅亥' || r === 'branch-break/寅亥'),
    ).toHaveLength(2);
  });

  it('BZ-G004a: partial 三合与另一个破几何事实同时存在且彼此独立', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '戊',
      dayElement: '土',
      year: { stem: '甲', branch: '申' },
      month: { stem: '丙', branch: '子' }, // 申子 partial (center 子 + wing 申)
      day: { stem: '戊', branch: '寅' },
      hour: { stem: '庚', branch: '亥' }, // 寅亥 break
    });

    const geo = collectRelationGeometry(chart);
    expect(
      geo.facts.some(
        (f) =>
          f.kind === 'branch-three-harmony-partial' &&
          f.tableRef === 'branch-three-harmony-partial/申子',
      ),
      'branch-three-harmony-partial/申子',
    ).toBe(true);
    expect(
      geo.facts.some((f) => f.kind === 'branch-break' && f.tableRef === 'branch-break/寅亥'),
      'branch-break/寅亥',
    ).toBe(true);
    expect(geo.facts.some((f) => f.kind === 'branch-three-harmony-complete')).toBe(false);
    expect(JSON.stringify(geo)).not.toContain('transformation');
  });

  it('BZ-G004b: complete 三合与另一个破几何事实同时存在，partial 不重复输出', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '戊',
      dayElement: '土',
      year: { stem: '甲', branch: '申' },
      month: { stem: '丙', branch: '子' },
      day: { stem: '戊', branch: '辰' }, // 申子辰 complete
      hour: { stem: '庚', branch: '丑' }, // 辰丑 break
    });

    const geo = collectRelationGeometry(chart);
    expect(
      geo.facts.some(
        (f) =>
          f.kind === 'branch-three-harmony-complete' &&
          f.tableRef === 'branch-three-harmony-complete/申子辰',
      ),
      'branch-three-harmony-complete/申子辰',
    ).toBe(true);
    const complete = geo.facts.find((f) => f.kind === 'branch-three-harmony-complete')!;
    expect(complete.participants.map((p) => `${p.pillar}:${p.value}`)).toEqual([
      'year:申',
      'month:子',
      'day:辰',
    ]);
    expect(
      geo.facts.some((f) => f.kind === 'branch-break' && f.tableRef === 'branch-break/辰丑'),
      'branch-break/辰丑',
    ).toBe(true);
    // The complete bureau is not re-emitted as a partial.
    expect(geo.facts.some((f) => f.kind === 'branch-three-harmony-partial')).toBe(false);
    expect(JSON.stringify(geo)).not.toContain('transformation');
  });

  it('BZ-G004c: 任一几何事实都不输出 transformation 语义', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '乙',
      dayElement: '木',
      year: { stem: '己', branch: '巳' },
      month: { stem: '甲', branch: '申' },
      day: { stem: '乙', branch: '亥' },
      hour: { stem: '丙', branch: '寅' },
    });

    const serialized = JSON.stringify(collectRelationGeometry(chart));
    expect(serialized).not.toContain('transformation');
    expect(serialized).not.toContain('transformedElement');
    expect(serialized).not.toContain('化气');
    expect(serialized).not.toContain('成化');
    expect(serialized).not.toContain('合化');
  });

  it('BZ-C003: hour 为 null 时无任何 hour 参与者或 hour factRef', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '乙',
      dayElement: '木',
      year: { stem: '壬', branch: '子' },
      month: { stem: '己', branch: '丑' },
      day: { stem: '乙', branch: '卯' },
      hour: null,
    });

    const geo = collectRelationGeometry(chart);
    expect(geo.omittedPillars).toEqual(['hour']);
    expect(geo.inspectedPillars).toEqual(['year', 'month', 'day']);
    for (const fact of geo.facts) {
      for (const p of fact.participants) {
        expect(p.pillar).not.toBe('hour');
        expect(p.factRef).not.toContain('.hour.');
      }
    }
    // The 子丑 harmony between existing pillars is still recorded.
    expect(
      geo.facts.some(
        (f) => f.kind === 'branch-six-harmony' && f.tableRef === 'branch-six-harmony/子丑',
      ),
      'branch-six-harmony/子丑',
    ).toBe(true);
  });

  it('table completeness: 六合/六冲/六害/相破/子卯互刑 全部 25 个无序对表项', () => {
    const pairs: Array<{ kind: string; entry: string }> = [
      ...['子丑', '寅亥', '卯戌', '辰酉', '巳申', '午未'].map((e) => ({
        kind: 'branch-six-harmony',
        entry: e,
      })),
      ...['子午', '丑未', '寅申', '卯酉', '辰戌', '巳亥'].map((e) => ({
        kind: 'branch-clash',
        entry: e,
      })),
      ...['子未', '丑午', '寅巳', '卯辰', '申亥', '酉戌'].map((e) => ({
        kind: 'branch-harm',
        entry: e,
      })),
      ...['子酉', '午卯', '巳申', '寅亥', '辰丑', '戌未'].map((e) => ({
        kind: 'branch-break',
        entry: e,
      })),
      { kind: 'branch-punishment-mutual', entry: '子卯' },
    ];
    for (const { kind, entry } of pairs) {
      // synthetic technical fixture — not a real person's birth record
      const chart = makeChart({
        dayStem: '甲',
        dayElement: '木',
        year: { stem: '甲', branch: entry[0]! },
        month: { stem: '乙', branch: entry[1]! },
        day: { stem: '甲', branch: '辰' },
        hour: { stem: '丁', branch: '未' },
      });
      const geo = collectRelationGeometry(chart);
      expect(
        geo.facts.some((f) => f.kind === kind && f.tableRef === `${kind}/${entry}`),
        `${kind}/${entry}`,
      ).toBe(true);
    }
  });

  it('table completeness: 三刑两组与自刑四支', () => {
    for (const group of ['寅巳申', '丑戌未'] as const) {
      // synthetic technical fixture — not a real person's birth record
      const chart = makeChart({
        dayStem: '甲',
        dayElement: '木',
        year: { stem: '甲', branch: group[0]! },
        month: { stem: '乙', branch: group[1]! },
        day: { stem: '甲', branch: group[2]! },
        hour: { stem: '丁', branch: '未' },
      });
      const geo = collectRelationGeometry(chart);
      expect(
        geo.facts.some(
          (f) =>
            f.kind === 'branch-punishment-three' &&
            f.tableRef === `branch-punishment-three/${group}`,
        ),
        `branch-punishment-three/${group}`,
      ).toBe(true);
    }
    for (const branch of ['辰', '午', '酉', '亥'] as const) {
      // synthetic technical fixture — not a real person's birth record
      const chart = makeChart({
        dayStem: '甲',
        dayElement: '木',
        year: { stem: '甲', branch },
        month: { stem: '乙', branch },
        day: { stem: '甲', branch: '辰' },
        hour: { stem: '丁', branch: '未' },
      });
      const geo = collectRelationGeometry(chart);
      expect(
        geo.facts.some(
          (f) =>
            f.kind === 'branch-punishment-self' &&
            f.tableRef === `branch-punishment-self/${branch}`,
        ),
        `branch-punishment-self/${branch}`,
      ).toBe(true);
    }
  });

  it('table completeness: 三合 complete 4 组与 partial 8 项（中神+翼）', () => {
    const groups: Array<{ set: string; center: string }> = [
      { set: '申子辰', center: '子' },
      { set: '寅午戌', center: '午' },
      { set: '巳酉丑', center: '酉' },
      { set: '亥卯未', center: '卯' },
    ];
    // Third wing must be absent from the filler pillar for the partial cases.
    const fillerFor: Record<string, string> = {
      申子辰: '未',
      寅午戌: '辰',
      巳酉丑: '未',
      亥卯未: '辰',
    };
    for (const { set, center } of groups) {
      // complete — synthetic technical fixture — not a real person's birth record
      const completeChart = makeChart({
        dayStem: '甲',
        dayElement: '木',
        year: { stem: '甲', branch: set[0]! },
        month: { stem: '乙', branch: set[1]! },
        day: { stem: '甲', branch: set[2]! },
        hour: { stem: '丁', branch: '未' },
      });
      const completeGeo = collectRelationGeometry(completeChart);
      expect(
        completeGeo.facts.some(
          (f) =>
            f.kind === 'branch-three-harmony-complete' &&
            f.tableRef === `branch-three-harmony-complete/${set}`,
        ),
        `branch-three-harmony-complete/${set}`,
      ).toBe(true);

      // partial: center + each wing — synthetic technical fixture
      const wings = set.replace(center, '') as string;
      for (const wing of [wings[0]!, wings[1]!]) {
        const partialChart = makeChart({
          dayStem: '甲',
          dayElement: '木',
          year: { stem: '甲', branch: center },
          month: { stem: '乙', branch: wing },
          day: { stem: '甲', branch: fillerFor[set]! },
          hour: null,
        });
        const partialGeo = collectRelationGeometry(partialChart);
        const presentInSetOrder = set
          .split('')
          .filter((b) => b === center || b === wing)
          .join('');
        expect(
          partialGeo.facts.some(
            (f) =>
              f.kind === 'branch-three-harmony-partial' &&
              f.tableRef === `branch-three-harmony-partial/${presentInSetOrder}`,
          ),
          `branch-three-harmony-partial/${presentInSetOrder}`,
        ).toBe(true);
      }
    }
  });

  it('table completeness: 三会 4 组', () => {
    for (const hui of ['寅卯辰', '巳午未', '申酉戌', '亥子丑'] as const) {
      // synthetic technical fixture — not a real person's birth record
      const chart = makeChart({
        dayStem: '甲',
        dayElement: '木',
        year: { stem: '甲', branch: hui[0]! },
        month: { stem: '乙', branch: hui[1]! },
        day: { stem: '甲', branch: hui[2]! },
        hour: null,
      });
      const geo = collectRelationGeometry(chart);
      expect(
        geo.facts.some(
          (f) => f.kind === 'branch-three-meeting' && f.tableRef === `branch-three-meeting/${hui}`,
        ),
        `branch-three-meeting/${hui}`,
      ).toBe(true);
    }
  });

  it('table completeness: 天干五合 5 对（含日主参与，无贴身/遥见/化气判断）', () => {
    for (const he of ['甲己', '乙庚', '丙辛', '丁壬', '戊癸'] as const) {
      // synthetic technical fixture — not a real person's birth record
      const chart = makeChart({
        dayStem: '庚',
        dayElement: '金',
        year: { stem: he[0]!, branch: '子' },
        month: { stem: he[1]!, branch: '丑' },
        day: { stem: '庚', branch: '午' },
        hour: null,
      });
      const geo = collectRelationGeometry(chart);
      expect(
        geo.facts.some(
          (f) => f.kind === 'stem-five-combination' && f.tableRef === `stem-five-combination/${he}`,
        ),
        `stem-five-combination/${he}`,
      ).toBe(true);
    }
  });

  it('确定性：相同输入多次调用 JSON 逐字节一致', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '乙',
      dayElement: '木',
      year: { stem: '己', branch: '巳' },
      month: { stem: '甲', branch: '申' },
      day: { stem: '乙', branch: '亥' },
      hour: { stem: '丙', branch: '寅' },
    });
    const first = JSON.stringify(collectRelationGeometry(chart));
    const second = JSON.stringify(collectRelationGeometry(chart));
    const third = JSON.stringify(collectRelationGeometry(chart));
    expect(first).toBe(second);
    expect(first).toBe(third);
  });

  it('字段禁令：序列化结果不含效果/吉凶/化气类语义', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '乙',
      dayElement: '木',
      year: { stem: '己', branch: '巳' },
      month: { stem: '甲', branch: '申' },
      day: { stem: '乙', branch: '亥' },
      hour: { stem: '丙', branch: '寅' },
    });
    const serialized = JSON.stringify(collectRelationGeometry(chart));
    for (const banned of [
      'polarity',
      'auspicious',
      'favorable',
      'adverse',
      'effect',
      'effective',
      'weakened',
      'neutralized',
      'strength',
      'score',
      'weight',
      'transformation',
      'transformedElement',
      'usefulGod',
      'pattern',
      '吉凶',
      '成化',
      '合化',
      '冲掉',
      '削弱',
      '增强',
    ]) {
      expect(serialized).not.toContain(banned);
    }
  });

  it('输出字段集合严格限定为白名单形状（字段不扩张）', () => {
    // synthetic technical fixture — not a real person's birth record
    const chart = makeChart({
      dayStem: '乙',
      dayElement: '木',
      year: { stem: '己', branch: '巳' },
      month: { stem: '甲', branch: '申' },
      day: { stem: '乙', branch: '亥' },
      hour: { stem: '丙', branch: '寅' },
    });
    const ev = collectRelationGeometry(chart);
    expect(Object.keys(ev).sort()).toEqual(
      ['chartSource', 'facts', 'inspectedPillars', 'omittedPillars'].sort(),
    );
    expect(Object.keys(ev.chartSource).sort()).toEqual(
      ['providerId', 'providerVersion', 'rulesetId'].sort(),
    );
    for (const fact of ev.facts) {
      expect(Object.keys(fact).sort()).toEqual(['kind', 'participants', 'tableRef']);
      for (const p of fact.participants) {
        expect(Object.keys(p).sort()).toEqual(['factRef', 'pillar', 'value']);
      }
    }
  });
});
