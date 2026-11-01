// Synthetic fixtures only - fictional data; not a real person. fixtureKind: synthetic-technical.
// Roadmap v3.4 review fix #4: pair-context bound delivery for synastry.
import { describe, expect, it } from 'vitest';
import { parseBirthInput, parseSynastryInput } from '@loom/contracts';
import type { SynastryInput } from '@loom/contracts';
import { runSynastry } from '../src/synastry.ts';
import { deliverAnswer } from '../src/answer-delivery.ts';
import {
  buildSynastryBinding,
  deliverSynastryAnswer,
  sealSynastryReadingDraft,
} from '../src/synastry-delivery.ts';

const FIXED = Date.parse('2026-01-01T00:00:00Z');

function peopleInput(): SynastryInput {
  return parseSynastryInput({
    people: [
      {
        label: '甲',
        relation: 'couple',
        input: {
          calendar: 'gregorian',
          localDate: '1991-02-03',
          localTime: '04:05:06',
          timeAccuracy: 'exact',
          timezone: 'Pacific/Port_Moresby',
          location: { latitude: 12.345678, longitude: 98.765432, source: 'user' },
          ruleGender: 'female',
          settings: { systems: ['western', 'bazi', 'ziwei', 'vedic'] },
        },
      },
      {
        label: '乙',
        relation: 'couple',
        input: {
          calendar: 'gregorian',
          localDate: '1992-11-08',
          localTime: '10:30:00',
          timeAccuracy: 'exact',
          timezone: 'Asia/Shanghai',
          location: { latitude: 30.5, longitude: 114.3, source: 'user' },
          ruleGender: 'male',
          settings: { systems: ['western', 'bazi', 'ziwei', 'vedic'] },
        },
      },
    ],
    analyzePair: ['甲', '乙'],
  });
}

function pairDraft() {
  return {
    contractVersion: 'reading-draft/v3',
    topic: 'marriage',
    sections: [
      {
        id: 'main',
        heading: '## 相处的主线：底子合拍，摩擦集中在表达',
        paragraphs: [
          {
            text: '这对组合的底子是合拍的：八字日支（夫妻宫）辰与子半合，传统读作相处和顺、默契自然；紫微四化上，甲方生年武曲化权落入乙方夫妻宫，关系里乙方会明显感受到甲方的主导与行动力。这两个信号说明关系有实在的基础，不是彼此消耗的结构。',
            sourceFactIds: [],
            constraintRefs: [{ kind: 'disclaimer', index: 0 }],
          },
          {
            text: '摩擦集中在表达层：太阳与太阳相刑，两个人的自我主张容易顶角；甲方水星与乙方火星正面对冲，说话节奏一快就容易起急；甲方月亮刑乙方金星，情感表达与被爱的方式对不上拍。缓和通道也实在：金星拱下降点、上升拱火星，吸引力与行动配合都在，磨合点明确不等于不合适。',
            sourceFactIds: [],
            constraintRefs: [{ kind: 'disclaimer', index: 0 }],
          },
        ],
      },
      {
        id: 'boundary',
        heading: '',
        paragraphs: [
          {
            text: '这些是按双方盘面实际关系信号做的传统读法：紫微、八字与占星各自给出结构判断，本项目没有实现的配对方法（如吠陀合盘）不补造。张力多说明磨合点清楚，契合与否是相处经营的结果，非命定。',
            sourceFactIds: [],
            constraintRefs: [
              { kind: 'disclaimer', index: 0 },
              { kind: 'disclaimer', index: 2 },
            ],
          },
        ],
      },
    ],
    caveatsExpressed: [],
    warningsDisclosed: [],
  };
}

function sealedPair(input: SynastryInput, draft: unknown, now: number) {
  const run = runSynastry(input, { now });
  const binding = buildSynastryBinding({ synastryInput: input, now }, run.synastry);
  return { run, ...sealSynastryReadingDraft(binding, draft) };
}

