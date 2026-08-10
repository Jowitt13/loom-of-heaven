import { computeVedicP2Positions, nakshatraOf } from '@loom/vedic';
import type {
  ProviderRef,
  TimeAccuracy,
  VedicChartResult,
  VedicDerivedPlacement,
  VedicInterpretation,
  VedicRuleFinding,
  VedicRuleSource,
} from '@loom/contracts';

/** P4's versioned, structural-only Vedic ruleset. */
export const VEDIC_RULES_VERSION = '0.1.0';
export const VEDIC_RULES_RULESET_ID = `vedic-rules-parashara@${VEDIC_RULES_VERSION}`;
const PROVIDER: ProviderRef = { id: 'vedic-rules', version: VEDIC_RULES_VERSION, license: 'MIT' };

const BPHS_NAKSHATRA: VedicRuleSource = {
  text: 'Brihat Parashara Hora Shastra',
  chapter: 'Nakshatra and lunar-mansion divisions',
};
const BPHS_BHAVA: VedicRuleSource = {
  text: 'Brihat Parashara Hora Shastra',
  chapter: 'Rashi and Bhava divisions',
};
const SURYA_SIDDHANTA_PANCHANGA: VedicRuleSource = {
  text: 'Surya Siddhanta',
  chapter: 'Tithi, Yoga and Karana definitions',
};
const BPHS_DASHA: VedicRuleSource = {
  text: 'Brihat Parashara Hora Shastra',
  chapter: 'Vimshottari Dasha',
};

const HOUSE_TOPICS = [
  ['character', 1],
  ['wealth', 2],
  ['studies', 4],
  ['health', 6],
  ['marriage', 7],
  ['career', 10],
] as const;

export interface VedicInterpretOptions {
  timeAccuracy: TimeAccuracy;
  /** Present only for a real birth instant; omitted for unknown-time charts. */
  birth?: {
    utcInstantMs: number;
    latitudeDeg: number;
    longitudeEastDeg: number;
  };
}

function norm360(value: number): number {
  const out = value % 360;
  return out < 0 ? out + 360 : out;
}

function distanceToBoundary(longitudeDeg: number, segmentDeg: number): number {
  const within = norm360(longitudeDeg) % segmentDeg;
  return Math.min(within, segmentDeg - within);
}

function nearBoundary(longitudeDeg: number, segments: readonly number[]): boolean {
  return segments.some((segment) => distanceToBoundary(longitudeDeg, segment) <= 1 / 60);
}

function joinCaveats(...items: Array<string | undefined>): string | undefined {
  const unique = [...new Set(items.filter((item): item is string => item !== undefined))];
  return unique.length === 0 ? undefined : unique.join(' ');
}

function timeCaveat(
  timeAccuracy: TimeAccuracy,
  kind: 'time-dependent' | 'structural',
): string | undefined {
  if (timeAccuracy !== 'approximate') return undefined;
  return kind === 'time-dependent'
    ? 'Birth time is approximate; Lagna, whole-sign bhava, D9 and sunrise-based Vaara may change with a more precise recorded time.'
    : 'Birth time is approximate; this time-derived chart fact should be read with that uncertainty.';
}

function boundaryCaveat(longitudes: number[]): string | undefined {
  return longitudes.some((longitude) => nearBoundary(longitude, [30, 360 / 27, 360 / 108]))
    ? 'One or more classifications are within 1 arcminute of a frozen segment boundary; a small verified-input change can change the label.'
    : undefined;
}

function structuralCaveat(): string {
  return 'This is a sourced structural chart classification, not a deterministic prediction.';
}

function moonChangesNakshatraWithinTwoHours(options: VedicInterpretOptions): boolean {
  if (options.timeAccuracy !== 'approximate' || options.birth === undefined) return false;
  const before = computeVedicP2Positions({
    utcInstantMs: options.birth.utcInstantMs - 2 * 60 * 60 * 1000,
    latitudeDeg: options.birth.latitudeDeg,
    longitudeEastDeg: options.birth.longitudeEastDeg,
  });
  const after = computeVedicP2Positions({
    utcInstantMs: options.birth.utcInstantMs + 2 * 60 * 60 * 1000,
    latitudeDeg: options.birth.latitudeDeg,
    longitudeEastDeg: options.birth.longitudeEastDeg,
  });
  return nakshatraOf(before.grahas.Moon).index !== nakshatraOf(after.grahas.Moon).index;
}

function moonFinding(
  chart: VedicChartResult,
  options: VedicInterpretOptions,
): VedicRuleFinding | null {
  const moon = chart.derived?.grahas.find((placement) => placement.graha === 'Moon');
  if (moon === undefined) {
    const stable = chart.unknownTimeStable?.moonNakshatra;
    if (stable === null || stable === undefined) return null;
    return {
      ruleId: 'nakshatra/moon-day-stable',
      topic: 'nakshatra',
      matched: true,
      claim: `The Moon remains in ${stable.name}, pada ${stable.pada}, throughout the local civil day.`,
      source: BPHS_NAKSHATRA,
      caveat:
        'Birth time is unknown. This fact is emitted only because the Moon nakshatra and pada were stable throughout the local civil day; time-of-day Vedic results are omitted.',
    };
  }
  return {
    ruleId: 'nakshatra/moon',
    topic: 'nakshatra',
    matched: true,
    claim: `The Moon is in ${moon.nakshatra.name}, pada ${moon.nakshatra.pada}, in ${moon.rashi}.`,
    source: BPHS_NAKSHATRA,
    caveat: joinCaveats(
      structuralCaveat(),
      timeCaveat(options.timeAccuracy, 'structural'),
      boundaryCaveat([moon.longitudeDeg]),
    ),
  };
}

