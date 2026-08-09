import {
  interpretBazi,
  missingElements,
  industryFinding,
  marriageTimingFinding,
  elementsByRelation,
  type Element,
} from '@ming/bazi-rules';
import { interpretWestern } from '@ming/western-rules';
import { interpretZiwei as interpretZiweiRules } from '@ming/ziwei-rules';
import { interpretVedic } from '@ming/vedic-rules';
import type {
  BaziInterpretation,
  ChartBundle,
  EvidenceKind,
  InterpretationEvidence,
  InterpretationFact,
  InterpretationFacts,
  InterpretationTopic,
  WesternChartResult,
  WesternInterpretation,
  VedicInterpretation,
  ZiweiChartResult,
  ZiweiHoroscopeResult,
  ZiweiInterpretation,
} from '@ming/contracts';

/**
 * Build the cross-system interpretation-facts document (handoff §8 layer 2). Pure,
 * deterministic, offline and de-identified: it reads the computed ChartBundle (and an
 * optional Zi Wei horoscope), runs the sourced BaZi rules, and emits topic-organized
 * facts whose every claim points back at a chart fact or rule. No prose, no prediction,
 * no invented values. This is the substrate a host LLM reads to write a reading.
 */

const DISCLAIMERS: string[] = [
  '传统命理分析（八字/紫微/占星），仅供传统文化、娱乐与自我反思；文中的吉凶倾向、趋势与年份窗口属于命理条件评估，非统计学、非科学预测。',
  '只据本文 facts 作答（引用其 reason 与 evidence 的 ref/ruleId/出处），不编造星位/宫位/干支/星曜或规则结论；反绝对化——命由经营、非注定。',
  '不得对医疗、法律、投资、生死等重大事项给出确定性断言；健康提示仅为五行/宫位结构描述、非医疗建议。',
  '基于脱敏命盘离线计算（不含姓名与人生事件）；不为“提升准确度”索取或臆断个人隐私。',
];

/** Standardized follow-up entries — plain user-facing wording (host presents as one short line). */
const FOLLOWUP_OFFERS: string[] = [
  '事业：适合什么工作、什么时候更容易起势',
  '感情：相处模式、对象倾向和关键年份',
  '财运：主要赚钱方式、收入阶段和存钱难点',
  '学业：学习优势、适合的提升方法',
  '流年：今年最值得把握和最需要注意什么',
];

export interface InterpretOptions {
  /** Optional Zi Wei dynamic chart (运限盘) to enrich time-sensitive topics. */
  horoscope?: ZiweiHoroscopeResult | null;
}

function ev(kind: EvidenceKind, ref: string, note: string): InterpretationEvidence {
  return { kind, ref, note };
}

function fact(
  topic: InterpretationTopic,
  claim: string,
  evidence: InterpretationEvidence[],
  extra: Partial<Pick<InterpretationFact, 'confidence' | 'caveat' | 'reason' | 'polarity'>> = {},
): InterpretationFact {
  return { topic, claim, evidence, ...extra };
}

// --- accessors ------------------------------------------------------------------
function westernPlanet(w: WesternChartResult | undefined, body: string) {
  return w?.planets.find((p) => p.body === body);
}
function ziweiPalace(z: ZiweiChartResult | undefined, name: string) {
  // iztro names the soul palace "命宫" (with 宫) but the others bare ("夫妻"/"官禄"/…);
  // match tolerantly by stripping a trailing 宫 on both sides.
  const strip = (s: string) => s.replace(/宫$/, '');
  const target = strip(name);
  return z?.palaces.find((p) => strip(p.name) === target);
}
function starNames(palace: {
  majorStars: { name: string }[];
  minorStars: { name: string }[];
}): string {
  return [...palace.majorStars, ...palace.minorStars].map((s) => s.name).join('、') || '无正曜';
}
function baziRuleClaim(rules: BaziInterpretation | null, topic: string): string | undefined {
  return rules?.findings.find((f) => f.topic === topic)?.claim;
}
function baziRuleReason(rules: BaziInterpretation | null, topic: string): string | undefined {
  return rules?.findings.find((f) => f.topic === topic)?.reason;
}
function findingsByTopic(rules: BaziInterpretation | null, topic: string) {
  return rules?.findings.filter((f) => f.topic === topic) ?? [];
}

