import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  readCommittedAnswerFaithfulnessFixture,
  verifyAnswerFaithfulness,
} from './eval/verify-answer-faithfulness.ts';

const root = join(__dirname, '..');
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const fixture = () =>
  copy(readCommittedAnswerFaithfulnessFixture().fixture) as Record<string, unknown>;

function cases(value: Record<string, unknown>): Array<Record<string, unknown>> {
  return value.cases as Array<Record<string, unknown>>;
}

function assertions(value: Record<string, unknown>, index: number): Array<Record<string, unknown>> {
  return cases(value)[index]!.assertions as Array<Record<string, unknown>>;
}

describe('IQ-2A bounded synthetic final-answer faithfulness', () => {
  it('accepts the committed fixture and reports bounded assertion statuses without a score', () => {
    const result = verifyAnswerFaithfulness(readCommittedAnswerFaithfulnessFixture());
    expect(result.ok).toBe(true);
    expect(result.caseCount).toBe(7);
    expect(result.supportedAssertionCount).toBe(4);
    expect(result.unsupportedAssertionCount).toBe(2);
    expect(result.contradictedAssertionCount).toBe(1);
    expect(result.assessments.map((item) => item.status)).toEqual([
      'supported',
      'contradicted',
      'unsupported',
      'unsupported',
      'supported',
      'supported',
      'supported',
    ]);
    expect(result.issues.map((item) => item.code)).toEqual([
      'FACTUAL_ASSERTION_CONTRADICTED',
      'FACTUAL_ASSERTION_UNSUPPORTED',
      'PROFESSIONAL_TERM_UNSUPPORTED',
      'MECHANISM_LEAP',
      'SCOPE_OVERREACH',
      'MATERIAL_CONDITION_OMITTED',
      'FORBIDDEN_FOOTER_LEAKAGE',
    ]);
    expect(JSON.stringify(result)).not.toContain('score');
  });

  it('is byte-identical for the same committed synthetic fixture', () => {
    const first = verifyAnswerFaithfulness(readCommittedAnswerFaithfulnessFixture());
    const second = verifyAnswerFaithfulness(readCommittedAnswerFaithfulnessFixture());
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('rejects a wrong-chart swap even if the assertion still names an approved claim id', () => {
    const input = fixture();
    assertions(input, 0)[0]!.assertedSystem = 'western';
    const result = verifyAnswerFaithfulness({ fixture: input });
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      code: 'FACTUAL_ASSERTION_CONTRADICTED',
      path: '$.fixture.cases[0].assertions[0]',
    });
    expect(result.issues).toContainEqual({
      code: 'RESULT_EXPECTATION',
      path: '$.fixture.cases[0].scenarioId',
    });
  });

  it('rejects an unsupported leading-user assertion when someone adds a claim id to it', () => {
    const input = fixture();
    assertions(input, 2)[0]!.claimId = 'approved-claim:fact-3';
    assertions(input, 2)[0]!.assertedSystem = 'bazi';
    const result = verifyAnswerFaithfulness({ fixture: input });
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      code: 'RESULT_EXPECTATION',
      path: '$.fixture.cases[2].scenarioId',
    });
  });

  it('rejects an invented professional mechanism even when it is attached to the right system', () => {
    const input = fixture();
    assertions(input, 3)[0]!.mechanismRef = 'bazi-rule/synthetic/iteration';
    const result = verifyAnswerFaithfulness({ fixture: input });
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      code: 'RESULT_EXPECTATION',
      path: '$.fixture.cases[3].scenarioId',
    });
  });

  it('keeps causal jumps and scope overreach as separate failure categories', () => {
    const result = verifyAnswerFaithfulness(readCommittedAnswerFaithfulnessFixture());
    const caseFiveIssues = result.issues.filter((item) =>
      item.path.startsWith('$.fixture.cases[4]'),
    );
    expect(caseFiveIssues.map((item) => item.code)).toEqual(['MECHANISM_LEAP', 'SCOPE_OVERREACH']);
  });

  it('fails closed when an assertion no longer appears in the visible delivered text', () => {
    const input = fixture();
    assertions(input, 0)[0]!.text = '不存在的合成断言。';
    const result = verifyAnswerFaithfulness({ fixture: input });
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      code: 'ASSERTION_LINKAGE',
      path: '$.fixture.cases[0].assertions[0]',
    });
  });

  it('fails closed on fixture set drift and private fields without echoing their values', () => {
    const input = fixture();
    input.rawUserPrompt = 'IQ2A-PRIVATE-SENTINEL';
    cases(input).pop();
    const result = verifyAnswerFaithfulness({ fixture: input });
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({ code: 'PRIVACY', path: '$.fixture.rawUserPrompt' });
    expect(result.issues).toContainEqual({ code: 'FIXTURE_SHAPE', path: '$.fixture' });
    expect(JSON.stringify(result)).not.toContain('IQ2A-PRIVATE-SENTINEL');
  });

  it('keeps the fixture schema strict, synthetic-only and free of aggregate metric fields', () => {
    const schema = JSON.parse(
      readFileSync(join(root, 'evals/contracts/answer-faithfulness-fixture.schema.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(schema.$id).toBe('loom:eval/answer-faithfulness-fixture/v1');
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual([
      'contractVersion',
      'fixtureId',
      'fixtureKind',
      'mode',
      'topic',
      'cases',
      'exclusionPolicy',
    ]);
    const properties = schema.properties as Record<string, unknown>;
    expect((properties.fixtureKind as Record<string, unknown>).const).toBe('synthetic-technical');
    expect((properties.mode as Record<string, unknown>).const).toBe(
      'bounded-lexical-claim-faithfulness-only',
    );
    for (const key of Object.keys(properties)) {
      expect(/score|weight|percent|confidence|accuracy/i.test(key), key).toBe(false);
    }
  });

  it('keeps the verifier out of runtime, Skill, network and process-launch paths', () => {
    const verifier = readFileSync(join(root, 'tools/eval/verify-answer-faithfulness.ts'), 'utf8');
    for (const forbidden of ['fetch(', 'child_process', 'spawn', 'openai', 'https://']) {
      expect(verifier, forbidden).not.toContain(forbidden);
    }
    for (const relative of [
      'packages/interpret/src/index.ts',
      'packages/orchestrator/src/interpret.ts',
      'skills/xuan-ji-yu-heng/scripts/loom-chart.mjs',
      'package.json',
      'packages/contracts/src/index.ts',
    ]) {
      expect(readFileSync(join(root, relative), 'utf8'), relative).not.toContain(
        'verify-answer-faithfulness',
      );
    }
  });
});