function bhavaFindings(
  chart: VedicChartResult,
  options: VedicInterpretOptions,
): VedicRuleFinding[] {
  const derived = chart.derived;
  if (derived === null) return [];
  return HOUSE_TOPICS.map(([topic, bhava]) => {
    const placements = derived.grahas.filter((placement) => placement.bhava === bhava);
    const placementText =
      placements.length === 0
        ? 'no classical graha'
        : placements.map((placement) => `${placement.graha} (${placement.rashi})`).join(', ');
    const relevantLongitudes = [
      derived.lagna.longitudeDeg,
      ...placements.map((p) => p.longitudeDeg),
    ];
    return {
      ruleId: `bhava/whole-sign-${bhava}`,
      topic: 'bhava',
      matched: true,
      claim: `Whole-sign bhava ${bhava} is ${rashiAtBhava(derived.lagna, bhava)}; placements: ${placementText}.`,
      source: BPHS_BHAVA,
      caveat: joinCaveats(
        structuralCaveat(),
        timeCaveat(options.timeAccuracy, 'time-dependent'),
        boundaryCaveat(relevantLongitudes),
      ),
      reason: `P4 maps this structural whole-sign bhava finding to the ${topic} answer topic without asserting an outcome.`,
    };
  });
}

const RASHIS = [
  'Mesha',
  'Vrishabha',
  'Mithuna',
  'Karka',
  'Simha',
  'Kanya',
  'Tula',
  'Vrishchika',
  'Dhanu',
  'Makara',
  'Kumbha',
  'Meena',
] as const;

function rashiAtBhava(lagna: VedicDerivedPlacement, bhava: number): string {
  const index = RASHIS.indexOf(lagna.rashi);
  return RASHIS[(index + bhava - 1) % RASHIS.length]!;
}

function panchangaFinding(
  chart: VedicChartResult,
  options: VedicInterpretOptions,
): VedicRuleFinding | null {
  const derived = chart.derived;
  const panchanga = derived?.panchanga ?? chart.unknownTimeStable?.panchanga;
  if (panchanga === null || panchanga === undefined) return null;
  const sun = chart.grahas.find((placement) => placement.graha === 'Sun')!;
  const moon = chart.grahas.find((placement) => placement.graha === 'Moon')!;
  const vaaraText =
    derived?.panchanga.vaara === null || derived === null
      ? ''
      : ` Vaara: ${derived.panchanga.vaara}.`;
  const panchangaBoundary =
    nearBoundary(norm360(moon.longitudeDeg - sun.longitudeDeg), [12, 6]) ||
    nearBoundary(norm360(moon.longitudeDeg + sun.longitudeDeg), [360 / 27]);
  return {
    ruleId: derived === null ? 'panchanga/day-stable' : 'panchanga/instantaneous',
    topic: 'panchanga',
    matched: true,
    claim: `Tithi ${panchanga.tithi.number} (${panchanga.tithi.paksha}), Yoga ${panchanga.yoga.number}, Karana ${panchanga.karana.name}.${vaaraText}`,
    source: SURYA_SIDDHANTA_PANCHANGA,
    caveat: joinCaveats(
      structuralCaveat(),
      derived === null
        ? 'Birth time is unknown. These Panchanga members are emitted only because each was stable throughout the local civil day; Vaara is omitted.'
        : timeCaveat(
            options.timeAccuracy,
            derived.panchanga.vaara === null ? 'structural' : 'time-dependent',
          ),
      panchangaBoundary
        ? 'This Panchanga classification is within 1 arcminute of a frozen segment boundary; a small verified-input change can change the label.'
        : undefined,
    ),
  };
}

function vimshottariFinding(
  chart: VedicChartResult,
  options: VedicInterpretOptions,
): VedicRuleFinding | null {
  const vimshottari = chart.derived?.vimshottari;
  if (vimshottari === null || vimshottari === undefined) return null;
  const firstMaha = vimshottari.mahadashas[0]!;
  return {
    ruleId: 'vimshottari/birth-balance',
    topic: 'vimshottari',
    matched: true,
    claim: `Vimshottari uses the ${vimshottari.dashaYear} model; the birth sequence begins in ${firstMaha.lord} Maha Dasha.`,
    source: BPHS_DASHA,
    caveat: joinCaveats(
      'Vimshottari is a traditional timing framework, not a deterministic event prediction.',
      boundaryCaveat([vimshottari.birthMoonLongitudeDeg]),
      moonChangesNakshatraWithinTwoHours(options)
        ? 'Birth time is approximate and the Moon changes nakshatra within plus or minus two hours, so the dasha balance is especially time-sensitive.'
        : timeCaveat(options.timeAccuracy, 'structural'),
    ),
  };
}

/**
 * Produce source-cited Vedic structural findings from an already-computed chart.
 * The rules layer never chooses the undecided Rahu default and never derives a
 * number itself; it only reads the precision-gated chart envelope.
 */
export function interpretVedic(
  chart: VedicChartResult,
  options: VedicInterpretOptions,
): VedicInterpretation {
  const findings = [
    moonFinding(chart, options),
    ...bhavaFindings(chart, options),
    panchangaFinding(chart, options),
    vimshottariFinding(chart, options),
  ].filter((finding): finding is VedicRuleFinding => finding !== null);
  return { rulesetId: VEDIC_RULES_RULESET_ID, provider: PROVIDER, findings };
}

export const VEDIC_RULES_IMPLEMENTED = true as const;
