// Synthetic test data — fictional only; not a real person or event.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  maskSafetyDisclaimers,
  normalizeSafetyText,
  parseValidateAnswerInputBounded,
  validateAnswer,
} from '@ming/interpret';
import {
  MAX_ALLOWED_FACT_IDS,
  MAX_CAVEATS_EXPRESSED,
  MAX_NOT_SUPPORTED_TEXT_CHARS,
  MAX_PARAGRAPH_TEXT_CHARS,
  MAX_PARAGRAPHS_PER_SECTION,
  MAX_SECTIONS,
  MAX_SOURCE_FACT_IDS_PER_PARAGRAPH,
  MAX_TOTAL_SOURCE_FACT_IDS,
  MAX_VALIDATE_ANSWER_INPUT_BYTES,
  MAX_VIOLATIONS,
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

/** Minimal valid ReadingDraft stub (v2: the disclaimer paragraph expresses the
 * plan disclaimer + required caveat/warning via structured constraintRefs). */
function makeDraft(
  overrides: Partial<ValidateAnswerInput['readingDraft']> = {},
): ValidateAnswerInput['readingDraft'] {
  return {
    contractVersion: 'reading-draft/v2',
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
        paragraphs: [
          {
            text: '本报告仅供传统文化参考，不构成专业建议。',
            sourceFactIds: [],
            constraintRefs: [
              { kind: 'disclaimer', index: 0 },
              { kind: 'caveat', index: 0 },
              { kind: 'warning', index: 0 },
            ],
          },
        ],
      },
    ],
    caveatsExpressed: ['出生时间为约估，涉及时刻的结果可能变化。'],
    warningsDisclosed: ['TIME_ACCURACY_APPROXIMATE'],
    ...overrides,
  };
}

/** Parse through the public schema first, then validate — the full input path. */
function runValidated(
  plan: ValidateAnswerInput['answerPlan'],
  draft: ValidateAnswerInput['readingDraft'],
) {
  const input = ValidateAnswerInputSchema.parse({ answerPlan: plan, readingDraft: draft });
  return validateAnswer(input);
}

