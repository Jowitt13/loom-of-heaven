import { describe, expect, it } from 'vitest';
import type { BaziChartResult, BaziRuleFinding } from '@ming/contracts';
import { parseBirthInput } from '@ming/contracts';
import { calculate } from '@ming/orchestrator';
import {
  interpretBazi,
  BAZI_RULES_RULESET_ID,
  missingElements,
  tenGodOf,
  marriageTimingFinding,
  industryFinding,
  crossBranchRelation,
  stemHeElement,
  annualResonance,
  stemCombinationFindings,
} from '../src/index.ts';

// --- Synthetic chart builder (only the fields the rules actually read). ----------
function fakeChart(cfg: {
  dayElement: string;
  monthQiElement: string;
  monthQiGod: string;
  dayBranchElement?: string;
  hourBranchElement?: string;
  stemGods?: { year?: string; month?: string; hour?: string };
}): BaziChartResult {
  const pillar = (branchEl: string, qiGod: string, stemGod: string | null) => ({
    stem: 'X',
    branch: 'X',
    stemElement: 'X',
    branchElement: branchEl,
    stemYinYang: '阳',
    naYin: 'X',
    tenGod: stemGod,
    hiddenStems: [{ stem: 'X', element: branchEl, tenGod: qiGod, primary: true }],
  });
  return {
    rulesetId: 'bazi-standard@0.1.0',
    provider: { id: 'tyme4ts', version: '1.5.2', license: 'MIT' },
    solarTimeApplied: 'civil',
    dayBoundaryApplied: 'zi-hour/late (tyme4ts default)',
    dayMaster: { stem: 'X', element: cfg.dayElement, yinYang: '阳' },
    pillars: {
      year: pillar('火', cfg.stemGods?.year ?? '七杀', cfg.stemGods?.year ?? null),
      month: pillar(cfg.monthQiElement, cfg.monthQiGod, cfg.stemGods?.month ?? null),
      day: pillar(cfg.dayBranchElement ?? '火', 'X', null),
      hour: pillar(
        cfg.hourBranchElement ?? '火',
        cfg.stemGods?.hour ?? 'X',
        cfg.stemGods?.hour ?? null,
      ),
    },
    luckCycle: null,
  } as unknown as BaziChartResult;
}

function find(findings: BaziRuleFinding[], topic: string): BaziRuleFinding {
  const f = findings.find((x) => x.topic === topic);
  if (!f) throw new Error(`no ${topic} finding`);
  return f;
}

