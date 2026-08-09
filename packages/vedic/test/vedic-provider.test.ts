// Synthetic fixture — fictional data only; not a real person.
import { describe, expect, it } from 'vitest';
import { parseBirthInput } from '@ming/contracts';
import { normalizeBirthData } from '@ming/time-location';
import { computeVedic } from '@ming/vedic';

const input = parseBirthInput({
  calendar: 'gregorian',
  localDate: '1984-11-05',
  localTime: '06:45',
  timeAccuracy: 'exact',
  timezone: 'Asia/Kolkata',
  location: { latitude: 19.07, longitude: 72.87, source: 'user' },
  settings: { systems: ['vedic'] },
});

function norm360(value: number): number {
  const out = value % 360;
  return out < 0 ? out + 360 : out;
}

describe('computeVedic (P2 precision substrate)', () => {
  it('returns only precision-gated numeric fields and the Caelus provenance', () => {
    const normalized = normalizeBirthData(input);
    const { result, warnings } = computeVedic(normalized, input.settings.vedic);
    expect(warnings).toEqual([]);
    expect(result.provider).toEqual({ id: 'caelus', version: '0.23.0', license: 'MIT' });
    expect(result.ayanamsha).toEqual({
      id: 'lahiri-iae-1985',
      swissReferenceMode: 'SE_SIDM_LAHIRI',
    });
    expect(result.precision).toBe('high');
    expect(result.grahas.map((placement) => placement.graha)).toEqual([
      'Sun',
      'Moon',
      'Mercury',
      'Venus',
      'Mars',
      'Jupiter',
      'Saturn',
    ]);
    for (const placement of result.grahas) {
      expect(placement.longitudeDeg).toBeGreaterThanOrEqual(0);
      expect(placement.longitudeDeg).toBeLessThan(360);
    }
    expect(result.lagnaLongitudeDeg).not.toBeNull();
    // P3-only derived products must not leak into the P2 substrate.
    expect(result).not.toHaveProperty('nakshatras');
    expect(result).not.toHaveProperty('panchanga');
    expect(result).not.toHaveProperty('dashas');
  });

  it('always emits both node modes and derives Ketu by exact opposition', () => {
    const normalized = normalizeBirthData(input);
    const plain = computeVedic(normalized, input.settings.vedic).result;
    const selected = computeVedic(normalized, { ...input.settings.vedic, nodes: 'true' }).result;
    expect(selected.nodes).toEqual(plain.nodes);
    expect(
      norm360(plain.nodes.mean.ketuLongitudeDeg - plain.nodes.mean.rahuLongitudeDeg),
    ).toBeCloseTo(180, 9);
    expect(
      norm360(plain.nodes.true.ketuLongitudeDeg - plain.nodes.true.rahuLongitudeDeg),
    ).toBeCloseTo(180, 9);
  });

  it('suppresses Lagna when the input has no birth time but retains instant-based grahas and nodes', () => {
    const unknown = parseBirthInput({
      calendar: 'gregorian',
      localDate: '1984-11-05',
      timeAccuracy: 'unknown',
      timezone: 'Asia/Kolkata',
      location: { latitude: 19.07, longitude: 72.87, source: 'user' },
      settings: { systems: ['vedic'] },
    });
    const result = computeVedic(normalizeBirthData(unknown), unknown.settings.vedic).result;
    expect(result.lagnaLongitudeDeg).toBeNull();
    expect(result.grahas).toHaveLength(7);
    expect(result.nodes.mean.rahuLongitudeDeg).toBeGreaterThanOrEqual(0);
  });
});
