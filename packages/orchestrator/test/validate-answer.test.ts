// Synthetic test data — fictional only; not a real person or event.
import { describe, expect, it } from 'vitest';
import { validateAnswer } from '@ming/interpret';
import type { ValidateAnswerInput } from '@ming/contracts';

/** Minimal valid AnswerPlan stub for testing. */
function makePlan(
  overrides: Partial<ValidateAnswerInput['answerPlan']> = {},
): ValidateAnswerInput['answerPlan'] {
  return {
    allowedFactIds: ['fact-1', 'fact-2', 'fact-3'],
    requiredCaveats: ['出生时间为约估，涉及时刻的结果可能变化。'],
    requiredWarningCodes: ['TIME_ACCURACY_APPROXIMATE'],
    guardrails: [
      'traditional-culture-only',
      'evidence-only',
      'no-deterministic-fate',
      'no-medical-advice',
      'no-legal-advice',
      'no-investment-advice',
      'no-life-and-death-advice',
      'no-unsupported-comparison',
    ],
    answerability: 'grounded',
    request: { topic: 'career' },
    disclaimers: ['本报告仅供传统文化参考。'],
    ...overrides,
  };
}

/** Minimal valid ReadingDraft stub. */
function makeDraft(
  overrides: Partial<ValidateAnswerInput['readingDraft']> = {},
): ValidateAnswerInput['readingDraft'] {
  return {
    contractVersion: 'reading-draft/v1',
    topic: 'career',
    sections: [
      {
        id: 'summary',
        heading: '核心结论',
        paragraphs: [{ text: '你的事业方向偏向技术与创意结合的领域。', sourceFactIds: ['fact-1'] }],
      },
      {
        id: 'disclaimer',
        heading: '信息可靠性与声明',
        paragraphs: [{ text: '本报告仅供传统文化参考，不构成专业建议。', sourceFactIds: [] }],
      },
    ],
    caveatsExpressed: ['出生时间为约估，涉及时刻的结果可能变化。'],
    warningsDisclosed: ['TIME_ACCURACY_APPROXIMATE'],
    ...overrides,
  };
}

