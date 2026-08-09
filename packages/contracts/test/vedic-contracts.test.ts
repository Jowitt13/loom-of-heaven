// Synthetic fixture — fictional data only; not a real person.
import { describe, expect, it } from 'vitest';
import { BirthInput, VedicSettings, parseBirthInput } from '@ming/contracts';

/**
 * Vedic P1/P2 contract tests (ADR 0013): the 'vedic' system id is reserved in
 * the contracts, old inputs stay valid, and the Rahu node default remains absent.
 */
const base = {
  calendar: 'gregorian',
  localDate: '1990-06-15',
  localTime: '14:30',
  timeAccuracy: 'exact',
  timezone: 'Asia/Shanghai',
  location: { latitude: 31.23, longitude: 121.47, source: 'user' },
};

describe('vedic contracts (P1/P2)', () => {
  it('legacy input without any vedic key still parses; default systems stay three', () => {
    const parsed = parseBirthInput(base);
    expect(parsed.settings.systems).toEqual(['western', 'bazi', 'ziwei']);
    expect(parsed.settings.systems).not.toContain('vedic');
    // The vedic settings block exists via prefault, without breaking old JSON.
    expect(parsed.settings.vedic.rulesetId).toBe('vedic-parashara-lahiri@0.1.0');
  });

  it('explicitly requesting the vedic system is accepted by the contract', () => {
    const parsed = parseBirthInput({ ...base, settings: { systems: ['vedic'] } });
    expect(parsed.settings.systems).toEqual(['vedic']);
  });

  it('nodes and dashaYear have no schema defaults before their respective product slices wire them', () => {
    const settings = VedicSettings.parse({});
    expect(settings.nodes).toBeUndefined();
    expect(settings.dashaYear).toBeUndefined();
    const parsed = parseBirthInput({ ...base, settings: { systems: ['vedic'] } });
    expect(parsed.settings.vedic.nodes).toBeUndefined();
    expect(parsed.settings.vedic.dashaYear).toBeUndefined();
  });

  it('rejects values outside the reserved enums', () => {
    expect(VedicSettings.safeParse({ dashaYear: 'gregorian-365' }).success).toBe(false);
    expect(VedicSettings.safeParse({ nodes: 'osculating' }).success).toBe(false);
    expect(VedicSettings.safeParse({ unknownKnob: true }).success).toBe(false);
    expect(BirthInput.safeParse({ ...base, settings: { systems: ['nakshatra'] } }).success).toBe(
      false,
    );
  });
});
