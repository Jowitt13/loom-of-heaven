/**
 * validate-answer — deterministic, offline fact-boundary and safety validator (P0).
 *
 * Checks a host-produced structured ReadingDraft against the AnswerPlan to ensure:
 * 1. Every paragraph cites sourceFactIds that exist in allowedFactIds.
 * 2. The draft does not cross topic boundaries.
 * 3. High-risk expressions (medical, legal, investment, fate, life-death, manipulation) are blocked.
 * 4. All required caveats and warnings from the AnswerPlan are expressed.
 * 5. No unsourced conclusions appear.
 *
 * This is the SAFETY layer; lint-reading remains the LANGUAGE QUALITY layer.
 */

import type {
  AnswerValidationResult,
  AnswerViolation,
  ValidateAnswerInput,
  ViolationCode,
} from '@ming/contracts';
import { VALIDATION_RESULT_CONTRACT_VERSION } from '@ming/contracts';

// --- High-risk expression patterns ---

/** Medical diagnosis or treatment advice. */
const MEDICAL_PATTERNS: RegExp[] = [
  /(?:确诊|诊断|患有|得了|治疗|服药|用药|手术|处方|化疗|放疗|抗生素|止痛药)/,
  /(?:建议(?:去|到|看|找|就)(?:医|诊|院|科))/,
  /(?:你(?:有|得了?|患了?|是)(?:抑郁|焦虑|癌|肿瘤|糖尿|心脏))/,
  /(?:停药|减药|加药|换药)/,
  /(?:需要做(?:检查|化验|CT|MRI|B超|手术))/,
];

/** Legal conclusions or advice. */
const LEGAL_PATTERNS: RegExp[] = [
  /(?:构成(?:犯罪|违法|侵权|违约|欺诈))/,
  /(?:应当(?:起诉|报警|追诉|提起诉讼))/,
  /(?:建议(?:起诉|报警|找律师|聘请律师|打官司))/,
  /(?:(?:合法|违法|犯法|犯罪|有权|无权)(?:的|地)?(?:行为|做法))/,
  /(?:法律(?:责任|后果|风险)|承担(?:刑事|民事|法律)责任)/,
];

/** Investment buy/sell recommendations. */
const INVESTMENT_PATTERNS: RegExp[] = [
  /(?:(?:建议|应该|必须|赶紧)(?:买入|卖出|抛售|加仓|减仓|清仓|抄底|做多|做空|止损))/,
  /(?:(?:买入|卖出|抛售|加仓|减仓|清仓|抄底|做多|做空)(?:股票|基金|期货|外汇|数字货币|比特币|黄金|房产))/,
  /(?:保证(?:赚|翻倍|回本|不亏|盈利|收益))/,
  /(?:年化(?:收益|回报)(?:率)?(?:至少|不低于|可达|超过)\d)/,
  /(?:稳赚不赔|包赚|绝对赚)/,
];

/** Life-and-death verdicts. */
const LIFE_DEATH_PATTERNS: RegExp[] = [
  /(?:必死|会死|活不过|活不了|命不久|寿命(?:只有|不超过|到))/,
  /(?:天煞孤星|克夫|克妻|克父|克母|克子)/,
  /(?:注定(?:短命|早亡|夭折|孤独终老|断子绝孙))/,
  /(?:(?:今年|明年|后年|\d{4}年)(?:会|必)(?:出事|遭难|有灾|有难))/,
];

/** Deterministic fate / destiny claims. */
const FATE_PATTERNS: RegExp[] = [
  /(?:注定|命中注定|天生(?:就|注定|必须|只能|不能)|命里?(?:注定|该|就是))/,
  /(?:(?:你的)?命(?:就是|注定|该)|这(?:是|就是)你的(?:命|宿命|命运))/,
  /(?:(?:绝对|一定|肯定|必然|必定)(?:会|能|不会|不能|是|不是)(?:成功|失败|发财|破产|离婚|结婚))/,
  /(?:铁定|板上钉钉|毫无疑问(?:会|地)|无可改变)/,
  /(?:不可能(?:成功|翻身|改变|幸福|脱贫))/,
];

