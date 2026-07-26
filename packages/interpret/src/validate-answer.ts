/**
 * validate-answer — deterministic, offline fact-boundary and safety validator (P0).
 *
 * A DETERMINISTIC STRUCTURE-AND-WORDING GATE over a host-produced ReadingDraft:
 * 1. Every paragraph outside the minimal fact-exempt sections (disclaimer,
 *    uncertainty) must declare sourceFactIds that exist in allowedFactIds.
 *    (Citation presence is structural — it does NOT prove the paragraph's meaning
 *    is actually derived from those facts.)
 * 2. The draft does not cross topic boundaries; `not-supported` plans reject any
 *    fact-citing or more-than-brief content regardless of section ids.
 * 3. High-risk expression rules (medical, legal, investment, fate, life-death,
 *    manipulation) run over ALL visible text — every heading and every paragraph
 *    of every section. Recognized fixed safety-disclaimer clauses are masked
 *    before scanning; everything else is scanned as-is.
 * 4. All required caveats and warnings from the AnswerPlan are claimed as expressed
 *    (self-attestation set check, not a semantic proof of in-body expression).
 * 5. Protective resource limits reject oversized inputs before any regex scanning
 *    and cap the number of reported violations. These limits bound the cost of the
 *    VALIDATION stage only — they do not bound what a caller spends reading or
 *    JSON-parsing an input file before validation.
 *
 * Honest scope: the rule scan (with normalization and disclaimer masking) is a
 * heuristic wording gate; it cannot recognize every semantic paraphrase or
 * evasion, and the disclaimer mask is a bounded structural heuristic, not
 * language understanding. This is the SAFETY layer; lint-reading remains the
 * LANGUAGE QUALITY layer — the two keep separate word lists on purpose.
 */

