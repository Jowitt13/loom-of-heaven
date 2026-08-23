import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BaziChartResult, canonicalJson } from '@loom/contracts';
import {
  BAZI_SHADOW_STATE_CHANGE_CAUSES,
  BAZI_SHADOW_STATE_INVALIDATION_CONTRACT_VERSION,
  planBaziShadowStateInvalidation,
} from '../src/shadow-state-invalidation.ts';
import {
  BAZI_SHADOW_STATE_NODE_IDS,
  projectBaziShadowState,
  type BaziShadowState,
} from '../src/shadow-state.ts';

const root = join(__dirname, '..', '..', '..');
const synthetic = join(root, 'evals', 'fixtures', 'synthetic');
const stateManifestPath = join(synthetic, 'p0e-shadow-state-integrity-manifest.json');
const chartPath = join(synthetic, 'p0e-bazi-shadow-chart.json');

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function state(): BaziShadowState {
  const manifest = readJson(stateManifestPath);
  const resolution = manifest.resolution as Record<string, unknown>;
  return projectBaziShadowState(BaziChartResult.parse(readJson(chartPath)), {
    stateId: String(manifest.stateId),
    resolution: {
      schemaVersion: String(resolution.schemaVersion),
      engineVersion: String(resolution.engineVersion),
      sourceProfileIds: [],
    },
  });
}

function copy(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

describe('planBaziShadowStateInvalidation (P1-A internal state changes)', () => {
  it('returns a deterministic no-op plan for an empty change set', () => {
    const first = planBaziShadowStateInvalidation(state(), []);
    const second = planBaziShadowStateInvalidation(state(), []);
    expect(first).toEqual({
      ok: true,
      plan: {
        contractVersion: BAZI_SHADOW_STATE_INVALIDATION_CONTRACT_VERSION,
        causes: [],
        stateRecordReusable: true,
        invalidatedNodeIds: [],
        retainedNodeIds: BAZI_SHADOW_STATE_NODE_IDS,
      },
      issues: [],
    });
    expect(canonicalJson(second)).toBe(canonicalJson(first));
  });

  it.each(['input-chart', 'settings', 'engine-provider', 'ruleset', 'source-profile'] as const)(
    'invalidates every P0-B node for the chart-affecting cause %s',
    (cause) => {
      const result = planBaziShadowStateInvalidation(state(), [cause]);
      expect(result).toMatchObject({
        ok: true,
        issues: [],
        plan: {
          causes: [cause],
          stateRecordReusable: false,
          invalidatedNodeIds: BAZI_SHADOW_STATE_NODE_IDS,
          retainedNodeIds: [],
        },
      });
    },
  );

  it.each(['topic-lens', 'language-narrator'] as const)(
    'keeps every structural node reusable for the projection-only cause %s',
    (cause) => {
      const result = planBaziShadowStateInvalidation(state(), [cause]);
      expect(result).toMatchObject({
        ok: true,
        issues: [],
        plan: {
          causes: [cause],
          stateRecordReusable: true,
          invalidatedNodeIds: [],
          retainedNodeIds: BAZI_SHADOW_STATE_NODE_IDS,
        },
      });
    },
  );

  it('deduplicates and canonicalizes mixed causes without losing a structural invalidation', () => {
    const result = planBaziShadowStateInvalidation(state(), [
      'language-narrator',
      'ruleset',
      'ruleset',
      'topic-lens',
    ]);
    expect(result).toMatchObject({
      ok: true,
      issues: [],
      plan: {
        causes: ['ruleset', 'topic-lens', 'language-narrator'],
        stateRecordReusable: false,
        invalidatedNodeIds: BAZI_SHADOW_STATE_NODE_IDS,
        retainedNodeIds: [],
      },
    });
  });

  it('rejects an invalid cause set without manufacturing a partial plan', () => {
    expect(planBaziShadowStateInvalidation(state(), 'ruleset')).toEqual({
      ok: false,
      plan: null,
      issues: [{ code: 'CAUSE_SET', path: '$.causes' }],
    });
    expect(planBaziShadowStateInvalidation(state(), ['ruleset', 'unknown-cause'])).toEqual({
      ok: false,
      plan: null,
      issues: [{ code: 'CAUSE_SET', path: '$.causes[1]' }],
    });
  });

  it('rejects an invalid P0-B state and does not inspect it as a valid transition', () => {
    const altered = copy(state());
    (altered.resolution as Record<string, unknown>).sourceProfileIds = ['not-admitted'];
    expect(planBaziShadowStateInvalidation(altered, ['source-profile'])).toEqual({
      ok: false,
      plan: null,
      issues: [{ code: 'STATE_INVALID', path: '$.state' }],
    });
  });

  it('does not mutate the input state or encode a rule, verdict, or narrator in the plan', () => {
    const source = state();
    const before = canonicalJson(source);
    const result = planBaziShadowStateInvalidation(source, ['topic-lens']);
    expect(result.ok).toBe(true);
    expect(canonicalJson(source)).toBe(before);
    const serialized = canonicalJson(result).toLowerCase();
    for (const forbidden of [
      'rule-judgment',
      'school-judgment',
      'answer-claim',
      'polarity',
      'strong',
      'weak',
      'auspicious',
      'narrator',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('remains internal and does not add a package export, interpreter wiring, CLI, or network call', () => {
    const read = (relative: string): string => readFileSync(join(root, relative), 'utf8');
    const tool = read('packages/bazi-rules/src/shadow-state-invalidation.ts');
    for (const relative of [
      'packages/bazi-rules/src/index.ts',
      'packages/interpret/src/index.ts',
      'packages/interpret/src/build.ts',
      'packages/contracts/src/index.ts',
      'skills/xuan-ji-yu-heng/scripts/loom-chart.mjs',
    ]) {
      expect(read(relative)).not.toContain('shadow-state-invalidation');
    }
    for (const forbidden of ['fetch(', 'https://', 'child_process', 'openai']) {
      expect(tool).not.toContain(forbidden);
    }
  });

  it('keeps the complete change-cause vocabulary frozen and ordered', () => {
    expect(BAZI_SHADOW_STATE_CHANGE_CAUSES).toEqual([
      'input-chart',
      'settings',
      'engine-provider',
      'ruleset',
      'source-profile',
      'topic-lens',
      'language-narrator',
    ]);
  });
});
