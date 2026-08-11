/**
 * reading-lint — deterministic, offline delivery-surface guard for the final
 * user-visible topic report. It does NOT read facts/schema; it inspects only the
 * produced markdown text. Professional terms may appear in the natural narrative when
 * they are explained through a concrete mechanism and implication. Internal labels,
 * raw source identifiers, warning blocks, fixed disclaimers and automatic follow-up
 * menus must never leak into the default delivery surface.
 *
 * It also keeps the existing anti-empty-talk, repetition and overreach checks. The
 * host rewrites after a failure (no mechanical replacement). Static text structure
 * cannot prove a host model complies 100% of the time (see docs/VALIDATION.md).
 */

export type ReadingChannel = 'topic' | 'full';
export interface ReadingLintOptions {
  channel?: ReadingChannel;
  simple?: boolean;
  /** Explicit technical-detail view; default delivery never exposes source identifiers. */
  technicalDetails?: boolean;
}
export type ViolationCategory = '黑话强' | '黑话软' | '空话' | '重复' | '越界' | '交付面';
export type ViolationSeverity = 'error' | 'warn';
export interface ReadingViolation {
  section: string;
  term: string;
  category: ViolationCategory;
  severity: ViolationSeverity;
  line: number;
  replacementHint: string;
}
export interface ReadingLintResult {
  ok: boolean;
  violations: ReadingViolation[];
}

// --- Seven-step section detection ------------------------------------------------
const STEP_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: '30秒看懂', re: /30\s*秒看懂/ },
  { name: '现实中会怎么表现', re: /现实中会怎么表现|现实表现/ },
  { name: '最可能出现的具体场景', re: /最可能出现的具体场景|具体场景/ },
  { name: '时间线', re: /时间线/ },
  { name: '可以怎么做', re: /可以怎么做/ },
  { name: '专业依据', re: /专业依据/ },
  { name: '信息可靠性与声明', re: /信息可靠性与声明|信息可靠性|排盘校对|免责声明/ },
];

// --- Term lists (BaZi / Zi Wei / Western / time) ---------------------------------
const MINGLI_BAZI = [
  '正财',
  '偏财',
  '财星',
  '财格',
  '正官',
  '七杀',
  '官杀',
  '食神',
  '伤官',
  '食伤',
  '正印',
  '偏印',
  '印星',
  '比肩',
  '劫财',
  '比劫',
  '日主',
  '日支',
  '身强',
  '身弱',
  '得令',
  '得地',
  '得势',
  '建禄',
  '月劫',
  '格局',
  '透干',
  '藏干',
  '通根',
  '贴身',
  '合身',
  '喜用神',
  '喜用五行',
  '喜用',
  '用神',
  '忌神',
  '神煞',
  '伏吟',
  '自刑',
  '六合',
  '三合',
  '刑冲合害',
  '桃花',
  '咸池',
  '红鸾',
  '孤辰',
  '寡宿',
];
const MINGLI_ZIWEI = [
  '命宫',
  '夫妻宫',
  '官禄宫',
  '财帛宫',
  '疾厄宫',
  '迁移宫',
  '福德宫',
  '兄弟宫',
  '子女宫',
  '田宅宫',
  '父母宫',
  '交友宫',
  '仆役宫',
  '身宫',
  '紫微',
  '天府',
  '破军',
  '太阴',
  '贪狼',
  '巨门',
  '天相',
  '天梁',
  '天机',
  '武曲',
  '廉贞',
  '天同',
  '文昌',
  '文曲',
  '左辅',
  '右弼',
  '禄存',
  '擎羊',
  '太阳',
  '化禄',
  '化权',
  '化科',
  '化忌',
  '四化',
];
const MINGLI_WEST = [
  '七宫主',
  '宫主星',
  '合相',
  '刑相',
  '冲相',
  '拱相',
  '六分相',
  '落宫',
  '失势',
  '落陷',
  '水逆',
  '入庙',
  '庙旺',
];
const MINGLI_TIME = ['大运', '流年', '偏吉', '偏凶', '偏中性', '窗口期', '能量激活', '议题浮现'];