// --- topic builders --------------------------------------------------------------
function characterFacts(
  bundle: ChartBundle,
  rules: BaziInterpretation | null,
): InterpretationFact[] {
  const out: InterpretationFact[] = [];
  const b = bundle.bazi;
  if (b) {
    // Four pillars display (uses tenGodDisplay so the day column always shows 日主).
    const cols = [
      { label: '年', p: b.pillars.year },
      { label: '月', p: b.pillars.month },
      { label: '日', p: b.pillars.day },
      { label: '时', p: b.pillars.hour },
    ];
    const pillarStr = cols
      .map((c) =>
        c.p ? `${c.label}:${c.p.stem}${c.p.branch}(${c.p.tenGodDisplay})` : `${c.label}:—`,
      )
      .join('  ');
    out.push(
      fact('character', `四柱：${pillarStr}`, [
        ev('bazi', 'bazi.pillars.*.(stem|branch|tenGodDisplay)', pillarStr),
      ]),
    );

    const strength = baziRuleClaim(rules, 'strength');
    out.push(
      fact(
        'character',
        `八字日主为${b.dayMaster.stem}${b.dayMaster.element}（${b.dayMaster.yinYang}），${strength ?? '强弱详见规则'}`,
        [
          ev(
            'bazi',
            'bazi.dayMaster',
            `${b.dayMaster.stem} ${b.dayMaster.element} ${b.dayMaster.yinYang}`,
          ),
          ...(rules ? [ev('bazi-rule', 'bazi-rule/strength', strength ?? '')] : []),
        ],
        { reason: baziRuleReason(rules, 'strength') },
      ),
    );

    const missing = missingElements(b);
    out.push(
      fact(
        'character',
        `五行缺失：${missing.length > 0 ? `命局无${missing.join('、')}` : '五行俱全'}`,
        [ev('bazi', 'bazi.pillars.*.(stemElement|hiddenStems)', missing.join('、') || '俱全')],
        {
          reason:
            missing.length > 0
              ? `命局完全不见${missing.join('、')}；缺失非“无此能力”——若为喜用则该向度先天偏弱、须后天训练与岁运补足（如缺食伤=持续输出/商业包装/定价/标准化需练，创造潜力另见紫微、占星），非命定短板。`
              : undefined,
          caveat: '缺某五行不等于凶；需结合喜忌判定其轻重。',
        },
      ),
    );
  }
  const sun = westernPlanet(bundle.western, 'Sun');
  if (sun) {
    out.push(
      fact('character', `西方占星太阳位于${sun.sign} ${sun.signDeg.toFixed(1)}°`, [
        ev('western', 'western.planets[Sun].sign', `${sun.sign} ${sun.signDeg.toFixed(2)}°`),
      ]),
    );
  }
  const soul = ziweiPalace(bundle.ziwei, '命宫');
  if (bundle.ziwei && soul) {
    out.push(
      fact(
        'character',
        `紫微命宫（${soul.heavenlyStem}${soul.earthlyBranch}）主星：${starNames(soul)}`,
        [ev('ziwei', 'ziwei.palaces[命宫].majorStars', starNames(soul))],
      ),
    );
  }
  return out;
}

