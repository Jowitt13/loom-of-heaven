import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Vedic architecture gate (ADR 0013). P5 may expose Vedic only after its
 * reviewed fixtures pass, and must retain every disclosed scope boundary.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string): string => readFileSync(join(root, rel), 'utf8');

const ADR = 'docs/adr/0013-vedic-architecture.md';
const MATRIX = 'docs/VEDIC_SOURCE_MATRIX.md';

describe('vedic docs gate: P0 conventions and P3B evidence', () => {
  it('keeps ADR 0013 and every convention-freeze section', () => {
    const adr = read(ADR);
    const requiredSections = [
      'System id and package boundary',
      'Lahiri: the precise definition',
      'SE_SIDM_LAHIRI',
      'SE_SIDM_TRUE_CITRA',
      'SE_SIDM_LAHIRI_ICRC',
      'Rahu: mean vs true',
      'Ketu',
      'Bhava (houses)',
      'Nakshatra and Pada',
      'Panchanga',
      'D1 and D9',
      'Vimshottari dasha',
      'Numeric conventions',
      'timeAccuracy degradation',
      'Not supported in v1',
      'v0.3.0 public-contract breaking changes',
      'Rollout: six independent PRs',
      'License boundary',
    ];
    const missing = requiredSections.filter((section) => !adr.includes(section));
    expect(missing, `ADR 0013 lost sections: ${missing.join(', ')}`).toEqual([]);
    expect(adr).toMatch(/never be\s+treated as\s+synonyms/i);
  });

  it('locks owner-confirmed defaults while recording the bounded P3B evidence results', () => {
    const adr = read(ADR);
    expect(adr).toMatch(/- Status: Accepted/);
    expect(adr).not.toMatch(/- Status: Proposed/);
    expect(adr).toMatch(/Owner-confirmed default \(2026-07-31\):\s+`julian-365\.25`/i);
    expect(adr).toContain('upper-limb-standard-refraction');
    expect(adr).toMatch(/NDAstro 0\.28\.1/i);
    expect(adr).toContain('16.610 seconds');
    expect(adr).toContain('30 seconds');
    expect(adr).toContain('5.457 seconds');
    expect(adr).toMatch(/16 synthetic.*swetest -rise -emos/i);
    expect(adr).not.toMatch(/remaining Vimshottari blocker is verification/i);
    expect(adr).not.toMatch(/not yet verified and is a P2\/P3\s+implementation blocker/i);
    expect(adr).toMatch(/\*\*Owner-confirmed default \(2026-08-09\): mean node\.\*\*/);
    expect(adr).toMatch(/v0\.4\.0[\s\S]*default[\s\S]*all four\s+systems/i);
  });

  it('keeps the P2 evidence amendment field-scoped without lowering the Swiss gate', () => {
    const adr = read(ADR);
    const matrix = read(MATRIX);
    for (const text of [adr, matrix]) {
      expect(text).toContain('Swiss-only external numeric reference');
      expect(text).toContain('100 synthetic cases');
      expect(text).toContain('REJECTED_FOR_MODE1_REFERENCE');
    }
    expect(adr).toMatch(/Swiss remains the hard acceptance oracle/i);
    expect(adr).toMatch(/never as a general claim of[\s\S]*accuracy/i);
  });

  it('keeps the source matrix complete and its external-tool boundary explicit', () => {
    const matrix = read(MATRIX);
    const requiredColumns = [
      'Adopted definition',
      'Primary source',
      'Secondary cross-source',
      'School disagreement',
      'License status',
      'Future implementation file',
      'External golden method',
      'Acceptable error',
      'Unresolved questions',
    ];
    const missing = requiredColumns.filter((column) => !matrix.includes(column));
    expect(missing, `matrix lost columns: ${missing.join(', ')}`).toEqual([]);
    for (const tool of ['Swiss Ephemeris', 'PyJHora', 'node-jhora', 'jyotishganit', 'VedAstro']) {
      expect(matrix, `matrix must state the license boundary for ${tool}`).toContain(tool);
    }
    expect(matrix).toContain('P3B evidence records (satisfied)');
    expect(matrix).toContain('16.610 seconds');
    expect(matrix).toContain('5.457 seconds');
  });

  it('documents the shipped P5 ruleset boundary and links ADR 0013', () => {
    const rulesets = read('docs/RULESETS.md');
    expect(rulesets).toContain('vedic-parashara-lahiri@0.1.0');
    expect(rulesets).toMatch(/P5 user-facing system/i);
    expect(rulesets).toMatch(/both node modes/i);
    expect(rulesets).toMatch(/owner-confirmed default is mean/i);
    expect(rulesets).toContain('16.610 seconds');
    expect(rulesets).toContain('5.457 seconds');
    expect(rulesets).toContain('adr/0013-vedic-architecture.md');
  });

  it('documents P2, P3A, and P3B scope boundaries', () => {
    for (const rel of [ADR, MATRIX]) {
      const text = read(rel);
      expect(text, `${rel} must describe the P2 numeric boundary`).toMatch(/P2.*numeric/i);
      expect(text, `${rel} must describe P3A`).toMatch(/P3A/i);
      expect(text, `${rel} must describe P3B`).toMatch(/P3B/i);
      expect(text, `${rel} must retain Vaara and Vimshottari`).toMatch(
        /Vaara[\s\S]*Vimshottari|Vimshottari[\s\S]*Vaara/i,
      );
    }
  });

  it('locks P4 to a v2 hard cut and records the P5 user-surface boundary', () => {
    const adr = read(ADR);
    const matrix = read(MATRIX);
    const rulesets = read('docs/RULESETS.md');
    for (const text of [adr, matrix, rulesets]) {
      expect(text).toMatch(/hard cut/i);
      expect(text).toContain('answer-plan/v1');
      expect(text).toContain('public-result/v1');
    }
    expect(adr).toContain('VEDIC_TIME_REQUIRED');
    expect(adr).toMatch(/samples every civil minute/i);
    expect(adr).toMatch(/P5.*implemented/i);
  });
});

