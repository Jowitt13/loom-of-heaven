import type { BaziChartResult, BaziPillar } from '@loom/contracts';

/**
 * D1-B shadow-only structural evidence: relation geometry (关系几何).
 *
 * This module records pure table-hit geometry between provider-returned stems
 * and branches. It performs NO interpretive judgment:
 * - no polarity (吉/凶), auspiciousness, or favorability;
 * - no effect, weakening, neutralization, or strength reasoning;
 * - no transformation (化气/成化) — a combination table hit is only a geometry
 *   fact and never implies a transformed element;
 * - no pattern, useful-god, or life conclusions.
 *
 * It is not exported from the package index, is not wired into `interpretBazi`,
 * the orchestrator, contracts, CLI, or any user-visible output. Overlapping
 * table hits are all preserved — no priority logic may swallow any hit.
 */

export type GeometryPillarName = 'year' | 'month' | 'day' | 'hour';

export type GeometryParticipant = {
  /** Pillar position in the fixed scan order year → month → day → hour. */
  pillar: GeometryPillarName;
  /** The stem (干) or branch (支) character that hit the table entry. */
  value: string;
  /** Stable path into the source chart. */
  factRef: string;
};

export type RelationGeometryKind =
  | 'branch-six-harmony'
  | 'branch-clash'
  | 'branch-harm'
  | 'branch-break'
  | 'branch-punishment-mutual'
  | 'branch-punishment-three'
  | 'branch-punishment-self'
  | 'branch-three-harmony-partial'
  | 'branch-three-harmony-complete'
  | 'branch-three-meeting'
  | 'stem-five-combination';

export type RelationGeometryFact = {
  kind: RelationGeometryKind;
  /** Participants in fixed scan order (year → month → day → hour). */
  participants: readonly GeometryParticipant[];
  /** Identifies the table entry only, e.g. `branch-clash/子午`; implies no effect. */
  tableRef: string;
};

export type RelationGeometryEvidence = {
  /** Provenance copied verbatim from the input chart. */
  chartSource: {
    rulesetId: string;
    providerId: string;
    providerVersion: string;
  };
  /** Pillars that existed and were scanned, in fixed order. */
  inspectedPillars: readonly GeometryPillarName[];
  /** Pillars that could not be scanned (hour pillar null when time unknown). */
  omittedPillars: readonly GeometryPillarName[];
  /** All geometry facts, in deterministic output order. */
  facts: readonly RelationGeometryFact[];
};

const PILLAR_ORDER: readonly GeometryPillarName[] = ['year', 'month', 'day', 'hour'];

/** Unordered-pair key: sorted concatenation, stable for lookup only. */
const pairKey = (a: string, b: string): string => (a < b ? a + b : b + a);

interface PairTable {
  kind: RelationGeometryKind;
  /** canonical table entry name → sorted key, one entry per classical pair. */
  lookup: ReadonlyMap<string, string>;
}

function pairTable(kind: RelationGeometryKind, canonicalPairs: readonly string[]): PairTable {
  const lookup = new Map<string, string>();
  for (const c of canonicalPairs) lookup.set(pairKey(c[0]!, c[1]!), c);
  return { kind, lookup };
}

const PAIR_TABLES: readonly PairTable[] = [
  pairTable('branch-six-harmony', ['子丑', '寅亥', '卯戌', '辰酉', '巳申', '午未']),
  pairTable('branch-clash', ['子午', '丑未', '寅申', '卯酉', '辰戌', '巳亥']),
  pairTable('branch-harm', ['子未', '丑午', '寅巳', '卯辰', '申亥', '酉戌']),
  pairTable('branch-break', ['子酉', '午卯', '巳申', '寅亥', '辰丑', '戌未']),
  pairTable('branch-punishment-mutual', ['子卯']),
];

/** Three-punishment groups — recorded only when all three branches are present. */
const PUNISHMENT_THREE_GROUPS: readonly (readonly string[])[] = [
  ['寅', '巳', '申'],
  ['丑', '戌', '未'],
];

/** Self-punishment branches — recorded only when the same branch appears ≥2×. */
const PUNISHMENT_SELF_BRANCHES: readonly string[] = ['辰', '午', '酉', '亥'];

/** Three-harmony bureaus; `center` is the 中神 that must be present for a partial. */
const THREE_HARMONY: readonly { set: readonly string[]; center: string }[] = [
  { set: ['申', '子', '辰'], center: '子' },
  { set: ['寅', '午', '戌'], center: '午' },
  { set: ['巳', '酉', '丑'], center: '酉' },
  { set: ['亥', '卯', '未'], center: '卯' },
];

/** Three-meeting trios — recorded only when all three branches are present. */
const THREE_MEETING: readonly (readonly string[])[] = [
  ['寅', '卯', '辰'],
  ['巳', '午', '未'],
  ['申', '酉', '戌'],
  ['亥', '子', '丑'],
];

/** Five stem combinations — geometry only, never transformation. */
const STEM_FIVE_CANONICAL: readonly string[] = ['甲己', '乙庚', '丙辛', '丁壬', '戊癸'];

const STEM_FIVE_LOOKUP: ReadonlyMap<string, string> = new Map(
  STEM_FIVE_CANONICAL.map((c) => [pairKey(c[0]!, c[1]!), c]),
);

interface PillarEntry {
  name: GeometryPillarName;
  p: BaziPillar;
}