function careerFacts(bundle: ChartBundle, rules: BaziInterpretation | null): InterpretationFact[] {
  const out: InterpretationFact[] = [];
  const b = bundle.bazi;
  if (b) {
    const officers = [b.pillars.year, b.pillars.month, b.pillars.day, b.pillars.hour]
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .map((p) => p.tenGod)
      .filter((g): g is string => g === '正官' || g === '七杀');
    const pattern = baziRuleClaim(rules, 'pattern');
    if (officers.length > 0 || pattern) {
      out.push(
        fact(
          'career',
          `事业相关十神（官杀）：${officers.length > 0 ? [...new Set(officers)].join('、') : '未透干'}${pattern ? `；${pattern}` : ''}`,
          [
            ev('bazi', 'bazi.pillars.*.tenGod', [...new Set(officers)].join('、') || '无'),
            ...(rules ? [ev('bazi-rule', 'bazi-rule/pattern', pattern ?? '')] : []),
          ],
          { caveat: '官杀仅示事业/责任倾向的结构，非职业预言。' },
        ),
      );
    }
  }
  const mc = bundle.western?.angles?.mc;
  if (mc) {
    out.push(
      fact(
        'career',
        `西方中天（MC）位于${mc.sign}`,
        [ev('western', 'western.angles.mc.sign', mc.sign)],
        {
          caveat: '需确切出生时间方有宫位。',
        },
      ),
    );
  }
  const career = ziweiPalace(bundle.ziwei, '官禄宫');
  if (bundle.ziwei && career) {
    out.push(
      fact(
        'career',
        `紫微官禄宫（${career.heavenlyStem}${career.earthlyBranch}）：${starNames(career)}`,
        [ev('ziwei', 'ziwei.palaces[官禄宫]', starNames(career))],
      ),
    );
  }
  return out;
}

function wealthFacts(bundle: ChartBundle): InterpretationFact[] {
  const out: InterpretationFact[] = [];
  const b = bundle.bazi;
  if (b) {
    const wealth = [b.pillars.year, b.pillars.month, b.pillars.day, b.pillars.hour]
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .map((p) => p.tenGod)
      .filter((g): g is string => g === '正财' || g === '偏财');
    if (wealth.length > 0) {
      out.push(
        fact('wealth', `财运相关十神（财星）：${[...new Set(wealth)].join('、')}`, [
          ev('bazi', 'bazi.pillars.*.tenGod', [...new Set(wealth)].join('、')),
        ]),
      );
    }
  }
  const wealthPalace = ziweiPalace(bundle.ziwei, '财帛宫');
  if (bundle.ziwei && wealthPalace) {
    out.push(
      fact(
        'wealth',
        `紫微财帛宫（${wealthPalace.heavenlyStem}${wealthPalace.earthlyBranch}）：${starNames(wealthPalace)}`,
        [ev('ziwei', 'ziwei.palaces[财帛宫]', starNames(wealthPalace))],
      ),
    );
  }
  const venus = westernPlanet(bundle.western, 'Venus');
  if (venus) {
    out.push(
      fact('wealth', `西方金星位于${venus.sign}（第${venus.house ?? '—'}宫）`, [
        ev('western', 'western.planets[Venus]', `${venus.sign} house ${venus.house ?? '—'}`),
      ]),
    );
  }
  return out;
}

// --- Western relationship helpers: 7th-house ruler (classical) + relationship aspects ---
const SIGN_RULER: Record<string, string> = {
  Aries: 'Mars',
  Taurus: 'Venus',
  Gemini: 'Mercury',
  Cancer: 'Moon',
  Leo: 'Sun',
  Virgo: 'Mercury',
  Libra: 'Venus',
  Scorpio: 'Mars',
  Sagittarius: 'Jupiter',
  Capricorn: 'Saturn',
  Aquarius: 'Saturn',
  Pisces: 'Jupiter',
};
const PLANET_CN: Record<string, string> = {
  Sun: '太阳',
  Moon: '月亮',
  Mercury: '水星',
  Venus: '金星',
  Mars: '火星',
  Jupiter: '木星',
  Saturn: '土星',
  Uranus: '天王星',
  Neptune: '海王星',
  Pluto: '冥王星',
};
const SIGN_CN: Record<string, string> = {
  Aries: '白羊',
  Taurus: '金牛',
  Gemini: '双子',
  Cancer: '巨蟹',
  Leo: '狮子',
  Virgo: '处女',
  Libra: '天秤',
  Scorpio: '天蝎',
  Sagittarius: '射手',
  Capricorn: '摩羯',
  Aquarius: '水瓶',
  Pisces: '双鱼',
};
const DIGNITY_CN: Record<string, string> = {
  domicile: '入庙(本位)',
  exaltation: '入旺',
  detriment: '失势',
  fall: '落陷',
};
const ASPECT_CN: Record<string, string> = {
  conjunction: '合',
  opposition: '冲',
  trine: '拱',
  square: '刑',
  sextile: '六分',
};