describe('vedic docs gate: P5 user-facing claims stay truthful', () => {
  const skillSurfaces = [
    'skills/xuan-ji-yu-heng/SKILL.md',
    'skills/xuan-ji-yu-heng/agents/openai.yaml',
    'skills/xuan-ji-yu-heng/references/rulesets.md',
    'skills/xuan-ji-yu-heng/references/input-contract.md',
    'skills/xuan-ji-yu-heng/references/output-contract.md',
    '.claude-plugin/plugin.json',
  ];

  it('exposes Vedic consistently across current Skill surfaces', () => {
    const missing = skillSurfaces.filter((file) => !/vedic|jyotish/i.test(read(file)));
    expect(missing, `P5 Skill surface lacks Vedic disclosure: ${missing.join(', ')}`).toEqual([]);
    const rulesets = read('skills/xuan-ji-yu-heng/references/rulesets.md');
    expect(rulesets).toMatch(/both[\s\S]*mean[\s\S]*true|mean[\s\S]*true[\s\S]*both/i);
    expect(rulesets).toMatch(/no.*default|default.*pending/i);
    expect(rulesets).toContain('VEDIC_TIME_REQUIRED');
  });

  it('aligns CLI --systems all and the raw no-flag default at four systems', () => {
    const cli = read('skills/xuan-ji-yu-heng/scripts/loom-chart.mjs');
    expect(cli).toContain("['western', 'bazi', 'ziwei', 'vedic']");
    const contracts = read('packages/contracts/src/birth-input.ts');
    expect(contracts).toContain("default(['western', 'bazi', 'ziwei', 'vedic'])");
  });

  it('keeps agent instructions aligned with the owner-confirmed defaults', () => {
    const agents = read('AGENTS.md');
    expect(agents).toMatch(/deterministic\*\* four-system birth-chart engine/i);
    expect(agents).toMatch(/omitted `settings\.systems`[\s\S]*all\s+four shipped systems/i);
    expect(agents).toContain("`vedic.nodes: 'mean'`");
    expect(agents).not.toMatch(/three-system compatibility default/i);
    expect(agents).not.toMatch(/without a product default/i);
  });

  it('keeps public wording within the precision and published-release boundary', () => {
    const readme = read('README.md');
    expect(readme).toMatch(/Vedic|Jyotish/i);
    expect(readme).toMatch(/Swiss-only external numeric reference/i);
    expect(readme).toMatch(/both.*mean.*true|mean.*true.*both/i);
    expect(readme).toMatch(/default.*mean|mean.*default/i);
    expect(read('install-manifest.json')).not.toMatch(/vedic|jyotish/i);
  });
});
