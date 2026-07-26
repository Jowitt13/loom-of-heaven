/**
 * validate-answer — deterministic, offline fact-boundary and safety validator (P0).
 *
 * A DETERMINISTIC STRUCTURE-AND-WORDING GATE over a host-produced ReadingDraft:
 * 1. Every non-exempt paragraph must declare sourceFactIds that exist in allowedFactIds.
 *    (Citation presence is structural — it does NOT prove the paragraph's meaning is
 *    actually derived from those facts.)
 * 2. The draft does not cross topic boundaries.
 * 3. High-risk expression patterns (medical, legal, investment, fate, life-death,
 *    manipulation) are blocked in ALL sections — exempt sections skip only the fact
 *    citation requirement, never the safety scan.
 * 4. All required caveats and warnings from the AnswerPlan are claimed as expressed
 *    (self-attestation set check, not a semantic proof of in-body expression).
 * 5. Protective resource limits reject oversized drafts before any regex scanning.
 *
 * Honest scope: the pattern scan (plus normalization and a conservative negation
 * guard) is a heuristic wording gate; it cannot recognize every semantic paraphrase
 * or evasion. This is the SAFETY layer; lint-reading remains the LANGUAGE QUALITY
 * layer — the two keep separate word lists on purpose.
 */

import type {
  AnswerValidationResult,
  AnswerViolation,
  ValidateAnswerInput,
  ViolationCode,
} from '@ming/contracts';
import {
  MAX_CAVEAT_ENTRY_CHARS,
  MAX_CAVEATS_EXPRESSED,
  MAX_FACT_ID_CHARS,
  MAX_HEADING_CHARS,
  MAX_PARAGRAPH_TEXT_CHARS,
  MAX_PARAGRAPHS_PER_SECTION,
  MAX_SECTION_ID_CHARS,
  MAX_SECTIONS,
  MAX_SOURCE_FACT_IDS_PER_PARAGRAPH,
  MAX_TOTAL_TEXT_CHARS,
  MAX_WARNING_ENTRY_CHARS,
  MAX_WARNINGS_DISCLOSED,
  VALIDATION_RESULT_CONTRACT_VERSION,
} from '@ming/contracts';

// --- Safety-text normalization (single shared entry point for the safety scan) ---
// Deliberately NOT merged with reading-lint's style word lists: this normalizer only
// serves the high-risk scan below.

/** Zero-width / invisible formatting characters commonly used to split keywords. */
const INVISIBLE_CHARS_RE =
  /[\u200B-\u200F\u2060\uFEFF\u00AD\u180E\u202A-\u202E\u2066-\u2069\uFE00-\uFE0F]/g;

/** CJK unified ideograph ranges used to detect artificial splitting of Chinese words. */
const CJK_RANGE = '\u3400-\u9FFF\uF900-\uFAFF';

/**
 * Separators wedged between two CJK characters ("注 定", "注-定", "注·定") are removed
 * so the scan sees the contiguous word. Sentence punctuation (，。！？；：) is kept to
 * avoid merging unrelated sentences into false positives.
 */
const CJK_SEPARATOR_RE = new RegExp(
  `(?<=[${CJK_RANGE}])[ \\-_.*+~/\\u00B7\\u2010-\\u2015\\u2022\\u30FB\\u3001]+(?=[${CJK_RANGE}])`,
  'g',
);

/**
 * Normalize text for safety scanning:
 * 1. Unicode NFKC (folds full-width/compatibility forms, e.g. ＰＵＡ → PUA).
 * 2. Strip zero-width and invisible formatting characters.
 * 3. Collapse all whitespace runs (incl. NBSP, U+3000) to a single space.
 * 4. Remove separator runs wedged between two CJK characters (artificial splitting).
 * The normalized text is used ONLY for scanning and never appears in any output.
 */
export function normalizeSafetyText(text: string): string {
  let t = text.normalize('NFKC');
  t = t.replace(INVISIBLE_CHARS_RE, '');
  t = t.replace(/\s+/g, ' ');
  t = t.replace(CJK_SEPARATOR_RE, '');
  return t;
}