describe('BaZi interpretation rules (sourced)', () => {
  it('every finding carries a ruleset id, provider and a non-empty classic source', () => {
    const interp = interpretBazi(
      fakeChart({ dayElement: '木', monthQiElement: '木', monthQiGod: '劫财' }),
    );
    expect(interp.rulesetId).toBe(BAZI_RULES_RULESET_ID);
    expect(interp.provider.id).toBe('bazi-rules');
    expect(interp.provider.license).toBe('MIT');
    expect(interp.findings.length).toBeGreaterThanOrEqual(4);
    for (const f of interp.findings) {
      expect(f.ruleId.length).toBeGreaterThan(0);
      expect(f.source.text.length).toBeGreaterThan(0);
      expect(f.source.chapter.length).toBeGreaterThan(0);
    }
  });

  it('比劫本气但月支非禄/刃/墓库 → 不以月令定格，格局另取 (not guessed)', () => {
    const interp = interpretBazi(
      fakeChart({ dayElement: '木', monthQiElement: '木', monthQiGod: '劫财' }),
    );
    expect(find(interp.findings, 'strength').claim).toContain('偏强');
    const pattern = find(interp.findings, 'pattern');
    expect(pattern.matched).toBe(false);
    expect(pattern.claim).toContain('另取');
  });

  it('格局 from 月令本气 ten-god: 甲木生酉月 (正官) → 正官格, matched', () => {
    const interp = interpretBazi(
      fakeChart({ dayElement: '木', monthQiElement: '金', monthQiGod: '正官' }),
    );
    const pattern = find(interp.findings, 'pattern');
    expect(pattern.matched).toBe(true);
    expect(pattern.claim).toContain('正官格');
    expect(pattern.source.text).toBe('子平真诠');
  });

  it('身弱 (失令无根无扶): strength = weak → useful god favors 印/比劫 (扶)', () => {
    // 甲木生申月 (金克木, 七杀当令), no roots, no supporting stems.
    const interp = interpretBazi(
      fakeChart({
        dayElement: '木',
        monthQiElement: '金',
        monthQiGod: '七杀',
        dayBranchElement: '火',
        hourBranchElement: '土',
        stemGods: { year: '七杀', month: '正财', hour: '偏财' },
      }),
    );
    expect(find(interp.findings, 'strength').claim).toContain('偏弱');
    const useful = find(interp.findings, 'useful-god');
    expect(useful.matched).toBe(true);
    expect(useful.claim).toContain('宜生宜帮');
    expect(useful.claim).toContain('比劫');
  });

  it('身强: useful god favors 食伤/财/官杀 (抑)', () => {
    const interp = interpretBazi(
      fakeChart({ dayElement: '木', monthQiElement: '木', monthQiGod: '劫财' }),
    );
    const useful = find(interp.findings, 'useful-god');
    expect(useful.matched).toBe(true);
    expect(useful.claim).toContain('宜泄宜耗宜克');
    expect(useful.claim).toContain('官杀');
  });

  it('ten-gods finding lists the ten-gods present among the stems', () => {
    const interp = interpretBazi(
      fakeChart({
        dayElement: '木',
        monthQiElement: '木',
        monthQiGod: '劫财',
        stemGods: { year: '七杀', month: '正财', hour: '偏财' },
      }),
    );
    const tg = find(interp.findings, 'ten-gods');
    expect(tg.claim).toContain('七杀');
    expect(tg.claim).toContain('正财');
    expect(tg.claim).toContain('偏财');
    expect(tg.source.text).toBe('渊海子平');
  });

  it('is deterministic (byte-identical interpretation across runs)', () => {
    const chart = fakeChart({ dayElement: '木', monthQiElement: '木', monthQiGod: '劫财' });
    expect(JSON.stringify(interpretBazi(chart))).toBe(JSON.stringify(interpretBazi(chart)));
  });
});

describe('BaZi interpretation on a real computed chart (1990-03-10 甲木卯月)', () => {
  const bundle = calculate(
    parseBirthInput({
      calendar: 'gregorian',
      localDate: '1990-03-10',
      localTime: '08:15:00',
      timeAccuracy: 'exact',
      timezone: 'Asia/Shanghai',
      location: { latitude: 30.5, longitude: 114.3, source: 'user' },
      ruleGender: 'male',
      settings: { systems: ['bazi'] },
    }),
  );
  const interp = interpretBazi(bundle.bazi!);

  it('produces the four sourced findings for a real chart', () => {
    expect(interp.findings.length).toBeGreaterThanOrEqual(4);
    const topics = interp.findings.map((f) => f.topic);
    expect(topics).toContain('strength');
    expect(topics).toContain('pattern');
    expect(topics).toContain('useful-god');
    expect(topics).toContain('ten-gods');
  });

  it('甲木生卯月 → 日主偏强 (羊刃当令)', () => {
    expect(bundle.bazi!.dayMaster.element).toBe('木');
    expect(find(interp.findings, 'strength').claim).toContain('偏强');
  });

  it('甲木生卯月 → 阳刃格 (卯为甲之帝旺/刃位), matched', () => {
    const pattern = find(interp.findings, 'pattern');
    expect(pattern.matched).toBe(true);
    expect(pattern.claim).toContain('阳刃格');
  });
});