describe('validate-answer — fact boundary and safety layer', () => {
  // --- HAPPY PATH ---
  it('passes a valid draft that cites only allowed facts and expresses all caveats', () => {
    const result = validateAnswer({ answerPlan: makePlan(), readingDraft: makeDraft() });
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.violationsTruncated).toBe(false);
    expect(result.contractVersion).toBe('validation-result/v2');
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

    it('does NOT flag canonical disclaimer templates in constraint-expressing paragraphs', () => {
      // The disclaimer paragraph may reference medical topics inside a canonical
      // safety-disclaimer template; the paragraph is still safety-scanned, and is
      // fact-exempt only through its structured constraintRefs.
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
                constraintRefs: [
                  { kind: 'disclaimer', index: 0 },
                  { kind: 'caveat', index: 0 },
                  { kind: 'warning', index: 0 },
                ],
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
    it('MISSING_REQUIRED_CAVEAT: fails when a required caveat is neither declared nor referenced', () => {
      const draft = makeDraft({
        caveatsExpressed: [], // not declared
        sections: [
          {
            id: 'summary',
            heading: '核心结论',
            paragraphs: [{ text: '你的事业方向偏向技术。', sourceFactIds: ['fact-1'] }],
          },
          {
            id: 'disclaimer',
            heading: '信息可靠性与声明',
            paragraphs: [
              {
                text: '本报告仅供传统文化参考。',
                sourceFactIds: [],
                // no caveat ref either → the caveat is fully missing
                constraintRefs: [
                  { kind: 'disclaimer', index: 0 },
                  { kind: 'warning', index: 0 },
                ],
              },
            ],
          },
        ],
      });
      const result = validateAnswer({ answerPlan: makePlan(), readingDraft: draft });
      expect(result.ok).toBe(false);
      expect(result.violations.some((v) => v.code === 'MISSING_REQUIRED_CAVEAT')).toBe(true);
    });

    it('MISSING_REQUIRED_WARNING: fails when a required warning is neither declared nor referenced', () => {
      const draft = makeDraft({
        warningsDisclosed: [], // not declared
        sections: [
          {
            id: 'summary',
            heading: '核心结论',
            paragraphs: [{ text: '你的事业方向偏向技术。', sourceFactIds: ['fact-1'] }],
          },
          {
            id: 'disclaimer',
            heading: '信息可靠性与声明',
            paragraphs: [
              {
                text: '本报告仅供传统文化参考。',
                sourceFactIds: [],
                // no warning ref either → the warning is fully missing
                constraintRefs: [
                  { kind: 'disclaimer', index: 0 },
                  { kind: 'caveat', index: 0 },
                ],
              },
            ],
          },
        ],
      });
      const result = validateAnswer({ answerPlan: makePlan(), readingDraft: draft });
      expect(result.ok).toBe(false);
      expect(result.violations.some((v) => v.code === 'MISSING_REQUIRED_WARNING')).toBe(true);
    });

    it('MISSING_DISCLAIMER: errors per uncovered plan disclaimer', () => {
      const draft = makeDraft({
        sections: [
          {
            id: 'summary',
            heading: '核心结论',
            paragraphs: [{ text: '你的事业方向偏向技术。', sourceFactIds: ['fact-1'] }],
          },
          // No disclaimer-referencing paragraph
        ],
      });
      const result = validateAnswer({ answerPlan: makePlan(), readingDraft: draft });
      expect(result.ok).toBe(false); // explicit v2 strictness: uncovered disclaimers are errors
      const missing = result.violations.find((v) => v.code === 'MISSING_DISCLAIMER');
      expect(missing).toBeDefined();
      expect(missing!.severity).toBe('error');
      expect(missing!.itemIndex).toBe(0);
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
            paragraphs: [
              {
                text: '你命中注定会离婚，无可改变。',
                sourceFactIds: [],
                constraintRefs: [
                  { kind: 'disclaimer', index: 0 },
                  { kind: 'caveat', index: 0 },
                  { kind: 'warning', index: 0 },
                ],
              },
            ],
          },
        ],
      });
      const result = validateAnswer({ answerPlan: makePlan(), readingDraft: draft });
      expect(result.ok).toBe(false);
      const fate = result.violations.find((v) => v.code === 'HIGH_RISK_DETERMINISTIC_FATE');
      expect(fate).toBeDefined();
      expect(fate!.sectionIndex).toBe(0);
      expect(fate!.field).toBe('paragraph');
      // Constraint-based fact exemption still applies — but never exempts the scan:
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
      // technical-evidence is NOT fact-exempt: its unsourced paragraph is flagged too.
      expect(
        result.violations.some((v) => v.code === 'MISSING_SOURCE_FACTS' && v.sectionIndex === 1),
      ).toBe(true);
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

    it('normalizeSafetyText strips zero-width chars, folds NFKC, case and CJK splits', () => {
      expect(normalizeSafetyText('注\u200B定')).toBe('注定');
      expect(normalizeSafetyText('ＰＵＡ')).toBe('pua'); // NFKC + case fold
      expect(normalizeSafetyText('注 定')).toBe('注定');
      expect(normalizeSafetyText('注-定')).toBe('注定');
      expect(normalizeSafetyText('必\u00A0\u3000死')).toBe('必死');
      expect(normalizeSafetyText('注\u034F定')).toBe('注定'); // U+034F CGJ is ignorable
      expect(normalizeSafetyText('&#27880;&#23450;')).toBe('注定'); // decimal NCR
      expect(normalizeSafetyText('&#x5FC5;&#x6B7B;')).toBe('必死'); // hex NCR
      expect(normalizeSafetyText('&amp;#27880;&amp;#23450;')).toBe('注定'); // double-encoded
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

    it('does not misfire on canonical safety-disclaimer templates', () => {
      // These clauses match the canonical templates (negation verb + enumerated
      // object phrase, clause-bounded) and are masked before scanning; the
      // paragraphs are fact-exempt via structured constraintRefs.
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
                text: '本报告不构成医疗诊断或治疗建议。',
                sourceFactIds: [],
                constraintRefs: [
                  { kind: 'disclaimer', index: 0 },
                  { kind: 'caveat', index: 0 },
                ],
              },
              {
                text: '本解读不提供用药建议，也不构成投资操作指令。',
                sourceFactIds: [],
                constraintRefs: [
                  { kind: 'disclaimer', index: 0 },
                  { kind: 'warning', index: 0 },
                ],
              },
            ],
          },
        ],
      });
      const result = runValidated(makePlan(), draft);
      expect(result.ok).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('violation output contains no input fragments', () => {
    it('never echoes draft text, section ids, fact IDs, or caveat text in the result', () => {
      const TEXT_MARKER = 'SYNTH-DRAFT-MARKER-7f3a';
      const SECTION_MARKER = 'SYNTH-SECTION-MARKER-1a2b';
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
            id: SECTION_MARKER,
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
      expect(serialized).not.toContain(SECTION_MARKER);
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
      expect(unknown!.sectionIndex).toBe(0); // numeric locator, never the section id
      const fate = result.violations.find((v) => v.code === 'HIGH_RISK_DETERMINISTIC_FATE');
      expect(fate).toBeDefined();
      expect(fate!.patternKey).toBe('fate.predestined'); // stable named rule id
      expect(fate!.patternKey).toMatch(/^[a-z-]+\.[a-z-]+$/); // never a bare array index
      const caveat = result.violations.find((v) => v.code === 'MISSING_REQUIRED_CAVEAT');
      expect(caveat).toBeDefined();
      expect(caveat!.itemIndex).toBe(0);
    });
  });

  describe('disclaimer masking is canonical and clause-bounded', () => {
    /** Wrap a single synthetic text into a minimal draft. */
    function textDraft(text: string): ValidateAnswerInput['readingDraft'] {
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

    it('maskSafetyDisclaimers masks only the canonical clause, not neighbours', () => {
      const masked = maskSafetyDisclaimers(
        normalizeSafetyText('本报告不构成医疗建议，你应该立即停药。'),
      );
      expect(masked).not.toContain('医疗建议');
      expect(masked).toContain('停药'); // the second clause stays scannable
    });

    it('newlines are clause boundaries: the mask never crosses a line break', () => {
      const masked = maskSafetyDisclaimers(
        normalizeSafetyText('本报告不构成医疗建议\n你应该停药。'),
      );
      expect(masked).not.toContain('医疗建议');
      expect(masked).toContain('停药');
      const result = runValidated(makePlan(), textDraft('本报告不构成医疗建议\n你应该停药。'));
      expect(result.violations.some((v) => v.code === 'HIGH_RISK_MEDICAL')).toBe(true);
    });

    it('a line-split risky word is still caught by the scan after masking', () => {
      const result = runValidated(makePlan(), textDraft('命盘显示你必\n死。'));
      expect(result.violations.some((v) => v.code === 'HIGH_RISK_LIFE_DEATH')).toBe(true);
    });

    it('cross-clause negation does not exempt the next clause', () => {
      const result = runValidated(makePlan(), textDraft('本报告不构成医疗建议，你应该立即停药。'));
      expect(result.violations.some((v) => v.code === 'HIGH_RISK_MEDICAL')).toBe(true);
    });

    it('a short adversative inside the old 12-char window is no longer swallowed', () => {
      // Under the removed wide-span mask this whole span could be eaten;
      // canonical templates reject it and the second action is scanned.
      const result = runValidated(makePlan(), textDraft('本报告不构成医疗但你应该服药的建议。'));
      expect(result.violations.some((v) => v.code === 'HIGH_RISK_MEDICAL')).toBe(true);
    });

    it('a second action in the same clause is not swallowed', () => {
      const result = runValidated(makePlan(), textDraft('本报告不构成医疗建议并建议你服药。'));
      expect(result.violations.some((v) => v.code === 'HIGH_RISK_MEDICAL')).toBe(true);
    });

    it('referral prompts are not a generic exemption marker', () => {
      const result = runValidated(makePlan(), textDraft('请咨询专业人士，你命中注定不可能成功。'));
      expect(result.violations.some((v) => v.code === 'HIGH_RISK_DETERMINISTIC_FATE')).toBe(true);
    });

    it('double negation is not masked', () => {
      const result = runValidated(makePlan(), textDraft('不是不建议买入股票，其实可以买入股票。'));
      expect(result.violations.some((v) => v.code === 'HIGH_RISK_INVESTMENT')).toBe(true);
    });

    it('a canonical template never hides an adjacent independent hit', () => {
      const result = runValidated(
        makePlan(),
        textDraft('本报告不构成医疗诊断或治疗建议。你必死。'),
      );
      expect(result.violations.some((v) => v.code === 'HIGH_RISK_MEDICAL')).toBe(false);
      expect(result.violations.some((v) => v.code === 'HIGH_RISK_LIFE_DEATH')).toBe(true);
    });

    it('a masked disclaimer never hides an unrelated hit in the same paragraph', () => {
      const result = runValidated(
        makePlan(),
        textDraft('本报告不构成医疗诊断，但命盘显示你必死。'),
      );
      expect(result.violations.some((v) => v.code === 'HIGH_RISK_MEDICAL')).toBe(false);
      expect(result.violations.some((v) => v.code === 'HIGH_RISK_LIFE_DEATH')).toBe(true);
    });

    it('a run-on clause that does not fit a canonical template is scanned as-is', () => {
      const result = runValidated(makePlan(), textDraft('本内容不构成医疗建议你需要做手术。'));
      expect(result.violations.some((v) => v.code === 'HIGH_RISK_MEDICAL')).toBe(true);
    });
  });

  describe('headings are scanned like paragraphs', () => {
    it('rejects a heading-only adversarial draft and locates it with field=heading', () => {
      const draft = makeDraft({
        sections: [
          {
            id: 'summary',
            heading: '你命中注定失败的原因',
            paragraphs: [{ text: '事业方向偏向技术。', sourceFactIds: ['fact-1'] }],
          },
        ],
      });
      const result = validateAnswer({ answerPlan: makePlan(), readingDraft: draft });
      expect(result.ok).toBe(false);
      const hit = result.violations.find((v) => v.code === 'HIGH_RISK_DETERMINISTIC_FATE');
      expect(hit).toBeDefined();
      expect(hit!.field).toBe('heading');
      expect(hit!.sectionIndex).toBe(0);
      expect(hit!.paragraphIndex).toBeUndefined();
    });

    it('scans headings of fact-exempt sections too', () => {
      const draft = makeDraft({
        sections: [
          {
            id: 'disclaimer',
            heading: '保证赚不亏的声明',
            paragraphs: [{ text: '本报告仅供传统文化参考。', sourceFactIds: [] }],
          },
        ],
      });
      const result = validateAnswer({ answerPlan: makePlan(), readingDraft: draft });
      expect(
        result.violations.some((v) => v.code === 'HIGH_RISK_INVESTMENT' && v.field === 'heading'),
      ).toBe(true);
    });
  });

  describe('answerability boundaries', () => {
    it('not-supported: content cannot hide under a disclaimer section id (fact-citing)', () => {
      const plan = makePlan({ answerability: 'not-supported', allowedFactIds: [] });
      const draft = makeDraft({
        sections: [
          {
            id: 'disclaimer',
            heading: '声明',
            paragraphs: [{ text: '你的事业方向偏向技术。', sourceFactIds: ['fact-1'] }],
          },
        ],
      });
      const result = validateAnswer({ answerPlan: plan, readingDraft: draft });
      expect(result.violations.some((v) => v.code === 'UNSUPPORTED_TOPIC')).toBe(true);
    });

    it('not-supported: more-than-brief text is rejected regardless of section id', () => {
      const plan = makePlan({ answerability: 'not-supported', allowedFactIds: [] });
      const draft = makeDraft({
        sections: [
          {
            id: 'disclaimer',
            heading: '声明',
            paragraphs: [
              { text: '安'.repeat(MAX_NOT_SUPPORTED_TEXT_CHARS + 1), sourceFactIds: [] },
            ],
          },
        ],
      });
      const result = validateAnswer({ answerPlan: plan, readingDraft: draft });
      expect(result.violations.some((v) => v.code === 'UNSUPPORTED_TOPIC')).toBe(true);
    });

    it('not-supported: a brief fact-free explanation passes', () => {
      const plan = makePlan({ answerability: 'not-supported', allowedFactIds: [] });
      const draft = makeDraft({
        sections: [
          {
            id: 'disclaimer',
            heading: '信息可靠性与声明',
            paragraphs: [
              {
                text: '引擎无法提供该主题的事实，建议换一个主题。',
                sourceFactIds: [],
                constraintRefs: [
                  { kind: 'disclaimer', index: 0 },
                  { kind: 'caveat', index: 0 },
                  { kind: 'warning', index: 0 },
                ],
              },
            ],
          },
        ],
      });
      const result = validateAnswer({ answerPlan: plan, readingDraft: draft });
      expect(result.ok).toBe(true);
    });

    it('grounded: technical-evidence paragraphs must cite facts', () => {
      const draft = makeDraft({
        sections: [
          {
            id: 'technical-evidence',
            heading: '技术依据',
            paragraphs: [{ text: '日主得令，比劫为用。', sourceFactIds: [] }],
          },
        ],
      });
      const result = validateAnswer({ answerPlan: makePlan(), readingDraft: draft });
      expect(
        result.violations.some((v) => v.code === 'MISSING_SOURCE_FACTS' && v.sectionIndex === 0),
      ).toBe(true);
    });

    it('not-supported: headings count against the same visible-text budget', () => {
      // heading-heavy: 3 headings x 180 chars = 540 > budget, paragraphs tiny.
      const plan = makePlan({
        answerability: 'not-supported',
        allowedFactIds: [],
        requiredCaveats: [],
        requiredWarningCodes: [],
        disclaimers: [],
      });
      const draft = makeDraft({
        caveatsExpressed: [],
        warningsDisclosed: [],
        sections: Array.from({ length: 3 }, (_, i) => ({
          id: `s-${i}`,
          heading: '安'.repeat(180),
          paragraphs: [{ text: '说明。', sourceFactIds: [] }],
        })),
      });
      const result = runValidated(plan, draft);
      expect(result.violations.some((v) => v.code === 'UNSUPPORTED_TOPIC')).toBe(true);
    });

    it('not-supported: heading + paragraph exactly at the budget passes; one more char fails', () => {
      const plan = makePlan({
        answerability: 'not-supported',
        allowedFactIds: [],
        requiredCaveats: [],
        requiredWarningCodes: [],
        disclaimers: [],
      });
      const atLimit = makeDraft({
        caveatsExpressed: [],
        warningsDisclosed: [],
        sections: [
          {
            id: 'note',
            heading: '安'.repeat(100),
            paragraphs: [
              { text: '安'.repeat(MAX_NOT_SUPPORTED_TEXT_CHARS - 100), sourceFactIds: [] },
            ],
          },
        ],
      });
      expect(runValidated(plan, atLimit).ok).toBe(true);
      const overLimit = makeDraft({
        caveatsExpressed: [],
        warningsDisclosed: [],
        sections: [
          {
            id: 'note',
            heading: '安'.repeat(100),
            paragraphs: [
              { text: '安'.repeat(MAX_NOT_SUPPORTED_TEXT_CHARS - 99), sourceFactIds: [] },
            ],
          },
        ],
      });
      const result = runValidated(plan, overLimit);
      expect(result.violations.some((v) => v.code === 'UNSUPPORTED_TOPIC')).toBe(true);
    });
  });

  describe('contract versioning', () => {
    it('legacy reading-draft/v1 is rejected at runtime (schema AND public API)', () => {
      const v1Input = {
        answerPlan: makePlan(),
        readingDraft: { ...makeDraft(), contractVersion: 'reading-draft/v1' },
      };
      expect(ValidateAnswerInputSchema.safeParse(v1Input).success).toBe(false);
      const result = validateAnswer(v1Input);
      expect(result.ok).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]!.code).toBe('UNSUPPORTED_CONTRACT_VERSION');
      expect(result.contractVersion).toBe('validation-result/v2');
    });

    it('rejects unknown reading-draft versions at the schema', () => {
      const badInput = {
        answerPlan: makePlan(),
        readingDraft: { ...makeDraft(), contractVersion: 'reading-draft/v0' },
      };
      expect(ValidateAnswerInputSchema.safeParse(badInput).success).toBe(false);
    });

    it('the direct API rejects unknown versions instead of returning a v2 success', () => {
      const forged = {
        answerPlan: makePlan(),
        readingDraft: { ...makeDraft(), contractVersion: 'reading-draft/v99' },
      };
      const result = validateAnswer(forged);
      expect(result.ok).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]!.code).toBe('UNSUPPORTED_CONTRACT_VERSION');
    });

    it('a v1-style draft cannot recover the section-id fact exemption by any version value', () => {
      // The former v1 escape hatch: unsourced content under id "disclaimer"
      // without constraintRefs. With v1 rejected at runtime, the only way in is
      // v2 — where the free section id grants nothing.
      const draft = makeDraft({
        sections: [
          {
            id: 'summary',
            heading: '核心结论',
            paragraphs: [{ text: '你的事业方向偏向技术。', sourceFactIds: ['fact-1'] }],
          },
          {
            id: 'disclaimer',
            heading: '信息可靠性与声明',
            paragraphs: [{ text: '本报告仅供传统文化参考。', sourceFactIds: [] }],
          },
        ],
      });
      const result = runValidated(makePlan(), draft);
      expect(result.ok).toBe(false);
      expect(
        result.violations.some((v) => v.code === 'MISSING_SOURCE_FACTS' && v.sectionIndex === 1),
      ).toBe(true);
    });
  });

  describe('structured constraint references (v2 fact exemption)', () => {
    it('a masquerading section id no longer grants fact exemption', () => {
      const draft = makeDraft({
        sections: [
          {
            id: 'disclaimer', // free id — no refs → no exemption in v2
            heading: '声明',
            paragraphs: [{ text: '无依据的内容。', sourceFactIds: [] }],
          },
        ],
      });
      const result = runValidated(makePlan(), draft);
      expect(result.ok).toBe(false);
      expect(result.violations.some((v) => v.code === 'MISSING_SOURCE_FACTS')).toBe(true);
    });

    it('an out-of-range constraint index is rejected', () => {
      const draft = makeDraft({
        sections: [
          {
            id: 'disclaimer',
            heading: '声明',
            paragraphs: [
              {
                text: '本报告仅供传统文化参考。',
                sourceFactIds: [],
                constraintRefs: [{ kind: 'caveat', index: 5 }], // only 1 caveat exists
              },
            ],
          },
        ],
      });
      const result = runValidated(makePlan(), draft);
      expect(result.ok).toBe(false);
      const invalid = result.violations.find((v) => v.code === 'INVALID_CONSTRAINT_REF');
      expect(invalid).toBeDefined();
      expect(invalid!.itemIndex).toBe(0);
      expect(invalid!.patternKey).toBe('caveat');
      // an invalid ref also voids the fact exemption:
      expect(result.violations.some((v) => v.code === 'MISSING_SOURCE_FACTS')).toBe(true);
    });

    it('a ref whose kind points at an empty plan array is rejected', () => {
      const plan = makePlan({ disclaimers: [] });
      const draft = makeDraft({
        sections: [
          {
            id: 'summary',
            heading: '核心结论',
            paragraphs: [
              {
                text: '本报告仅供传统文化参考。',
                sourceFactIds: [],
                constraintRefs: [{ kind: 'disclaimer', index: 0 }], // wrong kind: no disclaimers
              },
            ],
          },
        ],
      });
      const result = runValidated(plan, draft);
      expect(
        result.violations.some(
          (v) => v.code === 'INVALID_CONSTRAINT_REF' && v.patternKey === 'disclaimer',
        ),
      ).toBe(true);
    });

    it('declared-but-not-referenced caveats are a mismatch, not silent success', () => {
      const draft = makeDraft({
        sections: [
          {
            id: 'summary',
            heading: '核心结论',
            paragraphs: [{ text: '你的事业方向偏向技术。', sourceFactIds: ['fact-1'] }],
          },
        ],
        // caveatsExpressed/warningsDisclosed keep defaults → declared but never referenced
      });
      const result = runValidated(makePlan(), draft);
      expect(result.ok).toBe(false);
      expect(
        result.violations.some(
          (v) => v.code === 'CONSTRAINT_ATTESTATION_MISMATCH' && v.patternKey === 'caveat',
        ),
      ).toBe(true);
      expect(
        result.violations.some(
          (v) => v.code === 'CONSTRAINT_ATTESTATION_MISMATCH' && v.patternKey === 'warning',
        ),
      ).toBe(true);
    });

    it('referenced-but-not-declared caveats are a mismatch too', () => {
      const draft = makeDraft({ caveatsExpressed: [] }); // default draft references caveat 0
      const result = runValidated(makePlan(), draft);
      expect(result.ok).toBe(false);
      expect(
        result.violations.some(
          (v) => v.code === 'CONSTRAINT_ATTESTATION_MISMATCH' && v.patternKey === 'caveat',
        ),
      ).toBe(true);
    });

    it('legit disclaimer/caveat/warning references validate cleanly', () => {
      // The default draft expresses all three constraint kinds via refs.
      const result = runValidated(makePlan(), makeDraft());
      expect(result.ok).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('bounded input entry (facade + CLI byte cap)', () => {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
    const cliPath = join(repoRoot, 'skills', 'calculate-birth-charts', 'scripts', 'ming-chart.mjs');
    const tmpDir = join(repoRoot, '.tmp', 'validate-answer-tests');

    it('parseValidateAnswerInputBounded rejects a huge top-level array before Zod', () => {
      const huge = {
        answerPlan: makePlan(),
        readingDraft: {
          ...makeDraft(),
          sections: Array.from({ length: MAX_SECTIONS + 1 }, () => ({
            id: 's',
            heading: '',
            paragraphs: [{ text: '安', sourceFactIds: [] }],
          })),
        },
      };
      expect(() => parseValidateAnswerInputBounded(huge)).toThrow(/bounded preflight/);
    });

    it('parseValidateAnswerInputBounded accepts a valid input and returns the parsed value', () => {
      const input = parseValidateAnswerInputBounded({
        answerPlan: makePlan(),
        readingDraft: makeDraft(),
      });
      expect(input.readingDraft.topic).toBe('career');
      expect(validateAnswer(input).ok).toBe(true);
    });

    it('CLI: an input file above MAX_VALIDATE_ANSWER_INPUT_BYTES is rejected before reading', () => {
      mkdirSync(tmpDir, { recursive: true });
      const bigFile = join(tmpDir, 'oversized-input.json');
      // Synthetic filler only — the CLI must reject on stat() size alone.
      writeFileSync(bigFile, Buffer.alloc(MAX_VALIDATE_ANSWER_INPUT_BYTES + 1, 0x20));
      const run = spawnSync(
        process.execPath,
        [cliPath, 'validate-answer', '--input-file', bigFile],
        { encoding: 'utf8' },
      );
      expect(run.status).not.toBe(0);
      expect(`${run.stdout}${run.stderr}`).toContain('INPUT_VALIDATION_FAILED');
      expect(`${run.stdout}${run.stderr}`).toContain('MAX_VALIDATE_ANSWER_INPUT_BYTES');
    });

    it('CLI: a valid v2 input passes end-to-end through the bounded facade', () => {
      mkdirSync(tmpDir, { recursive: true });
      const okFile = join(tmpDir, 'valid-input.json');
      writeFileSync(okFile, JSON.stringify({ answerPlan: makePlan(), readingDraft: makeDraft() }));
      const run = spawnSync(
        process.execPath,
        [cliPath, 'validate-answer', '--input-file', okFile],
        { encoding: 'utf8' },
      );
      expect(run.status).toBe(0);
      expect(run.stdout).toContain('"ok": true');
      expect(run.stdout).toContain('validation-result/v2');
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
            paragraphs: [
              {
                text: '本报告仅供传统文化参考。',
                sourceFactIds: [],
                constraintRefs: [
                  { kind: 'disclaimer', index: 0 },
                  { kind: 'caveat', index: 0 },
                  { kind: 'warning', index: 0 },
                ],
              },
            ],
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

    it('caps reported violations at MAX_VIOLATIONS and flags truncation', () => {
      // 5 paragraphs x 50 unknown fact IDs would otherwise emit 250 violations.
      const draft = makeDraft({
        sections: [
          {
            id: 'summary',
            heading: '核心结论',
            paragraphs: Array.from({ length: 5 }, (_, p) => ({
              text: '合成段落。',
              sourceFactIds: Array.from({ length: 50 }, (_, i) => `bad-${p}-${i}`),
            })),
          },
        ],
      });
      const result = validateAnswer({ answerPlan: makePlan(), readingDraft: draft });
      expect(result.ok).toBe(false);
      expect(result.violations).toHaveLength(MAX_VIOLATIONS);
      expect(result.violationsTruncated).toBe(true);
    });

    it('rejects a draft whose total sourceFactIds exceed the whole-draft budget', () => {
      // 21 paragraphs x 50 allowed IDs = 1050 > MAX_TOTAL_SOURCE_FACT_IDS,
      // without breaching any per-paragraph cap.
      const draft = makeDraft({
        sections: [
          {
            id: 'summary',
            heading: '核心结论',
            paragraphs: Array.from({ length: 21 }, () => ({
              text: '合成段落。',
              sourceFactIds: Array.from({ length: 50 }, () => 'fact-1'),
            })),
          },
        ],
      });
      const result = validateAnswer({ answerPlan: makePlan(), readingDraft: draft });
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]!.patternKey).toBe('MAX_TOTAL_SOURCE_FACT_IDS');
      expect(50 * 21).toBeGreaterThan(MAX_TOTAL_SOURCE_FACT_IDS);
    });

    it('caps plan-side arrays on both the function path and the schema path', () => {
      const oversizedPlan = makePlan({
        allowedFactIds: Array.from({ length: MAX_ALLOWED_FACT_IDS + 1 }, (_, i) => `f-${i}`),
      });
      const result = validateAnswer({ answerPlan: oversizedPlan, readingDraft: makeDraft() });
      expect(result.ok).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]!.patternKey).toBe('MAX_ALLOWED_FACT_IDS');
      const parsed = ValidateAnswerInputSchema.safeParse({
        answerPlan: oversizedPlan,
        readingDraft: makeDraft(),
      });
      expect(parsed.success).toBe(false);
    });

    it('returns a single violation immediately on a top-level count breach', () => {
      // Early return: the oversized sections array is detected by its length and
      // never traversed, so exactly one violation is reported.
      const draft = makeDraft({
        sections: Array.from({ length: MAX_SECTIONS + 1 }, (_, i) => ({
          id: `s-${i}`,
          heading: '合成',
          paragraphs: [{ text: '你命中注定必死。', sourceFactIds: [] }],
        })),
      });
      const result = validateAnswer({ answerPlan: makePlan(), readingDraft: draft });
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]!.patternKey).toBe('MAX_SECTIONS');
    });
  });

  // --- R4: unified public entry + bounded errors + render-consistent scanning ---
  describe('public validateAnswer never trusts caller input (R1/R2)', () => {
    it('raw junk input is rejected with a stable result, never a crash', () => {
      const junk = {
        answerPlan: makePlan(),
        readingDraft: {
          contractVersion: 'reading-draft/v2',
          topic: 'career',
          sections: 'SYNTH-NOT-AN-ARRAY',
          caveatsExpressed: [],
          warningsDisclosed: [],
        },
      };
      const result = validateAnswer(junk);
      expect(result.ok).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]!.code).toBe('MALFORMED_INPUT');
      expect(JSON.stringify(result)).not.toContain('SYNTH-NOT-AN-ARRAY');
    });

    it('non-object and primitive inputs are rejected stably', () => {
      for (const bad of [null, 42, 'SYNTH-STRING', [], undefined]) {
        const result = validateAnswer(bad);
        expect(result.ok).toBe(false);
        expect(result.violations).toHaveLength(1);
      }
    });

    it('a negative constraintRef index is rejected as malformed', () => {
      const result = validateAnswer({
        answerPlan: makePlan(),
        readingDraft: makeDraft({
          sections: [
            {
              id: 's',
              heading: '声明',
              paragraphs: [
                {
                  text: '合成声明。',
                  sourceFactIds: [],
                  constraintRefs: [{ kind: 'caveat', index: -1 as unknown as number }],
                },
              ],
            },
          ],
        }),
      });
      expect(result.ok).toBe(false);
      expect(result.violations[0]!.code).toBe('MALFORMED_INPUT');
    });

    it('an unknown constraintRef kind is rejected and NEVER echoed in patternKey', () => {
      const result = validateAnswer({
        answerPlan: makePlan(),
        readingDraft: {
          ...makeDraft(),
          sections: [
            {
              id: 's',
              heading: '声明',
              paragraphs: [
                {
                  text: '合成声明。',
                  sourceFactIds: [],
                  constraintRefs: [{ kind: 'SYNTH-KIND-MARKER', index: 0 }],
                },
              ],
            },
          ],
        },
      });
      expect(result.ok).toBe(false);
      expect(result.violations[0]!.code).toBe('MALFORMED_INPUT');
      expect(JSON.stringify(result)).not.toContain('SYNTH-KIND-MARKER');
    });

    it('every emitted patternKey comes from a fixed closed set', () => {
      const draft = makeDraft({
        caveatsExpressed: [],
        warningsDisclosed: [],
        sections: [
          {
            id: 'summary',
            heading: '你命中注定失败的原因',
            paragraphs: [
              {
                text: '你必死。',
                sourceFactIds: ['fact-99'],
                constraintRefs: [{ kind: 'caveat', index: 9 }],
              },
            ],
          },
        ],
      });
      const result = validateAnswer({ answerPlan: makePlan(), readingDraft: draft });
      expect(result.ok).toBe(false);
      const FIXED_KEY = /^(?:[a-z-]+\.[a-z-]+|MAX_[A-Z_]+|disclaimer|caveat|warning)$/;
      for (const v of result.violations) {
        if (v.patternKey !== undefined) expect(v.patternKey).toMatch(FIXED_KEY);
      }
    });

    it('unknown fact ids are flagged even on constraint-exempt paragraphs (R2b)', () => {
      const draft = makeDraft({
        sections: [
          {
            id: 'summary',
            heading: '核心结论',
            paragraphs: [
              {
                text: '合成声明段落。',
                sourceFactIds: ['fact-99'], // unknown, provided alongside valid refs
                constraintRefs: [
                  { kind: 'disclaimer', index: 0 },
                  { kind: 'caveat', index: 0 },
                  { kind: 'warning', index: 0 },
                ],
              },
            ],
          },
        ],
      });
      const result = runValidated(makePlan(), draft);
      expect(result.ok).toBe(false);
      expect(result.violations.some((v) => v.code === 'UNKNOWN_FACT_ID')).toBe(true);
    });

    it('unknown fact ids are flagged in not-supported mode too', () => {
      const plan = makePlan({ answerability: 'not-supported', allowedFactIds: [] });
      const draft = makeDraft({
        sections: [
          {
            id: 'note',
            heading: '说明',
            paragraphs: [{ text: '简短说明。', sourceFactIds: ['fact-99'] }],
          },
        ],
      });
      const result = runValidated(plan, draft);
      expect(result.violations.some((v) => v.code === 'UNKNOWN_FACT_ID')).toBe(true);
      expect(result.violations.some((v) => v.code === 'UNSUPPORTED_TOPIC')).toBe(true);
    });
  });

  describe('bounded parser errors carry no input echo (R7)', () => {
    it('a flood of unknown keys is rejected with one static message', () => {
      const junk: Record<string, unknown> = {
        answerPlan: makePlan(),
        readingDraft: makeDraft(),
      };
      for (let i = 0; i < 1000; i++) junk[`SYNTH_KEY_${i}`] = 1;
      expect(() => parseValidateAnswerInputBounded(junk)).toThrowError(/bounded preflight/);
      try {
        parseValidateAnswerInputBounded(junk);
      } catch (err) {
        expect(String((err as Error).message)).not.toContain('SYNTH_KEY_');
      }
      const result = validateAnswer(junk);
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain('SYNTH_KEY_');
    });

    it('an over-long key name is rejected before Zod', () => {
      const junk = {
        answerPlan: makePlan(),
        readingDraft: { ...makeDraft(), ['SYNTH_' + 'k'.repeat(80)]: 1 },
      };
      const result = validateAnswer(junk);
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain('SYNTH_');
    });

    it('unknown keys within limits still fail Zod but with the static diagnostic', () => {
      const junk = {
        answerPlan: makePlan(),
        readingDraft: { ...makeDraft(), SYNTH_EXTRA_KEY: 1 },
      };
      const result = validateAnswer(junk);
      expect(result.ok).toBe(false);
      expect(result.violations[0]!.code).toBe('MALFORMED_INPUT');
      expect(JSON.stringify(result)).not.toContain('SYNTH_EXTRA_KEY');
    });

    it('illegal nesting (paragraphs not an array) is rejected stably', () => {
      const junk = {
        answerPlan: makePlan(),
        readingDraft: {
          ...makeDraft(),
          sections: [{ id: 's', heading: 'h', paragraphs: 'SYNTH-NOT-ARRAY' }],
        },
      };
      const result = validateAnswer(junk);
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain('SYNTH-NOT-ARRAY');
    });
  });

  describe('render-consistent scanning (R3/R4 encodings)', () => {
    function para(text: string) {
      return makeDraft({
        sections: [
          { id: 'summary', heading: '核心结论', paragraphs: [{ text, sourceFactIds: ['fact-1'] }] },
        ],
      });
    }

    it('decimal / hex / double-encoded numeric character references are scanned decoded', () => {
      const dec = runValidated(makePlan(), para('你命中&#27880;&#23450;失败。'));
      expect(dec.violations.some((v) => v.code === 'HIGH_RISK_DETERMINISTIC_FATE')).toBe(true);
      const hex = runValidated(makePlan(), para('命盘显示你&#x5FC5;&#x6B7B;。'));
      expect(hex.violations.some((v) => v.code === 'HIGH_RISK_LIFE_DEATH')).toBe(true);
      const dbl = runValidated(makePlan(), para('你命中&amp;#27880;&amp;#23450;失败。'));
      expect(dbl.violations.some((v) => v.code === 'HIGH_RISK_DETERMINISTIC_FATE')).toBe(true);
    });

    it('NCR evasion in a heading is caught by the same pipeline', () => {
      const draft = makeDraft({
        sections: [
          {
            id: 'summary',
            heading: '你命中&#27880;&#23450;失败的原因',
            paragraphs: [{ text: '事业方向偏向技术。', sourceFactIds: ['fact-1'] }],
          },
        ],
      });
      const result = runValidated(makePlan(), draft);
      expect(
        result.violations.some(
          (v) => v.code === 'HIGH_RISK_DETERMINISTIC_FATE' && v.field === 'heading',
        ),
      ).toBe(true);
    });

    it('English case variants and U+034F splitting are caught (paragraph and heading)', () => {
      const cased = runValidated(makePlan(), para('试着 Gaslighting 对方。'));
      expect(cased.violations.some((v) => v.code === 'HIGH_RISK_RELATIONSHIP_MANIPULATION')).toBe(
        true,
      );
      const cgj = runValidated(makePlan(), para('你命中注\u034F定失败。'));
      expect(cgj.violations.some((v) => v.code === 'HIGH_RISK_DETERMINISTIC_FATE')).toBe(true);
      const headingCase = makeDraft({
        sections: [
          {
            id: 'summary',
            heading: '关于 PUA 的建议',
            paragraphs: [{ text: '事业方向偏向技术。', sourceFactIds: ['fact-1'] }],
          },
        ],
      });
      const hc = runValidated(makePlan(), headingCase);
      expect(
        hc.violations.some(
          (v) => v.code === 'HIGH_RISK_RELATIONSHIP_MANIPULATION' && v.field === 'heading',
        ),
      ).toBe(true);
    });
  });

  describe('clause-anchored masking (R4 mask)', () => {
    it('a double-negation prefix is never masked (scanned and flagged)', () => {
      const draft = makeDraft({
        sections: [
          {
            id: 'summary',
            heading: '核心结论',
            paragraphs: [{ text: '并非不构成医疗诊断。', sourceFactIds: ['fact-1'] }],
          },
        ],
      });
      const result = runValidated(makePlan(), draft);
      expect(result.violations.some((v) => v.code === 'HIGH_RISK_MEDICAL')).toBe(true);
    });

    it('a canonical template with a short benign prefix still masks', () => {
      const masked = maskSafetyDisclaimers(normalizeSafetyText('本报告不构成医疗诊断。'));
      expect(masked).not.toContain('诊断');
    });

    it('cross-line splicing of a disclaimer is not masked and stays flagged', () => {
      const draft = makeDraft({
        sections: [
          {
            id: 'summary',
            heading: '核心结论',
            paragraphs: [{ text: '本报告不构成医疗\n诊断。', sourceFactIds: ['fact-1'] }],
          },
        ],
      });
      const result = runValidated(makePlan(), draft);
      expect(result.violations.some((v) => v.code === 'HIGH_RISK_MEDICAL')).toBe(true);
    });
  });

  describe('per-item disclaimer coverage (R5)', () => {
    it('with two plan disclaimers, referencing only one is an error for the other', () => {
      const plan = makePlan({ disclaimers: ['合成声明一。', '合成声明二。'] });
      const draft = makeDraft(); // default draft references disclaimer 0 only
      const result = runValidated(plan, draft);
      expect(result.ok).toBe(false);
      const missing = result.violations.find((v) => v.code === 'MISSING_DISCLAIMER');
      expect(missing).toBeDefined();
      expect(missing!.severity).toBe('error');
      expect(missing!.itemIndex).toBe(1);
    });

    it('referencing every plan disclaimer passes', () => {
      const plan = makePlan({ disclaimers: ['合成声明一。', '合成声明二。'] });
      const draft = makeDraft({
        sections: [
          {
            id: 'summary',
            heading: '核心结论',
            paragraphs: [{ text: '你的事业方向偏向技术。', sourceFactIds: ['fact-1'] }],
          },
          {
            id: 'disclaimer',
            heading: '信息可靠性与声明',
            paragraphs: [
              {
                text: '本报告仅供传统文化参考。',
                sourceFactIds: [],
                constraintRefs: [
                  { kind: 'disclaimer', index: 0 },
                  { kind: 'disclaimer', index: 1 },
                  { kind: 'caveat', index: 0 },
                  { kind: 'warning', index: 0 },
                ],
              },
            ],
          },
        ],
      });
      const result = runValidated(plan, draft);
      expect(result.ok).toBe(true);
    });
  });

  describe('runtime bundle exports (docs-required surface)', () => {
    it('the built engine exports the documented validate-answer surface', async () => {
      const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
      const engineUrl = new URL(
        `file:///${join(repoRoot, 'skills', 'calculate-birth-charts', 'scripts', 'dist', 'engine.mjs').replace(/\\/g, '/')}`,
      );
      const engine = (await import(engineUrl.href)) as Record<string, unknown>;
      expect(typeof engine.validateAnswer).toBe('function');
      expect(typeof engine.parseValidateAnswerInputBounded).toBe('function');
      expect(engine.READING_DRAFT_CONTRACT_VERSION).toBe('reading-draft/v2');
      expect(engine.READING_DRAFT_LEGACY_V1).toBe('reading-draft/v1');
      expect(engine.VALIDATION_RESULT_CONTRACT_VERSION).toBe('validation-result/v2');
      for (const name of [
        'MAX_VALIDATE_ANSWER_INPUT_BYTES',
        'MAX_OBJECT_KEYS',
        'MAX_OBJECT_KEY_CHARS',
        'MAX_PARAGRAPH_TEXT_CHARS',
        'MAX_SECTIONS',
        'MAX_PARAGRAPHS_PER_SECTION',
        'MAX_SOURCE_FACT_IDS_PER_PARAGRAPH',
        'MAX_CONSTRAINT_REFS_PER_PARAGRAPH',
        'MAX_TOTAL_SOURCE_FACT_IDS',
        'MAX_TOTAL_TEXT_CHARS',
        'MAX_NOT_SUPPORTED_TEXT_CHARS',
        'MAX_VIOLATIONS',
      ]) {
        expect(typeof engine[name]).toBe('number');
      }
    });

    it('CLI: junk input yields exit 2 and no echo of caller keys', () => {
      const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
      const cliPath = join(
        repoRoot,
        'skills',
        'calculate-birth-charts',
        'scripts',
        'ming-chart.mjs',
      );
      const tmpDir = join(repoRoot, '.tmp', 'validate-answer-tests');
      mkdirSync(tmpDir, { recursive: true });
      const junkFile = join(tmpDir, 'junk-input.json');
      const junk: Record<string, unknown> = {
        answerPlan: makePlan(),
        readingDraft: { ...makeDraft(), SYNTH_CLI_KEY_MARKER: 1 },
      };
      writeFileSync(junkFile, JSON.stringify(junk));
      const run = spawnSync(
        process.execPath,
        [cliPath, 'validate-answer', '--input-file', junkFile],
        {
          encoding: 'utf8',
        },
      );
      expect(run.status).toBe(2); // INPUT_VALIDATION_FAILED exit code
      const output = `${run.stdout}${run.stderr}`;
      expect(output).toContain('INPUT_VALIDATION_FAILED');
      expect(output).not.toContain('SYNTH_CLI_KEY_MARKER');
    });
  });
});