// --- Conservative negation guard (heuristic, closed list) ---
// A high-risk match is suppressed only when an explicit disclaimer-style negation
// marker appears immediately before it. This is a wording heuristic, not semantic
// understanding — it exists so that disclaimer sentences like "本报告不构成医疗诊断"
// are not flagged, while bare negations do not open an evasion hole.
const NEGATION_MARKERS = [
  '不构成',
  '不提供',
  '不作为',
  '不应视为',
  '不能替代',
  '不能作为',
  '并非',
  '不涉及',
  '请咨询专业',
] as const;

/** How far back (in characters) a negation marker may sit before the match. */
const NEGATION_WINDOW_CHARS = 12;

function isNegatedMatch(normText: string, matchIndex: number): boolean {
  const start = Math.max(0, matchIndex - NEGATION_WINDOW_CHARS);
  const window = normText.slice(start, matchIndex);
  return NEGATION_MARKERS.some((marker) => window.includes(marker));
}

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
  /** Stable category key used in violation.patternKey (never raw text). */
  key: string;
  patterns: RegExp[];
  detail: string;
  remediation: string;
}

const HIGH_RISK_GROUPS: PatternGroup[] = [
  {
    code: 'HIGH_RISK_MEDICAL',
    key: 'medical',
    patterns: MEDICAL_PATTERNS,
    detail: '文本包含医疗诊断或治疗建议。',
    remediation:
      '删除所有医疗诊断/治疗内容。如涉及健康主题，只能说"建议咨询专业医生"，不可给具体诊断或用药建议。',
  },
  {
    code: 'HIGH_RISK_LEGAL',
    key: 'legal',
    patterns: LEGAL_PATTERNS,
    detail: '文本包含法律结论或法律建议。',
    remediation:
      '删除法律结论。如涉及法律相关主题，只能说"建议咨询专业律师"，不可给出具体法律判断。',
  },
  {
    code: 'HIGH_RISK_INVESTMENT',
    key: 'investment',
    patterns: INVESTMENT_PATTERNS,
    detail: '文本包含投资买卖建议或收益保证。',
    remediation:
      '删除投资操作建议和收益保证。理财相关只能给方向性参考（如"可考虑稳健型理财"），不可给具体买卖指令或收益承诺。',
  },
  {
    code: 'HIGH_RISK_LIFE_DEATH',
    key: 'life-death',
    patterns: LIFE_DEATH_PATTERNS,
    detail: '文本包含生死断语或灾祸预言。',
    remediation: '删除所有生死、灾祸预言。命理只提供趋势参考，不可对寿命、灾祸做确定性断言。',
  },
  {
    code: 'HIGH_RISK_DETERMINISTIC_FATE',
    key: 'fate',
    patterns: FATE_PATTERNS,
    detail: '文本包含确定性命运断言（注定/天生/必然/不可能改变）。',
    remediation:
      '将确定性断言改为趋势参考："盘面显示…的倾向""在这一方面可能需要更多努力"。命理是参考，不是宿命判决。',
  },
  {
    code: 'HIGH_RISK_RELATIONSHIP_MANIPULATION',
    key: 'manipulation',
    patterns: MANIPULATION_PATTERNS,
    detail: '文本包含关系操控建议。',
    remediation:
      '删除所有操控性建议。关系建议只能基于相互尊重、真诚沟通的前提，不可教唆控制或精神操控。',
  },
];

// --- Exempt section IDs ---
// Exemption covers ONLY the fact-citation requirement (disclaimer/caveat sections
// legitimately carry no fact IDs). It NEVER exempts the high-risk safety scan.
const EXEMPT_SECTION_IDS = new Set(['disclaimer', 'uncertainty', 'technical-evidence']);

/** Global-flag clones of the group patterns, compiled once for match iteration. */
const COMPILED_GROUPS = HIGH_RISK_GROUPS.map((group) => ({
  group,
  globalPatterns: group.patterns.map(
    (p) => new RegExp(p.source, p.flags.includes('g') ? p.flags : `${p.flags}g`),
  ),
}));

/**
 * Scan normalized text for the first non-negated match of any pattern in a group.
 * Returns the pattern index (for patternKey) or null.
 */
function findHighRiskHit(normText: string, globalPatterns: RegExp[]): number | null {
  for (let i = 0; i < globalPatterns.length; i++) {
    const re = globalPatterns[i]!;
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(normText)) !== null) {
      if (!isNegatedMatch(normText, match.index)) return i;
      if (re.lastIndex === match.index) re.lastIndex++;
    }
  }
  return null;
}

