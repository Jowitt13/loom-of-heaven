// Synthetic fixture — fictional data only; not a real person.
import { describe, expect, it } from 'vitest';
import { parseBirthInput } from '@ming/contracts';
import { normalizeBirthData } from '@ming/time-location';
import { computeVedic } from '@ming/vedic';

/**
 * Vedic P1 provider skeleton tests (ADR 0013): the provider must NEVER fabricate.
 * It always returns null plus exactly one structured SYSTEM_NOT_YET_IMPLEMENTED
 * warning — no result, no provider ref, no ruleset ref, no numbers.
 */
const input = parseBirthInput({
  calendar: 'gregorian',
  localDate: '1984-11-05',
  localTime: '06:45',
  timeAccuracy: 'exact',
  timezone: 'Asia/Kolkata',
  location: { latitude: 19.07, longitude: 72.87, source: 'user' },
  settings: { systems: ['vedic'] },
});

describe('computeVedic (P1 skeleton)', () => {
  it('always returns null + a single SYSTEM_NOT_YET_IMPLEMENTED warning', () => {
    const normalized = normalizeBirthData(input);
    const { result, warnings } = computeVedic(normalized, input.settings.vedic);
    expect(result).toBeNull();
    expect(warnings).toHaveLength(1);
    const warning = warnings[0]!;
    expect(warning.code).toBe('SYSTEM_NOT_YET_IMPLEMENTED');
    expect(warning.system).toBe('vedic');
    expect(warning.severity).toBe('info');
  });

  it('fabricates nothing: no detail payload, no numeric claims in the message', () => {
    const normalized = normalizeBirthData(input);
    const { warnings } = computeVedic(normalized, input.settings.vedic);
    expect(warnings[0]).not.toHaveProperty('detail');
    // No degree/longitude-like fabricated values in the pending message.
    expect(warnings[0]!.message).not.toMatch(/\d+\.\d+°|\d+°\d+/);
  });

  it('ignores the reserved knobs: same outcome with or without nodes/dashaYear', () => {
    const normalized = normalizeBirthData(input);
    const plain = computeVedic(normalized, input.settings.vedic);
    const knobbed = computeVedic(normalized, {
      ...input.settings.vedic,
      nodes: 'true',
      dashaYear: 'savana-360',
    });
    expect(knobbed.result).toBeNull();
    expect(knobbed.warnings).toEqual(plain.warnings);
  });
});
