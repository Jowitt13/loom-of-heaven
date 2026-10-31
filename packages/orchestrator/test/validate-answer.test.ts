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
} from '@loom/interpret';
import {
  MAX_ALLOWED_FACT_IDS,
  MAX_CAREER_REALITY_FACTS,
  MAX_CAREER_REALITY_STATEMENT_CHARS,
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
} from '@loom/contracts';
import type { ValidateAnswerInput } from '@loom/contracts';

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
  describe('optional user-stated career provenance (synthetic only)', () => {
    const context = () => ({
      confirmedFacts: [
        {
          factId: 'career-fact:role',
          source: 'user-stated' as const,
          confirmedByUser: true as const,
          category: 'current-role' as const,
          statement: '合成示例：目前做项目交付，需求反复，希望节奏稳定。',
        },
      ],
      transient: true as const,
      noPersistence: true as const,
    });
    const realityDraft = (text = '需求反复时，可以先和需求方确认变更入口与排期规则。') =>
      makeDraft({
        sections: [
          {
            id: 'body',
            heading: '',
            paragraphs: [
              {
                text,
                sourceFactIds: [],
                realitySource: { layer: 'career-reality', factIds: ['career-fact:role'] },
              },
            ],
          },
        ],
        caveatsExpressed: [],
        warningsDisclosed: [],
      });
    const envelope = () => ({
      answerPlan: makePlan({ requiredCaveats: [], requiredWarningCodes: [] }),
      readingDraft: realityDraft(),
      careerReality: context(),
    });

    it('accepts R-only advice without a borrowed chart fact or constraint exemption', () => {
      const input = envelope();
      expect(ValidateAnswerInputSchema.safeParse(input).success).toBe(true);
      expect(validateAnswer(input)).toEqual({
        contractVersion: 'validation-result/v2',
        ok: true,
        violations: [],
        violationsTruncated: false,
      });
      expect(JSON.stringify(validateAnswer(input))).not.toContain(
        input.careerReality.confirmedFacts[0]!.statement,
      );
    });

    it('keeps chart and reality paragraphs adjacent but independently sourced', () => {
      const input = envelope();
      input.answerPlan.requiredCaveats = ['仅作传统文化参考，不是职业预言。'];
      input.readingDraft.sections.push({
        id: 'culture',
        heading: '',
        paragraphs: [
          {
            text: '七杀传统上常联到权威、压力、竞争，仅作文化参考，不是职业预言。',
            sourceFactIds: ['fact-1'],
            constraintRefs: [{ kind: 'caveat', index: 0 }],
          },
        ],
      });
      input.readingDraft.caveatsExpressed = input.answerPlan.requiredCaveats;
      expect(validateAnswer(input).ok).toBe(true);
      input.readingDraft.caveatsExpressed = [];
      input.readingDraft.sections.pop();
      expect(
        validateAnswer(input).violations.some((v) => v.code === 'MISSING_REQUIRED_CAVEAT'),
      ).toBe(true);
    });

    it('rejects missing context, unresolved references and an empty source', () => {
      const input = envelope();
      expect(
        validateAnswer({
          answerPlan: input.answerPlan,
          readingDraft: input.readingDraft,
        }).violations.some((v) => v.code === 'UNKNOWN_FACT_ID'),
      ).toBe(true);
      input.readingDraft.sections[0]!.paragraphs[0]!.realitySource!.factIds = [
        'career-fact:missing',
      ];
      expect(
        validateAnswer(input).violations.some(
          (v) => v.code === 'UNKNOWN_FACT_ID' && v.patternKey === 'career-reality.factIds',
        ),
      ).toBe(true);
      input.readingDraft.sections[0]!.paragraphs[0]!.realitySource!.factIds = [];
      expect(validateAnswer(input).violations[0]!.code).toBe('MALFORMED_INPUT');
    });

    it('does not let an unused context exempt unsupported birth-only prose', () => {
      const input = envelope();
      delete input.readingDraft.sections[0]!.paragraphs[0]!.realitySource;
      expect(validateAnswer(input).violations.some((v) => v.code === 'MISSING_SOURCE_FACTS')).toBe(
        true,
      );
    });

    it('rejects mixed R/chart and R/constraint paragraphs', () => {
      const input = envelope();
      const paragraph = input.readingDraft.sections[0]!.paragraphs[0]!;
      paragraph.sourceFactIds = ['fact-1'];
      expect(
        validateAnswer(input).violations.some(
          (v) => v.patternKey === 'career-reality.single-layer',
        ),
      ).toBe(true);
      paragraph.sourceFactIds = ['fact-999'];
      expect(validateAnswer(input).violations.some((v) => v.code === 'UNKNOWN_FACT_ID')).toBe(true);
      paragraph.sourceFactIds = [];
      paragraph.constraintRefs = [{ kind: 'disclaimer', index: 0 }];
      expect(
        validateAnswer(input).violations.some(
          (v) => v.patternKey === 'career-reality.single-layer',
        ),
      ).toBe(true);
    });

    it('rejects unconfirmed, inferred, duplicate, unknown-layer and injected source records', () => {
      for (const patch of [
        { confirmedByUser: false },
        { source: 'chart-derived' },
        { category: 'diagnosis' },
        { score: 20 },
        { bazi: {} },
        { statement: '   ' },
      ]) {
        const input = envelope();
        Object.assign(input.careerReality.confirmedFacts[0]!, patch);
        expect(validateAnswer(input).violations[0]!.code).toBe('MALFORMED_INPUT');
      }
      const duplicate = envelope();
      duplicate.careerReality.confirmedFacts.push({
        ...duplicate.careerReality.confirmedFacts[0]!,
      });
      expect(validateAnswer(duplicate).violations[0]!.code).toBe('MALFORMED_INPUT');
      const layer = envelope();
      Object.assign(layer.readingDraft.sections[0]!.paragraphs[0]!.realitySource!, {
        layer: 'traditional-structure',
      });
      expect(validateAnswer(layer).violations[0]!.code).toBe('MALFORMED_INPUT');
    });

    it('rejects non-career contexts even if their references resolve', () => {
      const input = envelope();
      input.answerPlan.request.topic = 'wealth';
      input.readingDraft.topic = 'wealth';
      expect(validateAnswer(input).violations.some((v) => v.code === 'GUARDRAIL_VIOLATED')).toBe(
        true,
      );
    });

    it('keeps high-risk and markup checks active for reality advice', () => {
      for (const [text, code] of [
        ['建议买入股票，保证赚不赔。', 'HIGH_RISK_INVESTMENT'],
        ['你命中注定不可能成功。', 'HIGH_RISK_DETERMINISTIC_FATE'],
        ['根据这些情况，建议服药治疗抑郁症。', 'HIGH_RISK_MEDICAL'],
        ['<b>建议</b>', 'CONTAINS_MARKUP'],
      ]) {
        const input = envelope();
        input.readingDraft = realityDraft(text);
        expect(validateAnswer(input).violations.some((v) => v.code === code)).toBe(true);
      }
    });

    it('does not let unsupported chart inference veto independently grounded reality discussion', () => {
      const input = envelope();
      input.answerPlan.answerability = 'not-supported';
      input.answerPlan.allowedFactIds = [];
      input.readingDraft = realityDraft('合成现实讨论。'.repeat(80));
      expect(validateAnswer(input).ok).toBe(true);
      input.readingDraft.sections[0]!.paragraphs[0]!.realitySource!.factIds = [
        'career-fact:missing',
      ];
      expect(validateAnswer(input).violations.some((v) => v.code === 'UNSUPPORTED_TOPIC')).toBe(
        true,
      );
    });

    it('bounds source records and counts reality references in the shared whole-draft budget', () => {
      const input = envelope();
      input.careerReality.confirmedFacts[0]!.statement = '安'.repeat(
        MAX_CAREER_REALITY_STATEMENT_CHARS + 1,
      );
      expect(validateAnswer(input).violations[0]!.patternKey).toBe(
        'MAX_CAREER_REALITY_STATEMENT_CHARS',
      );
      const many = envelope();
      many.careerReality.confirmedFacts = Array.from(
        { length: MAX_CAREER_REALITY_FACTS + 1 },
        (_, i) => ({ ...context().confirmedFacts[0]!, factId: `career-fact:f-${i}` }),
      );
      expect(validateAnswer(many).violations[0]!.patternKey).toBe('MAX_CAREER_REALITY_FACTS');
      const budget = envelope();
      const paragraph = budget.readingDraft.sections[0]!.paragraphs[0]!;
      paragraph.realitySource!.factIds = Array.from({ length: 24 }, (_, i) => `career-fact:f-${i}`);
      budget.readingDraft.sections[0]!.paragraphs = Array.from({ length: 42 }, () =>
        structuredClone(paragraph),
      );
      expect(validateAnswer(budget).violations[0]!.patternKey).toBe('MAX_TOTAL_SOURCE_FACT_IDS');
    });

    it('never echoes private source values or invokes a source getter', () => {
      const input = envelope();
      const sentinel = 'SYNTHETIC-PRIVATE-REALITY-SENTINEL';
      input.careerReality.confirmedFacts[0]!.statement = sentinel;
      input.readingDraft.sections[0]!.paragraphs[0]!.realitySource!.factIds = [
        'career-fact:unknown-sentinel',
      ];
      expect(JSON.stringify(validateAnswer(input))).not.toContain(sentinel);
      let reads = 0;
      Object.defineProperty(input.careerReality.confirmedFacts[0]!, 'statement', {
        get: () => {
          reads++;
          throw new Error(sentinel);
        },
      });
      const result = validateAnswer(input);
      expect(result.violations[0]!.code).toBe('MALFORMED_INPUT');
      expect(reads).toBe(0);
      expect(JSON.stringify(result)).not.toContain(sentinel);
    });

    it('rejects persistence flags and duplicate paragraph references', () => {
      const input = envelope();
      Object.assign(input.careerReality, { noPersistence: false });
      expect(validateAnswer(input).violations[0]!.code).toBe('MALFORMED_INPUT');
      const repeated = envelope();
      repeated.readingDraft.sections[0]!.paragraphs[0]!.realitySource!.factIds.push(
        'career-fact:role',
      );
      expect(validateAnswer(repeated).violations[0]!.code).toBe('MALFORMED_INPUT');
    });

    it('rejects traditional terms smuggled into an R-only paragraph or heading', () => {
      const input = envelope();
      input.readingDraft = realityDraft('按七杀的配置，你应该选择高竞争岗位。');
      expect(
        validateAnswer(input).violations.some(
          (v) => v.patternKey === 'career-reality.traditional-content',
        ),
      ).toBe(true);
      input.readingDraft = realityDraft('本命盘不构成医疗诊断。');
      expect(
        validateAnswer(input).violations.some(
          (v) => v.patternKey === 'career-reality.traditional-content',
        ),
      ).toBe(true);
      input.readingDraft = realityDraft();
      input.readingDraft.sections[0]!.heading = '八字事业建议';
      expect(
        validateAnswer(input).violations.some(
          (v) => v.patternKey === 'career-reality.traditional-content',
        ),
      ).toBe(true);
    });

    it('validates the optional context through the real bundled CLI without echoing it', () => {
      const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
      const temp = join(root, '.tmp', 'validate-answer-tests');
      mkdirSync(temp, { recursive: true });
      const inputFile = join(temp, 'synthetic-career-reality.json');
      const input = envelope();
      writeFileSync(inputFile, JSON.stringify(input));
      const run = spawnSync(
        process.execPath,
        [
          join(root, 'skills/xuan-ji-yu-heng/scripts/loom-chart.mjs'),
          'validate-answer',
          '--input-file',
          inputFile,
        ],
        { encoding: 'utf8' },
      );
      expect(run.status).toBe(0);
      expect(JSON.parse(run.stdout).ok).toBe(true);
      expect(`${run.stdout}${run.stderr}`).not.toContain(
        input.careerReality.confirmedFacts[0]!.statement,
      );
    });
  });
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

    it('V1: does not force plan disclaimers into an ordinary visible draft', () => {
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
      const result = validateAnswer({
        answerPlan: makePlan({ requiredCaveats: [], requiredWarningCodes: [] }),
        readingDraft: draft,
      });
      expect(result.ok).toBe(true);
      expect(result.violations.some((v) => v.code === 'MISSING_DISCLAIMER')).toBe(false);
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

    it('normalizeSafetyText strips default-ignorable code points, folds NFKC, case and CJK splits', () => {
      expect(normalizeSafetyText('注\u200B定')).toBe('注定');
      expect(normalizeSafetyText('ＰＵＡ')).toBe('pua'); // NFKC + case fold
      expect(normalizeSafetyText('注 定')).toBe('注定');
      expect(normalizeSafetyText('注-定')).toBe('注定');
      expect(normalizeSafetyText('必\u00A0\u3000死')).toBe('必死');
      expect(normalizeSafetyText('注\u034F定')).toBe('注定'); // U+034F CGJ is ignorable
      // NCR is no longer decoded (plain-text contract); test that raw & survives
      expect(normalizeSafetyText('&')).toBe('&');
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
    const cliPath = join(repoRoot, 'skills', 'xuan-ji-yu-heng', 'scripts', 'loom-chart.mjs');
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

    it('unknown keys within limits are silently dropped by projection (no Zod echo)', () => {
      const junk = {
        answerPlan: makePlan(),
        readingDraft: { ...makeDraft(), SYNTH_EXTRA_KEY: 1 },
      };
      // The whitelist projection drops unknown fields before Zod runs, so this
      // input is now valid (the extra key is never seen by Zod or the validator).
      const result = validateAnswer(junk);
      expect(result.ok).toBe(true);
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

  describe('plain-text contract rejects markup (R5 CONTAINS_MARKUP)', () => {
    function para(text: string) {
      return makeDraft({
        sections: [
          { id: 'summary', heading: '核心结论', paragraphs: [{ text, sourceFactIds: ['fact-1'] }] },
        ],
      });
    }

    it('HTML entities (with and without semicolon, named and numeric) are rejected', () => {
      for (const text of [
        '合成&amp;合成',
        '含&#27880;实体。',
        '含&#x6CE8;实体。',
        '含&#27880实体',
        '含&amp;#27880;嵌套。',
        '含&nbsp空格',
      ]) {
        const result = runValidated(makePlan(), para(text));
        expect(
          result.violations.some((v) => v.code === 'CONTAINS_MARKUP'),
          `should reject: ${text}`,
        ).toBe(true);
      }
    });

    it('HTML tags and comments are rejected', () => {
      for (const text of ['<b>合成</b>', '<!-- 合成注释 -->']) {
        const result = runValidated(makePlan(), para(text));
        expect(
          result.violations.some((v) => v.code === 'CONTAINS_MARKUP'),
          `should reject: ${text}`,
        ).toBe(true);
      }
    });

    it('inline Markdown links and images are rejected', () => {
      for (const text of [
        '[合成链接](http://example.com)',
        '![合成图片](http://example.com/img.png)',
      ]) {
        const result = runValidated(makePlan(), para(text));
        expect(
          result.violations.some((v) => v.code === 'CONTAINS_MARKUP'),
          `should reject: ${text}`,
        ).toBe(true);
      }
    });

    it('reference-style Markdown links/images are rejected (R5-fix regression)', () => {
      for (const text of ['[合成][ref-id]', '![合成图片][img-id]']) {
        const result = runValidated(makePlan(), para(text));
        expect(
          result.violations.some((v) => v.code === 'CONTAINS_MARKUP'),
          `should reject ref-link: ${text}`,
        ).toBe(true);
      }
    });

    it('code spans (backticks) are rejected (R5-fix regression)', () => {
      const result = runValidated(makePlan(), para('你命中`注定`失败。'));
      expect(result.violations.some((v) => v.code === 'CONTAINS_MARKUP')).toBe(true);
    });

    it('emphasis, strikethrough, escape, table, heading chars are rejected', () => {
      for (const text of [
        '*合成加粗*',
        '__合成斜体__',
        '~~合成删除~~',
        '\\转义',
        '| 合成表格 |',
        '# 合成标题',
      ]) {
        const result = runValidated(makePlan(), para(text));
        expect(
          result.violations.some((v) => v.code === 'CONTAINS_MARKUP'),
          `should reject: ${text}`,
        ).toBe(true);
      }
    });

    it('heading field is also checked', () => {
      const draft = makeDraft({
        sections: [
          {
            id: 'summary',
            heading: '含&nbsp;的标题',
            paragraphs: [{ text: '纯文本。', sourceFactIds: ['fact-1'] }],
          },
        ],
      });
      const result = runValidated(makePlan(), draft);
      expect(
        result.violations.some((v) => v.code === 'CONTAINS_MARKUP' && v.field === 'heading'),
      ).toBe(true);
    });

    it('full-width equivalents do NOT trigger (Chinese punctuation is allowed)', () => {
      const result = runValidated(
        makePlan(),
        para(
          '你的事业方向偏向技术与创意结合的领域，2026年偏向好转。【核心结论】（参考）＞趋势 Test＆plain～',
        ),
      );
      expect(result.violations.some((v) => v.code === 'CONTAINS_MARKUP')).toBe(false);
    });

    it('compliant plain text passes', () => {
      const result = runValidated(
        makePlan(),
        para('你的事业方向偏向技术与创意结合的领域，2026年偏向好转。 Test plain text.'),
      );
      expect(result.violations.some((v) => v.code === 'CONTAINS_MARKUP')).toBe(false);
    });
  });

  describe('default-ignorable Unicode property (R5)', () => {
    function para(text: string) {
      return makeDraft({
        sections: [
          { id: 'summary', heading: '核心结论', paragraphs: [{ text, sourceFactIds: ['fact-1'] }] },
        ],
      });
    }

    it('U+2061, U+180B, U+E0100, U+E0020 are stripped so keywords are still caught', () => {
      // U+2061 FUNCTION APPLICATION
      const r1 = runValidated(makePlan(), para('你命中注\u2061定失败。'));
      expect(r1.violations.some((v) => v.code === 'HIGH_RISK_DETERMINISTIC_FATE')).toBe(true);
      // U+180B MONGOLIAN FREE VARIATION SELECTOR ONE
      const r2 = runValidated(makePlan(), para('你命中注\u180B定失败。'));
      expect(r2.violations.some((v) => v.code === 'HIGH_RISK_DETERMINISTIC_FATE')).toBe(true);
      // U+E0100 VARIATION SELECTOR-17 (supplementary plane)
      const r3 = runValidated(makePlan(), para(`你命中注${String.fromCodePoint(0xe0100)}定失败。`));
      expect(r3.violations.some((v) => v.code === 'HIGH_RISK_DETERMINISTIC_FATE')).toBe(true);
      // U+E0020 TAG SPACE
      const r4 = runValidated(makePlan(), para(`你命中注${String.fromCodePoint(0xe0020)}定失败。`));
      expect(r4.violations.some((v) => v.code === 'HIGH_RISK_DETERMINISTIC_FATE')).toBe(true);
    });

    it('default-ignorable in heading is also stripped', () => {
      const draft = makeDraft({
        sections: [
          {
            id: 'summary',
            heading: '关于 P\u2061UA 的建议',
            paragraphs: [{ text: '事业方向偏向技术。', sourceFactIds: ['fact-1'] }],
          },
        ],
      });
      const hc = runValidated(makePlan(), draft);
      expect(
        hc.violations.some(
          (v) => v.code === 'HIGH_RISK_RELATIONSHIP_MANIPULATION' && v.field === 'heading',
        ),
      ).toBe(true);
    });
  });

  describe('case-fold and splitting still work (migrated from R4)', () => {
    function para(text: string) {
      return makeDraft({
        sections: [
          { id: 'summary', heading: '核心结论', paragraphs: [{ text, sourceFactIds: ['fact-1'] }] },
        ],
      });
    }

    it('English case variants and U+034F splitting are caught', () => {
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

  describe('optional disclaimer references (V1)', () => {
    it('with two plan disclaimers, a default draft need not render either one', () => {
      const plan = makePlan({ disclaimers: ['合成声明一。', '合成声明二。'] });
      const draft = makeDraft(); // optional disclosure may reference one, but need not cover all
      const result = runValidated(plan, draft);
      expect(result.ok).toBe(true);
      expect(result.violations.some((v) => v.code === 'MISSING_DISCLAIMER')).toBe(false);
    });

    it('permits an explicitly requested technical disclosure to reference plan disclaimers', () => {
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
    // Importing the post-build 3 MB bundle can exceed Vitest's 5 s default while
    // the full suite is concurrently exercising real ZIP and host-package builds.
    // This keeps the existing assertions intact and bounds this I/O-heavy check.
    it('the built engine exports the documented validate-answer surface', async () => {
      const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
      const engineUrl = new URL(
        `file:///${join(repoRoot, 'skills', 'xuan-ji-yu-heng', 'scripts', 'dist', 'engine.mjs').replace(/\\/g, '/')}`,
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
        'MAX_CAREER_REALITY_FACTS',
        'MAX_CAREER_REALITY_STATEMENT_CHARS',
        'MAX_TOTAL_TEXT_CHARS',
        'MAX_NOT_SUPPORTED_TEXT_CHARS',
        'MAX_VIOLATIONS',
      ]) {
        expect(typeof engine[name]).toBe('number');
      }
    }, 30_000);

    it('CLI: structurally invalid input yields exit != 0 and no echo of caller keys', () => {
      const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
      const cliPath = join(repoRoot, 'skills', 'xuan-ji-yu-heng', 'scripts', 'loom-chart.mjs');
      const tmpDir = join(repoRoot, '.tmp', 'validate-answer-tests');
      mkdirSync(tmpDir, { recursive: true });
      const junkFile = join(tmpDir, 'junk-input.json');
      // Structurally invalid: sections is a string, not an array.
      const junk = {
        answerPlan: makePlan(),
        readingDraft: {
          contractVersion: 'reading-draft/v2',
          topic: 'career',
          sections: 'SYNTH_CLI_KEY_MARKER',
          caveatsExpressed: [],
          warningsDisclosed: [],
        },
      };
      writeFileSync(junkFile, JSON.stringify(junk));
      const run = spawnSync(
        process.execPath,
        [cliPath, 'validate-answer', '--input-file', junkFile],
        {
          encoding: 'utf8',
        },
      );
      expect(run.status).not.toBe(0); // not ok: malformed input or validation failure
      const output = `${run.stdout}${run.stderr}`;
      expect(output).not.toContain('SYNTH_CLI_KEY_MARKER');
    });
  });

  // --- R5: Proxy/getter/inherit safety, complete preflight, whitelist masking ---
  describe('Proxy / getter / inherited-property safety (R5)', () => {
    it('a Proxy input yields MALFORMED_INPUT without crash or echo', () => {
      const trapped = new Proxy(
        {},
        {
          get() {
            throw new Error('SYNTH_PROXY_TRAP');
          },
        },
      );
      const result = validateAnswer(trapped);
      expect(result.ok).toBe(false);
      expect(result.violations[0]!.code).toBe('MALFORMED_INPUT');
      expect(JSON.stringify(result)).not.toContain('SYNTH_PROXY_TRAP');
    });

    it('a getter-on-prototype object yields MALFORMED_INPUT', () => {
      const proto = {
        get readingDraft(): never {
          throw new Error('SYNTH_GETTER');
        },
      };
      const obj = Object.create(proto);
      obj.answerPlan = makePlan();
      const result = validateAnswer(obj);
      expect(result.ok).toBe(false);
      expect(result.violations[0]!.code).toBe('MALFORMED_INPUT');
      expect(JSON.stringify(result)).not.toContain('SYNTH_GETTER');
    });

    it('inherited (non-own) sections rejects with MALFORMED_INPUT', () => {
      const proto = { sections: [{ id: 's', heading: 'h', paragraphs: [] }] };
      const draft = Object.create(proto);
      draft.contractVersion = 'reading-draft/v2';
      draft.topic = 'career';
      draft.caveatsExpressed = [];
      draft.warningsDisclosed = [];
      const input = { answerPlan: makePlan(), readingDraft: draft };
      const result = validateAnswer(input);
      expect(result.ok).toBe(false);
      // sections is on prototype, not own — requireOwnField rejects it.
      expect(result.violations[0]!.code).toBe('MALFORMED_INPUT');
    });
  });

  describe('complete bounded precheck (R5)', () => {
    it('missing plan.request rejects with MALFORMED_INPUT', () => {
      const plan = { ...makePlan() } as Record<string, unknown>;
      delete plan.request;
      const result = validateAnswer({ answerPlan: plan, readingDraft: makeDraft() });
      expect(result.ok).toBe(false);
      expect(result.violations[0]!.code).toBe('MALFORMED_INPUT');
    });

    it('plan.request.topic too long rejects with MALFORMED_INPUT', () => {
      const plan = makePlan();
      (plan as Record<string, unknown>).request = { topic: 'x'.repeat(51) };
      const result = validateAnswer({ answerPlan: plan, readingDraft: makeDraft() });
      expect(result.ok).toBe(false);
      expect(result.violations[0]!.code).toBe('MALFORMED_INPUT');
    });

    it('guardrails containing a non-string rejects with MALFORMED_INPUT', () => {
      const plan = makePlan();
      (plan.guardrails as unknown[]).push(12345);
      const result = validateAnswer({ answerPlan: plan, readingDraft: makeDraft() });
      expect(result.ok).toBe(false);
      expect(result.violations[0]!.code).toBe('MALFORMED_INPUT');
    });

    it('guardrails containing an over-length string rejects with MALFORMED_INPUT', () => {
      const plan = makePlan();
      (plan.guardrails as unknown[]).push('g'.repeat(65));
      const result = validateAnswer({ answerPlan: plan, readingDraft: makeDraft() });
      expect(result.ok).toBe(false);
      expect(result.violations[0]!.code).toBe('MALFORMED_INPUT');
    });
  });

  describe('whitelist-prefix disclaimer masking (R5)', () => {
    function textDraft(text: string) {
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

    it('authority/conclusion prefix + canonical template is NOT masked (flagged)', () => {
      for (const prefix of ['我确认', '研究表明', '权威指出', '经确认']) {
        const result = runValidated(makePlan(), textDraft(`${prefix}不构成医疗诊断。`));
        expect(
          result.violations.some((v) => v.code === 'HIGH_RISK_MEDICAL'),
          `should flag: ${prefix}不构成...`,
        ).toBe(true);
      }
    });

    it('whitelisted prefix + canonical template IS masked (passes)', () => {
      for (const prefix of ['本报告', '本内容', '本解读', '本分析', '本命盘解读']) {
        const result = runValidated(makePlan(), textDraft(`${prefix}不构成医疗诊断。`));
        expect(
          result.violations.some((v) => v.code === 'HIGH_RISK_MEDICAL'),
          `should pass: ${prefix}不构成...`,
        ).toBe(false);
      }
    });

    it('empty prefix (clause start) IS masked (passes)', () => {
      const result = runValidated(makePlan(), textDraft('不构成医疗诊断，'));
      expect(result.violations.some((v) => v.code === 'HIGH_RISK_MEDICAL')).toBe(false);
    });
  });
});

describe('reading-draft/v3 limited presentation subset (scope+presentation plan §3)', () => {
  function v3Draft(opts: {
    heading?: string;
    text: string;
    facts?: string[];
    refs?: Array<{ kind: 'caveat' | 'warning' | 'disclaimer'; index: number }>;
  }) {
    return makeDraft({
      contractVersion: 'reading-draft/v3',
      sections: [
        {
          id: 'body',
          heading: opts.heading ?? '## 核心结论',
          paragraphs: [
            {
              text: opts.text,
              sourceFactIds: opts.facts ?? ['fact-1'],
              ...(opts.refs ? { constraintRefs: opts.refs } : {}),
            },
          ],
        },
      ],
      caveatsExpressed: [],
      warningsDisclosed: [],
    });
  }

  it('accepts a ## short heading, paired emphasis, a bullet line and newlines', () => {
    const result = runValidated(
      makePlan({ requiredCaveats: [], requiredWarningCodes: [] }),
      v3Draft({
        heading: '## 命宫里的两种侧重',
        text: '这张盘的底色是**果决与执行**并存。\n- 武曲：刚毅果决、善于理财与执行\n- 破军：变动性强、敢于破旧立新',
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('accepts a ### heading and plain text without any marker', () => {
    const result = runValidated(
      makePlan({ requiredCaveats: [], requiredWarningCodes: [] }),
      v3Draft({ heading: '### 小结', text: '两种侧重并存，星性本身没有回答偏好哪一侧。' }),
    );
    expect(result.ok).toBe(true);
  });

  it('rejects # and #### level headings and multi-line headings', () => {
    for (const heading of ['# 核心结论', '#### 核心结论', '## 核心结论\n第二行']) {
      const result = runValidated(makePlan(), v3Draft({ heading, text: '合成正文。' }));
      expect(
        result.violations.some((v) => v.code === 'CONTAINS_MARKUP' && v.field === 'heading'),
        `should reject heading: ${JSON.stringify(heading)}`,
      ).toBe(true);
    }
  });

  it('rejects unclosed, empty, nested, cross-line and stray emphasis', () => {
    for (const text of [
      '这是**未闭合的强调。',
      '空的**  **强调。',
      '嵌套的**a*b**强调。',
      '跨行的**强调\n继续**。',
      '单个*星号。',
    ]) {
      const result = runValidated(makePlan(), v3Draft({ text }));
      expect(
        result.violations.some((v) => v.code === 'CONTAINS_MARKUP' && v.field === 'paragraph'),
        `should reject text: ${JSON.stringify(text)}`,
      ).toBe(true);
    }
  });

  it('rejects HTML, entities, links, images, code and other unsupported structures in v3', () => {
    for (const text of [
      '合成<b>标签</b>。',
      '合成&amp;实体。',
      '[合成链接](http://example.com)',
      '`代码`片段。',
      '表格|分隔|符。',
      '下划线_强调_。',
      '删除~~线~~。',
      '井号#标题行。',
    ]) {
      const result = runValidated(makePlan(), v3Draft({ text }));
      expect(
        result.violations.some((v) => v.code === 'CONTAINS_MARKUP'),
        `should reject v3 text: ${text}`,
      ).toBe(true);
    }
  });

  it('scans the VISIBLE text so markers cannot split a banned phrase', () => {
    const split = runValidated(makePlan(), v3Draft({ text: '这份盘读作注**定**短命。' }));
    expect(split.violations.some((v) => v.code === 'HIGH_RISK_LIFE_DEATH')).toBe(true);
    const plain = runValidated(makePlan(), v3Draft({ text: '这份盘读作注定短命。' }));
    expect(plain.violations.some((v) => v.code === 'HIGH_RISK_LIFE_DEATH')).toBe(true);
  });

  it('scans bullet lines and headings for banned phrases', () => {
    const bullet = runValidated(
      makePlan(),
      v3Draft({ text: '两个要点：\n- 建议买入股票\n- 保持关注' }),
    );
    expect(bullet.violations.some((v) => v.code === 'HIGH_RISK_INVESTMENT')).toBe(true);
    const heading = runValidated(
      makePlan(),
      v3Draft({ heading: '## 注定孤独终老', text: '合成正文。' }),
    );
    expect(heading.violations.some((v) => v.code === 'HIGH_RISK_LIFE_DEATH')).toBe(true);
  });

  it('does not widen the disclaimer mask for marked-up text', () => {
    const masked = runValidated(
      makePlan(),
      v3Draft({ text: '本报告不构成医疗诊断，**其余照常**。' }),
    );
    expect(masked.violations.some((v) => v.code === 'HIGH_RISK_MEDICAL')).toBe(false);
    const unmasked = runValidated(makePlan(), v3Draft({ text: '**我确认**这是医疗诊断。' }));
    expect(unmasked.violations.some((v) => v.code === 'HIGH_RISK_MEDICAL')).toBe(true);
  });

  it('v2 keeps its original plain-text rule: markdown allowed in v3 is rejected in v2', () => {
    for (const [heading, text] of [
      ['## 核心结论', '合成正文。'],
      ['核心结论', '这是**加粗**正文。'],
    ] as const) {
      const result = runValidated(
        makePlan(),
        makeDraft({
          sections: [{ id: 'summary', heading, paragraphs: [{ text, sourceFactIds: ['fact-1'] }] }],
        }),
      );
      expect(
        result.violations.some((v) => v.code === 'CONTAINS_MARKUP'),
        `v2 should reject: ${heading} / ${text}`,
      ).toBe(true);
    }
  });

  it('v1 remains rejected beside v2/v3 (no runtime downgrade)', () => {
    const v1Draft = { ...makeDraft(), contractVersion: 'reading-draft/v1' };
    expect(() =>
      ValidateAnswerInputSchema.parse({ answerPlan: makePlan(), readingDraft: v1Draft }),
    ).toThrow();
    const publicResult = validateAnswer({
      answerPlan: makePlan(),
      readingDraft: v1Draft,
    });
    expect(publicResult.violations[0]!.code).toBe('UNSUPPORTED_CONTRACT_VERSION');
  });

  it('rejects indented code blocks, nested bullets and thematic breaks in v3 (narrow fix)', () => {
    for (const text of [
      '    这张盘的分类只作概念说明。',
      '正文一行。\n    四空格缩进的码块。',
      '正文一行。\n\t制表符缩进的码块。',
      '- 第一层\n  - 第二层',
      '- 第一层\n    - 深层嵌套',
      '正文一行。\n---',
      '正文一行。\n- - -',
    ]) {
      const result = runValidated(makePlan(), v3Draft({ text }));
      expect(
        result.violations.some((v) => v.code === 'CONTAINS_MARKUP'),
        `should reject v3 text: ${JSON.stringify(text)}`,
      ).toBe(true);
    }
  });

  it('rejects CR-based multi-line headings and CR-crossing emphasis in v3 (narrow fix)', () => {
    const headingResult = runValidated(
      makePlan(),
      v3Draft({ heading: '## 第一行\r第二行', text: '合成正文。' }),
    );
    expect(
      headingResult.violations.some((v) => v.code === 'CONTAINS_MARKUP' && v.field === 'heading'),
    ).toBe(true);
    const emphasisResult = runValidated(makePlan(), v3Draft({ text: '**第一行\r第二行**' }));
    expect(emphasisResult.violations.some((v) => v.code === 'CONTAINS_MARKUP')).toBe(true);
  });

  it('still accepts plain soft-wrap continuations and simple bullets in v3', () => {
    const result = runValidated(
      makePlan({ requiredCaveats: [], requiredWarningCodes: [] }),
      v3Draft({
        text: '这是一段较长的说明文字，\n  换行后延续同一句，仍然是普通正文。\n- 顶层要点一\n- 顶层要点二',
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('rejects setext underlines, ordered/plus lists and nested ordered lists (grammar fix)', () => {
    for (const text of [
      '普通说明\n===',
      '普通说明\n--',
      '普通说明\n=',
      '1. 第一项\n2. 第二项',
      '9) 另一种有序写法',
      '+ 第一项\n+ 第二项',
      '- 第一层\n  1. 第二层',
      '正文一行。\n  + 缩进的加号要点',
    ]) {
      const result = runValidated(makePlan(), v3Draft({ text }));
      expect(
        result.violations.some((v) => v.code === 'CONTAINS_MARKUP'),
        `should reject v3 text: ${JSON.stringify(text)}`,
      ).toBe(true);
    }
  });

  it('rejects indented plain headings (they render as code blocks)', () => {
    const result = runValidated(
      makePlan(),
      v3Draft({ heading: '    普通标题', text: '合成正文。' }),
    );
    expect(
      result.violations.some((v) => v.code === 'CONTAINS_MARKUP' && v.field === 'heading'),
    ).toBe(true);
  });

  it('does not mistake prose numbers, plus signs or dashes for list structures', () => {
    const result = runValidated(
      makePlan({ requiredCaveats: [], requiredWarningCodes: [] }),
      v3Draft({
        text: '增长 1.5 倍的说明。\n+86 开头的号码写法。\n-3 度的温差。\n  2027 年的计划从 1 月开始。',
      }),
    );
    expect(result.ok).toBe(true);
    const plainHeading = runValidated(
      makePlan({ requiredCaveats: [], requiredWarningCodes: [] }),
      v3Draft({ heading: '2027 年的规划', text: '合成正文。' }),
    );
    expect(plainHeading.ok).toBe(true);
  });
});
