import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  loadCareerReflectionAdmissionFixture,
  loadGovernanceFixture,
  verifyCareerReflectionCardGovernance,
} from './eval/verify-career-reflection-card-governance.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath: string): string => readFileSync(join(root, relativePath), 'utf8');

const GOVERNANCE_PATH = 'evals/fixtures/synthetic/career-reflection-card-governance.json';
const ADMISSION_PATH = 'evals/fixtures/synthetic/career-reflection-admission.json';

function governanceCopy(mutate: (record: Record<string, unknown>) => void): unknown {
  const record = JSON.parse(read(GOVERNANCE_PATH)) as Record<string, unknown>;
  mutate(record);
  return record;
}

function admissionCopy(mutate: (record: Record<string, unknown>) => void): unknown {
  const record = JSON.parse(read(ADMISSION_PATH)) as Record<string, unknown>;
  mutate(record);
  return record;
}

function firstFailing(
  result: { checks: Array<{ name: string; ok: boolean }> },
  namePart: string,
): boolean {
  return result.checks.some((check) => check.name.includes(namePart) && !check.ok);
}

describe('C-4C card content governance', () => {
  it('accepts the committed governance fixture deterministically', () => {
    const governance = loadGovernanceFixture();
    const admission = loadCareerReflectionAdmissionFixture();
    const first = verifyCareerReflectionCardGovernance(governance, admission);
    const second = verifyCareerReflectionCardGovernance(governance, admission);
    expect(first.ok, JSON.stringify(first.checks.filter((check) => !check.ok))).toBe(true);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('fail-closes on governance identity, tool, or classification drift', () => {
    const driftedId = governanceCopy((record) => {
      record.governanceId = 'career-reflection-card-governance/v2';
    });
    expect(
      verifyCareerReflectionCardGovernance(driftedId, loadCareerReflectionAdmissionFixture()).ok,
    ).toBe(false);

    const driftedTool = governanceCopy((record) => {
      const binding = record.admissionBinding as Record<string, unknown>;
      binding.toolId = 'career-test';
    });
    expect(
      verifyCareerReflectionCardGovernance(driftedTool, loadCareerReflectionAdmissionFixture()).ok,
    ).toBe(false);

    const driftedClassification = governanceCopy((record) => {
      const binding = record.admissionBinding as Record<string, unknown>;
      (binding.classification as Record<string, unknown>).nonClinical = false;
    });
    expect(
      verifyCareerReflectionCardGovernance(
        driftedClassification,
        loadCareerReflectionAdmissionFixture(),
      ).ok,
    ).toBe(false);
  });

  it('fail-closes on archetype drift: missing, reordered, duplicated, or unknown', () => {
    const reordered = governanceCopy((record) => {
      const archetypes = record.archetypes as unknown[];
      archetypes.push(archetypes.shift());
    });
    expect(
      verifyCareerReflectionCardGovernance(reordered, loadCareerReflectionAdmissionFixture()).ok,
    ).toBe(false);

    const duplicated = governanceCopy((record) => {
      const archetypes = record.archetypes as Array<Record<string, unknown>>;
      archetypes[1] = { ...archetypes[0]! };
    });
    expect(
      verifyCareerReflectionCardGovernance(duplicated, loadCareerReflectionAdmissionFixture()).ok,
    ).toBe(false);

    const unknown = governanceCopy((record) => {
      const archetypes = record.archetypes as Array<Record<string, unknown>>;
      archetypes[2] = { ...archetypes[2]!, archetypeId: 'career-matching' };
    });
    expect(
      verifyCareerReflectionCardGovernance(unknown, loadCareerReflectionAdmissionFixture()).ok,
    ).toBe(false);

    const missing = governanceCopy((record) => {
      record.archetypes = (record.archetypes as unknown[]).slice(0, 5);
    });
    expect(
      verifyCareerReflectionCardGovernance(missing, loadCareerReflectionAdmissionFixture()).ok,
    ).toBe(false);
  });

  it('fail-closes on score, match, label, recommendation, clinical, or bazi payload injection', () => {
    for (const key of [
      'score',
      'matchPercentage',
      'personalityProfile',
      'occupationRecommendation',
      'clinicalScreen',
      'baziDerived',
      'prediction',
    ]) {
      const packet = governanceCopy((record) => {
        const archetypes = record.archetypes as Array<Record<string, unknown>>;
        archetypes[0] = { ...archetypes[0]!, [key]: { value: 42 } };
      });
      expect(
        verifyCareerReflectionCardGovernance(packet, loadCareerReflectionAdmissionFixture()).ok,
        key,
      ).toBe(false);
    }
  });

  it('fail-closes on text or item payloads riding along with archetypes', () => {
    const packet = governanceCopy((record) => {
      const archetypes = record.archetypes as Array<Record<string, unknown>>;
      archetypes[0] = {
        ...archetypes[0]!,
        questionText: '合成反思题（占位，不属于本规格）。',
      };
    });
    const result = verifyCareerReflectionCardGovernance(
      packet,
      loadCareerReflectionAdmissionFixture(),
    );
    expect(result.ok).toBe(false);
    expect(firstFailing(result, 'no text, item, advice, inference')).toBe(true);
  });

  it('keeps action-experiment prompts user-proposing only', () => {
    const packet = governanceCopy((record) => {
      const archetypes = record.archetypes as Array<Record<string, unknown>>;
      archetypes[4] = {
        ...archetypes[4]!,
        allowedPromptActs: ['system-recommended-action'],
      };
    });
    expect(
      verifyCareerReflectionCardGovernance(packet, loadCareerReflectionAdmissionFixture()).ok,
    ).toBe(false);
  });

  it('fail-closes when the underlying C-4B admission drifts toward items, runtime, or IQ-4 unblock', () => {
    const itemsDefined = admissionCopy((record) => {
      (record.admission as Record<string, unknown>).contentState = 'items-defined';
    });
    expect(verifyCareerReflectionCardGovernance(loadGovernanceFixture(), itemsDefined).ok).toBe(
      false,
    );

    const runtimeReady = admissionCopy((record) => {
      (record.admission as Record<string, unknown>).runtimeReady = true;
    });
    expect(verifyCareerReflectionCardGovernance(loadGovernanceFixture(), runtimeReady).ok).toBe(
      false,
    );

    const unblocked = admissionCopy((record) => {
      (record.admission as Record<string, unknown>).unblocksIq4 = true;
    });
    expect(verifyCareerReflectionCardGovernance(loadGovernanceFixture(), unblocked).ok).toBe(false);
  });

  it('keeps consent delegated to the C-4B lifecycle and unimplemented', () => {
    const packet = governanceCopy((record) => {
      record.consent = {
        governedBy: 'career-reflection-consent-lifecycle/v1',
        scope: 'career-reflection',
        implemented: true,
      };
    });
    const result = verifyCareerReflectionCardGovernance(
      packet,
      loadCareerReflectionAdmissionFixture(),
    );
    expect(result.ok).toBe(false);
    expect(firstFailing(result, 'consent remains delegated')).toBe(true);
  });

  it('fail-closes when card governance claims C-1/C-2 integration', () => {
    const packet = governanceCopy((record) => {
      record.composition = { consumesC1Plans: true, integratedWithC2: true };
    });
    const result = verifyCareerReflectionCardGovernance(
      packet,
      loadCareerReflectionAdmissionFixture(),
    );
    expect(result.ok).toBe(false);
    expect(firstFailing(result, 'not integrated with C-1 plans')).toBe(true);
  });

  it('keeps the governance schema, fixture, and verifier outside runtime surfaces', () => {
    for (const relative of [
      'packages/orchestrator/src/engine-entry.ts',
      'packages/orchestrator/src/index.ts',
      'skills/xuan-ji-yu-heng/scripts/loom-chart.mjs',
      'skills/xuan-ji-yu-heng/SKILL.md',
      'packages/contracts/src/index.ts',
      'packages/interpret/src/index.ts',
      'package.json',
    ]) {
      expect(read(relative), relative).not.toContain('career-reflection-card-governance');
    }
  });

  it('documents the frozen governance without claiming implementation', () => {
    const policy = read('docs/CAREER_REFLECTION_ADMISSION.md');
    expect(policy).toContain('no-items-defined');
    expect(policy).toContain('C-4C');
    const roadmap = read('docs/PRODUCT_TECHNICAL_ROADMAP.md');
    expect(roadmap).toContain('C-4C');
    expect(roadmap).toContain('C-4D');
  });
});
