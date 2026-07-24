import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintReading } from '../src/index.ts';

/**
 * Regression for the Channel B term firewall (ADR 0011). The real failing fragments
 * (食伤生财 / 官禄宫天府 / 官杀藏而不透 / 甲戌大运 / 喜用五行 / the jargon phrase) must FAIL
 * when they appear in sections 1-5, PASS when confined to 专业依据, and the plain
 * rewrite must PASS. Soft jargon warns in 2-5 but errors in the strict (30秒/前200字) zone.
 */

/** Build a minimal 7-step topic report; `s1`/`body` are user-visible, `pro` is 专业依据. */
function report(p: { s1?: string; body?: string; pro?: string; simpleTail?: string }): string {
  return [
    `## 1. 30秒看懂\n${p.s1 ?? '你更适合稳步发展、把本事练扎实。'}`,
    `## 2. 现实中会怎么表现\n${p.body ?? '你做事踏实、愿意为一件事负责到底。'}`,
    `## 3. 最可能出现的具体场景\n例如你在公司里被交给重要的活，做成之后慢慢被看见。`,
    `## 4. 时间线\n2028 年前后可能换工作，有利也有风险，提前想清楚再决定。`,
    `## 5. 可以怎么做\n把做过的事整理出来，让别人看得见你的本事。`,
    `## 6. 专业依据\n${p.pro ?? '（技术依据）'}`,
    `## 7. 信息可靠性与声明\n以上依赖出生时间准确；传统命理仅供参考、非科学预测。`,
  ].join('\n\n');
}

const CLEAN_PAD = '稳稳做好手上的每件事，遇到问题多想几种办法，'.repeat(12); // ~260 clean chars