describe('synastry pair bound delivery (roadmap v3.4 review fix #4)', () => {
  it('runs the real four-system pair and exposes multi-system findings', () => {
    const { run } = sealedPair(peopleInput(), pairDraft(), FIXED);
    const systems = new Set(run.synastry.findings.map((finding) => finding.system));
    expect(systems.has('bazi')).toBe(true);
    expect(systems.has('ziwei')).toBe(true);
    expect(systems.has('western')).toBe(true);
    // No Vedic pair method exists; none may be invented.
    expect(run.synastry.findings.some((finding) => (finding.system as string) === 'vedic')).toBe(
      false,
    );
    expect(run.synastry.pair).toEqual({ a: '甲', b: '乙', relation: 'couple' });
  });

  it('delivers a valid pair body verbatim through the binding chain', () => {
    const input = peopleInput();
    const draft = pairDraft();
    const sealed = sealedPair(input, draft, FIXED);
    const delivery = deliverSynastryAnswer({
      currentRequest: { synastryInput: input, now: FIXED },
      draftSource: sealed.draftSource,
      draftDigest: sealed.draftDigest,
      synastryResult: sealed.run.synastry,
      readingDraft: draft,
    });
    expect(delivery.ok).toBe(true);
    expect(delivery.binding).toEqual({
      requestDigestMatch: true,
      planDigestMatch: true,
      draftDigestMatch: true,
    });
    expect(delivery.deliverableBody).toContain('相处的主线');
    expect(delivery.deliverableBody).toContain('武曲化权落入乙方夫妻宫');
    expect(delivery.ok && delivery.deliverableBody?.startsWith('## 相处的主线')).toBe(true);
  });

  it('rejects a changed person input as the current context', () => {
    const input = peopleInput();
    const draft = pairDraft();
    const sealed = sealedPair(input, draft, FIXED);
    const changed = structuredClone(input);
    changed.people[1]!.input = parseBirthInput({
      ...input.people[1]!.input,
      localDate: '1992-11-09',
    });
    const delivery = deliverSynastryAnswer({
      currentRequest: { synastryInput: changed, now: FIXED },
      draftSource: sealed.draftSource,
      draftDigest: sealed.draftDigest,
      synastryResult: sealed.run.synastry,
      readingDraft: draft,
    });
    expect(delivery.ok).toBe(false);
    expect(delivery.failureReason).toBe('BINDING_MISMATCH');
    expect(delivery.binding?.requestDigestMatch).toBe(false);
  });

  it('rejects a swapped pair direction or a changed relation', () => {
    const input = peopleInput();
    const draft = pairDraft();
    const sealed = sealedPair(input, draft, FIXED);

    const swapped = structuredClone(input);
    swapped.analyzePair = ['乙', '甲'];
    const swappedDelivery = deliverSynastryAnswer({
      currentRequest: { synastryInput: swapped, now: FIXED },
      draftSource: sealed.draftSource,
      draftDigest: sealed.draftDigest,
      synastryResult: sealed.run.synastry,
      readingDraft: draft,
    });
    expect(swappedDelivery.failureReason).toBe('BINDING_MISMATCH');

    const relabeled = structuredClone(input);
    relabeled.people[0]!.relation = 'partner';
    const relationDelivery = deliverSynastryAnswer({
      currentRequest: { synastryInput: relabeled, now: FIXED },
      draftSource: sealed.draftSource,
      draftDigest: sealed.draftDigest,
      synastryResult: sealed.run.synastry,
      readingDraft: draft,
    });
    expect(relationDelivery.failureReason).toBe('BINDING_MISMATCH');
  });

  it('rejects a draft modified after sealing and a foreign synastry result', () => {
    const input = peopleInput();
    const draft = pairDraft();
    const sealed = sealedPair(input, draft, FIXED);

    const modified = structuredClone(draft);
    modified.sections[0]!.paragraphs[0]!.text += '（密封后又改了一句。）';
    const modifiedDelivery = deliverSynastryAnswer({
      currentRequest: { synastryInput: input, now: FIXED },
      draftSource: sealed.draftSource,
      draftDigest: sealed.draftDigest,
      synastryResult: sealed.run.synastry,
      readingDraft: modified,
    });
    expect(modifiedDelivery.failureReason).toBe('BINDING_MISMATCH');
    expect(modifiedDelivery.binding?.draftDigestMatch).toBe(false);

    // A genuinely different result document (reversed pair direction changes
    // the result identity) cannot pair with this draft's origin.
    const reversed = structuredClone(input);
    reversed.analyzePair = ['乙', '甲'];
    const foreignRun = runSynastry(reversed, { now: FIXED });
    const foreignDelivery = deliverSynastryAnswer({
      currentRequest: { synastryInput: input, now: FIXED },
      draftSource: sealed.draftSource,
      draftDigest: sealed.draftDigest,
      synastryResult: foreignRun.synastry,
      readingDraft: draft,
    });
    expect(foreignDelivery.failureReason).toBe('BINDING_MISMATCH');
    expect(foreignDelivery.binding?.planDigestMatch).toBe(false);
  });

  it('still runs the safety scan: a fate verdict fails, ordinary wording passes', () => {
    const input = peopleInput();
    const risky = structuredClone(pairDraft());
    risky.sections[0]!.paragraphs[0]!.text = '这对组合注定在一起，命中注定不会分开。';
    const riskySealed = sealedPair(input, risky, FIXED);
    const riskyDelivery = deliverSynastryAnswer({
      currentRequest: { synastryInput: input, now: FIXED },
      draftSource: riskySealed.draftSource,
      draftDigest: riskySealed.draftDigest,
      synastryResult: riskySealed.run.synastry,
      readingDraft: risky,
    });
    expect(riskyDelivery.ok).toBe(false);
    expect(riskyDelivery.failureReason).toBe('VALIDATION_FAILED');
    expect(
      riskyDelivery.validation?.violations.some((v) => v.code === 'HIGH_RISK_DETERMINISTIC_FATE'),
    ).toBe(true);

    // Ordinary relationship wording (相处方式) passes the same chain.
    const ordinary = structuredClone(pairDraft());
    ordinary.sections[0]!.paragraphs[1]!.text = ordinary.sections[0]!.paragraphs[1]!.text.replace(
      '情感表达与被爱的方式',
      '情感表达与相处的相处方式',
    );
    const ordinarySealed = sealedPair(input, ordinary, FIXED);
    const ordinaryDelivery = deliverSynastryAnswer({
      currentRequest: { synastryInput: input, now: FIXED },
      draftSource: ordinarySealed.draftSource,
      draftDigest: ordinarySealed.draftDigest,
      synastryResult: ordinarySealed.run.synastry,
      readingDraft: ordinary,
    });
    expect(ordinaryDelivery.ok).toBe(true);
  });

  it('keeps the single-person bound delivery path intact', () => {
    // A pair draft can never be delivered through the single-person entry:
    // it has no birthInput context and no answerPlan.
    const input = peopleInput();
    const draft = pairDraft();
    const sealed = sealedPair(input, draft, FIXED);
    const misrouted = deliverAnswer({
      currentRequest: { birthInput: input.people[0]!.input, topic: 'marriage', now: FIXED },
      draftSource: sealed.draftSource,
      draftDigest: sealed.draftDigest,
      answerPlan: sealed.run.synastry,
      readingDraft: draft,
    });
    expect(misrouted.ok).toBe(false);
    expect(['MALFORMED_INPUT', 'BINDING_MISMATCH']).toContain(misrouted.failureReason);
  });
});
