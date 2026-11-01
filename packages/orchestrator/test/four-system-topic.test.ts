// Synthetic fixtures only - fictional data; not a real person. fixtureKind: synthetic-technical.
// Roadmap v3.4 §7 item 4 regressions: four-system topic interpretation.
import { describe, expect, it } from 'vitest';
import { parseBirthInput } from '@loom/contracts';
import { runAnswerPlan } from '@loom/orchestrator';

const FIXED = Date.parse('2026-01-01T00:00:00Z');

const baseInput = parseBirthInput({
  calendar: 'gregorian',
  localDate: '1991-02-03',
  localTime: '04:05:06',
  timeAccuracy: 'exact',
  timezone: 'Pacific/Port_Moresby',
  location: { latitude: 12.345678, longitude: 98.765432, source: 'user' },
  ruleGender: 'female',
  settings: { systems: ['bazi'] },
});

// Counterexample input: 戊 day master with 偏财/伤官/正印 stems — no 正官 or
// 七杀 anywhere in the four stems. Under the retired ADR 0021 narrowing this
// chart emptied the whole career question.
const noOfficerInput = parseBirthInput({
  calendar: 'gregorian',
  localDate: '1992-11-08',
  localTime: '10:30:00',
  timeAccuracy: 'exact',
  timezone: 'Asia/Shanghai',
  location: { latitude: 30.5, longitude: 114.3, source: 'user' },
  ruleGender: 'male',
  settings: { systems: ['bazi'] },
});

describe('roadmap v3.4 four-system topic interpretation', () => {
  it(
    'answers a career question with real four-system material when no officer ten-god is transparent',
    { timeout: 30_000 },
    () => {
      const { answerPlan, publicResult } = runAnswerPlan(noOfficerInput, {
        now: FIXED,
        topic: 'career',
      });
      // The old narrowing returned [] here (no single ADR 0021 reference).
      expect(answerPlan.answerability).not.toBe('not-supported');
      expect(answerPlan.noEvidenceReason).toBeUndefined();
      // No ten-god cultural reference exists on this chart — and the topic
      // still carries MC, 官禄宫, day-master and pillar material.
      expect(
        answerPlan.selectedFacts.some((fact) =>
          fact.evidence.some((evidence) =>
            /^bazi\.pillars\.(year|month|day|hour)\.tenGod$/.test(evidence.ref),
          ),
        ),
      ).toBe(false);
      expect(
        answerPlan.selectedFacts.some(
          (fact) => fact.claim.includes('西方中天') || fact.claim.includes('MC'),
        ),
      ).toBe(true);
      expect(answerPlan.selectedFacts.some((fact) => fact.claim.includes('官禄宫'))).toBe(true);
      expect(answerPlan.selectedFacts.some((fact) => fact.claim.startsWith('四柱'))).toBe(true);
      expect(answerPlan.selectedFacts.some((fact) => fact.claim.includes('日主'))).toBe(true);
      // A chart-only plan still never requests practical career advice.
      expect(answerPlan.responseRequirements.contentOrder).not.toContain('practical-options');
      for (const fact of answerPlan.selectedFacts) {
        expect(fact.topic).not.toBe('health');
      }
      expect(publicResult.facts.map((fact) => fact.id)).toEqual(answerPlan.allowedFactIds);
    },
  );

  it(
    'brings genuinely relevant material into love and study questions',
    { timeout: 30_000 },
    () => {
      const marriage = runAnswerPlan(baseInput, { now: FIXED, topic: 'marriage' }).answerPlan;
      // Authored marriage facts...
      expect(marriage.selectedFacts.some((fact) => fact.claim.includes('配偶星'))).toBe(true);
      expect(marriage.selectedFacts.some((fact) => fact.claim.includes('夫妻宫'))).toBe(true);
      // ...plus the classic relational Western meanings (previously locked
      // into the character topic by the blanket mapping).
      expect(
        marriage.selectedFacts.some((fact) =>
          fact.evidence.some((evidence) =>
            /^western-rule\/planet-sign\/(?:venus|moon)-/.test(evidence.ref),
          ),
        ),
      ).toBe(true);
      expect(
        marriage.selectedFacts.some((fact) =>
          fact.evidence.some((evidence) => evidence.ref === 'western.planets[Venus]'),
        ),
      ).toBe(true);
      // Unrelated material stays out of the marriage pool.
      expect(marriage.selectedFacts.every((fact) => fact.topic !== 'studies')).toBe(true);

      const studies = runAnswerPlan(baseInput, { now: FIXED, topic: 'studies' }).answerPlan;
      expect(studies.selectedFacts.some((fact) => fact.claim.includes('印星'))).toBe(true);
      expect(
        studies.selectedFacts.some((fact) =>
          fact.evidence.some((evidence) =>
            /^western-rule\/planet-sign\/mercury-/.test(evidence.ref),
          ),
        ),
      ).toBe(true);
      // Venus material is NOT career/studies material — it stays out.
      expect(
        studies.selectedFacts.some((fact) =>
          fact.evidence.some((evidence) => /venus/i.test(evidence.ref)),
        ),
      ).toBe(false);
    },
  );

  it(
    'never relabels a civil/UTC run as solar-time-affected (precision provenance)',
    { timeout: 30_000 },
    () => {
      // Default civil path: node/asteroid approximations carry their OWN
      // codes; no solar-time warning exists because no calculation applied
      // the solar clock face.
      const run = runAnswerPlan(baseInput, { now: FIXED, topic: 'character' });
      const codes = run.publicResult.warnings.map((warning) => warning.code);
      expect(codes).toContain('LUNAR_NODE_APPROXIMATE');
      expect(codes).toContain('ASTEROID_APPROXIMATE');
      expect(codes).not.toContain('SOLAR_TIME_APPROXIMATE');
      // Topic answers do not cite node/asteroid points, so no precision note
      // is forced into the body.
      expect(run.answerPlan.requiredWarningCodes).toEqual([]);

      // Applying a solar clock to the BaZi pillars produces the honest
      // solar-time warning, material for time-sensitive facts.
      const apparent = parseBirthInput({
        ...baseInput,
        settings: {
          ...baseInput.settings,
          bazi: { ...baseInput.settings.bazi, solarTimeMode: 'apparent' as const },
        },
      });
      const apparentRun = runAnswerPlan(apparent, { now: FIXED, topic: 'character' });
      expect(apparentRun.publicResult.warnings.map((warning) => warning.code)).toContain(
        'SOLAR_TIME_APPROXIMATE',
      );

      // Sidereal mode: the ayanamsha note replaces the old solar-time label
      // and qualifies western facts.
      const sidereal = parseBirthInput({
        ...baseInput,
        settings: {
          ...baseInput.settings,
          western: { ...baseInput.settings.western, zodiac: 'sidereal' as const },
        },
      });
      const siderealRun = runAnswerPlan(sidereal, { now: FIXED, topic: 'marriage' });
      const siderealCodes = siderealRun.publicResult.warnings.map((warning) => warning.code);
      expect(siderealCodes).toContain('SIDEREAL_AYANAMSHA_APPROXIMATE');
      expect(siderealCodes).not.toContain('SOLAR_TIME_APPROXIMATE');
      expect(siderealRun.answerPlan.requiredWarningCodes).toContain(
        'SIDEREAL_AYANAMSHA_APPROXIMATE',
      );
    },
  );

  it('marks the interpretation-source-tier guardrail on every plan', () => {
    const { answerPlan } = runAnswerPlan(baseInput, { now: FIXED, topic: 'general' });
    expect(answerPlan.guardrails).toContain('distinguish-fact-rule-interpretation');
  });
});
