import { describe, expect, it } from 'vitest';
import {
  MAX_QUESTIONNAIRE_ANSWERS,
  MentalHealthScreeningResult,
  PersonalityProfile,
  QuestionnaireSession,
  psychologyNotImplemented,
} from '@loom/psychology-contracts';

const instrument = {
  id: 'ipip-neo-120@1',
  version: '1',
  language: 'zh-CN',
  itemSetSha256: 'a'.repeat(64),
  scoringVersion: '1',
  sourceUrl: 'https://example.invalid/instrument',
  licenseRef: 'public-domain',
};

const consent = { scope: 'personality' as const, granted: true as const, noticeVersion: '1' };

describe('psychology P1 contracts', () => {
  it('keeps raw sessions private, bounded, and free of item text or identifying fields', () => {
    const base = {
      contractVersion: 'questionnaire-session/v1' as const,
      instrument,
      consent,
      status: 'in-progress' as const,
      answers: [{ itemId: 'item-001', response: 4 }],
    };
    expect(QuestionnaireSession.safeParse(base).success).toBe(true);
    expect(QuestionnaireSession.safeParse({ ...base, birthDate: '2000-01-01' }).success).toBe(
      false,
    );
    expect(
      QuestionnaireSession.safeParse({
        ...base,
        answers: [{ itemId: 'item-001', response: 4, questionText: 'synthetic only' }],
      }).success,
    ).toBe(false);
  });

  it('rejects duplicate, out-of-range, and oversized response sets', () => {
    const base = {
      contractVersion: 'questionnaire-session/v1' as const,
      instrument,
      consent,
      status: 'completed' as const,
    };
    expect(
      QuestionnaireSession.safeParse({
        ...base,
        answers: [
          { itemId: 'item-001', response: 1 },
          { itemId: 'item-001', response: 2 },
        ],
      }).success,
    ).toBe(false);
    expect(
      QuestionnaireSession.safeParse({ ...base, answers: [{ itemId: 'item-002', response: 8 }] })
        .success,
    ).toBe(false);
    expect(
      QuestionnaireSession.safeParse({
        ...base,
        answers: Array.from({ length: MAX_QUESTIONNAIRE_ANSWERS + 1 }, (_, index) => ({
          itemId: `item-${index}`,
          response: 1,
        })),
      }).success,
    ).toBe(false);
  });

  it('keeps aggregate personality and clinical screening outputs structurally separate', () => {
    const profile = {
      contractVersion: 'personality-profile/v1' as const,
      instrument,
      completeness: 1,
      domains: [{ id: 'openness', score: 10 }],
      facets: [],
      qualityFlags: [],
      selfReportNotDiagnosis: true as const,
    };
    expect(PersonalityProfile.safeParse(profile).success).toBe(true);
    expect(PersonalityProfile.safeParse({ ...profile, diagnosis: 'none' }).success).toBe(false);
    expect(
      MentalHealthScreeningResult.safeParse({
        contractVersion: 'mental-health-screening-result/v1',
        instrument,
        recallPeriod: 'synthetic',
        complete: true,
        score: 0,
        screeningNotDiagnosis: true,
        safetyState: 'routine',
        nextActionIds: ['review-result'],
        personalityProfile: profile,
      }).success,
    ).toBe(false);
  });

  it('returns the only P1 result shape without scores or instrument content', () => {
    expect(psychologyNotImplemented('mental-health-screening')).toEqual({
      contractVersion: 'psychology-capability/v1',
      capability: 'mental-health-screening',
      status: 'not-implemented',
      reason: 'P1_SKELETON_ONLY',
    });
  });
});
