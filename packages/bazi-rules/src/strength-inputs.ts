import type { BaziChartResult, BaziPillar } from '@loom/contracts';
import { elementRelation, type Element, type ElementRelation } from './fundamentals.ts';
import { collectDirectRootEvidence, type DirectRootEvidence } from './root-state.ts';

/**
 * D2-A shadow-only evidence collection: structured strength inputs (结构化强弱输入事实).
 *
 * This module only collects, buckets, and stably orders facts that already
 * exist on the chart. It is NOT a strength assessor. It does NOT:
 * - output any score, weight, total, ratio, or threshold;
 * - output strong/weak/balanced or any 身强/身弱/旺衰 verdict;
 * - output useful gods, patterns, pattern lifecycle, or transformation state;
 * - evaluate whether roots are effective, damaged, bound, or transformed;
 * - attach polarity or auspiciousness to anything;
 * - touch the legacy `strength.ts` / `pattern.ts` findings or any canonical
 *   `bazi-rules-ziping@0.1.0` output.
 *
 * It is not exported from the package index and is not wired into
 * `interpretBazi`, the orchestrator, contracts, CLI, or user-visible output.
 * The month-command relation recorded here is a fact (which five-element
 * relation the month primary hidden stem holds to the day master) — it never
 * becomes a "得令" or "身强" conclusion by itself.
 */

export type StrengthPillarName = 'year' | 'month' | 'day' | 'hour';

/** Visible stems are scanned on year/month/hour only; the day stem is the day master itself. */
export type StrengthVisiblePillarName = 'year' | 'month' | 'hour';

/** One visible stem bucketed by its provider-recorded ten god. */
export type VisibleStemFact = {
  pillar: StrengthVisiblePillarName;
  stem: string;
  element: string;
  tenGod: string;
  factRef: string;
};

export type StructuredStrengthInputs = {
  /** Provenance copied verbatim from the input chart. */
  chartSource: {
    rulesetId: string;
    providerId: string;
    providerVersion: string;
  };
  dayMaster: {
    stem: string;
    element: string;
    factRef: string;
  };
  /** Pillars that existed and were scanned, in fixed order. */
  inspectedPillars: readonly StrengthPillarName[];
  /** Pillars that could not be scanned (hour pillar null when time unknown). */
  omittedPillars: readonly StrengthPillarName[];
  /** Month-command (月令) facts only — never a 得令/身强 verdict. */
  monthCommand: {
    monthBranch: string;
    /** Provider primary hidden stem name, copied verbatim; null when the provider records none. */
    primaryHiddenStem: string | null;
    primaryHiddenStemElement: string | null;
    primaryHiddenStemIndex: number | null;
    /**
     * Five-element relation of the month primary hidden stem to the day
     * master: same / generates-me / i-generate / i-control / controls-me.
     * Null when either element is not a canonical five-element name.
     */
    dayMasterRelation: ElementRelation | null;
    monthBranchFactRef: string;
    primaryHiddenStemFactRef: string;
  };
  /** Direct-root evidence reused verbatim from D1-A; no tier invention, no effectiveness. */
  directRoots: DirectRootEvidence;
  /** Visible stems bucketed by ten god — fact buckets, never scores. */
  visibleStems: {
    support: readonly VisibleStemFact[];
    outputDrain: readonly VisibleStemFact[];
    wealthDrain: readonly VisibleStemFact[];
    officerPressure: readonly VisibleStemFact[];
  };
};

const PILLAR_ORDER: readonly StrengthPillarName[] = ['year', 'month', 'day', 'hour'];
const VISIBLE_PILLAR_ORDER: readonly StrengthVisiblePillarName[] = ['year', 'month', 'hour'];

const FIVE_ELEMENTS: ReadonlySet<string> = new Set(['木', '火', '土', '金', '水']);
function isElement(x: string | null): x is Element {
  return x !== null && FIVE_ELEMENTS.has(x);
}

