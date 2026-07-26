/**
 * validate-answer — deterministic, offline fact-boundary and safety validator (P0).
 *
 * A DETERMINISTIC STRUCTURE-AND-WORDING GATE over a host-produced ReadingDraft:
 * 1. Fact boundary: in v2, a paragraph is fact-exempt ONLY when its
 *    `constraintRefs` all resolve to real AnswerPlan constraints (disclaimers /
 *    requiredCaveats / requiredWarningCodes); a free section id never grants
 *    exemption. Legacy v1 drafts keep the old disclaimer/uncertainty section-id
 *    exemption as conditional compatibility. Every other paragraph must declare
 *    sourceFactIds that exist in allowedFactIds. (Citation presence is
 *    structural — it does NOT prove the paragraph's meaning is derived from
 *    those facts.)
 * 2. The draft does not cross topic boundaries; `not-supported` plans reject any
 *    fact-citing draft, and budget ALL visible text (headings + paragraphs)
 *    regardless of section ids. This verifies "short and fact-free" only — it
 *    cannot prove the text semantically just explains the limitation.
 * 3. High-risk expression rules (medical, legal, investment, fate, life-death,
 *    manipulation) run over ALL visible text — every heading and every paragraph
 *    of every section. Canonical fixed safety-disclaimer templates are masked
 *    before scanning; everything else is scanned as-is.
 * 4. Required caveats/warnings: structured `constraintRefs` are the primary
 *    evidence in v2; `caveatsExpressed`/`warningsDisclosed` must stay consistent
 *    with them (still not a semantic proof of in-body expression).
 * 5. Protective resource limits reject oversized inputs before any regex
 *    scanning and cap reported violations. These bound the VALIDATION stage
 *    only; use `parseValidateAnswerInputBounded` + the CLI file-byte cap for
 *    bounded parsing before validation.
 *
 * Honest scope: the rule scan (with normalization and canonical-template
 * masking) is a heuristic wording gate; it cannot recognize every semantic
 * paraphrase or evasion. This is the SAFETY layer; lint-reading remains the
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
  MAX_CONSTRAINT_REFS_PER_PARAGRAPH,
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
  READING_DRAFT_COMPAT_VERSIONS,
  VALIDATION_RESULT_CONTRACT_VERSION,
  ValidateAnswerInput as ValidateAnswerInputSchema,
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
 * 3. Normalize line endings to `\n` and collapse HORIZONTAL whitespace runs to a
 *    single space — newlines are PRESERVED as clause boundaries so the
 *    disclaimer mask can never cross a line break (`toScanText` folds them
 *    after masking so line-split keywords still cannot evade the scan).
 * 4. Remove separator runs wedged between two CJK characters (artificial splitting).
 * The normalized text is used ONLY for scanning and never appears in any output.
 */
export function normalizeSafetyText(text: string): string {
  let t = text.normalize('NFKC');
  t = t.replace(INVISIBLE_CHARS_RE, '');
  t = t.replace(/\r\n?|[\u0085\u2028\u2029]/g, '\n');
  t = t.replace(/[^\S\n]+/g, ' ');
  t = t.replace(CJK_SEPARATOR_RE, '');
  return t;
}

// --- Canonical safety-disclaimer masking (fixed templates only) ---
// A span is masked (replaced by spaces) BEFORE the high-risk scan ONLY when it
// matches a canonical safe-disclaimer template: an explicit disclaimer negation
// verb IMMEDIATELY followed by one of the enumerated disclaimer object phrases
// (optionally chained with 或/及/和 + another enumerated phrase), ending exactly
// at a clause boundary. There is no free character span — adversative words,
// second predicates, and following lines can never enter the mask, and newlines
// count as clause boundaries. The caller-supplied answerPlan.disclaimers are
// deliberately NOT used as a mask whitelist. Anything that does not match a
// template is scanned as-is (the failure direction is to flag, not to exempt).
// Residual risk: text that IS one of these fixed phrases escapes the scan; the
// phrases are curated to be safe-by-construction disclaimer objects.

