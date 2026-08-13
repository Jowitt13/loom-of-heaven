import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  cancelIpipNeo120Session,
  completeIpipNeo120Session,
  deleteIpipNeo120Session,
  exportIpipNeo120Profile,
  IPIP_NEO_120_INSTRUMENT,
  IPIP_NEO_120_INSTRUCTIONS_ZH_CN,
  IPIP_NEO_120_ITEMS,
  IPIP_NEO_120_ITEM_SET_SHA256,
  IPIP_NEO_120_RESPONSE_OPTIONS_ZH_CN,
  IPIP_NEO_120_SOURCE,
  IpipNeo120InputError,
  listIpipNeo120Items,
  recordIpipNeo120Answers,
  resumeIpipNeo120Session,
  scoreIpipNeo120,
  startPersonalityAssessment,
} from '@loom/personality-assessment';

const consent = {
  scope: 'personality' as const,
  granted: true as const,
  noticeVersion: 'personality-consent/v1',
};

function completedSession(response: number) {
  return completeIpipNeo120Session(
    recordIpipNeo120Answers(
      startPersonalityAssessment(consent),
      IPIP_NEO_120_ITEMS.map((item) => ({ itemId: item.id, response })),
    ),
  );
}

describe('IPIP-NEO-120 P3 source integrity', () => {
  it('binds the public-domain Mandarin source, official scoring key, and exact item set', () => {
    expect(IPIP_NEO_120_SOURCE.instrumentId).toBe('ipip-neo-120@2014-zh-cn');
    expect(IPIP_NEO_120_SOURCE.rights).toMatch(/public domain/i);
    expect(IPIP_NEO_120_SOURCE.sources.mandarinItems.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(IPIP_NEO_120_SOURCE.sources.scoringKeys.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.hasOwn(IPIP_NEO_120_SOURCE, 'officialEnglishVariantsAtItemNumbers')).toBe(false);
    expect(IPIP_NEO_120_SOURCE.keyAlignment.officialEnglishVariantsAtItemNumbers).toEqual([
      28, 58, 59, 88, 101,
    ]);
    expect(IPIP_NEO_120_SOURCE.referenceOnlyAudit).toMatchObject({
      commit: '493546d48eb9053aca7e6c55574f4bf8033cc5a4',
      license: 'MIT',
      comparison: {
        fields: ['domain', 'facet', 'keyed'],
        referenceItems: 120,
        officialItems: 120,
        matchedItems: 120,
      },
    });
    expect(IPIP_NEO_120_ITEMS).toHaveLength(120);
    expect(new Set(IPIP_NEO_120_ITEMS.map((item) => item.id)).size).toBe(120);
    expect(IPIP_NEO_120_ITEMS[0]?.textZhCN).toBe(
      '\u4e3a\u5f88\u591a\u4e8b\u60c5\u611f\u5230\u62c5\u5fc3',
    );
    expect(createHash('sha256').update(JSON.stringify(IPIP_NEO_120_ITEMS)).digest('hex')).toBe(
      IPIP_NEO_120_ITEM_SET_SHA256,
    );
    for (const facet of new Set(IPIP_NEO_120_ITEMS.map((item) => item.facetId))) {
      expect(IPIP_NEO_120_ITEMS.filter((item) => item.facetId === facet)).toHaveLength(4);
    }
  });

  it('binds the official Mandarin instructions and five response options for a public form', () => {
    expect(IPIP_NEO_120_INSTRUCTIONS_ZH_CN).toContain('而不是你希望自己未来能成为的样子');
    expect(IPIP_NEO_120_RESPONSE_OPTIONS_ZH_CN).toEqual([
      { value: 1, label: '非常不准确' },
      { value: 2, label: '不太不准确' },
      { value: 3, label: '适中' },
      { value: 4, label: '比较准确' },
      { value: 5, label: '非常准确' },
    ]);
  });

  it('keeps the instrument metadata compatible with the private-session contract', () => {
    expect(IPIP_NEO_120_INSTRUMENT).toMatchObject({
      id: 'ipip-neo-120@2014-zh-cn',
      language: 'zh-CN',
      itemSetSha256: IPIP_NEO_120_ITEM_SET_SHA256,
      scoringVersion: 'ipip-standard-reverse-and-sum/v1',
    });
  });
});

describe('IPIP-NEO-120 P3 private session lifecycle', () => {
  it('requires explicit personality consent and supports local pause/resume', () => {
    expect(() => startPersonalityAssessment({ ...consent, scope: 'remote-summary' })).toThrow(
      IpipNeo120InputError,
    );
    const started = startPersonalityAssessment(consent);
    const updated = recordIpipNeo120Answers(started, [
      { itemId: 'ipip-neo-120-001', response: 4 },
      { itemId: 'ipip-neo-120-002', response: 2 },
    ]);
    expect(started.answers).toEqual([]);
    expect(resumeIpipNeo120Session(updated)).toEqual(updated);
  });

  it('fails closed for unknown, duplicate, invalid, and incomplete responses', () => {
    const started = startPersonalityAssessment(consent);
    expect(() =>
      recordIpipNeo120Answers(started, [{ itemId: 'unknown-item', response: 3 }]),
    ).toThrow(IpipNeo120InputError);
    expect(() =>
      recordIpipNeo120Answers(started, [
        { itemId: 'ipip-neo-120-001', response: 3 },
        { itemId: 'ipip-neo-120-001', response: 4 },
      ]),
    ).toThrow(IpipNeo120InputError);
    expect(() =>
      recordIpipNeo120Answers(started, [{ itemId: 'ipip-neo-120-001', response: 0 }]),
    ).toThrow(IpipNeo120InputError);
    expect(() => completeIpipNeo120Session(started)).toThrow(IpipNeo120InputError);
  });

  it('cancels by scrubbing local raw answers and exports no raw session data', () => {
    const partial = recordIpipNeo120Answers(startPersonalityAssessment(consent), [
      { itemId: 'ipip-neo-120-001', response: 5 },
    ]);
    expect(cancelIpipNeo120Session(partial)).toMatchObject({ status: 'cancelled', answers: [] });
    expect(deleteIpipNeo120Session()).toEqual({
      contractVersion: 'personality-session-delete/v1',
      deleted: true,
    });
  });
});

describe('IPIP-NEO-120 P3 scoring', () => {
  it('matches independently transcribed official-key all-one golden scores', () => {
    const profile = scoreIpipNeo120(completedSession(1));
    // These are a separate hand-transcribed oracle from the official 30-facet key:
    // + keyed = 1 and - keyed = 5, then facets and domains are summed.
    expect(profile.domains).toEqual([
      { id: 'domain-n', score: 52 },
      { id: 'domain-e', score: 48 },
      { id: 'domain-o', score: 72 },
      { id: 'domain-a', score: 92 },
      { id: 'domain-c', score: 76 },
    ]);
    expect(profile.facets).toEqual([
      { id: 'facet-n1', score: 4 },
      { id: 'facet-e1', score: 12 },
      { id: 'facet-o1', score: 4 },
      { id: 'facet-a1', score: 8 },
      { id: 'facet-c1', score: 4 },
      { id: 'facet-n2', score: 8 },
      { id: 'facet-e2', score: 12 },
      { id: 'facet-o2', score: 12 },
      { id: 'facet-a2', score: 20 },
      { id: 'facet-c2', score: 16 },
      { id: 'facet-n3', score: 8 },
      { id: 'facet-e3', score: 8 },
      { id: 'facet-o3', score: 12 },
      { id: 'facet-a3', score: 12 },
      { id: 'facet-c3', score: 12 },
      { id: 'facet-n4', score: 8 },
      { id: 'facet-e4', score: 8 },
      { id: 'facet-o4', score: 16 },
      { id: 'facet-a4', score: 20 },
      { id: 'facet-c4', score: 12 },
      { id: 'facet-n5', score: 16 },
      { id: 'facet-e5', score: 4 },
      { id: 'facet-o5', score: 16 },
      { id: 'facet-a5', score: 20 },
      { id: 'facet-c5', score: 12 },
      { id: 'facet-n6', score: 8 },
      { id: 'facet-e6', score: 4 },
      { id: 'facet-o6', score: 12 },
      { id: 'facet-a6', score: 12 },
      { id: 'facet-c6', score: 20 },
    ]);
  });

  it('matches the complementary all-five golden and exports a nonclinical profile only', () => {
    const profile = exportIpipNeo120Profile(completedSession(5));
    expect(profile.domains).toEqual([
      { id: 'domain-n', score: 92 },
      { id: 'domain-e', score: 96 },
      { id: 'domain-o', score: 72 },
      { id: 'domain-a', score: 52 },
      { id: 'domain-c', score: 68 },
    ]);
    expect(profile).toMatchObject({
      contractVersion: 'personality-profile/v1',
      completeness: 1,
      selfReportNotDiagnosis: true,
      qualityFlags: ['complete-120-items', 'norms-not-applied'],
    });
    expect(profile).not.toHaveProperty('answers');
    expect(profile).not.toHaveProperty('normRef');
  });

  it('matches the fixed reference-only key-parity vector without importing its wording', () => {
    // Derived during the source audit from the fixed MIT reference metadata only:
    // item n receives (n % 5) + 1, then its independently keyed score is summed.
    const session = completeIpipNeo120Session(
      recordIpipNeo120Answers(
        startPersonalityAssessment(consent),
        IPIP_NEO_120_ITEMS.map((item, index) => ({
          itemId: item.id,
          response: ((index + 1) % 5) + 1,
        })),
      ),
    );
    const profile = scoreIpipNeo120(session);
    expect(profile.domains).toEqual([
      { id: 'domain-n', score: 62 },
      { id: 'domain-e', score: 72 },
      { id: 'domain-o', score: 72 },
      { id: 'domain-a', score: 52 },
      { id: 'domain-c', score: 76 },
    ]);
    expect(profile.facets).toEqual([
      { id: 'facet-n1', score: 8 },
      { id: 'facet-e1', score: 12 },
      { id: 'facet-o1', score: 16 },
      { id: 'facet-a1', score: 16 },
      { id: 'facet-c1', score: 4 },
      { id: 'facet-n2', score: 10 },
      { id: 'facet-e2', score: 12 },
      { id: 'facet-o2', score: 12 },
      { id: 'facet-a2', score: 4 },
      { id: 'facet-c2', score: 16 },
      { id: 'facet-n3', score: 10 },
      { id: 'facet-e3', score: 12 },
      { id: 'facet-o3', score: 12 },
      { id: 'facet-a3', score: 12 },
      { id: 'facet-c3', score: 12 },
      { id: 'facet-n4', score: 10 },
      { id: 'facet-e4', score: 12 },
      { id: 'facet-o4', score: 10 },
      { id: 'facet-a4', score: 4 },
      { id: 'facet-c4', score: 12 },
      { id: 'facet-n5', score: 14 },
      { id: 'facet-e5', score: 12 },
      { id: 'facet-o5', score: 10 },
      { id: 'facet-a5', score: 4 },
      { id: 'facet-c5', score: 12 },
      { id: 'facet-n6', score: 10 },
      { id: 'facet-e6', score: 12 },
      { id: 'facet-o6', score: 12 },
      { id: 'facet-a6', score: 12 },
      { id: 'facet-c6', score: 20 },
    ]);
  });

  it('lists only the exact bound item set for a future local UI', () => {
    expect(listIpipNeo120Items()).toBe(IPIP_NEO_120_ITEMS);
  });
});