export const JARGON_STRONG = [
  '定价权',
  '话语权',
  '决定权',
  '专业壁垒',
  '平台核心',
  '成果外化',
  '高自主度',
  '资源整合',
  '方法论',
  '生态位',
  '赛道',
  '抓手',
  '赋能',
  '闭环',
  '逐步争取客户、项目和报价上的决定权',
];
export const JARGON_SOFT = [
  '职业路径',
  '商业化',
  '可迁移能力',
  '权责与名分',
  '岗位错配',
  '掌握客户',
  '掌握项目',
  '掌握客户/项目',
];

export const READING_TERMS = {
  bazi: MINGLI_BAZI,
  ziwei: MINGLI_ZIWEI,
  western: MINGLI_WEST,
  time: MINGLI_TIME,
  jargonStrong: JARGON_STRONG,
  jargonSoft: JARGON_SOFT,
};

const HINTS: Record<string, string> = {
  食伤: '技能或作品开始形成收入',
  食神: '技能或作品开始形成收入',
  伤官: '表达或作品带来收入',
  财星: '重视稳定回报与客户关系',
  正财: '重视稳定回报与客户关系',
  偏财: '灵活的收入机会',
  贴身: '紧接着说明这项干支或位置关系对应的规则机制和现实含义',
  官杀: '早期承担的责任与拿到的职位/权限可能不完全匹配',
  正官: '职位、规则与责任',
  七杀: '压力、考核与责任',
  官禄宫: '事业更适合稳步积累、靠长期信用与管理发展',
  财帛宫: '紧接着说明宫位含义如何落到具体的收支或决策习惯',
  夫妻宫: '改说伴侣特质或关系氛围',
  喜用五行: '转成具体能力或工作环境，不推荐五行行业',
  喜用神: '转成具体能力或工作环境',
  喜用: '转成具体能力或工作环境',
  劫财: '同行竞争、合作分账或共同支出增加',
  大运: '把干支/大运移到"专业依据"，正文只说年份与现实主题',
  流年: '正文只说年份与现实主题，干支进"专业依据"',
  定价权: '自己报价、知道一项工作该收多少钱',
  决定权: '可以自己决定接什么工作、怎么做',
  话语权: '说话更有分量、意见更被听',
  平台核心: '在公司里成为能独立负责重要工作的人',
  成果外化: '把做过的事整理出来，让老板或客户看得见',
  专业壁垒: '把一项本事练到别人很难替代',
  高自主度: '以后可以自己挑工作，也可以自己接活',
};
function hintFor(term: string): string {
  return HINTS[term] ?? '改写成具体的人、场景和动作，并让术语的机制与现实含义紧邻出现';
}

interface TermSpec {
  re: RegExp;
  category: ViolationCategory;
}
function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function buildTermSpecs(): TermSpec[] {
  const specs: TermSpec[] = [];
  for (const t of JARGON_STRONG) specs.push({ re: new RegExp(esc(t), 'g'), category: '黑话强' });
  for (const t of JARGON_SOFT) specs.push({ re: new RegExp(esc(t), 'g'), category: '黑话软' });
  return specs;
}
const JARGON_SPECS = buildTermSpecs();

const FOLLOWUP_RE = /还想看|想看更多|想继续看|继续(?:看|了解)|想深入看|接下来想看/;

/**
 * Default answers are prose only. These strings identify internal-control leakage,
 * rather than ordinary astrological vocabulary. Keep this list deliberately narrow:
 * a natural caveat about an uncertain birth time is allowed; a rendered warning panel
 * or raw evidence identifier is not.
 */
