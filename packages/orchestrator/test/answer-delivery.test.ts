// Synthetic fixtures only — fictional data; no real birth data or user text.
// A = examples/birth-input.json (fictional example), B = A with localDate 1991-01-02.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  canonicalJson,
  parseBirthInput,
  ValidateAnswerInput as ValidateAnswerInputSchema,
} from '@loom/contracts';
import type { AnswerPlan, CareerRealityContextData } from '@loom/contracts';
import { validateAnswer } from '@loom/interpret';
import {
  buildAnswerBinding,
  deliverAnswer,
  deriveAnswerRequestDigest,
  deriveCaveatScopeForDelivery,
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

  it('derives the caveat scope only AFTER bounded parsing (narrow fix)', () => {
    const run = runA();
    const plan = run.answerPlan;
    // An over-sectioned draft (MAX_SECTIONS=40) whose fact ids sit behind
    // getters: the existing bounded entry rejects it on the array LENGTH before
    // any paragraph traversal, and the delivery fails with the same controlled
    // violation as before — the derivation itself never sees raw objects (its
    // parameter is the bounded-parsed draft; see the unit assertion below).
    const overSectioned = {
      contractVersion: 'reading-draft/v3',
      topic: 'character',
      sections: Array.from({ length: 41 }, () => ({
        id: 'body',
        heading: '',
        paragraphs: [{ text: '合成正文。', sourceFactIds: [plan.selectedFacts[0]!.id] }],
      })),
      caveatsExpressed: [],
      warningsDisclosed: [],
    };
    const overResult = deliverAnswer({
      currentRequest: { birthInput: rawA, topic: 'character', now: FIXED },
      ...sealed(run, overSectioned),
      answerPlan: plan,
      readingDraft: overSectioned,
    });
    expect(overResult.failureReason).toBe('VALIDATION_FAILED');
    expect(
      overResult.validation?.violations.some(
        (v) => v.code === 'RESOURCE_LIMIT_EXCEEDED' && v.patternKey === 'MAX_SECTIONS',
      ),
    ).toBe(true);
    expect(overResult.deliverableBody).toBeNull();
    // Unit side of the ordering contract: the exported derivation consumes a
    // schema-parsed draft (already resource-capped, own-data checked), not an
    // unknown raw object. Feeding it the parsed draft yields the scope; unknown
    // raw shapes are not its input anymore.
    const parsedDraft = ValidateAnswerInputSchema.parse({
      answerPlan: {
        allowedFactIds: plan.allowedFactIds,
        requiredCaveats: plan.requiredCaveats,
        requiredWarningCodes: plan.requiredWarningCodes,
        guardrails: plan.guardrails,
        answerability: plan.answerability,
        request: { topic: plan.request.topic },
        disclaimers: plan.disclaimers,
      },
      readingDraft: {
        contractVersion: 'reading-draft/v3',
        topic: 'character',
        sections: [
          {
            id: 'body',
            heading: '',
            paragraphs: [
              {
                text: '命宫主星组合的读法是两种侧重并存。',
                sourceFactIds: plan.selectedFacts
                  .filter((f) => f.claim.includes('命宫主星'))
                  .slice(0, 1)
                  .map((f) => f.id),
              },
            ],
          },
        ],
        caveatsExpressed: [],
        warningsDisclosed: [],
      },
    });
    const scope = deriveCaveatScopeForDelivery(plan, parsedDraft.readingDraft);
    expect(scope).toBeDefined();
    // The cited 命宫 fact owns no caveat; both plan caveats belong to uncited
    // facts (五行 / vedic), so neither is required for THIS citation set.
    expect([...scope!.requiredCaveatIndices]).toEqual([]);
  });
});

