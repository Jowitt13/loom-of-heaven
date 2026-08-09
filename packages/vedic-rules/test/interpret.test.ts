// Synthetic fixture - fictional data only; not a real person or event.
import { describe, expect, it } from 'vitest';
import { parseBirthInput } from '@ming/contracts';
import { normalizeBirthData } from '@ming/time-location';
import { computeVedic } from '@ming/vedic';
import { interpretVedic } from '@ming/vedic-rules';

const exact = parseBirthInput({
  calendar: 'gregorian',
  localDate: '1994-02-17',
  localTime: '09:45:00',
  timeAccuracy: 'exact',
  timezone: 'Asia/Kolkata',
  location: { latitude: 28.6139, longitude: 77.209, source: 'user' },
  settings: { systems: ['vedic'] },
});

function rulesFor(input = exact) {
  const normalized = normalizeBirthData(input);
  const chart = computeVedic(normalized, input.settings.vedic).result;
  return interpretVedic(chart, {
    timeAccuracy: input.timeAccuracy,
    ...(input.timeAccuracy === 'unknown'
      ? {}
      : {
          birth: {
            utcInstantMs: normalized.utcInstantMs,
            latitudeDeg: normalized.location.latitude,
            longitudeEastDeg: normalized.location.longitude,
          },
        }),
  });
}

describe('Vedic P4 sourced structural rules', () => {
  it('emits versioned, cited structural findings without a node-default claim', () => {
    const rules = rulesFor();
    expect(rules.rulesetId).toBe('vedic-rules-parashara@0.1.0');
    expect(rules.provider).toEqual({ id: 'vedic-rules', version: '0.1.0', license: 'MIT' });
    expect(rules.findings.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining([
        'nakshatra/moon',
        'bhava/whole-sign-10',
        'panchanga/instantaneous',
        'vimshottari/birth-balance',
      ]),
    );
    for (const finding of rules.findings) {
      expect(finding.source.text.length).toBeGreaterThan(0);
      expect(finding.source.chapter.length).toBeGreaterThan(0);
      expect(finding.claim).not.toMatch(/Rahu default|nodes: 'mean'/i);
    }
  });

  it('adds the mandatory time-sensitive caveat for an approximate birth time', () => {
    const approximate = parseBirthInput({ ...exact, timeAccuracy: 'approximate' });
    const bhava = rulesFor(approximate).findings.find(
      (finding) => finding.ruleId === 'bhava/whole-sign-10',
    );
    expect(bhava?.caveat).toContain('Birth time is approximate');
    expect(bhava?.caveat).toContain('Lagna');
  });

  it('never emits time-of-day Vedic facts from an unknown-time noon anchor', () => {
    const unknown = parseBirthInput({
      ...exact,
      localTime: undefined,
      timeAccuracy: 'unknown',
    });
    const findings = rulesFor(unknown).findings;
    expect(findings.some((finding) => finding.topic === 'bhava')).toBe(false);
    expect(findings.some((finding) => finding.topic === 'vimshottari')).toBe(false);
    expect(findings.every((finding) => finding.caveat?.includes('Birth time is unknown'))).toBe(
      true,
    );
  });
});
