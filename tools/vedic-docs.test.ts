import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Vedic architecture gate (ADR 0013). It pins the P0 convention freeze and makes
 * P2's narrow numeric scope explicit while preventing a user-facing capability claim
 * before the ADR 0013 P5 slice actually ships.
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

  it('ADR 0013 keeps owner-confirmed defaults and verification gates distinct', () => {
    const adr = read(ADR);
    // Status must stay Proposed while the Rahu node default awaits owner confirmation.
    expect(adr).toMatch(/- Status: Proposed/);
    expect(adr).not.toMatch(/- Status: Accepted/);
    // julian-365.25 is the owner-confirmed default (2026-07-31), not a pending candidate.
    expect(adr).toMatch(/Owner-confirmed default \(2026-07-31\):\s+`julian-365\.25`/i);
    expect(adr).not.toMatch(/BLOCKED \/ owner decision.*Vimshottari year model/is);
    // The only remaining Vimshottari gate is the same-model dual-implementation cross-check.
    expect(adr).toMatch(
      /remaining Vimshottari blocker is verification[\s\S]*?identical `julian-365\.25` model/i,
    );
    // Sunrise rule is owner-confirmed upper-limb + standard 34′ refraction.
    expect(adr).toMatch(/Owner-confirmed \(2026-07-31\): upper-limb sunrise with standard 34′/);
    expect(adr).toContain('upper-limb-standard-refraction');
    // The −50′ backend mapping stays an unverified P2/P3 blocker until goldens land.
    expect(adr).toMatch(/not yet verified and is a P2\/P3\s+implementation blocker/i);
    // Rahu remains the single undecided semantic default.
    expect(adr).toMatch(/\*\*Proposed\*\* default `nodes: 'mean'`/);
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

  it('RULESETS.md scopes the ruleset to the P2/P3A internal substrate and links ADR 0013', () => {
    const rulesets = read('docs/RULESETS.md');
    expect(rulesets).toContain('vedic-parashara-lahiri@0.1.0');
    expect(rulesets).toMatch(/P2\/P3A substrate; not user-facing/);
    expect(rulesets).toContain('Vaara and Vimshottari remain absent');
    expect(rulesets).toContain('adr/0013-vedic-architecture.md');
  });

  it('P2/P3A docs disclose their narrow implemented scope and retain the P3B boundary', () => {
    for (const rel of [ADR, MATRIX]) {
      const text = read(rel);
      expect(text, `${rel} must describe the P2 numeric boundary`).toMatch(/P2.*numeric/i);
      expect(text, `${rel} must describe the implemented P3A boundary`).toMatch(/P3A/i);
      expect(text, `${rel} must retain the evidence-gated Vaara and Vimshottari boundary`).toMatch(
        /Vaara[\s\S]*Vimshottari|Vimshottari[\s\S]*Vaara/i,
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
