/**
 * Official-IPIP-bound Mandarin IPIP-NEO-120 data (P3).
 *
 * The item and key source pages are public-domain IPIP material. This file keeps
 * only the exact Mandarin item text, source-bound facet ids, and reverse-key flags.
 */
export const IPIP_NEO_120_SOURCE = {
  instrumentId: 'ipip-neo-120@2014-zh-cn',
  language: 'zh-CN',
  retrievedAt: '2026-08-13',
  rights: 'IPIP items and scales are public domain; cite the named scale and translator.',
  citation:
    'Johnson, J. A. (2014). Measuring thirty facets of the Five Factor Model with a 120-item public domain inventory: Development of the IPIP-NEO-120. Journal of Research in Personality, 51, 78-89.',
  sources: {
    mandarinItems: {
      url: 'https://ipip.ori.org/Mandarin%20translation%20of%20IPIP-NEO-120.htm',
      sha256: '8b9a60302046a5359a8a980a337b148a96c21ee80f8825acc0d552b89480b16c',
    },
    scoringKeys: {
      url: 'https://ipip.ori.org/30FacetNEO-PI-RItems.htm',
      sha256: 'a0e491cc737a1d3f0fbc864d64bbc7c283fa696c64c05dab5c639ced4fc14512',
    },
    mandarinReliability: {
      url: 'https://ipip.ori.org/ChineseIPIP-120reliability.htm',
      sha256: 'f5db1b99eb44f30613e8f5c5e698b0738c65bad96e926b5638423bc000b2bb25',
    },
    scoringInstructions: {
      url: 'https://ipip.ori.org/newScoringInstructions.htm',
      sha256: '9429ac6d94589173a704c1079afe62833f8fcc5d0fe48e6df595b9022373af87',
    },
  },
  keyAlignment: {
    method: 'official Mandarin reliability table plus official 30-facet key order',
    officialEnglishVariantsAtItemNumbers: [28, 58, 59, 88, 101],
  },
  /**
   * A reference-only parity audit. No code, English wording, or community translation from this
   * package is bundled or used at runtime. It has no scorer; the 120/120 comparison covers only
   * the independently stored domain, facet, and plus/minus key metadata.
   */
  referenceOnlyAudit: {
    retrievedAt: '2026-08-13',
    repositoryUrl: 'https://github.com/Alheimsins/b5-johnson-120-ipip-neo-pi-r',
    commit: '493546d48eb9053aca7e6c55574f4bf8033cc5a4',
    license: 'MIT',
    sourceArchiveSha256: 'c31d4fffc56c81a54f6dee795625dc50b3ec5f3dc45e5d00fde146a0bfc7c70f',
    files: {
      licenseSha256: '2d96822370f7d783a27103e1dbb8b759d1ae44701a399c2cdac4922714ccc01b',
      packageJsonSha256: '225f779c1795464294368e26068d6ce8c4705682cf945ad2878b2f1bdfa67cf5',
      englishQuestionsSha256: 'a2c3eb00be6292454519aa6b84e04c0e67cae7195323faf79cefb6f6d1c8af1c',
    },
    comparison: {
      fields: ['domain', 'facet', 'keyed'] as const,
      referenceItems: 120,
      officialItems: 120,
      matchedItems: 120,
      purpose: 'key-metadata parity only; not a scoring, translation, norm, or clinical validation',
    },
  },
} as const;

/**
 * Exact Mandarin response wording from the official item page. The original
 * page also asks optional demographic/contact questions; this product neither
 * collects nor represents those fields, so they are intentionally absent from
 * the public session contract.
 */
export const IPIP_NEO_120_INSTRUCTIONS_ZH_CN =
  '接下来的题目是用来描述人们行为的语句。请你使用1-5分的打分（1分为“非常不准确”，5分为“非常准确”），来表明这些语句是否能准确描述你。请按照你当前的实际情况描述自己，而不是你希望自己未来能成为的样子。你应当诚实地描绘自己。';

export const IPIP_NEO_120_RESPONSE_OPTIONS_ZH_CN = [
  { value: 1, label: '非常不准确' },
  { value: 2, label: '不太不准确' },
  { value: 3, label: '适中' },
  { value: 4, label: '比较准确' },
  { value: 5, label: '非常准确' },
] as const;

