import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BaziChartResult, BaziHiddenStem, BaziPillar } from '@loom/contracts';
import { canonicalJson } from '@loom/contracts';
import { collectPatternInputs } from '../src/pattern-inputs.ts';
import { collectRelationGeometry } from '../src/relation-geometry.ts';
import { collectDirectRootEvidence } from '../src/root-state.ts';
import { BAZI_SHADOW_STATE_CONTRACT_VERSION, projectBaziShadowState } from '../src/shadow-state.ts';
import { collectStrengthInputs } from '../src/strength-inputs.ts';

// Synthetic technical fixture only. It is not a real person's birth record,
// place, name, life event, or derived from any user input.
const STEM_ELEMENT: Record<string, string> = {
  甲: '木',
  丙: '火',
  丁: '火',
  戊: '土',
  己: '土',
  庚: '金',
  壬: '水',
  癸: '水',
};

// Synthetic technical fixture only.
const BRANCH_ELEMENT: Record<string, string> = {
  午: '火',
  寅: '木',
  申: '金',
};

function pillar(
  stem: string,
  branch: string,
  tenGod: string | null,
  hiddenStems: BaziHiddenStem[],
): BaziPillar {
  return {
    stem,
    branch,
    stemElement: STEM_ELEMENT[stem]!,
    branchElement: BRANCH_ELEMENT[branch]!,
    stemYinYang:
      stem === '甲' || stem === '丙' || stem === '戊' || stem === '庚' || stem === '壬'
        ? '阳'
        : '阴',
    naYin: 'synthetic-technical',
    tenGod,
    tenGodDisplay: tenGod ?? '日主(日元)',
    hiddenStems,
  };
}

function makeChart(): BaziChartResult {
  return {
    rulesetId: 'bazi-standard@0.1.0',
    provider: { id: 'synthetic-provider', version: '0.0.0-test', license: 'MIT' },
    solarTimeApplied: 'civil',
    dayBoundaryApplied: 'synthetic-technical',
    dayMaster: { stem: '甲', element: '木', yinYang: '阳' },
    pillars: {
      year: pillar('庚', '午', '七杀', [
        { stem: '丁', element: '火', tenGod: '伤官', primary: true },
        { stem: '己', element: '土', tenGod: '正财', primary: false },
      ]),
      month: pillar('丙', '寅', '食神', [
        { stem: '甲', element: '木', tenGod: '比肩', primary: true },
        { stem: '丙', element: '火', tenGod: '食神', primary: false },
        { stem: '戊', element: '土', tenGod: '偏财', primary: false },
      ]),
      day: pillar('甲', '申', null, [
        { stem: '庚', element: '金', tenGod: '七杀', primary: true },
        { stem: '壬', element: '水', tenGod: '偏印', primary: false },
        { stem: '戊', element: '土', tenGod: '偏财', primary: false },
      ]),
      hour: null,
    },
    luckCycle: null,
  };
}

function project() {
  return projectBaziShadowState(makeChart(), {
    stateId: 'opaque-synthetic-state-001',
    resolution: {
      schemaVersion: 'synthetic-schema/v1',
      engineVersion: 'synthetic-engine/v1',
      sourceProfileIds: [],
    },
  });
}

