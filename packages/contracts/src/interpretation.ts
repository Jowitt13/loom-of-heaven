import { z } from 'zod';

/**
 * Cross-system interpretation facts (handoff §8 layer 2). This is the deterministic,
 * OFFLINE, source-traceable substrate that a host LLM reads to write a natural-language
 * reading — it is NOT prose and NOT a prediction. Every fact is grounded: it carries
 * machine-checkable evidence pointing back at a chart fact or a sourced rule, plus an
 * honest caveat. The host model must only read these, cite the evidence, honor the
 * disclaimers, and never invent values or give deterministic medical/legal/financial/
 * life-and-death verdicts.
 */

/** Reading themes the host can address. */
export const InterpretationTopic = z.enum([
  'character', // 性格 / 天性
  'career', // 事业 / 工作
  'wealth', // 财运
  'marriage', // 婚姻 / 感情
  'studies', // 学业
  'health', // 健康提示 (never medical advice)
  'general',
]);
export type InterpretationTopic = z.infer<typeof InterpretationTopic>;

/** Which subsystem a piece of evidence comes from. */
export const EvidenceKind = z.enum([
  'western',
  'bazi',
  'ziwei',
  'ziwei-horoscope',
  'bazi-rule',
  'time',
]);
export type EvidenceKind = z.infer<typeof EvidenceKind>;

/** A machine-checkable pointer back to the fact or rule that grounds a claim. */
export const InterpretationEvidence = z.object({
  kind: EvidenceKind,
  /** Stable reference, e.g. 'western.angles.mc.sign' or 'bazi-rule/pattern/yue-ling-ben-qi'. */
  ref: z.string(),
  /** The actual fact value / rule claim this evidence records. */
  note: z.string(),
});
export type InterpretationEvidence = z.infer<typeof InterpretationEvidence>;

/** One grounded, caveated interpretation fact. */
export const InterpretationFact = z.object({
  topic: InterpretationTopic,
  /** The grounded structural claim (deterministic; a fact about the chart, not a forecast). */
  claim: z.string(),
  evidence: z.array(InterpretationEvidence).min(1),
  /** Deterministic heuristic confidence; omit when the fact is purely structural. */
  confidence: z.enum(['low', 'medium', 'high']).optional(),
  /** Honest caveat: uncertainty, school disagreement, or scope limit. */
  caveat: z.string().optional(),
  /** Auspiciousness leaning (吉/凶/中性) for fortune-flavored facts. */
  polarity: z.enum(['吉', '凶', '中性']).optional(),
  /** The causal chain to state BEFORE the conclusion (先结论前的“因为…”). */
  reason: z.string().optional(),
});
export type InterpretationFact = z.infer<typeof InterpretationFact>;

/** The full interpretation-facts document handed to the host LLM. */
export const InterpretationFacts = z.object({
  schemaVersion: z.string(),
  engineVersion: z.string(),
  requestId: z.string(),
  /** The de-identified subject: only chart context, never a name or life event. */
  subject: z.object({
    timeAccuracy: z.string(),
    timezone: z.string(),
    calendar: z.string(),
  }),
  facts: z.array(InterpretationFact),
  /** Rulesets/providers that produced the underlying facts (for traceability). */
  rulesets: z.array(z.object({ id: z.string(), version: z.string() })),
  /** Global guardrails the host model MUST honor verbatim in spirit. */
  disclaimers: z.array(z.string()),
  /**
   * Standardized closing offers the host should present after the chart: deeper
   * readings on 事业/感情/财运/学业 etc. So every model ends the same way.
   */
  followupOffers: z.array(z.string()),
});
export type InterpretationFacts = z.infer<typeof InterpretationFacts>;
