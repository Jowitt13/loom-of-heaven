// Synthetic test data — fictional only; not a real person or event.
import { describe, expect, it } from 'vitest';
import { normalizeSafetyText, validateAnswer } from '@ming/interpret';
import {
  MAX_CAVEATS_EXPRESSED,
  MAX_PARAGRAPH_TEXT_CHARS,
  MAX_PARAGRAPHS_PER_SECTION,
  MAX_SECTIONS,
  MAX_SOURCE_FACT_IDS_PER_PARAGRAPH,
  ValidateAnswerInput as ValidateAnswerInputSchema,
} from '@ming/contracts';
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

    it('does NOT flag negation-guarded disclaimer wording in exempt sections', () => {
      // The disclaimer section may reference medical/legal topics generically,
      // as long as the risky term sits in an explicit disclaimer negation
      // (不构成… / 请咨询专业…). The section is still safety-scanned.
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

  // --- OUTPUT HARDENING (all data below is synthetic / fictional) ---
  describe('exempt sections are still safety-scanned', () => {
    it('flags high-risk content inside a disclaimer section', () => {
      const draft = makeDraft({
        sections: [
          {
            id: 'disclaimer',
            heading: '免责声明',
            paragraphs: [{ text: '你命中注定会离婚，无可改变。', sourceFactIds: [] }],
          },
        ],
      });
      const result = validateAnswer({ answerPlan: makePlan(), readingDraft: draft });
      expect(result.ok).toBe(false);
      const fate = result.violations.find((v) => v.code === 'HIGH_RISK_DETERMINISTIC_FATE');
      expect(fate).toBeDefined();
      expect(fate!.sectionId).toBe('disclaimer');
      // Fact-citation exemption still applies to exempt sections:
      expect(result.violations.some((v) => v.code === 'MISSING_SOURCE_FACTS')).toBe(false);
    });

    it('flags high-risk content inside uncertainty and technical-evidence sections', () => {
      const draft = makeDraft({
        sections: [
          {
            id: 'uncertainty',
            heading: '不确定性',
            paragraphs: [{ text: '命盘显示你活不过六十岁。', sourceFactIds: [] }],
          },
          {
            id: 'technical-evidence',
            heading: '技术依据',
            paragraphs: [{ text: '建议买入股票，保证赚不赔。', sourceFactIds: [] }],
          },
        ],
      });
      const result = validateAnswer({ answerPlan: makePlan(), readingDraft: draft });
      expect(result.ok).toBe(false);
      expect(result.violations.some((v) => v.code === 'HIGH_RISK_LIFE_DEATH')).toBe(true);
      expect(result.violations.some((v) => v.code === 'HIGH_RISK_INVESTMENT')).toBe(true);
    });
  });

  describe('normalization defeats common evasion forms', () => {
    /** Wrap a single risky text into a minimal draft. */
    function riskyDraft(text: string): ValidateAnswerInput['readingDraft'] {
      return makeDraft({
        sections: [
          {
            id: 'summary',
            heading: '核心结论',
            paragraphs: [{ text, sourceFactIds: ['fact-1'] }],
          },
        ],
      });
    }

    it('normalizeSafetyText strips zero-width chars, folds NFKC and CJK splits', () => {
      expect(normalizeSafetyText('注\u200B定')).toBe('注定');
      expect(normalizeSafetyText('ＰＵＡ')).toBe('PUA');
      expect(normalizeSafetyText('注 定')).toBe('注定');
      expect(normalizeSafetyText('注-定')).toBe('注定');
      expect(normalizeSafetyText('必\u00A0\u3000死')).toBe('必死');
      // English words are not merged by the CJK-split rule:
      expect(normalizeSafetyText('a-b')).toBe('a-b');
    });

    it('blocks zero-width-split risky words (注\u200B定)', () => {
      const result = validateAnswer({
        answerPlan: makePlan(),
        readingDraft: riskyDraft('你命中注\u200B定不可能成功。'),
      });
      expect(result.violations.some((v) => v.code === 'HIGH_RISK_DETERMINISTIC_FATE')).toBe(true);
    });

    it('blocks space/punctuation-split risky words (必 死 / 注-定)', () => {
      const r1 = validateAnswer({
        answerPlan: makePlan(),
        readingDraft: riskyDraft('命盘显示你必 死无疑。'),
      });
      expect(r1.violations.some((v) => v.code === 'HIGH_RISK_LIFE_DEATH')).toBe(true);
      const r2 = validateAnswer({
        answerPlan: makePlan(),
        readingDraft: riskyDraft('这就是你的宿命，注-定无法改变。'),
      });
      expect(r2.violations.some((v) => v.code === 'HIGH_RISK_DETERMINISTIC_FATE')).toBe(true);
    });

    it('blocks NFKC compatibility forms (full-width ＰＵＡ)', () => {
      const result = validateAnswer({
        answerPlan: makePlan(),
        readingDraft: riskyDraft('对她ＰＵＡ一下就好。'),
      });
      expect(result.violations.some((v) => v.code === 'HIGH_RISK_RELATIONSHIP_MANIPULATION')).toBe(
        true,
      );
    });

    it('covers both Chinese and English safety categories', () => {
      const zh = validateAnswer({
        answerPlan: makePlan(),
        readingDraft: riskyDraft('你应该拿捏对方，让她离不开你。'),
      });
      expect(zh.violations.some((v) => v.code === 'HIGH_RISK_RELATIONSHIP_MANIPULATION')).toBe(
        true,
      );
      const en = validateAnswer({
        answerPlan: makePlan(),
        readingDraft: riskyDraft('试着 gaslighting 对方，效果更好。'),
      });
      expect(en.violations.some((v) => v.code === 'HIGH_RISK_RELATIONSHIP_MANIPULATION')).toBe(
        true,
      );
    });

    it('does not obviously misfire on disclaimer-style negation contexts', () => {
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
              { text: '本报告不构成医疗诊断或治疗建议。', sourceFactIds: [] },
              { text: '本报告不提供投资操作指令，不构成买入股票的依据。', sourceFactIds: [] },
            ],
          },
        ],
      });
      const result = validateAnswer({ answerPlan: makePlan(), readingDraft: draft });
      expect(result.ok).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('violation output contains no input fragments', () => {
    it('never echoes draft text, fact IDs, or caveat text in the result', () => {
      const TEXT_MARKER = 'SYNTH-DRAFT-MARKER-7f3a';
      const FACT_MARKER = 'SYNTH-FACT-MARKER-9b2c';
      const CAVEAT_MARKER = 'SYNTH-CAVEAT-MARKER-5d1e';
      const WARNING_MARKER = 'SYNTH-WARNING-MARKER-3c4f';
      const plan = makePlan({
        requiredCaveats: [`出生时间为约估 ${CAVEAT_MARKER}`],
        requiredWarningCodes: [WARNING_MARKER],
      });
      const draft = makeDraft({
        caveatsExpressed: [],
        warningsDisclosed: [],
        sections: [
          {
            id: 'summary',
            heading: '核心结论',
            paragraphs: [
              {
                text: `你命中注定会离婚，${TEXT_MARKER}。`,
                sourceFactIds: [FACT_MARKER],
              },
              { text: `无依据的断言，${TEXT_MARKER}。`, sourceFactIds: [] },
            ],
          },
        ],
      });
      const result = validateAnswer({ answerPlan: plan, readingDraft: draft });
      expect(result.ok).toBe(false);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(TEXT_MARKER);
      expect(serialized).not.toContain(FACT_MARKER);
      expect(serialized).not.toContain(CAVEAT_MARKER);
      expect(serialized).not.toContain(WARNING_MARKER);
    });

    it('locates violations with structured fields instead of echoed text', () => {
      const draft = makeDraft({
        caveatsExpressed: [],
        sections: [
          {
            id: 'summary',
            heading: '核心结论',
            paragraphs: [{ text: '你命中注定不可能成功。', sourceFactIds: ['fact-1', 'fact-99'] }],
          },
        ],
      });
      const result = validateAnswer({ answerPlan: makePlan(), readingDraft: draft });
      const unknown = result.violations.find((v) => v.code === 'UNKNOWN_FACT_ID');
      expect(unknown).toBeDefined();
      expect(unknown!.itemIndex).toBe(1); // sourceFactIds[1] is the bad one, not echoed
      const fate = result.violations.find((v) => v.code === 'HIGH_RISK_DETERMINISTIC_FATE');
      expect(fate).toBeDefined();
      expect(fate!.patternKey).toMatch(/^fate\/\d+$/);
      const caveat = result.violations.find((v) => v.code === 'MISSING_REQUIRED_CAVEAT');
      expect(caveat).toBeDefined();
      expect(caveat!.itemIndex).toBe(0);
    });
  });

  describe('resource limits', () => {
    it('rejects an oversized paragraph without scanning it', () => {
      // Risky words are embedded, but the limit check must fire INSTEAD of the scan.
      const draft = makeDraft({
        sections: [
          {
            id: 'summary',
            heading: '核心结论',
            paragraphs: [
              {
                text: `你命中注定必死。${'安'.repeat(MAX_PARAGRAPH_TEXT_CHARS)}`,
                sourceFactIds: ['fact-1'],
              },
            ],
          },
        ],
      });
      const result = validateAnswer({ answerPlan: makePlan(), readingDraft: draft });
      expect(result.ok).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]!.code).toBe('RESOURCE_LIMIT_EXCEEDED');
      expect(result.violations[0]!.patternKey).toBe('MAX_PARAGRAPH_TEXT_CHARS');
    });

    it('rejects too many sections, paragraphs, fact IDs, and caveats', () => {
      const paragraph = { text: '合成段落。', sourceFactIds: ['fact-1'] };
      const tooManySections = makeDraft({
        sections: Array.from({ length: MAX_SECTIONS + 1 }, (_, i) => ({
          id: `s-${i}`,
          heading: '合成',
          paragraphs: [paragraph],
        })),
      });
      const r1 = validateAnswer({ answerPlan: makePlan(), readingDraft: tooManySections });
      expect(r1.violations[0]!.patternKey).toBe('MAX_SECTIONS');

      const tooManyParagraphs = makeDraft({
        sections: [
          {
            id: 'summary',
            heading: '核心结论',
            paragraphs: Array.from({ length: MAX_PARAGRAPHS_PER_SECTION + 1 }, () => paragraph),
          },
        ],
      });
      const r2 = validateAnswer({ answerPlan: makePlan(), readingDraft: tooManyParagraphs });
      expect(r2.violations[0]!.patternKey).toBe('MAX_PARAGRAPHS_PER_SECTION');

      const tooManyFactIds = makeDraft({
        sections: [
          {
            id: 'summary',
            heading: '核心结论',
            paragraphs: [
              {
                text: '合成段落。',
                sourceFactIds: Array.from(
                  { length: MAX_SOURCE_FACT_IDS_PER_PARAGRAPH + 1 },
                  () => 'fact-1',
                ),
              },
            ],
          },
        ],
      });
      const r3 = validateAnswer({ answerPlan: makePlan(), readingDraft: tooManyFactIds });
      expect(r3.violations[0]!.patternKey).toBe('MAX_SOURCE_FACT_IDS_PER_PARAGRAPH');

      const tooManyCaveats = makeDraft({
        caveatsExpressed: Array.from({ length: MAX_CAVEATS_EXPRESSED + 1 }, (_, i) => `c-${i}`),
      });
      const r4 = validateAnswer({ answerPlan: makePlan(), readingDraft: tooManyCaveats });
      expect(r4.violations[0]!.patternKey).toBe('MAX_CAVEATS_EXPRESSED');
    });

    it('rejects a draft whose total text exceeds the whole-draft budget', () => {
      // 40 sections x 5000-char paragraphs hits exactly MAX_TOTAL_TEXT_CHARS;
      // the 10-char headings push it over budget without breaching any single cap.
      const draft = makeDraft({
        sections: Array.from({ length: MAX_SECTIONS }, (_, i) => ({
          id: `s-${i}`,
          heading: '合成标题十个字符长度',
          paragraphs: [{ text: '安'.repeat(MAX_PARAGRAPH_TEXT_CHARS), sourceFactIds: ['fact-1'] }],
        })),
      });
      const result = validateAnswer({ answerPlan: makePlan(), readingDraft: draft });
      expect(result.ok).toBe(false);
      expect(result.violations[0]!.code).toBe('RESOURCE_LIMIT_EXCEEDED');
      expect(result.violations[0]!.patternKey).toBe('MAX_TOTAL_TEXT_CHARS');
    });

    it('accepts a draft exactly at the single-field limits', () => {
      const draft = makeDraft({
        sections: [
          {
            id: 'summary',
            heading: '核心结论',
            paragraphs: [
              {
                text: '安'.repeat(MAX_PARAGRAPH_TEXT_CHARS),
                sourceFactIds: Array.from(
                  { length: MAX_SOURCE_FACT_IDS_PER_PARAGRAPH },
                  () => 'fact-1',
                ),
              },
            ],
          },
          {
            id: 'disclaimer',
            heading: '信息可靠性与声明',
            paragraphs: [{ text: '本报告仅供传统文化参考。', sourceFactIds: [] }],
          },
        ],
      });
      const result = validateAnswer({ answerPlan: makePlan(), readingDraft: draft });
      expect(result.ok).toBe(true);
    });

    it('the contract schema also rejects over-limit input (CLI path)', () => {
      const oversized = {
        answerPlan: makePlan(),
        readingDraft: makeDraft({
          sections: [
            {
              id: 'summary',
              heading: '核心结论',
              paragraphs: [
                {
                  text: '安'.repeat(MAX_PARAGRAPH_TEXT_CHARS + 1),
                  sourceFactIds: ['fact-1'],
                },
              ],
            },
          ],
        }),
      };
      const parsed = ValidateAnswerInputSchema.safeParse(oversized);
      expect(parsed.success).toBe(false);
    });
  });
});
