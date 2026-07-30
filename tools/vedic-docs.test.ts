import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Vedic P0 doc gate (ADR 0013): the Jyotish line exists ONLY as frozen documentation.
 * This test (a) pins the P0 deliverables and their required sections so they cannot
 * silently disappear or lose the convention freeze, and (b) fails if any user-facing
 * surface starts claiming Vedic capability before the ADR 0013 P5 slice actually ships.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string): string => readFileSync(join(root, rel), 'utf8');

const ADR = 'docs/adr/0013-vedic-architecture.md';
const MATRIX = 'docs/VEDIC_SOURCE_MATRIX.md';

describe('vedic docs gate: P0 deliverables present and complete', () => {
  it('ADR 0013 exists and freezes every contested convention', () => {
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
    const missing = requiredSections.filter((s) => !adr.includes(s));
    expect(missing, `ADR 0013 lost sections: ${missing.join(', ')}`).toEqual([]);
    // The three Lahiri-family variants must never be treated as synonyms (tolerate wrapping).
    expect(adr).toMatch(/never be\s+treated as\s+synonyms/i);
  });

  it('ADR 0013 keeps semantic defaults as proposed/blocked, not silently accepted', () => {
    const adr = read(ADR);
    // Status must stay Proposed until the owner confirms the semantic defaults.
    expect(adr).toMatch(/- Status: Proposed/);
    expect(adr).not.toMatch(/- Status: Accepted/);
    // The Vimshottari year model is an explicit blocker, never a wired default.
    expect(adr).toMatch(/BLOCKED \/ owner decision.*Vimshottari year model/is);
    expect(adr).not.toMatch(/default is the \*\*365\.25-day/i);
    // Sunrise backend mapping stays an unverified P2/P3 blocker until evidence lands.
    expect(adr).toMatch(/not yet verified and is a P2\/P3\s+implementation blocker/i);
  });

  it('keeps the P2 evidence amendment field-scoped without lowering the Swiss gate', () => {
    const adr = read(ADR);
    const matrix = read(MATRIX);
    for (const text of [adr, matrix]) {
      expect(text).toContain('Swiss-only external numeric reference');
      expect(text).toContain('100 synthetic cases');
      expect(text).toContain('REJECTED_FOR_MODE1_REFERENCE');
    }
    expect(adr).toContain('worst 7.633′');
    expect(adr).toContain('worst 10.286′');
    expect(adr).toMatch(/Swiss remains the hard acceptance oracle/i);
    expect(adr).toMatch(/never as a general claim of[\s\S]*accuracy/i);
  });

  it('source matrix exists with the ten required columns and license boundary', () => {
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
    const missing = requiredColumns.filter((c) => !matrix.includes(c));
    expect(missing, `matrix lost columns: ${missing.join(', ')}`).toEqual([]);
    for (const tool of ['Swiss Ephemeris', 'PyJHora', 'node-jhora', 'jyotishganit', 'VedAstro']) {
      expect(matrix, `matrix must state the license boundary for ${tool}`).toContain(tool);
    }
  });

  it('RULESETS.md lists the vedic ruleset as PLANNED and links ADR 0013', () => {
    const rulesets = read('docs/RULESETS.md');
    expect(rulesets).toContain('vedic-parashara-lahiri@0.1.0');
    expect(rulesets).toMatch(/PLANNED, not implemented/);
    expect(rulesets).toContain('adr/0013-vedic-architecture.md');
  });

  it('P0 docs never present the plan as a shipped capability', () => {
    for (const rel of [ADR, MATRIX]) {
      expect(read(rel), `${rel} must carry a not-implemented notice`).toMatch(
        /no Vedic code exists yet|Nothing in this file is implemented yet/,
      );
    }
  });
});

describe('vedic docs gate: no premature capability claims on user-facing surfaces', () => {
  // Surfaces a host or user reads to learn what the product can do TODAY. The repo-level
  // README and docs/ may discuss the roadmap; the Skill surface may not mention vedic at
  // all until P5 ships it for real.
  const skillSurfaces = [
    'skills/calculate-birth-charts/SKILL.md',
    'skills/calculate-birth-charts/agents/openai.yaml',
    'skills/calculate-birth-charts/references/rulesets.md',
    'skills/calculate-birth-charts/references/input-contract.md',
    'skills/calculate-birth-charts/references/output-contract.md',
    '.claude-plugin/plugin.json',
    'install-manifest.json',
  ];

  it('Skill surfaces contain no vedic/jyotish claim', () => {
    const offenders = skillSurfaces.filter((f) => /vedic|jyotish/i.test(read(f)));
    expect(offenders, `remove vedic claims from: ${offenders.join(', ')}`).toEqual([]);
  });

  it('CLI --systems all still expands to exactly the three implemented systems (P5 owns the flip)', () => {
    const cli = read('skills/calculate-birth-charts/scripts/ming-chart.mjs');
    // The literal all-expansion list must stay three-system until P5 ships Vedic for real.
    expect(cli).toContain("['western', 'bazi', 'ziwei']");
    expect(cli).not.toMatch(/vedic|jyotish/i);
  });

  it('README mentions vedic only as an explicit plan, never as a current system', () => {
    const readme = read('README.md');
    const mentions = readme.match(/^.*(vedic|jyotish).*$/gim) ?? [];
    const unplanned = mentions.filter(
      (line) => !/planned|roadmap|not implemented|ADR 0013/i.test(line),
    );
    expect(
      unplanned,
      `README lines claiming vedic without a plan marker: ${unplanned.join(' | ')}`,
    ).toEqual([]);
  });
});
