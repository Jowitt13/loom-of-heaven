// Synthetic fixtures only - fictional data; not a real person. fixtureKind: synthetic-technical.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '@loom/contracts';
import { describe, expect, it } from 'vitest';
import { CareerCompositionError, composeCareerUnits } from '../src/career-composition.ts';
import {
  planCareerRealityClarification,
  type CareerRealityClarificationPlan,
} from '../src/career-reality-clarification.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (relativePath: string): string => readFileSync(join(root, relativePath), 'utf8');

const STATEMENT = '合成事实：某公司初级分析师，两年数据整理经验（虚构示例）。';

function fact(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    factId: 'career-fact:role-1',
    source: 'user-stated',
    confirmedByUser: true,
    category: 'current-role',
    statement: STATEMENT,
    ...overrides,
  };
}

function readyPlan(): CareerRealityClarificationPlan {
  return planCareerRealityClarification({
    contractVersion: 'career-reality-clarification-input/v1',
    requestScope: 'career-decision-support',
    confirmedFacts: [
      fact(),
      fact({
        factId: 'career-fact:skill-1',
        category: 'skills',
        statement: '合成事实：SQL 与报表。',
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
    ],
    transient: true,
    noPersistence: true,
  });
}

function unit(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    unitId: 'composition-unit:u1',
    layer: 'career-reality',
    contentIntent: 'reflection-question',
    factIds: ['career-fact:role-1'],
    boundaryRef: 'user-stated-only',
    ...overrides,
  };
}

function compositionInput(
  overrides: Record<string, unknown> = {},
  units?: unknown[],
): Record<string, unknown> {
  return {
    clarificationPlan: readyPlan(),
    units: units ?? [unit()],
    ...overrides,
  };
}

function expectCompositionError(run: () => unknown, code: string): void {
  try {
    run();
    throw new Error('expected the career composition contract to fail closed');
  } catch (error) {
    expect(error).toBeInstanceOf(CareerCompositionError);
    expect((error as CareerCompositionError).code).toBe(code);
  }
}

describe('C-2 career composition provenance contract', () => {
  it('builds a deterministic, byte-identical R-only composition skeleton', () => {
    const input = compositionInput({}, [
      unit(),
      unit({
        unitId: 'composition-unit:u2',
        contentIntent: 'decision-framework',
        factIds: ['career-fact:skill-1', 'career-fact:goal-1'],
      }),
    ]);
    const first = composeCareerUnits(input);
    const second = composeCareerUnits(input);
    expect(first.status).toBe('structure-bound');
    expect(first.transient).toBe(true);
    expect(first.noPersistence).toBe(true);
    expect(first.sourcePlan.acceptedFactIds.length).toBe(4);
    expect(first.units[1]!.factIds).toEqual(['career-fact:goal-1', 'career-fact:skill-1']);
    expect(canonicalJson(first)).toBe(canonicalJson(second));
  });

  it('rejects a plan that is not ready-for-composition', () => {
    const clarificationRequired = planCareerRealityClarification({
      contractVersion: 'career-reality-clarification-input/v1',
      requestScope: 'career-decision-support',
      confirmedFacts: [fact()],
      transient: true,
      noPersistence: true,
    });
    expect(clarificationRequired.status).toBe('clarification-required');
    expectCompositionError(
      () => composeCareerUnits(compositionInput({ clarificationPlan: clarificationRequired })),
      'CONTRACT_INVALID',
    );

    const wrongVersion = {
      ...readyPlan(),
      contractVersion: 'career-reality-clarification-plan/v0',
    };
    expectCompositionError(
      () => composeCareerUnits(compositionInput({ clarificationPlan: wrongVersion })),
      'CONTRACT_INVALID',
    );
  });

  it('rejects a plan whose shape drifts (missing category, open boundary codes)', () => {
    const drifted = {
      ...readyPlan(),
      acceptedCategories: readyPlan().acceptedCategories.slice(0, 2),
    };
    expectCompositionError(
      () => composeCareerUnits(compositionInput({ clarificationPlan: drifted })),
      'CONTRACT_INVALID',
    );

    const openBoundaries = { ...readyPlan(), boundaryCodes: ['something'] };
    expectCompositionError(
      () => composeCareerUnits(compositionInput({ clarificationPlan: openBoundaries })),
      'CONTRACT_INVALID',
    );
  });

  it('rejects units referencing fact ids outside the accepted plan facts', () => {
    expectCompositionError(
      () =>
        composeCareerUnits(compositionInput({}, [unit({ factIds: ['career-fact:not-accepted'] })])),
      'UNBOUND_FACT_REFERENCE',
    );
  });

  it('rejects duplicate unit ids and duplicate fact ids', () => {
    expectCompositionError(
      () => composeCareerUnits(compositionInput({}, [unit(), unit()])),
      'CONTRACT_INVALID',
    );
    expectCompositionError(
      () =>
        composeCareerUnits(
          compositionInput({}, [unit({ factIds: ['career-fact:role-1', 'career-fact:role-1'] })]),
        ),
      'CONTRACT_INVALID',
    );
  });

  it('rejects traditional-structure, career-reflection, and clinical-assessment layers', () => {
    for (const layer of ['traditional-structure', 'career-reflection', 'clinical-assessment']) {
      expectCompositionError(
        () => composeCareerUnits(compositionInput({}, [unit({ layer })])),
        'CONTRACT_INVALID',
      );
    }
  });

  it('rejects bazi, traditional-rule, psychology, clinical, scoring, and session injections', () => {
    for (const key of [
      'bazi',
      'chartBundle',
      'ruleset',
      'claim',
      'pattern',
      'psychology',
      'assessment',
      'score',
      'norm',
      'clinical',
      'diagnosis',
      'trait',
      'hostChatRef',
      'sessionId',
      'filePath',
    ]) {
      const packet = compositionInput();
      (packet as Record<string, unknown>)[key] = true;
      expectCompositionError(() => composeCareerUnits(packet), 'CONTRACT_INVALID');
    }
  });

  it('rejects visible-text and advisory output fields', () => {
    for (const key of [
      'text',
      'visibleText',
      'markdown',
      'answer',
      'advice',
      'recommendation',
      'prediction',
      'narrative',
      'renderedBody',
    ]) {
      const withUnitField = compositionInput({}, [unit({ [key]: 'x' })]);
      expectCompositionError(() => composeCareerUnits(withUnitField), 'CONTRACT_INVALID');

      const withTopField = compositionInput();
      (withTopField as Record<string, unknown>)[key] = 'x';
      expectCompositionError(() => composeCareerUnits(withTopField), 'CONTRACT_INVALID');
    }
  });

  it('never echoes statement text and carries no prose fields', () => {
    const record = composeCareerUnits(compositionInput());
    const serialized = canonicalJson(record);
    expect(serialized, 'statement echo').not.toContain(STATEMENT);
    for (const forbidden of ['advice', 'recommendation', 'prediction', 'narrative']) {
      expect(serialized, forbidden).not.toContain(forbidden);
    }
    expect(Object.keys(record).sort()).toEqual([
      'contractVersion',
      'noPersistence',
      'sourcePlan',
      'status',
      'transient',
      'units',
    ]);
  });

  it('keeps the module offline, transient, and persistence-free', () => {
    const module = read('packages/orchestrator/src/career-composition.ts');
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
    expect(read('packages/orchestrator/src/index.ts')).not.toContain('career-composition');
    for (const relative of [
      'packages/orchestrator/src/engine-entry.ts',
      'skills/xuan-ji-yu-heng/scripts/loom-chart.mjs',
      'skills/xuan-ji-yu-heng/SKILL.md',
      'packages/contracts/src/index.ts',
      'packages/interpret/src/index.ts',
      'package.json',
    ]) {
      expect(read(relative), relative).not.toContain('career-composition');
    }
  });
});