/** Manipulative relationship advice. */
const MANIPULATION_PATTERNS: RegExp[] = [
  /(?:(?:要|应该|必须)(?:控制|操控|掌控|拿捏|驯服|驾驭)(?:对方|他|她|伴侣|配偶))/,
  /(?:(?:冷暴力|PUA|情感操控|精神控制|gaslighting)(?:一下|对方|他|她)?)/,
  /(?:让(?:对方|他|她)(?:吃醋|嫉妒|不安|害怕|恐惧|离不开你))/,
  /(?:故意(?:冷落|疏远|忽视|无视|不回|消失|断联))/,
  /(?:(?:威胁|胁迫)(?:分手|离婚|断绝关系))/,
];

interface PatternGroup {
  code: ViolationCode;
  patterns: RegExp[];
  detail: string;
  remediation: string;
}

const HIGH_RISK_GROUPS: PatternGroup[] = [
  {
    code: 'HIGH_RISK_MEDICAL',
    patterns: MEDICAL_PATTERNS,
    detail: '文本包含医疗诊断或治疗建议。',
    remediation:
      '删除所有医疗诊断/治疗内容。如涉及健康主题，只能说"建议咨询专业医生"，不可给具体诊断或用药建议。',
  },
  {
    code: 'HIGH_RISK_LEGAL',
    patterns: LEGAL_PATTERNS,
    detail: '文本包含法律结论或法律建议。',
    remediation:
      '删除法律结论。如涉及法律相关主题，只能说"建议咨询专业律师"，不可给出具体法律判断。',
  },
  {
    code: 'HIGH_RISK_INVESTMENT',
    patterns: INVESTMENT_PATTERNS,
    detail: '文本包含投资买卖建议或收益保证。',
    remediation:
      '删除投资操作建议和收益保证。理财相关只能给方向性参考（如"可考虑稳健型理财"），不可给具体买卖指令或收益承诺。',
  },
  {
    code: 'HIGH_RISK_LIFE_DEATH',
    patterns: LIFE_DEATH_PATTERNS,
    detail: '文本包含生死断语或灾祸预言。',
    remediation: '删除所有生死、灾祸预言。命理只提供趋势参考，不可对寿命、灾祸做确定性断言。',
  },
  {
    code: 'HIGH_RISK_DETERMINISTIC_FATE',
    patterns: FATE_PATTERNS,
    detail: '文本包含确定性命运断言（注定/天生/必然/不可能改变）。',
    remediation:
      '将确定性断言改为趋势参考："盘面显示…的倾向""在这一方面可能需要更多努力"。命理是参考，不是宿命判决。',
  },
  {
    code: 'HIGH_RISK_RELATIONSHIP_MANIPULATION',
    patterns: MANIPULATION_PATTERNS,
    detail: '文本包含关系操控建议。',
    remediation:
      '删除所有操控性建议。关系建议只能基于相互尊重、真诚沟通的前提，不可教唆控制或精神操控。',
  },
];

// --- Exempt section IDs (disclaimer / caveat sections are allowed to reference warnings) ---
const EXEMPT_SECTION_IDS = new Set(['disclaimer', 'uncertainty', 'technical-evidence']);

/**
 * Validate a ReadingDraft against an AnswerPlan.
 * Returns a deterministic, structured result with all violations.
 */