describe('reading-lint: Channel B term firewall', () => {
  it('命理术语在 30秒看懂 → error, ok=false', () => {
    const r = lintReading(report({ s1: '你食伤生财、正财贴身，官禄宫天府主稳健积累。' }));
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.category === '命理' && v.severity === 'error')).toBe(true);
  });

  it('真实失败片段在正文 → 全部 error', () => {
    const r = lintReading(
      report({
        s1: '你官杀藏而不透；20—29岁甲戌大运偏中性；喜用五行（火/土/金）方向更顺。',
        body: '食神透干、正财贴身，说明你食伤生财。',
      }),
    );
    expect(r.ok).toBe(false);
    const terms = new Set(r.violations.map((v) => v.term));
    for (const t of ['官杀', '大运', '喜用五行', '食神', '正财', '贴身']) {
      expect(terms.has(t), t).toBe(true);
    }
    // 干支组合 甲戌 命理拦截
    expect(r.violations.some((v) => v.term === '甲戌' && v.category === '命理')).toBe(true);
  });

  it('同样术语只在专业依据 → ok=true', () => {
    const r = lintReading(
      report({
        s1: '你更适合先把一门手艺练深，再谈自己接活。',
        pro: '食神透干、正财贴身（食伤生财结构），官禄宫天府主稳健积累；20—29岁甲戌大运偏中性；喜用五行火/土/金。ref: bazi.pillars.*.tenGod',
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.violations.length).toBe(0);
  });

  it('通俗改写版 → ok=true', () => {
    const r = lintReading(
      report({
        s1: '你更适合靠专业和作品说话，先把一门本事练扎实。',
        body: '你的技能和作品更容易形成收入，也在意实际回报。',
      }),
    );
    expect(r.ok).toBe(true);
  });

  it('裸年份数字保留（不拦），干支才拦', () => {
    const r = lintReading(report({ body: '2028 年前后可能有变动。' }));
    expect(r.violations.some((v) => v.term === '2028')).toBe(false);
  });

  it('强黑话短语「逐步争取...决定权」→ error', () => {
    const r = lintReading(
      report({ body: `${CLEAN_PAD}你可以逐步争取客户、项目和报价上的决定权。` }),
    );
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.term === '决定权' && v.severity === 'error')).toBe(true);
  });

  it('软黑话在第2-5部分(过200字) → warn，不致失败', () => {
    const r = lintReading(report({ body: `${CLEAN_PAD}你的职业路径会慢慢展开。` }));
    const v = r.violations.find((x) => x.term === '职业路径');
    expect(v?.category).toBe('黑话软');
    expect(v?.severity).toBe('warn');
    expect(r.ok).toBe(true);
  });

  it('软黑话在 30秒看懂 / --simple → error', () => {
    expect(lintReading(report({ s1: '你的职业路径会稳步展开。' })).ok).toBe(false);
    const r = lintReading(report({ body: `${CLEAN_PAD}你的职业路径会慢慢展开。` }), {
      simple: true,
    });
    expect(r.ok).toBe(false);
  });

  it('感情 term-dense 在正文 → error', () => {
    const r = lintReading(
      report({ s1: '你夫妻宫太阴、身宫落夫妻宫，桃花在午，日支受冲，七宫主在双子。' }),
    );
    expect(r.ok).toBe(false);
    for (const t of ['夫妻宫', '身宫', '桃花', '日支', '七宫主']) {
      expect(
        r.violations.some((v) => v.term === t),
        t,
      ).toBe(true);
    }
  });

  it('财运 term-dense 在正文 → error', () => {
    const r = lintReading(
      report({ s1: '你成财格，食伤生财，命见劫财，财星被冲，喜用五行需火土金。' }),
    );
    expect(r.ok).toBe(false);
    for (const t of ['财格', '食伤', '劫财', '财星', '喜用五行']) {
      expect(
        r.violations.some((v) => v.term === t),
        t,
      ).toBe(true);
    }
  });

  it('追问菜单里的“流年/大运”作为主题名不拦，正文里的流年仍拦', () => {
    const md = `${report({ s1: '你更适合稳步发展。' })}\n\n还想看：事业 / 感情 / 财运 / 学业 / 流年？`;
    expect(lintReading(md).ok).toBe(true);
    expect(lintReading(report({ body: `${CLEAN_PAD}你的流年走势起伏较大。` })).ok).toBe(false);
  });

  it('channel=full（完整技术报告）→ 全放行', () => {
    const r = lintReading(report({ s1: '食伤生财、官杀藏而不透、甲戌大运。' }), {
      channel: 'full',
    });
    expect(r.ok).toBe(true);
    expect(r.violations.length).toBe(0);
  });
});