function marriageFacts(bundle: ChartBundle): InterpretationFact[] {
  const out: InterpretationFact[] = [];
  const b = bundle.bazi;
  const gender = bundle.originalInput.ruleGender;
  if (b) {
    const spouseStar = gender === 'male' ? '正财' : gender === 'female' ? '正官' : null;
    const stems = [b.pillars.year, b.pillars.month, b.pillars.day, b.pillars.hour]
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .map((p) => p.tenGod)
      .filter((g): g is string => g !== null);
    const present = spouseStar !== null && stems.includes(spouseStar);
    out.push(
      fact(
        'marriage',
        spouseStar
          ? `配偶星（${spouseStar}）${present ? '见于命局' : '未透于天干'}`
          : '配偶星依性别规则而定（未提供规则性别，无法定指）',
        [
          ev('bazi', 'bazi.pillars.*.tenGod', stems.join('、') || '无'),
          ev('time', 'input.ruleGender', gender ?? 'unspecified'),
        ],
        {
          caveat:
            gender === 'male' || gender === 'female'
              ? '配偶星之有无/强弱仅示感情结构，非婚姻成败预言。'
              : '提供 ruleGender 后方能按 "男财女官" 定指配偶星。',
        },
      ),
    );
  }
  const desc = bundle.western?.angles?.descendant;
  if (desc) {
    out.push(
      fact('marriage', `西方下降点（第七宫头）位于${desc.sign}`, [
        ev('western', 'western.angles.descendant.sign', desc.sign),
      ]),
    );
  }
  const spouse = ziweiPalace(bundle.ziwei, '夫妻宫');
  if (bundle.ziwei && spouse) {
    out.push(
      fact(
        'marriage',
        `紫微夫妻宫（${spouse.heavenlyStem}${spouse.earthlyBranch}）：${starNames(spouse)}`,
        [ev('ziwei', 'ziwei.palaces[夫妻宫]', starNames(spouse))],
      ),
    );
  }
  // 西方第七宫主星 (古典主星) + 其状态（星座/宫位/逆行/尊陷）.
  const desc7 = bundle.western?.angles?.descendant;
  const rulerBody = desc7 ? SIGN_RULER[desc7.sign] : undefined;
  const ruler = rulerBody ? westernPlanet(bundle.western, rulerBody) : undefined;
  if (desc7 && rulerBody && ruler) {
    const dignityCN = ruler.dignity ? DIGNITY_CN[ruler.dignity] : undefined;
    out.push(
      fact(
        'marriage',
        `西方第七宫主星（下降${SIGN_CN[desc7.sign] ?? desc7.sign}之主${PLANET_CN[rulerBody] ?? rulerBody}）位于${SIGN_CN[ruler.sign] ?? ruler.sign}${ruler.house ? `第${ruler.house}宫` : ''}${ruler.retrograde ? '（逆行）' : ''}${dignityCN ? `，${dignityCN}` : ''}`,
        [
          ev(
            'western',
            `western.7thRuler[${rulerBody}]`,
            `${ruler.sign} house ${ruler.house ?? '—'}${ruler.retrograde ? ' Rx' : ''}`,
          ),
        ],
        { caveat: '七宫主星示关系相处方式的倾向，非精确断人。' },
      ),
    );
  }
  // 西方关系相位：{月/金/火/土} 之间 + 任一涉七宫主星 的既有相位.
  const relSet = new Set(['Moon', 'Venus', 'Mars', 'Saturn']);
  if (rulerBody) relSet.add(rulerBody);
  const relAspects = (bundle.western?.aspects ?? []).filter(
    (a) =>
      (relSet.has(a.bodyA) && relSet.has(a.bodyB)) ||
      (rulerBody !== undefined && (a.bodyA === rulerBody || a.bodyB === rulerBody)),
  );
  if (relAspects.length > 0) {
    const items = relAspects.map((a) => {
      const pa = westernPlanet(bundle.western, a.bodyA);
      const pb = westernPlanet(bundle.western, a.bodyB);
      const sameHouse = pa?.house && pa.house === pb?.house ? `（第${pa.house}宫）` : '';
      return `${PLANET_CN[a.bodyA] ?? a.bodyA}${ASPECT_CN[a.type] ?? a.type}${PLANET_CN[a.bodyB] ?? a.bodyB}${sameHouse}（差${a.orbDeg.toFixed(1)}°）`;
    });
    out.push(
      fact(
        'marriage',
        `西方关系相位（月/金/火/土与七宫主）：${items.join('、')}`,
        [ev('western', 'western.aspects', items.join('、'))],
        { caveat: '相位为能量互动倾向，非事件断言。' },
      ),
    );
  }
  return out;
}