describe('projectBaziShadowState (P0-B internal shadow projection)', () => {
  it('projects the four existing D1/D2 collectors without changing their values', () => {
    const chart = makeChart();
    const state = projectBaziShadowState(chart, {
      stateId: 'opaque-synthetic-state-001',
      resolution: {
        schemaVersion: 'synthetic-schema/v1',
        engineVersion: 'synthetic-engine/v1',
        sourceProfileIds: [],
      },
    });

    expect(state.contractVersion).toBe(BAZI_SHADOW_STATE_CONTRACT_VERSION);
    expect(state.nodes.map((node) => node.id)).toEqual([
      'bazi.shadow.direct-roots',
      'bazi.shadow.relation-geometry',
      'bazi.shadow.strength-inputs',
      'bazi.shadow.pattern-inputs',
    ]);
    expect(state.nodes[0]!.value).toEqual(collectDirectRootEvidence(chart));
    expect(state.nodes[1]!.value).toEqual(collectRelationGeometry(chart));
    expect(state.nodes[2]!.value).toEqual(collectStrengthInputs(chart));
    expect(state.nodes[3]!.value).toEqual(collectPatternInputs(chart));
  });

  it('is byte-identical for identical synthetic inputs and explicit state options', () => {
    expect(canonicalJson(project())).toBe(canonicalJson(project()));
    expect(canonicalJson(project())).toBe(canonicalJson(project()));
  });

  it('records only declared structure dependencies and typed invalidation causes', () => {
    const state = project();
    expect(state.nodes.map((node) => node.dependsOn)).toEqual([
      ['chart.bazi'],
      ['chart.bazi'],
      ['chart.bazi', 'bazi.shadow.direct-roots'],
      ['chart.bazi', 'bazi.shadow.relation-geometry'],
    ]);
    for (const node of state.nodes) {
      expect(node.layer).toBe('derived-structure');
      expect(node.invalidatedBy).toEqual([
        'input-chart',
        'settings',
        'engine-provider',
        'ruleset',
        'source-profile',
      ]);
    }
  });

  it('preserves unknown-hour omission rather than manufacturing an hour fact', () => {
    const state = project();
    for (const node of state.nodes) {
      const value = node.value as { omittedPillars?: readonly string[] };
      expect(value.omittedPillars).toEqual(['hour']);
    }
    expect(canonicalJson(state)).not.toContain('bazi.pillars.hour');
  });

  it('keeps D2 candidate states evidence-only rather than upgrading them to judgments', () => {
    const patternNode = project().nodes[3]!;
    const pattern = patternNode.value as ReturnType<typeof collectPatternInputs>;
    expect(pattern.monthCommand.namingCandidate.finalization).toBe('evidence-only');
    expect(pattern.jianLu.finalization).toBe('evidence-only');
    expect(pattern.yangRen.finalization).toBe('evidence-only');
    expect(pattern.miscQi.candidate.finalization).toBe('evidence-only');

    const serialized = canonicalJson(project());
    for (const forbidden of ['rule-judgment', 'school-judgment', 'answer-claim', 'polarity']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('contains no original birth input, real-world location, request id, or timestamp fields', () => {
    const serialized = canonicalJson(project());
    for (const forbidden of [
      'originalInput',
      'localDate',
      'localTime',
      'timezone',
      'location',
      'latitude',
      'longitude',
      'requestId',
      'calculatedAt',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('copies only caller-provided resolution metadata and does not claim an integrity hash', () => {
    const state = project();
    expect(state.resolution).toEqual({
      schemaVersion: 'synthetic-schema/v1',
      engineVersion: 'synthetic-engine/v1',
      sourceProfileIds: [],
    });
    expect(canonicalJson(state).toLowerCase()).not.toContain('sha-256');
    expect(canonicalJson(state).toLowerCase()).not.toContain('integrity');
  });

  it('remains internal: neither package entry point nor interpretation build imports it', () => {
    const baziRulesSrc = join(__dirname, '..', 'src');
    const interpretSrc = join(__dirname, '..', '..', 'interpret', 'src');
    expect(readFileSync(join(baziRulesSrc, 'index.ts'), 'utf8')).not.toContain('shadow-state');
    expect(readFileSync(join(interpretSrc, 'index.ts'), 'utf8')).not.toContain('shadow-state');
    expect(readFileSync(join(interpretSrc, 'build.ts'), 'utf8')).not.toContain('shadow-state');
    expect(readFileSync(join(interpretSrc, 'build.ts'), 'utf8')).not.toContain(
      'projectBaziShadowState',
    );
  });

  it('has an intentionally small, non-generic state shape', () => {
    const state = project();
    expect(Object.keys(state).sort()).toEqual(
      ['contractVersion', 'nodes', 'resolution', 'stateId'].sort(),
    );
    for (const node of state.nodes) {
      expect(Object.keys(node).sort()).toEqual(
        ['dependsOn', 'id', 'invalidatedBy', 'layer', 'value'].sort(),
      );
    }
  });
});
