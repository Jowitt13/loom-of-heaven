/** @loom/vedic — P2 numerical provider plus evidence-unblocked P3A classifications (ADR 0013). */
export {
  computeVedic,
  computeVedicP2Positions,
  stableUnknownTimeVedicFacts,
} from './vedic-provider.ts';
export { deriveVedicClassifications } from './classifications.ts';
export { wholeSignBhavaOf } from './bhava.ts';
export { canonicalLongitude, norm360 } from './math.ts';
export { nakshatraOf } from './nakshatra.ts';
export { instantaneousPanchanga } from './panchanga.ts';
export { nextSunriseUtcMs, previousSunriseUtcMs, vaaraAtInstant } from './sunrise.ts';
export {
  VIMSHOTTARI_LORDS,
  VIMSHOTTARI_YEAR_DAYS,
  VIMSHOTTARI_YEAR_MS,
  VIMSHOTTARI_YEARS,
  vimshottariFromMoon,
} from './vimshottari.ts';
export { rashiIndexOf, rashiOf } from './rashi.ts';
export {
  navamshaOf,
  navamshaRashiIndexByModality,
  navamshaRashiIndexByTriplicity,
} from './varga.ts';