function branchPart(entry: PillarEntry): GeometryParticipant {
  return {
    pillar: entry.name,
    value: entry.p.branch,
    factRef: `bazi.pillars.${entry.name}.branch`,
  };
}

function stemPart(entry: PillarEntry): GeometryParticipant {
  return {
    pillar: entry.name,
    value: entry.p.stem,
    factRef: `bazi.pillars.${entry.name}.stem`,
  };
}

/**
 * Collect pure relation-geometry facts from a computed `BaziChartResult`.
 * Pure, deterministic, offline: identical input always yields byte-identical
 * JSON output.
 *
 * Fixed behavior:
 * - scans pillars in fixed order year → month → day → hour;
 * - a null hour pillar goes to `omittedPillars` and never produces any fact;
 * - pairwise branch tables (六合/六冲/六害/相破/子卯互刑) are checked per
 *   unordered pillar pair; every overlapping hit is kept, none is swallowed;
 * - 寅巳申 / 丑戌未 three-punishments require all three branches;
 * - self-punishments require the same branch at least twice;
 * - three-harmony: complete requires all three members; partial requires the
 *   center (中神) plus one wing; two wings without the center yield nothing;
 * - three-meeting requires all three branches;
 * - stem five-combinations are recorded for any pair of pillar stems,
 *   including the day stem, with no adjacency/season/transformation judgment.
 */
export function collectRelationGeometry(bazi: BaziChartResult): RelationGeometryEvidence {
  const pillars: PillarEntry[] = [];
  const omittedPillars: GeometryPillarName[] = [];
  for (const name of PILLAR_ORDER) {
    const p = bazi.pillars[name];
    if (p === null) {
      omittedPillars.push(name);
      continue;
    }
    pillars.push({ name, p });
  }

  const facts: RelationGeometryFact[] = [];

  // --- 1. Pairwise branch relations (fixed pair order, then table order). ---
  for (let i = 0; i < pillars.length; i++) {
    for (let j = i + 1; j < pillars.length; j++) {
      const a = pillars[i]!;
      const b = pillars[j]!;
      const key = pairKey(a.p.branch, b.p.branch);
      for (const table of PAIR_TABLES) {
        const canonical = table.lookup.get(key);
        if (canonical === undefined) continue;
        facts.push({
          kind: table.kind,
          participants: [branchPart(a), branchPart(b)],
          tableRef: `${table.kind}/${canonical}`,
        });
      }
    }
  }

  // --- 2. Group branch relations (fixed group order). ---
  const byBranch = new Map<string, PillarEntry[]>();
  for (const entry of pillars) {
    const list = byBranch.get(entry.p.branch) ?? [];
    list.push(entry);
    byBranch.set(entry.p.branch, list);
  }
  const present = new Set(byBranch.keys());
  const orderedParticipants = (branches: readonly string[]): GeometryParticipant[] =>
    branches
      .map((b) => branchPart(byBranch.get(b)![0]!))
      .sort((x, y) => PILLAR_ORDER.indexOf(x.pillar) - PILLAR_ORDER.indexOf(y.pillar));

  for (const group of PUNISHMENT_THREE_GROUPS) {
    if (group.every((b) => present.has(b))) {
      facts.push({
        kind: 'branch-punishment-three',
        participants: orderedParticipants(group),
        tableRef: `branch-punishment-three/${group.join('')}`,
      });
    }
  }

  for (const he of THREE_HARMONY) {
    const members = he.set.filter((b) => present.has(b));
    if (members.length === 3) {
      facts.push({
        kind: 'branch-three-harmony-complete',
        participants: orderedParticipants(he.set),
        tableRef: `branch-three-harmony-complete/${he.set.join('')}`,
      });
    } else if (present.has(he.center) && members.length === 2) {
      // Center plus one wing only; two wings without the center yield nothing.
      facts.push({
        kind: 'branch-three-harmony-partial',
        participants: orderedParticipants(members),
        tableRef: `branch-three-harmony-partial/${he.set.filter((b) => present.has(b)).join('')}`,
      });
    }
  }

  for (const hui of THREE_MEETING) {
    if (hui.every((b) => present.has(b))) {
      facts.push({
        kind: 'branch-three-meeting',
        participants: orderedParticipants(hui),
        tableRef: `branch-three-meeting/${hui.join('')}`,
      });
    }
  }

  for (const b of PUNISHMENT_SELF_BRANCHES) {
    const hits = byBranch.get(b);
    if (hits !== undefined && hits.length >= 2) {
      facts.push({
        kind: 'branch-punishment-self',
        participants: hits.map((entry) => branchPart(entry)),
        tableRef: `branch-punishment-self/${b}`,
      });
    }
  }

  // --- 3. Stem five-combinations (fixed pair order). ---
  for (let i = 0; i < pillars.length; i++) {
    for (let j = i + 1; j < pillars.length; j++) {
      const a = pillars[i]!;
      const b = pillars[j]!;
      const canonical = STEM_FIVE_LOOKUP.get(pairKey(a.p.stem, b.p.stem));
      if (canonical === undefined) continue;
      facts.push({
        kind: 'stem-five-combination',
        participants: [stemPart(a), stemPart(b)],
        tableRef: `stem-five-combination/${canonical}`,
      });
    }
  }

  return {
    chartSource: {
      rulesetId: bazi.rulesetId,
      providerId: bazi.provider.id,
      providerVersion: bazi.provider.version,
    },
    inspectedPillars: pillars.map((entry) => entry.name),
    omittedPillars,
    facts,
  };
}