export function validateAnswer(input: ValidateAnswerInput): AnswerValidationResult {
  const { answerPlan, readingDraft } = input;
  const violations: AnswerViolation[] = [];
  const allowedIds = new Set(answerPlan.allowedFactIds);

  // 1. Topic consistency check
  if (readingDraft.topic !== answerPlan.request.topic) {
    violations.push({
      code: 'CROSS_TOPIC',
      severity: 'error',
      detail: `草稿主题 "${readingDraft.topic}" 与 AnswerPlan 主题 "${answerPlan.request.topic}" 不一致。`,
      remediation: '确保 ReadingDraft 的 topic 与 AnswerPlan.request.topic 完全一致。',
    });
  }

  // 2. Answerability gate: not-supported means no content should exist
  if (answerPlan.answerability === 'not-supported') {
    const hasContent = readingDraft.sections.some((s) =>
      s.paragraphs.some((p) => p.text.trim().length > 0 && !EXEMPT_SECTION_IDS.has(s.id)),
    );
    if (hasContent) {
      violations.push({
        code: 'UNSUPPORTED_TOPIC',
        severity: 'error',
        detail: 'AnswerPlan 标记为 not-supported，但草稿仍包含实质内容。',
        remediation:
          '当 answerability 为 not-supported 时，只能说明引擎无法提供该主题的事实，并建议换一个主题。',
      });
    }
  }

  // 3. Fact-boundary: every paragraph must cite sourceFactIds that exist in allowedFactIds
  for (const section of readingDraft.sections) {
    if (EXEMPT_SECTION_IDS.has(section.id)) continue;

    for (let pIdx = 0; pIdx < section.paragraphs.length; pIdx++) {
      const para = section.paragraphs[pIdx]!;

      // 3a. Must have at least one sourceFactId
      if (para.sourceFactIds.length === 0) {
        violations.push({
          code: 'MISSING_SOURCE_FACTS',
          severity: 'error',
          sectionId: section.id,
          paragraphIndex: pIdx,
          detail: `段落缺少 sourceFactIds：内容无事实依据。"${para.text.slice(0, 40)}…"`,
          remediation:
            '每个非免责段落必须引用至少一个 allowedFactIds 中的 fact ID 作为依据。无法引用时应删除该段落。',
        });
      }

      // 3b. Each cited factId must be in allowedFactIds
      for (const factId of para.sourceFactIds) {
        if (!allowedIds.has(factId)) {
          violations.push({
            code: 'UNKNOWN_FACT_ID',
            severity: 'error',
            sectionId: section.id,
            paragraphIndex: pIdx,
            detail: `引用了不在 allowedFactIds 中的 fact ID: "${factId}"。`,
            remediation: '只能引用 answerPlan.allowedFactIds 中列出的 ID。删除或替换无效引用。',
          });
        }
      }

      // 4. High-risk expression scan (all non-exempt paragraphs)
      for (const group of HIGH_RISK_GROUPS) {
        for (const pattern of group.patterns) {
          if (pattern.test(para.text)) {
            violations.push({
              code: group.code,
              severity: 'error',
              sectionId: section.id,
              paragraphIndex: pIdx,
              detail: group.detail + ` 匹配内容："${para.text.slice(0, 60)}…"`,
              remediation: group.remediation,
            });
            break; // one match per group per paragraph is enough
          }
        }
      }
    }
  }

  // 5. Required caveats check
  const expressedCaveats = new Set(readingDraft.caveatsExpressed);
  for (const caveat of answerPlan.requiredCaveats) {
    if (!expressedCaveats.has(caveat)) {
      violations.push({
        code: 'MISSING_REQUIRED_CAVEAT',
        severity: 'error',
        detail: `未表达必要的 caveat："${caveat.slice(0, 80)}"。`,
        remediation:
          '在草稿的 uncertainty 或 disclaimer 部分明确表达此 caveat，并加入 caveatsExpressed。',
      });
    }
  }

  // 6. Required warnings check
  const disclosedWarnings = new Set(readingDraft.warningsDisclosed);
  for (const code of answerPlan.requiredWarningCodes) {
    if (!disclosedWarnings.has(code)) {
      violations.push({
        code: 'MISSING_REQUIRED_WARNING',
        severity: 'error',
        detail: `未披露必要的 warning: "${code}"。`,
        remediation: '在草稿中明确说明此 warning 的 impact/nextStep，并加入 warningsDisclosed。',
      });
    }
  }

  // 7. Disclaimers check (at least one disclaimer section must exist when plan has disclaimers)
  if (answerPlan.disclaimers.length > 0) {
    const hasDisclaimerSection = readingDraft.sections.some(
      (s) => s.id === 'disclaimer' || s.heading.includes('声明') || s.heading.includes('免责'),
    );
    if (!hasDisclaimerSection) {
      violations.push({
        code: 'MISSING_DISCLAIMER',
        severity: 'warning',
        detail: 'AnswerPlan 包含 disclaimers 但草稿缺少免责声明段落。',
        remediation:
          '添加一个 id 为 "disclaimer" 的 section，包含 AnswerPlan 中的 disclaimers 内容。',
      });
    }
  }

  const ok = !violations.some((v) => v.severity === 'error');
  return {
    contractVersion: VALIDATION_RESULT_CONTRACT_VERSION,
    ok,
    violations,
  };
}
