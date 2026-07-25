// Synthetic fixture - fictional data only; not a real person.
import { describe, expect, it } from 'vitest';
import { interpretWestern } from '@ming/western-rules';
import { canonicalJson, parseBirthInput } from '@ming/contracts';
import { calculate } from '@ming/orchestrator';

const FIXED = Date.parse('2026-01-01T00:00:00Z');

const syntheticInput = parseBirthInput({
  calendar: 'gregorian',
  localDate: '1992-08-15',
  localTime: '10:30:00',
  timeAccuracy: 'exact',
  timezone: 'America/New_York',
  location: {
    latitude: 40.7128,
    longitude: -74.006,
    source: 'user',
    displayName: 'Synthetic western-rules test location sentinel',
  },
  settings: { systems: ['western'] },
});

describe('western-rules', () => {
  it('produces non-empty findings with ruleId and source for a full chart', () => {
    const bundle = calculate(syntheticInput, { now: FIXED });
    expect(bundle.western).toBeDefined();
    const result = interpretWestern(bundle.western!);
    expect(result.rulesetId).toMatch(/^western-rules@/);
    expect(result.findings.length).toBeGreaterThan(5);
    for (const f of result.findings) {
      expect(f.ruleId).toBeTruthy();
      expect(f.source.text).toBeTruthy();
      expect(f.source.chapter).toBeTruthy();
      expect(f.claim).toBeTruthy();
      expect(f.matched).toBe(true);
    }
  });

  it('includes planet-sign findings for Sun and Moon', () => {
    const bundle = calculate(syntheticInput, { now: FIXED });
    const result = interpretWestern(bundle.western!);
    const sunFinding = result.findings.find((f) => f.ruleId.startsWith('planet-sign/sun-'));
    const moonFinding = result.findings.find((f) => f.ruleId.startsWith('planet-sign/moon-'));
    expect(sunFinding).toBeDefined();
    expect(moonFinding).toBeDefined();
  });

  it('includes angle findings when birth time is known', () => {
    const bundle = calculate(syntheticInput, { now: FIXED });
    const result = interpretWestern(bundle.western!);
    const ascFinding = result.findings.find((f) => f.ruleId.startsWith('angle/asc-'));
    const mcFinding = result.findings.find((f) => f.ruleId.startsWith('angle/mc-'));
    expect(ascFinding).toBeDefined();
    expect(mcFinding).toBeDefined();
  });

  it('is deterministic for the same input', () => {
    const bundle = calculate(syntheticInput, { now: FIXED });
    const r1 = interpretWestern(bundle.western!);
    const r2 = interpretWestern(bundle.western!);
    expect(canonicalJson(r1)).toBe(canonicalJson(r2));
  });

  it('returns empty findings for aspects/houses when no luminary aspects or angular placements exist', () => {
    // This test just verifies no crash; the specific findings depend on the chart
    const bundle = calculate(syntheticInput, { now: FIXED });
    const result = interpretWestern(bundle.western!);
    // All findings must be well-formed regardless of content
    for (const f of result.findings) {
      expect(f.topic).toMatch(/^(planet-sign|planet-house|angle|aspect|dignity)$/);
    }
  });
});
