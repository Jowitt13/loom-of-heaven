// Synthetic fixtures only - fictional data; not a real person. fixtureKind: synthetic-technical.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '@loom/contracts';
import { describe, expect, it } from 'vitest';
import {
  CareerRealityClarificationError,
  planCareerRealityClarification,
} from '../src/career-reality-clarification.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (relativePath: string): string => readFileSync(join(root, relativePath), 'utf8');

function fact(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    factId: 'career-fact:role-1',
    source: 'user-stated',
    confirmedByUser: true,
    category: 'current-role',
    statement: '合成事实：某公司初级分析师（虚构示例）。',
    ...overrides,
  };
}

function input(
  overrides: Record<string, unknown> = {},
  facts?: unknown[],
): Record<string, unknown> {
  return {
    contractVersion: 'career-reality-clarification-input/v1',
    requestScope: 'career-decision-support',
    confirmedFacts: facts ?? [fact()],
    transient: true,
    noPersistence: true,
    ...overrides,
  };
}

function expectContractError(run: () => unknown, code: string): void {
  try {
    run();
    throw new Error('expected the career reality clarification contract to fail closed');
  } catch (error) {
    expect(error).toBeInstanceOf(CareerRealityClarificationError);
    expect((error as CareerRealityClarificationError).code).toBe(code);
  }
}

describe('C-1 career reality clarification contract', () => {
  it('is deterministic for a complete, legal, user-confirmed input', () => {
    const facts = [
      fact({ factId: 'career-fact:role-1', category: 'current-role' }),
      fact({
        factId: 'career-fact:skill-1',
        category: 'skills',
        statement: '合成事实：两年数据整理经验（虚构示例）。',
      }),
      fact({
        factId: 'career-fact:goal-1',
        category: 'goals',
        statement: '合成事实：转向稳定岗位。',
      }),
      fact({
        factId: 'career-fact:constraint-1',
        category: 'constraints',
        statement: '合成事实：每周可投入时间有限。',
      }),
    ];
    const first = planCareerRealityClarification(input({}, facts));
    const second = planCareerRealityClarification(input({}, facts));
    expect(first.status).toBe('ready-for-composition');
    expect(first.acceptedFactIds).toEqual([
      'career-fact:role-1',
      'career-fact:skill-1',
      'career-fact:goal-1',
      'career-fact:constraint-1',
    ]);
    expect(first.missingCategories).toEqual([]);
    expect(first.clarificationQuestions).toEqual([]);
    expect(first.transient).toBe(true);
    expect(first.noPersistence).toBe(true);
    expect(canonicalJson(first)).toBe(canonicalJson(second));
  });

  it('emits the fixed clarification question for each missing core category', () => {
    const plan = planCareerRealityClarification(input({}, []));
    expect(plan.status).toBe('clarification-required');
    expect(plan.missingCategories).toEqual(['current-role', 'skills', 'goals', 'constraints']);
    expect(plan.clarificationQuestions.length).toBe(4);
    // The same missing category always yields the identical fixed question.
    expect(plan.clarificationQuestions).toEqual(
      planCareerRealityClarification(input({}, [])).clarificationQuestions,
    );

    const onlyRole = planCareerRealityClarification(input({}, [fact()]));
    expect(onlyRole.missingCategories).toEqual(['skills', 'goals', 'constraints']);
    expect(onlyRole.clarificationQuestions.length).toBe(3);
  });

  it('never produces advisory fields, advice text, or input statement echoes', () => {
    const statement = '合成事实：某公司初级分析师（虚构示例）。';
    const plan = planCareerRealityClarification(input({}, [fact()]));
    const serialized = canonicalJson(plan);
    for (const forbidden of [
      '建议',
      '适合',
      '推荐',
      '应该考虑',
      '匹配度',
      statement,
      'bazi',
      'ruleset',
      'pattern',
      '八字',
    ]) {
      expect(serialized, forbidden).not.toContain(forbidden);
    }
    expect(Object.keys(plan).sort()).toEqual([
      'acceptedCategories',
      'acceptedFactIds',
      'boundaryCodes',
      'clarificationQuestions',
      'contractVersion',
      'missingCategories',
      'noPersistence',
      'requestScope',
      'status',
      'transient',
    ]);
  });

  it('rejects facts that are not user-stated or not confirmed', () => {
    expectContractError(
      () => planCareerRealityClarification(input({}, [fact({ source: 'inferred' })])),
      'INPUT_CONTRACT',
    );
    expectContractError(
      () => planCareerRealityClarification(input({}, [fact({ confirmedByUser: false })])),
      'INPUT_CONTRACT',
    );
  });

  it('rejects duplicate fact ids, unknown categories, and empty statements', () => {
    expectContractError(
      () => planCareerRealityClarification(input({}, [fact(), fact({ category: 'skills' })])),
      'INPUT_CONTRACT',
    );
    expectContractError(
      () => planCareerRealityClarification(input({}, [fact({ category: 'wealth' })])),
      'INPUT_CONTRACT',
    );
    expectContractError(
      () => planCareerRealityClarification(input({}, [fact({ statement: '' })])),
      'INPUT_CONTRACT',
    );
  });

  it('rejects a missing contract version and unexpected extra fields', () => {
    const noVersion = input();
    delete noVersion.contractVersion;
    expectContractError(() => planCareerRealityClarification(noVersion), 'INPUT_CONTRACT');
    expectContractError(
      () =>
        planCareerRealityClarification(
          input({ transient: true, hostChatRef: 'chat-123' }, [fact()]),
        ),
      'INPUT_CONTRACT',
    );
  });

  it('rejects injected bazi, astrology, psychology, and clinical payload fields', () => {
    for (const key of [
      'bazi',
      'chartBundle',
      'ruleset',
      'astrology',
      'psychology',
      'clinical',
      'assessment',
      'score',
      'diagnosis',
      'pattern',
      'usefulGod',
    ]) {
      const packet = input();
      (packet as Record<string, unknown>)[key] = true;
      expectContractError(() => planCareerRealityClarification(packet), 'INPUT_CONTRACT');
    }
  });

  it('rejects out-of-scope request scopes', () => {
    for (const scope of [
      'prediction',
      'promotion-guarantee',
      'fortune',
      'bazi-career-match',
      'diagnosis',
    ]) {
      expectContractError(
        () => planCareerRealityClarification(input({ requestScope: scope }, [fact()])),
        'OUT_OF_SCOPE_REQUEST',
      );
    }
    expectContractError(
      () => planCareerRealityClarification(input({ requestScope: '' }, [fact()])),
      'INPUT_CONTRACT',
    );
  });

  it('keeps the module offline, transient, and persistence-free', () => {
    const module = read('packages/orchestrator/src/career-reality-clarification.ts');
    for (const forbidden of [
      'node:fs',
      'node:child_process',
      'fetch(',
      'writeFile',
      'localStorage',
      'sessionStorage',
      'openai',
      'readFileSync',
    ]) {
      expect(module, forbidden).not.toContain(forbidden);
    }
  });

  it('stays outside the package index and every runtime entry point', () => {
    expect(read('packages/orchestrator/src/index.ts')).not.toContain(
      'career-reality-clarification',
    );
    for (const relative of [
      'packages/orchestrator/src/engine-entry.ts',
      'skills/xuan-ji-yu-heng/scripts/loom-chart.mjs',
      'skills/xuan-ji-yu-heng/SKILL.md',
      'packages/contracts/src/index.ts',
      'packages/interpret/src/index.ts',
      'package.json',
    ]) {
      expect(read(relative), relative).not.toContain('career-reality-clarification');
    }
  });
});