/**
 * Protective resource-limit checks, run BEFORE any regex scanning so oversized
 * drafts are rejected at constant cost per field. One violation per exceeded
 * limit kind (first offending location), patternKey = the limit constant name.
 */
function checkResourceLimits(readingDraft: ValidateAnswerInput['readingDraft']): AnswerViolation[] {
  const violations: AnswerViolation[] = [];
  const seen = new Set<string>();
  const add = (limitKey: string, sectionId?: string, paragraphIndex?: number) => {
    if (seen.has(limitKey)) return;
    seen.add(limitKey);
    violations.push({
      code: 'RESOURCE_LIMIT_EXCEEDED',
      severity: 'error',
      ...(sectionId !== undefined ? { sectionId } : {}),
      ...(paragraphIndex !== undefined ? { paragraphIndex } : {}),
      patternKey: limitKey,
      detail: '草稿超出资源保护上限，未执行内容校验。',
      remediation:
        '将草稿规模缩减到 @ming/contracts validate-answer 导出的上限常量以内（见 patternKey 对应的常量名）。',
    });
  };

  if (readingDraft.sections.length > MAX_SECTIONS) add('MAX_SECTIONS');
  if (readingDraft.caveatsExpressed.length > MAX_CAVEATS_EXPRESSED) add('MAX_CAVEATS_EXPRESSED');
  if (readingDraft.caveatsExpressed.some((c) => c.length > MAX_CAVEAT_ENTRY_CHARS)) {
    add('MAX_CAVEAT_ENTRY_CHARS');
  }
  if (readingDraft.warningsDisclosed.length > MAX_WARNINGS_DISCLOSED) {
    add('MAX_WARNINGS_DISCLOSED');
  }
  if (readingDraft.warningsDisclosed.some((w) => w.length > MAX_WARNING_ENTRY_CHARS)) {
    add('MAX_WARNING_ENTRY_CHARS');
  }

  let totalChars = 0;
  for (const section of readingDraft.sections) {
    if (section.id.length > MAX_SECTION_ID_CHARS) add('MAX_SECTION_ID_CHARS');
    const sectionId = section.id.length > MAX_SECTION_ID_CHARS ? undefined : section.id;
    if (section.heading.length > MAX_HEADING_CHARS) add('MAX_HEADING_CHARS', sectionId);
    if (section.paragraphs.length > MAX_PARAGRAPHS_PER_SECTION) {
      add('MAX_PARAGRAPHS_PER_SECTION', sectionId);
    }
    totalChars += section.heading.length;
    for (let pIdx = 0; pIdx < section.paragraphs.length; pIdx++) {
      const para = section.paragraphs[pIdx]!;
      totalChars += para.text.length;
      if (para.text.length > MAX_PARAGRAPH_TEXT_CHARS) {
        add('MAX_PARAGRAPH_TEXT_CHARS', sectionId, pIdx);
      }
      if (para.sourceFactIds.length > MAX_SOURCE_FACT_IDS_PER_PARAGRAPH) {
        add('MAX_SOURCE_FACT_IDS_PER_PARAGRAPH', sectionId, pIdx);
      }
      if (para.sourceFactIds.some((id) => id.length > MAX_FACT_ID_CHARS)) {
        add('MAX_FACT_ID_CHARS', sectionId, pIdx);
      }
    }
  }
  if (totalChars > MAX_TOTAL_TEXT_CHARS) add('MAX_TOTAL_TEXT_CHARS');

  return violations;
}

/**
 * Validate a ReadingDraft against an AnswerPlan.
 * Returns a deterministic, structured result with all violations.
 * Violations carry only structured locators (sectionId, paragraphIndex, patternKey,
 * itemIndex) and static wording — never fragments of the draft or plan text.
 */
