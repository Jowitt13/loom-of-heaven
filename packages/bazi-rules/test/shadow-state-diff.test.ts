import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BaziChartResult, canonicalJson } from '@loom/contracts';
import {
  BAZI_SHADOW_STATE_DIFF_CONTRACT_VERSION,
  diffBaziShadowStates,
} from '../src/shadow-state-diff.ts';
import {
  BAZI_SHADOW_STATE_NODE_IDS,
  projectBaziShadowState,
  type BaziShadowState,
} from '../src/shadow-state.ts';

const root = join(__dirname, '..', '..', '..');
const synthetic = join(root, 'evals', 'fixtures', 'synthetic');
const chartPath = join(synthetic, 'p0e-bazi-shadow-chart.json');
const stateManifestPath = join(synthetic, 'p0e-shadow-state-integrity-manifest.json');

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function state(
  options: { stateId?: string; engineVersion?: string; altered?: boolean } = {},
): BaziShadowState {
  const chart = readJson(chartPath);
  if (options.altered) {
    const pillars = chart.pillars as Record<string, Record<string, unknown>>;
    const hiddenStems = pillars.month!.hiddenStems as Array<Record<string, unknown>>;
    hiddenStems[0]!.primary = false;
  }
  const manifest = readJson(stateManifestPath);
  const resolution = manifest.resolution as Record<string, unknown>;
  return projectBaziShadowState(BaziChartResult.parse(chart), {
    stateId: options.stateId ?? String(manifest.stateId),
    resolution: {
      schemaVersion: String(resolution.schemaVersion),
      engineVersion: options.engineVersion ?? String(resolution.engineVersion),
      sourceProfileIds: [],
    },
  });
}

describe('diffBaziShadowStates (P1-B internal structural comparison)', () => {
  it('returns a deterministic empty diff for identical verified projections', () => {
    const first = diffBaziShadowStates(state(), state());
    const second = diffBaziShadowStates(state(), state());
    expect(first).toEqual({
      ok: true,
      diff: {
        contractVersion: BAZI_SHADOW_STATE_DIFF_CONTRACT_VERSION,
        stateRecordEqual: true,
        changedResolutionPaths: [],
        changedNodeIds: [],
        unchangedNodeIds: BAZI_SHADOW_STATE_NODE_IDS,
        changedNodePaths: [],
      },
      issues: [],
    });
    expect(canonicalJson(second)).toBe(canonicalJson(first));
  });

  it('ignores caller-provided opaque state identity', () => {
    const result = diffBaziShadowStates(
      state({ stateId: 'opaque-synthetic-left' }),
      state({ stateId: 'opaque-synthetic-right' }),
    );
    expect(result).toMatchObject({ ok: true, diff: { stateRecordEqual: true } });
    expect(canonicalJson(result)).not.toContain('opaque-synthetic');
  });

  it('reports a resolution version path without changing any collector node', () => {
    const result = diffBaziShadowStates(state(), state({ engineVersion: 'synthetic-engine/v2' }));
    expect(result).toEqual({
      ok: true,
      diff: {
        contractVersion: BAZI_SHADOW_STATE_DIFF_CONTRACT_VERSION,
        stateRecordEqual: false,
        changedResolutionPaths: ['resolution.engineVersion'],
        changedNodeIds: [],
        unchangedNodeIds: BAZI_SHADOW_STATE_NODE_IDS,
        changedNodePaths: [],
      },
      issues: [],
    });
  });

  it('reports only changed collector paths for a recomputed synthetic chart', () => {
    const result = diffBaziShadowStates(state(), state({ altered: true }));
    expect(result.ok).toBe(true);
    expect(result.diff).not.toBeNull();
    expect(result.diff!.stateRecordEqual).toBe(false);
    expect(result.diff!.changedNodeIds).toEqual([
      'bazi.shadow.direct-roots',
      'bazi.shadow.strength-inputs',
      'bazi.shadow.pattern-inputs',
    ]);
    expect(result.diff!.unchangedNodeIds).toEqual(['bazi.shadow.relation-geometry']);
    expect(result.diff!.changedNodePaths).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'bazi.shadow.direct-roots',
          changedPaths: expect.arrayContaining(['value.candidates[0].providerPrimary']),
        }),
        expect.objectContaining({
          nodeId: 'bazi.shadow.strength-inputs',
          changedPaths: expect.arrayContaining(['value.directRoots.candidates[0].providerPrimary']),
        }),
      ]),
    );
  });

  it.each([
    [
      'left',
      (left: Record<string, unknown>, _right: Record<string, unknown>) => {
        (left.resolution as Record<string, unknown>).sourceProfileIds = ['not-admitted'];
      },
    ],
    [
      'right',
      (_left: Record<string, unknown>, right: Record<string, unknown>) => {
        (right.resolution as Record<string, unknown>).sourceProfileIds = ['not-admitted'];
      },
    ],
  ] as const)('rejects an invalid %s state without emitting a partial diff', (_side, alter) => {
    const left = copy(state()) as unknown as Record<string, unknown>;
    const right = copy(state()) as unknown as Record<string, unknown>;
    alter(left, right);
    expect(diffBaziShadowStates(left, right)).toEqual({
      ok: false,
      diff: null,
      issues: [
        {
          code: _side === 'left' ? 'LEFT_STATE_INVALID' : 'RIGHT_STATE_INVALID',
          path: _side === 'left' ? '$.left' : '$.right',
        },
      ],
    });
  });

  it('reports both invalid inputs in a stable side order', () => {
    const left = copy(state()) as unknown as Record<string, unknown>;
    const right = copy(state()) as unknown as Record<string, unknown>;
    (left.resolution as Record<string, unknown>).sourceProfileIds = ['not-admitted'];
    (right.resolution as Record<string, unknown>).sourceProfileIds = ['not-admitted'];
    expect(diffBaziShadowStates(left, right)).toEqual({
      ok: false,
      diff: null,
      issues: [
        { code: 'LEFT_STATE_INVALID', path: '$.left' },
        { code: 'RIGHT_STATE_INVALID', path: '$.right' },
      ],
    });
  });

  it('does not mutate inputs or return values from either record', () => {
    const left = state({ stateId: 'opaque-left' });
    const right = state({ stateId: 'opaque-right', altered: true });
    const before = canonicalJson({ left, right });
    const result = diffBaziShadowStates(left, right);
    expect(canonicalJson({ left, right })).toBe(before);
    const serialized = canonicalJson(result).toLowerCase();
    for (const forbidden of [
      'opaque-left',
      'opaque-right',
      'rule-judgment',
      'answer-claim',
      'polarity',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('remains internal and adds no export, runtime wiring, CLI path, or network call', () => {
    const read = (relative: string): string => readFileSync(join(root, relative), 'utf8');
    const tool = read('packages/bazi-rules/src/shadow-state-diff.ts');
    for (const relative of [
      'packages/bazi-rules/src/index.ts',
      'packages/interpret/src/index.ts',
      'packages/interpret/src/build.ts',
      'packages/contracts/src/index.ts',
      'skills/xuan-ji-yu-heng/scripts/loom-chart.mjs',
    ]) {
      expect(read(relative)).not.toContain('shadow-state-diff');
    }
    for (const forbidden of ['fetch(', 'https://', 'child_process', 'openai']) {
      expect(tool).not.toContain(forbidden);
    }
  });
});
