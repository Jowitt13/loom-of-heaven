import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  loadCareerReflectionAdmission,
  verifyCareerReflectionAdmission,
} from './eval/verify-career-reflection-admission.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath: string): string => readFileSync(join(root, relativePath), 'utf8');

const ADMISSION_PATH = 'evals/fixtures/synthetic/career-reflection-admission.json';

function tampered(mutate: (record: Record<string, unknown>) => void): unknown {
  const record = JSON.parse(read(ADMISSION_PATH)) as Record<string, unknown>;
  mutate(record);
  return record;
}

describe('C-4B career reflection admission and consent lifecycle', () => {
  it('ships a green, fully linked admission record', () => {
    const result = verifyCareerReflectionAdmission(loadCareerReflectionAdmission());
    expect(result.ok, JSON.stringify(result.checks.filter((check) => !check.ok))).toBe(true);
  });

  it('ships the owner-selected category with no items and no runtime readiness', () => {
    const record = loadCareerReflectionAdmission() as Record<string, unknown>;
    const admission = record.admission as Record<string, unknown>;
    expect(admission.toolId).toBe('career-reflection-cards');
    expect(admission.contentState).toBe('no-items-defined');
    expect(admission.unblocksIq4).toBe(false);
    expect(admission.runtimeReady).toBe(false);
    expect(admission.externalDependencies).toEqual([]);
    const lifecycle = record.consentLifecycle as Record<string, unknown>;
    expect(lifecycle.defaultState).toBe('not-started');
    expect(lifecycle.clinicalArtifactAdmissible).toBe(false);
  });

  it('fail-closes on classification drift', () => {
    const packet = tampered((record) => {
      const admission = record.admission as Record<string, unknown>;
      (admission.classification as Record<string, unknown>).scoreless = false;
    });
    const result = verifyCareerReflectionAdmission(packet);
    expect(result.ok).toBe(false);
    expect(result.checks.some((check) => check.name.includes('classification') && !check.ok)).toBe(
      true,
    );
  });

  it('fail-closes on content-state or tool-identity drift', () => {
    const driftedContent = tampered((record) => {
      (record.admission as Record<string, unknown>).contentState = 'items-defined';
    });
    expect(verifyCareerReflectionAdmission(driftedContent).ok).toBe(false);

    const driftedId = tampered((record) => {
      (record.admission as Record<string, unknown>).toolId = 'career-test';
    });
    expect(verifyCareerReflectionAdmission(driftedId).ok).toBe(false);
  });

  it('fail-closes on external instrument references', () => {
    const packet = tampered((record) => {
      const admission = record.admission as Record<string, unknown>;
      admission.externalDependencies = ['O*NET Interest Profiler'];
    });
    const result = verifyCareerReflectionAdmission(packet);
    expect(result.ok).toBe(false);
    expect(
      result.checks.some((check) => check.name.includes('no external instrument') && !check.ok),
    ).toBe(true);
  });

  it('fail-closes on item or content payload riding along with the admission', () => {
    const packet = tampered((record) => {
      (record.admission as Record<string, unknown>).items = [{ prompt: '合成反思题（示例占位）' }];
    });
    const result = verifyCareerReflectionAdmission(packet);
    expect(result.ok).toBe(false);
    expect(
      result.checks.some((check) => check.name.includes('no item or content payload') && !check.ok),
    ).toBe(true);
  });

  it('fail-closes when a forbidden output disappears from the recorded list', () => {
    const packet = tampered((record) => {
      const admission = record.admission as Record<string, unknown>;
      admission.forbiddenOutputs = (admission.forbiddenOutputs as string[]).filter(
        (output) => output !== 'diagnosis',
      );
    });
    const result = verifyCareerReflectionAdmission(packet);
    expect(result.ok).toBe(false);
    expect(
      result.checks.some((check) => check.name.includes('forbidden outputs') && !check.ok),
    ).toBe(true);
  });

  it('fail-closes on runtime-ready or IQ-4-unblocking claims', () => {
    const runtimeReady = tampered((record) => {
      (record.admission as Record<string, unknown>).runtimeReady = true;
    });
    expect(verifyCareerReflectionAdmission(runtimeReady).ok).toBe(false);

    const unblocks = tampered((record) => {
      (record.admission as Record<string, unknown>).unblocksIq4 = true;
    });
    expect(verifyCareerReflectionAdmission(unblocks).ok).toBe(false);
  });

  it('fail-closes on consent scope, notice, or state-machine drift', () => {
    const wrongScope = tampered((record) => {
      (record.consentLifecycle as Record<string, unknown>).consentScope = 'personality';
    });
    expect(verifyCareerReflectionAdmission(wrongScope).ok).toBe(false);

    const noNotice = tampered((record) => {
      (record.consentLifecycle as Record<string, unknown>).noticeId = 'notice';
    });
    const result = verifyCareerReflectionAdmission(noNotice);
    expect(result.ok).toBe(false);
    expect(
      result.checks.some((check) => check.name.includes('notice is versioned') && !check.ok),
    ).toBe(true);

    const illegalTransition = tampered((record) => {
      const lifecycle = record.consentLifecycle as Record<string, unknown>;
      lifecycle.allowedTransitions = [{ from: 'deleted', to: 'active', trigger: 'resurrect' }];
    });
    expect(verifyCareerReflectionAdmission(illegalTransition).ok).toBe(false);
  });

  it('fail-closes when identity, raw-answer, or clinical forbidden fields are dropped', () => {
    const packet = tampered((record) => {
      const lifecycle = record.consentLifecycle as Record<string, unknown>;
      lifecycle.forbiddenFields = (lifecycle.forbiddenFields as string[]).filter(
        (field) => field !== 'rawAnswer',
      );
    });
    const result = verifyCareerReflectionAdmission(packet);
    expect(result.ok).toBe(false);
    expect(
      result.checks.some((check) => check.name.includes('forbidden fields') && !check.ok),
    ).toBe(true);
  });

  it('fail-closes when clinical artifacts are marked admissible', () => {
    const packet = tampered((record) => {
      (record.consentLifecycle as Record<string, unknown>).clinicalArtifactAdmissible = true;
    });
    const result = verifyCareerReflectionAdmission(packet);
    expect(result.ok).toBe(false);
    expect(
      result.checks.some(
        (check) => check.name.includes('clinical artifacts are inadmissible') && !check.ok,
      ),
    ).toBe(true);
  });

  it('fail-closes on email-shaped strings anywhere in the record', () => {
    const packet = tampered((record) => {
      (record.syntheticNotice as string) = '联系 someone@example.com 获取结果';
    });
    const result = verifyCareerReflectionAdmission(packet);
    expect(result.ok).toBe(false);
    expect(
      result.checks.some((check) => check.name.includes('no email-shaped strings') && !check.ok),
    ).toBe(true);
  });

  it('keeps the admission record and verifier outside every runtime entry point', () => {
    for (const relative of [
      'packages/orchestrator/src/engine-entry.ts',
      'packages/orchestrator/src/index.ts',
      'skills/xuan-ji-yu-heng/scripts/loom-chart.mjs',
      'skills/xuan-ji-yu-heng/SKILL.md',
      'skills/psychology-self-assessment/SKILL.md',
      'packages/contracts/src/index.ts',
      'packages/interpret/src/index.ts',
      'package.json',
    ]) {
      expect(read(relative), relative).not.toContain('career-reflection-admission');
    }
  });
});