export function validateAnswer(input: ValidateAnswerInput): AnswerValidationResult {
  const { answerPlan, readingDraft } = input;

  // 0. Resource boundary: reject oversized drafts before any scanning.
  const limitViolations = checkResourceLimits(readingDraft);
  if (limitViolations.length > 0) {
    return {
      contractVersion: VALIDATION_RESULT_CONTRACT_VERSION,
      ok: false,
      violations: limitViolations,
    };
  }

  const violations: AnswerViolation[] = [];
  const allowedIds = new Set(answerPlan.allowedFactIds);

  // 1. Topic consistency check
  if (readingDraft.topic !== answerPlan.request.topic) {
    violations.push({
      code: 'CROSS_TOPIC',
      severity: 'error',
      detail: '草稿的 topic 与 AnswerPlan.request.topic 不一致。',
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

  // 3 + 4. Per-section checks. Exempt sections skip ONLY the fact-citation checks
  // (3a/3b); the high-risk safety scan (4) runs on every paragraph of every section.
  for (const section of readingDraft.sections) {
    const exemptFromFactChecks = EXEMPT_SECTION_IDS.has(section.id);

    for (let pIdx = 0; pIdx < section.paragraphs.length; pIdx++) {
      const para = section.paragraphs[pIdx]!;

      if (!exemptFromFactChecks) {
        // 3a. Must have at least one sourceFactId
        if (para.sourceFactIds.length === 0) {
          violations.push({
            code: 'MISSING_SOURCE_FACTS',
            severity: 'error',
            sectionId: section.id,
            paragraphIndex: pIdx,
            detail: '段落未声明任何 sourceFactIds，内容缺少事实依据声明。',
            remediation:
              '每个非免责段落必须引用至少一个 allowedFactIds 中的 fact ID 作为依据。无法引用时应删除该段落。',
          });
        }

        // 3b. Each cited factId must be in allowedFactIds (located by index, not echoed)
        for (let fIdx = 0; fIdx < para.sourceFactIds.length; fIdx++) {
          if (!allowedIds.has(para.sourceFactIds[fIdx]!)) {
            violations.push({
              code: 'UNKNOWN_FACT_ID',
              severity: 'error',
              sectionId: section.id,
              paragraphIndex: pIdx,
              itemIndex: fIdx,
              detail:
                '段落引用了不在 allowedFactIds 中的 fact ID（见 itemIndex 对应的 sourceFactIds 下标）。',
              remediation: '只能引用 answerPlan.allowedFactIds 中列出的 ID。删除或替换无效引用。',
            });
          }
        }
      }

      // 4. High-risk expression scan — ALL sections, normalized text, negation-guarded
      const normText = normalizeSafetyText(para.text);
      for (const { group, globalPatterns } of COMPILED_GROUPS) {
        const patternIndex = findHighRiskHit(normText, globalPatterns);
        if (patternIndex !== null) {
          violations.push({
            code: group.code,
            severity: 'error',
            sectionId: section.id,
            paragraphIndex: pIdx,
            patternKey: `${group.key}/${patternIndex}`,
            detail: group.detail,
            remediation: group.remediation,
          });
          // one match per group per paragraph is enough
        }
      }
    }
  }

  // 5. Required caveats check (self-attestation set check; located by plan index)
  const expressedCaveats = new Set(readingDraft.caveatsExpressed);
  for (let cIdx = 0; cIdx < answerPlan.requiredCaveats.length; cIdx++) {
    if (!expressedCaveats.has(answerPlan.requiredCaveats[cIdx]!)) {
      violations.push({
        code: 'MISSING_REQUIRED_CAVEAT',
        severity: 'error',
        itemIndex: cIdx,
        detail: '未声明表达必要的 caveat（见 itemIndex 对应的 answerPlan.requiredCaveats 下标）。',
        remediation:
          '在草稿的 uncertainty 或 disclaimer 部分明确表达此 caveat，并加入 caveatsExpressed。',
      });
    }
  }

  // 6. Required warnings check (self-attestation set check; located by plan index)
  const disclosedWarnings = new Set(readingDraft.warningsDisclosed);
  for (let wIdx = 0; wIdx < answerPlan.requiredWarningCodes.length; wIdx++) {
    if (!disclosedWarnings.has(answerPlan.requiredWarningCodes[wIdx]!)) {
      violations.push({
        code: 'MISSING_REQUIRED_WARNING',
        severity: 'error',
        itemIndex: wIdx,
        detail:
          '未声明披露必要的 warning（见 itemIndex 对应的 answerPlan.requiredWarningCodes 下标）。',
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
