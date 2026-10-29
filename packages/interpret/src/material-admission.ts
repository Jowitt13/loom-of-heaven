/**
 * Default-answer material boundary. A calculated or rule-derived record may
 * remain available in the technical `interpret` output without being admitted
 * to the default host context. This table is intentionally finite and keyed by
 * evidence mechanism, never by fact index or claim wording.
 *
 * Basis:
 * - provider chart paths are structural facts;
 * - ADR 0021 admits only the frozen ten-god cultural reference for career;
 * - pattern, useful-god, industry, branch relations, shensha and marriage
 *   timing remain technical BaZi records until separately admitted;
 * - the fortune/timing family is admitted only when the caller explicitly
 *   supplies a target time (`at`), because the IQ-4 target-year path consumes
 *   it; it is not default natal material;
 * - Western/Zi Wei/Vedic rule families listed below are the existing shipped
 *   interpretation layers.
 */
const WITHHELD_BAZI_RULE_PREFIXES = [
  'bazi-rule/pattern',
  'bazi-rule/useful-god',
  'bazi-rule/industry',
  'bazi-rule/relations',
  'bazi-rule/shensha',
  'bazi-rule/marriage-timing',
] as const;

const ADMITTED_RULE_PREFIXES = [
  'bazi-rule/strength',
  'bazi-rule/ten-gods/xiang-yi',
  'western-rule/planet-sign',
  'western-rule/planet-house',
  'western-rule/angle',
  'western-rule/aspect',
  'western-rule/dignity',
  'ziwei-rule/main-star',
  'ziwei-rule/palace-star',
  'ziwei-rule/sihua',
  'ziwei-rule/brightness',
  'vedic-rule/nakshatra',
  'vedic-rule/bhava',
  'vedic-rule/panchanga',
  'vedic-rule/vimshottari',
] as const;

const ADMITTED_PROVIDER_PREFIXES = [
  'bazi.pillars.',
  'bazi.dayMaster',
  'western.planets[',
  'western.angles.',
  'western.aspects',
  'western.7thRuler[',
  'ziwei.palaces[',
  'ziwei-horoscope.yearly',
  'vedic.derived.',
  'vedic.unknownTimeStable.',
  'input.ruleGender',
  'engine.disclaimer',
  'time.',
] as const;

function hasPrefix(ref: string, prefix: string): boolean {
  return ref === prefix || ref.startsWith(`${prefix}/`);
}

interface MaterialEvidence {
  kind: string;
  ref: string;
}

function isRuleEvidence(evidence: MaterialEvidence): boolean {
  return evidence.kind.endsWith('-rule');
}

function isWithheldRule(evidence: MaterialEvidence): boolean {
  return WITHHELD_BAZI_RULE_PREFIXES.some((prefix) => hasPrefix(evidence.ref, prefix));
}

const CONDITIONAL_TIMING_RULE_PREFIXES = ['bazi-rule/fortune'] as const;

function isAdmittedRule(evidence: MaterialEvidence): boolean {
  return ADMITTED_RULE_PREFIXES.some((prefix) => hasPrefix(evidence.ref, prefix));
}

function isConditionalTimingRule(evidence: MaterialEvidence): boolean {
  return CONDITIONAL_TIMING_RULE_PREFIXES.some((prefix) => hasPrefix(evidence.ref, prefix));
}

function isAdmittedProviderPath(evidence: MaterialEvidence): boolean {
  return ADMITTED_PROVIDER_PREFIXES.some((prefix) => evidence.ref.startsWith(prefix));
}

/**
 * Whether one interpretation fact may enter the default public/answer-plan
 * context. Every evidence item must pass: a known admitted rule cannot launder
 * a withheld or unknown mechanism beside it.
 */
export interface DefaultAnswerMaterialOptions {
  /** The caller explicitly supplied `at`; the target-year timeline is relevant. */
  includeFortuneTimeline?: boolean;
}

export function isDefaultAnswerFact(
  fact: { topic?: string; evidence: readonly MaterialEvidence[] },
  options: DefaultAnswerMaterialOptions = {},
): boolean {
  return fact.evidence.every((evidence) => {
    if (isRuleEvidence(evidence)) {
      if (isWithheldRule(evidence)) return false;
      if (evidence.ref === 'bazi-rule/ten-gods/xiang-yi') return fact.topic === 'career';
      if (isConditionalTimingRule(evidence)) {
        return fact.topic === 'general' && options.includeFortuneTimeline === true;
      }
      return isAdmittedRule(evidence);
    }
    return isAdmittedProviderPath(evidence);
  });
}
