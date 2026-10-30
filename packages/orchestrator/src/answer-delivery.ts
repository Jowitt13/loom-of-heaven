import { createHash } from 'node:crypto';
import {
  AnswerPlan,
  ANSWER_BINDING_CONTRACT_VERSION,
  ANSWER_DELIVERY_CONTRACT_VERSION,
  AnswerBinding,
  canonicalJson,
  CareerRealityContext,
  ENGINE_VERSION,
  parseBirthInput,
} from '@loom/contracts';
import type {
  AnswerLens,
  AnswerValidationResult,
  BirthInput,
  CareerRealityContextData,
  InterpretationTopic,
} from '@loom/contracts';
import type { HoroscopeOptions } from './calculate.ts';
import { lintReading, validateAnswer } from '@loom/interpret';

/**
 * answer-delivery — transient "this plan, this request, this text" binding for
 * the default answer path (roadmap v3.2 / IQ-4 §7 "本次计划与最终文本绑定").
 *
 * Two accidental-mismatch classes are closed WITHOUT adding a third validator:
 * 1. A stale plan/draft (different subject, input revision, topic, lens, target
 *    time, settings or plan content) no longer validates against the CURRENT
 *    request: `requestDigest` is re-derived from the current request the HOST
 *    re-submits, and `planDigest` re-covers the submitted full plan.
 * 2. The text actually delivered is the deterministic transcription of the
 *    CHECKED draft (structure check → verbatim transcription → existing
 *    lintReading); the host displays the returned body instead of rewriting it.
 *
 * Honest boundaries:
 * - Digests are consistency fingerprints, not authentication. A stateless
 *   validator cannot detect a host that deliberately replays an entire stale
 *   context as the current request.
 * - The request digest never re-runs the chart: subject identity comes from the
 *   schema-parsed birth input, and ruleset identity follows deterministically
 *   from engine version + executed settings (the answer-plan path always runs
 *   all four systems).
 * - Nothing here is persisted; no session registry, database or signing exists.
 */

const ALL_FOUR_SYSTEMS = ['western', 'bazi', 'ziwei', 'vedic'] as const;

export interface AnswerBindingRequest {
  topic: InterpretationTopic;
  lens?: AnswerLens;
  /** Explicitly injected run clock (epoch ms). Absent ⇒ not part of the digest. */
  now?: number;
  /** Parsed target time — resolved ONCE at the CLI, never re-parsed here. */
  at?: HoroscopeOptions;
}

export interface AnswerBindingContext {
  birthInput: BirthInput;
  request: AnswerBindingRequest;
  careerReality?: CareerRealityContextData;
}

