import { describe, expect, it } from 'vitest';
import { canonicalJson, parseBirthInput } from '@ming/contracts';
import {
  calculate,
  compareProfiles,
  computeRequestId,
  doctor,
  renderReport,
  verify,
} from '@ming/orchestrator';

const raw = {
  calendar: 'gregorian',
  localDate: '1990-03-10',
  localTime: '08:15:00',
  timeAccuracy: 'exact',
  timezone: 'Asia/Shanghai',
  location: { latitude: 30.5, longitude: 114.3, source: 'user' },
};
const FIXED = Date.parse('2026-01-01T00:00:00Z');

describe('calculate', () => {
  it('is byte-identical for identical input + now', () => {
    const a = calculate(parseBirthInput(raw), { now: FIXED });
    const b = calculate(parseBirthInput(raw), { now: FIXED });
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(a.requestId).toBe(b.requestId);
  });

  it('derives requestId deterministically from the input', () => {
    const input = parseBirthInput(raw);
    expect(calculate(input, { now: FIXED }).requestId).toBe(computeRequestId(input));
  });

  it('computes all four systems with nothing fabricated or left pending', () => {
    const input = parseBirthInput({
      ...raw,
      settings: { systems: ['western', 'bazi', 'ziwei', 'vedic'] },
    });
    const bundle = calculate(input, { now: FIXED });
    const pending = bundle.warnings
      .filter((w) => w.code === 'SYSTEM_NOT_YET_IMPLEMENTED')
      .map((w) => w.system)
      .sort();
    // All four systems are now implemented. Zi Wei is
    // skipped here only for lack of a gender rule (raw has none) — that is
    // ZIWEI_INPUT_REQUIRED, not "pending implementation", so nothing is pending.
    expect(pending).toEqual([]);
    expect(bundle.western).toBeDefined();
    expect(bundle.bazi).toBeDefined();
    expect(bundle.ziwei).toBeUndefined(); // omitted for missing gender, not fabricated
    expect(bundle.provenance.tzdb.version.length).toBeGreaterThan(0);
  });
});

describe('renderReport', () => {
  it('escapes user content, sets CSP, and contains no executable script', () => {
    const input = parseBirthInput({
      ...raw,
      location: {
        latitude: 30.5,
        longitude: 114.3,
        source: 'user',
        displayName: '<script>alert(1)</script>',
      },
    });
    const html = renderReport(calculate(input, { now: FIXED }));
    expect(html).toContain('Content-Security-Policy');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toMatch(/<script[^>]*>\s*alert/);
    expect(html).not.toMatch(/https?:\/\//);
  });
});

describe('verify', () => {
  it('passes on a valid fictional input', () => {
    const report = verify(raw);
    expect(report.ok).toBe(true);
    expect(report.checks.every((c) => c.ok)).toBe(true);
  });
});

describe('compareProfiles', () => {
  it('reports identical normalized time across rule profiles', () => {
    const res = compareProfiles(parseBirthInput(raw), ['default', 'apparent-solar', 'mean-solar'], {
      now: FIXED,
    });
    expect(res.normalizedTimeIdentical).toBe(true);
    expect(res.profiles).toHaveLength(3);
  });

  it('throws on an unknown profile', () => {
    expect(() => compareProfiles(parseBirthInput(raw), ['does-not-exist'])).toThrow();
  });
});

describe('doctor', () => {
  it('reports a bundled TZDB version and honest capabilities', () => {
    const report = doctor();
    expect(report.tzdb.version.length).toBeGreaterThan(0);
    expect(report.capabilities.normalize).toBe('ready');
    expect(report.capabilities.western).toBe('ready');
    expect(report.capabilities.bazi).toBe('ready');
    expect(report.capabilities.ziwei).toBe('ready');
    expect(report.capabilities.render).toBe('disabled');
    expect(report.network).toBe('disabled');
  });
});
