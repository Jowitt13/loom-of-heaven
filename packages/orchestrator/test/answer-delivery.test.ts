// Synthetic fixtures only — fictional data; no real birth data or user text.
// A = examples/birth-input.json (fictional example), B = A with localDate 1991-01-02.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalJson, parseBirthInput } from '@loom/contracts';
import type { AnswerPlan, CareerRealityContextData } from '@loom/contracts';
import { validateAnswer } from '@loom/interpret';
import {
  deliverAnswer,
  deriveAnswerRequestDigest,
  sealReadingDraft,
  transcribeReadingDraft,
} from '../src/answer-delivery.ts';
import { runAnswerPlan } from '../src/interpret.ts';

const FIXED = Date.parse('2026-01-01T00:00:00Z');
const rawA = JSON.parse(readFileSync('examples/birth-input.json', 'utf8')) as Record<
  string,
  unknown
>;
const rawB = { ...rawA, localDate: '1991-01-02' };
const A = parseBirthInput(rawA);
const B = parseBirthInput(rawB);

function runA(topic: 'character' | 'career' = 'character') {
  return runAnswerPlan(A, { now: FIXED, topic });
}
function runB(topic: 'character' | 'career' = 'character') {
  return runAnswerPlan(B, { now: FIXED, topic });
}

/** A jargon-free, footer-free draft that satisfies the character plan's constraints. */
function characterDraft(plan: AnswerPlan, marker = '主动与秩序并存'): Record<string, unknown> {
  const fact = plan.selectedFacts[0]!;
  return {
    contractVersion: 'reading-draft/v2',
    topic: 'character',
    sections: [
      {
        id: 'body',
        heading: '性格概览',
        paragraphs: [
          {
            text: `整体性格结构呈现${marker}的底色，传统说法只作文化参考，具体表现因环境与选择而异。`,
            sourceFactIds: [fact.id],
            constraintRefs: [{ kind: 'caveat', index: 0 }],
          },
          {
            text: '出生时间的精确程度会影响与时间相关的细节判断，本解读只保留可靠的部分。',
            sourceFactIds: [],
            constraintRefs: [
              { kind: 'warning', index: 0 },
              { kind: 'warning', index: 1 },
              { kind: 'caveat', index: 1 },
            ],
          },
        ],
      },
    ],
    caveatsExpressed: [plan.requiredCaveats[0]!, plan.requiredCaveats[1]!],
    warningsDisclosed: ['SOLAR_TIME_APPROXIMATE'],
  };
}

/** Seal a draft to the plan run it was written for (the host's draft-time step). */
function sealed<T extends { answerBinding: unknown; answerPlan: AnswerPlan }>(
  run: T,
  draft: Record<string, unknown>,
) {
  return sealReadingDraft(run.answerBinding, draft);
}

describe('pre-fix mismatch reproduction (why draft origin binding is needed)', () => {
  it('the structural check alone accepts an A-draft against the B-plan despite identical ids', () => {
    const planA = runA().answerPlan;
    const planB = runB().answerPlan;
    expect(planA.allowedFactIds.slice(0, 5)).toEqual(planB.allowedFactIds.slice(0, 5));
    const idA = planA.selectedFacts[0]!;
    const idB = planB.selectedFacts[0]!;
    expect(idA.id).toBe(idB.id);
    expect(idA.claim).not.toBe(idB.claim);
    // ids exist and caveat/warning strings are identical across the two plans, so
    // the low-level gate cannot tell which subject the draft was written for.
    expect(validateAnswer({ answerPlan: planB, readingDraft: characterDraft(planA) }).ok).toBe(
      true,
    );
  });
});

