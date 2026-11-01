import {
  ANSWER_BINDING_CONTRACT_VERSION,
  ANSWER_DELIVERY_CONTRACT_VERSION,
  AnswerBinding,
  canonicalJson,
  Sha256Digest,
  SynastryResult as SynastryResultSchema,
  parseSynastryInput,
} from '@loom/contracts';
import type { SynastryInput, SynastryResult } from '@loom/contracts';
import { createHash } from 'node:crypto';
import { ANSWER_GUARDRAILS, lintReading, validateAnswer } from '@loom/interpret';
import { sealReadingDraft, transcribeReadingDraft } from './answer-delivery.ts';
import type { AnswerDeliveryResult } from './answer-delivery.ts';

/**
 * synastry-delivery — the THIN pair-context adapter for bound delivery
 * (roadmap v3.4 review fix #4). It reuses the single-person machinery verbatim
 * — sealReadingDraft, the same binding/digest comparisons, validateAnswer's
 * structural + safety scan, verbatim transcription and lintReading — and adds
 * no third validator, CLI verb, state or new fact-id contract.
 *
 * What the pair binding covers that a single-person binding cannot:
 * - BOTH people's actual birth inputs and settings (not just labels);
 * - the labels and the analyzed pair WITH its direction (a→b vs b→a);
 * - the relationship type;
 * - the run clock that sets the findings' focus year;
 * - the full synastry result document (planDigest) and the draft content
 *   (draftDigest via sealing).
 *
 * The draft is validated against a minimal honest plan envelope derived from
 * the submitted synastry result itself (its own disclaimers; the standard
 * guardrails; no fact-id citations because the synastry path has no fact-id
 * contract — paragraphs carry disclaimer constraintRefs instead). A
 * single-person answer plan can therefore never vouch for a pair body.
 */

const SYNASTRY_TOPIC = 'marriage' as const;