const DELIVERY_LEAKS: Array<{ term: string; re: RegExp; hint: string }> = [
  {
    term: '模板标题',
    re: /^\s{0,3}#{1,6}\s+/,
    hint: '默认交付使用连续自然段；只有用户明确要求结构化报告时才使用标题',
  },
  {
    term: '敏感项校对',
    re: /敏感项校对/,
    hint: '将受影响范围自然写进相关段落，不展示校对标题或后台检查结果',
  },
  {
    term: '引擎警告',
    re: /引擎警告|EngineWarning|ENGINE_WARNING/,
    hint: '只在该限制影响当前问题时，用自然语言说明受影响的判断范围',
  },
  {
    term: '专业依据',
    re: /专业依据/,
    hint: '把术语、机制和现实含义融入正文；技术细节仅在用户主动追问时展开',
  },
  {
    term: '声明',
    re: /(?:^|[#*\s])(?:信息可靠性与)?声明(?:\*{0,2})?(?:[：:]|$)/m,
    hint: '移除固定声明块；仅在与当前问题相关的位置自然表达必要边界',
  },
  {
    term: '免责声明',
    re: /免责声明|重要声明/,
    hint: '移除固定免责声明页脚；高风险问题只保留最小必要的自然提示',
  },
  {
    term: '固定免责声明页脚',
    re: /^\s*(?:传统命理.{0,80}(?:仅供|非科学预测)|仅供传统文化.{0,80}|.{0,80}非科学预测.{0,80})\s*$/,
    hint: '删除固定页脚；仅在当前问题确有必要时，把边界自然写入相关段落',
  },
  {
    term: '原始来源标识',
    re: /(?:evidenceRef|factId|rulesetId|schemaVersion|provider|\bref\s*:|\bruleId\s*:)/i,
    hint: '将事实编号、规则编号和来源路径保留在内部追踪记录或按需技术详情中',
  },
];

// --- Vagueness ("empty talk") detection (ADR 0012, tightened in 9.1) -----------
// Abstract goals / abilities / advice that say nothing concrete. A sentence carrying
// an abstract marker must ALSO contain a concrete ACTION / observable behaviour IN THE
// SAME sentence (numbers and life-nouns are only auxiliary and cannot pass a sentence
// on their own; an unrelated concrete NEXT sentence cannot rescue it). Heuristic: it
// cannot judge meaning, only same-sentence concreteness (see docs/VALIDATION.md).
const VAGUE_MARKERS = [
  // 抽象目标（只有目标、没有动作）
  '提升竞争力',
  '竞争力',
  '竞争优势',
  '长期优势',
  '长期竞争优势',
  '实现突破',
  '事业突破',
  '突破自我',
  '把握机会',
  '把握好机会',
  '抱住机会',
  '稳中求进',
  '持续深耕',
  '深耕',
  '做好规划',
  '增强变现',
  '变现能力',
  '扩大影响力',
  '找准方向',
  '明确方向',
  '价值转化',
  '实现自我价值',
  '提升关系质量',
  '关系质量',
  '处理安全感',
  '安全感',
  '稳步提升',
  '全面提升',
  '争取自主权',
  '争取更多自主权',
  // 抽象能力（只有能力、没有表现）
  '专业能力较强',
  '能力较强',
  '能力突出',
  '需要边界',
  '注意边界',
  '承载能力',
  '财务承载',
  '成长空间',
  '发展空间',
  '成长潜力',
  '有潜力',
  // 不可执行建议（只有口号）
  '主动把握',
  '加强沟通',
  '做好风险控制',
  '风险控制',
  '发挥自身优势',
  '发挥优势',
  '保持稳定心态',
  '稳定心态',
  '保持良好心态',
  '积极面对',
  '理性看待',
  '妥善处理',
  '合理安排',
  '注意平衡',
  '学会平衡',
];
// Concrete ACTION / observable-behaviour verbs. REQUIRED (in the same sentence) for a
// sentence that also carries an abstract marker. Life-nouns and numbers alone do NOT
// satisfy this — “在工作中提高竞争力”“未来3年稳中求进” have nouns/numbers but no action.
const CONCRETE_ACTION_RE =
  /分开|分开放|分开记|分成|拆分|记录|记账|记下来|存下|存入|存够|存一笔|固定存|强制储蓄|储蓄|列出|列个|列出来|写进|写下|写下来|写清楚|签|整理|复盘|对账|核对|核实|预算|留[出下备]|备[好足]|控制|控住|收紧|抓住|抓订单|准备|对齐|摊开|说清楚|说出来|讲清楚|讲给|商量|沟通|约[定好]|见面|同居|搬|跳槽|换[到个成工城]|挑选|挑[一]|选[择定]|谈[清拢定]|定[下来]|负责|接[活手]|参与|学[会到]|练[熟出]|考[下证]|做出|做扎实|做熟|做成|拿出|拿给|交付|报价|争取|商量|安排|偿还|还清|分开记录|主动把|先.{0,10}(?:再|然后|之后)/;
const VAGUE_HINT =
  '抽象判断必须在同一句用具体动作/可观察表现讲清楚（数字、生活名词只是辅助，不能单独算具体；下一句不相关内容不算）';

// --- Fact-boundary detection (9.1.1): no unsupported prediction / comparison / assumed fact ---
// “加薪/升职” only allowed when the report actually carries an income fact.
const INCOME_FACT_RE = /收入|薪资|薪水|薪酬|进账|赚|回报|财运|财星|财格|得财|进财/;
const RAISE_RE = /加薪|升职|升上去|晋升|涨薪|涨工资/;
const SUCCESS_GUARANTEE_RE = /肯定能|一定能|必定能|做得出来|肯定做得|一定能做好|必然能|保证能|稳能/;
const RELATIONSHIP_FATE_RE = /注定在一起|必分手|必然分手|一定分手|必然结婚|一定结婚|命定伴侣/;
const GROUP_COMPARE_RE = /比同龄人|比大多数人|比别人|比常人|比一般人|比身边人|比同期/;
// Asserting the user's real-life situation as an established fact (no 如果/可能/例如… nearby).
const ASSUMED_FACT_RE =
  /你现在有|你有一份|你有一个|你已经有|你已经|你和别人正在|你正在和|你目前在|你现在正在|你和[^，。！？；]{0,8}正在|你现在(?:在|有)/;
const CONDITIONAL_RE =
  /如果|若|假如|假设|可能|例如|比如|也许|或许|万一|以后|未来|一旦|要是|常见表现|可能出现|会出现|会有这样|或会/;

interface Sentence {
  text: string;
  line: number;
  zone: string;
  offset: number; // absolute char offset of the line start within the checked stream
  strictSection: boolean;
  followup: boolean;
  isHeading: boolean;
}

/** Break the report into per-sentence units for the default delivery surface. */
function splitSentences(md: string): Sentence[] {
  const lines = md.split(/\r?\n/);
  const out: Sentence[] = [];
  let section = 'preamble';
  let checkedChars = 0;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const followup = FOLLOWUP_RE.test(raw);
    // A step heading sets the section; only markdown/bold/numbered/short step lines
    // count as headings. Bullets (- **【核心结论】…**) and short content sentences are
    // real content and MUST be checked (they are where 30秒看懂 vagueness hides).
    const mdHeading = /^\s{0,3}#{1,6}\s/.test(raw);
    const boldOnly = /^\s{0,3}\*\*[^*]+\*\*\s*$/.test(raw);
    const stepHit = STEP_PATTERNS.some((sp) => sp.re.test(raw));
    const looksHeading =
      mdHeading || boldOnly || /^\s{0,3}\d+[.、)]\s/.test(raw) || raw.trim().length <= 16;
    if (!followup && stepHit && looksHeading) {
      for (const sp of STEP_PATTERNS) {
        if (sp.re.test(raw)) {
          section = sp.name;
          break;
        }
      }
    }
    const heading = !followup && (mdHeading || boldOnly || (stepHit && looksHeading));
    const baseOffset = checkedChars;
    checkedChars += raw.length;
    if (raw.trim() === '') continue;
    const zone = followup ? '追问入口' : section;
    const strictSection = section === 'preamble' || section === '30秒看懂';
    const parts = raw
      .split(/[。！？!?；;]+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    for (const p of parts) {
      out.push({
        text: p,
        line: i + 1,
        zone,
        offset: baseOffset,
        strictSection,
        followup,
        isHeading: heading,
      });
    }
  }
  return out;
}

/**
 * Lint a produced reading. `channel:'full'` (Channel A / raw chart) is always allowed.
 * For the default topic delivery, professional vocabulary is permitted, but internal
 * presentation labels and raw source identifiers are rejected. Strong jargon is an
 * error; soft jargon is a warning except in the first-200-char zone or `simple` mode.
 */
export function lintReading(md: string, options: ReadingLintOptions = {}): ReadingLintResult {
  if ((options.channel ?? 'topic') === 'full') return { ok: true, violations: [] };
  const simple = options.simple ?? false;
  const sentences = splitSentences(md);
  const violations: ReadingViolation[] = [];
  const seen = new Set<string>();

  if (!options.technicalDetails) {
    for (const [index, raw] of md.split(/\r?\n/).entries()) {
      for (const leak of DELIVERY_LEAKS) {
        if (!leak.re.test(raw)) continue;
        const key = `delivery|${index + 1}|${leak.term}`;
        if (seen.has(key)) continue;
        seen.add(key);
        violations.push({
          section: '交付面',
          term: leak.term,
          category: '交付面',
          severity: 'error',
          line: index + 1,
          replacementHint: leak.hint,
        });
      }
      if (FOLLOWUP_RE.test(raw)) {
        const key = `delivery|${index + 1}|自动追问`;
        if (seen.has(key)) continue;
        seen.add(key);
        violations.push({
          section: '交付面',
          term: '自动追问',
          category: '交付面',
          severity: 'error',
          line: index + 1,
          replacementHint: '删除自动追问菜单；仅在用户主动要求继续时自然接续',
        });
      }
    }
  }

  for (let s = 0; s < sentences.length; s++) {
    const sent = sentences[s]!;
    // --- jargon (professional astrological vocabulary is allowed in V1) ---
    const softHits: Array<{ term: string; strict: boolean }> = [];
    for (const spec of JARGON_SPECS) {
      spec.re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = spec.re.exec(sent.text)) !== null) {
        const term = m[0];
        const matchIndex = m.index;
        if (spec.re.lastIndex === matchIndex) spec.re.lastIndex++;
        const strict = sent.strictSection || sent.offset + matchIndex < 200;
        if (spec.category === '黑话软') {
          softHits.push({ term, strict });
          continue;
        }
        const key = `${sent.line}|${term}|${spec.category}`;
        if (seen.has(key)) continue;
        seen.add(key);
        violations.push({
          section: sent.zone,
          term,
          category: spec.category,
          severity: 'error',
          line: sent.line,
          replacementHint: hintFor(term),
        });
      }
    }
    if (softHits.length > 0) {
      // 同一句≥ 2 个软黑话 → error；否则仅在 30秒/前200字/simple 为 error，其余 warn。
      const stacked = softHits.length >= 2;
      for (const h of softHits) {
        const key = `${sent.line}|${h.term}|黑话软`;
        if (seen.has(key)) continue;
        seen.add(key);
        const severity: ViolationSeverity = h.strict || simple || stacked ? 'error' : 'warn';
        violations.push({
          section: sent.zone,
          term: h.term,
          category: '黑话软',
          severity,
          line: sent.line,
          replacementHint: hintFor(h.term),
        });
      }
    }
    // --- vagueness (空话): abstract marker without a concrete ACTION in the SAME sentence ---
    if (!sent.isHeading && !sent.followup) {
      const marker = VAGUE_MARKERS.find((mk) => sent.text.includes(mk));
      if (marker !== undefined && !CONCRETE_ACTION_RE.test(sent.text)) {
        const key = `${sent.line}|${marker}|空话`;
        if (!seen.has(key)) {
          seen.add(key);
          violations.push({
            section: sent.zone,
            term: marker,
            category: '空话',
            severity: 'error',
            line: sent.line,
            replacementHint: VAGUE_HINT,
          });
        }
      }
    }
    // --- fact-boundary (越界): unsupported prediction / comparison / assumed fact (9.1.1) ---
    if (!sent.isHeading && !sent.followup) {
      if (RAISE_RE.test(sent.text) && !INCOME_FACT_RE.test(md)) {
        const key = `${sent.line}|加薪越界|越界`;
        if (!seen.has(key)) {
          seen.add(key);
          violations.push({
            section: sent.zone,
            term: '加薪/升职越界',
            category: '越界',
            severity: 'error',
            line: sent.line,
            replacementHint:
              'facts 只支持责任/职位机会时不得写“加薪/升职”；改为“可能负责重要工作或出现职位调整，收入是否增加仍取决于公司和岗位”',
          });
        }
      }
      if (SUCCESS_GUARANTEE_RE.test(sent.text)) {
        const key = `${sent.line}|成功保证|越界`;
        if (!seen.has(key)) {
          seen.add(key);
          violations.push({
            section: sent.zone,
            term: '成功保证',
            category: '越界',
            severity: 'error',
            line: sent.line,
            replacementHint:
              '性格倾向不等于结果保证；区分“愿意做/可能擅长”与“实际能否完成”，加上“还要看经验、时间和团队支持”',
          });
        }
      }
      if (RELATIONSHIP_FATE_RE.test(sent.text)) {
        const key = `${sent.line}|关系命定断言|越界`;
        if (!seen.has(key)) {
          seen.add(key);
          violations.push({
            section: sent.zone,
            term: '关系命定断言',
            category: '越界',
            severity: 'error',
            line: sent.line,
            replacementHint:
              '只能描述互动模式、压力条件和相处建议；不得断言“注定在一起/必分手/一定结婚”',
          });
        }
      }
      if (GROUP_COMPARE_RE.test(sent.text)) {
        const key = `${sent.line}|群体比较|越界`;
        if (!seen.has(key)) {
          seen.add(key);
          violations.push({
            section: sent.zone,
            term: '群体比较',
            category: '越界',
            severity: 'error',
            line: sent.line,
            replacementHint: 'facts 无群体比较数据，不得用“比同龄人/比大多数人/比别人更强”等表达',
          });
        }
      }
      if (ASSUMED_FACT_RE.test(sent.text) && !CONDITIONAL_RE.test(sent.text)) {
        const key = `${sent.line}|既成事实|越界`;
        if (!seen.has(key)) {
          seen.add(key);
          violations.push({
            section: sent.zone,
            term: '既成事实',
            category: '越界',
            severity: 'error',
            line: sent.line,
            replacementHint:
              '引擎不知用户现实经历，须用“例如/可能出现/如果以后/常见表现可能是”等条件表达，不得认定已上班/合伙/结婚/异地/买房/负债',
          });
        }
      }
    }
  }

  // --- repetition (warn): the same judgement re-worded across sections (9.1) ---
  const content = sentences.filter(
    (x) => !x.isHeading && !x.followup && x.text.replace(/[\s*【】]/g, '').length >= 8,
  );
  const exact = new Map<string, Sentence[]>();
  for (const s of content) {
    const k = s.text.replace(/[\s*【】]/g, '');
    const arr = exact.get(k);
    if (arr) arr.push(s);
    else exact.set(k, [s]);
  }
  for (const [k, arr] of exact) {
    if (arr.length > 1 && k.length >= 10) {
      violations.push({
        section: arr[1]!.zone,
        term: k.slice(0, 12),
        category: '重复',
        severity: 'warn',
        line: arr[1]!.line,
        replacementHint: '同一判断在多个部分重复，请合并或让每节提供新信息',
      });
    }
  }
  for (let a = 0; a < content.length; a++) {
    for (let b = a + 1; b < content.length; b++) {
      const sa = content[a]!;
      const sb = content[b]!;
      if (sa.line === sb.line) continue;
      const sim = bigramSimilarity(sa.text, sb.text);
      if (sim >= 0.7) {
        const key = `sim|${Math.min(sa.line, sb.line)}|${Math.max(sa.line, sb.line)}`;
        if (!seen.has(key)) {
          seen.add(key);
          violations.push({
            section: sb.zone,
            term: sb.text.slice(0, 12),
            category: '重复',
            severity: 'warn',
            line: sb.line,
            replacementHint: '与另一句高度相似，请合并或改写以避免重复',
          });
        }
      }
    }
  }

  const ok = !violations.some((v) => v.severity === 'error');
  return { ok, violations };
}

/** Character-bigram Jaccard similarity (0..1) for repetition detection. */
function bigramSimilarity(a: string, b: string): number {
  const na = a.replace(/[\s*【】]/g, '');
  const nb = b.replace(/[\s*【】]/g, '');
  if (na.length < 12 || nb.length < 12) return 0;
  const grams = (s: string): Set<string> => {
    const out = new Set<string>();
    for (let i = 0; i + 2 <= s.length; i++) out.add(s.slice(i, i + 2));
    return out;
  };
  const ga = grams(na);
  const gb = grams(nb);
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter++;
  const union = ga.size + gb.size - inter;
  return union === 0 ? 0 : inter / union;
}