const CLAUSE_END_CLASS = '\\n，。；：！？,.;:!?';

const DISCLAIMER_NEGATION_VERBS = [
  '不构成',
  '不提供',
  '不作为',
  '不应视为',
  '不能替代',
  '不能作为',
  '并非',
  '不涉及',
  '不包含',
  '不给出',
  '不做出',
] as const;

/** Closed, curated list of disclaimer object phrases (safe by construction). */
const DISCLAIMER_OBJECT_PHRASES = [
  '医疗诊断',
  '医学诊断',
  '医疗建议',
  '医学建议',
  '医疗意见',
  '诊断建议',
  '诊断结论',
  '治疗建议',
  '治疗方案',
  '用药建议',
  '诊断',
  '法律意见',
  '法律建议',
  '法律结论',
  '法律判断',
  '诉讼建议',
  '投资建议',
  '投资意见',
  '投资操作指令',
  '操作指令',
  '理财建议',
  '买卖建议',
  '收益承诺',
  '收益保证',
  '生死判断',
  '生死断言',
  '寿命判断',
  '命运断言',
  '命运判断',
  '专业建议',
  '专业意见',
] as const;

const DISCLAIMER_PHRASE_ALT = `(?:${[...DISCLAIMER_OBJECT_PHRASES]
  .sort((a, b) => b.length - a.length)
  .join('|')})`;

const SAFETY_DISCLAIMER_RE = new RegExp(
  `(?:${DISCLAIMER_NEGATION_VERBS.join('|')})` +
    `${DISCLAIMER_PHRASE_ALT}(?:[或及和]${DISCLAIMER_PHRASE_ALT})*` +
    `(?=[${CLAUSE_END_CLASS}]|$)`,
  'g',
);

/**
 * Mask canonical safety-disclaimer templates with spaces (length-preserving, so
 * masking can never join surrounding text into a new match). Everything left
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

// --- Legacy fact-exempt section IDs (reading-draft/v1 ONLY) ---
// v1 conditional compatibility: only disclaimer and uncertainty sections may omit
// fact citations. In v2 this id-based exemption is GONE — fact exemption requires
// valid `constraintRefs`. No section id ever exempts the high-risk safety scan.
const LEGACY_FACT_EXEMPT_SECTION_IDS = new Set(['disclaimer', 'uncertainty']);

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

/**
 * Prepare a text field for scanning: normalize (newlines preserved), mask
 * canonical disclaimer templates (a mask can never cross a line), THEN fold
 * newlines to spaces and re-condense CJK splits so line-split keywords cannot
 * evade the scan either.
 */