describe('bound-delivery caveat scope (cited facts own the mandatory caveats)', () => {
  const request = { currentRequest: { birthInput: rawA, topic: 'character' as const, now: FIXED } };

  /** The real host follow-up shape: only 命宫 facts cited, no 五行 paragraph. */
  function followUpDraft(plan: AnswerPlan): Record<string, unknown> {
    const mingGong = plan.selectedFacts.filter((f) => f.claim.includes('命宫主星'));
    expect(mingGong.length).toBeGreaterThan(0);
    return {
      contractVersion: 'reading-draft/v2',
      topic: 'character',
      sections: [
        {
          id: 'body',
          heading: '',
          paragraphs: [
            {
              text: '命宫主星组合的读法是两种侧重并存，星性只到这个粒度为止。',
              sourceFactIds: mingGong.slice(0, 3).map((f) => f.id),
            },
            {
              text: '出生时间的精确程度会影响与时间相关的细节判断，本解读只保留可靠的部分。',
              sourceFactIds: [],
              constraintRefs: [
                { kind: 'warning', index: 0 },
                { kind: 'warning', index: 1 },
              ],
            },
          ],
        },
      ],
      caveatsExpressed: [],
      warningsDisclosed: ['SOLAR_TIME_APPROXIMATE'],
    };
  }

  it('a follow-up citing only 命宫 facts delivers without the uncited 五行 caveat', () => {
    const run = runA();
    const draft = followUpDraft(run.answerPlan);
    const delivery = deliverAnswer({
      ...request,
      ...sealed(run, draft),
      answerPlan: run.answerPlan,
      readingDraft: draft,
    });
    expect(delivery.ok).toBe(true);
    expect(delivery.deliverableBody).not.toContain('五行');
  });

  it('citing the 五行-owning fact without expressing its caveat still fails', () => {
    const run = runA();
    const plan = run.answerPlan;
    const wuXing = plan.selectedFacts.find((f) => f.claim.includes('五行'));
    expect(wuXing).toBeDefined();
    expect(plan.requiredCaveats).toContain(wuXing!.caveat);
    const draft = followUpDraft(plan);
    (
      draft.sections as Array<{ paragraphs: Array<{ text: string; sourceFactIds: string[] }> }>
    )[0]!.paragraphs[0]!.sourceFactIds.push(wuXing!.id);
    const delivery = deliverAnswer({
      ...request,
      ...sealed(run, draft),
      answerPlan: plan,
      readingDraft: draft,
    });
    expect(delivery.failureReason).toBe('VALIDATION_FAILED');
    expect(
      delivery.validation?.violations.some(
        (v) => v.code === 'MISSING_REQUIRED_CAVEAT' && v.itemIndex === 0,
      ),
    ).toBe(true);
  });

  it('the low-level structural path still requires every caveat (no trusted scope)', () => {
    const run = runA();
    const result = validateAnswer({
      answerPlan: run.answerPlan,
      readingDraft: followUpDraft(run.answerPlan),
    });
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.code === 'MISSING_REQUIRED_CAVEAT')).toBe(true);
  });

  it('a zero-citation draft cannot empty the caveat obligations in bound delivery', () => {
    const run = runA();
    const plan = run.answerPlan;
    expect(plan.requiredCaveats.length).toBeGreaterThan(0);
    const draft = followUpDraft(plan);
    (
      draft.sections as Array<{ paragraphs: Array<{ sourceFactIds: string[] }> }>
    )[0]!.paragraphs[0]!.sourceFactIds = [];
    // A no-fact paragraph needs constraintRefs to be fact-exempt; give it the
    // warnings only, so the draft itself stays structurally valid.
    (
      draft.sections as Array<{
        paragraphs: Array<{ sourceFactIds: string[]; constraintRefs?: unknown[] }>;
      }>
    )[0]!.paragraphs[0]!.constraintRefs = [{ kind: 'warning', index: 0 }];
    const delivery = deliverAnswer({
      ...request,
      ...sealed(run, draft),
      answerPlan: plan,
      readingDraft: draft,
    });
    expect(delivery.failureReason).toBe('VALIDATION_FAILED');
    expect(delivery.validation?.violations.some((v) => v.code === 'MISSING_REQUIRED_CAVEAT')).toBe(
      true,
    );
  });

  it('a caveat shared by two facts stays required when either fact is cited', () => {
    const shared = '共享的限制说明：分类仅供参考。';
    const lone = '未引用事实独有的限制说明。';
    const syntheticPlan: AnswerPlan = {
      contractVersion: 'answer-plan/v2',
      engineVersion: 'test-engine',
      sourceSchemaVersion: 'test-schema',
      request: { topic: 'character', lens: 'overview' },
      answerability: 'grounded',
      selectedFacts: [
        {
          id: 'fact-1',
          topic: 'character',
          claim: '引用的事实一。',
          evidence: [{ kind: 'bazi', ref: 'synthetic.a' }],
          caveat: shared,
        },
        {
          id: 'fact-2',
          topic: 'character',
          claim: '未引用的事实二。',
          evidence: [{ kind: 'bazi', ref: 'synthetic.b' }],
          caveat: shared,
        },
        {
          id: 'fact-3',
          topic: 'character',
          claim: '未引用的事实三。',
          evidence: [{ kind: 'bazi', ref: 'synthetic.c' }],
          caveat: lone,
        },
      ],
      allowedFactIds: ['fact-1', 'fact-2', 'fact-3'],
      requiredCaveats: [shared, lone],
      requiredWarningCodes: [],
      guardrails: ['traditional-culture-only', 'evidence-only'],
      responseRequirements: {
        contentOrder: ['summary'],
        citeSelectedFactIds: ['fact-1', 'fact-2', 'fact-3'],
        onlyUseSelectedFacts: true,
        explainInPlainLanguage: true,
        discloseRequiredWarnings: true,
      },
      disclaimers: [],
      followupOffers: [],
    };
    const draft = {
      contractVersion: 'reading-draft/v2',
      topic: 'character',
      sections: [
        {
          id: 'body',
          heading: '',
          paragraphs: [
            {
              text: '只讲引用的事实一，并带上它所属的限制。',
              sourceFactIds: ['fact-1'],
              constraintRefs: [{ kind: 'caveat', index: 0 }],
            },
          ],
        },
      ],
      caveatsExpressed: [shared],
      warningsDisclosed: [],
    };
    const binding = buildAnswerBinding(
      { birthInput: A, request: { topic: 'character', now: FIXED } },
      syntheticPlan,
    );
    const delivery = deliverAnswer({
      ...request,
      draftSource: binding,
      draftDigest: sealReadingDraft(binding, draft).draftDigest,
      answerPlan: syntheticPlan,
      readingDraft: draft,
    });
    // The shared caveat is still required and expressed; the lone caveat of an
    // uncited fact is not forced. Both conditions must hold in ONE delivery.
    expect(delivery.ok).toBe(true);
    expect(delivery.deliverableBody).toContain('限制');
    // Dropping the shared caveat's expression must fail again (still required).
    const dropped = {
      ...draft,
      sections: [
        {
          id: 'body',
          heading: '',
          paragraphs: [{ text: '只讲引用的事实一。', sourceFactIds: ['fact-1'] }],
        },
      ],
      caveatsExpressed: [],
    };
    const droppedDelivery = deliverAnswer({
      ...request,
      draftSource: binding,
      draftDigest: sealReadingDraft(binding, dropped).draftDigest,
      answerPlan: syntheticPlan,
      readingDraft: dropped,
    });
    expect(droppedDelivery.failureReason).toBe('VALIDATION_FAILED');
    expect(
      droppedDelivery.validation?.violations.some(
        (v) => v.code === 'MISSING_REQUIRED_CAVEAT' && v.itemIndex === 0,
      ),
    ).toBe(true);
  });

  it('no host JSON field can narrow the caveat scope (skip/override are inert)', () => {
    const run = runA();
    const draft = followUpDraft(run.answerPlan);
    const smuggled = {
      ...draft,
      requiredCaveatScope: [1],
      skipCaveats: [0],
      override: true,
    } as Record<string, unknown>;
    // Both drafts seal to the same binding; the smuggled fields must change
    // nothing (unknown keys never reach the trusted internal derivation).
    const clean = deliverAnswer({
      ...request,
      ...sealed(run, draft),
      answerPlan: run.answerPlan,
      readingDraft: draft,
    });
    const dirty = deliverAnswer({
      ...request,
      ...sealed(run, smuggled),
      answerPlan: run.answerPlan,
      readingDraft: smuggled,
    });
    expect(clean.ok).toBe(true);
    expect(dirty.ok).toBe(true);
    expect(dirty.deliverableBody).toBe(clean.deliverableBody);
  });

  it('an optional caveat that IS referenced keeps its attestation consistency check', () => {
    const run = runA();
    const plan = run.answerPlan;
    const draft = followUpDraft(plan);
    // The 五行 caveat is not required for this citation set, but half-declaring
    // it (caveatsExpressed without a constraintRef) must still be rejected.
    const inconsistent = {
      ...draft,
      caveatsExpressed: [plan.requiredCaveats[0]!],
    } as Record<string, unknown>;
    const delivery = deliverAnswer({
      ...request,
      ...sealed(run, inconsistent),
      answerPlan: plan,
      readingDraft: inconsistent,
    });
    expect(delivery.failureReason).toBe('VALIDATION_FAILED');
    expect(
      delivery.validation?.violations.some((v) => v.code === 'CONSTRAINT_ATTESTATION_MISMATCH'),
    ).toBe(true);
  });
});