function studiesFacts(bundle: ChartBundle): InterpretationFact[] {
  const out: InterpretationFact[] = [];
  const b = bundle.bazi;
  if (b) {
    const resource = [b.pillars.year, b.pillars.month, b.pillars.day, b.pillars.hour]
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .map((p) => p.tenGod)
      .filter((g): g is string => g === '正印' || g === '偏印');
    out.push(
      fact(
        'studies',
        `学业相关十神（印星）：${resource.length > 0 ? [...new Set(resource)].join('、') : '未透干'}`,
        [ev('bazi', 'bazi.pillars.*.tenGod', [...new Set(resource)].join('、') || '无')],
      ),
    );
  }
  const wen = ['文昌', '文曲'];
  const found = bundle.ziwei
    ? bundle.ziwei.palaces.filter((p) =>
        [...p.majorStars, ...p.minorStars, ...p.adjectiveStars].some((s) => wen.includes(s.name)),
      )
    : [];
  if (found.length > 0) {
    out.push(
      fact(
        'studies',
        `紫微文昌/文曲落于：${found.map((p) => p.name).join('、')}`,
        found.map((p) => ev('ziwei', `ziwei.palaces[${p.name}]`, starNames(p))),
      ),
    );
  }
  const mercury = westernPlanet(bundle.western, 'Mercury');
  if (mercury) {
    out.push(
      fact('studies', `西方水星位于${mercury.sign}（第${mercury.house ?? '—'}宫）`, [
        ev('western', 'western.planets[Mercury]', `${mercury.sign} house ${mercury.house ?? '—'}`),
      ]),
    );
  }
  return out;
}

function healthFacts(bundle: ChartBundle): InterpretationFact[] {
  const out: InterpretationFact[] = [];
  const b = bundle.bazi;
  if (b) {
    // Five-element tally across the four pillar stems + branch main-qis.
    const tally = new Map<string, number>();
    const add = (el: string): void => {
      tally.set(el, (tally.get(el) ?? 0) + 1);
    };
    for (const p of [b.pillars.year, b.pillars.month, b.pillars.day, b.pillars.hour]) {
      if (p === null) continue;
      add(p.stemElement);
      const qi = p.hiddenStems.find((h) => h.primary);
      add(qi ? qi.element : p.branchElement);
    }
    const summary = [...tally.entries()].map(([el, n]) => `${el}×${n}`).join(' ');
    out.push(
      fact('health', `五行分布（四柱干支本气计数）：${summary}`, [
        ev('bazi', 'bazi.pillars.*.(stemElement|hiddenStems)', summary),
      ]),
    );
  }
  const health = ziweiPalace(bundle.ziwei, '疾厄宫');
  if (bundle.ziwei && health) {
    out.push(
      fact(
        'health',
        `紫微疾厄宫（${health.heavenlyStem}${health.earthlyBranch}）：${starNames(health)}`,
        [ev('ziwei', 'ziwei.palaces[疾厄宫]', starNames(health))],
      ),
    );
  }
  if (out.length > 0) {
    out.push(
      fact(
        'health',
        '健康提示仅为五行/宫位的一般结构描述，不构成任何医疗建议或诊断。',
        [ev('time', 'engine.disclaimer', 'not medical advice')],
        { confidence: 'low', caveat: '如有健康问题请咨询专业医师。' },
      ),
    );
  }
  return out;
}

