import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BaziChartResult, BaziHiddenStem, BaziPillar } from '@loom/contracts';
import { canonicalJson } from '@loom/contracts';
import { projectBaziShadowState, type BaziShadowState } from '../src/shadow-state.ts';
import { verifyBaziShadowState } from '../src/shadow-state-verify.ts';

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

function state(): BaziShadowState {
  return projectBaziShadowState(makeChart(), {
    stateId: 'opaque-synthetic-state-verify-001',
    resolution: {
      schemaVersion: 'synthetic-schema/v1',
      engineVersion: 'synthetic-engine/v1',
      sourceProfileIds: [],
    },
  });
}

function copy(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(state())) as Record<string, unknown>;
}

function issueCodes(value: unknown): string[] {
  return verifyBaziShadowState(value).issues.map((issue) => issue.code);
}

describe('verifyBaziShadowState (P0-C bounded internal verifier)', () => {
  it('accepts the P0-B projection and returns a byte-identical verification result', () => {
    const first = verifyBaziShadowState(state());
    const second = verifyBaziShadowState(state());
    expect(first).toEqual({ ok: true, issues: [] });
    expect(canonicalJson(first)).toBe(canonicalJson(second));
  });

  it('rejects an unknown state shape, contract version, or blank opaque id', () => {
    expect(issueCodes(null)).toEqual(['STATE_SHAPE']);

    const badVersion = copy();
    badVersion.contractVersion = 'bazi-shadow-state/unknown';
    expect(issueCodes(badVersion)).toContain('CONTRACT_VERSION');

    const blankId = copy();
    blankId.stateId = '  ';
    expect(issueCodes(blankId)).toContain('STATE_ID');
  });

  it('requires a complete resolution and keeps source profiles unavailable in P0-B', () => {
    const missingEngine = copy();
    (missingEngine.resolution as Record<string, unknown>).engineVersion = '';
    expect(issueCodes(missingEngine)).toContain('RESOLUTION');

    const profile = copy();
    (profile.resolution as Record<string, unknown>).sourceProfileIds = ['not-yet-admitted'];
    expect(issueCodes(profile)).toContain('SOURCE_PROFILE');
  });

  it('rejects missing, reordered, duplicated, or expanded stage nodes', () => {
    const missing = copy();
    (missing.nodes as unknown[]).pop();
    expect(issueCodes(missing)).toContain('NODE_SET');

    const reordered = copy();
    const nodes = reordered.nodes as unknown[];
    [nodes[0], nodes[1]] = [nodes[1], nodes[0]];
    expect(issueCodes(reordered)).toContain('NODE_SET');

    const expanded = copy();
    (expanded.nodes as unknown[]).push({});
    expect(issueCodes(expanded)).toContain('NODE_SET');
  });

  it('requires the declared derived-structure layer, dependencies, and invalidations', () => {
    const altered = copy();
    const node = (altered.nodes as Record<string, unknown>[])[2]!;
    node.layer = 'rule-judgment';
    node.dependsOn = ['chart.bazi'];
    node.invalidatedBy = ['topic-lens'];
    const codes = issueCodes(altered);
    expect(codes).toContain('NODE_LAYER');
    expect(codes).toContain('DEPENDENCY');
    expect(codes).toContain('INVALIDATION');
  });

  it('rejects raw birth, location, model-reasoning, and answer-layer fields at any depth', () => {
    const altered = copy();
    const patternValue = (altered.nodes as Record<string, unknown>[])[3]!.value as Record<
      string,
      unknown
    >;
    patternValue.originalInput = { localDate: '2000-01-01', timezone: 'Asia/Shanghai' };
    patternValue.location = 'not-permitted';
    patternValue.prompt = 'hidden model instructions';
    patternValue.answerClaim = 'must not be narratable';
    const codes = issueCodes(altered);
    expect(codes.filter((code) => code === 'FORBIDDEN_FIELD')).toHaveLength(6);
  });

  it('requires the four collector values to share one chart source', () => {
    const altered = copy();
    const relationValue = (altered.nodes as Record<string, unknown>[])[1]!.value as Record<
      string,
      unknown
    >;
    (relationValue.chartSource as Record<string, unknown>).providerVersion = 'tampered';
    expect(issueCodes(altered)).toContain('CHART_SOURCE');
  });

  it('requires D2 strength and pattern values to retain their declared D1 links', () => {
    const rootsTampered = copy();
    const strengthValue = (rootsTampered.nodes as Record<string, unknown>[])[2]!.value as Record<
      string,
      unknown
    >;
    (strengthValue.directRoots as Record<string, unknown>).hasDirectRoot = false;
    expect(issueCodes(rootsTampered)).toContain('COLLECTOR_LINK');

    const geometryTampered = copy();
    const patternValue = (geometryTampered.nodes as Record<string, unknown>[])[3]!.value as Record<
      string,
      unknown
    >;
    patternValue.stemCombinations = [
      {
        kind: 'stem-five-combination',
        participants: [],
        tableRef: 'synthetic/tampered',
      },
    ];
    expect(issueCodes(geometryTampered)).toContain('COLLECTOR_LINK');
  });

  it('does not inspect the traditional conclusion inside an otherwise valid evidence-only collector', () => {
    const result = verifyBaziShadowState(state());
    expect(result.ok).toBe(true);
    expect(issueCodes(state())).not.toContain('RULE_TRUTH');
    expect(issueCodes(state())).not.toContain('DIVINATION_ACCURACY');
  });

  it('remains internal: package entry, interpretation build, contracts, and CLI do not import it', () => {
    const baziRulesSrc = join(__dirname, '..', 'src');
    const interpretSrc = join(__dirname, '..', '..', 'interpret', 'src');
    const contractsSrc = join(__dirname, '..', '..', 'contracts', 'src');
    const skillCli = join(
      __dirname,
      '..',
      '..',
      '..',
      'skills',
      'xuan-ji-yu-heng',
      'scripts',
      'loom-chart.mjs',
    );
    expect(readFileSync(join(baziRulesSrc, 'index.ts'), 'utf8')).not.toContain(
      'shadow-state-verify',
    );
    expect(readFileSync(join(interpretSrc, 'index.ts'), 'utf8')).not.toContain(
      'shadow-state-verify',
    );
    expect(readFileSync(join(interpretSrc, 'build.ts'), 'utf8')).not.toContain(
      'verifyBaziShadowState',
    );
    expect(readFileSync(join(contractsSrc, 'index.ts'), 'utf8')).not.toContain('shadow-state');
    expect(readFileSync(skillCli, 'utf8')).not.toContain('shadow-state');
  });
});
