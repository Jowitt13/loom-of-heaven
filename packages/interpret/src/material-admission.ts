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
  if (!fact.evidence.every((evidence) => isAdmittedEvidence(evidence, fact.topic))) return false;
  // ADR 0021 is the same boundary for general, career and explain requests.
  // Relabeling a career record as part of a general result does not admit it.
  if (fact.topic === 'career') {
    return (
      fact.evidence.some(
        (e) => e.kind === 'bazi-rule' && e.ref === 'bazi-rule/ten-gods/xiang-yi',
      ) &&
      fact.evidence.some((e) => e.kind === 'bazi' && PILLAR_TEN_GOD.test(e.ref)) &&
      fact.evidence.every(
        (e) =>
          (e.kind === 'bazi-rule' && e.ref === 'bazi-rule/ten-gods/xiang-yi') ||
          (e.kind === 'bazi' && PILLAR_TEN_GOD.test(e.ref)),
      )
    );
  }
  return true;
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
