import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintReading } from '../src/index.ts';
import { PublicResult } from '@loom/contracts';
import { buildAnswerPlan } from '../src/answer-plan.ts';
import { validateAnswer } from '../src/validate-answer.ts';
import {
  approveAnswerClaimCandidates,
  projectAnswerClaimCandidates,
  verifyNarrativeTrace,
} from '../src/answer-claim-chain.ts';

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

  it('allows content headings with adaptive layout (roadmap v3.3)', () => {
    const r = lintReading(
      '## 命宫里的两种侧重\n\n这张盘的底色是果决与执行并存。\n\n### 为什么这样读\n\n命宫主星被看作核心性格底色。',
    );
    expect(r.ok).toBe(true);
  });

  it('still rejects control-label headings even though headings are allowed', () => {
    for (const md of [
      '## 专业依据\n官杀见于月柱。',
      '## 声明：传统命理仅供参考',
      '## 敏感项校对',
      '## 引擎警告',
    ]) {
      const r = lintReading(md);
      expect(r.ok, `should reject: ${md}`).toBe(false);
      expect(r.violations.some((v) => v.category === '交付面')).toBe(true);
    }
  });

  it('checks emphasized and bulleted lines like ordinary content', () => {
    const r = lintReading('## 重点\n\n- **提升竞争力**，稳步提升\n- 还想看：事业');
    expect(r.violations.some((v) => v.category === '空话')).toBe(true);
    expect(r.violations.some((v) => v.term === '自动追问')).toBe(true);
  });

  it('formatting never switches an overreach rule off (PR #116 narrow fix)', () => {
    const cases: Array<{ md: string; term: string }> = [
      { md: '这份盘说明你肯定能做好。', term: '成功保证' },
      { md: '## 你肯定能做好', term: '成功保证' },
      { md: '**你肯定能做好**', term: '成功保证' },
      { md: '你们必然结婚。', term: '关系命定断言' },
      { md: '必**然**结婚', term: '关系命定断言' },
      { md: '你比同龄人更容易抓住机会。', term: '群体比较' },
      { md: '## 比同龄人更强的执行力', term: '群体比较' },
      { md: '你现在有一份稳定的工作。', term: '既成事实' },
      { md: '**你现在有一份**稳定的工作。', term: '既成事实' },
    ];
    for (const { md, term } of cases) {
      const r = lintReading(md);
      expect(r.ok, `should reject: ${md}`).toBe(false);
      expect(
        r.violations.some((v) => v.term === term),
        `term ${term} for: ${md}`,
      ).toBe(true);
    }
  });

  it('emphasis cannot split a leaked control label or a follow-up menu', () => {
    for (const md of ['**专业**依据：这张盘的分类只作概念说明。', '还想**看**：事业']) {
      const r = lintReading(md);
      expect(r.ok, `should reject: ${md}`).toBe(false);
      expect(r.violations.some((v) => v.category === '交付面')).toBe(true);
    }
  });

  it('grouping headings stay exempt from the vagueness rule', () => {
    const r = lintReading('## 提升竞争力的两条路\n\n先把一件事按步骤做完，再记录结果。');
    expect(r.violations.some((v) => v.category === '空话')).toBe(false);
  });

  it('keeps line numbers valid on lines that carried emphasis', () => {
    const r = lintReading('第一行说明。\n\n必**然**结婚。');
    const hit = r.violations.find((v) => v.term === '关系命定断言');
    expect(hit).toBeDefined();
    expect(hit!.line).toBe(3);
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
      if (file === 'examples-career.md') {
        const birthOnly = md.match(/### 仅出生信息示例\n([\s\S]*?)(?=\n### |$)/);
        expect(birthOnly, file).not.toBeNull();
        expect(lintReading(birthOnly![1]!).violations).toEqual([]);
      }
    }
  });

  it('binds the love and wealth example bodies through the existing draft and trace contracts', () => {
    // Synthetic technical records only. This proves the example linkage shape,
    // not a new source admission or semantic faithfulness of its prose.
    for (const sample of [
      {
        file: 'examples-love.md',
        topic: 'marriage' as const,
        system: 'western' as const,
        profile: 'western-tropical-placidus',
        facts: [
          {
            id: 'fact-1',
            topic: 'marriage' as const,
            claim: '西方第七宫主星为水星',
            evidence: [{ kind: 'western' as const, ref: 'western.7thRuler[Mercury]' }],
            caveat: '七宫主星示关系相处方式的倾向，非精确断人。',
          },
          {
            id: 'fact-2',
            topic: 'marriage' as const,
            claim: '第七宫主星与土星存在本命相位记录',
            evidence: [{ kind: 'western' as const, ref: 'western.aspects' }],
            caveat: '相位为能量互动倾向，非事件断言。',
          },
        ],
      },
      {
        file: 'examples-wealth.md',
        topic: 'wealth' as const,
        system: 'ziwei' as const,
        profile: 'ziwei-rules@0.1.0',
        facts: [
          {
            id: 'fact-1',
            topic: 'wealth' as const,
            claim: '财帛宫主星武曲：理财能力强，善于积累',
            evidence: [
              { kind: 'ziwei' as const, ref: 'ziwei.palaces[财帛宫]' },
              { kind: 'ziwei-rule' as const, ref: 'ziwei-rule/palace-star/wealth-武曲' },
            ],
            reason: '财帛宫主星决定理财风格与进财方式',
          },
        ],
      },
    ]) {
      const md = readFileSync(
        join(process.cwd(), 'skills/xuan-ji-yu-heng/references', sample.file),
        'utf8',
      );
      const body = md.match(/### 可交付示例\n([\s\S]*?)(?=\n### |$)/)![1]!.trim();
      const publicResult = PublicResult.parse({
        contractVersion: 'public-result/v2',
        engineVersion: 'synthetic',
        sourceSchemaVersion: 'synthetic',
        systems: ['western', 'bazi', 'ziwei', 'vedic'].map((system) => ({
          system,
          status: system === sample.system ? 'computed' : 'unavailable',
        })),
        inputReliability: { timeAccuracy: 'exact', birthTimeKnown: true },
        warnings: [],
        facts: sample.facts,
        rulesets: [{ id: sample.profile, version: '0.1.0' }],
        disclaimers: [],
        followupOffers: [],
      });
      const answerPlan = buildAnswerPlan(publicResult, { topic: sample.topic });
      const context = { publicResult, answerPlan };
      const projected = projectAnswerClaimCandidates(context);
      expect(projected.issues, sample.file).toEqual([]);
      const approval = approveAnswerClaimCandidates(context, projected.candidates);
      expect(approval.issues, sample.file).toEqual([]);
      const refs = answerPlan.requiredCaveats.map((_, index) => ({
        kind: 'caveat' as const,
        index,
      }));
      const paragraphs = body.split(/\n\s*\n/).map((text) => ({
        text,
        sourceFactIds: answerPlan.allowedFactIds,
        constraintRefs: refs,
      }));
      expect(
        validateAnswer({
          answerPlan,
          readingDraft: {
            contractVersion: 'reading-draft/v2',
            topic: sample.topic,
            sections: [{ id: 'body', heading: '', paragraphs }],
            caveatsExpressed: answerPlan.requiredCaveats,
            warningsDisclosed: [],
          },
        }).ok,
        sample.file,
      ).toBe(true);
      const mechanisms = [
        ...new Set(approval.approvedClaims.flatMap((claim) => claim.mechanismRefs)),
      ];
      for (const ref of mechanisms) expect(md, sample.file).toContain(ref);
      for (const [index, paragraph] of paragraphs.entries()) {
        expect(
          verifyNarrativeTrace(
            {
              contractVersion: 'narrative-trace/v1',
              traceId: `narrative-trace:paragraph-${index + 1}`,
              paragraphId: `paragraph-${index + 1}`,
              topic: sample.topic,
              visibleText: paragraph.text,
              approvedClaimIds: approval.approvedClaims.map((claim) => claim.claimId),
              factRefs: answerPlan.allowedFactIds,
              mechanismRefs: mechanisms,
              constraintRefs: refs,
              invalidationCauses: [
                'input-chart',
                'settings',
                'engine-provider',
                'ruleset',
                'source-profile',
                'topic-lens',
                'language-narrator',
              ],
              transient: true,
              regenerable: true,
            },
            approval.approvedClaims,
          ).ok,
          sample.file,
        ).toBe(true);
      }
    }
  });
});