describe('validate-answer — fact boundary and safety layer', () => {
  // --- HAPPY PATH ---
  it('passes a valid draft that cites only allowed facts and expresses all caveats', () => {
    const result = validateAnswer({ answerPlan: makePlan(), readingDraft: makeDraft() });
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.contractVersion).toBe('validation-result/v1');
  });

  // --- FACT BOUNDARY VIOLATIONS ---
  describe('fact-boundary violations', () => {
    it('MISSING_SOURCE_FACTS: rejects paragraph with empty sourceFactIds', () => {
      const draft = makeDraft({
        sections: [
          {
            id: 'summary',
            heading: '核心结论',
            paragraphs: [
              { text: '你天生适合当领导。', sourceFactIds: [] }, // no facts cited
            ],
          },
        ],
      });
      const result = validateAnswer({ answerPlan: makePlan(), readingDraft: draft });
      expect(result.ok).toBe(false);
      expect(result.violations.some((v) => v.code === 'MISSING_SOURCE_FACTS')).toBe(true);
    });

    it('UNKNOWN_FACT_ID: rejects citation of a fact not in allowedFactIds', () => {
      const draft = makeDraft({
        sections: [
          {
            id: 'summary',
            heading: '核心结论',
            paragraphs: [
              { text: '你的事业方向偏向技术。', sourceFactIds: ['fact-99'] }, // not allowed
            ],
          },
        ],
      });
      const result = validateAnswer({ answerPlan: makePlan(), readingDraft: draft });
      expect(result.ok).toBe(false);
      expect(result.violations.some((v) => v.code === 'UNKNOWN_FACT_ID')).toBe(true);
    });

    it('CROSS_TOPIC: rejects draft whose topic differs from plan topic', () => {
      const draft = makeDraft({ topic: 'marriage' }); // plan is 'career'
      const result = validateAnswer({ answerPlan: makePlan(), readingDraft: draft });
      expect(result.ok).toBe(false);
      expect(result.violations.some((v) => v.code === 'CROSS_TOPIC')).toBe(true);
    });

    it('UNSUPPORTED_TOPIC: rejects content when plan says not-supported', () => {
      const plan = makePlan({ answerability: 'not-supported', allowedFactIds: [] });
      const draft = makeDraft({
        sections: [
          {
            id: 'summary',
            heading: '核心结论',
            paragraphs: [{ text: '你的健康方面表现良好。', sourceFactIds: ['fact-1'] }],
          },
        ],
      });
      const result = validateAnswer({ answerPlan: plan, readingDraft: draft });
      expect(result.ok).toBe(false);
      expect(result.violations.some((v) => v.code === 'UNSUPPORTED_TOPIC')).toBe(true);
    });
  });

  // --- HIGH-RISK EXPRESSION VIOLATIONS ---
  describe('high-risk expression blocking', () => {
    it('HIGH_RISK_MEDICAL: blocks medical diagnosis', () => {
      const draft = makeDraft({
        sections: [
          {
            id: 'summary',
            heading: '核心结论',
            paragraphs: [
              { text: '根据命盘，你可能患有抑郁症，建议服药治疗。', sourceFactIds: ['fact-1'] },
            ],
          },
        ],
      });
      const result = validateAnswer({ answerPlan: makePlan(), readingDraft: draft });
      expect(result.ok).toBe(false);
      expect(result.violations.some((v) => v.code === 'HIGH_RISK_MEDICAL')).toBe(true);
    });

    it('HIGH_RISK_LEGAL: blocks legal conclusions', () => {
      const draft = makeDraft({
        sections: [
          {
            id: 'summary',
            heading: '核心结论',
            paragraphs: [{ text: '对方的行为构成欺诈，应当起诉。', sourceFactIds: ['fact-1'] }],
          },
        ],
      });
      const result = validateAnswer({ answerPlan: makePlan(), readingDraft: draft });
      expect(result.ok).toBe(false);
      expect(result.violations.some((v) => v.code === 'HIGH_RISK_LEGAL')).toBe(true);
    });

    it('HIGH_RISK_INVESTMENT: blocks investment buy/sell advice', () => {
      const draft = makeDraft({
        sections: [
          {
            id: 'summary',
            heading: '核心结论',
            paragraphs: [{ text: '建议买入股票，保证赚不赔。', sourceFactIds: ['fact-1'] }],
          },
        ],
      });
      const result = validateAnswer({ answerPlan: makePlan(), readingDraft: draft });
      expect(result.ok).toBe(false);
      expect(result.violations.some((v) => v.code === 'HIGH_RISK_INVESTMENT')).toBe(true);
    });

    it('HIGH_RISK_LIFE_DEATH: blocks life-death verdicts', () => {
      const draft = makeDraft({
        sections: [
          {
            id: 'summary',
            heading: '核心结论',
            paragraphs: [{ text: '命盘显示你活不过六十岁。', sourceFactIds: ['fact-1'] }],
          },
        ],
      });
      const result = validateAnswer({ answerPlan: makePlan(), readingDraft: draft });
      expect(result.ok).toBe(false);
      expect(result.violations.some((v) => v.code === 'HIGH_RISK_LIFE_DEATH')).toBe(true);
    });

    it('HIGH_RISK_DETERMINISTIC_FATE: blocks fate claims', () => {
      const draft = makeDraft({
        sections: [
          {
            id: 'summary',
            heading: '核心结论',
            paragraphs: [{ text: '你命中注定不可能成功。', sourceFactIds: ['fact-1'] }],
          },
        ],
      });
      const result = validateAnswer({ answerPlan: makePlan(), readingDraft: draft });
      expect(result.ok).toBe(false);
      expect(result.violations.some((v) => v.code === 'HIGH_RISK_DETERMINISTIC_FATE')).toBe(true);
    });

    it('HIGH_RISK_RELATIONSHIP_MANIPULATION: blocks manipulation advice', () => {
      const draft = makeDraft({
        sections: [
          {
            id: 'summary',
            heading: '核心结论',
            paragraphs: [
              { text: '你应该故意冷落对方，让她害怕失去你。', sourceFactIds: ['fact-1'] },
            ],
          },
        ],
      });
      const result = validateAnswer({ answerPlan: makePlan(), readingDraft: draft });
      expect(result.ok).toBe(false);
      expect(result.violations.some((v) => v.code === 'HIGH_RISK_RELATIONSHIP_MANIPULATION')).toBe(
        true,
      );
    });

    it('does NOT flag exempt sections (disclaimer) for high-risk patterns', () => {
      // The disclaimer section may reference medical/legal topics generically
      const draft = makeDraft({
        sections: [
          {
            id: 'summary',
            heading: '核心结论',
            paragraphs: [{ text: '你的事业方向偏向技术。', sourceFactIds: ['fact-1'] }],
          },
          {
            id: 'disclaimer',
            heading: '免责声明',
            paragraphs: [
              {
                text: '本报告不构成医疗诊断或治疗建议。如有健康问题请咨询专业医生。',
                sourceFactIds: [],
              },
            ],
          },
        ],
      });
      const result = validateAnswer({ answerPlan: makePlan(), readingDraft: draft });
      expect(result.ok).toBe(true);
    });
  });

  // --- CAVEAT AND WARNING VIOLATIONS ---
  describe('caveat and warning violations', () => {
    it('MISSING_REQUIRED_CAVEAT: fails when a required caveat is not expressed', () => {
      const draft = makeDraft({ caveatsExpressed: [] }); // missing the required caveat
      const result = validateAnswer({ answerPlan: makePlan(), readingDraft: draft });
      expect(result.ok).toBe(false);
      expect(result.violations.some((v) => v.code === 'MISSING_REQUIRED_CAVEAT')).toBe(true);
    });

    it('MISSING_REQUIRED_WARNING: fails when a required warning is not disclosed', () => {
      const draft = makeDraft({ warningsDisclosed: [] }); // missing TIME_ACCURACY_APPROXIMATE
      const result = validateAnswer({ answerPlan: makePlan(), readingDraft: draft });
      expect(result.ok).toBe(false);
      expect(result.violations.some((v) => v.code === 'MISSING_REQUIRED_WARNING')).toBe(true);
    });

    it('MISSING_DISCLAIMER: warns when plan has disclaimers but draft has no disclaimer section', () => {
      const draft = makeDraft({
        sections: [
          {
            id: 'summary',
            heading: '核心结论',
            paragraphs: [{ text: '你的事业方向偏向技术。', sourceFactIds: ['fact-1'] }],
          },
          // No disclaimer section
        ],
      });
      const result = validateAnswer({ answerPlan: makePlan(), readingDraft: draft });
      // MISSING_DISCLAIMER is a warning, not an error — so ok may still be true
      expect(result.violations.some((v) => v.code === 'MISSING_DISCLAIMER')).toBe(true);
      expect(result.violations.find((v) => v.code === 'MISSING_DISCLAIMER')!.severity).toBe(
        'warning',
      );
    });
  });

  // --- COMBINED / ADVERSARIAL ---
  describe('adversarial combinations', () => {
    it('reports multiple violations in one pass', () => {
      const draft = makeDraft({
        topic: 'marriage', // CROSS_TOPIC
        caveatsExpressed: [], // MISSING_REQUIRED_CAVEAT
        warningsDisclosed: [], // MISSING_REQUIRED_WARNING
        sections: [
          {
            id: 'summary',
            heading: '核心结论',
            paragraphs: [
              { text: '你命中注定会离婚。', sourceFactIds: ['fact-99'] }, // UNKNOWN + FATE
              { text: '赶快买入黄金保值。', sourceFactIds: [] }, // MISSING_SOURCE + INVESTMENT
            ],
          },
        ],
      });
      const result = validateAnswer({ answerPlan: makePlan(), readingDraft: draft });
      expect(result.ok).toBe(false);
      const codes = result.violations.map((v) => v.code);
      expect(codes).toContain('CROSS_TOPIC');
      expect(codes).toContain('UNKNOWN_FACT_ID');
      expect(codes).toContain('HIGH_RISK_DETERMINISTIC_FATE');
      expect(codes).toContain('MISSING_SOURCE_FACTS');
      expect(codes).toContain('HIGH_RISK_INVESTMENT');
      expect(codes).toContain('MISSING_REQUIRED_CAVEAT');
      expect(codes).toContain('MISSING_REQUIRED_WARNING');
    });

    it('allows a limited-answerability plan with proper caveats', () => {
      const plan = makePlan({ answerability: 'limited' });
      const draft = makeDraft(); // proper caveats and warnings
      const result = validateAnswer({ answerPlan: plan, readingDraft: draft });
      expect(result.ok).toBe(true);
    });

    it('passes when no caveats or warnings are required', () => {
      const plan = makePlan({
        requiredCaveats: [],
        requiredWarningCodes: [],
        disclaimers: [],
      });
      const draft = makeDraft({
        caveatsExpressed: [],
        warningsDisclosed: [],
        sections: [
          {
            id: 'summary',
            heading: '核心结论',
            paragraphs: [{ text: '事业方向偏向技术与创意。', sourceFactIds: ['fact-1'] }],
          },
        ],
      });
      const result = validateAnswer({ answerPlan: plan, readingDraft: draft });
      expect(result.ok).toBe(true);
    });

    it('result is deterministic across multiple invocations', () => {
      const input: ValidateAnswerInput = { answerPlan: makePlan(), readingDraft: makeDraft() };
      const r1 = validateAnswer(input);
      const r2 = validateAnswer(input);
      expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
    });
  });
});