function toScanText(text: string): string {
  const masked = maskSafetyDisclaimers(normalizeSafetyText(text));
  return masked.replace(/\n+/g, ' ').replace(CJK_SEPARATOR_RE, '');
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
      if ((para.constraintRefs?.length ?? 0) > MAX_CONSTRAINT_REFS_PER_PARAGRAPH) {
        return resourceViolation('MAX_CONSTRAINT_REFS_PER_PARAGRAPH', sIdx, pIdx);
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

  // -1. Contract-version gate: unknown draft versions are rejected outright —
  // this public entry never returns a successful v2 result for an arbitrary
  // version smuggled past the TypeScript types.
  const draftVersion = (readingDraft as { contractVersion?: unknown }).contractVersion;
  if (!(READING_DRAFT_COMPAT_VERSIONS as readonly unknown[]).includes(draftVersion)) {
    return {
      contractVersion: VALIDATION_RESULT_CONTRACT_VERSION,
      ok: false,
      violations: [
        {
          code: 'UNSUPPORTED_CONTRACT_VERSION',
          severity: 'error',
          detail: 'ReadingDraft 的 contractVersion 不在受支持的版本列表内。',
          remediation:
            '使用 reading-draft/v2；legacy reading-draft/v1 仅在满足 v2 安全上限时有条件接受。',
        },
      ],
      violationsTruncated: false,
    };
  }
  const isLegacyV1 = draftVersion === 'reading-draft/v1';

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
  // smuggled past this gate by choosing a particular id. ALL visible text
  // (headings + paragraphs) counts against one shared budget. This verifies
  // "short and fact-free" only; it cannot prove the text semantically just
  // explains the limitation.
  if (answerPlan.answerability === 'not-supported') {
    let contentChars = 0;
    let citesFacts = false;
    for (const section of readingDraft.sections) {
      contentChars += section.heading.trim().length;
      for (const para of section.paragraphs) {
        contentChars += para.text.trim().length;
        if (para.sourceFactIds.length > 0) citesFacts = true;
      }
    }
    if (citesFacts || contentChars > MAX_NOT_SUPPORTED_TEXT_CHARS) {
      push({
        code: 'UNSUPPORTED_TOPIC',
        severity: 'error',
        detail:
          'AnswerPlan 标记为 not-supported，但草稿引用了 fact，或全部可见文本（标题+段落）超出简短说明的预算。',
        remediation:
          '当 answerability 为 not-supported 时，只能用不引用任何 fact 的简短说明（所有标题与段落合计不超过 MAX_NOT_SUPPORTED_TEXT_CHARS）解释引擎无法提供该主题的事实，并建议换一个主题。',
      });
    }
  }

  // 3 + 4. Per-section checks. Fact-citation exemption: v2 requires valid
  // constraintRefs on the paragraph; legacy v1 keeps the disclaimer/uncertainty
  // section-id exemption. The high-risk scan (4) covers every heading and
  // paragraph regardless.
  const referencedDisclaimers = new Set<number>();
  const referencedCaveats = new Set<number>();
  const referencedWarnings = new Set<number>();
  const constraintTargetLength = (kind: 'disclaimer' | 'caveat' | 'warning'): number =>
    kind === 'disclaimer'
      ? answerPlan.disclaimers.length
      : kind === 'caveat'
        ? answerPlan.requiredCaveats.length
        : answerPlan.requiredWarningCodes.length;

  for (let sIdx = 0; sIdx < readingDraft.sections.length; sIdx++) {
    const section = readingDraft.sections[sIdx]!;

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

      // 3c. Constraint references: every ref must resolve to a real plan entry.
      const refs = para.constraintRefs ?? [];
      let refsValid = refs.length > 0;
      for (let rIdx = 0; rIdx < refs.length; rIdx++) {
        const ref = refs[rIdx]!;
        if (ref.index >= constraintTargetLength(ref.kind)) {
          refsValid = false;
          push({
            code: 'INVALID_CONSTRAINT_REF',
            severity: 'error',
            sectionIndex: sIdx,
            field: 'paragraph',
            paragraphIndex: pIdx,
            itemIndex: rIdx,
            patternKey: ref.kind,
            detail:
              '段落的 constraintRef 未指向真实存在的 AnswerPlan 约束（见 itemIndex 对应的 constraintRefs 下标与 patternKey 对应的 kind）。',
            remediation:
              '只能引用 answerPlan.disclaimers / requiredCaveats / requiredWarningCodes 中真实存在的下标。',
          });
        }
      }
      if (refsValid) {
        for (const ref of refs) {
          if (ref.kind === 'disclaimer') referencedDisclaimers.add(ref.index);
          else if (ref.kind === 'caveat') referencedCaveats.add(ref.index);
          else referencedWarnings.add(ref.index);
        }
      }

      const exemptFromFactChecks =
        // not-supported drafts must be fact-free; the UNSUPPORTED_TOPIC gate
        // above governs them instead of the citation requirement.
        answerPlan.answerability === 'not-supported' ||
        (isLegacyV1 ? LEGACY_FACT_EXEMPT_SECTION_IDS.has(section.id) || refsValid : refsValid);

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
              '每个非约束表达段落必须引用至少一个 allowedFactIds 中的 fact ID；表达免责/caveat/warning 的段落必须通过 constraintRefs 引用真实存在的 AnswerPlan 约束。',
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

  // 5. Required caveats. v2: constraintRefs are the primary evidence and the
  // caveatsExpressed self-attestation must agree with them — one truth source,
  // no contradictions. v1: legacy set check only.
  const expressedCaveats = new Set(readingDraft.caveatsExpressed);
  for (let cIdx = 0; cIdx < answerPlan.requiredCaveats.length; cIdx++) {
    const declared = expressedCaveats.has(answerPlan.requiredCaveats[cIdx]!);
    if (isLegacyV1) {
      if (!declared) {
        push({
          code: 'MISSING_REQUIRED_CAVEAT',
          severity: 'error',
          itemIndex: cIdx,
          detail:
            '未声明表达必要的 caveat（见 itemIndex 对应的 answerPlan.requiredCaveats 下标）。',
          remediation:
            '在草稿的 uncertainty 或 disclaimer 部分明确表达此 caveat，并加入 caveatsExpressed。',
        });
      }
      continue;
    }
    const referenced = referencedCaveats.has(cIdx);
    if (!declared && !referenced) {
      push({
        code: 'MISSING_REQUIRED_CAVEAT',
        severity: 'error',
        itemIndex: cIdx,
        detail: '未声明表达必要的 caveat（见 itemIndex 对应的 answerPlan.requiredCaveats 下标）。',
        remediation:
          '用一个段落表达此 caveat 并加 constraintRefs {kind:"caveat", index}，同时将原文加入 caveatsExpressed。',
      });
    } else if (declared !== referenced) {
      push({
        code: 'CONSTRAINT_ATTESTATION_MISMATCH',
        severity: 'error',
        itemIndex: cIdx,
        patternKey: 'caveat',
        detail:
          'caveatsExpressed 与段落 constraintRefs 对同一 caveat 的声明不一致（见 itemIndex 对应的 answerPlan.requiredCaveats 下标）。',
        remediation:
          '两个来源必须一致：声明表达的每个 caveat 都要有对应的 constraintRef，反之亦然。',
      });
    }
  }

  // 6. Required warnings. Same v2 consistency rule as caveats.
  const disclosedWarnings = new Set(readingDraft.warningsDisclosed);
  for (let wIdx = 0; wIdx < answerPlan.requiredWarningCodes.length; wIdx++) {
    const declared = disclosedWarnings.has(answerPlan.requiredWarningCodes[wIdx]!);
    if (isLegacyV1) {
      if (!declared) {
        push({
          code: 'MISSING_REQUIRED_WARNING',
          severity: 'error',
          itemIndex: wIdx,
          detail:
            '未声明披露必要的 warning（见 itemIndex 对应的 answerPlan.requiredWarningCodes 下标）。',
          remediation: '在草稿中明确说明此 warning 的 impact/nextStep，并加入 warningsDisclosed。',
        });
      }
      continue;
    }
    const referenced = referencedWarnings.has(wIdx);
    if (!declared && !referenced) {
      push({
        code: 'MISSING_REQUIRED_WARNING',
        severity: 'error',
        itemIndex: wIdx,
        detail:
          '未声明披露必要的 warning（见 itemIndex 对应的 answerPlan.requiredWarningCodes 下标）。',
        remediation:
          '用一个段落说明此 warning 的 impact/nextStep 并加 constraintRefs {kind:"warning", index}，同时将 code 加入 warningsDisclosed。',
      });
    } else if (declared !== referenced) {
      push({
        code: 'CONSTRAINT_ATTESTATION_MISMATCH',
        severity: 'error',
        itemIndex: wIdx,
        patternKey: 'warning',
        detail:
          'warningsDisclosed 与段落 constraintRefs 对同一 warning 的声明不一致（见 itemIndex 对应的 answerPlan.requiredWarningCodes 下标）。',
        remediation:
          '两个来源必须一致：声明披露的每个 warning 都要有对应的 constraintRef，反之亦然。',
      });
    }
  }

  // 7. Disclaimers check. v2: at least one paragraph must reference a plan
  // disclaimer via constraintRefs; v1 keeps the legacy id/heading heuristic.
  if (answerPlan.disclaimers.length > 0) {
    const hasDisclaimer = isLegacyV1
      ? readingDraft.sections.some(
          (s) => s.id === 'disclaimer' || s.heading.includes('声明') || s.heading.includes('免责'),
        )
      : referencedDisclaimers.size > 0;
    if (!hasDisclaimer) {
      push({
        code: 'MISSING_DISCLAIMER',
        severity: 'warning',
        detail: 'AnswerPlan 包含 disclaimers 但草稿缺少对应的免责声明表达。',
        remediation:
          '用一个段落表达 AnswerPlan 的 disclaimers，并加 constraintRefs {kind:"disclaimer", index}（legacy v1：提供 id 为 "disclaimer" 的 section）。',
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

// --- Bounded parsing facade (shared by the CLI and the public JS API) ---

const BOUNDED_PARSE_REJECT_MESSAGE =
  'validate-answer input rejected by bounded preflight: missing required structure or a field exceeds the protective limits.';

function boundedReject(): never {
  // Static message only — never echoes any part of the rejected input.
  throw new Error(BOUNDED_PARSE_REJECT_MESSAGE);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function requireArrayWithin(v: unknown, max: number): unknown[] {
  if (!Array.isArray(v) || v.length > max) boundedReject();
  return v;
}

/**
 * Bounded parsing facade for ValidateAnswerInput: a shallow preflight confirms
 * every top-level and nested array length (O(1) length reads, bounded loops)
 * and every paragraph text length BEFORE the full Zod parse runs, so an
 * adversarially huge in-memory object is rejected at bounded cost. Callers that
 * already hold parsed-but-untrusted JSON (the CLI, host integrations) should
 * use this instead of the bare `ValidateAnswerInput.parse`, which expresses the
 * contract but is not itself fail-fast against arbitrarily large objects.
 * NOTE: this bounds the parse/validate stages only — reading a file and
 * JSON.parse happen before it (the CLI adds MAX_VALIDATE_ANSWER_INPUT_BYTES).
 */
export function parseValidateAnswerInputBounded(raw: unknown): ValidateAnswerInput {
  if (!isPlainObject(raw)) boundedReject();
  const plan = raw.answerPlan;
  const draft = raw.readingDraft;
  if (!isPlainObject(plan) || !isPlainObject(draft)) boundedReject();

  requireArrayWithin(plan.allowedFactIds, MAX_ALLOWED_FACT_IDS);
  requireArrayWithin(plan.requiredCaveats, MAX_REQUIRED_CAVEATS);
  requireArrayWithin(plan.requiredWarningCodes, MAX_REQUIRED_WARNING_CODES);
  requireArrayWithin(plan.guardrails, MAX_PLAN_GUARDRAILS);
  requireArrayWithin(plan.disclaimers, MAX_PLAN_DISCLAIMERS);

  const sections = requireArrayWithin(draft.sections, MAX_SECTIONS);
  requireArrayWithin(draft.caveatsExpressed, MAX_CAVEATS_EXPRESSED);
  requireArrayWithin(draft.warningsDisclosed, MAX_WARNINGS_DISCLOSED);
  for (const section of sections) {
    if (!isPlainObject(section)) boundedReject();
    const paragraphs = requireArrayWithin(section.paragraphs, MAX_PARAGRAPHS_PER_SECTION);
    for (const para of paragraphs) {
      if (!isPlainObject(para)) boundedReject();
      if (typeof para.text !== 'string' || para.text.length > MAX_PARAGRAPH_TEXT_CHARS) {
        boundedReject();
      }
      requireArrayWithin(para.sourceFactIds, MAX_SOURCE_FACT_IDS_PER_PARAGRAPH);
      if (para.constraintRefs !== undefined) {
        requireArrayWithin(para.constraintRefs, MAX_CONSTRAINT_REFS_PER_PARAGRAPH);
      }
    }
  }

  return ValidateAnswerInputSchema.parse(raw);
}