// Ten-god buckets are classification facts. They must never be accumulated
// into scores, weights, or a final verdict.
const SUPPORT_TEN_GODS: ReadonlySet<string> = new Set(['比肩', '劫财', '正印', '偏印']);
const OUTPUT_DRAIN_TEN_GODS: ReadonlySet<string> = new Set(['食神', '伤官']);
const WEALTH_DRAIN_TEN_GODS: ReadonlySet<string> = new Set(['正财', '偏财']);
const OFFICER_PRESSURE_TEN_GODS: ReadonlySet<string> = new Set(['正官', '七杀']);

/**
 * Collect structured strength-input facts from a computed `BaziChartResult`.
 * Pure, deterministic, offline: identical input always yields byte-identical
 * JSON output.
 *
 * Fixed behavior:
 * - pillar scan order is year → month → day → hour;
 * - a null hour pillar goes to `omittedPillars` and yields no hour-dependent
 *   evidence anywhere (no hour visible stem, no hour root, no hour factRef);
 * - visible stems are scanned year → month → hour; the day stem is excluded
 *   because it is the day master itself, not an external factor;
 * - each visible stem lands in exactly one ten-god bucket in scan order;
 * - direct-root evidence is reused verbatim from D1-A.
 */
export function collectStrengthInputs(bazi: BaziChartResult): StructuredStrengthInputs {
  const inspectedPillars: StrengthPillarName[] = [];
  const omittedPillars: StrengthPillarName[] = [];
  for (const name of PILLAR_ORDER) {
    if (bazi.pillars[name] === null) omittedPillars.push(name);
    else inspectedPillars.push(name);
  }

  // --- Month command (月令): relation facts only. ---
  const month = bazi.pillars.month;
  const primaryIndex = month.hiddenStems.findIndex((h) => h.primary);
  const primary = primaryIndex >= 0 ? month.hiddenStems[primaryIndex]! : null;
  const primaryElement = primary?.element ?? null;
  const dayElement = bazi.dayMaster.element;
  const dayMasterRelation =
    isElement(dayElement) && isElement(primaryElement)
      ? elementRelation(dayElement, primaryElement)
      : null;

  // --- Visible stems: fixed scan order, one bucket per stem. ---
  const support: VisibleStemFact[] = [];
  const outputDrain: VisibleStemFact[] = [];
  const wealthDrain: VisibleStemFact[] = [];
  const officerPressure: VisibleStemFact[] = [];
  for (const name of VISIBLE_PILLAR_ORDER) {
    const p: BaziPillar | null = bazi.pillars[name];
    if (p === null) continue;
    const tenGod = p.tenGod;
    if (tenGod === null) continue; // provider always records a ten god for non-day pillars
    const fact: VisibleStemFact = {
      pillar: name,
      stem: p.stem,
      element: p.stemElement,
      tenGod,
      factRef: `bazi.pillars.${name}.stem`,
    };
    if (SUPPORT_TEN_GODS.has(tenGod)) support.push(fact);
    else if (OUTPUT_DRAIN_TEN_GODS.has(tenGod)) outputDrain.push(fact);
    else if (WEALTH_DRAIN_TEN_GODS.has(tenGod)) wealthDrain.push(fact);
    else if (OFFICER_PRESSURE_TEN_GODS.has(tenGod)) officerPressure.push(fact);
    // Unknown ten-god labels are not classified into any bucket.
  }

  return {
    chartSource: {
      rulesetId: bazi.rulesetId,
      providerId: bazi.provider.id,
      providerVersion: bazi.provider.version,
    },
    dayMaster: {
      stem: bazi.dayMaster.stem,
      element: dayElement,
      factRef: 'bazi.dayMaster.element',
    },
    inspectedPillars,
    omittedPillars,
    monthCommand: {
      monthBranch: month.branch,
      primaryHiddenStem: primary?.stem ?? null,
      primaryHiddenStemElement: primaryElement,
      primaryHiddenStemIndex: primaryIndex >= 0 ? primaryIndex : null,
      dayMasterRelation,
      monthBranchFactRef: 'bazi.pillars.month.branch',
      primaryHiddenStemFactRef:
        primaryIndex >= 0
          ? `bazi.pillars.month.hiddenStems[${primaryIndex}]`
          : 'bazi.pillars.month.hiddenStems',
    },
    directRoots: collectDirectRootEvidence(bazi),
    visibleStems: { support, outputDrain, wealthDrain, officerPressure },
  };
}