/** Useful-god (喜用神) direction with its reason chain — the “喜水木、需金疏土生财” line. */
function usefulGodFacts(rules: BaziInterpretation | null): InterpretationFact[] {
  const f = rules?.findings.find((x) => x.topic === 'useful-god');
  if (!f) return [];
  return [
    fact('general', f.claim, [ev('bazi-rule', 'bazi-rule/useful-god', f.claim)], {
      reason: f.reason,
      caveat: f.matched ? undefined : '强弱中和，喜用需结合格局与调候另定。',
    }),
  ];
}

/** Fortune (吉凶) facts: 刑冲合害 / 神煞 / 大运吉凶, each carrying polarity + reason. */
function fortuneFacts(rules: BaziInterpretation | null): InterpretationFact[] {
  const out: InterpretationFact[] = [];
  for (const topic of ['relations', 'shensha', 'fortune'] as const) {
    for (const f of findingsByTopic(rules, topic)) {
      out.push(
        fact('general', f.claim, [ev('bazi-rule', `bazi-rule/${f.ruleId}`, f.claim)], {
          polarity: f.polarity,
          reason: f.reason,
        }),
      );
    }
  }
  return out;
}

/** Five-element tendency of the spouse star, for a hedged 配偶画像 (never a precise verdict). */
const SPOUSE_TRAIT: Record<Element, string> = {
  金: '果断重义、轮廓分明、讲原则',
  木: '仁厚文雅、身形挺拔、爱成长',
  水: '聪慧灵活、圆融善变、重感受',
  火: '热情开朗、外向表达、节奏快',
  土: '稳重务实、敦厚可靠、恋家',
};

/**
 * Follow-up-question facts (常见追问支撑): 适合行业、婚姻/正缘应期、配偶画像。
 * All grounded in the chart; the reading-style playbook narrates them with discipline.
 */
function followupFacts(bundle: ChartBundle, focusYear: number): InterpretationFact[] {
  const out: InterpretationFact[] = [];
  const b = bundle.bazi;
  if (!b) return out;
  const gender = bundle.originalInput.ruleGender;

  // 适合行业 (喜用五行→行业大类).
  const ind = industryFinding(b);
  out.push(
    fact('career', ind.claim, [ev('bazi-rule', `bazi-rule/${ind.ruleId}`, ind.claim)], {
      reason: ind.reason,
      caveat: '行业为参考方向，非唯一；需结合兴趣与现实。',
    }),
  );

  // 婚姻/正缘应期 (需性别定配偶星).
  const mt = marriageTimingFinding(b, gender, focusYear);
  if (mt) {
    out.push(
      fact('marriage', mt.claim, [ev('bazi-rule', `bazi-rule/${mt.ruleId}`, mt.claim)], {
        polarity: mt.polarity,
        reason: mt.reason,
        caveat: '应期是机会窗口，非“几岁必婚”；能否成婚需双方与现实配合。',
      }),
    );
  }

  // 配偶画像 (倾向参考): 配偶星五行 + 紫微夫妻宫 + 西方下降/金星.
  if (gender === 'male' || gender === 'female') {
    const el = elementsByRelation(b.dayMaster.element as Element);
    const spouseEl = gender === 'male' ? el.wealth : el.officer;
    const parts = [
      `配偶星五行为${spouseEl}→${SPOUSE_TRAIT[spouseEl]}`,
      `夫妻宫(日支)为${b.pillars.day.branch}`,
    ];
    const spousePalace = ziweiPalace(bundle.ziwei, '夫妻宫');
    if (bundle.ziwei && spousePalace) parts.push(`紫微夫妻宫主星：${starNames(spousePalace)}`);
    const desc = bundle.western?.angles?.descendant;
    if (desc) parts.push(`西方下降点在${desc.sign}`);
    const venus = westernPlanet(bundle.western, 'Venus');
    if (venus) parts.push(`金星在${venus.sign}`);
    const descR = bundle.western?.angles?.descendant;
    const rbody = descR ? SIGN_RULER[descR.sign] : undefined;
    const ruler7 = rbody ? westernPlanet(bundle.western, rbody) : undefined;
    if (ruler7 && rbody)
      parts.push(
        `七宫主${PLANET_CN[rbody] ?? rbody}在${SIGN_CN[ruler7.sign] ?? ruler7.sign}${ruler7.retrograde ? '(逆)' : ''}`,
      );
    out.push(
      fact(
        'marriage',
        `配偶画像(倾向参考)：${parts.join('；')}`,
        [ev('bazi', 'bazi.spouseStar', spouseEl)],
        {
          caveat: '体貌/性格为倾向性参考，非精确断人；不据此对号入座或排除。',
        },
      ),
    );
  }
  return out;
}

