import type { BaziChartResult } from '@loom/contracts';
import { collectPatternInputs, type PatternInputs } from './pattern-inputs.ts';
import { collectRelationGeometry, type RelationGeometryEvidence } from './relation-geometry.ts';
import { collectDirectRootEvidence, type DirectRootEvidence } from './root-state.ts';
import { collectStrengthInputs, type StructuredStrengthInputs } from './strength-inputs.ts';

/**
 * P0-B internal-only projection of the D1/D2 BaZi shadow collectors.
 *
 * This is a transient, regenerable engineering record. It is deliberately not
 * exported from the package entry point and is not wired into interpretation,
 * public contracts, the CLI, or user-visible prose. It records derived
 * structure only; it does not activate a rule, resolve a school dispute, or
 * produce an answer claim.
 */

export const BAZI_SHADOW_STATE_CONTRACT_VERSION = 'bazi-shadow-state/p0b';

export type ShadowStateInvalidationCause =
  'input-chart' | 'settings' | 'engine-provider' | 'ruleset' | 'source-profile';

/** Internal fixed stage ids; this is a declared table, not a dynamic DAG. */
export const BAZI_SHADOW_STATE_NODE_IDS = [
  'bazi.shadow.direct-roots',
  'bazi.shadow.relation-geometry',
  'bazi.shadow.strength-inputs',
  'bazi.shadow.pattern-inputs',
] as const;

export type BaziShadowStateNodeId = (typeof BAZI_SHADOW_STATE_NODE_IDS)[number];

/** Every P0-B shadow structure is stale under the same chart-affecting changes. */
export const BAZI_SHADOW_STATE_INVALIDATIONS: readonly ShadowStateInvalidationCause[] = [
  'input-chart',
  'settings',
  'engine-provider',
  'ruleset',
  'source-profile',
];

/** Fixed upstream references for the four known shadow stages. */
export const BAZI_SHADOW_STATE_DEPENDENCIES: Readonly<
  Record<BaziShadowStateNodeId, readonly string[]>
> = {
  'bazi.shadow.direct-roots': ['chart.bazi'],
  'bazi.shadow.relation-geometry': ['chart.bazi'],
  'bazi.shadow.strength-inputs': ['chart.bazi', 'bazi.shadow.direct-roots'],
  'bazi.shadow.pattern-inputs': ['chart.bazi', 'bazi.shadow.relation-geometry'],
};

type ShadowNodeBase<Id extends string, Value> = {
  id: Id;
  layer: 'derived-structure';
  /** Stable state-local ids of already-computed inputs, never a scheduler. */
  dependsOn: readonly string[];
  /** Typed changes that make this projection stale. */
  invalidatedBy: readonly ShadowStateInvalidationCause[];
  value: Value;
};

export type BaziShadowStateNode =
  | ShadowNodeBase<'bazi.shadow.direct-roots', DirectRootEvidence>
  | ShadowNodeBase<'bazi.shadow.relation-geometry', RelationGeometryEvidence>
  | ShadowNodeBase<'bazi.shadow.strength-inputs', StructuredStrengthInputs>
  | ShadowNodeBase<'bazi.shadow.pattern-inputs', PatternInputs>;

export interface BaziShadowStateOptions {
  /** Opaque caller-provided state identity; never derive it from birth data here. */
  stateId: string;
  /** Versions needed to regenerate the same projection; no birth-input fields. */
  resolution: {
    schemaVersion: string;
    engineVersion: string;
    /** Empty until a separately admitted source profile is actually in use. */
    sourceProfileIds: readonly string[];
  };
}

export interface BaziShadowState {
  contractVersion: typeof BAZI_SHADOW_STATE_CONTRACT_VERSION;
  stateId: string;
  resolution: BaziShadowStateOptions['resolution'];
  nodes: readonly BaziShadowStateNode[];
}

/**
 * Project existing D1/D2 shadow collectors into one internal state record.
 *
 * The collector values remain unmodified. In particular, `matched` candidates
 * in D2 only mean that an evidence condition matched; they never become a
 * rule judgment, school judgment, verdict, or narratable conclusion here.
 */
export function projectBaziShadowState(
  bazi: BaziChartResult,
  options: BaziShadowStateOptions,
): BaziShadowState {
  const directRoots = collectDirectRootEvidence(bazi);
  const relationGeometry = collectRelationGeometry(bazi);
  const strengthInputs = collectStrengthInputs(bazi);
  const patternInputs = collectPatternInputs(bazi);

  return {
    contractVersion: BAZI_SHADOW_STATE_CONTRACT_VERSION,
    stateId: options.stateId,
    resolution: {
      schemaVersion: options.resolution.schemaVersion,
      engineVersion: options.resolution.engineVersion,
      sourceProfileIds: [...options.resolution.sourceProfileIds],
    },
    nodes: [
      {
        id: 'bazi.shadow.direct-roots',
        layer: 'derived-structure',
        dependsOn: BAZI_SHADOW_STATE_DEPENDENCIES['bazi.shadow.direct-roots'],
        invalidatedBy: BAZI_SHADOW_STATE_INVALIDATIONS,
        value: directRoots,
      },
      {
        id: 'bazi.shadow.relation-geometry',
        layer: 'derived-structure',
        dependsOn: BAZI_SHADOW_STATE_DEPENDENCIES['bazi.shadow.relation-geometry'],
        invalidatedBy: BAZI_SHADOW_STATE_INVALIDATIONS,
        value: relationGeometry,
      },
      {
        id: 'bazi.shadow.strength-inputs',
        layer: 'derived-structure',
        dependsOn: BAZI_SHADOW_STATE_DEPENDENCIES['bazi.shadow.strength-inputs'],
        invalidatedBy: BAZI_SHADOW_STATE_INVALIDATIONS,
        value: strengthInputs,
      },
      {
        id: 'bazi.shadow.pattern-inputs',
        layer: 'derived-structure',
        dependsOn: BAZI_SHADOW_STATE_DEPENDENCIES['bazi.shadow.pattern-inputs'],
        invalidatedBy: BAZI_SHADOW_STATE_INVALIDATIONS,
        value: patternInputs,
      },
    ],
  };
}
