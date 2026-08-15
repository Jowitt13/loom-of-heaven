import type { BaziChartResult, BaziPillar } from '@loom/contracts';

/**
 * D1-A shadow-only structural evidence: raw direct-root (通根) existence
 * candidates collected from provider-returned chart facts.
 *
 * This module is pure fact collection, not 命理 judgment. It does NOT:
 * - infer or name secondary/residual/level hidden-stem tiers;
 * - assess whether a root is effective, strong, weak, usable, or damaged;
 * - evaluate clashes, harmonies, punishments, or transformations;
 * - output polarity, patterns, useful gods, scores, or life conclusions.
 *
 * It is not wired into `interpretBazi`, the orchestrator, contracts, or any
 * user-visible output. It only records where the day-master element already
 * appears inside provider-returned hidden stems.
 */

export type RootPillarName = 'year' | 'month' | 'day' | 'hour';

/** One hidden stem whose element equals the day-master element. */
export type DirectRootCandidate = {
  /** Pillar position, in the fixed scan order year → month → day → hour. */
  pillar: RootPillarName;
  /** Earth branch (地支) hosting the hidden stem. */
  branch: string;
  /** Hidden-stem name (藏干), copied verbatim from the provider. */
  hiddenStem: string;
  /** Element of the hidden stem (equals the day-master element). */
  element: string;
  /** Ten-god label recorded by the provider, copied verbatim. */
  tenGod: string;
  /** Index inside the provider's original hiddenStems array (order preserved). */
  hiddenStemIndex: number;
  /** The provider's existing `primary` flag, copied verbatim. */
  providerPrimary: boolean;
  /** Stable path reference into the source chart. */
  factRef: string;
};

/** Collected direct-root existence evidence for one chart. */
export type DirectRootEvidence = {
  /** Day-master element the scan matched against. */
  dayMasterElement: string;
  /** Provenance copied verbatim from the input chart. */
  chartSource: {
    rulesetId: string;
    providerId: string;
    providerVersion: string;
  };
  /** All same-element hidden-stem occurrences, in fixed scan order. */
  candidates: readonly DirectRootCandidate[];
  /** True when at least one candidate exists. */
  hasDirectRoot: boolean;
  /** Pillars that existed and were scanned, in fixed order. */
  inspectedPillars: readonly RootPillarName[];
  /** Pillars that could not be scanned (hour pillar null when time unknown). */
  omittedPillars: readonly RootPillarName[];
};

const PILLAR_ORDER: readonly RootPillarName[] = ['year', 'month', 'day', 'hour'];

/**
 * Collect raw direct-root existence evidence for the day master from a
 * computed `BaziChartResult`. Pure, deterministic, offline: the same input
 * always produces byte-identical JSON output.
 *
 * Fixed algorithm:
 * - read `bazi.dayMaster.element`;
 * - scan pillars in fixed order year → month → day → hour;
 * - a null hour pillar is recorded in `omittedPillars` and never throws;
 * - for each existing pillar, scan the provider's hiddenStems in their
 *   original array order;
 * - only hidden stems whose element equals the day-master element produce a
 *   candidate; every other hidden stem (including resource 印 stems) is
 *   ignored and cannot inflate the candidate set.
 */
export function collectDirectRootEvidence(bazi: BaziChartResult): DirectRootEvidence {
  const dayMasterElement = bazi.dayMaster.element;
  const candidates: DirectRootCandidate[] = [];
  const inspectedPillars: RootPillarName[] = [];
  const omittedPillars: RootPillarName[] = [];

  for (const pillar of PILLAR_ORDER) {
    const p: BaziPillar | null = bazi.pillars[pillar];
    if (p === null) {
      omittedPillars.push(pillar);
      continue;
    }
    inspectedPillars.push(pillar);
    p.hiddenStems.forEach((hidden, hiddenStemIndex) => {
      if (hidden.element !== dayMasterElement) return;
      candidates.push({
        pillar,
        branch: p.branch,
        hiddenStem: hidden.stem,
        element: hidden.element,
        tenGod: hidden.tenGod,
        hiddenStemIndex,
        providerPrimary: hidden.primary,
        factRef: `bazi.pillars.${pillar}.hiddenStems[${hiddenStemIndex}]`,
      });
    });
  }

  return {
    dayMasterElement,
    chartSource: {
      rulesetId: bazi.rulesetId,
      providerId: bazi.provider.id,
      providerVersion: bazi.provider.version,
    },
    candidates,
    hasDirectRoot: candidates.length > 0,
    inspectedPillars,
    omittedPillars,
  };
}
