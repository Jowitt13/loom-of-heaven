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

describe('computeVedic (P2 substrate + P3A classifications)', () => {
  it('returns the precision-gated substrate, deterministic overlay and Caelus provenance', () => {
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
    expect(result.derived?.grahas).toHaveLength(7);
    expect(result.derived?.lagna.bhava).toBe(1);
    expect(result.derived?.panchanga.tithi.number).toBeGreaterThanOrEqual(1);
    expect(result.derived?.panchanga.tithi.number).toBeLessThanOrEqual(30);
    // Evidence-gated P3 products must remain absent.
    expect(result.derived).not.toHaveProperty('vaara');
    expect(result.derived).not.toHaveProperty('dashas');
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

  it('suppresses Lagna and the entire P3A overlay when the input has no birth time', () => {
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
    expect(result.derived).toBeNull();
    expect(result.grahas).toHaveLength(7);
    expect(result.nodes.mean.rahuLongitudeDeg).toBeGreaterThanOrEqual(0);
  });

  it('keeps the internal P3A overlay for an approximate time; P4 owns its public caveat', () => {
    const approximate = parseBirthInput({
      calendar: 'gregorian',
      localDate: '1984-11-05',
      localTime: '06:45',
      timeAccuracy: 'approximate',
      timezone: 'Asia/Kolkata',
      location: { latitude: 19.07, longitude: 72.87, source: 'user' },
      settings: { systems: ['vedic'] },
    });
    const result = computeVedic(normalizeBirthData(approximate), approximate.settings.vedic).result;
    expect(result.lagnaLongitudeDeg).not.toBeNull();
    expect(result.derived?.lagna.bhava).toBe(1);
    expect(result.derived?.panchanga).toBeDefined();
  });
});
