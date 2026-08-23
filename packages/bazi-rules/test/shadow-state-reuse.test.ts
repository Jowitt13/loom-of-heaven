import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BaziChartResult, canonicalJson } from '@loom/contracts';
import {
  BAZI_SHADOW_STATE_REUSE_CONTRACT_VERSION,
  decideBaziShadowStateReuse,
} from '../src/shadow-state-reuse.ts';
import { BAZI_SHADOW_STATE_NODE_IDS, projectBaziShadowState } from '../src/shadow-state.ts';

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

function state(options: { stateId?: string; engineVersion?: string; altered?: boolean } = {}) {
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

describe('decideBaziShadowStateReuse (P1-C internal coordination)', () => {
  it('allows reuse only for equal verified states with no structural cause', () => {
    const first = decideBaziShadowStateReuse(state(), state(), []);
    const second = decideBaziShadowStateReuse(state(), state(), []);
    expect(first).toEqual({
      ok: true,
      decision: {
        contractVersion: BAZI_SHADOW_STATE_REUSE_CONTRACT_VERSION,
        stateRecordReusable: true,
        projectionRefreshRequired: false,
        recomputeReasons: [],
        invalidatedNodeIds: [],
        changedResolutionPaths: [],
        changedNodeIds: [],
      },
      issues: [],
    });
    expect(canonicalJson(second)).toBe(canonicalJson(first));
  });

  it.each(['topic-lens', 'language-narrator'] as const)(
    'retains equal structural state but requests a later projection refresh for %s',
    (cause) => {
      expect(decideBaziShadowStateReuse(state(), state(), [cause])).toMatchObject({
        ok: true,
        decision: {
          stateRecordReusable: true,
          projectionRefreshRequired: true,
          recomputeReasons: [],
          invalidatedNodeIds: [],
        },
      });
    },
  );

  it('requires a fresh projection for a declared chart-affecting cause even when values compare equal', () => {
    expect(decideBaziShadowStateReuse(state(), state(), ['ruleset'])).toEqual({
      ok: true,
      decision: {
        contractVersion: BAZI_SHADOW_STATE_REUSE_CONTRACT_VERSION,
        stateRecordReusable: false,
        projectionRefreshRequired: false,
        recomputeReasons: ['invalidation-plan'],
        invalidatedNodeIds: BAZI_SHADOW_STATE_NODE_IDS,
        changedResolutionPaths: [],
        changedNodeIds: [],
      },
      issues: [],
    });
  });

  it('refuses reuse when a structural difference is observed without a declared cause', () => {
    const result = decideBaziShadowStateReuse(state(), state({ altered: true }), []);
    expect(result).toMatchObject({
      ok: true,
      decision: {
        stateRecordReusable: false,
        projectionRefreshRequired: false,
        recomputeReasons: ['observed-diff'],
        invalidatedNodeIds: [],
        changedNodeIds: [
          'bazi.shadow.direct-roots',
          'bazi.shadow.strength-inputs',
          'bazi.shadow.pattern-inputs',
        ],
      },
    });
  });

  it('preserves the fixed reason order when plan and comparison both require recomputation', () => {
    const result = decideBaziShadowStateReuse(state(), state({ altered: true }), ['settings']);
    expect(result).toMatchObject({
      ok: true,
      decision: {
        stateRecordReusable: false,
        recomputeReasons: ['invalidation-plan', 'observed-diff'],
        invalidatedNodeIds: BAZI_SHADOW_STATE_NODE_IDS,
      },
    });
  });

  it('treats a changed resolution as an observed difference even when collectors match', () => {
    expect(
      decideBaziShadowStateReuse(state(), state({ engineVersion: 'synthetic-engine/v2' }), []),
    ).toMatchObject({
      ok: true,
      decision: {
        stateRecordReusable: false,
        recomputeReasons: ['observed-diff'],
        changedResolutionPaths: ['resolution.engineVersion'],
        changedNodeIds: [],
      },
    });
  });

  it('rejects invalid typed causes without creating a partial decision', () => {
    expect(decideBaziShadowStateReuse(state(), state(), ['not-a-cause'])).toEqual({
      ok: false,
      decision: null,
      issues: [{ code: 'INVALIDATION_PLAN_INVALID', path: '$.plan$.causes[0]' }],
    });
  });

  it('rejects an invalid comparison input without creating a partial decision', () => {
    const right = copy(state()) as unknown as Record<string, unknown>;
    (right.resolution as Record<string, unknown>).sourceProfileIds = ['not-admitted'];
    expect(decideBaziShadowStateReuse(state(), right, [])).toEqual({
      ok: false,
      decision: null,
      issues: [{ code: 'STATE_DIFF_INVALID', path: '$.diff$.right' }],
    });
  });

  it('does not mutate inputs or return either opaque identity or raw collector values', () => {
    const left = state({ stateId: 'opaque-left' });
    const right = state({ stateId: 'opaque-right', altered: true });
    const before = canonicalJson({ left, right });
    const result = decideBaziShadowStateReuse(left, right, ['topic-lens']);
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

  it('remains internal and has no package export, runtime wiring, CLI path, or network call', () => {
    const read = (relative: string): string => readFileSync(join(root, relative), 'utf8');
    const tool = read('packages/bazi-rules/src/shadow-state-reuse.ts');
    for (const relative of [
      'packages/bazi-rules/src/index.ts',
      'packages/interpret/src/index.ts',
      'packages/interpret/src/build.ts',
      'packages/contracts/src/index.ts',
      'skills/xuan-ji-yu-heng/scripts/loom-chart.mjs',
    ]) {
      expect(read(relative)).not.toContain('shadow-state-reuse');
    }
    for (const forbidden of ['fetch(', 'https://', 'child_process', 'openai']) {
      expect(tool).not.toContain(forbidden);
    }
  });
});