export const IPIP_NEO_120_FACET_IDS = [
  'N1',
  'E1',
  'O1',
  'A1',
  'C1',
  'N2',
  'E2',
  'O2',
  'A2',
  'C2',
  'N3',
  'E3',
  'O3',
  'A3',
  'C3',
  'N4',
  'E4',
  'O4',
  'A4',
  'C4',
  'N5',
  'E5',
  'O5',
  'A5',
  'C5',
  'N6',
  'E6',
  'O6',
  'A6',
  'C6',
] as const;

export type IpipNeo120FacetId = (typeof IPIP_NEO_120_FACET_IDS)[number];

export interface IpipNeo120Item {
  id: string;
  textZhCN: string;
  facetId: IpipNeo120FacetId;
  reverseScored: boolean;
}

export const IPIP_NEO_120_ITEMS: readonly IpipNeo120Item[] = [
  { id: 'ipip-neo-120-001', textZhCN: '为很多事情感到担心', facetId: 'N1', reverseScored: false },
  { id: 'ipip-neo-120-002', textZhCN: '很容易交到朋友', facetId: 'E1', reverseScored: false },
  { id: 'ipip-neo-120-003', textZhCN: '有丰富的想象力', facetId: 'O1', reverseScored: false },
  { id: 'ipip-neo-120-004', textZhCN: '信任其他人', facetId: 'A1', reverseScored: false },
  { id: 'ipip-neo-120-005', textZhCN: '能成功完成任务', facetId: 'C1', reverseScored: false },
  { id: 'ipip-neo-120-006', textZhCN: '很容易生气', facetId: 'N2', reverseScored: false },
  { id: 'ipip-neo-120-007', textZhCN: '喜欢参加大型聚会', facetId: 'E2', reverseScored: false },
  { id: 'ipip-neo-120-008', textZhCN: '认为艺术是很重要的', facetId: 'O2', reverseScored: false },
  {
    id: 'ipip-neo-120-009',
    textZhCN: '会利用他人来达成自己的目的',
    facetId: 'A2',
    reverseScored: true,
  },
  { id: 'ipip-neo-120-010', textZhCN: '喜欢整洁', facetId: 'C2', reverseScored: false },
  { id: 'ipip-neo-120-011', textZhCN: '时常感到忧郁', facetId: 'N3', reverseScored: false },
  { id: 'ipip-neo-120-012', textZhCN: '承担责任', facetId: 'E3', reverseScored: false },
  {
    id: 'ipip-neo-120-013',
    textZhCN: '能强烈感受到自己的情绪',
    facetId: 'O3',
    reverseScored: false,
  },
  { id: 'ipip-neo-120-014', textZhCN: '乐于帮助他人', facetId: 'A3', reverseScored: false },
  { id: 'ipip-neo-120-015', textZhCN: '信守承诺', facetId: 'C3', reverseScored: false },
  { id: 'ipip-neo-120-016', textZhCN: '感觉自己很难接近别人', facetId: 'N4', reverseScored: false },
  { id: 'ipip-neo-120-017', textZhCN: '总是很忙碌', facetId: 'E4', reverseScored: false },
  {
    id: 'ipip-neo-120-018',
    textZhCN: '相比墨守成规，我更喜欢有变化。',
    facetId: 'O4',
    reverseScored: false,
  },
  { id: 'ipip-neo-120-019', textZhCN: '喜欢和别人比试', facetId: 'A4', reverseScored: true },
  { id: 'ipip-neo-120-020', textZhCN: '工作努力', facetId: 'C4', reverseScored: false },
  { id: 'ipip-neo-120-021', textZhCN: '大吃大喝寻欢作乐', facetId: 'N5', reverseScored: false },
  { id: 'ipip-neo-120-022', textZhCN: '喜欢追求刺激', facetId: 'E5', reverseScored: false },
  {
    id: 'ipip-neo-120-023',
    textZhCN: '喜欢阅读有挑战性的材料',
    facetId: 'O5',
    reverseScored: false,
  },
  { id: 'ipip-neo-120-024', textZhCN: '相信自己比别人更好', facetId: 'A5', reverseScored: true },
  { id: 'ipip-neo-120-025', textZhCN: '我总是有所准备', facetId: 'C5', reverseScored: false },
  { id: 'ipip-neo-120-026', textZhCN: '容易慌张', facetId: 'N6', reverseScored: false },
  {
    id: 'ipip-neo-120-027',
    textZhCN: '我的快乐会感染周围的人',
    facetId: 'E6',
    reverseScored: false,
  },
  {
    id: 'ipip-neo-120-028',
    textZhCN: '认为自己在政治方面非常自由开放',
    facetId: 'O6',
    reverseScored: false,
  },
  { id: 'ipip-neo-120-029', textZhCN: '同情流浪汉', facetId: 'A6', reverseScored: false },
  {
    id: 'ipip-neo-120-030',
    textZhCN: '会不经过思考就开始行动',
    facetId: 'C6',
    reverseScored: true,
  },
  {
    id: 'ipip-neo-120-031',
    textZhCN: '担心会发生最糟糕的情况',
    facetId: 'N1',
    reverseScored: false,
  },
  {
    id: 'ipip-neo-120-032',
    textZhCN: '和其他人待在一起时，我觉得很自在',
    facetId: 'E1',
    reverseScored: false,
  },
  { id: 'ipip-neo-120-033', textZhCN: '喜欢天马行空地幻想', facetId: 'O1', reverseScored: false },
  {
    id: 'ipip-neo-120-034',
    textZhCN: '相信他人的出发点是好的',
    facetId: 'A1',
    reverseScored: false,
  },
  {
    id: 'ipip-neo-120-035',
    textZhCN: '在自己所从事的领域出类拔萃',
    facetId: 'C1',
    reverseScored: false,
  },
  { id: 'ipip-neo-120-036', textZhCN: '容易被激怒', facetId: 'N2', reverseScored: false },
  {
    id: 'ipip-neo-120-037',
    textZhCN: '在聚会上，我会和很多不同的人交谈',
    facetId: 'E2',
    reverseScored: false,
  },
  {
    id: 'ipip-neo-120-038',
    textZhCN: '我能发现别人看不到的美',
    facetId: 'O2',
    reverseScored: false,
  },
  {
    id: 'ipip-neo-120-039',
    textZhCN: '为了领先别人，我会采用作弊的方式',
    facetId: 'A2',
    reverseScored: true,
  },
  {
    id: 'ipip-neo-120-040',
    textZhCN: '经常忘记把东西放回原处',
    facetId: 'C2',
    reverseScored: true,
  },
  { id: 'ipip-neo-120-041', textZhCN: '不喜欢自己', facetId: 'N3', reverseScored: false },
  { id: 'ipip-neo-120-042', textZhCN: '我会尝试去领导他人', facetId: 'E3', reverseScored: false },
  { id: 'ipip-neo-120-043', textZhCN: '能感受到他人的情绪', facetId: 'O3', reverseScored: false },
  { id: 'ipip-neo-120-044', textZhCN: '关心他人', facetId: 'A3', reverseScored: false },
  { id: 'ipip-neo-120-045', textZhCN: '我会实话实说', facetId: 'C3', reverseScored: false },
  { id: 'ipip-neo-120-046', textZhCN: '害怕引起他人的注意', facetId: 'N4', reverseScored: false },
  { id: 'ipip-neo-120-047', textZhCN: '总是在奔波', facetId: 'E4', reverseScored: false },
  {
    id: 'ipip-neo-120-048',
    textZhCN: '我更喜欢做自己熟悉的事情',
    facetId: 'O4',
    reverseScored: true,
  },
  { id: 'ipip-neo-120-049', textZhCN: '会冲人大喊大叫', facetId: 'A4', reverseScored: true },
  {
    id: 'ipip-neo-120-050',
    textZhCN: '我会超出预期地完成任务或工作',
    facetId: 'C4',
    reverseScored: false,
  },
  { id: 'ipip-neo-120-051', textZhCN: '很少过度放纵自己', facetId: 'N5', reverseScored: true },
  { id: 'ipip-neo-120-052', textZhCN: '喜欢冒险', facetId: 'E5', reverseScored: false },
  {
    id: 'ipip-neo-120-053',
    textZhCN: '会避免参与关于哲学的讨论',
    facetId: 'O5',
    reverseScored: true,
  },
  { id: 'ipip-neo-120-054', textZhCN: '觉得自己很了不起', facetId: 'A5', reverseScored: true },
  { id: 'ipip-neo-120-055', textZhCN: '能执行自己制定的计划', facetId: 'C5', reverseScored: false },
  {
    id: 'ipip-neo-120-056',
    textZhCN: '感到被各种事情压得喘不过气来',
    facetId: 'N6',
    reverseScored: false,
  },
  { id: 'ipip-neo-120-057', textZhCN: '我的生活很快乐', facetId: 'E6', reverseScored: false },
  {
    id: 'ipip-neo-120-058',
    textZhCN: '相信没有绝对的对错之分',
    facetId: 'O6',
    reverseScored: false,
  },
  {
    id: 'ipip-neo-120-059',
    textZhCN: '我同情那些处境不如自己的人',
    facetId: 'A6',
    reverseScored: false,
  },
  { id: 'ipip-neo-120-060', textZhCN: '会做出草率的决定', facetId: 'C6', reverseScored: true },
  { id: 'ipip-neo-120-061', textZhCN: '对很多事情感到害怕', facetId: 'N1', reverseScored: false },
  { id: 'ipip-neo-120-062', textZhCN: '避免和他人接触', facetId: 'E1', reverseScored: true },
  { id: 'ipip-neo-120-063', textZhCN: '喜欢做白日梦', facetId: 'O1', reverseScored: false },
  { id: 'ipip-neo-120-064', textZhCN: '相信他人说的话', facetId: 'A1', reverseScored: false },
  { id: 'ipip-neo-120-065', textZhCN: '能轻松完成任务', facetId: 'C1', reverseScored: false },
  { id: 'ipip-neo-120-066', textZhCN: '发脾气', facetId: 'N2', reverseScored: false },
  { id: 'ipip-neo-120-067', textZhCN: '更喜欢一个人独处', facetId: 'E2', reverseScored: true },
  { id: 'ipip-neo-120-068', textZhCN: '不喜欢诗歌', facetId: 'O2', reverseScored: true },
  { id: 'ipip-neo-120-069', textZhCN: '占别人的便宜', facetId: 'A2', reverseScored: true },
  { id: 'ipip-neo-120-070', textZhCN: '我的房间很乱', facetId: 'C2', reverseScored: true },
  { id: 'ipip-neo-120-071', textZhCN: '经常情绪低落', facetId: 'N3', reverseScored: false },
  { id: 'ipip-neo-120-072', textZhCN: '掌控局面', facetId: 'E3', reverseScored: false },
  {
    id: 'ipip-neo-120-073',
    textZhCN: '很少察觉到自己的情绪反应',
    facetId: 'O3',
    reverseScored: true,
  },
  { id: 'ipip-neo-120-074', textZhCN: '对他人的感受漠不关心', facetId: 'A3', reverseScored: true },
  { id: 'ipip-neo-120-075', textZhCN: '破坏规则', facetId: 'C3', reverseScored: true },
  {
    id: 'ipip-neo-120-076',
    textZhCN: '只有和朋友在一起的时候我才会感到自在',
    facetId: 'N4',
    reverseScored: false,
  },
  { id: 'ipip-neo-120-077', textZhCN: '我的闲暇时间非常充实', facetId: 'E4', reverseScored: false },
  { id: 'ipip-neo-120-078', textZhCN: '不喜欢改变', facetId: 'O4', reverseScored: true },
  { id: 'ipip-neo-120-079', textZhCN: '侮辱他人', facetId: 'A4', reverseScored: true },
  {
    id: 'ipip-neo-120-080',
    textZhCN: '在工作或学习上，我不会多做，过得去就行',
    facetId: 'C4',
    reverseScored: true,
  },
  { id: 'ipip-neo-120-081', textZhCN: '能轻松抵御诱惑', facetId: 'N5', reverseScored: true },
  { id: 'ipip-neo-120-082', textZhCN: '喜欢不计后果地行事', facetId: 'E5', reverseScored: false },
  {
    id: 'ipip-neo-120-083',
    textZhCN: '理解抽象概念对我来说有些困难',
    facetId: 'O5',
    reverseScored: true,
  },
  { id: 'ipip-neo-120-084', textZhCN: '对自己的评价很高', facetId: 'A5', reverseScored: true },
  { id: 'ipip-neo-120-085', textZhCN: '浪费时间', facetId: 'C5', reverseScored: true },
  {
    id: 'ipip-neo-120-086',
    textZhCN: '感觉自己处理事情力不从心',
    facetId: 'N6',
    reverseScored: false,
  },
  { id: 'ipip-neo-120-087', textZhCN: '热爱生活', facetId: 'E6', reverseScored: false },
  { id: 'ipip-neo-120-088', textZhCN: '我在政治上比较保守', facetId: 'O6', reverseScored: true },
  {
    id: 'ipip-neo-120-089',
    textZhCN: '对别人遇到的麻烦事不感兴趣',
    facetId: 'A6',
    reverseScored: true,
  },
  { id: 'ipip-neo-120-090', textZhCN: '仓促行事', facetId: 'C6', reverseScored: true },
  { id: 'ipip-neo-120-091', textZhCN: '我很容易觉得压力大', facetId: 'N1', reverseScored: false },
  { id: 'ipip-neo-120-092', textZhCN: '和他人保持距离', facetId: 'E1', reverseScored: true },
  { id: 'ipip-neo-120-093', textZhCN: '喜欢陷入沉思', facetId: 'O1', reverseScored: false },
  { id: 'ipip-neo-120-094', textZhCN: '不相信别人', facetId: 'A1', reverseScored: true },
  { id: 'ipip-neo-120-095', textZhCN: '知道如何完成任务', facetId: 'C1', reverseScored: false },
  { id: 'ipip-neo-120-096', textZhCN: '不会轻易被惹恼', facetId: 'N2', reverseScored: true },
  { id: 'ipip-neo-120-097', textZhCN: '避开人多的地方', facetId: 'E2', reverseScored: true },
  { id: 'ipip-neo-120-098', textZhCN: '不喜欢去美术馆', facetId: 'O2', reverseScored: true },
  { id: 'ipip-neo-120-099', textZhCN: '给别人使坏', facetId: 'A2', reverseScored: true },
  { id: 'ipip-neo-120-100', textZhCN: '我的东西放得到处都是', facetId: 'C2', reverseScored: true },
  { id: 'ipip-neo-120-101', textZhCN: '对自己感到满意', facetId: 'N3', reverseScored: true },
  { id: 'ipip-neo-120-102', textZhCN: '等着别人来带头', facetId: 'E3', reverseScored: true },
  { id: 'ipip-neo-120-103', textZhCN: '不理解那些情绪化的人', facetId: 'O3', reverseScored: true },
  { id: 'ipip-neo-120-104', textZhCN: '不愿为他人花费时间', facetId: 'A3', reverseScored: true },
  { id: 'ipip-neo-120-105', textZhCN: '违背自己的承诺', facetId: 'C3', reverseScored: true },
  {
    id: 'ipip-neo-120-106',
    textZhCN: '不会被复杂的社交情境所困扰',
    facetId: 'N4',
    reverseScored: true,
  },
  { id: 'ipip-neo-120-107', textZhCN: '喜欢慢慢来', facetId: 'E4', reverseScored: true },
  { id: 'ipip-neo-120-108', textZhCN: '我喜欢传统的方式', facetId: 'O4', reverseScored: true },
  { id: 'ipip-neo-120-109', textZhCN: '报复别人', facetId: 'A4', reverseScored: true },
  {
    id: 'ipip-neo-120-110',
    textZhCN: '对工作或学业不怎么投入时间和精力',
    facetId: 'C4',
    reverseScored: true,
  },
  { id: 'ipip-neo-120-111', textZhCN: '可以控制自己的欲望', facetId: 'N5', reverseScored: true },
  { id: 'ipip-neo-120-112', textZhCN: '我的行为狂放不羁', facetId: 'E5', reverseScored: false },
  {
    id: 'ipip-neo-120-113',
    textZhCN: '对理论性的讨论不感兴趣',
    facetId: 'O5',
    reverseScored: true,
  },
  { id: 'ipip-neo-120-114', textZhCN: '吹嘘自己的美德', facetId: 'A5', reverseScored: true },
  { id: 'ipip-neo-120-115', textZhCN: '拖很久才开始做一件事', facetId: 'C5', reverseScored: true },
  { id: 'ipip-neo-120-116', textZhCN: '在压力下能保持冷静', facetId: 'N6', reverseScored: true },
  { id: 'ipip-neo-120-117', textZhCN: '看到生活中好的一面', facetId: 'E6', reverseScored: false },
  { id: 'ipip-neo-120-118', textZhCN: '认为我们应该严惩犯罪', facetId: 'O6', reverseScored: true },
  {
    id: 'ipip-neo-120-119',
    textZhCN: '我尽量不去想那些需要帮助的人',
    facetId: 'A6',
    reverseScored: true,
  },
  { id: 'ipip-neo-120-120', textZhCN: '做事不经过思考', facetId: 'C6', reverseScored: true },
];

/** SHA-256 of JSON.stringify(IPIP_NEO_120_ITEMS), asserted by source-integrity tests. */
export const IPIP_NEO_120_ITEM_SET_SHA256 =
  'a2acd0795d4117fbcbd8b3bc808c6bbcaa45d453db66b848a25da8952ecf4446';
