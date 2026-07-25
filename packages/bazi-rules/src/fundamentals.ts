/**
 * Shared five-element (五行) arithmetic for the interpretation rules. The chart
 * already supplies each stem/branch's element and ten-god; this module only encodes
 * the generating (生) and controlling (克) cycles used to reason about strength.
 */

export type Element = '木' | '火' | '土' | '金' | '水';

/** The generating cycle: 木生火, 火生土, 土生金, 金生水, 水生木. */
const GENERATES: Record<Element, Element> = {
  木: '火',
  火: '土',
  土: '金',
  金: '水',
  水: '木',
};

/** The controlling cycle: 木克土, 土克水, 水克火, 火克金, 金克木. */
const CONTROLS: Record<Element, Element> = {
  木: '土',
  土: '水',
  水: '火',
  火: '金',
  金: '木',
};

export type ElementRelation =
  | 'same' // 同气 (比劫)
  | 'generates-me' // 生我 (印)
  | 'i-generate' // 我生 (食伤)
  | 'controls-me' // 克我 (官杀)
  | 'i-control'; // 我克 (财)

/** How `other` relates to the day-master element `me`. */
export function elementRelation(me: Element, other: Element): ElementRelation {
  if (me === other) return 'same';
  if (GENERATES[other] === me) return 'generates-me';
  if (GENERATES[me] === other) return 'i-generate';
  if (CONTROLS[other] === me) return 'controls-me';
  return 'i-control';
}

/** The five ten-god categories, grouped by their relation to the day master. */
export type TenGodCategory = '比劫' | '印' | '食伤' | '财' | '官杀';

const TEN_GOD_CATEGORY: Record<string, TenGodCategory> = {
  比肩: '比劫',
  劫财: '比劫',
  正印: '印',
  偏印: '印',
  食神: '食伤',
  伤官: '食伤',
  正财: '财',
  偏财: '财',
  正官: '官杀',
  七杀: '官杀',
};

/** Map a ten-god name (十神) to its category, or undefined for 日主/unknown. */
export function tenGodCategory(tenGod: string | null | undefined): TenGodCategory | undefined {
  return tenGod ? TEN_GOD_CATEGORY[tenGod] : undefined;
}

/** The element that stands in each relation to the day-master element `me`. */
export function elementsByRelation(me: Element): {
  same: Element; // 比劫
  resource: Element; // 印 (生我)
  output: Element; // 食伤 (我生)
  wealth: Element; // 财 (我克)
  officer: Element; // 官杀 (克我)
} {
  const resource = (Object.keys(GENERATES) as Element[]).find((e) => GENERATES[e] === me)!;
  const officer = (Object.keys(CONTROLS) as Element[]).find((e) => CONTROLS[e] === me)!;
  return { same: me, resource, output: GENERATES[me], wealth: CONTROLS[me], officer };
}

/** 临官(禄) branch of each day stem — the seat of 建禄格. */
const STEM_LU: Record<string, string> = {
  甲: '寅',
  乙: '卯',
  丙: '巳',
  丁: '午',
  戊: '巳',
  己: '午',
  庚: '申',
  辛: '酉',
  壬: '亥',
  癸: '子',
};

/** 帝旺(阳刃) branch of each yang day stem — the seat of 阳刃格 (yin stems have none here). */
const STEM_BLADE: Record<string, string> = {
  甲: '卯',
  丙: '午',
  戊: '午',
  庚: '酉',
  壬: '子',
};

/** 墓库/杂气 branches (辰戌丑未): their pattern is taken from what 透干, not the 本气. */
const TOMB_BRANCHES = new Set(['辰', '戌', '丑', '未']);

/** The 临官(禄) branch of a day stem, or undefined. */
export function luBranchOf(stem: string): string | undefined {
  return STEM_LU[stem];
}
/** The 帝旺(阳刃) branch of a yang day stem, or undefined for yin stems. */
export function bladeBranchOf(stem: string): string | undefined {
  return STEM_BLADE[stem];
}
/** True for the four 墓库/杂气 branches (辰戌丑未). */
export function isTombBranch(branch: string): boolean {
  return TOMB_BRANCHES.has(branch);
}

/** Element of each heavenly stem. */
const STEM_ELEMENT: Record<string, Element> = {
  甲: '木',
  乙: '木',
  丙: '火',
  丁: '火',
  戊: '土',
  己: '土',
  庚: '金',
  辛: '金',
  壬: '水',
  癸: '水',
};
/** Yang (true) / Yin (false) polarity of each heavenly stem. */
const STEM_YANG: Record<string, boolean> = {
  甲: true,
  乙: false,
  丙: true,
  丁: false,
  戊: true,
  己: false,
  庚: true,
  辛: false,
  壬: true,
  癸: false,
};

/** Element of a heavenly stem, or undefined. */
export function stemElement(stem: string): Element | undefined {
  return STEM_ELEMENT[stem];
}

/**
 * Specific ten-god (十神) of the `other` stem relative to the day master `dayStem`
 * — with the 正/偏 (same-polarity → 偏/比肩/七杀, opposite → 正/劫财) distinction, e.g.
 * for 戊土 day: 庚→食神, 辛→伤官, 壬→偏财, 癸→正财, 甲→七杀, 乙→正官.
 */
export function tenGodOf(dayStem: string, other: string): string | undefined {
  const de = STEM_ELEMENT[dayStem];
  const oe = STEM_ELEMENT[other];
  if (de === undefined || oe === undefined) return undefined;
  const same = STEM_YANG[dayStem] === STEM_YANG[other];
  switch (elementRelation(de, oe)) {
    case 'same':
      return same ? '比肩' : '劫财';
    case 'generates-me':
      return same ? '偏印' : '正印';
    case 'i-generate':
      return same ? '食神' : '伤官';
    case 'i-control':
      return same ? '偏财' : '正财';
    case 'controls-me':
      return same ? '七杀' : '正官';
  }
}
