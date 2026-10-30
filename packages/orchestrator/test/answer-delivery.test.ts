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
  transcribeReadingDraft,
} from '../src/answer-delivery.ts';
import { runAnswerPlan } from '../src/interpret.ts';

const FIXED = Date.parse('2026-01-01T00:00:00Z');
const rawA = JSON.parse(readFileSync('examples/birth-input.json', 'utf8')) as Record<
  string,
  unknown
>;
const A = parseBirthInput(rawA);
const B = parseBirthInput({ ...rawA, localDate: '1991-01-02' });

/** A jargon-free, footer-free draft body paragraph that cites a plan fact. */
function characterDraft(plan: AnswerPlan): Record<string, unknown> {
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
            text: '整体性格结构呈现主动与秩序并存的底色，传统说法只作文化参考，具体表现因环境与选择而异。',
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

function runA(topic: 'character' | 'career' = 'character') {
  return runAnswerPlan(A, { now: FIXED, topic });
}

describe('pre-fix mismatch reproduction (why binding is needed)', () => {
  it('the old structural check accepts an A-draft against the B-plan despite identical ids', () => {
    const planA = runA().answerPlan;
    const planB = runAnswerPlan(B, { now: FIXED, topic: 'character' }).answerPlan;
    // Same id space, different fact content (the documented collision).
    expect(planA.allowedFactIds.slice(0, 5)).toEqual(planB.allowedFactIds.slice(0, 5));
    const idA = planA.selectedFacts[0]!;
    const idB = planB.selectedFacts[0]!;
    expect(idA.id).toBe(idB.id);
    expect(idA.claim).not.toBe(idB.claim);
    // The A-draft passes the B-plan's STRUCTURAL subset: ids exist, caveats and
    // warnings are string-identical across the two plans. This is the confirmed
    // accidental-mismatch hole the delivery binding closes.
    const result = validateAnswer({ answerPlan: planB, readingDraft: characterDraft(planA) });
    expect(result.ok).toBe(true);
  });
});

describe('answer delivery binding', () => {
  it('A + A passes and returns the verbatim deliverable body', () => {
    const run = runA();
    const delivery = deliverAnswer({
      currentRequest: { birthInput: rawA, topic: 'character', now: FIXED },
      answerBinding: run.answerBinding,
      answerPlan: run.answerPlan,
      readingDraft: characterDraft(run.answerPlan),
    });
    expect(delivery.ok).toBe(true);
    expect(delivery.binding).toEqual({ requestDigestMatch: true, planDigestMatch: true });
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
    // No appended footer/menu/technical tail beyond the checked text.
    expect(delivery.deliverableBody).not.toContain('敏感项校对');
    expect(delivery.deliverableBody).not.toContain('引擎警告');
  });

  it('B + B passes with its own binding', () => {
    const run = runAnswerPlan(B, { now: FIXED, topic: 'character' });
    const delivery = deliverAnswer({
      currentRequest: {
        birthInput: { ...rawA, localDate: '1991-01-02' },
        topic: 'character',
        now: FIXED,
      },
      answerBinding: run.answerBinding,
      answerPlan: run.answerPlan,
      readingDraft: characterDraft(run.answerPlan),
    });
    expect(delivery.ok).toBe(true);
  });

  it('rejects an A-draft under the current B context even though fact ids coincide', () => {
    const runA = runAnswerPlan(A, { now: FIXED, topic: 'character' });
    const delivery = deliverAnswer({
      currentRequest: {
        birthInput: { ...rawA, localDate: '1991-01-02' },
        topic: 'character',
        now: FIXED,
      },
      answerBinding: runA.answerBinding,
      answerPlan: runA.answerPlan,
      readingDraft: characterDraft(runA.answerPlan),
    });
    expect(delivery.ok).toBe(false);
    expect(delivery.failureReason).toBe('BINDING_MISMATCH');
    expect(delivery.binding?.requestDigestMatch).toBe(false);
    expect(delivery.deliverableBody).toBeNull();
    // Controlled failure never echoes birth data.
    expect(canonicalJson(delivery)).not.toContain('1990-03-10');
    expect(canonicalJson(delivery)).not.toContain('1991-01-02');
  });

  it('invalidates the old binding when topic, lens or target time changes', () => {
    const base = runAnswerPlan(A, { now: FIXED, topic: 'character' });
    const cases: Array<Record<string, unknown>> = [
      { topic: 'career' },
      { topic: 'character', lens: 'strengths' },
      { topic: 'character', at: { solarDate: '2026-05-20', timeIndex: 7 } },
    ];
    for (const changed of cases) {
      const delivery = deliverAnswer({
        currentRequest: { birthInput: rawA, now: FIXED, ...changed },
        answerBinding: base.answerBinding,
        answerPlan: base.answerPlan,
        readingDraft: characterDraft(base.answerPlan),
      });
      expect(delivery.failureReason).toBe('BINDING_MISMATCH');
      expect(delivery.deliverableBody).toBeNull();
    }
    // A plan bound WITHOUT a target time is not valid under a request WITH one.
    const withAt = runAnswerPlan(A, {
      now: FIXED,
      topic: 'character',
      at: { solarDate: '2036-05-20', timeIndex: 7 },
    });
    const cross = deliverAnswer({
      currentRequest: {
        birthInput: rawA,
        topic: 'character',
        now: FIXED,
        at: { solarDate: '2026-05-20', timeIndex: 7 },
      },
      answerBinding: withAt.answerBinding,
      answerPlan: withAt.answerPlan,
      readingDraft: characterDraft(withAt.answerPlan),
    });
    expect(cross.failureReason).toBe('BINDING_MISMATCH');
  });

  it('invalidates the old binding when executed settings change', () => {
    const base = runA();
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
      answerBinding: base.answerBinding,
      answerPlan: base.answerPlan,
      readingDraft: characterDraft(base.answerPlan),
    });
    expect(delivery.failureReason).toBe('BINDING_MISMATCH');
  });

  it('invalidates the binding when plan facts or constraints change', () => {
    const base = runA();
    const tamperedFacts = structuredClone(base.answerPlan);
    tamperedFacts.selectedFacts[0]!.claim = '被替换的无关结论';
    const tamperedConstraints = structuredClone(base.answerPlan);
    tamperedConstraints.requiredCaveats = ['另一个约束'];
    for (const plan of [tamperedFacts, tamperedConstraints]) {
      const delivery = deliverAnswer({
        currentRequest: { birthInput: rawA, topic: 'character', now: FIXED },
        answerBinding: base.answerBinding,
        answerPlan: plan,
        readingDraft: characterDraft(base.answerPlan),
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
    // Deterministic for identical content.
    expect(withR1.answerBinding.requestDigest).toBe(withR1Again.answerBinding.requestDigest);
    // Same id, changed statement ⇒ new digest.
    const withR2 = runAnswerPlan(A, { now: FIXED, topic: 'career', careerReality: r2 });
    expect(withR1.answerBinding.requestDigest).not.toBe(withR2.answerBinding.requestDigest);
    // Present vs absent career reality also differs.
    const without = runAnswerPlan(A, { now: FIXED, topic: 'career' });
    expect(without.answerBinding.requestDigest).not.toBe(withR1.answerBinding.requestDigest);
    // Digest-level: direct derivation is stable and split-free.
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

  it('does not let a post-check text or heading change ride the old pass', () => {
    const run = runA();
    const request = {
      currentRequest: { birthInput: rawA, topic: 'character' as const, now: FIXED },
    };
    const okDelivery = deliverAnswer({
      ...request,
      answerBinding: run.answerBinding,
      answerPlan: run.answerPlan,
      readingDraft: characterDraft(run.answerPlan),
    });
    expect(okDelivery.ok).toBe(true);

    // Rewriting a paragraph into a deterministic-fate claim must fail validation,
    // and the failed result must NOT carry the previous successful body.
    const mutated = characterDraft(run.answerPlan);
    (mutated.sections as Array<{ paragraphs: Array<{ text: string }> }>)[0]!.paragraphs[0]!.text =
      '这一配置注定会成功，毫无疑问会成功。';
    const failed = deliverAnswer({
      ...request,
      answerBinding: run.answerBinding,
      answerPlan: run.answerPlan,
      readingDraft: mutated,
    });
    expect(failed.ok).toBe(false);
    expect(failed.deliverableBody).toBeNull();

    // A heading change re-delivers a DIFFERENT body (new check, new text) — the
    // old result can never be reused for the changed draft.
    const reheaded = characterDraft(run.answerPlan);
    (reheaded.sections as Array<{ heading: string }>)[0]!.heading = '性格要点';
    const redelivered = deliverAnswer({
      ...request,
      answerBinding: run.answerBinding,
      answerPlan: run.answerPlan,
      readingDraft: reheaded,
    });
    expect(redelivered.ok).toBe(true);
    expect(redelivered.deliverableBody).toContain('性格要点');
    expect(redelivered.deliverableBodySha256).not.toBe(okDelivery.deliverableBodySha256);
  });

  it('fails closed on malformed, mismatched or oversized bindings without echoing birth data', () => {
    const run = runA();
    const request = {
      currentRequest: { birthInput: rawA, topic: 'character' as const, now: FIXED },
    };
    for (const binding of [
      undefined,
      {
        contractVersion: 'answer-binding/v0',
        requestDigest: 'sha256:' + '0'.repeat(64),
        planDigest: 'sha256:' + '0'.repeat(64),
      },
      {
        contractVersion: 'answer-binding/v1',
        requestDigest: 'not-a-digest',
        planDigest: 'sha256:' + '0'.repeat(64),
      },
      { contractVersion: 'answer-binding/v1', requestDigest: 'x'.repeat(5000) },
    ]) {
      const delivery = deliverAnswer({
        ...request,
        answerBinding: binding,
        answerPlan: run.answerPlan,
        readingDraft: characterDraft(run.answerPlan),
      });
      expect(delivery.ok).toBe(false);
      expect(delivery.failureReason).toBe('MALFORMED_INPUT');
      expect(delivery.deliverableBody).toBeNull();
      expect(canonicalJson(delivery)).not.toContain('1990-03-10');
    }
    // A malformed plan or missing draft fails the same controlled way.
    const badPlan = deliverAnswer({
      ...request,
      answerBinding: run.answerBinding,
      answerPlan: { nonsense: true },
      readingDraft: characterDraft(run.answerPlan),
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
      answerBinding: run.answerBinding,
      answerPlan: run.answerPlan,
      readingDraft: limitationDraft,
    });
    expect(delivery.ok).toBe(true);
    // The bound delivery rejects the SAME unknown-time draft under the exact-time A.
    const cross = deliverAnswer({
      currentRequest: { birthInput: rawA, topic: 'career', now: FIXED },
      answerBinding: run.answerBinding,
      answerPlan: run.answerPlan,
      readingDraft: limitationDraft,
    });
    expect(cross.failureReason).toBe('BINDING_MISMATCH');
  });
});