describe('BaZi rules on a synthetic male chart (1990-06-15, fictional — not a real person)', () => {
  const bundle = calculate(
    parseBirthInput({
      calendar: 'gregorian',
      localDate: '1990-06-15',
      localTime: '14:20:00',
      timeAccuracy: 'exact',
      timezone: 'Asia/Shanghai',
      location: { latitude: 30.0, longitude: 120.0, source: 'user' },
      ruleGender: 'male',
      settings: { systems: ['bazi'] },
    }),
  );
  const interp = interpretBazi(bundle.bazi!, { focusYear: 2026 });

  it('月令午本气丁为七杀 → 七杀格 (matched, sourced)', () => {
    const pattern = find(interp.findings, 'pattern');
    expect(pattern.matched).toBe(true);
    expect(pattern.claim).toContain('七杀格');
    expect(pattern.source.text.length).toBeGreaterThan(0);
  });

  it('喜用神：身弱宜生宜帮，missingElements 返回数组、useful-god 有原因', () => {
    expect(Array.isArray(missingElements(bundle.bazi!))).toBe(true);
    const useful = find(interp.findings, 'useful-god');
    expect(useful.matched).toBe(true);
    expect(useful.claim).toContain('宜生宜帮');
    expect((useful.reason ?? '').length).toBeGreaterThan(0);
  });

  it('日主辛无贴身丙 → 不臆造日主五合 (no false 合化)', () => {
    // Synthetic 辛 day master has no adjacent 丙 → engine must NOT fabricate a day-master 五合.
    expect(interp.findings.filter((f) => f.ruleId === 'relations/tian-gan-he-day').length).toBe(0);
  });

  it('流年应期：2032 壬子 冲月支/年支午 (turning point surfaced)', () => {
    const clash = interp.findings.find(
      (f) => f.topic === 'fortune' && f.claim.includes('2032') && f.claim.includes('冲'),
    );
    expect(clash).toBeDefined();
  });

  it('逐年流年时间线：2029己酉 己偏印+酉比肩；2030庚戌 庚劫财+戌正印', () => {
    const y2029 = interp.findings.find((f) => f.ruleId === 'fortune/liunian/2029');
    expect(y2029).toBeDefined();
    expect(y2029!.claim).toContain('己偏印');
    expect(y2029!.claim).toContain('酉比肩');
    // 逐年主题标注 (婚/财/事业/学业/健康 …).
    expect(y2029!.claim).toContain('主题：');
    const y2030 = interp.findings.find((f) => f.ruleId === 'fortune/liunian/2030');
    expect(y2030).toBeDefined();
    expect(y2030!.claim).toContain('庚劫财');
    expect(y2030!.claim).toContain('戌正印');
  });

  it('tenGodOf gives specific 十神 for 戊土日主', () => {
    expect(tenGodOf('戊', '庚')).toBe('食神');
    expect(tenGodOf('戊', '辛')).toBe('伤官');
    expect(tenGodOf('戊', '癸')).toBe('正财');
    expect(tenGodOf('戊', '甲')).toBe('七杀');
    expect(tenGodOf('戊', '己')).toBe('劫财');
  });

  it('婚姻/正缘应期：男取财星，给出应期窗口(非必婚)', () => {
    const mt = marriageTimingFinding(bundle.bazi!, 'male', 2026);
    expect(mt).not.toBeNull();
    expect(mt!.claim).toContain('婚姻/正缘应期');
    expect(mt!.reason ?? '').toContain('非');
    // 无性别则不确定配偶星，诚实返回 null.
    expect(marriageTimingFinding(bundle.bazi!, 'unspecified', 2026)).toBeNull();
  });

  it('婚姻应期标注：自刑/伏吟、相害、推进 vs 变动 分级', () => {
    const mt = marriageTimingFinding(bundle.bazi!, 'male', 2026);
    expect(mt).not.toBeNull();
    const c = mt!.claim;
    // 2031辛亥：亥亥自刑/伏吟(时支) + 合夫妻宫 → 推进但易反复.
    expect(c).toContain('自刑');
    // 相害之年出现（如2032子未 或 2035卯辰）.
    expect(c).toContain('害');
    // 分级用语出现.
    expect(c).toContain('推进机会');
    expect(c).toMatch(/变动|反复|调整/);
    // reason 明确桃花≠婚期、逢冲自刑害为变动.
    expect(mt!.reason ?? '').toContain('不等于婚期');
    expect(mt!.reason ?? '').toMatch(/变动|反复/);
  });

  it('适合行业：按喜用五行给行业大类', () => {
    const ind = industryFinding(bundle.bazi!);
    expect(ind.claim).toContain('适合行业方向');
    expect(ind.reason ?? '').toContain('参考');
  });

  it('crossBranchRelation：在六合/冲/害/破之外增出三合(半合)与相刑', () => {
    // 六合/冲 base cases still classify.
    expect(crossBranchRelation('子', '丑')?.kind).toBe('合');
    expect(crossBranchRelation('子', '午')?.kind).toBe('冲');
    // 半三合 (申子辰 水局): 申×子 → 半合, 吉.
    const half = crossBranchRelation('申', '子');
    expect(half?.kind).toBe('半合');
    expect(half?.polarity).toBe('吉');
    // 相刑：丑戌未 之刑 (丑×戌 不在六合/冲/害/破表，纯刑) 与 子卯之刑 → 刑, 凶.
    expect(crossBranchRelation('丑', '戌')?.kind).toBe('刑');
    expect(crossBranchRelation('子', '卯')?.kind).toBe('刑');
    expect(crossBranchRelation('子', '卯')?.polarity).toBe('凶');
  });

  it('stemHeElement：天干五合合化五行 (日干五合 用)', () => {
    expect(stemHeElement('甲', '己')).toBe('土');
    expect(stemHeElement('己', '甲')).toBe('土'); // 无序
    expect(stemHeElement('戊', '癸')).toBe('火');
    expect(stemHeElement('丁', '壬')).toBe('木');
    expect(stemHeElement('甲', '乙')).toBeUndefined(); // 非五合
  });

  it('annualResonance：给出每年喜忌 leaning 与是否冲夫妻宫', () => {
    // 合成盘日支亥 → 巳年(2037丁巳)冲夫妻宫(亥).
    const r2037 = annualResonance(bundle.bazi!, 2037);
    expect(r2037.chongSpousePalace).toBe(true);
    expect(['吉', '凶', '中性']).toContain(r2037.polarity);
    // 非冲之年 chongSpousePalace 为 false.
    expect(annualResonance(bundle.bazi!, 2027).chongSpousePalace).toBe(false);
  });
});

