/**
 * Finite default-answer boundary, keyed by producer evidence rather than text
 * or fact ids. A target date changes relevance, never source admission. The
 * withheld BaZi families (including fortune) remain technical records even at
 * an explicit target. No namespace prefix admits arbitrary future children.
 */
interface MaterialEvidence {
  kind: string;
  ref: string;
}

const SIGNS =
  '(?:aries|taurus|gemini|cancer|leo|virgo|libra|scorpio|sagittarius|capricorn|aquarius|pisces)';
const BODIES = '(?:sun|moon|mercury|venus|mars|jupiter|saturn|uranus|neptune|pluto)';
const MAJOR_STARS = '(?:紫微|天机|太阳|武曲|天同|廉贞|天府|太阴|贪狼|巨门|天相|天梁|七杀|破军)';
const PALACES = '(?:命|兄弟|夫妻|子女|财帛|疾厄|迁移|仆役|官禄|田宅|福德|父母)宫?';
const WESTERN_RULES = [
  new RegExp(`^western-rule/planet-sign/(?:sun|moon|mercury|venus|mars)-${SIGNS}$`),
  /^western-rule\/planet-house\/(?:sun|moon)-h(?:1|4|7|10)$/,
  new RegExp(`^western-rule/angle/(?:asc|mc)-${SIGNS}$`),
  new RegExp(`^western-rule/dignity/${BODIES}-(?:domicile|exaltation|detriment|fall)$`),
];
const WESTERN_ASPECT = new RegExp(
  `^western-rule/aspect/(${BODIES})-(?:conjunction|opposition|square|trine|sextile)-(${BODIES})$`,
);
const ZIWEI_RULES = [
  new RegExp(`^ziwei-rule/main-star/${MAJOR_STARS}$`),
  new RegExp(`^ziwei-rule/palace-star/(?:soul|career|wealth)-${MAJOR_STARS}(?:、${MAJOR_STARS})?$`),
  new RegExp(
    `^ziwei-rule/sihua/(?:${MAJOR_STARS}|文昌|文曲|左辅|右弼)-化(?:禄|权|科|忌)-${PALACES}$`,
  ),
  new RegExp(`^ziwei-rule/brightness/${MAJOR_STARS}-(?:庙|旺|得|利|平|不|陷)$`),
];
const VEDIC_RULES = new Set([
  'vedic-rule/nakshatra/moon',
  'vedic-rule/nakshatra/moon-day-stable',
  'vedic-rule/panchanga/instantaneous',
  'vedic-rule/panchanga/day-stable',
  'vedic-rule/vimshottari/birth-balance',
]);
const BAZI_PROVIDER = [
  'bazi.dayMaster',
  'bazi.pillars.*.(stem|branch|tenGodDisplay)',
  'bazi.pillars.*.(stemElement|hiddenStems)',
  'bazi.pillars.*.tenGod',
];
const WESTERN_PROVIDER = new Set([
  'western.planets[Sun].sign',
  'western.planets[Venus]',
  'western.planets[Mercury]',
  'western.angles.mc.sign',
  'western.angles.descendant.sign',
  'western.aspects',
]);
const ZIWEI_PROVIDER = new RegExp(`^ziwei\\.palaces\\[${PALACES}\\](?:\\.majorStars)?$`);
const VEDIC_PROVIDER = new Set([
  'vedic.unknownTimeStable.moonNakshatra',
  'vedic.unknownTimeStable.panchanga',
  'vedic.derived.grahas[Moon].nakshatra',
  'vedic.derived.(lagna|grahas).bhava',
  'vedic.derived.panchanga',
  'vedic.derived.vimshottari',
]);
const PILLAR_TEN_GOD = /^bazi\.pillars\.(?:year|month|day|hour)\.tenGod$/;

function isAdmittedEvidence({ kind, ref }: MaterialEvidence, topic?: string): boolean {
  switch (kind) {
    case 'bazi-rule':
      return (
        ref === 'bazi-rule/strength' ||
        (ref === 'bazi-rule/ten-gods/xiang-yi' && topic === 'career')
      );
    case 'western-rule': {
      if (WESTERN_RULES.some((pattern) => pattern.test(ref))) return true;
      const aspect = ref.match(WESTERN_ASPECT);
      return (
        aspect !== null &&
        aspect[1] !== aspect[2] &&
        [aspect[1], aspect[2]].some((body) => body === 'sun' || body === 'moon')
      );
    }
    case 'ziwei-rule':
      return ZIWEI_RULES.some((pattern) => pattern.test(ref));
    case 'vedic-rule':
      return VEDIC_RULES.has(ref) || /^vedic-rule\/bhava\/whole-sign-(?:[1-9]|1[0-2])$/.test(ref);
    case 'bazi':
      return BAZI_PROVIDER.includes(ref) || PILLAR_TEN_GOD.test(ref);
    case 'western':
      return (
        WESTERN_PROVIDER.has(ref) ||
        /^western\.7thRuler\[(?:Sun|Moon|Mercury|Venus|Mars|Jupiter|Saturn)\]$/.test(ref)
      );
    case 'ziwei':
      return ZIWEI_PROVIDER.test(ref);
    case 'ziwei-horoscope':
      return ref === 'horoscope.yearly';
    case 'vedic':
      return VEDIC_PROVIDER.has(ref);
    case 'time':
      return ref === 'input.ruleGender' || ref === 'engine.disclaimer';
    default:
      return false;
  }
}

/** Every item must resolve to an admitted kind/path pair; empty evidence is not support. */
export function isDefaultAnswerFact(fact: {
  topic?: string;
  evidence: readonly MaterialEvidence[];
}): boolean {
  if (fact.evidence.length === 0) return false;
  return fact.evidence.every((evidence) => isAdmittedEvidence(evidence, fact.topic));
}

