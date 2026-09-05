import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath: string): string => readFileSync(join(root, relativePath), 'utf8');

const ADR = read('docs/adr/0019-clarification-and-response-projection-boundary.md');
const SPEC = read('docs/CLARIFICATION_AND_RESPONSE_PROJECTION.md');
const ARCHITECTURE = read('docs/ARCHITECTURE.md');

describe('IQ-3 clarification and response-projection architecture gate', () => {
  it('records an accepted architecture-only IQ-3 boundary with no runtime activation', () => {
    expect(ADR).toContain('Status: Accepted — architecture only; no runtime behavior enabled');
    expect(ADR).toContain('IQ-3 clarification materiality and response-view boundary');
    expect(SPEC).toContain(
      'Status: one package-layer machine surface active in `@loom/orchestrator` — no runtime entry, no',
    );
    expect(SPEC).toContain('default-output change');
    expect(ARCHITECTURE).toContain("IQ-3's [ADR 0019]");
  });

  it('exposes exactly one package-layer machine surface with no runtime entry wiring', () => {
    expect(SPEC).toContain('## Versioned machine surface (IQ-3D)');
    expect(SPEC).toContain('`buildClarifiedResponseView`');
    expect(SPEC).toContain('`verifyClarifiedResponseView`');
    const facade = read('packages/orchestrator/src/clarified-response.ts');
    expect(facade).toContain('clarification-plan/v1');
    expect(facade).toContain('response-view/v1');
    expect(read('packages/orchestrator/src/index.ts')).toContain('./clarified-response.ts');
    for (const relative of [
      'packages/orchestrator/src/engine-entry.ts',
      'packages/orchestrator/src/interpret.ts',
      'packages/contracts/src/index.ts',
      'packages/interpret/src/index.ts',
      'skills/xuan-ji-yu-heng/scripts/loom-chart.mjs',
      'skills/xuan-ji-yu-heng/SKILL.md',
    ]) {
      expect(read(relative), relative).not.toContain('clarified-response');
    }
  });

  it('keeps the existing answer-plan public contract stable until a separate integration slice', () => {
    expect(ADR).toContain('leaves `answer-plan/v2`, `public-result/v2`, the existing CLI');
    expect(ADR).toContain('may not mutate `answer-plan/v2`');
    expect(SPEC).toMatch(/No\s+slice\s+may\s+alter\s+the\s+legacy\s+`answer-plan\/v2`\s+semantics/);
  });

  it('uses a closed clarification vocabulary and requires explicit material-setting resolution', () => {
    for (const value of [
      "'topic-intent'",
      "'response-depth'",
      "'birth-time-reliability'",
      "'target-period'",
      "'ruleset-variant'",
      "'system-scope'",
      "'ready' | 'requires-clarification' | 'degraded'",
      "'confirmed' | 'unavailable' | 'not-required'",
    ]) {
      expect(SPEC, value).toContain(value);
    }
    expect(ADR).toMatch(/An unconfirmed default must\s+never produce `ready` or `degraded`/);
  });

  it('fails closed or degrades instead of silently changing an eligible claim', () => {
    expect(SPEC).toContain('no delivery');
    expect(SPEC).toContain('omit time-sensitive claims');
    expect(SPEC).toContain('no timing delivery');
    expect(ADR).toContain('affected claim class is removed');
    expect(ADR).toContain('must not guess, default, or relabel the uncertainty as confidence');
  });

  it('makes response views transient, single-system, caveat-preserving, and audit-on-request', () => {
    for (const value of [
      "contractVersion: 'response-view/v1'",
      "clarificationStatus: 'ready' | 'degraded'",
      'materialCaveatIds',
      "auditAvailability: 'explicit-request-only'",
      'transient: true',
      'regenerable: true',
    ]) {
      expect(SPEC, value).toContain(value);
    }
    expect(ADR).toContain("exactly one chart system's approved claims");
    expect(SPEC).toMatch(/never claim eligibility or\s+material-caveat retention/);
  });

  it('preserves flexible default narration rather than introducing a fixed visible template', () => {
    expect(SPEC).toContain('not a list of visible headings');
    expect(SPEC).toContain('flexible natural prose');
    for (const forbidden of ['敏感项校对', '引擎警告', '专业依据', '声明']) {
      expect(SPEC, forbidden).toContain(forbidden);
    }
  });

  it('keeps raw data, persistence, model self-approval, and cross-system synthesis out of the boundary', () => {
    for (const forbidden of [
      'raw user questions',
      'transcripts',
      'model reasoning',
      'exact birth records',
      'free-text locations',
      'default memory',
      'cross-system claim',
      '`SynthesisRecord`',
    ]) {
      expect(ADR, forbidden).toContain(forbidden);
    }
    expect(SPEC).toMatch(/pass raw user\s+questions to the engine/);
    expect(SPEC).toContain('use model self-approval');
  });

  it('does not overstate answer-quality, traditional, predictive, or real-world evidence', () => {
    for (const boundary of [
      'semantically faithful',
      'natural',
      'useful',
      'traditionally correct',
      'prediction accuracy',
      'real-world validity',
      'aggregate accuracy or quality score',
    ]) {
      expect(SPEC, boundary).toMatch(new RegExp(boundary.replace(' ', '\\s+')));
    }
    expect(ADR).toContain('not a generic quality or accuracy score');
  });
});
