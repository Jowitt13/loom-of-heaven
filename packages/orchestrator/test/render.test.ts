// Synthetic fixture — fictional data only; not a real person.
import { describe, expect, it } from 'vitest';
import { parseBirthInput } from '@ming/contracts';
import { calculate, renderReport, renderSvgReport } from '@ming/orchestrator';

const rawMale = {
  calendar: 'gregorian',
  localDate: '1990-03-10',
  localTime: '08:15:00',
  timeAccuracy: 'exact',
  timezone: 'Asia/Shanghai',
  location: { latitude: 30.5, longitude: 114.3, source: 'user' },
  ruleGender: 'male',
};
const FIXED = Date.parse('2026-01-01T00:00:00Z');
const fullBundle = () => calculate(parseBirthInput(rawMale), { now: FIXED });

describe('renderReport (self-contained HTML)', () => {
  it('renders the BaZi + Zi Wei tables, provenance and disclaimer for a full bundle', () => {
    const html = renderReport(fullBundle());
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain('BaZi 八字 (Four Pillars)');
    expect(html).toContain('Zi Wei Dou Shu 紫微斗数');
    expect(html).toContain('Provenance');
    expect(html).toContain('Not scientifically validated');
    expect(html).not.toMatch(/<script[^>]*>/i);
    expect(html).not.toMatch(/https?:\/\//);
  });
});

describe('renderSvgReport (standalone SVG, handoff §7.2 fallback)', () => {
  it('is a self-contained SVG with no script and no external resource', () => {
    const svg = renderSvgReport(fullBundle());
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).not.toMatch(/<script/i);
    expect(svg).not.toMatch(/javascript:/i);
    // The only URI allowed is the XML namespace itself.
    expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
  });

  it('carries the computed facts (day master, Zi Wei, provenance)', () => {
    const svg = renderSvgReport(fullBundle());
    expect(svg).toContain('Day master');
    expect(svg).toContain('紫微斗数');
    expect(svg).toContain('命主');
    expect(svg).toContain('Provenance');
  });

  it('escapes special characters in engine messages (quotes become entities)', () => {
    // Unknown time → ZIWEI_INPUT_REQUIRED warning whose message contains "male"/"female".
    const bundle = calculate(
      parseBirthInput({ ...rawMale, timeAccuracy: 'unknown', localTime: undefined }),
      { now: FIXED },
    );
    const svg = renderSvgReport(bundle);
    expect(svg).toContain('&quot;male&quot;');
    expect(svg).not.toContain('"male"/"female"');
  });

  it('is deterministic (byte-identical across renders)', () => {
    expect(renderSvgReport(fullBundle())).toBe(renderSvgReport(fullBundle()));
  });
});