/**
 * Topic relevance beyond a fact's authored topic (roadmap v3.4 §7 item 4). One
 * mechanism can serve several questions: Venus/Moon/Mars meanings also speak to
 * intimacy and expression, Mercury to studies, the Sun and day-master strength
 * to work style and drive. The mapping is keyed by the SAME admitted-evidence
 * ref shapes the admission table above recognizes — it broadens which questions
 * may see a fact, never which facts exist. `general` never appears here: it is
 * not a topic passport.
 */
const RELATED_TOPIC_RULES: ReadonlyArray<{
  re: RegExp;
  topics: ReadonlyArray<'career' | 'wealth' | 'marriage' | 'studies' | 'health'>;
}> = [
  // Western rule meanings whose classic question is love, study or work.
  { re: /^western-rule\/planet-sign\/(?:venus|moon|mars)-/, topics: ['marriage'] },
  { re: /^western-rule\/planet-sign\/mercury-/, topics: ['studies'] },
  { re: /^western-rule\/planet-sign\/sun-/, topics: ['career'] },
  { re: /^western-rule\/planet-house\/(?:sun|moon)-h10$/, topics: ['career'] },
  { re: /^western-rule\/planet-house\/(?:sun|moon)-h7$/, topics: ['marriage'] },
  { re: /^western-rule\/dignity\/(?:venus|moon|mars)-/, topics: ['marriage'] },
  { re: /^western-rule\/dignity\/(?:sun|saturn)-/, topics: ['career'] },
  { re: /^western-rule\/dignity\/mercury-/, topics: ['studies'] },
  {
    re: /^western-rule\/aspect\/(?:venus|moon|mars)-/,
    topics: ['marriage'],
  },
  {
    re: /^western-rule\/aspect\/[a-z]+-(?:conjunction|opposition|square|trine|sextile)-(?:venus|moon|mars)$/,
    topics: ['marriage'],
  },
  // Provider placements with the same cross-question relevance.
  { re: /^western\.planets\[Venus\]$/, topics: ['marriage'] },
  // BaZi structure: day master, its strength and the four-pillar ten-god
  // layout are the classic work-style / drive / responsibility material.
  { re: /^bazi-rule\/strength$/, topics: ['career'] },
  { re: /^bazi\.dayMaster$/, topics: ['career'] },
  { re: /^bazi\.pillars\.\*\.\(stem\|branch\|tenGodDisplay\)$/, topics: ['career'] },
  // Zi Wei soul-palace stars color work style beside personality.
  { re: /^ziwei-rule\/palace-star\/soul-/, topics: ['career'] },
];

/** Topics, beyond its authored one, for whose questions this fact is material. */
export function relatedTopicsForFact(fact: {
  evidence: readonly MaterialEvidence[];
}): ReadonlyArray<'career' | 'wealth' | 'marriage' | 'studies' | 'health'> {
  const topics = new Set<'career' | 'wealth' | 'marriage' | 'studies' | 'health'>();
  for (const evidence of fact.evidence) {
    for (const rule of RELATED_TOPIC_RULES) {
      if (rule.re.test(evidence.ref)) for (const topic of rule.topics) topics.add(topic);
    }
  }
  return [...topics];
}

/**
 * Whether material with an authored `topic` and these evidence refs may support
 * a request for `requestTopic` (authored topic or a related one). Shared by
 * fact selection, the claim chain and the response view so all three layers
 * apply the SAME v3.4 relevance semantics. `general` is never a passport.
 */
export function isTopicRelevantMaterial(
  topic: string | undefined,
  refs: readonly string[],
  requestTopic: string,
): boolean {
  if (topic === requestTopic) return true;
  if (requestTopic === 'general') return false;
  return RELATED_TOPIC_RULES.some(
    (rule) =>
      rule.topics.some((related) => related === requestTopic) &&
      refs.some((ref) => rule.re.test(ref)),
  );
}

/** Whether a fact may support a request for `topic` (authored topic or a related one). */
export function isTopicRelevantFact(
  fact: { topic?: string; evidence: readonly MaterialEvidence[] },
  topic: string,
): boolean {
  return isTopicRelevantMaterial(
    fact.topic,
    fact.evidence.map((evidence) => evidence.ref),
    topic,
  );
}

/**
 * Whether a fact's evidence is an admitted TARGET-PERIOD record — material that
 * actually describes a requested dynamic period (today: the admitted Zi Wei
 * yearly-flow record). This is a consumption predicate over the existing
 * admission table, not a second registry: natal placements (signs, palaces,
 * spouse stars, houses, birth-time cycle remainders) never match, and an
 * explicit `at` never widens it. Timing-lens answers may cite ONLY this class.
 */
export function isTimingPeriodFact(fact: { evidence: readonly MaterialEvidence[] }): boolean {
  return fact.evidence.some(
    (evidence) => evidence.kind === 'ziwei-horoscope' && evidence.ref === 'horoscope.yearly',
  );
}

/**
 * Whether every evidence item is a non-chart limitation note (the engine's
 * disclaimer marker). Such a fact explains a boundary; it is never "answer
 * basis", so it cannot make a request limited/grounded on its own. Facts that
 * ALSO cite chart evidence stay selectable.
 */
export function isLimitationNoteFact(fact: { evidence: readonly MaterialEvidence[] }): boolean {
  return (
    fact.evidence.length > 0 &&
    fact.evidence.every(
      (evidence) => evidence.kind === 'time' && evidence.ref === 'engine.disclaimer',
    )
  );
}