function sha256Hex(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

/** sha256 over the canonical JSON of a value (stable key order, no whitespace). */
function digestOfJson(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

export interface SynastryBindingContext {
  /** Raw (schema-untrusted) synastry input of the current request. */
  synastryInput: unknown;
  /** Injected run clock (epoch ms); sets the findings' focus year. */
  now?: number;
}

/** Digest over the CURRENT pair request context (both inputs, pair, relation, clock). */
export function deriveSynastryRequestDigest(context: SynastryBindingContext): string {
  const parsed = parseSynastryInput(context.synastryInput);
  const payload = {
    bindingVersion: ANSWER_BINDING_CONTRACT_VERSION,
    // The parsed people carry each person's FULL birth input and settings;
    // analyzePair keeps its order, so pair direction is part of the digest.
    synastryInput: parsed,
    resolvedTarget: { now: context.now ?? null },
  };
  return sha256Hex(canonicalJson(payload));
}

/** Digest over the full synastry result document this body was written from. */
export function deriveSynastryPlanDigest(synastryResult: SynastryResult): string {
  return digestOfJson(synastryResult);
}

/** Build the transient pair binding emitted beside the synastry result. */
export function buildSynastryBinding(
  context: SynastryBindingContext,
  synastryResult: SynastryResult,
): AnswerBinding {
  return {
    contractVersion: ANSWER_BINDING_CONTRACT_VERSION,
    requestDigest: deriveSynastryRequestDigest(context),
    planDigest: deriveSynastryPlanDigest(synastryResult),
  };
}

/** Seal a pair draft to its synastry run (same sealing step as single-person). */
export function sealSynastryReadingDraft(
  answerBinding: unknown,
  readingDraft: unknown,
): { draftSource: AnswerBinding; draftDigest: string } {
  return sealReadingDraft(answerBinding, readingDraft);
}

export interface DeliverSynastryAnswerInput {
  currentRequest: SynastryBindingContext;
  /** The draft's own origin (from sealSynastryReadingDraft at draft time). */
  draftSource: unknown;
  draftDigest: unknown;
  /** The FULL saved synastry result (raw, untrusted — digest-compared). */
  synastryResult: unknown;
  /** The reading draft (raw, untrusted — validated via the public entry). */
  readingDraft: unknown;
}

function synastryFailure(
  failureReason: AnswerDeliveryResult['failureReason'],
  binding: AnswerDeliveryResult['binding'],
  validation: AnswerDeliveryResult['validation'] = null,
  lint: AnswerDeliveryResult['lint'] = null,
): AnswerDeliveryResult {
  return {
    contractVersion: ANSWER_DELIVERY_CONTRACT_VERSION,
    ok: false,
    failureReason,
    binding,
    validation,
    lint,
    deliverableBody: null,
    deliverableBodySha256: null,
  };
}

/** Minimal honest plan envelope derived from the submitted synastry result. */
function synastryPlanEnvelope(result: SynastryResult) {
  return {
    allowedFactIds: [],
    requiredCaveats: [],
    requiredWarningCodes: [],
    guardrails: [...ANSWER_GUARDRAILS],
    answerability: 'limited' as const,
    request: { topic: SYNASTRY_TOPIC },
    disclaimers: result.disclaimers,
  };
}

/**
 * Bound pair delivery: pair-context digest checks → the existing validateAnswer
 * structural/safety scan (over the synastry-derived envelope) → verbatim
 * transcription → existing lintReading. Any failure returns ok:false with no
 * body, mirroring deliverAnswer's contract.
 */
export function deliverSynastryAnswer(input: unknown): AnswerDeliveryResult {
  if (typeof input !== 'object' || input === null) {
    return synastryFailure('MALFORMED_INPUT', null);
  }
  const raw = input as Partial<DeliverSynastryAnswerInput> & Record<string, unknown>;
  if (raw.draftSource === undefined || raw.draftDigest === undefined) {
    return synastryFailure('DRAFT_ORIGIN_MISSING', null);
  }

  let synastryInput: SynastryInput;
  try {
    synastryInput = parseSynastryInput(raw.currentRequest?.synastryInput);
  } catch {
    return synastryFailure('MALFORMED_INPUT', null);
  }

  const parsedSource = AnswerBinding.safeParse(raw.draftSource);
  const parsedDigest = Sha256Digest.safeParse(raw.draftDigest);
  if (!parsedSource.success || !parsedDigest.success) {
    return synastryFailure('MALFORMED_INPUT', null);
  }

  const currentRequestDigest = deriveSynastryRequestDigest({
    synastryInput,
    ...(raw.currentRequest?.now !== undefined ? { now: raw.currentRequest.now as number } : {}),
  });
  const requestDigestMatch = currentRequestDigest === parsedSource.data.requestDigest;
  const planDigestMatch = digestOfJson(raw.synastryResult) === parsedSource.data.planDigest;
  let draftDigestMatch = false;
  try {
    draftDigestMatch = digestOfJson(raw.readingDraft) === parsedDigest.data;
  } catch {
    return synastryFailure('MALFORMED_INPUT', null);
  }
  if (!requestDigestMatch || !planDigestMatch || !draftDigestMatch) {
    return synastryFailure('BINDING_MISMATCH', {
      requestDigestMatch,
      planDigestMatch,
      draftDigestMatch,
    });
  }

  const result = SynastryResultSchema.safeParse(raw.synastryResult);
  if (!result.success) return synastryFailure('MALFORMED_INPUT', null);

  // Existing structural + safety gate over the pair envelope + draft. The
  // envelope's disclaimers are the run's own; paragraphs reference them via
  // constraintRefs (the pair path has no fact-id contract to cite).
  const validation = validateAnswer({
    answerPlan: synastryPlanEnvelope(result.data),
    readingDraft: raw.readingDraft,
  });
  if (!validation.ok) {
    return synastryFailure(
      'VALIDATION_FAILED',
      { requestDigestMatch, planDigestMatch, draftDigestMatch },
      validation,
    );
  }

  const draftShape = raw.readingDraft as {
    sections?: Array<{ heading?: unknown; paragraphs?: Array<{ text?: unknown }> }>;
  };
  if (!Array.isArray(draftShape.sections)) return synastryFailure('MALFORMED_INPUT', null);
  const sections: Array<{ heading: string; paragraphs: Array<{ text: string }> }> = [];
  for (const section of draftShape.sections) {
    if (
      typeof section?.heading !== 'string' ||
      !Array.isArray(section.paragraphs) ||
      section.paragraphs.some((paragraph) => typeof paragraph?.text !== 'string')
    ) {
      return synastryFailure('MALFORMED_INPUT', null);
    }
    sections.push({
      heading: section.heading,
      paragraphs: section.paragraphs.map((paragraph) => ({ text: paragraph.text as string })),
    });
  }
  const body = transcribeReadingDraft({ sections });
  const lint = lintReading(body, { channel: 'topic' });
  if (!lint.ok) {
    return synastryFailure(
      'LINT_FAILED',
      { requestDigestMatch, planDigestMatch, draftDigestMatch },
      validation,
      lint,
    );
  }

  return {
    contractVersion: ANSWER_DELIVERY_CONTRACT_VERSION,
    ok: true,
    failureReason: null,
    binding: { requestDigestMatch, planDigestMatch, draftDigestMatch },
    validation,
    lint,
    deliverableBody: body,
    deliverableBodySha256: sha256Hex(body),
  };
}
