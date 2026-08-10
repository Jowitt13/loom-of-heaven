// Synthetic fixture — fictional data only; not a real person.
import { describe, expect, it } from 'vitest';
import { BirthInput, VedicSettings, parseBirthInput } from '@loom/contracts';

/**
 * Vedic P1/P2 contract tests (ADR 0013): the 'vedic' system id is reserved in
 * the contracts, default input requests all four systems, and the owner-confirmed
 * Rahu convention defaults to the mean node.
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
  it('input without any vedic key still parses; default systems include all four', () => {
    const parsed = parseBirthInput(base);
    expect(parsed.settings.systems).toEqual(['western', 'bazi', 'ziwei', 'vedic']);
    // The vedic settings block exists via prefault, without requiring a nested input object.
    expect(parsed.settings.vedic.rulesetId).toBe('vedic-parashara-lahiri@0.1.0');
  });

  it('explicitly requesting the vedic system is accepted by the contract', () => {
    const parsed = parseBirthInput({ ...base, settings: { systems: ['vedic'] } });
    expect(parsed.settings.systems).toEqual(['vedic']);
  });

  it('defaults Rahu to mean while retaining explicit true-node and dasha choices', () => {
    const settings = VedicSettings.parse({});
    expect(settings.nodes).toBe('mean');
    expect(settings.dashaYear).toBe('julian-365.25');
    const parsed = parseBirthInput({ ...base, settings: { systems: ['vedic'] } });
    expect(parsed.settings.vedic.nodes).toBe('mean');
    expect(parsed.settings.vedic.dashaYear).toBe('julian-365.25');
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
