import type { BaziChartResult, BaziPillar } from '@loom/contracts';
import { bladeBranchOf, isTombBranch, luBranchOf } from './fundamentals.ts';
import { collectRelationGeometry, type RelationGeometryFact } from './relation-geometry.ts';

/**
 * D2-B shadow-only evidence collection: pattern-candidate inputs (格局候选证据).
 *
 * This module records chart facts and evidence-only candidates. It is NOT a
 * pattern decider. It does NOT:
 * - conclude 成格/破格, select a pattern, or pick a main transparent qi;
 * - output strength verdicts, useful gods, polarity, or life conclusions;
 * - create follow/dominant/transformation state candidates (BLOCKED_SCHOOL);
 * - interpret stem combinations as transformation opportunity or success.
 *
 * Every candidate carries `finalization: 'evidence-only'` and only the statuses
 * `matched | not-applicable | unresolved`. `matched` means the naming/seat
 * condition hit — never that a pattern is formed.
 *
 * Not exported from the package index; not wired to `interpretBazi`, the
 * orchestrator, CLI, contracts, or any user-visible output.
 */

export type PatternPillarName = 'year' | 'month' | 'day' | 'hour';

export type PatternEvidenceItem = {
  /** Resolvable to a chart input fact or a D1-A/D1-B earlier-stage fact. */
  ref: string;
  layer: 'fact' | 'derived-structure';
  role: 'support' | 'blocker' | 'contradiction' | 'context';
  note: string;
};

export type PatternCandidateStatus = 'matched' | 'not-applicable' | 'unresolved';

export type PatternCandidate = {
  candidateId: string;
  status: PatternCandidateStatus;
  finalization: 'evidence-only';
  evidence: readonly PatternEvidenceItem[];
};

export type MiscQiTransparencyFact = {
  hiddenStem: string;
  element: string;
  tenGod: string;
  hiddenStemIndex: number;
  providerPrimary: boolean;
  hiddenStemFactRef: string;
  /** First visible stem (year → month → day → hour) matching this hidden stem, or null. */
  visibleStemFactRef: string | null;
  visiblePillar: PatternPillarName | null;
};

export type PatternInputs = {
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
  inspectedPillars: readonly PatternPillarName[];
  omittedPillars: readonly PatternPillarName[];
  /** Regular month-command naming candidate — naming only, never 成格. */
  monthCommand: {
    monthBranch: string;
    monthBranchFactRef: string;
    primaryHiddenStem: string | null;
    primaryHiddenStemTenGod: string | null;
    primaryHiddenStemIndex: number | null;
    primaryHiddenStemFactRef: string;
    namingCandidate: PatternCandidate;
  };
  /** 建禄 exact-seat evidence; a 比劫 month alone is never 建禄. */
  jianLu: PatternCandidate;
  /** 阳刃 exact-seat evidence; yin stems stay unresolved without claiming universality. */
  yangRen: PatternCandidate;
  /** 墓库/杂气 month raw transparency facts; no ordering, no selection, no guessing. */
  miscQi: {
    isTombMonth: boolean;
    monthBranchFactRef: string;
    transparencyFacts: readonly MiscQiTransparencyFact[];
    candidate: PatternCandidate;
  };
  /** D1-B stem-five-combination geometry facts reused verbatim; geometry only. */
  stemCombinations: readonly RelationGeometryFact[];
};

const PILLAR_ORDER: readonly PatternPillarName[] = ['year', 'month', 'day', 'hour'];
const YANG_STEMS: ReadonlySet<string> = new Set(['甲', '丙', '戊', '庚', '壬']);

/** Regular pattern names by month primary-qi ten god (same family as legacy). */
const REGULAR_PATTERN_BY_GOD: Readonly<Record<string, string>> = {
  正官: '正官格',
  七杀: '七杀格',
  正财: '正财格',
  偏财: '偏财格',
  正印: '正印格',
  偏印: '偏印格(枭印格)',
  食神: '食神格',
  伤官: '伤官格',
};

function factRefFor(name: PatternPillarName, field: 'stem' | 'branch'): string {
  return `bazi.pillars.${name}.${field}`;
}

/**
 * Collect pattern-candidate input facts from a computed `BaziChartResult`.
 * Pure, deterministic, offline: identical input always yields byte-identical
 * JSON output. Fixed scan orders: pillars year → month → day → hour; visible
 * stems year → month → day → hour (the day stem participates in transparency
 * scanning); a null hour pillar yields no hour evidence anywhere.
 */
