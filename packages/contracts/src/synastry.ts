import { z } from 'zod';
import { BirthInput } from './birth-input.ts';

/**
 * Multi-person relationship (合婚 / synastry) contract. Up to five people are charted;
 * analysis is done for one pair at a time. The relationship type steers the reading
 * (夫妻/情侣/暧昧/前任 …). Findings are sourced, de-identified and carry a polarity; they
 * are structural compatibility signals, never a "注定在一起 / 必分手" verdict.
 */

export const SynastryRelation = z.enum([
  'couple', // 情侣
  'spouse', // 夫妻
  'dating', // 交往中
  'ambiguous', // 暧昧对象
  'ex', // 前任
  'family', // 家人
  'friend', // 朋友
  'partner', // 合作伙伴
  'unspecified',
]);
export type SynastryRelation = z.infer<typeof SynastryRelation>;

/** One participant: a de-identified label, a relationship tag, and a birth input. */
export const SynastryPerson = z.object({
  /** Short label the host uses instead of a real name (e.g. "甲"/"男方"/"A"). */
  label: z.string().min(1),
  relation: SynastryRelation.default('unspecified'),
  input: BirthInput,
});
export type SynastryPerson = z.infer<typeof SynastryPerson>;

export const SynastryInput = z
  .object({
    people: z.array(SynastryPerson).min(1).max(5),
    /** Labels of the two people to analyze; REQUIRED once more than two are provided. */
    analyzePair: z.tuple([z.string(), z.string()]).optional(),
  })
  .refine((v) => v.people.length <= 2 || v.analyzePair !== undefined, {
    error:
      'analyzePair is required when more than two people are provided — ask the user which pair.',
    path: ['analyzePair'],
  })
  .refine((v) => new Set(v.people.map((p) => p.label)).size === v.people.length, {
    error: 'person labels must be unique',
    path: ['people'],
  });
export type SynastryInput = z.infer<typeof SynastryInput>;
export type SynastryInputRaw = z.input<typeof SynastryInput>;

export const SynastryPolarity = z.enum(['吉', '凶', '中性']);
export type SynastryPolarity = z.infer<typeof SynastryPolarity>;

/** One sourced compatibility signal between the analyzed pair. */
export const SynastryFinding = z.object({
  system: z.enum(['bazi', 'ziwei', 'western', 'overall']),
  code: z.string(),
  claim: z.string(),
  polarity: SynastryPolarity.optional(),
  reason: z.string().optional(),
  source: z.object({ text: z.string(), chapter: z.string() }).optional(),
});
export type SynastryFinding = z.infer<typeof SynastryFinding>;

/** De-identified per-person summary echoed in the result (no name/location free text). */
export const SynastrySubject = z.object({
  label: z.string(),
  relation: SynastryRelation,
  calendar: z.string(),
  timeAccuracy: z.string(),
  timezone: z.string(),
});
export type SynastrySubject = z.infer<typeof SynastrySubject>;

export const SynastryResult = z.object({
  schemaVersion: z.string(),
  engineVersion: z.string(),
  requestId: z.string(),
  people: z.array(SynastrySubject),
  pair: z.object({ a: z.string(), b: z.string(), relation: SynastryRelation }),
  findings: z.array(SynastryFinding),
  followupOffers: z.array(z.string()),
  disclaimers: z.array(z.string()),
});
export type SynastryResult = z.infer<typeof SynastryResult>;

/** Parse untrusted JSON into a SynastryInput or throw a Zod error (handled by the CLI). */
export function parseSynastryInput(value: unknown): SynastryInput {
  return SynastryInput.parse(value);
}