describe('reading-lint: 空话/vagueness (ADR 0012)', () => {
  it('1. 没有命理术语、全是空话的报告必须失败', () => {
    const r = lintReading(report({ s1: '逐步提升竞争力，建立长期优势，实现事业突破。' }));
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.category === '空话')).toBe(true);
  });

  it('2. 抽象句后面有具体生活解释时必须通过', () => {
    const r = lintReading(
      report({
        body: '你可以逐步争取更多自主权，比如先在公司参与真实项目、把工作流程学会，经验多了再直接跟客户定方案。',
      }),
    );
    expect(r.ok).toBe(true);
  });

  it('3. “30秒看懂”出现软黑话必须失败', () => {
    expect(lintReading(report({ s1: '你的职业路径会稳步展开。' })).ok).toBe(false);
  });

  it('4. 第2-5部分单个软黑话给 warning，多个堆叠给 error', () => {
    const single = lintReading(report({ body: `${CLEAN_PAD}这属于职业路径的一部分。` }));
    expect(single.violations.find((v) => v.term === '职业路径')?.severity).toBe('warn');
    expect(single.ok).toBe(true);
    const stacked = lintReading(report({ body: `${CLEAN_PAD}这关系到职业路径和商业化。` }));
    expect(stacked.ok).toBe(false);
  });

  it('5. 第6部分允许术语；删除第6部分后前文仍能看懂', () => {
    const withPro = lintReading(
      report({ s1: '你更适合先把一门手艺练扎实。', pro: '食伤生财、官杀藏而不透，ref: x' }),
    );
    expect(withPro.ok).toBe(true);
    const noPro = lintReading(report({ s1: '你更适合先把一门手艺练扎实。', pro: '' }));
    expect(noPro.ok).toBe(true);
  });

  it('6. 用同义词改写空话，检测器仍能识别', () => {
    const r = lintReading(report({ s1: '要稳中求进、找准方向、持续深耕。' }));
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.category === '空话')).toBe(true);
  });

  it('7. 不误伤年份/金额/职业名/行为建议/真实场景', () => {
    const r = lintReading(
      report({
        s1: '你适合做工程师或销售，2027 年前后可能换工作。',
        body: '建议每月固定存 2000 块，先还清 3 万的欠款，再和家人商量买房的事。',
      }),
    );
    expect(r.violations.filter((v) => v.severity === 'error').length).toBe(0);
    expect(r.ok).toBe(true);
  });

  it('8. 三份真实报告（docs/round9-acceptance）最终 lint 为 0 error', () => {
    const root = join(process.cwd(), 'docs', 'round9-acceptance');
    for (const f of ['career.md', 'love.md', 'wealth.md']) {
      const md = readFileSync(join(root, f), 'utf8');
      const r = lintReading(md, { channel: 'topic' });
      expect(
        r.violations.filter((v) => v.severity === 'error'),
        f,
      ).toEqual([]);
      expect(r.ok, f).toBe(true);
    }
  });

  it('9. --simple 比普通 Channel B 更严格', () => {
    const md = report({ body: `${CLEAN_PAD}这属于职业路径的一部分。` });
    expect(lintReading(md).ok).toBe(true);
    expect(lintReading(md, { simple: true }).ok).toBe(false);
  });

  it('10. 检测器自身：能区分失败与通过，非恒真', () => {
    const bad = report({ s1: '提升竞争力，实现突破，把握机会。' });
    const good = report({ s1: '你适合先把手艺练扎实，比如在公司里把一个项目从头做到尾。' });
    expect(lintReading(bad).ok).toBe(false);
    expect(lintReading(good).ok).toBe(true);
  });

  it('11. 数字+抽象词、无具体动作必须失败（数字不能救）', () => {
    expect(lintReading(report({ s1: '未来3年稳中求进。' })).ok).toBe(false);
  });

  it('12. 生活名词+抽象词、无具体动作必须失败（名词不能救）', () => {
    expect(lintReading(report({ s1: '在工作中提高竞争力。' })).ok).toBe(false);
  });

  it('13. 同句有具体动作（分开记录）必须通过', () => {
    expect(lintReading(report({ body: '把收入、支出、储蓄和合作资金分开记录。' })).ok).toBe(true);
  });

  it('14. 抽象句不被下一句不相关的具体内容拯救', () => {
    const md = report({ s1: '你要稳中求进。', body: '每月固定存 2000 块。' });
    expect(md.includes('稳中求进')).toBe(true);
    expect(lintReading(md).violations.some((v) => v.category === '空话')).toBe(true);
    expect(lintReading(md).ok).toBe(false);
  });

  it('15. 重复：同一判断在多个部分换词重复给 warning', () => {
    const repeated = '你适合先把一门手艺练扎实再谈别的。';
    const md = `## 1. 30秒看懂\n\n${repeated}\n\n## 2. 现实中会怎么表现\n\n${repeated}`;
    const r = lintReading(md);
    expect(r.violations.some((v) => v.category === '重复' && v.severity === 'warn')).toBe(true);
  });

  it('16. 重复：高度相似的句子给 warning', () => {
    const md = `## 1. 30秒看懂\n\n你适合先在公司里把手上的项目做出成绩，再慢慢争取更大的职责。\n\n## 2. 现实中会怎么表现\n\n你适合先在公司里把手上的项目做出成果，再慢慢争取更重的职责。`;
    const r = lintReading(md);
    expect(r.violations.some((v) => v.category === '重复')).toBe(true);
  });

  it('17. 不重复的正常报告不误报重复', () => {
    const r = lintReading(
      report({
        s1: '你适合靠稳定的工作和实际回报把钱攒起来。',
        body: '你赚钱偏向踏实拿回报，愿意为收入负责。',
      }),
    );
    expect(r.violations.some((v) => v.category === '重复')).toBe(false);
  });

  it('18. 无收入 facts 时，“加薪/升职”不得由职位/责任机会推出', () => {
    const r = lintReading(
      report({ s1: '2034年你更容易升职、加薪。', body: '你做事踏实，愿意为一件事负责到底。' }),
    );
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.category === '越界')).toBe(true);
  });

  it('19. 报告含收入 facts 时，提及加薪不拦', () => {
    const r = lintReading(report({ s1: '2034年你可能升职。', body: '你的收入机会不错。' }));
    expect(r.violations.some((v) => v.category === '越界' && v.term === '加薪/升职越界')).toBe(
      false,
    );
  });

  it('20. “比同龄人更强/更能做”必须失败', () => {
    expect(lintReading(report({ s1: '你比同龄人更能吃苦，也做得更好。' })).ok).toBe(false);
  });

  it('21. “愿意承担任务”不扩写成“肯定做得出来”', () => {
    const ok = lintReading(report({ s1: '你愿意承担难做的任务，但能否做好还要看经验和时间。' }));
    expect(ok.violations.some((v) => v.category === '越界')).toBe(false);
    const bad = lintReading(report({ s1: '这种任务你肯定做得出来。' }));
    expect(bad.ok).toBe(false);
  });

  it('22. 未知现实经历写成既成事实必须失败', () => {
    expect(lintReading(report({ body: '你现在有一份稳定的工作。' })).ok).toBe(false);
  });

  it('23. 用“如果/可能/例如”的假设场景应允许', () => {
    expect(lintReading(report({ body: '如果你以后有稳定工作，可能会遇到意外开销。' })).ok).toBe(
      true,
    );
  });

  it('24. “你和别人正在合伙”失败，“如果以后与人合伙”允许', () => {
    expect(lintReading(report({ body: '你和别人正在合伙做一件事。' })).ok).toBe(false);
    expect(lintReading(report({ body: '如果以后与人合伙接项目，要提前谈清分成。' })).ok).toBe(true);
  });

  it('25. 事业正文参考方向≤3类、每类岗位例子≤3个', () => {
    const md = readFileSync(join(process.cwd(), 'docs/round9-acceptance/career.md'), 'utf8');
    const cats = md.match(/^\d+\.\s/gm) ?? [];
    expect(cats.length).toBeLessThanOrEqual(3);
    expect(cats.length).toBeGreaterThanOrEqual(1);
    for (const line of md.split(/\r?\n/)) {
      if (/^\d+\.\s/.test(line)) {
        const examples = line.split('例如')[1] ?? '';
        const count = examples.split(/[、，,]/).filter((x) => x.trim().length > 0).length;
        expect(count, line).toBeLessThanOrEqual(3);
      }
    }
  });

  it('26. 旧问题短语已从三份报告消失', () => {
    const oldPhrases = [
      '升职、加薪',
      '比同龄人',
      '做得出来',
      '你有一份收入还算稳定',
      '你和别人合伙或组队做一件事时',
      '到时候接得住',
      '一点点磨合成彼此都舒服',
      '对齐真实想法',
      '能卖钱的技能',
      '讲给能拍板的人听',
      '更容易升上去',
    ];
    for (const f of ['career.md', 'love.md', 'wealth.md']) {
      const md = readFileSync(join(process.cwd(), 'docs/round9-acceptance', f), 'utf8');
      for (const p of oldPhrases) {
        expect(md.includes(p), `${f} 仍含 "${p}"`).toBe(false);
      }
    }
  });
});
