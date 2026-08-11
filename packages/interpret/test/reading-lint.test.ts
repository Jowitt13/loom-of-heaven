import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintReading } from '../src/index.ts';

/**
 * V1 regression: the final delivery is natural prose. Professional vocabulary is
 * allowed when it carries an explanation; internal-control labels, raw source ids,
 * fixed footers and automatic follow-up menus are not user-facing content.
 */
describe('reading-lint: V1 delivery surface', () => {
  it('allows a professional term when it is connected to a concrete implication', () => {
    const r = lintReading(
      '月令决定日主在季节中的基础力量。这里日主失令，又有几股克泄关系同时集中，面对标准反复变化的工作环境时，更容易把外界期待一并扛在自己身上。',
    );
    expect(r.ok).toBe(true);
  });

  it('allows a natural uncertainty sentence instead of a warning block', () => {
    const r = lintReading(
      '出生时间若前后相差较大，上升与宫位相关的判断可能会变化；下面更侧重对这一误差不敏感的结构。',
    );
    expect(r.ok).toBe(true);
  });

  it.each([
    '## 专业依据\n官杀见于月柱。',
    '**敏感项校对**\n出生时间需要复核。',
    '**引擎警告**\nTIME_UNKNOWN',
    '**声明**\n传统命理仅供参考。',
    '传统命理分析仅供传统文化、娱乐与自我反思，非科学预测。',
    '这条结论的 evidenceRef 是 bazi.pillars.month。',
    '还想看：事业 / 感情 / 财运？',
  ])('rejects default-delivery leakage: %s', (text) => {
    const r = lintReading(text);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.category === '交付面')).toBe(true);
  });

  it('allows explicit technical detail to expose a source reference', () => {
    const r = lintReading('ruleId: bazi-rule/strength; ref: bazi.dayMaster', {
      technicalDetails: true,
    });
    expect(r.ok).toBe(true);
  });

  it('keeps strong consultant jargon out of natural delivery', () => {
    const r = lintReading('你需要建立自己的专业壁垒，形成闭环。');
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.category === '黑话强')).toBe(true);
  });
});

describe('reading-lint: V1 retained safety checks', () => {
  it('rejects empty talk without a concrete action or scene', () => {
    const r = lintReading('未来要稳中求进，持续提升竞争力。');
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.category === '空话')).toBe(true);
  });

  it('accepts a concrete action in the same sentence', () => {
    const r = lintReading('如果以后与人合作接项目，先把分工、交付日期和分成写清楚。');
    expect(r.ok).toBe(true);
  });

  it('rejects deterministic relationship claims', () => {
    const r = lintReading('你们注定在一起，也一定不会分手。');
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.category === '越界')).toBe(true);
  });

  it("rejects ungrounded claims about the user's current life", () => {
    const r = lintReading('你现在有一份稳定的工作。');
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.category === '越界')).toBe(true);
  });

  it('warns when one conclusion is repeated', () => {
    const sentence = '你适合先把一门手艺练扎实，再让别人慢慢看见成果。';
    const r = lintReading(`${sentence}\n\n${sentence}`);
    expect(r.violations.some((v) => v.category === '重复' && v.severity === 'warn')).toBe(true);
  });

  it('keeps the shipped V1 examples valid on the default delivery surface', () => {
    const root = join(process.cwd(), 'skills', 'xuan-ji-yu-heng', 'references');
    for (const file of ['examples-career.md', 'examples-love.md', 'examples-wealth.md']) {
      const md = readFileSync(join(root, file), 'utf8');
      const match = md.match(/### 可交付示例\n([\s\S]*?)(?=\n### |$)/);
      expect(match, file).not.toBeNull();
      const r = lintReading(match![1]!);
      expect(
        r.violations.filter((v) => v.severity === 'error'),
        file,
      ).toEqual([]);
    }
  });
});