/** Western rule-based facts: semantic meanings from the western-rules package. */
function westernRuleFacts(rules: WesternInterpretation | null): InterpretationFact[] {
  if (!rules) return [];
  const out: InterpretationFact[] = [];
  for (const f of rules.findings) {
    // Map rule topics to interpretation topics
    const topic: InterpretationTopic =
      f.topic === 'angle' && f.ruleId.startsWith('angle/mc') ? 'career' : 'character';
    out.push(
      fact(topic, f.claim, [ev('western-rule', `western-rule/${f.ruleId}`, f.claim)], {
        reason: f.reason,
      }),
    );
  }
  return out;
}

/** Ziwei rule-based facts: semantic meanings from the ziwei-rules package. */
function ziweiRuleFacts(rules: ZiweiInterpretation | null): InterpretationFact[] {
  if (!rules) return [];
  const out: InterpretationFact[] = [];
  for (const f of rules.findings) {
    // Map rule topics to interpretation topics
    let topic: InterpretationTopic = 'character';
    if (f.ruleId.startsWith('palace-star/career')) topic = 'career';
    else if (f.ruleId.startsWith('palace-star/wealth')) topic = 'wealth';
    out.push(
      fact(topic, f.claim, [ev('ziwei-rule', `ziwei-rule/${f.ruleId}`, f.claim)], {
        reason: f.reason,
      }),
    );
  }
  return out;
}

/**
 * P4 Vedic findings stay deliberately structural. The rule layer provides the
 * public-domain citation, while the direct Vedic evidence points back to the
 * precision-gated envelope. It never chooses the still-unresolved node default.
 */
function vedicRuleFacts(rules: VedicInterpretation | null): InterpretationFact[] {
  if (rules === null) return [];
  return rules.findings.map((finding) => {
    let topic: InterpretationTopic = 'general';
    if (finding.topic === 'nakshatra') topic = 'character';
    else if (finding.topic === 'bhava') {
      const house = Number.parseInt(finding.ruleId.split('-').at(-1) ?? '', 10);
      topic =
        house === 2
          ? 'wealth'
          : house === 4
            ? 'studies'
            : house === 6
              ? 'health'
              : house === 7
                ? 'marriage'
                : house === 10
                  ? 'career'
                  : 'character';
    }
    const directRef = finding.ruleId.startsWith('nakshatra/')
      ? finding.ruleId.endsWith('day-stable')
        ? 'vedic.unknownTimeStable.moonNakshatra'
        : 'vedic.derived.grahas[Moon].nakshatra'
      : finding.ruleId.startsWith('bhava/')
        ? 'vedic.derived.(lagna|grahas).bhava'
        : finding.ruleId.startsWith('panchanga/')
          ? finding.ruleId.endsWith('day-stable')
            ? 'vedic.unknownTimeStable.panchanga'
            : 'vedic.derived.panchanga'
          : 'vedic.derived.vimshottari';
    return fact(
      topic,
      finding.claim,
      [
        ev('vedic', directRef, finding.claim),
        ev(
          'vedic-rule',
          `vedic-rule/${finding.ruleId}`,
          `${finding.source.text}, ${finding.source.chapter}`,
        ),
      ],
      { caveat: finding.caveat, reason: finding.reason },
    );
  });
}