function sha256Hex(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

/**
 * Digest of the CURRENT request context. `settings.systems` is forced to the
 * answer-plan executed set so the same birth file digests identically at
 * plan time and delivery time.
 */
export function deriveAnswerRequestDigest(context: AnswerBindingContext): string {
  const executedInput = {
    ...context.birthInput,
    settings: { ...context.birthInput.settings, systems: [...ALL_FOUR_SYSTEMS] },
  };
  const payload = {
    bindingVersion: ANSWER_BINDING_CONTRACT_VERSION,
    subjectAndInputRevision: executedInput,
    request: { topic: context.request.topic, lens: context.request.lens ?? 'overview' },
    resolvedTarget: {
      at: context.request.at
        ? { solarDate: context.request.at.solarDate, timeIndex: context.request.at.timeIndex }
        : null,
      now: context.request.now ?? null,
    },
    execution: { engineVersion: ENGINE_VERSION },
    careerReality: context.careerReality ?? null,
  };
  return sha256Hex(canonicalJson(payload));
}

/** Digest over the FULL plan content (facts with claims, constraints, requirements). */
export function deriveAnswerPlanDigest(answerPlan: AnswerPlan): string {
  return sha256Hex(canonicalJson(answerPlan));
}

/** Build the transient binding emitted beside the plan by the answer-plan run. */
export function buildAnswerBinding(
  context: AnswerBindingContext,
  answerPlan: AnswerPlan,
): AnswerBinding {
  return {
    contractVersion: ANSWER_BINDING_CONTRACT_VERSION,
    requestDigest: deriveAnswerRequestDigest(context),
    planDigest: deriveAnswerPlanDigest(answerPlan),
  };
}

/** Project a full AnswerPlan to the structural subset validateAnswer consumes. */
function projectPlanSubset(answerPlan: AnswerPlan): Record<string, unknown> {
  return {
    allowedFactIds: answerPlan.allowedFactIds,
    requiredCaveats: answerPlan.requiredCaveats,
    requiredWarningCodes: answerPlan.requiredWarningCodes,
    guardrails: answerPlan.guardrails,
    answerability: answerPlan.answerability,
    request: { topic: answerPlan.request.topic },
    disclaimers: answerPlan.disclaimers,
  };
}

/**
 * Deterministic verbatim transcription of a checked draft. Exact heading and
 * paragraph text, exact order, nothing added, removed, reworded or summarized.
 */
export function transcribeReadingDraft(draft: {
  sections: Array<{ heading: string; paragraphs: Array<{ text: string }> }>;
}): string {
  const blocks: string[] = [];
  for (const section of draft.sections) {
    const parts: string[] = [];
    if (section.heading.length > 0) parts.push(section.heading);
    for (const paragraph of section.paragraphs) parts.push(paragraph.text);
    blocks.push(parts.join('\n\n'));
  }
  return blocks.join('\n\n');
}

export type AnswerDeliveryFailureReason =
  'MALFORMED_INPUT' | 'BINDING_MISMATCH' | 'VALIDATION_FAILED' | 'LINT_FAILED';

export interface AnswerDeliveryResult {
  contractVersion: typeof ANSWER_DELIVERY_CONTRACT_VERSION;
  ok: boolean;
  /** Failure category; null on success. Static wording only — never input echo. */
  failureReason: AnswerDeliveryFailureReason | null;
  binding: { requestDigestMatch: boolean; planDigestMatch: boolean } | null;
  validation: AnswerValidationResult | null;
  lint: ReturnType<typeof lintReading> | null;
  /** Deliverable body — present ONLY on success; never a previous successful body. */
  deliverableBody: string | null;
  /** sha256 of the deliverable body, so any displayed copy can be verified. */
  deliverableBodySha256: string | null;
}

export interface DeliverAnswerInput {
  /** The CURRENT request, re-submitted by the host (trust boundary: current by declaration). */
  currentRequest: {
    /** Raw (schema-untrusted) birth input JSON of the current request. */
    birthInput: unknown;
    topic: InterpretationTopic;
    lens?: AnswerLens;
    now?: number;
    at?: HoroscopeOptions;
    careerReality?: unknown;
  };
  /** Binding copied verbatim from the plan run output (raw, untrusted). */
  answerBinding: unknown;
  /** The FULL saved answer plan (raw, untrusted — schema-parsed here). */
  answerPlan: unknown;
  /** The reading draft (raw, untrusted — validated via the existing public entry). */
  readingDraft: unknown;
}

function malformed(): AnswerDeliveryResult {
  return {
    contractVersion: ANSWER_DELIVERY_CONTRACT_VERSION,
    ok: false,
    failureReason: 'MALFORMED_INPUT',
    binding: null,
    validation: null,
    lint: null,
    deliverableBody: null,
    deliverableBodySha256: null,
  };
}

/**
 * Bound delivery: binding checks → existing validateAnswer (structure/safety) →
 * verbatim transcription → existing lintReading → deliverable body. Any failure
 * returns ok:false with NO body (a failed run never carries or authorizes reuse
 * of a previous successful body).
 */
export function deliverAnswer(input: unknown): AnswerDeliveryResult {
  if (typeof input !== 'object' || input === null) return malformed();
  const raw = input as Partial<DeliverAnswerInput> & Record<string, unknown>;

  let birthInput: BirthInput;
  try {
    birthInput = parseBirthInput(raw.currentRequest?.birthInput);
  } catch {
    return malformed();
  }
  const currentRequest = raw.currentRequest;
  if (
    currentRequest === undefined ||
    typeof currentRequest !== 'object' ||
    typeof currentRequest.topic !== 'string'
  ) {
    return malformed();
  }

  let careerReality: CareerRealityContextData | undefined;
  if (currentRequest.careerReality !== undefined) {
    const parsedReality = CareerRealityContext.safeParse(currentRequest.careerReality);
    if (!parsedReality.success) return malformed();
    careerReality = parsedReality.data;
  }

  // Binding block: strict shape, then compared against the CURRENT request and
  // the SUBMITTED full plan.
  const parsedBinding = AnswerBinding.safeParse(raw.answerBinding);
  const parsedPlan = AnswerPlan.safeParse(raw.answerPlan);
  if (!parsedBinding.success || !parsedPlan.success) return malformed();

  const currentRequestDigest = deriveAnswerRequestDigest({
    birthInput,
    request: {
      topic: currentRequest.topic as InterpretationTopic,
      lens: currentRequest.lens as AnswerLens | undefined,
      now: currentRequest.now as number | undefined,
      at: currentRequest.at as HoroscopeOptions | undefined,
    },
    ...(careerReality === undefined ? {} : { careerReality }),
  });
  const requestDigestMatch = currentRequestDigest === parsedBinding.data.requestDigest;
  const planDigestMatch = deriveAnswerPlanDigest(parsedPlan.data) === parsedBinding.data.planDigest;
  if (!requestDigestMatch || !planDigestMatch) {
    return {
      contractVersion: ANSWER_DELIVERY_CONTRACT_VERSION,
      ok: false,
      failureReason: 'BINDING_MISMATCH',
      binding: { requestDigestMatch, planDigestMatch },
      validation: null,
      lint: null,
      deliverableBody: null,
      deliverableBodySha256: null,
    };
  }

  // Existing structural/safety gate over the plan subset + draft (+ reality).
  const validation = validateAnswer({
    ...(careerReality === undefined ? {} : { careerReality }),
    answerBinding: parsedBinding.data,
    answerPlan: projectPlanSubset(parsedPlan.data),
    readingDraft: raw.readingDraft,
  });
  if (!validation.ok) {
    return {
      contractVersion: ANSWER_DELIVERY_CONTRACT_VERSION,
      ok: false,
      failureReason: 'VALIDATION_FAILED',
      binding: { requestDigestMatch, planDigestMatch },
      validation,
      lint: null,
      deliverableBody: null,
      deliverableBodySha256: null,
    };
  }

  // Transcribe the CHECKED draft verbatim, then run the existing language gate.
  const parsedDraft = validation.ok ? raw.readingDraft : null;
  const draftShape = parsedDraft as {
    sections?: Array<{ heading?: unknown; paragraphs?: Array<{ text?: unknown }> }>;
  } | null;
  if (draftShape === null || !Array.isArray(draftShape.sections)) return malformed();
  const sections: Array<{ heading: string; paragraphs: Array<{ text: string }> }> = [];
  for (const section of draftShape.sections) {
    if (
      typeof section?.heading !== 'string' ||
      !Array.isArray(section.paragraphs) ||
      section.paragraphs.some((paragraph) => typeof paragraph?.text !== 'string')
    ) {
      return malformed();
    }
    sections.push({
      heading: section.heading,
      paragraphs: section.paragraphs.map((paragraph) => ({ text: paragraph.text as string })),
    });
  }
  const body = transcribeReadingDraft({ sections });
  const lint = lintReading(body, { channel: 'topic' });
  if (!lint.ok) {
    return {
      contractVersion: ANSWER_DELIVERY_CONTRACT_VERSION,
      ok: false,
      failureReason: 'LINT_FAILED',
      binding: { requestDigestMatch, planDigestMatch },
      validation,
      lint,
      deliverableBody: null,
      deliverableBodySha256: null,
    };
  }

  return {
    contractVersion: ANSWER_DELIVERY_CONTRACT_VERSION,
    ok: true,
    failureReason: null,
    binding: { requestDigestMatch, planDigestMatch },
    validation,
    lint,
    deliverableBody: body,
    deliverableBodySha256: sha256Hex(body),
  };
}