describe('天干五合：化神当令方标化气之机，否则合而不化', () => {
  // 真干的最小命盘：日主甲、时干己（甲己合土），月支本气五行可调.
  function heChart(dayStem: string, hourStem: string, monthQiElement: string): BaziChartResult {
    const pillar = (stem: string, branch: string, branchElement: string) => ({
      stem,
      branch,
      stemElement: 'X',
      branchElement,
      stemYinYang: '阳',
      naYin: 'X',
      tenGod: null,
      hiddenStems: [{ stem: 'X', element: branchElement, tenGod: 'X', primary: true }],
    });
    return {
      rulesetId: 'bazi-standard@0.1.0',
      provider: { id: 'tyme4ts', version: '1.5.2', license: 'MIT' },
      solarTimeApplied: 'civil',
      dayBoundaryApplied: 'x',
      dayMaster: { stem: dayStem, element: '木', yinYang: '阳' },
      pillars: {
        year: pillar('丙', '午', '火'),
        month: pillar('戊', '辰', monthQiElement),
        day: pillar(dayStem, '寅', '木'),
        hour: pillar(hourStem, '亥', '水'),
      },
      luckCycle: null,
    } as unknown as BaziChartResult;
  }

  it('甲己合、化神土当令(本气土) → 有化气之机', () => {
    const f = stemCombinationFindings(heChart('甲', '己', '土')).find(
      (x) => x.ruleId === 'relations/tian-gan-he-day',
    );
    expect(f).toBeDefined();
    expect(f!.claim).toContain('化气之机');
    expect(f!.claim).not.toContain('合而不化');
  });

  it('甲己合、化神土不当令(本气水) → 合而不化', () => {
    const f = stemCombinationFindings(heChart('甲', '己', '水')).find(
      (x) => x.ruleId === 'relations/tian-gan-he-day',
    );
    expect(f).toBeDefined();
    expect(f!.claim).toContain('合而不化');
    expect(f!.claim).not.toContain('化气之机');
  });
});