/** Build the topic-organized, evidence-grounded interpretation facts for a chart. */
export function buildInterpretationFacts(
  bundle: ChartBundle,
  options: InterpretOptions = {},
): InterpretationFacts {
  // Anchor the per-year 流年 timeline on the horoscope target year, else the run's "now"
  // (bundle.calculatedAt) — deterministic given --now/--at.
  const focusYear = options.horoscope
    ? new Date(options.horoscope.targetSolarDate).getUTCFullYear()
    : new Date(bundle.calculatedAt).getUTCFullYear();
  const baziRules = bundle.bazi ? interpretBazi(bundle.bazi, { focusYear }) : null;
  const westernRules = bundle.western ? interpretWestern(bundle.western) : null;
  const ziweiRules = bundle.ziwei ? interpretZiweiRules(bundle.ziwei) : null;
  const vedicRules = bundle.vedic
    ? interpretVedic(bundle.vedic, {
        timeAccuracy: bundle.originalInput.timeAccuracy,
        ...(bundle.originalInput.timeAccuracy === 'unknown'
          ? {}
          : {
              birth: {
                utcInstantMs: Date.parse(bundle.normalizedTime.utcInstant),
                latitudeDeg: bundle.originalInput.location.latitude,
                longitudeEastDeg: bundle.originalInput.location.longitude,
              },
            }),
      })
    : null;
  const facts: InterpretationFact[] = [
    ...characterFacts(bundle, baziRules),
    ...usefulGodFacts(baziRules),
    ...careerFacts(bundle, baziRules),
    ...wealthFacts(bundle),
    ...marriageFacts(bundle),
    ...studiesFacts(bundle),
    ...healthFacts(bundle),
    ...fortuneFacts(baziRules),
    ...westernRuleFacts(westernRules),
    ...ziweiRuleFacts(ziweiRules),
    ...vedicRuleFacts(vedicRules),
    ...followupFacts(bundle, focusYear),
  ];

  // Optionally note the current Zi Wei 流年 for time-sensitive framing.
  if (options.horoscope) {
    const y = options.horoscope.horoscope.yearly;
    facts.push(
      fact(
        'general',
        `当前流年（${options.horoscope.targetSolarDate}）：${y.heavenlyStem}${y.earthlyBranch}，运限四化 ${y.mutagen.join('、') || '—'}`,
        [ev('ziwei-horoscope', 'horoscope.yearly', `${y.heavenlyStem}${y.earthlyBranch}`)],
        { caveat: '流年仅示该年之干支结构，非吉凶断语。' },
      ),
    );
  }

  return {
    schemaVersion: bundle.schemaVersion,
    engineVersion: bundle.engineVersion,
    requestId: bundle.requestId,
    subject: {
      timeAccuracy: bundle.originalInput.timeAccuracy,
      timezone: bundle.originalInput.timezone,
      calendar: bundle.originalInput.calendar,
    },
    facts,
    rulesets: [
      ...bundle.provenance.rulesets,
      ...(westernRules
        ? [{ id: westernRules.rulesetId, version: westernRules.provider.version }]
        : []),
      ...(ziweiRules ? [{ id: ziweiRules.rulesetId, version: ziweiRules.provider.version }] : []),
      ...(vedicRules
        ? [{ id: 'vedic-rules-parashara', version: vedicRules.provider.version }]
        : []),
    ],
    disclaimers: DISCLAIMERS,
    followupOffers: FOLLOWUP_OFFERS,
  };
}