export function collectPatternInputs(bazi: BaziChartResult): PatternInputs {
  const inspectedPillars: PatternPillarName[] = [];
  const omittedPillars: PatternPillarName[] = [];
  for (const name of PILLAR_ORDER) {
    if (bazi.pillars[name] === null) omittedPillars.push(name);
    else inspectedPillars.push(name);
  }

  const dayStem = bazi.dayMaster.stem;
  const month = bazi.pillars.month;
  const monthBranchFactRef = factRefFor('month', 'branch');
  const primaryIndex = month.hiddenStems.findIndex((h) => h.primary);
  const primary = primaryIndex >= 0 ? month.hiddenStems[primaryIndex]! : null;
  const primaryHiddenStemFactRef =
    primaryIndex >= 0
      ? `bazi.pillars.month.hiddenStems[${primaryIndex}]`
      : 'bazi.pillars.month.hiddenStems';

  // --- A. Regular month-command naming candidate. ---
  let namingCandidate: PatternCandidate;
  if (primary === null) {
    namingCandidate = {
      candidateId: 'regular-month-command',
      status: 'unresolved',
      finalization: 'evidence-only',
      evidence: [
        {
          ref: 'bazi.pillars.month.hiddenStems',
          layer: 'fact',
          role: 'context',
          note: 'provider 未标记 primary 藏干，无法确定月令本气',
        },
      ],
    };
  } else {
    const name = REGULAR_PATTERN_BY_GOD[primary.tenGod];
    namingCandidate = {
      candidateId: `regular-month-command/${primary.tenGod}`,
      status: name === undefined ? 'not-applicable' : 'matched',
      finalization: 'evidence-only',
      evidence: [
        {
          ref: primaryHiddenStemFactRef,
          layer: 'fact',
          role: name === undefined ? 'context' : 'support',
          note:
            name === undefined
              ? `月令本气${primary.stem}十神${primary.tenGod}不在常规命名映射内（比劫类），不以月令本气命名`
              : `月令本气${primary.stem}十神${primary.tenGod}命中常规命名映射（${name}）——仅命名条件命中，不代表最终格局结论`,
        },
        {
          ref: monthBranchFactRef,
          layer: 'fact',
          role: 'context',
          note: '月令所在支',
        },
      ],
    };
  }

  // --- B. 建禄 exact-seat evidence. ---
  const luSeat = luBranchOf(dayStem);
  const luMatches = luSeat !== undefined && luSeat === month.branch;
  const jianLu: PatternCandidate = {
    candidateId: 'jian-lu',
    status: luMatches ? 'matched' : 'not-applicable',
    finalization: 'evidence-only',
    evidence: [
      {
        ref: 'bazi.dayMaster.stem',
        layer: 'fact',
        role: 'context',
        note: `日主${dayStem}的临官(禄)座位表项为${luSeat ?? '无表项'}`,
      },
      {
        ref: monthBranchFactRef,
        layer: 'fact',
        role: luMatches ? 'support' : 'context',
        note: luMatches
          ? `月支${month.branch}与临官座位精确匹配`
          : `月支${month.branch}与临官座位不一致——比劫当令不自动等于建禄`,
      },
    ],
  };

  // --- C. 阳刃 exact-seat evidence. ---
  const bladeSeat = bladeBranchOf(dayStem);
  const isYangStem = YANG_STEMS.has(dayStem);
  let yangRen: PatternCandidate;
  if (!isYangStem) {
    yangRen = {
      candidateId: 'yang-ren',
      status: 'unresolved',
      finalization: 'evidence-only',
      evidence: [
        {
          ref: 'bazi.dayMaster.stem',
          layer: 'fact',
          role: 'context',
          note: `日主${dayStem}为阴干，现有 legacy 阳刃座位表不含阴干条目`,
        },
        {
          ref: monthBranchFactRef,
          layer: 'fact',
          role: 'context',
          note: `月支${month.branch}事实保留；阴干阳刃定义流派存异、规则尚未冻结，此处不构成普遍性结论`,
        },
      ],
    };
  } else {
    const bladeMatches = bladeSeat !== undefined && bladeSeat === month.branch;
    yangRen = {
      candidateId: 'yang-ren',
      status: bladeMatches ? 'matched' : 'not-applicable',
      finalization: 'evidence-only',
      evidence: [
        {
          ref: 'bazi.dayMaster.stem',
          layer: 'fact',
          role: 'context',
          note: `日主${dayStem}的帝旺(刃)座位表项为${bladeSeat ?? '无表项'}`,
        },
        {
          ref: monthBranchFactRef,
          layer: 'fact',
          role: bladeMatches ? 'support' : 'context',
          note: bladeMatches
            ? `月支${month.branch}与帝旺座位精确匹配（仅座位事实）`
            : `月支${month.branch}与帝旺座位不一致`,
        },
      ],
    };
  }

  // --- D. 墓库/杂气 raw transparency facts. ---
  const isTomb = isTombBranch(month.branch);
  const visibleStems: Array<{ pillar: PatternPillarName; stem: string; factRef: string }> = [];
  for (const name of PILLAR_ORDER) {
    const p: BaziPillar | null = bazi.pillars[name];
    if (p === null) continue;
    visibleStems.push({ pillar: name, stem: p.stem, factRef: factRefFor(name, 'stem') });
  }
  const transparencyFacts: MiscQiTransparencyFact[] = month.hiddenStems.map((h, idx) => {
    const visible = visibleStems.find((v) => v.stem === h.stem) ?? null;
    return {
      hiddenStem: h.stem,
      element: h.element,
      tenGod: h.tenGod,
      hiddenStemIndex: idx,
      providerPrimary: h.primary,
      hiddenStemFactRef: `bazi.pillars.month.hiddenStems[${idx}]`,
      visibleStemFactRef: visible === null ? null : visible.factRef,
      visiblePillar: visible === null ? null : visible.pillar,
    };
  });
  const transparentNonPrimary = transparencyFacts.filter(
    (t) => !t.providerPrimary && t.visibleStemFactRef !== null,
  );

  let miscCandidate: PatternCandidate;
  if (!isTomb) {
    miscCandidate = {
      candidateId: 'miscellaneous-qi-transparency',
      status: 'not-applicable',
      finalization: 'evidence-only',
      evidence: [
        {
          ref: monthBranchFactRef,
          layer: 'fact',
          role: 'context',
          note: `月支${month.branch}非墓库(辰戌丑未)，杂气透干取格不适用`,
        },
      ],
    };
  } else if (transparentNonPrimary.length > 0) {
    miscCandidate = {
      candidateId: 'miscellaneous-qi-transparency',
      status: 'matched',
      finalization: 'evidence-only',
      evidence: transparentNonPrimary.map((t) => ({
        ref: t.hiddenStemFactRef,
        layer: 'fact',
        role: 'support',
        note: `${t.hiddenStem}${t.tenGod}透干于${t.visiblePillar}干——全部竞争项原样保留，不排序、不择主、不定格`,
      })),
    };
  } else {
    miscCandidate = {
      candidateId: 'miscellaneous-qi-transparency',
      status: 'unresolved',
      finalization: 'evidence-only',
      evidence: [
        {
          ref: monthBranchFactRef,
          layer: 'fact',
          role: 'context',
          note: `月支${month.branch}为墓库，但所有 providerPrimary=false 藏干均未出现于四柱可见天干；透明集合如实为空，不从月令本气猜格`,
        },
      ],
    };
  }

  // --- E. Stem five-combination geometry, reused verbatim from D1-B. ---
  const stemCombinations = collectRelationGeometry(bazi).facts.filter(
    (f) => f.kind === 'stem-five-combination',
  );

  return {
    chartSource: {
      rulesetId: bazi.rulesetId,
      providerId: bazi.provider.id,
      providerVersion: bazi.provider.version,
    },
    dayMaster: {
      stem: dayStem,
      element: bazi.dayMaster.element,
      factRef: 'bazi.dayMaster.element',
    },
    inspectedPillars,
    omittedPillars,
    monthCommand: {
      monthBranch: month.branch,
      monthBranchFactRef,
      primaryHiddenStem: primary?.stem ?? null,
      primaryHiddenStemTenGod: primary?.tenGod ?? null,
      primaryHiddenStemIndex: primaryIndex >= 0 ? primaryIndex : null,
      primaryHiddenStemFactRef,
      namingCandidate,
    },
    jianLu,
    yangRen,
    miscQi: {
      isTombMonth: isTomb,
      monthBranchFactRef,
      transparencyFacts,
      candidate: miscCandidate,
    },
    stemCombinations,
  };
}