import type {
  AnswerValidationResult,
  AnswerViolation,
  ValidateAnswerInput,
  ViolationCode,
} from '@ming/contracts';
import {
  MAX_ALLOWED_FACT_IDS,
  MAX_CAVEAT_ENTRY_CHARS,
  MAX_CAVEATS_EXPRESSED,
  MAX_DISCLAIMER_ENTRY_CHARS,
  MAX_FACT_ID_CHARS,
  MAX_HEADING_CHARS,
  MAX_NOT_SUPPORTED_TEXT_CHARS,
  MAX_PARAGRAPH_TEXT_CHARS,
  MAX_PARAGRAPHS_PER_SECTION,
  MAX_PLAN_DISCLAIMERS,
  MAX_PLAN_GUARDRAILS,
  MAX_REQUIRED_CAVEATS,
  MAX_REQUIRED_WARNING_CODES,
  MAX_SECTION_ID_CHARS,
  MAX_SECTIONS,
  MAX_SOURCE_FACT_IDS_PER_PARAGRAPH,
  MAX_TOTAL_SOURCE_FACT_IDS,
  MAX_TOTAL_TEXT_CHARS,
  MAX_VIOLATIONS,
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

// --- Fixed safety-disclaimer masking (replaces the former negation-window guard) ---
// A recognized disclaimer clause is masked out (replaced by spaces) BEFORE the
// high-risk scan; all remaining text is scanned normally. The mask is deliberately
// narrow and structural — all four conditions must hold inside ONE clause
// (no clause punctuation may intervene):
//   1. an explicit disclaimer negation verb (不构成/不提供/不能替代/…),
//   2. a safety-category term within the next 4 characters,
//   3. at most 12 further characters,
//   4. a disclaimer object noun (建议/意见/依据/…) immediately before the clause end.
// Anything that does not fit this shape — cross-clause negation, "请咨询专业人士"
// style referral prompts, double negation, run-on clauses — is NOT masked and is
// scanned as-is (the failure direction is to flag, not to exempt). Residual risk:
// a rule keyword hidden inside a clause that structurally looks exactly like a
// disclaimer can escape; the mask is a bounded heuristic, not semantics.

const CLAUSE_END_CLASS = '，。；：！？,.;:!?';
const DISCLAIMER_NEGATION_VERBS =
  '不构成|不提供|不作为|不应视为|不能替代|不能作为|并非|不涉及|不包含|不给出|不做出';
const DISCLAIMER_CATEGORY_TERMS =
  '医疗|医学|诊断|治疗|用药|法律|诉讼|投资|理财|证券|操作指令|买入|卖出|买卖|生死|寿命|命运';
const DISCLAIMER_OBJECT_NOUNS = '建议|意见|结论|判断|指令|依据|断言|诊断|方案|承诺|保证';

const SAFETY_DISCLAIMER_RE = new RegExp(
  `(?:${DISCLAIMER_NEGATION_VERBS})` +
    `(?=[^${CLAUSE_END_CLASS}]{0,4}(?:${DISCLAIMER_CATEGORY_TERMS}))` +
    `[^${CLAUSE_END_CLASS}]{0,12}(?:${DISCLAIMER_OBJECT_NOUNS})` +
    `(?=[${CLAUSE_END_CLASS}]|$)`,
  'g',
);

/**
 * Mask recognized fixed safety-disclaimer clauses with spaces (length-preserving,
 * so masking can never join surrounding text into a new match). Everything left
 * after masking is scanned normally.
 */
export function maskSafetyDisclaimers(normText: string): string {
  return normText.replace(SAFETY_DISCLAIMER_RE, (m) => ' '.repeat(m.length));
}

// --- High-risk expression rules (stable named IDs; never bare array indexes) ---

interface HighRiskRule {
  /** Stable rule identifier used as violation.patternKey. */
  id: string;
  re: RegExp;
}

const MEDICAL_RULES: HighRiskRule[] = [
  {
    id: 'medical.treatment-terms',
    re: /(?:确诊|诊断|患有|得了|治疗|服药|用药|手术|处方|化疗|放疗|抗生素|止痛药)/,
  },
  { id: 'medical.referral-advice', re: /(?:建议(?:去|到|看|找|就)(?:医|诊|院|科))/ },
  {
    id: 'medical.diagnosis-claim',
    re: /(?:你(?:有|得了?|患了?|是)(?:抑郁|焦虑|癌|肿瘤|糖尿|心脏))/,
  },
  { id: 'medical.medication-change', re: /(?:停药|减药|加药|换药)/ },
  { id: 'medical.procedure-order', re: /(?:需要做(?:检查|化验|CT|MRI|B超|手术))/ },
];

const LEGAL_RULES: HighRiskRule[] = [
  { id: 'legal.crime-conclusion', re: /(?:构成(?:犯罪|违法|侵权|违约|欺诈))/ },
  { id: 'legal.litigation-demand', re: /(?:应当(?:起诉|报警|追诉|提起诉讼))/ },
  { id: 'legal.litigation-advice', re: /(?:建议(?:起诉|报警|找律师|聘请律师|打官司))/ },
  {
    id: 'legal.legality-judgement',
    re: /(?:(?:合法|违法|犯法|犯罪|有权|无权)(?:的|地)?(?:行为|做法))/,
  },
  { id: 'legal.liability-claim', re: /(?:法律(?:责任|后果|风险)|承担(?:刑事|民事|法律)责任)/ },
];

const INVESTMENT_RULES: HighRiskRule[] = [
  {
    id: 'investment.trade-instruction',
    re: /(?:(?:建议|应该|必须|赶紧)(?:买入|卖出|抛售|加仓|减仓|清仓|抄底|做多|做空|止损))/,
  },
  {
    id: 'investment.asset-trade',
    re: /(?:(?:买入|卖出|抛售|加仓|减仓|清仓|抄底|做多|做空)(?:股票|基金|期货|外汇|数字货币|比特币|黄金|房产))/,
  },
  { id: 'investment.profit-guarantee', re: /(?:保证(?:赚|翻倍|回本|不亏|盈利|收益))/ },
  { id: 'investment.yield-promise', re: /(?:年化(?:收益|回报)(?:率)?(?:至少|不低于|可达|超过)\d)/ },
  { id: 'investment.sure-win', re: /(?:稳赚不赔|包赚|绝对赚)/ },
];

const LIFE_DEATH_RULES: HighRiskRule[] = [
  {
    id: 'life-death.death-verdict',
    re: /(?:必死|会死|活不过|活不了|命不久|寿命(?:只有|不超过|到))/,
  },
  { id: 'life-death.kinship-curse', re: /(?:天煞孤星|克夫|克妻|克父|克母|克子)/ },
  { id: 'life-death.doomed-fate', re: /(?:注定(?:短命|早亡|夭折|孤独终老|断子绝孙))/ },
  {
    id: 'life-death.disaster-year',
    re: /(?:(?:今年|明年|后年|\d{4}年)(?:会|必)(?:出事|遭难|有灾|有难))/,
  },
];

const FATE_RULES: HighRiskRule[] = [
  {
    id: 'fate.predestined',
    re: /(?:注定|命中注定|天生(?:就|注定|必须|只能|不能)|命里?(?:注定|该|就是))/,
  },
  {
    id: 'fate.destiny-claim',
    re: /(?:(?:你的)?命(?:就是|注定|该)|这(?:是|就是)你的(?:命|宿命|命运))/,
  },
  {
    id: 'fate.absolute-outcome',
    re: /(?:(?:绝对|一定|肯定|必然|必定)(?:会|能|不会|不能|是|不是)(?:成功|失败|发财|破产|离婚|结婚))/,
  },
  { id: 'fate.certainty-idiom', re: /(?:铁定|板上钉钉|毫无疑问(?:会|地)|无可改变)/ },
  { id: 'fate.impossibility-verdict', re: /(?:不可能(?:成功|翻身|改变|幸福|脱贫))/ },
];

const MANIPULATION_RULES: HighRiskRule[] = [
  {
    id: 'manipulation.control-advice',
    re: /(?:(?:要|应该|必须)(?:控制|操控|掌控|拿捏|驯服|驾驭)(?:对方|他|她|伴侣|配偶))/,
  },
  {
    id: 'manipulation.coercive-tactics',
    re: /(?:(?:冷暴力|PUA|情感操控|精神控制|gaslighting)(?:一下|对方|他|她)?)/,
  },
  {
    id: 'manipulation.fear-inducing',
    re: /(?:让(?:对方|他|她)(?:吃醋|嫉妒|不安|害怕|恐惧|离不开你))/,
  },
  { id: 'manipulation.deliberate-neglect', re: /(?:故意(?:冷落|疏远|忽视|无视|不回|消失|断联))/ },
  { id: 'manipulation.breakup-threat', re: /(?:(?:威胁|胁迫)(?:分手|离婚|断绝关系))/ },
];

interface RuleGroup {
  code: ViolationCode;
  rules: HighRiskRule[];
  detail: string;
  remediation: string;
}

const HIGH_RISK_GROUPS: RuleGroup[] = [
  {
    code: 'HIGH_RISK_MEDICAL',
    rules: MEDICAL_RULES,
    detail: '文本包含医疗诊断或治疗建议。',
    remediation:
      '删除所有医疗诊断/治疗内容。如涉及健康主题，只能说"建议咨询专业医生"，不可给具体诊断或用药建议。',
  },
  {
    code: 'HIGH_RISK_LEGAL',
    rules: LEGAL_RULES,
    detail: '文本包含法律结论或法律建议。',
    remediation:
      '删除法律结论。如涉及法律相关主题，只能说"建议咨询专业律师"，不可给出具体法律判断。',
  },
  {
    code: 'HIGH_RISK_INVESTMENT',
    rules: INVESTMENT_RULES,
    detail: '文本包含投资买卖建议或收益保证。',
    remediation:
      '删除投资操作建议和收益保证。理财相关只能给方向性参考（如"可考虑稳健型理财"），不可给具体买卖指令或收益承诺。',
  },
  {
    code: 'HIGH_RISK_LIFE_DEATH',
    rules: LIFE_DEATH_RULES,
    detail: '文本包含生死断语或灾祸预言。',
    remediation: '删除所有生死、灾祸预言。命理只提供趋势参考，不可对寿命、灾祸做确定性断言。',
  },
  {
    code: 'HIGH_RISK_DETERMINISTIC_FATE',
    rules: FATE_RULES,
    detail: '文本包含确定性命运断言（注定/天生/必然/不可能改变）。',
    remediation:
      '将确定性断言改为趋势参考："盘面显示…的倾向""在这一方面可能需要更多努力"。命理是参考，不是宿命判决。',
  },
  {
    code: 'HIGH_RISK_RELATIONSHIP_MANIPULATION',
    rules: MANIPULATION_RULES,
    detail: '文本包含关系操控建议。',
    remediation:
      '删除所有操控性建议。关系建议只能基于相互尊重、真诚沟通的前提，不可教唆控制或精神操控。',
  },
];

// --- Fact-exempt section IDs (MINIMAL set) ---
// Only disclaimer and uncertainty sections may omit fact citations: they express
// plan-provided caveats/disclaimers, not new factual claims. technical-evidence
// presents evidence and therefore MUST cite facts. No section id ever exempts the
// high-risk safety scan.
const FACT_EXEMPT_SECTION_IDS = new Set(['disclaimer', 'uncertainty']);

/**
 * Scan normalized+masked text and return the id of the first matching rule in a
 * group, or null. Rules use stable named ids — never array positions.
 */
function findGroupHit(scanText: string, rules: HighRiskRule[]): string | null {
  for (const rule of rules) {
    if (rule.re.test(scanText)) return rule.id;
  }
  return null;
}

/** Prepare a text field for scanning: normalize, then mask fixed disclaimers. */
function toScanText(text: string): string {
  return maskSafetyDisclaimers(normalizeSafetyText(text));
}

const RESOURCE_LIMIT_DETAIL = '输入超出资源保护上限，未执行内容校验。';
const RESOURCE_LIMIT_REMEDIATION =
  '将输入规模缩减到 @ming/contracts validate-answer 导出的上限常量以内（见 patternKey 对应的常量名）。';

function resourceViolation(
  limitKey: string,
  sectionIndex?: number,
  paragraphIndex?: number,
): AnswerViolation {
  return {
    code: 'RESOURCE_LIMIT_EXCEEDED',
    severity: 'error',
    ...(sectionIndex !== undefined ? { sectionIndex } : {}),
    ...(paragraphIndex !== undefined ? { paragraphIndex } : {}),
    patternKey: limitKey,
    detail: RESOURCE_LIMIT_DETAIL,
    remediation: RESOURCE_LIMIT_REMEDIATION,
  };
}

/**
 * Protective resource-limit checks over BOTH sides of the input, run BEFORE any
 * regex scanning. Returns the FIRST violated limit immediately: every array's
 * count is checked (an O(1) length read) before that array is iterated, so an
 * over-cap array is never traversed. Cost is therefore bounded by the caps
 * themselves. This bounds the validation stage only — reading/parsing the input
 * happens before this function and is not covered by these limits.
 */
function checkResourceLimits(input: ValidateAnswerInput): AnswerViolation | null {
  const { answerPlan, readingDraft } = input;

  // Plan-side counts first (never iterate an over-cap array).
  if (answerPlan.allowedFactIds.length > MAX_ALLOWED_FACT_IDS) {
    return resourceViolation('MAX_ALLOWED_FACT_IDS');
  }
  if (answerPlan.requiredCaveats.length > MAX_REQUIRED_CAVEATS) {
    return resourceViolation('MAX_REQUIRED_CAVEATS');
  }
  if (answerPlan.requiredWarningCodes.length > MAX_REQUIRED_WARNING_CODES) {
    return resourceViolation('MAX_REQUIRED_WARNING_CODES');
  }
  if (answerPlan.disclaimers.length > MAX_PLAN_DISCLAIMERS) {
    return resourceViolation('MAX_PLAN_DISCLAIMERS');
  }
  if (answerPlan.guardrails.length > MAX_PLAN_GUARDRAILS) {
    return resourceViolation('MAX_PLAN_GUARDRAILS');
  }
  // Plan-side entry lengths (arrays are within caps now).
  if (answerPlan.allowedFactIds.some((id) => id.length > MAX_FACT_ID_CHARS)) {
    return resourceViolation('MAX_FACT_ID_CHARS');
  }
  if (answerPlan.requiredCaveats.some((c) => c.length > MAX_CAVEAT_ENTRY_CHARS)) {
    return resourceViolation('MAX_CAVEAT_ENTRY_CHARS');
  }
  if (answerPlan.requiredWarningCodes.some((w) => w.length > MAX_WARNING_ENTRY_CHARS)) {
    return resourceViolation('MAX_WARNING_ENTRY_CHARS');
  }
  if (answerPlan.disclaimers.some((d) => d.length > MAX_DISCLAIMER_ENTRY_CHARS)) {
    return resourceViolation('MAX_DISCLAIMER_ENTRY_CHARS');
  }

  // Draft-side counts.
  if (readingDraft.sections.length > MAX_SECTIONS) {
    return resourceViolation('MAX_SECTIONS');
  }
  if (readingDraft.caveatsExpressed.length > MAX_CAVEATS_EXPRESSED) {
    return resourceViolation('MAX_CAVEATS_EXPRESSED');
  }
  if (readingDraft.caveatsExpressed.some((c) => c.length > MAX_CAVEAT_ENTRY_CHARS)) {
    return resourceViolation('MAX_CAVEAT_ENTRY_CHARS');
  }
  if (readingDraft.warningsDisclosed.length > MAX_WARNINGS_DISCLOSED) {
    return resourceViolation('MAX_WARNINGS_DISCLOSED');
  }
  if (readingDraft.warningsDisclosed.some((w) => w.length > MAX_WARNING_ENTRY_CHARS)) {
    return resourceViolation('MAX_WARNING_ENTRY_CHARS');
  }

  // Draft-side structure (sections count is within cap here).
  let totalChars = 0;
  let totalFactIds = 0;
  for (let sIdx = 0; sIdx < readingDraft.sections.length; sIdx++) {
    const section = readingDraft.sections[sIdx]!;
    if (section.id.length > MAX_SECTION_ID_CHARS) {
      return resourceViolation('MAX_SECTION_ID_CHARS', sIdx);
    }
    if (section.heading.length > MAX_HEADING_CHARS) {
      return resourceViolation('MAX_HEADING_CHARS', sIdx);
    }
    if (section.paragraphs.length > MAX_PARAGRAPHS_PER_SECTION) {
      return resourceViolation('MAX_PARAGRAPHS_PER_SECTION', sIdx);
    }
    totalChars += section.heading.length;
    if (totalChars > MAX_TOTAL_TEXT_CHARS) {
      return resourceViolation('MAX_TOTAL_TEXT_CHARS', sIdx);
    }
    for (let pIdx = 0; pIdx < section.paragraphs.length; pIdx++) {
      const para = section.paragraphs[pIdx]!;
      if (para.text.length > MAX_PARAGRAPH_TEXT_CHARS) {
        return resourceViolation('MAX_PARAGRAPH_TEXT_CHARS', sIdx, pIdx);
      }
      if (para.sourceFactIds.length > MAX_SOURCE_FACT_IDS_PER_PARAGRAPH) {
        return resourceViolation('MAX_SOURCE_FACT_IDS_PER_PARAGRAPH', sIdx, pIdx);
      }
      if (para.sourceFactIds.some((id) => id.length > MAX_FACT_ID_CHARS)) {
        return resourceViolation('MAX_FACT_ID_CHARS', sIdx, pIdx);
      }
      totalChars += para.text.length;
      if (totalChars > MAX_TOTAL_TEXT_CHARS) {
        return resourceViolation('MAX_TOTAL_TEXT_CHARS', sIdx, pIdx);
      }
      totalFactIds += para.sourceFactIds.length;
      if (totalFactIds > MAX_TOTAL_SOURCE_FACT_IDS) {
        return resourceViolation('MAX_TOTAL_SOURCE_FACT_IDS', sIdx, pIdx);
      }
    }
  }
  return null;
}

/**
 * Validate a ReadingDraft against an AnswerPlan.
 * Returns a deterministic, structured result with all violations (capped at
 * MAX_VIOLATIONS; `violationsTruncated` reports the cap being hit).
 * Violations carry only structured locators (sectionIndex, field, paragraphIndex,
 * patternKey, itemIndex) and static wording — never fragments of the draft, the
 * plan, or caller-provided section ids.
 */
export function validateAnswer(input: ValidateAnswerInput): AnswerValidationResult {
  const { answerPlan, readingDraft } = input;

  // 0. Resource boundary: reject oversized inputs before any scanning.
  const limitViolation = checkResourceLimits(input);
  if (limitViolation !== null) {
    return {
      contractVersion: VALIDATION_RESULT_CONTRACT_VERSION,
      ok: false,
      violations: [limitViolation],
      violationsTruncated: false,
    };
  }

  const violations: AnswerViolation[] = [];
  let violationsTruncated = false;
  const push = (v: AnswerViolation): void => {
    if (violations.length >= MAX_VIOLATIONS) {
      violationsTruncated = true;
      return;
    }
    violations.push(v);
  };

  const allowedIds = new Set(answerPlan.allowedFactIds);

  // 1. Topic consistency check
  if (readingDraft.topic !== answerPlan.request.topic) {
    push({
      code: 'CROSS_TOPIC',
      severity: 'error',
      detail: '草稿的 topic 与 AnswerPlan.request.topic 不一致。',
      remediation: '确保 ReadingDraft 的 topic 与 AnswerPlan.request.topic 完全一致。',
    });
  }

  // 2. Answerability gate: not-supported allows only a brief, fact-free
  // explanation. Section ids are deliberately ignored here — content cannot be
  // smuggled past this gate by choosing a particular id.
  if (answerPlan.answerability === 'not-supported') {
    let contentChars = 0;
    let citesFacts = false;
    for (const section of readingDraft.sections) {
      for (const para of section.paragraphs) {
        contentChars += para.text.trim().length;
        if (para.sourceFactIds.length > 0) citesFacts = true;
      }
    }
    if (citesFacts || contentChars > MAX_NOT_SUPPORTED_TEXT_CHARS) {
      push({
        code: 'UNSUPPORTED_TOPIC',
        severity: 'error',
        detail: 'AnswerPlan 标记为 not-supported，但草稿引用了 fact 或包含超出简短说明的内容。',
        remediation:
          '当 answerability 为 not-supported 时，只能用不引用任何 fact 的简短说明（总量不超过 MAX_NOT_SUPPORTED_TEXT_CHARS）解释引擎无法提供该主题的事实，并建议换一个主题。',
      });
    }
  }

  // 3 + 4. Per-section checks. disclaimer/uncertainty skip ONLY the fact-citation
  // checks (3a/3b); the high-risk scan (4) covers every heading and paragraph.
  for (let sIdx = 0; sIdx < readingDraft.sections.length; sIdx++) {
    const section = readingDraft.sections[sIdx]!;
    const exemptFromFactChecks = FACT_EXEMPT_SECTION_IDS.has(section.id);

    // 4a. Heading scan (headings are visible text too).
    if (section.heading.length > 0) {
      const headingScanText = toScanText(section.heading);
      for (const group of HIGH_RISK_GROUPS) {
        const ruleId = findGroupHit(headingScanText, group.rules);
        if (ruleId !== null) {
          push({
            code: group.code,
            severity: 'error',
            sectionIndex: sIdx,
            field: 'heading',
            patternKey: ruleId,
            detail: group.detail,
            remediation: group.remediation,
          });
        }
      }
    }

    for (let pIdx = 0; pIdx < section.paragraphs.length; pIdx++) {
      const para = section.paragraphs[pIdx]!;

      if (!exemptFromFactChecks) {
        // 3a. Must have at least one sourceFactId
        if (para.sourceFactIds.length === 0) {
          push({
            code: 'MISSING_SOURCE_FACTS',
            severity: 'error',
            sectionIndex: sIdx,
            field: 'paragraph',
            paragraphIndex: pIdx,
            detail: '段落未声明任何 sourceFactIds，内容缺少事实依据声明。',
            remediation:
              '每个非免责段落必须引用至少一个 allowedFactIds 中的 fact ID 作为依据。无法引用时应删除该段落。',
          });
        }

        // 3b. Each cited factId must be in allowedFactIds (located by index, not echoed)
        for (let fIdx = 0; fIdx < para.sourceFactIds.length; fIdx++) {
          if (!allowedIds.has(para.sourceFactIds[fIdx]!)) {
            push({
              code: 'UNKNOWN_FACT_ID',
              severity: 'error',
              sectionIndex: sIdx,
              field: 'paragraph',
              paragraphIndex: pIdx,
              itemIndex: fIdx,
              detail:
                '段落引用了不在 allowedFactIds 中的 fact ID（见 itemIndex 对应的 sourceFactIds 下标）。',
              remediation: '只能引用 answerPlan.allowedFactIds 中列出的 ID。删除或替换无效引用。',
            });
          }
        }
      }

      // 4b. High-risk scan — every paragraph of every section, on masked text.
      const paraScanText = toScanText(para.text);
      for (const group of HIGH_RISK_GROUPS) {
        const ruleId = findGroupHit(paraScanText, group.rules);
        if (ruleId !== null) {
          push({
            code: group.code,
            severity: 'error',
            sectionIndex: sIdx,
            field: 'paragraph',
            paragraphIndex: pIdx,
            patternKey: ruleId,
            detail: group.detail,
            remediation: group.remediation,
          });
          // one reported hit per group per paragraph is enough
        }
      }
    }
  }

  // 5. Required caveats check (self-attestation set check; located by plan index)
  const expressedCaveats = new Set(readingDraft.caveatsExpressed);
  for (let cIdx = 0; cIdx < answerPlan.requiredCaveats.length; cIdx++) {
    if (!expressedCaveats.has(answerPlan.requiredCaveats[cIdx]!)) {
      push({
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
      push({
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
      push({
        code: 'MISSING_DISCLAIMER',
        severity: 'warning',
        detail: 'AnswerPlan 包含 disclaimers 但草稿缺少免责声明段落。',
        remediation:
          '添加一个 id 为 "disclaimer" 的 section，包含 AnswerPlan 中的 disclaimers 内容。',
      });
    }
  }

  const ok = !violationsTruncated && !violations.some((v) => v.severity === 'error');
  return {
    contractVersion: VALIDATION_RESULT_CONTRACT_VERSION,
    ok,
    violations,
    violationsTruncated,
  };
}