describe('answer delivery binding', () => {
  it('A + A passes and returns the verbatim deliverable body', () => {
    const run = runA();
    const draft = characterDraft(run.answerPlan);
    const delivery = deliverAnswer({
      currentRequest: { birthInput: rawA, topic: 'character', now: FIXED },
      ...sealed(run, draft),
      answerPlan: run.answerPlan,
      readingDraft: draft,
    });
    expect(delivery.ok).toBe(true);
    expect(delivery.binding).toEqual({
      requestDigestMatch: true,
      planDigestMatch: true,
      draftDigestMatch: true,
    });
    const expectedBody = transcribeReadingDraft({
      sections: [
        {
          heading: '性格概览',
          paragraphs: [
            {
              text: '整体性格结构呈现主动与秩序并存的底色，传统说法只作文化参考，具体表现因环境与选择而异。',
            },
            { text: '出生时间的精确程度会影响与时间相关的细节判断，本解读只保留可靠的部分。' },
          ],
        },
      ],
    });
    expect(delivery.deliverableBody).toBe(expectedBody);
    expect(delivery.deliverableBodySha256).toBe(
      `sha256:${createHash('sha256').update(expectedBody, 'utf8').digest('hex')}`,
    );
    expect(delivery.deliverableBody).not.toContain('敏感项校对');
    expect(delivery.deliverableBody).not.toContain('引擎警告');
  });

  it('B + B passes with its own origin', () => {
    const run = runB();
    const draft = characterDraft(run.answerPlan);
    const delivery = deliverAnswer({
      currentRequest: { birthInput: rawB, topic: 'character', now: FIXED },
      ...sealed(run, draft),
      answerPlan: run.answerPlan,
      readingDraft: draft,
    });
    expect(delivery.ok).toBe(true);
  });

  // THE gap Codex reproduced: A draft + B plan + B binding, current request B.
  it('rejects an A draft that carries its own A origin, paired with the current B plan', () => {
    const runA0 = runA();
    const runB0 = runB();
    const draftA = characterDraft(runA0.answerPlan, '命主甲');
    const originA = sealed(runA0, draftA); // sealed when the A draft was written
    const delivery = deliverAnswer({
      // current request is B, and the submitted plan/binding are B's
      currentRequest: { birthInput: rawB, topic: 'character', now: FIXED },
      ...originA,
      answerPlan: runB0.answerPlan,
      readingDraft: draftA,
    });
    expect(delivery.ok).toBe(false);
    expect(delivery.failureReason).toBe('BINDING_MISMATCH');
    // The draft's recorded source plan is A's, not B's.
    expect(delivery.binding).toEqual({
      requestDigestMatch: false,
      planDigestMatch: false,
      draftDigestMatch: true,
    });
    expect(delivery.deliverableBody).toBeNull();
    expect(canonicalJson(delivery)).not.toContain('命主甲');
  });

  it('rejects a bare legacy draft that has no origin of its own', () => {
    const run = runA();
    const delivery = deliverAnswer({
      currentRequest: { birthInput: rawA, topic: 'character', now: FIXED },
      answerPlan: run.answerPlan,
      readingDraft: characterDraft(run.answerPlan),
    });
    expect(delivery.ok).toBe(false);
    expect(delivery.failureReason).toBe('DRAFT_ORIGIN_MISSING');
    expect(delivery.deliverableBody).toBeNull();
  });

  it('rejects a draft whose content changed after sealing', () => {
    const run = runA();
    const draft = characterDraft(run.answerPlan);
    const origin = sealed(run, draft);
    const swapped = structuredClone(draft);
    (swapped.sections as Array<{ paragraphs: Array<{ text: string }> }>)[0]!.paragraphs[0]!.text =
      '整体性格结构呈现完全不同的底色，传统说法只作文化参考。';
    const delivery = deliverAnswer({
      currentRequest: { birthInput: rawA, topic: 'character', now: FIXED },
      ...origin,
      answerPlan: run.answerPlan,
      readingDraft: swapped,
    });
    expect(delivery.failureReason).toBe('BINDING_MISMATCH');
    expect(delivery.binding?.draftDigestMatch).toBe(false);
    expect(delivery.deliverableBody).toBeNull();
  });

  it('rejects an A draft under the current B context even with matching ids', () => {
    const runA0 = runA();
    const draftA = characterDraft(runA0.answerPlan, '命主甲');
    const delivery = deliverAnswer({
      currentRequest: { birthInput: rawB, topic: 'character', now: FIXED },
      ...sealed(runA0, draftA),
      answerPlan: runA0.answerPlan,
      readingDraft: draftA,
    });
    expect(delivery.failureReason).toBe('BINDING_MISMATCH');
    expect(delivery.binding?.requestDigestMatch).toBe(false);
    expect(delivery.deliverableBody).toBeNull();
    expect(canonicalJson(delivery)).not.toContain('1991-01-02');
  });

  it('invalidates the origin when topic, lens or target time changes', () => {
    const base = runA();
    const draft = characterDraft(base.answerPlan);
    const origin = sealed(base, draft);
    for (const changed of [
      { topic: 'career' as const },
      { topic: 'character' as const, lens: 'strengths' as const },
      { topic: 'character' as const, at: { solarDate: '2026-05-20', timeIndex: 7 } },
    ]) {
      const delivery = deliverAnswer({
        currentRequest: { birthInput: rawA, now: FIXED, ...changed },
        ...origin,
        answerPlan: base.answerPlan,
        readingDraft: draft,
      });
      expect(delivery.failureReason).toBe('BINDING_MISMATCH');
      expect(delivery.deliverableBody).toBeNull();
    }
  });

  it('invalidates the origin when executed settings change', () => {
    const base = runA();
    const draft = characterDraft(base.answerPlan);
    const changedSettings = {
      ...rawA,
      settings: {
        ...(rawA.settings as Record<string, unknown>),
        western: {
          ...((rawA.settings as Record<string, { western?: Record<string, unknown> }>).western ??
            {}),
          houseSystem: 'equal',
        },
      },
    };
    const delivery = deliverAnswer({
      currentRequest: { birthInput: changedSettings, topic: 'character', now: FIXED },
      ...sealed(base, draft),
      answerPlan: base.answerPlan,
      readingDraft: draft,
    });
    expect(delivery.failureReason).toBe('BINDING_MISMATCH');
  });

  it('invalidates the origin when plan facts or constraints change', () => {
    const base = runA();
    const draft = characterDraft(base.answerPlan);
    const origin = sealed(base, draft);
    const tamperedFacts = structuredClone(base.answerPlan);
    tamperedFacts.selectedFacts[0]!.claim = '被替换的无关结论';
    const tamperedConstraints = structuredClone(base.answerPlan);
    tamperedConstraints.requiredCaveats = ['另一个约束'];
    for (const plan of [tamperedFacts, tamperedConstraints]) {
      const delivery = deliverAnswer({
        currentRequest: { birthInput: rawA, topic: 'character', now: FIXED },
        ...origin,
        answerPlan: plan,
        readingDraft: draft,
      });
      expect(delivery.failureReason).toBe('BINDING_MISMATCH');
      expect(delivery.binding?.planDigestMatch).toBe(false);
      expect(delivery.deliverableBody).toBeNull();
    }
  });

  it('covers career-reality content revision: same id with a changed statement invalidates', () => {
    const reality = (statement: string): CareerRealityContextData => ({
      confirmedFacts: [
        {
          factId: 'career-fact:role',
          source: 'user-stated',
          confirmedByUser: true,
          category: 'current-role',
          statement,
        },
      ],
      transient: true,
      noPersistence: true,
    });
    const r1 = reality('目前在制造业做质量管理');
    const r2 = reality('目前在教育行业做课程设计'); // same id, revised statement
    const withR1 = runAnswerPlan(A, { now: FIXED, topic: 'career', careerReality: r1 });
    const withR1Again = runAnswerPlan(A, { now: FIXED, topic: 'career', careerReality: r1 });
    expect(withR1.answerBinding.requestDigest).toBe(withR1Again.answerBinding.requestDigest);
    const withR2 = runAnswerPlan(A, { now: FIXED, topic: 'career', careerReality: r2 });
    expect(withR1.answerBinding.requestDigest).not.toBe(withR2.answerBinding.requestDigest);
    const without = runAnswerPlan(A, { now: FIXED, topic: 'career' });
    expect(without.answerBinding.requestDigest).not.toBe(withR1.answerBinding.requestDigest);
    expect(deriveAnswerRequestDigest({ birthInput: A, request: { topic: 'career' } })).toBe(
      deriveAnswerRequestDigest({ birthInput: A, request: { topic: 'career' } }),
    );
  });

  it('is deterministic for the same context and immune to interleaved subjects', () => {
    const seen: string[] = [];
    for (const input of [A, B, A, B, A]) {
      seen.push(
        runAnswerPlan(input, { now: FIXED, topic: 'character' }).answerBinding.requestDigest,
      );
    }
    expect(seen[0]).toBe(seen[2]);
    expect(seen[0]).toBe(seen[4]);
    expect(seen[1]).toBe(seen[3]);
    expect(seen[0]).not.toBe(seen[1]);
  });

  it('re-delivers a new body after a rewrite and never reuses a failed one', () => {
    const run = runA();
    const request = {
      currentRequest: { birthInput: rawA, topic: 'character' as const, now: FIXED },
    };
    const draft = characterDraft(run.answerPlan);
    const okDelivery = deliverAnswer({
      ...request,
      ...sealed(run, draft),
      answerPlan: run.answerPlan,
      readingDraft: draft,
    });
    expect(okDelivery.ok).toBe(true);

    // A rewritten draft must be re-sealed; the new delivery has its own body.
    const rewritten = characterDraft(run.answerPlan, '沉稳与灵活交替');
    (rewritten.sections as Array<{ heading: string }>)[0]!.heading = '性格要点';
    const resealed = deliverAnswer({
      ...request,
      ...sealed(run, rewritten),
      answerPlan: run.answerPlan,
      readingDraft: rewritten,
    });
    expect(resealed.ok).toBe(true);
    expect(resealed.deliverableBody).toContain('性格要点');
    expect(resealed.deliverableBodySha256).not.toBe(okDelivery.deliverableBodySha256);

    // A rewrite that keeps the OLD seal is rejected (content no longer matches).
    const unsealed = deliverAnswer({
      ...request,
      ...sealed(run, draft),
      answerPlan: run.answerPlan,
      readingDraft: rewritten,
    });
    expect(unsealed.ok).toBe(false);
    expect(unsealed.deliverableBody).toBeNull();

    // A safety-failing rewrite returns no body at all.
    const unsafe = characterDraft(run.answerPlan);
    (unsafe.sections as Array<{ paragraphs: Array<{ text: string }> }>)[0]!.paragraphs[0]!.text =
      '这一配置注定会成功，毫无疑问会成功。';
    const failed = deliverAnswer({
      ...request,
      ...sealed(run, unsafe),
      answerPlan: run.answerPlan,
      readingDraft: unsafe,
    });
    expect(failed.failureReason).toBe('VALIDATION_FAILED');
    expect(failed.deliverableBody).toBeNull();
  });

  it('fails closed on malformed or oversized origin records without echoing birth data', () => {
    const run = runA();
    const draft = characterDraft(run.answerPlan);
    const request = {
      currentRequest: { birthInput: rawA, topic: 'character' as const, now: FIXED },
    };
    const good = sealed(run, draft);
    const cases: Array<Record<string, unknown>> = [
      { draftSource: { contractVersion: 'answer-binding/v0' }, draftDigest: good.draftDigest },
      { draftSource: good.draftSource, draftDigest: 'not-a-digest' },
      { draftSource: good.draftSource, draftDigest: 'sha256:' + 'x'.repeat(5000) },
      {
        draftSource: { ...good.draftSource, planDigest: 'sha256:' + '0'.repeat(64) },
        draftDigest: good.draftDigest,
      },
    ];
    for (const origin of cases) {
      const delivery = deliverAnswer({
        ...request,
        ...origin,
        answerPlan: run.answerPlan,
        readingDraft: draft,
      });
      expect(delivery.ok).toBe(false);
      expect(delivery.deliverableBody).toBeNull();
      expect(canonicalJson(delivery)).not.toContain('1990-03-10');
    }
    const badPlan = deliverAnswer({
      ...request,
      ...good,
      answerPlan: { nonsense: true },
      readingDraft: draft,
    });
    expect(badPlan.failureReason).toBe('MALFORMED_INPUT');
  });

  it('keeps the unknown-time withholding of #112/#113 intact through delivery', () => {
    const unknownRaw = { ...rawA, localTime: undefined, timeAccuracy: 'unknown' };
    const unknownInput = parseBirthInput(unknownRaw);
    const run = runAnswerPlan(unknownInput, { now: FIXED, topic: 'career' });
    expect(run.answerPlan.answerability).toBe('not-supported');
    expect(run.answerPlan.noEvidenceReason).toBe('TIME_REQUIRED');
    const limitationDraft = {
      contractVersion: 'reading-draft/v2',
      topic: 'career',
      sections: [
        {
          id: 'limitation',
          heading: '暂时无法解读',
          paragraphs: [
            {
              text: '缺少可用的出生时间，事业方向的命盘结论本次无法给出，请先补充出生时间。',
              sourceFactIds: [],
              constraintRefs: [{ kind: 'warning', index: 0 }],
            },
          ],
        },
      ],
      caveatsExpressed: [],
      warningsDisclosed: ['TIME_UNKNOWN'],
    };
    const delivery = deliverAnswer({
      currentRequest: { birthInput: unknownRaw, topic: 'career', now: FIXED },
      ...sealed(run, limitationDraft),
      answerPlan: run.answerPlan,
      readingDraft: limitationDraft,
    });
    expect(delivery.ok).toBe(true);
    // The same unknown-time draft under the exact-time A is rejected.
    const cross = deliverAnswer({
      currentRequest: { birthInput: rawA, topic: 'career', now: FIXED },
      ...sealed(run, limitationDraft),
      answerPlan: run.answerPlan,
      readingDraft: limitationDraft,
    });
    expect(cross.failureReason).toBe('BINDING_MISMATCH');
  });

  it('keeps the low-level structural entry compatible but claims nothing about origin', () => {
    const plan = runA().answerPlan;
    // The legacy input shape (no origin fields) still validates structurally.
    const legacy = validateAnswer({ answerPlan: plan, readingDraft: characterDraft(plan) });
    expect(legacy.contractVersion).toBe('validation-result/v2');
    expect(legacy.ok).toBe(true);
    // and carries no delivery/origin claim at all.
    expect(legacy).not.toHaveProperty('deliverableBody');
    expect(legacy).not.toHaveProperty('binding');
  });
});