describe('reading-draft/v3 bound delivery (limited presentation)', () => {
  const request = { currentRequest: { birthInput: rawA, topic: 'character' as const, now: FIXED } };

  function v3Draft(plan: AnswerPlan): Record<string, unknown> {
    const mingGong = plan.selectedFacts.filter((f) => f.claim.includes('命宫主星'));
    return {
      contractVersion: 'reading-draft/v3',
      topic: 'character',
      sections: [
        {
          id: 'body',
          heading: '## 命宫里的两种侧重',
          paragraphs: [
            {
              text: '这张盘的底色是**果决与执行**并存，两种侧重的说明如下：\n- 武曲一侧：刚毅果决、善于理财与执行\n- 破军一侧：变动性强、敢于破旧立新',
              sourceFactIds: mingGong.slice(0, 3).map((f) => f.id),
            },
            {
              text: '出生时间的精确程度会影响与时间相关的细节判断，本解读只保留可靠的部分。',
              sourceFactIds: [],
              constraintRefs: [
                { kind: 'warning', index: 0 },
                { kind: 'warning', index: 1 },
              ],
            },
          ],
        },
      ],
      caveatsExpressed: [],
      warningsDisclosed: ['SOLAR_TIME_APPROXIMATE'],
    };
  }

  it('delivers a formatted v3 draft verbatim (heading, emphasis and bullets included)', () => {
    const run = runA();
    const draft = v3Draft(run.answerPlan);
    const delivery = deliverAnswer({
      ...request,
      ...sealed(run, draft),
      answerPlan: run.answerPlan,
      readingDraft: draft,
    });
    expect(delivery.ok).toBe(true);
    expect(delivery.deliverableBody).toContain('## 命宫里的两种侧重');
    expect(delivery.deliverableBody).toContain('**果决与执行**');
    expect(delivery.deliverableBody).toContain('- 武曲一侧');
    expect(delivery.deliverableBodySha256).toBe(
      `sha256:${createHash('sha256').update(delivery.deliverableBody!, 'utf8').digest('hex')}`,
    );
  });

  it('rejects v3 markup outside the allowed subset inside bound delivery', () => {
    const run = runA();
    const draft = v3Draft(run.answerPlan);
    (draft.sections as Array<{ paragraphs: Array<{ text: string }> }>)[0]!.paragraphs[0]!.text =
      '底色见[详情](http://example.com)说明。';
    const delivery = deliverAnswer({
      ...request,
      ...sealed(run, draft),
      answerPlan: run.answerPlan,
      readingDraft: draft,
    });
    expect(delivery.failureReason).toBe('VALIDATION_FAILED');
    expect(delivery.validation?.violations.some((v) => v.code === 'CONTAINS_MARKUP')).toBe(true);
  });

  it('editing a sealed v3 draft’s heading or emphasis is a BINDING_MISMATCH', () => {
    const run = runA();
    const draft = v3Draft(run.answerPlan);
    const origin = sealed(run, draft);
    const tamperedHeading = JSON.parse(JSON.stringify(draft)) as {
      sections: Array<{ heading: string }>;
    };
    tamperedHeading.sections[0]!.heading = '## 改过的标题';
    const tamperedBold = JSON.parse(JSON.stringify(draft)) as {
      sections: Array<{ paragraphs: Array<{ text: string }> }>;
    };
    tamperedBold.sections[0]!.paragraphs[0]!.text =
      tamperedBold.sections[0]!.paragraphs[0]!.text.replace('**果决与执行**', '**果决和执行**');
    for (const tampered of [tamperedHeading, tamperedBold]) {
      const delivery = deliverAnswer({
        ...request,
        ...origin,
        answerPlan: run.answerPlan,
        readingDraft: tampered,
      });
      expect(delivery.failureReason).toBe('BINDING_MISMATCH');
      expect(delivery.deliverableBody).toBeNull();
    }
  });
});
